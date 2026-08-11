(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheTimelineSimulator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const TIMELINE_SIMULATOR_SCHEMA_VERSION = 3;

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

    function normalizeTimelineChoice(source, index = 0) {
        const input = source && typeof source === 'object' ? source : { summary: source };
        const summary = cleanText(input.summary || input.description || input.command, 700);
        if (!summary) return null;
        const sourceName = cleanText(input.source || 'player-action', 60);
        const isStrategic = keyOf(sourceName) === 'strategic-advisor' || Boolean(input.topic && input.actionTitle);
        const rawId = cleanText(input.id, 150).replace(/[^a-zA-Z0-9_-]/g, '');
        return {
            id: rawId || `${isStrategic ? 'strategic' : 'choice'}-${index + 1}`,
            source: sourceName,
            isStrategic,
            topic: cleanText(input.topic || input.issueTitle, 140),
            actionTitle: cleanText(input.actionTitle || input.title, 140),
            command: cleanText(input.command || input.description || summary, 620),
            objective: cleanText(input.objective, 300),
            expectedOutcome: cleanText(input.expectedOutcome, 360),
            cost: cleanText(input.cost, 180),
            duration: cleanText(input.duration, 140),
            risk: cleanText(input.risk, 60),
            tradeoff: cleanText(input.tradeoff, 320),
            actors: asArray(input.actors).map(item => cleanText(item, 100)).filter(Boolean).slice(0, 8),
            summary
        };
    }

    function normalizeTimelineChoices(choices) {
        const seen = new Set();
        return asArray(choices).map(normalizeTimelineChoice).filter(item => {
            if (!item || seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        }).slice(-20);
    }

    function strategicChoiceGroups(choices) {
        const groups = [];
        normalizeTimelineChoices(choices).filter(item => item.isStrategic).forEach(item => {
            const topic = item.topic || 'Strategia generale';
            let group = groups.find(entry => keyOf(entry.topic) === keyOf(topic));
            if (!group) {
                group = { topic, actions: [] };
                groups.push(group);
            }
            group.actions.push(item);
        });
        return groups;
    }

    function desiredEventCount(daysValue, strategicTopicCount = 0) {
        const days = Math.max(1, Number(daysValue) || 1);
        const base = days <= 1 ? 2 : days <= 7 ? 3 : days <= 31 ? 4 : 6;
        return Math.max(base, Math.min(10, Math.max(0, Number(strategicTopicCount) || 0) + 2));
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
            `: obiettivo pubblico ${cleanText(actor.publicGoal || actor.goal || 'rafforzare la propria posizione', 220)}; ` +
            `obiettivo privato ${cleanText(actor.privateGoal || 'non noto', 180)}; ` +
            `agenda ${cleanText(actor.agenda || actor.strategy || 'agire tramite contatti e risorse disponibili', 220)}; ` +
            `leva ${cleanText(actor.leverage || actor.resources || 'limitata', 180)}; ` +
            `vincoli ${cleanText(actor.constraints || 'coerenza col proprio ruolo', 180)}; ` +
            `influenza ${Math.round(Number(actor.influence) || 0)}/100; ` +
            `luogo ${cleanText(actor.location || actor.base || 'non definito', 120)}; ` +
            `ultima mossa ${cleanText(actor.lastMove || 'nessuna', 180)}.`;
    }

    function buildPrompt(context = {}) {
        const passage = context.passage || {};
        const world = context.world || {};
        const days = Math.max(1, Number(passage.days) || Math.round(Number(passage.elapsed || 1440) / 1440) || 1);
        const normalizedChoices = normalizeTimelineChoices(context.choices);
        const strategicGroups = strategicChoiceGroups(normalizedChoices);
        const count = desiredEventCount(days, strategicGroups.length);
        const actors = activeActors(world).slice(0, 8);
        const relations = asArray(world.relations).filter(item => item.status !== 'resolved').slice(0, 8);
        const forces = asArray(world.forces).filter(item => item.status !== 'resolved').slice(0, 6);
        const choices = normalizedChoices.filter(item => !item.isStrategic).slice(-5);
        const strategicPlan = strategicGroups.length
            ? strategicGroups.map(group => `ARGOMENTO — ${group.topic}\n${group.actions.map(item =>
                `- ID ${item.id}; AZIONE ${item.actionTitle || item.command}; COMANDO ${item.command}; ` +
                `OBIETTIVO ${item.objective || 'da verificare'}; DURATA ${item.duration || 'da stimare'}; ` +
                `COSTO ${item.cost || 'da stimare'}; RISCHIO ${item.risk || 'medio'}; CONTROPARTITA ${item.tradeoff || 'da verificare'}.`
            ).join('\n')}`).join('\n')
            : '- Nessuna azione strategica selezionata.';
        const recent = asArray(context.recentEvents).filter(isMeaningfulEvent).slice(-6);
        const agreements = asArray(context.agreements).filter(item => !/rejected|broken|fulfilled/.test(keyOf(item.status))).slice(-8);
        const history = world.historicalContext || {};
        return `SIMULATORE DEDICATO DELLA TIMELINE. Produci fatti accaduti, non ipotesi e non un riepilogo della routine.

PERIODO: ${cleanText(passage.description || `${days} giorni`, 120)}; da ${cleanText(passage.startDate || 'inizio periodo', 120)} a ${cleanText(passage.endDate || 'fine periodo', 120)}.
VITA ORDINARIA GIÀ GESTITA DAL MOTORE: ${cleanText(passage.summary || 'il protagonista dorme, mangia, lavora e cura la quotidianità', 320)}. Non trasformarla in EVENTO.
STORIA: ${cleanText(context.story?.title, 120)} — ${cleanText(context.story?.setting || world.setting, 180)}.
CONFLITTO CENTRALE: ${cleanText(world.centralConflict || world.premise || context.story?.desc, 500)}.
SCELTE LIBERE DA FAR PESARE: ${choices.length ? choices.map(item => item.summary).join(' / ') : 'nessuna nuova scelta libera'}.

PIANO STRATEGICO SELEZIONATO DAL GIOCATORE:
${strategicPlan}
Le azioni del piano sono intenzioni simultanee, non successi automatici. Valuta tutte le azioni, anche quando appartengono allo stesso argomento: compatibilità, precedenze, tempo, costi, risorse condivise, opposizione e possibili conflitti fra loro.

BASE STORICO-POLITICA:
- Data/epoca: ${cleanText(history.date || passage.startDate || 'data della campagna', 160)}.
- Area e istituzioni: ${cleanText(history.region || world.setting, 180)}; ${cleanText(history.politicalSystem || 'assetto già registrato', 420)}.
- Situazione di partenza: ${cleanText(history.baseline || world.premise, 600)}.
- Tensioni attive: ${cleanText(history.activeTensions || world.centralConflict, 500)}.
- Vincoli: ${cleanText(history.constraints || 'rispetta cariche, distanze, risorse e conoscenze dell’epoca', 500)}.
- Divergenza: ${cleanText(history.divergencePolicy || 'ogni deviazione nasce soltanto da eventi già accaduti nel gioco', 360)}.

ATTORI VIVI:
${actors.length ? actors.map(actorLine).join('\n') : '- Usa le parti già nominate negli eventi e nella storia.'}

RELAZIONI:
${relations.length ? relations.map(item => `- ${cleanText(item.from, 100)} ↔ ${cleanText(item.to, 100)}: ${cleanText(item.type, 80)}, fiducia ${Math.round(Number(item.trust) || 0)}, tensione ${Math.round(Number(item.tension) || 0)}; ${cleanText(item.description, 220)}.`).join('\n') : '- Nessuna relazione strutturata: fai comunque reagire almeno due parti.'}

FORZE E TRAME APERTE:
${forces.length ? forces.map(item => `- ${cleanText(item.name, 120)}: ${cleanText(item.actor, 100)} persegue ${cleanText(item.objective, 260)}; progresso ${Math.round(Number(item.progress) || 0)}%, urgenza ${Math.round(Number(item.urgency) || 0)}%.`).join('\n') : '- Il conflitto centrale deve avanzare.'}

ACCORDI, CONTRATTI E TRATTATI DA RISPETTARE O METTERE ALLA PROVA:
${agreements.length ? agreements.map(item => `- ${cleanText(item.title, 120)} tra ${asArray(item.parties).map(name => cleanText(name, 90)).join(', ')}: ${cleanText(item.terms, 360)}; stato ${cleanText(item.status, 40)}${item.deadline ? `; scadenza ${cleanText(item.deadline, 100)}` : ''}.`).join('\n') : '- Nessun accordo attivo.'}

EVENTI RECENTI DA NON RIPETERE:
${recent.length ? recent.map(item => `- ${cleanText(item.title, 100)}: ${cleanText(item.summary, 240)}`).join('\n') : '- Nessuno.'}

REGOLE OBBLIGATORIE:
- Genera esattamente ${count} EVENTO distinti, distribuiti dall'inizio alla fine del periodo.
- Se esiste un piano strategico, dedica almeno un EVENTO a ogni ARGOMENTO selezionato. Puoi riunire più azioni dello stesso argomento nello stesso evento, ma nessuna azione può essere ignorata.
- Per OGNI azione strategica emetti esattamente un ESITO_STRATEGICO con lo stesso ID. L'esito può essere completata, parziale, fallita o in_corso: non garantire mai il successo soltanto perché il giocatore ha cliccato l'azione.
- Dopo gli effetti delle azioni del giocatore, mostra contromosse autonome coerenti con obiettivi, risorse e informazioni degli attori del mondo. Almeno un EVENTO deve essere una reazione o iniziativa del mondo non controllata dal protagonista.
- Scegli UNA trama centrale tra conflitto storico, forza aperta o scelta del giocatore. Tutti gli eventi devono essere capitoli dello stesso arco: una parte agisce, un'altra reagisce, segue una decisione istituzionale o uno scontro e nasce un nuovo problema concreto.
- Almeno due attori autonomi devono compiere mosse; non limitarti a “si diffondono voci”, “la vita continua” o “qualcuno sta pensando”.
- Usa soltanto nomi propri, cariche e istituzioni presenti nel contesto. Vietati attori generici come “l'Autorità”, “l'Opposizione”, “il Mediatore” o “la Comunità” se non sono nomi registrati.
- Il fatto deve contenere azione osservabile e risultato verificabile: indica il verbo d'azione, lo strumento usato e chi subisce o beneficia dell'esito. La conseguenza deve cambiare controllo, legge, alleanza, risorsa, reputazione, rischio, opportunità o decisione futura.
- Ogni sintesi EVENTO deve avere 2-3 frasi concrete. Indica causa precisa, ancoraggio storico, spostamento politico, posta in gioco e obiettivo dell'eventuale trattativa.
- Ogni evento successivo deve citare nel campo causa l'evento, la scelta o la forza che lo ha prodotto. Date e momenti devono cadere dentro il periodo.
- Per ogni attore che agisce emetti MONDO. Se l'evento consente comunicazione, negoziato, minaccia, contratto o mediazione, imposta available/required ed emetti 2-5 CHAT: quando vi sono almeno tre parti, fai parlare almeno due soggetti diversi in prima persona. Mai parole inventate per il protagonista.
- Restituisci soltanto i tag seguenti, senza introduzioni, markdown o routine.

[EVENTO: tipo|titolo|due o tre frasi su ciò che è realmente accaduto|luogo|attori separati da virgola|conseguenza persistente concreta|normal/high/critical|active/developing/resolved|data o momento nel periodo|causa precisa|ancoraggio storico|spostamento politico|posta in gioco|obiettivo conversazione|available/required/none]
[ESITO_STRATEGICO: ID esatto|completata/parziale/fallita/in_corso|risultato osservabile del tentativo|conseguenza persistente|reazione concreta del mondo|attori separati da virgola]
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

    function isGenericActorName(value) {
        return /^(?:(?:il|la|lo|i|gli|le) )?(autorita|opposizione|comunita|custode|voce dell opposizione|guida locale|mediatore indipendente)(\b| di )/.test(keyOf(value));
    }

    function eventCentralityScore(event, context = {}) {
        if (!isMeaningfulEvent(event)) return 0;
        const actors = asArray(event.actors).map(item => cleanText(item, 100)).filter(Boolean);
        const summary = cleanText(event.summary, 600);
        const consequence = cleanText(event.consequence, 400);
        const known = new Set(activeActors(context.world || {}).map(item => keyOf(item.name)));
        let score = 0;
        if (summary.length >= 60 && summary.split(/[.!?]+/).filter(Boolean).length >= 2) score += 2;
        if (actors.length >= 2) score += 2;
        if (actors.length && actors.every(name => !isGenericActorName(name))) score += 2;
        if (actors.some(isGenericActorName)) score -= 4;
        if (actors.some(name => known.has(keyOf(name)))) score += 1;
        if (consequence.length >= 15 && !/nessuna|da affrontare|dovra reagire$/i.test(consequence)) score += 2;
        if (cleanText(event.cause, 30)) score += 1;
        if (cleanText(event.historicalAnchor, 30)) score += 1;
        if (cleanText(event.politicalShift, 30)) score += 1;
        if (cleanText(event.stakes, 20)) score += 1;
        if (/convoca|vota|approva|respinge|firma|ordina|mobilita|arresta|nomina|depone|occupa|attacca|negozia|blocca|confisca|promulga|invia|finanzia|riconosce|rifiuta|accetta/i.test(summary)) score += 2;
        return score;
    }

    function conversationGoalFor(event) {
        const actors = asArray(event?.actors).filter(Boolean);
        if (actors.length < 2) return '';
        const type = keyOf(event?.type);
        if (type === 'economia') return `Negoziare condizioni, garanzie e costi tra ${actors.join(', ')}`;
        if (type === 'politica' || type === 'decisione') return `Confrontare le posizioni e decidere chi sosterrà la prossima mossa`;
        if (type === 'conflitto' || type === 'pericolo') return `Evitare l'escalation, imporre condizioni o organizzare una risposta comune`;
        if (type === 'relazione') return `Definire impegni, fiducia e contropartite tra le parti`;
        return `Chiarire responsabilità e prossime azioni dopo «${cleanText(event?.title, 100)}»`;
    }

    function enrichEvent(event, context = {}, index = 0, previousEvent = null) {
        const world = context.world || {};
        const history = world.historicalContext || {};
        const force = asArray(world.forces).find(item => item.status !== 'resolved');
        const choices = normalizeTimelineChoices(context.choices).map(choice => cleanText(choice.summary, 240));
        const cause = cleanText(event?.cause || event?.choice || (index > 0 ? previousEvent?.title : '') || choices[0] || force?.cause || force?.objective || world.centralConflict, 320);
        const historicalAnchor = cleanText(event?.historicalAnchor || [history.date, history.baseline].filter(Boolean).join(' — ') || context.passage?.startDate || world.setting, 320);
        const politicalShift = cleanText(event?.politicalShift || event?.consequence, 320);
        const stakes = cleanText(event?.stakes || world.stakes || force?.consequenceAt100 || event?.consequence, 280);
        const conversationGoal = cleanText(event?.conversationGoal || conversationGoalFor(event), 280);
        const conversationMode = event?.conversationMode === 'none'
            ? 'none'
            : (conversationGoal ? (event?.conversationMode === 'required' ? 'required' : 'available') : 'none');
        return {
            ...event,
            cause,
            historicalAnchor,
            politicalShift,
            stakes,
            conversationGoal,
            conversationMode,
            centralityScore: eventCentralityScore(event, context),
            timelineSimulatorSchemaVersion: TIMELINE_SIMULATOR_SCHEMA_VERSION
        };
    }

    function createFallbackArc(context = {}) {
        const passage = context.passage || {};
        const days = Math.max(1, Number(passage.days) || Math.round(Number(passage.elapsed || 1440) / 1440) || 1);
        const normalizedChoices = normalizeTimelineChoices(context.choices);
        const strategicGroups = strategicChoiceGroups(normalizedChoices);
        const count = desiredEventCount(days, strategicGroups.length);
        const actors = fallbackActors(context.world || {}, context);
        const relations = asArray(context.world?.relations).filter(item => item.status !== 'resolved');
        const forces = asArray(context.world?.forces).filter(item => item.status !== 'resolved');
        const choices = normalizedChoices.map(choice => cleanText(choice.summary, 240));
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
            const strategicGroup = strategicGroups[index];
            const worldIndex = index - strategicGroups.length;
            let event;
            if (strategicGroup) {
                const actionNames = strategicGroup.actions.map(item => item.actionTitle || item.command).join(' e ');
                const commands = strategicGroup.actions.map(item => item.command).join(' / ');
                event = {
                    type: 'decisione',
                    title: `${strategicGroup.topic}: il piano entra in azione`,
                    summary: `Il protagonista ha avviato «${cleanText(actionNames, 280)}» per affrontare ${phrase(strategicGroup.topic, 'la questione strategica', 160)}. ${actor.name}, perseguendo ${actorGoal(actor)}, ha reagito usando ${actorResources(actor)} e ha impedito che il risultato fosse automatico.`,
                    consequence: `Le iniziative su «${strategicGroup.topic}» sono ora in corso; costi, compatibilità e risposta di ${actor.name} determineranno l'esito definitivo.`,
                    actors: [actor.name, target.name], location: place, importance: 'high', status: 'developing',
                    choice: commands,
                    strategicTopic: strategicGroup.topic,
                    strategicActionIds: strategicGroup.actions.map(item => item.id)
                };
            } else if (worldIndex === 0) {
                event = {
                    type: actor.kind === 'faction' ? 'politica' : 'mondo',
                    title: `La mossa di ${actor.name}`,
                    summary: `${actor.name}, deciso a ${actorGoal(actor)}, ha messo in atto la strategia «${actorStrategy(actor)}». A ${place} ha mobilitato ${actorResources(actor)}, trasformando il proprio obiettivo in un fatto visibile.`,
                    consequence: `${target.name} deve ora reagire e l'iniziativa appartiene temporaneamente a ${actor.name}.`,
                    actors: [actor.name, target.name], location: place, importance: 'high', status: 'developing'
                };
            } else if (worldIndex === 1) {
                const previous = actors[0];
                event = {
                    type: 'decisione',
                    title: `${actor.name} risponde`,
                    summary: `${actor.name} ha riconosciuto la mossa di ${previous.name} e ha rifiutato di restare passivo. Ha messo in campo «${actorStrategy(actor)}», usando ${actorResources(actor)} per difendere il proprio obiettivo: ${actorGoal(actor)}.`,
                    consequence: `Le due strategie ora si ostacolano direttamente e una nuova decisione sarà inevitabile.`,
                    actors: [actor.name, previous.name], location: actorPlace(actor, context), importance: 'high', status: 'developing'
                };
            } else if (relation && worldIndex === 2) {
                const tense = Number(relation.tension || 0) >= 55;
                event = {
                    type: tense ? 'conflitto' : 'relazione',
                    title: `${relation.from} e ${relation.to}: equilibrio spezzato`,
                    summary: `${relation.from} e ${relation.to} hanno dovuto prendere posizione dopo le mosse precedenti. Il loro rapporto di ${cleanText(relation.type || 'cauta competizione', 100)} è diventato ${tense ? 'più ostile e pubblico' : 'un negoziato concreto con condizioni precise'}.`,
                    consequence: tense ? `La tensione tra le due parti aumenta e rende più probabile uno scontro aperto.` : `Si apre un canale di trattativa che entrambe le parti potranno usare o tradire.`,
                    actors: [relation.from, relation.to], location: place, importance: 'high', status: 'active'
                };
            } else if (force && worldIndex === 3) {
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
            event.choice = event.choice || choice || choices[0] || '';
            event.source = 'timeline-fallback';
            const enrichedEvent = enrichEvent(event, context, index, events[index - 1]);
            events.push(enrichedEvent);
            moves.push({
                actor: enrichedEvent.actors[0], action: enrichedEvent.summary, status: enrichedEvent.status,
                visibility: 'visible', source: 'timeline-fallback'
            });
        }
        return { events, moves };
    }

    function ensureEventArc(incomingEvents, context = {}) {
        const passage = context.passage || {};
        const wanted = desiredEventCount(
            passage.days || Math.round(Number(passage.elapsed || 1440) / 1440),
            strategicChoiceGroups(context.choices).length
        );
        const meaningful = asArray(incomingEvents).filter(isMeaningfulEvent);
        const accepted = meaningful
            .filter(event => eventCentralityScore(event, context) >= 6)
            .slice(0, wanted);
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
        const enriched = [];
        accepted.forEach((event, index) => enriched.push(enrichEvent(event, context, index, enriched[index - 1])));
        return {
            events: enriched,
            moves: fallbackAdded ? fallback.moves.slice(0, fallbackAdded) : [],
            desiredCount: wanted,
            fallbackAdded,
            qualityRejected: meaningful.length - (accepted.length - fallbackAdded),
            usedFallback: fallbackAdded > 0
        };
    }

    function normalizeOutcomeStatus(value) {
        const status = keyOf(value);
        if (/complet|success|riuscit|resolved/.test(status)) return 'completata';
        if (/fallit|failed|respint|impossibil/.test(status)) return 'fallita';
        if (/parzial|partial|limitata/.test(status)) return 'parziale';
        return 'in_corso';
    }

    function parseOutcomeActors(value) {
        const seen = new Set();
        return cleanText(value, 500).split(/[,;]/).map(item => cleanText(item, 100)).filter(item => {
            const key = keyOf(item);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 8);
    }

    function parseStrategicOutcomes(response, choices, context = {}) {
        const strategicChoices = normalizeTimelineChoices(choices).filter(item => item.isStrategic);
        const byId = new Map(strategicChoices.map(item => [item.id, item]));
        const outcomes = [];
        const regex = /\[ESITO_STRATEGICO:\s*([^\]]+)\]/gi;
        let match;
        while ((match = regex.exec(String(response || '')))) {
            const [rawId, rawStatus, rawResult, rawConsequence, rawWorldResponse, rawActors] = match[1].split('|');
            const id = cleanText(rawId, 150).replace(/[^a-zA-Z0-9_-]/g, '');
            const choice = byId.get(id);
            if (!choice || outcomes.some(item => item.id === id)) continue;
            outcomes.push({
                id,
                source: 'timeline-ai',
                topic: choice.topic || 'Strategia generale',
                actionTitle: choice.actionTitle || choice.command,
                command: choice.command,
                objective: choice.objective,
                status: normalizeOutcomeStatus(rawStatus),
                result: cleanText(rawResult, 620),
                consequence: cleanText(rawConsequence, 520),
                worldResponse: cleanText(rawWorldResponse, 520),
                actors: parseOutcomeActors(rawActors),
                resolvedAtTurn: Math.max(0, Number(context.turn) || 0),
                occurredAt: cleanText(context.occurredAt || context.passage?.endDate, 120),
                batchId: cleanText(context.batchId, 180)
            });
        }
        return outcomes;
    }

    function eventChoiceScore(event, choice) {
        const corpus = keyOf([
            event?.title, event?.summary, event?.cause, event?.choice,
            event?.consequence, asArray(event?.actors).join(' ')
        ].filter(Boolean).join(' '));
        if (!corpus) return 0;
        const tokens = keyOf(`${choice.topic} ${choice.actionTitle} ${choice.command}`)
            .split(' ').filter(token => token.length >= 4);
        let score = tokens.reduce((total, token) => total + (corpus.includes(token) ? 1 : 0), 0);
        if (asArray(event?.strategicActionIds).includes(choice.id)) score += 20;
        if (keyOf(event?.strategicTopic) === keyOf(choice.topic)) score += 8;
        return score;
    }

    function ensureStrategicOutcomes(incomingOutcomes, choices, events, world, context = {}) {
        const strategicChoices = normalizeTimelineChoices(choices).filter(item => item.isStrategic);
        const parsed = asArray(incomingOutcomes);
        const availableEvents = asArray(events).filter(isMeaningfulEvent);
        const actors = activeActors(world);
        const batchId = cleanText(
            context.batchId || `timeline-${Math.max(0, Number(context.turn) || 0)}-${context.occurredAt || context.passage?.endDate || 'periodo'}`,
            180
        );
        return strategicChoices.map((choice, index) => {
            const provided = parsed.find(item => item?.id === choice.id);
            const rankedEvents = availableEvents
                .map(event => ({ event, score: eventChoiceScore(event, choice) }))
                .sort((left, right) => right.score - left.score);
            const relatedEvent = rankedEvents[0]?.event || null;
            const relatedActors = asArray(provided?.actors).length
                ? provided.actors
                : asArray(relatedEvent?.actors).filter(name => !/^(protagonista|giocatore|player)$/i.test(keyOf(name)));
            const reactingActor = actors.find(actor => relatedActors.some(name => keyOf(name) === keyOf(actor.name))) ||
                actors[index % Math.max(1, actors.length)];
            const status = provided?.status || (relatedEvent?.status === 'resolved' ? 'completata' : 'in_corso');
            const result = provided?.result || cleanText(
                relatedEvent?.summary || `L'azione «${choice.actionTitle || choice.command}» è stata avviata, ma il periodo non basta ancora a garantirne il risultato finale.`,
                620
            );
            const consequence = provided?.consequence || cleanText(
                relatedEvent?.consequence || `L'iniziativa resta aperta e impegna tempo, risorse e credibilità sul tema «${choice.topic || 'strategia generale'}».`,
                520
            );
            const worldResponse = provided?.worldResponse || cleanText(
                reactingActor
                    ? `${reactingActor.name} reagisce perseguendo ${actorGoal(reactingActor)} tramite ${actorStrategy(reactingActor)}.`
                    : 'Gli attori coinvolti ricalcolano interessi e contromosse senza attendere il protagonista.',
                520
            );
            return {
                id: choice.id,
                source: provided ? 'timeline-ai' : 'timeline-fallback',
                topic: choice.topic || 'Strategia generale',
                actionTitle: choice.actionTitle || choice.command,
                command: choice.command,
                objective: choice.objective,
                status: normalizeOutcomeStatus(status),
                result,
                consequence,
                worldResponse,
                actors: relatedActors.length ? relatedActors.slice(0, 8) : (reactingActor ? [reactingActor.name] : []),
                resolvedAtTurn: Math.max(0, Number(context.turn) || 0),
                occurredAt: cleanText(context.occurredAt || context.passage?.endDate, 120),
                batchId
            };
        });
    }

    function mergeStrategicOutcomeHistory(history, outcomes, limit = 100) {
        const merged = [...asArray(history)];
        asArray(outcomes).forEach(outcome => {
            const key = `${outcome?.batchId || ''}|${outcome?.id || ''}`;
            const index = merged.findIndex(item => `${item?.batchId || ''}|${item?.id || ''}` === key);
            if (index >= 0) merged[index] = outcome;
            else merged.push(outcome);
        });
        return merged.slice(-Math.max(1, Number(limit) || 100));
    }

    function buildStrategicOutcomeChronicle(outcomes) {
        const groups = [];
        asArray(outcomes).forEach(outcome => {
            const topic = cleanText(outcome?.topic || 'Strategia generale', 140);
            let group = groups.find(item => keyOf(item.topic) === keyOf(topic));
            if (!group) {
                group = { topic, outcomes: [] };
                groups.push(group);
            }
            group.outcomes.push(outcome);
        });
        if (!groups.length) return '';
        return `\n\nEsito del piano strategico:\n${groups.map(group =>
            `${group.topic}:\n${group.outcomes.map(outcome =>
                `• ${cleanText(outcome.actionTitle, 140)} — ${cleanText(outcome.status, 40)}. ${cleanText(outcome.result, 420)} ` +
                `Conseguenza: ${cleanText(outcome.consequence, 320)} Reazione del mondo: ${cleanText(outcome.worldResponse, 320)}`
            ).join('\n')}`
        ).join('\n\n')}`;
    }

    function buildConversationStarters(events, world, context = {}) {
        const actors = activeActors(world);
        const actorByName = name => actors.find(item => keyOf(item.name) === keyOf(name));
        const protagonistKey = keyOf(context.protagonistName || 'protagonista');
        const messages = [];
        asArray(events).filter(event => isMeaningfulEvent(event) && event.conversationMode !== 'none').forEach(event => {
            const participants = asArray(event.actors).map(name => cleanText(name, 100)).filter(Boolean);
            const speakers = participants.filter(name => {
                const key = keyOf(name);
                return key && key !== protagonistKey && !/^(protagonista|giocatore|player)$/.test(key);
            }).slice(0, 4);
            speakers.forEach((name, index) => {
                const actor = actorByName(name) || { name, kind: 'npc' };
                const target = participants.find(item => keyOf(item) !== keyOf(name)) || context.protagonistName || 'protagonista';
                const text = index === 0
                    ? `Io chiedo che discutiamo ${cleanText(event.conversationGoal || 'le conseguenze di quanto è accaduto', 220)}. Voglio ${actorGoal(actor)} e userò ${actorResources(actor)} come leva.`
                    : index === 1
                        ? `Io non accetterò una soluzione che ignori il mio obiettivo. ${target}, chiarisci quali condizioni sei disposto a sostenere.`
                        : `Io rappresento interessi diversi dai vostri: ascolterò le proposte, ma difenderò ${actorGoal(actor)} con ${actorStrategy(actor)}.`;
                messages.push({
                    eventId: event.id, eventTitle: event.title, speaker: name,
                    speakerType: actor.kind === 'faction' ? 'fazione' : 'npc',
                    text, target, mood: index === 0 ? 'determinato' : 'guardingo',
                    turn: context.turn, occurredAt: event.occurredAt, source: 'timeline-fallback'
                });
            });
        });
        return messages.slice(0, 20);
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
        normalizeTimelineChoice,
        normalizeTimelineChoices,
        strategicChoiceGroups,
        desiredEventCount,
        isMeaningfulEvent,
        eventCentralityScore,
        enrichEvent,
        buildPrompt,
        createFallbackArc,
        ensureEventArc,
        parseStrategicOutcomes,
        ensureStrategicOutcomes,
        mergeStrategicOutcomeHistory,
        buildStrategicOutcomeChronicle,
        buildConversationStarters,
        buildChronicle
    };
});
