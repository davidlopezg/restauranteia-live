"""
Utilidades para construir SQL seguro.

Como el endpoint `database/query` del Management API no acepta parámetros
($1, $2, ...), necesitamos interpolar valores manualmente con escape
robusto. Este módulo provee:

- sql_escape(value)  → string con comillas y caracteres peligrosos escapados.
- sql_array(items)    → ARRAY['a','b','c'] Postgres válido.
- sql_uuid(value)     → valida UUID y lo devuelve entre comillas.

NOTA: el SQL construido por queries.py es interno (no viene del cliente).
Los valores del cliente se validan vía Pydantic ANTES de llegar al SQL.
"""
import re
import uuid


def sql_escape(value):
    """Devuelve un string entre comillas simples con escape seguro."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    # String — escapar comillas y backslashes.
    s = str(value).replace("\\", "\\\\").replace("'", "''")
    return f"'{s}'"


def sql_array(items):
    """Convierte una lista Python en ARRAY[...] de Postgres."""
    if not items:
        return "ARRAY[]::text[]"
    parts = ",".join(sql_escape(v) for v in items)
    return f"ARRAY[{parts}]"


def sql_uuid(value):
    """Valida UUID y lo devuelve entre comillas; lanza ValueError si no es UUID."""
    try:
        u = uuid.UUID(str(value))
        return f"'{u}'"
    except (ValueError, AttributeError, TypeError):
        raise ValueError(f"UUID inválido: {value!r}")


# Whitelist para order_by (columnas permitidas en ORDER BY)
ORDER_WHITELIST = {
    "ideas": ["titulo", "fecha_creacion", "estado_idea", "migrated_at"],
    "agendas": ["titulo", "fecha", "fecha_creacion", "migrated_at"],
    "catalogos": ["titulo", "orden", "precio", "anio", "estado", "migrated_at"],
}


def safe_order(entidad, order_col, ascending):
    """Valida la columna de orden contra whitelist."""
    cols = ORDER_WHITELIST.get(entidad, ["titulo"])
    if order_col not in cols:
        order_col = cols[0]
    direction = "ASC" if ascending else "DESC"
    # id siempre como tiebreaker para resultados estables en paginación cursor.
    return f"{order_col} {direction}, id ASC"


def like_escape(s):
    """Escapa % y _ para LIKE."""
    return str(s).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
