"""
Generador de FICHA TECNICA en imagen de alta resolucion.

Pipeline:
  1. Lee la plantilla HTML/CSS desde app_settings.plantilla_ficha_tecnica.
  2. Inyecta datos del catalogo (titulo, ingredientes, mise_en_place, servicio)
     y la imagen de emplatado (signed URL) en los placeholders {{...}}.
  3. Renderiza HTML -> PDF con WeasyPrint (CSS @page, fonts embebidas, etc.).
  4. Convierte PDF pagina 1 -> PNG con pypdfium2 (escala 3x = ~216 DPI, alta res).
  5. Sube PNG a Supabase Storage con dedup SHA-256.
  6. Inserta fila en catalogo_images con source_type='ficha_tecnica'.
  7. UPDATE catalogos.ficha_tecnica_id.

NO usa IA para generar contenido: los textos vienen 100% de la receta del
catalogo (lo que el usuario ya valido). Solo se maqueta visualmente.
"""
import hashlib
import io
import logging
import re

import httpx

import supabase_client as sb
from config import config


log = logging.getLogger(__name__)


PLACEHOLDERS = [
    "{{titulo}}",
    "{{categorias}}",
    "{{ingredientes}}",
    "{{mise_en_place}}",
    "{{servicio}}",
    "{{proceso}}",
    "{{cantidades}}",
    "{{imagen_emplatado_url}}",
    "{{imagen_emplatado_alt}}",
    "{{precio}}",
    "{{anio}}",
    "{{estado}}",
]


def _get_settings() -> dict:
    rows = sb.query(
        f"SELECT key, value FROM {config.DB_SCHEMA}.app_settings "
        f"WHERE key IN ('plantilla_ficha_tecnica')"
    )
    out = {}
    for r in rows:
        out[r["key"]] = r.get("value", "") or ""
    return out


def _get_catalogo(catalogo_id: str) -> dict | None:
    rows = sb.query(
        f"SELECT id, titulo, categorias, ingredientes, receta_estructurada, "
        f"receta_tecnica, precio, anio, estado, imagen_emplatado_id "
        f"FROM {config.TABLE_CATALOGOS} WHERE id = '{catalogo_id}' LIMIT 1"
    )
    return rows[0] if rows else None


def _get_image_row(image_id: str) -> dict | None:
    rows = sb.query(
        f"SELECT id, storage_bucket, storage_path FROM {config.TABLE_CATALOGO_IMAGES} "
        f"WHERE id = '{image_id}' LIMIT 1"
    )
    return rows[0] if rows else None


def _signed_url_for(image_id: str) -> str | None:
    """Devuelve signed URL (TTL 1h) de la imagen, o None si no existe."""
    row = _get_image_row(image_id)
    if not row:
        return None
    try:
        return sb.signed_url(row["storage_bucket"], row["storage_path"])
    except sb.SupabaseError as e:
        log.warning("signed_url fallo: %s", e)
        return None


def _fmt_ingredientes(receta_tecnica: dict | None, receta_estructurada: dict | None) -> str:
    """Convierte ingredientes a HTML (ul/li). Prioriza receta_tecnica."""
    rec = (receta_tecnica or {}).get("ingredientes")
    if not rec:
        rec = (receta_estructurada or {}).get("ingredientes")

    if isinstance(rec, list):
        items = []
        for ing in rec:
            if isinstance(ing, dict):
                nombre = ing.get("nombre") or ing.get("name") or ""
                cantidad = ing.get("cantidad") or ing.get("qty") or ""
                unidad = ing.get("unidad") or ing.get("unit") or ""
                partes = [p for p in (str(cantidad).strip(), str(unidad).strip()) if p and p not in ("None", "0", "0.0")]
                sufijo = " ".join(partes)
                line = f"<strong>{nombre}</strong>"
                if sufijo:
                    line += f" <span class='qty'>{sufijo}</span>"
                items.append(f"<li>{line}</li>")
            else:
                items.append(f"<li>{ing}</li>")
        return f"<ul class='ingredientes'>{''.join(items)}</ul>" if items else "<p class='muted'>—</p>"
    elif rec:
        # Texto libre legacy: respetar saltos de linea
        lineas = [l.strip() for l in str(rec).splitlines() if l.strip()]
        items = "".join(f"<li>{l}</li>" for l in lineas)
        return f"<ul class='ingredientes'>{items}</ul>"
    return "<p class='muted'>—</p>"


def _fmt_texto_markdown(texto: str) -> str:
    """
    Conversion MUY basica de texto a HTML para la ficha tecnica.
    NO es un markdown completo: solo lo minimo para que se vea bien
    (saltos de linea, listas con -, **negrita**).
    Asi no dependemos de python-markdown ni bleach.
    """
    if not texto:
        return "<p class='muted'>—</p>"
    texto = str(texto).replace("\r\n", "\n")
    lineas = texto.split("\n")
    out: list[str] = []
    in_list = False
    for ln in lineas:
        s = ln.rstrip()
        if s.startswith("- "):
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f"<li>{_inline_md(s[2:])}</li>")
        else:
            if in_list:
                out.append("</ul>")
                in_list = False
            if s.strip() == "":
                out.append("")
            else:
                out.append(f"<p>{_inline_md(s)}</p>")
    if in_list:
        out.append("</ul>")
    return "\n".join(out)


def _inline_md(s: str) -> str:
    """Convierte **negrita** y *cursiva* simples."""
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"\*(.+?)\*", r"<em>\1</em>", s)
    return s


def build_html(catalogo: dict, signed_image_url: str | None) -> str:
    """
    Construye el HTML final sustituyendo placeholders en la plantilla.
    """
    settings = _get_settings()
    plantilla = settings.get("plantilla_ficha_tecnica", "")

    # Plantilla por defecto (si el usuario no ha definido una)
    if not plantilla:
        plantilla = _default_template()

    receta_tecnica = catalogo.get("receta_tecnica") or {}
    receta_estructurada = catalogo.get("receta_estructurada") or {}

    ingredientes_html = _fmt_ingredientes(receta_tecnica, receta_estructurada)

    mise_en_place = (
        receta_tecnica.get("elaboracion_mise_en_place")
        or receta_estructurada.get("proceso")
        or ""
    )
    servicio = (
        receta_tecnica.get("elaboracion_servicio")
        or receta_estructurada.get("montaje")
        or receta_estructurada.get("proceso")
        or ""
    )

    categorias = catalogo.get("categorias") or []
    if isinstance(categorias, list):
        categorias_str = ", ".join(str(c) for c in categorias)
    else:
        categorias_str = str(categorias)

    out = plantilla
    out = out.replace("{{titulo}}", str(catalogo.get("titulo") or ""))
    out = out.replace("{{categorias}}", categorias_str)
    out = out.replace("{{ingredientes}}", ingredientes_html)
    out = out.replace("{{mise_en_place}}", _fmt_texto_markdown(mise_en_place))
    out = out.replace("{{servicio}}", _fmt_texto_markdown(servicio))
    out = out.replace("{{proceso}}", _fmt_texto_markdown(receta_estructurada.get("proceso") or ""))
    out = out.replace("{{cantidades}}", str(receta_estructurada.get("cantidades") or ""))
    out = out.replace("{{precio}}", str(catalogo.get("precio") or ""))
    out = out.replace("{{anio}}", str(catalogo.get("anio") or ""))
    out = out.replace("{{estado}}", str(catalogo.get("estado") or ""))
    out = out.replace(
        "{{imagen_emplatado_url}}",
        signed_image_url or "",
    )
    out = out.replace(
        "{{imagen_emplatado_alt}}",
        str(catalogo.get("titulo") or "Emplatado"),
    )
    return out


def _default_template() -> str:
    """Plantilla HTML/CSS por defecto — el usuario puede sobreescribirla en Settings."""
    return """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica', 'Arial', sans-serif;
    color: #1a1a1a;
    font-size: 11pt;
    line-height: 1.4;
    margin: 0;
  }
  .ficha {
    display: flex;
    flex-direction: column;
    gap: 12pt;
  }
  .header {
    border-bottom: 2pt solid #c97b3a;
    padding-bottom: 8pt;
  }
  h1 {
    font-size: 22pt;
    margin: 0 0 4pt 0;
    color: #c97b3a;
    letter-spacing: 0.5pt;
  }
  .categorias {
    font-size: 9pt;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 1pt;
  }
  .imagen-wrap {
    width: 100%;
    text-align: center;
    margin: 4pt 0 8pt 0;
  }
  .imagen-wrap img {
    max-width: 100%;
    max-height: 80mm;
    object-fit: cover;
    border-radius: 4pt;
    box-shadow: 0 2pt 6pt rgba(0,0,0,0.15);
  }
  .seccion {
    page-break-inside: avoid;
  }
  h2 {
    font-size: 12pt;
    margin: 8pt 0 4pt 0;
    color: #c97b3a;
    text-transform: uppercase;
    letter-spacing: 1pt;
    border-bottom: 0.5pt solid #ddd;
    padding-bottom: 2pt;
  }
  ul.ingredientes {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2pt 12pt;
  }
  ul.ingredientes li {
    padding: 1pt 0;
    border-bottom: 0.25pt dotted #eee;
  }
  ul.ingredientes li .qty {
    color: #888;
    font-size: 9pt;
    margin-left: 4pt;
  }
  p { margin: 2pt 0; }
  .muted { color: #999; font-style: italic; }
  .footer {
    margin-top: 12pt;
    border-top: 0.5pt solid #ddd;
    padding-top: 4pt;
    font-size: 8pt;
    color: #888;
    text-align: right;
  }
</style>
</head>
<body>
<div class="ficha">
  <header class="header">
    <div class="categorias">{{categorias}}</div>
    <h1>{{titulo}}</h1>
  </header>

  {{imagen_emplatado_block}}

  <section class="seccion">
    <h2>Ingredientes</h2>
    {{ingredientes}}
  </section>

  <section class="seccion">
    <h2>Mise en place</h2>
    {{mise_en_place}}
  </section>

  <section class="seccion">
    <h2>Servicio</h2>
    {{servicio}}
  </section>

  <footer class="footer">
    Ficha tecnica generada automaticamente &middot; Sol de Nit
  </footer>
</div>
</body>
</html>
"""


def html_to_pdf(html: str) -> bytes:
    """WeasyPrint: HTML -> PDF."""
    from weasyprint import HTML
    buf = io.BytesIO()
    HTML(string=html, base_url=".").write_pdf(target=buf)
    return buf.getvalue()


def pdf_to_png(pdf_bytes: bytes, scale: float = 3.0) -> bytes:
    """
    pypdfium2: PDF primera pagina -> PNG.
    scale=3.0 -> ~216 DPI (alta resolucion para imprimir).
    """
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(io.BytesIO(pdf_bytes))
    page = pdf[0]
    pil_image = page.render(scale=scale).to_pil()
    buf = io.BytesIO()
    pil_image.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _upload_to_storage(catalogo_id: str, png_bytes: bytes) -> tuple[str, str]:
    """
    Sube PNG al bucket. Devuelve (storage_path, sha256).
    Path: catalogos/{catalogo_id}/ficha-{sha[:16]}.png
    """
    sha = hashlib.sha256(png_bytes).hexdigest()
    ext = "png"
    path = f"catalogos/{catalogo_id}/ficha-{sha[:16]}.{ext}"
    sb.upload_file(config.STORAGE_BUCKET, path, png_bytes, "image/png")
    return path, sha


def _insert_image_row(catalogo_id: str, storage_path: str, sha: str,
                      mime: str, size: int) -> dict:
    """Inserta fila en catalogo_images con source_type='ficha_tecnica'.
    Si ya existe una ficha para este catalogo, hace UPDATE (1:1).
    """
    rows = sb.query(
        f"SELECT id FROM {config.TABLE_CATALOGO_IMAGES} "
        f"WHERE catalogo_id = '{catalogo_id}' AND source_type = 'ficha_tecnica' LIMIT 1"
    )
    if rows:
        old_id = rows[0]["id"]
        # Borra la fila vieja (storage_path viejo lo limpia el cron si existe)
        sb.exec(
            f"DELETE FROM {config.TABLE_CATALOGO_IMAGES} WHERE id = '{old_id}'"
        )
    sql = (
        f"INSERT INTO {config.TABLE_CATALOGO_IMAGES} "
        f"(catalogo_id, source_type, storage_bucket, storage_path, "
        f"original_filename, mime_type, file_size_bytes, sha256, position) "
        f"VALUES ('{catalogo_id}', 'ficha_tecnica', '{config.STORAGE_BUCKET}', "
        f"'{storage_path}', 'ficha-tecnica.png', '{mime}', {size}, '{sha}', 0) "
        f"RETURNING id, storage_path, sha256"
    )
    out = sb.query(sql)
    return out[0] if out else {}


def _set_catalogo_ficha_id(catalogo_id: str, image_id: str) -> None:
    sb.exec(
        f"UPDATE {config.TABLE_CATALOGOS} "
        f"SET ficha_tecnica_id = '{image_id}' "
        f"WHERE id = '{catalogo_id}'"
    )


def generate(catalogo_id: str) -> dict:
    """
    Punto de entrada principal: genera la ficha tecnica para un catalogo.
    Requiere que el catalogo tenga imagen_emplatado_id.
    """
    cat = _get_catalogo(catalogo_id)
    if not cat:
        raise ValueError(f"Producto {catalogo_id} no encontrado")

    imagen_emplatado_id = cat.get("imagen_emplatado_id")
    if not imagen_emplatado_id:
        raise ValueError(
            "El producto aun no tiene imagen de emplatado. "
            "Primero genera y selecciona una imagen."
        )

    signed_url = _signed_url_for(imagen_emplatado_id)
    if not signed_url:
        raise RuntimeError("No se pudo obtener URL firmada de la imagen de emplatado")

    log.info("Generando ficha tecnica para catalogo %s", catalogo_id)

    html = build_html(cat, signed_url)

    # Inyectar bloque de imagen solo si hay URL (sustitucion post-template)
    if signed_url:
        img_block = (
            f'<div class="imagen-wrap"><img src="{signed_url}" '
            f'alt="{cat.get("titulo") or "Emplatado"}" /></div>'
        )
        html = html.replace("{{imagen_emplatado_block}}", img_block)
    else:
        html = html.replace("{{imagen_emplatado_block}}", "")

    log.info("HTML construido: %d bytes", len(html))

    pdf_bytes = html_to_pdf(html)
    log.info("PDF renderizado: %d bytes", len(pdf_bytes))

    png_bytes = pdf_to_png(pdf_bytes, scale=3.0)
    log.info("PNG renderizado: %d bytes", len(png_bytes))

    storage_path, sha = _upload_to_storage(catalogo_id, png_bytes)
    log.info("Subido a Storage: %s (sha=%s)", storage_path, sha[:16])

    image_row = _insert_image_row(
        catalogo_id=catalogo_id,
        storage_path=storage_path,
        sha=sha,
        mime="image/png",
        size=len(png_bytes),
    )
    image_id = image_row.get("id", "")
    if image_id:
        _set_catalogo_ficha_id(catalogo_id, image_id)

    return {
        "image_id": image_id,
        "storage_path": storage_path,
        "sha256": sha,
        "size_bytes": len(png_bytes),
        "signed_url": sb.signed_url(config.STORAGE_BUCKET, storage_path),
        "modelo": "weasyprint + pypdfium2",
    }