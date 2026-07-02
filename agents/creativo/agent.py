"""
Chef Creativo — Agente MVP-0
============================

Recibe una petición culinaria en lenguaje natural y devuelve una ficha estructurada
(nombre, historia, ficha técnica, maridaje, prompt de imagen).

Uso:
    python -m agents.creativo.agent "Quiero un entrante vegetariano con calabaza y queso de cabra"
    python -m agents.creativo.agent  # modo interactivo

Variables de entorno necesarias (.env):
    MINIMAX_API_KEY      — tu clave de la API
    MINIMAX_BASE_URL     — endpoint base (ej: https://api.minimax.chat/v1)
    MINIMAX_MODEL        — nombre del modelo (ej: MiniMax-M3)
"""

from __future__ import annotations

import os
import sys
import json
import re
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv

# --- Paths del proyecto ------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PROMPT_PATH = PROJECT_ROOT / "agents" / "creativo" / "prompts" / "system_chef.md"
ESTACIONALIDAD_PATH = PROJECT_ROOT / "agents" / "creativo" / "knowledge" / "estacionalidad.json"

load_dotenv(PROJECT_ROOT / ".env")


# --- Configuración ------------------------------------------------------------

API_KEY = os.getenv("MINIMAX_API_KEY")

# Base URL por defecto verificada contra documentación oficial de MiniMax.
# Fuente: https://platform.minimax.io/docs/guides/quickstart-preparation
# (Modo OpenAI-compatible, sección "Compatible OpenAI API")
DEFAULT_BASE_URL = "https://api.minimax.io/v1"
BASE_URL = os.getenv("MINIMAX_BASE_URL", DEFAULT_BASE_URL).rstrip("/")

# Modelo por defecto verificado contra doc oficial.
# Fuente: https://platform.minimax.io/docs/guides/models-intro
# MiniMax-M3: 1M context window, modelo frontier multimodal.
DEFAULT_MODEL = "MiniMax-M3"
MODEL = os.getenv("MINIMAX_MODEL", DEFAULT_MODEL)

# Timeout y reintentos
REQUEST_TIMEOUT = 60.0
MAX_RETRIES = 2
LANGUAGE_RETRIES = 2  # reintentos adicionales si el chef responde en inglés

# Palabras de alta confianza que NO deberían aparecer en una ficha en castellano.
# Son function words + vocabulario común inglés sin cognados en español.
_PALABRAS_GATILLO_INGLES: set[str] = {
    "the", "and", "with", "for", "you", "this", "that", "are",
    "your", "from", "have", "would", "will", "each", "into",
    "just", "also", "well", "after", "our", "when", "which",
    "their", "what", "been", "has", "its", "over", "than",
    "then", "these", "some", "them", "very", "much", "such",
}


# --- Carga de recursos -------------------------------------------------------

def load_system_prompt() -> str:
    """Carga el system prompt del chef desde el .md"""
    if not PROMPT_PATH.exists():
        raise FileNotFoundError(
            f"No se encontró el system prompt en {PROMPT_PATH}. "
            f"Asegúrate de que el archivo existe."
        )
    return PROMPT_PATH.read_text(encoding="utf-8")


def load_skill_prompt(skill_key: str) -> str:
    """
    Carga el system prompt de una skill específica (ej: 'ficha', 'proceso_creativo').
    Por retrocompatibilidad, 'ficha' usa el system_chef.md clásico.

    Import local para evitar circular import: agent.py -> skills.py -> agent.py
    """
    if skill_key == "ficha":
        # Retrocompat: la skill original sigue viviendo en system_chef.md
        return load_system_prompt()
    from agents.creativo.skills import load_skill_prompt as _loader
    return _loader(skill_key)


def load_estacionalidad() -> dict:
    """Carga el calendario de estacionalidad de Cataluña."""
    if not ESTACIONALIDAD_PATH.exists():
        return {}
    return json.loads(ESTACIONALIDAD_PATH.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Catálogo de platos — inyectado al system prompt del chef
# ---------------------------------------------------------------------------

CATALOGO_MAX_PLATOS_INYECTADOS: int = 30  # cap para no inflar el system prompt


def load_catalogo() -> list[dict]:
    """Carga el catálogo de platos del restaurante (de la fase init).

    Devuelve lista vacía si no existe.
    """
    from agents.knowledge_context import cargar_catalogo
    try:
        return cargar_catalogo()
    except FileNotFoundError:
        return []


def load_restaurante() -> dict:
    """Carga el contexto del restaurante (de la fase init).

    Devuelve dict vacío si no existe.
    """
    from agents.knowledge_context import cargar_restaurante
    try:
        return cargar_restaurante()
    except FileNotFoundError:
        return {}


def formatear_restaurante_para_chef(restaurante: dict | None = None) -> str:
    """
    Formatea el contexto del restaurante para inyectarlo como contexto al chef.

    Args:
        restaurante: dict con los datos del restaurante. Si None, se carga del disco.

    Returns:
        String formateado, o string vacío si no hay datos.
    """
    if restaurante is None:
        restaurante = load_restaurante()

    if not restaurante:
        return ""

    # Mapeos de valores enum a descripciones legibles
    SOFISTICACION = {
        "muy_alta": "muy sofisticada (cocina de autor, alta gastronomía)",
        "alta": "alta (cocina refinada con producto destacado)",
        "media": "media (cocina cuidada pero accesible)",
        "baja": "baja (cocina honesta, producto noble sin alarde)",
        "muy_baja": "muy baja (cocina popular, producto básico bien tratado)",
    }
    GRUPOS = {
        "sin_grupos": "no recibís grupos",
        "con_grupos_pequenos": "recibís grupos pequeños",
        "con_grupos_grandes": "recibís grupos grandes",
        "banquetes_eventos": "banquetes y eventos son parte del negocio",
    }
    LOCALIZACION = {
        "urbana": "ubicación urbana",
        "rural": "ubicación rural",
        "litoral_mar": "cerca del mar",
        "montana": "en zona de montaña",
        "singular_edificio_historico": "en edificio singular o histórico",
    }
    TIEMPO = {
        "comida_rapida": "comida rápida (cliente sale en ~20 min)",
        "medio": "tiempo medio (cliente ~1h en mesa)",
        "slow_food": "slow food (cliente 2-3h, experiencia larga)",
    }
    ORIGEN = {
        "local_pueblo": "inspiración local / del pueblo",
        "regional_provincia": "inspiración regional / de la provincia",
        "nacional_pais": "inspiración nacional",
        "mediterraneo": "inspiración mediterránea",
        "latinoamericano": "inspiración latinoamericana",
        "asiatico": "inspiración asiática",
        "norte_europeo": "inspiración norte-europea",
        "frances_gourmet": "gastronomía francesa / gourmet",
        "internacional_fusion": "fusión internacional",
    }
    EPOCA = {
        "medieval": "medieval",
        "clasica_francesa": "clásica francesa",
        "tradicional_popular": "tradicional / popular",
        "rustica_pais": "rústica / de payés",
        "mediterranea_moderna": "mediterránea moderna",
        "nouvelle_cuisine": "nouvelle cuisine",
        "autor_contemporanea": "de autor / contemporánea",
        "street_food_gourmet": "street food gourmet",
        "casual_actual": "casual actual",
        "pizzeria_tradicional_italiana": "pizzería tradicional italiana",
        "pizzeria_contemporanea": "pizzería contemporánea",
        "casual_mediterraneo": "casual mediterráneo",
    }

    def fmt_lista(key: str, mapping: dict | None = None) -> str:
        """Formatea una lista de valores del restaurante."""
        vals = restaurante.get(key, [])
        if not vals:
            return ""
        if isinstance(vals, str):
            vals = [vals]
        if mapping:
            return ", ".join(mapping.get(v, v) for v in vals if v)
        return ", ".join(str(v) for v in vals if v)

    lineas = [
        "\n\n---\n",
        "## CONTEXTO DEL RESTAURANTE",
        "",
        "Estos son los datos del restaurante que el chef debe respetar SIEMPRE "
        "al generar fichas. NO propongas nada que contradiga estas decisiones.",
        "",
    ]

    # Nombre (si está)
    nombre = restaurante.get("nombre", "").strip()
    if nombre:
        lineas.append(f"**Restaurante**: {nombre}")
        lineas.append("")

    # Ticket medio
    pmin = restaurante.get("precio_target_min")
    pmax = restaurante.get("precio_target_max")
    pmoda = restaurante.get("precio_target_moda")
    if any(v is not None for v in (pmin, pmax, pmoda)):
        partes = []
        if pmin is not None:
            partes.append(f"mín {pmin}€")
        if pmax is not None:
            partes.append(f"máx {pmax}€")
        if pmoda is not None:
            partes.append(f"típico {pmoda}€")
        if partes:
            lineas.append(f"**Ticket medio por persona**: {', '.join(partes)}")
            lineas.append("")

    # Sofisticación
    sof = restaurante.get("sofisticacion", "").strip()
    if sof:
        lineas.append(f"**Sofisticación**: {SOFISTICACION.get(sof, sof)}")
        lineas.append("")

    # Productos dominantes
    prods = fmt_lista("productos_dominantes")
    if prods:
        lineas.append(f"**Productos que mandan en la cocina**: {prods}")
        lineas.append("")

    # Técnicas dominantes
    tecs = fmt_lista("tecnicas_dominantes")
    if tecs:
        lineas.append(f"**Técnicas / elaboraciones dominantes**: {tecs}")
        lineas.append("")

    # Tipo de servicio
    serv = fmt_lista("tipo_servicio")
    if serv:
        lineas.append(f"**Tipo de servicio**: {serv}")
        lineas.append("")

    # Grupos
    grp = restaurante.get("grupos", "").strip()
    if grp:
        lineas.append(f"**Política de grupos**: {GRUPOS.get(grp, grp)}")
        lineas.append("")

    # Clases de comensales
    cls = fmt_lista("clases_comedores")
    if cls:
        lineas.append(f"**Tipo de cliente objetivo**: {cls}")
        lineas.append("")

    # Origen / inspiración
    orig = restaurante.get("origen_inspiracion", "").strip()
    if orig:
        lineas.append(f"**Origen / inspiración**: {ORIGEN.get(orig, orig)}")
        lineas.append("")

    # Orientación nutricional
    nut = fmt_lista("orientacion_nutricional")
    if nut and nut != "ninguna":
        lineas.append(f"**Orientación nutricional prioritaria**: {nut}")
        lineas.append("")

    # Localización
    loc = restaurante.get("localizacion", "").strip()
    if loc:
        lineas.append(f"**Localización**: {LOCALIZACION.get(loc, loc)}")
        lineas.append("")

    # Religión / restricciones
    rel = fmt_lista("religion")
    if rel and rel != "ninguna":
        lineas.append(f"**Restricciones religiosas prioritarias**: {rel}")
        lineas.append("")

    # Tiempo
    tie = restaurante.get("tiempo_preparacion", "").strip()
    if tie:
        lineas.append(f"**Tiempo del comensal**: {TIEMPO.get(tie, tie)}")
        lineas.append("")

    # Época / estilo
    est = fmt_lista("epoca_estilo", EPOCA)
    if est:
        lineas.append(f"**Época / estilo**: {est}")
        lineas.append("")

    lineas.append("**REGLA DURA**: si el usuario pide algo que contradice estos datos, ")
    lineas.append("señalá la contradicción antes de generar la ficha. NO ignores estas decisiones.")
    lineas.append("")

    return "\n".join(lineas)


def formatear_catalogo_para_chef(catalogo: list[dict] | None = None) -> str:
    """
    Formatea el catálogo para inyectarlo como contexto al chef.

    Args:
        catalogo: lista de platos. Si None, se carga del disco.

    Returns:
        String con el catálogo formateado, o string vacío si no hay.
    """
    if catalogo is None:
        catalogo = load_catalogo()

    if not catalogo:
        return ""

    lineas = [
        "\n\n---\n",
        "## CATÁLOGO ACTUAL DEL RESTAURANTE",
        "",
        "Estos son los platos que ya están en la carta del restaurante.",
        "Usá esta información para:",
        "- NO proponer platos idénticos o muy similares a los existentes.",
        "- Sugerir COMPLEMENTOS: si ya hay una pasta, proponer un segundo plato de otra familia.",
        "- Mantener la LÍNEA CULINARIA: si la carta es mediterránea, no proponer sushi.",
        "- Si el usuario pide un plato similar a uno existente, ofrecé EXTENDER la línea "
        "(versión contemporánea, variante de temporada, etc.) en vez de duplicar.",
        "",
        f"Total de platos en carta: {len(catalogo)}.",
        "",
    ]

    # Limitar para no inflar el prompt
    platos_mostrar = catalogo[:CATALOGO_MAX_PLATOS_INYECTADOS]
    if len(catalogo) > CATALOGO_MAX_PLATOS_INYECTADOS:
        lineas.append(
            f"(mostrando los primeros {CATALOGO_MAX_PLATOS_INYECTADOS} de {len(catalogo)})\n"
        )

    # Agrupar por categoría para que sea más legible
    por_categoria: dict[str, list[dict]] = {}
    for p in platos_mostrar:
        cat = str(p.get("categoria", "otro")).strip().lower()
        por_categoria.setdefault(cat, []).append(p)

    for cat in sorted(por_categoria.keys()):
        lineas.append(f"### {cat.capitalize()}")
        for p in por_categoria[cat]:
            nombre = str(p.get("nombre", "")).strip()
            if not nombre:
                continue
            desc = str(p.get("descripcion", "")).strip()
            precio = p.get("precio")
            partes = [f"- **{nombre}**"]
            if desc:
                partes.append(f" — {desc}")
            if precio is not None:
                try:
                    partes.append(f" ({float(precio):.2f}€)")
                except (ValueError, TypeError):
                    pass
            lineas.append("".join(partes))
        lineas.append("")

    return "\n".join(lineas)


# --- Detección de idioma ----------------------------------------------------

def _es_principalmente_espanol(texto: str) -> bool:
    """
    Detecta si el texto está mayoritariamente en español.
    Excluye la sección 'PROMPT PARA IMAGEN' porque puede ir en inglés por convención.
    
    Heurística: cuenta palabras gatillo inglesas en el cuerpo.
    Si más del 8% de las palabras son gatillos ingleses → no es español.
    """
    # Recortar la sección de prompt para imagen (puede estar en inglés)
    prompt_markers = [
        "🎨 PROMPT PARA IMAGEN DEL PLATO",
        "PROMPT PARA IMAGEN DEL PLATO",
        "🎨 PROMPT PARA IMAGEN",
        "PROMPT PARA IMAGEN",
    ]
    cuerpo = texto
    for marker in prompt_markers:
        idx = cuerpo.find(marker)
        if idx != -1:
            cuerpo = cuerpo[:idx]
            break

    # Tokenizar: solo palabras de 2+ letras en alfabeto latino
    palabras = re.findall(r'\b[a-záéíóúñü]{2,}\b', cuerpo.lower())
    if len(palabras) < 10:
        return True  # muestra muy pequeña, asumimos OK

    inglesas = sum(1 for p in palabras if p in _PALABRAS_GATILLO_INGLES)
    ratio = inglesas / len(palabras)

    return ratio < 0.08


# --- Llamada a la API --------------------------------------------------------

def call_minimax(system_prompt: str, user_prompt: str, force_spanish: bool = True) -> str:
    """
    Llama a la API de MiniMax en modo OpenAI-compatible.
    
    Datos verificados contra documentación oficial de MiniMax:
      - Base URL:  https://api.minimax.io/v1
      - Endpoint:  POST /chat/completions
      - Auth:      Authorization: Bearer <MINIMAX_API_KEY>
      - Modelo:    MiniMax-M3 (1M context window)
    
    Fuentes:
      - https://platform.minimax.io/docs/guides/quickstart-preparation
      - https://platform.minimax.io/docs/api-reference/text-chat-openai
      - https://platform.minimax.io/docs/guides/models-intro
    
    Nota: MiniMax también expone un modo Anthropic-compatible (que la doc
    oficial recomienda como primera opción). Se mantiene el modo OpenAI
    porque el parser de response coincide exactamente con el código.
    Migrar a Anthropic es un upgrade futuro si aparece la necesidad
    de tool use / multi-agente nativo.
    """
    if not API_KEY:
        raise RuntimeError(
            "Falta MINIMAX_API_KEY en el entorno. "
            "Copia .env.example a .env y rellena tu clave."
        )
    if not BASE_URL:
        raise RuntimeError(
            "MINIMAX_BASE_URL está vacío. "
            "El default verificado es https://api.minimax.io/v1 "
            "(modo OpenAI-compatible). "
            "Ver: https://platform.minimax.io/docs/guides/quickstart-preparation"
        )

    url = f"{BASE_URL}/chat/completions"
    
    headers = {
        # Formato verificado contra docs oficiales de MiniMax
        # (modo OpenAI-compatible)
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }
    
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        # Parámetros estándar OpenAI-completions soportados por MiniMax.
        # temperature 0.8 = creatividad media-alta, adecuada para brainstorming culinario.
        # max_tokens 1500 = holgura para ficha técnica + maridaje + prompt de imagen.
        "temperature": 0.8,
        "max_tokens": 1500,
    }

    current_user_prompt = user_prompt
    current_temp = 0.8
    total_attempts = MAX_RETRIES + LANGUAGE_RETRIES
    last_error: Optional[Exception] = None
    language_failures = 0

    for attempt in range(1, total_attempts + 1):
        payload["messages"][1]["content"] = current_user_prompt
        payload["temperature"] = current_temp

        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                response = client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
                content = data["choices"][0]["message"]["content"]

                # Validación de idioma (solo si force_spanish=True)
                if force_spanish and not _es_principalmente_espanol(content):
                    language_failures += 1
                    if language_failures <= LANGUAGE_RETRIES:
                        print(
                            f"  [idioma] respuesta en inglés detectada "
                            f"(intento {language_failures}/{LANGUAGE_RETRIES}), "
                            f"reintentando con instrucción reforzada...",
                            file=sys.stderr,
                        )
                        # Reforzar instrucción de idioma y bajar temperatura
                        current_user_prompt = current_user_prompt + (
                            "\n\n---\n\n"
                            "⚠️⚠️⚠️ AVISO URGENTE PARA EL MODELO ⚠️⚠️⚠️\n"
                            "Tu respuesta anterior estaba en inglés. "
                            "ESTO ES UN ERROR GRAVE.\n"
                            "Debes responder ÍNTEGRAMENTE en CASTELLANO (español). "
                            "La única sección que admite inglés es "
                            "el PROMPT PARA IMAGEN DEL PLATO al final.\n"
                            "Reescribe TODO el cuerpo de la ficha en español. "
                            "No mezcles idiomas. Solo castellano."
                        )
                        current_temp = 0.2
                        continue
                    else:
                        # Agotados los reintentos de idioma: devolvemos igual
                        # pero loggeamos el warning
                        print(
                            f"  [idioma] ⚠️ agotados {LANGUAGE_RETRIES} reintentos, "
                            f"devolviendo respuesta mixta (español+inglés)",
                            file=sys.stderr,
                        )

                return content

        except (httpx.HTTPError, KeyError, ValueError) as e:
            last_error = e
            if attempt < total_attempts:
                print(f"  [retry {attempt}/{total_attempts}] Error: {e}", file=sys.stderr)
            continue

    raise RuntimeError(
        f"Falló la llamada a MiniMax tras {total_attempts} intentos: {last_error}"
    )


# --- Validación de estacionalidad --------------------------------------------

def check_estacionalidad(peticion: str, estacionalidad: dict) -> Optional[str]:
    """
    Busca ingredientes en la petición y avisa si alguno está fuera de temporada.
    Devuelve un string con la advertencia o None si todo OK.
    """
    if not estacionalidad:
        return None
    
    mes_actual = __import__("datetime").datetime.now().month
    meses_nombre = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio",
                    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    mes_actual_nombre = meses_nombre[mes_actual]
    
    pet_lower = peticion.lower()
    avisos = []
    
    # Iteramos solo el sub-diccionario de productos, no las claves raíz (region, fuente, etc.)
    productos_dict = estacionalidad.get("productos", {})
    for producto, meses in productos_dict.items():
        if producto in pet_lower and mes_actual not in meses:
            avisos.append(
                f"· {producto.capitalize()}: mejor en {', '.join(meses_nombre[m] for m in meses)}"
            )
    
    if avisos:
        return (
            f"\n⚠️  Aviso de estacionalidad ({mes_actual_nombre}):\n"
            + "\n".join(avisos)
            + "\n\nEl chef recibirá esta información como contexto. "
              "Si querés ignorar el aviso, simplemente no menciones el producto."
        )
    return None


# --- Loop principal ----------------------------------------------------------

# Comandos soportados en modo proceso_creativo.
# Estos se detectan al inicio del mensaje del usuario.
PROCESO_COMANDOS: set[str] = {
    "/estado", "/volver", "/ficha", "/reiniciar", "/salir",
    # Archivo de Ideas (PR 3)
    "/guardar", "/guardar ",
    "/ideas", "/ideas ",
    "/editar",
    "/olvidar", "/olvidar ",
    "/export-ideas",
    "/silenciar-contador",
    "/ayuda",
}


# ---------------------------------------------------------------------------
# Skill "ideas_creativas" — exploración conversacional de 10 ideas
# ---------------------------------------------------------------------------

# Estado en memoria: las últimas 10 ideas generadas y los métodos aplicados.
# Estructura:
#   {
#     "ultima_peticion": "...",
#     "ideas": [
#       {"n": 1, "nombre": "...", "tipo": "...", "por_que": "...", "semilla": "..."},
#       ...
#     ],
#     "historial_iteraciones": [...],
#   }
from threading import Lock as _Lock
_IDEAS_ESTADO: dict = {}
_IDEAS_LOCK = _Lock()

METODOS_CREATIVOS: list[str] = [
    "autóctono", "influencias externas", "búsqueda técnico-conceptual",
    "los sentidos", "el sexto sentido", "simbiosis dulce/salado",
    "productos comerciales", "deconstrucción", "minimalismo",
    "asociación", "inspiración", "adaptación", "sinergia",
]


def _parsear_idea_bloque(lineas: list[str]) -> dict | None:
    """
    Parsea un bloque de idea del output del LLM. Formato esperado:
        **N. [Nombre]**
        *Tipo:* ...
        *Por qué encaja:* ...
        *Semilla:* ...
    Devuelve dict con los campos o None si no se puede parsear.
    """
    if not lineas:
        return None
    import re
    primera = lineas[0].strip()
    # Buscar **N. Nombre**
    m = re.match(r'\*\*(\d+)\.\s+(.+?)\*\*', primera)
    if not m:
        return None
    n = int(m.group(1))
    nombre = m.group(2).strip()
    campos = {"n": n, "nombre": nombre, "tipo": "", "por_que": "", "semilla": ""}
    for linea in lineas[1:]:
        l = linea.strip()
        if l.startswith("*Tipo:*"):
            campos["tipo"] = l.replace("*Tipo:*", "").strip()
        elif l.startswith("*Por qu"):
            campos["por_que"] = l.split(":", 1)[1].strip()
        elif l.startswith("*Semilla:*"):
            campos["semilla"] = l.replace("*Semilla:*", "").strip()
    return campos


def _parsear_ideas_de_respuesta(respuesta: str) -> list[dict]:
    """
    Extrae todas las ideas numeradas de la respuesta del LLM.
    Cada bloque de idea empieza con **N. Nombre** y termina antes del próximo bloque o separador.
    """
    lineas = respuesta.split('\n')
    ideas: list[dict] = []
    bloque_actual: list[str] = []
    in_bloque = False

    import re
    for linea in lineas:
        if re.match(r'\*\*\d+\.', linea.strip()):
            # Nuevo bloque: guardar el anterior si existía
            if in_bloque and bloque_actual:
                idea = _parsear_idea_bloque(bloque_actual)
                if idea:
                    ideas.append(idea)
            bloque_actual = [linea]
            in_bloque = True
        elif in_bloque:
            # Si es separador (---) o línea vacía, terminamos el bloque
            if linea.strip().startswith('---') or (
                linea.strip() == '' and len(bloque_actual) > 1
            ):
                idea = _parsear_idea_bloque(bloque_actual)
                if idea:
                    ideas.append(idea)
                bloque_actual = []
                in_bloque = False
            else:
                bloque_actual.append(linea)
    # Última idea si quedó abierta
    if in_bloque and bloque_actual:
        idea = _parsear_idea_bloque(bloque_actual)
        if idea:
            ideas.append(idea)
    return ideas


def _generar_ideas_llm(peticion: str, ideas_previas: list[dict] | None = None) -> tuple[str, list[dict]]:
    """
    Pide al LLM 10 ideas creativas. Devuelve (respuesta_cruda, ideas_parseadas).
    Si ideas_previas está presente, le pide al LLM 10 ideas NUEVAS distintas.
    """
    system_prompt = load_skill_prompt("ideas_creativas")
    # Inyectar contexto del restaurante y catálogo
    restaurante_str = formatear_restaurante_para_chef(load_restaurante())
    catalogo_str = formatear_catalogo_para_chef(load_catalogo())
    if restaurante_str:
        system_prompt = system_prompt + restaurante_str
    if catalogo_str:
        system_prompt = system_prompt + catalogo_str

    if ideas_previas:
        # Pedir 10 nuevas evitando repetir las anteriores
        nombres_previos = ", ".join(i["nombre"] for i in ideas_previas[:10])
        user_msg = (
            f"{peticion}\n\n"
            f"IMPORTANTE: ya generaste estas 10 ideas antes, NO las repitas: {nombres_previos}. "
            f"Generá 10 ideas COMPLETAMENTE NUEVAS y distintas."
        )
    else:
        user_msg = peticion

    # Reforzar instrucción de idioma
    user_msg = user_msg + (
        "\n\n---\n\n"
        "⚠️ RECORDATORIO: Respondé SOLO en castellano. Sin caracteres cirílicos, hanzi, etc."
    )

    respuesta = call_minimax(system_prompt, user_msg)
    ideas = _parsear_ideas_de_respuesta(respuesta)
    return respuesta, ideas


def _aplicar_metodo_a_idea(idea: dict, metodo: str, peticion_original: str) -> str:
    """
    Pide al LLM que aplique un método creativo a una idea específica.
    Devuelve la respuesta del LLM (ya formateada con refinamiento + variaciones).
    """
    system_prompt = load_skill_prompt("ideas_creativas")
    restaurante_str = formatear_restaurante_para_chef(load_restaurante())
    catalogo_str = formatear_catalogo_para_chef(load_catalogo())
    if restaurante_str:
        system_prompt = system_prompt + restaurante_str
    if catalogo_str:
        system_prompt = system_prompt + catalogo_str

    user_msg = (
        f"El usuario quiere aplicar el método creativo '{metodo}' a esta idea:\n\n"
        f"**Idea {idea['n']}: {idea['nombre']}**\n"
        f"Tipo: {idea['tipo']}\n"
        f"Por qué encaja: {idea['por_que']}\n"
        f"Semilla: {idea['semilla']}\n\n"
        f"Recordá el contexto original del usuario: {peticion_original}\n\n"
        f"Devolvé:\n"
        f"1. La idea REFINADA con el método '{metodo}' aplicado (1-2 frases explicando cómo cambió)\n"
        f"2. 3-5 VARIACIONES derivadas de aplicar el método\n"
        f"3. Una mini-sección 'Por qué este método funciona acá' (1 frase)\n\n"
        f"Formato: castelano, sin markdown extravagante, conciso."
    )

    user_msg = user_msg + (
        "\n\n⚠️ RECORDATORIO: Respondé SOLO en castellano. Sin caracteres cirílicos, hanzi, etc."
    )
    return call_minimax(system_prompt, user_msg)


def _convertir_idea_a_ficha(idea: dict, peticion_original: str) -> str:
    """
    Convierte una idea en ficha técnica completa, usando la skill 'ficha' como base.
    """
    ficha_system = load_skill_prompt("ficha")
    restaurante_str = formatear_restaurante_para_chef(load_restaurante())
    catalogo_str = formatear_catalogo_para_chef(load_catalogo())
    if restaurante_str:
        ficha_system = ficha_system + restaurante_str
    if catalogo_str:
        ficha_system = ficha_system + catalogo_str

    user_msg = (
        f"Convertí esta idea creativa del usuario en una FICHA TÉCNICA completa:\n\n"
        f"**Idea {idea['n']}: {idea['nombre']}**\n"
        f"Tipo: {idea['tipo']}\n"
        f"Por qué encaja: {idea['por_que']}\n"
        f"Semilla: {idea['semilla']}\n\n"
        f"Contexto original del usuario: {peticion_original}\n\n"
        f"Devolvé la ficha con la estructura estándar: nombre, historia, ficha técnica "
        f"(ingredientes para 4 raciones + elaboración), maridaje, prompt de imagen en inglés."
    )

    user_msg = user_msg + (
        "\n\n⚠️ RECORDATORIO: Respondé SOLO en castellano. El único campo en inglés es el PROMPT PARA IMAGEN."
    )
    return call_minimax(ficha_system, user_msg)


def _ver_metodos() -> str:
    """Devuelve un listado de los métodos creativos disponibles."""
    lineas = ["💡 MÉTODOS CREATIVOS DISPONIBLES (de ElBulli + propios):\n"]
    for i, m in enumerate(METODOS_CREATIVOS, 1):
        lineas.append(f"  {i}. {m}")
    lineas.append("\n")
    lineas.append("Usá: 'aplicá [método] a la idea N'")
    lineas.append("Ejemplo: 'aplicá deconstrucción a la idea 3'")
    return "\n".join(lineas)


def procesar_mensaje_ideas_creativas(mensaje: str) -> str:
    """
    Handler principal de la skill 'ideas_creativas'.
    Detecta comandos y dispatcha al flujo apropiado.

    Comandos:
    - "más ideas" / "dame más" → 10 ideas nuevas
    - "aplicá [método] a la idea N" → refina + variaciones
    - "ficha de la idea N" → convierte a ficha técnica
    - "ver métodos" → lista métodos disponibles
    - cualquier otro mensaje → nueva petición de 10 ideas
    """
    global _IDEAS_ESTADO
    mensaje = (mensaje or "").strip()
    if not mensaje:
        return ""

    lower = mensaje.lower()

    # Comando: ver métodos
    if lower in ("ver métodos", "ver metodos", "métodos", "metodos"):
        return _ver_metodos()

    # Comando: más ideas
    if lower in ("más ideas", "mas ideas", "dame más", "dame mas", "dame 10 más", "dame otras 10"):
        with _IDEAS_LOCK:
            ideas_previas = _IDEAS_ESTADO.get("ideas", [])
            peticion = _IDEAS_ESTADO.get("ultima_peticion", "ideas creativas")
        if not ideas_previas:
            return "Todavía no generamos ideas. Decime qué tipo de ideas querés (ej: 'ideas para otoño')."
        respuesta, ideas = _generar_ideas_llm(peticion, ideas_previas=ideas_previas)
        with _IDEAS_LOCK:
            _IDEAS_ESTADO["ideas"] = ideas
        return respuesta

    # Comando: aplicar método a idea N
    # Formatos aceptados: "aplicá X a la idea 3", "aplicar X a la 3", "X a la idea 3"
    import re
    m = re.match(r'(?:aplic[áa]r?\s+)?(.+?)\s+(?:a\s+)?(?:la\s+)?(?:idea\s+)?(\d+)', lower)
    if m and any(pal in lower for pal in ("aplic", "a la idea", "a la ")):
        metodo = m.group(1).strip()
        n = int(m.group(2))
        with _IDEAS_LOCK:
            ideas = _IDEAS_ESTADO.get("ideas", [])
            peticion = _IDEAS_ESTADO.get("ultima_peticion", "")
        idea = next((i for i in ideas if i["n"] == n), None)
        if not idea:
            return f"❌ No tengo la idea {n}. Las ideas disponibles son: {', '.join(str(i['n']) for i in ideas) if ideas else '(ninguna)'}."
        try:
            return _aplicar_metodo_a_idea(idea, metodo, peticion)
        except Exception as e:
            return f"❌ Error aplicando método: {e}"

    # Comando: ficha de la idea N
    m = re.match(r'ficha\s+(?:de\s+)?(?:la\s+)?(?:idea\s+)?(\d+)', lower)
    if m:
        n = int(m.group(1))
        with _IDEAS_LOCK:
            ideas = _IDEAS_ESTADO.get("ideas", [])
            peticion = _IDEAS_ESTADO.get("ultima_peticion", "")
        idea = next((i for i in ideas if i["n"] == n), None)
        if not idea:
            return f"❌ No tengo la idea {n}."
        try:
            return _convertir_idea_a_ficha(idea, peticion)
        except Exception as e:
            return f"❌ Error generando ficha: {e}"

    # Mensaje por defecto: nueva petición de 10 ideas
    try:
        respuesta, ideas = _generar_ideas_llm(mensaje, ideas_previas=None)
        with _IDEAS_LOCK:
            _IDEAS_ESTADO["ultima_peticion"] = mensaje
            _IDEAS_ESTADO["ideas"] = ideas
        return respuesta
    except Exception as e:
        return f"❌ Error generando ideas: {e}"


def procesar_mensaje_chat(peticion: str) -> str:
    """
    Handler de la skill 'chat'.

    Conversación libre con el chef. Carga el system prompt, lo enriquece con
    el contexto del restaurante (ticket, línea, productos, carta) y las ideas
    guardadas (si hay), y devuelve la respuesta del modelo.

    No devuelve estructura fija — es texto conversacional.

    Args:
        peticion: pregunta o consulta libre del usuario.

    Returns:
        String con la respuesta del chef.
    """
    mensaje = (peticion or "").strip()
    if not mensaje:
        return ""

    # 1. Cargar prompt de la skill 'chat'
    system_prompt = load_skill_prompt("chat")

    # 2. Inyectar contexto del restaurante
    restaurante = load_restaurante()
    restaurante_str = formatear_restaurante_para_chef(restaurante)
    if restaurante_str:
        system_prompt = system_prompt + restaurante_str

    # 3. Inyectar catálogo de platos
    catalogo = load_catalogo()
    catalogo_str = formatear_catalogo_para_chef(catalogo)
    if catalogo_str:
        system_prompt = system_prompt + catalogo_str

    # 4. Inyectar ideas guardadas (memoria del proyecto)
    try:
        from agents.memoria.storage import init_db, load_ideas
        conn = init_db()
        try:
            ideas = load_ideas(conn, filtro={"limit": 10})
            if ideas:
                ideas_lines = ["\n\n[IDEAS GUARDADAS — memoria del proyecto]"]
                ideas_lines.append(
                    "El hostelero ha guardado las siguientes ideas en conversaciones "
                    "previas. Si alguna es relevante para su consulta actual, "
                    "mencionala (ej: 'De hecho, tenés guardada la idea #N sobre...').\n"
                )
                for i in ideas:
                    ideas_lines.append(f"- #{i['id']}: {i['idea'][:200]}")
                ideas_lines.append(
                    "\nEsto es contexto privado. NO lo listes entero en tu respuesta, "
                    "usá solo lo relevante a lo que el usuario pregunta."
                )
                system_prompt = system_prompt + "\n".join(ideas_lines)
        finally:
            conn.close()
    except Exception:
        # Si el módulo de memoria no está disponible o falla, seguimos sin él
        pass

    # 5. Recordatorio de idioma y llamada al modelo
    try:
        aviso = check_estacionalidad(mensaje, load_estacionalidad())
        contexto_adicional = ""
        if aviso:
            contexto_adicional = (
                f"\n\n[CONTEXTO PRIVADO — NO INCLUIR EN LA SALIDA]: {aviso}"
            )
        user_message = mensaje + contexto_adicional
        instruccion_idioma = (
            "\n\n---\n\n"
            "⚠️ RECORDATORIO FINAL ⚠️\n"
            "Responde SOLO en espa\u00f1ol (castellano). "
            "Prohibido: ingl\u00e9s, franc\u00e9s, cir\u00edlico, hanzi, kanji. "
            "Solo alfabeto latino."
        )
        user_message = user_message + instruccion_idioma
        respuesta = call_minimax(system_prompt, user_message)
        return respuesta
    except Exception as e:
        return f"❌ Error ({type(e).__name__}): {str(e)[:200]}"


def iniciar_proceso_creativo(peticion: str, sesion_id: str | None = None):
    """
    Inicia (o reanuda) una sesión del proceso creativo.

    Args:
        peticion: petición culinaria del usuario.
        sesion_id: si se pasa, reanuda una sesión existente.

    Returns:
        Instancia de ProcesoCreativo.
    """
    # Import local para evitar circular import
    from agents.creativo.proceso_creativo import ProcesoCreativo
    if sesion_id:
        return ProcesoCreativo(peticion="", cargar_de=sesion_id)
    return ProcesoCreativo(peticion=peticion)


def procesar_mensaje_proceso(sesion, mensaje: str) -> str:
    """
    Procesa un mensaje del usuario dentro de una sesión de proceso creativo.

    Soporta:
    - Comandos: /estado, /fase N|nombre, /volver, /ficha, /reiniciar, /salir
    - Mensaje normal: se interpreta como input para la fase actual.
      El chef trabaja la fase, y se marca como completa automáticamente.

    Args:
        sesion: instancia de ProcesoCreativo.
        mensaje: texto del usuario.

    Returns:
        String con la respuesta para mostrar al usuario.
    """
    from agents.creativo.proceso_creativo import FASES_POR_KEY, FASES

    mensaje = (mensaje or "").strip()
    if not mensaje:
        return ""

    # Comandos
    lower = mensaje.lower()

    if lower == "/estado":
        return sesion.resumen_estado()

    if lower.startswith("/fase "):
        arg = mensaje[6:].strip()
        # Acepta número (1-7) o nombre de fase
        target_key = None
        if arg.isdigit():
            idx = int(arg) - 1
            if 0 <= idx < len(FASES):
                target_key = FASES[idx]["key"]
        elif arg in FASES_POR_KEY:
            target_key = arg
        if not target_key:
            disponibles = ", ".join(f["key"] for f in FASES)
            return f"❌ Fase '{arg}' no reconocida. Disponibles: {disponibles}"
        sesion.ir_a_fase(target_key)
        return (
            f"↪️ Salté a la fase {target_key.upper()} — {FASES_POR_KEY[target_key]['nombre']}\n\n"
            f"{sesion.resumen_estado()}"
        )

    if lower == "/volver":
        if sesion.fase_actual_key is None:
            return "⚠️  No hay fase activa (el proceso está completo). Usá /fase 1 para volver al inicio."
        sesion.regenerar_fase_actual()
        return (
            f"↪️ Regenerando la fase {sesion.fase_actual_key.upper()}.\n\n"
            f"{sesion.resumen_estado()}"
        )

    if lower == "/ficha" or lower.startswith("/ficha "):
        forzar = "forzar" in lower
        try:
            ficha = sesion.generar_ficha_final(forzar=forzar)
            return (
                f"🍂 Ficha final generada.\n\n"
                f"---\n\n"
                f"{ficha}"
            )
        except ValueError as e:
            return f"❌ {e}"

    if lower == "/reiniciar":
        sesion.reiniciar()
        return f"↪️ Proceso reiniciado.\n\n{sesion.resumen_estado()}"

    if lower == "/salir":
        sesion.save()
        return (
            f"👋 Sesión guardada. Para reanudar: {sesion.sesion_id}\n\n"
            f"{sesion.resumen_estado()}"
        )

    # Mensaje normal: trabajar la fase actual con LLM y marcarla completa
    if sesion.fase_actual_key is None:
        return (
            "✅ Todas las fases están completas. Usá /ficha para generar la ficha final, "
            "o /fase 1 para volver al inicio."
        )

    # Capturar la fase ACTUAL antes de trabajar (porque después puede ser None)
    fase_trabajada = sesion.fase_actual

    # Aviso de estacionalidad como contexto (igual que en ficha normal)
    estacionalidad = load_estacionalidad()
    aviso = check_estacionalidad(mensaje, estacionalidad)
    contexto_adicional = ""
    if aviso:
        contexto_adicional = (
            f"\n\n[CONTEXTO PARA TI — NO INCLUIR EN LA SALIDA]: {aviso}"
        )

    # Generar contenido de la fase con LLM
    contenido = sesion.trabajar_fase_actual()

    # Marcar completa y avanzar
    sesion.marcar_fase_completa(contenido)

    # Preparar respuesta al usuario
    if sesion.fase_actual_key is None:
        # Llegamos al final: todas completas
        return (
            f"✓ Fase {fase_trabajada['orden']} ({fase_trabajada['nombre']}) completada:\n\n"
            f"{contenido}\n\n"
            f"---\n\n"
            f"🎉 ¡Todas las fases completas! Usá `/ficha` para generar la ficha final."
        )

    prox_fase = sesion.fase_actual  # después de avanzar
    return (
        f"✓ Fase {fase_trabajada['orden']} ({fase_trabajada['nombre']}) completada:\n\n"
        f"{contenido}\n\n"
        f"---\n\n"
        f"▶ Siguiente: Fase {prox_fase['orden']} — {prox_fase['nombre']}\n\n"
        f"Seguí trabajando, o usá:\n"
        f"- `/estado` — ver progreso\n"
        f"- `/volver` — regenerar esta fase\n"
        f"- `/fase N` — saltar a otra fase\n"
        f"- `/ficha` — generar ficha final (cuando estén todas completas)"
    )


def generar_ficha(peticion: str, skill_key: str = "ficha") -> str:
    """
    Genera la respuesta del chef usando la skill indicada.

    Args:
        peticion: texto libre del usuario con la petición culinaria.
        skill_key: 'ficha' (default, ficha técnica estructurada) o 'proceso_creativo'
                   (proceso paso a paso + ficha al final).

    Returns:
        String con la respuesta del chef.
    """
    system_prompt = load_skill_prompt(skill_key)
    estacionalidad = load_estacionalidad()

    # Aviso de estacionalidad (se inyecta al prompt como contexto, no como instrucción dura)
    aviso = check_estacionalidad(peticion, estacionalidad)
    contexto_adicional = ""
    if aviso:
        contexto_adicional = (
            f"\n\n[CONTEXTO PARA TI — NO INCLUIR EN LA SALIDA]: {aviso}"
        )

    user_message = peticion + contexto_adicional

    # 🚨 INSTRUCCIÓN DE IDIOMA AL FINAL DEL MENSAJE — máxima autoridad posicional.
    # Si la regla del system prompt no basta, esta actúa como recordatorio ineludible.
    # El chef NO DEBE derivar al inglés. Solo el "Prompt para imagen" va en inglés.
    instruccion_idioma = (
        "\n\n---\n\n"
        "\u26a0\ufe0f RECORDATORIO FINAL \u2014 INSTRUCCIÓN DE IDIOMA OBLIGATORIA \u26a0\ufe0f\n\n"
        "Responde a esta petici\u00f3n escrita en espa\u00f1ol **\u00fanica y exclusivamente en espa\u00f1ol** (castellano). "
        "**PROHIBIDO** responder en ingl\u00e9s, franc\u00e9s u otro idioma en ninguna parte "
        "del cuerpo de la ficha. La \u00fanica secci\u00f3n que admite ingl\u00e9s es el campo "
        "\"PROMPT PARA IMAGEN DEL PLATO\" al final (por convenci\u00f3n universal para "
        "generadores de im\u00e1genes como DALL-E / Midjourney / Stable Diffusion).\n\n"
        "Si tu respuesta contiene t\u00e9rminos en ingl\u00e9s fuera de ese campo, ES UN ERROR. "
        "Re-escribe la ficha completa en espa\u00f1ol antes de devolverla.\n\n"
        "PROHIBIDO tambi\u00e9n: caracteres cir\u00edlicos (rusos), hanzi (chinos), hangul (coreanos), "
        "kanji (japoneses). Solo alfabeto latino."
    )

    user_message = user_message + instruccion_idioma
    
    print(f"🍳 Generando (skill={skill_key}) para: \"{peticion}\"...\n", file=sys.stderr)
    respuesta = call_minimax(system_prompt, user_message)
    return respuesta


def _loop_ficha(skills: list[dict]) -> str | None:
    """
    Loop de la skill 'ficha': cada input genera una ficha y se queda ahí.
    Devuelve la skill_key si el usuario cambia de skill, None si sale.
    """
    print("Escribí tu petición culinaria y presioná Enter.")
    print("Comandos especiales:")
    print("  /skill        — cambiar skill")
    print("  /skills       — listar skills disponibles")
    print("  salir         — terminar\n")

    skill_key = "ficha"
    ultimo_assistant = None  # track last assistant response
    while True:
        try:
            peticion = input("➤ ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n¡Hasta luego!")
            return None

        if not peticion:
            continue
        if peticion.lower() in ("salir", "exit", "quit"):
            return None

        # Comandos de cambio de skill
        nueva = _manejar_comandos_skill(peticion, skill_key, skills)
        if nueva is not None and nueva != skill_key:
            return nueva  # cambia de skill
        if nueva == skill_key:
            continue  # comando procesado, misma skill, seguir

        # ── ARCHIVO DE IDEAS: transversal command dispatch ──
        try:
            from agents.memoria.commands import handle_command
            from agents.memoria.storage import init_db
            conn = init_db()
            try:
                cmd_result = handle_command(
                    peticion, ultimo_assistant, skill_key, conn
                )
            finally:
                conn.close()
            if cmd_result is not None:
                print("\n" + cmd_result["content"] + "\n")
                print("-" * 60 + "\n")
                continue
        except Exception as e:
            print(f"\n⚠️ Error en archivo de ideas: {e}\n")
            continue
        # ── end ARCHIVO DE IDEAS ──

        try:
            ficha = generar_ficha(peticion, skill_key=skill_key)
            print("\n" + ficha + "\n")
            ultimo_assistant = ficha  # track for /guardar
            print("-" * 60 + "\n")
        except Exception as e:
            print(f"\n❌ Error: {e}\n", file=sys.stderr)


def _loop_proceso_creativo(skills: list[dict], sesion_inicial=None) -> str | None:
    """
    Loop de la skill 'proceso_creativo': state machine con 7 fases.
    Devuelve la skill_key si el usuario cambia de skill, None si sale.

    Args:
        skills: lista de skills disponibles (para comandos /skill).
        sesion_inicial: si se pasa, se usa esa sesión en vez de crear una nueva.
    """
    from agents.creativo.proceso_creativo import listar_sesiones_activas
    # _iniciar y procesar_mensaje_proceso viven en este mismo módulo (agent.py)
    _iniciar = iniciar_proceso_creativo
    _procesar = procesar_mensaje_proceso

    sesion = sesion_inicial

    print("🍂  PROCESO CREATIVO — state machine de 7 fases")
    print()
    print("Cada mensaje que escribas hace que el chef trabaje la fase actual.")
    print("Las fases se guardan automáticamente. Podés cerrar y volver.")
    print()
    print("Comandos especiales:")
    print("  /estado       — ver progreso de las 7 fases")
    print("  /fase N       — saltar a fase N (1-7) o por nombre")
    print("  /volver       — regenerar la fase actual")
    print("  /ficha        — generar ficha final (auto cuando estén todas)")
    print("  /ficha forzar — generar aunque falten fases")
    print("  /reiniciar    — volver al inicio con la misma petición")
    print("  /sesiones     — listar sesiones guardadas")
    print("  /reanudar ID  — retomar una sesión anterior")
    print("  /skill        — cambiar a otra skill")
    print("  /skills       — listar skills disponibles")
    print("  salir         — terminar")
    print()

    # Si nos pasaron una sesión inicial, mostramos su estado
    if sesion is not None:
        print(f"▶ Sesión activa: {sesion.sesion_id}")
        print()
        print(sesion.resumen_estado())
        print()

    ultimo_assistant = None  # track last assistant response
    while True:
        try:
            mensaje = input("➤ ").strip()
        except (EOFError, KeyboardInterrupt):
            if sesion is not None:
                sesion.save()
            print("\n¡Hasta luego!")
            return None

        if not mensaje:
            continue
        if mensaje.lower() in ("salir", "exit", "quit"):
            if sesion is not None:
                sesion.save()
                print(f"\n👋 Sesión guardada: {sesion.sesion_id}")
            return None

        # Comandos de cambio de skill (mata la sesión actual)
        nueva = _manejar_comandos_skill(mensaje, "proceso_creativo", skills)
        if nueva is not None and nueva != "proceso_creativo":
            if sesion is not None:
                sesion.save()
                print(f"\n(Sesión guardada: {sesion.sesion_id})")
            return nueva
        if nueva == "proceso_creativo":
            continue

        # ── ARCHIVO DE IDEAS: transversal command dispatch ──
        try:
            from agents.memoria.commands import handle_command
            from agents.memoria.storage import init_db
            conn = init_db()
            try:
                cmd_result = handle_command(
                    mensaje, ultimo_assistant, "proceso_creativo", conn
                )
            finally:
                conn.close()
            if cmd_result is not None:
                print("\n" + cmd_result["content"] + "\n")
                print("-" * 60 + "\n")
                continue
        except Exception as e:
            print(f"\n⚠️ Error en archivo de ideas: {e}\n")
            continue
        # ── end ARCHIVO DE IDEAS ──

        # Comandos especiales del proceso creativo
        lower = mensaje.lower()

        if lower == "/sesiones":
            sesiones = listar_sesiones_activas()
            if not sesiones:
                print("\n  (no hay sesiones guardadas)\n")
            else:
                print("\n  Sesiones guardadas:")
                for s in sesiones[:10]:
                    estado = "✓" if s.get("completa") else "▶"
                    print(f"    {estado} {s['sesion_id']}  —  {s['peticion'][:50]}")
                print()
            continue

        if lower.startswith("/reanudar "):
            sesion_id = mensaje[len("/reanudar "):].strip()
            try:
                sesion = _iniciar("", sesion_id=sesion_id)
                print(f"\n↪️  Sesión reanudada: {sesion.sesion_id}\n")
                print(sesion.resumen_estado())
                print()
            except FileNotFoundError as e:
                print(f"\n❌ {e}\n")
            continue

        # Primer mensaje o mensaje normal: crear o usar sesión
        if sesion is None:
            sesion = _iniciar(mensaje)
            print(f"\n🆕 Sesión: {sesion.sesion_id}")
            print()
            print(sesion.resumen_estado())
            print()
            print("Cuando me digas 'siguiente' (o cualquier cosa), trabajo la fase 1.")
            print()
            continue

        try:
            respuesta = _procesar(sesion, mensaje)
            print()
            print(respuesta)
            print()
            ultimo_assistant = respuesta  # track for /guardar
            print("-" * 60)
            print()
        except Exception as e:
            print(f"\n❌ Error: {e}\n", file=sys.stderr)


def _loop_ideas_creativas(skills: list[dict]) -> str | None:
    """
    Loop de la skill 'ideas_creativas': exploración conversacional de 10 ideas.
    Comandos: más ideas, aplicá [método] a la idea N, ficha de la idea N, ver métodos.
    Devuelve la skill_key si cambia, None si sale.
    """
    print("💡  IDEAS CREATIVAS — exploración de 10 ideas")
    print()
    print("Decime qué tipo de ideas querés (ej: 'ideas para otoño').")
    print("Después podés iterar con:")
    print("  más ideas                          — 10 ideas nuevas")
    print("  aplicá [método] a la idea N       — refina con un método creativo")
    print("  ficha de la idea N                — convierte en ficha técnica")
    print("  ver métodos                       — lista de métodos disponibles")
    print("  /skill                            — cambiar a otra skill")
    print("  salir                             — terminar")
    print()

    ultimo_assistant = None  # track last assistant response
    while True:
        try:
            mensaje = input("➤ ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n¡Hasta luego!")
            return None

        if not mensaje:
            continue
        if mensaje.lower() in ("salir", "exit", "quit"):
            return None

        # Comandos de cambio de skill
        nueva = _manejar_comandos_skill(mensaje, "ideas_creativas", skills)
        if nueva is not None and nueva != "ideas_creativas":
            return nueva
        if nueva == "ideas_creativas":
            continue

        # ── ARCHIVO DE IDEAS: transversal command dispatch ──
        try:
            from agents.memoria.commands import handle_command
            from agents.memoria.storage import init_db
            conn = init_db()
            try:
                cmd_result = handle_command(
                    mensaje, ultimo_assistant, "ideas_creativas", conn
                )
            finally:
                conn.close()
            if cmd_result is not None:
                print("\n" + cmd_result["content"] + "\n")
                print("-" * 60 + "\n")
                continue
        except Exception as e:
            print(f"\n⚠️ Error en archivo de ideas: {e}\n")
            continue
        # ── end ARCHIVO DE IDEAS ──

        try:
            respuesta = procesar_mensaje_ideas_creativas(mensaje)
            print()
            print(respuesta)
            print()
            ultimo_assistant = respuesta  # track for /guardar
            print("-" * 60)
            print()
        except Exception as e:
            print(f"\n❌ Error: {e}\n", file=sys.stderr)


def _loop_chat(skills: list[dict]) -> str | None:
    """
    Loop de la skill 'chat': conversación libre con el chef.
    Cada mensaje se responde usando el contexto del restaurante.
    Devuelve la skill_key si cambia, None si sale.
    """
    print("💬  CHAT CON EL CHEF — conversación libre")
    print()
    print("Hacé preguntas o pedí consejo sobre tu restaurante.")
    print("El chef usa todo el contexto (restaurante, carta, ideas guardadas).")
    print()
    print("Comandos especiales:")
    print("  /skill        — cambiar skill")
    print("  /skills       — listar skills disponibles")
    print("  salir         — terminar")
    print()

    ultimo_assistant = None
    while True:
        try:
            mensaje = input("➤ ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n¡Hasta luego!")
            return None

        if not mensaje:
            continue
        if mensaje.lower() in ("salir", "exit", "quit"):
            return None

        # Comandos de cambio de skill
        nueva = _manejar_comandos_skill(mensaje, "chat", skills)
        if nueva is not None and nueva != "chat":
            return nueva
        if nueva == "chat":
            continue

        # ── ARCHIVO DE IDEAS: transversal command dispatch ──
        try:
            from agents.memoria.commands import handle_command
            from agents.memoria.storage import init_db
            conn = init_db()
            try:
                cmd_result = handle_command(
                    mensaje, ultimo_assistant, "chat", conn
                )
            finally:
                conn.close()
            if cmd_result is not None:
                print("\n" + cmd_result["content"] + "\n")
                print("-" * 60 + "\n")
                continue
        except Exception as e:
            print(f"\n⚠️ Error en archivo de ideas: {e}\n")
            continue
        # ── end ARCHIVO DE IDEAS ──

        try:
            respuesta = procesar_mensaje_chat(mensaje)
            print()
            print(respuesta)
            print()
            ultimo_assistant = respuesta
            print("-" * 60 + "\n")
        except Exception as e:
            print(f"\n❌ Error: {e}\n", file=sys.stderr)


def _manejar_comandos_skill(mensaje: str, skill_actual: str, skills: list[dict]) -> str | None:
    """
    Maneja comandos de cambio de skill (/skill, /skills) de forma transversal.
    Devuelve:
        - None: no era un comando de skill
        - skill_actual: era un comando de skill pero la skill no cambió
        - otra_key: era un comando de skill y el usuario eligió cambiar
    """
    lower = mensaje.lower()

    if lower == "/skills":
        print("\nSkills disponibles:")
        for s in skills:
            marker = " (actual)" if s["key"] == skill_actual else ""
            print(f"  · {s['nombre']}{marker}  —  {s['descripcion']}")
        print()
        return skill_actual  # procesado, misma skill

    if lower == "/skill":
        print("\nCambiar skill:")
        for i, s in enumerate(skills, 1):
            marker = " (actual)" if s["key"] == skill_actual else ""
            print(f"  {i}. {s['nombre']}{marker}")
        while True:
            r = input(f"   Elige 1-{len(skills)} > ").strip()
            if r.isdigit() and 1 <= int(r) <= len(skills):
                nueva_key = skills[int(r) - 1]["key"]
                if nueva_key != skill_actual:
                    nueva_nombre = next(s["nombre"] for s in skills if s["key"] == nueva_key)
                    print(f"\n✓ Cambiando a: {nueva_nombre}\n")
                return nueva_key
            print(f"   (elegí un número entre 1 y {len(skills)})")

    return None  # no era un comando de skill


def modo_interactivo():
    """Modo interactivo por línea de comandos. Selector de skill + dispatch."""
    # Bootstrap del contexto compartido del restaurante.
    # Si faltan los archivos, hace las preguntas automáticamente.
    from agents.knowledge_context import ensure_initialized, cargar_restaurante, cargar_catalogo
    if ensure_initialized():
        print("(A partir de ahora, el agente conoce tu restaurante y catálogo.)\n")

    # Cargar lista de skills disponibles dinámicamente
    from agents.creativo.skills import list_skills

    print("=" * 60)
    print("🍂 Chef Creativo — Modo Interactivo")
    print("=" * 60)
    rest = cargar_restaurante()
    if rest.get("nombre"):
        print(f"Restaurante: {rest.get('nombre')}")

    # Default: chat libre con el chef (no forzamos elección de skill)
    skills = list_skills()
    skill_key = "chat"
    skill_actual = next(s for s in skills if s["key"] == skill_key)
    print(f"\n✓ Skill activa: {skill_actual['nombre']}")
    print("  Escribí lo que quieras — el chef responde usando el contexto del restaurante.")
    print("  Cuando quieras una skill específica, tipeá /skill (o /skills para listar).\n")

    # Dispatch al loop apropiado
    while True:
        if skill_key == "proceso_creativo":
            skill_key = _loop_proceso_creativo(skills)
            if skill_key is None:
                break
        elif skill_key == "ideas_creativas":
            skill_key = _loop_ideas_creativas(skills)
            if skill_key is None:
                break
        elif skill_key == "chat":
            skill_key = _loop_chat(skills)
            if skill_key is None:
                break
        else:
            skill_key = _loop_ficha(skills)
            if skill_key is None:
                break
        # Si el usuario cambió skill, vuelve al inicio del while
        nueva = next(s for s in skills if s["key"] == skill_key)
        print(f"\n✓ Skill activa: {nueva['nombre']}\n")


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "ideas":
        # Modo CLI directo para ideas creativas:
        #   python -m agents.creativo.agent ideas [peticion]
        from agents.creativo.skills import list_skills
        from agents.creativo.agent import procesar_mensaje_ideas_creativas as _proc_ideas
        skills = list_skills()
        # Bucle simple: imprime respuesta, lee siguiente mensaje, repite
        peticion_inicial = " ".join(sys.argv[2:]).strip() if len(sys.argv) > 2 else None
        ultimo_assistant = None
        if peticion_inicial:
            print(_proc_ideas(peticion_inicial))
        while True:
            try:
                msg = input("➤ ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\n¡Hasta luego!")
                break
            if not msg:
                continue
            if msg.lower() in ("salir", "exit", "quit"):
                break
            # ── ARCHIVO DE IDEAS: transversal command dispatch ──
            try:
                from agents.memoria.commands import handle_command
                from agents.memoria.storage import init_db
                conn = init_db()
                try:
                    cmd_result = handle_command(
                        msg, ultimo_assistant, "ideas_creativas", conn
                    )
                finally:
                    conn.close()
                if cmd_result is not None:
                    print(cmd_result["content"])
                    continue
            except Exception as e:
                print(f"⚠️ Error en archivo de ideas: {e}")
                continue
            # ── end ARCHIVO DE IDEAS ──
            print(_proc_ideas(msg))
        return

    if len(sys.argv) > 1 and sys.argv[1] == "pc":
        # Modo CLI directo para proceso creativo:
        #   python -m agents.creativo.agent pc [--reanudar SESION_ID] [peticion]
        args = sys.argv[2:]

        reanudar_id = None
        peticion = None
        i = 0
        while i < len(args):
            if args[i] == "--reanudar" and i + 1 < len(args):
                reanudar_id = args[i + 1]
                i += 2
            else:
                peticion = " ".join(args[i:])
                break

        from agents.creativo.skills import list_skills

        if reanudar_id:
            sesion = iniciar_proceso_creativo("", sesion_id=reanudar_id)
        elif peticion:
            sesion = iniciar_proceso_creativo(peticion)
        else:
            sesion = None

        if sesion is not None:
            print(sesion.resumen_estado())
            print()

        # Loop interactivo enfocado solo en proceso creativo
        skills = list_skills()
        _loop_proceso_creativo(skills, sesion_inicial=sesion)
    elif len(sys.argv) > 1:
        # Modo CLI: un solo argumento = una sola ficha
        peticion = " ".join(sys.argv[1:])
        ficha = generar_ficha(peticion)
        print(ficha)
    else:
        # Sin argumentos = modo interactivo
        modo_interactivo()


if __name__ == "__main__":
    main()