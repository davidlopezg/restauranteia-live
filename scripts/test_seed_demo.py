"""
test_seed_demo.py
=================

Tests del seed demo del perfil genérico (Fase 1 — producto-vendible, commit C1).

Valida:
1. demo_restaurante.json parsea y tiene las 15 claves del schema
   (PREGUNTAS_RESTAURANTE / _schema_doc_restaurante)
2. demo: true + nombre no vacío
3. Cada valor choice/multichoice del seed ∈ set válido de agents/init_options.json
   (fuente de verdad de valores: NUNCA inventar fuera de ese set)
4. demo_catalogo_platos.json: 8-12 platos, cada uno con nombre/categoria/
   descripcion/precio y categoría del set válido
5. _seed_demo_profile() NO sobrescribe archivos existentes:
   - caso A: ambos archivos existen (nada que seedear) → contenido intacto
   - caso B: solo falta UNO (donde vive el bug de sobrescritura de guardar_*)
     → el archivo existente queda intacto y el faltante se seedea con el demo

Sin red y sin API. NO requiere Gradio instalado: app.py construye gr.Blocks() al
importarse, así que se instala un stub mínimo de gradio en sys.modules antes de
importar app (el test nunca llama a .launch()).

Uso:
    python scripts/test_seed_demo.py
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
KNOWLEDGE_DIR = PROJECT_ROOT / "agents" / "creativo" / "knowledge"
RESTAURANTE_DEMO_PATH = KNOWLEDGE_DIR / "demo_restaurante.json"
CATALOGO_DEMO_PATH = KNOWLEDGE_DIR / "demo_catalogo_platos.json"
INIT_OPTIONS_PATH = PROJECT_ROOT / "agents" / "init_options.json"

# Las 15 dimensiones del schema (mismas keys que PREGUNTAS_RESTAURANTE).
SCHEMA_KEYS_RESTAURANTE = [
    "precio_target_min", "precio_target_max", "precio_target_moda",
    "sofisticacion", "productos_dominantes", "tecnicas_dominantes",
    "tipo_servicio", "grupos", "clases_comedores", "origen_inspiracion",
    "orientacion_nutricional", "localizacion", "religion",
    "tiempo_preparacion", "epoca_estilo",
]

CATEGORIAS_VALIDAS = {"entrante", "principal", "postre", "guarnicion", "bebida", "otro"}


def check(label: str, ok: bool, detalle: str = "") -> bool:
    """Mini-helper para imprimir resultados. Devuelve True si pasó."""
    icon = "[PASS]" if ok else "[FAIL]"
    print(f"   {icon} {label}{(': ' + detalle) if detalle else ''}")
    return ok


def _instalar_stub_gradio() -> None:
    """Stub mínimo de gradio para poder importar app.py sin Gradio instalado.

    app.py ejecuta `with gr.Blocks() as demo:` a nivel de módulo. En CI/apply
    puede no haber gradio; como el test no llama a .launch(), basta con un stub
    de los componentes usados a nivel módulo (Blocks/Radio/ChatInterface/Chatbot).
    """
    import types

    class _Componente:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        # No-ops para los handlers que app_init_web.py enchufa en module load
        def change(self, *a, **kw): return self
        def click(self, *a, **kw): return self
        def submit(self, *a, **kw): return self

    class _GradioStub(types.ModuleType):
        def __getattr__(self, name):
            return _Componente

    gr_stub = _GradioStub("gradio")
    gr_stub.Blocks = _Componente
    gr_stub.Radio = _Componente
    gr_stub.ChatInterface = _Componente
    gr_stub.Chatbot = _Componente
    sys.modules["gradio"] = gr_stub


def test_restaurante_schema() -> bool:
    print("\n[1/5] demo_restaurante.json: parsea y tiene las 15 claves del schema")
    try:
        data = json.loads(RESTAURANTE_DEMO_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        return check("demo_restaurante.json parsea", False, str(e))
    check("demo_restaurante.json parsea", True)

    faltantes = [k for k in SCHEMA_KEYS_RESTAURANTE if k not in data]
    return check(
        "tiene las 15 claves del schema (PREGUNTAS_RESTAURANTE)",
        not faltantes,
        f"faltan: {faltantes}" if faltantes else "",
    )


def test_demo_flag() -> bool:
    print("\n[2/5] demo: true + nombre no vacío")
    data = json.loads(RESTAURANTE_DEMO_PATH.read_text(encoding="utf-8"))
    ok = check("demo es True", data.get("demo") is True, str(data.get("demo")))
    nombre = (data.get("nombre") or "").strip()
    ok &= check("nombre no vacío", bool(nombre), repr(nombre))
    return ok


def test_valores_en_set_valido() -> bool:
    print("\n[3/5] Valores choice/multichoice dentro del set válido (init_options.json)")
    ok = True
    data = json.loads(RESTAURANTE_DEMO_PATH.read_text(encoding="utf-8"))
    options = json.loads(INIT_OPTIONS_PATH.read_text(encoding="utf-8"))["options"]

    faltantes = [k for k in options if k not in data]
    ok &= check(
        "el seed cubre todas las keys de opciones de init_options.json",
        not faltantes,
        f"faltan: {faltantes}" if faltantes else "",
    )

    for key, spec in options.items():
        if key not in data:
            continue
        valores = data[key]
        if spec["type"] == "choice":
            valores = [valores]
        if not isinstance(valores, list):
            ok &= check(f"{key}: lista de valores", False, f"tipo {type(valores).__name__}")
            continue
        invalidos = [v for v in valores if v not in spec["values"]]
        ok &= check(
            f"{key}: {valores} ∈ set válido",
            not invalidos,
            f"inválidos: {invalidos}" if invalidos else "",
        )
    return ok


def test_catalogo_demo() -> bool:
    print("\n[4/5] demo_catalogo_platos.json: 8-12 platos, keys obligatorias y categoría válida")
    try:
        platos = json.loads(CATALOGO_DEMO_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        return check("demo_catalogo_platos.json parsea", False, str(e))
    check("demo_catalogo_platos.json parsea", True)

    ok = check("entre 8 y 12 platos", 8 <= len(platos) <= 12, f"{len(platos)} platos")

    errores = []
    for i, p in enumerate(platos, 1):
        if not isinstance(p, dict):
            errores.append(f"plato {i}: no es objeto")
            continue
        faltan = [c for c in ("nombre", "categoria", "descripcion", "precio") if c not in p]
        if faltan:
            errores.append(f"plato {i}: faltan {faltan}")
        if p.get("categoria") not in CATEGORIAS_VALIDAS:
            errores.append(f"plato {i}: categoria '{p.get('categoria')}' no válida")
        if "precio" in p and not isinstance(p["precio"], (int, float)):
            errores.append(f"plato {i}: precio no numérico ({p['precio']!r})")
    ok &= check(
        "todos los platos con nombre/categoria/descripcion/precio y categoría válida",
        not errores,
        "; ".join(errores) if errores else "",
    )
    return ok


def _aplicar_paths_temp(kc, tmp: Path) -> dict:
    """Redirige los paths de agents.knowledge_context a un dir temporal."""
    originales = {
        "KNOWLEDGE_DIR": kc.KNOWLEDGE_DIR,
        "RESTAURANTE_PATH": kc.RESTAURANTE_PATH,
        "RESTAURANTE_DOC_PATH": kc.RESTAURANTE_DOC_PATH,
        "CATALOGO_PATH": kc.CATALOGO_PATH,
        "CATALOGO_DOC_PATH": kc.CATALOGO_DOC_PATH,
    }
    kc.KNOWLEDGE_DIR = tmp
    kc.RESTAURANTE_PATH = tmp / "restaurante.json"
    kc.RESTAURANTE_DOC_PATH = tmp / "restaurante.md"
    kc.CATALOGO_PATH = tmp / "catalogo_platos.json"
    kc.CATALOGO_DOC_PATH = tmp / "catalogo_platos.md"
    return originales


def _restaurar_paths(kc, originales: dict) -> None:
    for name, value in originales.items():
        setattr(kc, name, value)


def test_seed_no_sobrescribe() -> bool:
    print("\n[5/5] _seed_demo_profile() no sobrescribe archivos existentes")
    ok = True

    import agents.knowledge_context as kc
    import app as app_mod  # necesita el stub de gradio (instalado en main())

    real_rest = {"demo": False, "nombre": "Restaurante Real", "sofisticacion": "alta"}
    real_cat = [
        {"nombre": "Plato real", "categoria": "principal", "descripcion": "Plato existente", "precio": 30}
    ]

    def _leer(path: Path):
        return json.loads(path.read_text(encoding="utf-8"))

    with tempfile.TemporaryDirectory() as tmp:
        tmp_root = Path(tmp)

        # ── Caso A: ambos archivos existen con contenido real → no tocar nada ──
        tmp_path = tmp_root / "caso_a"
        tmp_path.mkdir()
        (tmp_path / "restaurante.json").write_text(
            json.dumps(real_rest, ensure_ascii=False), encoding="utf-8"
        )
        (tmp_path / "catalogo_platos.json").write_text(
            json.dumps(real_cat, ensure_ascii=False), encoding="utf-8"
        )
        originales = _aplicar_paths_temp(kc, tmp_path)
        try:
            app_mod._seed_demo_profile()
        finally:
            _restaurar_paths(kc, originales)
        ok &= check("caso A (nada falta): restaurante.json intacto",
                    _leer(tmp_path / "restaurante.json") == real_rest)
        ok &= check("caso A (nada falta): catalogo_platos.json intacto",
                    _leer(tmp_path / "catalogo_platos.json") == real_cat)

        # ── Caso B1: falta restaurante.json (existe solo catalogo) ──
        # El bug de sobrescritura viviría acá: sin guard por archivo, guardar_restaurante()
        # pisaría el catalogo real al regenerar el restaurante. Verificamos que no.
        tmp_path = tmp_root / "caso_b1"
        tmp_path.mkdir()
        (tmp_path / "catalogo_platos.json").write_text(
            json.dumps(real_cat, ensure_ascii=False), encoding="utf-8"
        )
        originales = _aplicar_paths_temp(kc, tmp_path)
        try:
            app_mod._seed_demo_profile()
        finally:
            _restaurar_paths(kc, originales)
        ok &= check("caso B1 (falta restaurante): catalogo_platos.json intacto",
                    _leer(tmp_path / "catalogo_platos.json") == real_cat)
        rest_seed = _leer(tmp_path / "restaurante.json")
        ok &= check("caso B1 (falta restaurante): restaurante.json seedeado con el demo",
                    rest_seed.get("demo") is True and rest_seed.get("nombre") == "Restaurante de demostración")

        # ── Caso B2: falta catalogo_platos.json (existe solo restaurante) ──
        tmp_path = tmp_root / "caso_b2"
        tmp_path.mkdir()
        (tmp_path / "restaurante.json").write_text(
            json.dumps(real_rest, ensure_ascii=False), encoding="utf-8"
        )
        originales = _aplicar_paths_temp(kc, tmp_path)
        try:
            app_mod._seed_demo_profile()
        finally:
            _restaurar_paths(kc, originales)
        ok &= check("caso B2 (falta catalogo): restaurante.json intacto",
                    _leer(tmp_path / "restaurante.json") == real_rest)
        cat_seed = _leer(tmp_path / "catalogo_platos.json")
        ok &= check("caso B2 (falta catalogo): catalogo_platos.json seedeado con el demo",
                    isinstance(cat_seed, list) and 8 <= len(cat_seed) <= 12)

    return ok


def main() -> int:
    print("=" * 60)
    print("Test del seed demo (Fase 1 — producto-vendible, commit C1)")
    print("=" * 60)

    sys.path.insert(0, str(PROJECT_ROOT))
    _instalar_stub_gradio()

    resultados = [
        test_restaurante_schema(),
        test_demo_flag(),
        test_valores_en_set_valido(),
        test_catalogo_demo(),
        test_seed_no_sobrescribe(),
    ]

    print("\n" + "=" * 60)
    if all(resultados):
        print("[PASS] Todos los tests pasaron. Seed demo OK.")
        return 0
    n_fail = sum(1 for r in resultados if not r)
    print(f"[FAIL] {n_fail} test(s) fallaron.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
