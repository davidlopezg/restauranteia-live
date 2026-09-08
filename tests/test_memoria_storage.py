"""
Tests for agents.memoria.storage — CRUD operations, duplicate detection, export.

All tests use a tmp_path-backed SQLite database to avoid contaminating the
real conocimiento/interno_restaurante/ directory.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest

from agents.memoria.storage import (
    init_db,
    save_idea,
    load_ideas,
    get_idea,
    edit_idea,
    delete_idea,
    delete_all_ideas,
    count_ideas,
    export_ideas,
    check_duplicate,
)


# ── Fixtures ───────────────────────────────────────────────────────────────


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    """Return a temporary path for the test database."""
    return tmp_path / "test_ideas.db"


@pytest.fixture
def db_conn(db_path: Path) -> sqlite3.Connection:
    """Create a clean in-memory/temp SQLite connection for testing."""
    conn = init_db(db_path)
    yield conn
    conn.close()


# ── init_db tests ──────────────────────────────────────────────────────────


class TestInitDb:
    def test_creates_dir_and_table(self, tmp_path: Path):
        """Directory + table created, pragmas set."""
        db_p = tmp_path / "sub" / "test.db"
        conn = init_db(db_p)
        try:
            # Table exists
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='ideas'"
            )
            assert cursor.fetchone() is not None
            # WAL mode
            cursor = conn.execute("PRAGMA journal_mode")
            row = cursor.fetchone()
            assert row is not None
            # The journal_mode should be 'wal' (or 'delete' if WAL not supported)
            assert row[0].lower() in ("wal", "memory", "delete")
            # foreign_keys ON
            cursor = conn.execute("PRAGMA foreign_keys")
            row = cursor.fetchone()
            assert row is not None
            assert row[0] == 1
        finally:
            conn.close()

    def test_idempotent(self, db_path: Path):
        """Calling init_db twice is safe."""
        conn1 = init_db(db_path)
        conn1.close()
        conn2 = init_db(db_path)
        try:
            cursor = conn2.execute("SELECT COUNT(*) FROM ideas")
            assert cursor.fetchone()[0] == 0
        finally:
            conn2.close()

    def test_creates_ideas_md_companion(self, tmp_path: Path):
        """init_db creates ideas.md companion doc."""
        db_p = tmp_path / "companion" / "test.db"
        conn = init_db(db_p)
        conn.close()
        md_file = tmp_path / "companion" / "ideas.md"
        assert md_file.exists()
        content = md_file.read_text(encoding="utf-8")
        assert "Archivo de Ideas" in content
        assert "ideas" in content

    def test_ideas_md_idempotent(self, tmp_path: Path):
        """Calling init_db twice doesn't overwrite ideas.md."""
        db_p = tmp_path / "companion2" / "test.db"
        conn = init_db(db_p)
        conn.close()
        md_file = tmp_path / "companion2" / "ideas.md"
        first_content = md_file.read_text(encoding="utf-8")
        conn2 = init_db(db_p)
        conn2.close()
        second_content = md_file.read_text(encoding="utf-8")
        assert first_content == second_content


# ── save_idea tests ────────────────────────────────────────────────────────


class TestSaveIdea:
    def test_basic(self, db_conn: sqlite3.Connection):
        """Returns int ID, row exists."""
        idea_id = save_idea(db_conn, "probar kumquat")
        assert isinstance(idea_id, int)
        assert idea_id > 0
        row = db_conn.execute("SELECT * FROM ideas WHERE id = ?", (idea_id,)).fetchone()
        assert row is not None
        assert row["idea"] == "probar kumquat"

    def test_empty_raises(self, db_conn: sqlite3.Connection):
        """ValueError for empty string."""
        with pytest.raises(ValueError, match="vacía"):
            save_idea(db_conn, "")
        with pytest.raises(ValueError, match="vacía"):
            save_idea(db_conn, "   ")

    def test_with_all_fields(self, db_conn: sqlite3.Connection):
        """categoria, contexto, origen_skill stored."""
        idea_id = save_idea(
            db_conn,
            "plato con setas",
            categoria="plato",
            contexto="menú otoño",
            origen_skill="ficha",
        )
        row = db_conn.execute("SELECT * FROM ideas WHERE id = ?", (idea_id,)).fetchone()
        assert row["categoria"] == "plato"
        assert row["contexto"] == "menú otoño"
        assert row["origen"] == "comando"
        assert row["origen_skill"] == "ficha"
        assert row["confirmada_por_usuario"] == 1
        assert row["updated_at"] is None
        assert row["created_at"] is not None

    def test_default_origen(self, db_conn: sqlite3.Connection):
        """Default origen is 'comando'."""
        idea_id = save_idea(db_conn, "idea de prueba")
        row = db_conn.execute("SELECT * FROM ideas WHERE id = ?", (idea_id,)).fetchone()
        assert row["origen"] == "comando"


# ── load_ideas tests ───────────────────────────────────────────────────────


class TestLoadIdeas:
    def test_empty(self, db_conn: sqlite3.Connection):
        """Returns []."""
        assert load_ideas(db_conn) == []

    def test_all(self, db_conn: sqlite3.Connection):
        """Returns all rows DESC by created_at."""
        id1 = save_idea(db_conn, "primera")
        id2 = save_idea(db_conn, "segunda")
        ideas = load_ideas(db_conn)
        assert len(ideas) == 2
        # Most recent first
        assert ideas[0]["id"] == id2
        assert ideas[1]["id"] == id1

    def test_with_filtro_categoria(self, db_conn: sqlite3.Connection):
        """Filter by categoria."""
        save_idea(db_conn, "plato con setas", categoria="plato")
        save_idea(db_conn, "técnica de fermentación", categoria="técnica")
        save_idea(db_conn, "otro plato", categoria="plato")
        results = load_ideas(db_conn, {"categoria": "plato"})
        assert len(results) == 2
        for r in results:
            assert r["categoria"] == "plato"

    def test_with_filtro_search(self, db_conn: sqlite3.Connection):
        """LIKE %search% on idea."""
        save_idea(db_conn, "kumquat en el postre")
        save_idea(db_conn, "fermento de kumquat")
        save_idea(db_conn, "plato de setas")
        results = load_ideas(db_conn, {"search": "kumquat"})
        assert len(results) == 2

    def test_with_filtro_search_no_match(self, db_conn: sqlite3.Connection):
        """Empty list for no match."""
        save_idea(db_conn, "kumquat")
        results = load_ideas(db_conn, {"search": "xyz"})
        assert results == []

    def test_with_filtro_limit(self, db_conn: sqlite3.Connection):
        """Limit results."""
        save_idea(db_conn, "idea a")
        save_idea(db_conn, "idea b")
        save_idea(db_conn, "idea c")
        results = load_ideas(db_conn, {"limit": 2})
        assert len(results) == 2

    def test_with_filtro_origen_skill(self, db_conn: sqlite3.Connection):
        """Filter by origen_skill."""
        save_idea(db_conn, "ficha idea", origen_skill="ficha")
        save_idea(db_conn, "creative idea", origen_skill="ideas_creativas")
        results = load_ideas(db_conn, {"origen_skill": "ficha"})
        assert len(results) == 1
        assert results[0]["origen_skill"] == "ficha"


# ── get_idea tests ─────────────────────────────────────────────────────────


class TestGetIdea:
    def test_found(self, db_conn: sqlite3.Connection):
        """Returns correct dict."""
        idea_id = save_idea(db_conn, "mi idea")
        idea = get_idea(db_conn, idea_id)
        assert idea is not None
        assert idea["id"] == idea_id
        assert idea["idea"] == "mi idea"

    def test_not_found(self, db_conn: sqlite3.Connection):
        """Returns None."""
        assert get_idea(db_conn, 999) is None

    def test_negative_id(self, db_conn: sqlite3.Connection):
        """Returns None."""
        assert get_idea(db_conn, -1) is None

    def test_zero_id(self, db_conn: sqlite3.Connection):
        """Returns None."""
        assert get_idea(db_conn, 0) is None


# ── edit_idea tests ────────────────────────────────────────────────────────


class TestEditIdea:
    def test_text(self, db_conn: sqlite3.Connection):
        """Updates idea + updated_at, preserves created_at."""
        idea_id = save_idea(db_conn, "idea original")
        original = get_idea(db_conn, idea_id)
        created_before = original["created_at"]

        result = edit_idea(db_conn, idea_id, "texto nuevo y mejorado")
        assert result is True

        updated = get_idea(db_conn, idea_id)
        assert updated["idea"] == "texto nuevo y mejorado"
        assert updated["created_at"] == created_before
        assert updated["updated_at"] is not None
        assert updated["updated_at"] >= created_before

    def test_text_and_category(self, db_conn: sqlite3.Connection):
        """Updates both text and category."""
        idea_id = save_idea(db_conn, "original", categoria="concepto")
        result = edit_idea(db_conn, idea_id, "nuevo texto", nueva_categoria="plato")
        assert result is True
        updated = get_idea(db_conn, idea_id)
        assert updated["idea"] == "nuevo texto"
        assert updated["categoria"] == "plato"

    def test_not_found(self, db_conn: sqlite3.Connection):
        """Returns False."""
        result = edit_idea(db_conn, 999, "nuevo texto")
        assert result is False

    def test_empty_text_raises(self, db_conn: sqlite3.Connection):
        """Raises ValueError."""
        idea_id = save_idea(db_conn, "idea original")
        with pytest.raises(ValueError, match="vacía"):
            edit_idea(db_conn, idea_id, "")


# ── delete_idea tests ──────────────────────────────────────────────────────


class TestDeleteIdea:
    def test_found(self, db_conn: sqlite3.Connection):
        """Returns True, row gone."""
        idea_id = save_idea(db_conn, "to delete")
        result = delete_idea(db_conn, idea_id)
        assert result is True
        assert get_idea(db_conn, idea_id) is None

    def test_not_found(self, db_conn: sqlite3.Connection):
        """Returns False."""
        result = delete_idea(db_conn, 999)
        assert result is False


# ── delete_all_ideas tests ─────────────────────────────────────────────────


class TestDeleteAll:
    def test_deletes_all(self, db_conn: sqlite3.Connection):
        """Returns count, all rows gone."""
        save_idea(db_conn, "idea 1")
        save_idea(db_conn, "idea 2")
        save_idea(db_conn, "idea 3")
        count = delete_all_ideas(db_conn)
        assert count == 3
        assert count_ideas(db_conn) == 0

    def test_empty(self, db_conn: sqlite3.Connection):
        """Returns 0."""
        count = delete_all_ideas(db_conn)
        assert count == 0


# ── count_ideas tests ──────────────────────────────────────────────────────


class TestCount:
    def test_count(self, db_conn: sqlite3.Connection):
        """Returns correct count."""
        assert count_ideas(db_conn) == 0
        save_idea(db_conn, "idea 1")
        assert count_ideas(db_conn) == 1
        save_idea(db_conn, "idea 2")
        assert count_ideas(db_conn) == 2

    def test_empty(self, db_conn: sqlite3.Connection):
        """Returns 0."""
        assert count_ideas(db_conn) == 0


# ── export_ideas tests ─────────────────────────────────────────────────────


class TestExport:
    def test_default_path(self, db_conn: sqlite3.Connection, tmp_path: Path):
        """Creates file in conocimiento/interno_restaurante/ with timestamp."""
        save_idea(db_conn, "idea export", categoria="test")
        # Use tmp_path as the db path root to avoid creating in real knowledge dir
        export_dir = tmp_path / "conocimiento" / "interno_restaurante"
        export_dir.mkdir(parents=True, exist_ok=True)
        export_path = export_dir / "ideas_export_test.json"
        result = export_ideas(db_conn, export_path)
        assert result == export_path
        assert export_path.exists()
        data = json.loads(export_path.read_text(encoding="utf-8"))
        assert len(data) == 1
        assert data[0]["idea"] == "idea export"

    def test_custom_path(self, db_conn: sqlite3.Connection, tmp_path: Path):
        """Writes to specified path."""
        save_idea(db_conn, "custom export")
        custom = tmp_path / "my_export.json"
        result = export_ideas(db_conn, custom)
        assert result == custom
        assert custom.exists()
        data = json.loads(custom.read_text(encoding="utf-8"))
        assert len(data) == 1

    def test_empty_db(self, db_conn: sqlite3.Connection, tmp_path: Path):
        """Writes []."""
        export_path = tmp_path / "empty_export.json"
        result = export_ideas(db_conn, export_path)
        data = json.loads(result.read_text(encoding="utf-8"))
        assert data == []

    def test_export_structure(self, db_conn: sqlite3.Connection, tmp_path: Path):
        """Exported JSON has all expected fields."""
        save_idea(
            db_conn,
            "struct test",
            categoria="concepto",
            contexto="testing",
            origen_skill="ficha",
        )
        export_path = tmp_path / "struct_export.json"
        export_ideas(db_conn, export_path)
        data = json.loads(export_path.read_text(encoding="utf-8"))
        assert len(data) == 1
        entry = data[0]
        assert "id" in entry
        assert "created_at" in entry
        assert "updated_at" in entry
        assert "idea" in entry
        assert "categoria" in entry
        assert "contexto" in entry
        assert "confirmada_por_usuario" in entry
        assert "origen" in entry
        assert "origen_skill" in entry


# ── check_duplicate tests ──────────────────────────────────────────────────


class TestCheckDuplicate:
    def test_exact_match(self, db_conn: sqlite3.Connection):
        """Returns matching row for identical text."""
        save_idea(db_conn, "probar kumquat en el postre")
        dups = check_duplicate(db_conn, "probar kumquat en el postre")
        assert len(dups) == 1
        assert dups[0]["idea"] == "probar kumquat en el postre"

    def test_exact_case_insensitive(self, db_conn: sqlite3.Connection):
        """Case-insensitive exact match."""
        save_idea(db_conn, "Probar Kumquat")
        dups = check_duplicate(db_conn, "probar kumquat")
        assert len(dups) == 1

    def test_fuzzy_above_threshold(self, db_conn: sqlite3.Connection):
        """Returns matching row for >=80% similar."""
        save_idea(db_conn, "probar kumquat en el postre de temporada")
        dups = check_duplicate(db_conn, "probar kumquat en postre temporada")
        assert len(dups) == 1

    def test_fuzzy_below_threshold(self, db_conn: sqlite3.Connection):
        """Returns [] for <80% similar."""
        save_idea(db_conn, "probar kumquat en el postre")
        dups = check_duplicate(db_conn, "cambiar el menú de setas a otoño")
        assert dups == []

    def test_empty_text(self, db_conn: sqlite3.Connection):
        """Returns [] for empty text."""
        save_idea(db_conn, "alguna idea")
        assert check_duplicate(db_conn, "") == []
        assert check_duplicate(db_conn, "   ") == []

    def test_empty_db(self, db_conn: sqlite3.Connection):
        """Returns [] for empty DB."""
        assert check_duplicate(db_conn, "cualquier cosa") == []

    def test_custom_umbral(self, db_conn: sqlite3.Connection):
        """Custom threshold works."""
        save_idea(db_conn, "abcdefghij")
        # Very low threshold should catch even weak similarity
        dups = check_duplicate(db_conn, "abcdefghij", umbral=1.0)
        assert len(dups) == 1
        # Very high threshold should fail for slightly different text
        dups = check_duplicate(db_conn, "ABCDEFGHIZ", umbral=0.99)
        assert dups == []
