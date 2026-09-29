"""
Cliente OpenRouter para GENERACION DE IMAGENES.

Diferencia con openrouter_client.py:
- openrouter_client.py: chat completions (TEXTO). Modelo default 'nano-banana/nano-banana'.
- openrouter_image_client.py: image generations (IMAGEN). Mismo modelo o uno de imagen.

API key: REUTILIZA 'openrouter_api_key' (mismo proveedor, distintos modelos).
Configuracion leida de app_settings:
  - openrouter_api_key       (ya existente)
  - openrouter_base_url      (ya existente)
  - openrouter_image_model   (NUEVO FASE 8, default 'nano-banana/nano-banana')

OpenRouter soporta dos modos para generar imagenes:
  (A) POST {base}/images/generations  (estilo DALL-E, n=1..4, prompt string)
  (B) POST {base}/chat/completions    con modalities: ['image','text']
                                        (modelos multimodales)

Esta implementacion intenta (A) primero (mas simple, soporta n>1),
si falla intenta (B) en bucle de 3 llamadas con seeds distintos.
"""
import logging

import httpx

import supabase_client as sb
from config import config


log = logging.getLogger(__name__)


REQUEST_TIMEOUT = 120.0  # segundos (la generacion de imagen es lenta)


def _get_settings() -> dict:
    """Lee configuracion de OpenRouter imagenes desde app_settings."""
    rows = sb.query(
        f"SELECT key, value FROM {config.DB_SCHEMA}.app_settings "
        f"WHERE key IN ('openrouter_api_key','openrouter_base_url','openrouter_image_model','prompt_emplatado')"
    )
    out = {}
    for r in rows:
        out[r["key"]] = r.get("value", "") or ""
    return out


def is_configured() -> bool:
    """Devuelve True si hay API key + prompt configurados."""
    s = _get_settings()
    return bool(s.get("openrouter_api_key")) and bool(s.get("prompt_emplatado"))


def key_source() -> str:
    """OpenRouter SOLO lee de BD. Devuelve 'bd' o 'ninguna'."""
    s = _get_settings()
    return "bd" if s.get("openrouter_api_key") else "ninguna"


def model_in_use() -> str:
    """Devuelve el modelo configurado (o el default)."""
    s = _get_settings()
    return s.get("openrouter_image_model") or "nano-banana/nano-banana"


# === Generacion de imagenes ===

def _try_images_generations(base_url: str, api_key: str, model: str,
                            prompt: str, n: int) -> list[str] | None:
    """
    Intenta POST {base}/images/generations (estilo DALL-E).
    Devuelve lista de URLs/base64 si OK, None si el endpoint no existe.
    """
    url = f"{base_url.rstrip('/')}/images/generations"
    try:
        r = httpx.post(
            url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "prompt": prompt,
                "n": n,
                "size": "1024x1024",
                "response_format": "url",
            },
            timeout=REQUEST_TIMEOUT,
        )
        if r.status_code == 404:
            log.info("endpoint /images/generations no soportado por %s", model)
            return None
        if r.status_code >= 400:
            log.warning("images/generations [%s]: %s", r.status_code, r.text[:300])
            return None
        data = r.json()
        urls = []
        for item in data.get("data", []):
            if isinstance(item, dict):
                u = item.get("url") or item.get("b64_json")
                if u:
                    urls.append(u)
        return urls if urls else None
    except httpx.HTTPError as e:
        log.warning("images/generations fallo HTTP: %s", e)
        return None


def _try_chat_modalities(base_url: str, api_key: str, model: str,
                          prompt: str, n: int) -> list[str] | None:
    """
    Fallback: POST {base}/chat/completions con modalities=['image','text'].
    Hace n llamadas (porque el chat solo genera 1 imagen por llamada).
    Devuelve lista de URLs o base64.
    """
    url = f"{base_url.rstrip('/')}/chat/completions"
    out: list[str] = []
    for i in range(n):
        try:
            r = httpx.post(
                url,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "modalities": ["image", "text"],
                    "messages": [{"role": "user", "content": prompt}],
                    "seed": i + 1,
                    "temperature": 0.8,
                },
                timeout=REQUEST_TIMEOUT,
            )
            if r.status_code >= 400:
                log.warning("chat/completions [%s] intento %d: %s", r.status_code, i + 1, r.text[:200])
                continue
            data = r.json()
            # OpenRouter imagenes vienen en message.images[] (formato variable).
            msg = (data.get("choices") or [{}])[0].get("message") or {}
            images = msg.get("images") or []
            for im in images:
                u = im.get("image_url", {}).get("url") if isinstance(im, dict) else None
                if not u and isinstance(im, str):
                    u = im
                if u:
                    out.append(u)
                    break
        except httpx.HTTPError as e:
            log.warning("chat/completions intento %d fallo: %s", i + 1, e)
    return out if out else None


def generate_images(prompt: str, n: int = 3) -> dict:
    """
    Genera N imagenes con OpenRouter.
    Devuelve {imagenes: [{url, source}], modelo, prompt_usado}.

    Estrategia:
      1. Intenta /images/generations con n=N (1 sola llamada, mas eficiente).
      2. Si no devuelve n>=3 imagenes, fallback a /chat/completions con n llamadas.
    """
    s = _get_settings()
    api_key = s.get("openrouter_api_key", "")
    base_url = s.get("openrouter_base_url") or "https://openrouter.ai/api/v1"
    model = s.get("openrouter_image_model") or "nano-banana/nano-banana"

    if not api_key:
        raise RuntimeError("OpenRouter API key no configurada. Anadela en Settings.")
    if not prompt.strip():
        raise RuntimeError("Prompt de emplatado vacio. Configuralo en Settings.")

    log.info("OpenRouter imagenes: modelo=%s n=%d prompt_len=%d", model, n, len(prompt))

    # 1) /images/generations
    urls = _try_images_generations(base_url, api_key, model, prompt, n)
    src = "images_generations"
    # 2) Fallback
    if not urls or len(urls) < n:
        urls2 = _try_chat_modalities(base_url, api_key, model, prompt, n)
        if urls2 and len(urls2) >= (len(urls) if urls else 0):
            urls = urls2
            src = "chat_modalities"

    if not urls:
        raise RuntimeError(
            f"OpenRouter no devolvio imagenes. Modelo '{model}' puede no soportar imagenes. "
            f"Prueba cambiar 'openrouter_image_model' en Settings."
        )

    # Normalizar a lista de {url, source}. Cada URL puede ser:
    #   - http(s)://...           -> source='url' (descargar)
    #   - data:image/png;base64,... -> source='b64'
    imagenes = []
    for u in urls[:n]:
        if u.startswith("data:"):
            imagenes.append({"url": u, "source": "b64"})
        else:
            imagenes.append({"url": u, "source": "url"})

    return {
        "imagenes": imagenes,
        "modelo": model,
        "prompt_usado": prompt[:500],
        "endpoint": src,
    }


def build_prompt(receta_tecnica: dict | None, receta_estructurada: dict | None,
                 catalogo_titulo: str) -> str:
    """
    Construye el prompt final sustituyendo variables en app_settings.prompt_emplatado.
    Variables soportadas:
      {{titulo}}, {{ingredientes}}, {{mise_en_place}}, {{servicio}},
      {{proceso}}, {{cantidades}}
    """
    settings = _get_settings()
    template = settings.get("prompt_emplatado", "")
    if not template:
        raise RuntimeError("Prompt de emplatado vacio. Configuralo en Settings.")

    rec = receta_tecnica or {}
    rec_old = receta_estructurada or {}

    # ingredientes: lista de objetos (FASE 8) o texto libre (legacy)
    ingredientes = rec.get("ingredientes")
    if not ingredientes:
        ingredientes = rec_old.get("ingredientes") or ""
    if isinstance(ingredientes, list):
        lineas = []
        for ing in ingredientes:
            if isinstance(ing, dict):
                nombre = ing.get("nombre") or ing.get("name") or ""
                cantidad = ing.get("cantidad") or ing.get("qty") or ""
                unidad = ing.get("unidad") or ing.get("unit") or ""
                partes = [p for p in (str(cantidad), str(unidad)) if p and p != "None"]
                sufijo = " ".join(partes)
                lineas.append(f"- {nombre}{(' — ' + sufijo) if sufijo else ''}")
            else:
                lineas.append(f"- {ing}")
        ingredientes_txt = "\n".join(lineas) if lineas else ""
    else:
        ingredientes_txt = str(ingredientes)

    mise_en_place = rec.get("elaboracion_mise_en_place") or ""
    servicio = rec.get("elaboracion_servicio") or ""

    # Fallback al campo 'proceso' antiguo si mise_en_place/servicio estan vacios
    if not mise_en_place and not servicio:
        proceso = rec_old.get("proceso") or ""
        mise_en_place = proceso
        servicio = proceso

    cantidades = rec_old.get("cantidades") or ""

    out = template
    out = out.replace("{{titulo}}", str(catalogo_titulo or ""))
    out = out.replace("{{ingredientes}}", ingredientes_txt)
    out = out.replace("{{mise_en_place}}", str(mise_en_place))
    out = out.replace("{{servicio}}", str(servicio))
    out = out.replace("{{proceso}}", str(rec_old.get("proceso") or ""))
    out = out.replace("{{cantidades}}", str(cantidades))
    return out