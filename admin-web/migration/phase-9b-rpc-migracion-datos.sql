-- =============================================================
-- FASE 9b: RPCs de migración de datos + utilidades receta v2
-- =============================================================
--
-- OBJETIVO:
--   Proporcionar utilidades SQL para:
--     1. Migrar los 72 catalogos existentes de
--        `receta_estructurada` + `receta_tecnica` → nueva `receta` (jsonb v2)
--     2. Rellenar la tabla `ingredientes` desde los nombres únicos
--        encontrados en `receta_estructurada.ingredientes[].nombre`
--     3. Rellenar las tablas de relación N:M desde los JSON
--     4. Refrescar `receta_alergenos` automáticamente desde ingredientes
--     5. Refrescar food_cost_pct cuando se cambia PVP o coste_total
--
-- EJECUCIÓN:
--   Después de phase-9-receta-unificada.sql. Idempotente.
-- =============================================================


-- =============================================================
-- 1. Helper: extrae un número de un string con unidad
-- =============================================================
-- Acepta formatos: "150 g", "1.5 kg", "200 ml", "3 unidades", "1 ud"
-- Devuelve numeric o NULL.

CREATE OR REPLACE FUNCTION notion_migration._parse_qty(s text)
RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE
        WHEN s IS NULL OR trim(s) = '' THEN NULL
        ELSE (
            SELECT NULLIF(regexp_replace(trim(s), '[^0-9.,]', '', 'g'), '')::numeric
        )
    END;
$$;


-- =============================================================
-- 2. Helper: convierte texto a numeric de forma tolerante
-- =============================================================
-- Acepta formatos europeos "1,5" / "1.500,75" y anglosajones "1.5" / "1,500.75".
-- Limpia basura (espacios, puntos sueltos tipo "4.5.").
-- Devuelve numeric o NULL si no se puede parsear.

CREATE OR REPLACE FUNCTION notion_migration._to_numeric_safe(s text)
RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE
        WHEN s IS NULL OR trim(s) = '' THEN NULL
        ELSE (
                CASE
                    WHEN trim(s) ~ '^[0-9]+(\.[0-9]+)?$' THEN (trim(s))::numeric
                    WHEN trim(s) ~ '^[0-9]+,[0-9]+$' THEN replace(trim(s), ',', '.')::numeric
                    WHEN trim(s) ~ '^[0-9]{1,3}(\.[0-9]{3})+(,[0-9]+)?$' THEN
                        replace(replace(trim(s), '.', ''), ',', '.')::numeric
                    WHEN trim(s) ~ '^[0-9]{1,3}(,[0-9]{3})+(\.[0-9]+)?$' THEN
                        replace(trim(s), ',', '')::numeric
                    ELSE NULL
                END
            )
    END;
$$;


-- =============================================================
-- 2.5. Helper: extrae unidad canónica de un string
-- =============================================================
-- Acepta "g" / "gr" / "gramos" → 'g'
--         "kg" / "kilo" → 'kg'
--         "ml" / "mililitro" → 'ml'
--         "l" / "litro" → 'L'
--         "ud" / "u" / "unidad" / "unidades" → 'ud'
-- Devuelve 'g' | 'kg' | 'ml' | 'L' | 'ud' | NULL.

CREATE OR REPLACE FUNCTION notion_migration._parse_unit(s text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE
        WHEN s IS NULL OR trim(s) = '' THEN NULL
        WHEN s ~* '(kg|kilo|kilos|kilogramo)' THEN 'kg'
        WHEN s ~* '\m(gr|gramo|gramos|g)\M' THEN 'g'
        WHEN s ~* '\m(ml|mililitro|mililitros)\M' THEN 'ml'
        WHEN s ~* '\m(litro|litros|l)\M' THEN 'L'
        WHEN s ~* '\m(unidad|unidades|ud|u)\M' THEN 'ud'
        ELSE NULL
    END;
$$;


-- =============================================================
-- 3. RPC: migra catalogos.receta desde los JSON viejos
-- =============================================================
-- Convierte:
--   - receta_estructurada.ingredientes[] → receta.ingredientes[] (sección 3)
--   - receta_estructurada.preparacion[]   → receta.elaboracion.pasos[] (sección 4)
--   - receta_estructurada.coste          → receta.economia (sección 9)
--   - receta_estructurada.raciones       → receta.rendimiento (sección 2)
--   - receta_tecnica.ingredientes[]      → merge con sección 3 (sin duplicar)
--   - receta_tecnica.elaboracion_mise_en_place → receta.elaboracion.preparacion_previa
--   - receta_tecnica.elaboracion_servicio → receta.servicio
--   - catalogos.ingredientes (texto)     → meta.fuente_ingredientes_texto (legacy)
--
-- Devuelve un JSON con estadísticas: {catalogos_procesados, catalogos_actualizados,
--                                       ingredientes_unicos, errores}
-- =============================================================

DROP FUNCTION IF EXISTS notion_migration.migrate_recetas_to_v2();
CREATE FUNCTION notion_migration.migrate_recetas_to_v2()
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
    r record;
    re_data jsonb;
    rt_data jsonb;
    new_receta jsonb;
    ingredientes_arr jsonb := '[]'::jsonb;
    pasos_arr jsonb := '[]'::jsonb;
    ing record;
    paso text;
    economia jsonb;
    rendimiento jsonb;
    elaboracion jsonb;
    servicio jsonb;
    identidad jsonb;
    info jsonb;
    params jsonb;
    conservacion jsonb;
    counter_ing int := 0;
    counter_act int := 0;
    counter_proc int := 0;
    errs jsonb := '[]'::jsonb;
    cat_id uuid;
    cat_titulo text;
    cat_precio numeric;
    cat_estado text;
    cat_categorias text[];
BEGIN
    FOR r IN
        SELECT id, titulo, precio, estado, categorias,
               receta_estructurada, receta_tecnica
        FROM notion_migration.catalogos
        WHERE receta_estructurada IS NOT NULL OR receta_tecnica IS NOT NULL
    LOOP
        counter_proc := counter_proc + 1;
        cat_id := r.id;
        cat_titulo := r.titulo;
        cat_precio := r.precio;
        cat_estado := r.estado;
        cat_categorias := r.categorias;

        re_data := COALESCE(r.receta_estructurada::jsonb, '{}'::jsonb);
        rt_data := COALESCE(r.receta_tecnica::jsonb, '{}'::jsonb);

        BEGIN
            -- ===== SECCIÓN 3: INGREDIENTES =====
            -- Priorizamos receta_tecnica (más detalle) + añadimos coste de receta_estructurada
            -- FIX: el alias 'elem' evita que Postgres confunda record vs jsonb
            ingredientes_arr := '[]'::jsonb;

            IF (rt_data->'ingredientes') IS NOT NULL AND jsonb_typeof(rt_data->'ingredientes') = 'array' THEN
                FOR ing IN
                    SELECT elem FROM jsonb_array_elements(rt_data->'ingredientes') AS elem
                LOOP
                    ingredientes_arr := ingredientes_arr || jsonb_build_object(
                        'nombre', COALESCE(ing.elem->>'nombre', '?'),
                        'cantidad_bruta',
                            COALESCE(
                                notion_migration._parse_qty(ing.elem->>'cantidad'),
                                (ing.elem->>'cantidad')::numeric
                            ),
                        'unidad',
                            COALESCE(
                                notion_migration._parse_unit(ing.elem->>'cantidad'),
                                COALESCE(ing.elem->>'unidad', 'g')
                            ),
                        'porcentaje', NULL,
                        'merma_pct', 0,
                        'cantidad_neta',
                            COALESCE(
                                notion_migration._parse_qty(ing.elem->>'cantidad'),
                                (ing.elem->>'cantidad')::numeric
                            ),
                        'coste_unitario', NULL,
                        'coste_linea', NULL,
                        'ingrediente_id', NULL,
                        'fuente', 'receta_tecnica'
                    );
                    counter_ing := counter_ing + 1;
                END LOOP;
            ELSIF (re_data->'ingredientes') IS NOT NULL AND jsonb_typeof(re_data->'ingredientes') = 'array' THEN
                FOR ing IN
                    SELECT elem FROM jsonb_array_elements(re_data->'ingredientes') AS elem
                LOOP
                    ingredientes_arr := ingredientes_arr || jsonb_build_object(
                        'nombre', COALESCE(ing.elem->>'nombre', '?'),
                        'cantidad_bruta',
                            COALESCE(
                                notion_migration._parse_qty(ing.elem->>'cantidad'),
                                (ing.elem->>'cantidad')::numeric
                            ),
                        'unidad', COALESCE(notion_migration._parse_unit(ing.elem->>'cantidad'), 'g'),
                        'porcentaje', NULL,
                        'merma_pct', 0,
                        'cantidad_neta',
                            COALESCE(
                                notion_migration._parse_qty(ing.elem->>'cantidad'),
                                (ing.elem->>'cantidad')::numeric
                            ),
                        'coste_unitario', notion_migration._to_numeric_safe(ing.elem->>'precio_unidad'),
                        'coste_linea', notion_migration._to_numeric_safe(ing.elem->>'coste_real'),
                        'ingrediente_id', NULL,
                        'fuente', 'receta_estructurada'
                    );
                    counter_ing := counter_ing + 1;
                END LOOP;
            END IF;

            -- ===== SECCIÓN 4: ELABORACIÓN =====
            pasos_arr := '[]'::jsonb;
            IF (re_data->'preparacion') IS NOT NULL AND jsonb_typeof(re_data->'preparacion') = 'array' THEN
                FOR paso IN
                    SELECT jsonb_array_elements_text(re_data->'preparacion')
                LOOP
                    pasos_arr := pasos_arr || to_jsonb(paso);
                END LOOP;
            END IF;

            elaboracion := jsonb_build_object(
                'preparacion_previa', COALESCE(rt_data->>'elaboracion_mise_en_place', ''),
                'pasos', pasos_arr,
                'puntos_criticos', '[]'::jsonb
            );

            -- ===== SECCIÓN 7: SERVICIO =====
            servicio := jsonb_build_object(
                'porcion_g', NULL,
                'emplatado', NULL,
                'guarnicion', NULL,
                'salsa', NULL,
                'acabado', COALESCE(rt_data->>'elaboracion_servicio', '')
            );

            -- ===== SECCIÓN 9: ECONOMÍA =====
            economia := jsonb_build_object(
                'coste_total', notion_migration._to_numeric_safe(re_data->'coste'->>'coste_total'),
                'coste_racion', notion_migration._to_numeric_safe(re_data->'coste'->>'coste_total'),
                'pvp', COALESCE(cat_precio, notion_migration._to_numeric_safe(re_data->'coste'->>'pvp')),
                'food_cost_pct',
                    CASE
                        WHEN cat_precio IS NOT NULL AND (re_data->'coste'->>'coste_total') IS NOT NULL
                             AND cat_precio > 0
                        THEN ROUND((notion_migration._to_numeric_safe(re_data->'coste'->>'coste_total') / cat_precio) * 100, 2)
                        WHEN (re_data->'coste'->>'porcentaje_beneficio') IS NOT NULL
                        THEN ROUND(100 - notion_migration._to_numeric_safe(re_data->'coste'->>'porcentaje_beneficio'), 2)
                        ELSE NULL
                    END,
                'margen_bruto', notion_migration._to_numeric_safe(re_data->'coste'->>'margen_bruto'),
                'margen_pct', notion_migration._to_numeric_safe(re_data->'coste'->>'porcentaje_beneficio')
            );

            -- ===== SECCIÓN 2: RENDIMIENTO =====
            rendimiento := jsonb_build_object(
                'rendimiento_total', 1,
                'unidad_rendimiento', 'ud',
                'raciones', COALESCE((re_data->>'raciones')::int, 1),
                'peso_por_racion_g', NULL,
                'volumen_por_racion_ml', NULL
            );

            -- ===== SECCIÓN 1: IDENTIDAD =====
            identidad := jsonb_build_object(
                'subcategoria', NULL,
                'descripcion', COALESCE(re_data->>'descripcion', ''),
                'estado_receta', CASE
                    WHEN cat_estado IN ('Listo','Listo - Plato Catalogado') THEN 'activa'
                    WHEN cat_estado = 'Descartado (por el momento)' THEN 'archivada'
                    ELSE 'borrador'
                END,
                'version', 2
            );

            -- ===== SECCIÓN 8: INFORMACIÓN =====
            info := jsonb_build_object(
                'alergenos', '[]'::jsonb,
                'dietas', '[]'::jsonb,
                'observaciones', '',
                'advertencias', ''
            );

            -- ===== SECCIÓN 5: PARÁMETROS =====
            params := jsonb_build_object(
                'tiempo_preparacion_min', NULL,
                'tiempo_coccion_min', NULL,
                'temperatura_c', NULL,
                'equipamiento', '[]'::jsonb,
                'tecnica', ''
            );

            -- ===== SECCIÓN 6: CONSERVACIÓN =====
            conservacion := jsonb_build_object(
                'metodo', NULL,
                'temperatura_c', NULL,
                'vida_util_h', NULL,
                'envase', NULL,
                'etiquetado', NULL,
                'regeneracion', NULL
            );

            -- ===== ENSAMBLAJE =====
            new_receta := jsonb_build_object(
                'version', 2,
                'identidad', identidad,
                'rendimiento', rendimiento,
                'ingredientes', ingredientes_arr,
                'elaboracion', elaboracion,
                'parametros', params,
                'conservacion', conservacion,
                'servicio', servicio,
                'informacion', info,
                'economia', economia,
                'meta', jsonb_build_object(
                    'fuente_origen', 'phase-9 migration',
                    'migrated_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                    'receta_estructurada_legacy', re_data,
                    'receta_tecnica_legacy', rt_data,
                    'categorias_legacy', to_jsonb(cat_categorias)
                )
            );

            UPDATE notion_migration.catalogos
            SET receta = new_receta
            WHERE id = cat_id;

            counter_act := counter_act + 1;

        EXCEPTION WHEN OTHERS THEN
            errs := errs || jsonb_build_object(
                'catalogo_id', cat_id,
                'titulo', cat_titulo,
                'error', SQLERRM
            );
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'catalogos_procesados', counter_proc,
        'catalogos_actualizados', counter_act,
        'ingredientes_en_recetas', counter_ing,
        'errores', errs
    );
END;
$$;

GRANT EXECUTE ON FUNCTION notion_migration.migrate_recetas_to_v2() TO authenticated;

COMMENT ON FUNCTION notion_migration.migrate_recetas_to_v2() IS
    'Migra catalogos.receta_estructurada + receta_tecnica → catalogos.receta (jsonb v2). '
    'Idempotente. Ejecutar una sola vez después de phase-9.';


-- =============================================================
-- 4. RPC: rellena la tabla ingredientes desde los JSON
-- =============================================================
-- Extrae nombres únicos de catalogos.receta.ingredientes[] y los inserta
-- en la tabla ingredientes (sin duplicar, sin pisar).
--
-- Estrategia conservadora:
--   - Inserta solo los nombres que NO existan ya.
--   - categoria: NULL (se categoriza después manualmente).
--   - coste_medio: el del primer catálogo que lo use (si tiene coste_unitario).
--   - merma_default: 0%.
--   - alergenos: [] (se rellenan con la fase de auditoría de alérgenos).
--
-- Devuelve {ingredientes_insertados, ingredientes_omitidos, total_unicos}

DROP FUNCTION IF EXISTS notion_migration.seed_ingredientes_from_recetas();
CREATE FUNCTION notion_migration.seed_ingredientes_from_recetas()
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
    r record;
    nombre_norm text;
    coste numeric;
    inserted int := 0;
    skipped int := 0;
    total_unicos int := 0;
    nombre_existe boolean;
BEGIN
    -- 1. Calcular total de nombres únicos
    SELECT COUNT(DISTINCT lower(trim(ing->>'nombre')))
    INTO total_unicos
    FROM notion_migration.catalogos c,
         jsonb_array_elements(c.receta->'ingredientes') ing
    WHERE c.receta IS NOT NULL
      AND (ing->>'nombre') IS NOT NULL
      AND trim(ing->>'nombre') <> '';

    -- 2. Iterar nombres únicos y los que aún no estén en la tabla
    FOR nombre_norm, coste IN
        SELECT
            lower(trim(ing->>'nombre')) AS nombre_norm,
            MAX((ing->>'coste_unitario')::numeric) AS coste_max
        FROM notion_migration.catalogos c,
             jsonb_array_elements(c.receta->'ingredientes') ing
        WHERE c.receta IS NOT NULL
          AND (ing->>'nombre') IS NOT NULL
          AND trim(ing->>'nombre') <> ''
        GROUP BY lower(trim(ing->>'nombre'))
    LOOP
        SELECT EXISTS(
            SELECT 1 FROM notion_migration.ingredientes
            WHERE lower(nombre) = nombre_norm
        ) INTO nombre_existe;

        IF NOT nombre_existe THEN
            INSERT INTO notion_migration.ingredientes
                (nombre, coste_medio, alergenos, dietas_validas, activo, notas)
            VALUES (
                initcap(nombre_norm),
                coste,
                '{}',
                '{}',
                true,
                'Auto-seeded desde recetas existentes.'
            );
            inserted := inserted + 1;
        ELSE
            skipped := skipped + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'total_unicos_encontrados', total_unicos,
        'ingredientes_insertados', inserted,
        'ingredientes_omitidos_ya_existentes', skipped
    );
END;
$$;

GRANT EXECUTE ON FUNCTION notion_migration.seed_ingredientes_from_recetas() TO authenticated;


-- =============================================================
-- 5. RPC: rellena receta_ingredientes desde catalogos.receta
-- =============================================================
-- Para cada ingrediente en catalogos.receta.ingredientes[] busca
-- el ingrediente_id correspondiente (por nombre normalizado) y crea
-- la fila en receta_ingredientes.
--
-- Si el ingrediente NO existe, lo crea primero.
-- Idempotente (usa UNIQUE constraint para evitar duplicados).

DROP FUNCTION IF EXISTS notion_migration.populate_receta_ingredientes();
CREATE FUNCTION notion_migration.populate_receta_ingredientes()
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
    r record;
    ing record;
    nombre_norm text;
    ing_id uuid;
    inserted int := 0;
    skipped int := 0;
    counter_cats int := 0;
    errs jsonb := '[]'::jsonb;
    cat_titulo text;
BEGIN
    FOR r IN
        SELECT id, titulo, receta
        FROM notion_migration.catalogos
        WHERE receta IS NOT NULL
          AND (receta->'ingredientes') IS NOT NULL
    LOOP
        counter_cats := counter_cats + 1;
        cat_titulo := r.titulo;

        BEGIN
            FOR ing IN
                SELECT
                    (elem->>'nombre') AS nombre,
                    COALESCE((elem->>'cantidad_bruta')::numeric, (elem->>'cantidad')::numeric, 0) AS cantidad,
                    COALESCE(elem->>'unidad', 'g') AS unidad,
                    COALESCE((elem->>'merma_pct')::numeric, 0) AS merma,
                    (ord)::int AS orden
                FROM jsonb_array_elements(r.receta->'ingredientes') WITH ORDINALITY AS t(elem, ord)
                WHERE (elem->>'nombre') IS NOT NULL
                  AND trim(elem->>'nombre') <> ''
            LOOP
                nombre_norm := lower(trim(ing.nombre));

                SELECT id INTO ing_id
                FROM notion_migration.ingredientes
                WHERE lower(nombre) = nombre_norm
                LIMIT 1;

                IF ing_id IS NULL THEN
                    INSERT INTO notion_migration.ingredientes (nombre, activo)
                    VALUES (initcap(ing.nombre), true)
                    RETURNING id INTO ing_id;
                END IF;

                INSERT INTO notion_migration.receta_ingredientes
                    (receta_id, ingrediente_id, cantidad_bruta, unidad, merma_pct_override, orden)
                VALUES (r.id, ing_id, ing.cantidad, ing.unidad, ing.merma, ing.orden)
                ON CONFLICT (receta_id, ingrediente_id) DO UPDATE
                SET cantidad_bruta = EXCLUDED.cantidad_bruta,
                    unidad = EXCLUDED.unidad,
                    merma_pct_override = EXCLUDED.merma_pct_override,
                    orden = EXCLUDED.orden;

                inserted := inserted + 1;
            END LOOP;

        EXCEPTION WHEN OTHERS THEN
            errs := errs || jsonb_build_object(
                'catalogo_id', r.id,
                'titulo', cat_titulo,
                'error', SQLERRM
            );
            skipped := skipped + 1;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'catalogos_procesados', counter_cats,
        'relaciones_insertadas', inserted,
        'catalogos_con_error', skipped,
        'errores', errs
    );
END;
$$;

GRANT EXECUTE ON FUNCTION notion_migration.populate_receta_ingredientes() TO authenticated;


-- =============================================================
-- 6. RPC: refresca receta_alergenos desde ingredientes
-- =============================================================
-- Recalcula la unión de alérgenos de todos los ingredientes de una receta
-- (y opcionalmente subrecetas) y actualiza la tabla receta_alergenos.
--
-- Uso:
--   SELECT refresh_alergenos_receta('uuid-del-catalogo');
--   -- O para todas:
--   SELECT refresh_alergenos_all_recetas();

DROP FUNCTION IF EXISTS notion_migration.refresh_alergenos_receta(p_receta_id uuid);
CREATE FUNCTION notion_migration.refresh_alergenos_receta(p_receta_id uuid)
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
    counter int := 0;
    ing record;
BEGIN
    -- Borrar los alérgenos heredados anteriores (NO los manuales)
    DELETE FROM notion_migration.receta_alergenos
    WHERE receta_id = p_receta_id
      AND origen <> 'manual';

    -- Insertar los nuevos desde ingredientes
    FOR ing IN
        SELECT DISTINCT unnest(i.alergenos) AS alergeno_codigo
        FROM notion_migration.receta_ingredientes ri
        JOIN notion_migration.ingredientes i ON i.id = ri.ingrediente_id
        WHERE ri.receta_id = p_receta_id
          AND i.alergenos IS NOT NULL
          AND array_length(i.alergenos, 1) > 0
    LOOP
        INSERT INTO notion_migration.receta_alergenos (receta_id, alergeno_id, origen)
        SELECT p_receta_id, a.id, 'heredado_ingrediente'
        FROM notion_migration.alergenos a
        WHERE a.codigo = ing.alergeno_codigo
        ON CONFLICT (receta_id, alergeno_id) DO NOTHING;

        counter := counter + 1;
    END LOOP;

    RETURN counter;
END;
$$;

GRANT EXECUTE ON FUNCTION notion_migration.refresh_alergenos_receta(uuid) TO authenticated;


DROP FUNCTION IF EXISTS notion_migration.refresh_alergenos_all_recetas();
CREATE FUNCTION notion_migration.refresh_alergenos_all_recetas()
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
    r record;
    counter_cats int := 0;
    counter_alerg int := 0;
BEGIN
    FOR r IN
        SELECT id FROM notion_migration.catalogos
        WHERE receta IS NOT NULL
    LOOP
        counter_alerg := counter_alerg + notion_migration.refresh_alergenos_receta(r.id);
        counter_cats := counter_cats + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'catalogos_procesados', counter_cats,
        'alergenos_asignados', counter_alerg
    );
END;
$$;

GRANT EXECUTE ON FUNCTION notion_migration.refresh_alergenos_all_recetas() TO authenticated;


-- =============================================================
-- 7. RPC: recalcula food_cost_pct al cambiar PVP o coste
-- =============================================================
-- Trigger que actualiza automaticamente receta.economia.food_cost_pct
-- cuando se actualiza catalogos.precio o catalogos.receta.

DROP FUNCTION IF EXISTS notion_migration.recompute_food_cost() CASCADE;
CREATE FUNCTION notion_migration.recompute_food_cost()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    coste numeric;
    pvp numeric;
    food_cost numeric;
BEGIN
    coste := (NEW.receta->'economia'->>'coste_total')::numeric;
    pvp := COALESCE(NEW.precio, (NEW.receta->'economia'->>'pvp')::numeric);

    IF coste IS NOT NULL AND pvp IS NOT NULL AND pvp > 0 THEN
        food_cost := ROUND((coste / pvp) * 100, 2);

        NEW.receta := jsonb_set(
            NEW.receta,
            '{economia,food_cost_pct}',
            to_jsonb(food_cost),
            true
        );
        NEW.receta := jsonb_set(
            NEW.receta,
            '{economia,pvp}',
            to_jsonb(pvp),
            true
        );
        NEW.receta := jsonb_set(
            NEW.receta,
            '{economia,coste_racion}',
            to_jsonb(coste),
            true
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS catalogos_recompute_food_cost ON notion_migration.catalogos;
CREATE TRIGGER catalogos_recompute_food_cost
    BEFORE INSERT OR UPDATE OF precio, receta ON notion_migration.catalogos
    FOR EACH ROW
    WHEN (NEW.receta IS NOT NULL)
    EXECUTE FUNCTION notion_migration.recompute_food_cost();


-- =============================================================
-- 8. RPC: vista resumen de la ficha completa
-- =============================================================
-- JOIN entre catalogos.receta + receta_ingredientes + ingredientes + receta_alergenos
-- para devolver la ficha completa consolidada en un solo query.

DROP VIEW IF EXISTS public.fichas_completas CASCADE;
CREATE VIEW public.fichas_completas WITH (security_barrier) AS
SELECT
    c.id AS catalogo_id,
    c.titulo,
    c.precio,
    c.receta,
    COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
            'ingrediente_id', ri.ingrediente_id,
            'nombre', i.nombre,
            'cantidad_bruta', ri.cantidad_bruta,
            'unidad', ri.unidad,
            'merma_pct', COALESCE(ri.merma_pct_override, i.merma_default_pct),
            'coste_unitario', i.coste_medio,
            'coste_linea',
                CASE
                    WHEN ri.unidad = 'kg' AND i.coste_medio IS NOT NULL
                    THEN ROUND((ri.cantidad_bruta / 1000.0) * i.coste_medio, 4)
                    WHEN ri.unidad = 'g' AND i.coste_medio IS NOT NULL
                    THEN ROUND((ri.cantidad_bruta / 1000.0) * i.coste_medio, 4)
                    WHEN ri.unidad = 'L' AND i.coste_medio IS NOT NULL
                    THEN ROUND((ri.cantidad_bruta / 1000.0) * i.coste_medio, 4)
                    WHEN ri.unidad = 'ml' AND i.coste_medio IS NOT NULL
                    THEN ROUND((ri.cantidad_bruta / 1000.0) * i.coste_medio, 4)
                    ELSE NULL
                END,
            'orden', ri.orden
        ) ORDER BY ri.orden)
        FROM notion_migration.receta_ingredientes ri
        JOIN notion_migration.ingredientes i ON i.id = ri.ingrediente_id
        WHERE ri.receta_id = c.id
    ), '[]'::jsonb) AS ingredientes_normalizados,
    COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
            'alergeno_id', ra.alergeno_id,
            'codigo', a.codigo,
            'nombre', a.nombre,
            'icono', a.icono,
            'origen', ra.origen
        ))
        FROM notion_migration.receta_alergenos ra
        JOIN notion_migration.alergenos a ON a.id = ra.alergeno_id
        WHERE ra.receta_id = c.id
    ), '[]'::jsonb) AS alergenos
FROM notion_migration.catalogos c;

GRANT SELECT ON public.fichas_completas TO anon, authenticated;


-- =============================================================
-- VERIFICACIÓN POST-APLICAR
-- =============================================================
-- 1. ¿La función de migración existe?
--
--   SELECT routine_name FROM information_schema.routines
--   WHERE routine_schema = 'notion_migration'
--     AND routine_name LIKE '%receta%' OR routine_name LIKE '%alergen%'
--   ORDER BY routine_name;
--
-- Esperado:
--   - migrate_recetas_to_v2
--   - seed_ingredientes_from_recetas
--   - populate_receta_ingredientes
--   - refresh_alergenos_receta
--   - refresh_alergenos_all_recetas
--   - _parse_qty, _parse_unit (privadas)
--
-- 2. ¿La vista fichas_completas existe?
--
--   SELECT table_name FROM information_schema.views
--   WHERE table_schema = 'public' AND table_name = 'fichas_completas';
--
-- 3. ¿El trigger de food_cost existe?
--
--   SELECT trigger_name FROM information_schema.triggers
--   WHERE event_object_schema = 'notion_migration'
--     AND event_object_table = 'catalogos';
-- =============================================================