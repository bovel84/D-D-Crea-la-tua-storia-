(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheTimelineSimulator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const TIMELINE_SIMULATOR_SCHEMA_VERSION = 5;
    const EVENT_QUEUE_LIMIT = 40;
    const MIN_EVENT_DELAY_MINUTES = 5;
    const MAX_EVENT_DELAY_MINUTES = 5256000;

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

    function hashText(value) {
        let hash = 2166136261;
        const text = String(value || '');
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function isGenericActorName(value) {
        return /^(?:(?:il|la|lo|i|gli|le) )?(autorita|opposizione|comunita|custode|voce dell opposizione|guida locale|mediatore indipendente)(\b| di )/.test(keyOf(value));
    }

    function containsPlaceholder(value) {
        const text = cleanText(value, 1600);
        return /\b(?:Autorità|Opposizione|Comunità) di\b/i.test(text) ||
            /\b(?:Custode|Guida locale|Mediatore indipendente|Voce dell['’ ]Opposizione)\b/i.test(text) ||
            /\b(?:Equilibrio in cambiamento|Prossimo sviluppo del mondo|Definire il prossimo passo)\b/i.test(text) ||
            /(?:Storico|Historical)\s*\/\s*(?:Business|Economia)/i.test(text);
    }

    function isPlaceholderActor(actor) {
        return !actor || isGenericActorName(actor.name) || /deterministic-fallback|timeline-recovery/i.test(actor.source || '');
    }

    function isPlaceholderSeed(seed) {
        return Boolean(seed && containsPlaceholder([
            seed.title, seed.topic, seed.cause, seed.choice?.topic,
            seed.choice?.actionTitle, seed.choice?.command
        ].filter(Boolean).join(' ')));
    }

    function clampEventDelay(value, fallback = 1440) {
        const parsed = Number(value);
        const safe = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
        return Math.max(MIN_EVENT_DELAY_MINUTES, Math.min(MAX_EVENT_DELAY_MINUTES, safe));
    }

    function parseDurationMinutes(value) {
        const raw = String(value == null ? '' : value).trim().toLowerCase();
        if (!raw) return 0;
        if (/^\+?\d+$/.test(raw)) {
            return Math.max(0, Math.min(MAX_EVENT_DELAY_MINUTES, Number(raw.replace('+', ''))));
        }
        const units = [
            { pattern: /(\d+(?:[.,]\d+)?)\s*(?:anni?|years?|yrs?)(?!\w)/g, multiplier: 525600 },
            { pattern: /(\d+(?:[.,]\d+)?)\s*(?:mesi?|months?|mo)(?!\w)/g, multiplier: 43200 },
            { pattern: /(\d+(?:[.,]\d+)?)\s*(?:settimane?|weeks?|w)(?!\w)/g, multiplier: 10080 },
            { pattern: /(\d+(?:[.,]\d+)?)\s*(?:giorni?|days?|d)(?!\w)/g, multiplier: 1440 },
            { pattern: /(\d+(?:[.,]\d+)?)\s*(?:ore?|hours?|hrs?|h)(?!\w)/g, multiplier: 60 },
            { pattern: /(\d+(?:[.,]\d+)?)\s*(?:minuti?|mins?|min|m)(?!\w)/g, multiplier: 1 }
        ];
        let total = 0;
        units.forEach(({ pattern, multiplier }) => {
            let match;
            while ((match = pattern.exec(raw)) !== null) {
                total += Number(match[1].replace(',', '.')) * multiplier;
            }
        });
        return total > 0 ? clampEventDelay(total) : 0;
    }

    function normalizeInteractionMode(value, fallback = 'none') {
        const mode = keyOf(value);
        if (/either|entramb|scelta|dialogo o azione/.test(mode)) return 'either';
        if (/dialog|chat|parl|negozi|riunione|udienza/.test(mode)) return 'dialogue';
        if (/action|azione|agire|missione|intervento/.test(mode)) return 'action';
        if (/none|nessun|automatic/.test(mode)) return 'none';
        return ['dialogue', 'action', 'either', 'none'].includes(fallback) ? fallback : 'none';
    }

    function inferInteractionMode(value) {
        const text = keyOf(value);
        if (/convoc|negozi|incontr|parl|chied|discut|intervist|udienza|mediazione/.test(text)) return 'dialogue';
        if (/attacc|difend|costru|invi|schier|indag|arrest|viaggi|acquist|finanzi|ordino|ispezion|sabota/.test(text)) return 'action';
        return 'either';
    }

    function inferEventDelay(source = {}) {
        const rawDelay = source.notBeforeMinutes ?? source.delayMinutes;
        const numericDelay = Number(rawDelay);
        if (Number.isFinite(numericDelay) && numericDelay >= 0) {
            return Math.min(MAX_EVENT_DELAY_MINUTES, Math.round(numericDelay));
        }
        const explicit = parseDurationMinutes(rawDelay || source.duration);
        if (explicit) return explicit;
        const text = keyOf([
            source.cause, source.title, source.summary, source.command, source.duration, source.kind
        ].filter(Boolean).join(' '));
        if (/immediat|urgente|\bora\b|\badesso\b|attacco|agguato|incendio|arresto/.test(text)) return 30;
        if (/minut|telefon|messaggio|ordine|convoc/.test(text)) return 120;
        if (/ora|giornata|dialog|incontro|udienza/.test(text)) return 480;
        if (/breve periodo|domani|giorno/.test(text)) return 1440;
        if (/settimana|negoziato|indagine|preparazione/.test(text)) return 10080;
        if (/mese|medio periodo|campagna|costruzione/.test(text)) return 43200;
        if (/anno|lungo periodo|successione|riforma strutturale/.test(text)) return 525600;
        return source.kind === 'world_initiative' ? 2880 : 1440;
    }

    function normalizeEventSeed(source, index = 0, context = {}) {
        const input = source && typeof source === 'object' ? source : { cause: source };
        const choice = input.choice ? normalizeTimelineChoice(input.choice, index) : null;
        const cause = cleanText(input.cause || input.summary || choice?.summary || input.title, 700);
        if (!cause) return null;
        const kindKey = keyOf(input.kind || input.type || (choice?.isStrategic ? 'strategic_action' : choice ? 'player_action' : 'world_initiative'));
        const kind = /strateg/.test(kindKey) ? 'strategic_action'
            : /chat|dialog/.test(kindKey) ? 'dialogue_reply'
                : /player|giocatore/.test(kindKey) ? 'player_action'
                    : /world.?initiative|iniziativa/.test(kindKey) ? 'world_initiative'
                        : /world|mondo|reaction|reazione/.test(kindKey) ? 'world_reply'
                            : /action|continu|follow|azione/.test(kindKey) ? 'action_reply'
                                : choice ? 'player_action' : 'world_initiative';
        const actors = asArray(input.actors || choice?.actors)
            .map(item => cleanText(item, 100)).filter(Boolean).slice(0, 8);
        const createdAtTurn = Math.max(0, Number(input.createdAtTurn ?? context.turn) || 0);
        const batchId = cleanText(input.batchId || context.batchId || `event-batch-${createdAtTurn}`, 180);
        const rawId = cleanText(input.id, 170).replace(/[^a-zA-Z0-9_-]/g, '');
        const sourceId = cleanText(input.sourceId || choice?.id, 160).replace(/[^a-zA-Z0-9_-]/g, '');
        const interactionMode = normalizeInteractionMode(
            input.interactionMode,
            inferInteractionMode(`${choice?.command || ''} ${cause}`)
        );
        return {
            id: rawId || `pending-${hashText(`${batchId}|${sourceId}|${kind}|${cause}|${index}`)}`,
            kind,
            title: cleanText(input.title || choice?.actionTitle || choice?.topic || 'Sviluppo in attesa', 160),
            topic: cleanText(input.topic || choice?.topic, 140),
            cause,
            actors,
            priority: Math.max(0, Math.min(100, Math.round(Number(input.priority) || (choice?.isStrategic ? 90 : choice ? 80 : 55)))),
            notBeforeMinutes: inferEventDelay({ ...input, choice, kind, cause }),
            interactionMode,
            sourceId,
            source: cleanText(input.source || choice?.source || 'timeline-queue', 60),
            choice,
            batchId,
            depth: Math.max(0, Math.min(4, Math.round(Number(input.depth) || 0))),
            createdAtTurn,
            status: 'pending'
        };
    }

    function normalizeEventQueue(queue, context = {}) {
        const seen = new Set();
        return asArray(queue).map((item, index) => normalizeEventSeed(item, index, context)).filter(item => {
            if (!item || isPlaceholderSeed(item)) return false;
            const fingerprint = keyOf(`${item.sourceId}|${item.kind}|${item.cause}`);
            if (seen.has(item.id) || seen.has(fingerprint)) return false;
            seen.add(item.id);
            seen.add(fingerprint);
            return true;
        }).slice(-EVENT_QUEUE_LIMIT);
    }

    function normalizeTimelineChoice(source, index = 0) {
        const input = source && typeof source === 'object' ? source : { summary: source };
        const summary = cleanText(input.summary || input.description || input.command, 700);
        if (!summary || containsPlaceholder(`${input.topic || ''} ${input.actionTitle || input.title || ''} ${summary}`)) return null;
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

    function normalizeKnownActor(actor) {
        if (typeof actor === 'string') {
            return { name: cleanText(actor, 120), kind: 'npc', influence: 20, source: 'event-memory' };
        }
        const input = actor && typeof actor === 'object' ? actor : {};
        return {
            ...input,
            name: cleanText(input.name, 120),
            kind: input.kind === 'faction' || input.type === 'fazione' ? 'faction' : (input.kind || 'npc'),
            goal: cleanText(input.goal || input.goals || input.publicGoal, 300),
            strategy: cleanText(input.strategy || input.agenda, 260),
            resources: cleanText(input.resources || input.leverage, 240),
            influence: Number(input.influence) || Math.max(10, Number(input.level || 1) * 10),
            source: cleanText(input.source || 'memory', 60)
        };
    }

    function activeActors(world, context = {}) {
        const recentNames = asArray(context.recentEvents).flatMap(event => asArray(event?.actors));
        const protagonistKey = keyOf(context.protagonistName || 'protagonista');
        const seen = new Set();
        return [
            ...asArray(world?.actors),
            ...asArray(world?.factions),
            ...asArray(context.knownActors),
            ...recentNames
        ]
            .map(normalizeKnownActor)
            .filter(actor => actor && actor.status !== 'dead' && actor.status !== 'resolved' && cleanText(actor.name, 120))
            .filter(actor => !isPlaceholderActor(actor) && keyOf(actor.name) !== protagonistKey)
            .filter(actor => {
                const key = keyOf(actor.name);
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .sort((left, right) => {
                const score = actor => Number(actor.influence || 0) +
                    (actor.kind === 'faction' ? 4 : 0);
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
        const world = context.world || {};
        let queue = normalizeEventQueue(context.pendingEvents, { turn: context.turn, batchId: context.batchId });
        if (!context.seed && asArray(context.choices).length) {
            queue = scheduleEventSeeds(queue, createEventSeeds(context.choices, world, {
                turn: context.turn,
                batchId: context.batchId,
                currentDate: context.currentDate,
                includeWorld: false
            }), { turn: context.turn, batchId: context.batchId });
        }
        const seed = normalizeEventSeed(context.seed || selectNextEventSeed(queue), 0, {
            turn: context.turn,
            batchId: context.batchId
        });
        const actorLimit = Math.max(1, Math.min(20, Number(context.actorLimit) || 8));
        const relationLimit = Math.max(1, Math.min(20, Number(context.relationLimit) || 6));
        const forceLimit = Math.max(1, Math.min(16, Number(context.forceLimit) || 5));
        const recentEventLimit = Math.max(1, Math.min(20, Number(context.recentEventLimit) || 6));
        const agreementLimit = Math.max(1, Math.min(16, Number(context.agreementLimit) || 6));
        const actors = activeActors(world, context).slice(0, actorLimit);
        const relations = asArray(world.relations).filter(item =>
            item.status !== 'resolved' && !isGenericActorName(item.from) && !isGenericActorName(item.to)
        ).slice(0, relationLimit);
        const forces = asArray(world.forces).filter(item =>
            item.status !== 'resolved' &&
            !containsPlaceholder(`${item.name || ''} ${item.actor || ''}`) &&
            !/deterministic-fallback|timeline-recovery/i.test(item.source || '')
        ).slice(0, forceLimit);
        const recent = asArray(context.recentEvents).filter(isMeaningfulEvent).slice(-recentEventLimit);
        const agreements = asArray(context.agreements).filter(item => !/rejected|broken|fulfilled/.test(keyOf(item.status))).slice(-agreementLimit);
        const history = world.historicalContext || {};
        const choice = seed?.choice || null;
        const manualLimit = Number(context.maxAdvanceMinutes) > 0
            ? `Non superare ${Math.round(Number(context.maxAdvanceMinutes))} minuti prima dell'evento.`
            : 'Il tempo può essere di minuti, ore, giorni, mesi o anni: scegli il primo momento causalmente realistico, senza usare intervalli predefiniti.';
        const strategicInstruction = choice?.isStrategic
            ? `Questa è l'unica azione strategica da risolvere ora. Emetti esattamente un ESITO_STRATEGICO con ID ${choice.id}. Se richiede altri passaggi usa in_corso e pianifica il seguito con CODA_EVENTO.`
            : 'Non emettere ESITO_STRATEGICO in questa chiamata.';
        return `SIMULATORE DEL PROSSIMO EVENTO IMPORTANTE. Questa chiamata deve creare UN SOLO evento, non un arco completo e non un riepilogo.

${cleanText(context.continuityPrompt, 16000) || 'CANONE PERSISTENTE: usa i fatti concreti già registrati e non sostituirli con categorie astratte.'}

DATA ATTUALE: ${cleanText(context.currentDate || history.date || 'data corrente della campagna', 160)}.
STORIA: ${cleanText(context.story?.title, 120)} — ${cleanText(context.story?.setting || world.setting, 180)}.
CONFLITTO CENTRALE: ${cleanText(world.centralConflict || world.premise || context.story?.desc, 500)}.

SVILUPPO DA CONSUMARE ORA:
- ID coda: ${seed?.id || 'world-next'}
- Tipo: ${seed?.kind || 'world_initiative'}
- Causa già vera: ${seed?.cause || 'La trama più urgente del mondo continua a muoversi'}
- Titolo/argomento: ${seed?.title || seed?.topic || 'iniziativa del mondo'}
- Argomento strategico: ${seed?.topic || 'nessuno'}
- Attori già collegati: ${seed?.actors?.join(', ') || 'scegli soltanto fra gli attori registrati'}
- Interazione prevista: ${seed?.interactionMode || 'either'}
${choice ? `- Azione del giocatore: ${choice.command}\n- Obiettivo: ${choice.objective || 'da verificare'}; costo: ${choice.cost || 'da verificare'}; durata stimata: ${choice.duration || 'da stimare'}; rischio: ${choice.risk || 'medio'}; contropartita: ${choice.tradeoff || 'da verificare'}` : ''}

TEMPO FINO ALL'EVENTO:
- ${manualLimit}
- Emetti ATTESA_EVENTO con minuti interi e una motivazione causale. Il motore farà vivere normalmente il protagonista durante l'attesa; non trasformare sonno, pasti o routine in un evento.
- Non anticipare un fatto che richiede viaggio, preparazione, risposta istituzionale o maturazione economica; non rinviare artificialmente un pericolo immediato.

BASE STORICO-POLITICA:
- Data/epoca: ${cleanText(history.date || context.currentDate || 'data della campagna', 160)}.
- Area e istituzioni: ${cleanText(history.region || world.setting, 180)}; ${cleanText(history.politicalSystem || 'assetto già registrato', 420)}.
- Situazione: ${cleanText(history.baseline || world.premise, 560)}.
- Tensioni: ${cleanText(history.activeTensions || world.centralConflict, 460)}.
- Vincoli: ${cleanText(history.constraints || 'rispetta cariche, distanze, risorse e conoscenze dell’epoca', 460)}.
- Divergenza: ${cleanText(history.divergencePolicy || 'ogni deviazione nasce soltanto da fatti già registrati', 340)}.

ATTORI VIVI:
${actors.length ? actors.map(actorLine).join('\n') : '- Usa esclusivamente nomi già presenti nella storia.'}

RELAZIONI:
${relations.length ? relations.map(item => `- ${cleanText(item.from, 100)} ↔ ${cleanText(item.to, 100)}: ${cleanText(item.type, 80)}, fiducia ${Math.round(Number(item.trust) || 0)}, tensione ${Math.round(Number(item.tension) || 0)}; ${cleanText(item.description, 220)}.`).join('\n') : '- Nessuna relazione strutturata.'}

FORZE APERTE:
${forces.length ? forces.map(item => `- ${cleanText(item.name, 120)}: ${cleanText(item.actor, 100)} persegue ${cleanText(item.objective, 260)}; progresso ${Math.round(Number(item.progress) || 0)}%, urgenza ${Math.round(Number(item.urgency) || 0)}%.`).join('\n') : '- Fai avanzare il conflitto centrale senza introdurre forze anonime.'}

ACCORDI ATTIVI:
${agreements.length ? agreements.map(item => `- ${cleanText(item.title, 120)} tra ${asArray(item.parties).map(name => cleanText(name, 90)).join(', ')}: ${cleanText(item.terms, 340)}; stato ${cleanText(item.status, 40)}.`).join('\n') : '- Nessuno.'}

EVENTI RECENTI DA CONTINUARE SENZA RIPETERLI:
${recent.length ? recent.map(item => `- ${cleanText(item.occurredAt, 100) ? `${cleanText(item.occurredAt, 100)} — ` : ''}${cleanText(item.title, 140)} [${asArray(item.actors).map(name => cleanText(name, 100)).join(', ')}]: ${cleanText(item.summary, 900)}${item.consequence ? ` Conseguenza ancora valida: ${cleanText(item.consequence, 600)}` : ''}`).join('\n') : '- Nessuno.'}

REGOLE OBBLIGATORIE:
- Genera esattamente UN EVENTO: il primo fatto importante prodotto dalla causa in coda. Non generare eventi successivi nella stessa risposta.
- ${strategicInstruction}
- Il fatto deve contenere 3-5 frasi complete, azione osservabile, strumento usato, risultato verificabile e conseguenza persistente. Un'intenzione non è un risultato.
- La conseguenza deve contenere 1-2 frasi complete. Chiudi ogni frase e ogni campo prima del separatore |; non interrompere mai un testo a metà.
- Usa soltanto nomi propri, cariche e istituzioni presenti nel contesto. Vietati segnaposto come Autorità, Opposizione, Mediatore o Comunità.
- interaction è dialogue se il giocatore deve rispondere parlando, action se deve agire nella scena, either se può scegliere, none se il fatto si risolve senza intervento.
- Se serve un dialogo, puoi emettere al massimo UNA CHAT di apertura pronunciata da un solo interlocutore. Mai parole inventate per il protagonista.
- Le conseguenze future non vanno narrate ora: lasciale in attesa con massimo 3 CODA_EVENTO compatti. Una CODA_EVENTO descrive solo causa e attori del futuro sviluppo, non il suo esito.
- Per l'attore che agisce emetti al massimo un MONDO. Restituisci soltanto i tag seguenti.

[ATTESA_EVENTO: minuti_interi|motivo del tempo necessario]
[EVENTO: tipo|titolo|tre-cinque frasi complete su ciò che è realmente accaduto|luogo|attori separati da virgola|una-due frasi complete sulla conseguenza persistente|normal/high/critical|active/developing/resolved|momento relativo|causa precisa|ancoraggio storico|spostamento politico|posta in gioco|obiettivo conversazione|available/required/none|dialogue/action/either/none]
[ESITO_STRATEGICO: ID esatto|completata/parziale/fallita/in_corso|risultato osservabile del tentativo|conseguenza persistente|reazione concreta del mondo ancora da sviluppare|attori separati da virgola]
[MONDO: attore|mossa concreta compiuta|stato della mossa|visible/hidden]
[CHAT: titolo esatto evento|un solo parlante|npc/fazione/regno/gruppo|messaggio in prima persona|destinatario|emozione]
[CODA_EVENTO: id o vuoto|player_action/world_reply/action_reply/dialogue_reply/world_initiative|causa già vera da sviluppare|attori separati da virgola|priorità 0-100|minuti minimi|dialogue/action/either/none|id sorgente o vuoto]`;
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
        return activeActors(world, context);
    }

    function eventCentralityScore(event, context = {}) {
        if (!isMeaningfulEvent(event)) return 0;
        const actors = asArray(event.actors).map(item => cleanText(item, 100)).filter(Boolean);
        const summary = cleanText(event.summary, 600);
        const consequence = cleanText(event.consequence, 400);
        const known = new Set(activeActors(context.world || {}, context).map(item => keyOf(item.name)));
        let score = 0;
        if (summary.length >= 60 && summary.split(/[.!?]+/).filter(Boolean).length >= 2) score += 2;
        if (actors.length >= 2) score += 2;
        if (actors.length && actors.every(name => !isGenericActorName(name))) score += 2;
        if (actors.some(isGenericActorName)) score -= 4;
        if (containsPlaceholder(`${event?.title || ''} ${summary} ${event?.cause || ''}`)) score -= 10;
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
        if (!actors.length) return { events: [], moves: [] };
        const relations = asArray(context.world?.relations).filter(item =>
            item.status !== 'resolved' && !isGenericActorName(item.from) && !isGenericActorName(item.to)
        );
        const forces = asArray(context.world?.forces).filter(item =>
            item.status !== 'resolved' && !containsPlaceholder(`${item.name || ''} ${item.actor || ''}`)
        );
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

    function createEventSeeds(choices, world, context = {}) {
        const normalizedChoices = normalizeTimelineChoices(choices);
        const turn = Math.max(0, Number(context.turn) || 0);
        const batchId = cleanText(context.batchId || `event-batch-${turn}-${hashText(context.currentDate || turn)}`, 180);
        const seeds = normalizedChoices.map((choice, index) => normalizeEventSeed({
            id: `pending-${choice.id}-${hashText(batchId)}`,
            kind: choice.isStrategic ? 'strategic_action' : keyOf(choice.source).includes('chat') ? 'dialogue_reply' : 'player_action',
            title: choice.actionTitle || choice.topic || 'Risposta alla scelta del giocatore',
            topic: choice.topic,
            cause: choice.command || choice.summary,
            actors: choice.actors,
            priority: choice.isStrategic ? 92 : 82,
            duration: choice.duration,
            interactionMode: inferInteractionMode(choice.command || choice.summary),
            sourceId: choice.id,
            source: choice.source,
            choice,
            batchId,
            createdAtTurn: turn
        }, index, { turn, batchId })).filter(Boolean);

        if (context.includeWorld !== false) {
            const forces = asArray(world?.forces)
                .filter(item => item && item.status !== 'resolved' &&
                    !containsPlaceholder(`${item.name || ''} ${item.actor || ''}`) &&
                    !/deterministic-fallback|timeline-recovery/i.test(item.source || ''))
                .sort((left, right) => Number(right.urgency || 0) - Number(left.urgency || 0));
            const actors = activeActors(world, context);
            const force = forces[0];
            const actor = actors.find(item => keyOf(item.name) === keyOf(force?.actor)) || actors[0];
            if (force || actor) {
                const urgency = Math.max(0, Math.min(100, Number(force?.urgency) || 45));
                const delay = Math.max(60, Math.round(43200 * (1 - urgency / 110)));
                const worldSeed = normalizeEventSeed({
                    id: `pending-world-${hashText(`${batchId}|${force?.name || actor?.name}`)}`,
                    kind: 'world_initiative',
                    title: force?.name || `Iniziativa di ${actor?.name}`,
                    cause: force
                        ? `${force.actor || actor?.name} porta avanti «${force.name}» per ${force.objective || actor?.goal || 'rafforzare la propria posizione'}`
                        : `${actor.name} continua a perseguire ${actor.goal || actor.publicGoal || 'il proprio obiettivo'} tramite ${actor.strategy || actor.agenda || 'le risorse disponibili'}`,
                    actors: [force?.actor || actor?.name].filter(Boolean),
                    priority: Math.max(45, Math.round(urgency)),
                    notBeforeMinutes: delay,
                    interactionMode: 'either',
                    sourceId: force?.id || force?.name || actor?.id || actor?.name,
                    source: 'world-autonomy',
                    batchId,
                    createdAtTurn: turn
                }, seeds.length, { turn, batchId });
                if (worldSeed) seeds.push(worldSeed);
            } else {
                const previousEvent = [...asArray(context.recentEvents)].reverse().find(isMeaningfulEvent);
                if (previousEvent && !containsPlaceholder(`${previousEvent.title || ''} ${previousEvent.summary || ''}`)) {
                    const worldSeed = normalizeEventSeed({
                        id: `pending-continuity-${hashText(`${batchId}|${previousEvent.id || previousEvent.title}`)}`,
                        kind: 'world_reply',
                        title: `Conseguenza di ${previousEvent.title || 'quanto è accaduto'}`,
                        cause: previousEvent.consequence || previousEvent.summary,
                        actors: asArray(previousEvent.actors),
                        priority: previousEvent.importance === 'critical' ? 90 : 70,
                        notBeforeMinutes: previousEvent.importance === 'critical' ? 60 : 1440,
                        interactionMode: normalizeInteractionMode(previousEvent.interactionMode, 'either'),
                        sourceId: previousEvent.id,
                        source: 'event-continuity',
                        batchId,
                        createdAtTurn: turn
                    }, seeds.length, { turn, batchId });
                    if (worldSeed) seeds.push(worldSeed);
                }
            }
        }
        return normalizeEventQueue(seeds, { turn, batchId });
    }

    function scheduleEventSeeds(queue, incoming, context = {}) {
        const merged = normalizeEventQueue(queue, context);
        const ids = new Set(merged.map(item => item.id));
        const fingerprints = new Set(merged.map(item => keyOf(`${item.sourceId}|${item.kind}|${item.cause}`)));
        normalizeEventQueue(incoming, context).forEach(seed => {
            const fingerprint = keyOf(`${seed.sourceId}|${seed.kind}|${seed.cause}`);
            if (ids.has(seed.id) || fingerprints.has(fingerprint)) return;
            merged.push(seed);
            ids.add(seed.id);
            fingerprints.add(fingerprint);
        });
        return merged.slice(-EVENT_QUEUE_LIMIT);
    }

    function selectNextEventSeed(queue) {
        const normalized = normalizeEventQueue(queue);
        return normalized.slice().sort((left, right) =>
            Number(left.notBeforeMinutes || 0) - Number(right.notBeforeMinutes || 0) ||
            Number(right.priority || 0) - Number(left.priority || 0) ||
            Number(left.createdAtTurn || 0) - Number(right.createdAtTurn || 0)
        )[0] || null;
    }

    function advanceEventQueue(queue, consumedId, elapsedMinutes) {
        const elapsed = Math.max(0, Number(elapsedMinutes) || 0);
        return normalizeEventQueue(queue).filter(seed => seed.id !== consumedId).map(seed => ({
            ...seed,
            notBeforeMinutes: Math.max(0, Number(seed.notBeforeMinutes || 0) - elapsed)
        })).slice(-EVENT_QUEUE_LIMIT);
    }

    function parseEventTiming(response, seed, options = {}) {
        const match = String(response || '').match(/\[ATTESA_EVENTO:\s*([^|\]]+)(?:\|([^\]]*))?\]/i);
        const parsed = match ? parseDurationMinutes(match[1]) : 0;
        const minimum = Math.max(0, Number(seed?.notBeforeMinutes) || 0);
        const fallback = Math.max(MIN_EVENT_DELAY_MINUTES, minimum || inferEventDelay(seed || {}));
        const maxAdvance = Number(options.maxAdvanceMinutes) > 0
            ? Math.max(MIN_EVENT_DELAY_MINUTES, Number(options.maxAdvanceMinutes))
            : MAX_EVENT_DELAY_MINUTES;
        return {
            minutes: Math.min(maxAdvance, clampEventDelay(Math.max(minimum, parsed || fallback), fallback)),
            reason: cleanText(match?.[2] || `Tempo necessario perché maturi «${seed?.title || 'il prossimo evento'}»`, 320),
            source: parsed ? 'timeline-ai' : 'timeline-fallback'
        };
    }

    function parsePendingEventSeeds(response, context = {}) {
        const seeds = [];
        const regex = /\[CODA_EVENTO:\s*([^\]]+)\]/gi;
        let match;
        while ((match = regex.exec(String(response || ''))) !== null && seeds.length < 3) {
            const parts = match[1].split('|').map(item => cleanText(item, 700));
            const seed = normalizeEventSeed({
                id: parts[0], kind: parts[1], cause: parts[2], actors: String(parts[3] || '').split(/[,;]/),
                priority: parts[4], notBeforeMinutes: parts[5], interactionMode: parts[6], sourceId: parts[7],
                title: parts[2], source: 'timeline-ai-queue', batchId: context.batchId,
                createdAtTurn: context.turn, depth: Math.min(4, Number(context.parentSeed?.depth || 0) + 1)
            }, seeds.length, context);
            if (seed) seeds.push(seed);
        }
        return normalizeEventQueue(seeds, context);
    }

    function createFallbackEvent(context = {}) {
        const seed = normalizeEventSeed(context.seed || {
            kind: 'world_initiative',
            cause: context.world?.centralConflict || context.story?.desc || 'Il mondo continua a cambiare'
        }, 0, context);
        const actors = fallbackActors(context.world || {}, context);
        const named = seed?.actors?.map(name => actors.find(actor => keyOf(actor.name) === keyOf(name))).filter(Boolean) || [];
        const actor = named[0] || actors[0];
        if (!actor) return null;
        const protagonistName = cleanText(context.protagonistName, 100);
        const protagonist = protagonistName && keyOf(protagonistName) !== keyOf(actor.name)
            ? { name: protagonistName, kind: 'protagonista' }
            : null;
        const target = named[1] || actors.find(item => keyOf(item.name) !== keyOf(actor.name)) || protagonist;
        const place = actorPlace(actor, context);
        const choice = seed?.choice;
        const strategic = choice?.isStrategic;
        const worldLed = /^world/.test(seed?.kind || '');
        const event = worldLed ? {
            type: actor?.kind === 'faction' ? 'politica' : 'mondo',
            title: seed?.title || `La mossa di ${actor.name}`,
            summary: `${actor.name}, perseguendo ${actorGoal(actor)}, ha usato ${actorResources(actor)} per ${actorStrategy(actor)}. La mossa è diventata visibile${target ? ` a ${target.name}, che ora deve ricalcolare la propria posizione` : ' nel contesto già registrato'}.`,
            consequence: `${actor.name} conquista temporaneamente l'iniziativa${target ? ` e ${target.name} deve decidere se reagire, negoziare o ostacolarlo` : ''}.`,
            actors: [actor.name, target?.name].filter(Boolean)
        } : {
            type: strategic ? 'decisione' : 'missione',
            title: seed?.title || (strategic ? `${choice.topic}: il piano entra in azione` : 'La scelta produce un primo effetto'),
            summary: `Il protagonista ha avviato «${cleanText(choice?.command || seed?.cause, 300)}» usando le risorse realmente disponibili. ${actor.name}, interessato a ${actorGoal(actor)}, ha osservato il tentativo e ne ha condizionato il primo risultato.`,
            consequence: strategic
                ? `L'azione su «${choice.topic || seed?.topic || 'la questione'}» produce un primo esito verificabile, mentre la risposta di ${actor.name} resta da sviluppare.`
                : `La scelta del protagonista cambia le opzioni di ${actor.name} e prepara una risposta del mondo.`,
            actors: [actor.name, target?.name].filter(Boolean),
            strategicTopic: choice?.topic,
            strategicActionIds: strategic ? [choice.id] : []
        };
        return enrichEvent({
            ...event,
            location: place,
            importance: seed?.priority >= 85 ? 'critical' : 'high',
            status: 'developing',
            occurredAt: context.occurredAt || context.passage?.endDate || 'prossimo momento importante',
            cause: seed?.cause,
            interactionMode: seed?.interactionMode || 'either',
            source: 'timeline-fallback',
            seedId: seed?.id,
            queueKind: seed?.kind
        }, context, 0, null);
    }

    function ensureSingleEvent(incomingEvents, context = {}) {
        const meaningful = asArray(incomingEvents).filter(isMeaningfulEvent);
        const accepted = meaningful.find(event => eventCentralityScore(event, context) >= 6);
        const event = accepted
            ? enrichEvent({
                ...accepted,
                occurredAt: context.occurredAt || context.passage?.endDate || accepted.occurredAt,
                interactionMode: normalizeInteractionMode(
                    accepted.interactionMode,
                    context.seed?.interactionMode || (accepted.conversationMode === 'required' ? 'dialogue' : 'either')
                ),
                seedId: context.seed?.id,
                queueKind: context.seed?.kind,
                strategicTopic: context.seed?.choice?.topic || accepted.strategicTopic,
                strategicActionIds: context.seed?.choice?.isStrategic ? [context.seed.choice.id] : asArray(accepted.strategicActionIds)
            }, context, 0, null)
            : createFallbackEvent(context);
        return {
            event,
            events: event ? [event] : [],
            usedFallback: !accepted,
            qualityRejected: meaningful.length - (accepted ? 1 : 0)
        };
    }

    function buildFollowUpSeeds(event, outcome, context = {}) {
        const parent = normalizeEventSeed(context.parentSeed, 0, context);
        if (!parent || parent.depth >= 4) return [];
        const nextDepth = parent.depth + 1;
        const batchId = parent.batchId || context.batchId;
        const turn = Math.max(0, Number(context.turn) || 0);
        const actors = asArray(event?.actors).filter(Boolean);
        const seeds = [];
        if (parent.kind === 'strategic_action' && outcome?.status === 'in_corso') {
            seeds.push({
                id: `pending-follow-${hashText(`${parent.id}|${nextDepth}|action`)}`,
                kind: 'action_reply',
                title: `Seguito: ${parent.title}`,
                topic: parent.topic,
                cause: outcome.consequence || event?.consequence || `L'azione «${parent.title}» richiede un ulteriore passaggio`,
                actors,
                priority: Math.max(65, parent.priority - 5),
                notBeforeMinutes: inferEventDelay({ duration: parent.choice?.duration, kind: 'action_reply' }),
                interactionMode: parent.interactionMode,
                sourceId: parent.sourceId,
                source: 'strategic-follow-up',
                choice: parent.choice,
                batchId,
                depth: nextDepth,
                createdAtTurn: turn
            });
        }
        const needsWorldReply = ['strategic_action', 'player_action', 'dialogue_reply', 'action_reply', 'world_initiative'].includes(parent.kind) &&
            Boolean(outcome?.worldResponse || event?.consequence);
        if (needsWorldReply) {
            seeds.push({
                id: `pending-reply-${hashText(`${parent.id}|${nextDepth}|world`)}`,
                kind: 'world_reply',
                title: `Reazione a ${parent.title}`,
                topic: parent.topic,
                cause: outcome?.worldResponse || `Gli attori coinvolti reagiscono a: ${event.consequence}`,
                actors: outcome?.actors?.length ? outcome.actors : actors,
                priority: Math.max(60, parent.priority - 8),
                notBeforeMinutes: event?.importance === 'critical' ? 60 : 720,
                interactionMode: 'either',
                sourceId: parent.sourceId || event?.id,
                source: 'causal-world-reply',
                batchId,
                depth: nextDepth,
                createdAtTurn: turn
            });
        }
        return normalizeEventQueue(seeds, { turn, batchId });
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
        const actors = activeActors(world, context);
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
                `Conseguenza: ${cleanText(outcome.consequence, 320)} Sviluppo del mondo in attesa: ${cleanText(outcome.worldResponse, 320)}`
            ).join('\n')}`
        ).join('\n\n')}`;
    }

    function buildConversationStarters(events, world, context = {}) {
        const actors = activeActors(world, context);
        const actorByName = name => actors.find(item => keyOf(item.name) === keyOf(name));
        const protagonistKey = keyOf(context.protagonistName || 'protagonista');
        const event = asArray(events).find(item =>
            isMeaningfulEvent(item) && item.conversationMode !== 'none' &&
            ['dialogue', 'either'].includes(normalizeInteractionMode(item.interactionMode, item.conversationMode === 'required' ? 'dialogue' : 'either'))
        );
        if (!event) return [];
        const participants = asArray(event.actors).map(name => cleanText(name, 100)).filter(Boolean);
        const name = participants.find(item => {
            const key = keyOf(item);
            return key && key !== protagonistKey && !/^(protagonista|giocatore|player)$/.test(key);
        });
        if (!name) return [];
        const actor = actorByName(name) || { name, kind: 'npc' };
        const target = participants.find(item => keyOf(item) !== keyOf(name)) || context.protagonistName || 'protagonista';
        return [{
            eventId: event.id,
            eventTitle: event.title,
            speaker: name,
            speakerType: actor.kind === 'faction' ? 'fazione' : 'npc',
            text: `Io chiedo che discutiamo ${cleanText(event.conversationGoal || 'le conseguenze di quanto è accaduto', 220)}. Voglio ${actorGoal(actor)} e userò ${actorResources(actor)} come leva.`,
            target,
            mood: 'determinato',
            turn: context.turn,
            occurredAt: event.occurredAt,
            source: 'timeline-fallback'
        }];
    }

    function buildChronicle(events, passage = {}) {
        const meaningful = asArray(events).filter(isMeaningfulEvent);
        if (!meaningful.length) return '';
        const lines = meaningful.map(event =>
            `• ${cleanText(event.occurredAt || 'Durante il periodo', 100)} — ${cleanText(event.summary, 1400)}`
        );
        const finalConsequence = cleanText(meaningful[meaningful.length - 1].consequence, 900);
        return `Durante ${cleanText(passage.description || 'il periodo', 120)}, il protagonista ha continuato a dormire, mangiare e vivere normalmente. Nel frattempo il mondo non è rimasto fermo:\n\n${lines.join('\n\n')}` +
            (finalConsequence ? `\n\nSituazione attuale: ${finalConsequence}` : '');
    }

    return {
        TIMELINE_SIMULATOR_SCHEMA_VERSION,
        EVENT_QUEUE_LIMIT,
        MIN_EVENT_DELAY_MINUTES,
        MAX_EVENT_DELAY_MINUTES,
        cleanText,
        keyOf,
        isGenericActorName,
        containsPlaceholder,
        isPlaceholderSeed,
        parseDurationMinutes,
        normalizeInteractionMode,
        inferInteractionMode,
        inferEventDelay,
        normalizeTimelineChoice,
        normalizeTimelineChoices,
        normalizeEventSeed,
        normalizeEventQueue,
        createEventSeeds,
        scheduleEventSeeds,
        selectNextEventSeed,
        advanceEventQueue,
        parseEventTiming,
        parsePendingEventSeeds,
        strategicChoiceGroups,
        desiredEventCount,
        isMeaningfulEvent,
        eventCentralityScore,
        enrichEvent,
        buildPrompt,
        createFallbackArc,
        ensureEventArc,
        createFallbackEvent,
        ensureSingleEvent,
        buildFollowUpSeeds,
        parseStrategicOutcomes,
        ensureStrategicOutcomes,
        mergeStrategicOutcomeHistory,
        buildStrategicOutcomeChronicle,
        buildConversationStarters,
        buildChronicle
    };
});
