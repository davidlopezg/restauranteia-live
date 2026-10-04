-- =============================================================
-- FASE 9: Receta unificada + Ingredientes + Subrecetas + Alérgenos
-- =============================================================
--
-- OBJETIVO:
--   Unificar `receta_estructurada` (escandallo operativo) y `receta_tecnica`
--   (ficha presentable) en UNA sola columna `receta` (jsonb) con las 9
--   secciones del modelo profesional de restauración:
--       1. Identidad    2. Rendimiento  3. Ingredientes
--       4. Elaboración  5. Parámetros   6. Conservación
--       7. Servicio     8. Información  9. Economía
--
-- ADEMÁS introduce 3 tablas normalizadas (HUGE upgrade vs los JSON sueltos):
--   * ingredientes        — catálogo con coste, merma, alérgenos
--   * subrecetas          — recetas reutilizables como ingredientes
--   * alergenos           — catálogo maestro de alérgenos (Reglamento UE 1169/2011)
--
-- Y 3 tablas relación N:M:
--   * receta_ingredientes — receta ↔ ingrediente (cantidad, merma, orden)
--   * receta_subrecetas   — receta ↔ subreceta (cantidad)
--   * receta_alergenos    — receta ↔ alérgeno (heredado automático)
--
-- IMPORTANTE — BACKWARDS COMPATIBLE:
--   - receta_estructurada y receta_tecnica SE QUEDAN como legacy (no se borran).
--   - Las tablas nuevas se crean SIN FK dura a las viejas.
--   - El script de migración de datos (siguiente fase) convierte lo viejo
--     a la nueva estructura sin perder nada.
--   - Si la columna `receta` ya existe, no se duplica (IF NOT EXISTS).
--
-- EJECUCIÓN:
--   1. Dashboard Supabase → SQL Editor → New Query → pegar este archivo.
--   2. (O `supabase db execute -f phase-9-receta-unificada.sql`).
--   3. Verificar al final con los queries de la sección VERIFICACIÓN.
--
-- IDEMPOTENTE: cada statement es idempotente. Se puede correr varias veces.
-- =============================================================


-- =============================================================
-- 1. catalogos: columna nueva `receta` (jsonb)
-- =============================================================
-- Es la fuente única de verdad para la ficha completa de un producto.
-- Esquema validado por el backend (Pydantic) y el frontend (TypeScript).

ALTER TABLE notion_migration.catalogos
    ADD COLUMN IF NOT EXISTS receta jsonb;

COMMENT ON COLUMN notion_migration.catalogos.receta IS
    'Receta unificada con 9 secciones (ver PHASE_9_README.md). '
    'Reemplaza gradualmente a receta_estructurada y receta_tecnica.';


-- =============================================================
-- 2. ingredientes — catálogo normalizado
-- =============================================================
-- Antes los ingredientes eran texto suelto en `catalogos.ingredientes` o
-- dentro de receta_estructurada. Ahora tienen identidad propia:
--   - Coste medio (€/kg o €/L)
--   - Merma por defecto (% que se pierde en limpieza/cocción)
--   - Alérgenos[] (referencia lógica al catálogo de alérgenos)
--   - Proveedor (texto libre, sin tabla de proveedores por ahora)
--
-- Esto habilita:
--   - Sustituir un ingrediente en N recetas y recalcular coste automáticamente
--   - Detectar alérgenos heredados en cualquier receta
--   - Calcular escandallos por proveedor
--   - Inventario (consumo histórico)

CREATE TABLE IF NOT EXISTS notion_migration.ingredientes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre text NOT NULL,
    -- Categoría culinaria (ver constraint abajo). NULL = sin categorizar.
    categoria text,
    -- Coste medio en €/unidad_compra. NULL = sin precio conocido.
    coste_medio numeric(10, 4),
    -- Unidad en la que se compra: 'kg', 'L', 'ud', 'docena'.
    unidad_compra text NOT NULL DEFAULT 'kg'
        CHECK (unidad_compra IN ('kg', 'g', 'L', 'ml', 'ud', 'docena')),
    -- Merma por defecto en % (0-100). Es el % que se pierde en limpieza/cocción.
    -- Ej: alcachofa tiene merma 35% (se tira mucho), aceite 0%.
    merma_default_pct numeric(5, 2) NOT NULL DEFAULT 0
        CHECK (merma_default_pct >= 0 AND merma_default_pct <= 100),
    -- Proveedor (texto libre). En el futuro será FK a tabla proveedores.
    proveedor text,
    -- Códigos de alérgenos (referencia lógica a la tabla alergenos.codigo).
    -- Es denormalizado a propósito: la tabla relacion se llena después si
    -- se requiere trazabilidad individual. Aquí basta con los códigos.
    alergenos text[] NOT NULL DEFAULT '{}',
    -- Dietas en las que el ingrediente es válido: vegetariana, vegana, sin_gluten.
    -- Vector para filtro rápido en frontend.
    dietas_validas text[] NOT NULL DEFAULT '{}',
    notas text,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (nombre)
);

CREATE INDEX IF NOT EXISTS ingredientes_categoria_idx
    ON notion_migration.ingredientes (categoria)
    WHERE categoria IS NOT NULL;

CREATE INDEX IF NOT EXISTS ingredientes_activo_idx
    ON notion_migration.ingredientes (activo)
    WHERE activo = true;

CREATE INDEX IF NOT EXISTS ingredientes_alergenos_gin_idx
    ON notion_migration.ingredientes USING gin (alergenos);

-- Búsqueda rápida por nombre (ILIKE)
CREATE INDEX IF NOT EXISTS ingredientes_nombre_trgm_idx
    ON notion_migration.ingredientes (lower(nombre) text_pattern_ops);

COMMENT ON TABLE notion_migration.ingredientes IS
    'Catálogo normalizado de ingredientes. Reemplaza los strings sueltos en '
    'catalogos.receta.ingredientes[].nombre. Permite cálculo de coste y '
    'detección de alérgenos.';


-- =============================================================
-- 3. alergenos — catálogo maestro
-- =============================================================
-- Basado en Reglamento (UE) 1169/2011 sobre información alimentaria facilitada
-- al consumidor. 14 alérgenos de declaración obligatoria.
--
-- codigo es el identificador estable (se usa en text[] de ingredientes).
-- nombre es lo que se muestra en UI.
-- icono es un emoji (🥛, 🌾) o nombre de icono (lucide: 'wheat', 'milk').

CREATE TABLE IF NOT EXISTS notion_migration.alergenos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Código estable en snake_case. Se usa como referencia en ingredientes.alergenos[].
    codigo text NOT NULL UNIQUE
        CHECK (codigo ~ '^[a-z_]+$'),
    -- Nombre legible en castellano (mostrado en UI y ficha técnica).
    nombre text NOT NULL,
    icono text NOT NULL DEFAULT '⚠️',
    descripcion text,
    -- Algunos alérgenos son "trazas posibles" por contaminación cruzada.
    -- Por ahora el flag sirve para marcar ingredientes que SIEMPRE contienen
    -- el alérgeno vs los que PUEDEN contenerlo por procesado.
    obligatorio_ue boolean NOT NULL DEFAULT true,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (codigo)
);

CREATE INDEX IF NOT EXISTS alergenos_activo_idx
    ON notion_migration.alergenos (activo)
    WHERE activo = true;

COMMENT ON TABLE notion_migration.alergenos IS
    'Catálogo de alérgenos (Reglamento UE 1169/2011). 14 alérgenos de '
    'declaración obligatoria. Codigo es el identificador estable en '
    'snake_case (ej: gluten, lacteos, frutos_secos).';


-- =============================================================
-- 4. subrecetas — recetas reutilizables como ingredientes
-- =============================================================
-- Una subreceta es una receta completa que se usa como ingrediente de
-- otras recetas. Ejemplo:
--     PIZZA ALCACHOFA
--       ├── Masa pizza (subreceta)
--       ├── Salsa tomate (subreceta)
--       └── Alcachofa escabechada (subreceta)
--
-- `receta_origen_id` apunta al catalogo del que sale esta subreceta.
-- Una subreceta puede ser "huérfana" (NULL) si la defines sin depender
-- de un catálogo concreto.

CREATE TABLE IF NOT EXISTS notion_migration.subrecetas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre text NOT NULL,
    descripcion text,
    -- Si es NULL, es una subreceta "huérfana" (no parte de la carta).
    receta_origen_id uuid
        REFERENCES notion_migration.catalogos(id) ON DELETE SET NULL,
    -- Cantidad que produce esta subreceta (ej: 1 L de salsa, 500 g de masa).
    -- Sirve para escalar: si necesitas 2 L, usas 2x esta receta.
    cantidad_producida numeric(10, 3),
    unidad_producida text
        CHECK (unidad_producida IN ('kg', 'g', 'L', 'ml', 'ud', 'raciones')),
    -- Coste total de producir esta subreceta (calculado o manual).
    coste_total numeric(10, 4),
    activo boolean NOT NULL DEFAULT true,
    notas text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (nombre)
);

CREATE INDEX IF NOT EXISTS subrecetas_receta_origen_idx
    ON notion_migration.subrecetas (receta_origen_id)
    WHERE receta_origen_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subrecetas_activo_idx
    ON notion_migration.subrecetas (activo)
    WHERE activo = true;

COMMENT ON TABLE notion_migration.subrecetas IS
    'Recetas reutilizables. Una subreceta (salsa, masa, fondo) puede ser '
    'ingrediente de N recetas padre. receta_origen_id apunta al catálogo '
    'del que sale (puede ser NULL si es huérfana).';


-- =============================================================
-- 5. receta_ingredientes — N:M receta ↔ ingrediente
-- =============================================================
-- Conecta la receta unificada (catalogos.receta) con el catálogo de
-- ingredientes. Permite:
--   - Calcular coste real (cantidad * coste_medio del ingrediente)
--   - Detectar alérgenos heredados
--   - Sustituir un ingrediente en todas las recetas de una vez
--
-- merma_pct override: si la receta tiene merma distinta del ingrediente
-- (ej: el ingrediente merma_default=10% pero aquí lo pelamos especialmente
-- y la merma real es 20%). Si es NULL, se usa merma_default del ingrediente.
--
-- orden: para preservar el orden visual en UI (los ingredientes en la
-- misma posición que en `receta.ingredientes[]` del JSON).

CREATE TABLE IF NOT EXISTS notion_migration.receta_ingredientes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    receta_id uuid NOT NULL
        REFERENCES notion_migration.catalogos(id) ON DELETE CASCADE,
    ingrediente_id uuid NOT NULL
        REFERENCES notion_migration.ingredientes(id) ON DELETE RESTRICT,
    -- Cantidad bruta (antes de aplicar merma).
    cantidad_bruta numeric(10, 3) NOT NULL,
    -- Unidad de la cantidad_bruta (puede ser distinta de unidad_compra del
    -- ingrediente: ej: ingrediente se compra en kg, receta lo expresa en g).
    unidad text NOT NULL
        CHECK (unidad IN ('kg', 'g', 'L', 'ml', 'ud')),
    -- Override de merma para esta receta concreta. NULL = usar merma_default.
    merma_pct_override numeric(5, 2)
        CHECK (merma_pct_override IS NULL OR (merma_pct_override >= 0 AND merma_pct_override <= 100)),
    notas text,
    orden int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (receta_id, ingrediente_id)
);

CREATE INDEX IF NOT EXISTS receta_ingredientes_receta_idx
    ON notion_migration.receta_ingredientes (receta_id);

CREATE INDEX IF NOT EXISTS receta_ingredientes_ingrediente_idx
    ON notion_migration.receta_ingredientes (ingrediente_id);

COMMENT ON TABLE notion_migration.receta_ingredientes IS
    'Relación N:M receta ↔ ingrediente. cantidad_bruta es lo que entra '
    'a cocina (antes de merma). merma_pct_override anula merma_default '
    'del ingrediente solo para esta receta.';


-- =============================================================
-- 6. receta_subrecetas — N:M receta ↔ subreceta
-- =============================================================
-- Pizza Alcachofa contiene Salsa de Tomate (subreceta) 200g.

CREATE TABLE IF NOT EXISTS notion_migration.receta_subrecetas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    receta_parent_id uuid NOT NULL
        REFERENCES notion_migration.catalogos(id) ON DELETE CASCADE,
    subreceta_id uuid NOT NULL
        REFERENCES notion_migration.subrecetas(id) ON DELETE RESTRICT,
    cantidad numeric(10, 3) NOT NULL,
    unidad text NOT NULL
        CHECK (unidad IN ('kg', 'g', 'L', 'ml', 'ud')),
    notas text,
    orden int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (receta_parent_id, subreceta_id)
);

CREATE INDEX IF NOT EXISTS receta_subrecetas_parent_idx
    ON notion_migration.receta_subrecetas (receta_parent_id);

CREATE INDEX IF NOT EXISTS receta_subrecetas_subreceta_idx
    ON notion_migration.receta_subrecetas (subreceta_id);

COMMENT ON TABLE notion_migration.receta_subrecetas IS
    'Relación N:M receta ↔ subreceta. Una receta puede contener N '
    'subrecetas (ej: pizza contiene masa + salsa + topping).';


-- =============================================================
-- 7. receta_alergenos — N:M receta ↔ alérgeno (heredado)
-- =============================================================
-- Los alérgenos de una receta se calculan automáticamente como la
-- UNIÓN de:
--   - alérgenos de los ingredientes (receta_ingredientes → ingredientes.alergenos)
--   - alérgenos de las subrecetas contenidas (receta_subrecetas → ...)
--
-- Esta tabla cachea el resultado para queries rápidas ("qué recetas
-- contienen gluten"). Se puede regenerar con un RPC.
--
-- origen indica cómo se incorporó el alérgeno:
--   - 'heredado_ingrediente'  → desde ingredientes.alergenos
--   - 'heredado_subreceta'    → desde subrecetas (recursivo)
--   - 'manual'                → añadido a mano (ej: "traza de frutos secos
--                               por compartir línea de procesado")

CREATE TABLE IF NOT EXISTS notion_migration.receta_alergenos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    receta_id uuid NOT NULL
        REFERENCES notion_migration.catalogos(id) ON DELETE CASCADE,
    alergeno_id uuid NOT NULL
        REFERENCES notion_migration.alergenos(id) ON DELETE RESTRICT,
    origen text NOT NULL DEFAULT 'heredado_ingrediente'
        CHECK (origen IN ('heredado_ingrediente', 'heredado_subreceta', 'manual')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (receta_id, alergeno_id)
);

CREATE INDEX IF NOT EXISTS receta_alergenos_receta_idx
    ON notion_migration.receta_alergenos (receta_id);

CREATE INDEX IF NOT EXISTS receta_alergenos_alergeno_idx
    ON notion_migration.receta_alergenos (alergeno_id);

COMMENT ON TABLE notion_migration.receta_alergenos IS
    'Alérgenos presentes en cada receta (cache). Se recalcula automáticamente '
    'como unión de ingredientes + subrecetas. origen indica la fuente.';


-- =============================================================
-- 8. Grants + RLS (igual que el resto del proyecto)
-- =============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON notion_migration.ingredientes        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notion_migration.alergenos          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notion_migration.subrecetas         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notion_migration.receta_ingredientes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notion_migration.receta_subrecetas   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notion_migration.receta_alergenos    TO authenticated;

-- Default privileges para tablas futuras (por si añades tablas nuevas)
ALTER DEFAULT PRIVILEGES IN SCHEMA notion_migration
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER TABLE notion_migration.ingredientes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_migration.alergenos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_migration.subrecetas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_migration.receta_ingredientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_migration.receta_subrecetas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_migration.receta_alergenos    ENABLE ROW LEVEL SECURITY;

-- Policy: full access para authenticated (admin tool interno)
DROP POLICY IF EXISTS auth_full_access_ingredientes ON notion_migration.ingredientes;
CREATE POLICY auth_full_access_ingredientes
    ON notion_migration.ingredientes
    FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_full_access_alergenos ON notion_migration.alergenos;
CREATE POLICY auth_full_access_alergenos
    ON notion_migration.alergenos
    FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_full_access_subrecetas ON notion_migration.subrecetas;
CREATE POLICY auth_full_access_subrecetas
    ON notion_migration.subrecetas
    FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_full_access_receta_ingredientes ON notion_migration.receta_ingredientes;
CREATE POLICY auth_full_access_receta_ingredientes
    ON notion_migration.receta_ingredientes
    FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_full_access_receta_subrecetas ON notion_migration.receta_subrecetas;
CREATE POLICY auth_full_access_receta_subrecetas
    ON notion_migration.receta_subrecetas
    FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_full_access_receta_alergenos ON notion_migration.receta_alergenos;
CREATE POLICY auth_full_access_receta_alergenos
    ON notion_migration.receta_alergenos
    FOR ALL TO authenticated
    USING (true) WITH CHECK (true);


-- =============================================================
-- 9. Vistas public.* (lectura desde anon)
-- =============================================================

DROP VIEW IF EXISTS public.ingredientes CASCADE;
CREATE VIEW public.ingredientes WITH (security_barrier) AS
    SELECT * FROM notion_migration.ingredientes;
ALTER VIEW public.ingredientes SET (security_invoker = false);
GRANT SELECT ON public.ingredientes TO anon, authenticated;

DROP VIEW IF EXISTS public.alergenos CASCADE;
CREATE VIEW public.alergenos WITH (security_barrier) AS
    SELECT * FROM notion_migration.alergenos;
ALTER VIEW public.alergenos SET (security_invoker = false);
GRANT SELECT ON public.alergenos TO anon, authenticated;

DROP VIEW IF EXISTS public.subrecetas CASCADE;
CREATE VIEW public.subrecetas WITH (security_barrier) AS
    SELECT * FROM notion_migration.subrecetas;
ALTER VIEW public.subrecetas SET (security_invoker = false);
GRANT SELECT ON public.subrecetas TO anon, authenticated;

DROP VIEW IF EXISTS public.receta_ingredientes CASCADE;
CREATE VIEW public.receta_ingredientes WITH (security_barrier) AS
    SELECT * FROM notion_migration.receta_ingredientes;
ALTER VIEW public.receta_ingredientes SET (security_invoker = false);
GRANT SELECT ON public.receta_ingredientes TO anon, authenticated;

DROP VIEW IF EXISTS public.receta_subrecetas CASCADE;
CREATE VIEW public.receta_subrecetas WITH (security_barrier) AS
    SELECT * FROM notion_migration.receta_subrecetas;
ALTER VIEW public.receta_subrecetas SET (security_invoker = false);
GRANT SELECT ON public.receta_subrecetas TO anon, authenticated;

DROP VIEW IF EXISTS public.receta_alergenos CASCADE;
CREATE VIEW public.receta_alergenos WITH (security_barrier) AS
    SELECT * FROM notion_migration.receta_alergenos;
ALTER VIEW public.receta_alergenos SET (security_invoker = false);
GRANT SELECT ON public.receta_alergenos TO anon, authenticated;


-- =============================================================
-- 10. Seed: 14 alérgenos del Reglamento UE 1169/2011
-- =============================================================
-- Solo se insertan si la tabla está vacía (IF NOT EXISTS por código).

INSERT INTO notion_migration.alergenos (codigo, nombre, icono, descripcion)
SELECT * FROM (VALUES
    ('cereales_gluten',  'Cereales con gluten',     '🌾', 'Trigo, centeno, cebada, avena, espelta, kamut y derivados.'),
    ('crustaceos',       'Crustáceos',              '🦐', 'Gambas, langostinos, cangrejos y similares.'),
    ('huevos',           'Huevos',                  '🥚', 'Huevos y derivados.'),
    ('pescado',          'Pescado',                 '🐟', 'Pescados y derivados.'),
    ('cacahuetes',       'Cacahuetes',              '🥜', 'Cacahuetes y derivados.'),
    ('soja',             'Soja',                    '🫘', 'Soja y derivados.'),
    ('lacteos',          'Lácteos',                 '🥛', 'Leche y derivados (incluye lactosa).'),
    ('frutos_secos',     'Frutos secos',            '🌰', 'Almendras, avellanas, nueces, anacardos, pistachos, etc.'),
    ('apio',             'Apio',                    '🥬', 'Apio y derivados.'),
    ('mostaza',          'Mostaza',                 '🟡', 'Mostaza y derivados.'),
    ('sesamo',           'Sésamo',                  '⚪', 'Semillas de sésamo y derivados.'),
    ('sulfitos',         'Sulfitos y SO₂',          '🍷', 'Concentración > 10 mg/kg o 10 mg/L.'),
    ('altramuces',       'Altramuces',              '🫛', 'Altramuces y derivados.'),
    ('moluscos',         'Moluscos',                '🐙', 'Mejillones, almejas, ostras, calamares y similares.')
) AS v(codigo, nombre, icono, descripcion)
WHERE NOT EXISTS (SELECT 1 FROM notion_migration.alergenos LIMIT 1);


-- =============================================================
-- 11. Trigger: updated_at automático en ingredientes y subrecetas
-- =============================================================

CREATE OR REPLACE FUNCTION notion_migration.touch_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ingredientes_touch_updated_at ON notion_migration.ingredientes;
CREATE TRIGGER ingredientes_touch_updated_at
    BEFORE UPDATE ON notion_migration.ingredientes
    FOR EACH ROW EXECUTE FUNCTION notion_migration.touch_updated_at();

DROP TRIGGER IF EXISTS subrecetas_touch_updated_at ON notion_migration.subrecetas;
CREATE TRIGGER subrecetas_touch_updated_at
    BEFORE UPDATE ON notion_migration.subrecetas
    FOR EACH ROW EXECUTE FUNCTION notion_migration.touch_updated_at();


-- =============================================================
-- VERIFICACIÓN POST-APLICAR
-- =============================================================
-- Correr estos queries para confirmar que todo se aplicó correctamente.
-- Esperado 1: 4 tablas de catálogo + 3 tablas de relación = 7 tablas nuevas.
--
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'notion_migration'
--     AND table_name IN (
--       'ingredientes', 'alergenos', 'subrecetas',
--       'receta_ingredientes', 'receta_subrecetas', 'receta_alergenos'
--     )
--   ORDER BY table_name;
--
-- Esperado 2: 14 filas en alergenos.
--
--   SELECT COUNT(*) FROM notion_migration.alergenos;
--
-- Esperado 3: La columna receta existe en catalogos.
--
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'notion_migration'
--     AND table_name = 'catalogos'
--     AND column_name = 'receta';
--
-- Esperado 4: RLS habilitado en las 6 tablas nuevas.
--
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'notion_migration'
--     AND tablename IN (
--       'ingredientes', 'alergenos', 'subrecetas',
--       'receta_ingredientes', 'receta_subrecetas', 'receta_alergenos'
--     );
--
-- Esperado 5: Las 6 vistas public.* existen.
--
--   SELECT table_name FROM information_schema.views
--   WHERE table_schema = 'public'
--     AND table_name IN (
--       'ingredientes', 'alergenos', 'subrecetas',
--       'receta_ingredientes', 'receta_subrecetas', 'receta_alergenos'
--     );
-- =============================================================