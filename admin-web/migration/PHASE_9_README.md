# FASE 9 — Receta Unificada + Ingredientes + Subrecetas + Alérgenos

## 🎯 Visión

Unificar `receta_estructurada` (escandallo operativo) y `receta_tecnica` (ficha presentable) en **una sola receta** con 9 secciones del modelo profesional de restauración. Introducir 3 tablas normalizadas que permitan:

- Escalar recetas (10 → 50 → 200 raciones)
- Calcular coste real automáticamente
- Generar listas de compras
- Detectar alérgenos automáticamente
- Sustituir ingredientes y recalcular
- Crear fichas técnicas con un click
- Conectar recetas entre sí (subrecetas)

## 📦 Lo que se entrega

### Modelo de datos (Supabase)

**Columna nueva:**
- `catalogos.receta` (jsonb) — fuente única de verdad con 9 secciones

**Tablas nuevas (6):**
- `ingredientes` — catálogo normalizado con coste, merma, alérgenos
- `alergenos` — 14 alérgenos UE 1169/2011 (seedeados)
- `subrecetas` — recetas reutilizables (salsas, masas, fondos)
- `receta_ingredientes` (N:M) — receta ↔ ingrediente
- `receta_subrecetas` (N:M) — receta ↔ subreceta
- `receta_alergenos` (N:M) — alérgenos presentes en cada receta

**RPCs (5):**
- `migrate_recetas_to_v2()` — convierte las recetas viejas al formato nuevo
- `seed_ingredientes_from_recetas()` — puebla `ingredientes` desde los JSON
- `populate_receta_ingredientes()` — puebla `receta_ingredientes`
- `refresh_alergenos_receta(uuid)` — recalcula alérgenos de una receta
- `refresh_alergenos_all_recetas()` — recalcula todas

**Vista:**
- `public.fichas_completas` — JOIN consolidado (receta + ingredientes + alérgenos)

**Triggers (2):**
- `touch_updated_at` — en `ingredientes` y `subrecetas`
- `recompute_food_cost` — recalcula `food_cost_pct` al cambiar PVP o coste

### Backend Python (legacy FastAPI)

**Actualizado:**
- `config.py` — constantes de las 6 tablas nuevas
- `queries.py` — `receta` añadida a EDITABLE_COLUMNS de catalogos

### Frontend (React + Vite)

**Nuevo:**
- `src/types/catalogo.ts` — tipos `Receta`, `Ingrediente`, `Alergeno`, `Subreceta`
- `src/lib/database.ts` — tipos de las nuevas tablas
- `src/lib/whitelist.ts` — columnas permitidas para clientes
- `src/services/receta.service.ts` — CRUD de ingredientes/subrecetas/alérgenos
- `src/features/entities/components/ficha-catalogo-section.tsx` — las 9 secciones en UI

**Actualizado:**
- `src/features/entities/detail-page.tsx` — integra FichaCatalogoSection

### IA (Chef Creativo)

**Actualizado:**
- `conocimiento/interno_app/prompts/system_chef.md` — el prompt ahora genera las 9 secciones

## 🚀 Cómo aplicarlo (orden exacto)

### Paso 1 — SQL estructural (en Supabase SQL Editor)

```bash
# 1. Aplicar migration estructural (tablas + columna + RLS + vistas + seed alérgenos)
psql -f admin-web/migration/phase-9-receta-unificada.sql

# 2. Aplicar RPCs + utilidades
psql -f admin-web/migration/phase-9b-rpc-migracion-datos.sql
```

Verificación tras aplicar:

```sql
-- Esperado: 6 tablas nuevas + 14 alérgenos + 6 vistas public + 5 RPCs
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'notion_migration'
  AND table_name IN ('ingredientes', 'alergenos', 'subrecetas',
                    'receta_ingredientes', 'receta_subrecetas', 'receta_alergenos');

SELECT COUNT(*) FROM notion_migration.alergenos; -- esperado: 14

SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'notion_migration'
  AND routine_name IN (
    'migrate_recetas_to_v2',
    'seed_ingredientes_from_recetas',
    'populate_receta_ingredientes',
    'refresh_alergenos_receta',
    'refresh_alergenos_all_recetas'
  );
```

### Paso 2 — Migrar datos (idempotente, se puede correr varias veces)

```sql
-- 2.1. Convierte receta_estructurada + receta_tecnica → catalogos.receta (jsonb v2)
SELECT migrate_recetas_to_v2();
-- Devuelve: { catalogos_procesados, catalogos_actualizados, ingredientes_en_recetas, errores }

-- 2.2. Puebla la tabla ingredientes con nombres únicos
SELECT seed_ingredientes_from_recetas();
-- Devuelve: { total_unicos_encontrados, ingredientes_insertados, ingredientes_omitidos_ya_existentes }

-- 2.3. Puebla receta_ingredientes desde catalogos.receta.ingredientes[]
SELECT populate_receta_ingredientes();
-- Devuelve: { catalogos_procesados, relaciones_insertadas, catalogos_con_error, errores }

-- 2.4. Calcula alérgenos heredados de los ingredientes
SELECT refresh_alergenos_all_recetas();
-- Devuelve: { catalogos_procesados, alergenos_asignados }
```

Verificación:

```sql
-- Esperado: ~72 catalogos con receta rellena
SELECT COUNT(*) FROM notion_migration.catalogos WHERE receta IS NOT NULL;

-- Esperado: N ingredientes extraídos (~50-80 únicos típicos)
SELECT COUNT(*) FROM notion_migration.ingredientes WHERE activo = true;

-- Esperado: ~150-300 relaciones receta-ingrediente
SELECT COUNT(*) FROM notion_migration.receta_ingredientes;

-- Esperado: alérgenos asignados
SELECT COUNT(*) FROM notion_migration.receta_alergenos;
```

### Paso 3 — Frontend (en el repo admin-web-frontend)

El código ya está aplicado (estos archivos):
- `src/types/catalogo.ts` (reescrito con tipos `Receta`)
- `src/lib/database.ts` (ampliado con tipos FASE 9)
- `src/lib/whitelist.ts` (whitelist ampliada)
- `src/services/receta.service.ts` (nuevo)
- `src/features/entities/components/ficha-catalogo-section.tsx` (nuevo)
- `src/features/entities/detail-page.tsx` (integración)

Solo hay que recompilar:

```bash
cd admin-web-frontend
npm run build
# o npm run dev para probar en local
```

### Paso 4 — Backend Python (legacy, opcional)

El backend Python ya está actualizado:
- `admin-web/backend/config.py` — constantes nuevas
- `admin-web/backend/queries.py` — whitelist ampliada

Si aún corre el FastAPI legacy, reiniciarlo. Si NO corre (Edge Functions), no hace falta.

### Paso 5 — IA (Chef Creativo)

El prompt está actualizado:
- `conocimiento/interno_app/prompts/system_chef.md` — ahora genera las 9 secciones

No hace falta redeploy: se lee en cada llamada. Si usas Gradio o Edge Functions, recargar para que tome el nuevo prompt.

## ✅ Verificación end-to-end

1. Abre el admin-web en local
2. Ve a un catálogo (ej. Pizza Margarita)
3. Comprueba que aparece "📋 Ficha Catálogo Completa (FASE 9)" con las 9 secciones
4. La sección 8 debe mostrar alérgenos si los tiene (ej. "🌾 Cereales con gluten")
5. La sección 9 debe mostrar Food cost % calculado
6. Edita un campo (ej. PVP en sección 9) → al guardar, food_cost_pct se recalcula automáticamente (trigger)
7. Click en "🔄 Alérgenos" → recalcula desde ingredientes

## 📊 Estructura de la receta (referencia rápida)

```typescript
interface Receta {
    version: 2;
    identidad:   { subcategoria, descripcion, estado_receta, version };
    rendimiento: { rendimiento_total, unidad_rendimiento, raciones, peso_por_racion_g, volumen_por_racion_ml };
    ingredientes: Array<{ nombre, cantidad_bruta, unidad, porcentaje, merma_pct, cantidad_neta, coste_unitario, coste_linea, ingrediente_id }>;
    elaboracion: { preparacion_previa, pasos[], puntos_criticos[{paso, motivo, accion}] };
    parametros:  { tiempo_preparacion_min, tiempo_coccion_min, temperatura_c, equipamiento[], tecnica };
    conservacion:{ metodo, temperatura_c{min,max}, vida_util_h, envase, etiquetado, regeneracion };
    servicio:    { porcion_g, emplatado, guarnicion, salsa, acabado };
    informacion: { alergenos[], dietas[], observaciones, advertencias };
    economia:    { coste_total, coste_racion, pvp, food_cost_pct, margen_bruto, margen_pct };
    meta?:       { fuente_origen, migrated_at, receta_estructurada_legacy, receta_tecnica_legacy, categorias_legacy };
}
```

## 🛡️ Compatibilidad hacia atrás

- ✅ `receta_estructurada` y `receta_tecnica` SE QUEDAN como legacy
- ✅ Scripts PHP idempotentes (pueden correrse varias veces)
- ✅ La migración de datos no borra nada (UPDATE no destructivo)
- ✅ Frontend muestra `RecetaSection` legacy si `receta` es null (fallback)

## ❓ Próximos pasos opcionales (no incluidos en FASE 9)

- **CRUD UI completo** para Ingredientes/Subrecetas/Alérgenos (hoy solo lectura via servicio)
- **Selector de ingredientes** en la ficha con autocomplete
- **Auto-asignar alérgenos** al ingrediente desde una matriz ingrediente→alérgeno curada
- **Generador de lista de compras** cruzando `recetas_a_producir × ingredientes`
- **Generador de lista de producción** con subrecetas expandidas recursivamente
- **Importador de fichas en bulk** desde los `.md` de escandallos
- **Tests E2E** (vitest + playwright)