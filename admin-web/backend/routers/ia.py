"""
Router de IA: ideas, chat, aplicar metodo, idea cientifica, plating, ware, ficha.
"""
import json as _json

from fastapi import APIRouter, HTTPException

import queries as Q
import supabase_client as sb
import ia_client as _ia
import ia_integration as _ia_int
import context_builder as _cb
import openrouter_client as _or
from config import config
import models as M

router = APIRouter(prefix="/api", tags=["ia"])


@router.get("/ia/status")
def ia_status():
    configured = _ia.is_configured()
    return {
        "configured": configured,
        "model": _ia.MODEL,
        "base_url": _ia.BASE_URL,
        "key_source": "bd" if configured else "ninguna",
    }


@router.get("/ia/metodos")
def ia_metodos():
    return {"metodos": _ia_int.listar_metodos_creativos()}


@router.post("/ia/ideas")
def ia_generar_ideas(body: dict):
    if not _ia_int.is_ia_available():
        raise HTTPException(503, detail="Agente no disponible")
    peticion = body.get("peticion", "")
    n = body.get("n", 10)
    ideas_previas = body.get("ideas_previas")
    if not peticion.strip():
        raise HTTPException(400, detail="peticion es obligatorio")
    try:
        ideas = _ia_int.generar_ideas(peticion, n, ideas_previas)
        return {"ideas": ideas, "count": len(ideas), "modelo": _ia.MODEL}
    except RuntimeError as e:
        raise HTTPException(502, detail=str(e))


@router.post("/ia/aplicar-metodo")
def ia_aplicar_metodo(body: dict):
    if not _ia_int.is_ia_available():
        raise HTTPException(503, detail="Agente no disponible")
    idea = body.get("idea")
    metodo = body.get("metodo")
    peticion_original = body.get("peticion_original", "")
    if not idea or not metodo:
        raise HTTPException(400, detail="idea y metodo requeridos")
    try:
        resultado = _ia_int.aplicar_metodo_a_idea(idea, metodo, peticion_original)
        return {"resultado": resultado, "metodo": metodo}
    except RuntimeError as e:
        raise HTTPException(502, detail=str(e))


@router.post("/ia/idea-cientifica")
def ia_idea_cientifica(body: dict):
    if not _ia_int.is_ia_available():
        raise HTTPException(503, detail="Agente no disponible")
    peticion = body.get("peticion", "")
    if not peticion.strip():
        raise HTTPException(400, detail="peticion es obligatorio")
    try:
        resultado = _ia_int.idea_cientifica(peticion)
        return resultado
    except RuntimeError as e:
        raise HTTPException(502, detail=str(e))


@router.post("/ia/chat")
def ia_chat(body: dict):
    if not _ia_int.is_ia_available():
        raise HTTPException(503, detail="Agente no disponible")
    peticion = body.get("peticion", "")
    contexto = body.get("contexto")
    if not peticion.strip():
        raise HTTPException(400, detail="peticion es obligatorio")
    try:
        respuesta = _ia_int.chat(peticion, contexto)
        return {"respuesta": respuesta}
    except RuntimeError as e:
        raise HTTPException(502, detail=str(e))


@router.post("/ia/ayuda-semanal")
def ia_ayuda_semanal(body: dict):
    if not _ia_int.is_ia_available():
        raise HTTPException(503, detail="Agente no disponible")
    try:
        en_dev = sb.query(
            f"SELECT id, titulo, estado_desarrollo, objetivo FROM {config.TABLE_AGENDAS} "
            f"WHERE estado_desarrollo IS NOT NULL AND estado_desarrollo != 'PRODUCTO' "
            f"ORDER BY migrated_at DESC LIMIT 10"
        )
        ult = sb.query(
            f"SELECT titulo, migrated_at FROM {config.TABLE_CATALOGOS} "
            f"WHERE estado = 'Listo' ORDER BY migrated_at DESC LIMIT 3"
        )
        ideas = sb.query(
            f"SELECT titulo, estado_idea, categorias FROM {config.TABLE_IDEAS} "
            f"ORDER BY migrated_at DESC LIMIT 5"
        )
        ctx = {
            "productos_en_desarrollo": [
                {"titulo": a.get("titulo"), "estado": a.get("estado_desarrollo")}
                for a in en_dev
            ],
            "ultimos_productos_terminados": [
                {"titulo": p.get("titulo")} for p in ult
            ],
            "ideas_recientes": [
                {"titulo": i.get("titulo"), "estado": i.get("estado_idea")}
                for i in ideas
            ],
        }
        peticion = body.get("peticion") or (
            "Tengo estos productos en desarrollo: " + _json.dumps(ctx, ensure_ascii=False) +
            ". Que me recomiendas para cumplir el objetivo semanal de 1 producto terminado?"
        )
        respuesta = _ia_int.chat(peticion, ctx)
        return {"respuesta": respuesta, "contexto_usado": ctx}
    except Exception as e:
        raise HTTPException(502, detail=str(e))


# === PLATING ===

@router.get("/catalogos/{catalogo_id}/plating")
def list_plating(catalogo_id: str, estado: str | None = None):
    try:
        return Q.list_plating(catalogo_id, estado)
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.patch("/plating/{plating_id}")
def update_plating(plating_id: str, body: dict):
    try:
        r = Q.update_plating(plating_id, body)
        if not r:
            raise HTTPException(404)
        return r[0] if isinstance(r, list) else r
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.delete("/plating/{plating_id}")
def delete_plating(plating_id: str):
    try:
        Q.delete_plating(plating_id)
        return {"deleted": True, "id": plating_id}
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))


@router.post("/catalogos/{catalogo_id}/plating/generar")
def generar_plating(catalogo_id: str, body: M.PlatingRegenerate = M.PlatingRegenerate()):
    if not _ia.is_configured():
        raise HTTPException(503, detail="IA no configurada")
    try:
        ctx = _cb.build_plating_context(catalogo_id)
        raw = _ia.call(ctx["system_prompt"], ctx["user_prompt"], 0.8)
        props = _cb.parse_json_strict(raw)
        base = Q.next_plating_orden(catalogo_id)
        saved = []
        for i, p in enumerate(props[:3]):
            saved.append(Q.insert_plating({
                "catalogo_id": catalogo_id, "orden": base + i,
                "nombre": str(p.get("nombre", ""))[:200],
                "descripcion": str(p.get("descripcion", "")),
                "vajilla_sugerida": str(p.get("vajilla_sugerida", "")),
                "razonamiento": str(p.get("razonamiento", "")),
                "contexto_usado": _json.dumps(ctx["contexto"], ensure_ascii=False),
                "modelo_usado": _ia.MODEL, "estado": "GENERADA",
            }))
        return {"generadas": len(saved), "propuestas": saved, "modelo": _ia.MODEL}
    except Exception as e:
        raise HTTPException(502, detail=str(e))


# === WARE ===

@router.get("/catalogos/{catalogo_id}/ware/generar")
def generar_ware(catalogo_id: str, plating_proposal_id: str):
    if not _ia.is_configured():
        raise HTTPException(503, detail="IA no configurada")
    try:
        ctx = _cb.build_ware_context(catalogo_id, plating_proposal_id)
        raw = _ia.call(ctx["system_prompt"], ctx["user_prompt"], 0.7)
        return {"combinaciones_propuestas": _cb.parse_json_strict(raw), "modelo": _ia.MODEL}
    except Exception as e:
        raise HTTPException(502, detail=str(e))


# === FICHA IA + EVALUACION ===

@router.post("/tests/{test_id}/generar-ficha")
def generar_ficha_test(test_id: str):
    if not _or.is_configured():
        raise HTTPException(503, detail="OpenRouter no configurado. Configura API key y prompt en Settings.")
    try:
        return _or.generar_ficha(test_id)
    except RuntimeError as e:
        raise HTTPException(502, detail=str(e))
    except ValueError as e:
        raise HTTPException(404, detail=str(e))


@router.patch("/tests/{test_id}/evaluacion")
def guardar_evaluacion(test_id: str, body: dict):
    try:
        rows = Q.update_test(test_id, {"evaluacion": body})
        if not rows:
            raise HTTPException(404, detail="Prueba no encontrada")
        return rows[0] if isinstance(rows, list) else rows
    except sb.SupabaseError as e:
        raise HTTPException(502, detail=str(e))