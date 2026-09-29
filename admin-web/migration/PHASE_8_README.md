# FASE 8 — Emplatado IA (imagen) + Ficha técnica

Implementación del plan original del usuario, adaptado a la arquitectura
existente del proyecto (Supabase schema `notion_migration`, migración
gradual de FastAPI legacy → Edge Functions).

## Cambios estructurales

### Modelo de datos (migración: `phase-8-emplatado-ficha-tecnica.sql`)

`catalogos` extiende con 3 columnas nuevas (NO rompen lo existente):

| Columna | Tipo | Notas |
|---|---|---|
| `receta_tecnica` | `jsonb` | Estructura nueva: `{ingredientes: [{nombre,cantidad,unidad}], elaboracion_mise_en_place, elaboracion_servicio}` |
| `imagen_emplatado_id` | `uuid FK` → `catalogo_images.id` | **No es una URL**. Es FK al sistema de imágenes existente. |
| `ficha_tecnica_id` | `uuid FK` → `catalogo_images.id` | Mismo patrón. |

**¿Por qué FK en vez de URL?** Reutiliza TODO el sistema de imágenes:
dedup SHA-256, signed URLs, ref-counting, RLS, limpieza en cascada.
Además, `catalogo_images` ya soporta distintos tipos vía `source_type` —
simplemente añadimos `'emplatado'` y `'ficha_tecnica'` como valores válidos.

`receta_tecnica` es **columna NUEVA, no rompe `receta_estructurada`**.
La receta operativa (proceso/cantidades de la agenda) sigue viviendo
en `receta_estructurada`; `receta_tecnica` es la receta **presentable**
para imprimir (con mise_en_place y servicio separados).

Constraints nuevos en `catalogo_images`:
- `UNIQUE (catalogo_id) WHERE source_type='emplatado'` — 1 emplatado por producto.
- `UNIQUE (catalogo_id) WHERE source_type='ficha_tecnica'` — 1 ficha por producto.

### Settings (configuración)

2 keys nuevas en `app_settings` (NO son secretos → sí salen al frontend):

| Key | Tipo | Default |
|---|---|---|
| `prompt_emplatado` | text | "" (sin default — usuario debe rellenarlo) |
| `plantilla_ficha_tecnica` | text | plantilla HTML/CSS por defecto embebida en `technical_sheet_generator.py` |
| `openrouter_image_model` | text | `nano-banana/nano-banana` |

**No** añadimos `API_KEY_OPENROUTER_NANOBANA`: el modelo se accede con la
misma API key de OpenRouter (`openrouter_api_key`) ya existente. Una
sola key da acceso a todos los modelos del catálogo OpenRouter.

## Arquitectura de generación

### Botón 1 — "Generar propuestas de emplatado (IA)"

```
Frontend                      Backend (FastAPI legacy + Edge Functions)
   │                                    │
   │ POST /api/catalogos/{id}/emplatado/generar   (legacy)
   │        ó  invoke('ia-emplatado-imagen')      (Edge Function)
   │ ─────────────────────────────────────────► │
   │                                            │
   │                              ┌─────────────┴─────────────┐
   │                              │ openrouter_image_client    │
   │                              │ (FastAPI legacy)           │
   │                              │ ó Edge Function            │
   │                              │  - Lee prompt_emplatado   │
   │                              │  - Sustituye placeholders │
   │                              │  - Llama OpenRouter        │
   │                              │     (intenta images/gen    │
   │                              │      luego fallback chat)  │
   │                              └─────────────┬─────────────┘
   │                                            │
   │ ◄────────── { imagenes:[3 urls], modelo } ──┘
   │
   │  Usuario hace click en una
   │
   │ POST /api/catalogos/{id}/emplatado/seleccionar  (legacy)
   │        ó  invoke('ia-emplatado-seleccionar')     (Edge Function)
   │ ─────────────────────────────────────────► │
   │                                            │
   │                              ┌─────────────┴─────────────┐
   │                              │  1. Download o decode b64  │
   │                              │  2. SHA-256 → Storage     │
   │                              │  3. INSERT catalogo_images │
   │                              │  4. UPDATE catalogos      │
   │                              └─────────────┬─────────────┘
   │                                            │
   │ ◄────────── { image_id, signed_url } ───────┘
```

### Botón 2 — "Generar ficha técnica"

```
Frontend                  Backend FastAPI legacy (único)
   │                                │
   │ POST /api/catalogos/{id}/ficha-tecnica/generar
   │ ─────────────────────────────► │
   │                                │
   │                  ┌─────────────┴─────────────────────────┐
   │                  │ technical_sheet_generator.py          │
   │                  │  1. Lee plantilla_ficha_tecnica       │
   │                  │  2. Lee receta_tecnica + signed_url   │
   │                  │  3. WeasyPrint HTML → PDF             │
   │                  │  4. pypdfium2 PDF → PNG @ ~216 DPI    │
   │                  │  5. Storage + catalogo_images (1:1)   │
   │                  │  6. UPDATE catalogos.ficha_tecnica_id │
   │                  └─────────────┬─────────────────────────┘
   │                                │
   │ ◄──────── { image_id, signed_url } ──┘
```

### ¿Por qué la ficha técnica NO es Edge Function?

**WeasyPrint no funciona en Deno** (no tiene port oficial, requiere
Pango/GTK/GObject bindings nativas de C). `pypdfium2` sí está portado
pero WeasyPrint no.

**Alternativas evaluadas y descartadas:**
- `puppeteer-deno` / `chrome-aws-lambda` → añade ~300 MB de Chromium.
- `deno_dom` + render propio → no es lo bastante fiel al CSS print.
- Servicio externo (screenshotapi.io, urlbox) → añade dependencia y coste.

**Decisión**: la ficha técnica se queda en el backend FastAPI legacy.
WeasyPrint + pypdfium2 ya están instalados en Termux/Linux y producen
PDFs idénticos a Chrome. Es la opción más portable y de menor coste.
El proyecto ya tiene un patrón de "algunas features viven en FastAPI
mientras Edge Functions las absorbe gradualmente" (ver `ia-status`,
`test-providers`).

## Estructura de archivos

```
admin-web/
├── backend/
│   ├── openrouter_image_client.py       # NUEVO — cliente de imágenes
│   ├── technical_sheet_generator.py     # NUEVO — WeasyPrint + pypdfium2
│   ├── routers/
│   │   └── catalogos_ia.py              # NUEVO — 4 endpoints
│   ├── main.py                          # MOD — incluye nuevo router
│   ├── queries.py                       # MOD — columnas editables
│   ├── routers/settings.py              # MOD — sin cambios (NEVER keys)
│   └── requirements.txt                 # MOD — weasyprint, pypdfium2
└── migration/
    ├── phase-8-emplatado-ficha-tecnica.sql   # NUEVO
    └── PHASE_8_README.md                    # NUEVO (este archivo)

supabase/functions/
├── ia-emplatado-imagen/                  # NUEVO — genera 3 imágenes
├── ia-emplatado-seleccionar/             # NUEVO — persiste elección
└── settings/index.ts                     # MOD — whitelist actualizada

admin-web-frontend/src/
├── features/
│   └── entities/
│       └── components/
│           └── catalog-emplatado-section.tsx  # NUEVO — 2 botones + modales
├── services/
│   └── catalogos-emplatado.ts            # NUEVO — cliente HTTP/Edge Function
└── features/settings/settings-page.tsx   # MOD — 2 textareas nuevos
```

## Variables de plantilla en `plantilla_ficha_tecnica`

La plantilla HTML/CSS del usuario puede usar:

- `{{titulo}}`
- `{{categorias}}`
- `{{ingredientes}}` (ya formateado como `<ul><li>`)
- `{{mise_en_place}}` (HTML seguro a partir de markdown básico)
- `{{servicio}}` (HTML seguro a partir de markdown básico)
- `{{proceso}}` (HTML, fallback si mise_en_place no está relleno)
- `{{cantidades}}`
- `{{precio}}`, `{{anio}}`, `{{estado}}`
- `{{imagen_emplatado_url}}` (signed URL, vacío si no hay)
- `{{imagen_emplatado_alt}}`

Si la plantilla no contiene `{{imagen_emplatado_block}}` (placeholder
no estándar, usado por la plantilla por defecto), el código añade un
bloque `<div class="imagen-wrap">` automáticamente.

## Smoke test (sin BD)

```bash
cd admin-web/backend
python -c "
from technical_sheet_generator import build_html, html_to_pdf, pdf_to_png
html = build_html({
    'titulo': 'Pizza Margherita',
    'categorias': ['Pizzas'],
    'receta_tecnica': {
        'ingredientes': [{'nombre': 'Harina 00', 'cantidad': 500, 'unidad': 'g'}],
        'elaboracion_mise_en_place': 'Preparar masa 24h antes',
        'elaboracion_servicio': 'Hornear 90s',
    },
}, 'https://example.com/test.jpg')
pdf = html_to_pdf(html)
png = pdf_to_png(pdf, scale=3.0)
print(f'PNG: {len(png)} bytes, ~216 DPI')
"
```

## Pendientes / TODO

- [ ] Frontend: sección nueva en `detail-page.tsx` para catálogos (botones + modales).
- [ ] Settings UI: textareas para `prompt_emplatado` y `plantilla_ficha_tecnica`.
- [ ] Tests automatizados para `build_html` y `_fmt_ingredientes`.
- [ ] Edge Function de ficha técnica (cuando Deno soporte WeasyPrint o se
      decida instalar Chromium).
- [ ] Limpieza de imágenes viejas cuando se reemplaza el emplatado/ficha
      (ref-counting ya las borra cuando llegan a 0 refs, pero no se hace
      al reasignar FK).