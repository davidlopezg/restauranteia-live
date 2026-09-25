-- =============================================================
-- FASE 2: RPCs para lecturas complejas
-- =============================================================
--
-- Ejecutar después de phase-1-rls.sql.
-- Idempotente: DROP + CREATE FUNCTION.
--
-- Estos RPCs replican la lógica de queries.py para casos que NO se pueden
-- resolver con PostgREST puro: agregaciones, orden custom, cálculos
-- derivados.

BEGIN;

-- ============================================================
-- 1. catalogos_agrupados
-- ============================================================
-- Equivalente a GET /api/catalogos/grupos en queries.py:156
-- Orden hardcoded de categorías (Pizzas, Pizzas blancas, Compartir, ...).
-- Categorías no listadas van al final en orden alfabético.

DROP FUNCTION IF EXISTS notion_migration.catalogos_agrupados();
CREATE FUNCTION notion_migration.catalogos_agrupados()
RETURNS TABLE (
    categoria text,
    items json
)
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
    WITH base AS (
        SELECT id, titulo, categorias, orden, precio, estado, ingredientes,
               receta_estructurada, anio, seleccionada, notion_id, notion_last_edited,
               migrated_at, migration_run_id
        FROM notion_migration.catalogos
        ORDER BY orden NULLS LAST, titulo
    ),
    exploded AS (
        SELECT id, titulo, categorias, orden, precio, estado, ingredientes,
               receta_estructurada, anio, seleccionada, notion_id, notion_last_edited,
               migrated_at, migration_run_id,
               unnest(categorias) AS categoria
        FROM base
        WHERE categorias IS NOT NULL
    ),
    ordered AS (
        SELECT e.*,
               CASE
                   WHEN e.categoria = 'Pizzas' THEN 0
                   WHEN e.categoria = 'Pizzas blancas' THEN 1
                   WHEN e.categoria = 'Compartir' THEN 2
                   WHEN e.categoria = 'Ensaladas' THEN 3
                   WHEN e.categoria = 'Tapas' THEN 4
                   WHEN e.categoria = 'Postres' THEN 5
                   WHEN e.categoria = 'Sugerencias' THEN 6
                   WHEN e.categoria = 'Bebidas' THEN 7
                   WHEN e.categoria = 'Pizzas semanales' THEN 8
                   ELSE 100
               END AS sort_order,
               CASE
                   WHEN e.categoria IN ('Pizzas','Pizzas blancas','Compartir','Ensaladas',
                                        'Tapas','Postres','Sugerencias','Bebidas','Pizzas semanales')
                   THEN FALSE
                   ELSE TRUE
               END AS is_others
        FROM exploded e
    )
    SELECT categoria,
           json_agg(json_build_object(
               'id', id, 'titulo', titulo, 'categorias', categorias,
               'orden', orden, 'precio', precio, 'estado', estado,
               'ingredientes', ingredientes, 'receta_estructurada', receta_estructurada,
               'anio', anio, 'seleccionada', seleccionada,
               'notion_id', notion_id, 'notion_last_edited', notion_last_edited,
               'migrated_at', migrated_at, 'migration_run_id', migration_run_id
           ) ORDER BY orden NULLS LAST, titulo) AS items
    FROM ordered
    GROUP BY categoria, sort_order, is_others
    ORDER BY is_others ASC, sort_order ASC, categoria ASC;
$$;

GRANT EXECUTE ON FUNCTION notion_migration.catalogos_agrupados() TO authenticated;

-- ============================================================
-- 2. pipeline_por_estado
-- ============================================================
-- Equivalente a GET /api/desarrollo/pipeline (queries.py:553)
-- Devuelve dict con TODOS los estados hardcoded, incluso los vacíos.

DROP FUNCTION IF EXISTS notion_migration.pipeline_por_estado();
CREATE FUNCTION notion_migration.pipeline_por_estado()
RETURNS json
LANGUAGE plpgsql STABLE
SECURITY DEFINER
AS $$
DECLARE
    result json;
    estados text[] := ARRAY['CONCEPTO','PRUEBA_1','EVALUACION_1','MODIFICACION',
                             'PRUEBA_2','VALIDACION','PRODUCTO'];
    agg json := '{}'::json;
    rows_json json;
BEGIN
    SELECT json_agg(row_to_json(t)) INTO rows_json
    FROM (
        SELECT id, titulo, estado_desarrollo, objetivo, fecha, receta_final,
               migrated_at, timeline
        FROM notion_migration.agendas
        WHERE estado_desarrollo IS NOT NULL
        ORDER BY migrated_at DESC NULLS LAST
        LIMIT 200
    ) t;

    IF rows_json IS NULL THEN
        rows_json := '[]'::json;
    END IF;

    FOR i IN 1..array_length(estados, 1) LOOP
        agg := jsonb_set(
            agg::jsonb,
            ARRAY[estados[i]],
            COALESCE((
                SELECT json_agg(elem)
                FROM json_array_elements(rows_json) elem
                WHERE elem->>'estado_desarrollo' = estados[i]
            ), '[]'::json)::jsonb,
            true
        )::json;
    END LOOP;

    result := agg;
    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION notion_migration.pipeline_por_estado() TO authenticated;

-- ============================================================
-- 3. pendientes
-- ============================================================
-- Equivalente a GET /api/pendientes (queries.py:629)
-- Calcula prioridad según dias_sin_actividad y estado.

DROP FUNCTION IF EXISTS notion_migration.pendientes();
CREATE FUNCTION notion_migration.pendientes()
RETURNS TABLE (
    id uuid,
    titulo text,
    estado_desarrollo text,
    prioridad text,
    dias_sin_actividad integer,
    receta_final boolean,
    objetivo text,
    fecha date,
    migrated_at timestamptz
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH base AS (
        SELECT a.id, a.titulo, a.estado_desarrollo, a.migrated_at,
               a.receta_final, a.objetivo, a.fecha
        FROM notion_migration.agendas a
        WHERE a.estado_desarrollo IS NOT NULL
          AND a.estado_desarrollo <> 'PRODUCTO'
    ),
    clasificado AS (
        SELECT b.*,
            CASE
                WHEN b.estado_desarrollo = 'VALIDACION'
                     AND (b.receta_final IS NOT NULL
                          AND b.receta_final::text <> ''
                          AND b.receta_final::text <> 'null')
                THEN 'VERDE'
                WHEN b.migrated_at IS NOT NULL
                     AND EXTRACT(DAY FROM (now() - b.migrated_at)) > 3
                THEN 'ROJO'
                WHEN b.migrated_at IS NOT NULL
                     AND EXTRACT(DAY FROM (now() - b.migrated_at)) >= 1
                THEN 'NARANJA'
                ELSE 'AMARILLO'
            END AS prioridad_calc,
            CASE
                WHEN b.migrated_at IS NOT NULL
                THEN EXTRACT(DAY FROM (now() - b.migrated_at))::integer
                ELSE NULL
            END AS dias_calc,
            (b.receta_final IS NOT NULL
             AND b.receta_final::text <> ''
             AND b.receta_final::text <> 'null') AS receta_ok
        FROM base b
    )
    SELECT c.id, c.titulo, c.estado_desarrollo, c.prioridad_calc,
           c.dias_calc, c.receta_ok, c.objetivo, c.fecha, c.migrated_at
    FROM clasificado c
    ORDER BY
        CASE c.prioridad_calc
            WHEN 'ROJO' THEN 0
            WHEN 'NARANJA' THEN 1
            WHEN 'AMARILLO' THEN 2
            WHEN 'VERDE' THEN 3
            ELSE 9
        END,
        -(COALESCE(c.dias_calc, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION notion_migration.pendientes() TO authenticated;

-- ============================================================
-- 4. cadencia_semana_actual
-- ============================================================
-- Equivalente a GET /api/cadencia/semana-actual (queries.py:recalculate_current_week
-- + upsert_current_week + get_current_week + actividad_semanal)
-- Recalcula contadores y upserts de la semana actual.

DROP FUNCTION IF EXISTS notion_migration.cadencia_semana_actual();
CREATE FUNCTION notion_migration.cadencia_semana_actual()
RETURNS json
LANGUAGE plpgsql STABLE
SECURITY DEFINER
AS $$
DECLARE
    monday date;
    sunday date;
    current_week json;
    actividad json;
    obj_minimo int;
    count_productos int := 0;
    product_ids jsonb := '[]'::jsonb;
BEGIN
    -- Calcular lunes y domingo de la semana actual
    monday := date_trunc('week', current_date)::date;
    sunday := monday + interval '6 days';

    -- Upsert fila de la semana actual
    INSERT INTO notion_migration.weekly_objectives
        (semana_inicio, semana_fin, objetivo_minimo, estado, productos_ids)
    VALUES (monday, sunday, 1, 'EN_CURSO', '[]'::jsonb)
    ON CONFLICT (semana_inicio) DO NOTHING;

    -- Contar productos completados: agendas con estado PRODUCTO
    -- cuyo timeline muestra transicion a PRODUCTO esta semana
    SELECT count(*), COALESCE(jsonb_agg(DISTINCT a.id), '[]'::jsonb)
    INTO count_productos, product_ids
    FROM notion_migration.agendas a,
         jsonb_array_elements(a.timeline) AS ev
    WHERE a.estado_desarrollo = 'PRODUCTO'
      AND (ev->>'tipo') = 'CAMBIO_ESTADO'
      AND (ev->>'to') = 'PRODUCTO'
      AND (ev->>'ts')::date BETWEEN monday AND sunday;

    -- Actualizar fila
    UPDATE notion_migration.weekly_objectives w
    SET productos_completados = GREATEST(COALESCE(w.productos_completados, 0), count_productos),
        productos_ids = product_ids,
        estado = CASE
            WHEN w.estado = 'APLAZADO' THEN 'APLAZADO'
            WHEN count_productos >= w.objetivo_minimo THEN 'CUMPLIDO'
            ELSE 'EN_CURSO'
        END
    WHERE w.semana_inicio = monday
    RETURNING to_json(w) INTO current_week;

    -- Calcular actividad
    SELECT json_build_object(
        'ideas_creadas', (
            SELECT COUNT(*) FROM notion_migration.ideas
            WHERE created_at >= monday AND created_at < sunday + 1
        ),
        'pruebas_realizadas', (
            SELECT COUNT(*) FROM notion_migration.development_tests
            WHERE created_at >= monday AND created_at < sunday + 1
        ),
        'feedback_recogido', (
            SELECT COUNT(*) FROM notion_migration.test_feedback
            WHERE created_at >= monday AND created_at < sunday + 1
        ),
        'productos_en_desarrollo', (
            SELECT COUNT(*) FROM notion_migration.agendas
            WHERE estado_desarrollo IS NOT NULL AND estado_desarrollo <> 'PRODUCTO'
        )
    ) INTO actividad;

    RETURN json_build_object('week', current_week, 'actividad', actividad);
END;
$$;

GRANT EXECUTE ON FUNCTION notion_migration.cadencia_semana_actual() TO authenticated;

COMMIT;

-- ============================================================
-- Verificación post-aplicar
-- ============================================================
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'notion_migration'
--   AND routine_name IN ('catalogos_agrupados','pipeline_por_estado','pendientes','cadencia_semana_actual');
--
-- Esperado: 4 filas.
-- =============================================================