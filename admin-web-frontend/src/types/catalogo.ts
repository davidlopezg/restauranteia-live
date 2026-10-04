// Tipos del dominio Catálogo. Espejo de admin-web/backend/models.py + queries.py.
// FASE 9: incluye la receta unificada con 9 secciones + entidades normalizadas.

// === Tipos de la receta unificada (catalogos.receta jsonb) ===

export type UnidadMedida = "kg" | "g" | "L" | "ml" | "ud" | "docena";
export type EstadoReceta = "borrador" | "activa" | "archivada";

export interface IngredienteReceta {
    nombre: string;
    cantidad_bruta: number | null;
    unidad: UnidadMedida;
    porcentaje: number | null;
    merma_pct: number | null;
    cantidad_neta: number | null;
    coste_unitario: number | null;
    coste_linea: number | null;
    ingrediente_id: string | null;
    fuente?: "receta_tecnica" | "receta_estructurada" | "manual";
}

export interface PuntoCriticoAPPCC {
    paso: number;
    motivo: string;
    accion: string;
}

export interface IdentidadReceta {
    subcategoria: string | null;
    descripcion: string | null;
    estado_receta: EstadoReceta;
    version: number;
}

export interface RendimientoReceta {
    rendimiento_total: number | null;
    unidad_rendimiento: UnidadMedida | null;
    raciones: number | null;
    peso_por_racion_g: number | null;
    volumen_por_racion_ml: number | null;
}

export interface ElaboracionReceta {
    preparacion_previa: string;
    pasos: string[];
    puntos_criticos: PuntoCriticoAPPCC[];
}

export interface ParametrosReceta {
    tiempo_preparacion_min: number | null;
    tiempo_coccion_min: number | null;
    temperatura_c: number | null;
    equipamiento: string[];
    tecnica: string;
}

export interface ConservacionReceta {
    metodo: string | null;
    temperatura_c: { min: number; max: number } | null;
    vida_util_h: number | null;
    envase: string | null;
    etiquetado: string | null;
    regeneracion: string | null;
}

export interface ServicioReceta {
    porcion_g: number | null;
    emplatado: string | null;
    guarnicion: string | null;
    salsa: string | null;
    acabado: string | null;
}

export interface InformacionReceta {
    alergenos: string[];
    dietas: string[];
    observaciones: string;
    advertencias: string;
}

export interface EconomiaReceta {
    coste_total: number | null;
    coste_racion: number | null;
    pvp: number | null;
    food_cost_pct: number | null;
    margen_bruto: number | null;
    margen_pct: number | null;
}

export interface MetaReceta {
    fuente_origen?: string;
    migrated_at?: string;
    receta_estructurada_legacy?: unknown;
    receta_tecnica_legacy?: unknown;
    categorias_legacy?: string[];
}

export interface Receta {
    version: 2;
    identidad: IdentidadReceta;
    rendimiento: RendimientoReceta;
    ingredientes: IngredienteReceta[];
    elaboracion: ElaboracionReceta;
    parametros: ParametrosReceta;
    conservacion: ConservacionReceta;
    servicio: ServicioReceta;
    informacion: InformacionReceta;
    economia: EconomiaReceta;
    meta?: MetaReceta;
}

// === Tipos de entidades normalizadas ===

export interface Ingrediente {
    id: string;
    nombre: string;
    categoria: string | null;
    coste_medio: number | null;
    unidad_compra: UnidadMedida;
    merma_default_pct: number;
    proveedor: string | null;
    alergenos: string[];
    dietas_validas: string[];
    notas: string | null;
    activo: boolean;
    created_at: string;
    updated_at: string;
}

export interface Alergeno {
    id: string;
    codigo: string;
    nombre: string;
    icono: string;
    descripcion: string | null;
    obligatorio_ue: boolean;
    activo: boolean;
    created_at: string;
}

export interface Subreceta {
    id: string;
    nombre: string;
    descripcion: string | null;
    receta_origen_id: string | null;
    cantidad_producida: number | null;
    unidad_producida: UnidadMedida | null;
    coste_total: number | null;
    activo: boolean;
    notas: string | null;
    created_at: string;
    updated_at: string;
}

export interface RecetaIngrediente {
    id: string;
    receta_id: string;
    ingrediente_id: string;
    cantidad_bruta: number;
    unidad: UnidadMedida;
    merma_pct_override: number | null;
    notas: string | null;
    orden: number;
    created_at: string;
}

export interface RecetaAlergeno {
    id: string;
    receta_id: string;
    alergeno_id: string;
    origen: "heredado_ingrediente" | "heredado_subreceta" | "manual";
    created_at: string;
}

// === Catálogo (con receta unificada) ===

export interface Catalogo {
    id: string;
    notion_id: string;
    titulo: string;
    orden: number | null;
    precio: number | null;
    anio: string | null;
    estado: string | null;
    categorias: string[] | null;
    seleccionada: boolean | null;
    ingredientes: string | null;
    receta_estructurada: unknown;
    receta_tecnica: unknown;
    /** Receta unificada con 9 secciones. FASE 9. */
    receta: Receta | null;
    notion_last_edited: string | null;
    migrated_at: string;
    migration_run_id: string;
}

export interface CatalogoCreate {
    titulo: string;
    orden?: number;
    precio?: number;
    anio?: string;
    estado?: string;
    categorias?: string[];
    seleccionada?: boolean;
    ingredientes?: string;
}

export interface CatalogoUpdate extends Partial<CatalogoCreate> {
    receta_estructurada?: unknown;
    receta_tecnica?: unknown;
    receta?: Receta;
}

export interface CatalogoDetail {
    item: Catalogo;
    blocks: import("@/types/block").Block[];
    images: import("@/types/image").EntityImage[];
    relations: import("@/types/relation").Relations;
    /** Ingredientes normalizados cruzados con la receta. FASE 9. */
    ingredientes_normalizados?: Array<RecetaIngrediente & {
        nombre: string;
        coste_unitario: number | null;
        coste_linea: number | null;
    }>;
    /** Alérgenos heredados. FASE 9. */
    alergenos_normalizados?: Array<{
        alergeno_id: string;
        codigo: string;
        nombre: string;
        icono: string;
        origen: RecetaAlergeno["origen"];
    }>;
}

/** Item de /api/catalogos/grupos (lista plana agrupada por categoría). */
export interface CatalogoGrupo {
    categoria: string;
    items: Catalogo[];
}