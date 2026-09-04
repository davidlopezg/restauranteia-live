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

import os
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
    load_skill_prompt as load_skill_prompt_from_registry,
)
from app_init_web import _render_init_web_tab

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


def responder(mensaje: str, historial: list) -> dict:
    """
    Punto único de entrada del chat del Agente Creativo.

    Firma compatible con gr.ChatInterface de Gradio 5+ en formato 'messages':
        fn(mensaje: str, historial: list) -> dict con {role, content}

    El dispatch funciona por comandos:
    - `/proceso [petición]` → arranca/continúa una sesión del Proceso Creativo
    - `/ficha <petición>` → genera ficha técnica directa
    - `/ideas <petición>` → genera 10 ideas creativas
    - Comandos del proceso creativo: `/estado`, `/fase`, `/volver`, `/reiniciar`,
      `/nueva`, `/sesiones`, `/reanudar <id>` (cuando hay sesión activa)
    - Comandos del archivo de ideas (transversal): `/guardar`, `/lista-ideas`,
      `/ayuda`, `/olvidar todo`, `/export-ideas`, `/silenciar-contador`, etc.
    - Mensaje sin comando → chat libre con el chef (con contexto del restaurante)

    Args:
        mensaje: texto crudo del usuario.
        historial: lista de mensajes previos (formato messages API).

    Returns:
        Dict con la respuesta del chef en formato messages.
    """
    mensaje = (mensaje or "").strip()
    if not mensaje:
        return {"role": "assistant", "content": ""}

    timestamp = datetime.now().strftime("%H:%M:%S")
    logger.info(f"[{timestamp}] Nueva petición (len={len(mensaje)})")

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
            # skill_origen=None: ya no hay skills en la UI, el archivo de
            # ideas registra el origen_skill cuando proceda (vía los comandos
            # que guardan ideas desde skills concretas).
            cmd_result = handle_command(mensaje, ultimo_assistant, None, conn)
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
    # ─────────────────────────────────────────────────────────────────────
    # Dispatch por comandos
    # ─────────────────────────────────────────────────────────────────────
    return _dispatch_comando(mensaje)


def _dispatch_comando(mensaje: str) -> dict:
    """
    Despacha el mensaje según el comando al inicio (si lo tiene).

    Comandos soportados:
    - `/proceso [petición]` → arrancar/continuar Proceso Creativo
    - `/ficha <petición>` → ficha técnica directa
    - `/ideas <petición>` → 10 ideas creativas
    - `/ayuda` o `/help` → ayuda
    - Resto → chat libre con el chef
    """
    msg = mensaje.strip()
    lower = msg.lower()

    # ── /ayuda ──────────────────────────────────────────────────────────
    if lower in ("/ayuda", "/help"):
        return {
            "role": "assistant",
            "content": _texto_ayuda(),
        }

    # ── /proceso [petición] ─────────────────────────────────────────────
    if lower == "/proceso" or lower.startswith("/proceso "):
        peticion = msg[len("/proceso"):].strip()
        return _responder_proceso_desde_chat(peticion)

    # ── /ficha <petición> ──────────────────────────────────────────────
    if lower.startswith("/ficha"):
        peticion = msg[len("/ficha"):].strip()
        if not peticion:
            # /ficha sin texto: si hay sesión PC, ficha final; si no, ayuda.
            if _SESION_PC is not None:
                return _responder_proceso_desde_chat("/ficha")
            return {
                "role": "assistant",
                "content": (
                    "❌ `/ficha` necesita una petición.\n"
                    "Uso: `/ficha <texto>` para generar una ficha técnica directa.\n"
                    "Si estás en el Proceso Creativo, `/ficha` genera la ficha final."
                ),
            }
        return _responder_ficha_desde_chat(peticion)

    # ── /ideas <petición> ──────────────────────────────────────────────
    if lower.startswith("/ideas"):
        peticion = msg[len("/ideas"):].strip()
        if not peticion:
            return {
                "role": "assistant",
                "content": (
                    "❌ `/ideas` necesita una petición.\n"
                    "Uso: `/ideas <texto>` para generar 10 ideas creativas.\n"
                    "Ejemplos: `/ideas para menú de otoño`, `/ideas para la sección de postres`."
                ),
            }
        return _responder_ideas_desde_chat(peticion)

    # ── /ideas-cien <petición> ───────────────────────────────────────────
    # Idea científica: combina intuición culinaria con el motor de flavor (PubChem).
    if lower.startswith("/ideas-cien"):
        peticion = msg[len("/ideas-cien"):].strip()
        if not peticion:
            return {
                "role": "assistant",
                "content": (
                    "❌ `/ideas-cien` necesita una petición.\n"
                    "Uso: `/ideas-cien <texto>` para generar ideas con datos moleculares.\n"
                    "Ejemplos: `/ideas-cien topping con base de alcachofa`, "
                    "`/ideas-cien combinación molecular para chocolate negro`."
                ),
            }
        try:
            from agents.creativo.agent import procesar_mensaje_idea_cientifica
            return {
                "role": "assistant",
                "content": procesar_mensaje_idea_cientifica(peticion),
            }
        except Exception as e:
            return {
                "role": "assistant",
                "content": f"❌ Error generando idea científica: {e}",
            }

    # ── Comandos del proceso creativo (con sesión activa) ──
    # Comandos que solo tienen sentido con sesión activa:
    comandos_pc_con_sesion = ("/estado", "/volver", "/reiniciar", "/fase")
    if _SESION_PC is not None and (lower in comandos_pc_con_sesion or lower.startswith("/fase ")):
        return _responder_proceso_desde_chat(mensaje)

    # Comandos que funcionan SIEMPRE (con o sin sesión activa):
    if lower == "/nueva":
        return _responder_proceso_desde_chat("/nueva")
    if lower == "/sesiones":
        return _responder_proceso_desde_chat("/sesiones")
    if lower.startswith("/reanudar "):
        return _responder_proceso_desde_chat(mensaje)

    # ── Mensaje normal → chat libre con el chef ──────────────────────────
    return _responder_chat(mensaje)


def _texto_ayuda() -> str:
    """Devuelve el texto de ayuda con los comandos disponibles."""
    return (
        "🍂 **Comandos disponibles**\n\n"
        "**Generación directa**\n"
        "- `/ficha <texto>` — genera una ficha técnica\n"
        "- `/ideas <texto>` — genera 10 ideas creativas\n"
        "- `/proceso [texto]` — arranca o continúa el Proceso Creativo (flujo de 7 fases)\n\n"
        "**Proceso Creativo (durante una sesión)**\n"
        "- `/estado` — ver en qué fase estás\n"
        "- `/fase N|nombre` — saltar a una fase\n"
        "- `/volver` — rehacer la fase actual\n"
        "- `/ficha` — generar la ficha final del proceso\n"
        "- `/reiniciar` — volver al inicio del proceso\n"
        "- `/nueva` — empezar un proceso nuevo\n"
        "- `/sesiones` — listar procesos guardados\n"
        "- `/reanudar <id>` — reanudar un proceso guardado\n\n"
        "**Archivo de Ideas (transversal)**\n"
        "- `/guardar` — guarda la última respuesta del chef\n"
        "- `/lista-ideas` — lista las ideas guardadas (filtro opcional)\n"
        "- `/lista-auto` — lista solo las auto-guardadas por el chat\n"
        "- `/editar N <texto>` — edita una idea guardada\n"
        "- `/olvidar N` — borra una idea\n"
        "- `/olvidar todo` — borrar TODAS las ideas\n"
        "- `/olvidar auto` — borrar solo las auto-guardadas\n"
        "- `/export-ideas` — exportar a JSON\n"
        "- `/silenciar-contador` — activar/desactivar el contador `📁 N guardadas`\n\n"
        "**Memoria automática (v4.1)**\n"
        "- `/memoria on|off` — activar/desactivar la detección automática\n"
        "- `/memoria alta|sugerir` — modo auto-guardar o sugerir antes de guardar\n"
        "- `/memoria-status` — ver el estado actual y las estadísticas\n\n"
        "**General**\n"
        "- `/ayuda` — este mensaje\n"
        "- Mensaje sin comando → chat libre con el chef\n"
    )


def _responder_proceso_desde_chat(peticion_o_comando: str) -> dict:
    """
    Maneja una petición al Proceso Creativo desde el chat.

    Args:
        peticion_o_comando: puede ser:
            - Un comando del PC (`/estado`, `/fase N`, `/volver`, `/ficha`,
              `/reiniciar`, `/nueva`, `/sesiones`, `/reanudar <id>`)
            - Una petición libre (arranca sesión nueva si no hay activa)
            - Cadena vacía (muestra ayuda si no hay sesión activa)

    Returns:
        Dict con respuesta del chef en formato messages.
    """
    global _SESION_PC
    timestamp = datetime.now().strftime("%H:%M:%S")
    mensaje = (peticion_o_comando or "").strip()
    lower = mensaje.lower()

    # Si llega vacío y no hay sesión activa: ayuda
    if not mensaje and _SESION_PC is None:
        return {
            "role": "assistant",
            "content": (
                "❌ `/proceso` necesita una petición para arrancar.\n\n"
                "Uso: `/proceso <petición>` para arrancar el Proceso Creativo.\n"
                "Ejemplos:\n"
                "- `/proceso Pasta fresca con pesto y ragout de costilla`\n"
                "- `/proceso Postre con fresas, albahaca y vinagre balsámico`"
            ),
        }

    # Si llega vacío y hay sesión activa: mostrar estado
    if not mensaje and _SESION_PC is not None:
        return {
            "role": "assistant",
            "content": _SESION_PC.resumen_estado(),
        }

    # Comandos que NO requieren sesión activa
    if lower == "/nueva":
        with _SESION_PC_LOCK:
            _SESION_PC = None
        return {
            "role": "assistant",
            "content": "↪️ Listo. La próxima petición iniciará una nueva sesión."
        }

    if lower == "/sesiones":
        from agents.creativo.proceso_creativo import listar_sesiones_activas
        sesiones = listar_sesiones_activas()
        if not sesiones:
            return {"role": "assistant", "content": "No hay sesiones guardadas."}
        lineas = ["Sesiones guardadas (última actualización primero):\n"]
        for s in sesiones[:10]:
            estado = "✓" if s.get("completa") else "▶"
            lineas.append(f"  {estado} {s['sesion_id']} — {s['peticion'][:50]}")
        return {"role": "assistant", "content": "\n".join(lineas)}

    if lower.startswith("/reanudar "):
        sesion_id = mensaje[len("/reanudar "):].strip()
        try:
            with _SESION_PC_LOCK:
                _SESION_PC = iniciar_proceso_creativo("", sesion_id=sesion_id)
            return {
                "role": "assistant",
                "content": f"↪️ Sesión reanudada: {sesion_id}\n\n{_SESION_PC.resumen_estado()}"
            }
        except FileNotFoundError as e:
            return {"role": "assistant", "content": f"❌ {e}"}

    # Si no hay sesión activa: arrancar una nueva con esta petición
    with _SESION_PC_LOCK:
        if _SESION_PC is None:
            # Si llega un comando del PC sin sesión activa, error
            if mensaje.startswith("/"):
                return {
                    "role": "assistant",
                    "content": (
                        f"❌ No hay sesión activa. Usá `/proceso <petición>` para arrancar una.\n"
                        f"(Comando recibido: `{mensaje}`)"
                    ),
                }
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




def _responder_ideas_desde_chat(peticion: str) -> dict:
    """
    Handler de generación de ideas creativas desde el chat (vía `/ideas`).

    Cada mensaje se interpreta como una nueva petición de 10 ideas, o como
    un comando interno (`dame más`, `aplicá método a idea N`, etc.).
    """
    timestamp = datetime.now().strftime("%H:%M:%S")
    logger.info(f"[{timestamp}] Nueva petición de ideas (len={len(peticion)})")
    try:
        respuesta = procesar_mensaje_ideas_creativas(peticion)
        return {"role": "assistant", "content": respuesta}
    except Exception as e:
        tipo = type(e).__name__
        logger.error(f"[{timestamp}] Error en ideas_creativas: {tipo}")
        return {
            "role": "assistant",
            "content": f"❌ Error ({tipo}): {str(e)[:200]}"
        }



def _responder_ficha_desde_chat(peticion: str) -> dict:
    """
    Handler de generación de ficha técnica desde el chat (vía `/ficha <texto>`).

    Usa el system prompt `system_chef.md` con el contexto del restaurante
    y catálogo inyectados. NO es el proceso creativo: es una ficha directa
    de un solo paso.
    """
    timestamp = datetime.now().strftime("%H:%M:%S")
    logger.info(f"[{timestamp}] Nueva ficha directa (len={len(peticion)})")
    try:
        # Cargar system prompt de la ficha (skill "ficha")
        system_prompt = _get_skill_prompt("ficha")

        # Inyectar contexto del restaurante
        restaurante = load_restaurante()
        restaurante_str = formatear_restaurante_para_chef(restaurante)
        if restaurante_str:
            system_prompt = system_prompt + restaurante_str

        # Inyectar catálogo de platos
        catalogo = load_catalogo()
        catalogo_str = formatear_catalogo_para_chef(catalogo)
        if catalogo_str:
            system_prompt = system_prompt + catalogo_str

        # Aviso de estacionalidad (contexto privado)
        aviso = check_estacionalidad(peticion, ESTACIONALIDAD)
        contexto_adicional = ""
        if aviso:
            contexto_adicional = (
                f"\n\n[CONTEXTO PRIVADO — NO INCLUIR EN LA SALIDA]: {aviso}"
            )
        user_message = peticion + contexto_adicional
        instruccion_idioma = (
            "\n\n---\n\n"
            "⚠️ RECORDATORIO FINAL ⚠️\n"
            "Responde SOLO en español (castellano). El único campo que admite inglés "
            "es el \"" + chr(0x1F3A8) + " PROMPT PARA IMAGEN DEL PLATO\" al final. "
            "Prohibido: inglés, francés, cirílico, hanzi, kanji. Solo alfabeto latino."
        )
        user_message = user_message + instruccion_idioma

        respuesta = call_minimax(system_prompt, user_message)
        return {"role": "assistant", "content": respuesta}
    except Exception as e:
        tipo = type(e).__name__
        logger.error(f"[{timestamp}] Error generando ficha: {tipo}")
        return {
            "role": "assistant",
            "content": (
                f"❌ Error ({tipo}). "
                f"Detalle: {str(e)[:200]}\n\n"
                f"Si persiste: API key inválida o sin saldo, o timeout de la API."
            ),
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
# Seed demo (Fase 1 — producto-vendible)
# ---------------------------------------------------------------------------

def _estado_perfil() -> str:
    """Devuelve el texto del indicador de perfil según restaurante.json."""
    try:
        restaurante = load_restaurante()
    except FileNotFoundError:
        return "*(sin contexto de restaurante)*"
    nombre = (restaurante.get("nombre") or "").strip()
    if restaurante.get("demo"):
        return f"🧪 **Demo**: {nombre or 'Restaurante de demostración'} — perfil de ejemplo precargado."
    if nombre:
        return f"🍽️ **Perfil activo**: {nombre}"
    return "*(sin contexto de restaurante)*"


def _seed_demo_profile() -> None:
    """Boot no-TTY: copia el perfil demo a conocimiento/interno_restaurante/ si falta (idempotente).

    IMPORTANTE: `guardar_restaurante()`/`guardar_catalogo()` en
    agents/knowledge_context.py sobrescriben SIEMPRE (open("w") incondicional), así
    que este helper guarda SOLO el archivo que falta, vía `restaurante_existe()` /
    `catalogo_existe()`: nunca pisa un perfil real existente con el demo (RF-13).
    """
    import json  # app.py no importa json al tope

    from agents.knowledge_context import (
        restaurante_existe,
        catalogo_existe,
        guardar_restaurante,
        guardar_catalogo,
    )
    from agents.init_phase import _schema_doc_restaurante, _schema_doc_catalogo

    demo_dir = Path(__file__).resolve().parent / "conocimiento" / "interno_app" / "recursos"
    demo_rest = json.loads(
        (demo_dir / "demo_restaurante.json").read_text(encoding="utf-8")
    )
    demo_cat = json.loads(
        (demo_dir / "demo_catalogo_platos.json").read_text(encoding="utf-8")
    )

    if not restaurante_existe():
        guardar_restaurante(demo_rest, _schema_doc_restaurante())
    if not catalogo_existe():
        guardar_catalogo(demo_cat, _schema_doc_catalogo())

    logger.info("Perfil demo genérico seedeado (no-TTY boot).")


# ---------------------------------------------------------------------------
# UI con Gradio 5+
# ---------------------------------------------------------------------------

# Lista dinámica de skills (cargada del registry) — solo para que
# _get_skill_prompt() pueda resolver por key si hace falta.
SKILLS = list_skills()

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
    # Indicador de perfil (design D3) + link a la landing (T2.2/T2.4).
    # _estado_perfil() se evalúa al construir la UI; en __main__ se re-evalúa
    # tras el seed no-TTY (riesgo T4): un boot frío del Space todavía no tiene
    # restaurante.json cuando el Blocks se construye a nivel de módulo.
    perfil_md = gr.Markdown(_estado_perfil())
    gr.Markdown("  ·  [🌐 Volver a la web](https://davidlopezg.github.io/restauranteai/)")

    # Pestañas: Chat (público) + Configurar mi restaurante (Fase 2 init-web)
    with gr.Tabs():
        with gr.Tab("💬 Chat"):
            gr.ChatInterface(
                fn=responder,
                title="🍂 Chef Creativo — RestaurantEAI",
                cache_examples=False,
                description=(
                    "Chat con el chef. Usá `/ficha <texto>`, `/ideas <texto>` o `/proceso <texto>` "
                    "para generar; cualquier otro mensaje es conversación libre. "
                    "Escribí `/ayuda` para ver todos los comandos."
                ),
                examples=[
                    ["/ficha Risotto de setas con trufa, para noche de gala"],
                    ["/ideas Ideas para menú de otoño"],
                    ["/proceso Pasta fresca con pesto y ragout de costilla"],
                    ["¿Qué te parece la alcachofa a la brasa como entrante de primavera?"],
                ],
                chatbot=gr.Chatbot(
                    avatar_images=(None, "🍂"),
                ),
            )

        with gr.Tab("⚙️ Configurar mi restaurante"):
            _render_init_web_tab()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Bootstrap del contexto compartido del restaurante.
    # En un entorno interactivo (TTY local), pregunta.
    # En HF Spaces (sin TTY), seedea el perfil demo genérico (RF-13).
    from agents.knowledge_context import (
        bootstrap_necesario,
        cargar_restaurante,
    )

    if bootstrap_necesario():
        if sys.stdin.isatty():
            from agents.init_phase import fase_init_interactiva
            fase_init_interactiva()
        else:
            # HF Space o CI: sin TTY. Seed de perfil demo genérico (RF-13).
            # _seed_demo_profile() es idempotente y guarda SOLO el archivo que
            # falta: guardar_* sobrescribe siempre, así que no debe tocar un
            # perfil real existente.
            _seed_demo_profile()

    # Carga del contexto (ya disponible para todos los agentes)
    restaurante = cargar_restaurante()
    logger.info(f"Restaurante cargado: {restaurante.get('nombre', '(sin nombre)')}")

    # El Blocks se construye a nivel de módulo, ANTES del seed de __main__, así
    # que re-evaluamos el indicador ya con el perfil seedeado (riesgo T4 del
    # design): sin esto, un boot frío del Space mostraría "(sin contexto)".
    perfil_md.value = _estado_perfil()

    # Auth: HF OAuth nativo en Spaces (via frontmatter) o auth básica
    # con user/password desde env vars. Si no hay env vars, no se exige auth
    # (modo dev local). En producción HF, configurar CONFIG_USER +
    # CONFIG_PASSWORD como Secrets.
    auth_config = None
    if os.getenv("CONFIG_USER") and os.getenv("CONFIG_PASSWORD"):
        auth_config = (os.getenv("CONFIG_USER"), os.getenv("CONFIG_PASSWORD"))

    demo.launch(
        server_name="0.0.0.0",
        server_port=7860,
        show_error=True,
        theme=gr.themes.Soft(primary_hue="orange"),
        css=CUSTOM_CSS,
        auth=auth_config,
    )
