// Flavor engine — ported from agents/herramientas/flavor_engine.py
// Uses embedded curated mapping data for offline operation in Edge Functions

interface Compound {
    cid: number;
    name: string;
    role: "primary" | "secondary" | "trace";
}

interface FlavorEntry {
    ingredient: string;
    category: string;
    compounds: Compound[];
}

interface Pairing {
    ingredient_b: string;
    score: number;
    shared_compounds: Compound[];
}

// Embedded curated mapping (78 ingredients) — compressed for Edge Function size limits
// Full data from conocimiento/fuentes_externas/flavor_data/flavor_mapping.json
const CURATED: FlavorEntry[] = [
    { ingredient: "ajo", category: "allium", compounds: [{ cid: 65036, name: "allicin", role: "primary" }, { cid: 11617, name: "allyl methyl sulfide", role: "primary" }, { cid: 16590, name: "diallyl disulfide", role: "secondary" }, { cid: 87310, name: "alliin", role: "secondary" }] },
    { ingredient: "cebolla", category: "allium", compounds: [{ cid: 11721, name: "propanethial s-oxide (LF)", role: "primary" }, { cid: 6377, name: "dipropyl disulfide", role: "secondary" }, { cid: 11689, name: "trans-1-propenyl propyl disulfide", role: "primary" }] },
    { ingredient: "puerro", category: "allium", compounds: [{ cid: 11617, name: "allyl methyl sulfide", role: "primary" }, { cid: 6377, name: "dipropyl disulfide", role: "secondary" }] },
    { ingredient: "cebolleta", category: "allium", compounds: [{ cid: 11617, name: "allyl methyl sulfide", role: "primary" }] },
    { ingredient: "chalota", category: "allium", compounds: [{ cid: 11617, name: "allyl methyl sulfide", role: "primary" }, { cid: 6377, name: "dipropyl disulfide", role: "secondary" }] },
    { ingredient: "limón", category: "citricos", compounds: [{ cid: 440, name: "(+)-limonene", role: "primary" }, { cid: 6562, name: "citral", role: "primary" }, { cid: 3314, name: "citric acid", role: "secondary" }, { cid: 638011, name: "linalool", role: "secondary" }] },
    { ingredient: "naranja", category: "citricos", compounds: [{ cid: 440, name: "(+)-limonene", role: "primary" }, { cid: 6665, name: "decanal", role: "secondary" }, { cid: 638011, name: "linalool", role: "secondary" }, { cid: 276, name: "octanal", role: "secondary" }] },
    { ingredient: "pomelo", category: "citricos", compounds: [{ cid: 440, name: "(+)-limonene", role: "primary" }, { cid: 11126, name: "nootkatone", role: "primary" }, { cid: 6665, name: "decanal", role: "secondary" }] },
    { ingredient: "mandarina", category: "citricos", compounds: [{ cid: 440, name: "(+)-limonene", role: "primary" }, { cid: 223, name: "gamma-terpinene", role: "secondary" }, { cid: 931, name: "alpha-pinene", role: "secondary" }] },
    { ingredient: "lima", category: "citricos", compounds: [{ cid: 440, name: "(+)-limonene", role: "primary" }, { cid: 6562, name: "citral", role: "primary" }, { cid: 638011, name: "linalool", role: "secondary" }] },
    { ingredient: "tomate", category: "verduras", compounds: [{ cid: 6102, name: "(Z)-3-hexenal (leafy)", role: "primary" }, { cid: 444, name: "(E)-2-hexenal (tomato vine)", role: "primary" }, { cid: 6101, name: "beta-ionone", role: "secondary" }, { cid: 655, name: "hexanol", role: "trace" }] },
    { ingredient: "pimiento", category: "verduras", compounds: [{ cid: 18827, name: "capsaicin", role: "primary" }, { cid: 6102, name: "(Z)-3-hexenal", role: "secondary" }, { cid: 6999, name: "2-isobutyl-3-methoxypyrazine", role: "secondary" }] },
    { ingredient: "pimiento rojo", category: "verduras", compounds: [{ cid: 18827, name: "capsaicin", role: "primary" }, { cid: 6102, name: "(Z)-3-hexenal", role: "secondary" }, { cid: 6999, name: "2-isobutyl-3-methoxypyrazine", role: "secondary" }] },
    { ingredient: "pimiento verde", category: "verduras", compounds: [{ cid: 6999, name: "2-isobutyl-3-methoxypyrazine", role: "primary" }, { cid: 6102, name: "(Z)-3-hexenal", role: "secondary" }] },
    { ingredient: "berenjena", category: "verduras", compounds: [{ cid: 22049, name: "nasunin (anthocyanin)", role: "primary" }, { cid: 6102, name: "(Z)-3-hexenal", role: "secondary" }] },
    { ingredient: "alcachofa", category: "verduras", compounds: [{ cid: 5280343, name: "cynarin", role: "primary" }, { cid: 644017, name: "chlorogenic acid", role: "secondary" }, { cid: 6102, name: "(Z)-3-hexenal", role: "trace" }] },
    { ingredient: "calabacín", category: "verduras", compounds: [{ cid: 6102, name: "(Z)-3-hexenal", role: "primary" }, { cid: 655, name: "hexanol", role: "secondary" }] },
    { ingredient: "calabaza", category: "verduras", compounds: [{ cid: 689043, name: "beta-carotene", role: "primary" }, { cid: 444, name: "(E)-2-hexenal", role: "secondary" }] },
    { ingredient: "espinaca", category: "verduras", compounds: [{ cid: 5280791, name: "spinacetin", role: "primary" }, { cid: 6102, name: "(Z)-3-hexenal", role: "secondary" }] },
    { ingredient: "acelga", category: "verduras", compounds: [{ cid: 6102, name: "(Z)-3-hexenal", role: "primary" }, { cid: 655, name: "hexanol", role: "secondary" }] },
    { ingredient: "brócoli", category: "verduras", compounds: [{ cid: 5970, name: "sulforaphane", role: "primary" }, { cid: 6102, name: "(Z)-3-hexenal", role: "secondary" }] },
    { ingredient: "coliflor", category: "verduras", compounds: [{ cid: 5970, name: "sulforaphane", role: "primary" }, { cid: 6102, name: "(Z)-3-hexenal", role: "secondary" }] },
    { ingredient: "zanahoria", category: "verduras", compounds: [{ cid: 689043, name: "beta-carotene", role: "primary" }, { cid: 440, name: "(+)-limonene", role: "secondary" }, { cid: 931, name: "alpha-pinene", role: "trace" }] },
    { ingredient: "remolacha", category: "verduras", compounds: [{ cid: 5281315, name: "betalain", role: "primary" }, { cid: 6102, name: "(Z)-3-hexenal", role: "secondary" }] },
    { ingredient: "patata", category: "tubérculos", compounds: [{ cid: 444, name: "(E)-2-hexenal", role: "primary" }, { cid: 6102, name: "(Z)-3-hexenal", role: "secondary" }] },
    { ingredient: "boniato", category: "tubérculos", compounds: [{ cid: 689043, name: "beta-carotene", role: "primary" }, { cid: 444, name: "(E)-2-hexenal", role: "secondary" }] },
    { ingredient: "aceite oliva", category: "grasas", compounds: [{ cid: 445154, name: "oleic acid (C18:1)", role: "primary" }, { cid: 444, name: "(E)-2-hexenal", role: "secondary" }, { cid: 6102, name: "(Z)-3-hexenal", role: "trace" }] },
    { ingredient: "aceite de oliva virgen extra", category: "grasas", compounds: [{ cid: 445154, name: "oleic acid (C18:1)", role: "primary" }, { cid: 444, name: "(E)-2-hexenal", role: "secondary" }, { cid: 6102, name: "(Z)-3-hexenal", role: "trace" }] },
    { ingredient: "almendra", category: "frutos_secos", compounds: [{ cid: 6288, name: "benzaldehyde", role: "primary" }, { cid: 445154, name: "oleic acid (C18:1)", role: "primary" }, { cid: 638011, name: "linalool", role: "secondary" }] },
    { ingredient: "avellana", category: "frutos_secos", compounds: [{ cid: 6288, name: "benzaldehyde", role: "primary" }, { cid: 445154, name: "oleic acid (C18:1)", role: "primary" }, { cid: 638011, name: "linalool", role: "secondary" }] },
    { ingredient: "nuez", category: "frutos_secos", compounds: [{ cid: 445154, name: "oleic acid (C18:1)", role: "primary" }, { cid: 444, name: "(E)-2-hexenal", role: "secondary" }] },
    { ingredient: "piñón", category: "frutos_secos", compounds: [{ cid: 445154, name: "oleic acid (C18:1)", role: "primary" }, { cid: 931, name: "alpha-pinene", role: "secondary" }] },
    { ingredient: "pistacho", category: "frutos_secos", compounds: [{ cid: 445154, name: "oleic acid (C18:1)", role: "primary" }, { cid: 638011, name: "linalool", role: "secondary" }, { cid: 931, name: "alpha-pinene", role: "trace" }] },
    { ingredient: "anacardo", category: "frutos_secos", compounds: [{ cid: 445154, name: "oleic acid (C18:1)", role: "primary" }, { cid: 6288, name: "benzaldehyde", role: "secondary" }] },
    { ingredient: "fresa", category: "frutas", compounds: [{ cid: 3314, name: "citric acid", role: "primary" }, { cid: 312, name: "(E)-2-hexen-1-ol", role: "primary" }, { cid: 6101, name: "beta-ionone", role: "secondary" }, { cid: 638011, name: "linalool", role: "secondary" }] },
    { ingredient: "frambuesa", category: "frutas", compounds: [{ cid: 3314, name: "citric acid", role: "primary" }, { cid: 6101, name: "beta-ionone", role: "secondary" }, { cid: 638011, name: "linalool", role: "secondary" }] },
    { ingredient: "arándano", category: "frutas", compounds: [{ cid: 3314, name: "citric acid", role: "primary" }, { cid: 689043, name: "beta-carotene", role: "secondary" }] },
    { ingredient: "manzana", category: "frutas", compounds: [{ cid: 312, name: "(E)-2-hexen-1-ol", role: "primary" }, { cid: 3314, name: "citric acid", role: "secondary" }, { cid: 638011, name: "linalool", role: "secondary" }] },
    { ingredient: "pera", category: "frutas", compounds: [{ cid: 312, name: "(E)-2-hexen-1-ol", role: "primary" }, { cid: 3314, name: "citric acid", role: "secondary" }] },
    { ingredient: "higo", category: "frutas", compounds: [{ cid: 312, name: "(E)-2-hexen-1-ol", role: "primary" }, { cid: 689043, name: "beta-carotene", role: "secondary" }] },
    { ingredient: "melocotón", category: "frutas", compounds: [{ cid: 638011, name: "linalool", role: "primary" }, { cid: 6101, name: "beta-ionone", role: "secondary" }, { cid: 3314, name: "citric acid", role: "trace" }] },
    { ingredient: "albaricoque", category: "frutas", compounds: [{ cid: 6101, name: "beta-ionone", role: "primary" }, { cid: 638011, name: "linalool", role: "secondary" }] },
    { ingredient: "ciruela", category: "frutas", compounds: [{ cid: 312, name: "(E)-2-hexen-1-ol", role: "primary" }, { cid: 3314, name: "citric acid", role: "secondary" }] },
    { ingredient: "uvas", category: "frutas", compounds: [{ cid: 3314, name: "citric acid", role: "primary" }, { cid: 638011, name: "linalool", role: "secondary" }] },
    { ingredient: "plátano", category: "frutas", compounds: [{ cid: 312, name: "(E)-2-hexen-1-ol", role: "primary" }, { cid: 638011, name: "linalool", role: "secondary" }] },
    { ingredient: "cereza", category: "frutas", compounds: [{ cid: 6288, name: "benzaldehyde", role: "primary" }, { cid: 3314, name: "citric acid", role: "secondary" }] },
    { ingredient: "albahaca", category: "hierbas", compounds: [{ cid: 638011, name: "linalool", role: "primary" }, { cid: 312, name: "(E)-2-hexen-1-ol", role: "secondary" }] },
    { ingredient: "menta", category: "hierbas", compounds: [{ cid: 1254, name: "menthol", role: "primary" }, { cid: 638011, name: "linalool", role: "secondary" }] },
    { ingredient: "perejil", category: "hierbas", compounds: [{ cid: 312, name: "(E)-2-hexen-1-ol", role: "primary" }, { cid: 6102, name: "(Z)-3-hexenal", role: "secondary" }] },
    { ingredient: "romero", category: "hierbas", compounds: [{ cid: 931, name: "alpha-pinene", role: "primary" }, { cid: 638011, name: "linalool", role: "secondary" }, { cid: 440, name: "(+)-limonene", role: "trace" }] },
    { ingredient: "tomillo", category: "hierbas", compounds: [{ cid: 6989, name: "thymol", role: "primary" }, { cid: 638011, name: "linalool", role: "secondary" }, { cid: 931, name: "alpha-pinene", role: "trace" }] },
    { ingredient: "orégano", category: "hierbas", compounds: [{ cid: 6989, name: "thymol", role: "primary" }, { cid: 638011, name: "linalool", role: "secondary" }, { cid: 931, name: "alpha-pinene", role: "trace" }] },
    { ingredient: "laurel", category: "hierbas", compounds: [{ cid: 638011, name: "linalool", role: "primary" }, { cid: 931, name: "alpha-pinene", role: "secondary" }] },
    { ingredient: "salvia", category: "hierbas", compounds: [{ cid: 638011, name: "linalool", role: "primary" }, { cid: 931, name: "alpha-pinene", role: "secondary" }, { cid: 6989, name: "thymol", role: "trace" }] },
    { ingredient: "eneldo", category: "hierbas", compounds: [{ cid: 638011, name: "linalool", role: "primary" }, { cid: 312, name: "(E)-2-hexen-1-ol", role: "secondary" }] },
    { ingredient: "cilantro", category: "hierbas", compounds: [{ cid: 638011, name: "linalool", role: "primary" }, { cid: 440, name: "(+)-limonene", role: "secondary" }] },
    { ingredient: "comino", category: "especias", compounds: [{ cid: 440, name: "(+)-limonene", role: "primary" }, { cid: 638011, name: "linalool", role: "secondary" }] },
    { ingredient: "pimienta negra", category: "especias", compounds: [{ cid: 638011, name: "linalool", role: "primary" }, { cid: 931, name: "alpha-pinene", role: "secondary" }, { cid: 312, name: "(E)-2-hexen-1-ol", role: "trace" }] },
    { ingredient: "pimentón", category: "especias", compounds: [{ cid: 689043, name: "beta-carotene", role: "primary" }, { cid: 18827, name: "capsaicin", role: "secondary" }] },
    { ingredient: "canela", category: "especias", compounds: [{ cid: 638011, name: "linalool", role: "primary" }, { cid: 312, name: "(E)-2-hexen-1-ol", role: "secondary" }] },
    { ingredient: "clavo", category: "especias", compounds: [{ cid: 3314, name: "citric acid", role: "primary" }, { cid: 638011, name: "linalool", role: "secondary" }] },
    { ingredient: "jengibre", category: "especias", compounds: [{ cid: 312, name: "(E)-2-hexen-1-ol", role: "primary" }, { cid: 638011, name: "linalool", role: "secondary" }] },
    { ingredient: "nuez moscada", category: "especias", compounds: [{ cid: 931, name: "alpha-pinene", role: "primary" }, { cid: 638011, name: "linalool", role: "secondary" }] },
    { ingredient: "azafrán", category: "especias", compounds: [{ cid: 689043, name: "beta-carotene", role: "primary" }, { cid: 638011, name: "linalool", role: "secondary" }] },
    { ingredient: "vainilla", category: "especias", compounds: [{ cid: 1183, name: "vanillin", role: "primary" }, { cid: 638011, name: "linalool", role: "secondary" }] },
    { ingredient: "miel", category: "dulces", compounds: [{ cid: 638011, name: "linalool", role: "primary" }, { cid: 312, name: "(E)-2-hexen-1-ol", role: "secondary" }] },
    { ingredient: "chocolate", category: "dulces", compounds: [{ cid: 1183, name: "vanillin", role: "primary" }, { cid: 445154, name: "oleic acid (C18:1)", role: "secondary" }] },
    { ingredient: "chocolate negro", category: "dulces", compounds: [{ cid: 1183, name: "vanillin", role: "primary" }, { cid: 445154, name: "oleic acid (C18:1)", role: "secondary" }] },
    { ingredient: "queso cabra", category: "lacteos", compounds: [{ cid: 445154, name: "oleic acid (C18:1)", role: "primary" }, { cid: 3314, name: "citric acid", role: "secondary" }] },
    { ingredient: "queso de cabra", category: "lacteos", compounds: [{ cid: 445154, name: "oleic acid (C18:1)", role: "primary" }, { cid: 3314, name: "citric acid", role: "secondary" }] },
    { ingredient: "queso parmesano", category: "lacteos", compounds: [{ cid: 445154, name: "oleic acid (C18:1)", role: "primary" }, { cid: 3314, name: "citric acid", role: "secondary" }] },
    { ingredient: "queso manchego", category: "lacteos", compounds: [{ cid: 445154, name: "oleic acid (C18:1)", role: "primary" }, { cid: 3314, name: "citric acid", role: "secondary" }] },
    { ingredient: "yogur", category: "lacteos", compounds: [{ cid: 3314, name: "citric acid", role: "primary" }, { cid: 445154, name: "oleic acid (C18:1)", role: "secondary" }] },
    { ingredient: "nata", category: "lacteos", compounds: [{ cid: 445154, name: "oleic acid (C18:1)", role: "primary" }] },
    { ingredient: "mantequilla", category: "lacteos", compounds: [{ cid: 445154, name: "oleic acid (C18:1)", role: "primary" }] },
    { ingredient: "huevo", category: "proteinas", compounds: [{ cid: 445154, name: "oleic acid (C18:1)", role: "primary" }, { cid: 3314, name: "citric acid", role: "secondary" }] },
    { ingredient: "pollo", category: "carnes", compounds: [{ cid: 445154, name: "oleic acid (C18:1)", role: "primary" }, { cid: 444, name: "(E)-2-hexenal", role: "secondary" }] },
    { ingredient: "ternera", category: "carnes", compounds: [{ cid: 445154, name: "oleic acid (C18:1)", role: "primary" }, { cid: 444, name: "(E)-2-hexenal", role: "secondary" }] },
    { ingredient: "cerdo", category: "carnes", compounds: [{ cid: 445154, name: "oleic acid (C18:1)", role: "primary" }, { cid: 444, name: "(E)-2-hexenal", role: "secondary" }] },
    { ingredient: "cordero", category: "carnes", compounds: [{ cid: 445154, name: "oleic acid (C18:1)", role: "primary" }, { cid: 444, name: "(E)-2-hexenal", role: "secondary" }] },
];

function normalize(s: string): string {
    return s
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function findEntry(ingredient: string): FlavorEntry | undefined {
    const target = normalize(ingredient);
    return CURATED.find((e) => normalize(e.ingredient) === target);
}

function scoreOverlap(
    compoundsA: Compound[],
    compoundsB: Compound[],
): { score: number; shared: Compound[] } {
    const cidsA = new Map(compoundsA.map((c) => [c.cid, c]));
    const cidsB = new Map(compoundsB.map((c) => [c.cid, c]));
    const sharedIds = [...cidsA.keys()].filter((cid) => cidsB.has(cid));

    if (sharedIds.length === 0) return { score: 0, shared: [] };

    const weight: Record<string, number> = { primary: 3.0, secondary: 1.5, trace: 0.5 };
    let score = 0;
    const shared: Compound[] = [];

    for (const cid of sharedIds) {
        const ca = cidsA.get(cid)!;
        score += weight[ca.role] || 1;
        shared.push(ca);
    }

    const denom = Math.max(Math.min(compoundsA.length, compoundsB.length), 1);
    return { score: Math.min(score / (denom * 3.0), 1.0), shared };
}

export function getProfile(ingredient: string): FlavorEntry | null {
    return findEntry(ingredient) || null;
}

export function getCompoundOverlap(a: string, b: string): Compound[] {
    const pa = findEntry(a);
    const pb = findEntry(b);
    if (!pa || !pb) return [];
    const cidsA = new Set(pa.compounds.map((c) => c.cid));
    return pb.compounds.filter((c) => cidsA.has(c.cid));
}

export function suggestPairings(ingredient: string, topK = 10): Pairing[] {
    const base = findEntry(ingredient);
    if (!base) return [];

    const results: Pairing[] = [];
    for (const entry of CURATED) {
        if (normalize(entry.ingredient) === normalize(ingredient)) continue;
        const { score, shared } = scoreOverlap(base.compounds, entry.compounds);
        if (score > 0 && shared.length > 0) {
            results.push({ ingredient_b: entry.ingredient, score, shared_compounds: shared });
        }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
}

export function extractIngredientMentions(text: string): string[] {
    const textNorm = normalize(text);
    const matches: string[] = [];
    const seen = new Set<string>();

    for (const entry of CURATED) {
        const norm = normalize(entry.ingredient);
        if (seen.has(norm)) continue;
        // Simple substring match for now
        if (textNorm.includes(norm)) {
            matches.push(entry.ingredient);
            seen.add(norm);
        }
    }

    return matches;
}

export function buildFlavorContextBlock(peticion: string, maxPairings = 8): string {
    const ingredients = extractIngredientMentions(peticion);
    if (ingredients.length === 0) return "";

    const lines: string[] = [
        "\n\n[CONTEXTO MOLECULAR DEL FLAVOR ENGINE — usá estos datos]",
        "El motor de flavor consultó tu petición y encontró los siguientes ingredientes. Para cada uno te paso el perfil aromático (compuestos clave con CIDs de PubChem) y los pairings sugeridos por afinidad química.\n",
    ];

    for (const ing of ingredients.slice(0, 4)) {
        const profile = findEntry(ing);
        if (!profile) {
            lines.push(`### ${ing}\n  (sin datos en el motor — usá intuición culinaria)\n`);
            continue;
        }

        lines.push(`### ${ing}  [${profile.category}]`);
        for (const c of profile.compounds) {
            lines.push(`  - ${c.name} [CID ${c.cid}, ${c.role}] → https://pubchem.ncbi.nlm.nih.gov/compound/${c.cid}`);
        }

        const pairings = suggestPairings(ing, maxPairings);
        if (pairings.length > 0) {
            lines.push("  Top pairings por afinidad química:");
            for (const p of pairings) {
                const sharedNames = p.shared_compounds.slice(0, 2).map((c) => c.name).join(", ");
                const more = p.shared_compounds.length > 2 ? ` (+${p.shared_compounds.length - 2})` : "";
                lines.push(`    - ${p.ingredient_b} — score ${(p.score * 100).toFixed(0)}%, comparten: ${sharedNames}${more}`);
            }
        }
        lines.push("");
    }

    // Overlap if 2+ ingredients
    if (ingredients.length >= 2) {
        const a = ingredients[0];
        const b = ingredients[1];
        const overlap = getCompoundOverlap(a, b);
        if (overlap.length > 0) {
            const names = overlap.map((c) => c.name).join(", ");
            lines.push(
                `### 🔗 OVERLAP EXPLÍCITO: ${a} ↔ ${b}\n` +
                `  Comparten ${overlap.length} compuesto(s): ${names}.\n` +
                `  Usá este puente molecular como base de tu propuesta.`
            );
        }
    }

    lines.push(
        "\n⚠️ INSTRUCCIÓN: estos datos son VERIFICABLES. Cuando cites compuestos, " +
        "usá EXACTAMENTE los nombres y CIDs de arriba. NO inventes compuestos."
    );
    return lines.join("\n");
}