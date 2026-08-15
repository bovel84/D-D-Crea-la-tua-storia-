(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheWorldMap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const MAP_WIDTH = 960;
    const MAP_HEIGHT = 620;
    const MAP_POSITIONS = Object.freeze([
        [50, 50], [25, 25], [74, 24], [24, 72], [76, 72],
        [49, 17], [50, 83], [13, 47], [87, 48], [37, 35],
        [63, 36], [36, 65], [64, 64], [15, 18], [86, 18],
        [13, 82], [87, 82], [31, 12], [69, 12], [31, 88],
        [69, 88], [8, 32], [92, 32], [8, 67], [92, 67],
        [42, 8], [58, 8], [42, 92], [58, 92], [6, 15],
        [94, 15], [6, 85], [94, 85], [19, 38], [81, 38],
        [19, 59], [81, 59], [43, 27], [57, 73], [68, 50]
    ]);

    const FACTION_COLORS = Object.freeze(['#9f2530', '#60338f', '#1d6379', '#8a5b15', '#315c39', '#7e3d67', '#4b4f69', '#8b3c22']);

    const THEMES = Object.freeze({
        fantasy: { id: 'fantasy', label: 'Regni e terre selvagge', icon: '✦', background: '#d7c488', land: '#c8ad68', water: '#638da0', ink: '#3a291d', route: '#704a2b' },
        maritime: { id: 'maritime', label: 'Mari, isole e rotte', icon: '⚓', background: '#9bc0c3', land: '#d4bd78', water: '#4f8798', ink: '#233e45', route: '#f3e0a0' },
        ancient: { id: 'ancient', label: 'Mondo antico', icon: '☀', background: '#d8b76f', land: '#c89d51', water: '#4f8f9b', ink: '#4b2e18', route: '#744221' },
        industrial: { id: 'industrial', label: 'Età industriale', icon: '⚙', background: '#a79d89', land: '#b8ad91', water: '#657d82', ink: '#302f2b', route: '#65402d' },
        modern: { id: 'modern', label: 'Mappa contemporanea', icon: '◉', background: '#aeb8b4', land: '#cad0c7', water: '#6996a5', ink: '#26343a', route: '#4f5e62' },
        rural: { id: 'rural', label: 'Valli e comunità', icon: '❦', background: '#c5cb92', land: '#aeb66d', water: '#6d9aa0', ink: '#344127', route: '#6b5430' }
    });

    function cleanText(value, maxLength = 300) {
        return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
    }

    function keyOf(value) {
        return cleanText(value, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
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

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function asList(value) {
        if (Array.isArray(value)) return value.map(item => cleanText(item, 120)).filter(Boolean);
        return cleanText(value, 700).split(/[,;|]/).map(item => cleanText(item, 120)).filter(Boolean);
    }

    function isGenericMapName(value) {
        const label = keyOf(value);
        return !label || /^(?:sconosciuto|unknown|luogo sconosciuto|posizione attuale|base di fazione|obiettivo strategico|proprieta|attivita|risorsa|territorio|area di presenza|mondo conosciuto|autorita|opposizione|fazione avversaria|fazione alleata|alleati|nemici)$/.test(label) ||
            /^(?:luogo|area|zona|territorio|regione|sito|punto di interesse|base|sede)\s*(?:\d+|[a-z])?$/.test(label) ||
            /^(?:nome del luogo|nome luogo|da definire|non disponibile|n a|tbd)$/.test(label) ||
            /(?:_setup\b|\bsetup\b|\bfazione setup\b|\bluogo setup\b)/.test(label);
    }

    function usefulMapLabel(value) {
        const label = cleanText(value, 120);
        if (!label) return '';
        return /^(?:luogo|location|place|fazione|gruppo|territorio|regione|area|zona|sito|edificio|struttura|insediamento|proprietà|proprieta|attività|attivita|risorsa|base di fazione|obiettivo strategico|posizione attuale|generico|generica|altro|da definire)$/i.test(label)
            ? ''
            : label;
    }

    function usefulMapFact(value, maxLength = 180) {
        const fact = cleanText(value, maxLength);
        if (!fact || isGenericMapName(fact) || /^(?:nessuno|nessuna|non noto|non nota|generico|generica|altro)$/i.test(fact)) return '';
        return fact;
    }

    function inferLocationType(source = {}) {
        const explicit = usefulMapLabel(source.type || source.category || source.territoryType);
        if (explicit) return explicit;
        const corpus = keyOf([source.name, source.description, source.notes].filter(Boolean).join(' '));
        const patterns = [
            [/granaio|silo/, 'deposito cereali'],
            [/magazzino|deposito/, 'deposito'],
            [/mulino/, 'mulino'],
            [/fattoria|tenuta|podere|vigna/, 'azienda agricola'],
            [/mercato/, 'mercato'],
            [/bottega|negozio|banco|emporio/, 'attività commerciale'],
            [/caserma|guarnigione/, 'caserma'],
            [/accampamento/, 'accampamento'],
            [/cripta|catacomb/, 'cripta'],
            [/tomba|cimiter/, 'luogo funerario'],
            [/rovina|dungeon/, 'rovine'],
            [/abbazia|monaster/, 'monastero'],
            [/tempio|chiesa|santuario/, 'santuario'],
            [/castell|fort|rocca|cittadella/, 'fortificazione'],
            [/palazzo/, 'palazzo'],
            [/foresta|bosco|selva|giungla/, 'foresta'],
            [/montagn|picco|passo|collina/, 'rilievo'],
            [/porto|molo|baia/, 'porto'],
            [/isola/, 'isola'],
            [/mare|oceano|lago|fiume|palude/, 'acque'],
            [/locanda|taverna|osteria/, 'locanda'],
            [/villaggio|borgo|frazione|comunita/, 'borgo'],
            [/capitale/, 'capitale'],
            [/citta|metropoli|quartiere/, 'centro urbano'],
            [/fabbrica|officina|miniera|stazione|cava/, 'sito produttivo'],
            [/deserto|oasi|duna/, 'territorio arido'],
            [/grotta|caverna/, 'cavità naturale']
        ];
        return patterns.find(([pattern]) => pattern.test(corpus))?.[1] || '';
    }

    function inferTheme(context = {}) {
        const story = context.story || {};
        const corpus = keyOf([context.genre, context.setting, story.genre, story.setting, story.title, story.desc].filter(Boolean).join(' '));
        const year = Number(context.year ?? story.startYear ?? story.year ?? story.startTime?.year);
        if (/pirat|corsar|marin|ocean|mare|isole|naval|porto/.test(corpus)) return THEMES.maritime;
        if (/antich|roman|roma|grec|ellen|egitt|faraon/.test(corpus) || (Number.isFinite(year) && year < 600)) return THEMES.ancient;
        if (/vittorian|industr|ottocent|steampunk|risorgiment/.test(corpus) || (Number.isFinite(year) && year >= 1700 && year < 1920)) return THEMES.industrial;
        if (/modern|contempor|cyber|business|odiern|metropoli/.test(corpus) || (Number.isFinite(year) && year >= 1920)) return THEMES.modern;
        if (/rural|villaggio|campagna|agricol|valle/.test(corpus)) return THEMES.rural;
        return THEMES.fantasy;
    }

    function locationIcon(location, themeId = 'fantasy') {
        const corpus = keyOf([location?.name, location?.type, location?.description].filter(Boolean).join(' '));
        if (/granaio|magazzino|deposito|silo/.test(corpus)) return '▤';
        if (/mulino/.test(corpus)) return '✥';
        if (/fattoria|tenuta|podere|campo|vigna/.test(corpus)) return '♨';
        if (/mercato|bottega|negozio|banco|emporio/.test(corpus)) return '⚖';
        if (/caserma|guarnigione|accampamento/.test(corpus)) return '⚔';
        if (/cripta|tomba|catacomb|cimiter|rovina|dungeon/.test(corpus)) return '☠';
        if (/castell|fort|rocca|palazzo|cittadella/.test(corpus)) return '♜';
        if (/foresta|bosco|selva|giungla/.test(corpus)) return '♣';
        if (/montagn|picco|passo|collina/.test(corpus)) return '▲';
        if (/porto|molo|baia|isola|nave/.test(corpus)) return '⚓';
        if (/mare|oceano|lago|fiume|palude/.test(corpus)) return '≈';
        if (/tempio|chiesa|abbazia|santuario|monaster/.test(corpus)) return '✞';
        if (/locanda|taverna|osteria/.test(corpus)) return '⌂';
        if (/villaggio|borgo|frazione|comunita/.test(corpus)) return '⌂';
        if (/citta|capitale|metropoli|quartiere|centro/.test(corpus)) return themeId === 'modern' ? '▦' : '◉';
        if (/fabbrica|officina|miniera|stazione/.test(corpus)) return '⚙';
        if (/deserto|oasi|duna/.test(corpus)) return '☀';
        if (/grotta|caverna|miniera/.test(corpus)) return '◆';
        return '●';
    }

    function factionHostility(source) {
        const relation = keyOf([source?.relationship, source?.relation, source?.stance, source?.status].filter(Boolean).join(' '));
        if (/guerra|nemic|ostil|avvers|ribell|invas|rival/.test(relation)) return Math.max(70, Number(source?.hostility) || Number(source?.tension) || 0);
        if (/alleat|leal|amic|cooper/.test(relation)) return Math.min(25, Number(source?.hostility) || Number(source?.tension) || 15);
        if (Number.isFinite(Number(source?.hostility))) return Math.max(0, Math.min(100, Number(source.hostility)));
        if (Number.isFinite(Number(source?.tension))) return Math.max(0, Math.min(100, Number(source.tension)));
        if (Number.isFinite(Number(source?.loyalty))) return Math.max(0, Math.min(100, 70 - Number(source.loyalty) * .7));
        return 45;
    }

    function buildFactions(world, memory) {
        const kingdom = memory?.kingdom || {};
        const sources = [
            ...(Array.isArray(world?.factions) ? world.factions : []),
            ...(Array.isArray(memory?.factions) ? memory.factions : []),
            ...(Array.isArray(kingdom?.factions) ? kingdom.factions : []),
            ...(Array.isArray(kingdom?.diplomacy) ? kingdom.diplomacy.map(item => ({
                ...item, name: item.realm, type: 'potenza straniera', relationship: item.relation,
                location: item.capital || item.realm, power: Math.max(item.tension || 0, 35), hostility: item.tension
            })) : [])
        ];
        const factions = [];
        const byName = new Map();
        sources.forEach((source, index) => {
            const name = cleanText(source?.name || source?.realm, 120);
            const key = keyOf(name);
            if (!key || isGenericMapName(name)) return;
            const hostility = factionHostility(source);
            const faction = {
                id: cleanText(source?.id, 140) || `map-faction-${hashNumber(name).toString(36)}`,
                name,
                type: usefulMapLabel(source?.type || source?.category),
                leader: usefulMapFact(source?.leader, 120),
                description: cleanText(source?.description, 360),
                objective: usefulMapFact(source?.goal || source?.objective, 260),
                tactics: usefulMapFact(source?.tactics || source?.strategy, 220),
                grievance: usefulMapFact(source?.grievance || source?.claims, 220),
                nextMove: usefulMapFact(source?.nextMove || source?.lastMove, 260),
                location: usefulMapFact(source?.base || source?.location || source?.territoryName, 120),
                power: Math.max(0, Math.min(100, Number(source?.power ?? source?.influence ?? 45) || 0)),
                militaryStrength: Math.max(0, Math.min(100, Number(source?.militaryStrength ?? source?.power ?? source?.influence ?? 35) || 0)),
                hostility,
                stance: hostility >= 65 ? 'hostile' : hostility <= 25 ? 'allied' : 'uncertain',
                color: FACTION_COLORS[hashNumber(name) % FACTION_COLORS.length]
            };
            if (!byName.has(key)) {
                byName.set(key, faction);
                factions.push(faction);
                return;
            }
            const existing = byName.get(key);
            Object.keys(faction).forEach(field => {
                if ((existing[field] == null || existing[field] === '') && faction[field]) existing[field] = faction[field];
            });
            existing.hostility = Math.max(existing.hostility, faction.hostility);
            existing.power = Math.max(existing.power, faction.power);
            existing.militaryStrength = Math.max(existing.militaryStrength, faction.militaryStrength);
            existing.stance = existing.hostility >= 65 ? 'hostile' : existing.hostility <= 25 ? 'allied' : 'uncertain';
        });
        return factions.slice(0, 14).sort((left, right) => right.hostility - left.hostility || right.power - left.power);
    }

    function buildObjectives(memory = {}) {
        const sources = [
            ...(Array.isArray(memory.quests) ? memory.quests : []),
            ...(Array.isArray(memory.narrativeGoals) ? memory.narrativeGoals : [])
        ];
        const seen = new Set();
        return sources.map((source, index) => {
            const title = cleanText(source?.name || source?.title || source?.objective, 140);
            const status = keyOf(source?.status || 'active');
            const key = keyOf(title);
            if (!key || seen.has(key) || /complet|fallit|closed|resolved/.test(status)) return null;
            seen.add(key);
            return {
                id: cleanText(source?.id, 140) || `map-objective-${hashNumber(`${title}|${index}`).toString(36)}`,
                title,
                location: cleanText(source?.location || source?.place || source?.targetLocation || source?.region, 120),
                urgency: cleanText(source?.urgency || source?.priority || 'attivo', 40),
                summary: cleanText(source?.description || source?.progress || source?.objective, 260)
            };
        }).filter(Boolean).slice(0, 12);
    }

    function locationSources(world, memory, context, factions, objectives) {
        const kingdom = memory?.kingdom || {};
        const sources = [
            ...(Array.isArray(world?.locations) ? world.locations : []),
            ...(Array.isArray(memory?.locations) ? memory.locations : [])
        ];
        if (kingdom?.active && kingdom.capital) sources.push({
            name: kingdom.capital, type: 'capitale', region: kingdom.name, controller: kingdom.name,
            description: `Capitale di ${kingdom.name}.`, kind: 'settlement'
        });
        (Array.isArray(kingdom?.territories) ? kingdom.territories : []).forEach(territory => sources.push({
            ...territory, type: territory.type || territory.territoryType || 'territorio', region: kingdom.name,
            description: territory.description || `Territorio: popolazione ${Number(territory.population || 0).toLocaleString('it-IT')}, ordine ${Math.round(Number(territory.publicOrder || 0))}/100.`,
            resource: territory.strategicResource, danger: territory.publicOrder < 35 ? 'disordini e instabilità' : '',
            kind: 'territory'
        }));
        (Array.isArray(memory?.properties) ? memory.properties : []).forEach(property => sources.push({
            ...property, type: property.type || property.category || 'proprietà',
            region: property.location || property.territory || property.region || context.currentLocation,
            description: property.description || property.notes || '',
            controller: context.protagonistName || 'Protagonista', connections: property.connections || property.location || property.territory,
            kind: 'property', owned: true
        }));
        (Array.isArray(memory?.management?.businesses) ? memory.management.businesses : []).forEach(business => sources.push({
            ...business, type: business.type || business.category || 'attività',
            region: business.location || business.territory || context.currentLocation,
            description: business.description || (Number.isFinite(Number(business.reputation)) ? `Reputazione ${Math.round(Number(business.reputation))}/100.` : ''),
            controller: context.protagonistName || 'Protagonista', connections: business.location || business.territory,
            kind: 'business', owned: true
        }));
        (Array.isArray(kingdom?.resources) ? kingdom.resources : []).forEach(resource => {
            const physicalSite = /cava|miniera|pozzo|bosco|foresta|porto|salina|officina|fonderia|piantagione|vigna|mulino/i.test(
                `${resource?.name || ''} ${resource?.category || ''}`
            );
            if (!physicalSite && !resource?.location) return;
            sources.push({
                name: resource.location || resource.name,
                type: resource.category,
                region: resource.territoryName || kingdom.name,
                description: `Produzione ${resource.production || 0}; scorte ${resource.stock || 0}.`,
                resource: resource.name, connections: resource.territoryName, kind: 'resource'
            });
        });
        factions.forEach(faction => {
            if (faction.location) sources.push({
                name: faction.location, type: '', controller: faction.name,
                description: `Area di presenza di ${faction.name}.`, danger: faction.stance === 'hostile' ? `presenza ostile: ${faction.name}` : '',
                kind: 'faction-base'
            });
        });
        objectives.forEach(objective => {
            if (!objective.location) return;
            sources.push({
                name: objective.location,
                type: '',
                description: objective.summary || `Luogo collegato all'obiettivo: ${objective.title}.`,
                objective: objective.title,
                kind: 'objective'
            });
        });
        return sources;
    }

    function mergeLocations(world, memory, context, factions = [], objectives = []) {
        const merged = [];
        const byName = new Map();
        const sources = locationSources(world, memory, context, factions, objectives);
        const current = cleanText(context.currentLocation || context.location, 120);
        if (current && !/sconosciut|unknown/i.test(current)) sources.push({ name: current, type: '', description: '' });
        sources.forEach((source, index) => {
            const name = cleanText(source?.name, 120);
            const key = keyOf(name);
            if (!key || isGenericMapName(name)) return;
            const next = {
                id: cleanText(source?.id, 140) || `map-location-${hashNumber(name).toString(36)}`,
                name,
                type: inferLocationType(source),
                region: usefulMapFact(source?.region || context.setting || context.story?.setting, 120),
                description: cleanText(source?.description || source?.notes, 420).replace(/^(?:luogo|area|territorio|sito) (?:generico|generica)\.?$/i, ''),
                controller: usefulMapFact(source?.controller, 120),
                resource: usefulMapFact(source?.resource, 160),
                danger: usefulMapFact(source?.danger, 180),
                objective: usefulMapFact(source?.objective, 180),
                connections: asList(source?.connections).filter(connection => !isGenericMapName(connection) && keyOf(connection) !== key),
                kind: cleanText(source?.kind || 'location', 40),
                owned: Boolean(source?.owned),
                discoveredAtTurn: Math.max(0, Number(source?.discovered ?? source?.createdAtTurn ?? index) || 0)
            };
            if (!byName.has(key)) {
                byName.set(key, next);
                merged.push(next);
                return;
            }
            const existing = byName.get(key);
            Object.keys(next).forEach(field => {
                if ((existing[field] == null || existing[field] === '' || (Array.isArray(existing[field]) && !existing[field].length)) && next[field]) existing[field] = next[field];
            });
            existing.connections = [...new Set([...existing.connections, ...next.connections])];
        });
        return merged.slice(0, MAP_POSITIONS.length);
    }

    function findCurrentLocation(locations, currentLocation) {
        const currentKey = keyOf(currentLocation);
        if (!currentKey) return null;
        return locations.find(item => keyOf(item.name) === currentKey)
            || locations.find(item => keyOf(item.name).includes(currentKey) || currentKey.includes(keyOf(item.name)))
            || null;
    }

    function assignCoordinates(locations, seed) {
        const occupied = new Set();
        const positioned = locations.map(location => {
            let slot = hashNumber(`${seed}|${location.name}`) % MAP_POSITIONS.length;
            for (let attempt = 0; attempt < MAP_POSITIONS.length && occupied.has(slot); attempt++) slot = (slot + 7) % MAP_POSITIONS.length;
            occupied.add(slot);
            const point = MAP_POSITIONS[slot];
            return { ...location, x: Math.round(MAP_WIDTH * point[0] / 100), y: Math.round(MAP_HEIGHT * point[1] / 100) };
        });
        positioned.forEach(location => {
            if (!/property|business|resource/.test(location.kind)) return;
            const regionKey = keyOf(location.region);
            const parent = positioned.find(item => item.id !== location.id && regionKey && (keyOf(item.name) === regionKey || keyOf(item.name).includes(regionKey) || regionKey.includes(keyOf(item.name))) && !/property|business|resource/.test(item.kind));
            if (!parent) return;
            const angle = (hashNumber(location.name) % 360) * Math.PI / 180;
            const radius = 64 + hashNumber(`${location.name}|radius`) % 38;
            location.x = Math.max(45, Math.min(MAP_WIDTH - 45, Math.round(parent.x + Math.cos(angle) * radius)));
            location.y = Math.max(45, Math.min(MAP_HEIGHT - 55, Math.round(parent.y + Math.sin(angle) * radius)));
            if (!location.connections.some(item => keyOf(item) === keyOf(parent.name))) location.connections.push(parent.name);
        });
        return positioned;
    }

    function distance(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function buildEdges(locations) {
        const edges = [];
        const seen = new Set();
        const addEdge = (a, b, explicit = false) => {
            if (!a || !b || a.id === b.id) return;
            const key = [a.id, b.id].sort().join('|');
            if (seen.has(key)) return;
            seen.add(key);
            edges.push({ id: `route-${hashNumber(key).toString(36)}`, from: a.id, to: b.id, explicit });
        };
        locations.forEach(location => {
            location.connections.forEach(connection => {
                const targetKey = keyOf(connection);
                const target = locations.find(item => keyOf(item.name) === targetKey)
                    || locations.find(item => keyOf(item.name).includes(targetKey) || targetKey.includes(keyOf(item.name)));
                addEdge(location, target, true);
            });
        });
        locations.slice(1).forEach((location, index) => {
            const previous = locations.slice(0, index + 1).sort((a, b) => distance(location, a) - distance(location, b));
            if (!edges.some(edge => edge.from === location.id || edge.to === location.id)) addEdge(location, previous[0], false);
        });
        return edges;
    }

    function buildLocationIntel(location, presentFactions = [], linkedObjectives = []) {
        const hostile = presentFactions.filter(faction => faction.stance === 'hostile');
        const access = location.owned
            ? 'accesso e gestione diretta del protagonista'
            : hostile.length
                ? `accesso conteso da ${hostile.map(faction => faction.name).join(', ')}`
                : location.controller
                    ? `sotto controllo di ${location.controller}`
                    : location.current
                        ? 'presenza diretta del protagonista'
                        : '';
        const strategicValue = location.resource
            ? `produzione o scorta: ${location.resource}`
            : linkedObjectives.length
                ? `necessario per: ${linkedObjectives.map(objective => objective.title).join(', ')}`
                : location.connections.length >= 3
                    ? `snodo verso ${location.connections.length} luoghi conosciuti`
                    : '';
        const localDanger = /^presenza ostile\b/i.test(location.danger || '') ? '' : location.danger;
        const factionPressure = hostile.length
            ? hostile.map(faction => faction.nextMove || faction.tactics || `${faction.name}: minaccia ${Math.round(faction.hostility)}%`).join(' · ')
            : '';
        const pressure = [factionPressure, localDanger].filter(Boolean).join(' · ');
        return {
            function: usefulMapLabel(location.type),
            access: usefulMapFact(access, 260),
            strategicValue: usefulMapFact(strategicValue, 320),
            pressure: usefulMapFact(pressure, 320)
        };
    }

    function buildMapModel(input = {}, context = {}) {
        const world = input.world || input;
        const memory = input.memory || {};
        const theme = inferTheme(context);
        const seed = cleanText(world?.name || context.story?.title || context.setting || 'mondo', 120);
        const factions = buildFactions(world, memory);
        const objectives = buildObjectives(memory);
        const baseLocations = mergeLocations(world, memory, context, factions, objectives);
        const locations = assignCoordinates(baseLocations, seed).map(location => {
            const controllerKey = keyOf(location.controller);
            const locationKey = keyOf(`${location.name} ${location.region}`);
            const presentFactions = factions.filter(faction => {
                const factionKey = keyOf(faction.name);
                const baseKey = keyOf(faction.location);
                return (controllerKey && factionKey && (controllerKey.includes(factionKey) || factionKey.includes(controllerKey)))
                    || (baseKey && (locationKey.includes(baseKey) || baseKey.includes(keyOf(location.name))));
            });
            const objectiveIds = objectives.filter(objective => {
                const objectiveLocation = keyOf(objective.location);
                return objectiveLocation && (locationKey.includes(objectiveLocation) || objectiveLocation.includes(keyOf(location.name)));
            }).map(objective => objective.id);
            const linkedObjectives = objectives.filter(objective => objectiveIds.includes(objective.id));
            const mapped = {
                ...location,
                icon: locationIcon(location, theme.id),
                factionIds: presentFactions.map(faction => faction.id),
                hostileFactionIds: presentFactions.filter(faction => faction.stance === 'hostile').map(faction => faction.id),
                objectiveIds,
                dominantFactionId: presentFactions.sort((left, right) => right.hostility - left.hostility || right.power - left.power)[0]?.id || ''
            };
            mapped.intel = buildLocationIntel(mapped, presentFactions, linkedObjectives);
            return mapped;
        });
        const current = findCurrentLocation(locations, context.currentLocation || context.location);
        locations.forEach(location => {
            location.current = Boolean(current && current.id === location.id);
            if (location.current && !location.intel.access) location.intel.access = 'presenza diretta del protagonista';
        });
        return {
            id: `world-map-${hashNumber(seed).toString(36)}`,
            name: seed || 'Mondo conosciuto',
            theme,
            width: MAP_WIDTH,
            height: MAP_HEIGHT,
            locations,
            edges: buildEdges(locations),
            factions,
            objectives,
            currentLocationId: current?.id || '',
            currentLocationName: current?.name || cleanText(context.currentLocation || context.location, 120) || 'Sconosciuto'
        };
    }

    function wrapLabel(value, max = 18) {
        const words = cleanText(value, 90).split(' ');
        const lines = [''];
        words.forEach(word => {
            const current = lines[lines.length - 1];
            if (current && `${current} ${word}`.length > max && lines.length < 2) lines.push(word);
            else lines[lines.length - 1] = current ? `${current} ${word}` : word;
        });
        return lines.filter(Boolean);
    }

    function terrainMarkup(model) {
        if (model.theme.id === 'modern' || model.theme.id === 'industrial') {
            return `<g class="world-map-grid">${Array.from({ length: 12 }, (_, i) => `<path d="M ${i * 90 - 20} 0 L ${i * 90 - 120} ${model.height}"/>`).join('')}${Array.from({ length: 8 }, (_, i) => `<path d="M 0 ${i * 90 - 10} L ${model.width} ${i * 90 + 55}"/>`).join('')}</g>`;
        }
        return `<g class="world-map-contours"><path d="M-40 410 C120 300 180 505 355 396 S650 290 1000 430"/><path d="M-20 455 C160 350 245 550 415 440 S720 340 990 478"/><ellipse cx="176" cy="145" rx="118" ry="73"/><ellipse cx="782" cy="465" rx="145" ry="88"/></g><path class="world-map-river" d="M35 55 C210 160 120 310 342 340 S570 250 705 360 S815 510 930 574"/>`;
    }

    function svgMarkup(model) {
        if (!model || !model.locations?.length) return '';
        const byId = new Map(model.locations.map(location => [location.id, location]));
        const factionsById = new Map((model.factions || []).map(faction => [faction.id, faction]));
        const routes = model.edges.map(edge => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (!from || !to) return '';
            const bend = Math.round((from.x + to.x) / 2);
            const lift = Math.round(Math.min(from.y, to.y) - Math.abs(from.x - to.x) * 0.08);
            return `<path class="world-map-route${edge.explicit ? ' explicit' : ''}" d="M ${from.x} ${from.y} Q ${bend} ${lift} ${to.x} ${to.y}"/>`;
        }).join('');
        const nodes = model.locations.map(location => {
            const lines = wrapLabel(location.name);
            const label = lines.map((line, index) => `<tspan x="0" dy="${index ? 17 : 0}">${escapeHtml(line)}</tspan>`).join('');
            const faction = factionsById.get(location.dominantFactionId);
            const isSite = /property|business|resource/.test(location.kind);
            const factionZone = faction ? `<circle class="world-map-faction-zone ${faction.stance}" r="${isSite ? 29 : 40}" style="--map-faction-color:${faction.color}"/><text class="world-map-faction-flag" x="${isSite ? 17 : 22}" y="${isSite ? -19 : -25}" style="--map-faction-color:${faction.color}">⚑</text>` : '';
            const owned = location.owned ? '<path class="world-map-owned" d="M-18 15 l7 7 14-18"/>' : '';
            const objective = location.objectiveIds?.length ? '<text class="world-map-objective-badge" x="-22" y="-20">◆</text>' : '';
            return `<g class="world-map-node kind-${escapeHtml(location.kind)}${isSite ? ' site' : ''}${location.current ? ' current' : ''}${location.hostileFactionIds?.length ? ' hostile' : ''}" data-map-location-id="${escapeHtml(location.id)}" data-map-kind="${escapeHtml(location.kind)}" data-map-owned="${location.owned ? 'true' : 'false'}" data-map-hostile="${location.hostileFactionIds?.length ? 'true' : 'false'}" data-map-objective="${location.objectiveIds?.length ? 'true' : 'false'}" transform="translate(${location.x} ${location.y})" role="button" tabindex="0" aria-label="${escapeHtml(location.name)}${location.current ? ', posizione attuale' : ''}"><title>${escapeHtml(location.name)}${location.description ? ` — ${escapeHtml(location.description)}` : ''}${faction ? ` — ${escapeHtml(faction.name)}` : ''}</title>${factionZone}${location.current ? '<circle class="world-map-player-pulse" r="34"/><circle class="world-map-player-ring" r="25"/>' : `<circle class="world-map-node-ring" r="${isSite ? 17 : 22}"/>`}<text class="world-map-node-icon" text-anchor="middle" dominant-baseline="central">${escapeHtml(location.icon)}</text>${owned}${objective}<text class="world-map-node-label" text-anchor="middle" y="${isSite ? 31 : 37}">${label}</text>${location.danger ? '<path class="world-map-danger" d="M 17 -25 l 9 16 h -18 z"/>' : ''}</g>`;
        }).join('');
        const p = model.theme;
        return `<svg class="world-map-svg theme-${escapeHtml(p.id)}" viewBox="0 0 ${model.width} ${model.height}" xmlns="http://www.w3.org/2000/svg" aria-label="Mappa di ${escapeHtml(model.name)}"><defs><linearGradient id="map-paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.background}"/><stop offset=".52" stop-color="${p.land}"/><stop offset="1" stop-color="${p.background}"/></linearGradient><filter id="map-shadow"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity=".35"/></filter></defs><rect width="100%" height="100%" rx="22" fill="url(#map-paper)"/><rect class="world-map-frame" x="18" y="18" width="${model.width - 36}" height="${model.height - 36}" rx="16"/>${terrainMarkup(model)}<g class="world-map-routes">${routes}</g><g class="world-map-nodes">${nodes}</g><g class="world-map-compass" transform="translate(885 82)"><circle r="39"/><path d="M0-31 L8-7 L0 0 L-8-7 Z M0 31 L8 7 L0 0 L-8 7 Z"/><text text-anchor="middle" y="-45">N</text></g><text class="world-map-signature" x="46" y="574">${escapeHtml(p.icon)} ${escapeHtml(model.name)}</text></svg>`;
    }

    return {
        MAP_WIDTH,
        MAP_HEIGHT,
        THEMES,
        cleanText,
        keyOf,
        isGenericMapName,
        usefulMapLabel,
        usefulMapFact,
        inferLocationType,
        inferTheme,
        locationIcon,
        findCurrentLocation,
        buildFactions,
        buildObjectives,
        buildLocationIntel,
        buildMapModel,
        svgMarkup
    };
});
