"""
Cliente Supabase con dos canales:

1. **SQL**: via Management API (`api.supabase.com/v1/projects/{ref}/database/query`)
   - Credencial: `SUPABASE_ACCESS_TOKEN` (token de management)
   - Uso: SELECT / INSERT / UPDATE / DELETE
   - Razon: PostgREST no expone el schema `notion_migration` por defecto

2. **Storage**: via API REST del proyecto (`{project}.supabase.co/storage/v1/...`)
   - Credencial: `SUPABASE_SERVICE_ROLE_KEY`
   - Uso: signed URLs (GET), upload (POST), delete (DELETE)

Ninguna credencial sale del backend.
"""
import hashlib
import httpx

from config import config


class SupabaseError(Exception):
    pass


# === SQL ===

def query(sql):
    """Ejecuta SQL arbitrario. Devuelve lista de filas (vacia si 0 rows)."""
    r = httpx.post(
        f"https://api.supabase.com/v1/projects/{config.PROJECT_REF}/database/query",
        headers={
            "Authorization": f"Bearer {config.SUPABASE_ACCESS_TOKEN}",
            "Content-Type": "application/json",
        },
        json={"query": sql},
        timeout=60.0,
    )
    if r.status_code >= 400:
        raise SupabaseError(f"SQL failed [{r.status_code}]: {r.text[:400]}")
    data = r.json()
    return data if isinstance(data, list) else []


def query_one(sql):
    rows = query(sql)
    return rows[0] if rows else None


def exec(sql):
    """Para INSERT/UPDATE/DELETE. Igual que query pero semanticamente distinto."""
    return query(sql)


# === Storage ===

def _storage_headers(content_type=None):
    h = {
        "apikey": config.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY}",
    }
    if content_type:
        h["Content-Type"] = content_type
    return h


def signed_url(bucket, path, ttl=None):
    if not path:
        return None
    if ttl is None:
        ttl = config.SIGNED_URL_TTL_SECONDS
    url = f"{config.SUPABASE_URL}/storage/v1/object/sign/{bucket}/{path}"
    r = httpx.post(
        url,
        headers=_storage_headers("application/json"),
        json={"expiresIn": int(ttl)},
        timeout=15.0,
    )
    if r.status_code >= 400:
        raise SupabaseError(f"SIGNED URL {bucket}/{path} failed [{r.status_code}]: {r.text[:300]}")
    signed = r.json().get("signedURL")
    if not signed:
        return None
    if signed.startswith("http"):
        return signed
    return f"{config.SUPABASE_URL}/storage/v1{signed}"


def upload_file(bucket, path, content_bytes, content_type="application/octet-stream"):
    """Sube un archivo a Storage. Idempotente: usa upsert=true para evitar 409 si ya existe."""
    url = f"{config.SUPABASE_URL}/storage/v1/object/{bucket}/{path}?upsert=true"
    r = httpx.post(
        url,
        headers=_storage_headers(content_type),
        content=content_bytes,
        timeout=60.0,
    )
    if r.status_code >= 400:
        raise SupabaseError(f"UPLOAD {bucket}/{path} failed [{r.status_code}]: {r.text[:400]}")


def delete_file(bucket, path):
    """Elimina un archivo de Storage."""
    url = f"{config.SUPABASE_URL}/storage/v1/object/{bucket}/{path}"
    # Construimos header Authorization con path encoded correctamente.
    # Storage acepta el path en la URL tal cual (con /).
    r = httpx.delete(
        url,
        headers=_storage_headers(),
        timeout=30.0,
    )
    if r.status_code >= 400 and r.status_code != 404:
        raise SupabaseError(f"DELETE STORAGE {bucket}/{path} failed [{r.status_code}]: {r.text[:300]}")
    return r.status_code in (200, 204, 404)


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()
