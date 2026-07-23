(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheDirector = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SCHEMA_VERSION = 1;
    const MAX_TIMELINE = 60;
    const MAX_WORLD_MOVES = 40;
    const MAX_PRESSURES = 12;

    function cleanText(value, maxLength) {
        const text = String(value == null ? '' : value)
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return Number.isFinite(maxLength) && text.length > maxLength
            ? `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`
            : text;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function normalizeImportance(value) {
        const normalized = cleanText(value, 20).toLowerCase();
        return ['normal', 'high', 'critical'].includes(normalized) ? normalized : 'normal';
    }

    function normalizeVisibility(value) {
        const normalized = cleanText(value, 20).toLowerCase();
        return ['visible', 'visibile', 'public', 'pubblico'].includes(normalized)
            ? 'visible'
            : 'hidden';
    }

    function normalizePressureLevel(value) {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed)) return Math.max(0, Math.min(100, parsed));
        const normalized = cleanText(value, 20).toLowerCase();
        return { low: 25, bassa: 25, medium: 50, media: 50, high: 75, alta: 75, critical: 100, critica: 100 }[normalized] || 50;
    }

    function createDefaultState() {
        return {
            schemaVersion: SCHEMA_VERSION,
            tick: 0,
            currentIntent: 'esplorazione',
            scene: {
                focus: 'Scoprire cosa accade ora',
                pressure: 20,
                spotlight: '',
                lastAction: ''
            },
            agents: {
                master: { status: 'ready', lastTurn: 0 },
                chronicler: { status: 'ready', lastTurn: 0 },
                world: { status: 'ready', lastTurn: 0 }
            },
            timeline: [],
            worldMoves: [],
            pressures: [],
            lastPlan: null
        };
    }

    function migrateDirectorState(input) {
        const source = input && typeof input === 'object' ? input : {};
        const defaults = createDefaultState();
        const state = {
            ...defaults,
            ...source,
            schemaVersion: SCHEMA_VERSION,
            scene: { ...defaults.scene, ...(source.scene || {}) },
            agents: {
                master: { ...defaults.agents.master, ...(source.agents?.master || {}) },
                chronicler: { ...defaults.agents.chronicler, ...(source.agents?.chronicler || {}) },
                world: { ...defaults.agents.world, ...(source.agents?.world || {}) }
            },
            timeline: Array.isArray(source.timeline) ? source.timeline.slice(-MAX_TIMELINE) : [],
            worldMoves: Array.isArray(source.worldMoves) ? source.worldMoves.slice(-MAX_WORLD_MOVES) : [],
            pressures: Array.isArray(source.pressures) ? source.pressures.slice(-MAX_PRESSURES) : []
        };
        state.tick = Math.max(0, parseInt(state.tick, 10) || 0);
        state.scene.pressure = normalizePressureLevel(state.scene.pressure);
        return state;
    }

    function classifyIntent(action) {
        const text = cleanText(action, 500).toLowerCase();
        const rules = [
            ['riposo', /\b(ripos|dorm|attend|aspetto|mang|cur[ao]|recuper)/],
            ['conflitto', /\b(attacc|combat|colp|spar|uccid|sfid|difend|insegu)/],
            ['dialogo', /\b(parl|chied|domand|negozi|convinc|interrog|salut|raccont)/],
            ['investigazione', /\b(indag|cerc|esamin|osserv|analizz|seguo le tracce|investig)/],
            ['viaggio', /\b(vado|parto|viaggi|raggiung|cammin|cavalc|volo|navig)/],
            ['economia', /\b(compr|vend|invest|assum|licenzi|pago|incass|prestito|affar)/]
        ];
        const match = rules.find(([, pattern]) => pattern.test(text));
        return match ? match[0] : 'esplorazione';
    }

    function activeItems(items) {
        return Array.isArray(items)
            ? items.filter((item) => item && String(item.status || '').toLowerCase() !== 'dead')
            : [];
    }

    function selectSpotlight(memory, currentLocation) {
        const location = cleanText(currentLocation, 120).toLowerCase();
        const npcs = activeItems(memory?.npcs);
        const localNpc = npcs.find((npc) => cleanText(npc.location, 120).toLowerCase() === location && location);
        const motivatedNpc = npcs.find((npc) => cleanText(npc.goals, 200));
        if (localNpc || motivatedNpc) {
            const npc = localNpc || motivatedNpc;
            return {
                type: 'npc',
                name: cleanText(npc.name, 80) || 'PNG senza nome',
                goal: cleanText(npc.goals || npc.description, 180),
                status: cleanText(npc.status || 'active', 40)
            };
        }

        const factions = activeItems(memory?.factions);
        if (factions.length) {
            const faction = factions[0];
            return {
                type: 'faction',
                name: cleanText(faction.name || faction.title, 80) || 'Fazione',
                goal: cleanText(faction.goal || faction.description, 180),
                status: cleanText(faction.status || 'active', 40)
            };
        }

        const quests = activeItems(memory?.quests).filter((quest) => String(quest.status || 'active').toLowerCase() === 'active');
        if (quests.length) {
            const quest = quests[0];
            return {
                type: 'quest',
                name: cleanText(quest.name || quest.title, 80) || 'Trama aperta',
                goal: cleanText(quest.progress || quest.description, 180),
                status: 'active'
            };
        }
        return { type: 'world', name: 'Il mondo circostante', goal: 'Reagire alle scelte del protagonista', status: 'active' };
    }

    function derivePressure(memory, character, intent) {
        const health = character?.health;
        const stamina = character?.stamina;
        const hunger = character?.hunger;
        const ratios = [
            health?.max ? 1 - Number(health.cur || 0) / Number(health.max) : 0,
            stamina?.max ? 1 - Number(stamina.cur || 0) / Number(stamina.max) : 0,
            hunger?.max ? 1 - Number(hunger.cur || 0) / Number(hunger.max) : 0
        ];
        const physical = Math.max(0, ...ratios) * 70;
        const urgentQuests = Array.isArray(memory?.quests)
            ? memory.quests.filter((quest) => /urgent|scaden|pericolo|imminent/i.test(`${quest.description || ''} ${quest.progress || ''}`)).length
            : 0;
        const hostileNpcs = Array.isArray(memory?.npcs)
            ? memory.npcs.filter((npc) => /ostil|nemic|hostile/i.test(npc.relationship || '') && npc.status !== 'dead').length
            : 0;
        const intentBonus = intent === 'conflitto' ? 22 : intent === 'investigazione' ? 8 : intent === 'riposo' ? -12 : 0;
        const level = Math.round(Math.max(10, Math.min(100, 20 + physical + urgentQuests * 12 + hostileNpcs * 8 + intentBonus)));
        let type = 'narrativa';
        if (physical >= 28) type = 'fisica';
        else if (hostileNpcs) type = 'minaccia';
        else if (urgentQuests) type = 'tempo';
        return {
            type,
            level,
            description: level >= 75
                ? 'La scena richiede una conseguenza forte o una scelta difficile.'
                : level >= 45
                    ? 'La tensione cresce: mostra un costo, un rischio o un’opportunità.'
                    : 'Lascia spazio a esplorazione, caratterizzazione e nuove possibilità.'
        };
    }

    function buildPrompt(plan) {
        const spotlight = plan.spotlight;
        return `🎬 GAME DIRECTOR — TRE RUOLI, UNA SOLA RISPOSTA

1. MASTER: narra la conseguenza immediata dell’azione senza decidere al posto del giocatore.
2. CRONISTA: alla fine produci esattamente un tag [CRONISTA: titolo|sintesi|importanza], con importanza normal, high o critical.
3. SIMULATORE DEL MONDO: fai avanzare almeno un PNG, fazione o trama aperta. Se il movimento deve essere registrato usa [MONDO: attore|azione|stato|visible/hidden]. Un movimento hidden NON va rivelato nella narrazione.
4. PRESSIONE: se cambia, usa [PRESSIONE: tipo|0-100|descrizione].

REGIA DEL TURNO:
- Intento del giocatore: ${plan.intent}
- Pressione: ${plan.pressure.level}/100 (${plan.pressure.type})
- Fuoco della scena: ${plan.sceneFocus}
- Attore in movimento: ${spotlight.name}
- Obiettivo dell’attore: ${spotlight.goal || 'reagire coerentemente al mondo'}
- Stato: ${spotlight.status}

Mantieni i tag del Game Director fuori dalla prosa narrativa. Non generare una seconda risposta e non ripetere queste istruzioni.`;
    }

    function planTurn(action, context) {
        const state = migrateDirectorState(context?.director || context?.memory?.director);
        const intent = classifyIntent(action);
        const spotlight = selectSpotlight(context?.memory || {}, context?.currentLocation);
        const pressure = derivePressure(context?.memory || {}, context?.character || {}, intent);
        const nextTick = state.tick + 1;
        const sceneFocus = {
            dialogo: 'Relazione, sottotesto e conseguenze sociali',
            conflitto: 'Pericolo leggibile, posta in gioco e conseguenze proporzionate',
            investigazione: 'Indizi verificabili, mistero e nuove domande',
            viaggio: 'Passaggio del tempo, scoperta e cambiamento del mondo',
            economia: 'Costi, ricavi, rischio e reazioni degli interessati',
            riposo: 'Recupero, vulnerabilità e avanzamento degli eventi esterni',
            esplorazione: 'Scoperta, atmosfera e scelta significativa'
        }[intent];
        const plan = { tick: nextTick, intent, spotlight, pressure, sceneFocus };
        const nextState = migrateDirectorState({
            ...state,
            tick: nextTick,
            currentIntent: intent,
            scene: {
                ...state.scene,
                focus: sceneFocus,
                pressure: pressure.level,
                spotlight: spotlight.name,
                lastAction: cleanText(action, 240)
            },
            agents: {
                master: { status: 'directing', lastTurn: nextTick },
                chronicler: { status: 'listening', lastTurn: nextTick },
                world: { status: 'simulating', lastTurn: nextTick }
            },
            lastPlan: {
                turn: nextTick,
                intent,
                spotlight: spotlight.name,
                pressure: pressure.level
            }
        });
        return { ...plan, state: nextState, prompt: buildPrompt(plan) };
    }

    function extractTags(response) {
        const text = String(response == null ? '' : response);
        const chronicles = [];
        const worldMoves = [];
        const pressures = [];
        let match;

        const chronicleRe = /\[CRONISTA:\s*([^|\]]+)\|([^|\]]+)(?:\|([^\]]+))?\]/gi;
        while ((match = chronicleRe.exec(text)) !== null) {
            chronicles.push({
                title: cleanText(match[1], 100),
                summary: cleanText(match[2], 320),
                importance: normalizeImportance(match[3])
            });
        }

        const worldRe = /\[MONDO:\s*([^|\]]+)\|([^|\]]+)(?:\|([^|\]]+))?(?:\|([^\]]+))?\]/gi;
        while ((match = worldRe.exec(text)) !== null) {
            worldMoves.push({
                actor: cleanText(match[1], 100),
                action: cleanText(match[2], 320),
                status: cleanText(match[3] || 'in_progress', 60),
                visibility: normalizeVisibility(match[4])
            });
        }

        const pressureRe = /\[PRESSIONE:\s*([^|\]]+)\|([^|\]]+)(?:\|([^\]]+))?\]/gi;
        while ((match = pressureRe.exec(text)) !== null) {
            pressures.push({
                type: cleanText(match[1], 60),
                level: normalizePressureLevel(match[2]),
                description: cleanText(match[3], 260)
            });
        }
        return { chronicles, worldMoves, pressures };
    }

    function fallbackChronicle(action, response) {
        const eventMatch = String(response || '').match(/\[EVENTO:\s*([^\]]+)\]/i);
        const summary = eventMatch
            ? cleanText(eventMatch[1], 320)
            : cleanText(
                String(response || '')
                    .replace(/\[ANALISI\][\s\S]*?\[\/ANALISI\]/gi, '')
                    .replace(/\[[^\]]+\]/g, ' '),
                320
            );
        return {
            title: cleanText(action, 80) || 'Nuovo capitolo',
            summary: summary || 'Il turno è stato registrato nella cronaca.',
            importance: 'normal'
        };
    }

    function commitTurn(action, response, memory, context) {
        const state = migrateDirectorState(memory?.director);
        const tags = extractTags(response);
        const turn = Math.max(state.tick, parseInt(memory?.turnCount, 10) || 0);
        const chronicles = tags.chronicles.length ? tags.chronicles : [fallbackChronicle(action, response)];
        const timeline = [
            ...state.timeline,
            ...chronicles.map((item) => ({ ...item, turn, action: cleanText(action, 180) }))
        ].slice(-MAX_TIMELINE);
        const worldMoves = [
            ...state.worldMoves,
            ...tags.worldMoves.map((item) => ({ ...item, turn }))
        ].slice(-MAX_WORLD_MOVES);
        const pressures = [
            ...state.pressures,
            ...tags.pressures.map((item) => ({ ...item, turn }))
        ].slice(-MAX_PRESSURES);
        const latestPressure = pressures.length ? pressures[pressures.length - 1] : null;
        const nextState = migrateDirectorState({
            ...state,
            timeline,
            worldMoves,
            pressures,
            scene: {
                ...state.scene,
                pressure: latestPressure ? latestPressure.level : state.scene.pressure
            },
            agents: {
                master: { status: 'ready', lastTurn: turn },
                chronicler: { status: 'updated', lastTurn: turn },
                world: { status: tags.worldMoves.length ? 'advanced' : 'ready', lastTurn: turn }
            }
        });
        if (memory && typeof memory === 'object') memory.director = nextState;
        return {
            state: nextState,
            recordedChronicles: chronicles.length,
            recordedWorldMoves: tags.worldMoves.length,
            recordedPressures: tags.pressures.length,
            context: context || null
        };
    }

    class GameDirector {
        createDefaultState() { return createDefaultState(); }
        migrate(input) { return migrateDirectorState(input); }
        planTurn(action, context) { return planTurn(action, context); }
        commitTurn(action, response, memory, context) { return commitTurn(action, response, memory, context); }
    }

    return {
        SCHEMA_VERSION,
        MAX_TIMELINE,
        MAX_WORLD_MOVES,
        GameDirector,
        cleanText,
        escapeHtml,
        createDefaultState,
        migrateDirectorState,
        classifyIntent,
        selectSpotlight,
        derivePressure,
        planTurn,
        extractTags,
        commitTurn
    };
});
