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