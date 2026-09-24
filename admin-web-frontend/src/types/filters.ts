// Tipos de filtros y settings.

export interface FiltersResponse {
    categorias: string[];
    estados: string[];
}

/** Settings NO sensibles (api_keys nunca viajan al cliente). */
export interface SettingsResponse {
    ia_configured: boolean;
    openrouter_configured: boolean;
    minimax_key_source: string;
    openrouter_key_source: string;
    minimax_base_url?: string;
    minimax_model?: string;
    openrouter_base_url?: string;
    openrouter_model?: string;
    prompt_ficha_test?: string;
    [k: string]: unknown;
}

export interface KeyStatusResponse {
    ia_configured: boolean;
    model: string | null;
    openrouter_configured: boolean;
    key_source: string;
}

export interface TestProvidersResponse {
    minimax?: unknown;
    openrouter?: unknown;
}

export interface SettingsUpdate {
    minimax_api_key?: string;
    minimax_base_url?: string;
    minimax_model?: string;
    openrouter_api_key?: string;
    openrouter_base_url?: string;
    openrouter_model?: string;
    prompt_ficha_test?: string;
}
