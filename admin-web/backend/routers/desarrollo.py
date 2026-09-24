"""
Router de desarrollo: pipeline, pendientes, estados, tests, feedback, timeline.
"""
from fastapi import APIRouter, HTTPException

import queries as Q
import supabase_client as sb
from sql_utils import sql_uuid
from config import config
import models as M

router = APIRouter(prefix="/api", tags=["desarrollo"])


@router.get("/desarrollo/pipeline")
def pipeline():
    try:
        return Q.pipeline_por_estado()
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.get("/desarrollo/estados")
def estados():
    return {"estados": Q.ESTADOS_DESARROLLO, "transiciones": Q.TRANSICIONES}


@router.get("/pendientes")
def pendientes():
    try:
        return Q.pendientes()
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.patch("/agendas/{agenda_id}/estado")
def cambiar_estado(agenda_id: str, body: dict):
    n = body.get("estado_desarrollo")
    d = body.get("descripcion", "")
    if not n:
        raise HTTPException(400, detail="estado_desarrollo requerido")
    try:
        r = Q.cambiar_estado_desarrollo(agenda_id, n, d)
        if not r:
            raise HTTPException(404)
        return r
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.post("/agendas/{agenda_id}/evento")
def agregar_evento(agenda_id: str, body: dict):
    t = body.get("tipo")
    d = body.get("descripcion", "")
    e = body.get("extra")
    if not t:
        raise HTTPException(400, detail="tipo requerido")
    try:
        r = Q.append_event(agenda_id, t, d, e)
        if not r:
            raise HTTPException(404)
        return r
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


# === TESTS ===

@router.get("/agendas/{agenda_id}/tests")
def list_tests(agenda_id: str, estado: str | None = None):
    try:
        return Q.list_tests(agenda_id, estado)
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.get("/agendas/{agenda_id}/tests/count")
def count_tests(agenda_id: str, estado: str | None = None):
    try:
        return {"count": Q.count_tests_by_agenda(agenda_id, estado)}
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.post("/agendas/{agenda_id}/tests", status_code=201)
def create_test(agenda_id: str, body: M.TestCreate):
    try:
        if not sb.query(f"SELECT id FROM {config.TABLE_AGENDAS} WHERE id = {sql_uuid(agenda_id)} LIMIT 1"):
            raise HTTPException(404, detail="Agenda no encontrada")
        return Q.create_test(agenda_id, body.model_dump(exclude_none=True))
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.patch("/tests/{test_id}")
def update_test(test_id: str, body: M.TestUpdate):
    try:
        r = Q.update_test(test_id, body.model_dump(exclude_none=True))
        if not r:
            raise HTTPException(404, detail="Prueba no encontrada")
        return r[0] if isinstance(r, list) else r
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.delete("/tests/{test_id}")
def delete_test(test_id: str):
    try:
        Q.delete_test(test_id)
        return {"deleted": True, "id": test_id}
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


# === FEEDBACK ===

@router.get("/feedback")
def list_feedback(test_id: str | None = None):
    try:
        return Q.list_feedback(test_id)
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.get("/tests/{test_id}/feedback")
def list_feedback_by_test(test_id: str):
    try:
        return Q.list_feedback(test_id)
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.post("/tests/{test_id}/feedback", status_code=201)
def create_feedback(test_id: str, body: M.FeedbackCreate):
    try:
        if not sb.query(f"SELECT id FROM {Q.TABLE_DEV_TESTS} WHERE id = {sql_uuid(test_id)} LIMIT 1"):
            raise HTTPException(404, detail="Prueba no encontrada")
        return Q.create_feedback(test_id, body.model_dump(exclude_none=True))
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.patch("/feedback/{feedback_id}")
def update_feedback(feedback_id: str, body: M.FeedbackUpdate):
    try:
        r = Q.update_feedback(feedback_id, body.model_dump(exclude_none=True))
        if not r:
            raise HTTPException(404, detail="Feedback no encontrado")
        return r[0] if isinstance(r, list) else r
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.delete("/feedback/{feedback_id}")
def delete_feedback(feedback_id: str):
    try:
        Q.delete_feedback(feedback_id)
        return {"deleted": True, "id": feedback_id}
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))
