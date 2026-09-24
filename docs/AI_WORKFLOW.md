# AI_WORKFLOW — Integración de IA (emplatado + vajilla)

> Cómo se usa MiniMax API (MiniMax-M3) para generar propuestas.

---

## 1. Configuración

**Endpoint:** `https://api.minimax.io/v1/chat/completions`
**Modelo:** `MiniMax-M3`
**API key:** `MINIMAX_API_KEY` (en `backend/.env`)
**Headers:** `Authorization: Bearer <key>`, `Content-Type: application/json`

La API key **NO** se expone al frontend. Solo el backend la usa.

---

## 2. Emplatado

### 2.1 Endpoint

```
POST /api/ai/plating/{catalogo_id}
Body: { "context_extra": "..." (opcional) }
```

### 2.2 Flujo

```
1. Frontend llama a /api/ai/plating/{catalogo_id}
2. Backend:
   a. Lee catalogos.receta_estructurada, ingredientes, categorias
   b. Lee la agenda origen (si existe): objetivo, timeline
   c. Construye contexto estructurado
   d. Llama a MiniMax API con prompt especializado
   e. Parsea JSON (con retry si falla formato)
   f. Inserta 3 filas en plating_proposals (orden=1,2,3)
3. Frontend recibe las 3 propuestas y las muestra
```

### 2.3 Prompt base

```
Eres un chef creativo de una pizzería mediterránea en Cataluña.

Producto: {titulo}
Categoría: {categorias}
Ingredientes: {ingredientes}
Receta final: {receta_estructurada}
Contexto del desarrollo: {objetivo}
Restricciones:
  - Restaurante abierto viernes+sábado
  - Ticket medio objetivo: 20-25€
  - Emplatado debe estar listo en ≤6 min desde pedido
  - Vajilla disponible: ver inventario del restaurante

Genera 3 propuestas de emplatado DIFERENCIADAS entre sí. Cada una con:
- nombre (ej: "Emplatado clásico de pizzería")
- descripcion (2-3 frases, tono profesional)
- vajilla_sugerida (tipo de plato, color, forma, tamaño)
- razonamiento (por qué encaja con este producto)

Responde en JSON estricto:
[
  {"nombre": "...", "descripcion": "...", "vajilla_sugerida": "...", "razonamiento": "..."},
  {"nombre": "...", "descripcion": "...", "vajilla_sugerida": "...", "razonamiento": "..."},
  {"nombre": "...", "descripcion": "...", "vajilla_sugerida": "...", "razonamiento": "..."}
]
```

### 2.4 Validación

- Backend valida que la respuesta es JSON parseable.
- Si no, reintenta con prompt reforzado (1 vez).
- Si sigue fallando, devuelve error al frontend con mensaje claro.
- Solo se aceptan exactamente 3 propuestas.

### 2.5 Manejo de errores

- Si la API MiniMax falla → toast en frontend: "No se pudieron generar propuestas. Reintenta."
- Si el JSON es inválido → log en backend + error 502 al frontend.
- Si `MINIMAX_API_KEY` no está configurada → error 503 al frontend.

---

## 3. Vajilla

### 3.1 Endpoint

```
POST /api/ai/ware/{catalogo_id}
Body: { "plating_proposal_id": "..." }
```

### 3.2 Flujo

```
1. Frontend llama a /api/ai/ware/{catalogo_id} con plating_proposal_id
2. Backend:
   a. Lee la propuesta de emplatado elegida
   b. Lee el inventario completo de ware (donde disponibilidad=true)
   c. Construye contexto: producto + propuesta + inventario
   d. Llama a MiniMax API
   e. Parsea JSON, mapea ware_id por nombre (matching fuzzy)
   f. Inserta N filas en catalogo_ware (estado='PROPUESTA')
3. Frontend recibe las propuestas
```

### 3.3 Prompt base

```
Eres un chef + estilista gastronómico.

Producto a servir: {titulo}
Ingredientes principales: {ingredientes}
Receta: {receta_estructurada}

Emplatado elegido:
{nombre}: {descripcion}

Vajilla sugerida por el chef:
{vajilla_sugerida}

Inventario disponible en el restaurante:
{lista completa de ware con nombre, tipo, material, color, forma, tamaño}

Genera 3 combinaciones DIFERENTES de vajilla para servir este plato.
Para cada combinación:
- nombre de la presentación (ej: "Servicio clásico de pizzería")
- piezas elegidas (del inventario, usa los nombres EXACTOS)
- explicación de por qué cada pieza encaja con el plato y el emplatado

Responde en JSON estricto:
[
  {
    "nombre": "...",
    "piezas": ["nombre ware 1", "nombre ware 2", ...],
    "explicacion": "..."
  },
  ...
]
```

### 3.4 Matching fuzzy de nombres

El JSON de la IA usa nombres descriptivos. El backend los mapea a
`ware_id` con búsqueda case-insensitive + similitud. Si no encuentra
match con confianza > 80%, marca como "no resuelto" y devuelve warning.

---

## 4. Seguridad

- API key en `backend/.env` (gitignored).
- Endpoints IA solo accesibles desde la app autenticada (futuro).
- Rate limit: 1 llamada / 10s por sesión de usuario.
- Logs de cada llamada (sin contenido del prompt por privacidad).

---

## 5. Limitaciones

- MiniMax-M3 puede no responder siempre en castellano consistente.
  Mitigación: prompt en español + heurística de detección de idioma.
- El modelo puede "alucinar" ware que no existe. Mitigación: matching
  fuzzy contra inventario real antes de insertar.
- La calidad de las propuestas mejora con el tiempo conforme David
  refine los prompts.
