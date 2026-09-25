-- =============================================================
-- FASE 4: RPCs para operaciones complejas
-- =============================================================
--
-- Ejecutar después de phase-3-rpcs.sql.
-- Idempotente: DROP + CREATE FUNCTION.
--
-- Estas operaciones requieren atomicidad (lectura-modificación-escritura
-- o múltiples queries coordinadas).

BEGIN;

-- ============================================================
-- 1. cambiar_estado_desarrollo
-- ============================================================
-- Valida estado + transicion + append timeline. Todo en una transaccion.
-- Replica queries.py:cambiar_estado_desarrollo

DROP FUNCTION IF EXISTS notion_migration.cambiar_estado_desarrollo(
    p_agenda_id uuid, p_nuevo_estado text, p_descripcion text
);
CREATE FUNCTION notion_migration.cambiar_estado_desarrollo(
    p_agenda_id uuid,
    p_nuevo_estado text,
    p_descripcion text DEFAULT ''
)
RETURNS TABLE (like notion_migration.agendas)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_estados_validos text[] := ARRAY[
        'CONCEPTO','PRUEBA_1','EVALUACION_1','MODIFICACION',
        'PRUEBA_2','VALIDACION','PRODUCTO'
    ];
    v_transiciones jsonb := '{
        "CONCEPTO": ["PRUEBA_1"],
        "PRUEBA_1": ["EVALUACION_1"],
        "EVALUACION_1": ["MODIFICACION", "PRUEBA_2"],
        "MODIFICACION": ["PRUEBA_2"],
        "PRUEBA_2": ["VALIDACION"],
        "VALIDACION": ["PRODUCTO"],
        "PRODUCTO": []
    }'::jsonb;
    v_actual record;
BEGIN
    -- Validar estado
    IF NOT (p_nuevo_estado = ANY(v_estados_validos)) THEN
        RAISE EXCEPTION 'Estado invalido: %', p_nuevo_estado;
    END IF;

    -- SELECT state actual
    SELECT estado_desarrollo, timeline INTO v_actual
    FROM notion_migration.agendas
    WHERE id = p_agenda_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agenda no encontrada: %', p_agenda_id;
    END IF;

    -- Validar transicion
    IF v_actual.estado_desarrollo IS NOT NULL
       AND v_actual.estado_desarrollo <> p_nuevo_estado THEN
        IF NOT (p_nuevo_estado = ANY(
            ARRAY(SELECT jsonb_array_elements_text(
                v_transiciones -> v_actual.estado_desarrollo
            ))
        )) THEN
            RAISE EXCEPTION 'Transicion no permitida: % -> %',
                v_actual.estado_desarrollo, p_nuevo_estado;
        END IF;
    END IF;

    -- UPDATE: nuevo estado + append evento timeline
    RETURN QUERY
    UPDATE notion_migration.agendas a
    SET estado_desarrollo = p_nuevo_estado,
        timeline = COALESCE(a.timeline, '[]'::jsonb) || jsonb_build_array(
            jsonb_build_object(
                'ts', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'tipo', 'CAMBIO_ESTADO',
                'from', v_actual.estado_desarrollo,
                'to', p_nuevo_estado,
                'desc', COALESCE(p_descripcion, '')
            )
        )
    WHERE id = p_agenda_id
    RETURNING a.*;
END;
$$;

GRANT EXECUTE ON FUNCTION notion_migration.cambiar_estado_desarrollo(uuid, text, text) TO authenticated;

-- ============================================================
-- 2. append_event
-- ============================================================
-- Append evento al timeline sin cambiar estado.

DROP FUNCTION IF EXISTS notion_migration.append_event(
    p_agenda_id uuid, p_tipo text, p_descripcion text, p_extra jsonb
);
CREATE FUNCTION notion_migration.append_event(
    p_agenda_id uuid,
    p_tipo text,
    p_descripcion text DEFAULT '',
    p_extra jsonb DEFAULT NULL
)
RETURNS TABLE (like notion_migration.agendas)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    UPDATE notion_migration.agendas a
    SET timeline = COALESCE(a.timeline, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
            'ts', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'tipo', p_tipo,
            'desc', COALESCE(p_descripcion, '')
        ) || COALESCE(p_extra, '{}'::jsonb)
    )
    WHERE id = p_agenda_id
    RETURNING a.*;
END;
$$;

GRANT EXECUTE ON FUNCTION notion_migration.append_event(uuid, text, text, jsonb) TO authenticated;

-- ============================================================
-- 3. create_development_test
-- ============================================================
-- Auto-fill de numero (siguiente secuencial) + fecha (today).

DROP FUNCTION IF EXISTS notion_migration.create_development_test(
    p_agenda_id uuid, p_payload jsonb
);
CREATE FUNCTION notion_migration.create_development_test(
    p_agenda_id uuid,
    p_payload jsonb
)
RETURNS TABLE (like notion_migration.development_tests)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_next_numero int;
BEGIN
    -- Verificar agenda existe
    IF NOT EXISTS (
        SELECT 1 FROM notion_migration.agendas WHERE id = p_agenda_id
    ) THEN
        RAISE EXCEPTION 'Agenda no encontrada: %', p_agenda_id;
    END IF;

    -- Siguiente numero
    SELECT COALESCE(MAX(numero), 0) + 1 INTO v_next_numero
    FROM notion_migration.development_tests
    WHERE agenda_id = p_agenda_id;

    -- INSERT con auto-fill
    RETURN QUERY
    INSERT INTO notion_migration.development_tests (
        agenda_id, numero, fecha, estado, objetivo,
        receta_utilizada, modificaciones, resultado, observaciones
    )
    VALUES (
        p_agenda_id,
        v_next_numero,
        COALESCE((p_payload->>'fecha')::date, CURRENT_DATE),
        COALESCE(p_payload->>'estado', 'PENDIENTE'),
        p_payload->>'objetivo',
        p_payload->>'receta_utilizada',
        p_payload->>'modificaciones',
        p_payload->>'resultado',
        p_payload->>'observaciones'
    )
    RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION notion_migration.create_development_test(uuid, jsonb) TO authenticated;

-- ============================================================
-- 4. create_test_feedback
-- ============================================================
-- Auto-fill de fecha (today).

DROP FUNCTION IF EXISTS notion_migration.create_test_feedback(
    p_test_id uuid, p_payload jsonb
);
CREATE FUNCTION notion_migration.create_test_feedback(
    p_test_id uuid,
    p_payload jsonb
)
RETURNS TABLE (like notion_migration.test_feedback)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_mesa text;
BEGIN
    v_mesa := p_payload->>'mesa';
    IF v_mesa IS NULL OR v_mesa = '' THEN
        RAISE EXCEPTION 'mesa es obligatorio';
    END IF;

    -- Verificar test existe
    IF NOT EXISTS (
        SELECT 1 FROM notion_migration.development_tests WHERE id = p_test_id
    ) THEN
        RAISE EXCEPTION 'Prueba no encontrada: %', p_test_id;
    END IF;

    RETURN QUERY
    INSERT INTO notion_migration.test_feedback (
        test_id, mesa, num_personas, valoracion, criterio, observacion, fecha
    )
    VALUES (
        p_test_id,
        v_mesa,
        (p_payload->>'num_personas')::int,
        (p_payload->>'valoracion')::int,
        p_payload->>'criterio',
        p_payload->>'observacion',
        COALESCE((p_payload->>'fecha')::date, CURRENT_DATE)
    )
    RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION notion_migration.create_test_feedback(uuid, jsonb) TO authenticated;

-- ============================================================
-- 5. create_plating_proposal
-- ============================================================
-- Auto-fill de orden (siguiente para el catalogo).

DROP FUNCTION IF EXISTS notion_migration.create_plating_proposal(p_payload jsonb);
CREATE FUNCTION notion_migration.create_plating_proposal(p_payload jsonb)
RETURNS TABLE (like notion_migration.plating_proposals)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_catalogo_id uuid;
    v_next_orden int;
BEGIN
    v_catalogo_id := (p_payload->>'catalogo_id')::uuid;
    IF v_catalogo_id IS NULL THEN
        RAISE EXCEPTION 'catalogo_id es obligatorio';
    END IF;

    SELECT COALESCE(MAX(orden), 0) + 1 INTO v_next_orden
    FROM notion_migration.plating_proposals
    WHERE catalogo_id = v_catalogo_id;

    RETURN QUERY
    INSERT INTO notion_migration.plating_proposals (
        catalogo_id, orden, nombre, descripcion, vajilla_sugerida,
        razonamiento, contexto_usado, modelo_usado, estado
    )
    VALUES (
        v_catalogo_id,
        v_next_orden,
        p_payload->>'nombre',
        p_payload->>'descripcion',
        p_payload->>'vajilla_sugerida',
        p_payload->>'razonamiento',
        p_payload->>'contexto_usado',
        p_payload->>'modelo_usado',
        COALESCE(p_payload->>'estado', 'GENERADA')
    )
    RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION notion_migration.create_plating_proposal(jsonb) TO authenticated;

COMMIT;

-- ============================================================
-- Verificación post-aplicar
-- ============================================================
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'notion_migration'
--   AND routine_name IN (
--     'cambiar_estado_desarrollo',
--     'append_event',
--     'create_development_test',
--     'create_test_feedback',
--     'create_plating_proposal'
--   );
-- =============================================================