# Conocimiento

Esta carpeta agrupa **todo el conocimiento** que utiliza la aplicación, organizado en tres subcarpetas según su origen y ciclo de vida.

```
conocimiento/
├── interno_restaurante/   ← dinámico, generado por la fase init
├── interno_app/           ← versionado, recursos + prompts + APIs del agente
└── fuentes_externas/      ← versionado, documentación externa consultable
```

> La lógica de carga/guarda vive en `agents/knowledge_context.py`. Esta carpeta es solo el **filesystem**; los accesos siempre pasan por ese módulo (no leas/escribas paths directamente desde los agentes).

---

## 📁 `conocimiento/interno_restaurante/` — datos del restaurante

Generado en la **fase init** (CLI o pestaña web). Contiene el conocimiento dinámico y específico de cada restaurante.

| Archivo | Descripción |
|---|---|
| `restaurante.json` | Perfil completo del restaurante (ticket, línea culinaria, productos dominantes, etc.) |
| `restaurante.md` | Versión legible humana del mismo perfil (generado al guardar) |
| `catalogo_platos.json` | Carta actual: lista de platos |
| `catalogo_platos.md` | Versión legible humana de la carta |
| `ideas.db` | Archivo de Ideas (SQLite) — ideas guardadas por el hostelero |
| `ideas.md` | Schema companion de `ideas.db` (documentación del modelo de datos) |
| `sessions/` | Sesiones persistentes del Proceso Creativo (state machine por fases) |
| `ideas_export_*.json` | Exports puntuales del archivo de ideas |
| `backups/` | Backups automáticos al guardar desde la UI web |

**En `.gitignore`**: estos archivos **no se commitean** porque son datos de cada restaurante concreto.

---

## 📁 `conocimiento/interno_app/` — recursos del agente

Versionado en git. Contiene todo lo que la app necesita para funcionar pero que es **propio del agente**, no del restaurante.

```
interno_app/
├── apis/                  ← documentación de las APIs externas que usa el agente
├── recursos/              ← conocimiento estático del agente creativo
│   ├── estacionalidad.json          (calendario de productos de temporada, Cataluña)
│   ├── combinaciones_clasicas.csv   (combinaciones probadas de producto/técnica)
│   ├── demo_restaurante.json        (perfil demo precargado en boot no-TTY)
│   └── demo_catalogo_platos.json    (carta demo precargada en boot no-TTY)
├── prompts/               ← system prompts de las skills / modos del agente
│   ├── system_chat.md               (skill: chat libre con el chef)
│   ├── system_chef.md               (skill: ficha técnica)
│   ├── system_ideas_creativas.md    (skill: generación de 10 ideas)
│   └── system_proceso_creativo.md   (skill: proceso creativo de 7 fases)
└── procesos/              ← flujos estructurados (futuro: Proceso Creativo en .md)
```

**`apis/`** documenta las APIs externas que invoca el agente (modelo, endpoint, parámetros, costes, rate limits). Para detalles, ver `apis/README.md`.

---

## 📁 `conocimiento/fuentes_externas/` — documentación externa

Versionado en git. Contiene material de referencia externo que el agente puede consultar (métodos creativos, manuales, papers, libros).

```
fuentes_externas/
└── metodos-creativos.md   ← Métodos creativos de elBulli (referencia para el chef)
```

Cuando agregues nuevo material externo, va aquí. La idea es que **el conocimiento externo viva fuera del código** y pueda ampliarse sin tocar la lógica del agente.

---

## 🔄 Cómo añadir conocimiento nuevo

| Quiero añadir… | Va en… | Se commitea? |
|---|---|---|
| Un nuevo producto de temporada | `interno_app/recursos/estacionalidad.json` (edición manual) | ✅ Sí |
| Una nueva skill del agente | `interno_app/prompts/system_<nombre>.md` + registro en `agents/creativo/skills.py` | ✅ Sí |
| Un nuevo método creativo externo | `fuentes_externas/<nombre>.md` | ✅ Sí |
| Una API nueva | `interno_app/apis/README.md` (doc) + código en `agents/<capa>/` | ✅ Sí |
| Datos del restaurante (perfil, carta) | Se generan solos en init | ❌ No (gitignored) |
| Ideas guardadas / sesiones | Se generan al usar la app | ❌ No (gitignored) |

---

## 🧭 Historia de la migración

Esta carpeta reemplaza la antigua `.agent_knowledge/` (datos del restaurante) y los antiguos `agents/creativo/knowledge/` + `agents/creativo/prompts/` (recursos del agente). Ver el historial de git con `git log --follow` para el detalle de cada archivo.