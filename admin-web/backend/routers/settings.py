"""
Router de settings, ware, cadencia.
"""
import os

from fastapi import APIRouter, HTTPException

import queries as Q
import supabase_client as sb
import ia_client as _ia
from config import config

router = APIRouter(prefix="/api", tags=["settings"])


# === WARE ===

@router.get("/ware")
def list_ware(tipo: str | None = None, disponible: bool | None = None):
    try:
        return Q.list_ware(tipo, disponible)
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.get("/ware/tipos")
def ware_tipos():
    try:
        return {"tipos": Q.distinct_ware_tipos()}
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.get("/ware/{ware_id}")
def get_ware(ware_id: str):
    try:
        w = Q.get_ware(ware_id)
        if not w:
            raise HTTPException(404, detail="Pieza no encontrada")
        return w
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


# === SETTINGS ===

@router.get("/settings")
def get_settings():
    """Devuelve settings NO sensibles (no incluye api_keys ni prompts sensibles)."""
    try:
        rows = sb.query(f"SELECT key, value FROM {config.DB_SCHEMA}.app_settings ORDER BY key")
        # Claves NUNCA deben salir al frontend (secretos).
        NEVER = {"minimax_api_key", "openrouter_api_key", "prompt_ficha_test"}
        # Claves NUEVAS (FASE 8 — emplatado IA + ficha tecnica). NO son secretos
        # (plantillas editables por el usuario), asi que SI salen al frontend.
        safe = {r["key"]: r["value"] for r in rows if r["key"] not in NEVER}
        safe["ia_configured"] = _ia.is_configured()
        safe["openrouter_configured"] = _or_is_configured()
        safe["minimax_key_source"] = _ia.key_source()
        safe["openrouter_key_source"] = _or_key_source()
        return safe
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.get("/settings/key-status")
def key_status():
    """Indica si la API key de MiniMax y OpenRouter estan configuradas.
    FUENTE UNICA DE VERDAD: ia_client.is_configured() — mismo criterio que /api/ia/status."""
    configured = _ia.is_configured()
    return {
        "ia_configured": configured,
        "model": _ia.MODEL if configured else None,
        "openrouter_configured": _or_is_configured(),
        "key_source": _ia.key_source(),
    }


@router.patch("/settings")
def update_settings(body: dict):
    """Actualiza settings (app_settings). Claves en body."""
    try:
        results = {}
        for key, value in body.items():
            Q.upsert_setting(key, value)
            results[key] = value
        # Si cambia una clave IA, sincronizar TODAS los los caches.
        if key.startswith("minimax_") or key.startswith("openrouter_"):
            _ia.refresh_api_key_cache()
            try:
                import ia_integration as _ia_int
                _ia_int.refresh_ia_config()
            except Exception:
                pass
        return {"updated": results}
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


# ============================================================
# DIAGNÓSTICO — Traza real de la configuración hasta el proveedor
# ============================================================

import httpx as _httpx


def _sanitize_error(status: int, body: str) -> str:
    """Sanitiza el body de un proveedor: nunca expone la key."""
    if not body:
        return ""
    # Patrones típicos donde puede aparecer la key
    import re
    masked = re.sub(r'(sk-[a-zA-Z0-9_\-]{6})[a-zA-Z0-9_\-]+', r'\1***', body)
    masked = re.sub(r'(Bearer\s+)[a-zA-Z0-9_\-]+', r'\1***', masked)
    return masked[:400]


def _probe_provider(name: str, base_url: str, api_key: str, model: str) -> dict:
    """Hace una peticion minima al proveedor. Devuelve dict con info sanitizada."""
    if not api_key:
        return {
            "provider": name,
            "ok": False,
            "status": "CONFIGURATION_ERROR",
            "http_status": None,
            "model": model,
            "error": "No hay API key configurada",
            "key_prefix": None,
            "key_length": 0,
        }
    prefix = api_key[:10] if len(api_key) >= 10 else api_key[:4]
    try:
        r = _httpx.post(
            f"{base_url.rstrip('/')}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "user", "content": "ping"},
                ],
                "max_tokens": 1,
                "temperature": 0,
            },
            timeout=30.0,
        )
        ok = r.status_code < 400
        body = r.text
        result = {
            "provider": name,
            "ok": ok,
            "status": "OK" if ok else _classify_status(r.status_code),
            "http_status": r.status_code,
            "model": model,
            "base_url": base_url,
            "endpoint": f"{base_url.rstrip('/')}/chat/completions",
            "key_prefix": prefix,
            "key_length": len(api_key),
            "request_started": True,
            "response_received": True,
            "error": None if ok else _sanitize_error(r.status_code, body),
        }
        return result
    except _httpx.TimeoutException:
        return {
            "provider": name,
            "ok": False,
            "status": "NETWORK_ERROR",
            "http_status": None,
            "model": model,
            "key_prefix": prefix,
            "key_length": len(api_key),
            "error": "Timeout al conectar con el proveedor",
        }
    except Exception as e:
        return {
            "provider": name,
            "ok": False,
            "status": "NETWORK_ERROR",
            "http_status": None,
            "model": model,
            "key_prefix": prefix,
            "key_length": len(api_key),
            "error": str(e)[:200],
        }


def _classify_status(status: int) -> str:
    if status == 401:
        return "AUTH_ERROR"
    if status == 403:
        return "FORBIDDEN"
    if status == 404:
        return "NOT_FOUND"
    if status == 400:
        return "BAD_REQUEST"
    if status == 429:
        return "RATE_LIMITED"
    if 500 <= status < 600:
        return "PROVIDER_ERROR"
    return f"HTTP_{status}"


@router.get("/settings/test-providers")
def test_providers():
    """Hace peticiones reales a MiniMax y OpenRouter con la config actual.
    Devuelve el estado REAL de cada uno: status HTTP, key_source, etc.
    NUNCA expone la key completa."""
    import openrouter_client as _or
    mini_settings = _ia._get_settings_trace() if hasattr(_ia, '_get_settings_trace') else None

    # --- MiniMax ---
    mini_key = _ia._get_api_key()
    mini_source = _ia.key_source()
    mini_base = _ia.BASE_URL
    mini_model = _ia.MODEL
    mini_result = _probe_provider("MiniMax", mini_base, mini_key, mini_model)
    mini_result["key_source"] = mini_source

    # --- OpenRouter ---
    or_settings = _or._get_settings()
    or_key = or_settings.get("openrouter_api_key", "")
    or_source = "bd" if or_key else "ninguna"
    or_base = or_settings.get("openrouter_base_url") or "https://openrouter.ai/api/v1"
    or_model = or_settings.get("openrouter_model") or "nano-banana/nano-banana"
    or_result = _probe_provider("OpenRouter", or_base, or_key, or_model)
    or_result["key_source"] = or_source

    # --- Entorno del proceso ---
    import os as _os
    env_snapshot = {
        "MINIMAX_API_KEY": ("SET" if _os.getenv("MINIMAX_API_KEY") else "UNSET"),
        "MINIMAX_BASE_URL": _os.getenv("MINIMAX_BASE_URL", "(default)"),
        "MINIMAX_MODEL": _os.getenv("MINIMAX_MODEL", "(default)"),
        "OPENROUTER_API_KEY": ("SET" if _os.getenv("OPENROUTER_API_KEY") else "UNSET"),
        "SUPABASE_URL": "SET" if _os.getenv("SUPABASE_URL") else "UNSET",
    }

    return {
        "minimax": mini_result,
        "openrouter": or_result,
        "env": env_snapshot,
        "priority_rule": "BD > ENV (cache en memoria invalidado en PATCH /api/settings)",
    }


def _or_is_configured():
    try:
        import openrouter_client as _or
        return _or.is_configured()
    except Exception:
        return False


def _or_key_source():
    """OpenRouter solo se configura por BD (no hay env var leída por openrouter_client)."""
    try:
        import openrouter_client as _or
        s = _or._get_settings()
        return "bd" if s.get("openrouter_api_key") else "ninguna"
    except Exception:
        return "error"


# === CADENCIA ===

@router.get("/cadencia/semana-actual")
def semana_actual():
    """Devuelve el objetivo semanal actual + actividad. Crea fila si no existe."""
    try:
        Q.recalculate_current_week()
        Q.upsert_current_week()
        week = Q.get_current_week()
        actividad = Q.actividad_semanal()
        return {"week": week, "actividad": actividad}
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.get("/cadencia/historial")
def cadencia_historial(limit: int = 12):
    """Lista las ultimas N semanas."""
    try:
        return Q.list_weeks(limit)
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.patch("/cadencia/{week_id}")
def update_cadencia(week_id: str, body: dict):
    """Actualiza objetivo_minimo, aplazamiento, etc."""
    try:
        allowed = {"objetivo_minimo", "aplazamiento_motivo", "aplazamiento_notas", "estado", "deuda"}
        payload = {k: v for k, v in body.items() if k in allowed}
        if not payload:
            raise HTTPException(400, detail="Sin cambios permitidos")
        rows = Q.update_week(week_id, payload)
        if not rows:
            raise HTTPException(404, detail="Semana no encontrada")
        return rows[0] if isinstance(rows, list) else rows
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.post("/cadencia/{week_id}/aplazar")
def aplazar_semana(week_id: str, body: dict):
    """Registra aplazamiento del objetivo semanal con motivo obligatorio."""
    motivo = body.get("motivo")
    notas = body.get("notas", "")
    if not motivo:
        raise HTTPException(400, detail="motivo es obligatorio")
    try:
        payload = {"estado": "APLAZADO", "aplazamiento_motivo": motivo, "aplazamiento_notas": notas}
        rows = Q.update_week(week_id, payload)
        if not rows:
            raise HTTPException(404)
        return rows[0] if isinstance(rows, list) else rows
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


# === HEALTHCHECK ===

@router.get("/healthz")
def healthz():
    try:
        sb.query(f"SELECT id FROM {config.TABLE_IDEAS} LIMIT 1")
        return {"ok": True, "project": config.SUPABASE_URL, "schema": config.DB_SCHEMA, "reachable": True}
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            {"ok": False, "project": config.SUPABASE_URL, "error": str(e)},
            status_code=500,
        )