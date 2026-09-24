"""
Fix de encoding observado en datos migrados desde Notion.

Los caracteres acentuados aparecen como 'Caf�' (secuencia latin-1 mal
interpretada como UTF-8). Probamos re-decodificar como latin1 → utf8
y devolvemos el resultado si es más legible.
"""
import re

# Palabras "señal" mal codificadas (latin1→utf8) — patrón diagnóstico:
# letra ascii seguida de '�' (U+FFFD) cuando se interpreta latin1 como utf8.
_BAD = re.compile(r"[À-ÿ�]")


def fix_text(value):
    """
    Si el string parece tener caracteres mal codificados (UTF-8 visto como latin-1),
    intenta re-decodificar.
    """
    if value is None or not isinstance(value, str):
        return value
    if not _BAD.search(value):
        return value
    try:
        repaired = value.encode("latin-1", errors="strict").decode("utf-8", errors="strict")
        # Sólo aceptar si la versión reparada tiene menos '?' y más letras acentuadas válidas.
        if repaired.count("�") < value.count("�"):
            return repaired
        return value
    except (UnicodeEncodeError, UnicodeDecodeError):
        return value


def fix_list(values):
    """Aplica fix_text a cada elemento de una lista (típicamente text[] de Postgres)."""
    if not values:
        return values
    return [fix_text(v) for v in values]


def deep_fix(obj):
    """Recorre dicts/listas y aplica fix_text a todos los strings hoja."""
    if isinstance(obj, dict):
        return {k: deep_fix(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [deep_fix(v) for v in obj]
    return fix_text(obj)
