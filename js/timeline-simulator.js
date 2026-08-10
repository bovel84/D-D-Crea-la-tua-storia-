(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheTimelineSimulator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const TIMELINE_SIMULATOR_SCHEMA_VERSION = 1;

    function asArray(value) { return Array.isArray(value) ? value : []; }

    function cleanText(value, maxLength = 420) {
        return String(value == null ? '' : value)
            .replace(/[\[\]]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, maxLength);
    }

    function keyOf(value) {
        return cleanText(value, 600)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9\s_-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function desiredEventCount(daysValue) {
        const days = Math.max(1, Number(daysValue) || 1);
        if (days <= 1) return 2;
        if (days <= 7) return 3;
        if (days <= 31) return 4;
        return 6;
    }

    function isMeaningfulEvent(event) {
        const source = keyOf(event?.source);
        const title = keyOf(event?.title);
        return Boolean(cleanText(event?.summary, 20)) &&
            source !== 'time-engine' && !/^vita durante\b/.test(title);
    }

    function activeActors(world) {
        return [...asArray(world?.actors), ...asArray(world?.factions)]
            .filter(actor => actor && actor.status !== 'dead' && actor.status !== 'resolved' && cleanText(actor.name, 120))
            .sort((left, right) => {
                const score = actor => Number(actor.influence || 0) +
                    (actor.kind === 'faction' ? 4 : 0) -
                    (/fallback|recovery/.test(keyOf(actor.source)) ? 25 : 0);
                return score(right) - score(left);
            });
    }

    function actorLine(actor) {
        return `- ${cleanText(actor.name, 120)} (${actor.kind === 'faction' ? 'fazione' : cleanText(actor.role || 'personaggio', 80)})` +
            `: vuole ${cleanText(actor.goal || 'rafforzare la propria posizione', 220)}; ` +
            `strategia ${cleanText(actor.strategy || 'agire tramite contatti e risorse disponibili', 220)}; ` +
            `risorse ${cleanText(actor.resources || 'limitate', 180)}; ` +
            `influenza ${Math.round(Number(actor.influence) || 0)}/100; ` +
            `luogo ${cleanText(actor.location || actor.base || 'non definito', 120)}.`;
    }

    function buildPrompt(context = {}) {
        const passage = context.passage || {};
        const world = context.world || {};
        const days = Math.max(1, Number(passage.days) || Math.round(Number(passage.elapsed || 1440) / 1440) || 1);
        const count = desiredEventCount(days);
        const actors = activeActors(world).slice(0, 8);
        const relations = asArray(world.relations).filter(item => item.status !== 'resolved').slice(0, 8);
        const forces = asArray(world.forces).filter(item => item.status !== 'resolved').slice(0, 6);
        const choices = asArray(context.choices)
            .map(choice => cleanText(typeof choice === 'string' ? choice : choice?.summary || choice?.description, 260))
            .filter(Boolean)
            .slice(-5);
        const recent = asArray(context.recentEvents).filter(isMeaningfulEvent).slice(-6);
        return `SIMULATORE DEDICATO DELLA TIMELINE. Produci fatti accaduti, non ipotesi e non un riepilogo della routine.

PERIODO: ${cleanText(passage.description || `${days} giorni`, 120)}; da ${cleanText(passage.startDate || 'inizio periodo', 120)} a ${cleanText(passage.endDate || 'fine periodo', 120)}.
VITA ORDINARIA GIÀ GESTITA DAL MOTORE: ${cleanText(passage.summary || 'il protagonista dorme, mangia, lavora e cura la quotidianità', 320)}. Non trasformarla in EVENTO.
STORIA: ${cleanText(context.story?.title, 120)} — ${cleanText(context.story?.setting || world.setting, 180)}.
CONFLITTO CENTRALE: ${cleanText(world.centralConflict || world.premise || context.story?.desc, 500)}.
SCELTE DA FAR PESARE: ${choices.length ? choices.join(' / ') : 'nessuna nuova scelta: avanzano le trame e gli obiettivi autonomi'}.

ATTORI VIVI:
${actors.length ? actors.map(actorLine).join('\n') : '- Usa le parti già nominate negli eventi e nella storia.'}

RELAZIONI:
${relations.length ? relations.map(item => `- ${cleanText(item.from, 100)} ↔ ${cleanText(item.to, 100)}: ${cleanText(item.type, 80)}, fiducia ${Math.round(Number(item.trust) || 0)}, tensione ${Math.round(Number(item.tension) || 0)}; ${cleanText(item.description, 220)}.`).join('\n') : '- Nessuna relazione strutturata: fai comunque reagire almeno due parti.'}

FORZE E TRAME APERTE:
${forces.length ? forces.map(item => `- ${cleanText(item.name, 120)}: ${cleanText(item.actor, 100)} persegue ${cleanText(item.objective, 260)}; progresso ${Math.round(Number(item.progress) || 0)}%, urgenza ${Math.round(Number(item.urgency) || 0)}%.`).join('\n') : '- Il conflitto centrale deve avanzare.'}

EVENTI RECENTI DA NON RIPETERE:
${recent.length ? recent.map(item => `- ${cleanText(item.title, 100)}: ${cleanText(item.summary, 240)}`).join('\n') : '- Nessuno.'}

REGOLE OBBLIGATORIE:
- Genera esattamente ${count} EVENTO distinti, distribuiti dall'inizio alla fine del periodo.
- Costruisci un arco causale: una parte agisce, un'altra reagisce, l'equilibrio cambia e l'ultimo evento lascia una situazione concreta da affrontare.
- Almeno due attori autonomi devono compiere mosse; non limitarti a “si diffondono voci”, “la vita continua” o “qualcuno sta pensando”.
- Il fatto deve contenere azione osservabile e risultato. La conseguenza deve cambiare una relazione, una risorsa, un rischio, un'opportunità o una decisione futura.
- Ogni sintesi EVENTO deve avere 2 frasi concrete e usare nomi esatti. Date e momenti devono cadere dentro il periodo.
- Per ogni attore che agisce emetti MONDO. Per ogni EVENTO con almeno due parti emetti 1-3 CHAT in prima persona; mai parole inventate per il protagonista.
- Restituisci soltanto i tag seguenti, senza introduzioni, markdown o routine.

[EVENTO: tipo|titolo|due frasi su ciò che è realmente accaduto|luogo|attori separati da virgola|conseguenza persistente concreta|normal/high/critical|active/developing/resolved|data o momento nel periodo]
[MONDO: attore|mossa concreta compiuta|stato della mossa|visible/hidden]
[CHAT: titolo esatto evento|parlante|npc/fazione/regno/gruppo|messaggio in prima persona|destinatario|emozione]`;
    }

    function momentFor(index, total, passage = {}) {
        const days = Math.max(1, Number(passage.days) || Math.round(Number(passage.elapsed || 1440) / 1440) || 1);
        if (days === 1) {
            const moments = total <= 2 ? ['mattina', 'sera'] : ['mattina', 'pomeriggio', 'sera'];
            return `${moments[Math.min(index, moments.length - 1)]} del giorno simulato`;
        }
        const day = Math.max(1, Math.min(days, Math.round(((index + 1) * days) / (total + 1))));
        const phase = index === 0 ? 'inizio periodo' : index === total - 1 ? 'verso la fine' : 'periodo intermedio';
        return `giorno ${day} di ${days} · ${phase}`;
    }

    function phrase(value, fallback, maxLength) {
        const text = cleanText(value || fallback, maxLength).replace(/[.!?;:]+$/g, '');
        return text ? text.charAt(0).toLocaleLowerCase('it-IT') + text.slice(1) : fallback;
    }

    function actorGoal(actor) {
        return phrase(actor?.goal, 'rafforzare la propria posizione', 240);
    }

    function actorStrategy(actor) {
        return phrase(actor?.strategy, 'usare contatti, informazioni e risorse disponibili', 240);
    }

    function actorResources(actor) {
        return phrase(actor?.resources, 'le risorse a disposizione', 180);
    }

    function actorPlace(actor, context) {
        return cleanText(actor?.location || actor?.base || context.location || context.story?.setting || 'nel territorio', 120);
    }

    function fallbackActors(world, context = {}) {
        const existing = activeActors(world);
        if (existing.length >= 3) return existing;
        const place = cleanText(context.story?.setting || context.location || world?.name || 'il territorio', 100);
        return [
            ...existing,
            { name: `Autorità di ${place}`, kind: 'faction', goal: 'mantenere il controllo', strategy: 'mobilitare funzionari e alleati', resources: 'istituzioni e informazioni', influence: 65, base: place },
            { name: `Opposizione di ${place}`, kind: 'faction', goal: 'cambiare gli equilibri', strategy: 'organizzare sostenitori e fare pressione', resources: 'contatti e consenso', influence: 58, base: place },
            { name: `Comunità di ${place}`, kind: 'faction', goal: 'proteggere sicurezza e mezzi di sussistenza', strategy: 'negoziare e reagire collettivamente', resources: 'reti locali', influence: 45, base: place }
        ].filter((item, index, list) => list.findIndex(other => keyOf(other.name) === keyOf(item.name)) === index);
    }

    function createFallbackArc(context = {}) {
        const passage = context.passage || {};
        const days = Math.max(1, Number(passage.days) || Math.round(Number(passage.elapsed || 1440) / 1440) || 1);
        const count = desiredEventCount(days);
        const actors = fallbackActors(context.world || {}, context);
        const relations = asArray(context.world?.relations).filter(item => item.status !== 'resolved');
        const forces = asArray(context.world?.forces).filter(item => item.status !== 'resolved');
        const choices = asArray(context.choices).map(choice => cleanText(typeof choice === 'string' ? choice : choice?.summary || choice?.description, 240)).filter(Boolean);
        const events = [];
        const moves = [];

        for (let index = 0; index < count; index++) {
            const actor = actors[index % actors.length];
            const target = actors[(index + 1) % actors.length];
            const place = actorPlace(actor, context);
            const relation = relations.find(item =>
                [keyOf(item.from), keyOf(item.to)].includes(keyOf(actor.name)) &&
                [keyOf(item.from), keyOf(item.to)].includes(keyOf(target.name))
            ) || relations[index % Math.max(1, relations.length)];
            const force = forces[index % Math.max(1, forces.length)];
            const choice = choices[index % Math.max(1, choices.length)];
            let event;
            if (index === 0) {
                event = {
                    type: actor.kind === 'faction' ? 'politica' : 'mondo',
                    title: `La mossa di ${actor.name}`,
                    summary: `${actor.name}, deciso a ${actorGoal(actor)}, ha messo in atto la strategia «${actorStrategy(actor)}». A ${place} ha mobilitato ${actorResources(actor)}, trasformando il proprio obiettivo in un fatto visibile.`,
                    consequence: `${target.name} deve ora reagire e l'iniziativa appartiene temporaneamente a ${actor.name}.`,
                    actors: [actor.name, target.name], location: place, importance: 'high', status: 'developing'
                };
            } else if (index === 1) {
                const previous = actors[0];
                event = {
                    type: 'decisione',
                    title: `${actor.name} risponde`,
                    summary: `${actor.name} ha riconosciuto la mossa di ${previous.name} e ha rifiutato di restare passivo. Ha messo in campo «${actorStrategy(actor)}», usando ${actorResources(actor)} per difendere il proprio obiettivo: ${actorGoal(actor)}.`,
                    consequence: `Le due strategie ora si ostacolano direttamente e una nuova decisione sarà inevitabile.`,
                    actors: [actor.name, previous.name], location: actorPlace(actor, context), importance: 'high', status: 'developing'
                };
            } else if (relation && index === 2) {
                const tense = Number(relation.tension || 0) >= 55;
                event = {
                    type: tense ? 'conflitto' : 'relazione',
                    title: `${relation.from} e ${relation.to}: equilibrio spezzato`,
                    summary: `${relation.from} e ${relation.to} hanno dovuto prendere posizione dopo le mosse precedenti. Il loro rapporto di ${cleanText(relation.type || 'cauta competizione', 100)} è diventato ${tense ? 'più ostile e pubblico' : 'un negoziato concreto con condizioni precise'}.`,
                    consequence: tense ? `La tensione tra le due parti aumenta e rende più probabile uno scontro aperto.` : `Si apre un canale di trattativa che entrambe le parti potranno usare o tradire.`,
                    actors: [relation.from, relation.to], location: place, importance: 'high', status: 'active'
                };
            } else if (force && index === 3) {
                event = {
                    type: 'pericolo',
                    title: `${force.name} avanza`,
                    summary: `${force.actor || actor.name} ha fatto avanzare «${force.name}» verso ${phrase(force.objective, actorGoal(actor), 240)}. Segnali concreti a ${place} mostrano che la pressione non è più soltanto potenziale.`,
                    consequence: `La trama «${force.name}» guadagna slancio e richiederà una risposta nei prossimi turni.`,
                    actors: [force.actor || actor.name, target.name], location: place,
                    importance: Number(force.urgency || 0) >= 75 ? 'critical' : 'high', status: 'active'
                };
            } else if (choice) {
                event = {
                    type: 'decisione',
                    title: `La scelta del protagonista cambia il gioco`,
                    summary: `La decisione «${choice}» è diventata nota a ${actor.name}, che l'ha interpretata secondo il proprio obiettivo. In risposta ha accelerato «${actorStrategy(actor)}» invece di attendere il protagonista.`,
                    consequence: `${actor.name} modifica il proprio atteggiamento e la scelta del giocatore avrà un costo o un'opportunità concreta.`,
                    actors: [actor.name, 'protagonista'], location: place, importance: 'high', status: 'active'
                };
            } else if (index === count - 2) {
                event = {
                    type: 'economia',
                    title: `Le conseguenze raggiungono ${place}`,
                    summary: `Le mosse di ${actor.name} e ${target.name} hanno cambiato decisioni, scambi e alleanze quotidiane a ${place}. La comunità ha reagito scegliendo a chi offrire collaborazione, informazioni e risorse.`,
                    consequence: `Gli abitanti di ${place} non sono più neutrali e le due parti dispongono ora di appoggi differenti.`,
                    actors: [actor.name, target.name], location: place, importance: 'high', status: 'developing'
                };
            } else {
                event = {
                    type: 'mondo',
                    title: `Un nuovo equilibrio a ${place}`,
                    summary: `${actor.name} e ${target.name} hanno consolidato le posizioni conquistate durante il periodo. Le persone di ${place} hanno iniziato ad adattarsi, schierarsi e proteggere i propri interessi.`,
                    consequence: `Il periodo termina con ${actor.name} in vantaggio, ma ${target.name} prepara una contromossa già visibile.`,
                    actors: [actor.name, target.name], location: place, importance: 'high', status: 'active'
                };
            }
            event.occurredAt = momentFor(index, count, passage);
            event.choice = choice || choices[0] || '';
            event.source = 'timeline-fallback';
            event.timelineSimulatorSchemaVersion = TIMELINE_SIMULATOR_SCHEMA_VERSION;
            events.push(event);
            moves.push({
                actor: event.actors[0], action: event.summary, status: event.status,
                visibility: 'visible', source: 'timeline-fallback'
            });
        }
        return { events, moves };
    }

    function ensureEventArc(incomingEvents, context = {}) {
        const passage = context.passage || {};
        const wanted = desiredEventCount(passage.days || Math.round(Number(passage.elapsed || 1440) / 1440));
        const accepted = asArray(incomingEvents).filter(isMeaningfulEvent).slice(0, wanted);
        const fallback = createFallbackArc(context);
        const seen = new Set(accepted.map(item => keyOf(`${item.title}|${item.summary}`)));
        let fallbackAdded = 0;
        for (const candidate of fallback.events) {
            if (accepted.length >= wanted) break;
            const key = keyOf(`${candidate.title}|${candidate.summary}`);
            if (seen.has(key)) continue;
            accepted.push(candidate);
            seen.add(key);
            fallbackAdded++;
        }
        return {
            events: accepted,
            moves: fallbackAdded ? fallback.moves.slice(0, fallbackAdded) : [],
            desiredCount: wanted,
            fallbackAdded,
            usedFallback: fallbackAdded > 0
        };
    }

    function buildConversationStarters(events, world, context = {}) {
        const actors = activeActors(world);
        const actorByName = name => actors.find(item => keyOf(item.name) === keyOf(name));
        const protagonistKey = keyOf(context.protagonistName || 'protagonista');
        const messages = [];
        asArray(events).filter(isMeaningfulEvent).forEach(event => {
            const participants = asArray(event.actors).map(name => cleanText(name, 100)).filter(Boolean);
            const speakers = participants.filter(name => {
                const key = keyOf(name);
                return key && key !== protagonistKey && !/^(protagonista|giocatore|player)$/.test(key);
            }).slice(0, 2);
            speakers.forEach((name, index) => {
                const actor = actorByName(name) || { name, kind: 'npc' };
                const target = participants.find(item => keyOf(item) !== keyOf(name)) || context.protagonistName || 'protagonista';
                const text = index === 0
                    ? `Io non resterò fermo: voglio ${actorGoal(actor)}. ${target}, la mia mossa è iniziata e userò ${actorResources(actor)} per portarla avanti.`
                    : `Io ho visto cosa stai facendo, ${target}. Difenderò il mio obiettivo e reagirò con ${actorStrategy(actor)}.`;
                messages.push({
                    eventId: event.id, eventTitle: event.title, speaker: name,
                    speakerType: actor.kind === 'faction' ? 'fazione' : 'npc',
                    text, target, mood: index === 0 ? 'determinato' : 'guardingo',
                    turn: context.turn, occurredAt: event.occurredAt, source: 'timeline-fallback'
                });
            });
        });
        return messages.slice(0, 12);
    }

    function buildChronicle(events, passage = {}) {
        const meaningful = asArray(events).filter(isMeaningfulEvent);
        if (!meaningful.length) return '';
        const lines = meaningful.map(event =>
            `• ${cleanText(event.occurredAt || 'Durante il periodo', 100)} — ${cleanText(event.summary, 420)}`
        );
        const finalConsequence = cleanText(meaningful[meaningful.length - 1].consequence, 320);
        return `Durante ${cleanText(passage.description || 'il periodo', 120)}, il protagonista ha continuato a dormire, mangiare e vivere normalmente. Nel frattempo il mondo non è rimasto fermo:\n\n${lines.join('\n\n')}` +
            (finalConsequence ? `\n\nSituazione attuale: ${finalConsequence}` : '');
    }

    return {
        TIMELINE_SIMULATOR_SCHEMA_VERSION,
        cleanText,
        keyOf,
        desiredEventCount,
        isMeaningfulEvent,
        buildPrompt,
        createFallbackArc,
        ensureEventArc,
        buildConversationStarters,
        buildChronicle
    };
});
