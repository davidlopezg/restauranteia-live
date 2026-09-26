// Restaurant context and catalog formatting
// Ported from agents/creativo/agent.py (formatear_restaurante_para_chef, formatear_catalogo_para_chef)

const SOFISTICACION: Record<string, string> = {
    muy_alta: "muy sofisticada (cocina de autor, alta gastronomía)",
    alta: "alta (cocina refinada con producto destacado)",
    media: "media (cocina cuidada pero accesible)",
    baja: "baja (cocina honesta, producto noble sin alarde)",
    muy_baja: "muy baja (cocina popular, producto básico bien tratado)",
};
const GRUPOS: Record<string, string> = {
    sin_grupos: "no recibís grupos",
    con_grupos_pequenos: "recibís grupos pequeños",
    con_grupos_grandes: "recibís grupos grandes",
    banquetes_eventos: "banquetes y eventos son parte del negocio",
};
const LOCALIZACION: Record<string, string> = {
    urbana: "ubicación urbana",
    rural: "ubicación rural",
    litoral_mar: "cerca del mar",
    montana: "en zona de montaña",
    singular_edificio_historico: "en edificio singular o histórico",
};
const TIEMPO: Record<string, string> = {
    comida_rapida: "comida rápida (cliente sale en ~20 min)",
    medio: "tiempo medio (cliente ~1h en mesa)",
    slow_food: "slow food (cliente 2-3h, experiencia larga)",
};
const ORIGEN: Record<string, string> = {
    local_pueblo: "inspiración local / del pueblo",
    regional_provincia: "inspiración regional / de la provincia",
    nacional_pais: "inspiración nacional",
    mediterraneo: "inspiración mediterránea",
    latinoamericano: "inspiración latinoamericana",
    asiatico: "inspiración asiática",
    norte_europeo: "inspiración norte-europea",
    frances_gourmet: "gastronomía francesa / gourmet",
    internacional_fusion: "fusión internacional",
};
const EPOCA: Record<string, string> = {
    medieval: "medieval",
    clasica_francesa: "clásica francesa",
    tradicional_popular: "tradicional / popular",
    rustica_pais: "rústica / de payés",
    mediterranea_moderna: "mediterránea moderna",
    nouvelle_cuisine: "nouvelle cuisine",
    autor_contemporanea: "de autor / contemporánea",
    street_food_gourmet: "street food gourmet",
    casual_actual: "casual actual",
    pizzeria_tradicional_italiana: "pizzería tradicional italiana",
    pizzeria_contemporanea: "pizzería contemporánea",
    casual_mediterraneo: "casual mediterráneo",
};

export interface Restaurante {
    nombre?: string;
    precio_target_min?: number;
    precio_target_max?: number;
    precio_target_moda?: number;
    sofisticacion?: string;
    productos_dominantes?: string[] | string;
    tecnicas_dominantes?: string[] | string;
    tipo_servicio?: string[] | string;
    grupos?: string;
    clases_comedores?: string[] | string;
    origen_inspiracion?: string;
    orientacion_nutricional?: string[] | string;
    localizacion?: string;
    religion?: string[] | string;
    tiempo_preparacion?: string;
    epoca_estilo?: string[] | string;
    [key: string]: unknown;
}

function fmtLista(restaurante: Restaurante, key: string, mapping?: Record<string, string>): string {
    const vals = restaurante[key];
    if (!vals) return "";
    const arr = Array.isArray(vals) ? vals : [vals];
    if (mapping) {
        return arr.map((v: string) => mapping[v] || v).filter(Boolean).join(", ");
    }
    return arr.join(", ");
}

export function formatearRestaurante(restaurante: Restaurante | null): string {
    if (!restaurante || !restaurante.nombre) return "";

    const lineas: string[] = [
        "\n\n---\n",
        "## CONTEXTO DEL RESTAURANTE",
        "",
        "Estos son los datos del restaurante que el chef debe respetar SIEMPRE.",
        "",
    ];

    const nombre = (restaurante.nombre || "").trim();
    if (nombre) {
        lineas.push(`**Restaurante**: ${nombre}`);
        lineas.push("");
    }

    const pmin = restaurante.precio_target_min;
    const pmax = restaurante.precio_target_max;
    const pmoda = restaurante.precio_target_moda;
    if (pmin != null || pmax != null || pmoda != null) {
        const partes: string[] = [];
        if (pmin != null) partes.push(`mín ${pmin}€`);
        if (pmax != null) partes.push(`máx ${pmax}€`);
        if (pmoda != null) partes.push(`típico ${pmoda}€`);
        if (partes.length) {
            lineas.push(`**Ticket medio por persona**: ${partes.join(", ")}`);
            lineas.push("");
        }
    }

    const sof = (restaurante.sofisticacion || "").trim();
    if (sof) {
        lineas.push(`**Sofisticación**: ${SOFISTICACION[sof] || sof}`);
        lineas.push("");
    }

    const prods = fmtLista(restaurante, "productos_dominantes");
    if (prods) {
        lineas.push(`**Productos que mandan en la cocina**: ${prods}`);
        lineas.push("");
    }

    const tecs = fmtLista(restaurante, "tecnicas_dominantes");
    if (tecs) {
        lineas.push(`**Técnicas / elaboraciones dominantes**: ${tecs}`);
        lineas.push("");
    }

    const serv = fmtLista(restaurante, "tipo_servicio");
    if (serv) {
        lineas.push(`**Tipo de servicio**: ${serv}`);
        lineas.push("");
    }

    const grp = (restaurante.grupos || "").trim();
    if (grp) {
        lineas.push(`**Política de grupos**: ${GRUPOS[grp] || grp}`);
        lineas.push("");
    }

    const cls = fmtLista(restaurante, "clases_comedores");
    if (cls) {
        lineas.push(`**Tipo de cliente objetivo**: ${cls}`);
        lineas.push("");
    }

    const orig = (restaurante.origen_inspiracion || "").trim();
    if (orig) {
        lineas.push(`**Origen / inspiración**: ${ORIGEN[orig] || orig}`);
        lineas.push("");
    }

    const nut = fmtLista(restaurante, "orientacion_nutricional");
    if (nut && nut !== "ninguna") {
        lineas.push(`**Orientación nutricional prioritaria**: ${nut}`);
        lineas.push("");
    }

    const loc = (restaurante.localizacion || "").trim();
    if (loc) {
        lineas.push(`**Localización**: ${LOCALIZACION[loc] || loc}`);
        lineas.push("");
    }

    const rel = fmtLista(restaurante, "religion");
    if (rel && rel !== "ninguna") {
        lineas.push(`**Restricciones religiosas prioritarias**: ${rel}`);
        lineas.push("");
    }

    const tie = (restaurante.tiempo_preparacion || "").trim();
    if (tie) {
        lineas.push(`**Tiempo del comensal**: ${TIEMPO[tie] || tie}`);
        lineas.push("");
    }

    const est = fmtLista(restaurante, "epoca_estilo", EPOCA);
    if (est) {
        lineas.push(`**Época / estilo**: ${est}`);
        lineas.push("");
    }

    lineas.push("**REGLA DURA**: si el usuario pide algo que contradice estos datos, señalá la contradicción antes de generar. NO ignores estas decisiones.");
    lineas.push("");

    return lineas.join("\n");
}

export interface CatalogoPlate {
    nombre?: string;
    descripcion?: string;
    precio?: number;
    categoria?: string;
    [key: string]: unknown;
}

const CATALOGO_MAX_PLATOS = 30;

export function formatearCatalogo(catalogo: CatalogoPlate[] | null): string {
    if (!catalogo || catalogo.length === 0) return "";

    const lineas: string[] = [
        "\n\n---\n",
        "## CATÁLOGO ACTUAL DEL RESTAURANTE",
        "",
        "Estos son los platos que ya están en la carta del restaurante.",
        "Usá esta información para:",
        "- NO proponer platos idénticos o muy similares a los existentes.",
        "- Sugerir COMPLEMENTOS: si ya hay una pasta, proponer un segundo plato de otra familia.",
        "- Mantener la LÍNEA CULINARIA.",
        "",
        `Total de platos en carta: ${catalogo.length}.`,
        "",
    ];

    const mostrar = catalogo.slice(0, CATALOGO_MAX_PLATOS);
    if (catalogo.length > CATALOGO_MAX_PLATOS) {
        lineas.push(`(mostrando los primeros ${CATALOGO_MAX_PLATOS} de ${catalogo.length})\n`);
    }

    const porCategoria: Record<string, CatalogoPlate[]> = {};
    for (const p of mostrar) {
        const cat = (p.categoria || "otro").toString().trim().toLowerCase();
        if (!porCategoria[cat]) porCategoria[cat] = [];
        porCategoria[cat].push(p);
    }

    for (const cat of Object.keys(porCategoria).sort()) {
        lineas.push(`### ${cat.charAt(0).toUpperCase() + cat.slice(1)}`);
        for (const p of porCategoria[cat]) {
            const nombre = (p.nombre || "").trim();
            if (!nombre) continue;
            const desc = (p.descripcion || "").trim();
            const price = p.precio;
            const parts = [`- **${nombre}**`];
            if (desc) parts.push(` — ${desc}`);
            if (price != null) {
                try {
                    parts.push(` (${Number(price).toFixed(2)}€)`);
                } catch { /* ignore */ }
            }
            lineas.push(parts.join(""));
        }
        lineas.push("");
    }

    return lineas.join("\n");
}

// Load from Supabase — pass a pre-created admin client
export async function loadRestaurante(
    supabaseUrl: string,
    supabaseKey: string,
): Promise<Restaurante | null> {
    try {
        const { createClient } = await import("jsr:@supabase/supabase-js@2");
        const admin = createClient(supabaseUrl, supabaseKey, { db: { schema: "notion_migration" } });
        const { data } = await admin.from("app_settings").select("value").eq("key", "restaurante_context").limit(1).single();
        if (data?.value) {
            try {
                return JSON.parse(data.value);
            } catch { /* ignore */ }
        }
        // Also try restaurante_info table
        const { data: restData } = await admin.from("restaurante_info").select("*").limit(1).maybeSingle();
        if (restData) {
            return restData as Restaurante;
        }
    } catch {
        // Fallback: return null
    }
    return null;
}

export async function loadCatalogo(
    supabaseUrl: string,
    supabaseKey: string,
): Promise<CatalogoPlate[]> {
    try {
        const { createClient } = await import("jsr:@supabase/supabase-js@2");
        const admin = createClient(supabaseUrl, supabaseKey, { db: { schema: "notion_migration" } });
        const { data } = await admin
            .from("catalogos")
            .select("id, titulo, descripcion, precio, categoria")
            .eq("estado", "Listo")
            .order("titulo", { ascending: true })
            .limit(CATALOGO_MAX_PLATOS);
        if (data) {
            return data.map((r: Record<string, unknown>) => ({
                nombre: (r.titulo as string) || "",
                descripcion: (r.descripcion as string) || "",
                precio: (r.precio as number) || undefined,
                categoria: (r.categoria as string) || "",
            }));
        }
    } catch { /* ignore */ }
    return [];
}