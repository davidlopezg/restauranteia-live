"""
knowledge_context.py — archivos compartidos entre TODOS los agentes del proyecto.

Estos archivos viven en `conocimiento/interno_restaurante/` y se generan
una sola vez en la fase init. Cualquier agente nuevo los lee al iniciar.

Estructura del conocimiento (ver `conocimiento/README.md`):
- `conocimiento/interno_restaurante/` = conocimiento DINÁMICO del
  restaurante, generado en init, compartido entre todos los agentes
  (perfil, carta, ideas guardadas, sesiones de proceso creativo).
- `conocimiento/interno_app/` = recursos del agente (prompts, APIs,
  conocimiento estático tipo estacionalidad o combinaciones).
- `conocimiento/fuentes_externas/` = documentación externa consultable
  (métodos creativos, manuales, papers).
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path

# Ubicación física: <raíz del proyecto>/conocimiento/interno_restaurante/
PROJECT_ROOT = Path(__file__).resolve().parent.parent
KNOWLEDGE_DIR = PROJECT_ROOT / "conocimiento" / "interno_restaurante"

RESTAURANTE_PATH = KNOWLEDGE_DIR / "restaurante.json"
RESTAURANTE_DOC_PATH = KNOWLEDGE_DIR / "restaurante.md"
CATALOGO_PATH = KNOWLEDGE_DIR / "catalogo_platos.json"
CATALOGO_DOC_PATH = KNOWLEDGE_DIR / "catalogo_platos.md"
BACKUPS_DIR = KNOWLEDGE_DIR / "backups"


def ensure_dir() -> Path:
    """Crea el directorio conocimiento/interno_restaurante/ si no existe. Idempotente."""
    KNOWLEDGE_DIR.mkdir(parents=True, exist_ok=True)
    return KNOWLEDGE_DIR


def restaurante_existe() -> bool:
    return RESTAURANTE_PATH.exists()


def catalogo_existe() -> bool:
    return CATALOGO_PATH.exists()


def bootstrap_necesario() -> bool:
    """True si falta cualquiera de los dos archivos clave."""
    return not (restaurante_existe() and catalogo_existe())


def ensure_initialized() -> bool:
    """
    Si falta el init, lo corre interactivamente.
    Helper para que cada agente lo llame en su entry point.

    Returns:
        True si se ejecutó el init, False si ya estaba listo.
    """
    if bootstrap_necesario():
        from agents.init_phase import fase_init_interactiva
        return fase_init_interactiva()
    return False


def cargar_restaurante() -> dict:
    if not restaurante_existe():
        raise FileNotFoundError(
            f"No existe {RESTAURANTE_PATH}. Corre la fase init primero."
        )
    with RESTAURANTE_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def cargar_catalogo() -> list[dict]:
    if not catalogo_existe():
        raise FileNotFoundError(
            f"No existe {CATALOGO_PATH}. Corre la fase init primero."
        )
    with CATALOGO_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def guardar_restaurante(data: dict, schema_doc: str | None = None) -> Path:
    """Guarda el dict del restaurante como JSON. Opcionalmente, un .md companion."""
    ensure_dir()
    with RESTAURANTE_PATH.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    if schema_doc:
        with RESTAURANTE_DOC_PATH.open("w", encoding="utf-8") as f:
            f.write(schema_doc)
    return RESTAURANTE_PATH


def guardar_catalogo(platos: list[dict], schema_doc: str | None = None) -> Path:
    """Guarda la lista de platos como JSON. Opcionalmente, un .md companion."""
    ensure_dir()
    with CATALOGO_PATH.open("w", encoding="utf-8") as f:
        json.dump(platos, f, ensure_ascii=False, indent=2)
    if schema_doc:
        with CATALOGO_DOC_PATH.open("w", encoding="utf-8") as f:
            f.write(schema_doc)
    return CATALOGO_PATH


def listar_archivos_knowledge() -> list[Path]:
    """Lista todos los archivos en conocimiento/interno_restaurante/ (útil para debug)."""
    if not KNOWLEDGE_DIR.exists():
        return []
    return sorted(KNOWLEDGE_DIR.iterdir())


def resumen_estado() -> str:
    """Devuelve un string con el estado actual del knowledge base."""
    if not KNOWLEDGE_DIR.exists():
        return "conocimiento/interno_restaurante/ no existe aún (no se corrió la fase init)."

    lineas = ["conocimiento/interno_restaurante/:"]
    for path in listar_archivos_knowledge():
        size = path.stat().st_size
        lineas.append(f"  - {path.name} ({size} bytes)")

    if bootstrap_necesario():
        lineas.append("  ⚠️  INIT PENDIENTE (falta restaurante.json o catalogo_platos.json)")
    else:
        lineas.append("  ✓ INIT COMPLETO")

    return "\n".join(lineas)


# ══════════════════════════════════════════════════════════════════════════════
# Helpers para la UI web (init-web)
# Patrón: carga con default + guarda con backup automático
# ══════════════════════════════════════════════════════════════════════════════


def cargar_restaurante_con_default(default: dict | None = None) -> dict:
    """
    Como cargar_restaurante() pero devuelve `default` si el archivo no existe
    (en vez de raise FileNotFoundError). Útil para la UI web.

    Args:
        default: dict a devolver si no existe el archivo. Si None, devuelve {}.

    Returns:
        dict con el restaurante o el default.
    """
    if not restaurante_existe():
        return dict(default) if default else {}
    return cargar_restaurante()


def cargar_catalogo_con_default(default: list | None = None) -> list:
    """
    Como cargar_catalogo() pero devuelve `default` si el archivo no existe.

    Args:
        default: lista a devolver si no existe. Si None, devuelve [].

    Returns:
        lista de platos o el default.
    """
    if not catalogo_existe():
        return list(default) if default else []
    return cargar_catalogo()


_TIMESTAMP_COUNTER = [0]


def _timestamp() -> str:
    """
    Genera un timestamp YYYYMMDD-HHMMSS-NNNN único.
    El sufijo counter garantiza unicidad cuando varios guardados ocurren
    en el mismo segundo (caso típico al cargar y guardar de vuelta).
    """
    _TIMESTAMP_COUNTER[0] += 1
    base = datetime.now().strftime("%Y%m%d-%H%M%S")
    return f"{base}-{_TIMESTAMP_COUNTER[0]:04d}"


def _backup_path(file_path: Path, backups_dir: Path) -> Path:
    """Genera el path de backup para un archivo dado."""
    return backups_dir / f"{file_path.stem}_{_timestamp()}.json"


def guardar_con_backup(
    data: dict,
    schema_doc: str | None = None,
    backup_dir: Path | None = None,
) -> tuple[bool, str]:
    """
    Guarda restaurante.json con backup automático del archivo previo.

    Si el archivo ya existe, copia la versión actual a
    `backup_dir/<stem>_<timestamp>.json` antes de sobrescribir. Si no
    existe, no crea backup (no hay nada que respaldar).

    Args:
        data: dict a guardar.
        schema_doc: texto del schema companion (.md). Si None, no se actualiza.
        backup_dir: directorio donde crear el backup. Default: conocimiento/interno_restaurante/backups/.

    Returns:
        (success: bool, message: str)
            - success=True si guardó OK
            - message describe qué pasó (incluye path del backup si lo hubo)
    """
    if backup_dir is None:
        backup_dir = BACKUPS_DIR

    backup_msg = ""
    try:
        ensure_dir()
        # Si el archivo existe, hacer backup antes de sobrescribir
        if RESTAURANTE_PATH.exists():
            backup_dir.mkdir(parents=True, exist_ok=True)
            dest = _backup_path(RESTAURANTE_PATH, backup_dir)
            shutil.copy2(RESTAURANTE_PATH, dest)
            backup_msg = f" (backup: {dest.name})"

        # Guardar el nuevo
        with RESTAURANTE_PATH.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        if schema_doc is not None:
            with RESTAURANTE_DOC_PATH.open("w", encoding="utf-8") as f:
                f.write(schema_doc)

        return True, f"✅ Guardado{backup_msg}"
    except OSError as e:
        return False, f"❌ Error al guardar: {e}"


def guardar_catalogo_con_backup(
    platos: list[dict],
    schema_doc: str | None = None,
    backup_dir: Path | None = None,
) -> tuple[bool, str]:
    """
    Como guardar_con_backup() pero para el catálogo de platos.

    Returns:
        (success: bool, message: str)
    """
    if backup_dir is None:
        backup_dir = BACKUPS_DIR

    backup_msg = ""
    try:
        ensure_dir()
        if CATALOGO_PATH.exists():
            backup_dir.mkdir(parents=True, exist_ok=True)
            dest = _backup_path(CATALOGO_PATH, backup_dir)
            shutil.copy2(CATALOGO_PATH, dest)
            backup_msg = f" (backup: {dest.name})"

        with CATALOGO_PATH.open("w", encoding="utf-8") as f:
            json.dump(platos, f, ensure_ascii=False, indent=2)
        if schema_doc is not None:
            with CATALOGO_DOC_PATH.open("w", encoding="utf-8") as f:
                f.write(schema_doc)

        return True, f"✅ Guardado{backup_msg}"
    except OSError as e:
        return False, f"❌ Error al guardar: {e}"


def leer_con_backup_dir(backup_dir: Path | None = None) -> list[Path]:
    """
    Lista todos los backups existentes, ordenados por mtime descendente.

    Args:
        backup_dir: directorio de backups. Default: conocimiento/interno_restaurante/backups/.

    Returns:
        Lista de Path a archivos de backup. Vacía si el dir no existe.
    """
    if backup_dir is None:
        backup_dir = BACKUPS_DIR
    if not backup_dir.exists():
        return []
    return sorted(
        backup_dir.glob("*.json"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
