(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheOllama = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const OLLAMA_MODELS = Object.freeze([
        {
            id: 'llama3', displayName: 'Llama 3', apiId: 'llama3', contextSize: 8192,
            temperature: 0.75, topP: 0.9, topK: 40,
            notes: 'Narratore rapido e bilanciato; adatto a scene lineari e dialoghi.'
        },
        {
            id: 'llama3.1', displayName: 'Llama 3.1', apiId: 'llama3.1', contextSize: 128000,
            temperature: 0.7, topP: 0.9, topK: 40,
            notes: 'Scelta generale consigliata per campagne lunghe e continuità narrativa.'
        },
        {
            id: 'mistral', displayName: 'Mistral', apiId: 'mistral', contextSize: 32768,
            temperature: 0.75, topP: 0.9, topK: 40,
            notes: 'Veloce e diretto; efficace per ritmo, azione e risposte concise.'
        },
        {
            id: 'mixtral', displayName: 'Mixtral', apiId: 'mixtral', contextSize: 32768,
            temperature: 0.7, topP: 0.9, topK: 50,
            notes: 'Buono per intrecci, cast ampi e scene con più punti di vista.'
        },
        {
            id: 'qwen2', displayName: 'Qwen 2', apiId: 'qwen2', contextSize: 32768,
            temperature: 0.7, topP: 0.9, topK: 40,
            notes: 'Versatile e multilingue; utile per ambientazioni culturali varie.'
        },
        {
            id: 'qwen2.5', displayName: 'Qwen 2.5', apiId: 'qwen2.5', contextSize: 128000,
            temperature: 0.65, topP: 0.9, topK: 40,
            notes: 'Ottimo controllo delle istruzioni, coerenza e gestione dei tag di gioco.'
        },
        {
            id: 'gemma2', displayName: 'Gemma 2', apiId: 'gemma2', contextSize: 8192,
            temperature: 0.8, topP: 0.95, topK: 50,
            notes: 'Prosa vivida e leggera; indicato per dialoghi e scene emotive brevi.'
        },
        {
            id: 'phi3', displayName: 'Phi-3', apiId: 'phi3', contextSize: 128000,
            temperature: 0.65, topP: 0.9, topK: 30,
            notes: 'Compatto e rapido; adatto a sessioni con risorse limitate.'
        },
        {
            id: 'command-r', displayName: 'Command R', apiId: 'command-r', contextSize: 128000,
            temperature: 0.65, topP: 0.9, topK: 40,
            notes: 'Forte sul retrieval: consigliato quando la memoria della campagna è ampia.'
        },
        {
            id: 'deepseek-coder-v2', displayName: 'DeepSeek Coder V2', apiId: 'deepseek-coder-v2', contextSize: 128000,
            temperature: 0.55, topP: 0.9, topK: 30,
            notes: 'Più analitico; utile per enigmi, sistemi, investigazione e logica complessa.'
        }
    ]);

    const DEFAULT_FALLBACK_ORDER = Object.freeze(['llama3.1', 'qwen2.5', 'mistral']);
    const RETRYABLE_STATUSES = new Set([400, 404, 408, 409, 425, 429, 500, 502, 503, 504]);

    function getModel(modelId) {
        return OLLAMA_MODELS.find(model => model.id === modelId || model.apiId === modelId) || null;
    }

    function uniqueModels(values) {
        const result = [];
        const seen = new Set();
        (Array.isArray(values) ? values : []).forEach(value => {
            const model = getModel(String(value || '').trim());
            if (!model || seen.has(model.id)) return;
            seen.add(model.id);
            result.push(model);
        });
        return result;
    }

    function endpointWithPort(endpoint, port) {
        const raw = String(endpoint || 'https://ollama.com').trim().replace(/\/$/, '');
        try {
            const url = new URL(raw);
            if (port !== '' && port != null && Number.isFinite(Number(port))) url.port = String(Number(port));
            return url.toString().replace(/\/$/, '');
        } catch (error) {
            throw new Error(`Endpoint Ollama non valido: ${raw}`);
        }
    }

    function resolveEndpoint(config) {
        const base = endpointWithPort(config?.endpoint, config?.port);
        let style = config?.apiStyle || 'auto';
        if (style === 'auto') style = /\/v1\/?$/i.test(base) ? 'openai' : 'native';

        if (style === 'openai') {
            const root = /\/v1\/?$/i.test(base) ? base : `${base}/v1`;
            return { style, url: `${root.replace(/\/$/, '')}/chat/completions` };
        }

        const root = /\/api\/?$/i.test(base) ? base : `${base}/api`;
        return { style: 'native', url: `${root.replace(/\/$/, '')}/chat` };
    }

    function buildHeaders(apiKey) {
        const headers = { 'Content-Type': 'application/json; charset=utf-8' };
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
        return headers;
    }

    function parseContent(data, style) {
        if (style === 'openai') {
            const message = data?.choices?.[0]?.message;
            return message?.content || message?.text || '';
        }
        return data?.message?.content || data?.response || '';
    }

    function errorMessage(data, response) {
        return data?.error?.message || data?.error || data?.message || `Errore Ollama HTTP ${response.status}`;
    }

    class OllamaRequestError extends Error {
        constructor(message, details) {
            super(message);
            this.name = 'OllamaRequestError';
            Object.assign(this, details || {});
        }
    }

    class OllamaCloudClient {
        constructor(options) {
            const opts = options || {};
            this.fetch = opts.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
            this.timeoutMs = Number(opts.timeoutMs || 45000);
            if (!this.fetch) throw new Error('Fetch API non disponibile per il client Ollama.');
        }

        async request(model, messages, config, maxTokens) {
            const endpoint = resolveEndpoint(config);
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timeoutId = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;
            const common = {
                model: model.apiId,
                messages,
                stream: false
            };
            const body = endpoint.style === 'openai'
                ? {
                    ...common,
                    temperature: model.temperature,
                    top_p: model.topP,
                    max_tokens: maxTokens || 1500
                }
                : {
                    ...common,
                    options: {
                        temperature: model.temperature,
                        top_p: model.topP,
                        top_k: model.topK,
                        num_ctx: model.contextSize,
                        num_predict: maxTokens || 1500
                    }
                };

            try {
                const response = await this.fetch(endpoint.url, {
                    method: 'POST',
                    headers: buildHeaders(config?.apiKey),
                    body: JSON.stringify(body),
                    signal: controller?.signal
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new OllamaRequestError(errorMessage(data, response), {
                        status: response.status,
                        retryable: RETRYABLE_STATUSES.has(response.status),
                        model: model.id
                    });
                }

                const content = String(parseContent(data, endpoint.style) || '').trim();
                if (!content) {
                    throw new OllamaRequestError('Il modello ha restituito una risposta vuota.', {
                        retryable: true,
                        model: model.id
                    });
                }
                return { content, model: model.id, apiId: model.apiId, endpoint: endpoint.url, data };
            } catch (error) {
                if (error?.name === 'AbortError') {
                    throw new OllamaRequestError(`Timeout del modello ${model.displayName}.`, {
                        retryable: true,
                        model: model.id,
                        cause: error
                    });
                }
                if (error instanceof OllamaRequestError) throw error;
                throw new OllamaRequestError(error?.message || 'Ollama non raggiungibile.', {
                    retryable: true,
                    model: model.id,
                    cause: error
                });
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
            }
        }

        async generate(messages, config) {
            const settings = config || {};
            const preferred = uniqueModels(settings.preferredModels?.length ? settings.preferredModels : DEFAULT_FALLBACK_ORDER);
            if (!preferred.length) throw new Error('Configura almeno un modello Ollama valido.');

            const failures = [];
            for (const model of preferred) {
                try {
                    const result = await this.request(model, messages, settings, settings.maxTokens);
                    return { ...result, attemptedModels: [...failures.map(item => item.model), model.id] };
                } catch (error) {
                    failures.push({ model: model.id, message: error.message, status: error.status || null });
                    if (error.retryable === false || error.status === 401 || error.status === 403) {
                        throw new OllamaRequestError(error.message, { ...error, failures });
                    }
                }
            }

            const detail = failures.map(item => `${item.model}: ${item.message}`).join(' | ');
            throw new OllamaRequestError(`Tutti i modelli Ollama configurati hanno fallito. ${detail}`, {
                retryable: false,
                failures
            });
        }
    }

    return {
        OLLAMA_MODELS,
        DEFAULT_FALLBACK_ORDER,
        OllamaCloudClient,
        OllamaRequestError,
        getModel,
        uniqueModels,
        endpointWithPort,
        resolveEndpoint
    };
});
