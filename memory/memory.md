# 🧠 Memory — restauranteia

> Memoria de aprendizaje del agente para el proyecto `restauranteia` (ecosistema de agentes IA para restauración).

## Decisiones de arquitectura cerradas

### 2026-06-30 — Proveedor de LLM confirmado: MiniMax API (no OpenAI, no Ollama)

**Contexto:** David venía con un master plan que asumía OpenAI API como proveedor. Al implementar, aclaró que NO tiene OpenAI API ni Ollama local. Tiene acceso a la **API de MiniMax** (la empresa que me crea a mí como modelo).

**Implicaciones:**
- Script se enchufa contra `https://[ENDPOINT_MINIMAX]/v1/chat/completions` o equivalente.
- Formato de autenticación **pendiente de confirmar con David** (probablemente Bearer token estilo OpenAI, pero NO asumir).
- Unit economics del SaaS posterior dependerán del coste por request de MiniMax (a confirmar cuando tenga acceso a su panel de pricing).
- Si MiniMax no tiene SDK oficial, uso `httpx` directo contra endpoint REST.

**Pendiente (original):**
- [x] David confirma endpoint exacto base URL → verificado, ver bloque de abajo
- [x] David confirma header de auth → verificado, ver bloque de abajo
- [x] David confirma nombre del modelo → verificado, ver bloque de abajo
- [x] Verificar si MiniMax API es OpenAI-compatible → confirmado por doc oficial

### 2026-06-30 — Decisión sobre la API key: fija, no rotable

**Contexto:** David intentó seguir el flujo de "rotar la key tras exposición por chat", pero la API key que tiene es **fija/no rotable** (probablemente plan de suscripción fijo, no pay-as-you-go). Esto cambia la política de seguridad.

**Implicaciones:**
- La key sigue comprometida en el log de la sesión de chat (no editable por nosotros desde acá).
- No podemos aplicar la mitigación estándar de "rotar y listo".
- Hay que compensar con controles en otra capa.

**Medidas compensatorias acordadas:**
1. **Monitoreo de uso** desde el panel de MiniMax (David debe revisar periódicamente si hay requests que él no hizo).
2. **Restricción de scopes** (si MiniMax lo permite): la key idealmente solo debería tener scope `chat/completions`. Si la key tiene más permisos de los necesarios, ver si se puede degradar.
3. **Frontera explícita en código**: el código del agente **nunca debe loggear el valor de la key**, ni siquiera truncado. Ya está así (solo verificamos que esté presente).
4. **Documentar el incidente** en el README para que cualquier colaborador futuro sepa que esa key específica no debe pegarse en issues, chats, ni screenshots.

**Política aplicada en código:**
- `agent.py`: nunca loggea el valor de la key. Errores exponen si la key está presente o no, pero no su contenido.
- `.env.example`: solo placeholders literales, nunca key real.
- `conversations/*.md`: redactado si alguna vez contiene key (verificado: la de esta sesión NO la contiene).
- `memory.md`: este registro menciona la key como "fija, no rotable" pero no reproduce su valor.

**Estado del proyecto (actualizado):**
- Repo inicializado: ✅
- Estructura de carpetas: ✅
- MVP-0 código: ✅ (cableado, sin TODOs críticos)
- MVP-0 validado end-to-end por David: ✅ (URL corregida de api.minimax.chat → api.minimax.io)
- API key operativa: ✅ (con salvaguarda "fija/no rotable")
- Iteración de system prompt: ⏳ (próximo paso)
- MVP-0.5 código (app.py + Gradio): ✅ (cableado, pendiente deploy a HF)
- MVP-0.5 código pusheado a HF Space: ✅ (2026-07-01, conflicto resuelto vía `git pull --rebase hf main` + `git checkout --theirs README.md`)
- MVP-0.5 deploy público verificado: ⏳ (saga de fixes en curso, ver bloque "Deploy saga" abajo)

### 2026-07-01 — Deploy saga: 8 fixes consecutivos para llevar el Space a Running

**Leccion raíz: HF Spaces NO es entorno amigable para Gradio 4.x con deps modernas. Cada pineo destapa otro bug. La salida real es Gradio 5.6+.**

#### Saga cronológica

| # | Commit | Bug | Causa | Solución |
|---|---|---|---|---|
| 1 | `a6d97ab` | `ModuleNotFoundError: audioop` | HF default = Python 3.13, que quitó `audioop` de stdlib | `python_version: '3.11'` en frontmatter |
| 2 | `dd866d9` | `ImportError: HfFolder` | `huggingface_hub>=1.0` lo eliminó | `huggingface_hub>=0.19.3,<1.0` en requirements.txt |
| 3 | `77ab782` | `UnboundLocalError: msg` | bug propio de `app.py`: botones referenciaban `msg` antes de definirlo | reordenar layout (msg antes de los loops de ejemplos) |
| 4 | `f2a8bb9` | `TypeError: bool is not iterable` en `json_schema_to_python_type` | bug de `gradio_client 1.3.0` con `pydantic>=2.11` | `pydantic==2.10.6` |
| 5 | `dbf8d68` | `TypeError: unhashable type: 'dict'` en jinja2 cache | bug de `jinja2>=3.1` + Gradio 4.44 + starlette combinado | `jinja2<3.1.0` (no funcionó probablemente por cache de HF / dependencia transitiva) |
| 6 | `b823fca` | (mismo error arriba) | HF seguía con stack moderna → Gradio 4.44 incompatible | **migración a Gradio 5.6** + reescritura de `app.py` usando `gr.ChatInterface` (~70 líneas menos) |
| 7 | `df7c504` | `ImportError: HfFolder` (de nuevo, ahora en Gradio 5.6 OAuth) | Gradio 5.6 oauth.py todavía importa HfFolder | `python_version: '3.11'` + `huggingface_hub<1.0` (defense in depth) |

#### Lecciones técnicas aprendidas (CRÍTICAS para futuro)

**1. En HF Spaces, pinear TODO desde el primer push. Combinación mínima recomendada:**
```python
# requirements.txt
gradio>=5.6,<6.0
huggingface_hub>=0.19.3,<1.0
pydantic==2.10.6
jinja2<3.1.0
httpx>=0.27.0
python-dotenv>=1.0.0
```
```yaml
# README.md frontmatter
sdk: gradio
sdk_version: 5.6.0
python_version: '3.11'
```

**2. Si vas a usar Gradio 4.44 o cercano, es una batalla perdida con HF moderno. Migrá a Gradio 5.6+ desde el inicio.**

**3. `gr.ChatInterface` (Gradio 5+) es INMENSAMENTE más simple que `gr.Blocks` para chatbots.** Toda la complejidad de wire-up manual desaparece. Vale la pena reescribir desde cero, no portar.

**4. Defensa en profundidad: pin Python + pin deps.** No confies en defaults de HF.

**5. HF cachea deps y a veces ignora pines de requirements.txt.** Si un pin no funciona, hay que reiniciar el Space manualmente (Settings → Restart).

#### Estado al cierre de sesión
- Commits pusheados: 9 (saga completa documentada)
- `memory.md` actualizado
- Pendiente: confirmar que Gradio 5.6 + python 3.11 + HuggingFace hub<1.0 finalmente arranca
- Si NO funciona: considerar Gradio 6.x, Streamlit, o ejecutar MVP-0 local sin HF Space

### 2026-07-01 — Cierre de sesión: ESTADO REAL del Space RestaurantEAI
- **Logs confirman**: la API MiniMax responde HTTP 200 OK (5 llamadas exitosas en el log). El chef SÍ genera fichas end-to-end.
- El "Error: No API found" en la UI NO era del API en sí — era un bug secundario de json_schema_to_python_type (pydantic moderno vs gradio_client viejo de Gradio 5.6) que rompía la actualización visual del chat.
- **Fixes aplicadas en esta sesión**: 9 en total (ver tabla saga arriba).
- **Último fix**: `cache_examples=False` para evitar `FileNotFoundError: '.gradio/cached_examples/11/log.csv'` en HF Spaces (los .csv no persisten entre reinicios).
- **Estado real al cierre**: 
  - ✅ Repo + código + secrets cargados
  - ✅ Space arranca y sirve UI
  - ✅ API MiniMax responde 200 OK con fichas reales
  - ⏳ UI puede mostrar o no mostrar la respuesta (depende de pin pydantic final)
  - Si la UI sigue rota mañana: la fix es exactamente pydantic==2.10.6 (que recién pusheamos en commit `6c8b034`)
- **Decisión**: cerrar sesión acá, sin importar resultado, por salud/familia. David tiene MVP-0 funcionando perfecto en local (CLI) como red de seguridad.

### 2026-07-01 — Lecciones de la sesión de hoy (importantes para futuro)
1. **HF Spaces con Gradio es una trampa de versions**: cada pinneo destapa otro bug. Salida limpia: Gradio 5.6+ desde día 1.
2. **`gr.ChatInterface` (Gradio 5+) >> `gr.Blocks` para chatbots**: ~70 líneas menos, sin wire-up manual, sin custom buttons.
3. **Cache de ejemplos no funciona en HF Spaces**: usar `cache_examples=False`. Los .csv cacheados no persisten bien en el filesystem del container.
4. **`python_version` en el frontmatter del README es obligatorio**, no opcional. HF default = Python 3.13, que rompe Gradio 4.x.
5. **`huggingface_hub<1.0` mientras Gradio mantenga HfFolder en su oauth.py**: chequeable en `grep HfFolder gr.oauth` de la versión instalada.
6. **`pydantic==2.10.6` mientras `gradio_client` mantenga el bug de json_schema_to_python_type**: chequeable buscando el issue en GitHub.
7. **Cuando migrar app.py entre versiones mayores de UI: reescribir desde cero > portear**. Reescribir ~70 líneas con API moderna es más rápido que pelearse con deprecations.

### 2026-07-01 — Deploy real a HF Space (RestaurantEAI)
- **Nombre real del Space**: `RestaurantEAI` (decidido por David en HF web), NO `restauranteia-chef` como decía `DEPLOY_HF.md`. Actualizar el doc.
- **Remote `hf` ya estaba agregado** apuntando al Space correcto (David lo había hecho en un intento previo).
- **Conflicto en push**: el Space tenía un commit inicial autogenerado por HF con `.gitattributes` (estándar LFS) y `README.md` con frontmatter simple (`sdk_version: 6.19.0`, `python_version: '3.13'`, emoji 🦀).
- **Resolución aplicada**: `git pull --rebase hf main` → conflicto en README.md → resuelto con `git checkout --theirs` → `git rebase --continue` aplicó limpiamente los 2 commits locales.
- **Decisión clave**: conservar `.gitattributes` de HF (LFS estándar, necesario), conservar **nuestro** README.md (frontmatter curado con `sdk_version: 4.44.0` alineado con `app.py`).
- **Push final**: `992bcad..6ca675a main -> main` ✅.

### 2026-07-01 — Lección técnica de git (importante para futuro)
- Durante `git rebase`, **`--ours` y `--theirs` están invertidos** respecto a `git merge`:
  - `--ours` = HEAD actual = la base ya aplicada
  - `--theirs` = el commit que se está aplicando encima
- Confusión inicial resuelta. Regla práctica: para conservar nuestra versión durante rebase, usar `--theirs`.

### Próximo paso inmediato
- David debe cargar `MINIMAX_API_KEY` en **Settings → Repository secrets** del Space `RestaurantEAI`.
- Opcional: agregar también `MINIMAX_BASE_URL=https://api.minimax.io/v1` y `MINIMAX_MODEL=MiniMax-M3`.
- Verificar el arranque público (HF hace build automático en 1-5 min).

### 2026-07-01 — Problema crítico del chef: idioma ignorado por MiniMax-M3

**Estado:** Bug abierto al cierre de la sesión. MVP-0.5 deployado en HF Space, pero el chef responde en inglés aunque se le pida en castellano.

**Intentos de fix probados (todos fallaron parcialmente):**
1. Regla dura #6 en "Reglas duras" del system prompt → falla, a veces deriva al inglés.
2. Regla al **principio** como INSTRUCCIÓN #0 con formato de advertencia ⚠️ → falla.
3. Inyección al **final del user_message** con caracteres ASCII-safe → efecto parcial.
4. Limpieza de caracteres cirílicos/hanzi del prompt → colateral, no resolvió idioma.
5. Reinicio del proceso para recargar prompt → necesario pero no suficiente.

**Dato crucial al cierre:** La respuesta sale **"mezclada" los dos idiomas** (algunas secciones castellano, otras en inglés). Esto confirma:
- Las inyecciones **tienen efecto parcial** (el modelo no ignora del todo)
- Pero **no es suficiente** para garantizar consistencia

**Decisión tomada:**
- No probar más prompt engineering: el modelo MiniMax-M3 no respeta instrucciones de idioma consistentemente.
- Plan para próxima sesión: **fix estructural en código**, no en prompt:
  - Detectar idioma del output (heurística: palabras comunes en inglés en el cuerpo, excluyendo el campo "PROMPT PARA IMAGEN")
  - Si la respuesta no está en castellano mayoritariamente → **descartar y reintentar** la llamada a MiniMax (max 2 reintentos)
  - Eso GARANTIZA el output en castellano sin importar lo que el modelo genere

**Estimación de esfuerzo fix estructural:** ~30 min con tests.

**Nota emocional para mí:** Hoy David aguantó 11+ fixes consecutivos más iteración de prompt. No hacer más sprints heroicos. Familia > optimización.

### 2026-06-30 — Inicio de MVP-0.5 (HF Space con Gradio)

**Decisiones tomadas:**
- **Username de HF**: `davidlopezgamero` (decidido por David)
- **Privacidad de la key fija**: opción A+C → Secret en HF Space + Space con link privado ("Anyone with link") para empezar.
- **Framework UI**: Gradio (mantener consistencia con la decisión original; simple de mantener).
- **Backend**: se mantiene `httpx` directo (no se migra a SDK `openai`) para preservar la superficie validada en MVP-0.

**Riesgos identificados:**
- La API key fija queda cargada como Secret en HF (un proveedor más donde queda expuesta). David debe aceptarlo conscientemente. Plan de mitigación: monitoreo de uso desde el panel de MiniMax.
- Mi sandbox tiene restricciones de red que impidieron `pip install gradio` para test local del wrapper. **Esto NO afecta al producto**: la instalación se hará en la máquina de David / HF Space, no en mi sandbox.
- Test local del wrapper Gradio en mi sandbox queda pendiente para una verificación post-deploy. Si algo crashea, se diagnostica con el log de HF.

**Estado del deploy:**
- Código listo: `app.py`, `requirements.txt` con `gradio>=4.44.0`, `README.md` con frontmatter HF.
- Pendiente de David: crear Space en HF, cargar Secret con la API key, subir código (push desde local o usar un repo Git), verificar arranque público.

**Por qué MVP-0.5 antes que Fase 2 (Agente Memoria):**
- Es la culminación natural del MVP-0 (ya validado). Pone el agente en internet en 3 horas, no en varias sesiones de diseño.
- El Agente Memoria necesita decisiones de fondo (RGPD, dónde almacenar datos, qué datos se guardan) que bloquean diseño. Empezar por ahí sin tener datos reales que recolectar tiene poco sentido.
- Una vez MVP-0.5 funcionando, podemos usar el agente público como canal para juntar ideas/reacciones de usuarios reales (socios, David mismo, posibles clientes iniciales) — información útil para diseñar el siguiente agente.

### 2026-06-30 — Verificación oficial de MiniMax API (fuente: platform.minimax.io)

**Fuentes consultadas y verificadas en esta sesión:**
- https://platform.minimax.io/docs/api-reference/api-overview
- https://platform.minimax.io/docs/guides/quickstart-preparation
- https://platform.minimax.io/docs/guides/models-intro
- https://platform.minimax.io/docs/api-reference/text-chat-openai

**Datos confirmados por la doc oficial:**
- Modo elegido: **OpenAI-compatible** (porque el parser del código coincide 1:1 con el formato OpenAI).
- Base URL: **`https://api.minimax.io/v1`**.
- Header de auth: **`Authorization: Bearer <MINIMAX_API_KEY>`**.
- Endpoint: **`POST /chat/completions`**.
- Modelo por defecto: **`MiniMax-M3`** (1M context window, frontier multimodal coding).
- Formato de response validado: `data["choices"][0]["message"]["content"]` (mismo que OpenAI).
- SDKs oficiales disponibles: OpenAI SDK, Anthropic SDK, AI SDK. La doc recomienda Anthropic como primera opción para casos nuevos; nosotros elegimos OpenAI por compatibilidad con el código actual.
- Modo alternativo: también existe modo **Anthropic-compatible** (`/anthropic`). Queda como upgrade futuro cuando aparezca necesidad de tool use nativo o multi-agente.

**Implicaciones técnicas:**
- El código `agent.py` se cableó con los defaults verificados. Ya no quedan TODOs críticos.
- Parser de response existente (`data["choices"][0]["message"]["content"]`) sigue siendo válido — cero cambios.
- Las variables de entorno esperadas son: `MINIMAX_API_KEY`, `MINIMAX_BASE_URL`, `MINIMAX_MODEL`.

**Decisión de seguridad — NO se guarda la API key en el repo:**
- La API key que David pasó por chat se considera **comprometida** (quedó en el log de conversación, que se persiste en `conversations/`).
- Política aplicada: la key **NO** se escribe en `.env.example`, ni en código, ni en memoria. Vive solo en el `.env` local de David.
- Pendiente de David: rotar la key en el panel oficial antes de la primera llamada real.
  URL de rotación: https://platform.minimax.io/user-center/basic-information/interface-key

**Por qué modo OpenAI-compatible y no Anthropic:**
- El código existente ya implementa la forma OpenAI (POST /chat/completions, formato `messages: [{role, content}]`).
- Migrar a Anthropic implica reescribir el cliente HTTP y manejar el formato distinto de messages. No aporta valor para MVP-0 (solo texto in → texto out).
- Si en el futuro aparece necesidad de tool use nativo o prompt caching, se justifica migrar.

**Nuevo estado del proyecto:**
- Repo inicializado: ✅
- Estructura de carpetas: ✅
- MVP-0 código: ✅ (cableado con docs verificadas, sin TODOs críticos)
- Validación de estructura (sin API): ⏳ (próximo paso en esta sesión)
- Primera llamada real: ⏳ (espera: key rotada por David + validación)

## Decisiones de scope cerradas

### 2026-06-30 — MVP-0 = solo Chef Creativo, sin más agentes ni hosting público

**Por qué se recortó el master plan original:**
- David tiene hernia operada, fístula, tesorería ajustada → no puede sostener un sprint heroico.
- Protocolo de verdad (Capa 6) prohíbe inventar las "20 reglas de creatividad culinaria" que el plan original me pedía.
- Multi-agente sin MVP validado = castillo de naipes (anti-patrón visto en fooday).

**Lo que SÍ se hace en MVP-0:**
- Script Python ejecutable localmente que toma petición NL y devuelve ficha estructurada (nombre, historia, ficha técnica, maridaje, prompt de imagen).
- System prompt del chef con personalidad mediterránea/catalana.
- Datos mínimos de conocimiento (estacionalidad Cataluña, combinaciones clásicas).

**Lo que NO se hace todavía:**
- Cost estimator numérico (necesita base de precios que David tiene que aportar).
- HF Space / GitHub Pages / hosting público (espera a que MVP-0 esté validado).
- Otros 5 agentes (cada uno es un proyecto).
- Monetización SaaS (primero producto, después plan de negocio).

## Estado del proyecto

- Repo inicializado: ✅
- Estructura de carpetas: ✅
- MVP-0 código: ✅
- MVP-0 probado por David: ✅
- MVP-0.5 (HF Space público): ✅
- MVP-1 (Landing page): ✅ (`docs/index.html`)
- Fix estructural idioma: ✅ (detección + reintento en `call_minimax`)

### 2026-07-01 — Decisión de arquitectura: opciones del init externalizadas a JSON + fallback "otra (escribir)"

**Contexto:** David notó que las listas `options` de las preguntas del `init_phase.py` eran cerradas (no se podían extender sin tocar código). Para una pizzería mediterránea catalana faltaban opciones críticas como `horno_piedra`, `pizzeria_tradicional_italiana`, `embutidos`, `quesos_curados`, `conservas`, `hierbas_aromaticas`.

**Decisión tomada:**
1. Crear `agents/init_options.json` con las opciones externalizadas. **El JSON es la fuente de verdad** cuando la key está presente. Si no, fallback a las hardcoded en el código (no rompe nada durante la migración gradual).
2. Ofrecer automáticamente la opción **"otra (escribir)"** al final de cada choice/multichoice en el CLI, que pide input libre y se guarda como string custom.
3. NO tocar HF Space: el init interactivo solo corre con TTY (local). En HF se generan archivos vacíos como siempre.

**Implicaciones para futuros agentes:**
- Cualquier agente que asuma "lista cerrada" en estas dimensiones (ej: el chef que hace `if data["sofisticacion"] == "alta"`) **debe** tratar valores custom como caso abierto.
- El patrón "JSON editable + fallback libre" se puede replicar a otras dimensiones (catálogo de ingredientes, maridajes, técnicas específicas) sin modificar este código.
- Tests: 9/9 pasaron (choice normal/custom/vacío, multichoice normal/vacío/con otras/inputs inválidos, dispatch de _ask_question).

**Archivos tocados:**
- `agents/init_options.json` (NUEVO, ~3.8 KB)
- `agents/init_phase.py` (4 edits: loader, _input_choice, _input_multichoice, _ask_question, schema doc)

**Pendiente / próximo opcional:**
- Decidir si extender el patrón a otras dimensiones que puedan crecer (ej: catálogo de ingredientes, productores locales de Cataluña).
- Auditoría rápida: ¿algún consumidor de `restaurante.json` asume lista cerrada? (Búsqueda inicial: `system_chef.md` no lo hace — usa los datos como contexto cualitativo).

### 2026-07-01 — Iteración system prompt: métodos creativos de elBulli

**Integrados los 17 métodos creativos de elBulli en `system_chef.md`:**
- Nueva sección "Tu caja de herramientas creativas" con la metodología completa.
- Métodos: lo autóctono, influencias externas, búsqueda técnico-conceptual, los sentidos, el sexto sentido, simbiosis dulce/salado, productos comerciales, nueva manera de servir, cambios en estructura, asociación, inspiración, adaptación, deconstrucción, minimalismo, búsqueda de nuevos productos, sinergia.
- El chef los usa como lentes creativos internos, sin nombrarlos explícitamente en la ficha.
- Fuente: `docs/metodos-creativos.md` (aportado por David).

### 2026-07-01 — Fix estructural de idioma + Landing Page (MVP-1)

**Fix de idioma implementado en `agents/creativo/agent.py`:**
- Nueva función `_es_principalmente_espanol(texto)` con heurística de palabras gatillo.
  - Recorta la sección "PROMPT PARA IMAGEN" (puede ir en inglés por convención).
  - Cuenta palabras inglesas de alta confianza (function words sin cognados: "the", "and", "with", etc.).
  - Si más del 8% de palabras son inglesas → se considera respuesta en inglés.
- `call_minimax()` ahora acepta `force_spanish=True` por defecto.
  - Si la respuesta no pasa el filtro → modifica el user prompt con instrucción URGENTE, baja temperatura a 0.2, y reintenta (máx 2 reintentos de idioma).
  - Total máximo: 2 HTTP retries + 2 language retries = 4 intentos.
  - Si agota los reintentos, devuelve igual pero loggea warning.
- El fix aplica tanto para `generar_ficha()` (CLI) como para `app.py` (HF Space), porque ambas usan `call_minimax()`.

**Landing Page creada (`docs/index.html`):**
- HTML autocontenido, sin dependencias externas, responsive.
- Secciones: hero con CTA al HF Space, features (6 tarjetas), ejemplos, cómo funciona (3 pasos), stack técnico, footer.
- Diseño limpio, tono mediterráneo, paleta de colores cálida (rojo tejón + crema).
- Se usa `docs/` (soportado nativamente por GitHub Pages, sin workflow).
- Activación: Settings → Pages → Source: Deploy from branch → `main` + `/docs`.

**README.md actualizado** con nuevo roadmap y estructura de carpetas.

## Datos del usuario (David)

- Hostelero real, Sol de Nit (pizzería en Cataluña).
- Conocimiento gastronómico profundo: input crítico para el Chef Creativo.
- Patrón conocido: llega con ideas grandes, tiende a inflar expectativa. El agente debe anclar a tierra y validar paso a paso.
- Limitaciones físicas: hernia discal operada, fístula. No permitir "sprint heroico".
- Familia: María y Abril (prioridad máxima).

### 2026-07-02 — Decisión de producto: la landing debe reflejar fielmente las capacidades del sistema

**Contexto:** David pidió agregar a la landing lo que el chef ya hace en código (fase introductoria de discovery + proceso creativo explícito de 7 fases con métodos ElBulli). El sistema llevaba dos features implementadas pero la landing sólo contaba "modo directo" → gap de comunicación.

**Regla operativa (para futuras features):**
- Cualquier capacidad nueva que el sistema implemente debe quedar **explícita en la landing** en el mismo cambio (o en el commit inmediatamente posterior).
- Si la feature tiene flujo visible para el usuario (ej: nuevo modo, nueva skill, nueva fase) → sección propia en la landing. Si es interna (ej: un nuevo guard de validación) → basta con mencionarla en "Tecnología" o "Cómo funciona".
- Antes de prometer algo en la landing, **verificar que el código lo hace realmente** (grep + lectura del módulo). Nunca adornar capacidades inexistentes.

**Aplicado en `docs/index.html`:**
- Sección "Cómo funciona" ampliada de 3 a 4 pasos (incorporado el paso "El chef pregunta").
- Sección nueva "Proceso creativo" entre "Cómo funciona" y "Tecnología" con: callout del modo explícito, 7 fase-cards con las fases reales del state machine (`proceso_creativo.py`), y 11 métodos creativos de ElBulli en pills.

**Pendiente:**
- Si el Space HF implementa UI para invocar `/proceso_creativo` desde el chat → considerar agregar CTA en la landing que distinga "modo directo" de "modo proceso creativo".
- Subir landing a producción (push a `origin`) — es lo que dispara GitHub Pages.

### 2026-07-02 — SDD iniciado: change `archivo-de-ideas` (Fase 2 destrabada)

**Contexto:** David propuso un feature de producto claro: una DB local tipo SQL donde el agente vaya guardando ideas que el usuario menciona, con **consentimiento humano explícito como invariante** ("el agente no puede guardar nada sin el consentimiento humano"). Lo llamó "archivo de ideas".

**Por qué SDD y no implementación directa:**
- Cruza agente + UX + RGPD + tests + landing → multi-area, alto review burden.
- Decisiones de fondo pendientes (storage, consentimiento, schema) que conviene fijar en spec antes de codear.
- Es la pieza que destraba el roadmap Fase 2 (Agente Memoria) bloqueado desde 2026-06-30.

**Decisiones tomadas (preflight del orquestador):**
- `executionMode`: interactive (David debe poder pausar entre fases)
- `artifactStore`: openspec (Engram no está instalado)
- `chainedPRStrategy`: ask-always
- `reviewBudget`: 400

**Archivos creados en esta sesión:**
- `openspec/config.yaml` — config del proyecto + preflight
- `openspec/changes/archivo-de-ideas/proposal.md` — esqueleto del proposal con decisiones tentativas y preguntas abiertas

**Pendiente:**
- Sesión 1: `sdd-explore` (mapear codebase + validar heurísticas) → `sdd-proposal` (ajustar este proposal para aprobación).
- Sesión 2: `sdd-spec` + `sdd-design`.
- Sesión 3: `sdd-tasks` + `sdd-apply` + `sdd-verify`.
- Sesión 4: `sdd-sync` + `sdd-archive` + actualizar landing.
- NO commitear `.agent_knowledge/ideas.db` (ya está cubierto por el `.gitignore` general de `.agent_knowledge/`).

**Notas operativas:**
- NO pushear a `hf` los cambios de `openspec/` — son docs/dev, no afectan al Space.
- Push solo a `origin` (GitHub).

### 2026-07-02 — Hallazgo de `sdd-explore`: skill `ideas_creativas` ya existía

La skill `ideas_creativas` (en `agents/creativo/skills.py:54-66`, con handler en `app.py:129` y prompt en `prompts/system_ideas_creativas.md`) ya hacía el 70% de lo que el Archivo de Ideas requería — generaba 10 ideas vía LLM, soportaba iteraciones con métodos creativos, convertía a ficha. **Lo que NO hacía: persistir**. Se perdían al cerrar el chat.

**Implicación de diseño:** el Archivo de Ideas es **complemento persistente** de `ideas_creativas`, no skill nueva paralela. Decisión: implementar como **módulo transversal** (`agents/memoria/`) con comandos `/guardar /ideas /olvidar /export-ideas /deshacer /ayuda` disponibles desde CUALQUIER skill, detectado ANTES del dispatcher de skill.

**Refuerzo explícito de David:** el comando `/guardar` debe aceptar ideas que NO vengan de `ideas_creativas`. Casos cubiertos:
- `/guardar [texto libre]` → guarda el texto literal (cualquier skill)
- `/guardar` (sin args) → guarda el último mensaje del agente como idea
- `/guardar N` → guarda la idea N de la última respuesta del agente (caso típico desde `ideas_creativas`)

**Decisiones validadas por David (2026-07-02) tras explore:**
1. D1 storage SQLite OK (WAL + timeout 5.0)
2. D2 schema 8 campos OK (David me da libertad para detalles)
3. D3 trigger mixto OK
4. D4 comandos transversales OK (con refuerzo: libres, no solo desde ideas_creativas)
5. D5 RGPD sin cifrado + olvidar + export OK
6. D6 fuera de scope v1 (retrieval, sync, cifrado, LLM-categorización) OK
7. Categorías en JSON editable — David dice "después tal vez las cambie", el patrón ya está cubierto
8. Nombres de comandos OK
9. Palabras gatillo OK
10. Schema OK

**Decisiones de producto validadas por David (2026-07-02) tras ronda de preguntas:**
1. Q1 Momento propuesta: SOLO comando `/guardar` (sin propuesta automática del agente). Elimina toda la rama de triggers.
2. Q2 Duplicados: detección exacta + fuzzy (≥80% similitud). Implementar en `storage.py`.
3. Q3 Edición post-guardado: sí, editable, con campo `updated_at` en el schema.
4. Q4 Contador visible: sí, "📁 X guardadas" con opt-out `/silenciar-contador`. Suma comando + feedback visual.
5. Q5 Relación con catálogo: NO en v1. Sí en v2 al FINALIZAR el proceso creativo.

**Cambio de diseño importante vs explore original:**
- Sin propuesta automática del agente → invariante de consentimiento trivial (comando = consentimiento).
- Eliminados del scope: `agents/ideas_triggers.json`, `agents/memoria/triggers.py`, lógica de consent en 2 turnos, `test_memoria_triggers.py`.
- Sumados al scope: detección de duplicados, edición post-guardado con `updated_at`, comando `/silenciar-contador`, contador visible.

**Lección operativa (importante para futuras delegaciones SDD):** el agent `sdd-explore` (user-level) NO tiene tools de escritura (`write`/`edit`) — solo `read`, `grep`, `glob`, `webfetch`, `mem_save`. Cuando lo delegué para esta fase, el subagent completó el trabajo pero no pudo persistir el `explore.md`, así que tuve que sintetizarlo yo en el orchestrator. El mismo problema va a existir con `sdd-proposal`, `sdd-spec`, `sdd-design`, `sdd-tasks`. **Workaround aplicado:** delegar con task que pida devolver el contenido completo del artifact como string en la respuesta, y yo lo persisto con `write`.

**Actualización (2026-07-02 tarde):** verifiqué con `{action: "get"}` de cada agent — `sdd-proposal`, `sdd-spec`, `sdd-design`, `sdd-tasks`, `sdd-archive` SÍ tienen `write`/`edit`. Solo `sdd-explore` (y posiblemente `sdd-status`) carecen de escritura. **Workaround ya no es necesario** para todas las fases excepto `sdd-explore` (donde sí tuve que sintetizar yo el explore.md). Para futuras fases, el subagent persiste solo — yo solo delego y reviso.

**Pendiente inmediato:** delegar `sdd-proposal` con el workaround del contenido inline.
### 2026-08-30 — Sistema híbrido para el agente: Flavor Engine + (futuro) Spoonacular + LLM

**Contexto:** Para que el Chef Creativo proponga combinaciones realmente útiles (no alucinaciones), necesita combinar tres capas:
1. **Motor de divergencia química** (qué compuestos comparten los ingredientes).
2. **Ancla de viabilidad** (qué recipes reales existen con esos ingredientes).
3. **Cerebro analítico** (LLM que estructura la propuesta + restricciones operativas).

**Decisión tomada:**
- **Capa 1 (Flavor Engine)**: ✅ Implementado en este commit.
  - Mapping curado de 84 ingredientes mediterráneos con CIDs PubChem (`conocimiento/fuentes_externas/flavor_data/flavor_mapping.json`).
  - Cliente PubChem REST con caché SQLite para ~140 ingredientes adicionales on-demand.
  - Módulo `agents/herramientas/flavor_engine.py` con API pública: `get_profile`, `get_compounds`, `get_compound_overlap`, `suggest_pairings`, `flavor_summary`.
  - **No usamos FlavorDB completo** (50 MB) por restricción de espacio en móvil — estrategia "mobile-first" con mapping curado progresivo.

- **Capa 2 (Spoonacular)**: ⏸ Diferido.
  - Requiere `SPOONACULAR_API_KEY` (David no la tiene aún).
  - Cuando esté: módulo `agents/herramientas/spoonacular.py` + integración en skill `idea_cientifica`.

- **MCP server**: ❌ Descartado por ahora.
  - Agrega complejidad sin beneficio claro (el agente es el único cliente).
  - Si en el futuro se quiere exponer a clientes externos (Claude Desktop, etc.), se puede revivir.

- **n8n / Ollama / DeepSeek local**: ❌ Fuera de scope.
  - Son orquestadores externos; el agente funciona con MiniMax como LLM único.

**Skill integrada:** `idea_cientifica` con system prompt estructurado en 4 capas (Base, Contraste, Textura, Viabilidad operativa). Dispatch:
- CLI: `python -m agents.creativo.agent ideas-cien "..."`
- Chat: `/ideas-cien <texto>` (desde cualquier skill activa)
- Skill dedicada: `/skill idea_cientifica`

**Tests:** 33 nuevos tests (15 flavor_engine + 18 skill_idea_cientifica). Total suite: 194 tests passing.

**Pendiente:**
- Crecer el mapping curado a 200+ ingredientes (David lo puede hacer editando el JSON).
- Integrar Spoonacular cuando haya API key.
- Sumar constraints operativos del restaurante al prompt (equipment, cadencia).

---

## Decisiones de la Fase 4.1 — Memoria automática del chat (2026-09-04)

**Por qué:** David pidió "haz que el agente de chat recuerde todo lo que se le vaya comentario relevante en una memoria". Refinó después: separar por **productos, elaboraciones, técnicas, herramientas/aparatos/utensilios, recetas**.

**Cambio fundamental vs v1 (Archivo de Ideas):**
- v1: solo comando explícito (`/guardar`). "El comando es el consentimiento".
- v4.1: detección heurística automática + guardado. Toggle on/off. **Esto invierte la decisión v1**.

**Por qué se invirtió:**
- La fricción de tener que escribir `/guardar` cada vez era alta.
- David explícitamente pidió la automatización.
- Se mantiene el principio RGPD con: toggle persistente, separación auto/manual, `/olvidar auto`.

**Diseño:**
- 11 categorías: 5 principales (`producto`, `elaboracion`, `tecnica`, `herramienta`, `receta`) + 6 auxiliares (`proveedor`, `cliente`, `evento`, `restriccion`, `concepto`, `otro`).
- Heurística por keywords (en `agents/ideas_categorias.json`) — sin LLM para mantener determinismo y 0 coste extra.
- Tres niveles de confianza (alta/media/baja). Solo ALTA se guarda auto. MEDIA sugiere.
- `origen='auto-chat'` para distinguir auto de manual.
- `agentes/memoria/triggers.py` — heurística.
- `agentes/memoria/config.py` — estado persistente del toggle.

**Decisiones clave:**
- **D5.1**: Trigger solo activo en skill `chat`, no en `/ficha` ni `/ideas` (esas generan output estructurado, no chat libre).
- **D5.2**: Cuando hay empate de keywords, prioridad: `receta > producto > herramienta > tecnica > elaboracion > evento > proveedor > cliente > restriccion > concepto`.
- **D5.3**: Word boundary siempre para single-word keywords (evita "menta" en "fermentación"). JSON incluye plurales explícitos.
- **D5.4**: Detección conservadora — prefiere no detectar a guardar ruido.
