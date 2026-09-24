# Admin-web UX — drag&drop, modo noche, export PDF, ideas visibles

**Fecha:** 2026-09-23

## Pedidos de David
1. Drag & drop en Pipeline (lo había pedido varias veces).
2. Modo noche estaba sobre botón Volver → mover a Configuración.
3. Nuevo: Exportar catálogo a PDF.
4. Asegurar que Ideas creativas/científicas se ven en la app (decía que no las veía, contrario a lo que yo le había dicho).
5. Más rápido, menos contexto.

## Diagnóstico del problema "no veo las vistas"
Las vistas SÍ estaban en el sidebar (`index.html`) y SÍ se renderizaban (`app.js` router + `ideas_creativas.js` + `ideas_cientificas.js`). El problema era que cuando MiniMax API key no estaba configurada, mostraban un mini `<div class="empty">` con un solo párrafo "IA no configurada". David lo interpretaba como "la vista no existe / está rota".

**Fix aplicado:** empty state ahora es un banner amarillo prominente con instrucciones paso a paso + sección "Qué hace esta vista" con los 3 pasos del flujo. Cuando David entre verá claramente que la vista funciona y solo falta configurar la key.

## Cambios entregados

### 1. Drag & drop en Pipeline (`js/pipeline.js`)
- HTML5 drag & drop entre columnas del Kanban.
- Cachea `TRANSICIONES` del backend (`/api/desarrollo/estados`).
- Solo permite drops a estados permitidos; los no permitidos no muestran highlight.
- Visual feedback: card arrastrada (rotación + opacidad), columna destino (outline verde discontinuo).
- Usa variables de módulo `DRAG_ORIGEN_ESTADO` y `DRAG_AGENDA_ID` (HTML5 no expone `dataTransfer.getData()` durante `dragover`).
- Re-render automático tras mover para reflejar el nuevo estado.

### 2. Modo noche en Configuración (`js/app.js` + `js/settings.js`)
- Quitado botón flotante `position:fixed` que se solapaba con "← Volver" del topbar.
- `app.js` ahora exporta `setTheme`, `toggleTheme`, `currentTheme`.
- `settings.js` tiene nueva sección "🎨 Apariencia" arriba del todo con badge dinámico + botón Cambiar.

### 3. Exportar catálogo a PDF (`js/list.js` + `css/style.css`)
- Botón "📄 Exportar PDF" en vista de Catálogos (junto a toggles Tarjeta/Tabla/Categorías).
- Usa `window.print()` nativo + `@media print` que oculta sidebar/topbar/filtros/paginación.
- Banner `.print-header` con título "Catálogo · Sol de Nit" + fecha.
- Cards con `break-inside: avoid` para no cortarse entre páginas.
- Cero dependencias externas.

### 4. Visibilidad Ideas creativas/científicas
- Empty state rediseñado (banner amarillo + descripción funcional).
- Ahora David ve claramente qué hace cada vista aunque IA no esté configurada.

## Validación
- Todos los JS pasan `node --check` ✅
- Imports cruzados `app.js` ↔ `settings.js` correctos (sin circular dependency).
- APIs del backend ya existían (`/api/desarrollo/estados`, `PATCH /api/agendas/{id}/estado`), cero cambios en backend.

## Decisiones
- **Drag & drop respeta TRANSICIONES**: si backend rechaza, toast de error. No se permite saltarse el workflow.
- **Export PDF sin deps**: `window.print()` nativo. Si David quiere más control (logo, paginación custom) en una próxima iteración, evaluar jsPDF.
- **Modo noche sin toggle rápido**: ahora hay que ir a Configuración para cambiarlo. Si David pide atajo de teclado (Ctrl+Shift+L), añadir.

## Pendiente / siguientes
- Probar el drag & drop en navegador real (yo no tengo navegador; David debe validar).
- Si David quiere export PDF del menú entero con fotos, evaluar jsPDF o render server-side.
- Si el botón "Volver" del topbar molesta visualmente cuando hay ruta detalle, considerar moverlo a la izquierda.