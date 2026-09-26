// MiniMax API client — OpenAI-compatible mode
// Ported from agents/creativo/agent.py call_minimax
// Reads API key from app_settings in Supabase

import { createClient } from "jsr:@supabase/supabase-js@2";

const DEFAULT_BASE_URL = "https://api.minimax.io/v1";
const DEFAULT_MODEL = "MiniMax-M3";
const REQUEST_TIMEOUT = 60_000;
const MAX_RETRIES = 3;
const LANGUAGE_RETRIES = 2;
const RETRY_BACKOFF_BASE = 2000;
const RATE_LIMIT_BACKOFF_BASE = 5000;

const ENGLISH_TRIGGER_WORDS = new Set([
    "the", "and", "with", "for", "you", "this", "that", "are",
    "your", "from", "have", "would", "will", "each", "into",
    "just", "also", "well", "after", "our", "when", "which",
    "their", "what", "been", "has", "its", "over", "than",
    "then", "these", "some", "them", "very", "much", "such",
]);

export interface IAConfig {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
}

let _config: IAConfig = {};

export function setConfig(cfg: IAConfig) {
    _config = cfg;
}

export function getConfig(): IAConfig {
    return { ..._config };
}

async function loadApiKeyFromDb(supabaseUrl: string, supabaseKey: string): Promise<string> {
    try {
        const supabaseAdmin = createClient(supabaseUrl, supabaseKey, { db: { schema: "notion_migration" } });
        const { data, error } = await supabaseAdmin
            .from("app_settings")
            .select("value")
            .eq("key", "minimax_api_key")
            .limit(1)
            .single();
        if (error || !data) return "";
        return data.value || "";
    } catch {
        return "";
    }
}

export async function ensureApiKey(supabaseUrl: string, supabaseKey: string): Promise<string> {
    if (_config.apiKey) return _config.apiKey;
    const dbKey = await loadApiKeyFromDb(supabaseUrl, supabaseKey);
    if (dbKey) {
        _config.apiKey = dbKey;
        return dbKey;
    }
    throw new Error(
        "Falta API key de MiniMax. Configúrala en la UI (app_settings) o define MINIMAX_API_KEY."
    );
}

function isMostlySpanish(text: string): boolean {
    const promptMarkers = [
        "🎨 PROMPT PARA IMAGEN DEL PLATO",
        "PROMPT PARA IMAGEN DEL PLATO",
        "🎨 PROMPT PARA IMAGEN",
        "PROMPT PARA IMAGEN",
    ];
    let cuerpo = text;
    for (const marker of promptMarkers) {
        const idx = cuerpo.indexOf(marker);
        if (idx !== -1) {
            cuerpo = cuerpo.slice(0, idx);
            break;
        }
    }
    const words = cuerpo.toLowerCase().match(/\b[a-záéíóúñü]{2,}\b/g) || [];
    if (words.length < 10) return true;
    const inglesas = words.filter((w) => ENGLISH_TRIGGER_WORDS.has(w)).length;
    return inglesas / words.length < 0.08;
}

export interface MinimaxCallOptions {
    systemPrompt: string;
    userPrompt: string;
    forceSpanish?: boolean;
    temperature?: number;
    maxTokens?: number;
}

export async function callMinimax(
    options: MinimaxCallOptions,
    supabaseUrl: string,
    supabaseKey: string,
): Promise<string> {
    const { systemPrompt, userPrompt, forceSpanish = true, temperature = 0.8, maxTokens = 3500 } = options;
    await ensureApiKey(supabaseUrl, supabaseKey);

    const baseUrl = _config.baseUrl || DEFAULT_BASE_URL;
    const model = _config.model || DEFAULT_MODEL;
    const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

    let currentUserPrompt = userPrompt;
    let currentTemp = temperature;
    const totalAttempts = MAX_RETRIES + LANGUAGE_RETRIES;
    let languageFailures = 0;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
        const payload = {
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: currentUserPrompt },
            ],
            temperature: currentTemp,
            max_tokens: maxTokens,
        };

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${_config.apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (!response.ok) {
                const text = await response.text();
                const isRateLimit = response.status === 429;
                if (attempt < totalAttempts) {
                    const base = isRateLimit ? RATE_LIMIT_BACKOFF_BASE : RETRY_BACKOFF_BASE;
                    const delay = Math.min(30_000, base * Math.pow(2, attempt - 1));
                    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
                    const wait = Math.max(500, delay + jitter);
                    await new Promise((r) => setTimeout(r, wait));
                    lastError = new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
                    continue;
                }
                throw new Error(`MiniMax API error [${response.status}]: ${text.slice(0, 300)}`);
            }

            const data = await response.json();
            const content = data?.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error(`Respuesta inesperada de MiniMax: ${JSON.stringify(data).slice(0, 300)}`);
            }

            // Language validation
            if (forceSpanish && !isMostlySpanish(content)) {
                languageFailures++;
                if (languageFailures <= LANGUAGE_RETRIES) {
                    console.warn(`[idioma] respuesta en inglés detectada (intento ${languageFailures}/${LANGUAGE_RETRIES}), reintentando...`);
                    currentUserPrompt = currentUserPrompt + (
                        "\n\n---\n\n" +
                        "⚠️⚠️⚠️ AVISO URGENTE PARA EL MODELO ⚠️⚠️⚠️\n" +
                        "Tu respuesta anterior estaba en inglés. ESTO ES UN ERROR GRAVE.\n" +
                        "Debes responder ÍNTEGRAMENTE en CASTELLANO (español). " +
                        "La única sección que admite inglés es el PROMPT PARA IMAGEN DEL PLATO al final.\n" +
                        "Reescribe TODO el cuerpo de la ficha en español. No mezcles idiomas. Solo castellano."
                    );
                    currentTemp = 0.2;
                    continue;
                } else {
                    console.warn(`[idioma] ⚠️ agotados ${LANGUAGE_RETRIES} reintentos, devolviendo respuesta mixta`);
                }
            }

            return content;
        } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
            if (e instanceof DOMException && e.name === "AbortError") {
                lastError = new Error(`Timeout tras ${REQUEST_TIMEOUT}ms`);
            }
            if (attempt < totalAttempts) {
                const base = RETRY_BACKOFF_BASE;
                const delay = Math.min(30_000, base * Math.pow(2, attempt - 1));
                const jitter = delay * 0.2 * (Math.random() * 2 - 1);
                const wait = Math.max(500, delay + jitter);
                console.warn(`[retry ${attempt}/${totalAttempts}] error: ${lastError.message}. Esperando ${wait}ms...`);
                await new Promise((r) => setTimeout(r, wait));
                continue;
            }
        }
    }

    throw new Error(`Falló la llamada a MiniMax tras ${totalAttempts} intentos: ${lastError?.message}`);
}

export async function callOpenRouter(
    systemPrompt: string,
    userPrompt: string,
    supabaseUrl: string,
    supabaseKey: string,
    temperature = 0.7,
): Promise<string> {
    // Read OpenRouter config from app_settings
    const admin = createClient(supabaseUrl, supabaseKey, { db: { schema: "notion_migration" } });
    const { data: settings } = await admin
        .from("app_settings")
        .select("key, value")
        .in("key", ["openrouter_api_key", "openrouter_model", "openrouter_base_url"]);

    const map: Record<string, string> = {};
    for (const r of (settings ?? []) as { key: string; value: string }[]) {
        map[r.key] = r.value;
    }

    const apiKey = map["openrouter_api_key"];
    if (!apiKey) throw new Error("OpenRouter API key no configurada");
    const model = map["openrouter_model"] || "nano-banana/nano-banana";
    const baseUrl = (map["openrouter_base_url"] || "https://openrouter.ai/api/v1").replace(/\/+$/, "");

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            temperature,
        }),
        signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenRouter error [${response.status}]: ${text.slice(0, 300)}`);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || "";
}

// Parse ideas from LLM response
export function parseIdeasFromResponse(respuesta: string): Array<{
    n: number;
    nombre: string;
    tipo: string;
    por_que: string;
    semilla: string;
}> {
    const lines = respuesta.split("\n");
    const ideas: Array<{
        n: number;
        nombre: string;
        tipo: string;
        por_que: string;
        semilla: string;
    }> = [];
    let currentBlock: string[] = [];
    let inBlock = false;

    for (const line of lines) {
        if (/^\*\*\d+\./.test(line.trim())) {
            if (inBlock && currentBlock.length > 0) {
                const idea = parseIdeaBlock(currentBlock);
                if (idea) ideas.push(idea);
            }
            currentBlock = [line];
            inBlock = true;
        } else if (inBlock) {
            if (line.trim().startsWith("---") || (line.trim() === "" && currentBlock.length > 1)) {
                const idea = parseIdeaBlock(currentBlock);
                if (idea) ideas.push(idea);
                currentBlock = [];
                inBlock = false;
            } else {
                currentBlock.push(line);
            }
        }
    }
    if (inBlock && currentBlock.length > 0) {
        const idea = parseIdeaBlock(currentBlock);
        if (idea) ideas.push(idea);
    }
    return ideas;
}

function parseIdeaBlock(lines: string[]): {
    n: number;
    nombre: string;
    tipo: string;
    por_que: string;
    semilla: string;
} | null {
    if (!lines.length) return null;
    const first = lines[0].trim();
    const m = first.match(/^\*\*(\d+)\.\s+(.+?)\*\*/);
    if (!m) return null;
    const n = parseInt(m[1]);
    const nombre = m[2].trim();
    const campos = { n, nombre, tipo: "", por_que: "", semilla: "" };

    for (const line of lines.slice(1)) {
        const l = line.trim();
        if (l.startsWith("*Tipo:*")) campos.tipo = l.replace("*Tipo:*", "").trim();
        else if (l.startsWith("*Por qu")) campos.por_que = l.split(":")[1]?.trim() || "";
        else if (l.startsWith("*Semilla:*")) campos.semilla = l.replace("*Semilla:*", "").trim();
    }
    return campos;
}