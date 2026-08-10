(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheWorldBootstrap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const WORLD_SCHEMA_VERSION = 1;
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
            updatedAtTurn: Math.max(0, Number(input.updatedAtTurn ?? context.turn) || 0)
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
            progress: numberBetween(input.progress, 0, 100, 10),
            urgency: numberBetween(input.urgency, 0, 100, 50),
            status: normalizeStatus(input.status),
            updatedAtTurn: Math.max(0, Number(input.updatedAtTurn ?? context.turn) || 0)
        };
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
            locations: mergeByName([], input.locations, normalizeLocation, LIMITS.locations, context),
            actors: mergeByName([], input.actors, normalizeActor, LIMITS.actors, context),
            factions: mergeByName([], input.factions, normalizeFaction, LIMITS.factions, context),
            relations: mergeByName([], input.relations, normalizeRelation, LIMITS.relations, context),
            forces: mergeByName([], input.forces, normalizeForce, LIMITS.forces, context)
        };
        world.initialized = Boolean(input.initialized) || isWorldReady(world);
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
        const locations = bodies(response, 'LUOGO_SETUP').map(fields).map(parts => ({
            name: parts[0], type: parts[1], region: parts[2], description: parts[3], controller: parts[4],
            resource: parts[5], danger: parts[6], connections: parts[7]
        })).map(item => normalizeLocation(item, context)).filter(Boolean);
        const actors = bodies(response, 'PERSONAGGIO_SETUP').map(fields).map(parts => ({
            name: parts[0], role: parts[1], faction: parts[2], description: parts[3], personality: parts[4],
            goal: parts[5], strategy: parts[6], resources: parts[7], influence: parts[8], relationship: parts[9],
            status: parts[10], location: parts[11]
        })).map(item => normalizeActor(item, context)).filter(Boolean);
        const factions = bodies(response, 'FAZIONE_SETUP').map(fields).map(parts => ({
            name: parts[0], type: parts[1], leader: parts[2], description: parts[3], goal: parts[4],
            strategy: parts[5], resources: parts[6], influence: parts[7], relationship: parts[8],
            status: parts[9], base: parts[10]
        })).map(item => normalizeFaction(item, context)).filter(Boolean);
        const relations = bodies(response, 'RELAZIONE_SETUP').map(fields).map(parts => ({
            from: parts[0], to: parts[1], type: parts[2], trust: parts[3], tension: parts[4], description: parts[5]
        })).map(item => normalizeRelation(item, context)).filter(Boolean);
        const forces = bodies(response, 'FORZA_SETUP').map(fields).map(parts => ({
            name: parts[0], actor: parts[1], objective: parts[2], progress: parts[3], urgency: parts[4], status: parts[5]
        })).map(item => normalizeForce(item, context)).filter(Boolean);
        return { setup, locations, actors, factions, relations, forces };
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
        const names = fallbackNames(context);
        world.provisional = true;
        world.centralConflict = world.centralConflict || cleanText(context.story?.desc || 'Forze contrapposte cercano di cambiare l’equilibrio del mondo.', 420);
        world.stakes = world.stakes || 'Il destino della comunità e la libertà d’azione del protagonista.';
        const fallbackLocations = names.locations.map((name, index) => ({
            name, type: index ? 'area' : 'ambientazione', region: names.place,
            description: index === 0 ? `Cuore dell’ambientazione ${names.place}.` : `Zona di ${names.place} con opportunità e pericoli propri.`,
            controller: index === 2 ? names.factions[1] : names.factions[0], source: 'deterministic-fallback'
        }));
        const fallbackFactions = [
            { name: names.factions[0], type: 'autorità', leader: names.actors[0], description: 'Difende l’ordine esistente.', goal: 'Conservare controllo e stabilità.', strategy: 'Leggi, alleanze e pressione.', resources: 'istituzioni e informatori', influence: 65, relationship: 'neutrale' },
            { name: names.factions[1], type: 'opposizione', leader: names.actors[1], description: 'Contesta l’equilibrio attuale.', goal: 'Cambiare i rapporti di potere.', strategy: 'Consenso, segreti e azioni indirette.', resources: 'sostenitori e contatti', influence: 55, relationship: 'incerta' }
        ];
        const fallbackActors = [
            { name: names.actors[0], role: 'autorità', faction: names.factions[0], personality: 'prudente e determinato', goal: 'Proteggere l’ordine', strategy: 'osservare e intervenire', resources: 'informazioni e autorità', influence: 65, relationship: 'neutrale', location: names.locations[0] },
            { name: names.actors[1], role: 'rivale', faction: names.factions[1], personality: 'ambiziosa e impaziente', goal: 'Spezzare l’equilibrio', strategy: 'reclutare alleati', resources: 'contatti e segreti', influence: 58, relationship: 'diffidente', location: names.locations[2] },
            { name: names.actors[2], role: 'contatto', faction: '', personality: 'curiosa e pragmatica', goal: 'Capire chi prevarrà', strategy: 'scambiare informazioni', resources: 'conoscenza locale', influence: 40, relationship: 'amichevole', location: names.locations[0] },
            { name: names.actors[3], role: 'intermediario', faction: '', personality: 'calmo e opportunista', goal: 'Trarre vantaggio dal cambiamento', strategy: 'mediare e commerciare', resources: 'denaro e relazioni', influence: 45, relationship: 'neutrale', location: names.locations[1] }
        ];
        world.locations = mergeByName(world.locations, fallbackLocations, normalizeLocation, LIMITS.locations, context);
        world.factions = mergeByName(world.factions, fallbackFactions, normalizeFaction, LIMITS.factions, context);
        world.actors = mergeByName(world.actors, fallbackActors, normalizeActor, LIMITS.actors, context);
        world.relations = mergeByName(world.relations, [
            { from: names.factions[0], to: names.factions[1], type: 'rivalità', trust: 10, tension: 75, description: 'Le due forze competono per il controllo.' },
            { from: names.actors[2], to: names.actors[0], type: 'contatto', trust: 55, tension: 20, description: 'Si scambiano informazioni con cautela.' }
        ], normalizeRelation, LIMITS.relations, context);
        world.forces = mergeByName(world.forces, [{
            name: 'Equilibrio in cambiamento', actor: names.factions[1], objective: world.centralConflict,
            progress: 10, urgency: 55, status: 'active'
        }], normalizeForce, LIMITS.forces, context);
        world.initialized = isWorldReady(world);
        world.status = world.initialized ? 'provisional' : 'partial';
        world.updatedAtTurn = Math.max(world.updatedAtTurn, Number(context.turn) || 0);
        return world;
    }

    function ingestResponse(response, currentWorld, context = {}) {
        const before = migrateWorld(currentWorld, context);
        const parsed = parseBootstrapTags(response, context);
        const next = migrateWorld(before, context);
        if (parsed.setup) {
            next.name = cleanText(parsed.setup.name || next.name, 120);
            next.premise = cleanText(parsed.setup.premise || next.premise, 600);
            next.centralConflict = cleanText(parsed.setup.centralConflict || next.centralConflict, 420);
            next.stakes = cleanText(parsed.setup.stakes || next.stakes, 320);
            next.provisional = false;
        }
        next.locations = mergeByName(next.locations, parsed.locations, normalizeLocation, LIMITS.locations, context);
        next.actors = mergeByName(next.actors, parsed.actors, normalizeActor, LIMITS.actors, context);
        next.factions = mergeByName(next.factions, parsed.factions, normalizeFaction, LIMITS.factions, context);
        next.relations = mergeByName(next.relations, parsed.relations, normalizeRelation, LIMITS.relations, context);
        next.forces = mergeByName(next.forces, parsed.forces, normalizeForce, LIMITS.forces, context);
        let world = migrateWorld(next, context);
        if (context.ensureMinimum) world = ensureMinimumWorld(world, context);
        world.initialized = isWorldReady(world);
        world.status = world.initialized ? (world.provisional ? 'provisional' : 'ready') : 'partial';
        world.updatedAtTurn = Math.max(world.updatedAtTurn, Number(context.turn) || 0);
        const parsedCount = parsed.locations.length + parsed.actors.length + parsed.factions.length + parsed.relations.length + parsed.forces.length + (parsed.setup ? 1 : 0);
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
        state.world = world;
        state.locations = asArray(state.locations);
        state.npcs = asArray(state.npcs);
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
        world.actors.forEach(actor => {
            state.npcs = upsertMemory(state.npcs, actor.name, {
                id: actor.id, name: actor.name, description: actor.description || actor.role,
                relationship: actor.relationship, personality: actor.personality, goals: actor.goal,
                status: actor.status, location: actor.location, faction: actor.faction,
                role: actor.role, strategy: actor.strategy, resources: actor.resources,
                influence: actor.influence, worldSeed: true,
                level: Math.max(1, Math.ceil(actor.influence / 10)),
                threat: actor.influence >= 80 ? 'boss' : actor.influence >= 60 ? 'high' : actor.influence >= 40 ? 'medium' : 'low',
                interactions: asArray(state.npcs.find(item => keyOf(item?.name) === keyOf(actor.name))?.interactions),
                interactionCount: Number(state.npcs.find(item => keyOf(item?.name) === keyOf(actor.name))?.interactionCount) || 0,
                metAt: Number(context.turn) || 0, lastSeen: Number(context.turn) || 0
            });
        });
        world.factions.forEach(faction => {
            state.factions = upsertMemory(state.factions, faction.name, {
                id: faction.id, name: faction.name, description: faction.description,
                relationship: faction.relationship, goal: faction.goal, strategy: faction.strategy,
                resources: faction.resources, influence: faction.influence, leader: faction.leader,
                type: faction.type, status: faction.status, location: faction.base, worldSeed: true
            });
        });
        world.forces.forEach(force => {
            state.narrativeGoals = upsertMemory(state.narrativeGoals, force.name, {
                id: force.id, name: force.name, description: force.objective, status: force.status,
                progress: `${Math.round(force.progress)}%`, urgency: force.urgency,
                actor: force.actor, worldSeed: true, createdAtTurn: Number(context.turn) || 0
            });
        });
        return state;
    }

    function syncFromMemory(worldValue, memory, context = {}) {
        const world = migrateWorld(worldValue, context);
        world.locations = mergeByName(world.locations, asArray(memory?.locations).map(item => ({ ...item, source: item.source || 'memory' })), normalizeLocation, LIMITS.locations, context);
        world.actors = mergeByName(world.actors, asArray(memory?.npcs).map(item => ({
            ...item, goal: item.goals || item.goal, influence: item.influence || Math.min(100, Math.max(10, Number(item.level || 1) * 10)),
            source: item.source || 'memory'
        })), normalizeActor, LIMITS.actors, context);
        world.factions = mergeByName(world.factions, asArray(memory?.factions), normalizeFaction, LIMITS.factions, context);
        world.forces = mergeByName(world.forces, asArray(memory?.narrativeGoals).map(item => ({
            name: item.name || item.title, actor: item.actor, objective: item.description,
            progress: parseFloat(item.progress) || 0, urgency: item.urgency || 50, status: item.status
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
            `${item.strategy ? `; agirà tramite: ${item.strategy}` : ''}` +
            `${item.resources ? `; risorse: ${item.resources}` : ''}` +
            `${place ? `; base: ${place}` : ''}` +
            `${item.lastMove ? `; ultima mossa: ${item.lastMove}` : ''}`;
    }

    function buildBootstrapPrompt(context = {}) {
        const story = context.story || {};
        return `🌍 **CREAZIONE OBBLIGATORIA DEL MONDO ALL'AVVIO**
Questa è la prima risposta della campagna. Oltre alla scena, costruisci subito un mondo persistente coerente con «${cleanText(story.title, 120) || 'la storia'}» e con ${cleanText(story.setting, 160) || 'l’ambientazione scelta'}.
- Crea esattamente 1 MONDO_SETUP, almeno 4 LUOGO_SETUP, 5 PERSONAGGIO_SETUP, 3 FAZIONE_SETUP, 5 RELAZIONE_SETUP e 3 FORZA_SETUP.
- Ogni personaggio e fazione deve avere un obiettivo autonomo, una strategia, risorse limitate e abbastanza influenza da produrre eventi anche fuori scena.
- Crea alleati potenziali, rivali e parti neutrali; non renderli tutti dipendenti dal protagonista.
- Le relazioni devono contenere cooperazione, conflitto e tensioni capaci di evolvere nella timeline.
- Non usare il carattere | o ] dentro i valori. Non citare i tag nella prosa.
[MONDO_SETUP: nome_mondo|premessa|conflitto_centrale|posta_in_gioco]
[LUOGO_SETUP: nome|tipo|regione|descrizione|controllore|risorsa|pericolo|collegamenti_separati_da_virgola]
[PERSONAGGIO_SETUP: nome|ruolo|fazione_o_vuoto|descrizione|personalità|obiettivo|strategia|risorse|influenza_0_100|relazione_col_protagonista|active|luogo]
[FAZIONE_SETUP: nome|tipo|leader|descrizione|obiettivo|strategia|risorse|influenza_0_100|relazione_col_protagonista|active|base]
[RELAZIONE_SETUP: soggetto|bersaglio|tipo|fiducia_0_100|tensione_0_100|descrizione]
[FORZA_SETUP: nome|attore_responsabile|obiettivo|progresso_0_100|urgenza_0_100|active]
La scena iniziale deve inoltre usare [LUOGO] e [POSIZIONE] per il luogo in cui si trova davvero il protagonista.`;
    }

    function buildRuntimePrompt(worldValue, context = {}) {
        const world = migrateWorld(worldValue, context);
        if (!world.initialized) return `🌍 MONDO ANCORA INCOMPLETO
Completa in questo turno gli elementi mancanti usando i tag *_SETUP descritti all’avvio. Stato: ${world.locations.length} luoghi, ${world.actors.length} personaggi, ${world.factions.length} fazioni, ${world.relations.length} relazioni.`;
        const influences = selectInfluences(world, { ...context, limit: context.limit || 5 });
        const names = new Set(influences.map(item => keyOf(item.name)));
        const relations = world.relations.filter(item => names.has(keyOf(item.from)) || names.has(keyOf(item.to))).slice(0, 6);
        return `🌍 **MONDO PERSISTENTE: ${world.name}**
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
        return participants.map(item => `${item.name}: personalità ${item.personality || 'coerente col ruolo'}; obiettivo ${item.goal || 'non dichiarato'}; strategia ${item.strategy || 'pragmatica'}; risorse ${item.resources || 'limitate'}; rapporto col protagonista ${item.relationship || 'neutrale'}.`).join('\n');
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

    function markInteraction(worldValue, speaker, turn, text, context = {}) {
        const world = migrateWorld(worldValue, { ...context, turn });
        const actor = [...world.actors, ...world.factions].find(item => keyOf(item.name) === keyOf(speaker));
        if (actor) {
            actor.lastInteractionTurn = Math.max(0, Number(turn) || 0);
            actor.lastMove = cleanText(text, 320) || actor.lastMove;
        }
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
        applyWorldMoves,
        markInteraction
    };
});
