import { beforeEach, describe, expect, it, vi } from "vitest";
import { iaService } from "@/services/ia";

/**
 * El estado de la IA tiene UNA sola fuente de verdad: la tabla `app_settings`.
 * La Edge Function `ia-status` es un proxy; si no está desplegada hay que
 * caer a PostgREST, si no la app miente ("IA no configurada" cuando en realidad
 * lo que falta es la función).
 */

const mock = vi.hoisted(() => ({
    invoke: vi.fn(),
    from: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
    getSupabase: () => ({
        functions: { invoke: mock.invoke },
        from: mock.from,
    }),
}));

/** Errores de invocación tal como los devuelve supabase-js. */
const fetchError = () => ({
    data: null,
    error: Object.assign(new Error("Failed to send a request to the Edge Function"), {
        name: "FunctionsFetchError",
        context: new TypeError("Failed to fetch"),
    }),
});

const http404 = () => ({
    data: null,
    error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
        name: "FunctionsHttpError",
        context: new Response("{}", { status: 404 }),
    }),
});

/** Mock de PostgREST para las 2 consultas del snapshot (presencia + valores). */
function postgrestMock(presence: string[], values: Record<string, string>) {
    const builder = {
        select: vi.fn(() => builder),
        in: vi.fn(() => builder),
        neq: vi.fn(() => builder),
        then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({
                data: presence.map(key => ({ key })),
                error: null,
            }).then(resolve),
    };

    const valueBuilder = {
        select: vi.fn(() => valueBuilder),
        in: vi.fn(() => valueBuilder),
        then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({
                data: Object.entries(values).map(([key, value]) => ({ key, value })),
                error: null,
            }).then(resolve),
    };

    let call = 0;
    mock.from.mockImplementation(() => (call++ === 0 ? builder : valueBuilder));
}

describe("iaService.status", () => {
    beforeEach(() => {
        mock.invoke.mockReset();
        mock.from.mockReset();
    });

    it("usa la Edge Function cuando está desplegada", async () => {
        mock.invoke.mockResolvedValue({
            data: { ia_configured: true, model: "MiniMax-M3", base_url: "https://api.minimax.io/v1" },
            error: null,
        });

        const status = await iaService.status();

        expect(status.configured).toBe(true);
        expect(status.model).toBe("MiniMax-M3");
        expect(mock.from).not.toHaveBeenCalled();
    });

    it("cae a la base de datos si la Edge Function no está desplegada (404)", async () => {
        mock.invoke.mockResolvedValue(http404());
        postgrestMock(["minimax_api_key"], { minimax_model: "MiniMax-M3" });

        const status = await iaService.status();

        expect(status.configured).toBe(true);
        expect(status.model).toBe("MiniMax-M3");
        expect(status.key_source).toBe("bd");
    });

    it("cae a la base de datos si el navegador no pudo invocar la función (CORS)", async () => {
        mock.invoke.mockResolvedValue(fetchError());
        postgrestMock([], {});

        const status = await iaService.status();

        expect(status.configured).toBe(false);
        expect(status.key_source).toBe("ninguna");
        expect(status.base_url).toBe("https://api.minimax.io/v1");
    });

    it("propaga el error si la Edge Function falla con otro status", async () => {
        mock.invoke.mockResolvedValue({
            data: null,
            error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
                name: "FunctionsHttpError",
                context: new Response("boom", { status: 500 }),
            }),
        });

        await expect(iaService.status()).rejects.toThrow(/ia-status/);
    });
});
