import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, httpClient } from "@/services/http-client";

// Tests del http-client: timeout, error normalization, headers, JSON body.

describe("httpClient", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.useRealTimers();
    });

    it("lanza ApiError con status y detail cuando el backend responde 4xx", async () => {
        globalThis.fetch = vi.fn(async () =>
            new Response(JSON.stringify({ detail: "Idea no encontrada" }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
            }),
        ) as unknown as typeof fetch;

        await expect(httpClient.get("/api/ideas/x")).rejects.toMatchObject({
            name: "ApiError",
            status: 404,
            message: "HTTP 404: Idea no encontrada",
        });
    });

    it("envía Content-Type y body JSON en POST", async () => {
        const fetchSpy = vi.fn(async () =>
            new Response(JSON.stringify({ id: "1" }), { status: 201 }),
        );
        globalThis.fetch = fetchSpy as unknown as typeof fetch;

        await httpClient.post<{ id: string }>("/api/ideas", { titulo: "x" });

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const call = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
        const [url, init] = call;
        expect(url).toBe("/api/ideas");
        expect(init.method).toBe("POST");
        expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
        expect(JSON.parse(init.body as string)).toEqual({ titulo: "x" });
    });

    it("lanza ApiError con status 0 y mensaje de timeout si tarda más del límite", async () => {
        // fetch que nunca resuelve mientras pasan los timers.
        globalThis.fetch = vi.fn(
            (_url: unknown, init: RequestInit) =>
                new Promise<Response>((_resolve, reject) => {
                    init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
                }),
        ) as unknown as typeof fetch;

        const promise = httpClient.get("/api/slow", { timeoutMs: 100 });
        // Adjuntar catch antes de avanzar timers para evitar unhandled rejection.
        const expectation = expect(promise).rejects.toMatchObject({
            name: "ApiError",
            status: 0,
        });
        await vi.advanceTimersByTimeAsync(150);
        await expectation;
    });

    it("ApiError expone status y detail accesibles", () => {
        const err = new ApiError(502, "Bad gateway", { detail: "supabase down" });
        expect(err.status).toBe(502);
        expect(err.detail).toEqual({ detail: "supabase down" });
        expect(err.message).toBe("Bad gateway");
    });
});
