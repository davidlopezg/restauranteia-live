import { httpClient } from "@/services/http-client";
import type { DevTest, TestCreate, TestUpdate, TestEstado } from "@/types/test";

// Servicios de Pruebas. Coincide con admin-web/backend/routers/desarrollo.py (tests).

export const testsKeys = {
    byAgenda: (agendaId: string, estado?: TestEstado) =>
        ["tests", "agenda", agendaId, estado ?? "all"] as const,
    countByAgenda: (agendaId: string, estado?: TestEstado) =>
        ["tests", "count", agendaId, estado ?? "all"] as const,
};

export interface TestsCountResponse {
    count: number;
}

export const testsService = {
    listByAgenda: (agendaId: string, estado?: TestEstado) => {
        const qs = estado ? `?estado=${estado}` : "";
        return httpClient.get<DevTest[]>(`/api/agendas/${agendaId}/tests${qs}`);
    },
    countByAgenda: (agendaId: string, estado?: TestEstado) => {
        const qs = estado ? `?estado=${estado}` : "";
        return httpClient.get<TestsCountResponse>(`/api/agendas/${agendaId}/tests/count${qs}`);
    },
    create: (agendaId: string, body: TestCreate) =>
        httpClient.post<DevTest>(`/api/agendas/${agendaId}/tests`, body),
    update: (testId: string, body: TestUpdate) => httpClient.patch<DevTest>(`/api/tests/${testId}`, body),
    delete: (testId: string) => httpClient.delete<{ deleted: boolean; id: string }>(`/api/tests/${testId}`),
    guardarEvaluacion: (testId: string, body: unknown) =>
        httpClient.patch<DevTest>(`/api/tests/${testId}/evaluacion`, body),
};
