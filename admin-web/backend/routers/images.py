"""
Router de imagenes: upload, signed URL, PATCH, DELETE.
"""
import hashlib

from fastapi import APIRouter, HTTPException, Request

import queries as Q
import supabase_client as sb
from config import config

router = APIRouter(prefix="/api", tags=["imagenes"])


@router.patch("/{entidad}/{entity_id}/images/{image_id}")
def update_image(entidad: str, entity_id: str, image_id: str, body: dict):
    if entidad not in ("ideas", "agendas", "catalogos"):
        raise HTTPException(400)
    try:
        rows = Q.update_image_row(entidad, image_id, body)
        if not rows:
            raise HTTPException(404)
        return rows[0] if isinstance(rows, list) else rows
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.get("/images/signed")
def signed_image_url(bucket: str, path: str, ttl: int | None = None):
    """Devuelve signed URL de Storage para una imagen (1h por defecto)."""
    try:
        return {"url": sb.signed_url(bucket, path, ttl)}
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.post("/{entidad}/{entity_id}/images", status_code=201)
async def upload_image(entidad: str, entity_id: str, request: Request):
    """Sube UNA imagen con dedup SHA-256 y devuelve la fila creada (con FormData)."""
    if entidad not in ("ideas", "agendas", "catalogos"):
        raise HTTPException(400, detail="Entidad invalida")
    try:
        form = await request.form()
        file = form.get("file")
        if not file:
            raise HTTPException(400, detail="Archivo 'file' requerido")
        content = await file.read()
        sha = hashlib.sha256(content).hexdigest()
        ext = "png"
        if file.filename and '.' in file.filename:
            ext = file.filename.split('.')[-1].lower()
        if ext not in ("png", "jpg", "jpeg", "gif", "webp"):
            ext = "png"
        path = f"{entidad}/{entity_id}/{sha[:16]}.{ext}"
        sb.upload_file(config.STORAGE_BUCKET, path, content, f"image/{ext}")
        ex = Q.lookup_image_by_hash(entidad, sha)
        deduplicated = bool(ex)
        if ex:
            rows = Q.update_image_row(entidad, ex[0]["id"], {"ref_count": ex[0].get("ref_count", 1) + 1})
            rv = rows[0] if isinstance(rows, list) and rows else ex[0]
        else:
            row = Q.insert_image_row(entidad, {
                "entity_id": entity_id, "path": path, "sha256": sha,
                "bucket": config.STORAGE_BUCKET, "ref_count": 1,
                "source_type": form.get("source_type", ""),
                "notion_block_id": form.get("notion_block_id", ""),
                "notion_property": form.get("notion_property", ""),
                "position": form.get("position", ""),
            })
            rv = row[0] if isinstance(row, list) else row
        rv["deduplicated"] = deduplicated
        return rv
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.delete("/{entidad}/{entity_id}/images/{image_id}")
def delete_image(entidad: str, entity_id: str, image_id: str):
    """Elimina imagen con ref-counting: solo borra archivo cuando ref_count llega a 0."""
    if entidad not in ("ideas", "agendas", "catalogos"):
        raise HTTPException(400, detail="Entidad invalida")
    try:
        rows = Q.delete_image_row(entidad, image_id)
        return {"deleted": True, "id": image_id, "cleanup": rows.get("cleanup", False) if isinstance(rows, dict) else False}
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))