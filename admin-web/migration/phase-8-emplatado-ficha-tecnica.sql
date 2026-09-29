-- =============================================================
-- FASE 8 (AMPLIADA): Emplatado IA (imagen) + Ficha técnica
-- =============================================================
--
-- Esta migración añade el modelo de FICHA TÉCNICA de un producto del
-- catálogo, incluyendo:
--   * Columna receta_tecnica (jsonb) en catalogos — ESTRUCTURA NUEVA
--     (NO rompe receta_estructurada, que sigue siendo la receta "operativa"
--     del producto; receta_tecnica es la receta "presentable" para imprimir).
--   * FK imagen_emplatado_id y ficha_tecnica_id en catalogos.
--     Apuntan a catalogo_images con source_type='emplatado' / 'ficha_tecnica'.
--     Esto REUTILIZA todo el sistema de imágenes (dedup SHA-256, signed URLs,
--     ref-counting, RLS). NO se guardan URLs sueltas en columnas.
--   * Partial UNIQUE INDEX para garantizar 1:1 (1 emplatado + 1 ficha por
--     producto), evitando duplicados accidentales.
--
-- IMPORTANTE: este archivo NO usa BEGIN/COMMIT para evitar errores
-- de "syntax error" si el editor SQL corta la transaccion.
-- Cada statement es idempotente y se puede correr de a uno.
-- =============================================================


-- =============================================================
-- 1. catalogos: columnas nuevas
-- =============================================================

ALTER TABLE notion_migration.catalogos
    ADD COLUMN IF NOT EXISTS receta_tecnica jsonb;

ALTER TABLE notion_migration.catalogos
    ADD COLUMN IF NOT EXISTS imagen_emplatado_id uuid
    REFERENCES notion_migration.catalogo_images(id) ON DELETE SET NULL;

ALTER TABLE notion_migration.catalogos
    ADD COLUMN IF NOT EXISTS ficha_tecnica_id uuid
    REFERENCES notion_migration.catalogo_images(id) ON DELETE SET NULL;


-- =============================================================
-- 2. Indices y constraints (1:1 emplatado / ficha por producto)
-- =============================================================

CREATE INDEX IF NOT EXISTS catalogos_imagen_emplatado_id_idx
  ON notion_migration.catalogos (imagen_emplatado_id)
  WHERE imagen_emplatado_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS catalogos_ficha_tecnica_id_idx
  ON notion_migration.catalogos (ficha_tecnica_id)
  WHERE ficha_tecnica_id IS NOT NULL;

-- Garantiza maximo 1 imagen de emplatado y 1 ficha tecnica por catalogo.
-- Partial unique index: solo aplica a source_type restringidos.
CREATE UNIQUE INDEX IF NOT EXISTS catalogo_images_emplatado_uniq
  ON notion_migration.catalogo_images (catalogo_id)
  WHERE source_type = 'emplatado';

CREATE UNIQUE INDEX IF NOT EXISTS catalogo_images_ficha_tecnica_uniq
  ON notion_migration.catalogo_images (catalogo_id)
  WHERE source_type = 'ficha_tecnica';

-- Las columnas FK deben ser NOT NULL al final para garantizar integridad
-- (no se permite una ficha sin imagen padre). Ya tienen DEFAULT NULL por
-- compatibilidad con datos existentes; los inserts nuevos siempre las rellenan.


-- =============================================================
-- 3. Grants + RLS (las columnas se exponen via SELECT existentes)
-- =============================================================

-- Las columnas nuevas en catalogos heredan los grants/RLS ya existentes.
-- No se requieren policies adicionales porque el row-level filtering
-- sigue siendo por id (auth_full_access).

-- Vista public.catalogos debe refrescarse para incluir las columnas nuevas.
DROP VIEW IF EXISTS public.catalogos CASCADE;
CREATE OR REPLACE VIEW public.catalogos WITH (security_barrier) AS
  SELECT * FROM notion_migration.catalogos;
ALTER VIEW public.catalogos SET (security_invoker = false);
GRANT SELECT ON public.catalogos TO anon, authenticated;

-- Vista public.catalogo_images ya existe (FASE 5b) — sin cambios.