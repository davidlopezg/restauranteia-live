# 📖 Índice de comandos y scripts

> Referencia rápida de todo lo que se puede invocar en el proyecto.

---

## 🚀 Entry points ejecutables

### `python -m agents.creativo.agent` — Chef Creativo

> 💡 El modo por defecto es `chat` (no hay selector al inicio). Dentro del chat, dispatchás a las otras skills con `/ficha`, `/proceso` o `/ideas`.

| Comando | Qué hace |
|---|---|
| `python -m agents.creativo.agent` | Modo interactivo (REPL). Arranca en la skill `chat` (default) y entra al loop. |
| `python -m agents.creativo.agent "petición"` | One-shot: genera UNA ficha técnica con la skill `ficha` y sale. |
| `python -m agents.creativo.agent pc "petición"` | Arranca el proceso creativo con la petición inicial y entra al loop. |
| `python -m agents.creativo.agent pc --reanudar ID` | Reanuda una sesión guardada por su ID. |
| `python -m agents.creativo.agent pc` | Modo proceso creativo sin args: te pide la petición en el primer input. |
| `python -m agents.creativo.agent ideas "petición"` | Loop directo de ideas creativas (genera 10 ideas + iteración). |

### `python -m agents.init_phase` — Inicialización

| Comando | Qué hace |
|---|---|
| `python -m agents.init_phase` | Corre la fase init: 15 preguntas sobre el restaurante si no hay `.agent_knowledge/`. Si ya existe, muestra el estado. |

### `python app.py` — UI Gradio (HF Space / local)

| Comando | Qué hace |
|---|---|
| `python app.py` | Levanta la UI web con el ChatInterface de Gradio en `http://localhost:7860`. Si la knowledge base no está inicializada, la crea vacía. |

---

## 💬 Comandos in-session (modo interactivo CLI)

Disponibles dentro de `python -m agents.creativo.agent` (en cualquier skill; `chat` es default):

### Dispatch entre skills

| Comando | Qué hace |
|---|---|
| `/skill` | Cambiar de skill (te muestra el menú numerado). |
| `/skills` | Listar skills disponibles con descripción. |
| `/ficha <texto>` | Cambiar a ficha técnica y generarla con ese texto. |
| `/proceso [texto]` | Arrancar (o continuar) el Proceso Creativo de 7 fases. |
| `/ideas <texto>` | Cambiar a ideas creativas y generar 10 ideas. |

### Archivo de Ideas (transversal, funciona en cualquier skill)

| Comando | Qué hace |
|---|---|
| `/guardar [texto]` | Guarda una idea nueva. |
| `/guardar` (sin args) | Guarda el último mensaje del chef como idea. |
| `/guardar N` | Guarda la idea N de una lista numerada. |
| `/guardar igual` | Fuerza guardado tras advertencia de duplicado. |
| `/editar N [texto]` | Edita una idea guardada. |
| `/lista-ideas [filtro]` | Lista ideas guardadas (filtro opcional por texto). |
| `/lista-auto [filtro]` | **(v4.1)** Lista solo las ideas auto-guardadas por el chat. |
| `/olvidar N` | Borra idea N (requiere confirmación en 2 turnos). |
| `/olvidar todo` | Borra todas las ideas (requiere confirmación). |
| `/olvidar auto` | **(v4.1)** Borra solo las ideas auto-guardadas (con confirmación). |
| `/export-ideas` | Exporta todas las ideas a JSON. |
| `/silenciar-contador` | Muestra/oculta el contador `📁 N guardadas`. |
| `/memoria on\|off` | **(v4.1)** Activa/desactiva la detección automática. |
| `/memoria alta\|sugerir` | **(v4.1)** Modo auto-guardar o sugerir antes de guardar. |
| `/memoria-status` | **(v4.1)** Ver estado actual de la memoria automática + estadísticas. |

### Meta

| Comando | Qué hace |
|---|---|
| `/ayuda` | Lista todos los comandos disponibles. |
| `salir` / `exit` / `quit` / `Ctrl+C` | Terminar el modo interactivo. |

> Cualquier mensaje **sin prefijo** se trata como chat libre con el chef.

---

## 🧠 Comandos del proceso creativo (CLI o UI)

Disponibles cuando la skill activa es `proceso_creativo`:

| Comando | Qué hace |
|---|---|
| (cualquier texto) | Trabaja la fase actual con el LLM y avanza automáticamente. |
| `/estado` | Ver progreso de las 7 fases con check marks. |
| `/fase N` | Saltar a la fase N (1-7). Ej: `/fase 3`. |
| `/fase nombre` | Saltar a una fase por nombre. Ej: `/fase equilibrio`. |
| `/volver` | Regenerar la fase actual (la marca como pendiente y vuelve a trabajarla). |
| `/ficha` | Generar la ficha final. Auto cuando las 7 fases están completas. |
| `/ficha forzar` | Generar la ficha aunque falten fases (con warning). |
| `/reiniciar` | Volver al inicio con la misma petición, reseteando todas las fases. |
| `/salir` | Terminar la sesión (la guarda automáticamente). |
| `/sesiones` | Listar las últimas 10 sesiones guardadas con su estado. |
| `/reanudar ID` | Retomar una sesión anterior por ID. |
| `/nueva` | **(solo UI)** Olvidar la sesión activa y empezar una nueva con la próxima petición. |
| `/skill` o `/skills` | Cambiar a otra skill (mata la sesión actual, la guarda antes). |

### Las 7 fases

1. **alma** — El alma del plato
2. **metodos** — Métodos creativos que aplico
3. **equilibrio** — El equilibrio (dulce/salado/...)
4. **tecnica** — La técnica
5. **storytelling** — El storytelling
6. **descartadas** — Cosas que consideré y descarté
7. **preguntas** — Cosas que me preocupan / preguntas al usuario

---

## 🎯 Skills disponibles

Cargadas dinámicamente de `agents/creativo/skills.py`. Cada skill tiene su propio system prompt.

| Key | Nombre | Descripción |
|---|---|---|
| `chat` | Chat con el chef (default) | Conversación libre con el chef usando todo el contexto del restaurante. |
| `ficha` | Ficha técnica | Genera la ficha estructurada del plato (nombre, historia, ficha técnica, maridaje, prompt para imagen). |
| `proceso_creativo` | Proceso creativo | Muestra paso a paso cómo piensa el chef, fase por fase, y luego la ficha final. |
| `ideas_creativas` | Ideas creativas | Genera 10 ideas variadas para explorar la carta, con refinamiento vía métodos ElBulli. |

### Cómo elegir skill

**En la UI web (Gradio)**: el chat es único — no hay Radio ni selector. Las skills se invocan con comandos al inicio del mensaje (`/ficha`, `/proceso`, `/ideas`). Mensaje sin prefijo = chat libre.

**En CLI**: el `modo_interactivo` arranca directamente en `chat` (no pregunta skill). Dentro del chat dispatchás a las otras con `/ficha`, `/proceso`, `/ideas` o usás el cambio legacy `/skill` + menú numerado.

**Entry points directos** (sin pasar por el chat): `python -m agents.creativo.agent "..."` (ficha), `pc "..."`, `ideas "..."`.

### Cómo agregar una skill nueva

1. Crear `agents/creativo/prompts/system_<nombre>.md` con el system prompt.
2. Agregar el dict en la lista `SKILLS` de `agents/creativo/skills.py`.
3. Commit + push. La skill aparece automáticamente en la UI y en el CLI.

---

## 🛠️ Scripts en `scripts/`

| Script | Comando | Qué hace |
|---|---|---|
| `test_app.py` | `python scripts/test_app.py` | Tests de regresión de `app.py` (Gradio 6.19+). Verifica sintaxis, kwargs deprecados, firma de `responder()`, estructura del `gr.Blocks`, theme y css en `.launch()`. NO consume API. |
| `probar_estructura.py` | `python scripts/probar_estructura.py` | Valida que las dependencias estén instaladas, los recursos carguen, la config se lea, y el system prompt tenga la estructura esperada. NO consume API. |

---

## 🔀 Git — comandos y alias

| Comando | Qué hace |
|---|---|
| `git status` | Ver estado del working tree. |
| `git log --oneline -10` | Ver últimos 10 commits en una línea. |
| `git remote -v` | Ver remotes configurados. |
| `git fetch origin` / `git fetch hf` | Traer cambios del remoto sin hacer merge. |
| `git pull --rebase origin main` | Traer cambios de GitHub y rebasear local. |
| `git pushall` | **(alias)** Push a `hf` y `origin` en un solo comando. Equivale a `git push hf main && git push origin main`. |

### Configurar el alias `pushall`

Si lo perdés o lo querés recrear:

```bash
git config alias.pushall '!git push hf main && git push origin main'
```

### Resolver divergencias

Si HF o GitHub tienen commits que local no tiene (caso típico: trabajaste desde otra máquina):

```bash
# Traer cambios sin perder historia
git pull --rebase origin main

# Si hf diverge (caso típico de uploads por UI de HF que rompen historia):
git pull --rebase hf main  # o --no-rebase si querés merge commit

# Si querés sobrescribir un remoto con tu local (destructivo):
git push --force-with-lease=<refname>:<expected> hf main
# Ejemplo: git push --force-with-lease=main:abc1234 hf main
```

---

## 🔧 Variables de entorno

Configurables en `.env` (local) o en **Settings → Repository secrets** (HF Space).

| Variable | Default | Descripción |
|---|---|---|
| `MINIMAX_API_KEY` | (sin default) | Tu clave privada de MiniMax. **Obligatoria**. |
| `MINIMAX_BASE_URL` | `https://api.minimax.io/v1` | Endpoint base de la API. |
| `MINIMAX_MODEL` | `MiniMax-M3` | Nombre del modelo. |

---

## 📁 Paths importantes

| Path | Qué hay |
|---|---|
| `agents/creativo/agent.py` | Entry point CLI del Chef. |
| `agents/creativo/skills.py` | Registry de skills. |
| `agents/creativo/proceso_creativo.py` | State machine de 7 fases. |
| `agents/creativo/sessions.py` | CRUD de sesiones. |
| `agents/creativo/prompts/` | System prompts por skill. |
| `agents/init_options.json` | Opciones externalizadas del init (editable sin tocar código). |
| `agents/init_phase.py` | Entry point de la fase init. |
| `app.py` | UI Gradio. |
| `.env.example` | Plantilla de variables de entorno. |
| `docs/metodos-creativos.md` | Referencia de métodos creativos ElBulli. |
| `docs/index.html` | Landing page. |
| `memory/memory.md` | Decisiones de arquitectura y aprendizaje. |
| `conversations/` | Historial de sesiones de chat. |
| `.agent_knowledge/` | Generado, NO commitear. Contiene: |
| `.agent_knowledge/restaurante.json` | Datos del restaurante (de init). |
| `.agent_knowledge/catalogo_platos.json` | Catálogo de platos. |
| `.agent_knowledge/sessions/` | Sesiones del proceso creativo. |

---

## 🆘 Comandos de diagnóstico

| Comando | Qué hace |
|---|---|
| `python -c "from agents.creativo.skills import SKILLS; print(SKILLS)"` | Ver las skills cargadas. |
| `python -c "from agents.creativo.agent import load_skill_prompt; print(load_skill_prompt('ficha')[:200])"` | Ver el inicio del system prompt de una skill. |
| `python -c "from agents.creativo.proceso_creativo import listar_sesiones_activas; print(listar_sesiones_activas())"` | Ver las sesiones guardadas. |
| `python -c "from agents.knowledge_context import resumen_estado; print(resumen_estado())"` | Ver el estado de la knowledge base. |
| `python scripts/test_app.py` | Tests de regresión de la UI. |
| `python scripts/probar_estructura.py` | Validación de estructura sin API. |