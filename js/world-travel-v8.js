(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheWorldTravelV8 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const SCHEMA_VERSION = 1;
    const PATCH_VERSION = 1;
    const MAX_HISTORY = 80;

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 700) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const number = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, number(value, min)));
    const keyOf = value => clean(value, 700).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function hashText(value) {
        let hash = 2166136261;
        const text = String(value || '');
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function ensureTravelState(state = getState()) {
        if (!state?.worldMemory) return { schemaVersion: SCHEMA_VERSION, history: [], pending: null, edges: {} };
        const memory = state.worldMemory;
        if (!memory.travelV8 || typeof memory.travelV8 !== 'object' || Array.isArray(memory.travelV8)) {
            memory.travelV8 = { schemaVersion: SCHEMA_VERSION, history: [], pending: null, edges: {} };
        }
        const registry = memory.travelV8;
        registry.schemaVersion = SCHEMA_VERSION;
        if (!Array.isArray(registry.history)) registry.history = [];
        if (!registry.edges || typeof registry.edges !== 'object' || Array.isArray(registry.edges)) registry.edges = {};
        return registry;
    }

    function collectLocations(state = getState()) {
        const memory = state?.worldMemory || {};
        const rows = [...asArray(memory?.world?.locations), ...asArray(memory.locations)];
        const byKey = new Map();
        rows.forEach(item => {
            const source = typeof item === 'string' ? { name: item } : item;
            const key = keyOf(source?.name);
            if (!key) return;
            const previous = byKey.get(key) || {};
            byKey.set(key, { ...previous, ...source, name: clean(source.name, 140) });
        });
        return [...byKey.values()];
    }

    function findLocation(value, state = getState()) {
        const wanted = keyOf(typeof value === 'string' ? value : value?.name);
        if (!wanted) return null;
        const locations = collectLocations(state);
        return locations.find(item => keyOf(item.name) === wanted)
            || locations.find(item => keyOf(item.name).includes(wanted) || wanted.includes(keyOf(item.name)))
            || null;
    }

    function connectionNames(location) {
        return asArray(location?.connections).map(item => clean(typeof item === 'string' ? item : item?.name, 140)).filter(Boolean);
    }

    function inferDestination(action, state = getState()) {
        const text = keyOf(action);
        if (!text) return null;
        const matches = collectLocations(state).filter(location => {
            const locationKey = keyOf(location.name);
            return locationKey && text.includes(locationKey);
        }).sort((a, b) => keyOf(b.name).length - keyOf(a.name).length);
        const currentKey = keyOf(state?.currentLocation);
        return matches.find(location => keyOf(location.name) !== currentKey) || null;
    }

    function isTravelAction(action, state = getState()) {
        const text = keyOf(action);
        if (!text) return false;
        const destination = inferDestination(action, state);
        if (!destination) return false;
        const resolutionContext = root.CronacheTurnResolutionV7?.classifyContext?.(action, state);
        if (resolutionContext === 'travel') return true;
        return /\b(?:vado|vai|andare|parto|partire|raggiungo|raggiungere|viaggio|viaggiare|attraverso|cammino|cavalco|marcio|navigo|volo|mi-reco|sposto|trasferisco)\b/.test(text);
    }

    function adjacency(locations) {
        const graph = new Map(locations.map(item => [keyOf(item.name), new Set()]));
        locations.forEach(location => {
            const from = keyOf(location.name);
            connectionNames(location).forEach(name => {
                const to = keyOf(name);
                if (!to || !graph.has(to)) return;
                graph.get(from).add(to);
                graph.get(to).add(from);
            });
        });
        return graph;
    }

    function shortestPath(start, destination, locations) {
        const startKey = keyOf(start?.name);
        const targetKey = keyOf(destination?.name);
        if (!startKey || !targetKey) return [];
        if (startKey === targetKey) return [start];
        const graph = adjacency(locations);
        if (!graph.has(startKey) || !graph.has(targetKey)) return [];
        const queue = [[startKey]];
        const visited = new Set([startKey]);
        while (queue.length) {
            const path = queue.shift();
            const current = path[path.length - 1];
            for (const next of graph.get(current) || []) {
                if (visited.has(next)) continue;
                const candidate = [...path, next];
                if (next === targetKey) return candidate.map(key => locations.find(item => keyOf(item.name) === key)).filter(Boolean);
                visited.add(next);
                queue.push(candidate);
            }
        }
        return [];
    }

    function haversineKm(a, b) {
        const lat1 = number(a?.lat ?? a?.latitude);
        const lon1 = number(a?.long ?? a?.lng ?? a?.longitude);
        const lat2 = number(b?.lat ?? b?.latitude);
        const lon2 = number(b?.long ?? b?.lng ?? b?.longitude);
        if ([lat1, lon1, lat2, lon2].some(value => value == null)) return null;
        const rad = value => value * Math.PI / 180;
        const dLat = rad(lat2 - lat1);
        const dLon = rad(lon2 - lon1);
        const q = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
        return 6371 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
    }

    function explicitDistanceKm(a, b) {
        const direct = number(a?.distanceKm ?? a?.distance_km);
        if (direct != null && direct > 0) return direct;
        const reverse = number(b?.distanceKm ?? b?.distance_km);
        return reverse != null && reverse > 0 ? reverse : null;
    }

    function mapDistance(a, b) {
        const x1 = number(a?.x), y1 = number(a?.y), x2 = number(b?.x), y2 = number(b?.y);
        if ([x1, y1, x2, y2].some(value => value == null)) return null;
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    }

    function genreOf(state) {
        return root.CronacheTurnResolutionV7?.normalizedGenre?.(state) || keyOf(state?.currentStory?.genre) || 'fantasy';
    }

    function travelMode(action, state = getState()) {
        const text = keyOf(action);
        if (/cavall|destrier|horse/.test(text)) return { key: 'horse', label: 'a cavallo', speed: 8 };
        if (/carrozz|carro|diligenz|coach/.test(text)) return { key: 'carriage', label: 'in carrozza', speed: 6 };
        if (/treno|ferrovia|train/.test(text)) return { key: 'train', label: 'in treno', speed: 65 };
        if (/auto|macchina|automobile|car\b/.test(text)) return { key: 'car', label: 'in automobile', speed: 45 };
        if (/bici|biciclett/.test(text)) return { key: 'bicycle', label: 'in bicicletta', speed: 15 };
        if (/nave|barca|veliero|galea|navig/.test(text)) return { key: 'ship', label: 'via acqua', speed: 11 };
        if (/aereo|volo|elicotter/.test(text)) return { key: 'air', label: 'in volo', speed: 420 };
        if (/piedi|cammin|marci/.test(text)) return { key: 'walk', label: 'a piedi', speed: 4.5 };
        const genre = genreOf(state);
        if (['historical', 'fantasy', 'rural', 'pirate'].includes(genre)) return { key: 'ordinary', label: 'con i mezzi ordinari disponibili', speed: 4.5 };
        return { key: 'ordinary', label: 'con i mezzi ordinari disponibili', speed: 22 };
    }

    function edgeMinutes(a, b, mode) {
        const distanceKm = explicitDistanceKm(a, b) ?? haversineKm(a, b);
        if (distanceKm != null) return { minutes: Math.max(10, Math.round(distanceKm / Math.max(1, mode.speed) * 60 + 10)), distanceKm, basis: 'geographic' };
        const px = mapDistance(a, b);
        if (px != null) {
            const minutes = px < 55 ? 30 : px < 120 ? 90 : px < 220 ? 210 : px < 360 ? 420 : 720;
            return { minutes, distanceKm: null, basis: 'map-relative' };
        }
        const sameRegion = keyOf(a?.region) && keyOf(a?.region) === keyOf(b?.region);
        const micro = /quartier|palazz|piazz|botteg|locanda|porto|mercato|chiesa|ufficio|casa|sede|castello|villa/.test(keyOf(`${a?.type} ${b?.type} ${a?.name} ${b?.name}`));
        const minutes = micro && sameRegion ? 35 : sameRegion ? 120 : 420;
        return { minutes, distanceKm: null, basis: sameRegion ? 'regional-estimate' : 'world-estimate' };
    }

    function dangerScore(location) {
        const text = keyOf(`${location?.danger || ''} ${location?.status || ''} ${location?.description || ''}`);
        if (/assed|guerra|battaglia|mortale|estremo|epidem|brigant|pirat|blocco|invas/.test(text)) return 75;
        if (/pericol|risch|ostile|criminal|instabil|contes|sorvegliat/.test(text)) return 48;
        if (/sicuro|protett|stabile|pacifico/.test(text)) return 8;
        return 20;
    }

    function clockStamp(time) {
        if (!time || typeof time !== 'object') return 0;
        const year = Math.max(1, Math.round(number(time.year, 1)));
        const month = Math.max(1, Math.min(12, Math.round(number(time.month, 1))));
        const day = Math.max(1, Math.min(31, Math.round(number(time.day, 1))));
        const hour = Math.max(0, Math.min(23, Math.round(number(time.hour, 0))));
        const minute = Math.max(0, Math.min(59, Math.round(number(time.minute, 0))));
        return (((year * 12 + month) * 31 + day) * 24 + hour) * 60 + minute;
    }

    function planTravel(action, state = getState(), options = {}) {
        if (!state?.worldMemory || !isTravelAction(action, state)) return null;
        const locations = collectLocations(state);
        const destination = inferDestination(action, state);
        const start = findLocation(state.currentLocation, state) || { name: clean(state.currentLocation || 'Posizione attuale', 140), region: '' };
        if (!destination || keyOf(destination.name) === keyOf(start.name)) return null;
        let route = shortestPath(start, destination, locations);
        let confidence = 'connected';
        if (!route.length) {
            route = [start, destination];
            confidence = keyOf(start.region) && keyOf(start.region) === keyOf(destination.region) ? 'regional-estimate' : 'world-estimate';
        }
        const mode = travelMode(action, state);
        const legs = [];
        for (let index = 0; index < route.length - 1; index++) {
            const estimate = edgeMinutes(route[index], route[index + 1], mode);
            legs.push({ from: route[index].name, to: route[index + 1].name, ...estimate });
        }
        const baseMinutes = Math.max(10, legs.reduce((sum, leg) => sum + leg.minutes, 0));
        const risk = clamp(Math.round(route.slice(1).reduce((sum, item) => sum + dangerScore(item), 0) / Math.max(1, route.length - 1) + (confidence === 'world-estimate' ? 12 : 0)), 0, 100);
        const resolution = options.resolution || null;
        const plan = {
            schemaVersion: SCHEMA_VERSION,
            id: `travel-${hashText(`${state.worldMemory.turnCount}|${action}|${start.name}|${destination.name}`)}`,
            turn: Math.max(0, Math.round(number(state.worldMemory.turnCount, 0))),
            action: clean(action, 500),
            from: start.name,
            to: destination.name,
            route: route.map(item => item.name),
            legs,
            mode: mode.key,
            modeLabel: mode.label,
            estimatedMinutes: baseMinutes,
            risk,
            confidence,
            startClockStamp: clockStamp(state.time),
            resolutionOutcome: clean(resolution?.outcome, 60),
            requiresCheck: Boolean(resolution?.requiresCheck),
            status: 'planned'
        };
        ensureTravelState(state).pending = plan;
        return plan;
    }

    function formatDuration(minutes) {
        const total = Math.max(0, Math.round(number(minutes, 0)));
        const days = Math.floor(total / 1440);
        const hours = Math.floor((total % 1440) / 60);
        const mins = total % 60;
        const parts = [];
        if (days) parts.push(`${days} giorno${days === 1 ? '' : 'i'}`);
        if (hours) parts.push(`${hours} ora${hours === 1 ? '' : 'e'}`);
        if (mins && !days) parts.push(`${mins} min`);
        return parts.join(' e ') || 'pochi minuti';
    }

    function buildDirective(plan) {
        if (!plan) return '';
        const route = plan.route.length > 2 ? plan.route.join(' → ') : `${plan.from} → ${plan.to}`;
        return `🧭 VIAGGIO FISICO V8 — DATI AUTORITATIVI\n` +
            `- Partenza: ${plan.from}; destinazione: ${plan.to}; percorso: ${route}.\n` +
            `- Mezzo: ${plan.modeLabel}; durata stimata dal motore: ${formatDuration(plan.estimatedMinutes)}; rischio percorso ${plan.risk}/100; confidenza ${plan.confidence}.\n` +
            `- Non teletrasportare il protagonista, non cambiare destinazione e non inventare una distanza precisa se il motore la tratta come stima.\n` +
            `- NON emettere [TEMPO] o [LUOGO] per questo spostamento: il motore applica tempo e posizione dopo la risposta per evitare doppi conteggi.\n` +
            `- Se il tiro autoritativo V7 fallisce nettamente, il viaggio non raggiunge la destinazione; con fallimento costoso può arrivare in ritardo o con una complicazione coerente.\n` +
            `- Durante il tragitto mostra solo dettagli plausibili del percorso, senza creare automaticamente un nuovo grande evento se non richiesto dalla causalità.`;
    }

    function manualAdvanceClock(state, minutes) {
        if (!state?.time) return;
        let remaining = Math.max(0, Math.round(number(minutes, 0)));
        const daysInMonth = (month, year) => {
            if (month === 2) return year % 4 === 0 ? 29 : 28;
            return [4, 6, 9, 11].includes(month) ? 30 : 31;
        };
        state.time.minute = Math.max(0, Math.round(number(state.time.minute, 0))) + remaining;
        while (state.time.minute >= 60) { state.time.minute -= 60; state.time.hour = Math.round(number(state.time.hour, 0)) + 1; }
        while (state.time.hour >= 24) { state.time.hour -= 24; state.time.day = Math.max(1, Math.round(number(state.time.day, 1))) + 1; }
        while (state.time.day > daysInMonth(Math.max(1, Math.round(number(state.time.month, 1))), Math.max(1, Math.round(number(state.time.year, 1))))) {
            state.time.day -= daysInMonth(Math.max(1, Math.round(number(state.time.month, 1))), Math.max(1, Math.round(number(state.time.year, 1))));
            state.time.month = Math.max(1, Math.round(number(state.time.month, 1))) + 1;
            if (state.time.month > 12) { state.time.month = 1; state.time.year = Math.max(1, Math.round(number(state.time.year, 1))) + 1; }
        }
    }

    function advanceOnlyMissingTime(state, plan, targetMinutes) {
        const now = clockStamp(state?.time);
        const alreadyElapsed = plan.startClockStamp && now >= plan.startClockStamp ? now - plan.startClockStamp : 0;
        const remaining = Math.max(0, Math.round(targetMinutes - alreadyElapsed));
        if (!remaining) return 0;
        if (typeof root.advanceTime === 'function') {
            try { root.advanceTime(remaining, { source: 'travel-v8' }); return remaining; } catch (_error) { }
        }
        manualAdvanceClock(state, remaining);
        return remaining;
    }

    function commitTravel(action, state = getState()) {
        if (!state?.worldMemory) return null;
        const registry = ensureTravelState(state);
        const plan = registry.pending;
        if (!plan || keyOf(plan.action) !== keyOf(action)) return null;
        const outcome = keyOf(plan.resolutionOutcome || 'automatic');
        const blocked = /hard-failure|critical-failure/.test(outcome);
        const costly = outcome === 'costly-failure';
        const travelMinutes = blocked ? Math.max(10, Math.round(plan.estimatedMinutes * 0.3))
            : costly ? Math.round(plan.estimatedMinutes * 1.35) : plan.estimatedMinutes;
        advanceOnlyMissingTime(state, plan, travelMinutes);
        if (!blocked) {
            if (typeof root.setLocation === 'function') {
                try { root.setLocation(plan.to); } catch (_error) { state.currentLocation = plan.to; }
            } else state.currentLocation = plan.to;
            state.worldMemory.currentLocation = plan.to;
        }
        const committed = {
            ...plan,
            status: blocked ? 'interrupted' : 'completed',
            arrived: !blocked,
            actualMinutes: travelMinutes,
            consequence: blocked ? 'Il viaggio non raggiunge la destinazione.' : costly ? 'Arrivo con ritardo o complicazione.' : 'Arrivo completato.'
        };
        registry.history.push(committed);
        registry.history = registry.history.slice(-MAX_HISTORY);
        registry.pending = null;
        const edgeKey = keyOf(`${plan.from}|${plan.to}`);
        registry.edges[edgeKey] = {
            from: plan.from, to: plan.to, lastMinutes: travelMinutes, mode: plan.mode,
            confidence: plan.confidence, traversals: Math.max(0, number(registry.edges[edgeKey]?.traversals, 0)) + 1,
            lastTurn: plan.turn
        };
        return committed;
    }

    function stateFromContext(context) {
        const live = getState();
        if (live?.worldMemory === context?.memory) return live;
        if (!context?.memory) return live;
        return {
            ...(live || {}),
            character: context.character || live?.character,
            currentStory: context.story || live?.currentStory,
            time: context.time || live?.time,
            currentLocation: context.currentLocation || live?.currentLocation,
            worldMemory: context.memory
        };
    }

    function installDirectorWrapper() {
        const Director = root.CronacheDirector?.GameDirector;
        if (!Director?.prototype) return false;
        let patched = false;
        const originalPlan = Director.prototype.planTurn;
        if (typeof originalPlan === 'function' && !originalPlan.__phase8TravelWrapped) {
            const wrappedPlan = function phase8TravelPlan(action, context) {
                const plan = originalPlan.apply(this, arguments);
                const state = stateFromContext(context || {});
                const travel = planTravel(action, state, { resolution: plan?.resolution });
                if (!travel) return plan;
                return { ...plan, travel, prompt: `${plan?.prompt || ''}\n\n${buildDirective(travel)}` };
            };
            wrappedPlan.__phase8TravelWrapped = true;
            wrappedPlan.__phase8TravelOriginal = originalPlan;
            Director.prototype.planTurn = wrappedPlan;
            patched = true;
        }
        const originalCommit = Director.prototype.commitTurn;
        if (typeof originalCommit === 'function' && !originalCommit.__phase8TravelWrapped) {
            const wrappedCommit = function phase8TravelCommit(action, response, memory, context) {
                const result = originalCommit.apply(this, arguments);
                const live = getState();
                const state = live?.worldMemory === memory ? live : { ...(live || {}), worldMemory: memory, time: context?.time || live?.time };
                try { commitTravel(action, state); } catch (error) { console.warn('[WorldTravelV8] commit ignorato:', error); }
                return result;
            };
            wrappedCommit.__phase8TravelWrapped = true;
            wrappedCommit.__phase8TravelOriginal = originalCommit;
            Director.prototype.commitTurn = wrappedCommit;
            patched = true;
        }
        return patched;
    }

    function install() {
        if (root.__cronacheWorldTravelV8Patch >= PATCH_VERSION) return true;
        root.__cronacheWorldTravelV8Patch = PATCH_VERSION;
        installDirectorWrapper();
        if (typeof root.setTimeout === 'function') {
            root.setTimeout(installDirectorWrapper, 0);
            root.setTimeout(installDirectorWrapper, 900);
        }
        return true;
    }

    const api = {
        SCHEMA_VERSION, PATCH_VERSION,
        ensureTravelState, collectLocations, findLocation, inferDestination, isTravelAction,
        shortestPath, travelMode, edgeMinutes, planTravel, buildDirective, commitTravel,
        formatDuration, clockStamp, install
    };

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
        else install();
    }
    return api;
});
