// Edge Function: ia-emplatado-imagen
// FASE 8 — Genera 3 propuestas de IMAGEN de emplatado para un producto del catalogo.
// Usa OpenRouter (mismo proveedor que ia-ideas, modelo distinto).
//
// Endpoints:
//   POST {catalogo_id} en path  o  POST con {catalogo_id} en body
//
// Lee de app_settings:
//   - openrouter_api_key       (obligatorio)
//   - openrouter_base_url      (opcional, default https://openrouter.ai/api/v1)
//   - openrouter_image_model   (opcional, default 'nano-banana/nano-banana')
//   - prompt_emplatado         (obligatorio, plantilla con {{...}})

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleOptions, jsonResponse, errorResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REQUEST_TIMEOUT = 120_000;

interface ImagenItem { url: string; source: "url" | "b64"; }
interface OpenRouterImagenResp { imagenes: ImagenItem[]; modelo: string; endpoint: string; }

/**
 * Intenta POST {base}/images/generations (estilo DALL-E, n>1).
 * Devuelve lista de URLs/base64 si OK, null si el endpoint no existe.
 */
async function tryImagesGenerations(
    baseUrl: string, apiKey: string, model: string, prompt: string, n: number,
): Promise<string[] | null> {
    const url = `${baseUrl.replace(/\/+$/, "")}/images/generations`;
    try {
        const r = await fetch(url, {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model, prompt, n, size: "1024x1024", response_format: "url",
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT),
        });
        if (r.status === 404) {
            console.log("endpoint /images/generations no soportado");
            return null;
        }
        if (!r.ok) {
            console.warn(`images/generations [${r.status}]: ${(await r.text()).slice(0, 200)}`);
            return null;
        }
        const data = await r.json();
        const out: string[] = [];
        for (const item of (data.data ?? [])) {
            const u = item?.url ?? item?.b64_json;
            if (u) out.push(u);
        }
        return out.length ? out : null;
    } catch (e) {
        console.warn("images/generations error:", e);
        return null;
    }
}

/**
 * Fallback: POST {base}/chat/completions con modalities=['image','text'].
 * Hace n llamadas con seeds distintos (1 sola imagen por llamada).
 */
async function tryChatModalities(
    baseUrl: string, apiKey: string, model: string, prompt: string, n: number,
): Promise<string[]> {
    const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
        try {
            const r = await fetch(url, {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model,
                    modalities: ["image", "text"],
                    messages: [{ role: "user", content: prompt }],
                    seed: i + 1,
                    temperature: 0.8,
                }),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT),
            });
            if (!r.ok) {
                console.warn(`chat/completions [${r.status}] intento ${i + 1}`);
                continue;
            }
            const data = await r.json();
            const msg = data?.choices?.[0]?.message ?? {};
            const images = msg.images ?? [];
            for (const im of images) {
                const u = typeof im === "string" ? im : im?.image_url?.url;
                if (u) {
                    out.push(u);
                    break;
                }
            }
        } catch (e) {
            console.warn(`chat/completions intento ${i + 1} error:`, e);
        }
    }
    return out;
}

Deno.serve(async (req: Request) => {
    const opt = handleOptions(req);
    if (opt) return opt;

    try {
        const body = await req.json().catch(() => ({}));
        const url = new URL(req.url);
        const catalogoId = body?.catalogo_id
            ?? url.searchParams.get("catalogo_id")
            ?? url.pathname.split("/").filter(Boolean).pop()
            ?? "";
        const n = Math.min(4, Math.max(1, Number(body?.n ?? 3)));

        if (!catalogoId) return errorResponse("catalogo_id es obligatorio", 400);

        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { db: { schema: "notion_migration" } });

        // 1) Leer settings
        const { data: settings } = await admin
            .from("app_settings")
            .select("key, value")
            .in("key", ["openrouter_api_key", "openrouter_base_url", "openrouter_image_model", "prompt_emplatado"]);
        const map: Record<string, string> = {};
        for (const r of (settings ?? []) as { key: string; value: string }[]) {
            map[r.key] = r.value ?? "";
        }

        const apiKey = map["openrouter_api_key"];
        if (!apiKey) return errorResponse("OpenRouter API key no configurada. Anadela en Settings.", 503);
        const promptTemplate = map["prompt_emplatado"];
        if (!promptTemplate) return errorResponse("prompt_emplatado no configurado. Anadelo en Settings.", 503);

        const baseUrl = map["openrouter_base_url"] || "https://openrouter.ai/api/v1";
        const model = map["openrouter_image_model"] || "nano-banana/nano-banana";

        // 2) Leer catalogo
        const { data: catalogo } = await admin
            .from("catalogos")
            .select("id, titulo, categorias, ingredientes, receta_estructurada, receta_tecnica")
            .eq("id", catalogoId)
            .limit(1)
            .single();
        if (!catalogo) return errorResponse("Producto no encontrado", 404);

        // 3) Construir prompt sustituyendo placeholders
        const recetaTecnica = catalogo.receta_tecnica ?? {};
        const recetaEstructurada = catalogo.receta_estructurada ?? {};

        // ingredientes: array de objetos (FASE 8) o texto libre (legacy)
        let ingredientes: unknown = recetaTecnica.ingredientes ?? recetaEstructurada.ingredientes ?? "";
        let ingredientesTxt = "";
        if (Array.isArray(ingredientes)) {
            ingredientesTxt = ingredientes.map((ing: Record<string, unknown>) => {
                if (typeof ing !== "object" || ing === null) return `- ${ing}`;
                const nombre = String(ing.nombre ?? ing.name ?? "");
                const cantidad = String(ing.cantidad ?? ing.qty ?? "").trim();
                const unidad = String(ing.unidad ?? ing.unit ?? "").trim();
                const sufijo = [cantidad, unidad].filter(p => p && p !== "None" && p !== "0").join(" ");
                return `- ${nombre}${sufijo ? " — " + sufijo : ""}`;
            }).join("\n");
        } else {
            ingredientesTxt = String(ingredientes);
        }

        const miseEnPlace = recetaTecnica.elaboracion_mise_en_place
            ?? recetaEstructurada.proceso
            ?? "";
        const servicio = recetaTecnica.elaboracion_servicio
            ?? recetaEstructurada.montaje
            ?? recetaEstructurada.proceso
            ?? "";

        const categorias = Array.isArray(catalogo.categorias)
            ? catalogo.categorias.join(", ")
            : String(catalogo.categorias ?? "");

        const finalPrompt = promptTemplate
            .replace(/\{\{titulo\}\}/g, String(catalogo.titulo ?? ""))
            .replace(/\{\{ingredientes\}\}/g, ingredientesTxt)
            .replace(/\{\{mise_en_place\}\}/g, String(miseEnPlace))
            .replace(/\{\{servicio\}\}/g, String(servicio))
            .replace(/\{\{proceso\}\}/g, String(recetaEstructurada.proceso ?? ""))
            .replace(/\{\{cantidades\}\}/g, String(recetaEstructurada.cantidades ?? ""))
            .replace(/\{\{categorias\}\}/g, categorias);

        // 4) Generar imagenes
        let urls = await tryImagesGenerations(baseUrl, apiKey, model, finalPrompt, n);
        let endpoint = "images_generations";
        if (!urls || urls.length < n) {
            const fallback = await tryChatModalities(baseUrl, apiKey, model, finalPrompt, n);
            if (fallback.length >= (urls?.length ?? 0)) {
                urls = fallback;
                endpoint = "chat_modalities";
            }
        }

        if (!urls || urls.length === 0) {
            return errorResponse(
                `OpenRouter no devolvio imagenes. Modelo '${model}' puede no soportar generacion. ` +
                `Prueba cambiar openrouter_image_model en Settings.`,
                502,
            );
        }

        const imagenes: ImagenItem[] = urls.slice(0, n).map((u) => ({
            url: u,
            source: u.startsWith("data:") ? "b64" : "url",
        }));

        const result: OpenRouterImagenResp = { imagenes, modelo: model, endpoint };
        return jsonResponse({
            catalogo_id: catalogoId,
            ...result,
            prompt_usado: finalPrompt.slice(0, 500),
        });
    } catch (e) {
        return errorResponse(e instanceof Error ? e.message : String(e), 500);
    }
});