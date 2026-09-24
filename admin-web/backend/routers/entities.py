"""
Router de entidades: ideas, agendas, catalogos + relaciones + filtros + convertir.
"""
from fastapi import APIRouter, HTTPException, Query

import queries as Q
import supabase_client as sb
from sql_utils import sql_uuid
from config import config
import models as M

router = APIRouter(prefix="/api", tags=["entidades"])

# Mapeo nombre de relacion (URL) -> tabla en BD
_REL = {
    "idea_agenda": config.TABLE_IDEA_AGENDA,
    "idea_catalogo": config.TABLE_IDEA_CATALOGO,
    "agenda_catalogo": config.TABLE_AGENDA_CATALOGO,
}


# === IDEAS ===

@router.get("/ideas")
def get_ideas(search: str | None = None, categoria: str | None = None, estado: str | None = None,
              cursor: str | None = None, limit: int = Query(30, ge=1, le=200),
              order: str = "fecha_creacion", ascending: bool = False):
    try:
        return Q.list_ideas(search, categoria, estado, cursor, limit, order, ascending)
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.get("/ideas/{idea_id}")
def get_idea(idea_id: str):
    try:
        d = Q.detail_idea(idea_id)
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))
    if not d:
        raise HTTPException(404, detail="Idea no encontrada")
    return d


@router.post("/ideas", status_code=201)
def create_idea(body: M.IdeaCreate):
    try:
        return Q.create_idea(body.model_dump(exclude_none=True))[0]
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.patch("/ideas/{idea_id}")
def update_idea(idea_id: str, body: M.IdeaUpdate):
    try:
        rows = Q.update_idea(idea_id, body.model_dump(exclude_none=True))
        if not rows:
            raise HTTPException(404, detail="Idea no encontrada")
        return rows[0]
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.delete("/ideas/{idea_id}")
def delete_idea(idea_id: str):
    try:
        Q.delete_idea(idea_id)
        return {"deleted": True, "id": idea_id}
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.post("/ideas/{idea_id}/convertir")
def convertir_idea(idea_id: str):
    """Convierte una idea en agenda (estado CONCEPTO) + relacion idea-agenda."""
    try:
        idea = sb.query(f"SELECT * FROM {config.TABLE_IDEAS} WHERE id = {sql_uuid(idea_id)} LIMIT 1")
        if not idea:
            raise HTTPException(404, detail="Idea no encontrada")
        idea = idea[0]
        ex = sb.query(
            f"SELECT a.id, a.titulo FROM {config.TABLE_AGENDAS} a "
            f"JOIN {config.TABLE_IDEA_AGENDA} ia ON ia.agenda_id=a.id "
            f"WHERE ia.idea_id={sql_uuid(idea_id)} LIMIT 1"
        )
        if ex:
            return {"already_exists": True, "agenda_id": ex[0]["id"], "agenda_titulo": ex[0]["titulo"]}
        ag = Q.create_agenda({"titulo": idea.get("titulo", "Concepto sin titulo")})
        if idea.get("descripcion"):
            Q.update_agenda(ag["id"], {"objetivo": idea["descripcion"]})
        Q.add_relation(config.TABLE_IDEA_AGENDA, idea_id, ag["id"])
        Q.cambiar_estado_desarrollo(ag["id"], "CONCEPTO", f"Convertida desde idea: {idea.get('titulo', '')}")
        return {"already_exists": False, "agenda_id": ag["id"], "agenda_titulo": ag.get("titulo")}
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


# === AGENDAS ===

@router.get("/agendas")
def get_agendas(search: str | None = None, etiqueta: str | None = None, cursor: str | None = None,
                limit: int = Query(30, ge=1, le=200), order: str = "fecha", ascending: bool = False):
    try:
        return Q.list_agendas(search, etiqueta, cursor, limit, order, ascending)
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.get("/agendas/{agenda_id}")
def get_agenda(agenda_id: str):
    try:
        d = Q.detail_agenda(agenda_id)
        if not d:
            raise HTTPException(404, detail="Agenda no encontrada")
        return d
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.post("/agendas", status_code=201)
def create_agenda(body: M.AgendaCreate):
    try:
        return Q.create_agenda(body.model_dump(exclude_none=True))[0]
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.patch("/agendas/{agenda_id}")
def update_agenda(agenda_id: str, body: M.AgendaUpdate):
    try:
        rows = Q.update_agenda(agenda_id, body.model_dump(exclude_none=True))
        if not rows:
            raise HTTPException(404, detail="Agenda no encontrada")
        return rows[0]
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.delete("/agendas/{agenda_id}")
def delete_agenda(agenda_id: str):
    try:
        Q.delete_agenda(agenda_id)
        return {"deleted": True, "id": agenda_id}
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


# === CATALOGOS ===

@router.get("/catalogos")
def get_catalogos(search: str | None = None, categoria: str | None = None, estado: str | None = None,
                  cursor: str | None = None, limit: int = Query(30, ge=1, le=200),
                  order: str = "orden", ascending: bool = True):
    try:
        return Q.list_catalogos(search, categoria, estado, cursor, limit, order, ascending)
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.get("/catalogos/grupos")
def get_catalogos_agrupados():
    """Devuelve catalogos agrupados por categoria, ordenados por 'orden' dentro de cada grupo."""
    try:
        rows = sb.query(f"""
            SELECT id, titulo, categorias, orden, precio, estado, ingredientes, receta_estructurada
            FROM {config.TABLE_CATALOGOS}
            ORDER BY orden NULLS LAST, titulo
        """)
        grupos = {}
        for r in rows:
            cats = r.get("categorias") or ["Sin categoria"]
            for cat in cats:
                if not cat:
                    continue
                grupos.setdefault(cat, []).append(r)
        orden_categorias = ["Pizzas", "Pizzas blancas", "Compartir", "Ensaladas", "Tapas",
                            "Postres", "Sugerencias", "Bebidas", "Pizzas semanales"]
        result = []
        for cat in orden_categorias:
            if cat in grupos:
                result.append({"categoria": cat, "items": grupos.pop(cat)})
        for cat, items in grupos.items():
            result.append({"categoria": cat, "items": items})
        return result
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.get("/catalogos/{catalogo_id}")
def get_catalogo(catalogo_id: str):
    try:
        d = Q.detail_catalogo(catalogo_id)
        if not d:
            raise HTTPException(404, detail="Catalogo no encontrado")
        return d
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.post("/catalogos", status_code=201)
def create_catalogo(body: M.CatalogoCreate):
    try:
        return Q.create_catalogo(body.model_dump(exclude_none=True))[0]
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.patch("/catalogos/{catalogo_id}")
def update_catalogo(catalogo_id: str, body: M.CatalogoUpdate):
    try:
        rows = Q.update_catalogo(catalogo_id, body.model_dump(exclude_none=True))
        if not rows:
            raise HTTPException(404, detail="Catalogo no encontrado")
        return rows[0]
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.delete("/catalogos/{catalogo_id}")
def delete_catalogo(catalogo_id: str):
    try:
        Q.delete_catalogo(catalogo_id)
        return {"deleted": True, "id": catalogo_id}
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


# === RELACIONES ===

@router.post("/relations/{rel}")
def add_relation(rel: str, body: M.Relation):
    if rel not in _REL:
        raise HTTPException(400, detail="Relacion invalida")
    try:
        sql_uuid(body.a_id)
        sql_uuid(body.b_id)
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
    try:
        rows = Q.add_relation(_REL[rel], body.a_id, body.b_id)
        return {"created": True, "row": rows[0] if rows else None}
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.delete("/relations/{rel}")
def remove_relation(rel: str, a_id: str = Query(...), b_id: str = Query(...)):
    if rel not in _REL:
        raise HTTPException(400, detail="Relacion invalida")
    try:
        sql_uuid(a_id)
        sql_uuid(b_id)
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
    try:
        return Q.remove_relation(_REL[rel], a_id, b_id)
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


# === FILTROS ===

@router.get("/filters/{entidad}")
def get_filters(entidad: str):
    if entidad not in ("ideas", "agendas", "catalogos"):
        raise HTTPException(400)
    try:
        return {"categorias": Q.distinct_categorias(entidad), "estados": Q.distinct_estados(entidad)}
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))
