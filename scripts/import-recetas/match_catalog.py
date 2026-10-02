"""
Normalizador + matcher entre nombre de archivo .md y titulo del catalogo.

Reglas (en orden):
1. Lowercase + strip acentos.
2. Quitar prefijos "Pizza ", "Tarta ", "Mousse ", "Postre ".
3. Quitar todo lo que no sea alfanumerico.
4. Colapsar.

Si la normalizacion coincide, hay match. Si no, no hay match
(se genera INSERT en lugar de UPDATE).
"""

from __future__ import annotations

import re
import unicodedata


_PREFIXES = ("pizza", "tarta", "mousse", "postre", "escandallo", "sop", "poe")


def normalize(s: str) -> str:
    """Normaliza un titulo para matching. 'Pizza BCN' -> 'bcn'."""
    s = s.strip().lower()
    # quitar acentos
    s = "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )
    # quitar prefijos con o sin espacio al inicio
    changed = True
    while changed:
        changed = False
        for p in _PREFIXES:
            if s.startswith(p + " ") or s.startswith(p + "_"):
                s = s[len(p) + 1 :]
                changed = True
                break
    # quitar todo lo no alfanumerico
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s


def slug_from_filename(name: str) -> str:
    """Convierte un nombre de archivo de receta al slug canonico para matching.

    Acepta tanto el nombre real en GitHub ('Escandallo_Pizza_BCN.md') como
    el nombre con prefijo de carpeta cacheado localmente
    ('Pizzas-Escandallo_Pizza_BCN.md').

    'Escandallo_Pizza_BCN.md'                   -> 'bcn'
    'Pizzas-Escandallo_Pizza_BCN.md'            -> 'bcn'
    'Postres-Escandallo_Mousse_Limon.md'        -> 'mouselimon'
    """
    stem = re.sub(r"\.[Mm][Dd]$", "", name)
    # Quitar prefijos de carpeta cacheada: "Pizzas-" / "Postres-"
    stem = re.sub(r"^(?:Pizzas|Postres|Docs)-", "", stem, flags=re.IGNORECASE)
    # Quitar prefijo "Escandallo_"
    stem = re.sub(r"^Escandallo_", "", stem, flags=re.IGNORECASE)
    # Si queda un patron "Pizza_<resto>" o "Tarta_De_<resto>", quitar el "Pizza_"
    stem = re.sub(r"^Pizza_", "", stem, flags=re.IGNORECASE)
    return normalize(stem)


def match_recipe_to_title(recipe_slug: str, catalog_titles: list[tuple[str, str]]) -> str | None:
    """Devuelve el id del catalogo cuyo titulo normalizado coincide.

    catalog_titles: lista de (id, titulo) tal como la devuelve Supabase.
    """
    for cid, titulo in catalog_titles:
        if normalize(titulo) == recipe_slug:
            return cid
    return None