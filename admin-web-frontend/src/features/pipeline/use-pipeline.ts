import { useQuery } from "@tanstack/react-query";
import { desarrolloKeys, desarrolloService } from "@/services/desarrollo";
import type { EstadoDesarrollo } from "@/types/pipeline";

// Hook de lectura del pipeline. Caché de 15s (más corto que el default 30s)
// porque el board cambia con cada drag y queremos ver el estado actualizado
// rápido al volver de un detalle.

export const usePipeline = () =>
    useQuery({
        queryKey: desarrolloKeys.pipeline(),
        queryFn: () => desarrolloService.pipeline(),
        staleTime: 15_000,
    });

export const useTransiciones = () =>
    useQuery({
        queryKey: desarrolloKeys.estados(),
        queryFn: () => desarrolloService.estados(),
        staleTime: 5 * 60_000,
    });

// Helper puro: destinos válidos para un estado. Lo extraigo para testearlo
// sin necesidad de mockear nada.
export function getTransiciones(
    estado: EstadoDesarrollo | null,
    transiciones: Record<EstadoDesarrollo, EstadoDesarrollo[]> | undefined,
): EstadoDesarrollo[] {
    if (!estado || !transiciones) return [];
    return transiciones[estado] ?? [];
}
