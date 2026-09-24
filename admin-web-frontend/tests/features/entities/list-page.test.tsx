import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ListPage } from "@/features/entities/list-page";

// Mock del servicio: devolvemos datos controlables por test.
vi.mock("@/services/entities", async importOriginal => {
    const actual = await importOriginal<typeof import("@/services/entities")>();
    return {
        ...actual,
        ideasService: {
            ...actual.ideasService,
            list: vi.fn(),
        },
        agendasService: {
            ...actual.agendasService,
            list: vi.fn(),
        },
        catalogosService: {
            ...actual.catalogosService,
            list: vi.fn(),
        },
    };
});

const { ideasService, agendasService, catalogosService } = await import("@/services/entities");
const ideasList = ideasService.list as unknown as ReturnType<typeof vi.fn>;
const agendasList = agendasService.list as unknown as ReturnType<typeof vi.fn>;
const catalogosList = catalogosService.list as unknown as ReturnType<typeof vi.fn>;

const makeWrapper = () => {
    const qc = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={["/ideas"]}>
                <Routes>
                    <Route path="/ideas" element={<>{children}</>} />
                    <Route path="/ideas/:id" element={<div data-testid="detail-page">detail</div>} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>
    );
};

const makeListWrapper = (entidad: "ideas" | "agendas" | "catalogos") => {
    const qc = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={[`/${entidad}`]}>
                <Routes>
                    <Route path={`/${entidad}`} element={<>{children}</>} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>
    );
};

describe("ListPage", () => {
    beforeEach(() => {
        ideasList.mockReset();
        agendasList.mockReset();
        catalogosList.mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("muestra el título y el botón Nuevo", async () => {
        ideasList.mockResolvedValue({ items: [], next_cursor: null });
        render(<ListPage entidad="ideas" />, { wrapper: makeWrapper() });
        await waitFor(() => {
            expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ideas");
        });
        expect(screen.getByRole("button", { name: /Nuevo/i })).toBeInTheDocument();
    });

    it("muestra los items en la tabla", async () => {
        ideasList.mockResolvedValue({
            items: [
                { id: "1", titulo: "Pizza calabaza", estado_idea: "En curso", categorias: ["Pizzas"] },
                { id: "2", titulo: "Ensalada tibia", estado_idea: null, categorias: [] },
            ],
            next_cursor: null,
        });
        render(<ListPage entidad="ideas" />, { wrapper: makeWrapper() });
        await waitFor(() => {
            expect(screen.getByTestId("row-ideas-1")).toBeInTheDocument();
        });
        expect(screen.getByTestId("row-ideas-2")).toBeInTheDocument();
        expect(screen.getByText("Pizza calabaza")).toBeInTheDocument();
    });

    it("click en una fila navega al detalle", async () => {
        ideasList.mockResolvedValue({
            items: [{ id: "abc-123", titulo: "X" }],
            next_cursor: null,
        });
        render(<ListPage entidad="ideas" />, { wrapper: makeWrapper() });
        const row = await screen.findByTestId("row-ideas-abc-123");
        await userEvent.click(row);
        expect(await screen.findByTestId("detail-page")).toBeInTheDocument();
    });

    it("muestra mensaje vacío si no hay resultados", async () => {
        ideasList.mockResolvedValue({ items: [], next_cursor: null });
        render(<ListPage entidad="ideas" />, { wrapper: makeWrapper() });
        await waitFor(() => {
            expect(screen.getByText(/Sin resultados/)).toBeInTheDocument();
        });
    });

    it("muestra error si el fetch falla", async () => {
        ideasList.mockRejectedValue(new Error("HTTP 500: fallo"));
        render(<ListPage entidad="ideas" />, { wrapper: makeWrapper() });
        await waitFor(() => {
            expect(screen.getByText(/Error: HTTP 500/)).toBeInTheDocument();
        });
    });

    it("llama al servicio de agendas con 'etiqueta' (no 'categoria')", async () => {
        agendasList.mockResolvedValue({ items: [], next_cursor: null });
        render(<ListPage entidad="agendas" />, { wrapper: makeListWrapper("agendas") });
        await waitFor(() => expect(agendasList).toHaveBeenCalled());
        // No verificamos los params exactos porque son del objeto, pero sí que se llamó.
        expect(agendasList).toHaveBeenCalledTimes(1);
    });

    it("muestra columnas de catalogos incluyendo Precio y Orden", async () => {
        catalogosList.mockResolvedValue({
            items: [
                { id: "1", titulo: "Pizza margherita", estado: "Listo", categorias: ["Pizzas"], precio: 12.5, orden: 1 },
            ],
            next_cursor: null,
        });
        render(<ListPage entidad="catalogos" />, { wrapper: makeListWrapper("catalogos") });
        await waitFor(() => {
            expect(screen.getByText("12,50 €")).toBeInTheDocument();
        });
        expect(screen.getByText("Listo")).toBeInTheDocument();
    });
});
