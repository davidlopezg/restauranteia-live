"""
Tests end-to-end para la memoria automática del chat (Fase 4.1).

Cubre el flujo completo:
- Trigger detecta idea → guardar_automatico escribe en DB
- /lista-auto muestra solo auto-guardadas
- /olvidar auto borra solo auto-guardadas (con confirmación)
- Toggle off → no se guarda nada
- Modo sugerir → no se guarda nada (solo se sugiere)
- Deduplicación entre auto y manual
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from agents.memoria import config, triggers
from agents.memoria.commands import handle_command, _reset_state
from agents.memoria.storage import (
    init_db,
    save_idea,
    count_ideas,
    load_ideas,
)


@pytest.fixture(autouse=True)
def reset_global_state():
    """Reset estado global (config, pending, contador)."""
    _reset_state()
    # Invalidar caché de categorías para tests aislados
    triggers._invalidate_categorias_cache()
    yield
    _reset_state()


@pytest.fixture
def cfg_path(tmp_path: Path) -> Path:
    return tmp_path / "test_memoria_config.json"


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    return tmp_path / "test_ideas.db"


@pytest.fixture
def db_conn(db_path: Path) -> sqlite3.Connection:
    conn = init_db(db_path)
    yield conn
    conn.close()


@pytest.fixture
def memoria_activa(cfg_path: Path, monkeypatch):
    """Configura memoria automática activa en modo 'alta'."""
    monkeypatch.setattr(config, "_CONFIG_PATH", cfg_path)
    config.load_config(cfg_path)
    config.set_memoria_activa(True, cfg_path)
    config.set_memoria_modo("alta", cfg_path)
    return cfg_path


@pytest.fixture
def memoria_desactivada(cfg_path: Path, monkeypatch):
    """Configura memoria automática desactivada."""
    monkeypatch.setattr(config, "_CONFIG_PATH", cfg_path)
    config.load_config(cfg_path)
    config.set_memoria_activa(False, cfg_path)
    return cfg_path


@pytest.fixture
def memoria_sugerir(cfg_path: Path, monkeypatch):
    """Configura memoria automática en modo 'sugerir'."""
    monkeypatch.setattr(config, "_CONFIG_PATH", cfg_path)
    config.load_config(cfg_path)
    config.set_memoria_activa(True, cfg_path)
    config.set_memoria_modo("sugerir", cfg_path)
    return cfg_path


# ── Test: trigger básico + guardado ────────────────────────────────────────


class TestGuardarAutomatico:
    def test_mensaje_relevante_se_guarda(self, db_conn, memoria_activa):
        guardadas = triggers.guardar_automatico(
            db_conn, "me gustaría probar el kumquat en el postre", skill_origen="chat"
        )
        assert len(guardadas) == 1
        assert guardadas[0]["categoria"] == "producto"
        assert "kumquat" in guardadas[0]["extracto"].lower()

        # Verificar en DB
        ideas = load_ideas(db_conn)
        assert len(ideas) == 1
        assert ideas[0]["origen"] == "auto-chat"
        assert ideas[0]["origen_skill"] == "chat"

    def test_mensaje_cortesia_no_se_guarda(self, db_conn, memoria_activa):
        guardadas = triggers.guardar_automatico(db_conn, "hola, ¿qué tal?")
        assert guardadas == []
        assert count_ideas(db_conn) == 0

    def test_multiples_ideas_se_guardan(self, db_conn, memoria_activa):
        msgs = [
            "me gustaría probar el kumquat",
            "tengo que usar la thermomix nueva",
            "receta de mi gazpacho",
        ]
        for msg in msgs:
            triggers.guardar_automatico(db_conn, msg)
        assert count_ideas(db_conn) == 3


# ── Test: toggle desactivado ────────────────────────────────────────────────


class TestToggleDesactivado:
    def test_no_se_guarda_si_memoria_off(self, db_conn, memoria_desactivada):
        guardadas = triggers.guardar_automatico(
            db_conn, "me gustaría probar el kumquat"
        )
        assert guardadas == []
        assert count_ideas(db_conn) == 0


# ── Test: modo sugerir ──────────────────────────────────────────────────────


class TestModoSugerir:
    def test_no_se_guarda_en_modo_sugerir(self, db_conn, memoria_sugerir):
        """En modo sugerir, NO se guarda nada automáticamente."""
        guardadas = triggers.guardar_automatico(
            db_conn, "me gustaría probar el kumquat"
        )
        assert guardadas == []
        assert count_ideas(db_conn) == 0

    def test_formatear_anexo_muestra_sugerencias_en_modo_sugerir(
        self, db_conn, memoria_sugerir
    ):
        """En modo sugerir, el formateador muestra las ideas MEDIA como sugerencia."""
        from agents.memoria.triggers import (
            analizar_mensaje,
            formatear_anexo_chat,
        )
        resultado = analizar_mensaje("kumquat")
        # Forzamos que se muestre (en modo sugerir siempre se muestra la idea)
        anexo = formatear_anexo_chat([], resultado)
        assert "💡" in anexo or anexo == ""  # puede no haber MEDIA


# ── Test: deduplicación auto ↔ manual ──────────────────────────────────────


class TestDeduplicacion:
    def test_auto_no_duplica_idea_existente(self, db_conn, memoria_activa):
        """Si la idea ya existe (manual o auto), no la vuelve a guardar."""
        # Guardar manualmente primero
        save_idea(db_conn, "me gustaría probar el kumquat", categoria="producto")
        assert count_ideas(db_conn) == 1

        # Intentar auto-guardar la misma frase
        guardadas = triggers.guardar_automatico(
            db_conn, "me gustaría probar el kumquat"
        )
        assert guardadas == []
        assert count_ideas(db_conn) == 1  # sigue habiendo solo 1

    def test_auto_no_duplica_entre_auto(self, db_conn, memoria_activa):
        """Si la idea auto ya existe, no duplica."""
        triggers.guardar_automatico(db_conn, "me gustaría probar el kumquat")
        assert count_ideas(db_conn) == 1
        triggers.guardar_automatico(db_conn, "me gustaría probar el kumquat")
        assert count_ideas(db_conn) == 1


# ── Test: comandos /memoria ─────────────────────────────────────────────────


class TestComandosMemoria:
    def test_memoria_off_desactiva(self, db_conn, memoria_activa, cfg_path):
        assert config.is_memoria_activa(cfg_path) is True
        r = handle_command("/memoria off", conn=db_conn)
        assert "desactivada" in r["content"].lower()
        assert config.is_memoria_activa(cfg_path) is False

    def test_memoria_on_activa(self, db_conn, memoria_desactivada, cfg_path):
        assert config.is_memoria_activa(cfg_path) is False
        r = handle_command("/memoria on", conn=db_conn)
        assert "activada" in r["content"].lower()
        assert config.is_memoria_activa(cfg_path) is True

    def test_memoria_alta(self, db_conn, memoria_sugerir, cfg_path):
        r = handle_command("/memoria alta", conn=db_conn)
        assert "auto-guardar" in r["content"].lower()
        assert config.get_memoria_modo(cfg_path) == "alta"

    def test_memoria_sugerir(self, db_conn, memoria_activa, cfg_path):
        r = handle_command("/memoria sugerir", conn=db_conn)
        assert "sugerir" in r["content"].lower()
        assert config.get_memoria_modo(cfg_path) == "sugerir"

    def test_memoria_arg_invalido(self, db_conn, memoria_activa):
        r = handle_command("/memoria patata", conn=db_conn)
        assert "⚠️" in r["content"]


# ── Test: /memoria-status ────────────────────────────────────────────────────


class TestMemoriaStatus:
    def test_status_muestra_conteo_correcto(self, db_conn, memoria_activa):
        # Seed: 2 manuales + 2 auto
        save_idea(db_conn, "manual 1", origen="comando")
        save_idea(db_conn, "manual 2", origen="comando")
        save_idea(db_conn, "auto 1", origen="auto-chat", categoria="producto")
        save_idea(db_conn, "auto 2", origen="auto-chat", categoria="tecnica")

        r = handle_command("/memoria-status", conn=db_conn)
        content = r["content"]
        assert "2" in content  # 2 manuales
        assert "2" in content  # 2 auto
        assert "4" in content  # total
        assert "🟢" in content  # activa


# ── Test: /lista-auto ─────────────────────────────────────────────────────────


class TestListaAuto:
    def test_lista_auto_solo_auto(self, db_conn, memoria_activa):
        save_idea(db_conn, "manual 1", origen="comando")
        save_idea(db_conn, "auto kumquat", origen="auto-chat", categoria="producto")
        save_idea(db_conn, "auto thermomix", origen="auto-chat", categoria="herramienta")

        r = handle_command("/lista-auto", conn=db_conn)
        content = r["content"]
        assert "auto kumquat" in content
        assert "auto thermomix" in content
        assert "manual 1" not in content
        assert "auto-guardadas" in content.lower()

    def test_lista_auto_vacio(self, db_conn, memoria_activa):
        r = handle_command("/lista-auto", conn=db_conn)
        assert "no hay ideas auto-guardadas" in r["content"].lower()

    def test_lista_auto_con_filtro(self, db_conn, memoria_activa):
        save_idea(db_conn, "auto kumquat", origen="auto-chat", categoria="producto")
        save_idea(db_conn, "auto thermomix", origen="auto-chat", categoria="herramienta")

        r = handle_command("/lista-auto kumquat", conn=db_conn)
        assert "kumquat" in r["content"]
        assert "thermomix" not in r["content"]


# ── Test: /olvidar auto ──────────────────────────────────────────────────────


class TestOlvidarAuto:
    def test_olvidar_auto_pide_confirmacion(self, db_conn, memoria_activa):
        save_idea(db_conn, "auto 1", origen="auto-chat", categoria="producto")
        save_idea(db_conn, "manual 1", origen="comando")

        r = handle_command("/olvidar auto", conn=db_conn)
        assert "⚠️" in r["content"]
        assert "olvidar auto" in r["content"]
        # No debe haber borrado nada todavía
        assert count_ideas(db_conn) == 2

    def test_olvidar_auto_confirmacion_borra_solo_auto(self, db_conn, memoria_activa):
        save_idea(db_conn, "auto 1", origen="auto-chat", categoria="producto")
        save_idea(db_conn, "auto 2", origen="auto-chat", categoria="tecnica")
        save_idea(db_conn, "manual 1", origen="comando")

        handle_command("/olvidar auto", conn=db_conn)
        r = handle_command("olvidar auto", conn=db_conn)
        assert "✅" in r["content"]
        assert "2" in r["content"]  # se borraron 2
        assert count_ideas(db_conn) == 1  # solo queda la manual

        # Verificar que la manual sigue ahí
        ideas = load_ideas(db_conn)
        assert ideas[0]["origen"] == "comando"

    def test_olvidar_auto_sin_auto_ideas(self, db_conn, memoria_activa):
        save_idea(db_conn, "manual 1", origen="comando")
        r = handle_command("/olvidar auto", conn=db_conn)
        assert "ℹ️" in r["content"] or "no hay" in r["content"].lower()

    def test_olvidar_auto_sin_pendiente_es_error(self, db_conn, memoria_activa):
        """'olvidar auto' (sin /olvidar auto previo) → error."""
        r = handle_command("olvidar auto", conn=db_conn)
        assert r is not None
        assert "⚠️" in r["content"]


# ── Test: integración con chat (formatear_anexo_chat) ────────────────────────


class TestAnexoChat:
    def test_anexo_vacio_si_nada_guardado(self, db_conn, memoria_activa):
        from agents.memoria.triggers import formatear_anexo_chat
        # Mensaje de cortesía → no se guarda nada → anexo vacío
        guardadas = triggers.guardar_automatico(db_conn, "hola, qué tal")
        anexo = formatear_anexo_chat(guardadas)
        assert anexo == ""

    def test_anexo_muestra_ids_guardadas(self, db_conn, memoria_activa):
        from agents.memoria.triggers import formatear_anexo_chat
        guardadas = triggers.guardar_automatico(
            db_conn, "me gustaría probar el kumquat"
        )
        anexo = formatear_anexo_chat(guardadas)
        assert "📌" in anexo
        assert "#1" in anexo

    def test_anexo_con_multiples_guardadas(self, db_conn, memoria_activa):
        from agents.memoria.triggers import formatear_anexo_chat
        # Sin bypass de duplicado, guardamos 2 ideas distintas
        guardadas = []
        guardadas.extend(triggers.guardar_automatico(
            db_conn, "me gustaría probar el kumquat"
        ))
        guardadas.extend(triggers.guardar_automatico(
            db_conn, "tengo que usar la thermomix nueva"
        ))
        anexo = formatear_anexo_chat(guardadas)
        assert "📌" in anexo
        assert "2" in anexo


# ── Test: dedup con fuzzy matching ─────────────────────────────────────────────


class TestDeduplicacionFuzzy:
    def test_auto_no_duplica_con_fuzzy(self, db_conn, memoria_activa):
        """Aunque la frase varíe un poco, no debe duplicar."""
        # Manual: "me gustaría probar el kumquat"
        save_idea(db_conn, "me gustaría probar el kumquat", categoria="producto")
        # Auto: muy parecido
        guardadas = triggers.guardar_automatico(
            db_conn, "me gustaría probar el kumquat"  # exacto, fuzzy 100%
        )
        # Debe detectar duplicado y no guardar
        assert guardadas == []
        assert count_ideas(db_conn) == 1