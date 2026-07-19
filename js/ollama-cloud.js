(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheOllama = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // Catalogo per l'API remota ufficiale. Il browser usa la funzione
    // serverless interna, così nell'interfaccia bastano chiave e modello.
    const OLLAMA_CLOUD_ENDPOINT = 'https://ollama.com';
    const OLLAMA_CLOUD_API = `${OLLAMA_CLOUD_ENDPOINT}/api`;
    const OLLAMA_NATIVE_PROXY = '/api/ollama';
    const OLLAMA_MODELS = Object.freeze([
        {
            id: 'gpt-oss:120b', displayName: 'GPT-OSS 120B · Cloud', apiId: 'gpt-oss:120b', localCloudId: 'gpt-oss:120b-cloud', contextSize: 131072,
            temperature: 0.7, topP: 0.9, topK: 40,
            notes: 'Scelta generale per campagne lunghe, scene complesse e coerenza narrativa.'
        },
        {
            id: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash · Cloud', apiId: 'deepseek-v4-flash', localCloudId: 'deepseek-v4-flash-cloud', contextSize: 131072,
            temperature: 0.65, topP: 0.9, topK: 40,
            notes: 'Modello analitico aggiornato; indicato per investigazioni, enigmi e conseguenze strategiche.'
        },
        {
            id: 'qwen3.5:397b', displayName: 'Qwen 3.5 397B · Cloud', apiId: 'qwen3.5:397b', localCloudId: 'qwen3.5:397b-cloud', contextSize: 131072,
            temperature: 0.65, topP: 0.9, topK: 40,
            notes: 'Molto affidabile nel seguire istruzioni e mantenere campagne narrative complesse.'
        },
        {
            id: 'gpt-oss:20b', displayName: 'GPT-OSS 20B · Cloud', apiId: 'gpt-oss:20b', localCloudId: 'gpt-oss:20b-cloud', contextSize: 131072,
            temperature: 0.75, topP: 0.9, topK: 40,
            notes: 'Alternativa più rapida per scene brevi, dialoghi e fallback.'
        }
    ]);

    const DEFAULT_FALLBACK_ORDER = Object.freeze(['qwen3.5:397b', 'deepseek-v4-flash', 'gpt-oss:20b']);
    const RETRYABLE_STATUSES = new Set([400, 404, 408, 409, 425, 429, 500, 502, 503, 504]);

    function isValidModelId(value) {
        return /^[a-zA-Z0-9._:@/-]+$/.test(String(value || '').trim());
    }

    function customModel(modelId) {
        const id = String(modelId || '').trim();
        if (!isValidModelId(id)) return null;
        return {
            id, apiId: id, displayName: `${id} · ID personalizzato`, localCloudId: `${id}-cloud`,
            contextSize: 32768, temperature: 0.7, topP: 0.9, topK: 40,
            notes: 'ID inserito manualmente: verifica che sia abilitato per la tua API key.'
        };
    }

    function mergeCatalog(discoveredModels) {
        const catalog = OLLAMA_MODELS.map(model => ({ ...model }));
        const known = new Set(catalog.map(model => model.id));
        (Array.isArray(discoveredModels) ? discoveredModels : []).forEach(model => {
            const apiId = String(model?.apiId || model?.id || '').trim().replace(/-cloud$/, '');
            if (!isValidModelId(apiId) || known.has(apiId)) return;
            known.add(apiId);
            catalog.push({
                id: apiId,
                apiId,
                displayName: model.displayName || `${apiId} · Cloud`,
                localCloudId: model.localCloudId || `${apiId}-cloud`,
                contextSize: Number(model.contextSize) || 32768,
                temperature: Number.isFinite(Number(model.temperature)) ? Number(model.temperature) : 0.7,
                topP: Number.isFinite(Number(model.topP)) ? Number(model.topP) : 0.9,
                topK: Number.isFinite(Number(model.topK)) ? Number(model.topK) : 40,
                notes: model.notes || 'Disponibile per questa API key Ollama Cloud.'
            });
        });
        return catalog;
    }

    function getModel(modelId, catalog) {
        return mergeCatalog(catalog).find(model => model.id === modelId || model.apiId === modelId) || null;
    }

    function uniqueModels(values, catalog) {
        const result = [];
        const seen = new Set();
        (Array.isArray(values) ? values : []).forEach(value => {
            const model = getModel(String(value || '').trim(), catalog);
            const resolved = model || customModel(value);
            if (!resolved || seen.has(resolved.id)) return;
            seen.add(resolved.id);
            result.push(resolved);
        });
        return result;
    }

    function resolveEndpoint(config) {
        // L'APK e gli hosting statici non possono eseguire la rotta serverless relativa
        // /api/ollama: in quel caso il POST finisce sul server statico e restituisce 405.
        // Ollama Cloud espone direttamente la stessa API nativa su ollama.com/api.
        // Un proxy same-origin resta utilizzabile solo se configurato esplicitamente.
        const configuredProxy = String(config?.nativeProxy || '').trim();
        const base = (configuredProxy || OLLAMA_CLOUD_API).replace(/\/$/, '');
        return { style: 'native', url: `${base}/chat`, tagsUrl: `${base}/tags` };
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

    async function fetchCloudModels(apiKey, fetchImpl) {
        const key = String(apiKey || '').trim();
        const request = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
        if (!key) throw new Error('Inserisci prima una API key Ollama Cloud.');
        if (!request) throw new Error('Fetch API non disponibile per aggiornare il catalogo Ollama Cloud.');

        const endpoint = resolveEndpoint();
        const response = await request(endpoint.tagsUrl, {
            headers: { Authorization: `Bearer ${key}` }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(errorMessage(data, response));

        return (Array.isArray(data.models) ? data.models : []).map(raw => {
            const apiId = String(raw?.name || raw?.model || '').trim().replace(/-cloud$/, '');
            if (!isValidModelId(apiId)) return null;
            const details = raw.details || {};
            const size = details.parameter_size ? ` · ${details.parameter_size}` : '';
            return {
                id: apiId,
                apiId,
                displayName: `${apiId}${size} · Cloud`,
                localCloudId: `${apiId}-cloud`,
                contextSize: Number(details.context_length || raw.context_length) || 32768,
                temperature: 0.7,
                topP: 0.9,
                topK: 40,
                notes: details.family ? `Modello Cloud rilevato: famiglia ${details.family}.` : 'Disponibile per questa API key Ollama Cloud.'
            };
        }).filter(Boolean);
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
            const catalog = mergeCatalog(settings.discoveredModels);
            const preferred = uniqueModels(settings.preferredModels?.length ? settings.preferredModels : DEFAULT_FALLBACK_ORDER, catalog);
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
        mergeCatalog,
        fetchCloudModels,
        OLLAMA_CLOUD_ENDPOINT,
        OLLAMA_NATIVE_PROXY,
        resolveEndpoint,
        isValidModelId
    };
});
