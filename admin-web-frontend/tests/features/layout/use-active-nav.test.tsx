import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router";
import type { PropsWithChildren } from "react";
import { useActiveNav } from "@/features/layout/use-active-nav";

// Wrapper que inyecta una ruta concreta en el router.
const makeWrapper = (path: string) => {
    return ({ children }: PropsWithChildren) => (
        <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    );
};

describe("useActiveNav", () => {
    it("detecta /ideas como leaf 'ideas'", () => {
        const { result } = renderHook(() => useActiveNav(), { wrapper: makeWrapper("/ideas") });
        expect(result.current?.id).toBe("ideas");
        expect(result.current?.href).toBe("/ideas");
    });

    it("detecta /ideas/abc-123 también como leaf 'ideas' (prefijo)", () => {
        const { result } = renderHook(() => useActiveNav(), { wrapper: makeWrapper("/ideas/abc-123") });
        expect(result.current?.id).toBe("ideas");
    });

    it("devuelve el leaf más específico cuando hay colisión de prefijos", () => {
        // /agendas/{id} debe ser más específico que /agendas, que es hijo del grupo "pruebas".
        // Como /agendas es leaf directo, /agendas/{id} debe matchear ese leaf.
        const { result } = renderHook(() => useActiveNav(), { wrapper: makeWrapper("/agendas/xyz") });
        expect(result.current?.id).toBe("agendas");
    });

    it("devuelve null cuando la ruta no matchea ninguna sección", () => {
        const { result } = renderHook(() => useActiveNav(), { wrapper: makeWrapper("/no-existe") });
        expect(result.current).toBeNull();
    });

    it("no entra en bucle infinito si location es estable", () => {
        const { result, rerender } = renderHook(() => useActiveNav(), { wrapper: makeWrapper("/catalogos") });
        const first = result.current;
        rerender();
        expect(result.current).toBe(first);
    });

    it("useLocation del propio react-router funciona en el wrapper", () => {
        const { result } = renderHook(() => useLocation(), { wrapper: makeWrapper("/pendientes") });
        expect(result.current.pathname).toBe("/pendientes");
    });
});
