"""
Configuración del backend. Lee variables de entorno (.env).
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # Project URL del proyecto Supabase (anon + service_role funcionan aquí).
    SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
    # Project ref extraído del URL — necesario para el Management API.
    PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF", "")
    # Service role key — NUNCA exponer al cliente.
    SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    # Management API access token — distinto de service_role, NUNCA exponer al cliente.
    SUPABASE_ACCESS_TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    APP_HOST = os.environ.get("APP_HOST", "127.0.0.1")
    APP_PORT = int(os.environ.get("APP_PORT", "8765"))
    SIGNED_URL_TTL_SECONDS = int(os.environ.get("SIGNED_URL_TTL_SECONDS", "3600"))
    ALLOWED_ORIGINS = [
        o.strip() for o in os.environ.get(
            "ALLOWED_ORIGINS",
            "http://localhost:8765,http://127.0.0.1:8765"
        ).split(",") if o.strip()
    ]

    # Schema donde viven las tablas migradas.
    DB_SCHEMA = "notion_migration"

    # Bucket único donde están todas las imágenes.
    STORAGE_BUCKET = "notion-migration-staging"

    # Tabla base para entidades
    TABLE_IDEAS = f"{DB_SCHEMA}.ideas"
    TABLE_AGENDAS = f"{DB_SCHEMA}.agendas"
    TABLE_CATALOGOS = f"{DB_SCHEMA}.catalogos"

    # Bloques
    TABLE_IDEA_BLOCKS = f"{DB_SCHEMA}.idea_blocks"
    TABLE_AGENDA_BLOCKS = f"{DB_SCHEMA}.agenda_blocks"
    TABLE_CATALOGO_BLOCKS = f"{DB_SCHEMA}.catalogo_blocks"

    # Imágenes
    TABLE_IDEA_IMAGES = f"{DB_SCHEMA}.idea_images"
    TABLE_AGENDA_IMAGES = f"{DB_SCHEMA}.agenda_images"
    TABLE_CATALOGO_IMAGES = f"{DB_SCHEMA}.catalogo_images"

    # Relaciones
    TABLE_IDEA_AGENDA = f"{DB_SCHEMA}.idea_agenda"
    TABLE_IDEA_CATALOGO = f"{DB_SCHEMA}.idea_catalogo"
    TABLE_AGENDA_CATALOGO = f"{DB_SCHEMA}.agenda_catalogo"

    # Nombre de la columna FK hacia la entidad
    COL_IDEA_ID = "idea_id"
    COL_AGENDA_ID = "agenda_id"
    COL_CATALOGO_ID = "catalogo_id"


config = Config()
