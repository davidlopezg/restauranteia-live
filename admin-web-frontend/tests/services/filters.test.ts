import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filtersService } from "@/services/filters";

const fetchMock = vi.fn();

describe("filtersService", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        fetchMock.mockReset();
    });

    it("construye la URL correcta por entidad", async () => {
        fetchMock.mockImplementation(async () => new Response(JSON.stringify({ categorias: [], estados: [] }), { status: 200 }));

        await filtersService.get("ideas");
        expect((fetchMock.mock.calls[0] as [string])[0]).toBe("/api/filters/ideas");

        await filtersService.get("agendas");
        expect((fetchMock.mock.calls[1] as [string])[0]).toBe("/api/filters/agendas");

        await filtersService.get("catalogos");
        expect((fetchMock.mock.calls[2] as [string])[0]).toBe("/api/filters/catalogos");
    });
});
