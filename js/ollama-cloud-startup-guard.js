(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheOllamaCloudStartupGuard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 2;
    const APP_PROXY = 'https://storia-app.vercel.app/api/ollama';
    const OFFICIAL_API = 'https://ollama.com/api';
    const STARTUP_RE = /(?:FASE\s*[1-6]\s*\/\s*6|CANONE,?\s*EPOCA|GEOGRAFIA\s+E\s+LUOGHI|ISTITUZIONI,?\s*ECONOMIA|NPC\s+E\s+RETI|RELAZIONI\s+E\s+FORZE|AUDIT\s+STRUTTURALE|Definisco canone ed epoca|Ricostruisco luoghi e città)/i;
    let installed = false;

    const clean = value => String(value == null ? '' : value).trim();

    function normalizeModelId(value) {
        const raw = clean(value?.apiId || value?.id || value);
        const normalizer = root.CronacheOllama?.normalizeCloudApiId || root.CronacheOllamaCloudCatalogV2?.normalizeCloudApiId;
        return typeof normalizer === 'function' ? normalizer(raw) : raw.replace(/:cloud$/i, '').replace(/-cloud$/i, '');
    }

    function promptText(messages) {
        return (Array.isArray(messages) ? messages : []).map(message => clean(message?.content)).join('\n').slice(0, 30000);
    }

    function isWorldBootstrap(messages) {
        return STARTUP_RE.test(promptText(messages));
    }

    function phaseNumber(messages) {
        const match = promptText(messages).match(/FASE\s*([1-6])\s*\/\s*6/i);
        return match ? Number(match[1]) : 0;
    }

    function phaseBudget(messages, requested) {
        const phase = phaseNumber(messages);
        // Le fasi centrali producono strutture JSON molto più grandi della fase 1.
        // Tagliare la Fase 4 a 3200 token troncava spesso l'array NPC: il parser
        // falliva e il world-builder ricadeva sul generatore legacy, ripartendo da capo.
        const caps = { 1: 1800, 2: 4200, 3: 3400, 4: 5600, 5: 3800, 6: 2200 };
        const wanted = Math.max(700, Number(requested) || 1800);
        return Math.min(wanted, caps[phase] || 3200);
    }

    function endpointBases(config = {}) {
        const configured = clean(config.nativeProxy).replace(/\/$/, '');
        return [...new Set([configured, APP_PROXY, OFFICIAL_API].filter(Boolean))];
    }

    function preparedMessages(messages, format) {
        const list = (Array.isArray(messages) ? messages : []).map(message => ({ ...message }));
        if (!format) return list;
        const instruction = typeof format === 'object'
            ? `IMPORTANTE: restituisci esclusivamente JSON valido conforme allo schema richiesto. Nessun markdown.`
            : 'IMPORTANTE: restituisci esclusivamente JSON valido, senza markdown o testo esterno.';
        const index = list.findIndex(message => message?.role === 'system');
        if (index >= 0) list[index] = { ...list[index], content: `${clean(list[index].content)}\n\n${instruction}` };
        else list.unshift({ role: 'system', content: instruction });
        return list;
    }

    function responseContent(data) {
        const value = data?.message?.content ?? data?.response ?? data?.output_text ?? data?.choices?.[0]?.message?.content ?? '';
        if (typeof value === 'string') return value.trim();
        if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? item : item?.text || item?.content || '').filter(Boolean).join('\n').trim();
        return '';
    }

    function responseError(data, status) {
        return clean(data?.error?.message || data?.error || data?.message || `Errore Ollama HTTP ${status}`);
    }

    function makeError(ollama, message, details = {}) {
        const Type = ollama?.OllamaRequestError || Error;
        const error = new Type(message, details);
        Object.assign(error, details);
        return error;
    }

    async function startupRequest(ollama, client, model, messages, config = {}, maxTokens) {
        const apiId = normalizeModelId(model);
        if (!apiId) throw new Error('ID modello Ollama Cloud non valido.');
        if (!clean(config.apiKey)) throw new Error('API key Ollama Cloud non configurata.');
        const fetchImpl = client?.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
        if (!fetchImpl) throw new Error('Fetch API non disponibile.');

        const failures = [];
        const phase = phaseNumber(messages);
        const budget = phaseBudget(messages, Number(maxTokens || config.maxTokens));
        const baseTimeout = Number(config.startupTimeoutMs || config.timeoutMs || client?.timeoutMs || 45000);
        const phaseTimeout = phase >= 4 && phase <= 5 ? Math.max(baseTimeout, 55000) : baseTimeout;
        const timeoutMs = Math.min(65000, Math.max(15000, phaseTimeout));
        const temperature = Number.isFinite(Number(config.temperature)) ? Number(config.temperature) : Number(model?.temperature ?? 0.55);
        const topP = Number.isFinite(Number(config.topP)) ? Number(config.topP) : Number(model?.topP ?? 0.9);
        const topK = Number.isFinite(Number(config.topK)) ? Number(config.topK) : Number(model?.topK ?? 40);
        const body = {
            model: apiId,
            messages: preparedMessages(messages, config.format),
            stream: false,
            // Il bootstrap deve essere deterministico e rapido. Il reasoning pesante
            // resta disponibile durante il gioco, ma non può bloccare la generazione iniziale.
            think: false,
            options: {
                temperature,
                top_p: topP,
                top_k: Math.max(1, Math.trunc(topK)),
                num_predict: budget
            }
        };

        for (const base of endpointBases(config)) {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
            try {
                const response = await fetchImpl(`${base}/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        Authorization: `Bearer ${clean(config.apiKey)}`
                    },
                    body: JSON.stringify(body),
                    signal: controller?.signal
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const message = responseError(data, response.status);
                    failures.push({ endpoint: base, status: response.status, message });
                    if ([401, 403, 429].includes(response.status)) {
                        throw makeError(ollama, message, { status: response.status, retryable: false, model: apiId, failures });
                    }
                    continue;
                }
                const content = responseContent(data);
                if (!content) {
                    failures.push({ endpoint: base, status: 200, message: 'Risposta vuota durante la generazione del mondo.' });
                    continue;
                }
                return {
                    content,
                    model: apiId,
                    apiId,
                    endpoint: `${base}/chat`,
                    data,
                    attemptedModels: [apiId],
                    power: {
                        enabled: false,
                        startupGuard: true,
                        phase,
                        think: false,
                        outputBudget: budget,
                        context: 'cloud-default'
                    }
                };
            } catch (error) {
                if (error?.retryable === false || [401, 403, 429].includes(Number(error?.status))) throw error;
                failures.push({ endpoint: base, status: error?.status || null, message: error?.name === 'AbortError' ? 'Timeout' : clean(error?.message || error) });
                // Un errore di rete o timeout passa subito all'endpoint successivo:
                // niente catene max/high/true/false che fanno sembrare la UI congelata.
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
            }
        }

        const last = failures.at(-1);
        throw makeError(ollama, last?.message || `Il modello ${apiId} non ha completato la generazione iniziale.`, {
            status: last?.status || null,
            retryable: true,
            model: apiId,
            failures
        });
    }

    function patchClient(ollama) {
        const proto = ollama?.OllamaCloudClient?.prototype;
        if (!proto || proto.request?.__ollamaStartupGuard) return Boolean(proto);
        const previous = proto.request;
        const guarded = function guardedOllamaRequest(model, messages, config, maxTokens) {
            if (isWorldBootstrap(messages)) {
                return startupRequest(ollama, this, model, messages, config || {}, maxTokens);
            }
            return previous.call(this, model, messages, config, maxTokens);
        };
        guarded.__ollamaStartupGuard = true;
        guarded.__ollamaStartupGuardPrevious = previous;
        proto.request = guarded;
        return true;
    }

    function install() {
        const ollama = root.CronacheOllama;
        if (!ollama) return false;
        const result = patchClient(ollama);
        installed = installed || result;
        root.__cronacheOllamaCloudStartupGuardVersion = PATCH_VERSION;
        return result;
    }

    if (typeof document !== 'undefined') {
        const boot = () => {
            if (install()) return;
            [100, 350, 900, 1800].forEach(delay => setTimeout(install, delay));
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
        else boot();
    }

    return {
        PATCH_VERSION,
        APP_PROXY,
        OFFICIAL_API,
        isWorldBootstrap,
        phaseNumber,
        phaseBudget,
        endpointBases,
        startupRequest,
        patchClient,
        install
    };
});