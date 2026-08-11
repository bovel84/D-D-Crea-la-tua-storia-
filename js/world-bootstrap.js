(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheWorldBootstrap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const WORLD_SCHEMA_VERSION = 2;
    const LIMITS = { locations: 20, actors: 30, factions: 16, relations: 60, forces: 20 };
    const READY_MINIMUM = { locations: 3, actors: 4, factions: 2, relations: 2, forces: 1 };

    function asArray(value) { return Array.isArray(value) ? value : []; }

    function cleanText(value, maxLength = 320) {
        return String(value == null ? '' : value)
            .replace(/[\[\]]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, maxLength);
    }

    function keyOf(value) {
        return cleanText(value, 500)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9\s_-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isSamePersonName(left, right) {
        const leftKey = keyOf(left);
        const rightKey = keyOf(right);
        if (!leftKey || !rightKey) return false;
        if (leftKey === rightKey) return true;
        if (/^(protagonista|giocatore|player)$/.test(leftKey) || /^(protagonista|giocatore|player)$/.test(rightKey)) return false;
        const leftTokens = leftKey.split(/\s+/).filter(Boolean);
        const rightTokens = rightKey.split(/\s+/).filter(Boolean);
        if (leftTokens.length !== 1 && rightTokens.length !== 1) return false;
        const short = leftTokens.length === 1 ? leftTokens[0] : rightTokens[0];
        const long = leftTokens.length === 1 ? rightTokens : leftTokens;
        return short.length >= 3 && long.includes(short);
    }

    function hashText(value) {
        let hash = 2166136261;
        const text = String(value || '');
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function numberBetween(value, min = 0, max = 100, fallback = 0) {
        const parsed = Number(String(value == null ? '' : value).replace(',', '.'));
        return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
    }

    function normalizeStatus(value) {
        const key = keyOf(value);
        if (/dead|morto|destroyed|distrutt|removed|eliminat/.test(key)) return 'dead';
        if (/resolved|risolt|closed|chius|completed|completat/.test(key)) return 'resolved';
        if (/dormant|dormiente|inactive|inattiv/.test(key)) return 'dormant';
        return 'active';
    }

    function splitList(value, limit = 8) {
        const seen = new Set();
        return cleanText(value, 500).split(/[,;]/).map(item => cleanText(item, 100)).filter(item => {
            const key = keyOf(item);
            if (!key || seen.has(key) || /^(nessuno|nessuna|none)$/.test(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, limit);
    }

    function normalizeHistoricalContext(source, context = {}) {
        const input = source && typeof source === 'object' ? source : {};
        const story = context.story || {};
        return {
            date: cleanText(input.date || input.era || context.date, 120),
            region: cleanText(input.region || context.setting || story.setting, 160),
            politicalSystem: cleanText(input.politicalSystem || input.institutions, 320),
            baseline: cleanText(input.baseline || input.historicalBaseline, 600),
            activeTensions: cleanText(input.activeTensions || input.conflict, 500),
            constraints: cleanText(input.constraints || input.historicalConstraints, 500),
            divergencePolicy: cleanText(input.divergencePolicy || 'La storia può divergere soltanto come conseguenza esplicita degli eventi di gioco.', 320)
        };
    }

    function createDefaultWorld(context = {}) {
        const story = context.story || {};
        const name = cleanText(context.name || story.title || story.setting || 'Mondo della campagna', 120);
        const setting = cleanText(context.setting || story.setting, 160);
        const premise = cleanText(context.premise || story.desc, 600);
        const turn = Math.max(0, Number(context.turn) || 0);
        return {
            worldSchemaVersion: WORLD_SCHEMA_VERSION,
            id: `world-${hashText(`${name}|${setting}`)}`,
            name,
            setting,
            premise,
            centralConflict: '',
            stakes: '',
            historicalContext: normalizeHistoricalContext({}, context),
            status: 'pending',
            initialized: false,
            provisional: false,
            createdAtTurn: turn,
            updatedAtTurn: turn,
            locations: [],
            actors: [],
            factions: [],
            relations: [],
            forces: []
        };
    }

    function normalizeLocation(source, context = {}) {
        const input = source && typeof source === 'object' ? source : {};
        const name = cleanText(input.name, 120);
        if (!name) return null;
        return {
            id: cleanText(input.id, 140) || `world-location-${hashText(name)}`,
            name,
            type: cleanText(input.type || 'luogo', 60),
            region: cleanText(input.region || context.setting, 120),
            description: cleanText(input.description, 420),
            controller: cleanText(input.controller, 120),
            resource: cleanText(input.resource, 160),
            danger: cleanText(input.danger, 180),
            connections: splitList(input.connections, 8),
            status: normalizeStatus(input.status),
            createdAtTurn: Math.max(0, Number(input.createdAtTurn ?? context.turn) || 0),
            source: cleanText(input.source || context.source || 'world-bootstrap', 40)
        };
    }

    function normalizeActor(source, context = {}) {
        const input = source && typeof source === 'object' ? source : {};
        const name = cleanText(input.name, 120);
        if (!name) return null;
        return {
            id: cleanText(input.id, 140) || `world-actor-${hashText(name)}`,
            kind: 'npc',
            name,
            role: cleanText(input.role, 120),
            faction: cleanText(input.faction, 120),
            description: cleanText(input.description, 420),
            personality: cleanText(input.personality, 240),
            goal: cleanText(input.goal || input.goals, 300),
            strategy: cleanText(input.strategy, 260),
            resources: cleanText(input.resources, 240),
            publicGoal: cleanText(input.publicGoal || input.goal || input.goals, 300),
            privateGoal: cleanText(input.privateGoal, 300),
            leverage: cleanText(input.leverage || input.resources, 260),
            constraints: cleanText(input.constraints, 260),
            knowledge: cleanText(input.knowledge, 320),
            agenda: cleanText(input.agenda || input.strategy, 260),
            historicalRole: cleanText(input.historicalRole, 220),
            influence: numberBetween(input.influence, 0, 100, 45),
            relationship: cleanText(input.relationship || 'neutrale', 100),
            status: normalizeStatus(input.status),
            location: cleanText(input.location, 120),
            lastMove: cleanText(input.lastMove, 320),
            lastMoveTurn: Math.max(0, Number(input.lastMoveTurn) || 0),
            lastInteractionTurn: Math.max(0, Number(input.lastInteractionTurn) || 0),
            createdAtTurn: Math.max(0, Number(input.createdAtTurn ?? context.turn) || 0),
            source: cleanText(input.source || context.source || 'world-bootstrap', 40)
        };
    }

    function normalizeFaction(source, context = {}) {
        const input = source && typeof source === 'object' ? source : {};
        const name = cleanText(input.name, 120);
        if (!name) return null;
        return {
            id: cleanText(input.id, 140) || `world-faction-${hashText(name)}`,
            kind: 'faction',
            name,
            type: cleanText(input.type || 'gruppo', 80),
            leader: cleanText(input.leader, 120),
            description: cleanText(input.description, 420),
            goal: cleanText(input.goal || input.goals, 300),
            strategy: cleanText(input.strategy, 260),
            resources: cleanText(input.resources, 240),
            ideology: cleanText(input.ideology, 220),
            legitimacy: numberBetween(input.legitimacy, 0, 100, 50),
            leverage: cleanText(input.leverage || input.resources, 260),
            constraints: cleanText(input.constraints, 260),
            influence: numberBetween(input.influence, 0, 100, 50),
            relationship: cleanText(input.relationship || 'neutrale', 100),
            status: normalizeStatus(input.status),
            base: cleanText(input.base || input.location, 120),
            lastMove: cleanText(input.lastMove, 320),
            lastMoveTurn: Math.max(0, Number(input.lastMoveTurn) || 0),
            createdAtTurn: Math.max(0, Number(input.createdAtTurn ?? context.turn) || 0),
            source: cleanText(input.source || context.source || 'world-bootstrap', 40)
        };
    }

    function normalizeRelation(source, context = {}) {
        const input = source && typeof source === 'object' ? source : {};
        const from = cleanText(input.from || input.sourceName, 120);
        const to = cleanText(input.to || input.target, 120);
        if (!from || !to || keyOf(from) === keyOf(to)) return null;
        return {
            id: cleanText(input.id, 160) || `world-relation-${hashText(`${from}|${to}`)}`,
            from,
            to,
            type: cleanText(input.type || 'neutrale', 80),
            trust: numberBetween(input.trust, 0, 100, 50),
            tension: numberBetween(input.tension, 0, 100, 30),
            description: cleanText(input.description, 320),
            status: normalizeStatus(input.status),
            updatedAtTurn: Math.max(0, Number(input.updatedAtTurn ?? context.turn) || 0),
            source: cleanText(input.source || context.source || 'world-bootstrap', 40)
        };
    }

    function normalizeForce(source, context = {}) {
        const input = source && typeof source === 'object' ? source : {};
        const name = cleanText(input.name, 120);
        if (!name) return null;
        return {
            id: cleanText(input.id, 140) || `world-force-${hashText(name)}`,
            name,
            actor: cleanText(input.actor, 120),
            objective: cleanText(input.objective || input.description, 320),
            cause: cleanText(input.cause, 320),
            opposition: splitList(input.opposition, 8),
            consequenceAt100: cleanText(input.consequenceAt100 || input.outcome, 320),
            progress: numberBetween(input.progress, 0, 100, 10),
            urgency: numberBetween(input.urgency, 0, 100, 50),
            status: normalizeStatus(input.status),
            updatedAtTurn: Math.max(0, Number(input.updatedAtTurn ?? context.turn) || 0),
            source: cleanText(input.source || context.source || 'world-bootstrap', 40)
        };
    }

    function isProvisionalSource(value) {
        return /deterministic-fallback|timeline-recovery/.test(keyOf(value));
    }

    function isGenericForceName(value) {
        const key = keyOf(value);
        return /^(equilibrio in cambiamento|prossimo sviluppo del mondo)$/.test(key) ||
            /(?:storico|historical)\s*\/\s*(?:business|economia)/.test(key);
    }

    function isConcreteEntity(item, kind = 'actor') {
        if (!item || isProvisionalSource(item.source)) return false;
        if (kind === 'force') return !isGenericForceName(item.name);
        return !isGenericActorName(item.name);
    }

    function mergeByName(current, incoming, normalize, limit, context) {
        const result = asArray(current).map(item => normalize(item, context)).filter(Boolean);
        asArray(incoming).forEach(raw => {
            const item = normalize(raw, context);
            if (!item) return;
            const existing = result.find(entry => keyOf(entry.name || `${entry.from}|${entry.to}`) === keyOf(item.name || `${item.from}|${item.to}`));
            if (existing) {
                Object.entries(item).forEach(([key, value]) => {
                    if (value !== '' && value != null && (!Array.isArray(value) || value.length)) existing[key] = value;
                });
            } else result.push(item);
        });
        return result.slice(-limit);
    }

    function migrateWorld(source, context = {}) {
        const defaults = createDefaultWorld(context);
        const input = source && typeof source === 'object' ? source : {};
        const world = {
            ...defaults,
            ...input,
            worldSchemaVersion: WORLD_SCHEMA_VERSION,
            name: cleanText(input.name || defaults.name, 120),
            setting: cleanText(input.setting || defaults.setting, 160),
            premise: cleanText(input.premise || defaults.premise, 600),
            centralConflict: cleanText(input.centralConflict, 420),
            stakes: cleanText(input.stakes, 320),
            historicalContext: normalizeHistoricalContext(input.historicalContext, {
                ...context,
                setting: input.setting || defaults.setting
            }),
            locations: mergeByName([], input.locations, normalizeLocation, LIMITS.locations, context),
            actors: mergeByName([], input.actors, normalizeActor, LIMITS.actors, context)
                .filter(item => isConcreteEntity(item, 'actor')),
            factions: mergeByName([], input.factions, normalizeFaction, LIMITS.factions, context)
                .filter(item => isConcreteEntity(item, 'faction')),
            relations: mergeByName([], input.relations, normalizeRelation, LIMITS.relations, context),
            forces: mergeByName([], input.forces, normalizeForce, LIMITS.forces, context)
                .filter(item => isConcreteEntity(item, 'force'))
        };
        world.initialized = isWorldReady(world);
        world.status = world.initialized ? (world.provisional ? 'provisional' : 'ready')
            : (world.locations.length || world.actors.length || world.factions.length ? 'partial' : 'pending');
        world.createdAtTurn = Math.max(0, Number(input.createdAtTurn ?? context.turn) || 0);
        world.updatedAtTurn = Math.max(world.createdAtTurn, Number(input.updatedAtTurn ?? context.turn) || 0);
        return world;
    }

    function isWorldReady(world) {
        return Object.entries(READY_MINIMUM).every(([field, minimum]) => asArray(world?.[field]).length >= minimum);
    }

    function bodies(response, tag) {
        const found = [];
        const regex = new RegExp(`\\[${tag}:\\s*([^\\]]+)\\]`, 'gi');
        let match;
        while ((match = regex.exec(String(response || ''))) !== null) found.push(match[1]);
        return found;
    }

    function fields(body) { return String(body || '').split('|').map(value => cleanText(value, 700)); }

    function parseBootstrapTags(response, context = {}) {
        const setup = bodies(response, 'MONDO_SETUP').map(fields).map(parts => ({
            name: parts[0], premise: parts[1], centralConflict: parts[2], stakes: parts[3]
        })).filter(item => item.name)[0] || null;
        const historicalContext = bodies(response, 'CONTESTO_STORICO_SETUP').map(fields).map(parts => normalizeHistoricalContext({
            date: parts[0], region: parts[1], politicalSystem: parts[2], baseline: parts[3],
            activeTensions: parts[4], constraints: parts[5], divergencePolicy: parts[6]
        }, context)).find(item => item.date || item.baseline || item.politicalSystem) || null;
        const locations = bodies(response, 'LUOGO_SETUP').map(fields).map(parts => ({
            name: parts[0], type: parts[1], region: parts[2], description: parts[3], controller: parts[4],
            resource: parts[5], danger: parts[6], connections: parts[7]
        })).map(item => normalizeLocation(item, context)).filter(Boolean);
        const actors = bodies(response, 'PERSONAGGIO_SETUP').map(fields).map(parts => ({
            name: parts[0], role: parts[1], faction: parts[2], description: parts[3], personality: parts[4],
            goal: parts[5], strategy: parts[6], resources: parts[7], influence: parts[8], relationship: parts[9],
            status: parts[10], location: parts[11], publicGoal: parts[12], privateGoal: parts[13],
            leverage: parts[14], constraints: parts[15], knowledge: parts[16], agenda: parts[17], historicalRole: parts[18]
        })).map(item => normalizeActor(item, context)).filter(Boolean);
        const factions = bodies(response, 'FAZIONE_SETUP').map(fields).map(parts => ({
            name: parts[0], type: parts[1], leader: parts[2], description: parts[3], goal: parts[4],
            strategy: parts[5], resources: parts[6], influence: parts[7], relationship: parts[8],
            status: parts[9], base: parts[10], ideology: parts[11], legitimacy: parts[12],
            leverage: parts[13], constraints: parts[14]
        })).map(item => normalizeFaction(item, context)).filter(Boolean);
        const relations = bodies(response, 'RELAZIONE_SETUP').map(fields).map(parts => ({
            from: parts[0], to: parts[1], type: parts[2], trust: parts[3], tension: parts[4], description: parts[5]
        })).map(item => normalizeRelation(item, context)).filter(Boolean);
        const forces = bodies(response, 'FORZA_SETUP').map(fields).map(parts => ({
            name: parts[0], actor: parts[1], objective: parts[2], progress: parts[3], urgency: parts[4], status: parts[5],
            cause: parts[6], opposition: parts[7], consequenceAt100: parts[8]
        })).map(item => normalizeForce(item, context)).filter(Boolean);
        return { setup, historicalContext, locations, actors, factions, relations, forces };
    }

    function fallbackNames(context = {}) {
        const story = context.story || {};
        const place = cleanText(context.setting || story.setting || story.title || 'questo mondo', 80);
        return {
            place,
            locations: [place, `Centro di ${place}`, `Margini di ${place}`],
            factions: [`Autorità di ${place}`, `Opposizione di ${place}`],
            actors: [`Custode di ${place}`, `Voce dell'Opposizione`, `Guida locale`, `Mediatore indipendente`]
        };
    }

    function ensureMinimumWorld(worldValue, context = {}) {
        const world = migrateWorld(worldValue, context);
        if (isWorldReady(world)) return world;
        world.provisional = true;
        world.centralConflict = world.centralConflict || cleanText(context.story?.desc || 'Forze contrapposte cercano di cambiare l’equilibrio del mondo.', 420);
        world.stakes = world.stakes || 'Il destino della comunità e la libertà d’azione del protagonista.';
        const currentLocation = cleanText(context.location, 120);
        if (currentLocation && !/sconosciut|unknown/i.test(currentLocation)) {
            world.locations = mergeByName(world.locations, [{
                name: currentLocation,
                type: 'luogo corrente',
                region: cleanText(context.setting || context.story?.setting, 120),
                description: 'Luogo già confermato dalla campagna.',
                source: 'memory-recovery'
            }], normalizeLocation, LIMITS.locations, context);
        }
        world.initialized = isWorldReady(world);
        world.status = world.initialized ? 'ready' : (world.locations.length || world.actors.length || world.factions.length ? 'partial' : 'pending');
        world.updatedAtTurn = Math.max(world.updatedAtTurn, Number(context.turn) || 0);
        return world;
    }

    function ingestResponse(response, currentWorld, context = {}) {
        const before = migrateWorld(currentWorld, context);
        const parsed = parseBootstrapTags(response, context);
        const next = migrateWorld(before, context);
        const replacesProvisional = Boolean(parsed.setup && parsed.historicalContext &&
            parsed.locations.length >= READY_MINIMUM.locations &&
            parsed.actors.length >= READY_MINIMUM.actors &&
            parsed.factions.length >= READY_MINIMUM.factions);
        if (replacesProvisional) {
            const keepSpecific = item => !/deterministic-fallback|timeline-recovery/.test(keyOf(item?.source));
            next.locations = next.locations.filter(keepSpecific);
            next.actors = next.actors.filter(keepSpecific);
            next.factions = next.factions.filter(keepSpecific);
            next.relations = next.relations.filter(keepSpecific);
            next.forces = next.forces.filter(keepSpecific);
        }
        if (parsed.setup) {
            next.name = cleanText(parsed.setup.name || next.name, 120);
            next.premise = cleanText(parsed.setup.premise || next.premise, 600);
            next.centralConflict = cleanText(parsed.setup.centralConflict || next.centralConflict, 420);
            next.stakes = cleanText(parsed.setup.stakes || next.stakes, 320);
            next.provisional = false;
        }
        if (parsed.historicalContext) next.historicalContext = parsed.historicalContext;
        next.locations = mergeByName(next.locations, parsed.locations, normalizeLocation, LIMITS.locations, context);
        next.actors = mergeByName(next.actors, parsed.actors, normalizeActor, LIMITS.actors, context);
        if (context.protagonistName) {
            next.actors = next.actors.filter(actor => !isSamePersonName(actor.name, context.protagonistName));
        }
        next.factions = mergeByName(next.factions, parsed.factions, normalizeFaction, LIMITS.factions, context);
        next.relations = mergeByName(next.relations, parsed.relations, normalizeRelation, LIMITS.relations, context);
        next.forces = mergeByName(next.forces, parsed.forces, normalizeForce, LIMITS.forces, context);
        let world = migrateWorld(next, context);
        if (context.ensureMinimum) world = ensureMinimumWorld(world, context);
        world.initialized = isWorldReady(world);
        world.status = world.initialized ? (world.provisional ? 'provisional' : 'ready') : 'partial';
        world.updatedAtTurn = Math.max(world.updatedAtTurn, Number(context.turn) || 0);
        const parsedCount = parsed.locations.length + parsed.actors.length + parsed.factions.length + parsed.relations.length + parsed.forces.length + (parsed.setup ? 1 : 0) + (parsed.historicalContext ? 1 : 0);
        return {
            world,
            parsed,
            parsedCount,
            changed: JSON.stringify(before) !== JSON.stringify(world),
            usedFallback: world.provisional && context.ensureMinimum === true
        };
    }

    function upsertMemory(list, name, data) {
        const target = asArray(list);
        const existing = target.find(item => keyOf(item?.name || item?.title) === keyOf(name));
        if (existing) Object.assign(existing, data);
        else target.push(data);
        return target;
    }

    function projectToMemory(worldValue, memory, context = {}) {
        const world = migrateWorld(worldValue, context);
        const state = memory && typeof memory === 'object' ? memory : {};
        const protagonistName = cleanText(context.protagonistName, 100);
        if (protagonistName) world.actors = world.actors.filter(actor => !isSamePersonName(actor.name, protagonistName));
        state.world = world;
        state.locations = asArray(state.locations);
        state.npcs = asArray(state.npcs).filter(actor => !protagonistName || !isSamePersonName(actor?.name, protagonistName));
        state.factions = asArray(state.factions);
        state.narrativeGoals = asArray(state.narrativeGoals);
        world.locations.forEach(location => {
            state.locations = upsertMemory(state.locations, location.name, {
                id: location.id, name: location.name, description: location.description,
                type: location.type, region: location.region, controller: location.controller,
                resource: location.resource, danger: location.danger, connections: location.connections,
                discovered: Number(context.turn) || 0, source: location.source
            });
        });
        world.actors.filter(actor => isConcreteEntity(actor, 'actor')).forEach(actor => {
            state.npcs = upsertMemory(state.npcs, actor.name, {
                id: actor.id, name: actor.name, description: actor.description || actor.role,
                relationship: actor.relationship, personality: actor.personality, goals: actor.goal,
                status: actor.status, location: actor.location, faction: actor.faction,
                role: actor.role, strategy: actor.strategy, resources: actor.resources,
                publicGoal: actor.publicGoal, privateGoal: actor.privateGoal,
                leverage: actor.leverage, constraints: actor.constraints,
                knowledge: actor.knowledge, agenda: actor.agenda, historicalRole: actor.historicalRole,
                influence: actor.influence, lastMove: actor.lastMove,
                source: actor.source,
                lastMoveTurn: actor.lastMoveTurn, lastInteractionTurn: actor.lastInteractionTurn,
                worldSeed: true,
                level: Math.max(1, Math.ceil(actor.influence / 10)),
                threat: actor.influence >= 80 ? 'boss' : actor.influence >= 60 ? 'high' : actor.influence >= 40 ? 'medium' : 'low',
                interactions: asArray(state.npcs.find(item => keyOf(item?.name) === keyOf(actor.name))?.interactions),
                interactionCount: Number(state.npcs.find(item => keyOf(item?.name) === keyOf(actor.name))?.interactionCount) || 0,
                metAt: Number(context.turn) || 0, lastSeen: Number(context.turn) || 0
            });
        });
        world.factions.filter(faction => isConcreteEntity(faction, 'faction')).forEach(faction => {
            state.factions = upsertMemory(state.factions, faction.name, {
                id: faction.id, name: faction.name, description: faction.description,
                relationship: faction.relationship, goal: faction.goal, strategy: faction.strategy,
                resources: faction.resources, influence: faction.influence, leader: faction.leader,
                ideology: faction.ideology, legitimacy: faction.legitimacy,
                leverage: faction.leverage, constraints: faction.constraints,
                type: faction.type, status: faction.status, location: faction.base,
                lastMove: faction.lastMove, lastMoveTurn: faction.lastMoveTurn, worldSeed: true,
                source: faction.source
            });
        });
        world.forces.filter(force => isConcreteEntity(force, 'force')).forEach(force => {
            state.narrativeGoals = upsertMemory(state.narrativeGoals, force.name, {
                id: force.id, name: force.name, description: force.objective, status: force.status,
                progress: `${Math.round(force.progress)}%`, urgency: force.urgency,
                actor: force.actor, worldSeed: true, source: force.source, createdAtTurn: Number(context.turn) || 0
            });
        });
        return state;
    }

    function pruneProvisionalMemory(memory) {
        const state = memory && typeof memory === 'object' ? memory : {};
        state.npcs = asArray(state.npcs).filter(item => isConcreteEntity(item, 'actor'));
        state.factions = asArray(state.factions).filter(item => isConcreteEntity(item, 'faction'));
        state.narrativeGoals = asArray(state.narrativeGoals).filter(item =>
            !isProvisionalSource(item?.source) && !isGenericForceName(item?.name || item?.title)
        );
        return state;
    }

    function syncFromMemory(worldValue, memory, context = {}) {
        const world = migrateWorld(worldValue, context);
        world.locations = mergeByName(world.locations, asArray(memory?.locations).map(item => ({ ...item, source: item.source || 'memory' })), normalizeLocation, LIMITS.locations, context);
        world.actors = mergeByName(world.actors, asArray(memory?.npcs).filter(item => isConcreteEntity(item, 'actor')).map(item => ({
            ...item, goal: item.goals || item.goal, influence: item.influence || Math.min(100, Math.max(10, Number(item.level || 1) * 10)),
            source: item.source || 'memory'
        })), normalizeActor, LIMITS.actors, context);
        world.factions = mergeByName(world.factions, asArray(memory?.factions).filter(item => isConcreteEntity(item, 'faction')), normalizeFaction, LIMITS.factions, context);
        world.forces = mergeByName(world.forces, asArray(memory?.narrativeGoals).filter(item =>
            !isProvisionalSource(item?.source) && !isGenericForceName(item?.name || item?.title)
        ).map(item => ({
            name: item.name || item.title, actor: item.actor, objective: item.description,
            progress: parseFloat(item.progress) || 0, urgency: item.urgency || 50, status: item.status,
            source: item.source || 'memory'
        })), normalizeForce, LIMITS.forces, context);
        world.initialized = isWorldReady(world);
        world.status = world.initialized ? (world.provisional ? 'provisional' : 'ready')
            : (world.actors.length || world.factions.length || world.locations.length ? 'partial' : 'pending');
        return world;
    }

    function relationPressure(world, name) {
        return asArray(world?.relations).filter(relation =>
            keyOf(relation.from) === keyOf(name) || keyOf(relation.to) === keyOf(name)
        ).reduce((max, relation) => Math.max(max, Number(relation.tension) || 0), 0);
    }

    function selectInfluences(worldValue, context = {}) {
        const world = migrateWorld(worldValue, context);
        const turn = Math.max(0, Number(context.turn) || 0);
        const location = keyOf(context.location);
        const limit = Math.max(1, Math.min(8, Number(context.limit) || 4));
        return [...world.actors, ...world.factions].filter(item => item.status === 'active').map(item => {
            const itemLocation = keyOf(item.location || item.base);
            const localBonus = location && itemLocation && (location === itemLocation || location.includes(itemLocation) || itemLocation.includes(location)) ? 70 : 0;
            const dueBonus = Math.min(30, Math.max(0, turn - (Number(item.lastMoveTurn) || 0)) * 4);
            const tensionBonus = relationPressure(world, item.name) / 5;
            return { ...item, score: Number(item.influence || 0) + localBonus + dueBonus + tensionBonus };
        }).sort((a, b) => b.score - a.score || keyOf(a.name).localeCompare(keyOf(b.name))).slice(0, limit);
    }

    function compactActor(item) {
        const place = item.location || item.base;
        return `- ${item.name} (${item.kind}, influenza ${Math.round(item.influence || 0)}/100)` +
            `${item.role || item.type ? ` — ${item.role || item.type}` : ''}` +
            `${item.goal ? `; vuole: ${item.goal}` : ''}` +
            `${item.privateGoal ? `; obiettivo privato: ${item.privateGoal}` : ''}` +
            `${item.strategy ? `; agirà tramite: ${item.strategy}` : ''}` +
            `${item.leverage || item.resources ? `; leva: ${item.leverage || item.resources}` : ''}` +
            `${item.constraints ? `; vincoli: ${item.constraints}` : ''}` +
            `${place ? `; base: ${place}` : ''}` +
            `${item.lastMove ? `; ultima mossa: ${item.lastMove}` : ''}`;
    }

    function isGenericActorName(value) {
        const key = keyOf(value);
        return /^(?:(?:il|la|lo|i|gli|le) )?(autorita|opposizione|comunita|custode|voce dell opposizione|guida locale|mediatore indipendente)(\b| di )/.test(key);
    }

    function needsHistoricalRepair(worldValue, context = {}) {
        const world = migrateWorld(worldValue, context);
        const history = world.historicalContext || {};
        const genericCount = [...world.actors, ...world.factions].filter(item =>
            isGenericActorName(item.name) || /deterministic-fallback|timeline-recovery/.test(keyOf(item.source))
        ).length;
        const namedCount = [...world.actors, ...world.factions].length - genericCount;
        return world.provisional || !cleanText(history.baseline, 40) ||
            !cleanText(history.politicalSystem, 30) || namedCount < 4;
    }

    function buildBootstrapPrompt(context = {}) {
        const story = context.story || {};
        const currentDate = cleanText(context.currentDate || context.date, 120) || 'l’inizio della campagna';
        const continuity = cleanText(context.continuityPrompt, 14000);
        const protagonistName = cleanText(context.protagonistName, 100);
        return `🌍 **CREAZIONE STORICO-POLITICA OBBLIGATORIA DEL MONDO**
Costruisci subito un mondo persistente coerente con «${cleanText(story.title, 120) || 'la storia'}», con ${cleanText(story.setting, 160) || 'l’ambientazione scelta'} e con la data ${currentDate}.
${continuity ? `\nCANONE GIÀ REGISTRATO DA CONSERVARE:\n${continuity}\n` : ''}
- La data del CONTESTO_STORICO_SETUP deve contenere un anno di calendario esatto e coerente con premessa, figure storiche e tecnologie; non usare l'anno reale corrente come riempitivo.
${protagonistName ? `- Il protagonista controllato dal giocatore è «${protagonistName}»: NON crearlo come PERSONAGGIO_SETUP, neppure con cognome, titolo, abbreviazione o variante. Non scrivere mai le sue battute.\n` : ''}
- Crea esattamente 1 MONDO_SETUP, 1 CONTESTO_STORICO_SETUP, almeno 4 LUOGO_SETUP, 6 PERSONAGGIO_SETUP, 3 FAZIONE_SETUP, 6 RELAZIONE_SETUP e 3 FORZA_SETUP.
- Il canone persistente, gli eventi già registrati e i nomi già usati hanno precedenza su etichette generiche della scheda. Se la data dell'interfaccia contraddice ripetutamente il canone narrativo, segnala il conflitto nel CONTESTO_STORICO_SETUP e conserva l'epoca della storia: non fondere epoche diverse.
- Se l'ambientazione è storica o contemporanea, usa persone, cariche, istituzioni, confini, crisi e rapporti di forza plausibili per luogo e data. Non spostare figure tra epoche e non presentare invenzioni come fatti storici certi. Se la campagna è alternativa, definisci il punto di divergenza.
- Vietati segnaposto come «Autorità», «Opposizione», «Guida locale» e «Mediatore indipendente»: assegna nomi propri, cariche esatte e appartenenze riconoscibili.
- Ogni personaggio deve avere obiettivo pubblico e privato, leva concreta, limiti, conoscenze parziali e un'agenda. Ogni fazione deve avere ideologia, legittimità, leve e vincoli.
- Ogni forza storica deve avere una causa, avversari identificati e una conseguenza concreta al 100% di progresso.
- Crea alleati potenziali, rivali e parti neutrali; non renderli tutti dipendenti dal protagonista.
- Le relazioni devono contenere cooperazione, conflitto e tensioni capaci di evolvere nella timeline.
- Non usare il carattere | o ] dentro i valori. Non citare i tag nella prosa.
[MONDO_SETUP: nome_mondo|premessa|conflitto_centrale|posta_in_gioco]
[CONTESTO_STORICO_SETUP: data_o_epoca|regione|istituzioni_e_assetto_politico|situazione_storica_di_partenza|tensioni_attive|vincoli_storici|regola_di_divergenza]
[LUOGO_SETUP: nome|tipo|regione|descrizione|controllore|risorsa|pericolo|collegamenti_separati_da_virgola]
[PERSONAGGIO_SETUP: nome|carica_o_ruolo|fazione_o_vuoto|descrizione|personalità|obiettivo_generale|strategia|risorse|influenza_0_100|relazione_col_protagonista|active|luogo|obiettivo_pubblico|obiettivo_privato|leva_concreta|vincoli|conoscenze|agenda|ruolo_storico]
[FAZIONE_SETUP: nome_esatto|tipo|leader|descrizione|obiettivo|strategia|risorse|influenza_0_100|relazione_col_protagonista|active|base|ideologia|legittimità_0_100|leva_concreta|vincoli]
[RELAZIONE_SETUP: soggetto|bersaglio|tipo|fiducia_0_100|tensione_0_100|descrizione]
[FORZA_SETUP: nome|attore_responsabile|obiettivo|progresso_0_100|urgenza_0_100|active|causa|avversari_separati_da_virgola|conseguenza_al_100]
La scena iniziale deve inoltre usare [LUOGO] e [POSIZIONE] per il luogo in cui si trova davvero il protagonista.`;
    }

    function buildRuntimePrompt(worldValue, context = {}) {
        const world = migrateWorld(worldValue, context);
        if (!world.initialized || world.provisional) return `🌍 MONDO ANCORA INCOMPLETO
Completa in questo turno gli elementi mancanti usando i tag *_SETUP descritti all’avvio. Stato: ${world.locations.length} luoghi, ${world.actors.length} personaggi, ${world.factions.length} fazioni, ${world.relations.length} relazioni.`;
        const influences = selectInfluences(world, { ...context, limit: context.limit || 5 });
        const names = new Set(influences.map(item => keyOf(item.name)));
        const relations = world.relations.filter(item => names.has(keyOf(item.from)) || names.has(keyOf(item.to))).slice(0, 6);
        return `🌍 **MONDO PERSISTENTE: ${world.name}**
Contesto storico: ${world.historicalContext?.date || 'data corrente'} · ${world.historicalContext?.baseline || world.setting || 'assetto definito dalla campagna'}.
Istituzioni: ${world.historicalContext?.politicalSystem || 'quelle già stabilite'}.
Conflitto centrale: ${world.centralConflict || world.premise || 'equilibri in evoluzione'}.
Posta in gioco: ${world.stakes || 'le conseguenze delle azioni delle parti'}.
Attori che possono influenzare questo turno:
${influences.length ? influences.map(compactActor).join('\n') : '- Il mondo circostante reagisce.'}
Relazioni attive:
${relations.length ? relations.map(item => `- ${item.from} ↔ ${item.to}: ${item.type}, fiducia ${Math.round(item.trust)}, tensione ${Math.round(item.tension)} — ${item.description}`).join('\n') : '- Nessuna relazione strutturata.'}
Almeno uno di questi attori deve avanzare il proprio obiettivo quando è plausibile. Registra la sua mossa con [MONDO: attore|azione|stato|visible/hidden].`;
    }

    function buildTimelinePrompt(worldValue, context = {}) {
        const world = migrateWorld(worldValue, context);
        const influences = selectInfluences(world, { ...context, limit: 6 });
        return `🌐 **SIMULAZIONE CAUSALE DEL MONDO NEL PERIODO**
Base storico-politica: ${world.historicalContext?.date || 'data della campagna'}; ${world.historicalContext?.baseline || world.setting}; istituzioni ${world.historicalContext?.politicalSystem || 'già definite'}; tensioni ${world.historicalContext?.activeTensions || world.centralConflict}.
Durante ${cleanText(context.duration || 'il periodo selezionato', 100)}, fai agire almeno ${Math.min(3, Math.max(2, influences.length))} parti del mondo secondo obiettivi, strategie, risorse e relazioni persistenti:
${influences.length ? influences.map(compactActor).join('\n') : '- Usa le trame aperte registrate.'}
- Le loro mosse devono produrre EVENTO datati e, quando due parti comunicano, CHAT in prima persona.
- Le scelte del giocatore cambiano probabilità e reazioni, ma gli altri attori conservano iniziativa propria.
- Un attore non può usare risorse, informazioni o poteri che non possiede.`;
    }

    function buildInteractionPrompt(worldValue, participantNames, context = {}) {
        const world = migrateWorld(worldValue, context);
        const wanted = new Set(asArray(participantNames).map(keyOf));
        const participants = [...world.actors, ...world.factions].filter(item => wanted.has(keyOf(item.name)));
        return participants.map(item => `${item.name}: carica ${item.role || item.type || 'parte coinvolta'}; personalità ${item.personality || 'coerente col ruolo'}; obiettivo pubblico ${item.publicGoal || item.goal || 'non dichiarato'}; obiettivo privato ${item.privateGoal || 'non noto'}; strategia e agenda ${item.agenda || item.strategy || 'pragmatica'}; leva ${item.leverage || item.resources || 'limitata'}; vincoli ${item.constraints || 'quelli del ruolo'}; conosce ${item.knowledge || 'solo ciò che è emerso'}; rapporto col protagonista ${item.relationship || 'neutrale'}.`).join('\n');
    }

    function applyWorldMoves(worldValue, moves, turn, context = {}) {
        const world = migrateWorld(worldValue, { ...context, turn });
        asArray(moves).forEach(move => {
            const actor = [...world.actors, ...world.factions].find(item => keyOf(item.name) === keyOf(move.actor));
            if (!actor) return;
            actor.lastMove = cleanText(move.action, 320);
            actor.lastMoveTurn = Math.max(0, Number(turn) || 0);
            if (move.status && !/in.?progress|in corso/i.test(move.status)) actor.activity = cleanText(move.status, 80);
        });
        world.updatedAtTurn = Math.max(world.updatedAtTurn, Number(turn) || 0);
        return world;
    }

    function applyTimelineEvents(worldValue, events, turn, context = {}) {
        const world = migrateWorld(worldValue, { ...context, turn });
        const elapsedDays = Math.max(1, Number(context.days) || 1);
        asArray(events).forEach(event => {
            const names = Array.isArray(event?.actors) ? event.actors : splitList(event?.actors, 8);
            const actorKeys = new Set(names.map(keyOf));
            const summary = cleanText(event?.summary || event?.description, 320);
            [...world.actors, ...world.factions].forEach(actor => {
                if (!actorKeys.has(keyOf(actor.name))) return;
                actor.lastMove = summary || actor.lastMove;
                actor.lastMoveTurn = Math.max(actor.lastMoveTurn || 0, Number(turn) || 0);
            });

            if (names.length >= 2) {
                const relation = world.relations.find(item => {
                    const ends = new Set([keyOf(item.from), keyOf(item.to)]);
                    return ends.has(keyOf(names[0])) && ends.has(keyOf(names[1]));
                });
                if (relation) {
                    const type = keyOf(event?.type);
                    if (/conflitto|pericolo/.test(type)) {
                        relation.tension = numberBetween(relation.tension + 6, 0, 100, relation.tension);
                        relation.trust = numberBetween(relation.trust - 4, 0, 100, relation.trust);
                    } else if (/relazione/.test(type)) {
                        relation.trust = numberBetween(relation.trust + 4, 0, 100, relation.trust);
                        relation.tension = numberBetween(relation.tension - 2, 0, 100, relation.tension);
                    } else {
                        relation.tension = numberBetween(relation.tension + 1, 0, 100, relation.tension);
                    }
                    relation.updatedAtTurn = Math.max(relation.updatedAtTurn || 0, Number(turn) || 0);
                }
            }

            world.forces.forEach(force => {
                const mentioned = actorKeys.has(keyOf(force.actor)) ||
                    keyOf(`${event?.title || ''} ${summary}`).includes(keyOf(force.name));
                if (!mentioned || force.status !== 'active') return;
                const importance = keyOf(event?.importance);
                const base = importance === 'critical' ? 12 : importance === 'high' ? 8 : 5;
                const timeBonus = Math.min(8, Math.floor(elapsedDays / 14));
                force.progress = numberBetween(force.progress + base + timeBonus, 0, 100, force.progress);
                force.urgency = numberBetween(force.urgency + (importance === 'critical' ? 5 : 2), 0, 100, force.urgency);
                force.updatedAtTurn = Math.max(force.updatedAtTurn || 0, Number(turn) || 0);
                if (force.progress >= 100) force.status = 'resolved';
            });
        });
        world.updatedAtTurn = Math.max(world.updatedAtTurn, Number(turn) || 0);
        return world;
    }

    function markInteraction(worldValue, speaker, turn, text, context = {}) {
        const world = migrateWorld(worldValue, { ...context, turn });
        const actor = [...world.actors, ...world.factions].find(item => keyOf(item.name) === keyOf(speaker));
        if (actor) {
            actor.lastInteractionTurn = Math.max(0, Number(turn) || 0);
            actor.lastMove = cleanText(text, 320) || actor.lastMove;
        }
        return world;
    }

    function applyConversationOutcomes(worldValue, outcomes, turn, context = {}) {
        const world = migrateWorld(worldValue, { ...context, turn });
        asArray(outcomes).forEach(outcome => {
            const participants = splitList(outcome?.participants, 12);
            const status = keyOf(outcome?.status);
            const summary = cleanText(outcome?.summary || outcome?.terms || outcome?.consequence, 320);
            [...world.actors, ...world.factions].forEach(actor => {
                if (!participants.some(name => keyOf(name) === keyOf(actor.name))) return;
                actor.lastInteractionTurn = Math.max(0, Number(turn) || 0);
                actor.lastMoveTurn = Math.max(0, Number(turn) || 0);
                actor.lastMove = summary || actor.lastMove;
            });
            for (let leftIndex = 0; leftIndex < participants.length; leftIndex++) {
                for (let rightIndex = leftIndex + 1; rightIndex < participants.length; rightIndex++) {
                    const left = participants[leftIndex];
                    const right = participants[rightIndex];
                    let relation = world.relations.find(item => {
                        const ends = new Set([keyOf(item.from), keyOf(item.to)]);
                        return ends.has(keyOf(left)) && ends.has(keyOf(right));
                    });
                    if (!relation) {
                        relation = normalizeRelation({ from: left, to: right, type: 'negoziazione', trust: 45, tension: 35, description: summary, source: 'world-chat' }, { ...context, turn });
                        if (relation) world.relations.push(relation);
                    }
                    if (!relation) continue;
                    if (/agreement|accordo|active|resolved/.test(status)) {
                        relation.trust = numberBetween(relation.trust + 8, 0, 100, relation.trust);
                        relation.tension = numberBetween(relation.tension - 6, 0, 100, relation.tension);
                        relation.type = 'accordo';
                    } else if (/refused|rifiut|failed|fallit|broken/.test(status)) {
                        relation.trust = numberBetween(relation.trust - 5, 0, 100, relation.trust);
                        relation.tension = numberBetween(relation.tension + 8, 0, 100, relation.tension);
                    } else if (/proposal|proposta|draft/.test(status)) {
                        relation.tension = numberBetween(relation.tension + 1, 0, 100, relation.tension);
                    }
                    relation.description = summary || relation.description;
                    relation.updatedAtTurn = Math.max(relation.updatedAtTurn || 0, Number(turn) || 0);
                }
            }
        });
        world.relations = world.relations.slice(-LIMITS.relations);
        world.updatedAtTurn = Math.max(world.updatedAtTurn, Number(turn) || 0);
        return world;
    }

    return {
        WORLD_SCHEMA_VERSION,
        LIMITS,
        READY_MINIMUM,
        cleanText,
        keyOf,
        createDefaultWorld,
        normalizeLocation,
        normalizeHistoricalContext,
        normalizeActor,
        normalizeFaction,
        normalizeRelation,
        normalizeForce,
        migrateWorld,
        isWorldReady,
        parseBootstrapTags,
        ensureMinimumWorld,
        ingestResponse,
        projectToMemory,
        syncFromMemory,
        selectInfluences,
        buildBootstrapPrompt,
        buildRuntimePrompt,
        buildTimelinePrompt,
        buildInteractionPrompt,
        isGenericActorName,
        isGenericForceName,
        isConcreteEntity,
        pruneProvisionalMemory,
        needsHistoricalRepair,
        applyWorldMoves,
        applyTimelineEvents,
        markInteraction,
        applyConversationOutcomes
    };
});
