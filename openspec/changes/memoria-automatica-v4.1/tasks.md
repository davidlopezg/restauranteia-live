# Tasks — Memoria automática del chat (Fase 4.1)

> Checklist de implementación. ✅ = completado.

---

## Fase 1: Diseño y taxonomía

- [x] Decidir 5 categorías principales + auxiliares (David)
- [x] Crear `agents/ideas_categorias.json` v2 con taxonomía completa
- [x] Definir keywords para cada categoría (productos: 50+ ingredientes; elaboraciones: 50+ platos; técnicas: 30+ métodos; herramientas: 30+ aparatos)
- [x] Definir patrones de intención ALTA ("me gustaría", "tengo que", "receta de")
- [x] Definir frases de cortesía a filtrar (16 frases)
- [x] Crear `categorias_alias_legacy` para migración v1 → v2

## Fase 2: Config persistente

- [x] Crear `agents/memoria/config.py`
- [x] `load_config()` con creación automática del archivo
- [x] `save_config()` con manejo de errores
- [x] `is_memoria_activa()` con env var override
- [x] `set_memoria_activa()` persiste en disco
- [x] `get_memoria_modo()` y `set_memoria_modo()` con validación
- [x] `reset_config()` para tests
- [x] Exportar desde `agents/memoria/__init__.py`

## Fase 3: Heurística de detección

- [x] Crear `agents/memoria/triggers.py`
- [x] `_normalizar()` preserva ñ, quita otros diacríticos
- [x] `_es_frase_cortesia()` filtra charla casual
- [x] `_match_intencion_alta()` detecta frases de intención fuerte
- [x] `_detectar_categorias()` separa keywords específicos vs patrones
- [x] `_resolver_categoria_principal()` con prioridad (receta > producto > herramienta > tecnica > ...)
- [x] `_extraer_extracto()` para mensajes cortos vs largos
- [x] Word boundary para single-word keywords
- [x] `analizar_mensaje()` retorna `ResultadoAnalisis`
- [x] `guardar_automatico()` con dedup + persistencia
- [x] `formatear_anexo_chat()` con anexo discreto

## Fase 4: Comandos

- [x] `/memoria on|off|alta|sugerir` en `commands.py`
- [x] `/memoria-status` muestra estado + contadores
- [x] `/lista-auto [filtro]` filtra solo auto-guardadas
- [x] `/olvidar auto` con confirmación en 2 turnos
- [x] `_handle_ideas()` soporta parámetro `solo_auto`
- [x] `_delete_auto_ideas()` borra solo `origen='auto-chat'`
- [x] Validación de argumentos (`/memoria patata` → error)

## Fase 5: Integración con el chat

- [x] `procesar_mensaje_chat()` ejecuta triggers tras la respuesta del chef
- [x] Try/except para no romper la respuesta si la memoria falla
- [x] `_loop_chat()` en CLI (usa `procesar_mensaje_chat`, ya integrado)
- [x] `_texto_ayuda()` en app.py actualizado
- [x] NO aplicar a `/ficha`, `/ideas`, `/proceso` (decisión D5.1)

## Fase 6: Tests

- [x] `tests/test_memoria_triggers.py` (64 tests)
  - [x] Filtrado de cortesía
  - [x] Detección de 5 categorías principales
  - [x] Detección de categorías auxiliares
  - [x] Niveles de confianza (alta/media/baja)
  - [x] Extracción del extracto
  - [x] Word boundary (no falsos substrings)
  - [x] Normalización (acentos, ñ)
  - [x] Tipos de retorno
- [x] `tests/test_memoria_config.py` (18 tests)
  - [x] Defaults
  - [x] Toggle activa/inactiva
  - [x] Modo alta/sugerir
  - [x] Umbral de confianza
  - [x] Reset
  - [x] Idempotencia
- [x] `tests/test_memoria_auto.py` (25 tests)
  - [x] Guardar automático end-to-end
  - [x] Toggle desactivado
  - [x] Modo sugerir
  - [x] Deduplicación auto ↔ manual
  - [x] Comandos `/memoria`, `/memoria-status`, `/lista-auto`, `/olvidar auto`
  - [x] Anexo del chat
  - [x] Deduplicación fuzzy
- [x] Verificar que tests preexistentes siguen pasando (223 tests sin cambios)
- [x] Total: 330 tests pasando

## Fase 7: Documentación

- [x] README.md actualizado:
  - [x] Tabla de estado: Fase 4.1 ✅
  - [x] Quick start con `/memoria on|off`
  - [x] Sección v4.1 con taxonomía de 5+6 categorías
  - [x] Ejemplo de flujo
  - [x] Comandos nuevos documentados
- [x] docs/COMMANDS.md actualizado:
  - [x] Tabla con 5 comandos nuevos
- [x] memory/memory.md actualizado:
  - [x] Decisión D5.1-D5.7 registradas
- [x] openspec/changes/memoria-automatica-v4.1/proposal.md (este change)
- [x] openspec/changes/memoria-automatica-v4.1/spec.md (contratos)
- [x] openspec/changes/memoria-automatica-v4.1/tasks.md (este archivo)

## Fase 8: Despliegue

- [x] Tests pasando localmente (330/330)
- [x] Sin nuevas dependencias
- [x] Compatible HF Space (mismo comportamiento que CLI)
- [ ] (Pendiente David) Probar en HF Space real con un mensaje real
- [ ] (Pendiente David) Monitorear tasa de auto-guardado vs borrado

---

## Pendiente para v4.2 (NO en este PR — ver proposal §7)

- [ ] **Multi-idea por mensaje** (refactor `guardar_automatico` para guardar todas las detectadas)
- [ ] **Editar categoría** (`/editar-categoria N <cat>`)
- [ ] **UI en Gradio** para los toggles
- [ ] **Categorización con LLM** para casos ambiguos
- [ ] **Memoria automática también en `/ficha` y `/ideas`**
- [ ] **Sincronización de la DB entre agentes**
- [ ] **Búsqueda semántica** (embeddings o FTS5)
- [ ] **Historial de cambios** de una idea

---

## Notas para la próxima sesión

Cuando vuelvas a abrir este change (por David o por mí):

1. **Empezar leyendo `memory/memory.md`** — sección "Fase 4.1 — Memoria automática del chat" tiene el contexto resumido.

2. **Si David reporta un falso positivo específico** (ej: "el chat guardó X y no debería"):
   - Añadir el caso como test en `test_memoria_triggers.py::TestNoFalsosPositivos`
   - Ajustar keywords o regex en `agents/ideas_categorias.json`
   - El cambio es solo JSON + tests, sin tocar código Python

3. **Si David reporta categorización incorrecta** (ej: "guardó como producto y debería ser elaboración"):
   - Verificar si la keyword matchea en otra categoría
   - Revisar prioridad en `_resolver_categoria_principal` (`triggers.py`)
   - Considerar añadir/quitar keywords específicas

4. **Si David pide activar v4.2 features** (multi-idea, LLM, etc.):
   - Empezar por `Multi-idea por mensaje` (es lo más pedido, ~2h)
   - Luego `Memoria automática en /ficha y /ideas` (siguiente más útil, ~2h)

5. **Si David reporta lentitud** (>100ms por mensaje):
   - El sistema actual está en <10ms. Si se reporta lentitud, probablemente sea el LLM, no la heurística
   - Considerar cachear el JSON de categorías (ya hay `_CATEGORIAS_CACHE`)

---

## Cómo verificar el cambio

```bash
# 1. Correr los tests
python -m pytest tests/test_memoria_triggers.py tests/test_memoria_config.py tests/test_memoria_auto.py -v

# 2. Probar el CLI
python -m agents.creativo.agent
> /memoria on
> me gustaría probar el kumquat
> /lista-auto

# 3. Probar la UI (Gradio)
python app.py
# Abrir el chat, escribir un mensaje con keyword, ver el 📌
```

Si todo funciona, el cambio está verificado.