import { describe, expect, it } from "vitest";
import { moveCard } from "@/features/pipeline/use-cambiar-estado";
import type { PipelinePorEstado, AgendaPipeline } from "@/types/pipeline";

// Test de la función pura moveCard: la lógica que mueve una card entre
// columnas dentro de la cache de TanStack Query. Es el corazón del
// optimistic update; si falla, el rollback no restaura el estado correcto.

const makePipeline = (): PipelinePorEstado => ({
    CONCEPTO: [
        { id: "a-1", titulo: "Pizza calabaza", estado_desarrollo: "CONCEPTO" } as AgendaPipeline,
    ],
    PRUEBA_1: [],
    EVALUACION_1: [],
    MODIFICACION: [],
    PRUEBA_2: [],
    VALIDACION: [],
    PRODUCTO: [],
});

describe("moveCard", () => {
    it("mueve la card de la columna origen a la destino", () => {
        const before = makePipeline();
        const after = moveCard(before, "a-1", "PRUEBA_1");

        expect(after.CONCEPTO).toHaveLength(0);
        expect(after.PRUEBA_1).toHaveLength(1);
        expect(after.PRUEBA_1[0]?.id).toBe("a-1");
        expect(after.PRUEBA_1[0]?.estado_desarrollo).toBe("PRUEBA_1");
    });

    it("actualiza estado_desarrollo en la card movida", () => {
        const before = makePipeline();
        const after = moveCard(before, "a-1", "EVALUACION_1");
        expect(after.EVALUACION_1[0]?.estado_desarrollo).toBe("EVALUACION_1");
    });

    it("no afecta a otras cards", () => {
        const before: PipelinePorEstado = {
            CONCEPTO: [
                { id: "a-1", titulo: "X", estado_desarrollo: "CONCEPTO" } as AgendaPipeline,
                { id: "a-2", titulo: "Y", estado_desarrollo: "CONCEPTO" } as AgendaPipeline,
            ],
            PRUEBA_1: [{ id: "a-3", titulo: "Z", estado_desarrollo: "PRUEBA_1" } as AgendaPipeline],
            EVALUACION_1: [],
            MODIFICACION: [],
            PRUEBA_2: [],
            VALIDACION: [],
            PRODUCTO: [],
        };

        const after = moveCard(before, "a-2", "PRUEBA_1");

        expect(after.CONCEPTO.map(c => c.id)).toEqual(["a-1"]);
        expect(after.PRUEBA_1.map(c => c.id)).toEqual(["a-2", "a-3"]);
    });

    it("es no-op si la card no existe", () => {
        const before = makePipeline();
        const after = moveCard(before, "no-existe", "PRUEBA_1");
        expect(after).toEqual(before);
    });

    it("preserva el orden: la card movida aparece PRIMERO en la columna destino", () => {
        const before: PipelinePorEstado = {
            CONCEPTO: [{ id: "a-1", titulo: "Movida", estado_desarrollo: "CONCEPTO" } as AgendaPipeline],
            PRUEBA_1: [
                { id: "a-2", titulo: "Existente 1", estado_desarrollo: "PRUEBA_1" } as AgendaPipeline,
                { id: "a-3", titulo: "Existente 2", estado_desarrollo: "PRUEBA_1" } as AgendaPipeline,
            ],
            EVALUACION_1: [],
            MODIFICACION: [],
            PRUEBA_2: [],
            VALIDACION: [],
            PRODUCTO: [],
        };

        const after = moveCard(before, "a-1", "PRUEBA_1");
        expect(after.PRUEBA_1[0]?.id).toBe("a-1"); // la movida va primero
        expect(after.PRUEBA_1[1]?.id).toBe("a-2");
        expect(after.PRUEBA_1[2]?.id).toBe("a-3");
    });

    it("rollback: pasar la pipeline 'after' como 'before' y revertir el movimiento deja la pipeline original", () => {
        const original = makePipeline();
        const moved = moveCard(original, "a-1", "PRUEBA_1");
        const rolledBack = moveCard(moved, "a-1", "CONCEPTO");
        expect(rolledBack).toEqual(original);
    });
});
