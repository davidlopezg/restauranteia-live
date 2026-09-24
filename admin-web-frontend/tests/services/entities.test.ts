import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ideasService, agendasService, catalogosService } from "@/services/entities";

// Tests de los servicios de entities. Verifican que:
// - serializan query params correctamente (incluyendo omisión de vacíos)
// - pasan el path correcto
// - POST/PATCH/DELETE envían body JSON

const fetchMock = vi.fn();

describe("entities services", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", fetchMock);
        fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        fetchMock.mockReset();
    });

    describe("ideasService.list", () => {
        it("omite params vacíos/null/undefined", async () => {
            await ideasService.list({ search: "pizza", categoria: "", estado: undefined });
            const [url] = fetchMock.mock.calls[0] as [string];
            expect(url).toBe("/api/ideas?search=pizza");
        });

        it("incluye múltiples params cuando tienen valor", async () => {
            await ideasService.list({ search: "x", estado: "En curso", limit: 30 });
            const [url] = fetchMock.mock.calls[0] as [string];
            expect(url).toContain("search=x");
            expect(url).toContain("estado=En+curso");
            expect(url).toContain("limit=30");
        });

        it("no añade ? cuando no hay params", async () => {
            await ideasService.list();
            const [url] = fetchMock.mock.calls[0] as [string];
            expect(url).toBe("/api/ideas");
        });
    });

    describe("ideasService.create", () => {
        it("POST con body JSON", async () => {
            await ideasService.create({ titulo: "Pizza calabaza", categorias: ["Pizzas"] });
            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toBe("/api/ideas");
            expect(init.method).toBe("POST");
            expect(JSON.parse(init.body as string)).toEqual({
                titulo: "Pizza calabaza",
                categorias: ["Pizzas"],
            });
        });
    });

    describe("ideasService.update", () => {
        it("PATCH al endpoint del id con body parcial", async () => {
            await ideasService.update("abc-123", { titulo: "Nuevo" });
            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toBe("/api/ideas/abc-123");
            expect(init.method).toBe("PATCH");
            expect(JSON.parse(init.body as string)).toEqual({ titulo: "Nuevo" });
        });
    });

    describe("ideasService.delete", () => {
        it("DELETE sin body", async () => {
            await ideasService.delete("abc-123");
            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toBe("/api/ideas/abc-123");
            expect(init.method).toBe("DELETE");
            expect(init.body).toBeUndefined();
        });
    });

    describe("ideasService.convertir", () => {
        it("POST a /convertir sin body", async () => {
            await ideasService.convertir("idea-1");
            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toBe("/api/ideas/idea-1/convertir");
            expect(init.method).toBe("POST");
        });
    });

    describe("agendasService.list", () => {
        it("usa 'etiqueta' en lugar de 'categoria' (backend lo llama así)", async () => {
            await agendasService.list({ etiqueta: "Pizza" });
            const [url] = fetchMock.mock.calls[0] as [string];
            expect(url).toContain("etiqueta=Pizza");
            expect(url).not.toContain("categoria=");
        });
    });

    describe("catalogosService.grupos", () => {
        it("GET sin params", async () => {
            await catalogosService.grupos();
            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toBe("/api/catalogos/grupos");
            expect(init.method).toBe("GET");
        });
    });
});
