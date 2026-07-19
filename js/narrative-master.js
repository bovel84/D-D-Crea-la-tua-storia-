(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheNarrative = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const COMPASS_SCHEMA_VERSION = 1;
    const FOCI = ['esplorazione', 'combattimento', 'dialogo', 'rivelazione', 'cliffhanger'];

    function asArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function compactUnique(values, maxItems) {
        const seen = new Set();
        return asArray(values).filter(value => {
            const text = typeof value === 'string' ? value : value?.label || value?.name || value?.summary || value?.canonical || '';
            const key = text.toLowerCase().replace(/\s+/g, ' ').trim();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(-maxItems);
    }

    function createDefaultCompass() {
        return {
            compassSchemaVersion: COMPASS_SCHEMA_VERSION,
            tone: 'epico',
            playerGoals: [],
            characterGoals: [],
            openThreads: [],
            futureBranches: [],
            currentFocus: 'esplorazione',
            lastDecision: null,
            contradictions: [],
            worldTick: 0,
            lastProactiveTurn: 0
        };
    }

    function migrateCompass(source) {
        const defaults = createDefaultCompass();
        const data = source && typeof source === 'object' ? source : {};
        return {
            ...defaults,
            ...data,
            compassSchemaVersion: COMPASS_SCHEMA_VERSION,
            playerGoals: asArray(data.playerGoals),
            characterGoals: asArray(data.characterGoals),
            openThreads: asArray(data.openThreads),
            futureBranches: asArray(data.futureBranches),
            contradictions: asArray(data.contradictions)
        };
    }

    function detectTone(story, action, previousTone) {
        const corpus = `${story?.setting || ''} ${story?.personality || ''} ${story?.desc || ''} ${action || ''}`.toLowerCase();
        if (/tragic|tragic|lutto|morte|sacrific|disperaz/.test(corpus)) return 'tragico';
        if (/oscuro|gotic|horror|terrore|sinistr|tenebr/.test(corpus)) return 'oscuro';
        if (/legger|comico|iron|festa|giocos|spensier/.test(corpus)) return 'leggero';
        if (/epic|eroic|leggenda|battaglia|destino/.test(corpus)) return 'epico';
        return previousTone || 'epico';
    }

    function chooseFocus(action, memory, compass) {
        const text = String(action || '').toLowerCase();
        if (/attacc|combat|colp|duell|spar|lotto|difend|insegu/.test(text)) return 'combattimento';
        if (/parl|chied|dico|negozi|convinc|interrog|dialog|salut/.test(text)) return 'dialogo';
        if (/cerco|esplor|osserv|entro|viaggi|torno|vado|seguo|investig/.test(text)) return 'esplorazione';
        if (/segreto|verit|rivela|indizio|mister|scopro|leggo/.test(text)) return 'rivelazione';

        const activeThreads = asArray(memory?.quests).filter(quest => quest.status === 'active');
        const hasRevealedSecrets = asArray(memory?.revealedSecrets).length > 0;
        if (compass.worldTick > 0 && compass.worldTick % 4 === 0 && activeThreads.length) return 'cliffhanger';
        if (hasRevealedSecrets && compass.currentFocus === 'esplorazione') return 'rivelazione';
        return compass.currentFocus || 'esplorazione';
    }

    function analyzeState(state) {
        const memory = state.memory || {};
        const character = state.character || {};
        const activeQuests = asArray(memory.quests).filter(quest => quest.status === 'active');
        const mobileNPCs = asArray(memory.npcs).filter(npc => npc.status !== 'dead');
        const urgent = [];

        if (character.health?.max && character.health.cur / character.health.max <= 0.3) urgent.push('salute critica');
        if (character.stamina?.cur <= 25) urgent.push('energia critica');
        if (character.hunger?.cur <= 25) urgent.push('fame critica');
        if (character.gold < 0) urgent.push('debito attivo');

        return {
            turn: Number(memory.turnCount || 0),
            location: state.currentLocation || 'Sconosciuto',
            activeQuests: activeQuests.map(quest => quest.name),
            activeNPCs: mobileNPCs.map(npc => npc.name),
            urgent,
            recentEvents: asArray(memory.events).slice(-3).map(event => event.summary)
        };
    }

    function evaluateConsequences(action, memory) {
        const text = String(action || '').trim();
        const consequences = [];
        const lastDecision = asArray(memory?.playerDecisions).slice(-1)[0];
        const lastEvent = asArray(memory?.events).slice(-1)[0];
        const hostileNPC = asArray(memory?.npcs).find(npc => /nemic|ostile|rivale/i.test(npc.relationship || ''));

        if (lastDecision) consequences.push(`La decisione precedente («${lastDecision.summary || lastDecision.description}») deve produrre un effetto osservabile.`);
        if (lastEvent) consequences.push(`L'evento recente «${lastEvent.summary}» non va dimenticato.`);
        if (/attacc|tradisc|rub|minacc/i.test(text)) consequences.push('La reputazione e le relazioni possono peggiorare, anche senza testimoni diretti evidenti.');
        if (/aiut|salv|don|proteg|mantengo la promessa/i.test(text)) consequences.push('Fiducia, debiti di gratitudine o aspettative future possono aumentare.');
        if (hostileNPC) consequences.push(`${hostileNPC.name} può agire fuori scena perseguendo il proprio obiettivo.`);
        if (!consequences.length) consequences.push('Mostrare almeno una conseguenza logica o un cambiamento dello stato della scena.');
        return consequences;
    }

    function findContradictions(action, state) {
        const text = String(action || '').toLowerCase();
        const memory = state.memory || {};
        const contradictions = [];

        asArray(memory.npcs)
            .filter(npc => String(npc.status || '').toLowerCase() === 'dead')
            .forEach(npc => {
                const name = String(npc.name || '').toLowerCase();
                if (!name || !text.includes(name)) return;
                if (/parlo|chiedo|saluto|incontro|seguo|convoco|telefono|scrivo a/.test(text)) {
                    contradictions.push({
                        type: 'npc_status',
                        canonical: `${npc.name} risulta morto nella memoria persistente.`,
                        requested: action,
                        resolution: `Non resuscitare ${npc.name} implicitamente: integra il ricordo, un equivoco o chiedi una breve precisazione in modo naturale.`
                    });
                }
            });

        const currentLocation = String(state.currentLocation || '');
        const explicitLocation = String(action || '').match(/(?:sono|mi trovo)\s+(?:a|al|alla|nel|nella)\s+([^,.!?]+)/i);
        if (explicitLocation && currentLocation && currentLocation !== 'Sconosciuto') {
            const claimed = explicitLocation[1].trim();
            if (!claimed.toLowerCase().includes(currentLocation.toLowerCase()) && !currentLocation.toLowerCase().includes(claimed.toLowerCase())) {
                contradictions.push({
                    type: 'location',
                    canonical: `La posizione salvata è ${currentLocation}.`,
                    requested: `Il giocatore dichiara di trovarsi a ${claimed}.`,
                    resolution: 'Se lo spostamento non è già avvenuto, chiarisci naturalmente il tragitto o chiedi conferma.'
                });
            }
        }

        return contradictions;
    }

    function selectProactiveBeat(state, compass, focus) {
        const memory = state.memory || {};
        const activeNPCs = asArray(memory.npcs).filter(npc => npc.status !== 'dead' && npc.goals);
        const activeQuests = asArray(memory.quests).filter(quest => quest.status === 'active');
        const hour = Number(state.time?.hour ?? 12);

        if (activeNPCs.length) {
            const npc = activeNPCs[compass.worldTick % activeNPCs.length];
            return `Fai avanzare autonomamente ${npc.name}: il suo obiettivo è «${npc.goals}». Mostrane un segnale concreto, diretto o fuori scena.`;
        }
        if (activeQuests.length) {
            const quest = activeQuests[compass.worldTick % activeQuests.length];
            return `La trama «${quest.name}» evolve anche senza iniziativa del giocatore: introduci una conseguenza, una pressione o un'opportunità coerente.`;
        }
        if (focus === 'cliffhanger') return 'Introduci un cambiamento inatteso ma già preparato dagli elementi della scena, poi chiudi su una scelta significativa.';
        if (hour >= 20 || hour < 6) return 'Fai percepire l’evoluzione notturna dell’ambiente: routine, pericoli, chiusure e movimenti degli NPC.';
        return 'Introduci un piccolo evento ambientale che renda il mondo autonomo senza sottrarre la decisione al giocatore.';
    }

    function formatCompass(compass) {
        const list = values => values.length ? values.map(value => typeof value === 'string' ? value : value.label || value.name || value.summary).join('; ') : 'nessuno';
        return [
            `Tono attuale: ${compass.tone}`,
            `Focus: ${compass.currentFocus}`,
            `Obiettivi del giocatore: ${list(compass.playerGoals)}`,
            `Obiettivi dei personaggi: ${list(compass.characterGoals)}`,
            `Trame aperte: ${list(compass.openThreads)}`,
            `Ramificazioni potenziali: ${list(compass.futureBranches)}`
        ].join('\n');
    }

    function decisionToPrompt(decision, compass) {
        const contradictionText = decision.contradictions.length
            ? decision.contradictions.map(item => `- ${item.canonical} ${item.resolution}`).join('\n')
            : '- Nessuna contraddizione evidente. Se ne emerge una, dai priorità ai fatti persistenti e chiedi chiarimenti solo quando l’ambiguità cambia davvero l’esito.';

        return [
            'CICLO DECISIONALE DEL MASTER (da applicare prima di narrare):',
            `1. Analisi dello stato: turno ${decision.analysis.turn}, posizione ${decision.analysis.location}, urgenze: ${decision.analysis.urgent.join(', ') || 'nessuna'}.`,
            `2. Conseguenze da far maturare: ${decision.consequences.join(' ')}`,
            `3. Focus narrativo scelto: ${decision.focus}.`,
            `4. Generazione: ${decision.proactiveBeat}`,
            '',
            'NARRATIVE COMPASS:',
            formatCompass(compass),
            '',
            'CONTROLLO COERENZA:',
            contradictionText,
            '',
            'Non limitarti a reagire: fai avanzare almeno un elemento del mondo o una trama. Non decidere però al posto del giocatore.'
        ].join('\n');
    }

    function derivePlayerGoal(action) {
        const match = String(action || '').match(/(?:voglio|intendo|decido di|il mio obiettivo è|cerco di)\s+([^.!?]{4,140})/i);
        return match ? match[1].trim() : '';
    }

    class NarrativeMasterEngine {
        createDefaultCompass() {
            return createDefaultCompass();
        }

        migrate(compass) {
            return migrateCompass(compass);
        }

        decide(action, state) {
            const memory = state.memory || {};
            const compass = migrateCompass(memory.narrativeCompass || state.compass);
            compass.worldTick += 1;
            compass.tone = detectTone(state.story, action, compass.tone);
            const analysis = analyzeState(state);
            const consequences = evaluateConsequences(action, memory);
            const focus = chooseFocus(action, memory, compass);
            const contradictions = findContradictions(action, state);
            const proactiveBeat = selectProactiveBeat(state, compass, focus);

            compass.currentFocus = focus;
            compass.lastProactiveTurn = analysis.turn;
            compass.contradictions = compactUnique([
                ...compass.contradictions,
                ...contradictions.map(item => ({ ...item, turn: analysis.turn }))
            ], 20);
            compass.lastDecision = {
                turn: analysis.turn,
                analysis,
                consequences,
                focus,
                proactiveBeat,
                contradictionCount: contradictions.length
            };

            const decision = { analysis, consequences, focus, proactiveBeat, contradictions };
            return { compass, decision, prompt: decisionToPrompt(decision, compass) };
        }

        updateCompass(action, response, memory, story) {
            const compass = migrateCompass(memory?.narrativeCompass);
            const goal = derivePlayerGoal(action);
            if (goal) compass.playerGoals = compactUnique([...compass.playerGoals, goal], 12);

            const actionText = String(action || '').trim();
            const isSystemAction = /^(il protagonista|è passato|l'avventura inizia)/i.test(actionText);
            if (!isSystemAction && actionText.length >= 4) {
                memory.playerDecisions = compactUnique([...(memory.playerDecisions || []), {
                    id: `decision-${Date.now()}-${memory.turnCount || 0}`,
                    summary: actionText.slice(0, 300),
                    turn: memory.turnCount || 0,
                    importance: /uccid|tradisc|rifiut|accett|promett|sacrific/i.test(actionText) ? 'high' : 'normal'
                }], 100);
            }

            const activeQuests = asArray(memory?.quests).filter(quest => quest.status === 'active');
            compass.openThreads = compactUnique(activeQuests.map(quest => ({
                name: quest.name,
                status: quest.status,
                progress: quest.progress || ''
            })), 20);

            const npcGoals = asArray(memory?.npcs)
                .filter(npc => npc.status !== 'dead' && npc.goals)
                .map(npc => `${npc.name}: ${npc.goals}`);
            compass.characterGoals = compactUnique(npcGoals, 20);

            const storedGoals = activeQuests.map(quest => ({
                id: quest.id || `goal-${quest.name}`,
                name: quest.name,
                description: quest.description,
                status: quest.status,
                progress: quest.progress || '',
                turn: memory.turnCount
            }));
            memory.narrativeGoals = compactUnique([...(memory.narrativeGoals || []), ...storedGoals], 50);

            const branches = [];
            activeQuests.slice(0, 3).forEach(quest => {
                branches.push(`Se «${quest.name}» viene ignorata, la situazione peggiora o un rivale prende l'iniziativa.`);
            });
            asArray(memory?.npcs)
                .filter(npc => /nemic|ostile|rivale/i.test(npc.relationship || '') && npc.status !== 'dead')
                .slice(0, 2)
                .forEach(npc => branches.push(`${npc.name} può trasformare il proprio obiettivo in una complicazione concreta.`));
            compass.futureBranches = compactUnique([...compass.futureBranches, ...branches], 12);
            compass.tone = detectTone(story, `${action || ''} ${String(response || '').slice(0, 800)}`, compass.tone);
            memory.narrativeCompass = compass;
            return compass;
        }
    }

    return {
        COMPASS_SCHEMA_VERSION,
        FOCI,
        NarrativeMasterEngine,
        createDefaultCompass,
        migrateCompass,
        analyzeState,
        evaluateConsequences,
        chooseFocus,
        findContradictions,
        formatCompass,
        decisionToPrompt
    };
});
