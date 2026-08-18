(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheTimeEnergy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const MINUTES_PER_HOUR = 60;
    const MINUTES_PER_DAY = 1440;
    const MINUTES_PER_WEEK = 10080;
    const MINUTES_PER_MONTH = 43200;

    function normalizeMinutes(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return 0;
        return Math.max(0, Math.floor(parsed));
    }

    function parseTimeExpression(value) {
        const raw = String(value == null ? '' : value).trim().toLowerCase();
        if (!raw) return 0;
        if (/^\+?\d+$/.test(raw)) return normalizeMinutes(raw.replace('+', ''));

        const units = [
            { pattern: /(?<!\w)(\d+)\s*(?:mese|mesi|months?|mo)(?!\w)/g, multiplier: MINUTES_PER_MONTH },
            { pattern: /(?<!\w)(\d+)\s*(?:settimane?|weeks?|w)(?!\w)/g, multiplier: MINUTES_PER_WEEK },
            { pattern: /(?<!\w)(\d+)\s*(?:giorno|giorni|days?|d)(?!\w)/g, multiplier: MINUTES_PER_DAY },
            { pattern: /(?<!\w)(\d+)\s*(?:ore?|hours?|hrs?|hr|h)(?!\w)/g, multiplier: MINUTES_PER_HOUR },
            { pattern: /(?<!\w)(\d+)\s*(?:minuti?|mins?|min|m)(?!\w)/g, multiplier: 1 }
        ];
        let total = 0;
        units.forEach(({ pattern, multiplier }) => {
            let match;
            while ((match = pattern.exec(raw)) !== null) total += Number(match[1]) * multiplier;
        });
        return normalizeMinutes(total);
    }

    // Il tempo resta una coordinata narrativa: nessun metabolismo automatico.
    function consumeMetabolism(character, minutes, resting) {
        const elapsed = normalizeMinutes(minutes);
        return { elapsed, carry: {}, staminaLoss: 0, hungerLoss: 0 };
    }

    function simulateDailyRoutine(character, minutes) {
        return null;
    }

    function describePassage(minutes) {
        const elapsed = normalizeMinutes(minutes);
        const days = Math.floor(elapsed / MINUTES_PER_DAY);
        const hours = Math.floor((elapsed % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
        const mins = elapsed % MINUTES_PER_HOUR;
        const parts = [];
        if (days) parts.push(`${days} giorno${days === 1 ? '' : 'i'}`);
        if (hours) parts.push(`${hours} ora${hours === 1 ? '' : 'e'}`);
        if (mins && !days) parts.push(`${mins} minut${mins === 1 ? 'o' : 'i'}`);
        return parts.join(' e ') || '0 minuti';
    }

    function createWorldGenerationSeed() {
        const now = Date.now().toString(36);
        let entropy = '';
        try {
            const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
            if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
                const values = new Uint32Array(2);
                cryptoApi.getRandomValues(values);
                entropy = `${values[0].toString(36)}${values[1].toString(36)}`;
            }
        } catch (error) {
            entropy = '';
        }
        if (!entropy) {
            entropy = `${Math.floor(Math.random() * 0xffffffff).toString(36)}${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
        }
        return `world-${now}-${entropy}`;
    }

    function ensureWorldGenerationSeed(context) {
        const target = context && typeof context === 'object' ? context : {};
        const current = String(target.worldGenerationSeed || '').trim();
        if (current) return current;
        const seed = createWorldGenerationSeed();
        try { target.worldGenerationSeed = seed; } catch (error) { /* immutable context */ }
        return seed;
    }

    function resetWorldEntities(memory) {
        if (!memory || typeof memory !== 'object') return memory;
        memory.npcs = [];
        memory.factions = [];
        memory.locations = [];
        memory.narrativeGoals = [];
        memory.world = {};
        memory.worldGenerationSeed = '';
        return memory;
    }

    return {
        MINUTES_PER_HOUR,
        MINUTES_PER_DAY,
        MINUTES_PER_WEEK,
        MINUTES_PER_MONTH,
        normalizeMinutes,
        parseTimeExpression,
        consumeMetabolism,
        simulateDailyRoutine,
        describePassage,
        createWorldGenerationSeed,
        ensureWorldGenerationSeed,
        resetWorldEntities
    };
});

// Nuova partita = mondo realmente nuovo.
// Il fallback non espone più nomi/preset predefiniti: genera nomi proceduralmente dal seed.
(function installFreshWorldPerGamePatch(root) {
    'use strict';

    const timeApi = root && root.CronacheTimeEnergy;
    const generator = root && root.CronacheWorldGenerator;
    const bootstrap = root && root.CronacheWorldBootstrap;
    if (!timeApi) return;

    const asArray = value => Array.isArray(value) ? value : [];
    const keyOf = value => String(value == null ? '' : value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    function hashText(value) {
        let hash = 2166136261;
        const text = String(value || '');
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function rngFor(seedValue) {
        let state = hashText(seedValue) || 0x9e3779b9;
        return function next() {
            state ^= state << 13;
            state ^= state >>> 17;
            state ^= state << 5;
            state >>>= 0;
            return state / 0x100000000;
        };
    }

    function pick(rng, values) {
        return values[Math.floor(rng() * values.length) % values.length];
    }

    function capitalize(value) {
        const text = String(value || '');
        return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
    }

    const soundBanks = {
        romance: {
            onset: ['al','ar','bel','ca','cor','del','el','fal','ga','lor','mar','ner','or','ra','sel','tor','val','ver'],
            middle: ['a','e','i','o','ia','io','en','er','el','on','or','an','ar','in'],
            ending: ['a','ia','io','ano','ara','era','eri','one','ora','ello','etti','ini','ano']
        },
        germanic: {
            onset: ['ald','ber','brand','dorn','eber','falk','ger','hart','karl','lind','rag','stein','wald','wer','wolf'],
            middle: ['a','e','i','o','en','er','ing','heim','ar','un'],
            ending: ['en','er','heim','berg','wald','mark','rich','mund','hardt','ingen']
        },
        slavic: {
            onset: ['bor','dar','drag','ivan','kaz','mil','nov','rad','stan','vel','vlad','yar','zor','mir'],
            middle: ['a','e','i','o','ova','ev','in','ar','or'],
            ending: ['ov','ova','ev','eva','ić','in','sky','ska','mir','grad']
        },
        desert: {
            onset: ['az','bar','dar','far','hal','kar','mal','nar','qas','ram','sar','tal','zar'],
            middle: ['a','i','u','al','ir','ar','im','un'],
            ending: ['an','ir','im','ar','un','ad','ah','iya','esh','ani']
        },
        fantasy: {
            onset: ['ae','ash','cae','drael','ely','fae','gal','ith','kae','lyr','mor','nyr','ory','ryn','syl','tha','vey','wyr'],
            middle: ['a','e','i','o','ae','ia','el','ir','or','yn','ara','eri'],
            ending: ['a','en','iel','ion','ira','is','or','os','yn','eth','ara','iel']
        }
    };

    function bankFor(world, context) {
        const text = keyOf(`${world?.setting || ''} ${context?.setting || ''} ${context?.story?.setting || ''} ${context?.story?.genre || ''}`);
        if (/arab|pers|desert|sahar|medio oriente|oriental/.test(text)) return soundBanks.desert;
        if (/slav|rus|polon|balcan|est europ|kiev/.test(text)) return soundBanks.slavic;
        if (/german|nord|viking|sasson|teuton|scandinav/.test(text)) return soundBanks.germanic;
        if (/ital|roman|mediterr|rinasc|latin|storico|medieval/.test(text)) return soundBanks.romance;
        return soundBanks.fantasy;
    }

    function proceduralWord(seed, index, bank, extra = '') {
        const rng = rngFor(`${seed}|${extra}|${index}`);
        const syllables = 2 + (rng() > 0.64 ? 1 : 0);
        let word = pick(rng, bank.onset);
        for (let step = 1; step < syllables; step++) word += pick(rng, bank.middle);
        word += pick(rng, bank.ending);
        return capitalize(word.replace(/(.)\1\1+/g, '$1$1'));
    }

    function uniqueProceduralWords(seed, count, bank, extra) {
        const result = [];
        const seen = new Set();
        let cursor = 0;
        while (result.length < count && cursor < count * 20) {
            const word = proceduralWord(seed, cursor++, bank, extra);
            const key = keyOf(word);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            result.push(word);
        }
        return result;
    }

    function replaceNamesInText(value, map) {
        if (typeof value !== 'string' || !value || !map.size) return value;
        let text = value;
        [...map.entries()]
            .sort((a, b) => String(b[0]).length - String(a[0]).length)
            .forEach(([before, after]) => {
                if (!before || before === after) return;
                text = text.split(before).join(after);
            });
        return text;
    }

    function remap(value, map) {
        return map.get(String(value || '')) || value;
    }

    function rewriteObjectText(target, map, excluded = new Set()) {
        if (!target || typeof target !== 'object') return;
        Object.keys(target).forEach(key => {
            if (excluded.has(key)) return;
            const value = target[key];
            if (typeof value === 'string') target[key] = replaceNamesInText(value, map);
            else if (Array.isArray(value)) {
                target[key] = value.map(item => typeof item === 'string' ? replaceNamesInText(item, map) : item);
            }
        });
    }

    function variationDirective(context, phase) {
        const seed = timeApi.ensureWorldGenerationSeed(context);
        return `\n\n=== IDENTITÀ UNICA DELLA NUOVA PARTITA ===\n` +
            `Seed di generazione: ${seed}\n` +
            `Fase: ${phase}. Questo seed identifica una NUOVA campagna indipendente.\n` +
            `- Genera nomi propri nuovi per questa partita; non usare nomi di esempio, preset o segnaposto ricorrenti.\n` +
            `- Mantieni genere, epoca e premessa, ma varia concretamente geografia, fazioni, persone, relazioni e obiettivi.\n` +
            `- Non riutilizzare automaticamente nomi visti in altre campagne o nelle istruzioni.\n` +
            `- Per seed diversi il mondo deve essere riconoscibilmente diverso.\n` +
            `- Non citare il seed nel JSON o nella narrazione.`;
    }

    function diversifyStaticFallbackWorld(world, seed, context = {}) {
        if (!world || typeof world !== 'object') return world;
        const locations = asArray(world.locations);
        const factions = asArray(world.factions);
        const isStaticFallback = locations.some(item => item?.id === 'loc-1') &&
            factions.some(item => item?.id === 'fac-1') &&
            !locations.some(item => /world-generator/i.test(String(item?.source || '')));
        if (!isStaticFallback) return world;

        const bank = bankFor(world, context);
        const roots = uniqueProceduralWords(seed, Math.max(12, locations.length + factions.length + 4), bank, 'world');
        const locationMap = new Map();
        const locationFormats = [
            root => root,
            root => `Locanda di ${root}`,
            root => `Bosco di ${root}`,
            root => `Rocca di ${root}`,
            root => `Santuario di ${root}`
        ];

        locations.forEach((location, index) => {
            if (!location?.name) return;
            const rootName = roots[index] || proceduralWord(seed, index, bank, 'location');
            const formatter = locationFormats[index] || (name => `Distretto di ${name}`);
            locationMap.set(location.name, formatter(rootName));
        });

        world.startLocation = remap(world.startLocation, locationMap);
        locations.forEach(location => {
            const oldName = location.name;
            location.name = remap(location.name, locationMap);
            location.id = `fresh-loc-${hashText(`${seed}|${location.name}`).toString(36)}`;
            if (Array.isArray(location.connections)) location.connections = location.connections.map(name => remap(name, locationMap));
            rewriteObjectText(location, locationMap, new Set(['name', 'id', 'connections']));
            if (oldName && world.name === oldName) world.name = location.name;
        });

        const factionMap = new Map();
        const factionFormats = [
            root => `Dominio di ${root}`,
            root => `Casata ${root}`,
            root => `Lega di ${root}`
        ];
        factions.forEach((faction, index) => {
            if (!faction?.name) return;
            const rootName = roots[locations.length + index] || proceduralWord(seed, index, bank, 'faction');
            const formatter = factionFormats[index] || (name => `Consiglio di ${name}`);
            factionMap.set(faction.name, formatter(rootName));
            faction.base = remap(faction.base, locationMap);
            faction.location = remap(faction.location, locationMap);
        });
        factions.forEach(faction => {
            faction.name = remap(faction.name, factionMap);
            faction.id = `fresh-fac-${hashText(`${seed}|${faction.name}`).toString(36)}`;
            rewriteObjectText(faction, locationMap, new Set(['name', 'id', 'base', 'location']));
            rewriteObjectText(faction, factionMap, new Set(['name', 'id']));
        });

        const allNamesMap = new Map([...locationMap, ...factionMap]);
        asArray(world.forces).forEach((force, index) => {
            force.faction = remap(force.faction, factionMap);
            force.actor = remap(force.actor, factionMap);
            force.disposition = remap(force.disposition, locationMap);
            force.location = remap(force.location, locationMap);
            const forceRoot = roots[locations.length + factions.length + index] || proceduralWord(seed, index, bank, 'force');
            if (force.name) force.name = `Forza di ${forceRoot}`;
            force.id = `fresh-force-${hashText(`${seed}|${force.name || index}`).toString(36)}`;
            rewriteObjectText(force, allNamesMap, new Set(['id', 'name', 'faction', 'actor', 'disposition', 'location']));
        });
        asArray(world.relations).forEach(relation => {
            relation.from = remap(remap(relation.from, locationMap), factionMap);
            relation.to = remap(remap(relation.to, locationMap), factionMap);
            rewriteObjectText(relation, allNamesMap, new Set(['from', 'to']));
        });

        world.generationSeed = seed;
        return world;
    }

    function diversifyFallbackNpcNames(world, seed, context = {}) {
        if (!world || typeof world !== 'object') return world;
        const actors = asArray(world.actors).filter(actor => keyOf(actor?.source) === 'fallback-npc');
        if (!actors.length) return world;

        const bank = bankFor(world, context);
        const firstNames = uniqueProceduralWords(seed, actors.length + 4, bank, 'npc-first');
        const surnames = uniqueProceduralWords(seed, actors.length + 4, bank, 'npc-last');
        const nameMap = new Map();

        actors.forEach((actor, index) => {
            const oldName = actor.name;
            const first = firstNames[index] || proceduralWord(seed, index, bank, 'npc-first');
            let surname = surnames[index] || proceduralWord(seed, index, bank, 'npc-last');
            if (keyOf(first) === keyOf(surname)) surname = proceduralWord(seed, index + 97, bank, 'npc-last-alt');
            const nextName = `${first} ${surname}`;
            if (oldName) nameMap.set(oldName, nextName);
            actor.name = nextName;
            actor.id = `fresh-npc-${hashText(`${seed}|${nextName}`).toString(36)}`;
        });

        const allMaps = new Map(nameMap);
        actors.forEach(actor => rewriteObjectText(actor, nameMap, new Set(['name', 'id'])));
        asArray(world.relations).forEach(relation => {
            relation.from = remap(relation.from, nameMap);
            relation.to = remap(relation.to, nameMap);
            rewriteObjectText(relation, allMaps, new Set(['from', 'to']));
        });
        asArray(world.forces).forEach(force => {
            force.actor = remap(force.actor, nameMap);
            rewriteObjectText(force, allMaps, new Set(['actor']));
        });
        return world;
    }

    if (generator && !(generator.__freshWorldPerGamePatchVersion >= 2)) {
        if (typeof generator.buildGenerationPrompt === 'function') {
            const original = generator.buildGenerationPrompt.bind(generator);
            generator.buildGenerationPrompt = function freshGenerationPrompt(story, context = {}) {
                return `${original(story, context)}${variationDirective(context, 'mondo completo')}`;
            };
        }
        if (typeof generator.buildLocationsPrompt === 'function') {
            const original = generator.buildLocationsPrompt.bind(generator);
            generator.buildLocationsPrompt = function freshLocationsPrompt(story, context = {}) {
                return `${original(story, context)}${variationDirective(context, 'geografia e fazioni')}`;
            };
        }
        if (typeof generator.buildNpcPrompt === 'function') {
            const original = generator.buildNpcPrompt.bind(generator);
            generator.buildNpcPrompt = function freshNpcPrompt(world, story, context = {}) {
                return `${original(world, story, context)}${variationDirective(context, 'NPC dello stesso nuovo mondo')}`;
            };
        }
        if (typeof generator.normalizeGeneratedWorld === 'function') {
            const original = generator.normalizeGeneratedWorld.bind(generator);
            generator.normalizeGeneratedWorld = function freshNormalizedWorld(generated, context = {}) {
                const seed = timeApi.ensureWorldGenerationSeed(context);
                const world = original(generated, context);
                if (world && typeof world === 'object') world.generationSeed = seed;
                return world;
            };
        }
        if (typeof generator.generateFallbackNpcs === 'function') {
            const original = generator.generateFallbackNpcs.bind(generator);
            generator.generateFallbackNpcs = function freshFallbackNpcs(world, context = {}) {
                const seed = timeApi.ensureWorldGenerationSeed(context);
                diversifyStaticFallbackWorld(world, seed, context);
                const result = original(world, context);
                const target = result && typeof result === 'object' ? result : world;
                diversifyFallbackNpcNames(target, seed, context);
                if (target && typeof target === 'object') target.generationSeed = seed;
                return target;
            };
        }
        generator.__freshWorldPerGamePatchVersion = 2;
    }

    if (bootstrap && !(bootstrap.__freshWorldPerGamePatchVersion >= 2) && typeof bootstrap.projectToMemory === 'function') {
        const originalProjectToMemory = bootstrap.projectToMemory.bind(bootstrap);
        bootstrap.projectToMemory = function freshWorldProjection(worldValue, memory, context = {}) {
            const turn = Math.max(0, Number(context.turn) || 0);
            const seed = String(context.worldGenerationSeed || worldValue?.generationSeed || '').trim();
            const generatedEntities = [
                ...asArray(worldValue?.locations),
                ...asArray(worldValue?.actors),
                ...asArray(worldValue?.factions)
            ];
            const isFreshGeneratedWorld = turn === 0 && Boolean(seed) && (
                Boolean(worldValue?.generationSeed) ||
                generatedEntities.some(item => /world-generator|fallback-npc/i.test(String(item?.source || '')))
            );

            if (isFreshGeneratedWorld && memory && memory.worldGenerationSeed !== seed) {
                timeApi.resetWorldEntities(memory);
                memory.worldGenerationSeed = seed;
            }
            const state = originalProjectToMemory(worldValue, memory, context);
            if (isFreshGeneratedWorld && state) state.worldGenerationSeed = seed;
            return state;
        };
        bootstrap.__freshWorldPerGamePatchVersion = 2;
    }

    function installNewGameResetHook() {
        if (typeof document === 'undefined') return;
        const button = document.getElementById('btn-start-game');
        if (!button || button.dataset.freshWorldReset === '2' || typeof button.onclick !== 'function') return;
        const originalStart = button.onclick;
        const wrappedStart = function freshWorldStart(...args) {
            try {
                if (typeof G !== 'undefined' && G?.worldMemory) timeApi.resetWorldEntities(G.worldMemory);
            } catch (error) {
                console.warn('[FreshWorld] Reset preventivo non disponibile:', error);
            }
            const result = originalStart.apply(this, args);
            try {
                if (typeof G !== 'undefined' && G?.worldMemory) timeApi.resetWorldEntities(G.worldMemory);
            } catch (error) {
                console.warn('[FreshWorld] Reset post-avvio non disponibile:', error);
            }
            return result;
        };
        button.onclick = wrappedStart;
        button.dataset.freshWorldReset = '2';
        try {
            if (root && typeof root.startNewGame === 'function') root.startNewGame = wrappedStart;
        } catch (error) {
            // Il binding globale può essere lessicale: il bottone resta comunque patchato.
        }
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', installNewGameResetHook, { once: true });
        }
        setTimeout(installNewGameResetHook, 0);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
