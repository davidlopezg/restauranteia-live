// Tipos del módulo IA (ideas creativas, científicas, chat, ficha).

export interface IaStatusResponse {
    configured: boolean;
    model: string | null;
    base_url: string;
    key_source: string;
    ia_configured?: boolean;
    openrouter_configured?: boolean;
    openrouter_model?: string | null;
    openrouter_base_url?: string | null;
}

export interface IaMetodosResponse {
    metodos: string[];
}

export interface IaIdea {
    titulo: string;
    tipo?: string;
    razon?: string;
    semilla?: string;
    [extra: string]: unknown;
}

export interface IaGenerarIdeasRequest {
    peticion: string;
    n?: number;
    ideas_previas?: IaIdea[];
}

export interface IaGenerarIdeasResponse {
    ideas: IaIdea[];
    count: number;
    modelo: string;
}

export interface IaAplicarMetodoRequest {
    idea: IaIdea;
    metodo: string;
    peticion_original?: string;
}

export interface IaAplicarMetodoResponse {
    resultado: string;
    metodo: string;
}

export interface IaChatRequest {
    peticion: string;
    contexto?: unknown;
}

export interface IaChatResponse {
    respuesta: string;
}

export interface IaIdeaCientificaRequest {
    peticion: string;
}

export interface GenerarFichaResponse {
    /** Lo que devuelva OpenRouter: texto estructurado + metadatos. */
    [k: string]: unknown;
}
