import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { desarrolloService } from "@/services/desarrollo";

const fetchMock = vi.fn();

describe("desarrolloService", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        fetchMock.mockReset();
    });

    it("pipeline() tipa el response como Record<Estado, AgendaPipeline[]>", async () => {
        const payload = {
            CONCEPTO: [{ id: "a", titulo: "A", estado_desarrollo: "CONCEPTO" }],
            PRUEBA_1: [],
            EVALUACION_1: [],
            MODIFICACION: [],
            PRUEBA_2: [],
            VALIDACION: [],
            PRODUCTO: [],
        };
        fetchMock.mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
        const result = await desarrolloService.pipeline();
        expect(result.CONCEPTO).toHaveLength(1);
        expect(result.CONCEPTO[0]?.titulo).toBe("A");
        expect(result.PRODUCTO).toHaveLength(0);
    });

    it("cambiarEstado() hace PATCH con body correcto", async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
        await desarrolloService.cambiarEstado("agenda-1", {
            estado_desarrollo: "PRUEBA_1",
            descripcion: "Avanzado",
        });
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/agendas/agenda-1/estado");
        expect(init.method).toBe("PATCH");
        expect(JSON.parse(init.body as string)).toEqual({
            estado_desarrollo: "PRUEBA_1",
            descripcion: "Avanzado",
        });
    });

    it("agregarEvento() hace POST con tipo, descripcion y extra", async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
        await desarrolloService.agregarEvento("agenda-1", {
            tipo: "NOTA",
            descripcion: "Cambio de proveedor",
            extra: { proveedor: "X" },
        });
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/agendas/agenda-1/evento");
        expect(JSON.parse(init.body as string)).toEqual({
            tipo: "NOTA",
            descripcion: "Cambio de proveedor",
            extra: { proveedor: "X" },
        });
    });
});
