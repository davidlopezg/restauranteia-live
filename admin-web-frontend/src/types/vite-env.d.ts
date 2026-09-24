/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Override del base URL del API (vacío = mismo origen, usar proxy de Vite en dev). */
    readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
