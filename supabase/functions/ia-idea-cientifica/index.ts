// Edge Function: ia-idea-cientifica
// Replaces POST /api/ia/idea-cientifica
// Ported from agents/creativo/agent.py procesar_mensaje_idea_cientifica

import { corsHeaders, handleOptions, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { callMinimax } from "../_shared/ia-client.ts";
import { formatearRestaurante, formatearCatalogo, loadRestaurante, loadCatalogo } from "../_shared/context.ts";
import { PROMPT_IDEA_CIENTIFICA } from "../_shared/prompts.ts";
import { buildFlavorContextBlock } from "../_shared/flavor-engine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
    const opt = handleOptions(req);
    if (opt) return opt;

    try {
        const body = await req.json();
        const peticion = body.peticion || "";
        if (!peticion.trim()) return errorResponse("peticion es obligatorio", 400);

        let systemPrompt = PROMPT_IDEA_CIENTIFICA;

        // Load restaurant context
        const restaurante = await loadRestaurante(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const restStr = formatearRestaurante(restaurante);
        if (restStr) systemPrompt += restStr;

        // Load catalog
        const catalogo = await loadCatalogo(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const catStr = formatearCatalogo(catalogo);
        if (catStr) systemPrompt += catStr;

        // Inject flavor engine data
        try {
            const flavorBlock = buildFlavorContextBlock(peticion);
            if (flavorBlock) {
                systemPrompt += flavorBlock;
            }
        } catch (e) {
            systemPrompt += `\n\n[NOTA INTERNA — flavor engine no disponible: ${e}]. Trabajá desde intuición culinaria.`;
        }

        const instruccionIdioma = "\n\n---\n\n⚠️ RECORDATORIO FINAL ⚠️\nResponde SOLO en español (castellano). PROHIBIDO inglés. Prohibido caracteres cirílicos, hanzi, etc.";
        const userMsg = peticion + instruccionIdioma;

        const respuesta = await callMinimax({ systemPrompt, userPrompt: userMsg }, SUPABASE_URL, SUPABASE_SERVICE_KEY);
        return jsonResponse({ texto: respuesta, modelo: (await import("../_shared/ia-client.ts")).getConfig().model || "MiniMax-M3" });
    } catch (e) {
        return errorResponse(e instanceof Error ? e.message : String(e));
    }
});