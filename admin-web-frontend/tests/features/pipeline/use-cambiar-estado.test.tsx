import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";
import { useCambiarEstado, moveCard } from "@/features/pipeline/use-cambiar-estado";
import { desarrolloKeys } from "@/services/desarrollo";
import type { PipelinePorEstado, AgendaPipeline } from "@/types/pipeline";

// Tests del flujo completo de la mutation: optimistic update + rollback.
//
// Mockeamos el servicio de desarrollo para controlar cuándo falla.
vi.mock("@/services/desarrollo", async importOriginal => {
    const actual = await importOriginal<typeof import("@/services/desarrollo")>();
    return {
        ...actual,
        desarrolloService: {
            ...actual.desarrolloService,
            cambiarEstado: vi.fn(),
        },
    };
});

const { desarrolloService } = await import("@/services/desarrollo");
const mockedCambiar = desarrolloService.cambiarEstado as unknown as ReturnType<typeof vi.fn>;

const PIPELINE: PipelinePorEstado = {
    CONCEPTO: [{ id: "a-1", titulo: "Pizza", estado_desarrollo: "CONCEPTO" } as AgendaPipeline],
    PRUEBA_1: [],
    EVALUACION_1: [],
    MODIFICACION: [],
    PRUEBA_2: [],
    VALIDACION: [],
    PRODUCTO: [],
};

const makeWrapper = (qc: QueryClient) => {
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
};

const setupClient = () => {
    const qc = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    qc.setQueryData(desarrolloKeys.pipeline(), PIPELINE);
    return qc;
};

describe("useCambiarEstado", () => {
    beforeEach(() => {
        mockedCambiar.mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("PATCH correcto al backend", async () => {
        mockedCambiar.mockResolvedValue({ id: "a-1", estado_desarrollo: "PRUEBA_1" });
        const qc = setupClient();
        const { result } = renderHook(() => useCambiarEstado(), { wrapper: makeWrapper(qc) });

        await waitFor(() => expect(result.current).not.toBeNull());

        await result.current!.mutateAsync({
            agendaId: "a-1",
            estadoActual: "CONCEPTO",
            destino: "PRUEBA_1",
        });

        expect(mockedCambiar).toHaveBeenCalledWith("a-1", {
            estado_desarrollo: "PRUEBA_1",
            descripcion: "Movido desde pipeline",
        });
    });

    it("optimistic update: la cache local se mueve ANTES de la respuesta", async () => {
        // PATCH que tarda 30ms (suficiente para inspeccionar el estado intermedio).
        mockedCambiar.mockImplementation(
            () => new Promise(resolve => setTimeout(() => resolve({ id: "a-1" }), 30)),
        );
        const qc = setupClient();
        const { result } = renderHook(() => useCambiarEstado(), { wrapper: makeWrapper(qc) });

        await waitFor(() => expect(result.current).not.toBeNull());

        // Lanzamos la mutation sin await para poder inspeccionar onMutate.
        const promise = result.current!.mutateAsync({
            agendaId: "a-1",
            estadoActual: "CONCEPTO",
            destino: "PRUEBA_1",
        });

        // onMutate es síncrono: esperamos un microtask para que se ejecute.
        await waitFor(() => {
            const data = qc.getQueryData<PipelinePorEstado>(desarrolloKeys.pipeline());
            expect(data?.PRUEBA_1[0]?.id).toBe("a-1");
        });

        // CONCEPTO ya no debe tenerla.
        const after = qc.getQueryData<PipelinePorEstado>(desarrolloKeys.pipeline());
        expect(after?.CONCEPTO).toHaveLength(0);

        // Y la mutation termina OK.
        await promise;
    });

    it("rollback: si el PATCH falla, la cache vuelve al estado original", async () => {
        mockedCambiar.mockRejectedValue(new Error("HTTP 400: Transición no permitida"));
        const qc = setupClient();
        const { result } = renderHook(() => useCambiarEstado(), { wrapper: makeWrapper(qc) });

        await waitFor(() => expect(result.current).not.toBeNull());

        await expect(
            result.current!.mutateAsync({
                agendaId: "a-1",
                estadoActual: "CONCEPTO",
                destino: "PRODUCTO",
            }),
        ).rejects.toThrow();

        // Tras el fallo, la cache debe tener la card en CONCEPTO (rollback).
        const data = qc.getQueryData<PipelinePorEstado>(desarrolloKeys.pipeline());
        expect(data?.CONCEPTO).toHaveLength(1);
        expect(data?.CONCEPTO[0]?.id).toBe("a-1");
        expect(data?.PRUEBA_1).toHaveLength(0);
    });

    it("onSettled invalida la query (reconciliación con el servidor)", async () => {
        mockedCambiar.mockResolvedValue({ id: "a-1" });
        const qc = setupClient();
        const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

        const { result } = renderHook(() => useCambiarEstado(), { wrapper: makeWrapper(qc) });

        await waitFor(() => expect(result.current).not.toBeNull());

        await result.current!.mutateAsync({
            agendaId: "a-1",
            estadoActual: "CONCEPTO",
            destino: "PRUEBA_1",
        });

        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: desarrolloKeys.pipeline() });
    });

    it("rollback completo: la pipeline tras rollback es exactamente la original", () => {
        const original = PIPELINE;
        const snapshot = JSON.parse(JSON.stringify(original));
        const after = moveCard(original, "a-1", "PRUEBA_1");
        const restored = moveCard(after, "a-1", "CONCEPTO");
        expect(restored).toEqual(snapshot);
    });
});
