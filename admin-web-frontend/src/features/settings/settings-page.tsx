import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/providers/theme-provider";
import { settingsKeys, settingsService } from "@/services/settings";
import type { SettingsUpdate } from "@/types/filters";

// Settings: tema, MiniMax key, OpenRouter key, prompt ficha, diagnóstico real.

export const SettingsPage = () => {
    const qc = useQueryClient();
    const { theme, setTheme } = useTheme();

    const { data: settings } = useQuery({
        queryKey: settingsKeys.all(),
        queryFn: () => settingsService.get(),
    });

    const { data: keyStatus } = useQuery({
        queryKey: settingsKeys.keyStatus(),
        queryFn: () => settingsService.keyStatus(),
    });

    const update = useMutation({
        mutationFn: (body: SettingsUpdate) => settingsService.update(body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: settingsKeys.all() });
            qc.invalidateQueries({ queryKey: settingsKeys.keyStatus() });
        },
    });

    const testProviders = useMutation({
        mutationFn: () => settingsService.testProviders(),
    });

    return (
        <div className="mx-auto max-w-2xl space-y-4">
            <header>
                <h1 className="text-lg font-semibold text-primary">Configuración</h1>
            </header>

            {/* Tema */}
            <section className="rounded-lg border border-secondary bg-primary p-4">
                <h2 className="text-sm font-semibold text-primary">🎨 Apariencia</h2>
                <div className="mt-2 flex items-center gap-2">
                    <span className="rounded-full bg-secondary px-3 py-0.5 text-xs">
                        Tema: {theme === "dark" ? "oscuro 🌙" : "claro ☀️"}
                    </span>
                    <button
                        type="button"
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                        className="rounded-md bg-brand-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-primary_hover"
                    >
                        {theme === "dark" ? "☀️ Cambiar a claro" : "🌙 Cambiar a oscuro"}
                    </button>
                </div>
            </section>

            {/* MiniMax */}
            <ProviderCard
                title="🧠 MiniMax — IA Creativa Principal"
                statusConfigured={keyStatus?.ia_configured ?? false}
                statusModel={keyStatus?.model}
                keySource={keyStatus?.key_source}
                baseUrlDefault="https://api.minimax.io/v1"
                modelDefault="MiniMax-M3"
                baseUrlValue={settings?.minimax_base_url}
                modelValue={settings?.minimax_model}
                promptEnabled={false}
                onSubmit={body => update.mutate(body)}
                isSaving={update.isPending}
                keyPrefix="s-"
            />

            {/* OpenRouter */}
            <ProviderCard
                title="🌐 OpenRouter — Fichas de Prueba con IA"
                statusConfigured={keyStatus?.openrouter_configured ?? false}
                statusModel={settings?.openrouter_model}
                keySource={settings?.openrouter_key_source}
                baseUrlDefault="https://openrouter.ai/api/v1"
                modelDefault="nano-banana/nano-banana"
                baseUrlValue={settings?.openrouter_base_url}
                modelValue={settings?.openrouter_model}
                promptEnabled
                promptValue={settings?.prompt_ficha_test}
                onSubmit={body => update.mutate(body)}
                isSaving={update.isPending}
                keyPrefix="or-"
            />

            {/* Diagnóstico */}
            <section className="rounded-lg border border-secondary bg-primary p-4">
                <h2 className="text-sm font-semibold text-primary">🔍 Diagnóstico de proveedores</h2>
                <p className="mt-1 text-xs text-tertiary">
                    Hace una petición real a cada proveedor. Nunca expone la API key completa.
                </p>
                <button
                    type="button"
                    onClick={() => testProviders.mutate()}
                    disabled={testProviders.isPending}
                    className="mt-2 rounded-md bg-brand-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-primary_hover disabled:opacity-50"
                >
                    {testProviders.isPending ? "Probando…" : "Probar conexiones ahora"}
                </button>
                {testProviders.data && (
                    <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-secondary p-3 font-mono text-xs text-primary">
                        {JSON.stringify(testProviders.data, null, 2)}
                    </pre>
                )}
                {testProviders.error && (
                    <p className="mt-2 text-xs text-error-primary">
                        Error: {(testProviders.error as Error).message}
                    </p>
                )}
            </section>
        </div>
    );
};

interface ProviderCardProps {
    title: string;
    statusConfigured: boolean;
    statusModel?: string | null;
    keySource?: string;
    baseUrlDefault: string;
    modelDefault: string;
    baseUrlValue?: string;
    modelValue?: string;
    promptEnabled: boolean;
    promptValue?: string;
    onSubmit: (body: SettingsUpdate) => void;
    isSaving: boolean;
    keyPrefix: string;
}

const ProviderCard = ({
    title,
    statusConfigured,
    statusModel,
    keySource,
    baseUrlDefault,
    modelDefault,
    baseUrlValue,
    modelValue,
    promptEnabled,
    promptValue,
    onSubmit,
    isSaving,
    keyPrefix,
}: ProviderCardProps) => {
    const [key, setKey] = useState("");
    const [url, setUrl] = useState(baseUrlValue ?? baseUrlDefault);
    const [model, setModel] = useState(modelValue ?? modelDefault);
    const [prompt, setPrompt] = useState(promptValue ?? "");

    return (
        <section className="rounded-lg border border-secondary bg-primary p-4">
            <h2 className="text-sm font-semibold text-primary">{title}</h2>
            <div className="mt-2">
                <span className={`rounded-full px-3 py-0.5 text-xs font-medium ${statusConfigured ? "bg-success-secondary text-success-primary" : "bg-error-secondary text-error-primary"}`}>
                    {statusConfigured ? `✅ Configurada — modelo: ${statusModel ?? "?"}` : "❌ No configurada"}
                </span>
                {keySource && <span className="ml-2 text-xs text-tertiary">Origen: {keySource}</span>}
            </div>
            <form
                onSubmit={ev => {
                    ev.preventDefault();
                    const body: SettingsUpdate = {};
                    if (key.trim() && !/^[•\s]+$/.test(key)) {
                        if (keyPrefix === "s-") body.minimax_api_key = key.trim();
                        else body.openrouter_api_key = key.trim();
                    }
                    if (url !== (baseUrlValue ?? baseUrlDefault)) {
                        if (keyPrefix === "s-") body.minimax_base_url = url;
                        else body.openrouter_base_url = url;
                    }
                    if (model !== (modelValue ?? modelDefault)) {
                        if (keyPrefix === "s-") body.minimax_model = model;
                        else body.openrouter_model = model;
                    }
                    if (promptEnabled && prompt !== (promptValue ?? "")) {
                        body.prompt_ficha_test = prompt;
                    }
                    if (Object.keys(body).length === 0) return;
                    onSubmit(body);
                    setKey("");
                }}
                className="mt-3 space-y-2"
            >
                <div>
                    <label className="block text-xs text-tertiary">API Key</label>
                    <input
                        type="password"
                        value={key}
                        onChange={e => setKey(e.target.value)}
                        placeholder={statusConfigured ? "(ya configurada — escribe solo si quieres cambiarla)" : "sk-..."}
                        className="w-full rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs text-tertiary">Base URL</label>
                    <input
                        type="text"
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        className="w-full rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs text-tertiary">Modelo</label>
                    <input
                        type="text"
                        value={model}
                        onChange={e => setModel(e.target.value)}
                        className="w-full rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                    />
                </div>
                {promptEnabled && (
                    <div>
                        <label className="block text-xs text-tertiary">Prompt para generar ficha</label>
                        <textarea
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            rows={4}
                            className="w-full rounded-md border border-secondary bg-primary px-3 py-1.5 font-mono text-xs"
                        />
                    </div>
                )}
                <div className="flex justify-end">
                    <button type="submit" disabled={isSaving} className="rounded-md bg-brand-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-primary_hover disabled:opacity-50">
                        {isSaving ? "Guardando…" : "Guardar"}
                    </button>
                </div>
            </form>
        </section>
    );
};
