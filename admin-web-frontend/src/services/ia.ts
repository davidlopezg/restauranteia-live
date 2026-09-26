import { getSupabase } from "@/lib/supabase";
import type {
    IaAplicarMetodoRequest,
    IaAplicarMetodoResponse,
    IaChatRequest,
    IaChatResponse,
    IaGenerarIdeasRequest,
    IaGenerarIdeasResponse,
    IaIdeaCientificaRequest,
    IaMetodosResponse,
    IaStatusResponse,
    GenerarFichaResponse,
} from "@/types/ia";

// Servicios de IA ahora viajan por Supabase Edge Functions.
// Reemplaza admin-web/backend/routers/ia.py completamente.

// Métodos creativos estáticos (ya no va a FastAPI)
export const METODOS_CREATIVOS = [
    "autóctono", "influencias externas", "búsqueda técnico-conceptual",
    "los sentidos", "el sexto sentido", "simbiosis dulce/salado",
    "productos comerciales", "deconstrucción", "minimalismo",
    "asociación", "inspiración", "adaptación", "sinergia",
];

export const iaKeys = {
    status: () => ["ia", "status"] as const,
    metodos: () => ["ia", "metodos"] as const,
};

function invoke<E = unknown>(functionName: string, body: Record<string, unknown> = {}): Promise<{ data: E | null; error: unknown }> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no está configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.");
    return supabase.functions.invoke<E>(functionName, { body });
}

export const iaService = {
    status: async () => {
        const { data, error } = await invoke<IaStatusResponse>("ia-status");
        if (error) throw error;
        // Normalize response from Edge Function (ia_configured -> configured)
        const raw = data!;
        return {
            configured: raw.ia_configured ?? raw.configured ?? false,
            model: raw.model ?? null,
            base_url: raw.base_url ?? "https://api.minimax.io/v1",
            key_source: raw.key_source ?? "ninguna",
            openrouter_configured: raw.openrouter_configured ?? false,
        };
    },

    metodos: async () => {
        // Los métodos son estáticos, no necesitan Edge Function
        return { metodos: METODOS_CREATIVOS } as IaMetodosResponse;
    },

    generarIdeas: async (body: IaGenerarIdeasRequest) => {
        const { data, error } = await invoke<IaGenerarIdeasResponse>("ia-ideas", {
            action: "generar",
            peticion: body.peticion,
            n: body.n ?? 10,
            ideas_previas: body.ideas_previas,
        });
        if (error) throw error;
        return data!;
    },

    aplicarMetodo: async (body: IaAplicarMetodoRequest) => {
        const { data, error } = await invoke<IaAplicarMetodoResponse>("ia-ideas", {
            action: "aplicar_metodo",
            idea: body.idea,
            metodo: body.metodo,
            peticion_original: body.peticion_original,
        });
        if (error) throw error;
        return data!;
    },

    ideaCientifica: async (body: IaIdeaCientificaRequest) => {
        const { data, error } = await invoke<{ texto: string; modelo: string }>("ia-idea-cientifica", {
            peticion: body.peticion,
        });
        if (error) throw error;
        return data!;
    },

    chat: async (body: IaChatRequest) => {
        const { data, error } = await invoke<IaChatResponse>("ia-chat", {
            peticion: body.peticion,
            contexto: body.contexto,
        });
        if (error) throw error;
        return data!;
    },

    ayudaSemanal: async (body: { peticion?: string } = {}) => {
        const { data, error } = await invoke<{ respuesta: string; contexto_usado: unknown }>("ia-ayuda-semanal", {
            peticion: body.peticion,
        });
        if (error) throw error;
        return data!;
    },

    generarPlating: async (catalogoId: string) => {
        const { data, error } = await invoke<{ generadas: number; propuestas: unknown[]; modelo: string }>("plating-generar", {
            catalogo_id: catalogoId,
        });
        if (error) throw error;
        return data!;
    },

    generarWare: async (catalogoId: string, platingProposalId: string) => {
        const { data, error } = await invoke<{ combinaciones_propuestas: unknown[]; modelo: string }>("ware-generar", {
            catalogo_id: catalogoId,
            plating_proposal_id: platingProposalId,
        });
        if (error) throw error;
        return data!;
    },

    generarFicha: async (testId: string) => {
        const { data, error } = await invoke<GenerarFichaResponse>("generar-ficha", {
            test_id: testId,
        });
        if (error) throw error;
        return data!;
    },
};

// Helper para convertir idea de formato mongo a formato Edge Function
export function normalizeIdea(idea: Record<string, unknown>): Record<string, unknown> {
    return {
        n: idea.n ?? idea.numero ?? 1,
        nombre: idea.nombre ?? idea.titulo ?? "",
        tipo: idea.tipo ?? "",
        por_que: idea.por_que ?? idea.razon ?? idea.descripcion ?? "",
        semilla: idea.semilla ?? "",
    };
}