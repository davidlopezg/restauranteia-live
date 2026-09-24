import { httpClient } from "@/services/http-client";
import type {
    IaAplicarMetodoRequest,
    IaAplicarMetodoResponse,
    IaChatRequest,
    IaChatResponse,
    IaGenerarIdeasRequest,
    IaGenerarIdeasResponse,
    IaIdeaCientificaRequest,
    IaMetodosResponse,
    IaStatusResponse,
    GenerarFichaResponse,
} from "@/types/ia";

// Servicios de IA: status, ideas creativas, científicas, chat, ficha.
// Coincide con admin-web/backend/routers/ia.py.

export const iaKeys = {
    status: () => ["ia", "status"] as const,
    metodos: () => ["ia", "metodos"] as const,
};

export const iaService = {
    status: () => httpClient.get<IaStatusResponse>("/api/ia/status"),
    metodos: () => httpClient.get<IaMetodosResponse>("/api/ia/metodos"),
    generarIdeas: (body: IaGenerarIdeasRequest) =>
        httpClient.post<IaGenerarIdeasResponse>("/api/ia/ideas", body),
    aplicarMetodo: (body: IaAplicarMetodoRequest) =>
        httpClient.post<IaAplicarMetodoResponse>("/api/ia/aplicar-metodo", body),
    ideaCientifica: (body: IaIdeaCientificaRequest) =>
        httpClient.post<unknown>("/api/ia/idea-cientifica", body),
    chat: (body: IaChatRequest) => httpClient.post<IaChatResponse>("/api/ia/chat", body),
    ayudaSemanal: (body: { peticion?: string } = {}) =>
        httpClient.post<{ respuesta: string; contexto_usado: unknown }>("/api/ia/ayuda-semanal", body),
    generarPlating: (catalogoId: string) =>
        httpClient.post<{ generadas: number; propuestas: unknown[]; modelo: string }>(
            `/api/catalogos/${catalogoId}/plating/generar`,
            {},
        ),
    generarWare: (catalogoId: string, platingProposalId: string) =>
        httpClient.get<unknown>(`/api/catalogos/${catalogoId}/ware/generar?plating_proposal_id=${platingProposalId}`),
    generarFicha: (testId: string) =>
        httpClient.post<GenerarFichaResponse>(`/api/tests/${testId}/generar-ficha`, {}),
};
