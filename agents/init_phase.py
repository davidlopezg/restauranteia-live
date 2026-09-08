"""
init_phase.py — fase de inicialización de un agente.

Se corre UNA SOLA VEZ, la primera vez que se usa cualquier agente del proyecto.
Recolecta 15 dimensiones conceptuales del restaurante y catálogo de platos,
y los guarda en conocimiento/interno_restaurante/ para que estén disponibles para todos
los agentes del proyecto.

Entrada CLI explícita:
    python -m agents.init_phase

Típicamente se invoca automáticamente vía `ensure_initialized()` desde el entry
point de cada agente (modo_interactivo() para CLI, __main__ para app.py).
"""

from __future__ import annotations

import json
from pathlib import Path

from agents.knowledge_context import (
    RESTAURANTE_PATH,
    CATALOGO_PATH,
)


# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  OPCIONES EXTERNALIZADAS — cargar desde init_options.json                 ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
#
# Si una pregunta tiene su key en _OPCIONES_EXT, sus opciones vienen del JSON
# (fuente de verdad). Si no, fallback a las opciones hardcoded en el código.
# Esto permite extender/agregar opciones sin tocar init_phase.py.

_OPTIONS_PATH = Path(__file__).parent / "init_options.json"

# Sufijo que se ofrece automáticamente al final de cada choice/multichoice.
# Si el usuario lo elige, se le pide input libre y se agrega al resultado.
OTRO_LITERAL = "__otra__"
SUFIJO_OTRA = "otra (escribir)"


def _cargar_opciones_externas() -> dict:
    """Carga las opciones externalizadas desde init_options.json.
    Devuelve dict {key_pregunta: {"type": ..., "values": [...]}}.
    Si el archivo no existe o está malformado, devuelve {} (fallback a código).
    """
    if not _OPTIONS_PATH.exists():
        return {}
    try:
        with _OPTIONS_PATH.open(encoding="utf-8") as f:
            data = json.load(f)
        return data.get("options", {})
    except (json.JSONDecodeError, OSError) as e:
        print(f"⚠️  No se pudo cargar init_options.json: {e}")
        print("   Se usan las opciones hardcoded en el código como fallback.")
        return {}


_OPCIONES_EXT: dict = _cargar_opciones_externas()


def _opciones_para(key: str, fallback: list[str] | None = None) -> list[str]:
    """Devuelve las opciones para una pregunta: del JSON si existen, sino del código."""
    if key in _OPCIONES_EXT:
        return list(_OPCIONES_EXT[key].get("values", []))
    return list(fallback or [])


# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  PREGUNTAS — Cada dict define una dimensión del restaurante.              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
#
# Tipos de pregunta:
#   - "number":     pide un número
#   - "choice":     una opción de N
#   - "multichoice": varias opciones de N (índices separados por coma)
#   - "text":       input libre
#
# Campos:
#   - "key":     clave en restaurante.json
#   - "prompt":  texto que ve el usuario
#   - "type":    uno de los 4 tipos de arriba
#   - "options": lista (solo para choice / multichoice)
#   - "help":    (opcional) texto auxiliar

PREGUNTAS_RESTAURANTE: list[dict] = [
    # ─── PRECIO / TARGET ────────────────────────────────────────────────────
    {
        "key": "precio_target_min",
        "prompt": "Ticket medio mínimo que querés ofrecer (en €, por persona)",
        "type": "number",
        "help": "Por ej: 30",
    },
    {
        "key": "precio_target_max",
        "prompt": "Ticket medio máximo que querés ofrecer (en €, por persona)",
        "type": "number",
        "help": "Por ej: 80",
    },
    {
        "key": "precio_target_moda",
        "prompt": "Ticket medio 'modo' (el más típico que apuntás, en €)",
        "type": "number",
        "help": "Por ej: 50",
    },
    # ─── SOFISTICACIÓN ───────────────────────────────────────────────────────
    {
        "key": "sofisticacion",
        "prompt": "Sofisticación de la oferta",
        "type": "choice",
        "options": ["muy_alta", "alta", "media", "baja", "muy_baja"],
        "help": "De muy sofisticada a muy básica.",
    },
    # ─── PRODUCTOS DOMINANTES ────────────────────────────────────────────────
    {
        "key": "productos_dominantes",
        "prompt": "Productos dominantes de tu cocina (podés elegir varios)",
        "type": "multichoice",
        "options": [
            "vegetales", "carne", "pescado", "mariscos",
            "integrales", "lacteos", "fermentados", "fruta",
            "legumbres", "cereales_granos", "setas",
        ],
        "help": "Los productos que más mandan en tu carta.",
    },
    # ─── TÉCNICAS DOMINANTES ─────────────────────────────────────────────────
    {
        "key": "tecnicas_dominantes",
        "prompt": "Técnicas / elaboraciones dominantes (podés elegir varias)",
        "type": "multichoice",
        "options": [
            "brasas", "arroces", "ahumado", "fermentacion",
            "crudo", "baja_temperatura", "fritura", "guisos",
            "plancha", "horno_leña", "vapor", "salazón",
        ],
        "help": "Las técnicas que más usás día a día.",
    },
    # ─── TIPO DE SERVICIO ────────────────────────────────────────────────────
    {
        "key": "tipo_servicio",
        "prompt": "Tipo de servicio principal (podés elegir varios)",
        "type": "multichoice",
        "options": [
            "servicio_tradicional", "barra", "autoservicio",
            "take_away", "delivery", "catering_eventos",
        ],
        "help": "Cómo recibís al cliente.",
    },
    # ─── GRUPOS ──────────────────────────────────────────────────────────────
    {
        "key": "grupos",
        "prompt": "¿Cómo es tu política con grupos?",
        "type": "choice",
        "options": [
            "sin_grupos",
            "con_grupos_pequenos",
            "con_grupos_grandes",
            "banquetes_eventos",
        ],
        "help": "Si no recibís grupos vs. si los banquetes son parte del negocio.",
    },
    # ─── CLASES DE COMEDORES ─────────────────────────────────────────────────
    {
        "key": "clases_comedores",
        "prompt": "Clase de comedores (podés elegir varias)",
        "type": "multichoice",
        "options": ["privados_vip", "sociales_familia", "mixto", "business", "turistas"],
        "help": "A qué tipo de cliente apuntás.",
    },
    # ─── ORIGEN / INSPIRACIÓN ────────────────────────────────────────────────
    {
        "key": "origen_inspiracion",
        "prompt": "Origen o inspiración geográfica / sociopolítica dominante",
        "type": "choice",
        "options": [
            "local_pueblo",
            "regional_provincia",
            "nacional_pais",
            "mediterraneo",
            "latinoamericano",
            "asiatico",
            "norte_europeo",
            "frances_gourmet",
            "internacional_fusion",
        ],
        "help": "De dónde viene la inspiración principal de tu cocina.",
    },
    # ─── ORIENTACIÓN NUTRICIONAL ─────────────────────────────────────────────
    {
        "key": "orientacion_nutricional",
        "prompt": "Orientación nutricional prioritaria (podés elegir varias)",
        "type": "multichoice",
        "options": [
            "ninguna",
            "origen_producto",
            "vegetariana",
            "vegana",
            "sin_gluten",
            "baja_azucar",
            "baja_sal",
            "ecologica_bio",
            "km0",
            "temporada",
        ],
        "help": "Lo que ofrecés como identidad nutricional o valores.",
    },
    # ─── LOCALIZACIÓN ────────────────────────────────────────────────────────
    {
        "key": "localizacion",
        "prompt": "Localización del restaurante",
        "type": "choice",
        "options": ["urbana", "rural", "litoral_mar", "montana", "singular_edificio_historico"],
        "help": "Dónde está físicamente (afecta producto y oferta).",
    },
    # ─── RELIGIÓN / RESTRICCIONES ────────────────────────────────────────────
    {
        "key": "religion",
        "prompt": "Restricciones religiosas prioritarias que manejás (varias)",
        "type": "multichoice",
        "options": [
            "ninguna",
            "musulmana_halal",
            "judia_kosher",
            "hindu_vegetariana",
            "budista",
        ],
        "help": "Si tu cocina contempla estas restricciones de forma estable.",
    },
    # ─── TIEMPO ──────────────────────────────────────────────────────────────
    {
        "key": "tiempo_preparacion",
        "prompt": "Tiempo de preparación / ingestión del comensal",
        "type": "choice",
        "options": ["comida_rapida", "medio", "slow_food"],
        "help": "Si tu cliente está 20 minutos o 3 horas en la mesa.",
    },
    # ─── ÉPOCA / ESTILO ──────────────────────────────────────────────────────
    {
        "key": "epoca_estilo",
        "prompt": "Época, movimiento o estilo dominante (podés elegir varios)",
        "type": "multichoice",
        "options": [
            "medieval",
            "clasica_francesa",
            "tradicional_popular",
            "rustica_pais",
            "mediterranea_moderna",
            "nouvelle_cuisine",
            "autor_contemporanea",
            "street_food_gourmet",
            "casual_actual",
        ],
        "help": "La corriente / estilo que más te representa.",
    },
]

PREGUNTAS_POR_PLATO: list[dict] = [
    {
        "key": "nombre",
        "prompt": "Nombre del plato",
        "type": "text",
        "help": "Ej: Risotto de setas con trufa",
    },
    {
        "key": "categoria",
        "prompt": "Categoría del plato",
        "type": "choice",
        "options": ["entrante", "principal", "postre", "guarnicion", "bebida", "otro"],
    },
    {
        "key": "descripcion",
        "prompt": "Descripción breve (opcional, dejá vacío para saltar)",
        "type": "text",
        "help": "Una línea: qué es, qué lleva, qué lo hace especial.",
    },
    {
        "key": "precio",
        "prompt": "Precio en € (opcional, dejá vacío para saltar)",
        "type": "number",
        "help": "Sin moneda ni símbolos. Ej: 18.50",
    },
]


# ═══════════════════════════════════════════════════════════════════════════════
# Inputs por consola — UI adaptativa según tipo
# ═══════════════════════════════════════════════════════════════════════════════

def _ask_header(prompt: str, help_text: str | None = None) -> None:
    """Imprime el prompt + ayuda antes de pedir input."""
    print(f"\n➤ {prompt}")
    if help_text:
        print(f"   ({help_text})")


def _input_text(prompt: str, help_text: str | None = None, allow_empty: bool = True) -> str:
    """Input libre. Si allow_empty=True, acepta vacío."""
    _ask_header(prompt, help_text)
    return input("   > ").strip()


def _input_number(prompt: str, help_text: str | None = None) -> float:
    """Input numérico (acepta entero o decimal). Reintenta si no parsea."""
    _ask_header(prompt, help_text)
    while True:
        r = input("   > ").strip()
        try:
            return float(r)
        except ValueError:
            print("   (introduce un número válido)")


def _input_choice(prompt: str, options: list[str], help_text: str | None = None) -> str:
    """Elige UNO de N opciones numeradas. Última opción = 'otra (escribir)' para input libre."""
    print(f"\n➤ {prompt}")
    if help_text:
        print(f"   ({help_text})")
    for i, opt in enumerate(options, 1):
        print(f"   {i}. {opt}")
    otra_idx = len(options) + 1
    print(f"   {otra_idx}. {SUFIJO_OTRA}")
    while True:
        r = input(f"   Elige 1-{otra_idx} > ").strip()
        if r.isdigit() and 1 <= int(r) <= otra_idx:
            idx = int(r)
            if idx <= len(options):
                return options[idx - 1]
            # Eligió 'otra': pedir input libre
            custom = input("   Escribí tu opción > ").strip()
            if custom:
                return custom
            print("   (opción vacía, volvé a elegir)")
        else:
            print(f"   (elegí un número entre 1 y {otra_idx})")


def _input_multichoice(prompt: str, options: list[str], help_text: str | None = None) -> list[str]:
    """Elige VARIOS de N opciones. Última opción = 'otra (escribir)' para agregar customs.
    Si la lista numerada contiene la opción 'otra', se pide texto libre y se suma al resultado.
    Vacío = [].
    """
    print(f"\n➤ {prompt}")
    if help_text:
        print(f"   ({help_text})")
    for i, opt in enumerate(options, 1):
        print(f"   {i}. {opt}")
    otra_idx = len(options) + 1
    print(f"   {otra_idx}. {SUFIJO_OTRA}")
    print(f"   (separá los números con coma, ej: 1,3,5 — vacío = ninguno)")
    while True:
        r = input("   > ").strip()
        if not r:
            return []
        partes = [p.strip() for p in r.split(",") if p.strip()]
        if not partes:
            return []
        nums = []
        invalido = False
        for p in partes:
            if not p.isdigit():
                invalido = True
                break
            n = int(p)
            if n < 1 or n > otra_idx:
                invalido = True
                break
            nums.append(n)
        if invalido:
            print(f"   (formato: 1,3,5 — números válidos (1 a {otra_idx}) separados por coma)")
            continue
        nums_unicos = sorted(set(nums))
        # ¿Eligió 'otra'?
        if otra_idx in nums_unicos:
            nums_unicos.remove(otra_idx)
            seleccion_numerada = [options[i - 1] for i in nums_unicos]
            custom_raw = input(
                "   Escribí tu/s opción/es custom (varias separadas por coma) > "
            ).strip()
            if custom_raw:
                customs = [c.strip() for c in custom_raw.split(",") if c.strip()]
                return seleccion_numerada + customs
            # Eligió 'otra' pero no escribió nada: devolvemos solo las numeradas
            return seleccion_numerada
        # Sin 'otra': devolver las numeradas
        return [options[i - 1] for i in nums_unicos]


def _ask_question(q: dict):
    """Dispatcher: ejecuta una pregunta según su type y devuelve el valor.
    Las options se resuelven desde init_options.json si la key está ahí,
    sino se usan las hardcoded en el código (fallback).
    """
    qtype = q["type"]
    help_text = q.get("help")

    # Resolver opciones: del JSON externo si la key está, sino del código.
    options = _opciones_para(q["key"], q.get("options", []))

    if qtype == "text":
        return _input_text(q["prompt"], help_text, allow_empty=True)
    elif qtype == "number":
        return _input_number(q["prompt"], help_text)
    elif qtype == "choice":
        return _input_choice(q["prompt"], options, help_text)
    elif qtype == "multichoice":
        return _input_multichoice(q["prompt"], options, help_text)
    else:
        raise ValueError(f"Tipo de pregunta desconocido: {qtype}")


# ═══════════════════════════════════════════════════════════════════════════════
# Recolección de datos
# ═══════════════════════════════════════════════════════════════════════════════

def _imprimir_header() -> None:
    print("\n" + "═" * 60)
    print("🍂  FASE INIT — primera vez del agente")
    print("═" * 60)
    print("Voy a hacerte 15 preguntas sobre tu restaurante.")
    print("Esta fase SOLO corre la primera vez. Después arranco directo.")
    print("─" * 60)


def _recolectar_restaurante() -> dict:
    """Ejecuta las 15 preguntas del restaurante y devuelve el dict final."""
    if not PREGUNTAS_RESTAURANTE:
        print("\n⚠️  PREGUNTAS_RESTAURANTE está vacío en init_phase.py.")
        print("   Por ahora, restaurante.json se generará como objeto vacío {}.")
        return {}

    print("\n📍 SOBRE TU RESTAURANTE")
    print(f"   ({len(PREGUNTAS_RESTAURANTE)} preguntas, ~5-10 min)")
    print("   En cualquier momento podés responder vacío en multichoice\n")

    respuestas: dict = {}
    total = len(PREGUNTAS_RESTAURANTE)
    for i, q in enumerate(PREGUNTAS_RESTAURANTE, 1):
        print(f"\n── Pregunta {i}/{total} ──")
        respuestas[q["key"]] = _ask_question(q)

    return respuestas


def _leer_multilinea(prompt_inicial: str, terminador: str = "FIN") -> str:
    """
    Lee múltiples líneas de stdin hasta que el usuario escriba el terminador solo.
    Útil para pegar cartas o menús largos.
    """
    print(prompt_inicial)
    print(f"   (escribí {terminador} solo en una línea para terminar)")
    lineas = []
    while True:
        try:
            linea = input("   > ")
        except EOFError:
            break
        if linea.strip() == terminador:
            break
        lineas.append(linea)
    return "\n".join(lineas).strip()


def _extraer_platos_de_carta(carta_texto: str) -> list[dict]:
    """
    Usa el LLM para extraer una lista estructurada de platos desde texto libre.
    El LLM devuelve JSON; lo parseamos y normalizamos.

    Args:
        carta_texto: texto pegado por el usuario (carta, menú, lista de platos).

    Returns:
        Lista de dicts con keys: nombre, categoria, descripcion, precio.
    """
    if not carta_texto.strip():
        return []

    # Import local para evitar import circular: init_phase.py -> agent.py
    from agents.creativo.agent import call_minimax

    system = (
        "Extraé una lista estructurada de platos de la carta o menú que te paso. "
        "Para CADA plato devolvé un objeto con estos campos exactos:\n"
        "  - 'nombre': string con el nombre del plato\n"
        "  - 'categoria': uno de ['entrante', 'principal', 'postre', 'guarnicion', 'bebida', 'otro']\n"
        "  - 'descripcion': string con descripción breve (una línea), o string vacío si no hay\n"
        "  - 'precio': número (precio en euros, sin símbolos), o null si no está en la carta\n\n"
        "Reglas:\n"
        "- NO inventes platos que no estén en el texto.\n"
        "- Si un campo no está claro, usá string vacío o null según corresponda.\n"
        "- Devolvé SOLO un JSON array válido, sin markdown, sin explicaciones.\n"
        "- Si la carta no tiene platos identificables, devolvé [] (array vacío).\n\n"
        "Ejemplo de output:\n"
        '[{"nombre": "Risotto de setas", "categoria": "principal", "descripcion": "Con trufa negra", "precio": 22.0}]'
    )

    user = f"Carta / menú del restaurante:\n\n{carta_texto}"

    try:
        respuesta = call_minimax(system, user)
    except Exception as e:
        print(f"   ⚠️  Error llamando al LLM: {e}")
        return []

    # Intentar parsear la respuesta como JSON
    import json
    import re

    # Limpiar: a veces viene con ```json ... ``` o con texto alrededor
    texto = respuesta.strip()
    # Buscar el primer array JSON en la respuesta
    match = re.search(r'\[.*\]', texto, re.DOTALL)
    if match:
        texto = match.group(0)

    try:
        platos = json.loads(texto)
    except json.JSONDecodeError as e:
        print(f"   ⚠️  No se pudo parsear la respuesta del LLM como JSON: {e}")
        print(f"   Respuesta cruda (primeros 500 chars): {texto[:500]}")
        return []

    if not isinstance(platos, list):
        print(f"   ⚠️  El LLM no devolvió un array: {type(platos)}")
        return []

    # Normalizar cada plato
    categorias_validas = {"entrante", "principal", "postre", "guarnicion", "bebida", "otro"}
    normalizados = []
    for p in platos:
        if not isinstance(p, dict):
            continue
        nombre = str(p.get("nombre", "")).strip()
        if not nombre:
            continue
        categoria = str(p.get("categoria", "otro")).strip().lower()
        if categoria not in categorias_validas:
            categoria = "otro"
        descripcion = str(p.get("descripcion", "")).strip()
        precio_raw = p.get("precio")
        try:
            precio = float(precio_raw) if precio_raw is not None and precio_raw != "" else None
        except (ValueError, TypeError):
            precio = None
        normalizados.append({
            "nombre": nombre,
            "categoria": categoria,
            "descripcion": descripcion,
            "precio": precio,
        })

    return normalizados


def _recolectar_catalogo() -> list[dict]:
    """
    Recolecta el catálogo de platos. Tres modos:
    1. Pegar carta/menú completo (recomendado): el LLM lo extrae
    2. Manual: pregunta plato por plato
    3. Saltar: catálogo vacío

    Returns:
        Lista de dicts con keys: nombre, categoria, descripcion, precio.
    """
    print("\n🍽️  CATÁLOGO DE PLATOS\n")
    print("Opciones:")
    print("  1 — Pegar tu carta / menú completo (recomendado). El chef lo estructura.")
    print("  2 — Manual: meter los platos uno por uno.")
    print("  3 — Saltar por ahora (catálogo vacío).")
    print()

    while True:
        modo = input("➤ Elige 1, 2 o 3 > ").strip()
        if modo in ("1", "2", "3", ""):
            break
        print("   (elegí 1, 2 o 3)")

    if modo == "3" or not modo:
        print("   (sin catálogo por ahora — podés agregarlo después con /catalogo)")
        return []

    if modo == "1":
        # Pegar carta completa
        carta = _leer_multilinea(
            "\n📋 Pegá tu carta o menú completo. Puede ser texto plano, "
            "markdown, lo que tengas. Escribí FIN solo en una línea para terminar:"
        )
        if not carta:
            print("   (carta vacía, saltando)")
            return []

        print(f"\n   Procesando {len(carta)} caracteres de carta...")
        platos = _extraer_platos_de_carta(carta)
        if platos:
            print(f"\n   ✓ Extraídos {len(platos)} platos:")
            for p in platos[:10]:  # mostrar máx 10
                precio_str = f" — {p['precio']:.2f}€" if p.get("precio") is not None else ""
                print(f"     · [{p['categoria']:10s}] {p['nombre']}{precio_str}")
            if len(platos) > 10:
                print(f"     ... y {len(platos) - 10} más")
        else:
            print("   ⚠️  No se pudieron extraer platos. ¿Formato no reconocido?")
            print("      Podés probar el modo manual (opción 2).")
        return platos

    # modo == "2" — manual
    if not PREGUNTAS_POR_PLATO:
        print("\n⚠️  PREGUNTAS_POR_PLATO está vacío en init_phase.py.")
        print("   (catalogo_platos.json se generará como lista vacía [])")
        return []

    n_str = ""
    while not n_str.isdigit():
        n_str = input("➤ ¿Cuántos platos querés catalogar ahora? (0 para saltar): ").strip()
    n = int(n_str)
    if n == 0:
        print("   (sin platos por ahora — podés catalogar más tarde editando)")
        return []

    platos: list[dict] = []
    for i in range(n):
        print(f"\n   --- Plato {i + 1}/{n} ---")
        plato: dict = {}
        for q in PREGUNTAS_POR_PLATO:
            plato[q["key"]] = _ask_question(q)
        platos.append(plato)

    return platos


# ═══════════════════════════════════════════════════════════════════════════════
# Schema docs (companion .md que explica el formato)
# ═══════════════════════════════════════════════════════════════════════════════

def _schema_doc_restaurante() -> str:
    return f"""# Contexto del Restaurante

Schema multidimensional del restaurante, recolectado en la fase init.

## Estructura JSON

El archivo `restaurante.json` contiene 15 dimensiones (ver `PREGUNTAS_RESTAURANTE`
en `agents/init_phase.py` para la lista cerrada). Tipos de valor:

- **number**: número (ticket min/max/moda)
- **choice**: string (un valor de la lista de opciones)
- **multichoice**: array de strings (subset de la lista de opciones)
- **text**: string libre

## Las 15 dimensiones

| Key | Tipo | Descripción |
|---|---|---|
| `precio_target_min` | number | Ticket mínimo en € por persona |
| `precio_target_max` | number | Ticket máximo en € por persona |
| `precio_target_moda` | number | Ticket típico/moda en € por persona |
| `sofisticacion` | choice | muy_alta / alta / media / baja / muy_baja |
| `productos_dominantes` | multichoice | vegetales, carne, pescado, mariscos, integrales, ... |
| `tecnicas_dominantes` | multichoice | brasas, arroces, ahumado, fermentacion, ... |
| `tipo_servicio` | multichoice | servicio_tradicional, barra, autoservicio, ... |
| `grupos` | choice | sin_grupos / con_grupos_pequenos / con_grupos_grandes / banquetes_eventos |
| `clases_comedores` | multichoice | privados_vip, sociales_familia, mixto, business, turistas |
| `origen_inspiracion` | choice | local_pueblo / regional / mediterraneo / ... |
| `orientacion_nutricional` | multichoice | vegetariana, vegana, sin_gluten, origen_producto, ... |
| `localizacion` | choice | urbana / rural / litoral_mar / montaña / singular |
| `religion` | multichoice | ninguna / musulmana_halal / judia_kosher / hindu_vegetariana / budista |
| `tiempo_preparacion` | choice | comida_rapida / medio / slow_food |
| `epoca_estilo` | multichoice | mediterranea_moderna, autor_contemporanea, tradicional_popular, ... |

## Cómo extender las opciones

Las opciones de cada pregunta `choice` / `multichoice` viven en
`agents/init_options.json`. Si una pregunta tiene su key en ese archivo,
sus opciones GANA sobre las hardcoded en `init_phase.py`. Si no, el código
sigue funcionando como fallback.

Para agregar una opción nueva (ej: `horno_piedra` en técnicas dominantes):

1. Editá `agents/init_options.json`
2. Agregá el string en snake_case al array `values` de la key correspondiente
3. Commit + push

Adicionalmente, en tiempo de init el sistema ofrece automáticamente la opción
**"otra (escribir)"** al final de cada choice/multichoice. Si el usuario la elige,
se le pide input libre y se guarda como string custom.

## Ubicación física

`{RESTAURANTE_PATH}`

## Cómo lo consumen los agentes

```python
from agents.knowledge_context import cargar_restaurante

data = cargar_restaurante()
if data["sofisticacion"] == "alta":
    ...
if "vegetales" in data["productos_dominantes"]:
    ...
```
"""


def _schema_doc_catalogo() -> str:
    return f"""# Catálogo de Platos

Lista curada de platos que sirve el restaurante. Sirve como referencia para que
los agentes (chef, marketing, costos) tengan un vocabulario común.

## Cómo se genera

La fase init (`agents/init_phase.py`) pregunta cuántos platos querés catalogar
y luego recolecta las respuestas de `PREGUNTAS_POR_PLATO` por cada uno.

## Ubicación física

`{CATALOGO_PATH}`

## Cómo lo consumen los agentes

```python
from agents.knowledge_context import cargar_catalogo

platos = cargar_catalogo()
for plato in platos:
    print(plato["nombre"])
```
"""


# ═══════════════════════════════════════════════════════════════════════════════
# Entry point principal
# ═══════════════════════════════════════════════════════════════════════════════

def fase_init_interactiva() -> bool:
    """
    Corre el flujo de init si faltan los archivos.

    Returns:
        True si se ejecutó el init, False si los archivos ya existían.
    """
    from agents.knowledge_context import (
        restaurante_existe,
        catalogo_existe,
        guardar_restaurante,
        guardar_catalogo,
    )

    if restaurante_existe() and catalogo_existe():
        return False

    _imprimir_header()

    restaurante = _recolectar_restaurante()
    if restaurante:
        guardar_restaurante(restaurante, _schema_doc_restaurante())
        print(f"\n✓ Guardado: restaurante.json")

    catalogo = _recolectar_catalogo()
    guardar_catalogo(catalogo, _schema_doc_catalogo())
    print(f"✓ Guardado: catalogo_platos.json")

    print("\n" + "═" * 60)
    print("✅ INIT COMPLETO")
    print("═" * 60)
    print("Tus datos están en conocimiento/interno_restaurante/.")
    print("Cualquier agente nuevo los va a leer automáticamente.")
    print()

    return True


def main() -> None:
    """Entry point: python -m agents.init_phase"""
    if not fase_init_interactiva():
        from agents.knowledge_context import resumen_estado
        print("Init ya estaba completo. Estado actual:")
        print(resumen_estado())
        print("(Borrá conocimiento/interno_restaurante/ si querés volver a correr el init)")


if __name__ == "__main__":
    main()
