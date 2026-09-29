"""
Router FASE 8 — Emplatado IA (imagen) + Ficha tecnica para catalogos.

Endpoints:
  POST /api/catalogos/{id}/emplatado/generar        -> 3 imagenes (no se persiste)
  POST /api/catalogos/{id}/emplatado/seleccionar   -> persiste la imagen elegida
  POST /api/catalogos/{id}/ficha-tecnica/generar   -> genera ficha tecnica PNG
  GET  /api/catalogos/{id}/emplatado/status        -> {configured, tiene_imagen}
"""
import hashlib

import httpx
from fastapi import APIRouter, HTTPException

import openrouter_image_client as _oi
import queries as Q
import supabase_client as sb
import technical_sheet_generator as _tg
from config import config


router = APIRouter(prefix="/api/catalogos", tags=["emplatado-ia"])


# === Helpers internos ===

def _get_catalogo(catalogo_id: str) -> dict | None:
    rows = sb.query(
        f"SELECT id, titulo, ingredientes, receta_estructurada, receta_tecnica, "
        f"imagen_emplatado_id, ficha_tecnica_id "
        f"FROM {config.TABLE_CATALOGOS} WHERE id = '{catalogo_id}' LIMIT 1"
    )
    return rows[0] if rows else None


def _download_to_bytes(url_or_b64: str) -> tuple[bytes, str]:
    """Descarga una URL o decodifica un data URL base64.
    Devuelve (bytes, mime)."""
    if url_or_b64.startswith("data:"):
        # data:image/png;base64,xxxx
        try:
            header, b64 = url_or_b64.split(",", 1)
            mime = "image/png"
            if ";" in header:
                mime = header[len("data:"):].split(";", 1)[0] or "image/png"
            import base64
            return base64.b64decode(b64), mime
        except Exception as e:
            raise ValueError(f"data URL invalida: {e}")
    r = httpx.get(url_or_b64, timeout=60.0, follow_redirects=True)
    if r.status_code >= 400:
        raise RuntimeError(f"Descarga fallo [{r.status_code}]: {url_or_b64[:120]}")
    mime = r.headers.get("content-type", "image/png").split(";")[0]
    return r.content, mime


def _persist_emplatado(catalogo_id: str, content: bytes, mime: str) -> dict:
    """Sube bytes a Storage + crea fila en catalogo_images (source_type='emplatado').
    Si ya existe una imagen de emplatado, reemplaza (1:1).
    """
    sha = hashlib.sha256(content).hexdigest()
    ext = "png"
    if "jpeg" in mime or "jpg" in mime:
        ext = "jpg"
    elif "webp" in mime:
        ext = "webp"
    path = f"catalogos/{catalogo_id}/emplatado-{sha[:16]}.{ext}"
    sb.upload_file(config.STORAGE_BUCKET, path, content, mime)

    # 1:1 — borrar fila vieja si existe
    rows = sb.query(
        f"SELECT id FROM {config.TABLE_CATALOGO_IMAGES} "
        f"WHERE catalogo_id = '{catalogo_id}' AND source_type = 'emplatado' LIMIT 1"
    )
    if rows:
        old_id = rows[0]["id"]
        sb.exec(f"DELETE FROM {config.TABLE_CATALOGO_IMAGES} WHERE id = '{old_id}'")

    # Insert nueva
    sql = (
        f"INSERT INTO {config.TABLE_CATALOGO_IMAGES} "
        f"(catalogo_id, source_type, storage_bucket, storage_path, "
        f"original_filename, mime_type, file_size_bytes, sha256, position) "
        f"VALUES ('{catalogo_id}', 'emplatado', '{config.STORAGE_BUCKET}', "
        f"'{path}', 'emplatado.{ext}', '{mime}', {len(content)}, '{sha}', 0) "
        f"RETURNING id, storage_path, sha256, mime_type, file_size_bytes"
    )
    new_row = sb.query(sql)
    image_id = new_row[0]["id"] if new_row else ""

    if image_id:
        sb.exec(
            f"UPDATE {config.TABLE_CATALOGOS} "
            f"SET imagen_emplatado_id = '{image_id}' "
            f"WHERE id = '{catalogo_id}'"
        )
    return {
        "image_id": image_id,
        "storage_path": path,
        "sha256": sha,
        "mime_type": mime,
        "size_bytes": len(content),
        "signed_url": sb.signed_url(config.STORAGE_BUCKET, path),
    }


# === Endpoints ===

@router.get("/{catalogo_id}/emplatado/status")
def emplatado_status(catalogo_id: str):
    """Indica si el flujo esta disponible + estado actual del catalogo."""
    cat = _get_catalogo(catalogo_id)
    if not cat:
        raise HTTPException(404, detail="Producto no encontrado")
    return {
        "configured": _oi.is_configured(),
        "model": _oi.model_in_use(),
        "key_source": _oi.key_source(),
        "tiene_imagen_emplatado": bool(cat.get("imagen_emplatado_id")),
        "imagen_emplatado_id": cat.get("imagen_emplatado_id"),
        "tiene_ficha_tecnica": bool(cat.get("ficha_tecnica_id")),
        "ficha_tecnica_id": cat.get("ficha_tecnica_id"),
        "tiene_receta_tecnica": bool(cat.get("receta_tecnica")),
    }


@router.post("/{catalogo_id}/emplatado/generar")
def generar_emplatado(catalogo_id: str):
    """Genera 3 propuestas de IMAGEN de emplatado. NO persiste nada.
    Devuelve las imagenes para que el frontend las muestre y el usuario elija.
    """
    cat = _get_catalogo(catalogo_id)
    if not cat:
        raise HTTPException(404, detail="Producto no encontrado")
    if not _oi.is_configured():
        raise HTTPException(503, detail=(
            "OpenRouter imagenes no configurado. "
            "Anade la API key en Settings y configura prompt_emplatado + openrouter_image_model."
        ))

    try:
        prompt = _oi.build_prompt(
            receta_tecnica=cat.get("receta_tecnica"),
            receta_estructurada=cat.get("receta_estructurada"),
            catalogo_titulo=cat.get("titulo", ""),
        )
        result = _oi.generate_images(prompt, n=3)
    except RuntimeError as e:
        raise HTTPException(502, detail=str(e))
    except Exception as e:
        raise HTTPException(502, detail=f"Error generando imagenes: {e}")

    return {
        "catalogo_id": catalogo_id,
        "modelo": result["modelo"],
        "prompt_usado": result["prompt_usado"],
        "endpoint": result["endpoint"],
        "imagenes": result["imagenes"],  # [{url, source}]  source='url' | 'b64'
    }


@router.post("/{catalogo_id}/emplatado/seleccionar")
def seleccionar_emplatado(catalogo_id: str, body: dict):
    """El usuario eligio una imagen de las 3. La persistimos.
    Body: {url: string}  (URL http(s) o data URL base64).
    """
    cat = _get_catalogo(catalogo_id)
    if not cat:
        raise HTTPException(404, detail="Producto no encontrado")

    url = body.get("url") or body.get("image_url")
    if not url:
        raise HTTPException(400, detail="Falta 'url' de la imagen seleccionada")

    try:
        content, mime = _download_to_bytes(url)
        persisted = _persist_emplatado(catalogo_id, content, mime)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(502, detail=str(e))

    return persisted


@router.post("/{catalogo_id}/ficha-tecnica/generar")
def generar_ficha_tecnica(catalogo_id: str):
    """Genera la ficha tecnica PNG para el catalogo.
    Requiere que imagen_emplatado_id este seteado.
    """
    cat = _get_catalogo(catalogo_id)
    if not cat:
        raise HTTPException(404, detail="Producto no encontrado")
    if not cat.get("imagen_emplatado_id"):
        raise HTTPException(400, detail=(
            "El producto aun no tiene imagen de emplatado. "
            "Primero genera y selecciona una."
        ))

    try:
        result = _tg.generate(catalogo_id)
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
    except Exception as e:
        import logging
        logging.exception("generar_ficha_tecnica fallo")
        raise HTTPException(502, detail=str(e))

    return result