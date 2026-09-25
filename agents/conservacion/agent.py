"""
agents/conservacion/agent.py — Agente de Conservación (MVP-0).

Recibe una pregunta sobre conservación de alimentos y responde con consejo
técnico accionable: método aplicable, parámetros (T, HR, vida útil), alertas
microbiológicas y normativa española/UE básica.

Uso:
    python -m agents.conservacion.agent "¿cómo conservo setas frescas?"
    python -m agents.conservacion.agent  # modo interactivo

Uso programático:
    from agents.conservacion.agent import preguntar
    respuesta = preguntar("¿puedo congelar paté?")

Variables de entorno (.env):
    MINIMAX_API_KEY, MINIMAX_BASE_URL, MINIMAX_MODEL — mismas que creativo.

Arquitectura:
    - Knowledge base: conocimiento/interno_app/recursos/conservacion.json
    - System prompt:  conocimiento/interno_app/prompts/system_conservacion.md
    - LLM call:       reusada de agents.creativo.agent (ver ponytail note)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

# --- Paths -------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PROMPT_PATH = PROJECT_ROOT / "conocimiento" / "interno_app" / "prompts" / "system_conservacion.md"
KB_PATH = PROJECT_ROOT / "conocimiento" / "interno_app" / "recursos" / "conservacion.json"

load_dotenv(PROJECT_ROOT / ".env")


# ponytail: reutilizamos call_minimax del agente creativo para no duplicar
# cliente HTTP, retries, rate-limit y validación de idioma. Si aparece un
# tercer caller, refactor a agents/herramientas/llm_client.py.
from agents.creativo.agent import call_minimax  # noqa: E402


# --- Carga de recursos -------------------------------------------------------

def cargar_conocimiento() -> dict:
    """
    Carga la base de conocimiento de conservación (JSON).

    Devuelve dict vacío si el archivo no existe.
    Lanza json.JSONDecodeError si el JSON está malformado (fail loud).
    """
    if not KB_PATH.exists():
        return {}
    return json.loads(KB_PATH.read_text(encoding="utf-8"))


def formatear_conocimiento(conocimiento: Optional[dict] = None) -> str:
    """
    Formatea la base de conocimiento para inyectarla como contexto en el system prompt.

    El JSON es compacto (~30KB) — cabe entero. Si crece mucho (>50KB), paginar
    por método o hacer RAG.
    """
    if conocimiento is None:
        conocimiento = cargar_conocimiento()
    if not conocimiento:
        return ""

    partes: list[str] = [
        "\n\n---\n",
        "## BASE DE CONOCIMIENTO DE CONSERVACIÓN",
        "",
        "Estos son los datos estructurados que debés usar como fuente principal. "
        "NO inventes parámetros fuera de estos rangos. Si un dato no aparece, decí "
        "'no tengo datos sobre esto' en vez de inventar.",
        "",
    ]

    # Normativa
    normativa = conocimiento.get("normativa", {})
    if normativa:
        partes.append("### 📜 Normativa de referencia")
        partes.append("")
        for k, v in normativa.items():
            partes.append(f"- **{k}**: {v}")
        partes.append("")

    # Métodos
    metodos = conocimiento.get("metodos", [])
    if metodos:
        partes.append(f"### 🥶 Métodos de conservación ({len(metodos)} disponibles)")
        partes.append("")
        for m in metodos:
            partes.append(f"#### {m.get('nombre', m.get('id', '?'))}")
            partes.append(f"- **Descripción**: {m.get('descripcion_corta', '')}")
            if m.get("temp_objetivo_c"):
                partes.append(f"- **Temperatura objetivo**: {m['temp_objetivo_c']} °C")
            if m.get("humedad_relativa_pct"):
                partes.append(f"- **Humedad relativa**: {m['humedad_relativa_pct']} %")
            if m.get("vida_util_dias"):
                partes.append(f"- **Vida útil orientativa**: {m['vida_util_dias']} días")
            if m.get("productos_tipicos"):
                partes.append(f"- **Productos típicos**: {', '.join(m['productos_tipicos'])}")
            if m.get("riesgos_principales"):
                partes.append(f"- **Riesgos**: {', '.join(m['riesgos_principales'])}")
            if m.get("punto_critico"):
                partes.append(f"- **Punto crítico**: {m['punto_critico']}")
            if m.get("notas"):
                partes.append(f"- **Notas**: {m['notas']}")
            partes.append("")

    # Familias
    familias = conocimiento.get("familias_productos", [])
    if familias:
        partes.append(f"### 🛒 Familias de producto ({len(familias)} disponibles)")
        partes.append("")
        for f in familias:
            partes.append(f"#### {f.get('id', '?')}")
            partes.append(f"- **Conservación principal**: {f.get('conservacion_principal', '')}")
            partes.append(f"- **Vida útil**: {f.get('vida_util_dias', '?')} días")
            if f.get("notas"):
                partes.append(f"- **Notas**: {f['notas']}")
            partes.append("")

    # Alertas microbiológicas
    alertas = conocimiento.get("alertas_microbiologicas", [])
    if alertas:
        partes.append(f"### ⚠️ Alertas microbiológicas ({len(alertas)} patógenos clave)")
        partes.append("")
        for a in alertas:
            partes.append(f"#### {a.get('agente', '?')}")
            partes.append(f"- **Peligro**: {a.get('peligro', '')}")
            partes.append(f"- **Métodos que SÍ lo controlan**: {', '.join(a.get('metodos_inhiben', []))}")
            partes.append(f"- **Métodos que NO lo controlan solos**: {', '.join(a.get('metodos_NO_inhiben_si_solo', []))}")
            if a.get("casos_tipicos"):
                partes.append(f"- **Casos típicos**: {a['casos_tipicos']}")
            partes.append("")

    return "\n".join(partes)


def cargar_system_prompt() -> str:
    """Carga el system prompt del agente de conservación."""
    if not PROMPT_PATH.exists():
        raise FileNotFoundError(
            f"No se encontró el system prompt en {PROMPT_PATH}. "
            f"Asegúrate de que el archivo existe."
        )
    return PROMPT_PATH.read_text(encoding="utf-8")


def cargar_restaurante() -> dict:
    """Carga el contexto del restaurante (de la fase init). Dict vacío si no existe."""
    from agents.knowledge_context import cargar_restaurante as _cargar
    try:
        return _cargar()
    except FileNotFoundError:
        return {}


def formatear_restaurante_para_conservacion(restaurante: Optional[dict] = None) -> str:
    """
    Inyecta el contexto del restaurante al system prompt del agente de conservación.
    Sólo nos interesa lo que afecta a conservación: línea culinaria, ticket, carta.
    """
    if restaurante is None:
        restaurante = cargar_restaurante()
    if not restaurante:
        return ""

    partes: list[str] = [
        "\n\n---\n",
        "## CONTEXTO DEL RESTAURANTE",
        "",
        "Datos del restaurante que pueden afectar a decisiones de conservación:",
        "",
    ]

    nombre = restaurante.get("nombre", "").strip()
    if nombre:
        partes.append(f"- **Restaurante**: {nombre}")

    linea = restaurante.get("origen_inspiracion", "").strip()
    if linea:
        partes.append(f"- **Línea culinaria**: {linea}")

    # Productos dominantes → pueden requerir métodos concretos
    prods = restaurante.get("productos_dominantes", [])
    if prods:
        if isinstance(prods, str):
            prods = [prods]
        partes.append(f"- **Productos dominantes**: {', '.join(str(p) for p in prods)}")

    # Ticket → indica nivel de sofisticación en conserva
    pmoda = restaurante.get("precio_target_moda")
    if pmoda:
        partes.append(f"- **Ticket medio**: {pmoda} €")

    partes.append("")
    partes.append(
        "REGLA: si el usuario pregunta algo específico a su restaurante "
        "(ej. 'cómo conservo el producto X que ya uso'), usá estos datos como base. "
        "Si el usuario pregunta algo genérico de conservación, respondé genéricamente."
    )

    return "\n".join(partes)


# --- API principal -----------------------------------------------------------

def preguntar(
    pregunta: str,
    conocimiento: Optional[dict] = None,
    restaurante: Optional[dict] = None,
) -> str:
    """
    Hace una pregunta al agente de conservación y devuelve la respuesta.

    Args:
        pregunta: texto libre del usuario (pregunta concreta o amplia).
        conocimiento: dict de la knowledge base. Si None, se carga del disco.
        restaurante: dict del restaurante. Si None, se carga del disco.

    Returns:
        Respuesta del agente (texto en castellano).
    """
    system_prompt = cargar_system_prompt()
    kb_texto = formatear_conocimiento(conocimiento)
    rest_texto = formatear_restaurante_para_conservacion(restaurante)

    system_full = system_prompt + kb_texto + rest_texto
    return call_minimax(system_full, pregunta, force_spanish=True)


# --- CLI ---------------------------------------------------------------------

def _modo_interactivo() -> None:
    """Loop interactivo simple. Ctrl+C o 'salir' para terminar."""
    print("🥶 Agente de Conservación — modo interactivo")
    print("Escribí tu pregunta (o 'salir' para terminar).\n")

    # Pre-cargamos KB y restaurante para no leer disco en cada turno.
    conocimiento = cargar_conocimiento()
    restaurante = cargar_restaurante()

    while True:
        try:
            pregunta = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n👋 Hasta luego.")
            return
        if not pregunta:
            continue
        if pregunta.lower() in {"salir", "exit", "quit"}:
            print("👋 Hasta luego.")
            return

        print()
        try:
            respuesta = preguntar(pregunta, conocimiento, restaurante)
            print(respuesta)
        except Exception as e:
            print(f"❌ Error: {e}", file=sys.stderr)
        print()


def main() -> None:
    """Entry point CLI. Una pregunta como argumento o modo interactivo."""
    # Asegurar que el knowledge base del restaurante esté inicializado (idempotente).
    from agents.knowledge_context import ensure_initialized
    ensure_initialized()

    args = sys.argv[1:]
    if not args:
        _modo_interactivo()
        return

    pregunta = " ".join(args).strip()
    if pregunta in {"-h", "--help", "help"}:
        print(__doc__)
        return

    try:
        respuesta = preguntar(pregunta)
        print(respuesta)
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
