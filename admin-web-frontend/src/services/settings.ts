import { httpClient } from "@/services/http-client";
import type {
    KeyStatusResponse,
    SettingsResponse,
    SettingsUpdate,
    TestProvidersResponse,
} from "@/types/filters";

// Servicios de Settings. Coincide con admin-web/backend/routers/settings.py.
// IMPORTANTE: nunca se envían/leen API keys desde el cliente; el backend las
// almacena y solo expone flags de configuración (configured, key_source).

export const settingsKeys = {
    all: () => ["settings"] as const,
    keyStatus: () => ["settings", "key-status"] as const,
};

export const settingsService = {
    get: () => httpClient.get<SettingsResponse>("/api/settings"),
    update: (body: SettingsUpdate) => httpClient.patch<SettingsResponse>("/api/settings", body),
    keyStatus: () => httpClient.get<KeyStatusResponse>("/api/settings/key-status"),
    testProviders: () => httpClient.get<TestProvidersResponse>("/api/settings/test-providers"),
};
