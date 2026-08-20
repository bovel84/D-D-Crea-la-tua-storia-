(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheOllamaCloudPowerV3 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 3;
    const STYLE_ID = 'cronache-ollama-cloud-power-v3-style';
    const POWER_STORAGE_KEY = 'cronache_ollama_power_mode_v3';
    const OFFICIAL_API = 'https://ollama.com/api';
    const MAX_TEST_TOKENS = 72;
    const THINK_FALLBACKS = Object.freeze(['max', 'high', true, false]);
    let installed = false;

    const clean = value => String(value == null ? '' : value).trim();
    const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

    function modelId(value) {
        const raw = clean(value?.apiId || value?.id || value);
        if (!raw) return '';
        const normalizer = root.CronacheOllama?.normalizeCloudApiId || root.CronacheOllamaCloudCatalogV2?.normalizeCloudApiId;
        return typeof normalizer === 'function' ? normalizer(raw) : raw.replace(/:cloud$/i, '').replace(/-cloud$/i, '');
    }

    function isPowerEnabled(storage = root.localStorage) {
        try {
            const value = storage?.getItem?.(POWER_STORAGE_KEY);
            return value === null || value === undefined ? true : value !== '0';
        } catch (_error) {
            return true;
        }
    }

    function setPowerEnabled(enabled, storage = root.localStorage) {
        try { storage?.setItem?.(POWER_STORAGE_KEY, enabled ? '1' : '0'); } catch (_error) { }
        return Boolean(enabled);
    }

    function promptCorpus(messages) {
        return (Array.isArray(messages) ? messages : [])
            .map(message => clean(message?.content))
            .join('\n')
            .toLowerCase()
            .slice(0, 24000);
    }

    function taskClass(messages, config = {}) {
        const corpus = promptCorpus(messages);
        if (config?.format || /json|schema|tag obbligatori|formato obbligatorio|structured/.test(corpus)) return 'structured';
        if (/genera(?:re)? il mondo|world generation|worldbuilder|crea il mondo|geografia|fazioni|npc del mondo/.test(corpus)) return 'world';
        if (/strateg|pianific|analizz|valuta|decision|conseguenz|timeline|evento|risolvi|simula|regno|econom|politic|diplom|militar/.test(corpus)) return 'reasoning';
        if (/riassum|summary|sintesi|riepilog/.test(corpus)) return 'summary';
        if (/dialog|parla|rispondi in prima persona|chat|conversazione/.test(corpus)) return 'dialogue';
        return corpus.length > 9000 ? 'reasoning' : 'narrative';
    }

    function capabilityProfile(id, task = 'narrative') {
        const key = modelId(id).toLowerCase();
        const reasoningModel = /deepseek|glm|kimi|qwen|nemotron|gpt-oss|minimax/.test(key);
        const gptOss = /gpt-oss/.test(key);
        const coding = /code|coder/.test(key);
        const complex = ['world', 'reasoning', 'structured'].includes(task);
        let think = false;
        if (reasoningModel && complex) think = gptOss ? 'high' : 'max';
        else if (reasoningModel && task === 'summary') think = 'medium';
        else if (coding && task !== 'dialogue') think = 'high';

        const temperature = task === 'structured' ? 0.2
            : task === 'reasoning' || task === 'world' ? 0.45
                : task === 'summary' ? 0.35
                    : task === 'dialogue' ? 0.72
                        : 0.68;
        const minOutput = complex ? 4096 : task === 'summary' ? 1800 : 2200;
        return {
            task,
            think,
            temperature,
            topP: task === 'structured' ? 0.82 : 0.92,
            topK: task === 'structured' ? 30 : 50,
            minOutput,
            useMaximumCloudContext: true,
            structuredViaPrompt: task === 'structured'
        };
    }

    function structuredInstruction(format) {
        if (!format) return '';
        if (format === 'json') {
            return 'IMPORTANTE: restituisci JSON valido e nient’altro. Non usare markdown o blocchi ```.';
        }
        if (typeof format === 'object') {
            let schema = '';
            try { schema = JSON.stringify(format); } catch (_error) { }
            return `IMPORTANTE: restituisci esclusivamente JSON valido conforme a questo schema: ${schema}`.slice(0, 7000);
        }
        return 'IMPORTANTE: rispetta rigorosamente il formato strutturato richiesto nel prompt.';
    }

    function enhancedMessages(messages, format) {
        const list = (Array.isArray(messages) ? messages : []).map(message => ({ ...message }));
        const instruction = structuredInstruction(format);
        if (!instruction) return list;
        const systemIndex = list.findIndex(message => message?.role === 'system');
        if (systemIndex >= 0) list[systemIndex] = { ...list[systemIndex], content: `${clean(list[systemIndex].content)}\n\n${instruction}` };
        else list.unshift({ role: 'system', content: instruction });
        return list;
    }

    function endpointBases(ollama, config = {}) {
        const configured = clean(config.nativeProxy).replace(/\/$/, '');
        const defaultProxy = clean(ollama?.OLLAMA_NATIVE_PROXY).replace(/\/$/, '');
        return [...new Set([configured, defaultProxy, OFFICIAL_API].filter(Boolean))];
    }

    function headers(apiKey) {
        return {
            'Content-Type': 'application/json; charset=utf-8',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        };
    }

    function extractContent(data) {
        const message = data?.message || {};
        const value = message.content ?? data?.response ?? data?.output_text ?? data?.choices?.[0]?.message?.content ?? '';
        if (typeof value === 'string') return value.trim();
        if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? item : item?.text || item?.content || '').filter(Boolean).join('\n').trim();
        return '';
    }

    function errorText(data, response) {
        return clean(data?.error?.message || data?.error || data?.message || `Errore Ollama HTTP ${response?.status || '?'}`);
    }

    function makeRequestError(ollama, message, details = {}) {
        const ErrorType = ollama?.OllamaRequestError || Error;
        const error = new ErrorType(message, details);
        Object.assign(error, details);
        return error;
    }

    function thinkAttempts(preferred) {
        if (preferred === false || preferred === undefined || preferred === null) return [false];
        const order = [preferred, ...THINK_FALLBACKS];
        return order.filter((value, index) => order.findIndex(other => other === value) === index);
    }

    async function requestCloud(ollama, client, model, messages, config = {}, maxTokens) {
        const apiId = modelId(model);
        if (!apiId) throw new Error('ID modello Ollama Cloud non valido.');
        if (!clean(config.apiKey)) throw new Error('API key Ollama Cloud non configurata.');
        const fetchImpl = client?.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
        if (!fetchImpl) throw new Error('Fetch API non disponibile.');

        const task = taskClass(messages, config);
        const profile = capabilityProfile(apiId, task);
        const power = config.powerMode !== undefined ? Boolean(config.powerMode) : isPowerEnabled();
        const preferredThink = power ? profile.think : false;
        const outputBudget = Math.max(64, Number(maxTokens || config.maxTokens) || (power ? profile.minOutput : 1500));
        const temperature = Number.isFinite(Number(config.temperature)) ? Number(config.temperature) : profile.temperature;
        const topP = Number.isFinite(Number(config.topP)) ? Number(config.topP) : profile.topP;
        const topK = Number.isFinite(Number(config.topK)) ? Number(config.topK) : profile.topK;
        const preparedMessages = enhancedMessages(messages, config.format);
        const failures = [];

        for (const base of endpointBases(ollama, config)) {
            for (const think of thinkAttempts(preferredThink)) {
                const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                const timeoutMs = Math.max(5000, Number(config.timeoutMs) || client?.timeoutMs || 45000) + (think ? 30000 : 0);
                const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
                const body = {
                    model: apiId,
                    messages: preparedMessages,
                    stream: false,
                    think,
                    options: {
                        temperature: clamp(temperature, 0, 2),
                        top_p: clamp(topP, 0.05, 1),
                        top_k: Math.max(1, Math.trunc(topK)),
                        num_predict: Math.trunc(outputBudget)
                    }
                };
                // Ollama Cloud usa già il contesto massimo del modello: non inviamo num_ctx.
                // Ollama Cloud non supporta attualmente structured outputs: il vincolo è nel prompt.
                try {
                    const response = await fetchImpl(`${base}/chat`, {
                        method: 'POST',
                        headers: headers(config.apiKey),
                        body: JSON.stringify(body),
                        signal: controller?.signal
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        const reason = errorText(data, response);
                        failures.push({ endpoint: base, think, status: response.status, message: reason });
                        if (response.status === 401 || response.status === 403 || response.status === 429) {
                            throw makeRequestError(ollama, reason, { status: response.status, retryable: false, model: apiId, failures });
                        }
                        if (response.status === 400 && think !== false) continue;
                        break;
                    }
                    const content = extractContent(data);
                    if (!content) {
                        failures.push({ endpoint: base, think, status: 200, message: 'Risposta finale vuota' });
                        if (think !== false) continue;
                        break;
                    }
                    return {
                        content,
                        model: apiId,
                        apiId,
                        endpoint: `${base}/chat`,
                        data,
                        attemptedModels: [apiId],
                        power: {
                            enabled: power,
                            task,
                            think,
                            context: 'maximum-cloud',
                            outputBudget
                        }
                    };
                } catch (error) {
                    if (error?.status === 401 || error?.status === 403 || error?.status === 429) throw error;
                    failures.push({ endpoint: base, think, status: error?.status || null, message: error?.name === 'AbortError' ? 'Timeout' : clean(error?.message || error) });
                    if (error?.name === 'AbortError') break;
                } finally {
                    if (timeoutId) clearTimeout(timeoutId);
                }
            }
        }
        const last = failures.at(-1);
        throw makeRequestError(ollama, last?.message || `Il modello ${apiId} non ha risposto.`, {
            status: last?.status || null,
            retryable: true,
            model: apiId,
            failures
        });
    }

    function testMetrics(data, elapsedMs) {
        const evalCount = Number(data?.eval_count) || 0;
        const evalDurationNs = Number(data?.eval_duration) || 0;
        const tokensPerSecond = evalCount && evalDurationNs ? evalCount / (evalDurationNs / 1e9) : null;
        return {
            elapsedMs: Math.max(0, Math.round(elapsedMs)),
            evalCount,
            promptEvalCount: Number(data?.prompt_eval_count) || 0,
            tokensPerSecond: tokensPerSecond ? Math.round(tokensPerSecond * 10) / 10 : null
        };
    }

    async function testModel(ollama, model, apiKey, options = {}) {
        const client = options.client || new ollama.OllamaCloudClient({ timeoutMs: options.timeoutMs || 35000 });
        const selected = ollama.getModel(model) || { id: modelId(model), apiId: modelId(model), temperature: 0.2, topP: 0.9, topK: 30 };
        const start = Date.now();
        const result = await requestCloud(ollama, client, selected, [
            { role: 'system', content: 'Sei un test di connettività. Rispondi soltanto con: TEST OK' },
            { role: 'user', content: 'Verifica il modello.' }
        ], {
            apiKey,
            temperature: 0.1,
            timeoutMs: options.timeoutMs || 35000,
            powerMode: false
        }, MAX_TEST_TOKENS);
        return {
            ...result,
            ok: /test\s*ok/i.test(result.content),
            metrics: testMetrics(result.data, Date.now() - start)
        };
    }

    function ensureStyles(doc) {
        if (!doc || doc.getElementById(STYLE_ID)) return;
        const style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
.ollama-power-panel{margin-top:8px;padding:9px;border:1px solid rgba(139,105,20,.35);border-radius:9px;background:rgba(255,255,255,.38)}
.ollama-power-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ollama-power-row button{flex:1 1 150px}
.ollama-power-toggle{display:flex;align-items:center;gap:8px;font-size:.88rem;color:var(--ink-light,#5c4030);cursor:pointer}
.ollama-power-result{margin-top:7px;font-size:.82rem;line-height:1.35;color:var(--ink-light,#5c4030)}
.ollama-power-result.ok{color:#256b39}.ollama-power-result.error{color:#9a2027}
@media(max-width:600px){.ollama-power-row{display:grid;grid-template-columns:1fr}.ollama-power-row button{width:100%}}
`;
        (doc.head || doc.documentElement).appendChild(style);
    }

    function installTestUi(doc, ollama) {
        const refresh = doc?.getElementById('btn-refresh-ollama-models');
        if (!refresh || doc.getElementById('ollama-model-test')) return false;
        const group = refresh.closest('.form-group') || refresh.parentElement;
        if (!group) return false;
        const panel = doc.createElement('div');
        panel.className = 'ollama-power-panel';
        panel.innerHTML = `
            <div class="ollama-power-row">
                <button class="btn secondary" id="ollama-model-test" type="button">🧪 Test modello</button>
                <label class="ollama-power-toggle"><input type="checkbox" id="ollama-power-toggle"> 🧠 Potenziale massimo</label>
            </div>
            <div class="ollama-power-result" id="ollama-model-test-result">Testa il modello selezionato e misura connessione e risposta.</div>`;
        group.appendChild(panel);
        const toggle = panel.querySelector('#ollama-power-toggle');
        toggle.checked = isPowerEnabled();
        toggle.addEventListener('change', () => {
            setPowerEnabled(toggle.checked);
            const result = panel.querySelector('#ollama-model-test-result');
            result.className = 'ollama-power-result';
            result.textContent = toggle.checked
                ? 'Potenziale massimo attivo: ragionamento adattivo, budget maggiore e contesto Cloud massimo.'
                : 'Modalità rapida attiva: ragionamento avanzato disabilitato.';
        });
        panel.querySelector('#ollama-model-test').addEventListener('click', async event => {
            const button = event.currentTarget;
            const resultNode = panel.querySelector('#ollama-model-test-result');
            const id = clean(doc.getElementById('set-ollama-model')?.value);
            const apiKey = clean(doc.getElementById('set-ollama-key')?.value);
            if (!id || !apiKey) {
                resultNode.className = 'ollama-power-result error';
                resultNode.textContent = 'Seleziona un modello e inserisci la API key Ollama Cloud.';
                return;
            }
            button.disabled = true;
            button.textContent = '⏳ Test in corso…';
            resultNode.className = 'ollama-power-result';
            resultNode.textContent = `Connessione a ${id}…`;
            try {
                const tested = await testModel(ollama, id, apiKey);
                const metrics = tested.metrics;
                const speed = metrics.tokensPerSecond ? ` · ${metrics.tokensPerSecond} tok/s` : '';
                resultNode.className = `ollama-power-result ${tested.ok ? 'ok' : ''}`;
                resultNode.textContent = `${tested.ok ? '✅' : '⚠️'} ${tested.model} risponde · ${(metrics.elapsedMs / 1000).toFixed(1)} s${speed} · endpoint ${tested.endpoint.includes('ollama.com/api') ? 'Ollama diretto' : 'proxy app'}`;
            } catch (error) {
                resultNode.className = 'ollama-power-result error';
                const status = error?.status ? `HTTP ${error.status} · ` : '';
                resultNode.textContent = `❌ ${status}${clean(error?.message || error)}`;
            } finally {
                button.disabled = false;
                button.textContent = '🧪 Test modello';
            }
        });
        return true;
    }

    function patchClient(ollama) {
        const proto = ollama?.OllamaCloudClient?.prototype;
        if (!proto || proto.request?.__ollamaPowerV3) return Boolean(proto);
        const original = proto.request;
        const enhanced = function poweredRequest(model, messages, config, maxTokens) {
            return requestCloud(ollama, this, model, messages, config || {}, maxTokens);
        };
        enhanced.__ollamaPowerV3 = true;
        enhanced.__ollamaPowerV3Original = original;
        proto.request = enhanced;
        return true;
    }

    function install(doc = typeof document !== 'undefined' ? document : null) {
        const ollama = root.CronacheOllama;
        if (!ollama) return false;
        patchClient(ollama);
        ensureStyles(doc);
        installTestUi(doc, ollama);
        if (doc && !installed) {
            installed = true;
            const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => installTestUi(doc, ollama)) : null;
            observer?.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
        }
        root.__cronacheOllamaCloudPowerV3Version = PATCH_VERSION;
        return true;
    }

    if (typeof document !== 'undefined') {
        const boot = () => {
            if (install(document)) return;
            [120, 500, 1200, 2500].forEach(delay => setTimeout(() => install(document), delay));
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
        else boot();
    }

    return {
        PATCH_VERSION,
        POWER_STORAGE_KEY,
        modelId,
        taskClass,
        capabilityProfile,
        structuredInstruction,
        enhancedMessages,
        thinkAttempts,
        testMetrics,
        requestCloud,
        testModel,
        isPowerEnabled,
        setPowerEnabled,
        install
    };
});