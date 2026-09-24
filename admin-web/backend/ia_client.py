"""
Cliente MiniMax (IA).

Reutiliza la configuración verificada del agente creativo en
`agents/creativo/agent.py` (call_minimax). Mismo formato OpenAI-compatible.

La IA es estrictamente un sistema de:
    ANALISIS + PROPUESTA
Nunca modifica datos directamente. Siempre devuelve sugerencias que
David debe aceptar/rechazar/modificar explicitamente.

IMPORTANTE — Resolución de la API key (orden de precedencia):
  1. Cache en memoria del proceso (se llena en el primer uso).
  2. Tabla `app_settings` de Supabase (donde guarda Configuración de la UI).
  3. Variable de entorno `MINIMAX_API_KEY` del proceso.

Cuando Configuración guarda una nueva key, llama a `refresh_api_key_cache()`
para invalidar el cache y forzar recarga desde la BD en la siguiente
operación. Sin esto, los cambios en UI nunca afectan al backend hasta
reiniciar el servidor.
"""
import os
import logging

import httpx

from config import config


log = logging.getLogger(__name__)


DEFAULT_BASE_URL = "https://api.minimax.io/v1"
DEFAULT_MODEL = "MiniMax-M3"

BASE_URL = os.getenv("MINIMAX_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
MODEL = os.getenv("MINIMAX_MODEL", DEFAULT_MODEL)
_ENV_API_KEY = os.getenv("MINIMAX_API_KEY", "")

# Cache en memoria: None = "no he comprobado todavía", string = valor cacheado.
# Vacío ("") significa "comprobé y NO hay key en BD".
_DB_API_KEY_CACHE = None


class IAError(Exception):
    pass


def refresh_api_key_cache(value=None):
    """Invalida (o setea) el cache de la API key.
    Llamar tras update_settings() para que la siguiente operación lea de BD."""
    global _DB_API_KEY_CACHE
    if value is not None:
        _DB_API_KEY_CACHE = value
    else:
        _DB_API_KEY_CACHE = None


def _load_api_key_from_db():
    """Lee la key desde la tabla app_settings. Devuelve "" si no existe."""
    try:
        import supabase_client as sb
        rows = sb.query(
            f"SELECT value FROM {config.DB_SCHEMA}.app_settings "
            f"WHERE key = 'minimax_api_key' LIMIT 1"
        )
        if rows and rows[0].get("value"):
            return rows[0]["value"]
    except Exception as e:
        log.warning("No se pudo leer minimax_api_key de app_settings: %s", e)
    return ""


def _get_api_key():
    """Resuelve la API key con orden de precedencia cache > BD > env."""
    global _DB_API_KEY_CACHE
    if _DB_API_KEY_CACHE is None:
        db_key = _load_api_key_from_db()
        if db_key:
            _DB_API_KEY_CACHE = db_key
        else:
            _DB_API_KEY_CACHE = _ENV_API_KEY
    return _DB_API_KEY_CACHE or ""


def is_configured() -> bool:
    """Indica si el cliente IA esta listo para usar."""
    return bool(_get_api_key())


def key_source() -> str:
    """Devuelve 'bd', 'env' o 'ninguna' segun de donde salio la key actual."""
    global _DB_API_KEY_CACHE
    if not _DB_API_KEY_CACHE:
        return "ninguna"
    db = _load_api_key_from_db()
    if db and _DB_API_KEY_CACHE == db:
        return "bd"
    return "env"


def call(system_prompt: str, user_prompt: str, temperature: float = 0.7) -> str:
    """
    Llama a MiniMax API (modo OpenAI-compatible).
    Devuelve el texto de la respuesta.
    """
    api_key = _get_api_key()
    if not api_key:
        raise IAError(
            "Falta API key de MiniMax. "
            "Configúrala en Configuración de la UI o define MINIMAX_API_KEY en backend/.env."
        )

    r = httpx.post(
        f"{BASE_URL}/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
        },
        timeout=120.0,
    )
    if r.status_code >= 400:
        raise IAError(f"MiniMax API error [{r.status_code}]: {r.text[:300]}")
    data = r.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        raise IAError(f"Respuesta inesperada de MiniMax: {str(data)[:300]}")