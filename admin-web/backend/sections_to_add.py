# === AGENDAS ===
from pydantic import BaseModel as _BM
class _A(_BM): titulo: str|None=None; fecha_creacion: str|None=None; fecha: str|None=None; etiquetas: list|None=None
class _AU(_BM): titulo: str|None=None; fecha_creacion: str|None=None; fecha: str|None=None; etiquetas: list|None=None; estado_desarrollo: str|None=None; objetivo: str|None=None; receta_final: dict|None=None; timeline: list|None=None

@app.get("/api/agendas")
def ga(search: str|None=None, etiqueta: str|None=None, cursor: str|None=None, limit: int=Query(30, ge=1, le=200), order: str="fecha", ascending: bool=False):
    try: return Q.list_agendas(search, etiqueta, cursor, limit, order, ascending)
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))
@app.get("/api/agendas/{agenda_id}")
def ga_id(agenda_id: str):
    try:
        d = Q.detail_agenda(agenda_id)
        if not d: raise HTTPException(404, detail="Agenda no encontrada")
        return d
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))

# === CATALOGOS ===
class _C(_BM): titulo: str; orden: int|None=None; precio: float|None=None; anio: str|None=None; estado: str|None=None; categorias: list|None=None; seleccionada: bool|None=None; ingredientes: str|None=None
class _CU(_BM): titulo: str|None=None; orden: int|None=None; precio: float|None=None; anio: str|None=None; estado: str|None=None; categorias: list|None=None; seleccionada: bool|None=None; ingredientes: str|None=None; receta_estructurada: dict|None=None

@app.get("/api/catalogos")
def gc(search: str|None=None, categoria: str|None=None, estado: str|None=None, cursor: str|None=None, limit: int=Query(30, ge=1, le=200), order: str="orden", ascending: bool=True):
    try: return Q.list_catalogos(search, categoria, estado, cursor, limit, order, ascending)
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))
@app.get("/api/catalogos/{catalogo_id}")
def gc_id(catalogo_id: str):
    try:
        d = Q.detail_catalogo(catalogo_id)
        if not d: raise HTTPException(404, detail="Catalogo no encontrado")
        return d
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))

# === RELACIONES N:M ===
_REL = {"idea_agenda": config.TABLE_IDEA_AGENDA, "idea_catalogo": config.TABLE_IDEA_CATALOGO, "agenda_catalogo": config.TABLE_AGENDA_CATALOGO}
class _RL(_BM): a_id: str; b_id: str

@app.post("/api/relations/{rel}")
def pr(rel: str, body: _RL):
    if rel not in _REL: raise HTTPException(400, detail="Relacion invalida")
    try: sql_uuid(body.a_id); sql_uuid(body.b_id)
    except ValueError as e: raise HTTPException(400, detail=str(e))
    try: return {"created": True, "row": Q.add_relation(_REL[rel], body.a_id, body.b_id)[0] if Q.add_relation(_REL[rel], body.a_id, body.b_id) else None}
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))
@app.delete("/api/relations/{rel}")
def dr(rel: str, a_id: str = Query(...), b_id: str = Query(...)):
    if rel not in _REL: raise HTTPException(400, detail="Relacion invalida")
    try: sql_uuid(a_id); sql_uuid(b_id)
    except ValueError as e: raise HTTPException(400, detail=str(e))
    try: return Q.remove_relation(_REL[rel], a_id, b_id)
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))

# === FILTROS ===
@app.get("/api/filters/{entidad}")
def gf(entidad: str):
    if entidad not in ("ideas","agendas","catalogos"): raise HTTPException(400)
    try: return {"categorias": Q.distinct_categorias(entidad), "estados": Q.distinct_estados(entidad)}
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))

# === DESARROLLO ===
@app.get("/api/desarrollo/pipeline")
def gpl():
    try: return Q.pipeline_por_estado()
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))
@app.get("/api/desarrollo/estados")
def ges(): return {"estados": Q.ESTADOS_DESARROLLO, "transiciones": Q.TRANSICIONES}
@app.get("/api/pendientes")
def gpen():
    try: return Q.pendientes()
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))
@app.patch("/api/agendas/{agenda_id}/estado")
def pst(agenda_id: str, body: dict):
    n = body.get("estado_desarrollo"); d = body.get("descripcion","")
    if not n: raise HTTPException(400, detail="estado_desarrollo requerido")
    try:
        r = Q.cambiar_estado_desarrollo(agenda_id, n, d)
        if not r: raise HTTPException(404)
        return r
    except ValueError as e: raise HTTPException(400, detail=str(e))
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))
@app.post("/api/agendas/{agenda_id}/evento")
def pev(agenda_id: str, body: dict):
    t = body.get("tipo"); d = body.get("descripcion",""); e = body.get("extra")
    if not t: raise HTTPException(400, detail="tipo requerido")
    try:
        r = Q.append_event(agenda_id, t, d, e)
        if not r: raise HTTPException(404)
        return r
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))

# === IMAGES ===
@app.get("/api/images/signed")
def gis(bucket: str, path: str, ttl: int|None=None):
    try: return {"url": sb.signed_url(bucket, path, ttl)}
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))

# === TESTS ===
class _TC(_BM): fecha: str|None=None; estado: str="PENDIENTE"; objetivo: str|None=None; receta_utilizada: str|None=None; modificaciones: str|None=None; resultado: str|None=None; observaciones: str|None=None
class _TU(_BM): fecha: str|None=None; estado: str|None=None; objetivo: str|None=None; receta_utilizada: str|None=None; modificaciones: str|None=None; resultado: str|None=None; observaciones: str|None=None

@app.get("/api/agendas/{agenda_id}/tests")
def gt(agenda_id: str, estado: str|None=None):
    try: return Q.list_tests(agenda_id, estado)
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))
@app.post("/api/agendas/{agenda_id}/tests", status_code=201)
def ptest(agenda_id: str, body: _TC):
    try:
        if not sb.query(f"SELECT id FROM {config.TABLE_AGENDAS} WHERE id = {sql_uuid(agenda_id)} LIMIT 1"): raise HTTPException(404)
        return Q.create_test(agenda_id, body.model_dump(exclude_none=True))
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))
@app.patch("/api/tests/{test_id}")
def pt_id(test_id: str, body: _TU):
    try:
        r = Q.update_test(test_id, body.model_dump(exclude_none=True))
        if not r: raise HTTPException(404, detail="Prueba no encontrada")
        return r[0]
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))
@app.delete("/api/tests/{test_id}")
def dlt(test_id: str):
    try: Q.delete_test(test_id); return {"deleted": True, "id": test_id}
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))
@app.get("/api/agendas/{agenda_id}/tests/count")
def gtc(agenda_id: str, estado: str|None=None):
    try: return {"count": Q.count_tests_by_agenda(agenda_id, estado)}
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))

# === FEEDBACK ===
class _FC(_BM): mesa: str; num_personas: int|None=None; valoracion: int|None=None; criterio: str|None=None; observacion: str|None=None; fecha: str|None=None
class _FU(_BM): mesa: str|None=None; num_personas: int|None=None; valoracion: int|None=None; criterio: str|None=None; observacion: str|None=None; fecha: str|None=None

@app.get("/api/feedback")
def gfb(test_id: str|None=None):
    try: return Q.list_feedback(test_id)
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))
@app.get("/api/tests/{test_id}/feedback")
def gfb_t(test_id: str):
    try: return Q.list_feedback(test_id)
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))
@app.post("/api/tests/{test_id}/feedback", status_code=201)
def pfb(test_id: str, body: _FC):
    try:
        if not sb.query(f"SELECT id FROM {Q.TABLE_DEV_TESTS} WHERE id = {sql_uuid(test_id)} LIMIT 1"): raise HTTPException(404)
        return Q.create_feedback(test_id, body.model_dump(exclude_none=True))
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))
@app.patch("/api/feedback/{feedback_id}")
def pfb_id(feedback_id: str, body: _FU):
    try:
        r = Q.update_feedback(feedback_id, body.model_dump(exclude_none=True))
        if not r: raise HTTPException(404, detail="Feedback no encontrado")
        return r[0]
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))
@app.delete("/api/feedback/{feedback_id}")
def dfb(feedback_id: str):
    try: Q.delete_feedback(feedback_id); return {"deleted": True, "id": feedback_id}
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))

# === IA ===
import ia_client as _ia, context_builder as _cb, json as _json
class _PR(_BM): regenerate: bool = False
class _WR(_BM): plating_proposal_id: str

@app.get("/api/catalogos/{catalogo_id}/plating")
def gpll(catalogo_id: str, estado: str|None=None):
    try: return Q.list_plating(catalogo_id, estado)
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))
@app.patch("/api/plating/{plating_id}")
def ppla(plating_id: str, body: dict):
    try:
        r = Q.update_plating(plating_id, body)
        if not r: raise HTTPException(404)
        return r[0]
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))
@app.delete("/api/plating/{plating_id}")
def dpla(plating_id: str):
    try: Q.delete_plating(plating_id); return {"deleted": True, "id": plating_id}
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))
@app.post("/api/catalogos/{catalogo_id}/plating/generar")
def gplg(catalogo_id: str, body: _PR = _PR()):
    if not _ia.is_configured(): raise HTTPException(503, detail="IA no configurada")
    try:
        ctx = _cb.build_plating_context(catalogo_id)
        raw = _ia.call(ctx["system_prompt"], ctx["user_prompt"], 0.8)
        props = _cb.parse_json_strict(raw)
        base = Q.next_plating_orden(catalogo_id)
        saved = []
        for i, p in enumerate(props[:3]):
            saved.append(Q.insert_plating({"catalogo_id": catalogo_id, "orden": base+i, "nombre": str(p.get("nombre",""))[:200],
                "descripcion": str(p.get("descripcion","")), "vajilla_sugerida": str(p.get("vajilla_sugerida","")),
                "razonamiento": str(p.get("razonamiento","")), "contexto_usado": _json.dumps(ctx["contexto"], ensure_ascii=False),
                "modelo_usado": _ia.MODEL, "estado": "GENERADA"}))
        return {"generadas": len(saved), "propuestas": saved, "modelo": _ia.MODEL}
    except Exception as e: raise HTTPException(502, detail=str(e))

# === IDEA -> CONCEPTO ===
@app.post("/api/ideas/{idea_id}/convertir")
def conv(idea_id: str):
    try:
        idea = sb.query(f"SELECT * FROM {config.TABLE_IDEAS} WHERE id = {sql_uuid(idea_id)} LIMIT 1")
        if not idea: raise HTTPException(404, detail="Idea no encontrada")
        idea = idea[0]
        ex = sb.query(f"SELECT a.id, a.titulo FROM {config.TABLE_AGENDAS} a JOIN {config.TABLE_IDEA_AGENDA} ia ON ia.agenda_id=a.id WHERE ia.idea_id={sql_uuid(idea_id)} LIMIT 1")
        if ex: return {"already_exists": True, "agenda_id": ex[0]["id"], "agenda_titulo": ex[0]["titulo"]}
        ag = Q.create_agenda({"titulo": idea.get("titulo","Concepto sin titulo")})
        if idea.get("descripcion"): Q.update_agenda(ag["id"], {"objetivo": idea["descripcion"]})
        Q.add_relation(config.TABLE_IDEA_AGENDA, idea_id, ag["id"])
        Q.cambiar_estado_desarrollo(ag["id"], "CONCEPTO", f"Convertida desde idea: {idea.get('titulo','')}")
        return {"already_exists": False, "agenda_id": ag["id"], "agenda_titulo": ag.get("titulo")}
    except sb.SupabaseError as e: raise HTTPException(502, detail=str(e))