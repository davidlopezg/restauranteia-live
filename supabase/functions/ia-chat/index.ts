// Edge Function: ia-chat
// Replaces POST /api/ia/chat
// Ported from agents/creativo/agent.py procesar_mensaje_chat

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleOptions, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { callMinimax } from "../_shared/ia-client.ts";
import { formatearRestaurante, formatearCatalogo, loadRestaurante, loadCatalogo } from "../_shared/context.ts";
import { PROMPT_CHAT } from "../_shared/prompts.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
    const opt = handleOptions(req);
    if (opt) return opt;

    try {
        const body = await req.json();
        const peticion = body.peticion || "";
        if (!peticion.trim()) return errorResponse("peticion es obligatorio", 400);

        let systemPrompt = PROMPT_CHAT;

        // Load restaurant context
        const restaurante = await loadRestaurante(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const restStr = formatearRestaurante(restaurante);
        if (restStr) systemPrompt += restStr;

        // Load catalog
        const catalogo = await loadCatalogo(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const catStr = formatearCatalogo(catalogo);
        if (catStr) systemPrompt += catStr;

        // Try to load saved ideas from the ideas database
        try {
            const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { db: { schema: "notion_migration" } });
            const { data: ideas } = await admin
                .from("ideas")
                .select("id, titulo, descripcion, estado_idea")
                .order("created_at", { ascending: false })
                .limit(10);

            if (ideas && ideas.length > 0) {
                const ideasLines = [
                    "\n\n[IDEAS GUARDADAS — memoria del proyecto]",
                    "El hostelero ha guardado las siguientes ideas en conversaciones previas. Si alguna es relevante, mencionala.\n",
                ];
                for (const i of ideas) {
                    ideasLines.push(`- #${i.id}: ${i.titulo || i.descripcion?.slice(0, 200) || ""}`);
                }
                ideasLines.push("\nEsto es contexto privado. NO lo listes entero en tu respuesta, usá solo lo relevante.");
                systemPrompt += ideasLines.join("\n");
            }
        } catch { /* ignore */ }

        // Build user message
        let userMsg = peticion;
        const contexto = body.contexto;
        if (contexto) {
            userMsg = `Contexto del producto actual:\n${JSON.stringify(contexto, null, 2)}\n\nPregunta del usuario: ${peticion}`;
        }

        userMsg += "\n\n---\n\n⚠️ RECORDATORIO FINAL ⚠️\nResponde SOLO en español (castellano). Prohibido: inglés, francés, cirílico, hanzi, kanji. Solo alfabeto latino.";

        const respuesta = await callMinimax({ systemPrompt, userPrompt: userMsg }, SUPABASE_URL, SUPABASE_SERVICE_KEY);
        return jsonResponse({ respuesta });
    } catch (e) {
        return errorResponse(e instanceof Error ? e.message : String(e));
    }
});