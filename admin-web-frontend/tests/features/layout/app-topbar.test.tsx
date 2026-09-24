import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { PropsWithChildren } from "react";
import { AppTopbar } from "@/features/layout/app-topbar";

const wrap = (path: string) => {
    return ({ children }: PropsWithChildren) => (
        <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    );
};

describe("AppTopbar", () => {
    it("muestra el título según la sección actual", () => {
        render(<AppTopbar onOpenSearch={vi.fn()} />, { wrapper: wrap("/ideas") });
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ideas");
    });

    it("usa SECTION_TITLES cuando la ruta exacta no es un leaf", () => {
        render(<AppTopbar onOpenSearch={vi.fn()} />, { wrapper: wrap("/cadencia") });
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dashboard");
    });

    it("muestra botón Volver cuando hay un detalle (subruta)", () => {
        render(<AppTopbar onOpenSearch={vi.fn()} />, { wrapper: wrap("/ideas/abc-123") });
        expect(screen.getByRole("button", { name: /Volver/ })).toBeInTheDocument();
    });

    it("oculta el botón Volver en la ruta base", () => {
        render(<AppTopbar onOpenSearch={vi.fn()} />, { wrapper: wrap("/ideas") });
        expect(screen.queryByRole("button", { name: /Volver/ })).not.toBeInTheDocument();
    });

    it("llama onOpenSearch al pulsar el botón Buscar (cuando hay handler custom)", async () => {
        const onOpenSearch = vi.fn();
        render(<AppTopbar onOpenSearch={onOpenSearch} />, { wrapper: wrap("/ideas") });
        await userEvent.click(screen.getByRole("button", { name: /Buscar/ }));
        expect(onOpenSearch).toHaveBeenCalledTimes(1);
    });

    it("muestra el trigger del GlobalSearch por defecto (sin handler custom)", () => {
        render(<AppTopbar />, { wrapper: wrap("/ideas") });
        expect(screen.getByTestId("global-search-trigger")).toBeInTheDocument();
    });
});
