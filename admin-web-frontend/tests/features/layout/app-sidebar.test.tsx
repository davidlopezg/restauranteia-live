import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { PropsWithChildren } from "react";
import { AppSidebar } from "@/features/layout/app-sidebar";

// Mockea useSidebarCounts para no depender de fetch en estos tests.
vi.mock("@/features/layout/use-sidebar-counts", () => ({
    useSidebarCounts: () => ({
        ideas: 71,
        agendas: 27,
        catalogos: 72,
        pendientes: 12,
    }),
}));

// Mockea StatusPill para no introducir la query de healthz.
vi.mock("@/features/layout/status-pill", () => ({
    StatusPill: () => <div data-testid="status-pill">Conectado</div>,
}));

const wrapper = ({ children }: PropsWithChildren) => (
    <MemoryRouter initialEntries={["/ideas"]}>{children}</MemoryRouter>
);

describe("AppSidebar", () => {
    it("muestra las secciones de primer nivel del nav-config", () => {
        render(<AppSidebar open onClose={vi.fn()} />, { wrapper });
        expect(screen.getByText("Ideas")).toBeInTheDocument();
        expect(screen.getByText("Catálogo")).toBeInTheDocument();
        expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });

    it("muestra los counts cuando hay conteos", () => {
        render(<AppSidebar open onClose={vi.fn()} />, { wrapper });
        expect(screen.getByText("71")).toBeInTheDocument();
        expect(screen.getByText("27")).toBeInTheDocument();
        expect(screen.getByText("72")).toBeInTheDocument();
        expect(screen.getByText("12")).toBeInTheDocument();
    });

    it("muestra los hijos del grupo Pruebas", () => {
        render(<AppSidebar open onClose={vi.fn()} />, { wrapper });
        // "Pruebas" aparece dos veces: como label del grupo y como hoja.
        const matches = screen.getAllByText("Pruebas");
        expect(matches.length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText("Pipeline")).toBeInTheDocument();
        expect(screen.getByText("Pendientes")).toBeInTheDocument();
    });

    it("marca como activo el item correspondiente a la URL actual", () => {
        render(<AppSidebar open onClose={vi.fn()} />, { wrapper });
        // El NavLink activo debe tener aria-current="page".
        const activeLinks = screen.getAllByRole("link", { current: "page" });
        expect(activeLinks.length).toBeGreaterThan(0);
        const activeText = activeLinks.map(a => a.textContent ?? "").join(" ");
        expect(activeText).toContain("Ideas");
    });

    it("oculta el sidebar cuando open=false en móvil (clase translate)", () => {
        const { container } = render(<AppSidebar open={false} onClose={vi.fn()} />, { wrapper });
        const aside = container.querySelector("aside");
        expect(aside?.className).toContain("-translate-x-full");
    });

    it("muestra el sidebar cuando open=true", () => {
        const { container } = render(<AppSidebar open onClose={vi.fn()} />, { wrapper });
        const aside = container.querySelector("aside");
        expect(aside?.className).toContain("translate-x-0");
    });

    it("renderiza el StatusPill en el footer", () => {
        render(<AppSidebar open onClose={vi.fn()} />, { wrapper });
        expect(screen.getByTestId("status-pill")).toBeInTheDocument();
    });
});
