import { httpClient } from "@/services/http-client";
import type { TestFeedback, FeedbackCreate, FeedbackUpdate } from "@/types/feedback";

// Servicios de Feedback de mesa. Coincide con admin-web/backend/routers/desarrollo.py.

export const feedbackKeys = {
    byTest: (testId: string) => ["feedback", "test", testId] as const,
};

export const feedbackService = {
    listByTest: (testId: string) => httpClient.get<TestFeedback[]>(`/api/tests/${testId}/feedback`),
    create: (testId: string, body: FeedbackCreate) =>
        httpClient.post<TestFeedback>(`/api/tests/${testId}/feedback`, body),
    update: (feedbackId: string, body: FeedbackUpdate) =>
        httpClient.patch<TestFeedback>(`/api/feedback/${feedbackId}`, body),
    delete: (feedbackId: string) =>
        httpClient.delete<{ deleted: boolean; id: string }>(`/api/feedback/${feedbackId}`),
};
