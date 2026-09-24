// Cliente HTTP fino sobre fetch.
//
// Reglas:
// - Timeout 15s en cada llamada (Bug 9 del AUDITORIA_PRODUCTO).
// - Lanza ApiError normalizado para que TanStack Query pinte el error uniforme.
// - Base path relativo (mismo origen) cuando VITE_API_BASE_URL está vacío → usa el proxy de Vite en dev.

const DEFAULT_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
    readonly status: number;
    readonly detail: unknown;

    constructor(status: number, message: string, detail?: unknown) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.detail = detail;
    }
}

interface RequestOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
}

function getBaseUrl(): string {
    // Vacío = mismo origen (dev con proxy de Vite, prod con FastAPI sirviendo la SPA).
    return import.meta.env.VITE_API_BASE_URL ?? "";
}

async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: RequestOptions = {},
): Promise<T> {
    const url = getBaseUrl() + path;
    const init: RequestInit = {
        method,
        headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    };
    if (body !== undefined) init.body = JSON.stringify(body);

    // Combinar señal del caller con timeout.
    const controller = new AbortController();
    const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(new Error("timeout")), timeout);
    if (options.signal) {
        if (options.signal.aborted) controller.abort(options.signal.reason);
        else options.signal.addEventListener("abort", () => controller.abort(options.signal!.reason));
    }
    init.signal = controller.signal;

    let response: Response;
    try {
        response = await fetch(url, init);
    } catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === "AbortError") {
            throw new ApiError(0, `Timeout tras ${timeout}ms: ${method} ${path}`);
        }
        throw new ApiError(0, `Error de red: ${(err as Error).message}`);
    }
    clearTimeout(timer);

    const text = await response.text();
    let data: unknown = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
    }

    if (!response.ok) {
        const detail = (data && typeof data === "object" && "detail" in data) ? (data as { detail: unknown }).detail : data;
        const message = typeof detail === "string" ? detail : response.statusText;
        throw new ApiError(response.status, `HTTP ${response.status}: ${message}`, detail);
    }

    return data as T;
}

export const httpClient = {
    get: <T,>(path: string, options?: RequestOptions) => request<T>("GET", path, undefined, options),
    post: <T,>(path: string, body?: unknown, options?: RequestOptions) => request<T>("POST", path, body, options),
    patch: <T,>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PATCH", path, body, options),
    delete: <T,>(path: string, options?: RequestOptions) => request<T>("DELETE", path, undefined, options),
};
