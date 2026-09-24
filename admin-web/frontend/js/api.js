// Cliente HTTP al backend FastAPI.
const BASE = ''; // relativo — mismo origen

// === Supabase Auth (deshabilitado por defecto) ===
// Para activarlo: setear window.__SUPABASE_ACCESS_TOKEN__ antes de importar este modulo
// desde una rutina de login. La API ya soporta tokens JWT en el header Authorization.
let _accessToken = null;
export function setAccessToken(token) { _accessToken = token; }
export function clearAccessToken() { _accessToken = null; }

async function http(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    if (_accessToken) {
        opts.headers['Authorization'] = `Bearer ${_accessToken}`;
    }
    const r = await fetch(BASE + path, opts);
    const text = await r.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) {
        const msg = (data && data.detail) || (typeof data === 'string' ? data : r.statusText);
        throw new Error(`HTTP ${r.status}: ${msg}`);
    }
    return data;
}

export const api = {
    health: () => http('GET', '/api/healthz'),
    filters: (entidad) => http('GET', `/api/filters/${entidad}`),

    ideas: {
        list: (params = {}) => {
            const qs = new URLSearchParams(params).toString();
            return http('GET', `/api/ideas${qs ? '?' + qs : ''}`);
        },
        detail: (id) => http('GET', `/api/ideas/${id}`),
        create: (body) => http('POST', `/api/ideas`, body),
        update: (id, body) => http('PATCH', `/api/ideas/${id}`, body),
        delete: (id) => http('DELETE', `/api/ideas/${id}`),
    },
    agendas: {
        list: (params = {}) => {
            const qs = new URLSearchParams(params).toString();
            return http('GET', `/api/agendas${qs ? '?' + qs : ''}`);
        },
        detail: (id) => http('GET', `/api/agendas/${id}`),
        create: (body) => http('POST', `/api/agendas`, body),
        update: (id, body) => http('PATCH', `/api/agendas/${id}`, body),
        delete: (id) => http('DELETE', `/api/agendas/${id}`),
    },
    catalogos: {
        list: (params = {}) => {
            const qs = new URLSearchParams(params).toString();
            return http('GET', `/api/catalogos${qs ? '?' + qs : ''}`);
        },
        detail: (id) => http('GET', `/api/catalogos/${id}`),
        create: (body) => http('POST', `/api/catalogos`, body),
        update: (id, body) => http('PATCH', `/api/catalogos/${id}`, body),
        delete: (id) => http('DELETE', `/api/catalogos/${id}`),
    },
    relations: {
        add: (rel, a_id, b_id) => http('POST', `/api/relations/${rel}`, { a_id, b_id }),
        remove: (rel, a_id, b_id) => http('DELETE', `/api/relations/${rel}?a_id=${encodeURIComponent(a_id)}&b_id=${encodeURIComponent(b_id)}`),
    },
    images: {
        signedUrl: (bucket, path) => {
            const qs = new URLSearchParams({ bucket, path }).toString();
            return http('GET', `/api/images/signed?${qs}`);
        },
    },
    desarrollo: {
        pipeline: () => http('GET', '/api/desarrollo/pipeline'),
        estados: () => http('GET', '/api/desarrollo/estados'),
        pendientes: () => http('GET', '/api/pendientes'),
        cambiarEstado: (agendaId, estado, descripcion = '') =>
            http('PATCH', `/api/agendas/${agendaId}/estado`, {
                estado_desarrollo: estado,
                descripcion,
            }),
        agregarEvento: (agendaId, tipo, descripcion, extra = null) =>
            http('POST', `/api/agendas/${agendaId}/evento`, {
                tipo, descripcion, extra,
            }),
        tests: {
            list: (agendaId, estado = null) => {
                const qs = estado ? `?estado=${estado}` : '';
                return http('GET', `/api/agendas/${agendaId}/tests${qs}`);
            },
            count: (agendaId, estado = null) => {
                const qs = estado ? `?estado=${estado}` : '';
                return http('GET', `/api/agendas/${agendaId}/tests/count${qs}`);
            },
            create: (agendaId, payload) => http('POST', `/api/agendas/${agendaId}/tests`, payload),
            update: (testId, payload) => http('PATCH', `/api/tests/${testId}`, payload),
            delete: (testId) => http('DELETE', `/api/tests/${testId}`),
        },
        feedback: {
            list: (testId) => http('GET', `/api/tests/${testId}/feedback`),
            create: (testId, payload) => http('POST', `/api/tests/${testId}/feedback`, payload),
            update: (feedbackId, payload) => http('PATCH', `/api/feedback/${feedbackId}`, payload),
            delete: (feedbackId) => http('DELETE', `/api/feedback/${feedbackId}`),
        },
    },
};
