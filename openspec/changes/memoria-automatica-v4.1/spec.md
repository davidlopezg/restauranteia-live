# Spec — Memoria automática del chat (Fase 4.1)

> Spec técnica formal. Define contratos, interfaces, formato de datos y tests requeridos para v4.1.

---

## 1. Contratos públicos

### 1.1 `agents/memoria/triggers.py`

#### `analizar_mensaje(mensaje: str) -> ResultadoAnalisis`

Analiza un mensaje del usuario y devuelve las ideas detectadas con su nivel de confianza.

**Input:**
- `mensaje: str` — texto crudo del usuario (sin procesar)

**Output:**
- `ResultadoAnalisis` con:
  - `ideas: list[IdeaDetectada]` — ideas detectadas (puede estar vacía)
  - `mensaje_relevante: bool` — True si hay al menos 1 idea
  - `tiempo_ms: float` — tiempo de análisis en milisegundos

**Comportamiento:**
- Devuelve lista VACÍA si el mensaje es solo cortesía / charla casual / muy corto
- Devuelve 1 idea (categoría principal) si hay keywords específicos
- NO escribe en DB
- Es thread-safe (sin estado mutable)
- Tiempo medio: <10ms por mensaje

**Garantías:**
- Idempotente: misma entrada → mismo output
- Sin side effects

#### `guardar_automatico(conn, mensaje, skill_origen=None) -> list[dict]`

Analiza el mensaje y guarda las ideas de ALTA confianza automáticamente.

**Input:**
- `conn: sqlite3.Connection` — conexión abierta
- `mensaje: str` — texto del usuario
- `skill_origen: str | None` — skill activa (default None)

**Output:**
- `list[dict]` con `{id, extracto, categoria}` por cada idea guardada
- Lista VACÍA si:
  - `is_memoria_activa()` es False
  - `get_memoria_modo()` != "alta"
  - El análisis no detecta ideas de ALTA confianza
  - Todas las ideas detectadas son duplicados

**Comportamiento:**
- Marca cada idea con `origen='auto-chat'`, `origen_skill=skill_origen`, `contexto='[auto]'`
- Deduplica contra ideas existentes (exacto + fuzzy ≥80%)
- Si una idea falla al guardar, sigue con las demás (no abort)
- Silencioso en errores (no lanza excepciones al caller)

#### `formatear_anexo_chat(guardadas, resultado=None) -> str`

Genera el texto del anexo al final de la respuesta del chef.

**Input:**
- `guardadas: list[dict]` — ideas que se acaban de guardar
- `resultado: ResultadoAnalisis | None` — opcional, para sugerencias en modo 'sugerir'

**Output:**
- `str` — texto del anexo (puede ser vacío)

**Comportamiento:**
- Si `guardadas` no está vacío → `📌 Guardé N ideas en tu archivo: #X, #Y`
- Si modo='sugerir' y hay ideas MEDIA → `💡 ¿Guardo esto? (categoría): extracto`
- Si nada → `""` (cadena vacía, sin ruido)
- Siempre termina con `*(esto es automático, \`/memoria off\` para desactivarlo)*`

---

### 1.2 `agents/memoria/config.py`

#### `is_memoria_activa(custom_path=None) -> bool`

¿Está activada la memoria automática?

**Comportamiento:**
- Si `MEMORIA_AUTOMATICA=0` env var → siempre False
- Lee de `custom_path` o del archivo default
- Default: True

#### `set_memoria_activa(activa: bool, custom_path=None) -> None`

Persiste el toggle en disco.

#### `get_memoria_modo(custom_path=None) -> str`

Devuelve `'alta'` o `'sugerir'`.

#### `set_memoria_modo(modo: str, custom_path=None) -> None`

Valida `modo` antes de guardar. Raises si no es `'alta'` ni `'sugerir'`.

#### `load_config(custom_path=None) -> dict`

Lee el JSON. Si no existe, crea el archivo con defaults.

#### `save_config(cfg: dict, custom_path=None) -> None`

Escribe el JSON. Crea el directorio si no existe.

#### `reset_config(custom_path=None) -> None`

Vuelve a defaults (útil para tests).

---

### 1.3 Comandos nuevos (`agents/memoria/commands.py`)

| Comando | Tipo | Devuelve |
|---|---|---|
| `/memoria on` | toggle | dict con mensaje confirmando activación |
| `/memoria off` | toggle | dict con mensaje confirmando desactivación |
| `/memoria alta` | modo | dict confirmando modo |
| `/memoria sugerir` | modo | dict confirmando modo |
| `/memoria patata` (inválido) | error | dict con `⚠️ argumento desconocido` |
| `/memoria-status` | consulta | dict con texto formateado |
| `/lista-auto [filtro]` | consulta | dict con ideas filtradas (solo origen='auto-chat') |
| `/olvidar auto` | destructivo | dict pidiendo confirmación (1er turno) |
| `olvidar auto` (sin /) | destructivo | dict confirmando borrado (2do turno) |

**Garantías:**
- Todos son transversales (funcionan en cualquier skill)
- Todos pasan por `_resolve_conn(conn)` para no abrir conexiones innecesarias
- `/olvidar auto` requiere confirmación explícita (2 turnos)
- `/lista-auto` y `/memoria-status` respetan el filtro y muestran contadores

---

## 2. Formato de datos

### 2.1 Schema SQLite (sin cambios)

```sql
CREATE TABLE ideas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,           -- ISO 8601 UTC
    updated_at TEXT,                    -- NULL hasta primer edit
    idea TEXT NOT NULL,
    categoria TEXT,                     -- valores: 'producto'|'elaboracion'|'tecnica'|'herramienta'|'receta'|'proveedor'|'cliente'|'evento'|'restriccion'|'concepto'|'otro' (o NULL)
    contexto TEXT,
    confirmada_por_usuario INTEGER NOT NULL DEFAULT 1,
    origen TEXT NOT NULL,               -- 'comando'|'auto-chat'|...
    origen_skill TEXT
);
```

### 2.2 Taxonomía (`agents/ideas_categorias.json` v2)

```json
{
  "version": 2,
  "categorias_principales": [
    "producto", "elaboracion", "tecnica", "herramienta", "receta",
    "proveedor", "cliente", "evento", "restriccion", "concepto", "otro"
  ],
  "categorias_alias_legacy": {
    "plato": "elaboracion",
    "menu_completo": "evento",
    "ocasion": "evento",
    "ocasion/evento": "evento"
  },
  "keywords": {
    "producto": { "ingredientes_fruta": [...], "ingredientes_verdura": [...], ... },
    "elaboracion": { "platos_genericos": [...], "tipos_plato": [...], ... },
    ...
  },
  "patrones_intencion_alta_confianza": {
    "frases_explicitas": ["^me gusta\\s+...", "^me gustaria\\s+...", ...]
  },
  "palabras_vacias_contexto_no_relevante": {
    "frases_cortesia": [...],
    "preguntas_meta": [...],
    "mensajes_cortos": [...]
  }
}
```

**Garantías:**
- El JSON es editable sin tocar código (categorías + keywords)
- `version: 2` indica la versión del esquema (para migraciones futuras)
- `categorias_alias_legacy` permite mapear ideas guardadas con categorías v1

### 2.3 Config persistente (`conocimiento/interno_restaurante/memoria_config.json`)

```json
{
  "activa": true,
  "modo": "alta",
  "umbral_confianza": "alta"
}
```

**Garantías:**
- El archivo se crea automáticamente al primer acceso si no existe
- Si está corrupto, se reinicia a defaults (no se rompe la app)
- `modo` ∈ `{'alta', 'sugerir'}`
- `umbral_confianza` ∈ `{'alta', 'media', 'baja'}`

---

## 3. Heurística de detección

### 3.1 Algoritmo de `analizar_mensaje()`

```
1. Normalizar mensaje (lowercase, sin acentos manteniendo ñ, colapsar espacios)
2. SI mensaje es cortesía/pregunta meta/muy corto → RETURN []
3. Detectar todas las categorías que aplican (con keywords específicos + patrones)
4. SI no hay categorías con específicos → RETURN []
5. Detectar intención explícita (regex sobre frases_explicitas)
6. Detectar intención simple (palabras: probar, usar, hacer, trabajar, elaborar, preparar, cocinar)
7. Resolver categoría principal según prioridad (receta > producto > herramienta > tecnica > ...)
8. Calcular confianza:
   - frase_intencion_explicita + 1+ específico → ALTA
   - 2+ específicos en misma categoría → ALTA
   - 1 específico + intención simple → ALTA
   - 1 específico sin intención → MEDIA
   - solo patrones sin específicos → BAJA
9. SI confianza es ALTA o MEDIA → IdeaDetectada(extracto, categoria, confianza, keywords)
10. RETURN [idea] (siempre max 1 idea en v4.1)
```

### 3.2 Extracción del extracto

```
1. SI mensaje <= 120 chars → extracto = mensaje completo (sin puntuación final redundante)
2. ELSE → dividir en oraciones (separadas por . ! ? ;)
3. Buscar primera oración que contenga cualquier keyword principal
4. Retornar esa oración (sin punto final redundante)
```

### 3.3 Word boundary policy

- **Single-word keywords**: word boundary ESTRICTO (`\bkw\b`) para evitar falsos positivos
- **Multi-word keywords**: substring matching (OK porque son frases únicas)
- Plurales: el JSON incluye explícitamente ambas formas (ej: `trufa` + `trufas`)

---

## 4. Integración con el chat

### 4.1 Flujo en `procesar_mensaje_chat()`

```python
def procesar_mensaje_chat(peticion: str) -> str:
    mensaje = peticion.strip()
    if not mensaje:
        return ""

    # 1-4. Cargar contexto, inyectar restaurante/catalogo/ideas
    system_prompt = ...
    
    # 5. Llamada al LLM
    respuesta_base = call_minimax(system_prompt, user_message)
    
    # 6. [v4.1] Memoria automática
    try:
        if is_memoria_activa():
            resultado = analizar_mensaje(mensaje)
            conn = init_db()
            guardadas = guardar_automatico(conn, mensaje, skill_origen="chat")
            conn.close()
            anexo = formatear_anexo_chat(guardadas, resultado)
            if anexo:
                respuesta_base += anexo
    except Exception:
        pass  # si falla la memoria, no afecta la respuesta del chef
    
    return respuesta_base
```

**Garantías:**
- Si la memoria automática falla, la respuesta del chef se devuelve igual (try/except)
- La memoria solo se ejecuta si `is_memoria_activa()` es True
- El anexo va SIEMPRE al final (no antes, no entre líneas)

### 4.2 NO se ejecuta en otras skills

`/ficha`, `/ideas`, `/proceso` NO disparan la memoria automática. Solo el chat libre (`procesar_mensaje_chat`).

Rationale: esas skills generan output estructurado; aplicar la heurística ahí añadiría más ruido que valor.

---

## 5. Tests requeridos

### 5.1 `test_memoria_triggers.py` (64 tests) ✅

Cubre:
- Filtrado de cortesía (16 mensajes de cortesía)
- Detección de cada categoría (5 principales × casos)
- Resolución multi-categoría (prioridad)
- 3 niveles de confianza (alta/media/baja)
- Extracción del extracto (mensaje corto vs largo)
- Word boundary (no falsos substrings)
- Normalización (con/sin acentos, ñ preservada)
- Tipos de retorno

### 5.2 `test_memoria_config.py` (18 tests) ✅

Cubre:
- Defaults (load_config crea archivo)
- Toggle activa/inactiva (persistencia)
- Modo alta/sugerir (validación)
- Umbral de confianza
- Reset a defaults
- Idempotencia

### 5.3 `test_memoria_auto.py` (25 tests) ✅

Cubre:
- Trigger + guardado automático end-to-end
- Toggle off → no se guarda nada
- Modo sugerir → no se guarda, solo sugiere
- Deduplicación auto ↔ manual
- Deduplicación entre autos
- Comandos `/memoria`, `/memoria-status`, `/lista-auto`, `/olvidar auto`
- Anexo del chat (formateo)

### 5.4 Tests existentes (sin cambios)

Todos los tests preexistentes (`test_memoria_storage.py`, `test_memoria_commands.py`, etc.) siguen pasando sin modificaciones — la v4.1 es ADITIVA.

---

## 6. Compatibilidad y migraciones

### 6.1 Compatibilidad con v1

- ✅ Ideas guardadas con categorías v1 (`plato`, `menu_completo`) siguen siendo legibles
- ⚠️ Categorías legacy no se clasifican automáticamente — se mantienen como están hasta que David las edite
- Plan futuro: migración automática al primer `/lista-ideas` que detecte categorías legacy

### 6.2 Compatibilidad con el schema SQLite

- ✅ Sin cambios de schema (la columna `origen` ya aceptaba cualquier TEXT)
- ✅ `origen='auto-chat'` se añade como nuevo valor posible
- ⚠️ Queries que asumen `origen='comando'` necesitan revisar

### 6.3 Compatibilidad HF Space vs CLI

- ✅ Mismo comportamiento en ambos entornos
- ✅ El path default del archivo de config es relativo al CWD (que es el repo root en ambos casos)

---

## 7. Métricas y observabilidad

### 7.1 Métricas automáticas

- Número total de ideas (auto vs manual): `/memoria-status`
- Última idea auto-guardada: `created_at DESC WHERE origen='auto-chat'`

### 7.2 Logging (futuro)

En v4.2 añadir:
- Log de cada detección: `{mensaje_relevante: bool, confianza: str, categoria: str, tiempo_ms: float}`
- Log de cada guardado: `{id: int, origen: str, categoria: str, duracion_total_ms: float}`

---

## 8. Pendiente para v4.2 (ver proposal §7)

1. **Multi-idea por mensaje** (varias categorías detectadas → guardar todas)
2. **Editar categoría de una idea** (`/editar-categoria N <cat>`)
3. **UI en Gradio** para los toggles
4. **Categorización con LLM** para casos ambiguos
5. **Memoria automática también en `/ficha` y `/ideas`**
6. **Sincronización entre agentes** (DB compartida)
7. **Búsqueda semántica** (embeddings o FTS5)
8. **Historial de cambios** de una idea