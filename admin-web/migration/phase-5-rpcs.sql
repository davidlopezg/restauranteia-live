-- =============================================================
-- FASE 5: RPC para delete de imagenes con cleanup
-- =============================================================
--
-- Replica la semantica de queries.py:delete_image_row + count_storage_path_refs,
-- pero con la diferencia importante: el backend original SOLO devolvia el flag
-- cleanup (nadie borraba el archivo fisico). Esta RPC devuelve el flag y el
-- cliente (que tiene permisos RLS en storage.objects) borra el archivo.

BEGIN;

DROP FUNCTION IF EXISTS notion_migration.delete_image_with_cleanup(
    p_entidad text, p_image_id uuid
);
CREATE FUNCTION notion_migration.delete_image_with_cleanup(
    p_entidad text,
    p_image_id uuid
)
RETURNS TABLE (
    deleted boolean,
    cleanup boolean,
    storage_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_table text;
    v_storage_path text;
    v_ref_count int;
BEGIN
    -- Mapear entidad -> tabla
    v_table := CASE p_entidad
        WHEN 'ideas' THEN 'notion_migration.idea_images'
        WHEN 'agendas' THEN 'notion_migration.agenda_images'
        WHEN 'catalogos' THEN 'notion_migration.catalogo_images'
        ELSE NULL
    END;
    IF v_table IS NULL THEN
        RAISE EXCEPTION 'Entidad invalida: %', p_entidad;
    END IF;

    -- DELETE fila y obtener storage_path en una sola operacion
    EXECUTE format(
        'DELETE FROM %I WHERE id = $1 RETURNING storage_path',
        replace(v_table, 'notion_migration.', '')
    )
    USING p_image_id
    INTO v_storage_path;

    IF v_storage_path IS NULL THEN
        RAISE EXCEPTION 'Imagen no encontrada: %', p_image_id;
    END IF;

    -- Contar referencias cross-table al mismo storage_path
    -- Si el conteo es 0 -> cleanup=true (cliente debe borrar el archivo fisico)
    SELECT COUNT(*) INTO v_ref_count
    FROM (
        SELECT 1 FROM notion_migration.idea_images WHERE storage_path = v_storage_path
        UNION ALL
        SELECT 1 FROM notion_migration.agenda_images WHERE storage_path = v_storage_path
        UNION ALL
        SELECT 1 FROM notion_migration.catalogo_images WHERE storage_path = v_storage_path
    ) refs;

    RETURN QUERY SELECT TRUE, (v_ref_count = 0), v_storage_path;
END;
$$;

GRANT EXECUTE ON FUNCTION notion_migration.delete_image_with_cleanup(text, uuid) TO authenticated;

COMMIT;

-- ============================================================
-- Verificación post-aplicar
-- ============================================================
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'notion_migration'
--   AND routine_name = 'delete_image_with_cleanup';
-- =============================================================