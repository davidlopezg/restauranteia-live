"""
Tests para agents.memoria.config — toggle persistente on/off + modo + umbral.

v4.1 — memoria automática del chat.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from agents.memoria import config
from agents.memoria.config import (
    DEFAULT_CONFIG,
    is_memoria_activa,
    set_memoria_activa,
    get_memoria_modo,
    set_memoria_modo,
    get_umbral_confianza,
    set_umbral_confianza,
    load_config,
    save_config,
    reset_config,
)


@pytest.fixture
def cfg_path(tmp_path: Path) -> Path:
    """Path temporal para el archivo de configuración."""
    return tmp_path / "test_memoria_config.json"


# ── Test: defaults ─────────────────────────────────────────────────────────


class TestDefaults:
    def test_default_config_values(self):
        assert DEFAULT_CONFIG["activa"] is True
        assert DEFAULT_CONFIG["modo"] == "alta"
        assert DEFAULT_CONFIG["umbral_confianza"] == "alta"

    def test_load_crea_archivo_si_no_existe(self, cfg_path: Path):
        assert not cfg_path.exists()
        cfg = load_config(cfg_path)
        assert cfg["activa"] is True
        assert cfg_path.exists()

    def test_load_devuelve_defaults_si_no_existe(self, cfg_path: Path):
        cfg = load_config(cfg_path)
        assert cfg == DEFAULT_CONFIG

    def test_load_maneja_archivo_corrupto(self, cfg_path: Path, tmp_path: Path):
        cfg_path.parent.mkdir(parents=True, exist_ok=True)
        cfg_path.write_text("{ not valid json", encoding="utf-8")
        cfg = load_config(cfg_path)
        assert cfg == DEFAULT_CONFIG


# ── Test: toggle activa/inactiva ─────────────────────────────────────────────────────────


class TestToggleActiva:
    def test_is_memoria_activa_default_true(self, cfg_path: Path):
        assert is_memoria_activa(cfg_path) is True

    def test_set_memoria_activa_false(self, cfg_path: Path):
        set_memoria_activa(False, cfg_path)
        assert is_memoria_activa(cfg_path) is False

    def test_set_memoria_activa_true(self, cfg_path: Path):
        set_memoria_activa(False, cfg_path)
        set_memoria_activa(True, cfg_path)
        assert is_memoria_activa(cfg_path) is True

    def test_persistencia_entre_llamadas(self, cfg_path: Path):
        """El estado debe persistir en disco."""
        set_memoria_activa(False, cfg_path)
        # Llamar de nuevo (otra instancia simulada)
        assert is_memoria_activa(cfg_path) is False
        # Leer el archivo directamente
        with open(cfg_path, encoding="utf-8") as f:
            data = json.load(f)
        assert data["activa"] is False


# ── Test: modo ─────────────────────────────────────────────────────────────────


class TestModo:
    def test_get_modo_default(self, cfg_path: Path):
        assert get_memoria_modo(cfg_path) == "alta"

    def test_set_modo_sugerir(self, cfg_path: Path):
        set_memoria_modo("sugerir", cfg_path)
        assert get_memoria_modo(cfg_path) == "sugerir"

    def test_set_modo_alta(self, cfg_path: Path):
        set_memoria_modo("sugerir", cfg_path)
        set_memoria_modo("alta", cfg_path)
        assert get_memoria_modo(cfg_path) == "alta"

    def test_set_modo_invalido_raises(self, cfg_path: Path):
        with pytest.raises(ValueError, match="modo inválido"):
            set_memoria_modo("patata", cfg_path)


# ── Test: umbral de confianza ───────────────────────────────────────────────


class TestUmbral:
    def test_get_umbral_default(self, cfg_path: Path):
        assert get_umbral_confianza(cfg_path) == "alta"

    def test_set_umbral_media(self, cfg_path: Path):
        set_umbral_confianza("media", cfg_path)
        assert get_umbral_confianza(cfg_path) == "media"

    def test_set_umbral_invalido_raises(self, cfg_path: Path):
        with pytest.raises(ValueError, match="umbral inválido"):
            set_umbral_confianza("super-alta", cfg_path)


# ── Test: reset ─────────────────────────────────────────────────────────────


class TestReset:
    def test_reset_vuelve_a_defaults(self, cfg_path: Path):
        set_memoria_activa(False, cfg_path)
        set_memoria_modo("sugerir", cfg_path)
        set_umbral_confianza("media", cfg_path)
        reset_config(cfg_path)
        cfg = load_config(cfg_path)
        assert cfg == DEFAULT_CONFIG


# ── Test: idempotencia ──────────────────────────────────────────────────────


class TestIdempotencia:
    def test_save_idempotente(self, cfg_path: Path):
        """Llamar save_config varias veces con el mismo dict produce el mismo archivo."""
        cfg = DEFAULT_CONFIG.copy()
        save_config(cfg, cfg_path)
        first_content = cfg_path.read_text(encoding="utf-8")
        save_config(cfg, cfg_path)
        second_content = cfg_path.read_text(encoding="utf-8")
        assert first_content == second_content

    def test_load_idempotente(self, cfg_path: Path):
        """Llamar load_config varias veces devuelve lo mismo."""
        cfg1 = load_config(cfg_path)
        cfg2 = load_config(cfg_path)
        assert cfg1 == cfg2