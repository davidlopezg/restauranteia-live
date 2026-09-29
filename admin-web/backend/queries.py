"""
Queries SQL para Sol de Nit Creativity Admin.

Esquema: `notion_migration`. Las tablas son:

  ideas, agendas, catalogos                 -- entidades
  idea_blocks, agenda_blocks, catalogo_blocks  -- bloques Notion
  idea_images, agenda_images, catalogo_images  -- imagenes
  idea_agenda, idea_catalogo, agenda_catalogo  -- relaciones N:M
  migration_runs, migration_map, ...           -- metadata (no expuesta)

Las queries SQL se construyen con valores interpolados y escapeados
(sql_utils). Los inputs del cliente se validan via Pydantic en main.py
y las columnas de ORDER pasan por whitelist.
"""
import logging
import uuid as _uuid

import supabase_client as sb
from config import config
from encoding_fix import deep_fix
from sql_utils import sql_escape, sql_uuid, sql_array, safe_order, like_escape


log = logging.getLogger(__name__)


# Columnas que el usuario puede editar (no permitir manipular PKs ni IDs internos
# ni campos de migracion).
EDITABLE_COLUMNS = {
    config.TABLE_IDEAS: {"titulo", "descripcion", "categorias", "puntuacion", "estado_idea", "fecha_creacion"},
    config.TABLE_AGENDAS: {"titulo", "fecha_creacion", "fecha", "etiquetas",
                          "estado_desarrollo", "objetivo", "receta_final", "timeline"},
    config.TABLE_CATALOGOS: {"titulo", "orden", "precio", "anio", "estado", "categorias", "seleccionada", "ingredientes", "receta_estructurada", "receta_tecnica", "imagen_emplatado_id", "ficha_tecnica_id"},
}


def _pg_value(v):
    """Convierte valor Python a literal SQL Postgres."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, list):
        return sql_array(v)
    # Sentinel para fechas CURRENT_DATE/CURRENT_TIMESTAMP (literales SQL, no strings)
    if isinstance(v, str) and v.upper() in ("CURRENT_DATE", "CURRENT_TIMESTAMP", "NOW()"):
        return v.upper()
    return sql_escape(v)


def _insert(table, payload, on_conflict=None, returning_cols=None,
            auto_fill=None):
    """
    INSERT. auto_fill es dict con campos NOT NULL que autogeneramos si el
    caller no los pasa (p.ej. notion_id, migration_run_id).
    """
    payload = dict(payload)
    if auto_fill:
        for k, fn in auto_fill.items():
            payload.setdefault(k, fn())
    cols = list(payload.keys())
    vals = [_pg_value(v) for v in payload.values()]
    cols_sql = ", ".join(cols)
    vals_sql = ", ".join(vals)
    sql = f"INSERT INTO {table} ({cols_sql}) VALUES ({vals_sql})"
    if on_conflict:
        sql += f" ON CONFLICT {on_conflict}"
    if returning_cols:
        sql += f" RETURNING {', '.join(returning_cols)}"
    rows = sb.exec(sql)
    return rows if rows else [{"ok": True}]


def _update(table, pk_col, pk_val, payload):
    allowed = EDITABLE_COLUMNS.get(table, set())
    if not allowed:
        raise sb.SupabaseError(f"Tabla no editable: {table}")
    safe_payload = {k: v for k, v in payload.items() if k in allowed}
    if not safe_payload:
        return []
    sets = ", ".join(f"{k} = {_pg_value(v)}" for k, v in safe_payload.items())
    sql = f"UPDATE {table} SET {sets} WHERE {pk_col} = {sql_uuid(pk_val)} RETURNING *"
    return sb.exec(sql)


def _delete(table, pk_col, pk_val):
    sql = f"DELETE FROM {table} WHERE {pk_col} = {sql_uuid(pk_val)} RETURNING id"
    return sb.exec(sql)


def _new_uuid():
    return str(_uuid.uuid4())


# Auto-fill: campos NOT NULL que autogeneramos en insercion manual.
_AUTO_FILL = {
    config.TABLE_IDEAS: {"notion_id": _new_uuid, "migration_run_id": lambda: "manual_create"},
    config.TABLE_AGENDAS: {"notion_id": _new_uuid, "migration_run_id": lambda: "manual_create"},
    config.TABLE_CATALOGOS: {"notion_id": _new_uuid, "migration_run_id": lambda: "manual_create"},
}


# === Ideas ===

def list_ideas(search=None, categoria=None, estado=None, cursor=None,
               limit=30, order="fecha_creacion", ascending=False):
    where = []
    if search:
        where.append(f"titulo ILIKE '%{like_escape(search)}%'")
    if categoria:
        where.append(f"categorias @> {sql_array([categoria])}")
    if estado:
        where.append(f"estado_idea = {sql_escape(estado)}")
    if cursor:
        where.append(f"id > {sql_uuid(cursor)}")
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    order_sql = safe_order("ideas", order, ascending)
    sql = f"""
        SELECT *
        FROM {config.TABLE_IDEAS}
        {where_sql}
        ORDER BY {order_sql}
        LIMIT {int(limit) + 1}
    """
    rows = sb.query(sql)
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = rows[-1]["id"] if has_more and rows else None
    return {
        "items": deep_fix(rows),
        "next_cursor": next_cursor,
        "total_in_page": len(rows),
    }


# === Agendas ===

def list_agendas(search=None, etiqueta=None, cursor=None,
                 limit=30, order="fecha", ascending=False):
    where = []
    if search:
        where.append(f"titulo ILIKE '%{like_escape(search)}%'")
    if etiqueta:
        where.append(f"etiquetas @> {sql_array([etiqueta])}")
    if cursor:
        where.append(f"id > {sql_uuid(cursor)}")
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    order_sql = safe_order("agendas", order, ascending)
    sql = f"""
        SELECT *
        FROM {config.TABLE_AGENDAS}
        {where_sql}
        ORDER BY {order_sql}
        LIMIT {int(limit) + 1}
    """
    rows = sb.query(sql)
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = rows[-1]["id"] if has_more and rows else None
    return {
        "items": deep_fix(rows),
        "next_cursor": next_cursor,
        "total_in_page": len(rows),
    }


# === Catalogos ===

def list_catalogos(search=None, categoria=None, estado=None, cursor=None,
                   limit=30, order="orden", ascending=True):
    where = []
    if search:
        where.append(f"titulo ILIKE '%{like_escape(search)}%'")
    if categoria:
        where.append(f"categorias @> {sql_array([categoria])}")
    if estado:
        where.append(f"estado = {sql_escape(estado)}")
    if cursor:
        where.append(f"id > {sql_uuid(cursor)}")
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    order_sql = safe_order("catalogos", order, ascending)
    sql = f"""
        SELECT *
        FROM {config.TABLE_CATALOGOS}
        {where_sql}
        ORDER BY {order_sql}
        LIMIT {int(limit) + 1}
    """
    rows = sb.query(sql)
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = rows[-1]["id"] if has_more and rows else None
    return {
        "items": deep_fix(rows),
        "next_cursor": next_cursor,
        "total_in_page": len(rows),
    }


# === Detalle (entidad + imagenes + bloques + relaciones) ===

def detail_idea(idea_id):
    sql = f"SELECT * FROM {config.TABLE_IDEAS} WHERE id = {sql_uuid(idea_id)} LIMIT 1"
    item = sb.query_one(sql)
    if not item:
        return None
    images = sb.query(
        f"SELECT * FROM {config.TABLE_IDEA_IMAGES} "
        f"WHERE idea_id = {sql_uuid(idea_id)} "
        f"ORDER BY position NULLS LAST LIMIT 200"
    )
    blocks = sb.query(
        f"SELECT id, idea_id, notion_block_id, block_type, position, parent_block_id, "
        f"content_text, has_children, code_language, embed_url, is_broken, video_url, "
        f"video_source_type, image_source_type "
        f"FROM {config.TABLE_IDEA_BLOCKS} "
        f"WHERE idea_id = {sql_uuid(idea_id)} "
        f"ORDER BY position ASC LIMIT 500"
    )
    return {
        "item": deep_fix(item),
        "images": deep_fix(images),
        "blocks": deep_fix(blocks),
        "relations": _idea_relations(idea_id),
    }


def detail_agenda(agenda_id):
    sql = f"SELECT * FROM {config.TABLE_AGENDAS} WHERE id = {sql_uuid(agenda_id)} LIMIT 1"
    item = sb.query_one(sql)
    if not item:
        return None
    images = sb.query(
        f"SELECT * FROM {config.TABLE_AGENDA_IMAGES} "
        f"WHERE agenda_id = {sql_uuid(agenda_id)} "
        f"ORDER BY position NULLS LAST LIMIT 200"
    )
    blocks = sb.query(
        f"SELECT id, agenda_id, notion_block_id, block_type, position, parent_block_id, "
        f"content_text, has_children, code_language, embed_url, is_broken, video_url, "
        f"video_source_type, image_source_type "
        f"FROM {config.TABLE_AGENDA_BLOCKS} "
        f"WHERE agenda_id = {sql_uuid(agenda_id)} "
        f"ORDER BY position ASC LIMIT 500"
    )
    return {
        "item": deep_fix(item),
        "images": deep_fix(images),
        "blocks": deep_fix(blocks),
        "relations": _agenda_relations(agenda_id),
    }


def detail_catalogo(catalogo_id):
    sql = f"SELECT * FROM {config.TABLE_CATALOGOS} WHERE id = {sql_uuid(catalogo_id)} LIMIT 1"
    item = sb.query_one(sql)
    if not item:
        return None
    images = sb.query(
        f"SELECT * FROM {config.TABLE_CATALOGO_IMAGES} "
        f"WHERE catalogo_id = {sql_uuid(catalogo_id)} "
        f"ORDER BY position NULLS LAST LIMIT 200"
    )
    blocks = sb.query(
        f"SELECT id, catalogo_id, notion_block_id, block_type, position, parent_block_id, "
        f"content_text, has_children, code_language, embed_url, is_broken, video_url, "
        f"video_source_type, image_source_type "
        f"FROM {config.TABLE_CATALOGO_BLOCKS} "
        f"WHERE catalogo_id = {sql_uuid(catalogo_id)} "
        f"ORDER BY position ASC LIMIT 500"
    )
    return {
        "item": deep_fix(item),
        "images": deep_fix(images),
        "blocks": deep_fix(blocks),
        "relations": _catalogo_relations(catalogo_id),
    }


# === Relaciones ===

def _idea_relations(idea_id):
    agendas = _rels_to_target(
        config.TABLE_IDEA_AGENDA, side_col="idea_id", side_id=idea_id,
        target_table=config.TABLE_AGENDAS, other_col="agenda_id",
    )
    catalogos = _rels_to_target(
        config.TABLE_IDEA_CATALOGO, side_col="idea_id", side_id=idea_id,
        target_table=config.TABLE_CATALOGOS, other_col="catalogo_id",
    )
    return {"agendas": deep_fix(agendas), "catalogos": deep_fix(catalogos)}


def _agenda_relations(agenda_id):
    ideas = _rels_to_target(
        config.TABLE_IDEA_AGENDA, side_col="agenda_id", side_id=agenda_id,
        target_table=config.TABLE_IDEAS, other_col="idea_id",
    )
    catalogos = _rels_to_target(
        config.TABLE_AGENDA_CATALOGO, side_col="agenda_id", side_id=agenda_id,
        target_table=config.TABLE_CATALOGOS, other_col="catalogo_id",
    )
    return {"ideas": deep_fix(ideas), "catalogos": deep_fix(catalogos)}


def _catalogo_relations(catalogo_id):
    ideas = _rels_to_target(
        config.TABLE_IDEA_CATALOGO, side_col="catalogo_id", side_id=catalogo_id,
        target_table=config.TABLE_IDEAS, other_col="idea_id",
    )
    agendas = _rels_to_target(
        config.TABLE_AGENDA_CATALOGO, side_col="catalogo_id", side_id=catalogo_id,
        target_table=config.TABLE_AGENDAS, other_col="agenda_id",
    )
    return {"ideas": deep_fix(ideas), "agendas": deep_fix(agendas)}


def _rels_to_target(relation_table, side_col, side_id, target_table, other_col):
    """JOIN manual: SELECT relation -> SELECT target WHERE id IN (..."""
    rels = sb.query(
        f"SELECT {other_col} FROM {relation_table} WHERE {side_col} = {sql_uuid(side_id)}"
    )
    if not rels:
        return []
    ids = list({r[other_col] for r in rels if r.get(other_col)})
    if not ids:
        return []
    ids_sql = ",".join(sql_uuid(i) for i in ids)
    return sb.query(f"SELECT * FROM {target_table} WHERE id IN ({ids_sql}) LIMIT {len(ids)}")


# === CRUD ===

def create_idea(payload):
    return _insert(config.TABLE_IDEAS, payload, returning_cols=["*"],
                   auto_fill=_AUTO_FILL[config.TABLE_IDEAS])


def update_idea(idea_id, payload):
    return _update(config.TABLE_IDEAS, "id", idea_id, payload)


def delete_idea(idea_id):
    return _delete(config.TABLE_IDEAS, "id", idea_id)


def create_agenda(payload):
    return _insert(config.TABLE_AGENDAS, payload, returning_cols=["*"],
                   auto_fill=_AUTO_FILL[config.TABLE_AGENDAS])


def update_agenda(agenda_id, payload):
    return _update(config.TABLE_AGENDAS, "id", agenda_id, payload)


def delete_agenda(agenda_id):
    return _delete(config.TABLE_AGENDAS, "id", agenda_id)


def create_catalogo(payload):
    return _insert(config.TABLE_CATALOGOS, payload, returning_cols=["*"],
                   auto_fill=_AUTO_FILL[config.TABLE_CATALOGOS])


def update_catalogo(catalogo_id, payload):
    return _update(config.TABLE_CATALOGOS, "id", catalogo_id, payload)


def delete_catalogo(catalogo_id):
    return _delete(config.TABLE_CATALOGOS, "id", catalogo_id)


# === Relaciones N:M ===

def add_relation(table, a_id, b_id):
    """INSERT idempotente (ON CONFLICT DO NOTHING)."""
    if table == config.TABLE_IDEA_AGENDA:
        cols = {"idea_id": a_id, "agenda_id": b_id}
    elif table == config.TABLE_IDEA_CATALOGO:
        cols = {"idea_id": a_id, "catalogo_id": b_id}
    elif table == config.TABLE_AGENDA_CATALOGO:
        cols = {"agenda_id": a_id, "catalogo_id": b_id}
    else:
        raise ValueError(f"Tabla de relacion desconocida: {table}")
    return _insert(table, cols, on_conflict="DO NOTHING",
                   auto_fill={"migration_run_id": lambda: "manual_link"})


def remove_relation(table, a_id, b_id):
    if table == config.TABLE_IDEA_AGENDA:
        cond = f"idea_id = {sql_uuid(a_id)} AND agenda_id = {sql_uuid(b_id)}"
    elif table == config.TABLE_IDEA_CATALOGO:
        cond = f"idea_id = {sql_uuid(a_id)} AND catalogo_id = {sql_uuid(b_id)}"
    elif table == config.TABLE_AGENDA_CATALOGO:
        cond = f"agenda_id = {sql_uuid(a_id)} AND catalogo_id = {sql_uuid(b_id)}"
    else:
        raise ValueError(f"Tabla de relacion desconocida: {table}")
    sql = f"DELETE FROM {table} WHERE {cond}"
    return sb.exec(sql)


# === Valores unicos para filtros ===

def distinct_categorias(entidad):
    if entidad == "ideas":
        t, col = config.TABLE_IDEAS, "categorias"
    elif entidad == "catalogos":
        t, col = config.TABLE_CATALOGOS, "categorias"
    elif entidad == "agendas":
        t, col = config.TABLE_AGENDAS, "etiquetas"
    else:
        return []
    rows = sb.query(f"SELECT DISTINCT {col} FROM {t} WHERE {col} IS NOT NULL")
    out = set()
    for r in rows:
        for v in (r.get(col) or []):
            if v:
                out.add(v)
    return sorted(out)


def distinct_estados(entidad):
    if entidad == "ideas":
        t, col = config.TABLE_IDEAS, "estado_idea"
    elif entidad == "catalogos":
        t, col = config.TABLE_CATALOGOS, "estado"
    else:
        return []
    rows = sb.query(f"SELECT DISTINCT {col} FROM {t} WHERE {col} IS NOT NULL")
    return sorted({r[col] for r in rows if r.get(col)})


# ============================================================
# Image management
# ============================================================
#
# Cada imagen es una fila en idea_images / agenda_images / catalogo_images.
# El archivo fisico vive en Storage bajo {entidad}/{entidad_id}/{sha256}-{filename}.
#
# Reglas:
# 1. Si el SHA-256 ya existe para esa entidad, NO se sube el archivo (dedup).
#    Se crea nueva fila que apunta al mismo storage_path.
# 2. Al borrar una fila: si NO quedan otras filas con el mismo storage_path
#    en CUALQUIER tabla de imagenes, se borra el archivo fisico de Storage.
# 3. Las imagenes distinguen source_type='block_image' vs 'property'.

IMAGE_TABLES = {
    "ideas": config.TABLE_IDEA_IMAGES,
    "agendas": config.TABLE_AGENDA_IMAGES,
    "catalogos": config.TABLE_CATALOGO_IMAGES,
}

ENTITY_FK_COL = {
    "ideas": "idea_id",
    "agendas": "agenda_id",
    "catalogos": "catalogo_id",
}


def lookup_image_by_hash(entidad, sha256):
    """Busca si el SHA-256 ya existe en la tabla de imagenes de esta entidad."""
    t = IMAGE_TABLES[entidad]
    rows = sb.query(f"SELECT * FROM {t} WHERE sha256 = {sql_escape(sha256)} LIMIT 1")
    return rows[0] if rows else None


def count_storage_path_refs(storage_path):
    """Cuenta cuantas filas en TODAS las tablas de imagenes apuntan al mismo storage_path."""
    if not storage_path:
        return 0
    total = 0
    for tbl in [config.TABLE_IDEA_IMAGES, config.TABLE_AGENDA_IMAGES, config.TABLE_CATALOGO_IMAGES]:
        rows = sb.query(
            f"SELECT COUNT(*) AS n FROM {tbl} WHERE storage_path = {sql_escape(storage_path)}"
        )
        total += (rows[0]["n"] if rows else 0)
    return total


def insert_image_row(entidad, payload):
    """Inserta una fila en la tabla de imagenes correspondiente.

    Payload esperado: {entidad_id, source_type, notion_block_id?, notion_property?,
                       storage_bucket, storage_path, original_filename, mime_type,
                       file_size_bytes, sha256, position?, has_caption?}
    Devuelve la fila insertada.
    """
    t = IMAGE_TABLES[entidad]
    return _insert(t, payload, returning_cols=["*"])


def update_image_row(entidad, image_id, payload):
    """PATCH fila de imagen. Whitelist: solo campos seguros."""
    t = IMAGE_TABLES[entidad]
    allowed = {"source_type", "notion_block_id", "notion_property", "original_filename",
               "position", "has_caption"}
    safe = {k: v for k, v in payload.items() if k in allowed}
    if not safe:
        return []
    sets = ", ".join(f"{k} = {_pg_value(v)}" for k, v in safe.items())
    sql = f"UPDATE {t} SET {sets} WHERE id = {sql_uuid(image_id)} RETURNING *"
    return sb.exec(sql)


def delete_image_row(entidad, image_id):
    """DELETE fila de imagen. Devuelve el storage_path del archivo (para borrado fisico opcional)."""
    t = IMAGE_TABLES[entidad]
    sql = f"DELETE FROM {t} WHERE id = {sql_uuid(image_id)} RETURNING storage_path, storage_bucket"
    rows = sb.exec(sql)
    return rows[0] if rows else None


# ============================================================
# Pipeline de desarrollo + Pendientes
# ============================================================
#
# El estado del desarrollo vive en agendas.estado_desarrollo (text).
# Estados validos: CONCEPTO, PRUEBA_1, EVALUACION_1, MODIFICACION,
#                  PRUEBA_2, VALIDACION, PRODUCTO.

ESTADOS_DESARROLLO = [
    "CONCEPTO",
    "PRUEBA_1",
    "EVALUACION_1",
    "MODIFICACION",
    "PRUEBA_2",
    "VALIDACION",
    "PRODUCTO",
]

# Transiciones validas (estado origen -> [estados destino])
TRANSICIONES = {
    "CONCEPTO":     ["PRUEBA_1"],
    "PRUEBA_1":     ["EVALUACION_1"],
    "EVALUACION_1": ["MODIFICACION", "PRUEBA_2"],
    "MODIFICACION": ["PRUEBA_2"],
    "PRUEBA_2":     ["VALIDACION"],
    "VALIDACION":   ["PRODUCTO"],
    "PRODUCTO":     [],
}


def pipeline_por_estado():
    """Devuelve agendas agrupadas por estado_desarrollo.
    Devuelve un dict {estado: [agenda,...]} con estados siempre presentes (listas vacias)."""
    out = {estado: [] for estado in ESTADOS_DESARROLLO}
    rows = sb.query(f"""
        SELECT id, titulo, estado_desarrollo, objetivo, fecha, receta_final,
               migrated_at, timeline
        FROM {config.TABLE_AGENDAS}
        WHERE estado_desarrollo IS NOT NULL
        ORDER BY migrated_at DESC NULLS LAST
        LIMIT 200
    """)
    for r in rows:
        out.setdefault(r['estado_desarrollo'], []).append(deep_fix(r))
    return out


def cambiar_estado_desarrollo(agenda_id, nuevo_estado, descripcion=None):
    """Cambia estado_desarrollo de una agenda, validando transicion y actualizando timeline."""
    if nuevo_estado not in ESTADOS_DESARROLLO:
        raise ValueError(f"Estado invalido: {nuevo_estado}")
    cur = sb.query(
        f"SELECT estado_desarrollo, timeline FROM {config.TABLE_AGENDAS} WHERE id = {sql_uuid(agenda_id)} LIMIT 1"
    )
    if not cur:
        return None
    estado_actual = cur[0].get('estado_desarrollo')
    timeline_actual = cur[0].get('timeline') or []
    if estado_actual and estado_actual != nuevo_estado:
        permitidos = TRANSICIONES.get(estado_actual, [])
        if nuevo_estado not in permitidos:
            raise ValueError(f"Transicion no permitida: {estado_actual} -> {nuevo_estado}")
    import datetime, json as _json
    nuevo_evento = {
        'ts': datetime.datetime.utcnow().isoformat() + 'Z',
        'tipo': 'CAMBIO_ESTADO',
        'from': estado_actual,
        'to': nuevo_estado,
        'desc': descripcion or '',
    }
    nueva_timeline = timeline_actual + [nuevo_evento]
    rows = sb.exec(f"""
        UPDATE {config.TABLE_AGENDAS}
        SET estado_desarrollo = {sql_escape(nuevo_estado)},
            timeline = {_pg_value(_json.dumps(nueva_timeline))}::jsonb
        WHERE id = {sql_uuid(agenda_id)}
        RETURNING *
    """)
    return rows[0] if rows else None


def append_event(agenda_id, tipo, descripcion, extra=None):
    """Agrega un evento al timeline de la agenda (sin cambiar estado)."""
    cur = sb.query(f"SELECT timeline FROM {config.TABLE_AGENDAS} WHERE id = {sql_uuid(agenda_id)} LIMIT 1")
    if not cur:
        return None
    timeline = cur[0].get('timeline') or []
    import datetime, json as _json
    ev = {
        'ts': datetime.datetime.utcnow().isoformat() + 'Z',
        'tipo': tipo,
        'desc': descripcion,
    }
    if extra:
        ev.update(extra)
    timeline.append(ev)
    rows = sb.exec(f"""
        UPDATE {config.TABLE_AGENDAS}
        SET timeline = {_pg_value(_json.dumps(timeline))}::jsonb
        WHERE id = {sql_uuid(agenda_id)}
        RETURNING *
    """)
    return rows[0] if rows else None


def pendientes():
    """Devuelve lista de desarrollos con accion pendiente, clasificados por prioridad."""
    import datetime
    rows = sb.query(f"""
        SELECT id, titulo, estado_desarrollo, migrated_at, receta_final, objetivo, fecha
        FROM {config.TABLE_AGENDAS}
        WHERE estado_desarrollo IS NOT NULL
          AND estado_desarrollo <> 'PRODUCTO'
        ORDER BY migrated_at DESC NULLS LAST
    """)
    out = []
    ahora = datetime.datetime.utcnow()
    for r in rows:
        estado = r.get('estado_desarrollo')
        # dias desde ultima actividad
        dias = None
        if r.get('migrated_at'):
            try:
                mt = datetime.datetime.fromisoformat(str(r['migrated_at']).replace('Z', '+00:00').split('+')[0])
                dias = (ahora - mt).days
            except Exception:
                pass
        receta_ok = bool(r.get('receta_final'))
        if estado == 'VALIDACION' and receta_ok:
            prioridad = 'VERDE'
        elif dias is not None and dias > 3:
            prioridad = 'ROJO'
        elif dias is not None and dias >= 1:
            prioridad = 'NARANJA'
        else:
            prioridad = 'AMARILLO'
        out.append({
            'id': r['id'],
            'titulo': r['titulo'],
            'estado_desarrollo': estado,
            'prioridad': prioridad,
            'dias_sin_actividad': dias,
            'receta_final': receta_ok,
            'objetivo': r.get('objetivo'),
        })
    # Ordenar por prioridad
    order = {'ROJO': 0, 'NARANJA': 1, 'AMARILLO': 2, 'VERDE': 3}
    out.sort(key=lambda x: (order.get(x['prioridad'], 9), -(x['dias_sin_actividad'] or 0)))
    return out


# ============================================================
# Development tests
# ============================================================

TABLE_DEV_TESTS = f"{config.DB_SCHEMA}.development_tests"
COL_TEST_AGENDA = "agenda_id"

EDITABLE_COLUMNS[TABLE_DEV_TESTS] = {
    "fecha", "estado", "objetivo", "receta_utilizada",
    "modificaciones", "resultado", "observaciones"
}


def list_tests(agenda_id, estado=None):
    """Lista pruebas de una agenda, ordenadas por numero DESC."""
    where = [f"agenda_id = {sql_uuid(agenda_id)}"]
    if estado:
        where.append(f"estado = {sql_escape(estado)}")
    sql = f"""
        SELECT * FROM {TABLE_DEV_TESTS}
        WHERE {' AND '.join(where)}
        ORDER BY numero ASC
    """
    return deep_fix(sb.query(sql))


def get_test(test_id):
    sql = f"SELECT * FROM {TABLE_DEV_TESTS} WHERE id = {sql_uuid(test_id)} LIMIT 1"
    rows = sb.query(sql)
    return deep_fix(rows[0]) if rows else None


def create_test(agenda_id, payload):
    """Crea una prueba. numero se asigna automaticamente si no viene."""
    payload = dict(payload)
    payload.setdefault("agenda_id", agenda_id)
    if "numero" not in payload:
        rows = sb.query(
            f"SELECT COALESCE(MAX(numero), 0) AS n FROM {TABLE_DEV_TESTS} WHERE agenda_id = {sql_uuid(agenda_id)}"
        )
        next_n = (rows[0]['n'] if rows else 0) + 1
        payload['numero'] = next_n
    if 'fecha' not in payload:
        payload['fecha'] = 'CURRENT_DATE'
    return deep_fix(_insert(TABLE_DEV_TESTS, payload, returning_cols=["*"])[0])


def update_test(test_id, payload):
    return deep_fix(_update(TABLE_DEV_TESTS, "id", test_id, payload))


def delete_test(test_id):
    return _delete(TABLE_DEV_TESTS, "id", test_id)


def count_tests_by_agenda(agenda_id, estado=None):
    """Cuenta pruebas de una agenda, opcionalmente filtradas por estado."""
    where = [f"agenda_id = {sql_uuid(agenda_id)}"]
    if estado:
        where.append(f"estado = {sql_escape(estado)}")
    rows = sb.query(f"SELECT COUNT(*) AS n FROM {TABLE_DEV_TESTS} WHERE {' AND '.join(where)}")
    return rows[0]['n'] if rows else 0


# ============================================================
# Test feedback
# ============================================================

TABLE_TEST_FEEDBACK = f"{config.DB_SCHEMA}.test_feedback"
COL_TEST_ID = "test_id"

EDITABLE_COLUMNS[TABLE_TEST_FEEDBACK] = {
    "mesa", "num_personas", "valoracion", "criterio", "observacion", "fecha",
}


def list_feedback(test_id=None):
    """Lista feedback. Si test_id, filtra por esa prueba. Si no, lista todos."""
    where = []
    if test_id:
        where.append(f"test_id = {sql_uuid(test_id)}")
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    sql = f"""
        SELECT * FROM {TABLE_TEST_FEEDBACK}
        {where_sql}
        ORDER BY fecha DESC, created_at DESC
    """
    return deep_fix(sb.query(sql))


def get_feedback(feedback_id):
    rows = sb.query(f"SELECT * FROM {TABLE_TEST_FEEDBACK} WHERE id = {sql_uuid(feedback_id)} LIMIT 1")
    return deep_fix(rows[0]) if rows else None


def create_feedback(test_id, payload):
    payload = dict(payload)
    payload.setdefault("test_id", test_id)
    if "fecha" not in payload:
        payload["fecha"] = "CURRENT_DATE"
    return deep_fix(_insert(TABLE_TEST_FEEDBACK, payload, returning_cols=["*"])[0])


def update_feedback(feedback_id, payload):
    return deep_fix(_update(TABLE_TEST_FEEDBACK, "id", feedback_id, payload))


def delete_feedback(feedback_id):
    return _delete(TABLE_TEST_FEEDBACK, "id", feedback_id)


def count_feedback_by_test(test_id):
    rows = sb.query(f"SELECT COUNT(*) AS n FROM {TABLE_TEST_FEEDBACK} WHERE test_id = {sql_uuid(test_id)}")
    return rows[0]['n'] if rows else 0


# ============================================================
# Plating proposals
# ============================================================

TABLE_PLATING = f"{config.DB_SCHEMA}.plating_proposals"
COL_PLATING_CATALOGO = "catalogo_id"

EDITABLE_COLUMNS[TABLE_PLATING] = {
    "estado", "nombre", "descripcion", "vajilla_sugerida", "razonamiento",
}


def list_plating(catalogo_id, estado=None):
    where = [f"catalogo_id = {sql_uuid(catalogo_id)}"]
    if estado:
        where.append(f"estado = {sql_escape(estado)}")
    sql = f"""
        SELECT * FROM {TABLE_PLATING}
        WHERE {' AND '.join(where)}
        ORDER BY orden ASC
    """
    return deep_fix(sb.query(sql))


def get_plating(plating_id):
    rows = sb.query(f"SELECT * FROM {TABLE_PLATING} WHERE id = {sql_uuid(plating_id)} LIMIT 1")
    return deep_fix(rows[0]) if rows else None


def insert_plating(payload):
    return deep_fix(_insert(TABLE_PLATING, payload, returning_cols=["*"])[0])


def update_plating(plating_id, payload):
    return deep_fix(_update(TABLE_PLATING, "id", plating_id, payload))


def delete_plating(plating_id):
    return _delete(TABLE_PLATING, "id", plating_id)


def next_plating_orden(catalogo_id):
    """Devuelve el siguiente orden disponible para propuestas de un catalogo."""
    rows = sb.query(
        f"SELECT COALESCE(MAX(orden), 0) + 1 AS next FROM {TABLE_PLATING} "
        f"WHERE catalogo_id = {sql_uuid(catalogo_id)}"
    )
    return rows[0]['next'] if rows else 1


# ============================================================
# Ware (inventario de vajilla)
# ============================================================

TABLE_WARE = f"{config.DB_SCHEMA}.ware"

EDITABLE_COLUMNS[TABLE_WARE] = {
    "nombre", "tipo", "marca", "modelo", "material", "color", "forma",
    "tamano", "descripcion", "disponibilidad",
}


def list_ware(tipo=None, disponible=None):
    where = []
    if tipo:
        where.append(f"tipo = {sql_escape(tipo)}")
    if disponible is not None:
        where.append(f"disponibilidad = {'TRUE' if disponible else 'FALSE'}")
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    sql = f"""
        SELECT * FROM {TABLE_WARE}
        {where_sql}
        ORDER BY tipo, nombre
    """
    return deep_fix(sb.query(sql))


def get_ware(ware_id):
    rows = sb.query(f"SELECT * FROM {TABLE_WARE} WHERE id = {sql_uuid(ware_id)} LIMIT 1")
    return deep_fix(rows[0]) if rows else None


def create_ware(payload):
    return deep_fix(_insert(TABLE_WARE, payload, returning_cols=["*"])[0])


def update_ware(ware_id, payload):
    return deep_fix(_update(TABLE_WARE, "id", ware_id, payload))


def delete_ware(ware_id):
    return _delete(TABLE_WARE, "id", ware_id)


def distinct_ware_tipos():
    rows = sb.query(f"SELECT DISTINCT tipo FROM {TABLE_WARE} WHERE tipo IS NOT NULL ORDER BY 1")
    return [r['tipo'] for r in rows]


# ============================================================
# Weekly objectives (cadencia)
# ============================================================


def upsert_setting(key, value):
    """Guarda o actualiza un setting en app_settings."""
    from config import config
    import supabase_client as sb
    try:
        # Intentar update
        rows = sb.query(f"UPDATE {config.DB_SCHEMA}.app_settings SET value = {sql_escape(str(value))} WHERE key = {sql_escape(key)} RETURNING key")
        if not rows:
            # Insertar
            sb.query(f"INSERT INTO {config.DB_SCHEMA}.app_settings (key, value) VALUES ({sql_escape(key)}, {sql_escape(str(value))}) RETURNING key")
        return True
    except Exception:
        # Fallback: insert directo con ON CONFLICT
        sb.query(f"""
            INSERT INTO {config.DB_SCHEMA}.app_settings (key, value)
            VALUES ({sql_escape(key)}, {sql_escape(str(value))})
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        """)
        return True


TABLE_WEEKLY = f"{config.DB_SCHEMA}.weekly_objectives"

EDITABLE_COLUMNS[TABLE_WEEKLY] = {
    "objetivo_minimo", "estado", "aplazamiento_motivo", "aplazamiento_notas",
    "deuda",
}


def _current_week_range():
    """Lunes-Domingo de la semana actual."""
    from datetime import date, timedelta
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def get_current_week():
    """Devuelve la semana actual. Si no existe fila, devuelve None con defaults."""
    monday, sunday = _current_week_range()
    rows = sb.query(
        f"SELECT * FROM {TABLE_WEEKLY} WHERE semana_inicio = '{monday.isoformat()}' LIMIT 1"
    )
    if rows:
        return deep_fix(rows[0])
    return None


def list_weeks(limit=10):
    """Lista las ultimas N semanas (con o sin fila)."""
    rows = sb.query(
        f"SELECT * FROM {TABLE_WEEKLY} ORDER BY semana_inicio DESC LIMIT {int(limit)}"
    )
    return deep_fix(rows)


def upsert_current_week(objetivo_minimo=1):
    """Crea la fila de la semana actual si no existe."""
    monday, sunday = _current_week_range()
    payload = {
        "semana_inicio": monday.isoformat(),
        "semana_fin": sunday.isoformat(),
        "objetivo_minimo": objetivo_minimo,
        "estado": "EN_CURSO",
        "productos_ids": "[]",
    }
    sb.query(
        f"INSERT INTO {TABLE_WEEKLY} (semana_inicio, semana_fin, objetivo_minimo, estado, productos_ids) "
        f"VALUES ('{monday.isoformat()}', '{sunday.isoformat()}', {int(objetivo_minimo)}, 'EN_CURSO', '[]'::jsonb) "
        f"ON CONFLICT (semana_inicio) DO NOTHING RETURNING *"
    )
    return get_current_week()


def update_week(week_id, payload):
    return deep_fix(_update(TABLE_WEEKLY, "id", week_id, payload))


def recalculate_current_week():
    """
    Recalcula productos_completados y estado de la semana actual
    en funcion de catalogos con estado='Listo' creados esta semana
    o que tengan agenda con timeline mostrando transicion a PRODUCTO.
    """
    monday, sunday = _current_week_range()
    # Productos en catalogos con estado 'Listo' cuya agenda fue marcada PRODUCTO esta semana
    rows = sb.query(f"""
        SELECT a.id AS agenda_id, a.titulo, a.estado_desarrollo,
               jsonb_path_query_array(a.timeline, '$[*]') AS evs
        FROM {config.TABLE_AGENDAS} a
        WHERE a.estado_desarrollo = 'PRODUCTO'
    """)
    count = 0
    product_ids = []
    for r in rows:
        evs = r.get("evs") or []
        if not isinstance(evs, list): evs = [evs]
        for ev in evs:
            if not isinstance(ev, dict): continue
            if ev.get("tipo") == "CAMBIO_ESTADO" and ev.get("to") == "PRODUCTO":
                ts = ev.get("ts", "")
                if ts.startswith(monday.isoformat()[:10]) or (monday.isoformat() <= ts[:10] <= sunday.isoformat()):
                    count += 1
                    product_ids.append(r["agenda_id"])
                    break
    # Actualizar fila
    week = get_current_week()
    if week:
        new_count = max(week.get("productos_completados", 0), count)
        cumplimiento = "CUMPLIDO" if new_count >= week.get("objetivo_minimo", 1) else "EN_CURSO"
        if week.get("estado") == "APLAZADO":
            cumplimiento = "APLAZADO"
        import json as _json
        sb.query(f"""
            UPDATE {TABLE_WEEKLY}
            SET productos_completados = {new_count},
                productos_ids = '{_json.dumps(product_ids)}'::jsonb,
                estado = '{cumplimiento}'
            WHERE id = '{week["id"]}'
        """)
    return get_current_week()


def actividad_semanal():
    """Cuenta actividad de la semana actual: ideas creadas, conceptos, pruebas, etc."""
    monday, sunday = _current_week_range()
    import json as _json
    # Ideas creadas esta semana (migrated_at dentro del rango)
    ideas = sb.query(
        f"SELECT COUNT(*) AS n FROM {config.TABLE_IDEAS} "
        f"WHERE created_at >= '{monday.isoformat()}'::date AND created_at < '{sunday.isoformat()}'::date + 1"
    )
    # Pruebas esta semana
    tests = sb.query(
        f"SELECT COUNT(*) AS n FROM {config.DB_SCHEMA}.development_tests "
        f"WHERE created_at >= '{monday.isoformat()}'::date AND created_at < '{sunday.isoformat()}'::date + 1"
    )
    # Feedback
    fb = sb.query(
        f"SELECT COUNT(*) AS n FROM {config.DB_SCHEMA}.test_feedback "
        f"WHERE created_at >= '{monday.isoformat()}'::date AND created_at < '{sunday.isoformat()}'::date + 1"
    )
    # Productos en desarrollo (estado_desarrollo != NULL o PRODUCTO)
    en_dev = sb.query(
        f"SELECT COUNT(*) AS n FROM {config.TABLE_AGENDAS} "
        f"WHERE estado_desarrollo IS NOT NULL AND estado_desarrollo != 'PRODUCTO'"
    )
    return {
        "ideas_creadas": ideas[0]["n"] if ideas else 0,
        "pruebas_realizadas": tests[0]["n"] if tests else 0,
        "feedback_recogido": fb[0]["n"] if fb else 0,
        "productos_en_desarrollo": en_dev[0]["n"] if en_dev else 0,
    }
