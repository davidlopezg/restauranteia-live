"""
agents/memoria/config.py — Estado persistente del toggle de memoria automática.

Guarda la configuración en un JSON en `conocimiento/interno_restaurante/memoria_config.json`.

Estados posibles:
- activa: bool (default True en Fase 4.1, pero se puede desactivar)
- modo: 'alta' | 'sugerir' (default 'alta' → auto-guarda; 'sugerir' → pregunta antes)
- umbral_confianza: 'alta' | 'media' | 'baja' (default 'alta' → solo ALTA confianza)

API:
    is_memoria_activa() -> bool
    set_memoria_activa(activa: bool) -> None
    get_memoria_modo() -> str
    set_memoria_modo(modo: str) -> None
    get_umbral_confianza() -> str
    set_umbral_confianza(umbral: str) -> None
    load_config() -> dict
    save_config(cfg: dict) -> None
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any, Optional

_CONFIG_PATH = Path("conocimiento/interno_restaurante/memoria_config.json")
_CONFIG_DIR = Path("conocimiento/interno_restaurante")

_lock = threading.Lock()

DEFAULT_CONFIG: dict[str, Any] = {
    "activa": True,            # toggle global
    "modo": "alta",            # 'alta' (auto-save) o 'sugerir' (pide confirmación)
    "umbral_confianza": "alta",  # 'alta' | 'media' | 'baja'
}


def _config_path(custom_path: Optional[Path] = None) -> Path:
    return custom_path if custom_path is not None else _CONFIG_PATH


def load_config(custom_path: Optional[Path] = None) -> dict[str, Any]:
    """Lee el archivo de configuración. Si no existe, devuelve DEFAULT_CONFIG.

    Crea el directorio y archivo si no existen (idempotente).
    """
    path = _config_path(custom_path)
    path = Path(path)  # por si viene como string
    if not path.exists():
        save_config(DEFAULT_CONFIG.copy(), custom_path)
        return DEFAULT_CONFIG.copy()

    try:
        with open(path, encoding="utf-8") as f:
            cfg = json.load(f)
        # Merge con defaults (por si se añaden campos en versiones futuras)
        merged = DEFAULT_CONFIG.copy()
        merged.update({k: v for k, v in cfg.items() if k in DEFAULT_CONFIG})
        return merged
    except (json.JSONDecodeError, OSError):
        # Archivo corrupto → defaults
        return DEFAULT_CONFIG.copy()


def save_config(cfg: dict[str, Any], custom_path: Optional[Path] = None) -> None:
    """Guarda el dict de configuración al archivo JSON."""
    path = Path(_config_path(custom_path))
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
    except OSError:
        # No podemos escribir → no hacer nada silencioso
        pass


def _get_config_unsafe(custom_path: Optional[Path] = None) -> dict[str, Any]:
    """Helper: devuelve config leyéndola del archivo.

    NOTA: No usamos caché porque el archivo es pequeño y queremos que los
    tests que cambian el path (custom_path) tengan efecto inmediato. La
    latencia de leer un JSON de 100 bytes es despreciable.
    """
    return load_config(custom_path)


# ── API pública ─────────────────────────────────────────────────────────────


def is_memoria_activa(custom_path: Optional[Path] = None) -> bool:
    """¿La memoria automática está activa? Respeta env var override."""
    if os.environ.get("MEMORIA_AUTOMATICA", "1") == "0":
        return False
    with _lock:
        return _get_config_unsafe(custom_path).get("activa", True)


def set_memoria_activa(activa: bool, custom_path: Optional[Path] = None) -> None:
    """Activa o desactiva la memoria automática (persiste en disco)."""
    with _lock:
        cfg = _get_config_unsafe(custom_path).copy()
        cfg["activa"] = bool(activa)
        save_config(cfg, custom_path)


def get_memoria_modo(custom_path: Optional[Path] = None) -> str:
    """Modo actual: 'alta' (auto-save) o 'sugerir' (pide confirmación)."""
    with _lock:
        return _get_config_unsafe(custom_path).get("modo", "alta")


def set_memoria_modo(modo: str, custom_path: Optional[Path] = None) -> None:
    """Cambia el modo ('alta' o 'sugerir')."""
    if modo not in ("alta", "sugerir"):
        raise ValueError(f"modo inválido: {modo!r}. Debe ser 'alta' o 'sugerir'.")
    with _lock:
        cfg = _get_config_unsafe(custom_path).copy()
        cfg["modo"] = modo
        save_config(cfg, custom_path)


def get_umbral_confianza(custom_path: Optional[Path] = None) -> str:
    """Umbral de confianza ('alta', 'media', 'baja')."""
    with _lock:
        return _get_config_unsafe(custom_path).get("umbral_confianza", "alta")


def set_umbral_confianza(umbral: str, custom_path: Optional[Path] = None) -> None:
    """Cambia el umbral de confianza."""
    if umbral not in ("alta", "media", "baja"):
        raise ValueError(f"umbral inválido: {umbral!r}")
    with _lock:
        cfg = _get_config_unsafe(custom_path).copy()
        cfg["umbral_confianza"] = umbral
        save_config(cfg, custom_path)


def reset_config(custom_path: Optional[Path] = None) -> None:
    """Reset a defaults (para tests)."""
    save_config(DEFAULT_CONFIG.copy(), custom_path)


__all__ = [
    "DEFAULT_CONFIG",
    "load_config",
    "save_config",
    "is_memoria_activa",
    "set_memoria_activa",
    "get_memoria_modo",
    "set_memoria_modo",
    "get_umbral_confianza",
    "set_umbral_confianza",
    "reset_config",
]