(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheOffscreenWorldV7 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const SCHEMA_VERSION = 1;
    const PATCH_VERSION = 1;
    const MAX_ACTIVE_MOVERS = 6;
    const MAX_HISTORY = 140;
    const MAX_PROCESSED_EVENTS = 120;
    const DUE_HEAT = 72;

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 700) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, number(value, min)));
    const keyOf = value => clean(value, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function hashNumber(value) {
        let hash = 2166136261;
        const text = String(value || '');
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function noise(key, turn) {
        const value = hashNumber(`${key}|${turn}|offscreen-v7`);
        return ((value % 2001) - 1000) / 1000;
    }

    function objectValues(value) {
        if (!value || typeof value !== 'object') return [];
        return Array.isArray(value) ? value : Object.values(value);
    }

    function ensureState(state = getState()) {
        if (!state?.worldMemory) return { schemaVersion: SCHEMA_VERSION, lastProcessedTurn: -1, actors: {}, history: [], processedEvents: [] };
        const memory = state.worldMemory;
        if (!memory.offscreenWorld || typeof memory.offscreenWorld !== 'object' || Array.isArray(memory.offscreenWorld)) {
            memory.offscreenWorld = { schemaVersion: SCHEMA_VERSION, lastProcessedTurn: -1, actors: {}, history: [], processedEvents: [] };
        }
        const registry = memory.offscreenWorld;
        registry.schemaVersion = SCHEMA_VERSION;
        if (!registry.actors || typeof registry.actors !== 'object' || Array.isArray(registry.actors)) registry.actors = {};
        if (!Array.isArray(registry.history)) registry.history = [];
        if (!Array.isArray(registry.processedEvents)) registry.processedEvents = [];
        if (!Number.isFinite(Number(registry.lastProcessedTurn))) registry.lastProcessedTurn = -1;
        return registry;
    }

    function normalizeSource(source, kind, fallback = {}) {
        const item = source && typeof source === 'object' ? source : { name: source };
        const name = clean(item.name || item.title, 130);
        if (!name) return null;
        const id = clean(item.id, 150) || `${kind}-${keyOf(name)}`;
        return {
            id,
            name,
            kind,
            role: clean(item.role || item.type || fallback.role, 120),
            goal: clean(item.privateGoal || item.goal || item.publicGoal || item.goals || item.agenda || fallback.goal, 360),
            publicGoal: clean(item.publicGoal || item.goal || item.goals || fallback.goal, 320),
            strategy: clean(item.strategy || item.agenda || fallback.strategy, 320),
            location: clean(item.location || item.base || fallback.location, 120),
            status: clean(item.status || 'active', 50),
            influence: clamp(item.influence ?? item.power ?? fallback.influence ?? 50),
            urgency: clamp(item.urgency ?? item.pressure ?? item.hostility ?? fallback.urgency ?? 45),
            trust: clamp(item.trust ?? item.loyalty ?? fallback.trust ?? 50),
            raw: item
        };
    }

    function collectSources(state = getState()) {
        const memory = state?.worldMemory || {};
        const rows = [];
        asArray(memory?.world?.actors).forEach(item => {
            const normalized = normalizeSource(item, 'npc');
            if (normalized) rows.push(normalized);
        });
        asArray(memory?.world?.factions).forEach(item => {
            const normalized = normalizeSource(item, 'faction', { urgency: item?.hostility, influence: item?.influence || item?.power });
            if (normalized) rows.push(normalized);
        });
        objectValues(memory?.managementAgents?.agents).forEach(item => {
            if (item?.status && /inactive|closed|dead|removed/.test(keyOf(item.status))) return;
            const kind = item?.role === 'faction' ? 'faction' : item?.role === 'diplomatic' ? 'diplomatic' : 'stakeholder';
            const normalized = normalizeSource(item, kind, { urgency: item?.pressure, influence: item?.influence });
            if (normalized) rows.push(normalized);
        });
        const kingdom = memory.kingdom || {};
        if (kingdom.active) {
            asArray(kingdom.factions).forEach(item => {
                const normalized = normalizeSource(item, 'faction', { urgency: item?.hostility, influence: item?.power });
                if (normalized) rows.push(normalized);
            });
            asArray(kingdom.diplomacy).forEach(item => {
                const normalized = normalizeSource({ ...item, name: item?.name || item?.counterpart || item?.kingdom || item?.target }, 'diplomatic', { urgency: item?.tension, influence: 55 });
                if (normalized) rows.push(normalized);
            });
        }
        const dedupe = new Map();
        rows.forEach(row => {
            if (/dead|morto|resolved|closed|inactive|removed/.test(keyOf(row.status))) return;
            const key = keyOf(row.name);
            if (!key) return;
            const existing = dedupe.get(key);
            if (!existing || row.goal.length > existing.goal.length || row.influence > existing.influence) dedupe.set(key, row);
        });
        return [...dedupe.values()].slice(0, 80);
    }

    function ensureActorEntry(registry, source, turn) {
        const id = clean(source.id, 150) || `${source.kind}-${keyOf(source.name)}`;
        let entry = registry.actors[id];
        if (!entry || typeof entry !== 'object') {
            entry = registry.actors[id] = {
                id,
                name: source.name,
                kind: source.kind,
                role: source.role,
                goal: source.goal,
                publicGoal: source.publicGoal,
                strategy: source.strategy,
                location: source.location,
                influence: source.influence,
                urgency: source.urgency,
                trust: source.trust,
                progress: 0,
                heat: 0,
                momentum: 0,
                lastTurn: Math.max(0, turn - 1),
                lastVisibleTurn: -1,
                cooldownUntilTurn: 0,
                status: 'active'
            };
        }
        entry.name = source.name;
        entry.kind = source.kind;
        entry.role = source.role;
        entry.goal = source.goal || entry.goal;
        entry.publicGoal = source.publicGoal || entry.publicGoal;
        entry.strategy = source.strategy || entry.strategy;
        entry.location = source.location || entry.location;
        entry.influence = source.influence;
        entry.urgency = source.urgency;
        entry.trust = source.trust;
        entry.status = 'active';
        return entry;
    }

    function moveSummary(entry) {
        const goal = clean(entry.publicGoal || entry.goal, 180) || 'rafforzare la propria posizione';
        if (entry.kind === 'faction') return `${entry.name} lavora lontano dalla scena per ${goal}.`;
        if (entry.kind === 'diplomatic') return `${entry.name} modifica contatti e leve diplomatiche per ${goal}.`;
        if (entry.role === 'competitor') return `${entry.name} prepara una contromossa commerciale per ${goal}.`;
        if (entry.role === 'supplier') return `${entry.name} rivede priorità e condizioni di fornitura per ${goal}.`;
        if (entry.role === 'employee') return `${entry.name} si coordina e prende posizione per ${goal}.`;
        return `${entry.name} compie passi autonomi per ${goal}.`;
    }

    function scoreSource(source, entry, turn) {
        const idle = Math.max(0, turn - number(entry.lastTurn, turn));
        const visibleAgo = entry.lastVisibleTurn < 0 ? 6 : Math.max(0, turn - entry.lastVisibleTurn);
        const distrust = Math.max(0, 50 - number(source.trust, 50));
        return number(source.influence, 50) * 0.42 + number(source.urgency, 45) * 0.43 + Math.min(18, idle * 2) + Math.min(10, visibleAgo) + distrust * 0.08 + noise(source.id, turn) * 5;
    }

    function advance(state = getState(), explicitTurn = null) {
        if (!state?.worldMemory) return [];
        const registry = ensureState(state);
        const turn = explicitTurn == null ? Math.max(0, Math.round(number(state.worldMemory.turnCount))) : Math.max(0, Math.round(number(explicitTurn)));
        if (registry.lastProcessedTurn === turn) return registry.history.filter(item => item.turn === turn);
        const sources = collectSources(state);
        const ranked = sources.map(source => {
            const entry = ensureActorEntry(registry, source, turn);
            return { source, entry, score: scoreSource(source, entry, turn) };
        }).sort((a, b) => b.score - a.score).slice(0, MAX_ACTIVE_MOVERS);
        const moves = [];
        ranked.forEach(({ source, entry }) => {
            const n = noise(`${entry.id}:move`, turn);
            const drive = (number(source.urgency, 45) - 45) * 0.12 + (number(source.influence, 50) - 50) * 0.07 + Math.max(0, 50 - number(source.trust, 50)) * 0.04;
            entry.momentum = clamp(number(entry.momentum) * 0.55 + drive + n * 4, -20, 20);
            const gain = Math.max(2, 4 + number(source.influence) * 0.045 + number(source.urgency) * 0.055 + Math.max(0, entry.momentum) * 0.25);
            entry.progress = clamp(number(entry.progress) + gain, 0, 100);
            entry.heat = clamp(number(entry.heat) * 0.72 + entry.progress * 0.16 + number(source.urgency) * 0.15 + Math.max(0, entry.momentum) * 0.18 + n * 3, 0, 100);
            entry.lastTurn = turn;
            const due = entry.heat >= DUE_HEAT && turn >= number(entry.cooldownUntilTurn);
            const move = {
                id: `offscreen-${turn}-${hashNumber(`${entry.id}|${entry.progress}|${entry.heat}`).toString(36)}`,
                actorId: entry.id,
                actor: entry.name,
                kind: entry.kind,
                role: entry.role,
                goal: entry.publicGoal || entry.goal,
                strategy: entry.strategy,
                location: entry.location,
                turn,
                progress: Math.round(entry.progress),
                heat: Math.round(entry.heat),
                due,
                visibility: 'hidden',
                summary: moveSummary(entry)
            };
            moves.push(move);
        });
        registry.lastProcessedTurn = turn;
        registry.history.push(...moves);
        registry.history = registry.history.slice(-MAX_HISTORY);
        return moves;
    }

    function eventText(event) {
        return keyOf([event?.title, event?.summary, event?.consequence, event?.cause, asArray(event?.actors).join(' ')].filter(Boolean).join(' '));
    }

    function acknowledgeEvents(state = getState(), events = []) {
        if (!state?.worldMemory) return [];
        const registry = ensureState(state);
        const touched = [];
        asArray(events).forEach(event => {
            const id = clean(event?.id || event?.fingerprint, 170) || `event-${hashNumber(eventText(event)).toString(36)}`;
            if (registry.processedEvents.includes(id)) return;
            const text = eventText(event);
            Object.values(registry.actors).forEach(entry => {
                const actorKey = keyOf(entry.name);
                if (!actorKey || !text.includes(actorKey)) return;
                entry.lastVisibleTurn = Math.max(0, number(event?.turn, state.worldMemory.turnCount));
                entry.progress = Math.max(10, number(entry.progress) * 0.35);
                entry.heat = Math.max(12, number(entry.heat) * 0.38);
                entry.cooldownUntilTurn = entry.lastVisibleTurn + 2;
                touched.push(entry.id);
            });
            registry.processedEvents.push(id);
        });
        registry.processedEvents = registry.processedEvents.slice(-MAX_PROCESSED_EVENTS);
        return [...new Set(touched)];
    }

    function buildContext(state = getState()) {
        if (!state?.worldMemory) return '';
        advance(state);
        const registry = ensureState(state);
        const turn = Math.max(0, Math.round(number(state.worldMemory.turnCount)));
        const active = Object.values(registry.actors).filter(item => item.status === 'active');
        const due = active.filter(item => item.heat >= DUE_HEAT && turn >= number(item.cooldownUntilTurn))
            .sort((a, b) => number(b.heat) - number(a.heat)).slice(0, 2);
        const ambient = active.filter(item => !due.includes(item)).sort((a, b) => number(b.progress) - number(a.progress)).slice(0, 2);
        const selected = [...due, ...ambient].slice(0, 4);
        if (!selected.length) return '';
        const lines = selected.map(item => `- ${item.name} [${item.kind}${item.role ? `/${item.role}` : ''}]: obiettivo pubblico "${clean(item.publicGoal || item.goal, 180) || 'proteggere i propri interessi'}"; avanzamento ${Math.round(number(item.progress))}/100; pressione ${Math.round(number(item.heat))}/100${item.heat >= DUE_HEAT ? ' — MATURO PER UNA CONSEGUENZA VISIBILE' : ' — ancora dietro le quinte'}.`);
        return `🌒 SIMULAZIONE OFF-SCREEN V7 — il mondo agisce anche fuori dalla scena\n${lines.join('\n')}\n` +
            `Questi movimenti sono reali ma nascosti. Non rivelare informazioni che il protagonista non può conoscere. Se una pressione è matura e può raggiungere causalmente la scena, trasformala in una conseguenza concreta; altrimenti lasciala continuare dietro le quinte.`;
    }

    function patchEventManager() {
        const Manager = root.CronacheEvents?.EventManager;
        const original = Manager?.prototype?.record;
        if (typeof original !== 'function') return false;
        if (original.__phase7OffscreenWrapped) return true;
        const wrapped = function phase7OffscreenRecord(events, incoming, context) {
            const result = original.apply(this, arguments);
            try { if (result?.added?.length) acknowledgeEvents(getState(), result.added); } catch (error) { console.warn('[OffscreenWorldV7] evento non acquisito:', error); }
            return result;
        };
        wrapped.__phase7OffscreenWrapped = true;
        wrapped.__phase7OffscreenOriginal = original;
        Manager.prototype.record = wrapped;
        return true;
    }

    function patchTimelinePrompt() {
        const api = root.CronacheTimelineSimulator;
        const original = api?.buildBatchPrompt;
        if (typeof original !== 'function') return false;
        if (original.__phase7OffscreenWrapped) return true;
        const wrapped = function phase7TimelinePrompt() {
            const base = original.apply(this, arguments);
            const state = getState();
            try { advance(state); } catch (_error) { }
            const world = buildContext(state);
            const quests = root.CronacheQuestManagerV7?.buildQuestContext?.(state) || '';
            const extra = [quests, world].filter(Boolean).join('\n\n');
            return extra ? `${base || ''}\n\n${extra}` : base;
        };
        wrapped.__phase7OffscreenWrapped = true;
        wrapped.__phase7OffscreenOriginal = original;
        api.buildBatchPrompt = wrapped;
        return true;
    }

    function install() {
        if (root.__cronacheOffscreenWorldV7Patch >= PATCH_VERSION) return true;
        root.__cronacheOffscreenWorldV7Patch = PATCH_VERSION;
        patchEventManager();
        patchTimelinePrompt();
        if (typeof root.setTimeout === 'function') {
            root.setTimeout(() => { patchEventManager(); patchTimelinePrompt(); }, 0);
            root.setTimeout(() => { patchEventManager(); patchTimelinePrompt(); }, 900);
        }
        return true;
    }

    const api = {
        SCHEMA_VERSION,
        PATCH_VERSION,
        MAX_ACTIVE_MOVERS,
        DUE_HEAT,
        collectSources,
        ensureState,
        advance,
        acknowledgeEvents,
        buildContext,
        install
    };

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
        else install();
    }
    return api;
});
