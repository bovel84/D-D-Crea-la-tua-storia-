(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheOllamaCloudCatalogV2 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 4;
    const OFFICIAL_API = 'https://ollama.com/api';
    const DEFAULT_CONTEXT = 65536;
    const RETRYABLE = new Set([400, 404, 408, 409, 425, 429, 500, 502, 503, 504]);
    const ALIASES = Object.freeze({
        'kimi-k2.7': 'kimi-k2.7-code',
        'kimi-k2.7-cloud': 'kimi-k2.7-code',
        'kimi-k2.7:cloud': 'kimi-k2.7-code'
    });

    function validId(value) {
        return /^[a-zA-Z0-9._:@/-]+$/.test(String(value || '').trim());
    }

    function normalizeCloudApiId(value) {
        let id = String(value || '').trim();
        if (!id) return '';
        id = id.replace(/:cloud$/i, '').replace(/-cloud$/i, '');
        if (ALIASES[id]) id = ALIASES[id];
        return validId(id) ? id : '';
    }

    function cloudTagFor(value) {
        const id = normalizeCloudApiId(value) || String(value || '').trim();
        if (!id) return '';
        const colon = id.lastIndexOf(':');
        if (colon > 0) return `${id}-cloud`;
        return `${id}:cloud`;
    }

    const CURRENT_MODELS = Object.freeze([
        ['glm-5.2', 'GLM 5.2', 999424, 0.65],
        ['kimi-k3', 'Kimi K3', 1048576, 0.65],
        ['kimi-k2.7-code', 'Kimi K2.7 Code', 262144, 0.65],
        ['nemotron-3-ultra', 'Nemotron 3 Ultra', 262144, 0.65],
        ['minimax-m3', 'MiniMax M3', 1048576, 0.7],
        ['deepseek-v4-flash', 'DeepSeek V4 Flash', 1048576, 0.65],
        ['deepseek-v4-flash:0731', 'DeepSeek V4 Flash 0731', 1048576, 0.65],
        ['deepseek-v4-pro', 'DeepSeek V4 Pro', 1048576, 0.65],
        ['glm-5.1', 'GLM 5.1', 202752, 0.65],
        ['kimi-k2.6', 'Kimi K2.6', 262144, 0.7],
        ['kimi-k2.5', 'Kimi K2.5', 262144, 0.7],
        ['minimax-m2.7', 'MiniMax M2.7', 204800, 0.7],
        ['minimax-m2.5', 'MiniMax M2.5', 204800, 0.7],
        ['gemma4', 'Gemma 4', 262144, 0.7],
        ['gemma4:31b', 'Gemma 4 31B', 262144, 0.7],
        ['nemotron-3-super', 'Nemotron 3 Super', 262144, 0.65],
        ['qwen3.5', 'Qwen 3.5', 262144, 0.65],
        ['qwen3.5:397b', 'Qwen 3.5 397B', 262144, 0.65],
        ['nemotron-3-nano:30b', 'Nemotron 3 Nano 30B', 1048576, 0.7],
        ['mistral-large-3:675b', 'Mistral Large 3 675B', 262144, 0.7],
        ['gpt-oss:120b', 'GPT-OSS 120B', 131072, 0.7],
        ['gpt-oss:20b', 'GPT-OSS 20B', 131072, 0.75]
    ].map(([id, name, contextSize, temperature]) => Object.freeze({
        id,
        apiId: id,
        displayName: `${name} · Cloud`,
        localCloudId: cloudTagFor(id),
        cloudTag: cloudTagFor(id),
        contextSize,
        temperature,
        topP: 0.9,
        topK: 40,
        notes: 'Modello Ollama Cloud. Il catalogo del tuo account ha priorità su questo elenco.'
    }))));

    function cleanNumber(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : fallback;
    }

    function modelFromRaw(raw) {
        if (!raw) return null;
        if (typeof raw === 'string') raw = { name: raw };
        const rawId = String(raw.name || raw.model || raw.apiId || raw.id || '').trim();
        const apiId = normalizeCloudApiId(rawId);
        if (!apiId) return null;
        const details = raw.details || {};
        const contextSize = cleanNumber(
            details.context_length || raw.context_length || raw.contextSize || raw.context_window,
            DEFAULT_CONTEXT
        );
        const parameterSize = String(details.parameter_size || raw.parameter_size || '').trim();
        const family = String(details.family || raw.family || '').trim();
        const title = String(raw.displayName || raw.display_name || apiId).trim();
        return {
            id: apiId,
            apiId,
            displayName: /·\s*Cloud$/i.test(title) ? title : `${title}${parameterSize ? ` · ${parameterSize}` : ''} · Cloud`,
            localCloudId: raw.localCloudId || raw.cloudTag || rawId || cloudTagFor(apiId),
            cloudTag: raw.cloudTag || raw.localCloudId || rawId || cloudTagFor(apiId),
            contextSize,
            temperature: Number.isFinite(Number(raw.temperature)) ? Number(raw.temperature) : 0.7,
            topP: Number.isFinite(Number(raw.topP)) ? Number(raw.topP) : 0.9,
            topK: Number.isFinite(Number(raw.topK)) ? Number(raw.topK) : 40,
            notes: raw.notes || (family ? `Disponibile per questa API key · famiglia ${family}.` : 'Disponibile per questa API key Ollama Cloud.'),
            discovered: Boolean(raw.discovered || raw.name || raw.model)
        };
    }

    function mergeModels(staticModels, discoveredModels) {
        const merged = new Map();
        [...(Array.isArray(staticModels) ? staticModels : []), ...(Array.isArray(discoveredModels) ? discoveredModels : [])].forEach(raw => {
            const model = modelFromRaw(raw);
            if (!model) return;
            const existing = merged.get(model.id);
            if (!existing) {
                merged.set(model.id, model);
                return;
            }
            if (model.discovered) {
                merged.set(model.id, {
                    ...existing,
                    ...model,
                    contextSize: model.contextSize || existing.contextSize,
                    displayName: model.displayName || existing.displayName,
                    notes: model.notes || existing.notes
                });
            }
        });
        return [...merged.values()];
    }

    function catalog(discoveredModels) {
        return mergeModels(CURRENT_MODELS, discoveredModels);
    }

    function getModel(modelId, discoveredModels) {
        const wanted = normalizeCloudApiId(modelId);
        if (!wanted) return null;
        return catalog(discoveredModels).find(model => model.id === wanted) || {
            id: wanted,
            apiId: wanted,
            displayName: `${wanted} · ID Cloud`,
            localCloudId: cloudTagFor(wanted),
            cloudTag: cloudTagFor(wanted),
            contextSize: DEFAULT_CONTEXT,
            temperature: 0.7,
            topP: 0.9,
            topK: 40,
            notes: 'ID Ollama Cloud inserito manualmente.'
        };
    }

    function uniqueModels(values, discoveredModels) {
        const seen = new Set();
        const result = [];
        (Array.isArray(values) ? values : []).forEach(value => {
            const model = getModel(value, discoveredModels);
            if (!model || seen.has(model.id)) return;
            seen.add(model.id);
            result.push(model);
        });
        return result;
    }

    function endpointCandidates(ollama, suffix) {
        const bases = [];
        const proxy = String(ollama?.OLLAMA_NATIVE_PROXY || '').trim().replace(/\/$/, '');
        if (proxy) bases.push(proxy);
        bases.push(OFFICIAL_API);
        return [...new Set(bases)].map(base => `${base}/${suffix}`);
    }

    function errorText(data, response) {
        return String(data?.error?.message || data?.error || data?.message || `Errore Ollama HTTP ${response?.status || '?'}`);
    }

    async function fetchModelsWithFallback(ollama, apiKey, fetchImpl) {
        const key = String(apiKey || '').trim();
        const request = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
        if (!key) throw new Error('Inserisci prima una API key Ollama Cloud.');
        if (!request) throw new Error('Fetch API non disponibile.');
        const failures = [];
        for (const url of endpointCandidates(ollama, 'tags')) {
            try {
                const response = await request(url, { method: 'GET', headers: { Authorization: `Bearer ${key}` } });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    failures.push(`${response.status}: ${errorText(data, response)}`);
                    if (response.status === 401 || response.status === 403) break;
                    continue;
                }
                const models = (Array.isArray(data.models) ? data.models : []).map(modelFromRaw).filter(Boolean);
                if (models.length) return models;
                failures.push('Catalogo vuoto');
            } catch (error) {
                failures.push(error?.message || String(error));
            }
        }
        throw new Error(failures.at(-1) || 'Impossibile recuperare il catalogo Ollama Cloud.');
    }

    function normalizeSavedConfig(rootValue) {
        const state = rootValue?.G;
        const config = state?.settings?.ollama;
        if (!config) return;
        const primary = normalizeCloudApiId(config.primaryModel);
        if (primary) config.primaryModel = primary;
        if (Array.isArray(config.fallbackOrder)) {
            config.fallbackOrder = [...new Set(config.fallbackOrder.map(normalizeCloudApiId).filter(Boolean))].filter(id => id !== config.primaryModel);
        }
        if (config.taskModels && typeof config.taskModels === 'object') {
            Object.keys(config.taskModels).forEach(key => {
                const normalized = normalizeCloudApiId(config.taskModels[key]);
                if (normalized) config.taskModels[key] = normalized;
            });
        }
        if (Array.isArray(config.discoveredModels)) config.discoveredModels = config.discoveredModels.map(modelFromRaw).filter(Boolean);
    }

    function syncUi(doc, ollama) {
        if (!doc || !ollama) return;
        normalizeSavedConfig(root);
        const config = root.G?.settings?.ollama || {};
        const models = catalog(config.discoveredModels);
        const list = doc.getElementById('ollama-model-list');
        if (list) {
            list.replaceChildren(...models.map(model => {
                const option = doc.createElement('option');
                option.value = model.id;
                option.label = model.displayName;
                return option;
            }));
        }
        const input = doc.getElementById('set-ollama-model');
        if (input?.value) {
            const normalized = normalizeCloudApiId(input.value);
            if (normalized && normalized !== input.value) input.value = normalized;
        }
        const status = doc.getElementById('ollama-catalog-status');
        if (status && !/recupero|aggiornat|errore|impossibile/i.test(status.textContent || '')) {
            status.textContent = `${models.length} modelli Cloud nel catalogo. Premi Aggiorna per leggere quelli abilitati al tuo account.`;
        }
    }

    function patchOllama(ollama, doc) {
        if (!ollama || ollama.__cloudCatalogV2Patched) return Boolean(ollama);
        ollama.__cloudCatalogV2Patched = true;
        ollama.normalizeCloudApiId = normalizeCloudApiId;
        ollama.cloudTagFor = cloudTagFor;
        ollama.OLLAMA_MODELS = Object.freeze(CURRENT_MODELS.map(model => ({ ...model })));
        ollama.DEFAULT_FALLBACK_ORDER = Object.freeze(['deepseek-v4-flash', 'qwen3.5:397b', 'gpt-oss:20b']);
        ollama.mergeCatalog = discovered => catalog(discovered);
        ollama.getModel = (id, discovered) => getModel(id, discovered);
        ollama.uniqueModels = (values, discovered) => uniqueModels(values, discovered);
        ollama.fetchCloudModels = (apiKey, fetchImpl) => fetchModelsWithFallback(ollama, apiKey, fetchImpl);

        const proto = ollama.OllamaCloudClient?.prototype;
        if (proto?.request && !proto.request.__cloudCatalogV2Wrapped) {
            const originalRequest = proto.request;
            const wrappedRequest = async function requestWithNormalizedCloudId(model, messages, config, maxTokens) {
                const normalized = getModel(model?.apiId || model?.id, config?.discoveredModels);
                const safeModel = {
                    ...(model || {}),
                    ...(normalized || {}),
                    id: normalized?.id || normalizeCloudApiId(model?.id),
                    apiId: normalized?.apiId || normalizeCloudApiId(model?.apiId || model?.id)
                };
                try {
                    return await originalRequest.call(this, safeModel, messages, config, maxTokens);
                } catch (error) {
                    const canTryOfficial = !String(config?.nativeProxy || '').trim() && [400, 404, 502, 503, 504].includes(Number(error?.status));
                    if (!canTryOfficial) throw error;
                    return originalRequest.call(this, safeModel, messages, { ...(config || {}), nativeProxy: OFFICIAL_API }, maxTokens);
                }
            };
            wrappedRequest.__cloudCatalogV2Wrapped = true;
            wrappedRequest.__cloudCatalogV2Original = originalRequest;
            proto.request = wrappedRequest;
        }

        syncUi(doc, ollama);
        return true;
    }

    function install(doc = typeof document !== 'undefined' ? document : null) {
        const ollama = root.CronacheOllama;
        if (!ollama) return false;
        const installed = patchOllama(ollama, doc);
        if (doc && !doc.documentElement?.dataset.ollamaCatalogV2Bound) {
            if (doc.documentElement) doc.documentElement.dataset.ollamaCatalogV2Bound = '1';
            doc.addEventListener('click', event => {
                if (!event.target?.closest?.('#btn-refresh-ollama-models')) return;
                [200, 700, 1800].forEach(delay => setTimeout(() => syncUi(doc, ollama), delay));
            }, true);
            doc.addEventListener('change', event => {
                if (event.target?.id === 'set-model' || event.target?.id === 'set-ollama-model') setTimeout(() => syncUi(doc, ollama), 0);
            });
        }
        root.__cronacheOllamaCloudCatalogV2Version = PATCH_VERSION;
        return installed;
    }

    if (typeof document !== 'undefined') {
        const boot = () => {
            if (install(document)) return;
            [120, 500, 1200, 2500, 5000].forEach(delay => setTimeout(() => install(document), delay));
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
        else boot();
    }

    return {
        PATCH_VERSION,
        CURRENT_MODELS,
        normalizeCloudApiId,
        cloudTagFor,
        modelFromRaw,
        mergeModels,
        getModel,
        uniqueModels,
        endpointCandidates,
        fetchModelsWithFallback,
        patchOllama,
        install,
        RETRYABLE
    };
});