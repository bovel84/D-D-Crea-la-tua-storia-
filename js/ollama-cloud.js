(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheOllama = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // Catalogo per l'API REMOTA ufficiale. I tag "-cloud" servono quando si
    // passa dall'installazione locale di Ollama; GitHub Pages usa invece
    // direttamente https://ollama.com/api e non esegue mai modelli sul device.
    const OLLAMA_CLOUD_ENDPOINT = 'https://ollama.com';
    const OLLAMA_MODELS = Object.freeze([
        {
            id: 'gpt-oss:120b', displayName: 'GPT-OSS 120B · Cloud', apiId: 'gpt-oss:120b', localCloudId: 'gpt-oss:120b-cloud', contextSize: 131072,
            temperature: 0.7, topP: 0.9, topK: 40,
            notes: 'Scelta generale per campagne lunghe, scene complesse e coerenza narrativa.'
        },
        {
            id: 'deepseek-v3.1:671b', displayName: 'DeepSeek V3.1 671B · Cloud', apiId: 'deepseek-v3.1:671b', localCloudId: 'deepseek-v3.1:671b-cloud', contextSize: 131072,
            temperature: 0.65, topP: 0.9, topK: 40,
            notes: 'Più analitico; indicato per investigazioni, enigmi e conseguenze strategiche.'
        },
        {
            id: 'qwen3-coder:480b', displayName: 'Qwen3 Coder 480B · Cloud', apiId: 'qwen3-coder:480b', localCloudId: 'qwen3-coder:480b-cloud', contextSize: 131072,
            temperature: 0.65, topP: 0.9, topK: 40,
            notes: 'Molto affidabile nel seguire istruzioni e tag; utile per le meccaniche del Master.'
        },
        {
            id: 'gpt-oss:20b', displayName: 'GPT-OSS 20B · Cloud', apiId: 'gpt-oss:20b', localCloudId: 'gpt-oss:20b-cloud', contextSize: 131072,
            temperature: 0.75, topP: 0.9, topK: 40,
            notes: 'Alternativa più rapida per scene brevi, dialoghi e fallback.'
        }
    ]);

    const DEFAULT_FALLBACK_ORDER = Object.freeze(['deepseek-v3.1:671b', 'qwen3-coder:480b', 'gpt-oss:20b']);
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

    function resolveEndpoint(config) {
        const configured = String(config?.endpoint || OLLAMA_CLOUD_ENDPOINT).trim().replace(/\/$/, '');
        if (configured !== OLLAMA_CLOUD_ENDPOINT) {
            throw new Error('Cronache del Destino usa esclusivamente Ollama Cloud: imposta un’API key per https://ollama.com. Endpoint locali e porte personalizzate non sono supportati.');
        }
        return { style: 'native', url: `${OLLAMA_CLOUD_ENDPOINT}/api/chat` };
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
            if (!String(settings.apiKey || '').trim()) {
                throw new Error('Configura una API key Ollama Cloud nelle Impostazioni prima di avviare il Master.');
            }
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
        OLLAMA_CLOUD_ENDPOINT,
        resolveEndpoint
    };
});
