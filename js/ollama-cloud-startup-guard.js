(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheOllamaCloudStartupGuard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 3;
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
        return (Array.isArray(messages) ? messages : []).map(message => clean(message?.content)).join('\n').slice(0, 40000);
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
        // Le fasi centrali producono JSON molto più grandi della fase 1. In particolare
        // la Fase 4 richiede 8-16 NPC: 3200 token potevano troncare l'array e provocare
        // il fallback del world-builder legacy, che visivamente ripartiva dalla Fase 1.
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
            ? 'IMPORTANTE: restituisci esclusivamente JSON valido conforme allo schema richiesto. Nessun markdown.'
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

    function completeJson(value) {
        const text = clean(value);
        const first = text.indexOf('{');
        const last = text.lastIndexOf('}');
        if (first < 0 || last <= first) return false;
        try {
            JSON.parse(text.slice(first, last + 1));
            return true;
        } catch (_error) {
            return false;
        }
    }

    function sectionLines(messages, startLabel, stopLabels) {
        const text = promptText(messages);
        const start = text.indexOf(startLabel);
        if (start < 0) return [];
        const from = start + startLabel.length;
        let end = text.length;
        (Array.isArray(stopLabels) ? stopLabels : []).forEach(label => {
            const index = text.indexOf(label, from);
            if (index >= 0 && index < end) end = index;
        });
        return text.slice(from, end).split(/\r?\n/).map(clean).filter(Boolean);
    }

    function unique(values) {
        return [...new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean))];
    }

    function extractPipeNames(lines) {
        return unique(lines.map(line => line.includes(' | ') ? line.split(' | ')[0] : '').filter(Boolean));
    }

    function fallbackNpcJson(messages) {
        const locations = extractPipeNames(sectionLines(messages, 'LUOGHI:', ['FAZIONI:', '=== GEOGRAFIA', 'Restituisci:']));
        const factions = extractPipeNames(sectionLines(messages, 'FAZIONI:', ['=== GEOGRAFIA', 'Restituisci:']));
        const names = ['Andrea Rossi','Elena Bianchi','Lorenzo Conti','Giulia Ferri','Matteo Ricci','Sara Moretti','Davide Galli','Chiara Neri'];
        const roles = ['Referente locale','Mercante','Funzionario','Intermediaria','Artigiano','Notabile','Guardia','Informatrice'];
        const npcs = names.map((name, index) => ({
            name,
            role: roles[index % roles.length],
            faction: factions.length ? factions[index % factions.length] : '',
            location: locations.length ? locations[index % locations.length] : '',
            description: 'Personaggio di continuità creato per non interrompere la generazione del mondo.',
            personality: index % 2 ? 'Pragmatico, prudente e attento ai rapporti di forza.' : 'Ambizioso, concreto e molto informato sul contesto locale.',
            goal: 'Proteggere i propri interessi e aumentare il proprio margine di influenza.',
            publicGoal: 'Mantenere stabilità e vantaggi nel proprio ambito.',
            privateGoal: 'Ottenere una posizione più favorevole rispetto ai concorrenti.',
            strategy: 'Coltiva relazioni, informazioni e scambi utili.',
            resources: 'Contatti locali, reputazione e accesso a informazioni operative.',
            influence: 25 + index * 5,
            knowledge: 'Conosce persone e dinamiche del proprio luogo e della propria rete.',
            agenda: 'Osserva gli sviluppi e agisce quando emerge un vantaggio concreto.',
            leverage: 'Relazioni e informazioni.',
            constraints: 'Risorse limitate e dipendenza dagli equilibri locali.',
            relationship: 'Da definire attraverso gli eventi iniziali.',
            gender: index % 2 ? 'F' : 'M'
        }));
        return JSON.stringify({ npcs });
    }

    function fallbackDynamicsJson(messages) {
        const npcNames = extractPipeNames(sectionLines(messages, 'NPC:', ['=== GEOGRAFIA', 'Restituisci:']));
        const factionNames = extractPipeNames(sectionLines(messages, 'FAZIONI:', ['NPC:', '=== GEOGRAFIA', 'Restituisci:']));
        const actors = unique([...npcNames, ...factionNames]);
        const relations = [];
        for (let index = 0; index < Math.min(6, Math.max(0, actors.length - 1)); index++) {
            const from = actors[index % actors.length];
            const to = actors[(index + 1) % actors.length];
            if (!from || !to || from === to) continue;
            relations.push({
                from,
                to,
                type: index % 2 ? 'competizione' : 'cooperazione prudente',
                trust: index % 2 ? 35 : 55,
                tension: index % 2 ? 60 : 30,
                description: 'Relazione iniziale mantenuta come continuità operativa del mondo.'
            });
        }
        const forces = actors.slice(0, 3).map((actor, index) => ({
            name: `Iniziativa di ${actor}`,
            actor,
            objective: index === 0 ? 'Consolidare la propria posizione' : index === 1 ? 'Ottenere nuove informazioni e alleanze' : 'Preparare la prossima mossa',
            progress: 10 + index * 5,
            urgency: 45 + index * 10,
            cause: 'Interessi già presenti all apertura della campagna.',
            opposition: actors.filter(name => name !== actor).slice(0, 2),
            consequenceAt100: 'Produce un cambiamento concreto negli equilibri del mondo.'
        }));
        return JSON.stringify({ relations, forces });
    }

    function fallbackAuditJson() {
        return JSON.stringify({
            startLocation: '',
            npcRepairs: [],
            factionRepairs: [],
            locationRepairs: [],
            dropRelations: [],
            notes: ['Audit LLM non disponibile: mantenuta la validazione deterministica.']
        });
    }

    function recoveryContent(phase, messages) {
        if (phase === 4) return fallbackNpcJson(messages);
        if (phase === 5) return fallbackDynamicsJson(messages);
        if (phase === 6) return fallbackAuditJson();
        return '';
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
                if (phase && !completeJson(content)) {
                    failures.push({ endpoint: base, status: 200, message: `JSON incompleto nella fase ${phase}` });
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
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
            }
        }

        const recovered = recoveryContent(phase, messages);
        if (recovered) {
            console.warn(`[OllamaStartupGuard] Fase ${phase} recuperata localmente dopo risposte incomplete o indisponibili.`, failures);
            return {
                content: recovered,
                model: apiId,
                apiId,
                endpoint: 'local-bootstrap-recovery',
                data: {},
                attemptedModels: [apiId],
                power: {
                    enabled: false,
                    startupGuard: true,
                    recovered: true,
                    phase,
                    think: false,
                    outputBudget: budget,
                    context: 'local-bootstrap-recovery'
                }
            };
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
        completeJson,
        fallbackNpcJson,
        fallbackDynamicsJson,
        fallbackAuditJson,
        recoveryContent,
        startupRequest,
        patchClient,
        install
    };
});