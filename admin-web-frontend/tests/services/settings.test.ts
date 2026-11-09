import { beforeEach, describe, expect, it, vi } from "vitest";
import { settingsService } from "@/services/settings";

/**
 * El servicio de settings tiene DOS caminos de escritura:
 *   1) Edge Function `settings` (service_role).
 *   2) Fallback directo a PostgREST (UPDATE + INSERT).
 *
 * El camino 2 es el que se usa cuando la Edge Function no está desplegada:
 * el gateway de Supabase responde 404 sin `content-type` en los headers CORS,
 * el preflight del navegador falla y supabase-js lanza FunctionsFetchError
 * ("Failed to send a request to the Edge Function") en vez de devolver el 404.
 */

const mock = vi.hoisted(() => ({
    invoke: vi.fn(),
    from: vi.fn(),
}));

vi.mock("@/config/env", () => ({
    env: {
        supabaseUrl: "https://demo.supabase.co",
        supabaseAnonKey: "anon",
        isSupabaseConfigured: true,
        legacyBackendUrl: "",
        appBasePath: "/",
    },
}));

vi.mock("@/lib/supabase", () => ({
    getSupabase: () => ({
        functions: { invoke: mock.invoke },
        from: mock.from,
    }),
}));

/** Error de red de supabase-js: sin status HTTP (el 404 nunca llegó al browser). */
function fetchError() {
    return {
        data: null,
        error: Object.assign(new Error("Failed to send a request to the Edge Function"), {
            name: "FunctionsFetchError",
            context: new TypeError("Failed to fetch"),
        }),
    };
}

function postgrestMock(existing: { key: string }[]) {
    const calls: string[] = [];
    const builder = {
        update: vi.fn((payload: Record<string, unknown>) => {
            calls.push(`update:${JSON.stringify(payload)}`);
            return builder;
        }),
        eq: vi.fn((col: string, val: string) => {
            calls.push(`eq:${col}=${val}`);
            return builder;
        }),
        select: vi.fn(async () => {
            calls.push("select");
            return { data: existing, error: null };
        }),
        insert: vi.fn(async (payload: Record<string, unknown>) => {
            calls.push(`insert:${JSON.stringify(payload)}`);
            return { data: null, error: null };
        }),
    };
    mock.from.mockImplementation(() => builder);
    return calls;
}

describe("settingsService.update", () => {
    beforeEach(() => {
        mock.invoke.mockReset();
        mock.from.mockReset();
    });

    it("usa la Edge Function cuando responde bien", async () => {
        mock.invoke.mockResolvedValue({ data: { updated: { minimax_model: "updated" } }, error: null });

        const result = await settingsService.update({ minimax_model: "MiniMax-M3" });

        expect(result.updated).toEqual({ minimax_model: "updated" });
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("cae a PostgREST si la Edge Function no se puede invocar (404 del gateway)", async () => {
        mock.invoke.mockResolvedValue({
            data: null,
            error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
                name: "FunctionsHttpError",
                context: new Response("{}", { status: 404 }),
            }),
        });
        const calls = postgrestMock([{ key: "minimax_model" }]);

        const result = await settingsService.update({ minimax_model: "MiniMax-M3" });

        expect(result.updated).toEqual({ minimax_model: "updated" });
        expect(calls).toContain("eq:key=minimax_model");
    });

    it("cae a PostgREST si el navegador no puede ni hacer la request (preflight CORS)", async () => {
        mock.invoke.mockResolvedValue(fetchError());
        const calls = postgrestMock([{ key: "minimax_model" }]);

        const result = await settingsService.update({ minimax_model: "MiniMax-M3" });

        expect(result.updated).toEqual({ minimax_model: "updated" });
        expect(calls).toContain("update:{\"value\":\"MiniMax-M3\"}");
    });

    it("inserta la clave si la fila no existe", async () => {
        mock.invoke.mockResolvedValue(fetchError());
        const calls = postgrestMock([]);

        const result = await settingsService.update({ prompt_emplatado: "texto" });

        expect(result.updated).toEqual({ prompt_emplatado: "updated" });
        expect(calls).toContain('insert:{"key":"prompt_emplatado","value":"texto"}');
    });

    it("ignora claves fuera de la whitelist", async () => {
        mock.invoke.mockResolvedValue(fetchError());
        const calls = postgrestMock([]);

        const result = await settingsService.update({ inventada: "x" });

        expect(result.updated).toEqual({});
        expect(calls).toEqual([]);
    });
});
