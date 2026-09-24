"""
Sol de Nit Creativity Admin — API principal (FastAPI).
Arquitectura modular con routers por dominio.
"""
import logging
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

sys.path.insert(0, str(Path(__file__).parent))

from config import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("admin-web")

app = FastAPI(title="Sol de Nit Creativity Admin", version="0.3.0")

# === Middleware ===

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def no_cache_static(request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/static/") or path == "/" or path.endswith(".js") or path.endswith(".css") or path.endswith(".html"):
        response.headers["Cache-Control"] = "no-store, must-revalidate"
    return response


# === Routers ===

from routers.entities import router as entities_router
from routers.desarrollo import router as desarrollo_router
from routers.images import router as images_router
from routers.ia import router as ia_router
from routers.settings import router as settings_router

app.include_router(entities_router)
app.include_router(desarrollo_router)
app.include_router(images_router)
app.include_router(ia_router)
app.include_router(settings_router)


# === Serve Frontend SPA (production) ===
# En uso normal FastAPI sirve el build de Vite desde admin-web-frontend/dist/.
# En desarrollo se usa Vite (http://localhost:5173) por separado; el proxy de
# Vite (/api → :8765) evita CORS. Ver README.md para más detalle.

# Orden de búsqueda del dist del frontend: primero el nuevo (admin-web-frontend/dist),
# luego el legacy (admin-web/frontend) para compatibilidad con deploys viejos.
_CANDIDATE_DIST_DIRS = [
    Path(__file__).parent.parent.parent / "admin-web-frontend" / "dist",
    Path(__file__).parent.parent / "frontend",
]
FRONTEND_DIR = next((d for d in _CANDIDATE_DIST_DIRS if d.exists() and (d / "index.html").exists()), None)

DOCS_DIR = Path(__file__).parent.parent.parent / "docs"

if FRONTEND_DIR:
    # Sirve assets estáticos (JS/CSS/imágenes del build) en la raíz.
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")

    @app.get("/")
    def serve_index():
        return FileResponse(FRONTEND_DIR / "index.html", headers={"Cache-Control": "no-store, must-revalidate"})

    @app.get("/{path:path}")
    def serve_spa(path: str):
        # Las rutas /api/* las manejan los routers; cualquier otro /api/* es 404.
        if path.startswith("api/"):
            raise HTTPException(404)
        # /docs/* → estáticos servidos por el repo (PRODUCT_WORKFLOW.md, diagrams/, etc.)
        if path.startswith("docs/"):
            doc_candidate = DOCS_DIR / path[5:]
            headers = {"Cache-Control": "no-store, must-revalidate"}
            if doc_candidate.exists() and doc_candidate.is_file():
                return FileResponse(doc_candidate, headers=headers)
        # Assets o favicon del bundle.
        headers = {"Cache-Control": "no-store, must-revalidate"}
        candidate = FRONTEND_DIR / path
        if candidate.exists() and candidate.is_file():
            return FileResponse(candidate, headers=headers)
        # SPA fallback: cualquier ruta desconocida devuelve index.html y deja
        # que React Router la resuelva en el cliente.
        return FileResponse(FRONTEND_DIR / "index.html", headers=headers)


if __name__ == "__main__":
    import uvicorn
    if FRONTEND_DIR:
        log.info(f"Frontend servido desde {FRONTEND_DIR}")
        log.info(f"App disponible en http://{config.APP_HOST}:{config.APP_PORT}")
    else:
        log.warning(
            f"No se encontró dist/ del frontend. Modo API-only. "
            f"Esperado en: {[str(d) for d in _CANDIDATE_DIST_DIRS]}. "
            f"Para producción: cd admin-web-frontend && npm run build."
        )
    log.info(f"Starting admin web on {config.APP_HOST}:{config.APP_PORT}")
    uvicorn.run("main:app", host=config.APP_HOST, port=config.APP_PORT)