-- =============================================================
-- FASE 5b: Vistas public.* de tablas notion_migration
-- =============================================================
--
-- Crea vistas en schema public para cada tabla en notion_migration.
-- Las vistas usan SECURITY INVOKER=false (equivalente a SECURITY DEFINER)
-- para que los usuarios anon/authenticated puedan leer datos sin RLS.
-- =============================================================

DROP VIEW IF EXISTS public.agenda_blocks CASCADE;
CREATE OR REPLACE VIEW public.agenda_blocks WITH (security_barrier) AS SELECT * FROM notion_migration.agenda_blocks;
ALTER VIEW public.agenda_blocks SET (security_invoker = false);
GRANT SELECT ON public.agenda_blocks TO anon, authenticated;

DROP VIEW IF EXISTS public.agenda_catalogo CASCADE;
CREATE OR REPLACE VIEW public.agenda_catalogo WITH (security_barrier) AS SELECT * FROM notion_migration.agenda_catalogo;
ALTER VIEW public.agenda_catalogo SET (security_invoker = false);
GRANT SELECT ON public.agenda_catalogo TO anon, authenticated;

DROP VIEW IF EXISTS public.agenda_images CASCADE;
CREATE OR REPLACE VIEW public.agenda_images WITH (security_barrier) AS SELECT * FROM notion_migration.agenda_images;
ALTER VIEW public.agenda_images SET (security_invoker = false);
GRANT SELECT ON public.agenda_images TO anon, authenticated;

DROP VIEW IF EXISTS public.agendas CASCADE;
CREATE OR REPLACE VIEW public.agendas WITH (security_barrier) AS SELECT * FROM notion_migration.agendas;
ALTER VIEW public.agendas SET (security_invoker = false);
GRANT SELECT ON public.agendas TO anon, authenticated;

DROP VIEW IF EXISTS public.app_settings CASCADE;
CREATE OR REPLACE VIEW public.app_settings WITH (security_barrier) AS SELECT * FROM notion_migration.app_settings;
ALTER VIEW public.app_settings SET (security_invoker = false);
GRANT SELECT ON public.app_settings TO anon, authenticated;

DROP VIEW IF EXISTS public.catalogo_blocks CASCADE;
CREATE OR REPLACE VIEW public.catalogo_blocks WITH (security_barrier) AS SELECT * FROM notion_migration.catalogo_blocks;
ALTER VIEW public.catalogo_blocks SET (security_invoker = false);
GRANT SELECT ON public.catalogo_blocks TO anon, authenticated;

DROP VIEW IF EXISTS public.catalogo_images CASCADE;
CREATE OR REPLACE VIEW public.catalogo_images WITH (security_barrier) AS SELECT * FROM notion_migration.catalogo_images;
ALTER VIEW public.catalogo_images SET (security_invoker = false);
GRANT SELECT ON public.catalogo_images TO anon, authenticated;

DROP VIEW IF EXISTS public.catalogos CASCADE;
CREATE OR REPLACE VIEW public.catalogos WITH (security_barrier) AS SELECT * FROM notion_migration.catalogos;
ALTER VIEW public.catalogos SET (security_invoker = false);
GRANT SELECT ON public.catalogos TO anon, authenticated;

DROP VIEW IF EXISTS public.development_tests CASCADE;
CREATE OR REPLACE VIEW public.development_tests WITH (security_barrier) AS SELECT * FROM notion_migration.development_tests;
ALTER VIEW public.development_tests SET (security_invoker = false);
GRANT SELECT ON public.development_tests TO anon, authenticated;

DROP VIEW IF EXISTS public.idea_agenda CASCADE;
CREATE OR REPLACE VIEW public.idea_agenda WITH (security_barrier) AS SELECT * FROM notion_migration.idea_agenda;
ALTER VIEW public.idea_agenda SET (security_invoker = false);
GRANT SELECT ON public.idea_agenda TO anon, authenticated;

DROP VIEW IF EXISTS public.idea_blocks CASCADE;
CREATE OR REPLACE VIEW public.idea_blocks WITH (security_barrier) AS SELECT * FROM notion_migration.idea_blocks;
ALTER VIEW public.idea_blocks SET (security_invoker = false);
GRANT SELECT ON public.idea_blocks TO anon, authenticated;

DROP VIEW IF EXISTS public.idea_catalogo CASCADE;
CREATE OR REPLACE VIEW public.idea_catalogo WITH (security_barrier) AS SELECT * FROM notion_migration.idea_catalogo;
ALTER VIEW public.idea_catalogo SET (security_invoker = false);
GRANT SELECT ON public.idea_catalogo TO anon, authenticated;

DROP VIEW IF EXISTS public.idea_images CASCADE;
CREATE OR REPLACE VIEW public.idea_images WITH (security_barrier) AS SELECT * FROM notion_migration.idea_images;
ALTER VIEW public.idea_images SET (security_invoker = false);
GRANT SELECT ON public.idea_images TO anon, authenticated;

DROP VIEW IF EXISTS public.ideas CASCADE;
CREATE OR REPLACE VIEW public.ideas WITH (security_barrier) AS SELECT * FROM notion_migration.ideas;
ALTER VIEW public.ideas SET (security_invoker = false);
GRANT SELECT ON public.ideas TO anon, authenticated;

DROP VIEW IF EXISTS public.migration_issues CASCADE;
CREATE OR REPLACE VIEW public.migration_issues WITH (security_barrier) AS SELECT * FROM notion_migration.migration_issues;
ALTER VIEW public.migration_issues SET (security_invoker = false);
GRANT SELECT ON public.migration_issues TO anon, authenticated;

DROP VIEW IF EXISTS public.migration_manifest CASCADE;
CREATE OR REPLACE VIEW public.migration_manifest WITH (security_barrier) AS SELECT * FROM notion_migration.migration_manifest;
ALTER VIEW public.migration_manifest SET (security_invoker = false);
GRANT SELECT ON public.migration_manifest TO anon, authenticated;

DROP VIEW IF EXISTS public.migration_map CASCADE;
CREATE OR REPLACE VIEW public.migration_map WITH (security_barrier) AS SELECT * FROM notion_migration.migration_map;
ALTER VIEW public.migration_map SET (security_invoker = false);
GRANT SELECT ON public.migration_map TO anon, authenticated;

DROP VIEW IF EXISTS public.migration_runs CASCADE;
CREATE OR REPLACE VIEW public.migration_runs WITH (security_barrier) AS SELECT * FROM notion_migration.migration_runs;
ALTER VIEW public.migration_runs SET (security_invoker = false);
GRANT SELECT ON public.migration_runs TO anon, authenticated;

DROP VIEW IF EXISTS public.plating_proposals CASCADE;
CREATE OR REPLACE VIEW public.plating_proposals WITH (security_barrier) AS SELECT * FROM notion_migration.plating_proposals;
ALTER VIEW public.plating_proposals SET (security_invoker = false);
GRANT SELECT ON public.plating_proposals TO anon, authenticated;

DROP VIEW IF EXISTS public.test_feedback CASCADE;
CREATE OR REPLACE VIEW public.test_feedback WITH (security_barrier) AS SELECT * FROM notion_migration.test_feedback;
ALTER VIEW public.test_feedback SET (security_invoker = false);
GRANT SELECT ON public.test_feedback TO anon, authenticated;

DROP VIEW IF EXISTS public.ware CASCADE;
CREATE OR REPLACE VIEW public.ware WITH (security_barrier) AS SELECT * FROM notion_migration.ware;
ALTER VIEW public.ware SET (security_invoker = false);
GRANT SELECT ON public.ware TO anon, authenticated;

DROP VIEW IF EXISTS public.weekly_objectives CASCADE;
CREATE OR REPLACE VIEW public.weekly_objectives WITH (security_barrier) AS SELECT * FROM notion_migration.weekly_objectives;
ALTER VIEW public.weekly_objectives SET (security_invoker = false);
GRANT SELECT ON public.weekly_objectives TO anon, authenticated;

