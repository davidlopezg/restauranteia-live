/**
 * Variables de entorno (Vite).
 *
 * - VITE_SUPABASE_URL: URL pública del proyecto (https://xxx.supabase.co)
 * - VITE_SUPABASE_ANON_KEY: clave anon pública. Es seguro exponerla en frontend
 *   porque RLS filtra el acceso por usuario.
 *
 * NUNCA poner SUPABASE_SERVICE_ROLE_KEY aquí — esa key bypasea RLS.
 *
 * En dev (.env.local), en prod (GitHub Actions secrets → build-time env).
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function requireEnv(name: string, value: string | undefined): string {
    if (!value) {
        // No lanzamos en build para no romper GH Actions sin secrets.
        // Solo cuando se intenta usar el cliente.
        console.warn(
            `[env] Falta ${name}. Definila en .env.local o en GitHub Actions secrets.`
        );
        return "";
    }
    return value;
}

export const env = {
    supabaseUrl: requireEnv("VITE_SUPABASE_URL", SUPABASE_URL),
    supabaseAnonKey: requireEnv("VITE_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY),
    isSupabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
    /**
     * Si en algún momento queremos fallback al backend FastAPI antiguo
     * durante la migración, va acá. Default = Supabase directo.
     */
    legacyBackendUrl: (import.meta.env.VITE_LEGACY_BACKEND_URL as string | undefined) ?? "",
    appBasePath: (import.meta.env.VITE_BASE_PATH as string | undefined) ?? "/",
} as const;