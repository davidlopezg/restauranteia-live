/**
 * Servicios de development_tests y test_feedback desde Supabase.
 *
 * Coincide con admin-web/backend/routers/desarrollo.py + queries.py.
 *
 * Tests (development_tests):
 *   - list: SELECT WHERE agenda_id
 *   - get: SELECT WHERE id
 *   - create: RPC (auto-fill numero + fecha)
 *   - update: PostgREST
 *   - delete: PostgREST
 *   - count: PostgREST COUNT
 *
 * Feedback (test_feedback):
 *   - list: SELECT WHERE test_id opcional
 *   - get: SELECT WHERE id
 *   - create: RPC (auto-fill fecha)
 *   - update: PostgREST
 *   - delete: PostgREST
 */

import { getSupabase } from "@/lib/supabase";
import { callRpc } from "@/lib/rpc";
import { httpClient } from "@/services/http-client";

export interface DevelopmentTest {
    id: string;
    agenda_id: string;
    numero: number;
    fecha: string | null;
    estado: string;
    objetivo: string | null;
    receta_utilizada: string | null;
    modificaciones: string | null;
    resultado: string | null;
    observaciones: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface TestFeedback {
    id: string;
    test_id: string;
    mesa: string;
    num_personas: number | null;
    valoracion: number | null;
    criterio: string | null;
    observacion: string | null;
    fecha: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface TestCreate {
    fecha?: string;
    estado?: string;
    objetivo?: string;
    receta_utilizada?: string;
    modificaciones?: string;
    resultado?: string;
    observaciones?: string;
}

export type TestUpdate = Partial<TestCreate>;

export interface FeedbackCreate {
    mesa: string;
    num_personas?: number;
    valoracion?: number;
    criterio?: string;
    observacion?: string;
    fecha?: string;
}

export type FeedbackUpdate = Partial<FeedbackCreate>;

// === COMMENTS (test_comments) ===
// Comentario libre cronológico por prueba. Complementa `observaciones`
// (campo resumen de la prueba) y `test_feedback` (datos estructurados
// de mesa). Use case: notas durante la prueba, "David dice: subir sal",
// "feedback de David al ver el emplatado", etc.

export interface TestComment {
    id: string;
    test_id: string;
    autor: string | null;
    texto: string;
    created_at: string;
}

export interface TestCommentCreate {
    autor?: string;
    texto: string;
}

export type TestCommentUpdate = Partial<TestCommentCreate>;

// === TESTS ===

export const testsKeys = {
    forAgenda: (agendaId: string, estado?: string) => ["tests", agendaId, estado ?? "all"] as const,
    countForAgenda: (agendaId: string, estado?: string) => ["tests", agendaId, "count", estado ?? "all"] as const,
};

export const testsSupabase = {
    async list(agendaId: string, estado?: string): Promise<DevelopmentTest[]> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        let q = supabase.from("development_tests").select("*").eq("agenda_id", agendaId);
        if (estado) q = q.eq("estado", estado);
        q = q.order("numero", { ascending: true });
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return (data ?? []) as DevelopmentTest[];
    },

    async count(agendaId: string, estado?: string): Promise<number> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        let q = supabase.from("development_tests").select("id", { count: "exact", head: true }).eq("agenda_id", agendaId);
        if (estado) q = q.eq("estado", estado);
        const { count, error } = await q;
        if (error) throw new Error(error.message);
        return count ?? 0;
    },

    async create(agendaId: string, body: TestCreate): Promise<DevelopmentTest> {
        // RPC para auto-fill de numero + fecha
        return callRpc<DevelopmentTest>("create_development_test", {
            p_agenda_id: agendaId,
            p_payload: body,
        });
    },

    async update(testId: string, body: TestUpdate): Promise<DevelopmentTest> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        const { data, error } = await supabase
            .from("development_tests")
            .update(body)
            .eq("id", testId)
            .select("*")
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("Prueba no encontrada");
        return data as DevelopmentTest;
    },

    async delete(testId: string): Promise<{ deleted: boolean; id: string }> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        const { error } = await supabase.from("development_tests").delete().eq("id", testId);
        if (error) throw new Error(error.message);
        return { deleted: true, id: testId };
    },
};

// === FEEDBACK ===

export const feedbackKeys = {
    all: () => ["feedback"] as const,
    forTest: (testId: string) => ["feedback", testId] as const,
};

export const feedbackSupabase = {
    async list(testId?: string): Promise<TestFeedback[]> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        let q = supabase.from("test_feedback").select("*");
        if (testId) q = q.eq("test_id", testId);
        q = q.order("fecha", { ascending: false }).order("created_at", { ascending: false });
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return (data ?? []) as TestFeedback[];
    },

    async create(testId: string, body: FeedbackCreate): Promise<TestFeedback> {
        // RPC para auto-fill de fecha
        return callRpc<TestFeedback>("create_test_feedback", {
            p_test_id: testId,
            p_payload: body,
        });
    },

    async update(feedbackId: string, body: FeedbackUpdate): Promise<TestFeedback> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        const { data, error } = await supabase
            .from("test_feedback")
            .update(body)
            .eq("id", feedbackId)
            .select("*")
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("Feedback no encontrado");
        return data as TestFeedback;
    },

    async delete(feedbackId: string): Promise<{ deleted: boolean; id: string }> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        const { error } = await supabase.from("test_feedback").delete().eq("id", feedbackId);
        if (error) throw new Error(error.message);
        return { deleted: true, id: feedbackId };
    },
};

// === COMMENTS (Supabase) ===

export const commentsSupabase = {
    async list(testId: string): Promise<TestComment[]> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        const { data, error } = await supabase
            .from("test_comments")
            .select("*")
            .eq("test_id", testId)
            .order("created_at", { ascending: false });
        if (error) throw new Error(error.message);
        return (data ?? []) as TestComment[];
    },

    async create(testId: string, body: TestCommentCreate): Promise<TestComment> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        const { data, error } = await supabase
            .from("test_comments")
            .insert({ test_id: testId, ...body })
            .select("*")
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("No se pudo crear el comentario");
        return data as TestComment;
    },

    async delete(commentId: string): Promise<{ deleted: boolean; id: string }> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        const { error } = await supabase.from("test_comments").delete().eq("id", commentId);
        if (error) throw new Error(error.message);
        return { deleted: true, id: commentId };
    },
};

// === Aprobar y promover ===
// Marca la prueba como APROBADO, crea un producto en catalogos con los
// datos de la agenda + ficha_generada de la prueba, linkea agenda_catalogo
// y mueve la agenda a estado_desarrollo='PRODUCTO'.
// Devuelve { test, agenda, catalogo }.

export interface AprobarResult {
    testId: string;
    agendaId: string;
    catalogoId: string;
}

export async function aprobarYPromover(testId: string): Promise<AprobarResult> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");

    // 1. Cargar la prueba + su agenda + catálogo relacionado (si existe)
    const { data: test, error: testErr } = await supabase
        .from("development_tests")
        .select("id, agenda_id, ficha_generada, receta_utilizada, modificaciones")
        .eq("id", testId)
        .maybeSingle();
    if (testErr) throw new Error(testErr.message);
    if (!test) throw new Error("Prueba no encontrada");

    const { data: agenda, error: agErr } = await supabase
        .from("agendas")
        .select("id, titulo, receta_final, objetivo")
        .eq("id", (test as { agenda_id: string }).agenda_id)
        .maybeSingle();
    if (agErr) throw new Error(agErr.message);
    if (!agenda) throw new Error("Agenda no encontrada");

    // 2. Crear fila en catalogos con titulo de la agenda + ficha_generada como receta_estructurada
    const fichaTexto = (test as { ficha_generada?: { texto?: string } | string | null }).ficha_generada;
    const recetaTexto = typeof fichaTexto === "string"
        ? fichaTexto
        : fichaTexto?.texto ?? JSON.stringify(fichaTexto ?? null);

    const { data: catalogo, error: catErr } = await supabase
        .from("catalogos")
        .insert({
            titulo: (agenda as { titulo: string }).titulo,
            estado: "Listo",
            seleccionada: false,
            receta_estructurada: {
                fuente: "test_aprobado",
                test_id: testId,
                ficha_generada: recetaTexto,
                receta_utilizada: (test as { receta_utilizada?: string | null }).receta_utilizada ?? null,
                modificaciones: (test as { modificaciones?: string | null }).modificaciones ?? null,
                receta_final_agenda: (agenda as { receta_final?: unknown }).receta_final ?? null,
            },
            migrated_at: new Date().toISOString(),
            migration_run_id: "test_aprobado",
        })
        .select("id")
        .maybeSingle();
    if (catErr) throw new Error(catErr.message);
    if (!catalogo) throw new Error("No se pudo crear el producto");

    const catalogoId = (catalogo as { id: string }).id;
    const agendaId = (test as { agenda_id: string }).agenda_id;

    // 3. Linkear agenda_catalogo (idempotente)
    await supabase
        .from("agenda_catalogo")
        .upsert({ agenda_id: agendaId, catalogo_id: catalogoId }, { onConflict: "agenda_id,catalogo_id" });

    // 4. Marcar la prueba como APROBADO
    const { error: upTestErr } = await supabase
        .from("development_tests")
        .update({ estado: "APROBADO" })
        .eq("id", testId);
    if (upTestErr) throw new Error(upTestErr.message);

    // 5. Mover la agenda a PRODUCTO
    const { error: upAgErr } = await supabase
        .from("agendas")
        .update({ estado_desarrollo: "PRODUCTO" })
        .eq("id", agendaId);
    if (upAgErr) throw new Error(upAgErr.message);

    return { testId, agendaId, catalogoId };
}

// === Legacy fallback ===

export const testsLegacy = {
    list: (agendaId: string, estado?: string) => {
        const qs = estado ? `?estado=${encodeURIComponent(estado)}` : "";
        return httpClient.get<DevelopmentTest[]>(`/api/agendas/${agendaId}/tests${qs}`);
    },
    count: (agendaId: string, estado?: string) => {
        const qs = estado ? `?estado=${encodeURIComponent(estado)}` : "";
        return httpClient.get<{ count: number }>(`/api/agendas/${agendaId}/tests/count${qs}`).then((r) => r.count);
    },
    create: (agendaId: string, body: TestCreate) =>
        httpClient.post<DevelopmentTest>(`/api/agendas/${agendaId}/tests`, body),
    update: (testId: string, body: TestUpdate) =>
        httpClient.patch<DevelopmentTest>(`/api/tests/${testId}`, body),
    delete: (testId: string) =>
        httpClient.delete<{ deleted: boolean; id: string }>(`/api/tests/${testId}`),
};

export const feedbackLegacy = {
    list: (testId?: string) => {
        const qs = testId ? `?test_id=${encodeURIComponent(testId)}` : "";
        return httpClient.get<TestFeedback[]>(`/api/feedback${qs}`);
    },
    create: (testId: string, body: FeedbackCreate) =>
        httpClient.post<TestFeedback>(`/api/tests/${testId}/feedback`, body),
    update: (feedbackId: string, body: FeedbackUpdate) =>
        httpClient.patch<TestFeedback>(`/api/feedback/${feedbackId}`, body),
    delete: (feedbackId: string) =>
        httpClient.delete<{ deleted: boolean; id: string }>(`/api/feedback/${feedbackId}`),
};