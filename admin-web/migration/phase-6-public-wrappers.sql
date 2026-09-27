-- =============================================================
-- FASE 6: Wrappers public.* de funciones notion_migration.*
-- =============================================================
--
-- Las tablas y RPCs viven en schema `notion_migration`.
-- PostgREST por defecto solo expone schema `public`.
-- Creamos vistas para tablas (FASE 5) y funciones wrapper para RPCs (esta fase).
--
-- POSTGREST_CONFIG: añadir "notion_migration" a db_schemas en dashboard
-- como alternativa a estos wrappers.
-- =============================================================

-- Pipeline

-- pipeline_por_estado()
CREATE OR REPLACE FUNCTION public.pipeline_por_estado()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = notion_migration AS $$
BEGIN RETURN (SELECT notion_migration.pipeline_por_estado()); END;
$$;

-- pendientes()
CREATE OR REPLACE FUNCTION public.pendientes()
RETURNS TABLE(id uuid, titulo text, estado_desarrollo text, prioridad text, dias_sin_actividad integer, receta_final boolean, objetivo text, fichas text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = notion_migration AS $$
BEGIN RETURN QUERY SELECT * FROM notion_migration.pendientes(); END;
$$;

-- cadencia_semana_actual()
CREATE OR REPLACE FUNCTION public.cadencia_semana_actual()
RETURNS json LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = notion_migration AS $$
BEGIN RETURN (SELECT notion_migration.cadencia_semana_actual()); END;
$$;

-- cambiar_estado_desarrollo(p_agenda_id, p_nuevo_estado, p_descripcion)
CREATE OR REPLACE FUNCTION public.cambiar_estado_desarrollo(p_agenda_id uuid, p_nuevo_estado text, p_descripcion text DEFAULT ''::text)
RETURNS TABLE(like notion_migration.agendas) LANGUAGE plpgsql SECURITY DEFINER SET search_path = notion_migration AS $$
BEGIN RETURN QUERY SELECT * FROM notion_migration.cambiar_estado_desarrollo(p_agenda_id, p_nuevo_estado, p_descripcion); END;
$$;

-- append_event(p_agenda_id, p_tipo, p_descripcion, p_extra)
CREATE OR REPLACE FUNCTION public.append_event(p_agenda_id uuid, p_tipo text, p_descripcion text DEFAULT ''::text, p_extra jsonb DEFAULT NULL::jsonb)
RETURNS TABLE(like notion_migration.agendas) LANGUAGE plpgsql SECURITY DEFINER SET search_path = notion_migration AS $$
BEGIN RETURN QUERY SELECT * FROM notion_migration.append_event(p_agenda_id, p_tipo, p_descripcion, p_extra); END;
$$;

-- convertir_idea_a_agenda(p_idea_id)
CREATE OR REPLACE FUNCTION public.convertir_idea_a_agenda(p_idea_id uuid)
RETURNS TABLE(already_exists boolean, agenda_id uuid, agenda_titulo text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = notion_migration AS $$
BEGIN RETURN QUERY SELECT * FROM notion_migration.convertir_idea_a_agenda(p_idea_id); END;
$$;

-- catalogos_agrupados()
CREATE OR REPLACE FUNCTION public.catalogos_agrupados()
RETURNS TABLE(categoria text, items json) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = notion_migration AS $$
SELECT * FROM notion_migration.catalogos_agrupados();
$$;

-- create_development_test(p_agenda_id, p_payload)
CREATE OR REPLACE FUNCTION public.create_development_test(p_agenda_id uuid, p_payload jsonb)
RETURNS TABLE(like notion_migration.development_tests) LANGUAGE plpgsql SECURITY DEFINER SET search_path = notion_migration AS $$
BEGIN RETURN QUERY SELECT * FROM notion_migration.create_development_test(p_agenda_id, p_payload); END;
$$;

-- create_plating_proposal(p_payload)
CREATE OR REPLACE FUNCTION public.create_plating_proposal(p_payload jsonb)
RETURNS TABLE(like notion_migration.plating_proposals) LANGUAGE plpgsql SECURITY DEFINER SET search_path = notion_migration AS $$
BEGIN RETURN QUERY SELECT * FROM notion_migration.create_plating_proposal(p_payload); END;
$$;

-- create_test_feedback(p_test_id, p_payload)
CREATE OR REPLACE FUNCTION public.create_test_feedback(p_test_id uuid, p_payload jsonb)
RETURNS TABLE(like notion_migration.test_feedback) LANGUAGE plpgsql SECURITY DEFINER SET search_path = notion_migration AS $$
BEGIN RETURN QUERY SELECT * FROM notion_migration.create_test_feedback(p_test_id, p_payload); END;
$$;

-- delete_image_with_cleanup(p_entidad, p_image_id)
CREATE OR REPLACE FUNCTION public.delete_image_with_cleanup(p_entidad text, p_image_id uuid)
RETURNS TABLE(deleted boolean, cleanup boolean, storage_path text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = notion_migration AS $$
BEGIN RETURN QUERY SELECT * FROM notion_migration.delete_image_with_cleanup(p_entidad, p_image_id); END;
$$;

-- Grants
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
