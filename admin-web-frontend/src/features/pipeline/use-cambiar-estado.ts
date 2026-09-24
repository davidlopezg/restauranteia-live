import { useMutation, useQueryClient } from "@tanstack/react-query";
import { desarrolloKeys, desarrolloService } from "@/services/desarrollo";
import type { EstadoDesarrollo, PipelinePorEstado, AgendaPipeline } from "@/types/pipeline";
import { ESTADOS_DESARROLLO } from "@/types/pipeline";

// Mutation: cambiar estado de una agenda con optimistic update + rollback.
//
// Flujo:
//   1. onMutate → cancela queries en vuelo, saca snapshot, mueve la card localmente
//   2. mutationFn → PATCH al backend
//   3. onError → restaura snapshot, toast de error
//   4. onSettled → invalida la query para reconciliar con el servidor

interface MutationVars {
    agendaId: string;
    estadoActual: EstadoDesarrollo | null;
    destino: EstadoDesarrollo;
    descripcion?: string;
}

interface MutationContext {
    previousPipeline: PipelinePorEstado | undefined;
}

export function moveCard(
    pipeline: PipelinePorEstado,
    agendaId: string,
    destino: EstadoDesarrollo,
): PipelinePorEstado {
    let card: AgendaPipeline | undefined;
    const siguiente: PipelinePorEstado = {} as PipelinePorEstado;
    for (const estado of ESTADOS_DESARROLLO) {
        siguiente[estado] = (pipeline[estado] ?? []).filter(c => {
            if (c.id === agendaId) {
                card = { ...c, estado_desarrollo: destino };
                return false;
            }
            return true;
        });
    }
    if (card) {
        siguiente[destino] = [card, ...siguiente[destino]];
    }
    return siguiente;
}

export const useCambiarEstado = () => {
    const queryClient = useQueryClient();

    return useMutation<AgendaPipeline, Error, MutationVars, MutationContext>({
        mutationFn: ({ agendaId, destino, descripcion }) =>
            desarrolloService.cambiarEstado(agendaId, {
                estado_desarrollo: destino,
                descripcion: descripcion ?? "Movido desde pipeline",
            }),
        onMutate: async ({ agendaId, destino }) => {
            await queryClient.cancelQueries({ queryKey: desarrolloKeys.pipeline() });
            const previousPipeline = queryClient.getQueryData<PipelinePorEstado>(
                desarrolloKeys.pipeline(),
            );
            if (previousPipeline) {
                queryClient.setQueryData<PipelinePorEstado>(
                    desarrolloKeys.pipeline(),
                    moveCard(previousPipeline, agendaId, destino),
                );
            }
            return { previousPipeline };
        },
        onError: (_err, _vars, context) => {
            // Rollback: restauramos el snapshot. No es necesario toast aquí
            // porque la UI de la mutation ya lo muestra en su onError.
            if (context?.previousPipeline) {
                queryClient.setQueryData(desarrolloKeys.pipeline(), context.previousPipeline);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: desarrolloKeys.pipeline() });
        },
    });
};
