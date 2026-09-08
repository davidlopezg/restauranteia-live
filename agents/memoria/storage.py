"""
storage.py — SQLite CRUD layer for the Archivo de Ideas module.

Provides init_db, save_idea, load_ideas, get_idea, edit_idea, delete_idea,
delete_all_ideas, count_ideas, export_ideas, and check_duplicate.

All functions accept an explicit connection parameter (conn) for testability.
Uses WAL mode for concurrent read/write safety in HF Space.
"""

from __future__ import annotations

import difflib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

_DEFAULT_DB_PATH = Path("conocimiento/interno_restaurante/ideas.db")

# ── Schema D2 ──────────────────────────────────────────────────────────────

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS ideas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    idea TEXT NOT NULL,
    categoria TEXT,
    contexto TEXT,
    confirmada_por_usuario INTEGER NOT NULL DEFAULT 1,
    origen TEXT NOT NULL,
    origen_skill TEXT
);
"""

_CREATE_INDEXES_SQL = [
    "CREATE INDEX IF NOT EXISTS idx_ideas_created_at ON ideas(created_at);",
    "CREATE INDEX IF NOT EXISTS idx_ideas_categoria ON ideas(categoria);",
    "CREATE INDEX IF NOT EXISTS idx_ideas_origen_skill ON ideas(origen_skill);",
]

_IDEAS_MD_CONTENT = """# Archivo de Ideas — Schema

Base de datos local SQLite en `conocimiento/interno_restaurante/ideas.db`.

## Tabla `ideas`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | ID autoincremental |
| `created_at` | TEXT (ISO 8601) | Fecha de creación (UTC) |
| `updated_at` | TEXT (ISO 8601) | Fecha de última modificación (UTC, NULL hasta primer edit) |
| `idea` | TEXT | Contenido de la idea (not null) |
| `categoria` | TEXT | Categoría (de `agents/ideas_categorias.json` o libre) |
| `contexto` | TEXT | Contexto adicional (skill + hash) |
| `confirmada_por_usuario` | INTEGER | Siempre 1 en v1 (el comando es el consentimiento) |
| `origen` | TEXT | 'comando' |
| `origen_skill` | TEXT | Skill activa al guardar ('ficha', 'ideas_creativas', 'proceso_creativo') |

## Índices

- `idx_ideas_created_at` ON `ideas(created_at)`
- `idx_ideas_categoria` ON `ideas(categoria)`
- `idx_ideas_origen_skill` ON `ideas(origen_skill)`

## Notas

- WAL mode para concurrencia segura en HF Space.
- v1 asume single-user. Si se expone a público, migrar a `ideas_<user_hash>.db`.
"""


# ── Public API ─────────────────────────────────────────────────────────────


def init_db(db_path: Optional[Path] = None) -> sqlite3.Connection:
    """Initialize or open the ideas database.

    Creates the conocimiento/interno_restaurante/ directory if it doesn't exist.
    Opens a SQLite connection with WAL mode, foreign_keys ON,
    check_same_thread=False, and timeout=5.0.
    Creates the ideas table and indexes if they don't exist.
    Also creates the companion conocimiento/interno_restaurante/ideas.md if missing.

    Args:
        db_path: Path to the SQLite DB file. Defaults to
                 ``conocimiento/interno_restaurante/ideas.db``.

    Returns:
        An open sqlite3.Connection.

    Raises:
        PermissionError: If the parent directory is not writable.
        sqlite3.DatabaseError: If the DB file is corrupt.
    """
    if db_path is None:
        db_path = _DEFAULT_DB_PATH

    db_path = Path(db_path)
    db_dir = db_path.parent

    # Create directory if needed
    try:
        db_dir.mkdir(parents=True, exist_ok=True)
    except PermissionError:
        raise PermissionError(
            f"No tengo permisos para crear {db_dir}/. "
            "Verificá los permisos del directorio."
        )

    # Open connection
    try:
        conn = sqlite3.connect(
            str(db_path),
            check_same_thread=False,
            timeout=5.0,
        )
        conn.row_factory = sqlite3.Row
    except sqlite3.DatabaseError:
        raise sqlite3.DatabaseError(
            "El archivo ideas.db está corrupto. "
            "Exportá el backup manual si existe y borrá el archivo para regenerarlo."
        )

    # PRAGMAs
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")

    # Schema
    conn.execute(_CREATE_TABLE_SQL)
    for idx_sql in _CREATE_INDEXES_SQL:
        conn.execute(idx_sql)
    conn.commit()

    # Companion doc
    _ensure_ideas_md(db_dir)

    return conn


def save_idea(
    conn: sqlite3.Connection,
    idea: str,
    categoria: Optional[str] = None,
    contexto: Optional[str] = None,
    origen: str = "comando",
    origen_skill: Optional[str] = None,
) -> int:
    """Save a new idea to the database.

    Args:
        conn: Open SQLite connection.
        idea: The idea text (must be non-empty).
        categoria: Optional category string.
        contexto: Optional context string.
        origen: Origin identifier (default 'comando').
        origen_skill: Skill that was active when saving.

    Returns:
        The auto-generated row ID of the new idea.

    Raises:
        ValueError: If idea is empty.
        sqlite3.OperationalError: If the DB is locked or unavailable.
    """
    if not idea or not idea.strip():
        raise ValueError("La idea no puede estar vacía")

    now = datetime.now(timezone.utc).isoformat()
    cursor = conn.execute(
        """
        INSERT INTO ideas (created_at, updated_at, idea, categoria, contexto,
                           confirmada_por_usuario, origen, origen_skill)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        """,
        (now, None, idea.strip(), categoria, contexto, origen, origen_skill),
    )
    conn.commit()
    return cursor.lastrowid  # type: ignore[return-value]


def load_ideas(
    conn: sqlite3.Connection,
    filtro: Optional[dict[str, Any]] = None,
) -> list[dict[str, Any]]:
    """Load ideas with optional filtering.

    Args:
        conn: Open SQLite connection.
        filtro: Optional dict with keys:
            - 'categoria' (str): exact match on categoria.
            - 'origen_skill' (str): exact match on origen_skill.
            - 'search' (str): LIKE %search% on idea text.
            - 'limit' (int): maximum number of results.

    Returns:
        List of idea dicts ordered by created_at DESC.
        Empty list if no ideas match.
    """
    conditions: list[str] = []
    params: list[Any] = []

    if filtro:
        if "categoria" in filtro and filtro["categoria"]:
            conditions.append("categoria = ?")
            params.append(filtro["categoria"])
        if "origen_skill" in filtro and filtro["origen_skill"]:
            conditions.append("origen_skill = ?")
            params.append(filtro["origen_skill"])
        if "search" in filtro and filtro["search"]:
            conditions.append("idea LIKE ?")
            params.append(f"%{filtro['search']}%")

    where_clause = ""
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)

    limit_clause = ""
    if filtro and "limit" in filtro and filtro["limit"] is not None:
        limit_clause = "LIMIT ?"
        params.append(int(filtro["limit"]))

    sql = f"SELECT * FROM ideas {where_clause} ORDER BY created_at DESC {limit_clause}"
    cursor = conn.execute(sql, params)
    rows = cursor.fetchall()
    return [_row_to_dict(row) for row in rows]


def get_idea(
    conn: sqlite3.Connection,
    idea_id: int,
) -> Optional[dict[str, Any]]:
    """Get a single idea by its ID.

    Args:
        conn: Open SQLite connection.
        idea_id: The idea ID (must be positive).

    Returns:
        Idea dict if found, None otherwise (also for negative/zero IDs).
    """
    if idea_id <= 0:
        return None
    cursor = conn.execute("SELECT * FROM ideas WHERE id = ?", (idea_id,))
    row = cursor.fetchone()
    return _row_to_dict(row) if row else None


def edit_idea(
    conn: sqlite3.Connection,
    idea_id: int,
    nuevo_texto: str,
    nueva_categoria: Optional[str] = None,
) -> bool:
    """Edit an existing idea's text and optionally its category.

    Updates updated_at to current UTC timestamp.

    Args:
        conn: Open SQLite connection.
        idea_id: The idea ID.
        nuevo_texto: New text (must be non-empty).
        nueva_categoria: New category (optional).

    Returns:
        True if a row was updated, False if ID not found.

    Raises:
        ValueError: If nuevo_texto is empty.
    """
    if not nuevo_texto or not nuevo_texto.strip():
        raise ValueError("La idea no puede estar vacía")

    now = datetime.now(timezone.utc).isoformat()
    if nueva_categoria is not None:
        cursor = conn.execute(
            "UPDATE ideas SET idea = ?, categoria = ?, updated_at = ? WHERE id = ?",
            (nuevo_texto.strip(), nueva_categoria, now, idea_id),
        )
    else:
        cursor = conn.execute(
            "UPDATE ideas SET idea = ?, updated_at = ? WHERE id = ?",
            (nuevo_texto.strip(), now, idea_id),
        )
    conn.commit()
    return cursor.rowcount > 0


def delete_idea(conn: sqlite3.Connection, idea_id: int) -> bool:
    """Delete an idea by its ID.

    Args:
        conn: Open SQLite connection.
        idea_id: The idea ID.

    Returns:
        True if a row was deleted, False if ID not found.
    """
    cursor = conn.execute("DELETE FROM ideas WHERE id = ?", (idea_id,))
    conn.commit()
    return cursor.rowcount > 0


def delete_all_ideas(conn: sqlite3.Connection) -> int:
    """Delete ALL ideas from the database.

    Args:
        conn: Open SQLite connection.

    Returns:
        Number of deleted rows.
    """
    cursor = conn.execute("DELETE FROM ideas")
    conn.commit()
    return cursor.rowcount


def count_ideas(conn: sqlite3.Connection) -> int:
    """Count all ideas in the database.

    Args:
        conn: Open SQLite connection.

    Returns:
        Total number of ideas (0 if empty).
    """
    cursor = conn.execute("SELECT COUNT(*) FROM ideas")
    row = cursor.fetchone()
    return row[0] if row else 0


def export_ideas(
    conn: sqlite3.Connection,
    export_path: Optional[Path] = None,
) -> Path:
    """Export all ideas to a JSON file.

    Args:
        conn: Open SQLite connection.
        export_path: Target file path. Defaults to
                     ``conocimiento/interno_restaurante/ideas_export_<YYYYMMDD-HHMMSS>.json``.

    Returns:
        Path to the created JSON file.

    Raises:
        PermissionError: If the target directory is not writable.
    """
    cursor = conn.execute("SELECT * FROM ideas ORDER BY created_at DESC")
    rows = cursor.fetchall()
    ideas_list = [_row_to_dict(row) for row in rows]

    if export_path is None:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        export_path = Path(f"conocimiento/interno_restaurante/ideas_export_{timestamp}.json")

    export_path = Path(export_path)
    export_dir = export_path.parent

    try:
        export_dir.mkdir(parents=True, exist_ok=True)
    except PermissionError:
        raise PermissionError(
            f"No tengo permisos para escribir en {export_dir}/. "
            "Intentá con otra ubicación o usá stdout."
        )

    try:
        with open(export_path, "w", encoding="utf-8") as f:
            json.dump(ideas_list, f, ensure_ascii=False, indent=2)
    except PermissionError:
        raise PermissionError(
            f"No tengo permisos para escribir en {export_path}. "
            "Intentá con otra ubicación o usá stdout."
        )

    return export_path


def check_duplicate(
    conn: sqlite3.Connection,
    texto: str,
    umbral: float = 0.8,
) -> list[dict[str, Any]]:
    """Check for duplicate ideas (exact + fuzzy).

    Algorithm:
    1. Exact match (case-insensitive COLLATE NOCASE).
    2. If no exact match, load all ideas into memory and compute
       difflib.SequenceMatcher.ratio() >= umbral for each.

    Args:
        conn: Open SQLite connection.
        texto: Text to check for duplicates.
        umbral: Fuzzy match threshold (0.0–1.0). Default 0.8.

    Returns:
        List of duplicate idea dicts (empty if none).
    """
    if not texto or not texto.strip():
        return []

    # 1. Exact match (case-insensitive)
    cursor = conn.execute(
        "SELECT * FROM ideas WHERE idea = ? COLLATE NOCASE",
        (texto.strip(),),
    )
    rows = cursor.fetchall()
    if rows:
        return [_row_to_dict(row) for row in rows]

    # 2. Fuzzy match: load all and compute ratio
    cursor = conn.execute("SELECT * FROM ideas")
    all_rows = cursor.fetchall()
    if not all_rows:
        return []

    texto_norm = texto.strip().lower()
    duplicates: list[dict[str, Any]] = []
    for row in all_rows:
        d = _row_to_dict(row)
        idea_norm = d.get("idea", "").strip().lower()
        if not idea_norm:
            continue
        ratio = difflib.SequenceMatcher(None, texto_norm, idea_norm).ratio()
        if ratio >= umbral:
            duplicates.append(d)

    return duplicates


# ── Internal helpers ───────────────────────────────────────────────────────


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    """Convert a sqlite3.Row to a plain dict."""
    # sqlite3.Row supports dict() only when row_factory is set
    return dict(row) 


def _ensure_ideas_md(db_dir: Path) -> None:
    """Create the companion conocimiento/interno_restaurante/ideas.md if it doesn't exist."""
    ideas_md_path = db_dir / "ideas.md"
    if not ideas_md_path.exists():
        try:
            ideas_md_path.write_text(_IDEAS_MD_CONTENT, encoding="utf-8")
        except PermissionError:
            # Non-fatal: the DB works without the companion doc
            pass
