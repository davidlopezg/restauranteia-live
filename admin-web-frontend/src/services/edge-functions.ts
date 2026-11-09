/**
 * Invocación de Edge Functions con errores accionables.
 *
 * POR QUÉ EXISTE ESTE MÓDULO
 * --------------------------
 * Cuando una Edge Function NO está desplegada en el proyecto, el gateway de
 * Supabase responde `404 NOT_FOUND` **sin `content-type` en los headers CORS**.
 * El navegador hace primero un preflight (OPTIONS) para un POST con JSON, ese
 * preflight falla y el navegador corta la petición → supabase-js lanza
 * `FunctionsFetchError` ("Failed to send a request to the Edge Function") SIN
 * código HTTP. O sea: el 404 real nunca llega al frontend.
 *
 * Consecuencia práctica: "la función no existe" y "no hay red" se ven igual.
 * Las dos se tratan como "no desplegada" porque el fallback a PostgREST
 * (la BD, que siempre está) funciona en ambos casos.
 *
 * La fuente de verdad de la configuración de IA es SIEMPRE la tabla
 * `app_settings`; las Edge Functions son solo un proxy (leen con service_role).
 */

export type EdgeFunctionErrorKind = "no-desplegada" | "http" | "red";

export class EdgeFunctionError extends Error {
    constructor(
        public fn: string,
        public kind: EdgeFunctionErrorKind,
        public status?: number,
        public detail?: string,
    ) {
        super(
            kind === "no-desplegada"
                ? `La Edge Function "${fn}" no está desplegada en el proyecto (${detail ?? "404 not found"}).`
                : `La Edge Function "${fn}" falló${status ? ` [${status}]` : ""}: ${detail || "sin detalle"}`,
        );
        this.name = "EdgeFunctionError";
    }
}

/** ¿El error significa que la función no está desplegada (o no hay red)? */
export function isEdgeFunctionMissing(err: unknown): boolean {
    if (err instanceof EdgeFunctionError) return err.kind === "no-desplegada";
    const msg = err instanceof Error ? err.message : String(err);
    return /not found|404|no such function|failed to send a request/i.test(msg);
}

/**
 * Invoca una Edge Function y normaliza los errores.
 *
 * - 404 / error de red (preflight CORS) → `EdgeFunctionError` kind "no-desplegada".
 * - Otro status → kind "http" con el body de la respuesta como detalle.
 */
export async function invokeEdgeFunction<T>(fn: string, body?: Record<string, unknown>): Promise<T> {
    const { getSupabase } = await import("@/lib/supabase");
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");

    const { data, error } = await supabase.functions.invoke<T>(fn, {
        body: body ?? {},
    });
    if (!error) return data as T;

    // FunctionsHttpError / FunctionsRelayError → context es un Response.
    // FunctionsFetchError → context es el error de red (no tiene status).
    const ctx = (error as { context?: Response & { clone?: () => Response } }).context;
    const status = typeof ctx?.status === "number" ? ctx.status : undefined;

    let detail = "";
    try {
        detail = ctx && typeof ctx.clone === "function" ? await ctx.clone().text() : "";
    } catch {
        detail = "";
    }

    if (status === 404) {
        throw new EdgeFunctionError(fn, "no-desplegada", 404, detail || "404 not found");
    }
    if (status === undefined) {
        throw new EdgeFunctionError(fn, "no-desplegada", undefined, detail || "el navegador no pudo invocar la función (preflight CORS o sin red)");
    }
    throw new EdgeFunctionError(fn, "http", status, detail || error.message);
}

/**
 * Comprueba si una Edge Function está desplegada.
 *
 * Usa GET (sin body) a propósito: un GET no dispara preflight, así que el 404
 * del gateway llega intacto al navegador y podemos distinguir "no existe" de
 * "error de red".
 */
export async function probeEdgeFunction(fn: string): Promise<{ deployed: boolean; detail?: string }> {
    try {
        const { getSupabase } = await import("@/lib/supabase");
        const supabase = getSupabase();
        if (!supabase) return { deployed: false, detail: "Supabase no configurado" };

        const { error } = await supabase.functions.invoke(fn, { method: "GET" });
        if (!error) return { deployed: true };
        const ctx = (error as { context?: Response }).context;
        const status = typeof ctx?.status === "number" ? ctx.status : undefined;
        if (status === 404) return { deployed: false, detail: "404 not found" };
        // Otra cosa (401, 500, error de red): la función EXISTE.
        return { deployed: true, detail: error.message };
    } catch (e) {
        return { deployed: false, detail: e instanceof Error ? e.message : String(e) };
    }
}
