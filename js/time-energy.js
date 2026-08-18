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

    // Compatibilità con i vecchi salvataggi: il tempo resta una coordinata
    // narrativa, ma non consuma più automaticamente energia, sazietà o salute.
    function consumeMetabolism(character, minutes, resting) {
        const elapsed = normalizeMinutes(minutes);
        return { elapsed, carry: {}, staminaLoss: 0, hungerLoss: 0 };
    }

    // Conservata come API legacy. Pasti, sonno e routine non sono più statistiche
    // da simulare: entrano nella storia soltanto se sono rilevanti per una scena.
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

// Nuova partita = mondo realmente nuovo. Questo patch viene caricato dopo
// world-generator/world-bootstrap e prima dello script principale del gioco.
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

    function remap(value, map) {
        return map.get(String(value || '')) || value;
    }

    function variationDirective(context, phase) {
        const seed = timeApi.ensureWorldGenerationSeed(context);
        return `\n\n=== IDENTITÀ UNICA DELLA NUOVA PARTITA ===\n` +
            `Seed di generazione: ${seed}\n` +
            `Fase: ${phase}. Questo seed identifica una NUOVA campagna indipendente.\n` +
            `- Non riciclare automaticamente nomi, composizione, gerarchie o luoghi tipici di una risposta precedente.\n` +
            `- Mantieni genere, epoca e premessa, ma varia concretamente nomi propri, fazioni, distribuzione geografica, relazioni e obiettivi.\n` +
            `- Per seed diversi, il mondo deve risultare riconoscibilmente diverso pur restando coerente.\n` +
            `- Non citare il seed nel JSON o nella narrazione.`;
    }

    const fallbackVariants = [
        {
            locations: ['Vallebruma', "La Lanterna d'Argento", 'Bosco delle Querce Nere', 'Torre Spezzata', 'Santuario delle Sette Campane'],
            factions: ['Corona di Vallebruma', 'Casata Serani', 'Lega delle Vie Mercantili']
        },
        {
            locations: ['Rocca Fosca', 'Il Viandante Rosso', 'Selva di Corvombra', 'Fortezza di Vetro', 'Abbazia della Luna'],
            factions: ['Marca di Rocca Fosca', 'Casata Vardeni', 'Compagnia dei Mercanti Liberi']
        },
        {
            locations: ['Borgo delle Ceneri', 'La Volpe Bianca', 'Foresta di Pietranera', 'Rocca del Falco', 'Monastero delle Acque'],
            factions: ['Dominio delle Ceneri', 'Casata Altavilla', 'Confraternita delle Bilance']
        },
        {
            locations: ['Neravalle', 'Il Cervo Dorato', 'Bosco di Selvalunga', 'Mastio delle Nebbie', 'Tempio della Stella'],
            factions: ['Signoria di Neravalle', 'Casata Orseni', 'Gilda delle Tre Strade']
        },
        {
            locations: ['Castelvento', 'La Campana Blu', 'Foresta del Confine', 'Torre delle Rondini', 'Abbazia di San Lume'],
            factions: ['Ducato di Castelvento', 'Casata Bellori', 'Lega dei Carovanieri']
        },
        {
            locations: ['Pietralba', 'Il Grifone Verde', 'Selva dei Sussurri', 'Rocca delle Lance', 'Santuario del Fiume'],
            factions: ['Principato di Pietralba', 'Casata Neroni', 'Compagnia del Sale']
        },
        {
            locations: ['Vespera', 'La Chiave di Rame', 'Bosco delle Lanterne', 'Forte del Corvo', 'Monastero del Vespro'],
            factions: ['Consiglio di Vespera', 'Casata Malverdi', 'Corporazione delle Rotte']
        },
        {
            locations: ['Altacosta', "L'Ancora d'Oro", 'Selva delle Colline', 'Castello di Levante', 'Santuario delle Maree'],
            factions: ['Corona di Altacosta', 'Casata Doria Nova', 'Lega dei Porti Interni']
        }
    ];

    const fallbackFirstNames = [
        'Aldren', 'Mirella', 'Corvin', 'Serena', 'Leandro', 'Ysabet', 'Ruggero', 'Livia',
        'Taddeo', 'Aurelia', 'Nereo', 'Viola', 'Cassian', 'Ginevra', 'Dario', 'Elowen'
    ];
    const fallbackSurnames = [
        'Valeri', 'Rocchi', 'Vesperi', 'Montelupo', 'Corvini', 'Bellafonte', 'Neretti', 'Altieri',
        'Serrani', 'Dalmoro', 'Venturi', 'Lunardi', 'Ferretti', 'Selvani', 'Maraldi', 'Pietranera'
    ];

    function diversifyStaticFallbackWorld(world, seed) {
        if (!world || typeof world !== 'object') return world;
        const locations = asArray(world.locations);
        const factions = asArray(world.factions);
        const isStaticFallback = locations.some(item => item?.id === 'loc-1') &&
            factions.some(item => item?.id === 'fac-1') &&
            !locations.some(item => /world-generator/i.test(String(item?.source || '')));
        if (!isStaticFallback) return world;

        const variant = fallbackVariants[hashText(seed) % fallbackVariants.length];
        const locationMap = new Map();
        locations.forEach((location, index) => {
            if (!location?.name || !variant.locations[index]) return;
            locationMap.set(location.name, variant.locations[index]);
        });
        world.startLocation = remap(world.startLocation, locationMap);
        locations.forEach(location => {
            location.name = remap(location.name, locationMap);
            if (Array.isArray(location.connections)) {
                location.connections = location.connections.map(name => remap(name, locationMap));
            }
        });

        const factionMap = new Map();
        factions.forEach((faction, index) => {
            if (!faction?.name || !variant.factions[index]) return;
            factionMap.set(faction.name, variant.factions[index]);
            faction.base = remap(faction.base, locationMap);
        });
        factions.forEach(faction => { faction.name = remap(faction.name, factionMap); });
        asArray(world.forces).forEach(force => {
            force.faction = remap(force.faction, factionMap);
            force.actor = remap(force.actor, factionMap);
            force.disposition = remap(force.disposition, locationMap);
            force.location = remap(force.location, locationMap);
        });
        asArray(world.relations).forEach(relation => {
            relation.from = remap(remap(relation.from, locationMap), factionMap);
            relation.to = remap(remap(relation.to, locationMap), factionMap);
        });
        world.generationSeed = seed;
        return world;
    }

    function diversifyFallbackNpcNames(world, seed) {
        if (!world || typeof world !== 'object') return world;
        const actors = asArray(world.actors).filter(actor => keyOf(actor?.source) === 'fallback-npc');
        if (!actors.length) return world;
        const offset = hashText(`${seed}|npc`) % fallbackFirstNames.length;
        const nameMap = new Map();
        actors.forEach((actor, index) => {
            const oldName = actor.name;
            const first = fallbackFirstNames[(offset + index * 3) % fallbackFirstNames.length];
            const surname = fallbackSurnames[(offset * 3 + index * 5) % fallbackSurnames.length];
            const nextName = `${first} ${surname}`;
            if (oldName) nameMap.set(oldName, nextName);
            actor.name = nextName;
            actor.id = `fresh-npc-${hashText(`${seed}|${nextName}`).toString(36)}`;
        });
        asArray(world.relations).forEach(relation => {
            relation.from = remap(relation.from, nameMap);
            relation.to = remap(relation.to, nameMap);
        });
        return world;
    }

    if (generator && generator.__freshWorldPerGamePatchVersion < 1) {
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
                diversifyStaticFallbackWorld(world, seed);
                const result = original(world, context);
                const target = result && typeof result === 'object' ? result : world;
                diversifyFallbackNpcNames(target, seed);
                if (target && typeof target === 'object') target.generationSeed = seed;
                return target;
            };
        }
        generator.__freshWorldPerGamePatchVersion = 1;
    }

    if (bootstrap && bootstrap.__freshWorldPerGamePatchVersion < 1 && typeof bootstrap.projectToMemory === 'function') {
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
        bootstrap.__freshWorldPerGamePatchVersion = 1;
    }

    function installNewGameResetHook() {
        if (typeof document === 'undefined') return;
        const button = document.getElementById('btn-start-game');
        if (!button || button.dataset.freshWorldReset === '1' || typeof button.onclick !== 'function') return;
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
        button.dataset.freshWorldReset = '1';
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
