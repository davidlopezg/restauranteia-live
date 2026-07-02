"""
Chef Creativo — App Gradio (MVP-0.5 / HF Space)
================================================

Wrapper web sobre la lógica del agente (agents/creativo/agent.py).
La lógica de generación queda intacta; solo se agrega capa de presentación.

Pensado para correr en:
  - Local:    python app.py
  - HF Space: se levanta solo si las Secrets están bien configuradas.

Variables de entorno (en HF Space: configurar como Secrets):
    MINIMAX_API_KEY      — clave de la API (obligatoria)
    MINIMAX_BASE_URL     — opcional, default https://api.minimax.io/v1
    MINIMAX_MODEL        — opcional, default MiniMax-M3

Decisiones de seguridad:
  - Los logs NO muestran el valor de la key. Solo el nombre del tipo de error.
  - El aviso de estacionalidad se inyecta como contexto al chef, no se muestra al usuario.
  - No hay base de datos: cada conversación es stateless (no se guarda entre requests).
"""

from __future__ import annotations

import sys
import logging
from pathlib import Path
from datetime import datetime

# Path del proyecto — permite que app.py corra tanto desde la raíz como desde HF Space
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

import gradio as gr

from agents.creativo.agent import (
    load_system_prompt,
    load_skill_prompt,
    load_estacionalidad,
    load_catalogo,
    load_restaurante,
    formatear_catalogo_para_chef,
    formatear_restaurante_para_chef,
    check_estacionalidad,
    call_minimax,
    iniciar_proceso_creativo,
    procesar_mensaje_proceso,
    procesar_mensaje_ideas_creativas,
    procesar_mensaje_chat,
)
from agents.creativo.skills import (
    list_skills,
    skill_names_for_ui,
    load_skill_prompt as load_skill_prompt_from_registry,
)

# Logger seguro (no expone la key ni stack traces completos)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("chef_creativo")

# Carga única al inicio — evita releer el .md en cada request
SYSTEM_PROMPT = load_system_prompt()
ESTACIONALIDAD = load_estacionalidad()

logger.info("Chef Creativo — recursos cargados correctamente")


# ---------------------------------------------------------------------------
# Lógica del chat
# ---------------------------------------------------------------------------

# Cache de prompts por skill para evitar releer el .md en cada request
_SKILL_PROMPTS: dict[str, str] = {}

# Sesión activa del proceso creativo (state machine persistente).
# En Gradio, los request pueden venir de distintos workers, así que
# mantenemos un dict {thread_id: sesion}. Como hf-space corre single-process
# por default, alcanza con una variable global para la UI.
from threading import Lock
_SESION_PC = None  # type: ignore[var-annotated]
_SESION_PC_LOCK = Lock()


def _get_skill_prompt(skill_key: str) -> str:
    """Carga y cachea el system prompt de la skill."""
    if skill_key not in _SKILL_PROMPTS:
        try:
            _SKILL_PROMPTS[skill_key] = load_skill_prompt_from_registry(skill_key)
        except (KeyError, FileNotFoundError) as e:
            logger.warning(f"No se pudo cargar skill '{skill_key}': {e}. Fallback a 'ficha'.")
            _SKILL_PROMPTS[skill_key] = SYSTEM_PROMPT  # fallback al prompt clásico
    return _SKILL_PROMPTS[skill_key]


def responder(mensaje: str, historial: list, skill: str = "ficha") -> dict:
    """
    Procesa una petición del usuario y devuelve la respuesta del chef.

    Firma compatible con gr.ChatInterface de Gradio 5+ en formato 'messages':
        fn(mensaje: str, historial: list, skill: str) -> dict con {role, content}

    Args:
        mensaje: texto crudo que escribió el usuario.
        historial: lista de mensajes previos (formato messages API).
        skill: key de la skill ('ficha' o 'proceso_creativo').

    Returns:
        Dict con la respuesta del chef en formato messages.
    """
    mensaje = (mensaje or "").strip()
    if not mensaje:
        return {"role": "assistant", "content": ""}

    timestamp = datetime.now().strftime("%H:%M:%S")
    logger.info(f"[{timestamp}] Nueva petición (skill={skill}, len={len(mensaje)})")

    # ────────────────────────────────────────────────────────────────────
    # ARCHIVO DE IDEAS: transversal command dispatch (added in v1)
    # ────────────────────────────────────────────────────────────────────
    ultimo_assistant = (
        historial[-1]["content"]
        if historial and historial[-1]["role"] == "assistant"
        else ""
    )
    try:
        from agents.memoria.commands import handle_command
        from agents.memoria.storage import init_db

        conn = init_db()
        try:
            cmd_result = handle_command(mensaje, ultimo_assistant, skill, conn)
        finally:
            conn.close()

        if cmd_result is not None:
            return cmd_result
    except Exception as e:
        tipo = type(e).__name__
        logger.error(f"[{timestamp}] Error en archivo de ideas: {tipo}: {e}")
        return {
            "role": "assistant",
            "content": f"⚠️ Error interno del archivo de ideas ({tipo}). "
                       f"El chat sigue funcionando normalmente."
        }
    # ── end ARCHIVO DE IDEAS ──

    # ────────────────────────────────────────────────────────────────────
    # Skill "proceso_creativo": state machine por sesión
    # ────────────────────────────────────────────────────────────────────
    if skill == "proceso_creativo":
        return _responder_proceso_creativo(mensaje)

    # ────────────────────────────────────────────────────────────────────
    # Skill "ideas_creativas": exploración conversacional de 10 ideas
    # ────────────────────────────────────────────────────────────────────
    if skill == "ideas_creativas":
        return _responder_ideas_creativas(mensaje)

    # ────────────────────────────────────────────────────────────────────
    # Skill "chat": conversación libre con el chef usando todo el contexto
    # ────────────────────────────────────────────────────────────────────
    if skill == "chat":
        return _responder_chat(mensaje)

    # ────────────────────────────────────────────────────────────────────
    # Skill "ficha" (default): flujo clásico
    # ────────────────────────────────────────────────────────────────────
    system_prompt = _get_skill_prompt(skill)
    # Inyectar el contexto del restaurante (ticket, sofisticación, línea, etc.)
    restaurante = load_restaurante()
    restaurante_str = formatear_restaurante_para_chef(restaurante)
    if restaurante_str:
        system_prompt = system_prompt + restaurante_str
    # Inyectar el catálogo de platos como contexto (si existe)
    catalogo = load_catalogo()
    catalogo_str = formatear_catalogo_para_chef(catalogo)
    if catalogo_str:
        system_prompt = system_prompt + catalogo_str
    try:
        aviso = check_estacionalidad(mensaje, ESTACIONALIDAD)
        contexto_adicional = ""
        if aviso:
            contexto_adicional = (
                f"\n\n[CONTEXTO PRIVADO — NO INCLUIR EN LA SALIDA]: {aviso}"
            )
        user_message = mensaje + contexto_adicional
        instruccion_idioma = (
            "\n\n---\n\n"
            "⚠️ RECORDATORIO FINAL ⚠️\n"
            "Responde SOLO en espa\u00f1ol (castellano). El \u00fanico campo que admite ingl\u00e9s "
            "es el \"\U0001F3A8 PROMPT PARA IMAGEN DEL PLATO\" al final. "
            "Prohibido: ingl\u00e9s, franc\u00e9s, cir\u00edlico, hanzi, kanji. Solo alfabeto latino."
        )
        user_message = user_message + instruccion_idioma
        respuesta = call_minimax(system_prompt, user_message)
        return {"role": "assistant", "content": respuesta}
    except Exception as e:
        tipo = type(e).__name__
        logger.error(f"[{timestamp}] Error procesando petición: {tipo}")
        return {
            "role": "assistant",
            "content": (
                f"❌ Error ({tipo}). "
                f"Detalle: {str(e)[:200]}\n\n"
                f"Si persiste: API key inválida o sin saldo, o timeout de la API."
            ),
        }


def _responder_proceso_creativo(mensaje: str) -> dict:
    """
    Handler de la skill 'proceso_creativo' con state machine persistente.

    Maneja:
    - Comandos (/estado, /fase N, /volver, /ficha, /reiniciar, /salir)
    - Mensajes normales: trabaja la fase actual con LLM y avanza
    """
    global _SESION_PC
    timestamp = datetime.now().strftime("%H:%M:%S")

    # Comandos que NO requieren sesión activa
    if mensaje.strip().lower() == "/nueva":
        with _SESION_PC_LOCK:
            _SESION_PC = None
        return {
            "role": "assistant",
            "content": "↪️ Listo. La próxima petición iniciará una nueva sesión."
        }

    if mensaje.strip().lower() == "/sesiones":
        from agents.creativo.proceso_creativo import listar_sesiones_activas
        sesiones = listar_sesiones_activas()
        if not sesiones:
            return {"role": "assistant", "content": "No hay sesiones guardadas."}
        lineas = ["Sesiones guardadas (última actualización primero):\n"]
        for s in sesiones[:10]:
            estado = "✓" if s.get("completa") else "▶"
            lineas.append(f"  {estado} {s['sesion_id']} — {s['peticion'][:50]}")
        return {"role": "assistant", "content": "\n".join(lineas)}

    if mensaje.strip().lower().startswith("/reanudar "):
        sesion_id = mensaje.strip()[10:].strip()
        try:
            with _SESION_PC_LOCK:
                _SESION_PC = iniciar_proceso_creativo("", sesion_id=sesion_id)
            return {
                "role": "assistant",
                "content": f"↪️ Sesión reanudada: {sesion_id}\n\n{_SESION_PC.resumen_estado()}"
            }
        except FileNotFoundError as e:
            return {"role": "assistant", "content": f"❌ {e}"}

    # Mensaje normal: usar o crear sesión
    with _SESION_PC_LOCK:
        if _SESION_PC is None:
            _SESION_PC = iniciar_proceso_creativo(mensaje)
            logger.info(f"[{timestamp}] Nueva sesión PC: {_SESION_PC.sesion_id}")
            return {
                "role": "assistant",
                "content": (
                    f"🆕 Sesión iniciada: {_SESION_PC.sesion_id}\n\n"
                    f"{_SESION_PC.resumen_estado()}\n\n"
                    f"Empezamos por la **Fase 1 — {_SESION_PC.fase_actual['nombre']}**. "
                    f"Cuando me des tu petición inicial (o aceptes la de arriba), trabajo la fase."
                )
            }
        sesion = _SESION_PC

    # Tenemos sesión activa: procesar mensaje (puede ser comando o contenido de fase)
    try:
        respuesta = procesar_mensaje_proceso(sesion, mensaje)
        return {"role": "assistant", "content": respuesta}
    except Exception as e:
        tipo = type(e).__name__
        logger.error(f"[{timestamp}] Error en proceso_creativo: {tipo}")
        return {
            "role": "assistant",
            "content": f"❌ Error ({tipo}): {str(e)[:200]}"
        }


def _responder_ideas_creativas(mensaje: str) -> dict:
    """
    Handler de la skill 'ideas_creativas'.
    Cada mensaje del usuario genera/refina ideas via LLM.
    Comandos soportados (detectados dentro del mensaje):
    - "más ideas" / "dame más" → 10 ideas nuevas
    - "aplicá [método] a la idea N" → refina + variaciones
    - "ficha de la idea N" → convierte a ficha técnica
    - "ver métodos" → lista métodos disponibles
    - cualquier otro → nueva petición de 10 ideas
    """
    timestamp = datetime.now().strftime("%H:%M:%S")
    logger.info(f"[{timestamp}] Nueva petición (skill=ideas_creativas, len={len(mensaje)})")
    try:
        respuesta = procesar_mensaje_ideas_creativas(mensaje)
        return {"role": "assistant", "content": respuesta}
    except Exception as e:
        tipo = type(e).__name__
        logger.error(f"[{timestamp}] Error en ideas_creativas: {tipo}")
        return {
            "role": "assistant",
            "content": f"❌ Error ({tipo}): {str(e)[:200]}"
        }


def _responder_chat(mensaje: str) -> dict:
    """
    Handler de la skill 'chat'.
    Conversación libre con el chef. El modelo responde usando el contexto del
    restaurante, catálogo, e ideas guardadas. Sin estructura fija.
    """
    timestamp = datetime.now().strftime("%H:%M:%S")
    logger.info(f"[{timestamp}] Nueva petición (skill=chat, len={len(mensaje)})")
    try:
        respuesta = procesar_mensaje_chat(mensaje)
        return {"role": "assistant", "content": respuesta}
    except Exception as e:
        tipo = type(e).__name__
        logger.error(f"[{timestamp}] Error en chat: {tipo}")
        return {
            "role": "assistant",
            "content": f"❌ Error ({tipo}): {str(e)[:200]}"
        }


# ---------------------------------------------------------------------------
# UI con Gradio 5+
# ---------------------------------------------------------------------------

# Lista dinámica de skills (cargada del registry)
SKILLS = list_skills()
SKILL_CHOICES = skill_names_for_ui()  # [(key, nombre_visible), ...]

# Ejemplos para la skill 'ficha' (la default). Los de otras skills viven en skills.py.
EJEMPLOS_FICHA = next(
    s["ejemplos"] for s in SKILLS if s["key"] == "ficha"
)

CUSTOM_CSS = """
#titulo {
    text-align: center;
    margin-bottom: 0.5em;
}
footer {visibility: hidden}
"""


# Gradio 6.19+ cambió varias cosas:
#   - 'theme' y 'css' NO van al gr.Blocks() constructor, van al .launch()
#   - ChatInterface no acepta 'type' (ya no existe como kwarg)
#   - Chatbot no acepta 'type' (en 6 es default 'messages' automático)
#   - Mi responder() ya devuelve dict {role, content}, así que messages es el default natural
#   - additional_inputs pasa inputs adicionales al fn (aca: selector de skill)
with gr.Blocks() as demo:
    skill_selector = gr.Radio(
        choices=SKILL_CHOICES,
        value="ficha",
        label="¿Qué necesitás del chef?",
        info=(
            "Ficha técnica: respuesta estructurada directa. "
            "Proceso creativo: muestra paso a paso cómo piensa el chef, después la ficha."
        ),
    )
    gr.ChatInterface(
        fn=responder,
        title="🍂 Chef Creativo — RestaurantEAI",
        cache_examples=False,
        description=(
            "Generador de fichas culinarias con IA. Pedime un plato en lenguaje natural "
            "y te devuelvo nombre, historia, ficha técnica, maridaje y prompt para imagen. "
            "Cambiá el selector de arriba para ver el proceso creativo paso a paso."
        ),
        examples=[[e] for e in EJEMPLOS_FICHA],  # lista de listas: [ejemplo_texto] cuando hay additional_inputs
        additional_inputs=[skill_selector],
        chatbot=gr.Chatbot(
            avatar_images=(None, "🍂"),
        ),
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Bootstrap del contexto compartido del restaurante.
    # En un entorno interactivo (TTY local), pregunta.
    # En HF Spaces (sin TTY), genera archivos vacíos con warning.
    from agents.knowledge_context import (
        bootstrap_necesario,
        cargar_restaurante,
        guardar_restaurante,
        guardar_catalogo,
    )
    from agents.init_phase import _schema_doc_restaurante, _schema_doc_catalogo

    if bootstrap_necesario():
        if sys.stdin.isatty():
            from agents.init_phase import fase_init_interactiva
            fase_init_interactiva()
        else:
            # HF Space o CI: sin TTY. Generamos vacíos + warning.
            logger.warning(
                "Knowledge base no inicializada. "
                "Para personalizarla, corré localmente: python -m agents.init_phase"
            )
            guardar_restaurante({}, _schema_doc_restaurante())
            guardar_catalogo([], _schema_doc_catalogo())
            logger.info("Archivos vacíos generados automáticamente.")

    # Carga del contexto (ya disponible para todos los agentes)
    restaurante = cargar_restaurante()
    logger.info(f"Restaurante cargado: {restaurante.get('nombre', '(sin nombre)')}")

    demo.launch(
        server_name="0.0.0.0",
        server_port=7860,
        show_error=True,
        theme=gr.themes.Soft(primary_hue="orange"),
        css=CUSTOM_CSS,
    )
