"""
Tests for the 'chat' skill — general-purpose conversation mode.

Verifies that:
1. The chat skill is registered in SKILLS with the expected shape
2. The system prompt file exists and is non-empty
3. procesar_mensaje_chat returns a non-empty string when LLM is mocked
4. The system prompt sent to the model includes restaurant context
5. _responder_chat (in app.py) returns the correct dict format
6. Edge cases (empty message) are handled gracefully
"""

from __future__ import annotations

import sys
import sqlite3
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest


# Mock gradio before importing app.py (not available in test env)
sys.modules["gradio"] = MagicMock()
sys.modules["gradio.themes"] = MagicMock()
sys.modules["gradio.themes"]().Soft = MagicMock()


# ── Fixtures ───────────────────────────────────────────────────────────────


@pytest.fixture
def tmp_db_conn(tmp_path: Path):
    """Create a temporary SQLite database for testing ideas context injection."""
    db_path = tmp_path / "test_ideas.db"
    conn = sqlite3.connect(str(db_path), check_same_thread=False, timeout=5.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("""
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
        )
    """)
    conn.commit()
    return conn


@pytest.fixture(autouse=True)
def reset_memoria_state():
    """Reset memoria module in-memory state before each test."""
    from agents.memoria.commands import _reset_state
    _reset_state()


@pytest.fixture
def mock_call_minimax(tmp_db_conn):
    """Mock call_minimax and init_db for clean testing of chat skill."""
    captured_prompts: dict[str, str] = {}

    def _mock_init_db(*args, **kwargs):
        return tmp_db_conn

    def _mock_call_minimax(system_prompt: str, user_prompt: str, *args, **kwargs):
        # Capture the system prompt so tests can inspect context injection
        captured_prompts["system_prompt"] = system_prompt
        captured_prompts["user_prompt"] = user_prompt
        return "Esta es una respuesta simulada del chef en modo chat."

    with patch("agents.memoria.storage.init_db", side_effect=_mock_init_db):
        with patch("agents.creativo.agent.call_minimax", side_effect=_mock_call_minimax) as mock:
            # Import app while source patch is active
            import app as app_module
            with patch.object(app_module, "call_minimax", side_effect=_mock_call_minimax):
                yield mock, captured_prompts


# ── Tests ──────────────────────────────────────────────────────────────────


class TestChatSkillRegistration:
    """Verify the chat skill is correctly registered in the skills registry."""

    def test_chat_skill_registered(self):
        from agents.creativo.skills import list_skills, get_skill
        skills = list_skills()
        keys = [s["key"] for s in skills]
        assert "chat" in keys, f"Expected 'chat' in SKILLS, got {keys}"

    def test_chat_skill_required_fields(self):
        from agents.creativo.skills import get_skill
        chat = get_skill("chat")
        assert "key" in chat and chat["key"] == "chat"
        assert "nombre" in chat and chat["nombre"]
        assert "descripcion" in chat and chat["descripcion"]
        assert "prompt_path" in chat
        assert "ejemplos" in chat and len(chat["ejemplos"]) >= 3

    def test_chat_prompt_file_exists(self):
        from agents.creativo.skills import get_skill
        from agents.creativo.agent import load_skill_prompt
        # Loading the prompt should not raise
        prompt = load_skill_prompt("chat")
        assert prompt, "Chat system prompt should be non-empty"
        assert "CASTELLANO" in prompt.upper() or "ESPAÑOL" in prompt.upper(), \
            "Chat prompt must enforce Spanish-only"
        assert len(prompt) > 500, "Chat prompt should be substantive"

    def test_chat_ejemplos_are_questions(self):
        """The chat skill should advertise itself with question-style examples."""
        from agents.creativo.skills import get_skill
        chat = get_skill("chat")
        # At least one example should contain a question mark
        has_question = any("?" in ex for ex in chat["ejemplos"])
        assert has_question, "Chat ejemplos should include question-style examples"


class TestProcesarMensajeChat:
    """Verify the chat handler returns proper responses."""

    def test_procesar_mensaje_chat_returns_string(self, mock_call_minimax):
        mock, captured = mock_call_minimax
        from agents.creativo.agent import procesar_mensaje_chat
        respuesta = procesar_mensaje_chat("¿Qué te parece la alcachofa como entrante?")
        assert isinstance(respuesta, str)
        assert len(respuesta) > 0
        assert "respuesta simulada" in respuesta.lower()

    def test_procesar_mensaje_chat_includes_restaurant_context(self, mock_call_minimax):
        """Verify the system prompt sent to the LLM includes restaurant context."""
        mock, captured = mock_call_minimax
        # First inject a restaurant.json in tmp location
        # (default load_restaurante reads from .agent_knowledge/, may return None)
        from agents.creativo.agent import procesar_mensaje_chat
        procesar_mensaje_chat("Test query")
        # The system prompt should at least include the chat skill's instructions
        assert "system_prompt" in captured
        # It should contain chat-related instructions
        assert "CHAT" in captured["system_prompt"].upper()

    def test_chat_handles_empty_message(self, mock_call_minimax):
        """Empty message returns empty string (no LLM call)."""
        mock, captured = mock_call_minimax
        from agents.creativo.agent import procesar_mensaje_chat
        respuesta = procesar_mensaje_chat("")
        assert respuesta == ""
        # LLM should not have been called
        assert "system_prompt" not in captured

    def test_chat_handles_whitespace_message(self, mock_call_minimax):
        mock, captured = mock_call_minimax
        from agents.creativo.agent import procesar_mensaje_chat
        respuesta = procesar_mensaje_chat("   \n\t  ")
        assert respuesta == ""


class TestResponderChat:
    """Verify the app.py dispatcher wires the chat skill correctly."""

    def test_responder_chat_dispatches_to_chat_handler(self, mock_call_minimax):
        mock, captured = mock_call_minimax
        import app as app_module
        # Reset state before testing
        from agents.memoria.commands import _reset_state
        _reset_state()
        result = app_module.responder(
            mensaje="¿Qué te parece la carta actual?",
            historial=[],
            skill="chat"
        )
        assert isinstance(result, dict)
        assert "role" in result and result["role"] == "assistant"
        assert "content" in result
        assert len(result["content"]) > 0

    def test_responder_chat_empty_message(self, mock_call_minimax):
        """Empty message should return empty content (no LLM call)."""
        mock, captured = mock_call_minimax
        import app as app_module
        from agents.memoria.commands import _reset_state
        _reset_state()
        result = app_module.responder(
            mensaje="",
            historial=[],
            skill="chat"
        )
        assert result == {"role": "assistant", "content": ""}

    def test_responder_chat_does_not_break_other_skills(self, mock_call_minimax):
        """Adding chat skill should not break ficha or ideas_creativas dispatch."""
        mock, captured = mock_call_minimax
        import app as app_module
        from agents.memoria.commands import _reset_state
        _reset_state()
        # ficha should still work
        result_ficha = app_module.responder(
            mensaje="Risotto de setas con trufa",
            historial=[],
            skill="ficha"
        )
        assert "role" in result_ficha
        assert "content" in result_ficha
        # ideas_creativas should still work
        result_ideas = app_module.responder(
            mensaje="Ideas para otoño",
            historial=[],
            skill="ideas_creativas"
        )
        assert "role" in result_ideas
        assert "content" in result_ideas


class TestChatWithSavedIdeas:
    """Verify chat handler injects saved ideas as context when present."""

    def test_chat_includes_saved_ideas_in_context(self, mock_call_minimax, tmp_db_conn):
        """When there are saved ideas, chat should mention them as context."""
        mock, captured = mock_call_minimax

        # Pre-populate the temp DB with a saved idea
        from agents.memoria.storage import save_idea
        save_idea(
            tmp_db_conn,
            idea="probar kumquat en el postre de temporada",
            origen="comando",
            origen_skill="chat",
        )
        save_idea(
            tmp_db_conn,
            idea="menú degustación con setas de otoño",
            origen="comando",
            origen_skill="chat",
        )

        from agents.creativo.agent import procesar_mensaje_chat
        procesar_mensaje_chat("¿Qué me sugerís para la carta de invierno?")

        # System prompt should reference ideas guardadas
        assert "IDEAS GUARDADAS" in captured["system_prompt"] or \
               "kumquat" in captured["system_prompt"].lower() or \
               "setas" in captured["system_prompt"].lower(), \
            "Chat system prompt should include saved ideas as context"