// supabase/functions/ia-status/index.ts
// Edge Function: estado de configuración de IA (MiniMax + OpenRouter)
//
// Replica GET /api/ia/status + GET /api/settings/key-status del backend FastAPI.
// Lee de app_settings con service_role (bypasea RLS).
// NO expone el valor de las API keys — solo flags.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

interface AppSetting {
    key: string;
    value: string;
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        const { data, error } = await supabaseAdmin
            .from("app_settings")
            .select("key, value")
            .in("key", [
                "minimax_api_key",
                "minimax_base_url",
                "minimax_model",
                "openrouter_api_key",
                "openrouter_base_url",
                "openrouter_model",
            ]);

        if (error) {
            return new Response(
                JSON.stringify({ error: error.message }),
                { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
        }

        const map: Record<string, string> = {};
        for (const r of (data ?? []) as AppSetting[]) {
            map[r.key] = r.value;
        }

        const iaConfigured = Boolean(map["minimax_api_key"]);
        const orConfigured = Boolean(map["openrouter_api_key"]);

        return new Response(
            JSON.stringify({
                ia_configured: iaConfigured,
                model: map["minimax_model"] ?? null,
                base_url: map["minimax_base_url"] ?? "https://api.minimax.io/v1",
                key_source: iaConfigured ? "bd" : "ninguna",
                openrouter_configured: orConfigured,
                openrouter_model: map["openrouter_model"] ?? null,
                openrouter_base_url: map["openrouter_base_url"] ?? null,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    } catch (e) {
        return new Response(
            JSON.stringify({ error: String(e) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }
});