-- =============================================================
-- FASE 3: RPC atómico para conversión idea → agenda
-- =============================================================
--
-- Ejecutar después de phase-2-rpcs.sql.
-- Idempotente: DROP + CREATE FUNCTION.
--
-- Replica routers/entities.py:convertir_idea (queries.py + main.py).
-- Es la única operación multi-tabla que requiere atomicidad real.

BEGIN;

-- ============================================================
-- convertir_idea_a_agenda
-- ============================================================
-- Pasos:
--   1. SELECT idea. Si no existe -> error.
--   2. SELECT agenda ya vinculada. Si existe -> already_exists=true.
--   3. INSERT nueva agenda con titulo de la idea + notion_id + migration_run_id.
--   4. Si idea.descripcion no es vacia -> UPDATE agenda SET objetivo.
--   5. INSERT en idea_agenda para vincular.
--   6. UPDATE agenda SET estado_desarrollo='CONCEPTO' + append evento timeline.
--   7. Devolver { already_exists, agenda_id, agenda_titulo }.

DROP FUNCTION IF EXISTS notion_migration.convertir_idea_a_agenda(p_idea_id uuid);
CREATE FUNCTION notion_migration.convertir_idea_a_agenda(p_idea_id uuid)
RETURNS TABLE (
    already_exists boolean,
    agenda_id uuid,
    agenda_titulo text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_idea record;
    v_agenda_id uuid;
    v_titulo text;
    v_existente record;
    v_descripcion text;
BEGIN
    -- 1. Buscar idea
    SELECT * INTO v_idea FROM notion_migration.ideas WHERE id = p_idea_id LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Idea no encontrada: %', p_idea_id;
    END IF;

    v_titulo := COALESCE(NULLIF(v_idea.titulo, ''), 'Concepto sin titulo');
    v_descripcion := v_idea.descripcion;

    -- 2. Verificar si ya hay agenda vinculada
    SELECT a.id, a.titulo INTO v_existente
    FROM notion_migration.agendas a
    JOIN notion_migration.idea_agenda ia ON ia.agenda_id = a.id
    WHERE ia.idea_id = p_idea_id
    LIMIT 1;

    IF FOUND THEN
        RETURN QUERY SELECT TRUE, v_existente.id, v_existente.titulo;
        RETURN;
    END IF;

    -- 3. INSERT nueva agenda
    INSERT INTO notion_migration.agendas
        (titulo, estado_desarrollo, objetivo, timeline,
         notion_id, migration_run_id)
    VALUES
        (v_titulo, 'CONCEPTO', NULL, '[]'::jsonb,
         gen_random_uuid()::text, 'manual_convert')
    RETURNING id INTO v_agenda_id;

    -- 4. UPDATE objetivo si hay descripcion
    IF v_descripcion IS NOT NULL AND v_descripcion <> '' THEN
        UPDATE notion_migration.agendas
        SET objetivo = v_descripcion
        WHERE id = v_agenda_id;
    END IF;

    -- 5. INSERT relacion idea_agenda
    INSERT INTO notion_migration.idea_agenda (idea_id, agenda_id, migration_run_id)
    VALUES (p_idea_id, v_agenda_id, 'manual_convert')
    ON CONFLICT DO NOTHING;

    -- 6. UPDATE agenda: estado CONCEPTO + evento timeline
    UPDATE notion_migration.agendas
    SET estado_desarrollo = 'CONCEPTO',
        timeline = COALESCE(timeline, '[]'::jsonb) ||
                   jsonb_build_array(
                       jsonb_build_object(
                           'ts', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                           'tipo', 'CAMBIO_ESTADO',
                           'from', NULL,
                           'to', 'CONCEPTO',
                           'desc', 'Convertida desde idea: ' || v_titulo
                       )
                   )
    WHERE id = v_agenda_id;

    -- 7. Devolver resultado
    RETURN QUERY SELECT FALSE, v_agenda_id, v_titulo;
END;
$$;

GRANT EXECUTE ON FUNCTION notion_migration.convertir_idea_a_agenda(uuid) TO authenticated;

COMMIT;

-- ============================================================
-- Verificación post-aplicar
-- ============================================================
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'notion_migration'
--   AND routine_name = 'convertir_idea_a_agenda';
-- =============================================================