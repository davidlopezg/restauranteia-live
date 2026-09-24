"""
Integracion del agente creativo existente en admin-web.

REUTILIZA agents/creativo/agent.py — NO crea un sistema IA paralelo.

Funciones expuestas:
- generar_ideas(peticion, n=10, ideas_previas=None)
- aplicar_metodo_a_idea(idea, metodo, peticion_original)
- idea_cientifica(peticion)
- chat(peticion, contexto=None)

El backend NO modifica datos automaticamente.
La IA solo propone; el usuario decide si guardar/aplicar/convertir.
"""
import os
import sys
import importlib.util

# Path al proyecto raiz para importar el agente creativo
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_ADMIN_WEB_DIR = os.path.dirname(_BACKEND_DIR)
_PROJECT_ROOT = os.path.dirname(_ADMIN_WEB_DIR)
_AGENT_PATH = os.path.join(_PROJECT_ROOT, "agents", "creativo", "agent.py")

# Necesario para que 'agents.creativo.agent' resuelva sus imports internos.
sys.path.insert(0, _PROJECT_ROOT)

# Cargar el agente como modulo
_spec = importlib.util.spec_from_file_location("creative_agent", _AGENT_PATH)
_agent = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_agent)


# ============================================================
# SINCRONIZACION API KEY — agente lee env, nosotros leemos BD.
# Sin este parche, los cambios en Settings nunca llegan al agente.
# ============================================================
import ia_client as _ia_client


def _sync_agent_config():
    """Copia la key de ia_client (BD con fallback env) al agente cargado.
    Llamar antes de cada operacion del agente para que vea la key actualizada."""
    try:
        _agent.API_KEY = _ia_client._get_api_key() or _agent.API_KEY
    except Exception:
        pass
    try:
        _agent.BASE_URL = _ia_client.BASE_URL or _agent.BASE_URL
    except Exception:
        pass
    try:
        _agent.MODEL = _ia_client.MODEL or _agent.MODEL
    except Exception:
        pass


# Monkey-patch de call_minimax: sincroniza la API key antes de cada llamada.
_original_call_minimax = _agent.call_minimax

def _patched_call_minimax(system_prompt, user_prompt, force_spanish=True):
    _sync_agent_config()
    return _original_call_minimax(system_prompt, user_prompt, force_spanish)

_agent.call_minimax = _patched_call_minimax
# Mantener referencia al original por si alguien lo necesita.
_agent._original_call_minimax = _original_call_minimax


def refresh_ia_config():
    """API publica: sincroniza la config del agente desde BD/env.
    Llamar tras PATCH /api/settings para que la proxima operacion use la nueva key."""
    _sync_agent_config()
    # Tambien invalidar el cache de ia_client para forzar recargar de BD.
    _ia_client.refresh_api_key_cache()


def is_ia_available():
    """Devuelve True si el modulo IA cargo correctamente."""
    return _agent is not None


def generar_ideas(peticion: str, n: int = 10, ideas_previas=None):
    """
    Genera N ideas usando el agente creativo existente.
    Devuelve lista de dicts con keys: nombre, descripcion, metodo_sugerido (si aplica).
    """
    try:
        from datetime import datetime
        ideas_previas = ideas_previas or []
        peticion_con_contexto = peticion
        if ideas_previas:
            prev_text = "\n".join([f"- {i.get('nombre', '')}: {i.get('descripcion', '')[:80]}" for i in ideas_previas[-5:]])
            peticion_con_contexto = f"{peticion}\n\nIdeas ya generadas (evitar repetir):\n{prev_text}"
        respuesta_texto, ideas = _agent._generar_ideas_llm(peticion_con_contexto, ideas_previas)
        # Limitar a N
        return ideas[:n]
    except Exception as e:
        raise RuntimeError(f"Error generando ideas: {e}")


def aplicar_metodo_a_idea(idea, metodo: str, peticion_original: str = "") -> str:
    """
    Aplica un metodo creativo de elBulli a una idea.
    Acepta tanto dict (idea completa) como string (nombre de la idea).
    Devuelve texto.
    """
    try:
        if isinstance(idea, str):
            # El frontend manda solo el nombre; construimos un dict minimo.
            idea = {"n": 1, "nombre": idea, "tipo": "", "por_que": "", "semilla": ""}
        return _agent._aplicar_metodo_a_idea(idea, metodo, peticion_original or idea.get("nombre", ""))
    except Exception as e:
        raise RuntimeError(f"Error aplicando metodo: {e}")


def idea_cientifica(peticion: str) -> dict:
    """Genera propuesta de idea cientifica (Flavor Engine + PubChem)."""
    try:
        texto = _agent.procesar_mensaje_idea_cientifica(peticion)
        return {"texto": texto, "modelo_usado": _agent.MODEL}
    except Exception as e:
        raise RuntimeError(f"Error en idea cientifica: {e}")


def chat(peticion: str, contexto: dict | None = None) -> str:
    """
    Chat libre con el agente. Si contexto (dict con datos del producto)
    se pasa, se incorpora al prompt.
    """
    try:
        peticion_con_contexto = peticion
        if contexto:
            ctx_parts = []
            for k, v in contexto.items():
                if v:
                    ctx_parts.append(f"{k}: {v}")
            if ctx_parts:
                peticion_con_contexto = f"Contexto del producto actual:\n" + "\n".join(ctx_parts) + f"\n\nPregunta del usuario: {peticion}"
        return _agent.procesar_mensaje_chat(peticion_con_contexto)
    except Exception as e:
        raise RuntimeError(f"Error en chat: {e}")


def listar_metodos_creativos() -> list[str]:
    """Devuelve los 13 metodos reales del agente creativo (de elBulli)."""
    # Sincronizado con agent.py METODOS_CREATIVOS
    return _agent.METODOS_CREATIVOS if hasattr(_agent, 'METODOS_CREATIVOS') else [
        "autóctono", "influencias externas", "búsqueda técnico-conceptual",
        "los sentidos", "el sexto sentido", "simbiosis dulce/salado",
        "productos comerciales", "deconstrucción", "minimalismo",
        "asociación", "inspiración", "adaptación", "sinergia",
    ]
