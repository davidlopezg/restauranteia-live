// supabase/functions/test-providers/index.ts
// Edge Function: probe real de los proveedores de IA (MiniMax + OpenRouter)
//
// Replica GET /api/settings/test-providers del backend FastAPI.
// Hace pings HTTP reales a los proveedores con las keys guardadas en app_settings.
// NUNCA expone el valor de las keys — solo prefix (10 chars) + length + status.

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

function sanitizeError(status: number, body: string): string {
    if (!body) return "";
    const masked = body.replace(/(sk-[a-zA-Z0-9_\-]{6})[a-zA-Z0-9_\-]+/g, "$1***");
    return masked.replace(/(Bearer\s+)[a-zA-Z0-9_\-]+/g, "$1***").slice(0, 400);
}

function classifyStatus(status: number): string {
    if (status === 401) return "AUTH_ERROR";
    if (status === 403) return "FORBIDDEN";
    if (status === 404) return "NOT_FOUND";
    if (status === 400) return "BAD_REQUEST";
    if (status === 429) return "RATE_LIMITED";
    if (status >= 500 && status < 600) return "PROVIDER_ERROR";
    return `HTTP_${status}`;
}

async function probeProvider(
    name: string,
    baseUrl: string,
    apiKey: string,
    model: string,
): Promise<Record<string, unknown>> {
    if (!apiKey) {
        return {
            provider: name,
            ok: false,
            status: "CONFIGURATION_ERROR",
            model,
            key_prefix: null,
            key_length: 0,
            error: "No hay API key configurada",
        };
    }
    const prefix = apiKey.length >= 10 ? apiKey.slice(0, 10) : apiKey.slice(0, 4);

    try {
        const r = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                messages: [{ role: "user", content: "ping" }],
                max_tokens: 1,
                temperature: 0,
            }),
            signal: AbortSignal.timeout(30_000),
        });
        const ok = r.status < 400;
        const body = await r.text();
        return {
            provider: name,
            ok,
            status: ok ? "OK" : classifyStatus(r.status),
            http_status: r.status,
            model,
            base_url: baseUrl,
            endpoint: `${baseUrl.replace(/\/$/, "")}/chat/completions`,
            key_prefix: prefix,
            key_length: apiKey.length,
            error: ok ? null : sanitizeError(r.status, body),
        };
    } catch (e) {
        const isTimeout = e instanceof Error && e.name === "TimeoutError";
        return {
            provider: name,
            ok: false,
            status: isTimeout ? "NETWORK_ERROR" : "NETWORK_ERROR",
            model,
            key_prefix: prefix,
            key_length: apiKey.length,
            error: isTimeout ? "Timeout al conectar" : String(e).slice(0, 200),
        };
    }
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            { db: { schema: "notion_migration" } },
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

        // --- MiniMax ---
        const miniKey = map["minimax_api_key"] ?? "";
        const miniBase = map["minimax_base_url"] || "https://api.minimax.io/v1";
        const miniModel = map["minimax_model"] || "MiniMax-M3";
        const mini = await probeProvider("MiniMax", miniBase, miniKey, miniModel);
        mini.key_source = miniKey ? "bd" : "ninguna";

        // --- OpenRouter ---
        const orKey = map["openrouter_api_key"] ?? "";
        const orBase = map["openrouter_base_url"] || "https://openrouter.ai/api/v1";
        const orModel = map["openrouter_model"] || "openai/gpt-4o-mini";
        const orRes = await probeProvider("OpenRouter", orBase, orKey, orModel);
        orRes.key_source = orKey ? "bd" : "ninguna";

        return new Response(
            JSON.stringify({
                minimax: mini,
                openrouter: orRes,
                priority_rule: "BD > ENV (cache en memoria invalidado en PATCH /api/settings)",
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