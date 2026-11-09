import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/providers/theme-provider";
import { settingsKeys, settingsService } from "@/services/settings";
import type { SettingsUpdate } from "@/types/filters";

// Settings: tema, MiniMax key, OpenRouter key, prompt ficha, plantillas
// (FASE 8: prompt_emplatado, plantilla_ficha_tecnica), diagnóstico real.

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
        retry: false,
    });

    // ¿Están desplegadas las Edge Functions del proyecto? Si no, las features de
    // IA (Ideas, Chat, Fichas) no funcionan aunque la API key esté guardada.
    const { data: functions } = useQuery({
        queryKey: settingsKeys.functions(),
        queryFn: () => settingsService.functionsDeployed(),
        retry: false,
        staleTime: 60_000,
    });

    const update = useMutation({
        mutationFn: (body: SettingsUpdate) => settingsService.update(body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: settingsKeys.all() });
            qc.invalidateQueries({ queryKey: settingsKeys.keyStatus() });
            qc.invalidateQueries({ queryKey: ["ia", "status"] });
        },
    });

    const clearKey = useMutation({
        mutationFn: (key: string) => settingsService.clear(key),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: settingsKeys.all() });
            qc.invalidateQueries({ queryKey: settingsKeys.keyStatus() });
            qc.invalidateQueries({ queryKey: ["ia", "status"] });
        },
    });

    const testProviders = useMutation({
        mutationFn: () => settingsService.testProviders(),
    });

    const savedKeys = Object.keys(update.data?.updated ?? {});

    return (
        <div className="mx-auto max-w-2xl space-y-4">
            <header>
                <h1 className="text-lg font-semibold text-primary">Configuración</h1>
            </header>

            {/* Estado del guardado — NUNCA fallar en silencio */}
            {update.isSuccess && (
                <p className="rounded-md bg-success-secondary px-3 py-2 text-xs text-success-primary">
                    ✅ Guardado{savedKeys.length > 0 && ` (${savedKeys.join(", ")})`}
                </p>
            )}
            {update.error && (
                <p className="rounded-md bg-error-secondary px-3 py-2 text-xs text-error-primary">❌ No se pudo guardar: {(update.error as Error).message}</p>
            )}
            {clearKey.isSuccess && <p className="rounded-md bg-success-secondary px-3 py-2 text-xs text-success-primary">✅ Key borrada</p>}
            {clearKey.error && (
                <p className="rounded-md bg-error-secondary px-3 py-2 text-xs text-error-primary">❌ No se pudo borrar: {(clearKey.error as Error).message}</p>
            )}

            {/* Estado del sistema: sin Edge Functions la IA no funciona */}
            {functions && !functions.deployed && (
                <div className="border-warning-primary rounded-md border bg-warning-secondary px-3 py-2 text-xs text-primary">
                    <strong>⚠️ Las funciones de IA no están desplegadas en este proyecto.</strong> Podés guardar la API key (se guarda en la base de datos),
                    pero generar ideas, chat o fichas no funcionará hasta desplegarlas. Se despliegan con el workflow <em>Deploy Frontend + Edge Functions</em>{" "}
                    (necesita un access token válido de Supabase en el secret <code>SUPABASE_ACCESS_TOKEN</code>).
                </div>
            )}

            {/* Tema */}
            <section className="rounded-lg border border-secondary bg-primary p-4">
                <h2 className="text-sm font-semibold text-primary">🎨 Apariencia</h2>
                <div className="mt-2 flex items-center gap-2">
                    <span className="rounded-full bg-secondary px-3 py-0.5 text-xs">Tema: {theme === "dark" ? "oscuro 🌙" : "claro ☀️"}</span>
                    <Button variant="primary" size="xs" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                        {theme === "dark" ? "☀️ Cambiar a claro" : "🌙 Cambiar a oscuro"}
                    </Button>
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
                onSubmit={(body) => update.mutateAsync(body)}
                isSaving={update.isPending}
                keyPrefix="s-"
                apiKeyName="minimax_api_key"
                onClear={() => clearKey.mutate("minimax_api_key")}
                isClearing={clearKey.isPending && clearKey.variables === "minimax_api_key"}
            />

            {/* OpenRouter */}
            <ProviderCard
                title="🌐 OpenRouter — Fichas de Prueba con IA"
                statusConfigured={keyStatus?.openrouter_configured ?? false}
                statusModel={settings?.openrouter_model}
                keySource={keyStatus?.openrouter_key_source ?? settings?.openrouter_key_source}
                baseUrlDefault="https://openrouter.ai/api/v1"
                modelDefault="nano-banana/nano-banana"
                baseUrlValue={settings?.openrouter_base_url}
                modelValue={settings?.openrouter_model}
                promptEnabled
                promptValue={settings?.prompt_ficha_test}
                onSubmit={(body) => update.mutateAsync(body)}
                isSaving={update.isPending}
                keyPrefix="or-"
                apiKeyName="openrouter_api_key"
                onClear={() => clearKey.mutate("openrouter_api_key")}
                isClearing={clearKey.isPending && clearKey.variables === "openrouter_api_key"}
            />

            {/* Plantillas IA (FASE 8) */}
            <PlantillasCard
                promptEmplatadoValue={settings?.prompt_emplatado}
                plantillaFichaValue={settings?.plantilla_ficha_tecnica}
                imageModelValue={settings?.openrouter_image_model}
                imageModelDefault="nano-banana/nano-banana"
                onSubmit={(body) => update.mutateAsync(body)}
                isSaving={update.isPending}
            />

            {/* Diagnóstico */}
            <section className="rounded-lg border border-secondary bg-primary p-4">
                <h2 className="text-sm font-semibold text-primary">🔍 Diagnóstico de proveedores</h2>
                <p className="mt-1 text-xs text-tertiary">Hace una petición real a cada proveedor. Nunca expone la API key completa.</p>
                <Button variant="primary" size="xs" onClick={() => testProviders.mutate()} disabled={testProviders.isPending} className="mt-2">
                    {testProviders.isPending ? "Probando…" : "Probar conexiones ahora"}
                </Button>
                {testProviders.data && (
                    <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-secondary p-3 font-mono text-xs text-primary">
                        {JSON.stringify(testProviders.data, null, 2)}
                    </pre>
                )}
                {testProviders.error && <p className="mt-2 text-xs text-error-primary">Error: {(testProviders.error as Error).message}</p>}
            </section>

            {/* Versión */}
            <VersionFooter />
        </div>
    );
};

/**
 * Footer con la versión de la app (commit SHA) para que sepas en qué
 * build estás sin tener que mirar el repo. Se inyecta en build-time
 * desde el workflow de GitHub Actions (VITE_GIT_SHA).
 */
const VersionFooter = () => {
    const sha = (import.meta.env.VITE_GIT_SHA as string | undefined) ?? "local";
    const shortSha = sha.slice(0, 7);
    const url = sha === "local" ? "#" : `https://github.com/davidlopezg/restauranteia-live/commit/${sha}`;
    return (
        <footer className="mt-8 border-t border-secondary pt-3 text-center text-[11px] text-tertiary">
            Versión:{" "}
            <a href={url} target="_blank" rel="noopener noreferrer" className="font-mono text-secondary hover:text-brand-primary hover:underline" title={sha}>
                {shortSha}
            </a>
            <span className="ml-2">· admin-web-frontend</span>
        </footer>
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
    onSubmit: (body: SettingsUpdate) => void | Promise<unknown>;
    isSaving: boolean;
    keyPrefix: string;
    /** Clave de la API key en app_settings (para poder borrarla). */
    apiKeyName: string;
    onClear?: () => void;
    isClearing?: boolean;
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
    apiKeyName,
    onClear,
    isClearing,
}: ProviderCardProps) => {
    const [key, setKey] = useState("");
    const [url, setUrl] = useState(baseUrlValue ?? baseUrlDefault);
    const [model, setModel] = useState(modelValue ?? modelDefault);
    const [prompt, setPrompt] = useState(promptValue ?? "");

    return (
        <section className="rounded-lg border border-secondary bg-primary p-4">
            <h2 className="text-sm font-semibold text-primary">{title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                    className={`rounded-full px-3 py-0.5 text-xs font-medium ${statusConfigured ? "bg-success-secondary text-success-primary" : "bg-error-secondary text-error-primary"}`}
                >
                    {statusConfigured ? `✅ Key guardada — modelo: ${statusModel ?? "?"}` : "❌ Sin API key guardada"}
                </span>
                {statusConfigured && keySource && (
                    <span className="text-xs text-tertiary">{keySource === "bd" ? "guardada en la base de datos" : `origen: ${keySource}`}</span>
                )}
                {statusConfigured && onClear && (
                    <button
                        type="button"
                        onClick={onClear}
                        disabled={isClearing}
                        title={`Borra ${apiKeyName} de app_settings`}
                        className="rounded-md border border-secondary px-2 py-0.5 text-xs text-tertiary hover:text-error-primary disabled:opacity-50"
                    >
                        {isClearing ? "Borrando…" : "Borrar key"}
                    </button>
                )}
            </div>
            <form
                onSubmit={(ev) => {
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
                    // Solo se borra el input si el guardado fue bien: si falla, la key
                    // escrita se pierde y el usuario cree que "no se guarda".
                    Promise.resolve(onSubmit(body)).then(
                        () => setKey(""),
                        () => {
                            /* el error se muestra en el banner de arriba */
                        },
                    );
                }}
                className="mt-3 space-y-2"
            >
                <div>
                    <label className="block text-xs text-tertiary">API Key</label>
                    <input
                        type="password"
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        placeholder={statusConfigured ? "(ya guardada — escribe solo si quieres cambiarla)" : "sk-..."}
                        className="w-full rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                    />
                    {statusConfigured && (
                        <p className="mt-1 text-[11px] text-tertiary">
                            Hay una key guardada en la base de datos. No se muestra (es un secreto); para cambiarla escribí una nueva y guardá, o usá “Borrar
                            key”. Para comprobar que la key funciona, usá “Probar conexiones ahora”.
                        </p>
                    )}
                </div>
                <div>
                    <label className="block text-xs text-tertiary">Base URL</label>
                    <input
                        type="text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className="w-full rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs text-tertiary">Modelo</label>
                    <input
                        type="text"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="w-full rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                    />
                </div>
                {promptEnabled && (
                    <div>
                        <label className="block text-xs text-tertiary">Prompt para generar ficha</label>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            rows={4}
                            className="w-full rounded-md border border-secondary bg-primary px-3 py-1.5 font-mono text-xs"
                        />
                    </div>
                )}
                <div className="flex justify-end">
                    <Button type="submit" variant="primary" size="xs" disabled={isSaving}>
                        {isSaving ? "Guardando…" : "Guardar"}
                    </Button>
                </div>
            </form>
        </section>
    );
};

/**
 * FASE 8 — Plantillas para Emplatado IA + Ficha tecnica.
 *
 * - prompt_emplatado: prompt con variables {{titulo}}, {{ingredientes}}, etc.
 *   Si esta vacio, el boton "Generar propuestas de emplatado" devuelve 503.
 * - plantilla_ficha_tecnica: HTML/CSS con variables {{...}}.
 *   Si esta vacio, se usa la plantilla por defecto embebida en backend.
 * - openrouter_image_model: modelo de imagen (default 'nano-banana/nano-banana').
 *   Mismo API key que openrouter_api_key — no requiere configuracion adicional.
 */
interface PlantillasCardProps {
    promptEmplatadoValue?: string;
    plantillaFichaValue?: string;
    imageModelValue?: string;
    imageModelDefault: string;
    onSubmit: (body: SettingsUpdate) => void | Promise<unknown>;
    isSaving: boolean;
}

const PlantillasCard = ({ promptEmplatadoValue, plantillaFichaValue, imageModelValue, imageModelDefault, onSubmit, isSaving }: PlantillasCardProps) => {
    const [promptEmplatado, setPromptEmplatado] = useState(promptEmplatadoValue ?? "");
    const [plantillaFicha, setPlantillaFicha] = useState(plantillaFichaValue ?? "");
    const [imageModel, setImageModel] = useState(imageModelValue ?? imageModelDefault);

    const dirty =
        promptEmplatado !== (promptEmplatadoValue ?? "") ||
        plantillaFicha !== (plantillaFichaValue ?? "") ||
        imageModel !== (imageModelValue ?? imageModelDefault);

    return (
        <section className="rounded-lg border border-secondary bg-primary p-4">
            <h2 className="text-sm font-semibold text-primary">🎨 Plantillas IA — Emplatado + Ficha técnica</h2>
            <p className="mt-1 text-xs text-tertiary">
                Variables disponibles en los prompts: <code className="font-mono">{"{{titulo}}"}</code>, <code className="font-mono">{"{{ingredientes}}"}</code>
                , <code className="font-mono">{"{{mise_en_place}}"}</code>, <code className="font-mono">{"{{servicio}}"}</code>.
            </p>
            <form
                onSubmit={(ev) => {
                    ev.preventDefault();
                    if (!dirty) return;
                    const body: SettingsUpdate = {};
                    if (promptEmplatado !== (promptEmplatadoValue ?? "")) {
                        body.prompt_emplatado = promptEmplatado;
                    }
                    if (plantillaFicha !== (plantillaFichaValue ?? "")) {
                        body.plantilla_ficha_tecnica = plantillaFicha;
                    }
                    if (imageModel !== (imageModelValue ?? imageModelDefault)) {
                        body.openrouter_image_model = imageModel;
                    }
                    if (Object.keys(body).length === 0) return;
                    Promise.resolve(onSubmit(body)).catch(() => {
                        /* el error se muestra en el banner de arriba */
                    });
                }}
                className="mt-3 space-y-2"
            >
                <div>
                    <label className="block text-xs text-tertiary">Modelo de generación de imagen (OpenRouter)</label>
                    <input
                        type="text"
                        value={imageModel}
                        onChange={(e) => setImageModel(e.target.value)}
                        placeholder={imageModelDefault}
                        className="w-full rounded-md border border-secondary bg-primary px-3 py-1.5 font-mono text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs text-tertiary">Prompt para generar propuestas de emplatado</label>
                    <textarea
                        value={promptEmplatado}
                        onChange={(e) => setPromptEmplatado(e.target.value)}
                        rows={5}
                        placeholder={
                            "Ej: Genera una imagen cenital fotorrealista de un plato de alta cocina con estos ingredientes:\n{{ingredientes}}\nEstilo minimalista, fondo oscuro…"
                        }
                        className="w-full rounded-md border border-secondary bg-primary px-3 py-1.5 font-mono text-xs"
                    />
                </div>
                <div>
                    <label className="block text-xs text-tertiary">Plantilla HTML/CSS para ficha técnica (deja vacío para usar la por defecto)</label>
                    <textarea
                        value={plantillaFicha}
                        onChange={(e) => setPlantillaFicha(e.target.value)}
                        rows={6}
                        placeholder="<!DOCTYPE html>… variables: {{titulo}}, {{ingredientes}}, {{mise_en_place}}, {{servicio}}, {{imagen_emplatado_url}}…"
                        className="w-full rounded-md border border-secondary bg-primary px-3 py-1.5 font-mono text-xs"
                    />
                </div>
                <div className="flex justify-end">
                    <Button type="submit" variant="primary" size="xs" disabled={isSaving || !dirty}>
                        {isSaving ? "Guardando…" : "Guardar"}
                    </Button>
                </div>
            </form>
        </section>
    );
};
