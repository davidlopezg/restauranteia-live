import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EntityEditForm } from "@/features/entities/components/entity-edit-form";

// Tests del EntityEditForm: campos por entidad, parsing de arrays/comas,
// tipos number/date, submit construye body correcto.

describe("EntityEditForm", () => {
    it("muestra los campos editables de ideas", () => {
        render(
            <EntityEditForm
                entidad="ideas"
                item={{ id: "1", titulo: "Pizza" }}
                onSubmit={vi.fn()}
                onCancel={vi.fn()}
            />,
        );
        expect(screen.getByLabelText(/Título/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Descripción/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Categorías/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Estado/)).toBeInTheDocument();
    });

    it("pre-rellena los valores del item (incluyendo arrays)", () => {
        render(
            <EntityEditForm
                entidad="ideas"
                item={{
                    id: "1",
                    titulo: "Pizza",
                    categorias: ["Pizzas", "Otoño"],
                    descripcion: "Receta de calabaza",
                }}
                onSubmit={vi.fn()}
                onCancel={vi.fn()}
            />,
        );
        expect(screen.getByLabelText(/Título/)).toHaveValue("Pizza");
        expect(screen.getByLabelText(/Categorías/)).toHaveValue("Pizzas, Otoño");
        expect(screen.getByLabelText(/Descripción/)).toHaveValue("Receta de calabaza");
    });

    it("construye body con arrays separados por coma al submit", async () => {
        const onSubmit = vi.fn();
        render(
            <EntityEditForm
                entidad="ideas"
                item={{ id: "1" }}
                onSubmit={onSubmit}
                onCancel={vi.fn()}
            />,
        );
        await userEvent.type(screen.getByLabelText(/Título/), "Pizza");
        await userEvent.type(screen.getByLabelText(/Categorías/), "Pizzas, Otoño");
        await userEvent.click(screen.getByRole("button", { name: /Guardar/ }));
        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                titulo: "Pizza",
                categorias: ["Pizzas", "Otoño"],
            }),
        );
    });

    it("convierte campos number", async () => {
        const onSubmit = vi.fn();
        render(
            <EntityEditForm
                entidad="catalogos"
                item={{ id: "1", titulo: "Pizza" }}
                onSubmit={onSubmit}
                onCancel={vi.fn()}
            />,
        );
        const precioInput = screen.getByLabelText(/Precio/);
        await userEvent.clear(precioInput);
        await userEvent.type(precioInput, "12.50");
        await userEvent.click(screen.getByRole("button", { name: /Guardar/ }));
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ precio: 12.5 }));
    });

    it("omite campos vacíos (excepto titulo)", async () => {
        const onSubmit = vi.fn();
        render(
            <EntityEditForm
                entidad="ideas"
                item={{ id: "1" }}
                onSubmit={onSubmit}
                onCancel={vi.fn()}
            />,
        );
        await userEvent.type(screen.getByLabelText(/Título/), "Solo titulo");
        await userEvent.click(screen.getByRole("button", { name: /Guardar/ }));
        const call = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(call.titulo).toBe("Solo titulo");
        expect("descripcion" in call).toBe(false);
        expect("categorias" in call).toBe(false);
    });

    it("llama onCancel al pulsar Cancelar", async () => {
        const onCancel = vi.fn();
        render(
            <EntityEditForm
                entidad="ideas"
                item={{ id: "1", titulo: "X" }}
                onSubmit={vi.fn()}
                onCancel={onCancel}
            />,
        );
        await userEvent.click(screen.getByRole("button", { name: /Cancelar/ }));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("muestra campos de catalogos (incluye orden y precio)", () => {
        render(
            <EntityEditForm
                entidad="catalogos"
                item={{ id: "1", titulo: "X" }}
                onSubmit={vi.fn()}
                onCancel={vi.fn()}
            />,
        );
        expect(screen.getByLabelText(/Orden/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Precio/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Ingredientes/)).toBeInTheDocument();
    });
});
