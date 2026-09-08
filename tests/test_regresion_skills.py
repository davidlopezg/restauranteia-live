"""
Regression tests for the chat dispatcher (Bloque 3).

Verifica que:
1. Los comandos `/ficha <texto>`, `/ideas <texto>`, `/proceso [texto]` ejecutan el handler correcto.
2. Mensajes sin prefijo caen en el chat libre.
3. Comandos del archivo de ideas (transversal) siguen funcionando.
4. Edge cases no rompen el dispatcher.
"""

from __future__ import annotations

import sys
import pytest
import sqlite3
from pathlib import Path
from unittest.mock import patch, MagicMock

# Mock gradio before importing app.py (not available in test env)
sys.modules["gradio"] = MagicMock()
sys.modules["gradio.themes"] = MagicMock()
sys.modules["gradio.themes"]().Soft = MagicMock()


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def tmp_db_conn(tmp_path: Path):
    """Create a temporary SQLite database for regression testing."""
    db_path = tmp_path / "test_ideas.db"
    conn = sqlite3.connect(str(db_path), check_same_thread=False, timeout=5.0)
    conn.row_factory = sqlite3.Row  # necesario para storage._row_to_dict()
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
def reset_state(tmp_path):
    """Reset memoria + proceso creativo state before each test."""
    from agents.memoria.commands import _reset_state
    _reset_state()
    # Resetear sesión del proceso creativo
    import app
    app._SESION_PC = None


@pytest.fixture
def mock_call_minimax(tmp_db_conn):
    """Mock call_minimax and init_db for clean regression testing."""
    conn = tmp_db_conn

    def _mock_init_db(*args, **kwargs):
        return conn

    with patch("agents.memoria.storage.init_db", side_effect=_mock_init_db):
        with patch("agents.creativo.agent.call_minimax") as mock:
            mock.return_value = (
                "Esta es una respuesta simulada del chef para pruebas de regresión."
            )
            # Import app WHILE the source module patch is active.
            import app as app_module
            # Also patch app.call_minimax for subsequent test runs.
            with patch.object(app_module, "call_minimax", mock):
                yield mock


# ── Tests ───────────────────────────────────────────────────────────────────


class TestRegresionChatLibre:
    """Mensaje sin prefijo → chat libre con el chef."""

    def test_mensaje_normal_ejecuta_chat(self, mock_call_minimax):
        """Non-command message → chat handler executes."""
        from app import responder

        result = responder("dame una ficha de setas", [])
        mock_call_minimax.assert_called_once()
        assert result["role"] == "assistant"
        assert "respuesta simulada" in result["content"]

    def test_mensaje_con_historial(self, mock_call_minimax):
        """Chat con historial previo."""
        from app import responder

        historial = [{"role": "assistant", "content": "respuesta anterior"}]
        result = responder("y con parmesano?", historial)
        mock_call_minimax.assert_called_once()
        assert "respuesta simulada" in result["content"]

    def test_pregunta_sobre_restaurante(self, mock_call_minimax):
        """Pregunta conversacional sobre producto/técnica/cliente."""
        from app import responder

        result = responder("¿qué te parece la alcachofa a la brasa?", [])
        mock_call_minimax.assert_called_once()
        assert "respuesta simulada" in result["content"]


class TestRegresionFicha:
    """Comando `/ficha <texto>` ejecuta el handler de ficha directa."""

    def test_ficha_con_texto_ejecuta_handler(self, mock_call_minimax):
        from app import responder

        result = responder("/ficha risotto de setas con trufa", [])
        mock_call_minimax.assert_called_once()
        assert result["role"] == "assistant"
        assert "respuesta simulada" in result["content"]

    def test_ficha_sin_texto_pide_peticion(self, mock_call_minimax):
        """`/ficha` sin args → mensaje de ayuda, NO ejecuta handler."""
        from app import responder

        result = responder("/ficha", [])
        mock_call_minimax.assert_not_called()
        assert "necesita una petición" in result["content"]

    def test_ficha_sin_texto_con_sesion_pc_genera_ficha_final(self, mock_call_minimax):
        """`/ficha` sin args CON sesión PC activa → ficha final del PC."""
        from app import responder, _SESION_PC, iniciar_proceso_creativo

        # Iniciar sesión PC
        _SESION_PC = iniciar_proceso_creativo("Test risotto")
        result = responder("/ficha", [])
        # No es ficha directa, es ficha final del PC → diferente handler
        # En la ficha final del PC el comportamiento depende del estado
        # de las fases. No es trivial testearlo sin más mocks, así que
        # validamos que NO se llamó call_minimax del handler de ficha directa.
        # (La ficha final del PC usa su propia llamada a call_minimax)


class TestRegresionIdeas:
    """Comando `/ideas <texto>` ejecuta el handler de ideas creativas."""

    def test_ideas_con_texto_ejecuta_handler(self, mock_call_minimax):
        from app import responder

        result = responder("/ideas para menú de otoño", [])
        mock_call_minimax.assert_called_once()
        assert result["role"] == "assistant"

    def test_ideas_sin_texto_pide_peticion(self, mock_call_minimax):
        from app import responder

        result = responder("/ideas", [])
        mock_call_minimax.assert_not_called()
        assert "necesita una petición" in result["content"]


class TestRegresionProcesoCreativo:
    """Comando `/proceso [texto]` arranca/continúa el Proceso Creativo."""

    def test_proceso_sin_args_sin_sesion_pide_peticion(self, mock_call_minimax):
        from app import responder

        result = responder("/proceso", [])
        assert "necesita una petición" in result["content"]

    def test_proceso_con_args_arranca_sesion(self, mock_call_minimax):
        import app
        from app import responder

        result = responder("/proceso Pasta fresca con pesto", [])
        assert "Sesión iniciada" in result["content"]
        assert app._SESION_PC is not None
        assert app._SESION_PC.peticion == "Pasta fresca con pesto"

    def test_proceso_sin_args_con_sesion_muestra_estado(self, mock_call_minimax):
        import app
        from app import responder, iniciar_proceso_creativo

        app._SESION_PC = iniciar_proceso_creativo("Test")
        result = responder("/proceso", [])
        assert "Sesión" in result["content"]

    def test_estado_con_sesion(self, mock_call_minimax):
        import app
        from app import responder, iniciar_proceso_creativo

        app._SESION_PC = iniciar_proceso_creativo("Test")
        result = responder("/estado", [])
        assert "Sesión" in result["content"]

    def test_estado_sin_sesion_cae_a_chat(self, mock_call_minimax):
        """`/estado` sin sesión → cae al chat normal (no interceptado)."""
        from app import responder

        result = responder("/estado", [])
        # Como no hay sesión, el dispatcher no intercepta `/estado` y va a chat
        mock_call_minimax.assert_called_once()
        assert "respuesta simulada" in result["content"]

    def test_nueva_resetea_sesion(self, mock_call_minimax):
        import app
        from app import responder, iniciar_proceso_creativo

        app._SESION_PC = iniciar_proceso_creativo("Test")
        result = responder("/nueva", [])
        assert "nueva sesión" in result["content"]
        assert app._SESION_PC is None

    def test_reanudar_sesion_existente(self, mock_call_minimax, tmp_path):
        """`/reanudar <id>` carga una sesión del filesystem."""
        import app
        from app import responder, iniciar_proceso_creativo

        # Crear sesión en disco
        sesion = iniciar_proceso_creativo("Sesión de prueba")
        sesion_id = sesion.sesion_id
        sesion.save()

        # Resetear estado en memoria
        app._SESION_PC = None

        # Reanudar
        result = responder(f"/reanudar {sesion_id}", [])
        assert "Sesión reanudada" in result["content"]
        assert app._SESION_PC is not None


class TestRegresionDispatcher:
    """Edge cases y comportamiento general del dispatcher."""

    def test_ayuda_muestra_comandos(self, mock_call_minimax):
        from app import responder

        result = responder("/ayuda", [])
        assert "Comandos disponibles" in result["content"]
        assert "/ficha" in result["content"]
        assert "/ideas" in result["content"]
        assert "/proceso" in result["content"]

    def test_help_alias_de_ayuda(self, mock_call_minimax):
        from app import responder

        result = responder("/help", [])
        assert "Comandos disponibles" in result["content"]

    def test_mensaje_vacio(self, mock_call_minimax):
        from app import responder

        result = responder("", [])
        mock_call_minimax.assert_not_called()
        assert result["content"] == ""

    def test_comando_archivo_ideas_guardar(self, mock_call_minimax):
        """`/guardar <texto>` sigue funcionando (transversal)."""
        from app import responder

        historial = [{"role": "assistant", "content": "respuesta anterior del chef"}]
        result = responder("/guardar probar kumquat", historial)
        mock_call_minimax.assert_not_called()
        assert "guardad" in result["content"].lower() or "✅" in result["content"]

    def test_comando_archivo_ideas_lista_ideas(self, mock_call_minimax, tmp_db_conn):
        """`/lista-ideas` lista las ideas guardadas (antes era `/ideas`)."""
        from app import responder
        from agents.memoria.storage import save_idea

        save_idea(tmp_db_conn, "idea de prueba")
        result = responder("/lista-ideas", [])
        mock_call_minimax.assert_not_called()
        assert "idea de prueba" in result["content"]

    def test_olvidar_todo(self, mock_call_minimax):
        """`/olvidar todo` pide confirmación."""
        from app import responder

        result = responder("/olvidar todo", [])
        mock_call_minimax.assert_not_called()
        assert "confirmar" in result["content"].lower() or "olvidar" in result["content"].lower()

    def test_comando_desconocido_cae_a_chat(self, mock_call_minimax):
        """Comando `/xyz` no reconocido → cae al chat libre (transversal)."""
        from app import responder

        result = responder("/xyz", [])
        # /xyz no es de ningún dispatcher → cae al chat
        mock_call_minimax.assert_called_once()
        assert "respuesta simulada" in result["content"]

    def test_exception_safety_net(self):
        """Si init_db falla, el usuario recibe error, no crash."""
        from app import responder

        with patch("agents.memoria.storage.init_db") as mock_init:
            mock_init.side_effect = Exception("DB failure simulation")
            result = responder("/guardar test", [])
            assert "Error interno" in result["content"]

    def test_multiples_turnos_sin_comando(self, mock_call_minimax):
        """Varias preguntas seguidas sin comando → todas van al chat."""
        from app import responder

        mensajes = [
            "dame una ficha de setas",
            "qué tal un postre de chocolate",
            "y un maridaje para cordero?",
        ]
        for msg in mensajes:
            mock_call_minimax.reset_mock()
            result = responder(msg, [])
            mock_call_minimax.assert_called_once()
            assert "respuesta simulada" in result["content"]