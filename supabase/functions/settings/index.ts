// supabase/functions/settings/index.ts
// Edge Function: CRUD de app_settings
//
// Replica PATCH /api/settings del backend FastAPI.
// Usa service_role para escribir (la RLS protege lectura desde anon).
// Valida que las claves recibidas sean de la whitelist.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

// Whitelist de settings que se pueden actualizar
const UPDATABLE_KEYS = new Set([
    "minimax_api_key",
    "minimax_base_url",
    "minimax_model",
    "openrouter_api_key",
    "openrouter_base_url",
    "openrouter_model",
    "prompt_ficha_test",
]);

interface RequestBody {
    keys: Record<string, string>;
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST" && req.method !== "PATCH") {
        return new Response(
            JSON.stringify({ error: "Method not allowed" }),
            { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    try {
        const body: RequestBody = await req.json();
        const keys = body.keys ?? {};

        // Filtrar solo claves permitidas
        const validKeys: Record<string, string> = {};
        const rejected: string[] = [];
        for (const [k, v] of Object.entries(keys)) {
            if (UPDATABLE_KEYS.has(k)) {
                validKeys[k] = String(v);
            } else {
                rejected.push(k);
            }
        }

        if (Object.keys(validKeys).length === 0) {
            return new Response(
                JSON.stringify({ error: "Sin claves válidas para actualizar", rejected }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
        }

        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            { db: { schema: "notion_migration" } },
        );

        // Upsert cada key (idempotente)
        const results: Record<string, string> = {};
        for (const [key, value] of Object.entries(validKeys)) {
            const { error } = await supabaseAdmin
                .from("app_settings")
                .upsert({ key, value }, { onConflict: "key" });
            if (error) {
                return new Response(
                    JSON.stringify({ error: `Failed to upsert ${key}: ${error.message}` }),
                    { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                );
            }
            results[key] = "updated";
        }

        return new Response(
            JSON.stringify({ updated: results, rejected }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    } catch (e) {
        return new Response(
            JSON.stringify({ error: String(e) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }
});