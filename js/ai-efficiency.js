(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const TASK_PROFILES = Object.freeze({
        story: Object.freeze({ maxInputTokens: 9000, maxOutputTokens: 1800, timeoutMs: 55000, maxAttempts: 2, temperature: 0.72 }),
        chat: Object.freeze({ maxInputTokens: 8000, maxOutputTokens: 1400, timeoutMs: 45000, maxAttempts: 2, temperature: 0.68 }),
        timeline: Object.freeze({ maxInputTokens: 18000, maxOutputTokens: 5200, timeoutMs: 75000, maxAttempts: 2, temperature: 0.58 }),
        strategic: Object.freeze({ maxInputTokens: 15000, maxOutputTokens: 5200, timeoutMs: 70000, maxAttempts: 2, temperature: 0.25 }),
        start: Object.freeze({ maxInputTokens: 22000, maxOutputTokens: 3600, timeoutMs: 80000, maxAttempts: 2, temperature: 0.66 }),
        narrative: Object.freeze({ maxInputTokens: 16000, maxOutputTokens: 2200, timeoutMs: 60000, maxAttempts: 2, temperature: 0.62 }),
        summary: Object.freeze({ maxInputTokens: 7000, maxOutputTokens: 1000, timeoutMs: 40000, maxAttempts: 1, temperature: 0.2 })
    });
    const RETRYABLE_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

    function getTaskProfile(task, overrides = {}) {
        const base = TASK_PROFILES[task] || TASK_PROFILES.narrative;
        const definedOverrides = Object.fromEntries(
            Object.entries(overrides || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')
        );
        return {
            ...base,
            ...definedOverrides,
            maxInputTokens: Math.max(1000, Number(overrides.maxInputTokens) || base.maxInputTokens),
            maxOutputTokens: Math.max(200, Number(overrides.maxOutputTokens) || base.maxOutputTokens),
            timeoutMs: Math.max(5000, Number(overrides.timeoutMs) || base.timeoutMs),
            maxAttempts: Math.max(1, Math.min(3, Number(overrides.maxAttempts) || base.maxAttempts)),
            temperature: Number.isFinite(Number(overrides.temperature)) ? Number(overrides.temperature) : base.temperature
        };
    }

    function estimateTokens(value) {
        const text = typeof value === 'string' ? value : JSON.stringify(value || '');
        if (!text) return 0;
        return Math.max(1, Math.ceil(text.length / 3.7));
    }

    function compactText(value, maxTokens, marker = '\n[… contesto compattato …]\n') {
        const text = String(value || '').trim();
        const limit = Math.max(80, Number(maxTokens) || 80);
        if (estimateTokens(text) <= limit) return text;
        const maxChars = Math.max(280, Math.floor(limit * 3.7));
        const markerLength = marker.length;
        const available = Math.max(200, maxChars - markerLength);
        const headLength = Math.floor(available * 0.58);
        const tailLength = available - headLength;
        let head = text.slice(0, headLength);
        let tail = text.slice(-tailLength);
        const headBreak = head.lastIndexOf('\n');
        const tailBreak = tail.indexOf('\n');
        if (headBreak > headLength * 0.7) head = head.slice(0, headBreak);
        if (tailBreak > 0 && tailBreak < tailLength * 0.3) tail = tail.slice(tailBreak + 1);
        return `${head.trimEnd()}${marker}${tail.trimStart()}`;
    }

    function normalizeMessages(messages) {
        const output = [];
        (Array.isArray(messages) ? messages : []).forEach(message => {
            const role = ['system', 'user', 'assistant'].includes(message?.role) ? message.role : 'user';
            const content = String(message?.content || '').trim();
            if (!content) return;
            const previous = output[output.length - 1];
            if (previous && previous.role === role && previous.content === content) return;
            output.push({ role, content });
        });
        return output;
    }

    function compactMessages(messages, options = {}) {
        const normalized = normalizeMessages(messages);
        const maxInputTokens = Math.max(1000, Number(options.maxInputTokens) || TASK_PROFILES.narrative.maxInputTokens);
        const originalInputTokens = estimateTokens(normalized);
        if (originalInputTokens <= maxInputTokens) {
            return { messages: normalized, originalInputTokens, estimatedInputTokens: originalInputTokens, trimmed: false };
        }

        const systemMessages = normalized.filter(message => message.role === 'system');
        const conversational = normalized.filter(message => message.role !== 'system');
        const lastUserIndex = conversational.map(message => message.role).lastIndexOf('user');
        const selectedIndex = lastUserIndex >= 0 ? lastUserIndex : conversational.length - 1;
        const lastUser = selectedIndex >= 0 ? conversational[selectedIndex] : null;
        const history = conversational.filter((_, index) => index !== selectedIndex);
        const systemBudget = Math.floor(maxInputTokens * 0.54);
        const userBudget = Math.floor(maxInputTokens * 0.27);
        const kept = [];

        if (systemMessages.length) {
            const mergedSystem = systemMessages.map(message => message.content).join('\n\n');
            kept.push({ role: 'system', content: compactText(mergedSystem, systemBudget) });
        }
        const compactedUser = lastUser
            ? { role: lastUser.role, content: compactText(lastUser.content, userBudget) }
            : null;
        let used = estimateTokens(kept) + estimateTokens(compactedUser);
        const historyBudget = Math.max(0, maxInputTokens - used - 80);
        const recent = [];
        let recentTokens = 0;
        for (let index = history.length - 1; index >= 0; index--) {
            const candidate = history[index];
            const tokens = estimateTokens(candidate);
            if (recentTokens + tokens > historyBudget) continue;
            recent.unshift(candidate);
            recentTokens += tokens;
        }
        kept.push(...recent);
        if (compactedUser) kept.push(compactedUser);
        const estimatedInputTokens = estimateTokens(kept);
        return { messages: kept, originalInputTokens, estimatedInputTokens, trimmed: true };
    }

    function removeSection(text, start, end) {
        const startIndex = text.search(start);
        if (startIndex < 0) return text;
        const rest = text.slice(startIndex + 1);
        const relativeEnd = rest.search(end);
        if (relativeEnd < 0) return text.slice(0, startIndex);
        return text.slice(0, startIndex) + rest.slice(relativeEnd);
    }

    function pruneNarrativePrompt(value, options = {}) {
        let text = String(value || '');
        if (!options.business) {
            text = removeSection(text, /\n🏪 \*\*GESTIONE ATTIVITÀ COMMERCIALI/, /\n👨‍👩‍👧 \*\*FAMIGLIA/);
        }
        if (!options.family) {
            text = removeSection(text, /\n👨‍👩‍👧 \*\*FAMIGLIA/, /\n👷 \*\*DIPENDENTI E PERSONALE/);
        }
        if (!options.employees) {
            text = removeSection(text, /\n👷 \*\*DIPENDENTI E PERSONALE/, /\n⭐ \*\*ESPERIENZA E PROGRESSIONE/);
        }
        if (options.removeExamples !== false) {
            text = text
                .replace(/^\s*-?\s*Esempio(?: aggiornamento)?:.*$/gim, '')
                .replace(/^\s*-?\s*Esempi?:.*$/gim, '');
        }
        return text.replace(/\n{3,}/g, '\n\n').trim();
    }

    function hashText(value) {
        const text = String(value || '');
        let hash = 2166136261;
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function requestKey(task, provider, model, messages) {
        return `${task || 'narrative'}:${provider || 'provider'}:${model || 'model'}:${hashText(JSON.stringify(messages || []))}`;
    }

    function isRetryable(error) {
        if (error?.retryable === false) return false;
        if (error?.name === 'AbortError') return true;
        if (Number.isFinite(Number(error?.status))) return RETRYABLE_STATUSES.has(Number(error.status));
        return error?.retryable === true || /timeout|network|fetch|temporar|sovraccar|overload/i.test(String(error?.message || ''));
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function createRequestManager() {
        const inflight = new Map();
        const cache = new Map();
        const stats = { requests: 0, coalesced: 0, cacheHits: 0, retries: 0, failures: 0, trimmed: 0 };

        async function execute(key, work, options = {}) {
            const now = Date.now();
            const cached = cache.get(key);
            if (cached && cached.expiresAt > now) {
                stats.cacheHits++;
                return cached.value;
            }
            if (inflight.has(key)) {
                stats.coalesced++;
                return inflight.get(key);
            }
            const attempts = Math.max(1, Math.min(3, Number(options.maxAttempts) || 1));
            const promise = (async () => {
                stats.requests++;
                let lastError;
                for (let attempt = 1; attempt <= attempts; attempt++) {
                    try {
                        const result = await work(attempt);
                        const ttl = Math.max(0, Number(options.cacheTtlMs) || 0);
                        if (ttl > 0) cache.set(key, { value: result, expiresAt: Date.now() + ttl });
                        return result;
                    } catch (error) {
                        lastError = error;
                        if (attempt >= attempts || !isRetryable(error)) break;
                        stats.retries++;
                        await delay(Math.min(1200, 220 * attempt));
                    }
                }
                stats.failures++;
                throw lastError;
            })().finally(() => inflight.delete(key));
            inflight.set(key, promise);
            return promise;
        }

        return {
            run: execute,
            markTrimmed() { stats.trimmed++; },
            snapshot() { return { ...stats, inflight: inflight.size, cached: cache.size }; },
            clear() { cache.clear(); }
        };
    }

    function responseContent(data) {
        const message = data?.choices?.[0]?.message || data?.message || {};
        let content = String(message.content || message.text || data?.response || '').trim();
        if (!content && message.reasoning) {
            const reasoning = String(message.reasoning);
            const finalMarker = reasoning.match(/(?:NARRAZIONE|RISPOSTA FINALE|FINAL ANSWER)\s*:\s*([\s\S]+)$/i);
            const closedAnalysis = reasoning.lastIndexOf('[/ANALISI]');
            content = finalMarker?.[1]?.trim() || (closedAnalysis >= 0 ? reasoning.slice(closedAnalysis + '[/ANALISI]'.length).trim() : '');
        }
        return content;
    }

    async function requestOpenAI(options = {}) {
        const fetchImpl = options.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
        if (!fetchImpl) throw new Error('Fetch API non disponibile.');
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutMs = Math.max(5000, Number(options.timeoutMs) || TASK_PROFILES.narrative.timeoutMs);
        const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        try {
            const response = await fetchImpl(options.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
                    ...(options.headers || {})
                },
                body: JSON.stringify({
                    model: options.model,
                    messages: options.messages,
                    temperature: Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : 0.62,
                    max_tokens: Math.max(200, Number(options.maxTokens) || 1500)
                }),
                signal: controller?.signal
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const error = new Error(data?.error?.message || data?.error || data?.message || `Errore API: ${response.status}`);
                error.status = response.status;
                error.retryable = RETRYABLE_STATUSES.has(response.status);
                throw error;
            }
            const content = responseContent(data);
            if (!content) {
                const error = new Error('Il modello non ha restituito una risposta utilizzabile.');
                error.retryable = true;
                throw error;
            }
            return { content, data };
        } catch (error) {
            if (error?.name === 'AbortError') {
                const timeoutError = new Error(`La richiesta LLM ha superato ${Math.round(timeoutMs / 1000)} secondi.`);
                timeoutError.retryable = true;
                throw timeoutError;
            }
            throw error;
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    return {
        TASK_PROFILES,
        RETRYABLE_STATUSES,
        getTaskProfile,
        estimateTokens,
        compactText,
        compactMessages,
        pruneNarrativePrompt,
        hashText,
        requestKey,
        isRetryable,
        createRequestManager,
        responseContent,
        requestOpenAI
    };
});
