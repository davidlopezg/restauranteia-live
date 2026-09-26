// Edge Function: ia-ideas
// Replaces POST /api/ia/ideas + POST /api/ia/aplicar-metodo + GET /api/ia/metodos
// Ported from agents/creativo/agent.py (_generar_ideas_llm, _aplicar_metodo_a_idea, METODOS_CREATIVOS)

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleOptions, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { callMinimax, parseIdeasFromResponse } from "../_shared/ia-client.ts";
import { formatearRestaurante, formatearCatalogo, loadRestaurante, loadCatalogo } from "../_shared/context.ts";
import { PROMPT_IDEAS_CREATIVAS, PROMPT_METODOS_CREATIVOS, PROMPT_FICHA_TECNICA } from "../_shared/prompts.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
    const opt = handleOptions(req);
    if (opt) return opt;

    try {
        const body = await req.json();
        const action = body.action || "generar";
        const peticion = body.peticion || "";
        const n = body.n || 10;

        // Build system prompt with context
        let systemPrompt = PROMPT_IDEAS_CREATIVAS;
        const restaurante = await loadRestaurante(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const catalogo = await loadCatalogo(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const restStr = formatearRestaurante(restaurante);
        const catStr = formatearCatalogo(catalogo);
        if (restStr) systemPrompt += restStr;
        if (catStr) systemPrompt += catStr;

        if (action === "generar") {
            if (!peticion.trim()) return errorResponse("peticion es obligatorio", 400);

            let userMsg = peticion;
            const ideasPrevias = body.ideas_previas;
            if (ideasPrevias && Array.isArray(ideasPrevias) && ideasPrevias.length > 0) {
                const nombres = ideasPrevias.slice(0, 10).map((i: { nombre: string }) => i.nombre).join(", ");
                userMsg = `${peticion}\n\nIMPORTANTE: ya generaste estas 10 ideas antes, NO las repitas: ${nombres}. Generá 10 ideas COMPLETAMENTE NUEVAS y distintas.`;
            }
            userMsg += "\n\n---\n\n⚠️ RECORDATORIO: Respondé SOLO en castellano. Sin caracteres cirílicos, hanzi, etc.";

            const respuesta = await callMinimax({ systemPrompt, userPrompt: userMsg }, SUPABASE_URL, SUPABASE_SERVICE_KEY);
            const ideas = parseIdeasFromResponse(respuesta);

            return jsonResponse({
                ideas,
                count: ideas.length,
                respuesta,
                modelo: (await import("../_shared/ia-client.ts")).getConfig().model || "MiniMax-M3",
            });
        }

        if (action === "aplicar_metodo") {
            const idea = body.idea;
            const metodo = body.metodo;
            const peticionOriginal = body.peticion_original || "";
            if (!idea || !metodo) return errorResponse("idea y metodo requeridos", 400);

            const userMsg = [
                `El usuario quiere aplicar el método creativo '${metodo}' a esta idea:\n`,
                `**Idea ${idea.n || 1}: ${idea.nombre || idea}**`,
                idea.tipo ? `Tipo: ${idea.tipo}` : "",
                idea.por_que ? `Por qué encaja: ${idea.por_que}` : "",
                idea.semilla ? `Semilla: ${idea.semilla}` : "",
                "",
                `Recordá el contexto original del usuario: ${peticionOriginal || idea.nombre || ""}`,
                "",
                "Devolvé:",
                `1. La idea REFINADA con el método '${metodo}' aplicado (1-2 frases explicando cómo cambió)`,
                `2. 3-5 VARIACIONES derivadas de aplicar el método`,
                `3. Una mini-sección 'Por qué este método funciona acá' (1 frase)`,
                "",
                "Formato: castellano, sin markdown extravagante, conciso.",
                "",
                "⚠️ RECORDATORIO: Respondé SOLO en castellano.",
            ].filter(Boolean).join("\n");

            const resultado = await callMinimax({ systemPrompt, userPrompt: userMsg }, SUPABASE_URL, SUPABASE_SERVICE_KEY);
            return jsonResponse({ resultado, metodo });
        }

        if (action === "metodos") {
            return jsonResponse({ metodos: PROMPT_METODOS_CREATIVOS });
        }

        if (action === "ficha") {
            // Convertir idea en ficha técnica
            const idea = body.idea;
            const peticionOriginal = body.peticion_original || "";
            if (!idea) return errorResponse("idea requerida", 400);

            const fichaPrompt = PROMPT_FICHA_TECNICA;
            const userMsg = [
                `Convertí esta idea creativa del usuario en una FICHA TÉCNICA completa:\n`,
                `**Idea ${idea.n || 1}: ${idea.nombre || "Sin nombre"}**`,
                idea.tipo ? `Tipo: ${idea.tipo}` : "",
                idea.por_que ? `Por qué encaja: ${idea.por_que}` : "",
                idea.semilla ? `Semilla: ${idea.semilla}` : "",
                "",
                `Contexto original del usuario: ${peticionOriginal || ""}`,
                "",
                "Devolvé la ficha con la estructura estándar: nombre, historia, ficha técnica (ingredientes para 4 raciones + elaboración), maridaje, prompt de imagen en inglés.",
            ].filter(Boolean).join("\n");

            const resultado = await callMinimax({ systemPrompt: fichaPrompt, userPrompt: userMsg }, SUPABASE_URL, SUPABASE_SERVICE_KEY);
            return jsonResponse({ resultado, tipo: "ficha" });
        }

        return errorResponse(`Acción desconocida: ${action}`, 400);
    } catch (e) {
        return errorResponse(e instanceof Error ? e.message : String(e));
    }
});