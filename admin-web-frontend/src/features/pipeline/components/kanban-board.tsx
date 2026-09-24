import { DragDropProvider } from "@dnd-kit/react";
import { useEffect, useState } from "react";
import { ESTADOS_DESARROLLO, type EstadoDesarrollo, type AgendaPipeline, type PipelinePorEstado } from "@/types/pipeline";
import { usePipeline } from "@/features/pipeline/use-pipeline";
import { useCambiarEstado } from "@/features/pipeline/use-cambiar-estado";
import { KanbanColumn } from "@/features/pipeline/components/kanban-column";

// Board del Pipeline. Usa DragDropProvider para habilitar DnD en todo el árbol.
// onDragEnd dispara la mutation con optimistic update + rollback.

export const KanbanBoard = () => {
    const { data, isLoading, error } = usePipeline();
    const cambiarEstado = useCambiarEstado();
    const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

    useEffect(() => {
        if (!feedback) return;
        const t = setTimeout(() => setFeedback(null), 3000);
        return () => clearTimeout(t);
    }, [feedback]);

    const mover = (agendaId: string, destino: EstadoDesarrollo) => {
        const card = findCard(data, agendaId);
        cambiarEstado.mutate(
            { agendaId, estadoActual: card?.estado_desarrollo ?? null, destino },
            {
                onSuccess: () => setFeedback({ kind: "ok", msg: `Movido correctamente` }),
                onError: err => setFeedback({ kind: "err", msg: `Error: ${err.message}` }),
            },
        );
    };

    const handleDragEnd = (event: {
        operation: { source: { id: string | number } | null; target: { id: string | number } | null; canceled: boolean };
    }) => {
        if (event.operation.canceled) return;
        const sourceId = event.operation.source?.id;
        const targetId = event.operation.target?.id;
        if (typeof sourceId !== "string" || typeof targetId !== "string") return;
        if (!sourceId.startsWith("card-") || !targetId.startsWith("col-")) return;

        const agendaId = sourceId.slice("card-".length);
        const destino = targetId.slice("col-".length) as EstadoDesarrollo;
        mover(agendaId, destino);
    };

    // Expuesto para tests.
    void _test_handleDragEnd(handleDragEnd);

    if (isLoading) return <p className="text-sm text-tertiary">Cargando pipeline…</p>;
    if (error) return <p className="text-sm text-error-primary">Error: {(error as Error).message}</p>;
    if (!data) return null;

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <p className="text-sm text-tertiary">
                    Arrastra las cards entre columnas para cambiar de estado. Usa el selector dentro
                    de cada card como alternativa accesible.
                </p>
                {feedback && (
                    <span
                        role="status"
                        aria-live="polite"
                        className={
                            feedback.kind === "ok"
                                ? "rounded-md bg-success-secondary px-3 py-1 text-xs text-success-primary"
                                : "rounded-md bg-error-secondary px-3 py-1 text-xs text-error-primary"
                        }
                        data-testid="pipeline-feedback"
                    >
                        {feedback.msg}
                    </span>
                )}
            </div>

            <DragDropProvider onDragEnd={handleDragEnd}>
                <div className="flex gap-3 overflow-x-auto pb-4" data-testid="kanban-board">
                    {ESTADOS_DESARROLLO.map(estado => (
                        <KanbanColumn
                            key={estado}
                            estado={estado}
                            items={data[estado] ?? []}
                            disabled={cambiarEstado.isPending}
                            mutationPending={cambiarEstado.isPending}
                            onSelectEstado={mover}
                        />
                    ))}
                </div>
            </DragDropProvider>
        </div>
    );
};

function findCard(pipeline: PipelinePorEstado | undefined, agendaId: string): AgendaPipeline | undefined {
    if (!pipeline) return undefined;
    for (const estado of ESTADOS_DESARROLLO) {
        const found = (pipeline[estado] ?? []).find(c => c.id === agendaId);
        if (found) return found;
    }
    return undefined;
}

// Hook de testing: expone el handler drag-end para que los tests unitarios
// puedan llamarlo sin levantar DnD real (jsdom no soporta pointer events
// complejos). Exportado solo para tests; la integración real la hace
// DragDropProvider de @dnd-kit/react.
//
// Uso en test:
//   const handler = _captureHandler();
//   render(<KanbanBoard />); expect(handler()).toBe(...)
let _capturedHandler: ((event: DragEndLike) => void) | null = null;
function _test_handleDragEnd(h: (event: DragEndLike) => void) {
    _capturedHandler = h;
}
type DragEndLike = Parameters<NonNullable<Parameters<typeof DragDropProvider>[0]["onDragEnd"]>>[0];
export const _getTestHandler = () => _capturedHandler;
