"""
sessions.py — Persistencia de sesiones del proceso creativo.

Cada sesión es un JSON en `conocimiento/interno_restaurante/sessions/<sesion_id>.json`.
El directorio está en .gitignore: las sesiones NO se commitean.

Una sesión representa UN proceso creativo en curso para una petición concreta.
El state machine vive en proceso_creativo.py; este módulo solo persiste.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional


# Paths
PROJECT_ROOT = Path(__file__).resolve().parents[2]
SESSIONS_DIR = PROJECT_ROOT / "conocimiento" / "interno_restaurante" / "sessions"


def _ensure_dir() -> Path:
    """Crea el directorio de sesiones si no existe. Idempotente."""
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    return SESSIONS_DIR


def _now_iso() -> str:
    """Timestamp ISO 8601 con segundos y zona local."""
    return datetime.now().astimezone().isoformat(timespec="seconds")


def new_sesion_id() -> str:
    """
    Genera un ID único y legible para una sesión nueva.
    Formato: YYYYMMDD-HHMMSS-<8 chars random>
    Ejemplo: 20260701-223045-a3f7b2c1
    """
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    rand = uuid.uuid4().hex[:8]
    return f"{ts}-{rand}"


def sesion_path(sesion_id: str) -> Path:
    """Path al archivo JSON de una sesión."""
    # Sanitizar: solo permitimos caracteres seguros en el ID
    if not all(c.isalnum() or c == "-" for c in sesion_id):
        raise ValueError(f"sesion_id inválido: {sesion_id!r}")
    return SESSIONS_DIR / f"{sesion_id}.json"


def guardar_sesion(state: dict) -> Path:
    """Persiste el state de una sesión. Devuelve el path."""
    _ensure_dir()
    if "sesion_id" not in state:
        raise ValueError("El state debe tener 'sesion_id'")
    state["updated_at"] = _now_iso()
    path = sesion_path(state["sesion_id"])
    with path.open("w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
    return path


def cargar_sesion(sesion_id: str) -> dict:
    """Carga una sesión por ID. Lanza FileNotFoundError si no existe."""
    path = sesion_path(sesion_id)
    if not path.exists():
        raise FileNotFoundError(
            f"No existe la sesión '{sesion_id}' en {path}. "
            f"¿Quizás usaste un ID incorrecto?"
        )
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def listar_sesiones() -> list[dict]:
    """
    Lista todas las sesiones guardadas, ordenadas por updated_at descendente.
    Devuelve solo metadata (no el contenido completo).
    """
    if not SESSIONS_DIR.exists():
        return []
    resultado: list[dict] = []
    for path in SESSIONS_DIR.glob("*.json"):
        try:
            with path.open(encoding="utf-8") as f:
                data = json.load(f)
            resultado.append({
                "sesion_id": data.get("sesion_id", path.stem),
                "peticion": data.get("peticion_inicial", ""),
                "fase_actual": data.get("fase_actual", ""),
                "updated_at": data.get("updated_at", ""),
                "completa": data.get("completa", False),
            })
        except (json.JSONDecodeError, OSError):
            # Sesión corrupta: la ignoramos
            continue
    resultado.sort(key=lambda s: s.get("updated_at", ""), reverse=True)
    return resultado


def eliminar_sesion(sesion_id: str) -> bool:
    """Borra una sesión. Devuelve True si se borró, False si no existía."""
    path = sesion_path(sesion_id)
    if path.exists():
        path.unlink()
        return True
    return False