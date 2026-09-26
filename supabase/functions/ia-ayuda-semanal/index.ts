// Edge Function: ia-ayuda-semanal
// Replaces POST /api/ia/ayuda-semanal
// Ported from admin-web/backend/routers/ia.py ia_ayuda_semanal

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleOptions, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { callMinimax } from "../_shared/ia-client.ts";
import { PROMPT_CHAT } from "../_shared/prompts.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
    const opt = handleOptions(req);
    if (opt) return opt;

    try {
        const body = await req.json();
        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { db: { schema: "notion_migration" } });

        // Load context from DB: products in development
        const { data: enDesarrollo } = await admin
            .from("agendas")
            .select("id, titulo, estado_desarrollo, objetivo")
            .not("estado_desarrollo", "is", null)
            .neq("estado_desarrollo", "PRODUCTO")
            .order("migrated_at", { ascending: false })
            .limit(10);

        // Latest finished products
        const { data: ultimos } = await admin
            .from("catalogos")
            .select("titulo, migrated_at")
            .eq("estado", "Listo")
            .order("migrated_at", { ascending: false })
            .limit(3);

        // Recent ideas
        const { data: ideas } = await admin
            .from("ideas")
            .select("titulo, estado_idea, categorias")
            .order("migrated_at", { ascending: false })
            .limit(5);

        const ctx = {
            productos_en_desarrollo: (enDesarrollo ?? []).map((a: Record<string, unknown>) => ({
                titulo: a.titulo,
                estado: a.estado_desarrollo,
            })),
            ultimos_productos_terminados: (ultimos ?? []).map((p: Record<string, unknown>) => ({
                titulo: p.titulo,
            })),
            ideas_recientes: (ideas ?? []).map((i: Record<string, unknown>) => ({
                titulo: i.titulo,
                estado: i.estado_idea,
            })),
        };

        const peticion = body.peticion || (
            `Tengo estos productos en desarrollo: ${JSON.stringify(ctx)}. ` +
            "Qué me recomiendas para cumplir el objetivo semanal de 1 producto terminado?"
        );

        const systemPrompt = PROMPT_CHAT;
        const userMsg = peticion + "\n\n⚠️ RECORDATORIO: Respondé SOLO en español (castellano).";

        const respuesta = await callMinimax({ systemPrompt, userPrompt: userMsg }, SUPABASE_URL, SUPABASE_SERVICE_KEY);
        return jsonResponse({ respuesta, contexto_usado: ctx });
    } catch (e) {
        return errorResponse(e instanceof Error ? e.message : String(e));
    }
});