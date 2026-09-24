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


# === Serve Frontend SPA ===

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
DOCS_DIR = Path(__file__).parent.parent.parent / "docs"

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

    @app.get("/")
    def serve_index():
        return FileResponse(FRONTEND_DIR / "index.html", headers={"Cache-Control": "no-store, must-revalidate"})

    @app.get("/{path:path}")
    def serve_spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404)
        headers = {"Cache-Control": "no-store, must-revalidate"}
        if path.startswith("docs/"):
            doc_candidate = DOCS_DIR / path[5:]
            if doc_candidate.exists() and doc_candidate.is_file():
                return FileResponse(doc_candidate, headers=headers)
        candidate = FRONTEND_DIR / path
        if candidate.exists() and candidate.is_file():
            return FileResponse(candidate, headers=headers)
        return FileResponse(FRONTEND_DIR / "index.html", headers=headers)


if __name__ == "__main__":
    import uvicorn
    log.info(f"Starting admin web on {config.APP_HOST}:{config.APP_PORT}")
    uvicorn.run("main:app", host=config.APP_HOST, port=config.APP_PORT)