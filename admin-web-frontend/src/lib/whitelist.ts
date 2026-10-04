/**
 * Whitelist de columnas editables para ideas/agendas/catalogos.
 * Replica `EDITABLE_COLUMNS` del backend Python (queries.py:31).
 * El cliente filtra columnas antes de mandar a Supabase — defense in depth.
 *
 * IMPORTANTE: si agregás columnas editables en Supabase, agregalas acá también.
 */

export const EDITABLE_COLUMNS = {
    ideas: ["titulo", "descripcion", "categorias", "puntuacion", "estado_idea", "fecha_creacion"],
    agendas: ["titulo", "fecha_creacion", "fecha", "etiquetas", "estado_desarrollo", "objetivo", "receta_final", "timeline"],
    // FASE 9: `receta` (jsonb unificado) reemplaza gradualmente a receta_estructurada y receta_tecnica.
    // Las legacy se mantienen en editable para permitir migración de datos sin tocar nada.
    catalogos: ["titulo", "orden", "precio", "anio", "estado", "categorias", "seleccionada",
        "ingredientes", "receta_estructurada", "receta_tecnica", "receta",
        "imagen_emplatado_id", "ficha_tecnica_id"],
    // FASE 9: tablas nuevas
    ingredientes: ["nombre", "categoria", "coste_medio", "unidad_compra",
        "merma_default_pct", "proveedor", "alergenos", "dietas_validas", "notas", "activo"],
    subrecetas: ["nombre", "descripcion", "receta_origen_id",
        "cantidad_producida", "unidad_producida", "coste_total", "activo", "notas"],
    alergenos: ["codigo", "nombre", "icono", "descripcion", "obligatorio_ue", "activo"],
} as const;

export type EditableTable = keyof typeof EDITABLE_COLUMNS;

/** Filtra un payload dejando solo las columnas permitidas. */
export function whitelist<T extends Record<string, unknown>>(
    table: EditableTable,
    payload: T,
): Partial<T> {
    const allowed = EDITABLE_COLUMNS[table];
    const out: Record<string, unknown> = {};
    for (const k of allowed) {
        if (k in payload) out[k] = payload[k];
    }
    return out as Partial<T>;
}

/** UUID v4 (crypto.randomUUID en navegadores modernos, fallback manual). */
export function newUuid(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    // Fallback: generar v4 manualmente
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}