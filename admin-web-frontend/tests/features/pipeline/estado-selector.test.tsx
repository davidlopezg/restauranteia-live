import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EstadoSelector } from "@/features/pipeline/components/estado-selector";
import { ESTADO_LABELS, TRANSICIONES } from "@/types/pipeline";

// Tests del selector de estado: muestra solo destinos válidos, marca el actual,
// y avisa del motivo de deshabilitación vía title.

describe("EstadoSelector", () => {
    it("muestra todos los 7 estados como botones", () => {
        render(<EstadoSelector estadoActual="CONCEPTO" onChange={vi.fn()} />);
        for (const label of Object.values(ESTADO_LABELS)) {
            expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
        }
    });

    it("marca como disabled el estado actual", () => {
        render(<EstadoSelector estadoActual="CONCEPTO" onChange={vi.fn()} />);
        const actual = screen.getByRole("button", { name: ESTADO_LABELS.CONCEPTO });
        expect(actual).toBeDisabled();
    });

    it("marca como disabled los destinos NO válidos según TRANSICIONES", () => {
        // Desde CONCEPTO solo se puede ir a PRUEBA_1.
        render(<EstadoSelector estadoActual="CONCEPTO" onChange={vi.fn()} />);
        for (const estado of Object.keys(TRANSICIONES) as Array<keyof typeof TRANSICIONES>) {
            const label = ESTADO_LABELS[estado];
            const btn = screen.getByRole("button", { name: label });
            if (estado === "CONCEPTO") {
                expect(btn).toBeDisabled();
            } else if (TRANSICIONES.CONCEPTO.includes(estado)) {
                expect(btn).not.toBeDisabled();
            } else {
                expect(btn).toBeDisabled();
            }
        }
    });

    it("llama onChange con el destino al hacer click en uno válido", async () => {
        const onChange = vi.fn();
        render(<EstadoSelector estadoActual="PRUEBA_1" onChange={onChange} />);
        await userEvent.click(screen.getByRole("button", { name: ESTADO_LABELS.EVALUACION_1 }));
        expect(onChange).toHaveBeenCalledWith("EVALUACION_1");
    });

    it("NO llama onChange al click en un destino inválido (botón disabled)", async () => {
        const onChange = vi.fn();
        render(<EstadoSelector estadoActual="CONCEPTO" onChange={onChange} />);
        await userEvent.click(screen.getByRole("button", { name: ESTADO_LABELS.PRODUCTO }));
        expect(onChange).not.toHaveBeenCalled();
    });

    it("renderiza vacío si estadoActual es null", () => {
        const { container } = render(<EstadoSelector estadoActual={null} onChange={vi.fn()} />);
        // Todos los botones deshabilitados porque no hay estado actual.
        const buttons = screen.getAllByRole("button");
        expect(buttons.length).toBeGreaterThan(0);
        for (const btn of buttons) {
            expect(btn).toBeDisabled();
        }
        expect(container.querySelector('[data-testid="estado-selector"]')).toBeInTheDocument();
    });

    it("respeta prop disabled (e.g. durante mutation)", () => {
        render(<EstadoSelector estadoActual="CONCEPTO" onChange={vi.fn()} disabled />);
        const btnValido = screen.getByRole("button", { name: ESTADO_LABELS.PRUEBA_1 });
        expect(btnValido).toBeDisabled();
    });
});
