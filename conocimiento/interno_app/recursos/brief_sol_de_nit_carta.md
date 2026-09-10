# 🍕 Brief estratégico de carta — Sol de Nit

> Documento de referencia para el **Chef Creativo** y cualquier agente que proponga elaboraciones, fichas técnicas o maridajes para la pizzería Sol de Nit.
>
> Fecha de creación: 2026-09-04 (sesión de brainstorming con David).
> Estado: vivo — se actualizará cuando se cierren decisiones de carta.

---

## 1. Estado actual de la carta

- **Pilares existentes**: pizzas + ensaladas + una tostada.
- **Ticket medio actual**: 17–20 € (ya documentado en `AGENTS.md`).
- **Objetivo de ticket medio**: 20–25 €.

---

## 2. El problema a resolver: cómo subir el ticket medio sin tocar las pizzas

Tres caminos posibles evaluados por David:

| Camino | ¿Por qué se descarta? |
|---|---|
| Subir el precio de las pizzas | Mercado muy competitivo — sensibilidad altísima del cliente. Imposible. |
| Reducir el tamaño de las pizzas | Perjudica a la clientela fija (que ya compra por valor/ración completa). Imposible. |
| **Añadir platos pequeños para compartir + postres de calidad** | ✅ **Camino elegido**. Aporta valor real sin tocar lo que ya funciona. |

---

## 3. Estrategia de carta (lo que SÍ hay que crear)

#### 3.1 Platos pequeños para compartir
- Pensados para **acompañar y complementar la pizza**, no para sustituirla.
- Deben **apetecer** (visual, olor, concepto) para que la clientela piense "esto lo pedimos para compartir".
- Coherencia obligatoria con la pizza: **conceptual y gustativamente**. Si no tiene relación con el mundo pizza, no entra en carta.
- Formato: ración pequeña, precio individual accesible (para que el cliente no dude en pedir).

#### 3.2 Postres de calidad
- Toque **creativo**, **sencillo** de ejecutar.
- **No** queremos 50 elaboraciones complejas para llegar al producto final.
- Calidad por encima de cantidad de procesos.
- Mismo criterio de coherencia con el universo pizza (sabores mediterráneos, italianos, etc.).

---

## 4. Restricciones operativas duras (cumplir SIEMPRE)

Estas restricciones **son invariantes**. Cualquier ficha técnica que proponga el Chef Creativo debe satisfacerlas o se rechaza para producción:

### 4.1 Cadencia del restaurante
- **Apertura al público**: viernes y sábado **únicamente**.
- **Elaboración previa**: puede prepararse cualquier día de la semana.
- **Implicación crítica**: una elaboración hecha el **lunes** tiene que aguantar (en perfectas condiciones) hasta el **viernes-sábado** siguiente — o ser congelable sin perder calidad.

### 4.2 Tiempo de servicio en sala
- **Máximo 5–6 minutos** desde que el cliente pide hasta que el plato/postre llega a la mesa.
- Esto descarta elaboraciones de larga cocción final, emplatados complicados o que requieran última cocción prolongada.

### 4.3 Facilidad operativa
- **Fáciles de emplatar**: emplatado limpio, sin remontajes complejos en el momento del servicio.
- **Fáciles de servir**: no requieren manipulación especial, cubiertos extra, ni instrucciones al cliente.

### 4.4 Conservación
- Productos perecederos: deben aguantar la semana o admitir congelación.
- Los **congelados**, una vez descongelados, deben mantener textura y sabor (evitar elaboraciones cuya calidad dependa de consumir fresco en el día).

---

## 5. Requisito obligatorio en TODA ficha técnica propuesta

Cada ficha técnica generada por el Chef Creativo para Sol de Nit debe incluir **explícitamente** una sección dedicada a **conservación y servicio**:

```
## Conservación y servicio
- Vida útil en frío: X días (ej: 4-5 días en nevera, 0-4°C)
- ¿Admite congelación? Sí/No + condiciones (ej: "sí, en porciones individuales, hasta 3 meses")
- Cómo regenerar para servir: instrucciones paso a paso (microondas, horno, sartén, directo, etc.)
- Tiempo total de regeneración: ≤ 3 min idealmente
- Notas: cualquier advertencia (ej: "no congelar la base, solo el topping")
```

Si el Chef propone una ficha sin esta sección, **se considera incompleta** y debe regenerarse.

---

## 6. Universo creativo permitido

✅ **SÍ encaja**:
- Sabores mediterráneos, italianos, de pizzería napolitana/romana.
- Ingredientes que armonizan con pizza: tomate, mozzarella, burrata, embutidos curados, hierbas frescas (albahaca, orégano, romero), aceite de oliva, anchoas, alcaparras, aceitunas, prosciutto, rúcula, higos, miel, frutos secos, queso de cabra, ricotta.
- Técnicas que respetan los tiempos cortos: crudo, marinado, salteado rápido, horneado breve, frío.
- Conceptos de street-food italiana: arancini, supplì, croquetas, bruschette reinterpretadas, focacce.

❌ **NO encaja**:
- Cocinas lejanas sin puente conceptual (sushi, tacos, curry indio, etc.) a no ser que haya reinterpretación muy fuerte con conexión pizza.
- Elaboraciones de larga cocción que no aguanten la cadencia lunes→viernes.
- Postres de pastelería clásica compleja (mil hojas, croissants, etc.) que requieren horas de elaboración.
- Platos únicos pesados (raciones individuales grandes) — choca con el formato "para compartir".

---

## 6.1 Restricciones adicionales del menú real (2026-09-04)

> Estas restricciones vienen de **lo que ya existe en la carta** de Sol de Nit y hay que tenerlas en cuenta para evitar redundancias.

- **Ya hay cheesecake con coulis** → no proponer nuevos postres con la fórmula *base cremosa + coulis de fruta* (panna cotta con frutos rojos, crema catalana con coulis, etc. están descartados por redundancia).
- **Panna cotta con AOVE y frutos rojos**: idea **reservada** (no descartada) — guardada en `brief_sol_de_nit_carta.md` sección "Banco de ideas en reserva" abajo. Coexiste con el cheesecake sin pisarse si en el futuro cambia el menú.

### Banco de ideas en reserva

| Idea | Estado | Motivo |
|---|---|---|
| Pizza "Burrata, Prosciutto y Tomate del Sol" | Pendiente de validación | A David le gustó en brainstorming 2026-09-04. Pendiente: validar PVP, proveedores burrata/prosciutto 24m. |
| Panna cotta con AOVE y frutos rojos | Reservada | Redundante con cheesecake con coulis actual. Reactivar si cambia el menú. |

---

## 9. Registro de brainstormings

> Cada sesión de brainstorming para Sol de Nit se registra en un archivo independiente dentro de `conocimiento/interno_app/recursos/brainstormings/`. Ver índice completo en `brainstormings/README.md`.

**Sesiones:**
- **2026-09-04 — Pizza premium**: ✅ F3 hecha (6 seleccionadas: #1, #5, #16, #17, #18, #20). Pendiente: F4 refinamiento → F5 shortlist → F6 ficha. Ver `brainstormings/2026-09-04-pizza-premium.md`.

**Sesiones planificadas:**
- ⏳ **Platos pequeños para compartir** — núcleo estratégico del brief.
- ⏳ **Postres** — restricción: NO fórmula cremoso + coulis (ya hay cheesecake con coulis en carta).

---

## 7. Métricas de éxito

- **Ticket medio**: subir de 17–20 € a 20–25 €.
- **Penetración**: % de mesas que piden al menos un plato compartido o un postre (KPIs a definir cuando haya datos reales).

---

## 8. Pendientes operativos

- [ ] Catálogo concreto de platos pequeños candidatos (3–5 ideas iniciales).
- [ ] Catálogo concreto de postres candidatos (3–5 ideas iniciales).
- [ ] Validar capacidad de congelación/descongelación de cada propuesta con pruebas reales en cocina.
- [ ] Definir PVP objetivo por categoría (plato compartido, postre).
- [ ] Decidir si los platos compartidos se ofrecen al centro de la mesa (una sola ración) o individualmente (cada comensal pide el suyo).

---

## 9. Notas para el Chef Creativo (lente operativo al generar ideas)

Cuando David pida ideas para Sol de Nit (vía CLI, HF Space, o `/ideas`), el Chef Creativo debe:

1. **Asumir este brief como约束 implícitas** sin necesidad de repetirlas en cada prompt.
3. Aplicar los **17 métodos creativos de ElBulli** (ver `conocimiento/fuentes_externas/metodos-creativos.md`) pero priorizar los que producen elaboraciones **sencillas**: minimalismo, lo autóctono, deconstrucción, simbiosis dulce/salado, adaptación, nueva manera de servir.
4. Generar **primero ideas de platos compartidos** (más impacto en ticket medio) y **después ideas de postres**.
5. Para cada ficha: **incluir siempre la sección de conservación y servicio**.
6. Filtrar automáticamente cualquier idea que:
   - No tenga conexión conceptual con pizza.
   - Requiera > 6 min de emplatado/cocción final.
   - No aguante de lunes a viernes o no sea congelable sin perder calidad.
7. Si una idea es brillante pero rompe una restricción, **avisar** y proponer alternativa compatible.

---

## 10. Referencias cruzadas

- `AGENTS.md` — resumen ejecutivo Sol de Nit (objetivo ticket).
- `conocimiento/interno_app/recursos/combinaciones_clasicas.csv` — combinaciones de ingredientes mediterráneos.
- `conocimiento/interno_app/recursos/estacionalidad.json` — productos de temporada en Cataluña.
- `conocimiento/fuentes_externas/metodos-creativos.md` — métodos creativos ElBulli.
- `conocimiento/fuentes_externas/flavor_data/flavor_mapping.json` — flavor engine para combinaciones químico-racionales.
- `agents/creativo/skills.py` — skills disponibles (`ideas_creativas`, `idea_cientifica`).
- `memory/memory.md` — decisiones de arquitectura del proyecto.

---

*Fin del brief. Cualquier propuesta de carta para Sol de Nit debe pasar por este filtro.*