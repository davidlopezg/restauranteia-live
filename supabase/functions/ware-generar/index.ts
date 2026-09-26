// Edge Function: ware-generar
// Replaces GET /api/catalogos/{catalogo_id}/ware/generar
// Ported from admin-web/backend/context_builder.py build_ware_context

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleOptions, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { callMinimax } from "../_shared/ia-client.ts";
import { PROMPT_WARE } from "../_shared/prompts.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
    const opt = handleOptions(req);
    if (opt) return opt;

    try {
        const url = new URL(req.url);
        const pathParts = url.pathname.split("/").filter(Boolean);
        // Expected: /ware-generar?catalogo_id=X&plating_proposal_id=Y
        // or path-based: /catalogos/{id}/ware/generar
        let catalogoId = url.searchParams.get("catalogo_id") || "";
        let platingProposalId = url.searchParams.get("plating_proposal_id") || "";

        // Try path-based extraction
        if (!catalogoId && pathParts.length >= 2) {
            catalogoId = pathParts[pathParts.indexOf("catalogos") + 1] || "";
            platingProposalId = url.searchParams.get("plating_proposal_id") || "";
        }

        if (!catalogoId || !platingProposalId) {
            return errorResponse("catalogo_id y plating_proposal_id son obligatorios", 400);
        }

        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Load product
        const { data: catalogo } = await admin
            .from("catalogos")
            .select("id, titulo, categorias, ingredientes, receta_estructurada")
            .eq("id", catalogoId)
            .limit(1)
            .single();
        if (!catalogo) return errorResponse("Producto no encontrado", 404);

        // Load plating proposal
        const { data: proposal } = await admin
            .from("plating_proposals")
            .select("id, nombre, descripcion, vajilla_sugerida")
            .eq("id", platingProposalId)
            .limit(1)
            .single();
        if (!proposal) return errorResponse("Propuesta de emplatado no encontrada", 404);

        // Load ware inventory
        const { data: ware } = await admin
            .from("ware")
            .select("id, nombre, tipo, marca, material, color, forma, tamano")
            .eq("disponibilidad", true)
            .order("tipo", { ascending: true })
            .order("nombre", { ascending: true });

        const contexto = {
            producto: catalogo,
            emplatado_elegido: proposal,
            inventario_vajilla: ware || [],
            restricciones: [
                "Usar SOLO piezas del inventario",
                "Las 3 propuestas deben ser DIFERENCIADAS entre si",
            ],
        };

        const userPrompt = `CONTEXTO:\n\n${JSON.stringify(contexto, null, 2)}\n\nTAREA:\nElige 3 combinaciones DIFERENTES de vajilla del inventario para este plato.\n\nFORMATO DE RESPUESTA (JSON estricto):\n[\n  {\n    "nombre": "Nombre de la combinacion (ej: Servicio clasico)",\n    "piezas": ["nombre EXACTO de pieza 1", "nombre EXACTO de pieza 2"],\n    "explicacion": "Por que cada pieza encaja con el plato y el emplatado elegido"\n  },\n  {...segunda combinacion...},\n  {...tercera combinacion...}\n]\nIMPORTANTE: usa los nombres EXACTOS de las piezas del inventario.`;

        const raw = await callMinimax({ systemPrompt: PROMPT_WARE, userPrompt, temperature: 0.7 }, SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Parse JSON from response
        let combinaciones: unknown[] = [];
        try {
            const jsonMatch = raw.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                combinaciones = JSON.parse(jsonMatch[0]);
            } else {
                combinaciones = JSON.parse(raw);
            }
        } catch {
            return errorResponse("No se pudo parsear JSON de la respuesta IA");
        }

        return jsonResponse({ combinaciones_propuestas: combinaciones, modelo: "MiniMax-M3" });
    } catch (e) {
        return errorResponse(e instanceof Error ? e.message : String(e));
    }
});