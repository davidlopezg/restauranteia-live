/**
 * Fachada unificada feedback — Supabase / Legacy.
 */

import { env } from "@/config/env";
import {
    feedbackSupabase,
    feedbackLegacy,
    type TestFeedback, type FeedbackCreate, type FeedbackUpdate,
    feedbackKeys,
} from "@/services/tests.supabase";

export type { TestFeedback, FeedbackCreate, FeedbackUpdate };
export { feedbackKeys };

export const feedbackService = {
    list: (testId?: string): Promise<TestFeedback[]> =>
        env.isSupabaseConfigured ? feedbackSupabase.list(testId) : feedbackLegacy.list(testId),

    // Alias para componentes que usan listByTest
    listByTest: (testId: string): Promise<TestFeedback[]> =>
        env.isSupabaseConfigured ? feedbackSupabase.list(testId) : feedbackLegacy.list(testId),

    create: (testId: string, body: FeedbackCreate): Promise<TestFeedback> =>
        env.isSupabaseConfigured ? feedbackSupabase.create(testId, body) : feedbackLegacy.create(testId, body),

    update: (feedbackId: string, body: FeedbackUpdate): Promise<TestFeedback> =>
        env.isSupabaseConfigured ? feedbackSupabase.update(feedbackId, body) : feedbackLegacy.update(feedbackId, body),

    delete: (feedbackId: string): Promise<{ deleted: boolean; id: string }> =>
        env.isSupabaseConfigured ? feedbackSupabase.delete(feedbackId) : feedbackLegacy.delete(feedbackId),
};