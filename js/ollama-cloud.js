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
    const OLLAMA_NATIVE_PROXY = 'https://storia-app.vercel.app/api/ollama';
    const DEFAULT_CLOUD_CONTEXT_SIZE = 65536;
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
            contextSize: DEFAULT_CLOUD_CONTEXT_SIZE, temperature: 0.7, topP: 0.9, topK: 40,
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
                contextSize: Number(model.contextSize) || DEFAULT_CLOUD_CONTEXT_SIZE,
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
        const base = (configuredProxy || OLLAMA_NATIVE_PROXY || OLLAMA_CLOUD_API).replace(/\/$/, '');
        return { style: 'native', url: `${base}/chat`, tagsUrl: `${base}/tags` };
    }

    function buildHeaders(apiKey) {
        const headers = { 'Content-Type': 'application/json; charset=utf-8' };
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
        return headers;
    }

    function textValue(value) {
        if (typeof value === 'string') return value.trim();
        if (!Array.isArray(value)) return '';
        return value.map(block => {
            if (typeof block === 'string') return block;
            return block?.text || block?.content || block?.value || '';
        }).filter(Boolean).join('\n').trim();
    }

    function extractStructuredAnswer(value) {
        const source = textValue(value);
        if (!source) return '';

        // Non mostriamo il ragionamento interno del modello. Recuperiamo soltanto
        // una risposta finale esplicita o un payload strutturato che il gioco sa usare.
        const finalMarker = source.match(/(?:RISPOSTA\s+FINALE|FINAL\s+ANSWER)\s*:\s*([\s\S]+)$/i);
        if (finalMarker?.[1]?.trim()) return finalMarker[1].trim();

        const fencedBlocks = [...source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
        const fenced = fencedBlocks.at(-1)?.[1]?.trim();
        if (fenced) return fenced;

        const jsonStart = source.indexOf('{');
        const jsonEnd = source.lastIndexOf('}');
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
            return source.slice(jsonStart, jsonEnd + 1).trim();
        }

        const tagged = source.match(/(\[(?:EVENTO|CRONISTA|CHAT|ESITO_CHAT|ACCORDO_CHAT|DATA_EVENTO|TEMPO_EVENTO|MONDO_[A-Z_]+|NPC_[A-Z_]+|FAZIONE_[A-Z_]+):[\s\S]+)$/i);
        return tagged?.[1]?.trim() || '';
    }

    function parseContent(data, style) {
        const nativeMessage = data?.message || {};
        const choiceMessage = data?.choices?.[0]?.message || {};
        const primary = style === 'openai'
            ? (choiceMessage.content || choiceMessage.text || data?.output_text)
            : (nativeMessage.content || nativeMessage.text || data?.response || data?.output_text || choiceMessage.content || choiceMessage.text);
        const content = textValue(primary);
        if (content) return content;

        const explicitFinal = textValue(
            nativeMessage.final || nativeMessage.final_answer ||
            choiceMessage.final || choiceMessage.final_answer
        );
        if (explicitFinal) return explicitFinal;

        return extractStructuredAnswer(
            nativeMessage.reasoning_content || nativeMessage.reasoning || nativeMessage.thinking ||
            choiceMessage.reasoning_content || choiceMessage.reasoning || choiceMessage.thinking ||
            data?.reasoning_content || data?.thinking
        );
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
                contextSize: Number(details.context_length || raw.context_length) || DEFAULT_CLOUD_CONTEXT_SIZE,
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
            const timeoutMs = Math.max(1000, Number(config?.timeoutMs) || this.timeoutMs);
            const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
            const common = {
                model: model.apiId,
                messages,
                stream: false
            };
            const temperature = Number.isFinite(Number(config?.temperature)) ? Number(config.temperature) : model.temperature;
            const topP = Number.isFinite(Number(config?.topP)) ? Number(config.topP) : model.topP;
            const topK = Number.isFinite(Number(config?.topK)) ? Number(config.topK) : model.topK;
            const nativeOptions = {
                temperature,
                top_p: topP,
                top_k: topK,
                num_predict: maxTokens || 1500
            };
            // Ollama Cloud usa automaticamente il massimo contesto del modello.
            // Un override resta possibile per proxy/installazioni che lo richiedono,
            // ma non limitiamo i modelli Cloud con un valore locale stimato.
            const contextOverride = Number(config?.contextSizeOverride);
            if (Number.isFinite(contextOverride) && contextOverride > 0) {
                nativeOptions.num_ctx = Math.trunc(contextOverride);
            }
            const body = endpoint.style === 'openai'
                ? {
                    ...common,
                    temperature,
                    top_p: topP,
                    max_tokens: maxTokens || 1500,
                    ...(config?.format === 'json' ? { response_format: { type: 'json_object' } } : {})
                }
                : {
                    ...common,
                    // Le risposte del gioco devono arrivare nel campo content. Senza
                    // questo flag i modelli reasoning possono consumare il budget nel
                    // campo thinking e restituire message.content vuoto.
                    think: config?.think === true,
                    ...(config?.format ? { format: config.format } : {}),
                    options: nativeOptions
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
            const requestedAttempts = Number(settings.maxAttempts);
            const candidates = Number.isFinite(requestedAttempts) && requestedAttempts > 0
                ? preferred.slice(0, Math.max(1, Math.trunc(requestedAttempts)))
                : preferred;

            const failures = [];
            for (const model of candidates) {
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
        DEFAULT_CLOUD_CONTEXT_SIZE,
        resolveEndpoint,
        isValidModelId,
        parseContent,
        extractStructuredAnswer
    };
});
