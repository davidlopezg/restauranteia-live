# PRODUCT_WORKFLOW — Flujo de desarrollo de productos

> Documento vivo. Describe el ciclo de vida operativo que la app soporta.
> Cualquier cambio en el flujo debe actualizar este archivo.

---

## 1. Visión general

```
IDEA
  ↓ (origen conceptual)
CONCEPTO
  ↓ (primera prueba)
PRUEBA 1
  ↓ (evaluada en mesa)
EVALUACIÓN 1
  ↓ (analizada)
MODIFICACIÓN
  ↓ (receta ajustada)
PRUEBA 2
  ↓ (validada)
VALIDACIÓN
  ↓ (aprobada como producto)
PRODUCTO
  ↓ (con receta definitiva)
EMPLATADO (IA)
  ↓ (propuesta elegida)
VAJILLA (IA)
```

---

## 2. Estados y transiciones

### 2.1 Estados permitidos

| Estado | Significado |
|---|---|
| `CONCEPTO` | La idea está aterrizada. Sin pruebas todavía. |
| `PRUEBA_1` | Primera prueba en cocina. |
| `EVALUACION_1` | Evaluada en mesa (1-2 mesas, feedback recogido). |
| `MODIFICACION` | Receta ajustada tras feedback. |
| `PRUEBA_2` | Segunda prueba con receta modificada. |
| `VALIDACION` | Checklist + receta definitiva + imagen definitiva. |
| `PRODUCTO` | Entrada en Catálogo creada. |

### 2.2 Transiciones válidas

```
CONCEPTO     → PRUEBA_1
PRUEBA_1     → EVALUACION_1
EVALUACION_1 → MODIFICACION | PRUEBA_2 (si OK en primera)
MODIFICACION → PRUEBA_2
PRUEBA_2     → VALIDACION
VALIDACION   → PRODUCTO
```

### 2.3 Reglas

- **NO** se puede saltar estados (excepto: si la primera evaluación es
  excelente, `EVALUACION_1 → PRUEBA_2` está permitido).
- **NO** se puede volver atrás una vez creado el `PRODUCTO` en catálogo.
  Si hay que rehacer, se crea un nuevo desarrollo.
- **Las pruebas se conservan siempre** (historial completo en
  `development_tests`).

---

## 3. Acciones contextuales

Cada estado sugiere la siguiente acción lógica:

| Estado | Botón principal |
|---|---|
| `CONCEPTO` | `[ Crear Prueba 1 ]` |
| `PRUEBA_1` | `[ Registrar resultado ]` |
| `EVALUACION_1` | `[ Crear evaluación de mesa ]` |
| `MODIFICACION` | `[ Crear Prueba 2 ]` |
| `PRUEBA_2` | `[ Validar producto ]` |
| `VALIDACION` | `[ Crear producto en catálogo ]` |
| `PRODUCTO` | `[ Generar propuestas de emplatado ]` |

---

## 4. Validación

Antes de permitir crear el producto en catálogo, la app muestra un
checklist de requisitos:

- [ ] Prueba 1 realizada
- [ ] Feedback recogido
- [ ] Modificaciones realizadas
- [ ] Prueba 2 realizada
- [ ] Feedback revisado
- [ ] Receta definitiva (jsonb `receta_final`)
- [ ] Imagen definitiva (al menos 1 imagen en `catalogo_images`)

Solo cuando todos los checks están marcados, el botón `[ Crear producto ]`
se habilita.

---

## 5. Conversión a producto

Al validar:

1. Estado de la agenda → `PRODUCTO`.
2. Se crea fila en `catalogos` con datos pre-rellenados desde la agenda.
3. Se crea fila en `agenda_catalogo` (relación N:M).
4. `receta_final` (jsonb de la agenda) → `receta_estructurada` (jsonb del catálogo).
5. Imágenes marcadas como definitivas → asociadas al catálogo.

---

## 6. Emplatado (IA)

Después de `PRODUCTO`:

1. Backend llama a MiniMax API con contexto (receta, ingredientes, objetivo).
2. IA devuelve 3 propuestas de emplatado (JSON).
3. Backend inserta 3 filas en `plating_proposals` con `orden=1,2,3`.
4. David revisa y marca una como `ELEGIDA`.

Si David quiere regenerar, se crean nuevas propuestas (orden 4,5,6) — las
anteriores se mantienen como historial.

---

## 7. Vajilla (IA)

Después de elegir propuesta de emplatado:

1. Backend lee inventario completo de `ware`.
2. Llama a MiniMax API con contexto (producto + emplatado + inventario).
3. IA devuelve 3 combinaciones de vajilla.
4. Backend inserta N filas en `catalogo_ware` con `estado='PROPUESTA'`.
5. David revisa y marca cada pieza como `ELEGIDA` o `DESCARTADA`.

---

## 8. Línea temporal

Cada cambio importante genera un evento en `agendas.timeline` (jsonb):

```json
[
  {"ts": "2026-09-22T19:00:00Z", "tipo": "CONCEPTO_CREADO", "desc": "..."},
  {"ts": "2026-09-22T20:00:00Z", "tipo": "PRUEBA_INICIADA", "desc": "Prueba 1"},
  {"ts": "2026-09-23T10:00:00Z", "tipo": "EVALUACION", "desc": "Mesa 12, 2 personas"},
  {"ts": "2026-09-24T15:00:00Z", "tipo": "MODIFICACION", "desc": "..."},
  {"ts": "2026-09-25T12:00:00Z", "tipo": "PRODUCTO_CREADO", "desc": "Catálogo #42"}
]
```

Eventos generados automáticamente por el backend al:
- crear agenda con `estado_desarrollo`
- cambiar `estado_desarrollo`
- crear prueba
- crear feedback
- validar
- crear producto
- generar propuesta de emplatado
- elegir propuesta de emplatado
- elegir vajilla

---

## 9. Reglas operativas

| Acción | Efecto |
|---|---|
| Borrar agenda (con FK CASCADE) | Borra todas sus pruebas, feedback y eventos. |
| Borrar idea | No afecta a agendas que la referencian (no CASCADE desde ideas). |
| Borrar catálogo | No afecta a agendas que lo producen (la relación se borra). |
| Cambiar `estado_desarrollo` | Genera evento en timeline automáticamente. |
| Validar producto | Inmutable: una vez creado el catálogo, no se vuelve atrás. |
| Regenerar propuestas de emplatado | Crea nuevas filas, NO sobrescribe. |

---

## 10. Pendientes (panel `/pendientes`)

El panel deriva su contenido del estado real de los desarrollos:

```
🔴 URGENTE (>3 días esperando)
🟠 HOY (1-3 días)
🟡 ESTA SEMANA (4-7 días)
🟢 LISTO PARA PRODUCTO (checklist completo)
```

**Reglas:**

- Una agenda está en `🔴 URGENTE` si su última acción fue hace más de 3
  días y no está en estado `PRODUCTO`.
- Una agenda está en `🟢 LISTO PARA PRODUCTO` si su estado es `VALIDACION`
  y el checklist está completo.
- Una agenda está en `🟠 HOY` si su última prueba / feedback es de hoy.
- El resto van a `🟡 ESTA SEMANA`.

---

## 11. Métricas operativas (futuro)

- Tiempo medio en cada estado
- Tasa de éxito en primera prueba
- Tiempo medio IDEA → PRODUCTO
- Número de propuestas de emplatado por producto
- Vajilla más usada

(Por implementar en versiones futuras. Hoy se derivan de `agendas.timeline`.)
