-- =============================================================
-- FASE 7b: Adjuntos de pruebas (imagenes + comentarios)
-- =============================================================
--
-- Cada prueba (development_tests) puede tener:
--   * 1+ imagenes propias (test_images), con dedup SHA-256
--   * 1+ comentarios cronologicos (test_comments)
--
-- Espejo de agenda_images + test_feedback pero para adjuntos directos
-- de la prueba (no del feedback de mesa).
--
-- Storage: bucket 'notion-migration-staging', path = tests/{test_id}/{sha}-{ext}
-- RLS: igual que el resto (TO authenticated).
-- Vistas public.* con security_invoker=false para lectura desde anon.
--
-- IMPORTANTE: este archivo NO usa BEGIN/COMMIT para evitar errores
-- de "syntax error" si el editor SQL corta la transaccion.
-- Cada statement es idempotente y se puede correr de a uno.
-- =============================================================


-- =============================================================
-- 1. Tablas
-- =============================================================

CREATE TABLE IF NOT EXISTS notion_migration.test_images (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id uuid NOT NULL REFERENCES notion_migration.development_tests(id) ON DELETE CASCADE,
    source_type text NOT NULL DEFAULT 'test_image',
    storage_bucket text NOT NULL DEFAULT 'notion-migration-staging',
    storage_path text NOT NULL,
    original_filename text,
    mime_type text,
    file_size_bytes bigint,
    sha256 text,
    position int,
    has_caption boolean DEFAULT false,
    caption text,
    migrated_at timestamptz DEFAULT now(),
    migration_run_id text DEFAULT 'manual_upload',
    UNIQUE (test_id, storage_path)
);

CREATE INDEX IF NOT EXISTS test_images_test_id_idx
  ON notion_migration.test_images (test_id, position);


CREATE TABLE IF NOT EXISTS notion_migration.test_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id uuid NOT NULL REFERENCES notion_migration.development_tests(id) ON DELETE CASCADE,
    autor text,
    texto text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS test_comments_test_id_idx
  ON notion_migration.test_comments (test_id, created_at DESC);


-- =============================================================
-- 2. Grants + RLS
-- =============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON notion_migration.test_images TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notion_migration.test_comments TO authenticated;

ALTER TABLE notion_migration.test_images   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_migration.test_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_full_access_test_images ON notion_migration.test_images;
CREATE POLICY auth_full_access_test_images
  ON notion_migration.test_images
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_full_access_test_comments ON notion_migration.test_comments;
CREATE POLICY auth_full_access_test_comments
  ON notion_migration.test_comments
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);


-- =============================================================
-- 3. Vistas public.* (lectura desde anon)
-- =============================================================

DROP VIEW IF EXISTS public.test_images CASCADE;
CREATE VIEW public.test_images WITH (security_barrier) AS
  SELECT * FROM notion_migration.test_images;
ALTER VIEW public.test_images SET (security_invoker = false);
GRANT SELECT ON public.test_images TO anon, authenticated;

DROP VIEW IF EXISTS public.test_comments CASCADE;
CREATE VIEW public.test_comments WITH (security_barrier) AS
  SELECT * FROM notion_migration.test_comments;
ALTER VIEW public.test_comments SET (security_invoker = false);
GRANT SELECT ON public.test_comments TO anon, authenticated;
