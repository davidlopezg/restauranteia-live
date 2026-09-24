import { httpClient } from "@/services/http-client";
import type {
    CadenciaAplazarRequest,
    CadenciaSemana,
    CadenciaSemanaActualResponse,
    CadenciaUpdate,
} from "@/types/cadencia";

// Servicios de cadencia semanal. Coincide con admin-web/backend/routers/settings.py.

export const cadenciaKeys = {
    semanaActual: () => ["cadencia", "semana-actual"] as const,
    historial: (limit: number) => ["cadencia", "historial", limit] as const,
};

export const cadenciaService = {
    semanaActual: () => httpClient.get<CadenciaSemanaActualResponse>("/api/cadencia/semana-actual"),
    historial: (limit = 8) => httpClient.get<CadenciaSemana[]>(`/api/cadencia/historial?limit=${limit}`),
    update: (weekId: string, body: CadenciaUpdate) =>
        httpClient.patch<CadenciaSemana>(`/api/cadencia/${weekId}`, body),
    aplazar: (weekId: string, body: CadenciaAplazarRequest) =>
        httpClient.post<{ ok: true }>(`/api/cadencia/${weekId}/aplazar`, body),
};
