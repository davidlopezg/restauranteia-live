/**
 * conservacion-reglas.ts — Motor de reglas de conservación (cliente).
 *
 * Adaptación del JSON fuente:
 *   conocimiento/interno_app/recursos/conservacion.json
 *
 * Solo incluimos el subconjunto que necesita la página de Conservación:
 *   - 13 métodos con nombre + vida útil media (referencia rápida)
 *   - mapa categoria_producto → familia (perecedero + métodos posibles + recomendado)
 *
 * Mantener sincronizado con el JSON cuando se añadan métodos o familias.
 * Si la base crece mucho (>50 métodos), mover a un endpoint backend.
 */

export type MetodoId =
    | "refrigeracion"
    | "refrigeracion_hielo"
    | "congelacion"
    | "salazon_curado"
    | "ahumado"
    | "aceite_confit"
    | "vinagre_escabeche"
    | "azucar_almibar"
    | "fermentacion_lactica"
    | "secado_deshidratacion"
    | "al_vacio_pasteurizacion"
    | "conserva_autoclave"
    | "atmosfera_modificada"
    | "almacenamiento_seco";

export interface MetodoInfo {
    id: MetodoId;
    nombre: string;
    /** Vida útil media orientativa en días (string con rango). */
    vidaUtil: string;
    /** Categoría del método (por_temperatura, por_pH…). Solo etiqueta. */
    categoria: string;
}

/** Catálogo compacto de métodos — usado para mostrar badges y leyenda. */
export const METODOS: Record<MetodoId, MetodoInfo> = {
    refrigeracion: { id: "refrigeracion", nombre: "Refrigeración", vidaUtil: "2–14 días", categoria: "por_temperatura" },
    refrigeracion_hielo: { id: "refrigeracion_hielo", nombre: "Refrigeración con hielo", vidaUtil: "1–4 días", categoria: "por_temperatura" },
    congelacion: { id: "congelacion", nombre: "Congelación", vidaUtil: "90–365 días", categoria: "por_temperatura" },
    salazon_curado: { id: "salazon_curado", nombre: "Salazón / Curado", vidaUtil: "30–365+ días", categoria: "por_actividad_agua" },
    ahumado: { id: "ahumado", nombre: "Ahumado", vidaUtil: "30–120 días", categoria: "combinado" },
    aceite_confit: { id: "aceite_confit", nombre: "Aceite / Confitado", vidaUtil: "60–365 días", categoria: "por_medio_graso" },
    vinagre_escabeche: { id: "vinagre_escabeche", nombre: "Vinagre / Escabeche", vidaUtil: "180–365 días", categoria: "por_pH" },
    azucar_almibar: { id: "azucar_almibar", nombre: "Azúcar / Almíbar", vidaUtil: "365+ días", categoria: "por_aw" },
    fermentacion_lactica: { id: "fermentacion_lactica", nombre: "Fermentación láctica", vidaUtil: "60–365 días", categoria: "por_pH" },
    secado_deshidratacion: { id: "secado_deshidratacion", nombre: "Secado / Deshidratación", vidaUtil: "180–730 días", categoria: "por_aw" },
    al_vacio_pasteurizacion: { id: "al_vacio_pasteurizacion", nombre: "Al vacío + pasteurización", vidaUtil: "7–90 días", categoria: "combinado" },
    conserva_autoclave: { id: "conserva_autoclave", nombre: "Conserva (autoclave)", vidaUtil: "365–1825 días", categoria: "por_pH_y_T" },
    atmosfera_modificada: { id: "atmosfera_modificada", nombre: "Atmósfera modificada (MAP)", vidaUtil: "5–21 días", categoria: "por_envase_y_gases" },
    almacenamiento_seco: { id: "almacenamiento_seco", nombre: "Almacenamiento en seco", vidaUtil: "180–1825 días", categoria: "por_aw" },
};

export interface ReglaProducto {
    perecedero: boolean;
    /** Vida útil orientativa en días (texto libre con rango). */
    vidaUtilTexto: string;
    /** Conjunto de métodos que aplican razonablemente a esta familia. */
    metodosPosibles: MetodoId[];
    /** Método recomendado por defecto (el que alarga más vida útil manteniendo calidad). */
    recomendado: MetodoId;
    /** Notas de uso (de donde sale, cuidados extra). */
    notas?: string;
}

/**
 * Mapeo categoria_producto (campo `ingredientes.categoria`) → reglas.
 *
 * Cobertura: verdura, hierba, especia, proteína (subcategorías relevantes),
 * lácteo, grasa, conserva, vino, condimento, cereal, endulzante.
 *
 * Si una categoría no está → fallback (perecedero=true, recomendado=refrigeración).
 */
export const REGLAS_POR_CATEGORIA: Record<string, ReglaProducto> = {
    // --- Verduras ---
    verdura: {
        perecedero: true,
        vidaUtilTexto: "3–14 días",
        metodosPosibles: ["refrigeracion", "congelacion", "fermentacion_lactica", "vinagre_escabeche", "secado_deshidratacion", "al_vacio_pasteurizacion"],
        recomendado: "refrigeracion",
        notas: "Hojas verdes 3-5 días, de raíz 2-3 semanas. Tomate nunca en nevera.",
    },

    // --- Hierbas ---
    hierba: {
        perecedero: true,
        vidaUtilTexto: "3–10 días fresco / 180–365 días seco",
        metodosPosibles: ["refrigeracion", "congelacion", "secado_deshidratacion", "aceite_confit", "vinagre_escabeche"],
        recomendado: "secado_deshidratacion",
        notas: "Frescas: nevera envueltas en papel. Secas: bote cerrado en lugar oscuro.",
    },

    // --- Especias (ya secas por naturaleza) ---
    especia: {
        perecedero: false,
        vidaUtilTexto: "365–730 días",
        metodosPosibles: ["almacenamiento_seco", "al_vacio_pasteurizacion"],
        recomendado: "almacenamiento_seco",
        notas: "Especias enteras 2-3 años; molidas 6-12 meses. Proteger de luz y humedad.",
    },

    // --- Proteínas ---
    proteina: {
        perecedero: true,
        vidaUtilTexto: "2–7 días frigo / 90–365 congelado",
        metodosPosibles: ["refrigeracion", "congelacion", "salazon_curado", "ahumado", "al_vacio_pasteurizacion"],
        recomendado: "refrigeracion",
        notas: "Vacuno madurado 28-60 días. Pollo 1-2 días. Pescado azul 1-2 días, blanco 3-4.",
    },

    // --- Lácteos ---
    lacteo: {
        perecedero: true,
        vidaUtilTexto: "5–45 días",
        metodosPosibles: ["refrigeracion", "congelacion", "salazon_curado", "fermentacion_lactica"],
        recomendado: "refrigeracion",
        notas: "Leche UHT ambiente 6 meses. Queso curado 30-90 días.",
    },

    // --- Grasas / aceites ---
    grasa: {
        perecedero: false,
        vidaUtilTexto: "180–365 días",
        metodosPosibles: ["almacenamiento_seco", "aceite_confit", "al_vacio_pasteurizacion"],
        recomendado: "almacenamiento_seco",
        notas: "Proteger de luz y calor. Botella opaca o lata.",
    },

    // --- Conservas ya elaboradas (vinagre, encurtidos, etc.) ---
    conserva: {
        perecedero: false,
        vidaUtilTexto: "180–365 días",
        metodosPosibles: ["almacenamiento_seco", "refrigeracion"],
        recomendado: "almacenamiento_seco",
        notas: "Una vez abierto, refrigerar y consumir en días.",
    },

    // --- Vinos y beverages ---
    vino: {
        perecedero: false,
        vidaUtilTexto: "365–1825 días",
        metodosPosibles: ["almacenamiento_seco", "al_vacio_pasteurizacion"],
        recomendado: "almacenamiento_seco",
        notas: "Botella acostada, 12-14°C, evitar luz. Botella abierta: 3-5 días con vacío.",
    },

    // --- Condimentos (sal, pimienta…) ---
    condimento: {
        perecedero: false,
        vidaUtilTexto: "730+ días",
        metodosPosibles: ["almacenamiento_seco"],
        recomendado: "almacenamiento_seco",
    },

    // --- Cereales y harinas ---
    cereal: {
        perecedero: false,
        vidaUtilTexto: "180–365 días",
        metodosPosibles: ["almacenamiento_seco", "al_vacio_pasteurizacion"],
        recomendado: "almacenamiento_seco",
        notas: "Bidón cerrado, evitar humedad. Harina vieja pierde textura.",
    },

    // --- Endulzantes ---
    endulzante: {
        perecedero: false,
        vidaUtilTexto: "730+ días",
        metodosPosibles: ["almacenamiento_seco", "azucar_almibar"],
        recomendado: "almacenamiento_seco",
    },

    // --- Pan / masas (caso especial) ---
    pan: {
        perecedero: true,
        vidaUtilTexto: "2–5 días ambiente / 30–90 congelado",
        metodosPosibles: ["refrigeracion", "congelacion", "secado_deshidratacion"],
        recomendado: "congelacion",
        notas: "Pan payés: ambiente 2-3 días. Hojaldre crudo: congelar y hornear directo.",
    },
};

/** Fallback si la categoría del ingrediente no está mapeada. */
export const FALLBACK_PRODUCTO: ReglaProducto = {
    perecedero: true,
    vidaUtilTexto: "—",
    metodosPosibles: ["refrigeracion", "congelacion"],
    recomendado: "refrigeracion",
};

/**
 * Devuelve la regla aplicable a un producto según su categoría.
 * Si no hay regla explícita, devuelve FALLBACK_PRODUCTO (refrigeración).
 */
export function reglaParaProducto(categoria: string | null | undefined): ReglaProducto {
    if (!categoria) return FALLBACK_PRODUCTO;
    return REGLAS_POR_CATEGORIA[categoria] ?? FALLBACK_PRODUCTO;
}

/* ============================================================
 *  Reglas para ELABORACIONES (recetas)
 *  Una elaboración ya trae `receta.conservacion` con datos
 *  introducidos por el chef al guardar. Aquí derivamos:
 *   - perecedero (bool) a partir de vida_util_h + método
 *   - duración estimada (texto)
 *   - métodos posibles según el método elegido + el tipo de receta
 * ============================================================ */

export interface ConservacionInput {
    metodo: string | null | undefined;
    vida_util_h: number | null | undefined;
}

/** Métodos cuya aplicación implica claramente producto perecedero en frigo. */
const METODOS_PERECEDEROS: ReadonlySet<string> = new Set([
    "refrigeracion",
    "refrigeracion_hielo",
    "fermentacion_lactica",
    "al_vacio_pasteurizacion", // depende, pero lo marcamos conservadoramente
]);

/**
 * Devuelve métodos compatibles con el método elegido en la receta.
 * Si el método es ambiguo/no reconocido, devuelve un set base razonable.
 */
export function metodosPosiblesParaElaboracion(metodo: string | null | undefined): MetodoId[] {
    const m = (metodo ?? "").toLowerCase().trim();
    const base: MetodoId[] = ["refrigeracion", "congelacion"];
    switch (m) {
        case "refrigeracion":
        case "refrigeracion_hielo":
            return ["refrigeracion", "congelacion", "al_vacio_pasteurizacion"];
        case "congelacion":
            return ["congelacion", "refrigeracion", "al_vacio_pasteurizacion"];
        case "salazon_curado":
            return ["salazon_curado", "refrigeracion", "ahumado", "almacenamiento_seco"];
        case "ahumado":
            return ["ahumado", "refrigeracion", "salazon_curado", "congelacion"];
        case "aceite_confit":
            return ["aceite_confit", "almacenamiento_seco", "refrigeracion"];
        case "vinagre_escabeche":
            return ["vinagre_escabeche", "almacenamiento_seco", "refrigeracion"];
        case "azucar_almibar":
            return ["azucar_almibar", "almacenamiento_seco", "conserva_autoclave"];
        case "fermentacion_lactica":
            return ["fermentacion_lactica", "refrigeracion", "al_vacio_pasteurizacion"];
        case "secado_deshidratacion":
            return ["secado_deshidratacion", "almacenamiento_seco", "al_vacio_pasteurizacion"];
        case "al_vacio_pasteurizacion":
            return ["al_vacio_pasteurizacion", "refrigeracion", "congelacion"];
        case "conserva_autoclave":
            return ["conserva_autoclave", "almacenamiento_seco"];
        case "atmosfera_modificada":
            return ["atmosfera_modificada", "refrigeracion"];
        case "almacenamiento_seco":
            return ["almacenamiento_seco", "al_vacio_pasteurizacion"];
        default:
            return base;
    }
}

/**
 * Determina si una elaboración es perecedera según su método + vida útil.
 * Reglas:
 *   - Método ∈ METODOS_PERECEDEROS → sí
 *   - vida_util_h ≤ 96 (4 días) → sí
 *   - método ∈ {salazón, aceite, vinagre, azúcar, fermentación, secado, autoclave, MAP, seco} → no
 *   - vida_util_h ≥ 720 (30 días) → no
 *   - Sin método ni vida útil → null (no se puede calcular)
 */
export function esPerecederoElaboracion(c: ConservacionInput): boolean | null {
    const metodo = (c.metodo ?? "").toLowerCase().trim();
    const vida = c.vida_util_h;

    // Sin datos → no calculable
    if (!metodo && vida == null) return null;

    // Vida útil manda si está clara
    if (typeof vida === "number") {
        if (vida <= 96) return true;
        if (vida >= 720) return false;
    }

    // Si el método es claramente duradero, no perecedero
    const METODOS_DURADEROS = new Set([
        "salazon_curado",
        "aceite_confit",
        "vinagre_escabeche",
        "azucar_almibar",
        "secado_deshidratacion",
        "conserva_autoclave",
        "almacenamiento_seco",
    ]);
    if (METODOS_DURADEROS.has(metodo)) return false;

    if (METODOS_PERECEDEROS.has(metodo)) return true;

    return null;
}

/** Formatea vida_util_h como texto legible. */
export function formatearVidaUtilHoras(horas: number | null | undefined): string {
    if (horas == null) return "—";
    if (horas <= 0) return "—";
    if (horas < 48) return `${horas} h`;
    const dias = horas / 24;
    if (dias < 30) return `${dias.toFixed(1)} días`;
    const meses = dias / 30;
    if (meses < 12) return `${meses.toFixed(1)} meses`;
    return `${(dias / 365).toFixed(1)} años`;
}
