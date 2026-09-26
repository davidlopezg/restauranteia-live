// Edge Function: generar-ficha
// Replaces POST /api/tests/{test_id}/generar-ficha
// Ported from admin-web/backend/openrouter_client.py generar_ficha

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleOptions, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { callOpenRouter } from "../_shared/ia-client.ts";
import { PROMPT_FICHA_TEST } from "../_shared/prompts.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
    const opt = handleOptions(req);
    if (opt) return opt;

    try {
        const body = await req.json();
        const testId = body.test_id || "";
        if (!testId) return errorResponse("test_id es obligatorio", 400);

        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { db: { schema: "notion_migration" } });

        // Read OpenRouter settings
        const { data: settings } = await admin
            .from("app_settings")
            .select("key, value")
            .in("key", ["openrouter_api_key", "openrouter_model", "openrouter_base_url", "prompt_ficha_test"]);

        const map: Record<string, string> = {};
        for (const r of (settings ?? []) as { key: string; value: string }[]) {
            map[r.key] = r.value;
        }

        if (!map["openrouter_api_key"]) {
            return errorResponse("OpenRouter API key no configurada. Añádela en Settings.", 503);
        }
        if (!map["prompt_ficha_test"]) {
            return errorResponse("Prompt de ficha no configurado. Añádelo en Settings.", 503);
        }

        // Load test with agenda
        const { data: test } = await admin
            .from("development_tests")
            .select("*, agendas!inner(titulo, objetivo)")
            .eq("id", testId)
            .limit(1)
            .single();

        if (!test) return errorResponse("Prueba no encontrada", 404);

        // Load related catalog
        const { data: agendaCatalogo } = await admin
            .from("agenda_catalogo")
            .select("catalogo_id")
            .eq("agenda_id", test.agenda_id)
            .limit(1)
            .maybeSingle();

        let ingredientes = "";
        if (agendaCatalogo) {
            const { data: cat } = await admin
                .from("catalogos")
                .select("ingredientes")
                .eq("id", agendaCatalogo.catalogo_id)
                .limit(1)
                .single();
            if (cat) ingredientes = cat.ingredientes || "";
        }

        const contexto = {
            producto: test.agendas?.titulo || "",
            objetivo_prueba: test.agendas?.objetivo || "",
            receta_utilizada: test.receta_utilizada || "",
            modificaciones: test.modificaciones || "",
            numero_prueba: test.numero || 1,
            estado_desarrollo: test.estado_desarrollo || "",
            ingredientes,
            feedback_previo: "",
        };

        const userPrompt = (map["prompt_ficha_test"] || "").replace("{contexto}", JSON.stringify(contexto, null, 2));

        const texto = await callOpenRouter(PROMPT_FICHA_TEST, userPrompt, SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Save generated fichas
        const fichaGuardada = JSON.stringify({
            texto,
            modelo: map["openrouter_model"] || "nano-banana/nano-banana",
            proveedor: "OpenRouter",
            prompt_usado: userPrompt.slice(0, 500),
        });

        const { error: updateError } = await admin
            .from("development_tests")
            .update({ ficha_generada: fichaGuardada })
            .eq("id", testId);

        return jsonResponse({
            texto,
            modelo: map["openrouter_model"] || "nano-banana/nano-banana",
            guardado: !updateError,
        });
    } catch (e) {
        return errorResponse(e instanceof Error ? e.message : String(e));
    }
});