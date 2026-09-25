-- =============================================================
-- FASE 1: Row Level Security
-- =============================================================
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- (o via supabase CLI: `supabase db execute -f phase-1-rls.sql`)
--
-- IMPORTANTE:
--  - Este SQL es IDEMPOTENTE (puede ejecutarse varias veces).
--  - NO elimina datos, solo cambia permisos.
--  - Probá primero en staging (`notion-migration-staging`) y luego en prod.
--
-- DECISIONES:
--  - Todos los usuarios autenticados pueden leer/escribir las entidades
--    (es un admin tool interno — no es multi-tenant).
--  - Storage bucket sigue privado; acceso via signed URLs con RLS.
--  - service_role sigue siendo solo para Edge Functions / migraciones.

BEGIN;

-- ============================================================
-- 1. Grants a anon y authenticated
-- ============================================================
GRANT USAGE ON SCHEMA notion_migration TO anon, authenticated;

-- Tablas de entidades
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA notion_migration
    TO authenticated;

-- Para tablas que se creen después (futuras)
ALTER DEFAULT PRIVILEGES IN SCHEMA notion_migration
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- Sequences (para gen_random_uuid que ya está por defecto, pero por si acaso)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA notion_migration TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA notion_migration
    GRANT USAGE ON SEQUENCES TO authenticated;

-- ============================================================
-- 2. Habilitar RLS en TODAS las tablas
-- ============================================================
ALTER TABLE notion_migration.ideas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_migration.agendas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_migration.catalogos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_migration.idea_blocks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_migration.agenda_blocks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_migration.catalogo_blocks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_migration.idea_images      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_migration.agenda_images    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_migration.catalogo_images  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_migration.idea_agenda      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_migration.idea_catalogo    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_migration.agenda_catalogo  ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. Policies: cualquier authenticated puede todo
-- ============================================================
-- Admin tool interno — no es multi-tenant.
-- Si en el futuro hay roles, agregar WHERE auth.uid() IN (...) o
-- una tabla de miembros.

-- Helper: una policy por tabla con USING(true) + WITH CHECK(true)

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'ideas', 'agendas', 'catalogos',
      'idea_blocks', 'agenda_blocks', 'catalogo_blocks',
      'idea_images', 'agenda_images', 'catalogo_images',
      'idea_agenda', 'idea_catalogo', 'agenda_catalogo'
    ])
  LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS "auth_full_access" ON notion_migration.%I;
      CREATE POLICY "auth_full_access"
        ON notion_migration.%I
        FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true);
    ', t, t);
  END LOOP;
END $$;

-- ============================================================
-- 4. Settings: el anon NO debe ver API keys
-- ============================================================
ALTER TABLE notion_migration.app_settings ENABLE ROW LEVEL SECURITY;

-- Lectura: solo claves seguras (no API keys)
DROP POLICY IF EXISTS "auth_read_safe_settings" ON notion_migration.app_settings;
CREATE POLICY "auth_read_safe_settings"
  ON notion_migration.app_settings
  FOR SELECT
  TO authenticated
  USING (
    -- Bloquear lectura directa de secrets desde cliente
    key NOT IN ('minimax_api_key', 'openrouter_api_key', 'prompt_ficha_test')
  );

-- Escritura: cualquier authenticated puede cambiar settings
DROP POLICY IF EXISTS "auth_write_settings" ON notion_migration.app_settings;
CREATE POLICY "auth_write_settings"
  ON notion_migration.app_settings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 5. Tablas de desarrollo (verificar nombres reales primero)
-- ============================================================
-- Estas tablas pueden tener nombres diferentes. Aplicar solo si existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'notion_migration'
               AND table_name = 'dev_tests') THEN
    EXECUTE 'ALTER TABLE notion_migration.dev_tests ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "auth_full_access" ON notion_migration.dev_tests';
    EXECUTE 'CREATE POLICY "auth_full_access" ON notion_migration.dev_tests FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'notion_migration'
               AND table_name = 'dev_test_feedback') THEN
    EXECUTE 'ALTER TABLE notion_migration.dev_test_feedback ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "auth_full_access" ON notion_migration.dev_test_feedback';
    EXECUTE 'CREATE POLICY "auth_full_access" ON notion_migration.dev_test_feedback FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'notion_migration'
               AND table_name = 'dev_timeline_events') THEN
    EXECUTE 'ALTER TABLE notion_migration.dev_timeline_events ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "auth_full_access" ON notion_migration.dev_timeline_events';
    EXECUTE 'CREATE POLICY "auth_full_access" ON notion_migration.dev_timeline_events FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'notion_migration'
               AND table_name = 'cadencia_semanal') THEN
    EXECUTE 'ALTER TABLE notion_migration.cadencia_semanal ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "auth_full_access" ON notion_migration.cadencia_semanal';
    EXECUTE 'CREATE POLICY "auth_full_access" ON notion_migration.cadencia_semanal FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- ============================================================
-- 6. Storage bucket: RLS para mantener privado pero accesible
-- ============================================================
-- El bucket 'notion-migration-staging' sigue privado.
-- Las policies permiten a authenticated leer/escribir.

DROP POLICY IF EXISTS "auth_read_storage" ON storage.objects;
CREATE POLICY "auth_read_storage"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'notion-migration-staging');

DROP POLICY IF EXISTS "auth_insert_storage" ON storage.objects;
CREATE POLICY "auth_insert_storage"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'notion-migration-staging');

DROP POLICY IF EXISTS "auth_update_storage" ON storage.objects;
CREATE POLICY "auth_update_storage"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'notion-migration-staging');

DROP POLICY IF EXISTS "auth_delete_storage" ON storage.objects;
CREATE POLICY "auth_delete_storage"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'notion-migration-staging');

COMMIT;

-- ============================================================
-- Verificación post-aplicar
-- ============================================================
-- Correr después de aplicar para confirmar:
--
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'notion_migration'
-- ORDER BY tablename;
--
-- Esperado: rowsecurity = true en todas las tablas.
-- =============================================================