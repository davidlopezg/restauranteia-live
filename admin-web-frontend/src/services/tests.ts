/**
 * Fachada unificada tests/feedback — Supabase / Legacy.
 */

import { env } from "@/config/env";
import {
    testsSupabase, feedbackSupabase, commentsSupabase,
    aprobarYPromover as aprobarYPromoverSupabase,
    testsLegacy, feedbackLegacy,
    type DevelopmentTest, type TestCreate, type TestUpdate,
    type TestFeedback, type FeedbackCreate, type FeedbackUpdate,
    type TestComment, type TestCommentCreate,
    testsKeys, feedbackKeys,
} from "@/services/tests.supabase";

export type { DevelopmentTest, TestCreate, TestUpdate, TestFeedback, FeedbackCreate, FeedbackUpdate, TestComment, TestCommentCreate };
export { testsKeys, feedbackKeys, aprobarYPromoverSupabase };

export const testsService = {
    list: (agendaId: string, estado?: string): Promise<DevelopmentTest[]> =>
        env.isSupabaseConfigured ? testsSupabase.list(agendaId, estado) : testsLegacy.list(agendaId, estado),

    // Alias para compatibilidad con componentes que ya usan listByAgenda
    listByAgenda: (agendaId: string, estado?: string): Promise<DevelopmentTest[]> =>
        env.isSupabaseConfigured ? testsSupabase.list(agendaId, estado) : testsLegacy.list(agendaId, estado),

    count: (agendaId: string, estado?: string): Promise<number> =>
        env.isSupabaseConfigured ? testsSupabase.count(agendaId, estado) : testsLegacy.count(agendaId, estado),

    // Alias para componentes que usan countByAgenda
    countByAgenda: (agendaId: string, estado?: string): Promise<number> =>
        env.isSupabaseConfigured ? testsSupabase.count(agendaId, estado) : testsLegacy.count(agendaId, estado),

    create: (agendaId: string, body: TestCreate): Promise<DevelopmentTest> =>
        env.isSupabaseConfigured ? testsSupabase.create(agendaId, body) : testsLegacy.create(agendaId, body),

    update: (testId: string, body: TestUpdate): Promise<DevelopmentTest> =>
        env.isSupabaseConfigured ? testsSupabase.update(testId, body) : testsLegacy.update(testId, body),

    delete: (testId: string): Promise<{ deleted: boolean; id: string }> =>
        env.isSupabaseConfigured ? testsSupabase.delete(testId) : testsLegacy.delete(testId),
};

export const feedbackService = {
    list: (testId?: string): Promise<TestFeedback[]> =>
        env.isSupabaseConfigured ? feedbackSupabase.list(testId) : feedbackLegacy.list(testId),

    create: (testId: string, body: FeedbackCreate): Promise<TestFeedback> =>
        env.isSupabaseConfigured ? feedbackSupabase.create(testId, body) : feedbackLegacy.create(testId, body),

    update: (feedbackId: string, body: FeedbackUpdate): Promise<TestFeedback> =>
        env.isSupabaseConfigured ? feedbackSupabase.update(feedbackId, body) : feedbackLegacy.update(feedbackId, body),

    delete: (feedbackId: string): Promise<{ deleted: boolean; id: string }> =>
        env.isSupabaseConfigured ? feedbackSupabase.delete(feedbackId) : feedbackLegacy.delete(feedbackId),
};

// Comentarios cronológicos por prueba. Solo Supabase por ahora
// (no hay endpoint legacy en backend). Si isSupabaseConfigured=false,
// falla explícito.
export const commentsService = {
    list: (testId: string): Promise<TestComment[]> => commentsSupabase.list(testId),
    create: (testId: string, body: TestCommentCreate): Promise<TestComment> => commentsSupabase.create(testId, body),
    delete: (commentId: string): Promise<{ deleted: boolean; id: string }> => commentsSupabase.delete(commentId),
};

// Aprueba una prueba y promueve a producto. Crea la fila en catalogos,
// linkea agenda_catalogo y marca la agenda como PRODUCTO. Solo Supabase.
export const aprobarService = {
    run: (testId: string) => aprobarYPromoverSupabase(testId),
};