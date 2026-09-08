"""
test_app.py
===========

Tests de regresión para la app Gradio (MVP-0.5 / HF Space).

Sirve para detectar errores comunes ANTES de pushear al Space.
NO hace llamadas a MiniMax. NO consume créditos.

Validaciones:
- Sintaxis Python de app.py
- Búsqueda de kwargs prohibidos por deprecation de Gradio 6+
- Firma correcta de gr.ChatInterface() según docs 6.19
- Firma correcta de gr.Chatbot()
- Función responder() devuelve un dict con {role, content}
- Theme y css se pasan al .launch() y no al constructor de Blocks

Uso:
    python scripts/test_app.py
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
APP_PY = PROJECT_ROOT / "app.py"


def check(label: str, ok: bool, detalle: str = "") -> bool:
    """Mini-helper para imprimir resultados. Devuelve True si pasó."""
    icon = "[PASS]" if ok else "[FAIL]"
    print(f"   {icon} {label}{(': ' + detalle) if detalle else ''}")
    return ok


def cargar_ast(path: Path) -> ast.Module:
    """Parsea el archivo a AST. Levanta SyntaxError si el código no compila."""
    return ast.parse(path.read_text(encoding="utf-8"))


def test_sintaxis() -> bool:
    print("\n[1/5] Sintaxis Python")
    try:
        cargar_ast(APP_PY)
        return check("app.py parsea sin errores", True)
    except SyntaxError as e:
        return check("app.py parsea sin errores", False, f"línea {e.lineno}: {e.msg}")


def test_kwarg_prohibidos() -> bool:
    print("\n[2/5] Búsqueda de kwargs prohibidos (Gradio 6.19+)")
    src = APP_PY.read_text(encoding="utf-8")
    ok = True

    # En Gradio 6, theme/css ya NO van al constructor de gr.Blocks
    if re.search(r"with\s+gr\.Blocks\s*\([^)]*theme\s*=", src, re.DOTALL):
        ok &= check("theme no está en el constructor gr.Blocks", False,
                    "debe ir al .launch() en Gradio 6+")

    if re.search(r"with\s+gr\.Blocks\s*\([^)]*css\s*=", src, re.DOTALL):
        ok &= check("css no está en el constructor gr.Blocks", False,
                    "debe ir al .launch() en Gradio 6+")

    # type= ya no es kwarg de ChatInterface ni de Chatbot
    if re.search(r"gr\.ChatInterface\s*\([^)]*type\s*=", src, re.DOTALL):
        ok &= check("type no está en gr.ChatInterface()", False)

    if re.search(r"gr\.Chatbot\s*\([^)]*type\s*=", src, re.DOTALL):
        ok &= check("type no está en gr.Chatbot()", False)

    # huggingface_hub no se pinea <1.0 si Gradio >= 6
    reqs = (PROJECT_ROOT / "requirements.txt").read_text()
    if "gradio>=6" in reqs or "gradio[bot=" in reqs:
        if re.search(r"huggingface_hub\s*>=\s*0\.\d+[\.,<]\s*1", reqs):
            ok &= check("huggingface_hub no pineado a <1.0 (Gradio 6+ requiere >=1.2)",
                        False)

    return ok


def test_firma_responder() -> bool:
    print("\n[3/5] Firma de responder() para ChatInterface messages")
    tree = cargar_ast(APP_PY)

    funcion = None
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "responder":
            funcion = node
            break

    if not funcion:
        return check("función responder() existe", False)

    check("función responder() existe", True)

    # Firma real desde v1.3.x: responder(mensaje, historial, skill="ficha").
    # El parámetro 'skill' se agregó al añadir el selector de skills en la UI;
    # este test esperaba solo 2 args y quedó desactualizado (fallaba ANTES de
    # este change, verified baseline 2026-08-05). Aceptamos 2 args o 3 args
    # donde el 3º tiene default. NO se cambia la firma del código.
    args = [a.arg for a in funcion.args.args]
    defaults = list(funcion.args.defaults)
    if len(args) == 2:
        check("responder() acepta 2 argumentos (mensaje, historial)", True)
    elif len(args) == 3 and defaults and args[2] == "skill":
        check("responder() acepta 3 argumentos (mensaje, historial, skill=...) con default en el 3º", True)
    else:
        return check("responder() tiene 2 args o 3 con default en el 3º", False,
                     f"args={args}, defaults={defaults}")

    # Debe retornar un dict (no un str) por el formato messages API
    src = ast.unparse(funcion.returns) if funcion.returns else "None"
    if "dict" not in src.lower():
        return check("responder() declara return tipo dict (no str)",
                     False, f"return type: {src}")

    return check("responder() declara return tipo dict (no str)", True)


def test_chatinterface_dentro_de_blocks() -> bool:
    print("\n[4/5] gr.ChatInterface está dentro de gr.Blocks")
    src = APP_PY.read_text(encoding="utf-8")
    # En Gradio 6 lo correcto es envolver en gr.Blocks() as demo:
    # y dentro usar gr.ChatInterface(...)
    if re.search(r"with\s+gr\.Blocks[\s\S]*?\n\s*gr\.ChatInterface\s*\(", src):
        return check("gr.ChatInterface() está dentro de gr.Blocks", True)
    return check("gr.ChatInterface() está dentro de gr.Blocks", False,
                 "debe envolverse en with gr.Blocks() as demo:")


def test_launch_con_theme_css() -> bool:
    print("\n[5/5] launch() recibe theme y css")
    src = APP_PY.read_text(encoding="utf-8")

    if re.search(r"\.launch\s*\([^)]*theme\s*=", src, re.DOTALL):
        return check("launch() recibe theme=", True)
    if re.search(r"\.launch\s*\([^)]*css\s*=", src, re.DOTALL):
        return check("launch() recibe css=", True)
    # si no está, no es obligatorio pero recomendado
    return check("launch() tiene theme y css", False,
                 "(no obligatorio, pero recomendado para branding)")


def test_deteccion_idioma() -> bool:
    """Test para _es_principalmente_espanol() de agent.py"""
    print("\n[6/6] Detección de idioma (_es_principalmente_espanol)")
    sys.path.insert(0, str(PROJECT_ROOT))
    try:
        from agents.creativo.agent import _es_principalmente_espanol
    except ImportError as e:
        return check("Importar _es_principalmente_espanol", False, str(e))

    check("Importar _es_principalmente_espanol", True)
    ok = True

    # Caso 1: ficha en español → True
    ficha_es = """🍂 CALABAZA DE OTOÑO
📝 HISTORIA
Este plato evoca los colores del otoño en la Garrotxa.
📋 FICHA TÉCNICA
Ingredientes (para 4 raciones):
- Calabaza 500g — asada al horno
- Queso de cabra 200g — fresco
Elaboración:
1. Asar la calabaza a 180°C durante 40 minutos.
🍷 MARIDAJE
- Vino blanco joven del Penedès.
🎨 PROMPT PARA IMAGEN DEL PLATO
A rustic ceramic plate with roasted pumpkin and goat cheese, top-down view, warm natural lighting."""
    ok &= check("Ficha en espanol -> True", _es_principalmente_espanol(ficha_es))

    # Caso 2: ficha en inglés → False
    ficha_en = """🍂 AUTUMN HARVEST
📝 STORY
This dish brings the colors of autumn in Catalonia.
📋 TECHNICAL SHEET
Ingredients (serves 4):
- Pumpkin 500g — roasted
- Goat cheese 200g — fresh
Preparation:
1. Roast the pumpkin at 180°C for 40 minutes.
🍷 PAIRING
- Young white wine from Penedès.
🎨 PROMPT PARA IMAGEN DEL PLATO
A rustic ceramic plate with roasted pumpkin and goat cheese, top-down view."""
    ok &= check("Ficha en ingles -> False", not _es_principalmente_espanol(ficha_en))

    # Caso 3: mezcla español+inglés (el bug real) → False
    ficha_mixta = """🍂 CALABAZA DE OTOÑO
📝 HISTORIA / STORYTELLING
This dish evokes the colors of autumn in the Garrotxa.
📋 FICHA TÉCNICA
Ingredients (para 4 raciones):
- Calabaza 500g — asada al horno
- Queso de cabra 200g — fresco
Elaboración:
1. Roast the pumpkin at 180°C for 40 minutes.
🍷 MARIDAJE
- Vino blanco joven del Penedès.
🎨 PROMPT PARA IMAGEN DEL PLATO
A rustic ceramic plate with roasted pumpkin."""
    ok &= check("Mezcla espanol+ingles -> False", not _es_principalmente_espanol(ficha_mixta))

    # Caso 4: texto corto → True (no hay suficiente muestra)
    ok &= check("Texto muy corto -> True", _es_principalmente_espanol("Hola"))

    return ok


def main() -> int:
    print("=" * 60)
    print("Test de regresión de app.py (Gradio 6.19+)")
    print("=" * 60)

    resultados = [
        test_sintaxis(),
        test_kwarg_prohibidos(),
        test_firma_responder(),
        test_chatinterface_dentro_de_blocks(),
        test_launch_con_theme_css(),
        test_deteccion_idioma(),
    ]

    print("\n" + "=" * 60)
    if all(resultados):
        print("[PASS] Todos los tests pasaron. Listo para pushear.")
        return 0
    else:
        n_fail = sum(1 for r in resultados if not r)
        print(f"[FAIL] {n_fail} test(s) fallaron. NO pushear todavia.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
