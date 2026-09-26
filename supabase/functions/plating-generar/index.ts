// Edge Function: plating-generar
// Replaces POST /api/catalogos/{catalogo_id}/plating/generar
// Ported from admin-web/backend/context_builder.py + routers/ia.py

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleOptions, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { callMinimax } from "../_shared/ia-client.ts";
import { PROMPT_PLATING } from "../_shared/prompts.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
    const opt = handleOptions(req);
    if (opt) return opt;

    try {
        const url = new URL(req.url);
        const catalogoId = url.searchParams.get("catalogo_id") || url.pathname.split("/").filter(Boolean).pop() || "";
        if (!catalogoId) return errorResponse("catalogo_id es obligatorio", 400);

        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Load product
        const { data: catalogo } = await admin
            .from("catalogos")
            .select("id, titulo, categorias, ingredientes, receta_estructurada, estado, precio")
            .eq("id", catalogoId)
            .limit(1)
            .single();

        if (!catalogo) return errorResponse("Producto no encontrado", 404);

        // Load agenda
        const { data: agenda } = await admin
            .from("agenda_catalogo")
            .select("agenda_id")
            .eq("catalogo_id", catalogoId)
            .limit(1)
            .maybeSingle();

        let ag = null;
        if (agenda) {
            const { data: agendaData } = await admin
                .from("agendas")
                .select("id, titulo, objetivo, estado_desarrollo, receta_final, timeline")
                .eq("id", agenda.agenda_id)
                .limit(1)
                .single();
            ag = agendaData;
        }

        // Load tests/feedback
        let pruebas: unknown[] = [];
        if (ag) {
            const { data: tests } = await admin
                .from("development_tests")
                .select("numero, estado, fecha, objetivo, resultado, observaciones")
                .eq("agenda_id", ag.id)
                .order("numero", { ascending: true })
                .limit(20);
            if (tests) {
                for (const t of tests) {
                    const { data: fb } = await admin
                        .from("test_feedback")
                        .select("mesa, num_personas, valoracion, criterio, observacion")
                        .eq("test_id", t.id)
                        .limit(5);
                    pruebas.push({ ...t, feedbacks: fb || [] });
                }
            }
        }

        // Load ware inventory
        const { data: ware } = await admin
            .from("ware")
            .select("id, nombre, tipo, material, color, forma, tamano")
            .eq("disponibilidad", true)
            .order("tipo", { ascending: true })
            .order("nombre", { ascending: true });

        const contexto = {
            producto: {
                titulo: catalogo.titulo,
                categorias: catalogo.categorias,
                estado: catalogo.estado,
                precio: catalogo.precio,
                ingredientes: catalogo.ingredientes,
                receta_estructurada: catalogo.receta_estructurada,
            },
            agenda_origen: ag ? {
                titulo: ag.titulo,
                objetivo: ag.objetivo,
                estado_desarrollo: ag.estado_desarrollo,
                receta_final: ag.receta_final,
                timeline: ag.timeline,
            } : null,
            historial_pruebas: pruebas,
            vajilla_disponible: ware || [],
            restricciones_restaurante: [
                "Restaurante abierto viernes + sábado",
                "Ticket medio objetivo: 20-25 EUR",
                "Emplatado debe estar listo en <= 6 minutos desde pedido",
                "Vajilla disponible solo del inventario (ver arriba)",
            ],
        };

        const userPrompt = `CONTEXTO DEL PRODUCTO:\n\n${JSON.stringify(contexto, null, 2)}\n\nTAREA:\nGenera 3 propuestas DIFERENCIADAS de emplatado para este plato.\n\nFORMATO DE RESPUESTA (JSON estricto, nada mas):\n[\n  {\n    "nombre": "Nombre corto de la propuesta",\n    "descripcion": "2-3 frases describiendo como se presenta el plato",\n    "vajilla_sugerida": "tipo de pieza recomendada",\n    "razonamiento": "por que este emplatado encaja"\n  },\n  {...segunda propuesta...},\n  {...tercera propuesta...}\n]`;

        const raw = await callMinimax({ systemPrompt: PROMPT_PLATING, userPrompt, temperature: 0.8 }, SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Parse JSON from response
        let props: Array<Record<string, unknown>> = [];
        try {
            // Try to extract JSON array
            const jsonMatch = raw.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                props = JSON.parse(jsonMatch[0]);
            } else {
                props = JSON.parse(raw);
            }
        } catch {
            return errorResponse("No se pudo parsear JSON de la respuesta IA");
        }

        // Get next order number
        const { data: maxOrden } = await admin
            .from("plating_proposals")
            .select("orden")
            .eq("catalogo_id", catalogoId)
            .order("orden", { ascending: false })
            .limit(1)
            .maybeSingle();

        const base = (maxOrden?.orden || 0) + 1;
        const saved = [];

        for (let i = 0; i < Math.min(props.length, 3); i++) {
            const p = props[i];
            const { data: inserted, error: insertError } = await admin
                .from("plating_proposals")
                .insert({
                    catalogo_id: catalogoId,
                    orden: base + i,
                    nombre: String(p.nombre || "").slice(0, 200),
                    descripcion: String(p.descripcion || ""),
                    vajilla_sugerida: String(p.vajilla_sugerida || ""),
                    razonamiento: String(p.razonamiento || ""),
                    contexto_usado: JSON.stringify(contexto),
                    modelo_usado: "MiniMax-M3",
                    estado: "GENERADA",
                })
                .select()
                .single();

            if (inserted) saved.push(inserted);
        }

        return jsonResponse({ generadas: saved.length, propuestas: saved, modelo: "MiniMax-M3" });
    } catch (e) {
        return errorResponse(e instanceof Error ? e.message : String(e));
    }
});