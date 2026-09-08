"""
proceso_creativo_md.py — Parser del .md que define el flujo del Proceso Creativo.

Lee `conocimiento/interno_app/procesos/proceso_creativo.md` y devuelve una lista
de fases con la misma estructura que antes tenía hardcoded en `proceso_creativo.py`.

Formato del .md (mismo estilo que en otros lugares del proyecto):
    <!-- fase -->
    orden: 1
    key: alma
    nombre: El alma del plato
    descripcion_corta: Qué evoca...
    instruccion_llm: |
      Texto multilinea...
      Otra línea...
    <!-- /fase -->

    <!-- fase -->
    orden: 2
    ...
    <!-- /fase -->

El parser:
  - Divide el archivo por bloques `<!-- fase --> ... <!-- /fase -->`
  - Parsea líneas `key: value` (soporta multilinea con `|`)
  - Valida que toda fase tenga `key`, `orden`, `nombre`, `instruccion_llm`
  - Devuelve lista de dicts ordenada por `orden`

Sin dependencias externas (regex puro).
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Optional


# Paths por defecto (sobreescribibles para tests)
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PROCESO_MD_PATH = (
    PROJECT_ROOT / "conocimiento" / "interno_app" / "procesos" / "proceso_creativo.md"
)


# Regex: bloque entre <!-- fase --> y <!-- /fase -->
_FASE_BLOCK_RE = re.compile(
    r"<!--\s*fase\s*-->(.*?)<!--\s*/fase\s*-->",
    re.DOTALL,
)

# Regex: línea "key: value" (soporta espacios extra)
_KV_RE = re.compile(r"^\s*([a-z_][a-z0-9_]*)\s*:\s*(.*)$")


class ProcesoCreativoMDError(ValueError):
    """Error al parsear el .md del proceso creativo."""


def parse_proceso_creativo_md(path: Optional[Path] = None) -> list[dict]:
    """
    Parsea el .md y devuelve la lista de fases.

    Args:
        path: ruta al .md. Si None, usa `DEFAULT_PROCESO_MD_PATH`.

    Returns:
        Lista de dicts con keys: key, orden, nombre, descripcion_corta, instruccion_llm.
        Ordenada por `orden` ascendente.

    Raises:
        FileNotFoundError: si el .md no existe.
        ProcesoCreativoMDError: si el formato es inválido.
    """
    if path is None:
        path = DEFAULT_PROCESO_MD_PATH

    if not path.exists():
        raise FileNotFoundError(
            f"No se encontró el .md del proceso creativo en {path}. "
            f"Asegúrate de que existe."
        )

    text = path.read_text(encoding="utf-8")

    blocks = _FASE_BLOCK_RE.findall(text)
    if not blocks:
        raise ProcesoCreativoMDError(
            f"No se encontraron bloques <!-- fase --> ... <!-- /fase --> en {path}. "
            f"Revisá el formato."
        )

    fases: list[dict] = []
    keys_vistos: set[str] = set()

    for i, block in enumerate(blocks, start=1):
        try:
            fase = _parse_fase_block(block)
        except ProcesoCreativoMDError as e:
            raise ProcesoCreativoMDError(f"Error en bloque de fase #{i}: {e}") from e

        # Validar campos obligatorios
        for campo in ("key", "orden", "nombre", "instruccion_llm"):
            if campo not in fase:
                raise ProcesoCreativoMDError(
                    f"Bloque #{i} falta el campo obligatorio '{campo}'. "
                    f"Campos presentes: {list(fase.keys())}"
                )

        # Validar key único
        if fase["key"] in keys_vistos:
            raise ProcesoCreativoMDError(
                f"Bloque #{i}: key '{fase['key']}' duplicado."
            )
        keys_vistos.add(fase["key"])

        # Validar orden es int positivo
        if not isinstance(fase["orden"], int) or fase["orden"] < 1:
            raise ProcesoCreativoMDError(
                f"Bloque #{i}: 'orden' debe ser int >= 1, recibido {fase['orden']!r}"
            )

        # descripcion_corta es opcional pero si está, debe ser str
        if "descripcion_corta" in fase and not isinstance(fase["descripcion_corta"], str):
            raise ProcesoCreativoMDError(
                f"Bloque #{i}: 'descripcion_corta' debe ser string."
            )

        fases.append(fase)

    # Ordenar por orden ascendente
    fases.sort(key=lambda f: f["orden"])

    # Validar que no haya huecos en el orden (1, 2, 3, ..., N)
    ordenes = [f["orden"] for f in fases]
    esperado = list(range(1, len(fases) + 1))
    if ordenes != esperado:
        raise ProcesoCreativoMDError(
            f"Los 'orden' deben ser consecutivos desde 1. "
            f"Encontrado: {ordenes}, esperado: {esperado}"
        )

    return fases


def _parse_fase_block(block: str) -> dict:
    """
    Parsea un bloque individual de fase.

    Soporta:
    - `key: value` en una línea
    - `instruccion_llm: |` para multilinea (todo lo que sigue hasta el próximo
      `key:` o fin de bloque se concatena con \n)

    NO soporta:
    - Anidación de YAML
    - Listas o mapas complejos
    (no los necesitamos)
    """
    fase: dict = {}
    multilinea_key: Optional[str] = None
    multilinea_lines: list[str] = []

    lines = block.split("\n")
    for raw_line in lines:
        line = raw_line.rstrip()

        # Si estamos en modo multilinea, acumulamos hasta encontrar otra key
        if multilinea_key is not None:
            # Línea vacía: la agregamos
            if not line:
                multilinea_lines.append("")
                continue
            # ¿Es una nueva key?
            m = _KV_RE.match(line)
            if m:
                # Cerramos el multilinea anterior
                fase[multilinea_key] = _strip_multilinea(multilinea_lines)
                multilinea_key = None
                multilinea_lines = []
                # Procesamos la nueva key en la misma línea
                key, value = m.group(1), m.group(2).strip()
                if value == "|":
                    multilinea_key = key
                    multilinea_lines = []
                else:
                    fase[key] = _coerce_value(value)
            else:
                # Sigue siendo parte del multilinea
                multilinea_lines.append(line)
            continue

        # Línea vacía fuera de multilinea: ignorar
        if not line:
            continue

        m = _KV_RE.match(line)
        if not m:
            # Ignorar líneas que no son key:value (ej: comentarios, espacios)
            continue

        key, value = m.group(1), m.group(2).strip()

        # `|` indica multilinea
        if value == "|":
            multilinea_key = key
            multilinea_lines = []
        else:
            fase[key] = _coerce_value(value)

    # Si quedó un multilinea abierto al final, cerrarlo
    if multilinea_key is not None:
        fase[multilinea_key] = _strip_multilinea(multilinea_lines)

    return fase


def _coerce_value(value: str):
    """
    Convierte el string value al tipo Python apropiado.
    - 'true'/'false' → bool
    - enteros → int
    - resto → string
    """
    if value == "true":
        return True
    if value == "false":
        return False
    # Int
    if re.fullmatch(r"-?\d+", value):
        try:
            return int(value)
        except ValueError:
            pass
    return value


def _strip_multilinea(lines: list[str]) -> str:
    """
    Limpia un bloque multilinea:
    - Quita líneas vacías al principio y al final
    - Quita la indentación común mínima (dedent, estilo YAML)
    - Devuelve el contenido con \n entre líneas
    """
    # Quitar líneas vacías al principio
    while lines and not lines[0].strip():
        lines.pop(0)
    # Quitar líneas vacías al final
    while lines and not lines[-1].strip():
        lines.pop()

    if not lines:
        return ""

    # Detectar indentación mínima entre las líneas con contenido
    indents = [
        len(line) - len(line.lstrip())
        for line in lines
        if line.strip()
    ]
    min_indent = min(indents) if indents else 0

    # Quitar esa indentación común
    if min_indent > 0:
        lines = [line[min_indent:] if len(line) >= min_indent else line for line in lines]

    return "\n".join(lines)