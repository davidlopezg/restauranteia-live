"""
Parser de escandallos/SOPs en Markdown -> JSON estructurado.

Soporta dos formatos detectados automaticamente:

A) Escandallo de pizza (formato simple):
   - Seccion "Ingredientes" con tabla markdown (Ingrediente | Cantidad)
   - Seccion "Preparacion" con lista numerada
   - Seccion "Escandallo y Margen" con tabla (Ingrediente | Precio/Kg | Coste Real)
   - Subseccion "Rentabilidad" con precio_venta destacado en negrita

B) SOP/POE de postre (formato rico):
   - Multiples secciones (Mise en place, Ejecucion, etc.)
   - Una o varias tablas de ingredientes
   - Tabla de coste final con margen y PVP sugerido
   - Pasos operativos detallados en listas

Salida: dict listo para serializar a JSON y guardar en
catalogos.receta_estructurada (jsonb).

Notas:
- No usamos dependencias externas (solo re + dataclasses).
- Los numeros se extraen con regex tolerante a "1,50 EUR" / "1.50 EUR" / "150 g".
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path


# --- helpers ----------------------------------------------------------------


_NUM_RE = re.compile(r"(\d+(?:[.,]\d+)?)")


def _to_float(s: str | None) -> float | None:
    if s is None:
        return None
    s = s.strip().replace(",", ".")
    m = _NUM_RE.search(s)
    if not m:
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


def _strip_md(s: str) -> str:
    """Quita markup basico (**negrita**, *cursiva*, `code`)."""
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"\*(.+?)\*", r"\1", s)
    s = re.sub(r"`(.+?)`", r"\1", s)
    return s.strip()


def _parse_table(lines: list[str]) -> list[list[str]]:
    """Parsea una tabla markdown. Devuelve filas como listas de celdas.

    Ignora lineas vacias y la fila separadora (--- | --- | ...).
    """
    rows: list[list[str]] = []
    for line in lines:
        line = line.strip()
        if not line or not line.startswith("|"):
            continue
        # Fila separadora: | --- | --- |
        cells = [c.strip() for c in line.strip("|").split("|")]
        if all(re.fullmatch(r":?-+:?", c or "-") for c in cells):
            continue
        rows.append([_strip_md(c) for c in cells])
    return rows


def _split_sections(md: str) -> dict[str, list[str]]:
    """Divide el markdown en secciones por encabezado H2 (## ...)."""
    sections: dict[str, list[str]] = {}
    current = "_pre"
    buf: list[str] = []
    for line in md.splitlines():
        m = re.match(r"^##\s+(.+?)\s*$", line)
        if m:
            sections[current] = buf
            current = m.group(1).strip()
            buf = []
        else:
            buf.append(line)
    sections[current] = buf
    return sections


# --- data classes -----------------------------------------------------------


@dataclass
class Ingrediente:
    nombre: str
    cantidad: str | None = None
    precio_unidad: float | None = None  # €/kg o €/L
    coste_real: float | None = None  # €
    notas: str | None = None


@dataclass
class Coste:
    items: list[Ingrediente] = field(default_factory=list)
    coste_total: float | None = None
    margen_bruto: float | None = None
    porcentaje_beneficio: float | None = None
    pvp: float | None = None  # Precio de venta


@dataclass
class Receta:
    titulo: str
    subtipo: str  # "Pizza" | "Postre"
    descripcion: str | None
    raciones: int | None
    ingredientes: list[Ingrediente]
    preparacion: list[str]
    coste: Coste
    metadata: dict[str, str]


# --- extractors -------------------------------------------------------------


def _extract_margen_from_text(text: str) -> tuple[float | None, float | None, float | None]:
    """Lee el margen / porcentaje / PVP desde texto narrativo o tablas sueltas.

    El texto puede venir como fila de tabla markdown, asi que la regex busca
    en cualquier parte de la linea.
    """
    # Numero con coma o punto decimal: "14.50", "14,50", "11.25".
    NUM = r"\d+(?:[.,]\d+)?"

    margen = None
    pct = None
    pvp = None

    # Formato pizzas (puede estar dentro de una fila de tabla):
    # "Margen de beneficio: 14.50 EUR - 3.25 EUR = 11.25 EUR"
    #   o con acento: "Margen de beneficio: ..."
    #   el "EUR" puede aparecer como € (U+20AC) o literal EUR.
    EUR = r"(?:€|EUR)?"
    m = re.search(
        rf"[Mm][aá]rgen\s+de\s+beneficio:\s*({NUM})\s*{EUR}\s*-\s*({NUM})\s*{EUR}\s*=\s*({NUM})\s*{EUR}",
        text,
    )
    if m:
        margen = _to_float(m.group(3))
    # Porcentaje: "Porcentaje de beneficio: (11.25 / 14.50) * 100 = 77.59%"
    m = re.search(rf"Porcentaje\s+de\s+beneficio:.*?=\s*({NUM})\s*%", text)
    if m:
        pct = _to_float(m.group(1))
    # PVP en pizzas: aparece como "**14.50 EUR**" en Rentabilidad
    m = re.search(rf"\*\*\s*({NUM})\s*{EUR}\s*\*\*", text)
    if m:
        pvp = _to_float(m.group(1))
    return margen, pct, pvp


def _parse_pizza(sections: dict[str, list[str]], titulo: str, source: str) -> Receta:
    """Formato pizza: tablas con headers conocidos."""
    ingredientes: list[Ingrediente] = []
    preparacion: list[str] = []
    coste_items: list[Ingrediente] = []
    margen = coste_total = pvp = None
    pct = None
    descripcion = None
    raciones = None

    # Descripcion (texto antes de la primera tabla)
    pre = sections.get("_pre", [])
    if pre:
        # primera linea no vacia
        for ln in pre:
            s = ln.strip()
            if s:
                # Quitar cabecera H1 si se coló
                descripcion = re.sub(r"^#\s+", "", s)
                break

    for header, lines in sections.items():
        h_low = header.lower()
        # Tabla ingredientes
        if "ingrediente" in h_low and "coste" not in h_low:
            tbl = _parse_table(lines)
            # primera fila es header
            for row in tbl[1:]:
                if len(row) >= 2 and row[0]:
                    ingredientes.append(
                        Ingrediente(nombre=row[0], cantidad=row[1] if len(row) > 1 else None)
                    )
        # Tabla coste
        elif "coste" in h_low or "escandallo" in h_low:
            tbl = _parse_table(lines)
            for row in tbl[1:]:
                if not row or not row[0]:
                    continue
                # Detectar filas de totales narrativos (no son ingredientes)
                low = row[0].lower()
                if low.startswith(("margen", "porcentaje", "coste")):
                    continue
                # Si la primera columna contiene ":" es narrativa (ej "Margen de beneficio: ...")
                if ":" in row[0]:
                    continue
                ing = Ingrediente(
                    nombre=row[0],
                    precio_unidad=_to_float(row[1]) if len(row) > 1 else None,
                    coste_real=_to_float(row[2]) if len(row) > 2 else None,
                    notas=row[1] if len(row) > 1 else None,
                )
                coste_items.append(ing)
            # margen / pvp en texto narrativo dentro de la misma seccion
            full_text = "\n".join(lines)
            m, p, v = _extract_margen_from_text(full_text)
            margen = margen or m
            pct = pct or p
            pvp = pvp or v
        # Preparacion
        elif "preparaci" in h_low or "ejecuci" in h_low or "fase" in h_low:
            for ln in lines:
                ln = ln.strip()
                # capturar items numerados o bullets
                m = re.match(r"^\s*(?:\d+[\.\)]\s+|[-\*]\s+)(.+)$", ln)
                if m:
                    preparacion.append(m.group(1).strip())
        # Rentabilidad (pizza: linea con **PVP**)
        if "rentabilidad" in h_low:
            full_text = "\n".join(lines)
            m, p, v = _extract_margen_from_text(full_text)
            margen = margen or m
            pct = pct or p
            pvp = pvp or v

    return Receta(
        titulo=titulo,
        subtipo="Pizza",
        descripcion=descripcion,
        raciones=raciones,
        ingredientes=ingredientes,
        preparacion=preparacion,
        coste=Coste(items=coste_items, coste_total=coste_total, margen_bruto=margen, porcentaje_beneficio=pct, pvp=pvp),
        metadata={"fuente": source, "formato": "escandallo_pizza"},
    )


def _parse_sop(sections: dict[str, list[str]], titulo: str, source: str) -> Receta:
    """Formato SOP/POE de postre: multiples tablas, lista de ingredientes en la mise en place."""
    ingredientes: list[Ingrediente] = []
    preparacion: list[str] = []
    coste_items: list[Ingrediente] = []
    coste_total = margen = pct = pvp = None
    descripcion = None
    raciones = None

    pre = sections.get("_pre", [])
    for ln in pre:
        s = ln.strip()
        if s and not descripcion:
            descripcion = s
            break

    for header, lines in sections.items():
        h_low = header.lower()
        # Mise en place suele tener tabla Ingrediente | Cantidad | Detalle
        if "mise" in h_low or "mise en place" in h_low:
            tbl = _parse_table(lines)
            for row in tbl[1:]:
                if not row or not row[0]:
                    continue
                ing = Ingrediente(
                    nombre=row[0],
                    cantidad=row[1] if len(row) > 1 else None,
                    notas=row[2] if len(row) > 2 else None,
                )
                ingredientes.append(ing)
        # Ejecucion / fases -> pasos
        elif "ejecuci" in h_low or "fase" in h_low or "elaboraci" in h_low or "preparaci" in h_low:
            for ln in lines:
                ln = ln.strip()
                m = re.match(r"^\s*(?:\d+[\.\)]\s+|[-\*]\s+)(.+)$", ln)
                if m:
                    preparacion.append(m.group(1).strip())
        # Coste / Escandallo / Rentabilidad
        elif "coste" in h_low or "escandallo" in h_low or "rentabilidad" in h_low or "margen" in h_low:
            tbl = _parse_table(lines)
            for row in tbl[1:]:
                if not row or not row[0]:
                    continue
                low = row[0].lower()
                if any(low.startswith(p) for p in ("coste", "margen", "pvp", "inversion", "incremento", "beneficio")):
                    continue
                if ":" in row[0]:
                    continue
                # detectar columna "coste" buscando un float en row[3]
                ing = Ingrediente(
                    nombre=row[0],
                    cantidad=row[1] if len(row) > 1 else None,
                    precio_unidad=_to_float(row[2]) if len(row) > 2 else None,
                    coste_real=_to_float(row[3]) if len(row) > 3 else None,
                    notas=row[2] if len(row) > 2 else None,
                )
                coste_items.append(ing)
            # buscar totales narrativos
            full_text = "\n".join(lines)
            m = re.search(r"COSTE\s+(?:MATERIA\s+PRIMA|PRODUCCI[OÓ]N\s+POR\s+RACI[OÓ]N)\*?\*?\s*[^\d]*([\d,]+)", full_text)
            if m:
                coste_total = _to_float(m.group(1))
            m = re.search(r"PVP\s+(?:recomendado|sugerido):?\s*([\d,]+)", full_text)
            if m:
                pvp = _to_float(m.group(1))
            m = re.search(r"COSTE\s+por\s+RACI[OÓ]N[^\d]*\(?\s*[÷/]\s*\d+\s*\)?\s*([\d,]+)", full_text)
            if m:
                coste_total = _to_float(m.group(1))

    return Receta(
        titulo=titulo,
        subtipo="Postre",
        descripcion=descripcion,
        raciones=raciones,
        ingredientes=ingredientes,
        preparacion=preparacion,
        coste=Coste(items=coste_items, coste_total=coste_total, margen_bruto=margen, porcentaje_beneficio=pct, pvp=pvp),
        metadata={"fuente": source, "formato": "sop_postre"},
    )


# --- public API -------------------------------------------------------------


def parse_md(path: Path, subtipo: str | None = None) -> Receta:
    """Parsea un .md y devuelve un Receta.

    subtipo: "Pizza" | "Postre" | None (autodetecta por la ruta del archivo).
    """
    md = path.read_text(encoding="utf-8")
    sections = _split_sections(md)

    # Detectar titulo del H1
    m = re.search(r"^#\s+(.+?)$", md, re.MULTILINE)
    titulo_raw = m.group(1).strip() if m else path.stem
    # Limpiar prefijos "Escandallo de " / "SOP: " / "POE: " / "Ficha de ..."
    titulo = re.sub(r"^(Escandallo de|SOP:|POE:|Ficha de Producci[oó]n Est[aá]ndar\s*\([^)]+\):?)\s*", "", titulo_raw, flags=re.IGNORECASE).strip()
    # Quitar anotaciones entre parentesis al final: "Pizza Bacon (Pizza Blanca)" -> "Pizza Bacon"
    titulo = re.sub(r"\s*\([^)]+\)\s*$", "", titulo).strip()
    titulo = re.sub(r"\s*\[[^\]]+\]\s*$", "", titulo).strip()

    if subtipo is None:
        # Heuristica por nombre de archivo
        name_low = path.name.lower()
        if "pizza" in name_low:
            subtipo = "Pizza"
        elif any(x in name_low for x in ("tarta", "mousse", "postre")):
            subtipo = "Postre"
        else:
            subtipo = "Desconocido"

    if subtipo == "Pizza":
        return _parse_pizza(sections, titulo, str(path))
    return _parse_sop(sections, titulo, str(path))


def receta_to_dict(r: Receta) -> dict:
    """Serializa un Receta a dict listo para JSON."""

    def ing_to_dict(i: Ingrediente) -> dict:
        d = {"nombre": i.nombre}
        if i.cantidad:
            d["cantidad"] = i.cantidad
        if i.precio_unidad is not None:
            d["precio_unidad"] = i.precio_unidad
        if i.coste_real is not None:
            d["coste_real"] = i.coste_real
        if i.notas:
            d["notas"] = i.notas
        return d

    return {
        "titulo": r.titulo,
        "subtipo": r.subtipo,
        "descripcion": r.descripcion,
        "raciones": r.raciones,
        "ingredientes": [ing_to_dict(i) for i in r.ingredientes],
        "preparacion": r.preparacion,
        "coste": {
            "items": [ing_to_dict(i) for i in r.coste.items],
            "coste_total": r.coste.coste_total,
            "margen_bruto": r.coste.margen_bruto,
            "porcentaje_beneficio": r.coste.porcentaje_beneficio,
            "pvp": r.coste.pvp,
        },
        "metadata": r.metadata,
    }