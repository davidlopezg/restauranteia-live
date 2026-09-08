"""
app_init_web.py — Pestaña "Configurar mi restaurante" (Fase 2 init-web)

Renderiza una pestaña secundaria en el HF Space para que el hostelero
configure su restaurante y carta desde el navegador, sin tocar CLI.

Diseño: ver openspec/changes/init-web/designs/init-web/design.md (DD-1..DD-8).
Spec: ver openspec/changes/init-web/specs/init-web/spec.md (RF-1..RF-26).

Helpers de carga/guarda usados: agents/knowledge_context.py (PR1 del change).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import gradio as gr

from agents.knowledge_context import (
    BACKUPS_DIR,
    cargar_catalogo,
    cargar_catalogo_con_default,
    cargar_restaurante,
    cargar_restaurante_con_default,
    catalogo_existe,
    guardar_catalogo_con_backup,
    guardar_con_backup,
    leer_con_backup_dir,
    restaurante_existe,
)
from agents.init_phase import (
    PREGUNTAS_POR_PLATO,
    PREGUNTAS_RESTAURANTE,
    _extraer_platos_de_carta,
    _opciones_para,
    _schema_doc_catalogo,
    _schema_doc_restaurante,
)

logger = logging.getLogger("chef_creativo.init_web")

# Constantes de UI
PAGINA_FILAS = 25
MAX_FILAS_WARNING = 100
DEMO_BACKUP_FILENAME_PREFIX = "restaurante_demo_"


# ════════════════════════════════════════════════════════════════════════════
# Render de los inputs del restaurante (RF-5..RF-8)
# ════════════════════════════════════════════════════════════════════════════


def _opciones_widget(key: str, fallback: list[str]) -> list[str]:
    """Igual que _opciones_para() pero garantiza lista (no None)."""
    opts = _opciones_para(key, fallback)
    return list(opts) if opts else list(fallback)


def _build_widgets_restaurante(restaurante: dict) -> dict[str, Any]:
    """
    Genera widgets Gradio desde PREGUNTAS_RESTAURANTE, precargados con
    el dict actual del restaurante.

    Args:
        restaurante: dict actual (puede ser {} si no existe).

    Returns:
        Dict {key_pregunta: componente_gradio}.
    """
    widgets: dict[str, Any] = {}
    for q in PREGUNTAS_RESTAURANTE:
        key = q["key"]
        tipo = q["type"]
        valor_actual = restaurante.get(key)
        label = q["prompt"]
        info = q.get("help")

        if tipo == "number":
            widgets[key] = gr.Number(
                label=label,
                value=valor_actual,
                info=info,
                precision=0 if "precio" in key or "ticket" in key else 2,
            )
        elif tipo == "choice":
            choices = _opciones_widget(key, q.get("options", []))
            valor = valor_actual if valor_actual in choices else None
            widgets[key] = gr.Dropdown(
                label=label,
                choices=choices,
                value=valor,
                info=info,
            )
        elif tipo == "multichoice":
            choices = _opciones_widget(key, q.get("options", []))
            valor = [v for v in (valor_actual or []) if v in choices]
            widgets[key] = gr.CheckboxGroup(
                label=label,
                choices=choices,
                value=valor,
                info=info,
            )
        elif tipo == "text":
            widgets[key] = gr.Textbox(
                label=label,
                value=valor_actual or "",
                info=info,
                lines=1,
            )
    return widgets


# ════════════════════════════════════════════════════════════════════════════
# Render del editor del catálogo (RF-9..RF-12)
# ════════════════════════════════════════════════════════════════════════════


def _catalogo_a_dataframe(catalogo: list[dict]) -> list[list[Any]]:
    """Convierte lista de dicts a filas para gr.Dataframe."""
    filas = []
    for plato in catalogo or []:
        filas.append([
            plato.get("nombre", ""),
            plato.get("categoria", ""),
            plato.get("descripcion", ""),
            plato.get("precio", ""),
        ])
    return filas


def _dataframe_a_catalogo(filas: list[list[Any]]) -> list[dict]:
    """Convierte filas del gr.Dataframe a lista de dicts limpia."""
    platos = []
    for fila in filas or []:
        # Normalizar fila (puede venir con NaN o vacíos)
        nombre = str(fila[0]).strip() if len(fila) > 0 and fila[0] is not None else ""
        if not nombre:
            continue
        categoria = str(fila[1]).strip() if len(fila) > 1 and fila[1] else "otro"
        descripcion = str(fila[2]).strip() if len(fila) > 2 and fila[2] else ""
        precio_raw = fila[3] if len(fila) > 3 else None
        try:
            precio = float(precio_raw) if precio_raw not in (None, "", "None") else None
        except (ValueError, TypeError):
            precio = None
        platos.append({
            "nombre": nombre,
            "categoria": categoria,
            "descripcion": descripcion,
            "precio": precio,
        })
    return platos


def _filtrar_y_paginar(
    catalogo: list[dict],
    busqueda: str,
    pagina: int,
    por_pagina: int = PAGINA_FILAS,
) -> tuple[list[list[Any]], int, int]:
    """
    Filtra por búsqueda (case-insensitive en nombre/categoria/descripcion)
    y pagina.

    Returns:
        (filas_paginadas, total_filtrado, total_paginas)
    """
    busq = (busqueda or "").strip().lower()
    if busq:
        filtrado = [
            p for p in (catalogo or [])
            if busq in (p.get("nombre") or "").lower()
            or busq in (p.get("categoria") or "").lower()
            or busq in (p.get("descripcion") or "").lower()
        ]
    else:
        filtrado = list(catalogo or [])

    total = len(filtrado)
    total_paginas = max(1, (total + por_pagina - 1) // por_pagina)
    pagina = max(1, min(pagina, total_paginas))
    inicio = (pagina - 1) * por_pagina
    fin = inicio + por_pagina
    slice_actual = filtrado[inicio:fin]

    filas = _catalogo_a_dataframe(slice_actual)
    return filas, total, total_paginas


# ════════════════════════════════════════════════════════════════════════════
# Render JSON viewer (RF-23)
# ════════════════════════════════════════════════════════════════════════════


def _json_a_markdown(data: Any, titulo: str) -> str:
    """Formatea un dict/list como JSON con syntax highlighting en markdown."""
    if data is None:
        return f"### {titulo}\n\n*(vacío)*"
    texto = json.dumps(data, ensure_ascii=False, indent=2)
    return f"### {titulo}\n\n```json\n{texto}\n```"


# ════════════════════════════════════════════════════════════════════════════
# Handlers
# ════════════════════════════════════════════════════════════════════════════


def _validar_y_normalizar(
    restaurante_inputs: dict[str, Any],
) -> tuple[dict | None, str]:
    """
    Valida tipos de los 15 inputs y normaliza a dict serializable.
    Retorna (dict_normalizado, mensaje_error). Si dict es None, error.
    """
    out = {}
    for q in PREGUNTAS_RESTAURANTE:
        key = q["key"]
        tipo = q["type"]
        valor = restaurante_inputs.get(key)

        if tipo == "number":
            if valor is None or valor == "":
                out[key] = None
                continue
            try:
                out[key] = float(valor) if "precio" in key or "ticket" in key else float(valor)
                if out[key] != out[key]:  # NaN check
                    return None, f"❌ '{q['prompt']}' no es un número válido."
            except (ValueError, TypeError):
                return None, f"❌ '{q['prompt']}' debe ser un número."
        elif tipo == "choice":
            if valor in (None, "", []):
                out[key] = None
            else:
                choices = _opciones_widget(key, q.get("options", []))
                if valor not in choices:
                    return None, f"❌ '{q['prompt']}': valor '{valor}' no está en las opciones."
                out[key] = valor
        elif tipo == "multichoice":
            if not valor:
                out[key] = []
            else:
                if isinstance(valor, str):
                    valor = [valor]
                choices = _opciones_widget(key, q.get("options", []))
                invalidos = [v for v in valor if v not in choices]
                if invalidos:
                    return None, f"❌ '{q['prompt']}': {invalidos} no son opciones válidas."
                out[key] = list(valor)
        elif tipo == "text":
            out[key] = str(valor).strip() if valor else ""
    return out, ""


def _save_with_guard(
    restaurante_dict: dict,
    catalogo_list: list[dict],
    *,
    forzar_sobrescritura: bool = False,
) -> tuple[bool, str]:
    """
    Guarda restaurante y catálogo con guard explícito.

    - Si restaurante existe y NO es demo → NO sobrescribir (crear backup).
    - Si restaurante existe y SÍ es demo → sobrescribir (esperado).
    - Si restaurante NO existe → crear nuevo.
    - Mismo patrón para catálogo.

    Args:
        restaurante_dict: dict a guardar (debe traer "demo" o se asume False).
        catalogo_list: lista de platos.
        forzar_sobrescritura: si True, ignora el guard y sobrescribe
            (se usa tras confirmación explícita del usuario).

    Returns:
        (success, message)
    """
    msgs = []

    # Guardar restaurante
    es_demo = bool(restaurante_dict.get("demo", False))
    restaurante_existe_pre = restaurante_existe()
    restaurante_actual_es_demo = False
    if restaurante_existe_pre:
        try:
            restaurante_actual_es_demo = bool(cargar_restaurante().get("demo", False))
        except Exception:
            restaurante_actual_es_demo = False

    if restaurante_existe_pre and not restaurante_actual_es_demo and not forzar_sobrescritura:
        # Perfil real existente → NO sobrescribir, solo backup
        try:
            BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
            backup_path = BACKUPS_DIR / f"{DEMO_BACKUP_FILENAME_PREFIX}preserved.json"
            import shutil
            shutil.copy2(
                Path(__file__).resolve().parent / "conocimiento" / "interno_restaurante" / "restaurante.json",
                backup_path,
            )
            msgs.append(
                f"⚠️ Restaurante real preservado (backup: {backup_path.name}). "
                f"Para sobrescribir, maracá 'demo: true' o usá el botón Restaurar."
            )
        except Exception as e:
            msgs.append(f"⚠️ No se pudo crear backup del restaurante: {e}")
    else:
        ok, msg = guardar_con_backup(restaurante_dict, _schema_doc_restaurante())
        msgs.append(f"Restaurante: {msg}")

    # Guardar catálogo
    catalogo_existe_pre = catalogo_existe()
    if catalogo_existe_pre and not restaurante_actual_es_demo and not forzar_sobrescritura:
        # Mismo criterio para el catálogo
        try:
            BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
            backup_path = BACKUPS_DIR / f"catalogo_platos_preserved.json"
            import shutil
            shutil.copy2(
                Path(__file__).resolve().parent / "conocimiento" / "interno_restaurante" / "catalogo_platos.json",
                backup_path,
            )
            msgs.append(f"⚠️ Catálogo real preservado (backup: {backup_path.name}).")
        except Exception as e:
            msgs.append(f"⚠️ No se pudo crear backup del catálogo: {e}")
    else:
        ok, msg = guardar_catalogo_con_backup(catalogo_list, _schema_doc_catalogo())
        msgs.append(f"Catálogo: {msg}")

    final = "\n".join(msgs)
    success = "❌" not in final
    return success, final


def _handle_guardar(
    restaurante_inputs: dict,
    catalogo_filas: list[list[Any]],
    confirmar: bool,
) -> tuple[str, str, Any]:
    """
    Handler del botón 'Guardar cambios'.

    Args:
        restaurante_inputs: dict con los valores de los 15 widgets.
        catalogo_filas: filas actuales del gr.Dataframe.
        confirmar: True si el usuario confirmó el modal.

    Returns:
        (toast_text, json_actualizado, status_visible)
    """
    restaurante_norm, err = _validar_y_normalizar(restaurante_inputs)
    if err:
        return err, "", gr.update(visible=False)

    catalogo_list = _dataframe_a_catalogo(catalogo_filas)

    # Determinar si necesita confirmación
    existe_pre = restaurante_existe() or catalogo_existe()
    es_demo = bool(cargar_restaurante_con_default({}).get("demo", False))

    if existe_pre and not es_demo and not confirmar:
        msg = (
            "⚠️ **Vas a sobrescribir un perfil real.**\n\n"
            "Si querés continuar, marcá la casilla de confirmación y volvé a "
            "clickear Guardar."
        )
        return msg, "", gr.update(visible=True)

    forzar = confirmar or not existe_pre
    success, save_msg = _save_with_guard(
        restaurante_norm,
        catalogo_list,
        forzar_sobrescritura=forzar,
    )

    toast = (
        f"✅ Guardado correctamente.\n\n{save_msg}\n\n"
        f"⚠️ Recordá: el HF Space free duerme los procesos. "
        f"Tu configuración se pierde en cold starts. "
        f"Para uso real, montá tu instancia privada."
    )

    json_text = _json_a_markdown(
        cargar_restaurante_con_default({}),
        "restaurante.json",
    ) + "\n\n" + _json_a_markdown(
        cargar_catalogo_con_default([]),
        "catalogo_platos.json",
    )
    return toast, json_text, gr.update(visible=False)


def _handle_restaurar_demo() -> tuple[str, str, str]:
    """
    Re-seedea desde demo_restaurante.json + demo_catalogo_platos.json.
    Doble-check: solo funciona si el restaurante actual es demo.

    Returns:
        (toast_text, json_actualizado, status_para_reload)
    """
    try:
        actual = cargar_restaurante()
    except FileNotFoundError:
        actual = {}

    if not actual.get("demo", False):
        return (
            "❌ Solo se puede restaurar el demo sobre un perfil demo. "
            "Si querés volver al demo, primero borrá `conocimiento/interno_restaurante/restaurante.json` "
            "desde CLI.",
            "",
            "",
        )

    demo_dir = Path(__file__).resolve().parent / "conocimiento" / "interno_app" / "recursos"
    demo_rest = json.loads((demo_dir / "demo_restaurante.json").read_text(encoding="utf-8"))
    demo_cat = json.loads((demo_dir / "demo_catalogo_platos.json").read_text(encoding="utf-8"))

    ok1, msg1 = guardar_con_backup(demo_rest, _schema_doc_restaurante())
    ok2, msg2 = guardar_catalogo_con_backup(demo_cat, _schema_doc_catalogo())
    toast = f"🔄 Perfil demo restaurado.\n{msg1}\n{msg2}"
    json_text = _json_a_markdown(demo_rest, "restaurante.json") + "\n\n" + _json_a_markdown(
        demo_cat, "catalogo_platos.json"
    )
    return toast, json_text, "reload"


def _handle_pegar_carta(carta_texto: str) -> tuple[list[list[Any]], str, str]:
    """
    Llama a _extraer_platos_de_carta() y devuelve filas para preview.

    Returns:
        (filas_preview, status_md, count_text)
    """
    if not (carta_texto or "").strip():
        return [], "⚠️ Pegá el texto de la carta primero.", "0"

    try:
        platos = _extraer_platos_de_carta(carta_texto)
    except Exception as e:
        return [], f"❌ Error extrayendo: {type(e).__name__}: {e}", "0"

    if not platos:
        return [], "⚠️ No se detectaron platos. Revisá el texto o cargá manualmente.", "0"

    filas = _catalogo_a_dataframe(platos)
    status = f"✅ {len(platos)} platos extraídos. Revisá y editá abajo antes de guardar."
    return filas, status, str(len(platos))


def _handle_catalogo_change(
    catalogo_filas: list[list[Any]],
    busqueda: str,
    pagina: int,
) -> tuple[list[list[Any]], str, int, int]:
    """
    Handler de cambios en catálogo: re-filtra y re-pagina.
    Devuelve (filas_visibles, info_paginacion, pagina_actual, total_paginas).
    """
    catalogo = _dataframe_a_catalogo(catalogo_filas)
    filas, total, total_paginas = _filtrar_y_paginar(catalogo, busqueda, pagina)
    info = f"Página {pagina}/{total_paginas} — {total} platos"
    return filas, info, pagina, total_paginas


def _handle_agregar_fila() -> list[list[Any]]:
    """Agrega una fila vacía al final del catálogo."""
    return [["", "otro", "", None]]


def _handle_cargar_inicial() -> tuple[dict, list[list[Any]], str, str]:
    """
    Carga el estado inicial de la pestaña desde los archivos en disco.

    Returns:
        (restaurante_inputs_dict, filas_catalogo, info_catalogo, json_text)
    """
    restaurante = cargar_restaurante_con_default({})
    catalogo = cargar_catalogo_con_default([])
    filas = _catalogo_a_dataframe(catalogo)
    info = f"{len(catalogo)} platos cargados"
    json_text = _json_a_markdown(restaurante, "restaurante.json") + "\n\n" + _json_a_markdown(
        catalogo, "catalogo_platos.json"
    )
    return restaurante, filas, info, json_text


# ════════════════════════════════════════════════════════════════════════════
# Render principal de la pestaña (DD-2 del design)
# ════════════════════════════════════════════════════════════════════════════


def _render_init_web_tab() -> dict:
    """
    Renderiza la pestaña 'Configurar mi restaurante'.

    Returns:
        Dict {componente_id: componente} para que app.py los enchufe en gr.Tabs().

    Estructura:
      - Disclaimer de persistencia efímera (siempre visible, RF-20)
      - Accordion "Datos del restaurante" (15 widgets, RF-5)
      - Card "Carta del restaurante" (Dataframe + búsqueda + pegar carta, RF-9..RF-14)
      - Card "Acciones" (Guardar + Restaurar demo, RF-15..RF-19)
      - JSON viewer colapsable (RF-23)
    """
    components = {}

    # Disclaimer siempre visible
    components["disclaimer"] = gr.Markdown(
        "⚠️ **Importante**: el HF Space free duerme los procesos después de un rato "
        "de inactividad. Tu configuración se pierde cuando el Space se reinicia. "
        "Para uso real, montá tu instancia privada "
        "(ver [`SECURITY.md`](SECURITY.md) o escribime a davidlopezgamero@gmail.com).",
    )

    # Estado interno (no visible al usuario)
    state_pagina = gr.State(value=1)
    state_busqueda = gr.State(value="")
    state_confirmar = gr.State(value=False)
    components["state_pagina"] = state_pagina
    components["state_busqueda"] = state_busqueda
    components["state_confirmar"] = state_confirmar

    # Estado de confirmación visible (RF-15)
    with gr.Group(visible=False) as confirm_group:
        gr.Markdown(
            "### ⚠️ Confirmar sobrescritura\n\n"
            "Vas a sobrescribir un perfil real. Si querés continuar, "
            "marcá la casilla y volvé a clickear **Guardar cambios**."
        )
        confirmar_check = gr.Checkbox(
            label="Sí, sobrescribir mi perfil real",
            value=False,
        )
        components["confirm_group"] = confirm_group
        components["confirmar_check"] = confirmar_check

    # Accordion "Datos del restaurante"
    with gr.Accordion("🍽️ Datos del restaurante", open=True):
        restaurante_inicial = cargar_restaurante_con_default({})
        widgets_rest = _build_widgets_restaurante(restaurante_inicial)
        components["widgets_restaurante"] = widgets_rest

    # Carta del restaurante
    with gr.Accordion("📋 Carta del restaurante", open=False):
        with gr.Tab("Editor manual"):
            catalogo_inicial = _catalogo_a_dataframe(cargar_catalogo_con_default([]))
            busqueda = gr.Textbox(
                label="Buscar (nombre, categoría, descripción)",
                placeholder="Ej: risotto, postre, trufa…",
            )
            components["catalogo_busqueda"] = busqueda
            pagination_info = gr.Markdown(f"{len(catalogo_inicial)} platos cargados")
            components["catalogo_info"] = pagination_info
            catalogo_df = gr.Dataframe(
                headers=["nombre", "categoria", "descripcion", "precio"],
                datatype=["str", "str", "str", "number"],
                value=catalogo_inicial,
                interactive=True,
                row_count=(PAGINA_FILAS, "dynamic"),
                col_count=(4, "fixed"),
                label="Platos",
                wrap=True,
            )
            components["catalogo_df"] = catalogo_df
            with gr.Row():
                btn_agregar = gr.Button("➕ Agregar fila", size="sm")
                btn_refiltrar = gr.Button("🔄 Refiltrar", size="sm", visible=False)
            components["btn_agregar"] = btn_agregar
            components["btn_refiltrar"] = btn_refiltrar

        with gr.Tab("Pegar carta completa"):
            gr.Markdown(
                "Pegá tu carta o menú completo. El chef extrae la estructura "
                "(nombre, categoría, descripción, precio) usando el LLM. "
                "Tarda entre 5 y 15 segundos."
            )
            carta_input = gr.Textbox(
                label="Carta o menú (texto)",
                placeholder="Pegá acá el contenido de tu carta…",
                lines=10,
            )
            btn_extraer = gr.Button("⏳ Extraer estructura", variant="primary")
            carta_status = gr.Markdown("")
            components["carta_input"] = carta_input
            components["carta_status"] = carta_status
            components["btn_extraer"] = btn_extraer

    # Acciones
    with gr.Accordion("⚙️ Acciones", open=True):
        with gr.Row():
            btn_guardar = gr.Button("💾 Guardar cambios", variant="primary")
            btn_restaurar_demo = gr.Button("🔄 Restaurar perfil demo")
        guardar_status = gr.Markdown("")
        components["btn_guardar"] = btn_guardar
        components["btn_restaurar_demo"] = btn_restaurar_demo
        components["guardar_status"] = guardar_status

    # JSON viewer (colapsable, RF-23)
    with gr.Accordion("📄 Ver JSON", open=False):
        json_text = gr.Markdown(
            _json_a_markdown(
                cargar_restaurante_con_default({}), "restaurante.json",
            )
            + "\n\n"
            + _json_a_markdown(
                cargar_catalogo_con_default([]), "catalogo_platos.json",
            )
        )
        components["json_text"] = json_text

    # Wiring de eventos
    # Refiltrar al cambiar búsqueda
    busqueda.change(
        fn=lambda b, c, p: _handle_catalogo_change(c, b, p),
        inputs=[busqueda, catalogo_df, state_pagina],
        outputs=[catalogo_df, pagination_info, state_pagina],
    )

    # Agregar fila vacía
    btn_agregar.click(
        fn=lambda filas: (filas + [["", "otro", "", None]],),
        inputs=[catalogo_df],
        outputs=[catalogo_df],
    )

    # Pegar carta → extraer
    btn_extraer.click(
        fn=_handle_pegar_carta,
        inputs=[carta_input],
        outputs=[catalogo_df, carta_status, gr.State()],
    )

    # Confirmación → habilita el flag de forzar sobrescritura
    confirmar_check.change(
        fn=lambda v: v,
        inputs=[confirmar_check],
        outputs=[state_confirmar],
    )

    # Guardar: junta todos los inputs del restaurante + catalogo + confirmar
    guardar_inputs = list(widgets_rest.values()) + [catalogo_df, state_confirmar]

    def _guardar_wrapper(*args):
        # args = [15 widgets..., catalogo_filas, confirmar]
        widgets_vals = dict(zip(widgets_rest.keys(), args[:-2]))
        catalogo_filas = args[-2]
        confirmar = args[-1]
        return _handle_guardar(widgets_vals, catalogo_filas, confirmar)

    btn_guardar.click(
        fn=_guardar_wrapper,
        inputs=guardar_inputs,
        outputs=[guardar_status, json_text, confirm_group],
    )

    # Restaurar demo
    btn_restaurar_demo.click(
        fn=_handle_restaurar_demo,
        inputs=[],
        outputs=[guardar_status, json_text, gr.State()],
    )

    return components