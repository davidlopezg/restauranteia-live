"""
Tests for agents.memoria.commands — all command variants.

All tests use a tmp_path-backed SQLite database.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from agents.memoria.commands import (
    handle_command,
    get_contador_state,
    toggle_contador_state,
    _reset_state,
)
from agents.memoria.storage import (
    init_db,
    save_idea,
    load_ideas,
    get_idea,
    count_ideas,
)


@pytest.fixture(autouse=True)
def reset_state():
    """Reset module-level state before each test."""
    _reset_state()
    yield


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    return tmp_path / "test_commands.db"


@pytest.fixture
def db_conn(db_path: Path) -> sqlite3.Connection:
    conn = init_db(db_path)
    yield conn
    conn.close()


# ── /guardar [texto] ──────────────────────────────────────────────────────


class TestGuardarTexto:
    def test_guardar_texto_libre(self, db_conn: sqlite3.Connection):
        """/guardar probar kumquat → confirmation with ID + counter."""
        result = handle_command(
            "/guardar probar kumquat", conn=db_conn, skill_activa="ficha"
        )
        assert result is not None
        assert result["role"] == "assistant"
        content = result["content"]
        assert "✅" in content
        assert "Idea #1" in content
        assert "probar kumquat" in content
        assert "📁" in content  # counter active by default

    def test_guardar_texto_vacio(self, db_conn: sqlite3.Connection):
        """/guardar with only whitespace → error."""
        result = handle_command(
            "/guardar   ", conn=db_conn
        )
        assert result is not None
        assert "⚠️" in result["content"]
        assert "especificá" in result["content"]
        assert count_ideas(db_conn) == 0

    def test_guardar_con_skill(self, db_conn: sqlite3.Connection):
        """Skill activa is recorded as origen_skill."""
        result = handle_command(
            "/guardar idea desde ficha", conn=db_conn, skill_activa="ficha"
        )
        assert result is not None
        assert "Idea #1" in result["content"]
        ideas = load_ideas(db_conn)
        assert ideas[0]["origen_skill"] == "ficha"


# ── /guardar (sin args) ────────────────────────────────────────────────────


class TestGuardarSinArgs:
    def test_guardar_sin_args_con_historial(self, db_conn: sqlite3.Connection):
        """/guardar with ultimo_assistant_mensaje → saves that text."""
        result = handle_command(
            "/guardar",
            ultimo_assistant_mensaje="una idea genial",
            conn=db_conn,
        )
        assert result is not None
        content = result["content"]
        assert "✅" in content
        ideas = load_ideas(db_conn)
        assert len(ideas) == 1
        assert ideas[0]["idea"] == "una idea genial"

    def test_guardar_sin_args_sin_historial(self, db_conn: sqlite3.Connection):
        """/guardar with no historial → error."""
        result = handle_command("/guardar", conn=db_conn)
        assert result is not None
        assert "⚠️" in result["content"]
        assert "no tengo un mensaje reciente" in result["content"]
        assert count_ideas(db_conn) == 0

    def test_guardar_sin_args_con_historial_vacio(self, db_conn: sqlite3.Connection):
        """/guardar with empty historial → error."""
        result = handle_command(
            "/guardar",
            ultimo_assistant_mensaje="",
            conn=db_conn,
        )
        assert result is not None
        assert "⚠️" in result["content"]
        assert "no tengo un mensaje reciente" in result["content"]


# ── /guardar N (numbered) ──────────────────────────────────────────────────


class TestGuardarNumero:
    def test_guardar_numero_valido(self, db_conn: sqlite3.Connection):
        """/guardar 3 from numbered list → saves line 3."""
        ultimo = (
            "1. Plato de otoño con setas\n"
            "2. Fermento de kumquat\n"
            "3. Restricción: sin gluten\n"
            "4. Menú de hongos completo"
        )
        result = handle_command(
            "/guardar 3",
            ultimo_assistant_mensaje=ultimo,
            conn=db_conn,
        )
        assert result is not None
        assert "✅" in result["content"]
        ideas = load_ideas(db_conn)
        assert len(ideas) == 1
        assert "sin gluten" in ideas[0]["idea"]

    def test_guardar_numero_fuera_rango(self, db_conn: sqlite3.Connection):
        """/guardar 7 with 4-item list → error."""
        ultimo = (
            "1. Idea uno\n"
            "2. Idea dos\n"
            "3. Idea tres\n"
            "4. Idea cuatro"
        )
        result = handle_command(
            "/guardar 7",
            ultimo_assistant_mensaje=ultimo,
            conn=db_conn,
        )
        assert result is not None
        assert "⚠️" in result["content"]
        assert "7" in result["content"]
        assert "1–4" in result["content"]
        assert count_ideas(db_conn) == 0

    def test_guardar_numero_sin_lista(self, db_conn: sqlite3.Connection):
        """/guardar 1 with prose message → error."""
        result = handle_command(
            "/guardar 1",
            ultimo_assistant_mensaje="Podés probar con fermentos de hongos",
            conn=db_conn,
        )
        assert result is not None
        assert "⚠️" in result["content"]
        assert "lista numerada" in result["content"]
        assert count_ideas(db_conn) == 0

    def test_guardar_numero_sin_historial(self, db_conn: sqlite3.Connection):
        """/guardar 1 without ultimo_assistant → error."""
        result = handle_command(
            "/guardar 1",
            conn=db_conn,
        )
        assert result is not None
        assert "⚠️" in result["content"]
        assert "lista numerada" in result["content"]

    def test_guardar_numero_formato_mixto(self, db_conn: sqlite3.Connection):
        """List with 3) and 4. → both parsed correctly."""
        ultimo = (
            "1) Primera idea\n"
            "2. Segunda idea\n"
            "3) Tercera idea\n"
            "4. Cuarta idea"
        )
        result = handle_command(
            "/guardar 3",
            ultimo_assistant_mensaje=ultimo,
            conn=db_conn,
        )
        assert result is not None
        assert "✅" in result["content"]
        ideas = load_ideas(db_conn)
        assert "Tercera idea" in ideas[0]["idea"]


# ── /guardar igual ─────────────────────────────────────────────────────────


class TestGuardarIgual:
    def test_guardar_igual_after_duplicate(self, db_conn: sqlite3.Connection):
        """After duplicate warning, /guardar igual force-saves."""
        # First save an idea
        save_idea(db_conn, "probar kumquat en el postre")
        # Try to save same text → duplicate warning
        warning = handle_command(
            "/guardar probar kumquat en el postre", conn=db_conn
        )
        assert warning is not None
        assert "Ya tenés algo parecido" in warning["content"]

        # Now /guardar igual
        result = handle_command("/guardar igual", conn=db_conn)
        assert result is not None
        assert "✅" in result["content"]
        assert count_ideas(db_conn) == 2

    def test_guardar_igual_sin_pendiente(self, db_conn: sqlite3.Connection):
        """/guardar igual without pending → error."""
        result = handle_command("/guardar igual", conn=db_conn)
        assert result is not None
        assert "⚠️" in result["content"]
        assert "pendiente" in result["content"]


# ── /editar ────────────────────────────────────────────────────────────────


class TestEditar:
    def test_editar_existente(self, db_conn: sqlite3.Connection):
        """/editar 1 nuevo texto → confirmation."""
        idea_id = save_idea(db_conn, "idea original")
        result = handle_command(
            f"/editar {idea_id} texto nuevo y mejorado", conn=db_conn
        )
        assert result is not None
        assert "✅" in result["content"]
        assert f"Idea #{idea_id}" in result["content"]
        updated = get_idea(db_conn, idea_id)
        assert updated is not None
        assert updated["idea"] == "texto nuevo y mejorado"

    def test_editar_inexistente(self, db_conn: sqlite3.Connection):
        """/editar 99 nuevo texto → error."""
        result = handle_command(
            "/editar 99 texto nuevo", conn=db_conn
        )
        assert result is not None
        assert "⚠️" in result["content"]
        assert "99" in result["content"]
        assert "no existe" in result["content"]

    def test_editar_sin_texto(self, db_conn: sqlite3.Connection):
        """/editar 1 (no text) → regex no matchea → None (transversal: no es del archivo de ideas)."""
        result = handle_command("/editar 1", conn=db_conn)
        # El archivo de ideas solo intercepta SUS comandos. /editar 1 sin texto
        # no matchea _RE_EDITAR, así que devuelve None para que el dispatcher
        # principal decida.
        assert result is None


# ── /ideas ─────────────────────────────────────────────────────────────────


class TestIdeas:
    def test_ideas_con_ideas(self, db_conn: sqlite3.Connection):
        """/lista-ideas with ideas stored → formatted list."""
        save_idea(db_conn, "primera idea", categoria="concepto")
        save_idea(db_conn, "segunda idea", categoria="plato")
        result = handle_command("/lista-ideas", conn=db_conn)
        assert result is not None
        content = result["content"]
        assert "#1" in content or "#2" in content
        assert "primera idea" in content or "segunda idea" in content
        assert "concepto" in content or "plato" in content

    def test_ideas_vacio(self, db_conn: sqlite3.Connection):
        """/lista-ideas on empty DB → 'No tenés ideas'."""
        result = handle_command("/lista-ideas", conn=db_conn)
        assert result is not None
        assert "No tenés ideas" in result["content"]

    def test_ideas_con_filtro(self, db_conn: sqlite3.Connection):
        """/lista-ideas técnica → filtered list."""
        save_idea(db_conn, "plato con setas", categoria="plato")
        save_idea(db_conn, "técnica de fermentación", categoria="técnica")
        result = handle_command("/lista-ideas técnica", conn=db_conn)
        assert result is not None
        assert "fermentación" in result["content"]
        assert "setas" not in result["content"]

    def test_ideas_filtro_sin_match(self, db_conn: sqlite3.Connection):
        """/lista-ideas xyz with no matches → empty list message."""
        save_idea(db_conn, "alguna idea")
        result = handle_command("/lista-ideas xyz", conn=db_conn)
        assert result is not None
        assert "No tenés ideas" in result["content"]


# ── /olvidar todo ──────────────────────────────────────────────────────────


class TestOlvidarTodo:
    def test_olvidar_todo_pedido(self, db_conn: sqlite3.Connection):
        """/olvidar todo → confirmation prompt, no deletion."""
        save_idea(db_conn, "idea 1")
        save_idea(db_conn, "idea 2")
        result = handle_command("/olvidar todo", conn=db_conn)
        assert result is not None
        assert "olvidar todo" in result["content"]
        assert "confirmar" in result["content"].lower()
        # No deletion yet
        assert count_ideas(db_conn) == 2


# ── /olvidar N ─────────────────────────────────────────────────────────────


class TestOlvidarN:
    def test_olvidar_n_pedido(self, db_conn: sqlite3.Connection):
        """/olvidar 1 → confirmation prompt, no deletion."""
        idea_id = save_idea(db_conn, "idea a borrar")
        result = handle_command(f"/olvidar {idea_id}", conn=db_conn)
        assert result is not None
        assert str(idea_id) in result["content"]
        assert "seguro" in result["content"].lower()
        assert count_ideas(db_conn) == 1

    def test_olvidar_n_inexistente(self, db_conn: sqlite3.Connection):
        """/olvidar 99 → error."""
        result = handle_command("/olvidar 99", conn=db_conn)
        assert result is not None
        assert "⚠️" in result["content"]
        assert "99" in result["content"]
        assert "no existe" in result["content"]


# ── /export-ideas ──────────────────────────────────────────────────────────


class TestExport:
    def test_export_ideas(self, db_conn: sqlite3.Connection, tmp_path: Path):
        """/export-ideas → confirmation with path."""
        save_idea(db_conn, "idea exportable 1")
        save_idea(db_conn, "idea exportable 2")
        # The export will try to write to conocimiento/interno_restaurante/ — make it writable
        # by setting CWD to tmp_path
        result = handle_command("/export-ideas", conn=db_conn)
        assert result is not None
        assert "✅" in result["content"]
        assert "Exportado" in result["content"]


# ── /ayuda ─────────────────────────────────────────────────────────────────


class TestAyuda:
    def test_ayuda(self):
        """/ayuda → None (lo maneja el dispatcher principal del chat).

        Comportamiento nuevo (post-Bloque 3): el archivo de ideas solo
        intercepta SUS comandos. `/ayuda` muestra TODOS los comandos
        del chat (incluyendo los del archivo de ideas), manejado por
        ``app._texto_ayuda``.
        """
        result = handle_command("/ayuda")
        assert result is None


# ── /silenciar-contador ────────────────────────────────────────────────────


class TestSilenciarContador:
    def test_silenciar_contador(self, db_conn: sqlite3.Connection):
        """/silenciar-contador → confirmation + state toggled."""
        assert get_contador_state() is True  # initial
        result = handle_command("/silenciar-contador", conn=db_conn)
        assert result is not None
        assert "silenciado" in result["content"].lower() or "🔇" in result["content"]
        assert get_contador_state() is False


# ── Unknown command ────────────────────────────────────────────────────────


class TestComandoDesconocido:
    def test_comando_desconocido(self):
        """/xyz → None (transversal: el archivo de ideas no lo intercepta).

        Comportamiento nuevo (post-Bloque 3): el archivo de ideas solo
        intercepta SUS comandos. Los demás pasan al dispatcher principal
        del chat, que decide qué hacer.
        """
        result = handle_command("/xyz")
        assert result is None


# ── Non-command ────────────────────────────────────────────────────────────


class TestNoComando:
    def test_no_comando_retorna_none(self):
        """hola mundo → None (pass through)."""
        result = handle_command("hola mundo")
        assert result is None
