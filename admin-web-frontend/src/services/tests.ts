/**
 * Fachada unificada tests/feedback — Supabase / Legacy.
 */

import { env } from "@/config/env";
import {
    testsSupabase, feedbackSupabase,
    testsLegacy, feedbackLegacy,
    type DevelopmentTest, type TestCreate, type TestUpdate,
    type TestFeedback, type FeedbackCreate, type FeedbackUpdate,
    testsKeys, feedbackKeys,
} from "@/services/tests.supabase";

export type { DevelopmentTest, TestCreate, TestUpdate, TestFeedback, FeedbackCreate, FeedbackUpdate };
export { testsKeys, feedbackKeys };

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