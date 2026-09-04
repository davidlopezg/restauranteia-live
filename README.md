---
title: Chef Creativo — RestaurantEAI
emoji: 🍂
colorFrom: red
colorTo: yellow
sdk: gradio
sdk_version: 6.19.0
python_version: '3.11'
app_file: app.py
pinned: false
license: mit
short_description: "Chef IA: fichas y proceso creativo"
---

# 🍂 Chef Creativo — RestaurantEAI

> Estado: **MVP-3** — Chef Creativo con **4 skills** (ficha + proceso creativo + ideas creativas + chat), conocimiento del restaurante y carta inyectados automáticamente. Deployado en Hugging Face Spaces. End-to-end con la API oficial de MiniMax.

**¿Qué es?** Ecosistema de agentes IA para restauración. El **Chef Creativo** ofrece cuatro modos, todos con conocimiento automático de tu restaurante (ticket, línea culinaria, carta) y catálogo de platos:

1. 🍂 **Ficha técnica** — Una petición → ficha estructurada (nombre, historia, ficha técnica, maridaje, prompt de imagen).
2. � **Proceso creativo** — State machine de 7 fases que muestra **cómo piensa el chef** paso a paso, con persistencia entre sesiones y comandos para iterar.
3. � **Ideas creativas** — 10 ideas variadas para explorar (renovar carta, ideas de temporada, llenar huecos), con refinamiento vía métodos creativos de ElBulli.
4. 💬 **Chat con el chef** — Conversación libre por defecto (en CLI y UI), siempre con el contexto del restaurante cargado.

**¿Cómo se usa?** Abrí el chat y escribí tu petición. El chef responde con el contexto de tu restaurante siempre presente:

- 🍂 **Ficha técnica**: `/ficha Entrante vegetariano con calabaza y queso de cabra`
- 🧠 **Proceso creativo**: `/proceso Risotto de setas con trufa` y avanzás fase por fase
- 💡 **Ideas creativas**: `/ideas Ideas para otoño` y recibís 10 ideas iterables
- 💬 **Chat libre**: cualquier mensaje sin prefijo (preguntas, asesoría, conversación)
- `/ayuda` para ver todos los comandos disponibles

> 💡 Desde cualquier modo podés guardar ideas con `/guardar [texto]` y consultarlas con `/lista-ideas` (módulo de memoria con SQLite local + RGPD desde el día uno).

*(Abajo: documentación técnica completa, diagrama de flujo, cómo correrlo local, estructura, decisiones de diseño.)*

---

## 📑 Tabla de contenidos

1. [Estado del proyecto](#estado-del-proyecto)
2. [Diagrama de flujo](#diagrama-de-flujo)
3. [Quick start (local)](#quick-start-local)
4. [Sistema de skills](#sistema-de-skills)
5. [Proceso creativo (state machine)](#proceso-creativo-state-machine)
6. [Ideas creativas](#ideas-creativas)
7. [Archivo de Ideas (módulo de memoria)](#archivo-de-ideas-módulo-de-memoria)
8. [Fase init — carga de conocimiento del restaurante](#fase-init--carga-de-conocimiento-del-restaurante)
9. [Arquitectura técnica](#arquitectura-técnica)
10. [Despliegue (HF Space)](#despliegue-hf-space)
11. [Repos y remotes — Template vs. Instancia viva](#repos-y-remotes--template-vs-instancia-viva)
12. [Roadmap](#roadmap)

> 📖 **¿Buscás un comando específico?** Mirá [`docs/COMMANDS.md`](docs/COMMANDS.md) — índice completo de entry points, comandos in-session, scripts, y paths importantes.

---

## Estado del proyecto

| Hito | Estado | Notas |
|---|---|---|
| MVP-0: Agente Chef Creativo (CLI local) | ✅ | Validado end-to-end |
| MVP-0.5: Deploy en Hugging Face Space | ✅ | https://huggingface.co/spaces/davidlopezgamero/RestaurantEAI |
| MVP-1: Landing page | ✅ | `docs/index.html` |
| MVP-1.1: Sistema de skills | ✅ | 4 skills: ficha, proceso_creativo, ideas_creativas, chat (default) |
| MVP-2: Proceso creativo con state machine | ✅ | 7 fases + persistencia + comandos |
| MVP-3: Ideas creativas | ✅ | 10 ideas + iteración con métodos ElBulli + ficha |
| Conocimiento automático del restaurante | ✅ | restaurante.json + catalogo_platos.json inyectados al chef |
| Opciones del init externalizadas | ✅ | `agents/init_options.json` + "otra (escribir)" en CLI |
| Init con carta completa | ✅ | LLM extrae el catálogo desde texto libre |
| Fix estructural de idioma | ✅ | Detección + reintento automático si chef responde en inglés |
| Fix de surrogate UTF-8 | ✅ | Encoding correcto de emoji en payload |
| **Fase 4: Archivo de Ideas (módulo de memoria)** | ✅ | SQLite local + 11 comandos transversales + consent explícito |
| Patrón template → live instance | ✅ | Repo público + repo privado sincronizable |
| **Fase 4.1: Memoria automática del chat** | ✅ | Detección heurística en 5 categorías (producto/elaboración/técnica/herramienta/receta) + 4 comandos nuevos |
| Resto de agentes (Producción, Marketing, etc.) | ⏳ | Backlog |
| Resto de agentes (Producción, Marketing, etc.) | ⏳ | Backlog |
| SaaS + monetización | ⏳ | Cuando haya tracción real |

---

## Diagrama de flujo

El diagrama de flujo completo del sistema (init phase, 4 skills, persistencia, detección de idioma, destinos) está en [`docs/FLOW.md`](docs/FLOW.md). Es un diagrama Mermaid — abrílo en [mermaid.live](https://mermaid.live/) o cualquier visor Mermaid para verlo renderizado.

**Resumen del flujo en una línea**: Init phase (carga restaurante + carta) → Knowledge inyectado automáticamente en cada skill → 4 skills disponibles (ficha / proceso creativo / ideas creativas / chat) con dispatch por comandos (`/ficha`, `/proceso`, `/ideas`, mensaje libre) → Detección de idioma con reintentos → Deploy a HF Space + backup en GitHub.


## Quick start (local)

### 1. Requisitos

- Python 3.11 (recomendado — HF Space usa 3.11)
- Una API key de **MiniMax**
- 5 minutos

### 2. Instalación

```bash
git clone https://github.com/davidlopezg/restauranteai.git
cd restauranteai

python -m venv .venv
source .venv/bin/activate   # En Windows: .venv\Scripts\activate

pip install -r requirements.txt
```

### 3. Configurar credenciales

```bash
cp .env.example .env
nano .env
```

Variables:
- `MINIMAX_API_KEY` → tu clave privada de MiniMax
- `MINIMAX_BASE_URL` → `https://api.minimax.io/v1` (default)
- `MINIMAX_MODEL` → `MiniMax-M3` (default)

### 4. Inicializar el agente (solo la primera vez)

```bash
python -m agents.init_phase
```

Te hace 15 preguntas sobre el restaurante + te permite pegar tu carta/menú completo (recomendado) o meter los platos uno a uno. Genera `.agent_knowledge/restaurante.json` y `.agent_knowledge/catalogo_platos.json`.

### 5. Probar el agente desde la terminal

> 💡 **El modo por defecto es `chat`**. Abrís el chat y, dentro del mismo chat, dispatchás a las otras skills con `/ficha`, `/proceso` o `/ideas`. No hay selector de skill al inicio (esa decisión se removió: el chat es el punto de entrada único).

**Modo interactivo (REPL)** — chat por defecto + dispatch por comandos:

```bash
cd ~/repos/restauranteia
python -m agents.creativo.agent
```

Vas a ver algo así:

```
============================================================
🍂 Chef Creativo — Modo Interactivo
============================================================

✓ Skill activa: Chat con el chef
  Escribí lo que quieras — el chef responde usando el contexto del restaurante.
  Cuando quieras una skill específica, tipeá /skill (o /skills para listar).

➤ _
```

**Ficha rápida one-shot** (genera y sale):

```bash
python -m agents.creativo.agent "Risotto de setas con trufa"
```

**Proceso creativo directo** (arranca el state machine):

```bash
python -m agents.creativo.agent pc "Risotto de setas con trufa"
python -m agents.creativo.agent pc --reanudar SESION_ID
```

**Ideas creativas directo** (loop de exploración):

```bash
python -m agents.creativo.agent ideas "Ideas para otoño"
```

**Atajo con alias (opcional)** — si querés un comando corto, en Termux:

```bash
echo "alias chef='cd ~/repos/restauranteia && python -m agents.creativo.agent'" >> ~/.bashrc
source ~/.bashrc
chef
```

#### 💬 Comandos in-session (dentro del REPL)

Disponibles en cualquier skill (CLI y UI), con `chat` como default:

| Comando | Qué hace |
|---|---|
| `/skills` | Lista las 4 skills con descripción |
| `/skill` | Cambia de skill (te muestra un menú numerado) |
| `/ficha <texto>` | Cambia a ficha técnica y la genera con ese texto |
| `/proceso [texto]` | Arranca (o continúa) el Proceso Creativo de 7 fases |
| `/ideas <texto>` | Cambia a ideas creativas y genera 10 ideas |
| `/ideas-cien <texto>` | Cambia a idea científica (4 capas con datos moleculares) |
| `/estado` | Ver progreso del Proceso Creativo (si hay sesión activa) |
| `/fase N` o `/fase nombre` | Saltar a una fase específica del Proceso Creativo |
| `/volver` | Regenerar la fase actual |
| `/ficha` | (en Proceso Creativo) generar ficha final |
| `/reiniciar` | (en Proceso Creativo) volver al inicio con la misma petición |
| `/sesiones` | Listar sesiones guardadas del Proceso Creativo |
| `/reanudar <id>` | Retomar una sesión anterior |
| `/guardar [texto]` | Guardá una idea nueva (Archivo de Ideas) |
| `/guardar` (sin args) | Guardá el último mensaje del chef como idea |
| `/guardar N` | Guardá la idea N de una lista numerada |
| `/editar N <texto>` | Editá idea N |
| `/lista-ideas [filtro]` | Listá ideas guardadas (filtro opcional por texto) |
| `/olvidar N` / `/olvidar todo` | Borrar idea N o todo (con confirmación) |
| `/export-ideas` | Exportá todas las ideas a JSON |
| `/silenciar-contador` | Mostrar/ocultar el contador `📁 N guardadas` |
| `/ayuda` | Listar todos los comandos disponibles |
| `salir` / `exit` / `quit` / `Ctrl+C` | Terminar el REPL |

> Cualquier mensaje **sin prefijo** se trata como chat libre con el chef (siempre con el contexto del restaurante inyectado).

---

## Sistema de skills

El Chef Creativo tiene un **sistema de skills extensible**. Cada skill tiene su propio system prompt + comportamiento.

### Skills disponibles

| Key | Nombre | Cuándo usarla | Comandos especiales |
|---|---|---|---|
| `chat` | Chat con el chef (default) | Conversación libre: preguntas, asesoría, consulta sobre producto/técnica/carta | `/skill`, `/ficha`, `/proceso`, `/ideas`, `/ideas-cien` (dispatch) |
| `ficha` | Ficha técnica | Ya sabés qué ficha querés | (ninguno, one-shot) |
| `idea_cientifica` | Idea científica | Combinaciones disruptivas con datos moleculares (PubChem + mapping curado) estructuradas en 4 capas: Base/Contraste/Textura/Viabilidad | `/ideas-cien <texto>` |
| `proceso_creativo` | Proceso creativo | Querés ver el razonamiento paso a paso con persistencia | `/estado`, `/fase N`, `/volver`, `/ficha`, `/reiniciar`, `/sesiones`, `/reanudar` |
| `ideas_creativas` | Ideas creativas | Querés **explorar** 10 ideas antes de comprometerte | `más ideas`, `aplicá [método] a la idea N`, `ficha de la idea N`, `ver métodos` |

### Cómo elegir skill

**En la UI web (Gradio)**: el chat es único — no hay Radio ni selector. Las skills se invocan con comandos al inicio del mensaje (`/ficha`, `/proceso`, `/ideas`). Mensaje sin prefijo = chat libre.

**En CLI**: el `modo_interactivo` arranca directamente en `chat` (no pregunta skill). Dentro del chat dispatchás a las otras con `/ficha`, `/proceso`, `/ideas` o usás el cambio legacy `/skill` + menú numerado.

**Entry points directos** (sin pasar por el chat): `python -m agents.creativo.agent "..."` (ficha), `pc "..."`, `ideas "..."`.

### Cómo agregar una skill nueva

1. Crear `agents/creativo/prompts/system_<nombre>.md` con el system prompt.
2. Agregar el dict en la lista `SKILLS` de `agents/creativo/skills.py`:

```python
{
    "key": "mi_skill",
    "nombre": "Mi skill",
    "descripcion": "Qué hace esta skill",
    "prompt_path": PROMPTS_DIR / "system_mi_skill.md",
    "ejemplos": ["ejemplo 1", "ejemplo 2"],
}
```

3. (Opcional) Si la skill necesita comportamiento custom, agregar handler en `agent.py` + integrarla en `app.py`.
4. Commit + push.

---

## Proceso creativo (state machine)

La skill `proceso_creativo` es un **proceso iterativo de 7 fases** con persistencia en disco.

### Las 7 fases

| # | Fase | Qué trabaja el chef |
|---|---|---|
| 1 | Alma del plato | Qué evoca, qué recuerdo, qué estación, qué producto |
| 2 | Métodos creativos | 2-3 métodos específicos de ElBulli + propios, y por qué aplican |
| 3 | Equilibrio | Análisis dulce/salado/ácido/amargo/umami/graso |
| 4 | Técnica | Qué procesos potencian el producto sin enmascararlo |
| 5 | Storytelling | Qué historia va a contar el plato |
| 6 | Descartadas | 2-3 alternativas evaluadas con por qué no |
| 7 | Preguntas | Cosas que preocupan + 1 pregunta concreta si falta info |

Cuando las 7 fases están OK, el chef genera la **ficha final** integrando todo.

### Comandos

| Comando | Qué hace |
|---|---|
| `siguiente` o cualquier mensaje | Trabaja la fase actual y avanza |
| `/estado` | Ver progreso de las 7 fases |
| `/fase N` o `/fase nombre` | Saltar a una fase específica |
| `/volver` | Regenerar la fase actual |
| `/ficha` | Generar ficha final |
| `/ficha forzar` | Generar aunque falten fases |
| `/reiniciar` | Volver al inicio con la misma petición |
| `/salir` | Terminar y guardar sesión |
| `/sesiones` | Listar sesiones guardadas |
| `/reanudar ID` | Retomar sesión |

### Persistencia

- Sesiones en `.agent_knowledge/sessions/<id>.json` (privado, en `.gitignore`)
- Cerrás y abrís después → `/reanudar ID` seguís donde quedaste
- ID formato: `YYYYMMDD-HHMMSS-<8 chars random>`

---

## Ideas creativas

La skill `ideas_creativas` es una **exploración conversacional**: 10 ideas variadas → refinamiento → ficha opcional.

### El flujo

```
➤ Ideas para otoño
[chef genera 10 ideas variadas: platos, conceptos, formatos, extensiones]

➤ aplicá deconstrucción a la idea 3
[chef refina + 3-5 variaciones]

➤ más ideas
[chef genera 10 ideas NUEVAS distintas]

➤ ficha de la idea 5
[chef convierte en ficha técnica completa]

➤ ver métodos
[chef lista los 13 métodos creativos disponibles]
```

### Características

- **Considera siempre**: tipo de restaurante (ticket, sofisticación, productos, técnicas), carta actual (no duplicar, llenar huecos), estación.
- **Diversidad**: mezcla plato, concepto, técnica, formato, extensión, rompedor.
- **Estado en memoria**: las ideas viven mientras la sesión está activa. Para persistencia entre sesiones, usá el **[Archivo de Ideas](#archivo-de-ideas-m%C3%B3dulo-de-memoria)** — el módulo de memoria te permite guardar cualquier idea con `/guardar`.

### Métodos creativos disponibles (de ElBulli + propios)

1. **Lo autóctono** — tradición culinaria local
2. **Influencias externas** — cocinas de otros lugares
3. **Búsqueda técnico-conceptual** — técnicas y conceptos nuevos
4. **Los sentidos** — vista, olfato, tacto, oído, gusto
5. **El sexto sentido** — emociones, ironía, recuerdos
6. **Simbiosis dulce/salado** — intercambio entre mundos
7. **Productos comerciales** — usar formatos de snacks, golosinas
8. **Deconstrucción** — disgregar elementos, modificar textura/temperatura
9. **Minimalismo** — mínimo de elementos, máxima magia
10. **Asociación** — combinar tablas de productos/técnicas
11. **Inspiración** — tomar una referencia (arte, naturaleza) como apoyo
12. **Adaptación** — revisar clásicos bajo nueva filosofía
13. **Sinergia** — todos los métodos interactúan entre sí

---

## Archivo de Ideas (módulo de memoria)

> **v4.1 — Memoria automática del chat**: además del guardado manual (`/guardar`), el chat detecta heurísticamente comentarios relevantes en tus mensajes y los guarda automáticamente. Se clasifica en **5 categorías principales** (producto / elaboración / técnica / herramienta / receta) + auxiliares (proveedor / cliente / evento / restricción / concepto). Todo desactivable con `/memoria off`.

El módulo `agents/memoria/` te da una base de datos SQLite local para guardar ideas, sin que se evaporen al cerrar el chat. Es el **complemento persistente** de la skill `ideas_creativas`: ella genera ideas nuevas cada vez; este módulo las conserva cuando vos querés. Además, en v4.1 detecta y guarda automáticamente las ideas relevantes que mencionás en conversación.

### Quick start

Probá estos comandos en el chat (HF Space o CLI, funcionan en cualquier skill):

```
/guardar probar kumquat en el postre de temporada
✅ Idea #1 guardada: probar kumquat en el postre de temporada
📁 1 guardada

/lista-ideas
#1 | sin categoría | 2026-07-02
> probar kumquat en el postre de temporada

/lista-ideas queso
#3 | sin categoría | 2026-07-02
> ensalada de queso de cabra con membrillo

/olvidar 1
⚠️ Vas a borrar: #1 'probar kumquat en el postre de temporada'.
Escribí /olvidar 1 otra vez para confirmar.

/export-ideas
✅ 5 ideas exportadas a .agent_knowledge/ideas_export_2026-07-02.json
```

### Comandos disponibles

Todos funcionan en **cualquier skill** (ficha, ideas creativas, proceso creativo) y tanto en HF Space como en CLI. Son transversales al dispatcher de skills.

| Comando | Qué hace | Notas |
|---|---|---|
| `/guardar [texto]` | Guarda texto libre como idea nueva | La forma más común |
| `/guardar` (sin args) | Guarda el último mensaje del asistente como idea | Si venís de una lista de ideas de `ideas_creativas`, te guarda la última respuesta entera |
| `/guardar N` | Guarda la idea N de una lista numerada | Funciona tras respuestas con formato "1. ... 2. ... 3. ..." |
| `/guardar igual` | Fuerza guardado tras advertencia de duplicado | Después de que el sistema detecte fuzzy ≥80% |
| `/editar N [texto]` | Edita idea existente | Actualiza `updated_at` automáticamente |
| `/lista-ideas [filtro]` | Lista todas las ideas (desc por fecha) | Filtro opcional busca en el texto |
| `/olvidar N` | Borra idea N (con confirmación) | Dos turnos: primero avisa, después confirmás |
| `/olvidar todo` | Borra todo (con confirmación) | Útil para empezar de cero |
| `/export-ideas` | Exporta todas las ideas a JSON | Portable, fácil de respaldar |
| `/ayuda` | Lista todos los comandos disponibles | Útil para recordar |
| `/silenciar-contador` | Oculta/muestra el "📁 N guardadas" | Opt-in en diseño |

### Detección de duplicados

El sistema detecta duplicados automáticamente antes de guardar:

- **Exacto** (case-insensitive via `COLLATE NOCASE`): si es idéntico, te avisa y sugiere usar `/guardar igual`.
- **Fuzzy** (≥80% similitud via `difflib.SequenceMatcher`): te avisa y ofrece opciones.

```text
⚠️ Ya tenés algo parecido (#3): "ensalada de queso de cabra"
   ¿Usar /guardar igual para guardar igual, o cambiar la redacción?
```

### RGPD desde el día uno

- **Borrado granular** con doble confirmación para evitar pérdidas accidentales.
- **Export portable** a JSON para que vos tengas siempre una copia.
- **Trazabilidad**: cada idea guarda `created_at`, `updated_at`, `origen` (comando), `origen_skill`, `confirmada_por_usuario=1`.
- **Sin telemetría**: el módulo no envía datos a ningún lado. La DB vive en `.agent_knowledge/ideas.db`, en tu máquina.

### Categorías externalizadas

La taxonomía v4.1 incluye 11 categorías (5 principales + 6 auxiliares) en `agents/ideas_categorias.json`. Cada categoría tiene listas de keywords que alimentan la heurística de detección automática:

```json
["producto", "elaboracion", "tecnica", "herramienta", "receta",
 "proveedor", "cliente", "evento", "restriccion", "concepto", "otro"]
```

Las **5 categorías principales** son las que pediste separar:
- **producto** — ingredientes, materia prima (ej: "me gusta el kumquat" → producto)
- **elaboración** — platos, preparaciones (ej: "quiero hacer un risotto de setas")
- **técnica** — métodos de cocina (ej: "sous-vide a 56 grados")
- **herramienta** — aparatos, utensilios (ej: "la thermomix nueva")
- **receta** — recetas completas (ej: "receta de mi gazpacho")

Si necesitás nuevas keywords para una categoría, agregalas al JSON y reiniciá la app.

### Memoria automática del chat (v4.1)

> **Activada por defecto.** El chat detecta comentarios relevantes en tus mensajes y los guarda automáticamente con un anexo discreto: `📌 Guardé 1 idea en tu archivo: #5`.

El sistema es **conservador** para no contaminar la DB con ruido:

- **Alta confianza** (frase explícita + keyword) → guarda auto con `📌`.
- **Media confianza** (en modo `sugerir`) → muestra como sugerencia: `💡 ¿Guardo esto?: [extracto]`.
- **Baja confianza** → no hace nada.

Cada idea auto-guardada se marca con `origen='auto-chat'` y se distingue de las manuales.

**Comandos de gestión** (transversales, funcionan en cualquier skill):

| Comando | Qué hace |
|---|---|
| `/memoria on` | Activar la detección automática |
| `/memoria off` | Desactivarla (volves al guardado manual con `/guardar`) |
| `/memoria alta` | Modo auto-guardar sin pedir permiso (default) |
| `/memoria sugerir` | Modo sugerir: no guarda, solo pregunta antes |
| `/memoria-status` | Ver estado actual + conteo auto vs manual |
| `/lista-auto [filtro]` | Ver solo las ideas auto-guardadas |
| `/olvidar auto` | Borrar solo las auto-guardadas (con confirmación) |

**Ejemplo de flujo:**

```
Vos: me gustaría probar el kumquat en el postre
Chef: [responde con sugerencias culinarias...]
      📌 Guardé 1 idea en tu archivo: #5
      *(esto es automático, `/memoria off` para desactivarlo)*

Vos: /lista-auto
      #5 | producto | 2026-09-04
      > me gustaría probar el kumquat en el postre

Vos: /memoria off
      🧠 Memoria automática **desactivada**. El chat ya no guardará ideas
      automáticamente. Seguí usando `/guardar` manualmente.
```

**RGPD en v4.1**:

- El toggle persiste en disco en `conocimiento/interno_restaurante/memoria_config.json`.
- Las ideas auto se distinguen claramente (origen='auto-chat') y se pueden borrar masivamente con `/olvidar auto`.
- Sin telemetría. Todo es local.

### Cómo se almacenan los datos

- **Path**: `conocimiento/interno_restaurante/ideas.db` (SQLite local).
- **Modo WAL** (`journal_mode=WAL`): lectores y escritor concurrentes sin bloqueos — crítico para HF Space con múltiples usuarios.
- **Esquema** (`ideas` table):
  ```
  id | created_at | updated_at | idea | categoria | contexto
  | confirmada_por_usuario | origen | origen_skill
  ```
- **Índices**: `idx_ideas_created_at`, `idx_ideas_categoria`, `idx_ideas_origen_skill`.
- **Archivo companion**: `conocimiento/interno_restaurante/ideas.md` con schema documentado (se autogenera al primer `init_db`).

### Tests

```bash
python -m pytest tests/test_memoria_storage.py tests/test_memoria_formatters.py \
                  tests/test_memoria_commands.py tests/test_memoria_duplicates.py \
                  tests/test_memoria_counter.py tests/test_memoria_rgpd.py \
                  tests/test_memoria_concurrency.py tests/test_regresion_skills.py \
                  tests/test_memoria_triggers.py tests/test_memoria_config.py \
                  tests/test_memoria_auto.py -v
```

Resultado esperado: **120 tests pasando**. Cubre CRUD, formateo, comandos, duplicados, contador, RGPD, concurrencia WAL y regresión de skills existentes.

### Por qué SQLite y no JSON

- Las ideas tienen **queries**: filtrar por categoría, por fecha, por origen. JSON files son ineficientes acá.
- Posibilidad de **búsqueda full-text** (FTS5) en versiones futuras sin reescribir.
- **Concurrencia gratis** con WAL — crucial para HF Space.
- **Backup trivial**: un solo archivo que podés copiar a cualquier lado.

---

## Fase init — carga de conocimiento del restaurante

La fase init se corre **una sola vez** (o cuando quieras actualizar datos). Recolecta el contexto del restaurante y lo guarda en `.agent_knowledge/`.

### Lo que se recolecta

- **15 preguntas del restaurante** (ticket, sofisticación, productos, técnicas, etc.) — opciones externalizadas en `agents/init_options.json`.
- **Catálogo de platos** (3 modos):
  1. **Pegar carta/menú completo** (recomendado): el LLM extrae JSON estructurado.
  2. **Manual**: uno por uno.
  3. **Saltar**: catálogo vacío.

### Lo que el chef recibe automáticamente

Cada vez que genera una ficha o trabaja una fase, el system prompt se enriquece con:

1. **Contexto del restaurante** (restaurante.json):
   - Nombre, ticket medio (min/max/típico), sofisticación
   - Productos dominantes, técnicas dominantes, tipo de servicio
   - Política de grupos, clases de comedores, origen/inspiración
   - Orientación nutricional, localización, restricciones religiosas
   - Tiempo del comensal, época/estilo

2. **Catálogo de platos** (catalogo_platos.json, max 30 inyectados):
   - Agrupados por categoría
   - Con nombre, descripción, precio

3. **Estacionalidad Cataluña** (cuando la petición menciona un ingrediente)

4. **System prompt de la skill** (system_chef.md, system_proceso_creativo.md, system_ideas_creativas.md)

### Cómo lo usa el chef

- **NO propone** platos que contradigan el ticket o la sofisticación del restaurante
- **NO duplica** platos del catálogo actual
- **SÍ sugiere** complementos y extensiones de la línea
- **SÍ respeta** la época/estilo (pizzería italiana, mediterránea moderna, etc.)
- **SÍ avisa** si la petición contradice el contexto

---

## Arquitectura técnica

### Estructura del proyecto

```
restauranteia/
├── agents/
│   ├── creativo/                       # Agente Chef Creativo
│   │   ├── agent.py                    # Entry point CLI + handlers de las 4 skills (chat es default)
│   │   ├── skills.py                   # Registry de skills (extensible)
│   │   ├── proceso_creativo.py         # State machine de 7 fases + persistencia
│   │   ├── sessions.py                 # CRUD de sesiones en .agent_knowledge/
│   │   ├── prompts/
│   │   │   ├── system_chef.md          # System prompt de la skill 'ficha'
│   │   │   ├── system_proceso_creativo.md
│   │   │   └── system_ideas_creativas.md
│   │   └── knowledge/
│   │       ├── estacionalidad.json     # Calendario de temporada Cataluña
│   │       └── combinaciones_clasicas.csv
│   ├── init_phase.py                   # Fase init: 15 preguntas + carta
│   ├── init_options.json               # Opciones externalizadas (JSON editable)
│   └── knowledge_context.py            # Archivos compartidos entre agentes
├── docs/
│   ├── index.html                      # Landing page
│   ├── metodos-creativos.md            # Referencia métodos creativos ElBulli
│   └── COMMANDS.md                     # Índice de comandos y scripts
├── memory/
│   └── memory.md                       # Decisiones de arquitectura y aprendizaje
├── conversations/                      # Historial de sesiones de chat
├── scripts/
│   ├── test_app.py                     # Tests de regresión de app.py
│   └── probar_estructura.py            # Validación sin API
├── .agent_knowledge/                   # Generado, NO commitear
│   ├── restaurante.json                # Datos del init
│   ├── restaurante.md
│   ├── catalogo_platos.json            # Carta extraída
│   ├── catalogo_platos.md
│   └── sessions/                       # Sesiones del proceso creativo
├── .env.example                        # Plantilla de variables de entorno
├── requirements.txt
├── README.md
└── DEPLOY_HF.md                        # Notas específicas del deploy
```

### Decisiones de diseño

**Skills en lugar de un solo prompt gigante**: cada skill tiene su propio system prompt optimizado para su caso de uso.

**State machine para el proceso creativo**: en lugar de "responder y listo", el chef trabaja **una fase por turno**, con el sistema trackeando qué se completó.

**Persistencia en `.agent_knowledge/`**: knowledge base del restaurante (preferencias, contexto, sesiones) vive fuera del repo.

**Contexto del restaurante + catálogo inyectado automáticamente**: el chef nunca pierde de vista la línea del restaurante ni la carta actual.

**Opciones del init externalizadas**: editar `agents/init_options.json` para extender opciones sin tocar código.

**Init con carta completa**: LLM extrae el catálogo desde texto libre (con robustez: JSON puro, markdown JSON, texto alrededor, normalización de campos).

**Fix estructural de idioma**: `call_minimax` detecta si la respuesta salió en inglés (heurística de palabras gatillo + exclusión de "PROMPT PARA IMAGEN"). Si detecta, **reformula con instrucción reforzada y baja temperatura**, hasta 2 reintentos.

**Fix de surrogate UTF-8**: emoji y caracteres especiales se encodean correctamente con `\U0001F3A8` (no `\ud83c\udfa8` que produce surrogates inválidos).

### Cómo extender

- **Agregar skill**: ver "Cómo agregar una skill nueva" arriba
- **Agregar pregunta al init**: editar `agents/init_options.json`
- **Agregar fase al proceso creativo**: editar `FASES` en `agents/creativo/proceso_creativo.py`
- **Agregar método creativo**: agregar a `METODOS_CREATIVOS` en `agents/creativo/agent.py`
- **Agregar agente nuevo**: crear `agents/<nombre>/agent.py` siguiendo el patrón del chef

---

## Despliegue (HF Space)

El Space vive en: **https://huggingface.co/spaces/davidlopezgamero/RestaurantEAI**

### Frontmatter del README

El frontmatter YAML arriba (entre `---`) lo lee Hugging Face. NO modificar a mano sin saber qué hace cada campo:
- `sdk: gradio`, `sdk_version: 6.19.0` — versión del framework UI
- `python_version: '3.11'` — obligatorio (HF default = 3.13 que rompe Gradio)
- `app_file: app.py` — entry point
- `short_description` — aparece en el catálogo (**siempre entre comillas si contiene `:`**)

### Variables de entorno en HF

Configurar en **Settings → Repository secrets**:
- `MINIMAX_API_KEY` (obligatoria)
- `MINIMAX_BASE_URL` (opcional)
- `MINIMAX_MODEL` (opcional)

### Push al Space

```bash
git push hf main
```

(Si nunca se hizo, agregar remote: `git remote add hf https://huggingface.co/spaces/davidlopezgamero/RestaurantEAI`)

---

## Repos y remotes — Template vs. Instancia viva

Este repo (`restauranteia`, público en GitHub) es el **template**: el código limpio sin datos de usuario. Está pensado para que cualquiera lo clone y lo instale.

Para tu **uso real con datos**, mantenés un repo separado, **privado**, sincronizado desde este template. Es el patrón clásico **template → instancia**.

### Los dos repos

| Repo | Visibilidad | Propósito | Datos del usuario |
|---|---|---|---|
| `davidlopezg/restauranteai` (este) | 🔓 Público | Template: código limpio | ❌ No commitea nada en `.agent_knowledge/` |
| `davidlopezg/restauranteia-live` | 🔒 Privado | Tu instancia viva: código + datos reales | ✅ Commitea `conocimiento/interno_restaurante/ideas.db`, `restaurante.json`, etc. |

### Set up de la instancia viva (una sola vez)

```bash
# 1. Clonar el template
git clone https://github.com/davidlopezg/restauranteai.git restauranteia-live
cd restauranteia-live

# 2. Crear repo privado en GitHub (vía gh CLI)
gh repo create davidlopezg/restauranteia-live --private

# 3. Recablear remotes
git remote rename origin template
git remote add origin https://github.com/davidlopezg/restauranteia-live.git
git push -u origin main

# 4. Activar tracking de datos reales (quitar .agent_knowledge/ del .gitignore)
# 5. Copiar tu .env con la API key real (NO commitear)
cp ../restauranteia/.env .env
```

### Workflow diario

**En el template** (trabajás features nuevas):

```bash
cd restauranteia/
# desarrollar, probar
git add -A
git commit -m "feat: nueva skill foo"
git push origin main && git push hf main    # deploy
```

**En la instancia viva** (tu uso real, con datos):

```bash
cd restauranteia-live/

# Traer mejoras nuevas del template
git pull template main

# Guardar tus cambios locales (ideas, config, etc.)
git add .agent_knowledge/
git commit -m "chore(datos): 3 ideas nuevas guardadas hoy"

# Respaldar tu instancia
git push origin main
```

### Reglas de oro del patrón

1. **El template nunca toca `.agent_knowledge/`**. Su `.gitignore` lo excluye.
2. **La instancia viva sí commitea `.agent_knowledge/`** (excepto `ideas.md` que es autogenerado y ruidoso). Tenés backup automático de tus datos con cada push.
3. **Los cambios estructurales** (features, bug fixes, dependencias) van al template primero; después la instancia los hereda via `git pull`.
4. **Las secrets** (`MINIMAX_API_KEY` en `.env`) **nunca se commitean**, ni en la instancia viva. Copialas manualmente o usá GitHub Secrets.
5. **El deploy a HF Space** se hace siempre desde el template (`git push hf main`), no desde la instancia viva.

### Por qué este patrón

- **Privacidad**: tu DB de ideas, tu config de restaurante, tus prompts iterados — todo queda en un repo privado.
- **Portabilidad**: si cambiás de máquina, clonás la instancia y tenés todo (menos `.env`).
- **Sharing sin miedo**: podés compartir el template con cualquiera sin preocuparte por泄露 datos.
- **Escalabilidad futura**: cuando el template soporte multi-tenant, cada restaurante tendrá su propia instancia privada desde el mismo template.

### Sincronización automática (`scripts/restauranteai-sync`)

El template incluye [`scripts/restauranteai-sync`](scripts/restauranteai-sync) — un script branded, version-aware, listo para sincronizar tu instancia en un solo comando.

```bash
cd restauranteia-live/
./scripts/restauranteai-sync
```

**Qué hace automáticamente:**

1. **Verifica la versión del template** leyendo el archivo `VERSION` (raíz del template) y comparándola con la versión sincronizada en tu instancia (en `.template-version`, gitignored). Si hay una versión más nueva, te avisa con un resumen de los cambios.
2. **Commitea cambios pendientes** en `.agent_knowledge/` (tus ideas, config, etc.) con timestamp.
3. **Pull --rebase desde `template/main`** (trae features nuevas).
4. **Si `origin` está ahead** → pull --rebase desde origin primero (auto-recuperación).
5. **Push a `origin/main`** (backup de tus datos al repo privado).
6. **Actualiza `.template-version`** con la versión actual del template.
7. Si algo falla → te dice exactamente qué correr manualmente.

**Alias aún más corto** (configurá una vez):

```bash
git config alias.sync '!./scripts/restauranteai-sync'

# Después en cualquier momento:
git sync
```

**Ejemplo de salida con versión nueva disponible:**

```text
==> 🍴 restauranteai-sync

── Verificando versión del template ──
Tu instancia tiene sincronizada: v1.2.0
Versión actual del template:    v1.3.0

🆕 HAY UNA VERSIÓN NUEVA DISPONIBLE: v1.2.0 → v1.3.0
Cambios desde v1.2.0:
    abc1234 feat(chat): nueva skill 'chat'
    def5678 docs(readme): documentar módulo de memoria

[1/4] Working tree limpio...
[2/4] Pull --rebase desde template/main...
      ✅ Sin conflictos.
[3/4] Push a origin/main (tu repo privado)...
      ✅ Push exitoso.
[4/4] Actualizando .template-version...
      v1.2.0 → v1.3.0

==> ✅ Sincronización completa.
```

### Versionado del template

| Concepto | Detalle |
|---|---|
| **Archivo VERSION** | En la raíz del template (formato `vX.Y.Z`, semver) |
| **Tags de git** | Cada release tiene un tag (`v1.3.0`, etc.) |
| **`.template-version`** | En la instancia viva (gitignored) — tracking local de qué versión tenés sincronizada |
| **Detección** | El script compara y avisa si hay una versión más nueva |
| **Cómo bumpear** | Cuando mergeás features nuevas, bumpeás `VERSION` y creás un tag nuevo: `git tag v1.4.0` |

### Cuando algo falla

| Síntoma | Causa | Solución |
|---|---|---|
| `🆕 HAY UNA VERSIÓN NUEVA DISPONIBLE` | El template tiene cambios nuevos que no tenés | Normal, dejá correr el sync |
| `⚠️  Hubo conflictos. Resolvelos manualmente` | Cambios en template y en instancia que se pisan | `git rebase --continue` después de resolver → `./scripts/restauranteai-sync` |
| `⚠️  Push falló` después del rebase | Origin Ahead por pushear antes de tiempo | El script intenta auto-recuperar; si no, corré `git pull --rebase origin main && git push origin main` |
| Working tree limpio pero el sync no hace nada | No hay nada nuevo en template ni local | Normal, todo al día |

### Backup de datos sin esfuerzo

Cada vez que corrés `restauranteai-sync`, **si hay cambios en `.agent_knowledge/`**, se commitean automáticamente con un mensaje con timestamp. Tu instancia queda respaldada en GitHub con cada sync. Es backup automático sin pensarlo.

Para hacer backup manual en cualquier momento (sin esperar cambios del template):

```bash
cd restauranteia-live/
git add .agent_knowledge/
git commit -m "chore(datos): respaldo manual $(date +%Y-%m-%d)"
git push origin main
```

---

### Alias para pushear el template a ambos remotes (HF + GitHub)

```bash
git config alias.pushall '!git push hf main && git push origin main'
```

Después: `git pushall` sincroniza los dos remotes en un comando.

⚠️ **Si divergen** (caso típico: pusheaste desde otra máquina), el push falla. Solución:

```bash
git pull --rebase origin main
git pushall
```

Para forzar sincronización de HF con local (irreversible):

```bash
git push --force-with-lease=main:<hash-actual-de-hf> hf main
```

---

## Tests

```bash
# Tests del módulo de memoria (120 tests)
python -m pytest tests/test_memoria_storage.py tests/test_memoria_formatters.py \
                  tests/test_memoria_commands.py tests/test_memoria_duplicates.py \
                  tests/test_memoria_counter.py tests/test_memoria_rgpd.py \
                  tests/test_memoria_concurrency.py tests/test_regresion_skills.py -v

# Tests de regresión de app.py
python scripts/test_app.py

# Validación de estructura sin API
python scripts/probar_estructura.py
```

---

## Licencia

MIT. Ver `LICENSE` cuando se agregue formalmente.

## Contribuir

Por definir. El proyecto está en fase temprana.

---

## Links

- 🌐 **App en vivo**: https://huggingface.co/spaces/davidlopezgamero/RestaurantEAI
- 💻 **Código fuente (template)**: https://github.com/davidlopezg/restauranteai
- 🔒 **Instancia viva (privada)**: https://github.com/davidlopezg/restauranteia-live
- 🏠 **Landing page**: `docs/index.html`

---

**Para preguntas, issues o ideas**: abrir un issue en GitHub.