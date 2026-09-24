"""
Cliente OpenRouter para generacion de fichas de prueba.
La configuracion (API key, modelo, prompt) se lee desde app_settings en Supabase.
"""
import os
import httpx
import json

import supabase_client as sb
from config import config


def _get_settings():
    """Lee configuracion de OpenRouter desde app_settings."""
    rows = sb.query(f"SELECT key, value FROM {config.DB_SCHEMA}.app_settings WHERE key IN ('openrouter_api_key','openrouter_model','openrouter_base_url','prompt_ficha_test')")
    out = {}
    for r in rows:
        out[r["key"]] = r.get("value", "")
    return out


def key_source() -> str:
    """OpenRouter SOLO lee de BD (no hay env var). Devuelve 'bd' o 'ninguna'."""
    s = _get_settings()
    return "bd" if s.get("openrouter_api_key") else "ninguna"


def is_configured():
    """Devuelve True si hay API key configurada."""
    s = _get_settings()
    return bool(s.get("openrouter_api_key", ""))


def generar_ficha(test_id: str) -> dict:
    """
    Genera ficha de prueba usando OpenRouter.
    Lee contexto de la prueba + agenda + catalogos y llama al modelo configurado.
    """
    settings = _get_settings()
    api_key = settings.get("openrouter_api_key", "")
    model = settings.get("openrouter_model", "nano-banana/nano-banana")
    base_url = settings.get("openrouter_base_url", "https://openrouter.ai/api/v1").rstrip("/")
    prompt_template = settings.get("prompt_ficha_test", "")

    if not api_key:
        raise RuntimeError("OpenRouter API key no configurada. Anadela en Settings.")
    if not prompt_template:
        raise RuntimeError("Prompt de ficha no configurado. Anadelo en Settings.")

    # Recopilar contexto
    test = sb.query(f"SELECT t.*, a.titulo AS agenda_titulo, a.objetivo FROM {config.DB_SCHEMA}.development_tests t JOIN {config.TABLE_AGENDAS} a ON a.id = t.agenda_id WHERE t.id = '{test_id}' LIMIT 1")
    if not test:
        raise ValueError(f"Prueba {test_id} no encontrada")
    t = test[0]

    # Catalogo relacionado
    catalogo = sb.query(f"SELECT c.id, c.titulo, c.ingredientes FROM {config.TABLE_CATALOGOS} c JOIN {config.TABLE_AGENDA_CATALOGO} ac ON ac.catalogo_id = c.id WHERE ac.agenda_id = '{(t["agenda_id"])}' LIMIT 1")

    # Construir prompt
    contexto = {
        "producto": t.get("agenda_titulo", ""),
        "objetivo_prueba": t.get("objetivo", ""),
        "receta_utilizada": t.get("receta_utilizada", ""),
        "modificaciones": t.get("modificaciones", ""),
        "numero_prueba": t.get("numero", 1),
        "estado_desarrollo": t.get("estado_desarrollo", ""),
        "ingredientes": catalogo[0].get("ingredientes", "") if catalogo else "",
        "feedback_previo": "",
    }

    system_prompt = "Eres un chef tecnico especializado en fichas de prueba gastronomica. Genera una ficha estructurada y concisa."

    user_prompt = prompt_template.replace("{contexto}", json.dumps(contexto, ensure_ascii=False, indent=2))

    # Llamar a OpenRouter
    r = httpx.post(
        f"{base_url}/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.7,
        },
        timeout=120.0,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"OpenRouter error [{r.status_code}]: {r.text[:300]}")

    data = r.json()
    try:
        texto = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        raise RuntimeError(f"Respuesta inesperada de OpenRouter")

    # Guardar en ficha_generada
    payload = {
        "ficha_generada": json.dumps({
            "texto": texto,
            "modelo": model,
            "proveedor": "OpenRouter",
            "prompt_usado": user_prompt[:500],
        }, ensure_ascii=False),
    }
    sb.exec(f"UPDATE {config.DB_SCHEMA}.development_tests SET ficha_generada = '{payload['ficha_generada']}'::jsonb WHERE id = '{test_id}'")

    return {"texto": texto, "modelo": model, "guardado": True}