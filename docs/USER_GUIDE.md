# USER_GUIDE — Cómo trabajar con la app de desarrollo de productos

> Guía práctica para David (usuario principal).
> Enfocada en "qué hago cuando quiero X".

---

## 1. Acceso

La app corre en `http://127.0.0.1:8765` cuando arrancas el backend:

```bash
cd admin-web/backend
python main.py
```

No requiere login (entorno interno). El frontend se sirve automáticamente.

---

## 2. Sidebar — qué hace cada sección

### DESARROLLO
- **Pipeline** (`/desarrollo`) — vista Kanban con todos los productos en desarrollo.
- **Pendientes** (`/pendientes`) — qué necesito hacer ahora.

### CONTENIDO
- **Ideas** (`/ideas`) — Archivo de Ideas (catálogo libre de conceptos).
- **Agenda** (`/agendas`) — Centro del desarrollo (cada Agenda = un producto en desarrollo).
- **Catálogo** (`/catalogos`) — Productos finales validados.

### ANÁLISIS
- **Evaluaciones** (`/evaluaciones`) — feedback de mesas.
- **Emplatado** (`/emplatado`) — propuestas de emplatado pendientes.
- **Vajilla** (`/vajilla`) — inventario de vajilla + CRUD.

### DOCUMENTACIÓN
- **Cómo funciona** (`/documentacion`) — esta guía + diagramas.

---

## 3. Caso de uso típico

### 3.1 "Tengo una idea, quiero desarrollarla"

1. Ir a **Ideas** y abrir la idea.
2. Click en `+ Nuevo desarrollo` (en el detalle de la idea).
3. Rellenar objetivo del desarrollo → se crea una Agenda en estado `CONCEPTO`.

### 3.2 "Empiezo a probar en cocina"

1. Abrir el desarrollo en **Pipeline** (o en **Agenda**).
2. Click en `[ Crear Prueba 1 ]`.
3. Rellenar: fecha, objetivo.
4. Hacer la prueba → volver a la ficha → `[ Registrar resultado ]`.
5. Rellenar: resultado, observaciones.

### 3.3 "Quiero feedback de mesa"

1. Estado actual = `PRUEBA_1` con resultado registrado.
2. Click en `[ Crear evaluación ]`.
3. Seleccionar 1-2 mesas + nº personas + fecha → guardar.
4. Recoger feedback → volver → registrar valoración y observaciones por mesa.

### 3.4 "El feedback dice que hay que cambiar"

1. Estado actual = `EVALUACION_1`.
2. Click en `[ Registrar modificación ]`.
3. Modificar la receta tentativa en los bloques de la Agenda.
4. Click en `[ Crear Prueba 2 ]` → nueva prueba con la receta modificada.

### 3.5 "La segunda prueba ha salido bien"

1. Estado actual = `PRUEBA_2` con resultado.
2. Click en `[ Validar producto ]`.
3. Marcar el checklist (receta definitiva, imagen definitiva, etc.).
4. Cuando todos los checks están ✓ → `[ Crear producto en catálogo ]`.
5. Confirmar datos pre-rellenados → guardar.
6. La Agenda pasa a estado `PRODUCTO` y la entrada aparece en Catálogo.

### 3.6 "Quiero ideas de emplatado"

1. Abrir el producto en **Catálogo**.
2. Click en `[ Generar propuestas de emplatado ]`.
3. Esperar unos segundos (IA pensando).
4. Revisar las 3 propuestas generadas → marcar una como `ELEGIDA`.

### 3.7 "Quiero analizar vajilla"

1. Producto ya tiene propuesta de emplatado elegida.
2. Click en `[ Analizar vajilla ]`.
3. IA propone 3 combinaciones del inventario real.
4. Revisar → marcar cada pieza como `ELEGIDA` o `DESCARTADA`.

---

## 4. Acciones rápidas

### 4.1 Buscar un desarrollo

**Topbar** (próximamente) → búsqueda global que busca en Ideas + Agendas + Catálogo.

Por ahora:
- En Ideas: filtro por categoría + búsqueda por título.
- En Agendas: filtro por etiqueta + búsqueda + orden por fecha.
- En Catálogo: filtro por categoría + estado + orden.

### 4.2 Ver todos mis pendientes

Ir a **Pendientes**. Lista priorizada:
- 🔴 Urgentes (>3 días esperando acción)
- 🟠 Hoy
- 🟡 Esta semana
- 🟢 Listos para producto

### 4.3 Cambiar manualmente el estado de un desarrollo

**No recomendado** — usar los botones contextuales. Pero si hay que
forzar: en la ficha del desarrollo, sección "Estado del desarrollo",
botón `✎` para editar.

---

## 5. Gestión de imágenes

### 5.1 Subir imagen a un registro

1. Abrir la galería en cualquier detalle.
2. Click en `+ Añadir imagen`.
3. Seleccionar archivo + tipo (bloque o propiedad) + opcional ID de bloque.
4. Guardar.

Si el archivo ya existe (mismo SHA-256), se deduplica automáticamente
y se muestra un mensaje.

### 5.2 Eliminar imagen

Click en `×` en la imagen → confirmación → eliminar.

Si nadie más usa esa imagen físicamente, también se borra de Storage.
Si alguien más la usa, solo se borra la referencia.

---

## 6. Gestión de relaciones

### 6.1 Vincular idea ↔ agenda

En el detalle de una Agenda, sección "Relaciones", sub-sección "Ideas":
- Click en `+ Añadir` → buscar idea → seleccionar.

Lo mismo para Catálogo y para las otras dos relaciones N:M.

### 6.2 Eliminar relación

Click en `×` en la fila de la relación → confirmación → eliminar.

**Importante:** elimina solo la RELACIÓN, no los registros.

---

## 7. Emplatado y vajilla

### 7.1 Si la IA no genera propuestas útiles

1. Regenerar (botón en la ficha del producto) — crea nuevas propuestas (orden 4,5,6).
2. Las antiguas quedan como historial para comparar.
3. Si sigue mal, ajustar manualmente la `receta_estructurada` y reintentar.

### 7.2 Añadir vajilla al inventario

1. Ir a **Vajilla**.
2. Click en `+ Nueva pieza`.
3. Rellenar: nombre, tipo, marca, material, color, forma, tamaño, disponibilidad.
4. Opcional: subir foto.

---

## 8. Atajos de teclado

- `Esc` — cerrar modal.
- `/` — focus en búsqueda (próximamente).

---

## 9. Errores comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| No se ven imágenes | Bucket Storage privado sin signed URL | Verificar `/api/images/signed` |
| "Error 502" al guardar | Schema de Supabase cambió o RLS activado | Verificar logs backend |
| IA devuelve texto sin JSON | Prompt poco claro | Regenerar; revisar prompt en `AI_WORKFLOW.md` |
| Pipeline vacío | Todas las agendas tienen `estado_desarrollo=NULL` | Click en cualquier agenda → asignar estado |
| Pendientes no aparecen | Filtro temporal muy estricto | Refrescar página |

---

## 10. Respaldo

- Los datos viven 100% en Supabase. La app no almacena nada propio.
- Para respaldar: export desde Supabase Dashboard → SQL Editor.
- Para auditoría: `migration_runs` y `migration_manifest` mantienen el historial de la migración original desde Notion.
