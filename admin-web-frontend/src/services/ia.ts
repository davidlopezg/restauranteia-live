import { getSupabase } from "@/lib/supabase";
import { invokeEdgeFunction, isEdgeFunctionMissing } from "@/services/edge-functions";
import { settingsSupabaseService } from "@/services/settings.supabase";
import type {
    GenerarFichaResponse,
    IaAplicarMetodoRequest,
    IaAplicarMetodoResponse,
    IaChatRequest,
    IaChatResponse,
    IaGenerarIdeasRequest,
    IaGenerarIdeasResponse,
    IaIdeaCientificaRequest,
    IaMetodosResponse,
    IaStatusResponse,
} from "@/types/ia";

// Servicios de IA ahora viajan por Supabase Edge Functions.
// Reemplaza admin-web/backend/routers/ia.py completamente.

// Métodos creativos estáticos (ya no va a FastAPI)
export const METODOS_CREATIVOS = [
    "autóctono",
    "influencias externas",
    "búsqueda técnico-conceptual",
    "los sentidos",
    "el sexto sentido",
    "simbiosis dulce/salado",
    "productos comerciales",
    "deconstrucción",
    "minimalismo",
    "asociación",
    "inspiración",
    "adaptación",
    "sinergia",
];

export const iaKeys = {
    status: () => ["ia", "status"] as const,
    metodos: () => ["ia", "metodos"] as const,
};

function invoke<E = unknown>(functionName: string, body: Record<string, unknown> = {}): Promise<E> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no está configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.");
    return invokeEdgeFunction<E>(functionName, body);
}

export const iaService = {
    /**
     * Estado de la IA. FUENTE DE VERDAD = `app_settings` (la BD).
     *
     * La Edge Function `ia-status` es solo un proxy de esa tabla; si no está
     * desplegada consultamos la tabla directamente. Así Configuración e Ideas
     * muestran EXACTAMENTE lo mismo.
     */
    status: async () => {
        try {
            const raw = await invoke<IaStatusResponse>("ia-status");
            return {
                configured: raw.ia_configured ?? raw.configured ?? false,
                model: raw.model ?? null,
                base_url: raw.base_url ?? "https://api.minimax.io/v1",
                key_source: raw.key_source ?? "ninguna",
                openrouter_configured: raw.openrouter_configured ?? false,
            };
        } catch (err) {
            if (!isEdgeFunctionMissing(err)) throw err;
            // Edge Function no desplegada → la BD manda.
            const snap = await settingsSupabaseService.iaStatus();
            return {
                configured: snap.configured,
                model: snap.model,
                base_url: snap.base_url,
                key_source: snap.key_source,
                openrouter_configured: snap.openrouter_configured,
            };
        }
    },

    metodos: async () => {
        // Los métodos son estáticos, no necesitan Edge Function
        return { metodos: METODOS_CREATIVOS } as IaMetodosResponse;
    },

    generarIdeas: async (body: IaGenerarIdeasRequest) => {
        return invoke<IaGenerarIdeasResponse>("ia-ideas", {
            action: "generar",
            peticion: body.peticion,
            n: body.n ?? 10,
            ideas_previas: body.ideas_previas,
        });
    },

    aplicarMetodo: async (body: IaAplicarMetodoRequest) => {
        return invoke<IaAplicarMetodoResponse>("ia-ideas", {
            action: "aplicar_metodo",
            idea: body.idea,
            metodo: body.metodo,
            peticion_original: body.peticion_original,
        });
    },

    ideaCientifica: async (body: IaIdeaCientificaRequest) => {
        return invoke<{ texto: string; modelo: string }>("ia-idea-cientifica", {
            peticion: body.peticion,
        });
    },

    chat: async (body: IaChatRequest) => {
        return invoke<IaChatResponse>("ia-chat", {
            peticion: body.peticion,
            contexto: body.contexto,
        });
    },

    ayudaSemanal: async (body: { peticion?: string } = {}) => {
        return invoke<{ respuesta: string; contexto_usado: unknown }>("ia-ayuda-semanal", {
            peticion: body.peticion,
        });
    },

    generarPlating: async (catalogoId: string) => {
        return invoke<{ generadas: number; propuestas: unknown[]; modelo: string }>("plating-generar", {
            catalogo_id: catalogoId,
        });
    },

    generarWare: async (catalogoId: string, platingProposalId: string) => {
        return invoke<{ combinaciones_propuestas: unknown[]; modelo: string }>("ware-generar", {
            catalogo_id: catalogoId,
            plating_proposal_id: platingProposalId,
        });
    },

    generarFicha: async (testId: string) => {
        return invoke<GenerarFichaResponse>("generar-ficha", {
            test_id: testId,
        });
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
