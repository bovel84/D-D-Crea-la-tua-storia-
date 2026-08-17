(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheTimelineSimulator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const TIMELINE_SIMULATOR_SCHEMA_VERSION = 10;
    const EVENT_QUEUE_LIMIT = 40;
    const MAX_PLAYER_ACTIONS_PER_TURN = 4;
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

    const CAUSAL_STOP_WORDS = new Set([
        'alla', 'alle', 'anche', 'come', 'dalla', 'dalle', 'della', 'delle', 'degli',
        'dello', 'dopo', 'entro', 'essere', 'giocatore', 'mondo', 'nella', 'nelle',
        'protagonista', 'questa', 'questo', 'sono', 'sulla', 'sulle', 'viene'
    ]);

    function causalTokens(value) {
        return keyOf(value).split(/\s+/).filter(token => token.length >= 4 && !CAUSAL_STOP_WORDS.has(token));
    }

    function causalLabelFor(value) {
        const kind = keyOf(value);
        if (!kind) return '';
        if (kind === 'strategic_action') return 'Esito del piano';
        if (kind === 'player_action') return 'Risposta alla tua azione';
        if (kind === 'dialogue_reply') return 'Conseguenza del dialogo';
        if (kind === 'action_reply') return 'Sviluppo della tua azione';
        if (kind === 'world_reply') return 'Reazione del mondo';
        return 'Iniziativa del mondo';
    }

    function causalAlignmentScore(event, seed) {
        if (!seed) return 10;
        const source = [seed.cause, seed.title, seed.topic, seed.choice?.command, seed.choice?.objective]
            .filter(Boolean).join(' ');
        const outcome = [event?.title, event?.summary, event?.cause, event?.choice, event?.consequence]
            .filter(Boolean).join(' ');
        const sourceTokens = [...new Set(causalTokens(source))];
        const outcomeKey = keyOf(outcome);
        const matched = sourceTokens.filter(token => outcomeKey.includes(token));
        const seedActors = asArray(seed.actors).map(keyOf).filter(Boolean);
        const eventActors = asArray(event?.actors).map(keyOf).filter(Boolean);
        let score = 0;
        if (sourceTokens.length) score += Math.min(5, Math.ceil((matched.length / sourceTokens.length) * 5));
        if (cleanText(seed.cause, 40) && keyOf(event?.cause).includes(keyOf(seed.cause).slice(0, 80))) score += 3;
        if (seedActors.some(name => eventActors.includes(name))) score += 2;
        if (cleanText(event?.cause, 30)) score += 1;
        return score;
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

    function containsGenericEventLanguage(value) {
        const text = keyOf(value);
        return /\b(?:la situazione cambia|gli equilibri cambiano|rafforza la propria posizione|deve ricalcolare la propria posizione|deve decidere se reagire|il mondo reagisce|si aprono nuove possibilita|le conseguenze si faranno sentire|qualcosa e cambiato)\b/.test(text) ||
            /^(?:sviluppo della situazione|risposta alla scelta|iniziativa del mondo|prossimo evento|nuovo equilibrio)$/.test(text);
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
        const createdAtTurn = Math.max(0, Number(input.createdAtTurn ?? choice?.turn ?? context.turn) || 0);
        const batchId = cleanText(input.batchId || context.batchId || `event-batch-${createdAtTurn}`, 180);
        const rawId = cleanText(input.id, 170).replace(/[^a-zA-Z0-9_-]/g, '');
        const sourceId = cleanText(input.sourceId || choice?.id, 160).replace(/[^a-zA-Z0-9_-]/g, '');
        const interactionMode = normalizeInteractionMode(
            input.interactionMode,
            inferInteractionMode(`${choice?.command || ''} ${cause}`)
        );
        const id = rawId || `pending-${hashText(`${batchId}|${sourceId}|${kind}|${cause}|${index}`)}`;
        const inferredLane = choice || ['strategic_action', 'player_action', 'dialogue_reply', 'action_reply'].includes(kind)
            ? 'player'
            : 'world';
        const causalLane = keyOf(input.causalLane) === 'player' ? 'player'
            : keyOf(input.causalLane) === 'world' ? 'world'
                : inferredLane;
        const causalRootId = cleanText(input.causalRootId || input.rootId, 170).replace(/[^a-zA-Z0-9_-]/g, '') || id;
        const parentSeedId = cleanText(input.parentSeedId, 170).replace(/[^a-zA-Z0-9_-]/g, '');
        const parentEventId = cleanText(input.parentEventId || input.causalParentEventId, 170).replace(/[^a-zA-Z0-9_-]/g, '');
        const originTurn = Math.max(0, Number(input.originTurn ?? input.causalOriginTurn ?? choice?.turn ?? createdAtTurn) || 0);
        const sequence = Math.max(0, Math.min(20, Math.round(Number(input.sequence) || 0)));
        return {
            id,
            kind,
            title: cleanText(input.title || choice?.actionTitle || choice?.topic || 'Azione da elaborare', 160),
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
            causalLane,
            causalRootId,
            parentSeedId,
            parentEventId,
            originTurn,
            sequence,
            status: 'pending'
        };
    }

    function normalizeEventQueue(queue, context = {}) {
        const seen = new Set();
        return asArray(queue).map((item, index) => normalizeEventSeed(item, index, context)).filter(item => {
            if (!item || isPlaceholderSeed(item)) return false;
            if (['action_reply', 'world_reply'].includes(item.kind) ||
                Number(item.depth || 0) > 0 || item.parentSeedId ||
                /timeline-ai-queue|causal-world-reply|strategic-follow-up|event-continuity/.test(item.source || '')) return false;
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
            turn: Math.max(0, Number(input.turn) || 0),
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
            ? `Questa è l'unica azione strategica da risolvere ora. Emetti esattamente un ESITO_STRATEGICO con ID ${choice.id}. Se richiede altri passaggi usa in_corso, ma non creare un altro evento: il seguito partirà soltanto da una nuova azione del giocatore.`
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
- Emetti ATTESA_EVENTO con minuti interi e una motivazione causale. Il tempo serve soltanto a collocare il fatto; non generare routine o bisogni tecnici.
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
- Questo evento deve essere la risposta diretta e riconoscibile alla «Causa già vera» indicata sopra. Non sostituirla con una nuova iniziativa, un altro argomento o un riepilogo generico.
- Se la causa è una scelta del giocatore, mostra il primo risultato osservabile di quella precisa azione. Se è una iniziativa del mondo, mostra una mossa autonoma concreta di un attore esterno.
- Se l'azione del giocatore consiste nel chiedere, convocare, negoziare o parlare con qualcuno, l'EVENTO apre la scena ma la risposta dell'interlocutore deve essere una CHAT: usa obiettivo conversazione, required e dialogue. Non riassumere al posto suo ciò che dovrebbe dire.
- Se non è necessario parlare per raggiungere lo scopo, non creare CHAT e usa none oppure action. Le semplici conseguenze politiche o la presenza di due attori non bastano ad aprire una conversazione.
- Questo evento chiude la causa consumata. Non emettere CODA_EVENTO e non trasformare la conseguenza in un altro evento automatico.
- ${strategicInstruction}
- Costruisci il fatto come una variazione di stato completa: PRIMA (vincolo già vero) → AZIONE (chi agisce, dove e con quale leva) → REAZIONE (di un attore registrato) → DOPO (che cosa ora è ottenuto, perduto, bloccato, aperto o vincolato).
- Il campo fatto deve nominare almeno un attore specifico, un luogo specifico e una leva concreta fra denaro, documenti, uomini, informazioni, influenza, proprietà, scorte, istituzioni o risorse già presenti. Il campo conseguenza deve modificare una possibilità reale del prossimo turno.
- Sono vietati come esito principale «la situazione cambia», «gli equilibri cambiano», «rafforza la propria posizione», «deve decidere se reagire» e formule equivalenti. Un evento senza una nuova realtà osservabile non è valido.
- Per una iniziativa del mondo mostra la spesa o l'impiego di una risorsa dell'attore esterno e chi ne subisce l'effetto. Per una azione del giocatore mostra il risultato di quella azione, non una nuova trama scelta dal Game Master.
- Il fatto deve contenere 3-5 frasi complete, azione osservabile, strumento usato, risultato verificabile e conseguenza persistente. Un'intenzione non è un risultato.
- La conseguenza deve contenere 1-2 frasi complete. Chiudi ogni frase e ogni campo prima del separatore |; non interrompere mai un testo a metà.
- Usa soltanto nomi propri, cariche e istituzioni presenti nel contesto. Vietati segnaposto come Autorità, Opposizione, Mediatore o Comunità.
- STILE NARRATIVO: il campo «fatto» deve essere scritto come prosa narrativa immersiva, come in un romanzo storico-fantasy. Mostra la scena con dettagli concreti, sensazioni e azioni visibili. NON usare linguaggio da game design o meta-discorsivo.
- Sono vietate nel fatto e nella conseguenza le formule: «mossa concreta», «variazione di stato», «leva», «il fronte avanza», «deve fare i conti», «ambito», «impegnato [risorsa]», «prima di agire nello stesso ambito» e qualsiasi frase che sembri un'istruzione di gioco rather che narrazione.
- interaction è dialogue se il giocatore deve rispondere parlando, action se deve agire nella scena, either se può scegliere, none se il fatto si risolve senza intervento.
- Se interaction è dialogue e la conversazione è required, devi emettere esattamente UNA CHAT di apertura pronunciata da un solo interlocutore. Mai parole inventate per il protagonista.
- Le conseguenze persistenti aggiornano lo stato del mondo, ma un nuovo evento nascerà soltanto da una nuova azione del giocatore o dal successivo comando esplicito «Vai avanti».
- Per l'attore che agisce emetti al massimo un MONDO. Restituisci soltanto i tag seguenti.

[ATTESA_EVENTO: minuti_interi|motivo del tempo necessario]
[EVENTO: tipo|titolo|tre-cinque frasi complete su ciò che è realmente accaduto|luogo|attori separati da virgola|una-due frasi complete sulla conseguenza persistente|normal/high/critical|active/developing/resolved|momento relativo|causa precisa|ancoraggio storico|spostamento politico|posta in gioco|obiettivo conversazione|available/required/none|dialogue/action/either/none]
[SCENE: breve descrizione visiva in inglese della scena — environment, lighting, mood, key visual elements, camera angle — come prompt per generatore immagini (es: "dimly lit medieval tavern interior, candle on wooden table, raven on beam overhead, shadowy figure in corner, warm amber lighting, cinematic composition")]
[ESITO_STRATEGICO: ID esatto|completata/parziale/fallita/in_corso|risultato osservabile del tentativo|conseguenza persistente|reazione concreta del mondo registrata in questo ciclo|attori separati da virgola]
[MONDO: attore|mossa concreta compiuta|stato della mossa|visible/hidden]
[CHAT: titolo esatto evento|un solo parlante|npc/fazione/regno/gruppo|messaggio in prima persona|destinatario|emozione]`;
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

    function eventSpecificityScore(event, context = {}) {
        if (!isMeaningfulEvent(event)) return 0;
        const title = cleanText(event?.title, 140);
        const summary = cleanText(event?.summary, 1200);
        const consequence = cleanText(event?.consequence, 700);
        const location = cleanText(event?.location, 140);
        const actors = asArray(event?.actors).map(item => cleanText(item, 100)).filter(Boolean);
        const knownActors = new Set(activeActors(context.world || {}, context).map(actor => keyOf(actor.name)));
        const corpus = `${title} ${summary} ${consequence}`;
        let score = 0;
        if (title.length >= 10 && !containsGenericEventLanguage(title)) score += 1;
        if (location && !/^(?:sconosciuto|luogo|territorio|regione|area|nel territorio)$/i.test(keyOf(location))) score += 1;
        if (actors.length && actors.every(name => !isGenericActorName(name))) score += 1;
        if (actors.some(name => knownActors.has(keyOf(name)))) score += 1;
        if (summary.length >= 90 && summary.split(/[.!?]+/).filter(Boolean).length >= 2) score += 1;
        if (/\b(?:convoca|ordina|firma|consegna|blocca|occupa|apre|chiude|invia|mobilita|schiera|compra|vende|finanzia|sequestra|arresta|libera|costruisce|ispeziona|interroga|rivela|nega|concede|vota|approva|respinge|attacca|ritira|trasferisce|pubblica|impone|riduce|aumenta)\b/i.test(summary)) score += 2;
        if (/\b(?:con|usando|tramite|impiega|spende|documenti|guardie|denaro|credito|truppe|lettera|decreto|scorte|archivi|contatti|testimoni|navi|carri)\b/i.test(summary)) score += 1;
        if (/\b(?:ottiene|perde|controlla|cede|resta senza|diventa accessibile|non e piu accessibile|vincola|interrompe|riapre|chiude|sale|scende|passa da|entro|fino a)\b/i.test(consequence)) score += 2;
        if (cleanText(event?.cause, 30)) score += 1;
        if (containsGenericEventLanguage(corpus)) score -= 4;
        if (/\b(?:potrebbe|forse|eventualmente|in futuro)\b/i.test(consequence)) score -= 2;
        return score;
    }

    function conversationGoalFor(event) {
        const actors = asArray(event?.actors).filter(Boolean);
        if (!actors.length) return '';
        const type = keyOf(event?.type);
        if (type === 'economia') return `Negoziare condizioni, garanzie e costi tra ${actors.join(', ')}`;
        if (type === 'politica' || type === 'decisione') return `Confrontare le posizioni e decidere chi sosterrà la prossima mossa`;
        if (type === 'conflitto' || type === 'pericolo') return `Evitare l'escalation, imporre condizioni o organizzare una risposta comune`;
        if (type === 'relazione') return `Definire impegni, fiducia e contropartite tra le parti`;
        return `Chiarire responsabilità e prossime azioni dopo «${cleanText(event?.title, 100)}»`;
    }

    function eventRequiresConversation(event, seed = null) {
        if (!event) return false;
        const playerDialogueSeed = seed?.interactionMode === 'dialogue' && seed?.causalLane === 'player' &&
            ['player_action', 'strategic_action', 'dialogue_reply', 'action_reply'].includes(seed?.kind);
        if (playerDialogueSeed) return true;
        const interactionMode = normalizeInteractionMode(
            event.interactionMode,
            seed?.interactionMode || (event.conversationMode === 'required' ? 'dialogue' : 'none')
        );
        if (event.conversationMode === 'required') return interactionMode === 'dialogue';
        return interactionMode === 'dialogue' && seed?.causalLane === 'player' &&
            ['player_action', 'strategic_action', 'dialogue_reply', 'action_reply'].includes(seed?.kind);
    }

    function enrichEvent(event, context = {}, index = 0, previousEvent = null) {
        const world = context.world || {};
        const history = world.historicalContext || {};
        const force = asArray(world.forces).find(item => item.status !== 'resolved');
        const choices = normalizeTimelineChoices(context.choices).map(choice => cleanText(choice.summary, 240));
        const seed = context.seed ? normalizeEventSeed(context.seed, 0, context) : null;
        const cause = cleanText(event?.cause || seed?.cause || event?.choice || (index > 0 ? previousEvent?.title : '') || choices[0] || force?.cause || force?.objective || world.centralConflict, 800);
        const historicalAnchor = cleanText(event?.historicalAnchor || [history.date, history.baseline].filter(Boolean).join(' — ') || context.passage?.startDate || world.setting, 320);
        const politicalShift = cleanText(event?.politicalShift || event?.consequence, 320);
        const stakes = cleanText(event?.stakes || world.stakes || force?.consequenceAt100 || event?.consequence, 280);
        const interactionMode = normalizeInteractionMode(
            event?.interactionMode,
            seed?.interactionMode || (event?.conversationMode === 'required' ? 'dialogue' : 'none')
        );
        const dialogueRequired = eventRequiresConversation({ ...event, interactionMode }, seed);
        const conversationGoal = cleanText(
            event?.conversationGoal || (dialogueRequired ? conversationGoalFor(event) : ''),
            280
        );
        const conversationMode = dialogueRequired
            ? 'required'
            : (event?.conversationMode === 'none' || !conversationGoal ? 'none' : 'available');
        return {
            ...event,
            cause,
            historicalAnchor,
            politicalShift,
            stakes,
            conversationGoal,
            conversationMode,
            interactionMode: dialogueRequired ? 'dialogue' : interactionMode,
            centralityScore: eventCentralityScore(event, context),
            specificityScore: eventSpecificityScore(event, context),
            causalAlignmentScore: causalAlignmentScore(event, seed),
            causalKind: cleanText(event?.causalKind || seed?.kind, 40),
            causalLabel: cleanText(event?.causalLabel || causalLabelFor(seed?.kind), 80),
            causalLane: cleanText(event?.causalLane || seed?.causalLane, 20),
            causalRootId: cleanText(event?.causalRootId || seed?.causalRootId, 170),
            causalParentSeedId: cleanText(event?.causalParentSeedId || seed?.parentSeedId, 170),
            causalParentEventId: cleanText(event?.causalParentEventId || seed?.parentEventId, 170),
            causalSequence: Math.max(0, Number(event?.causalSequence ?? seed?.sequence) || 0),
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
        const normalizedChoices = normalizeTimelineChoices(choices).slice(0, MAX_PLAYER_ACTIONS_PER_TURN);
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
            createdAtTurn: choice.turn || turn,
            originTurn: choice.turn || turn,
            causalLane: 'player',
            sequence: 0
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
                    createdAtTurn: turn,
                    originTurn: turn,
                    causalLane: 'world'
                }, seeds.length, { turn, batchId });
                if (worldSeed) seeds.push(worldSeed);
            }
        }
        return normalizeEventQueue(seeds, { turn, batchId });
    }

    function buildTurnPrompt(context = {}) {
        const world = context.world || {};
        const seeds = normalizeEventQueue(context.seeds || context.pendingEvents, {
            turn: context.turn,
            batchId: context.batchId
        });
        const actors = activeActors(world, context).slice(0, Math.max(2, Math.min(12, Number(context.actorLimit) || 8)));
        const forces = asArray(world.forces).filter(item =>
            item?.status !== 'resolved' &&
            !containsPlaceholder(`${item?.name || ''} ${item?.actor || ''}`) &&
            !/deterministic-fallback|timeline-recovery/i.test(item?.source || '')
        ).slice(0, Math.max(1, Math.min(8, Number(context.forceLimit) || 5)));
        const recent = asArray(context.recentEvents).filter(isMeaningfulEvent).slice(-6);
        const history = world.historicalContext || {};
        const seedLines = seeds.map((seed, index) => {
            const choice = seed.choice;
            return `${index + 1}. ID ${seed.id} · ${seed.causalLane === 'world' ? 'MONDO ESTERNO' : 'AZIONE DEL GIOCATORE'}\n` +
                `   Causa da chiudere: ${seed.cause}\n` +
                `   Attori collegati: ${seed.actors.join(', ') || 'scegli fra gli attori registrati'}\n` +
                `   Interazione: ${seed.interactionMode}` +
                (choice ? `\n   Obiettivo: ${choice.objective || choice.expectedOutcome || 'risultato concreto coerente con il comando'}; costo: ${choice.cost || 'solo se dichiarato'}; durata: ${choice.duration || 'stimala'}; rischio: ${choice.risk || 'medio'}; ID strategico: ${choice.isStrategic ? choice.id : 'nessuno'}` : '');
        }).join('\n\n');
        const actorLines = actors.length ? actors.map(actorLine).join('\n') : '- Usa soltanto persone, gruppi e istituzioni già nominati nella cronaca.';
        const forceLines = forces.length ? forces.map(item =>
            `- ${cleanText(item.name, 120)}: ${cleanText(item.actor, 100)} persegue ${cleanText(item.objective, 260)}; progresso ${Math.round(Number(item.progress) || 0)}%, urgenza ${Math.round(Number(item.urgency) || 0)}%.`
        ).join('\n') : '- Nessun fronte autonomo strutturato: fai muovere un attore registrato secondo il suo obiettivo.';
        const recentLines = recent.length ? recent.map(item =>
            `- ${cleanText(item.occurredAt, 100)} — ${cleanText(item.title, 140)}: ${cleanText(item.summary, 650)} Conseguenza valida: ${cleanText(item.consequence, 360)}`
        ).join('\n') : '- Nessun evento precedente.';

        return `SEI IL GAME MASTER. RISOLVI UN SOLO TURNO COMPLETO CON LO STESSO CICLO DI UN GIOCO STRATEGICO A TURNI: azioni preparate → avanzamento del tempo → esiti del giocatore → iniziativa autonoma del mondo → turno chiuso.

${cleanText(context.continuityPrompt, 14000) || 'CANONE: conserva fatti, nomi, luoghi, risorse e rapporti già registrati.'}

DATA INIZIALE: ${cleanText(context.currentDate || history.date || 'data corrente', 160)}.
STORIA: ${cleanText(context.story?.title, 120)} — ${cleanText(context.story?.setting || world.setting, 180)}.
CONFLITTO CENTRALE: ${cleanText(world.centralConflict || world.premise || context.story?.desc, 500)}.
BASE STORICA: ${cleanText(history.baseline || history.politicalSystem || world.premise, 700)}.

CAUSE DEL TURNO — RISOLVILE NELL'ORDINE INDICATO:
${seedLines || '1. Il mondo esterno compie una sola mossa autonoma concreta.'}

ATTORI DISPONIBILI:
${actorLines}

FRONTI APERTI:
${forceLines}

EVENTI RECENTI, DA NON RIPETERE:
${recentLines}

REGOLE DEL TURNO:
- Produci esattamente ${seeds.length || 1} EVENTI: uno per ogni ID, nello stesso ordine. Ogni evento chiude la propria causa; nessun evento genera un altro evento in questo turno.
- Prima di ogni EVENTO emetti RISOLUZIONE con l'ID esatto, i minuti trascorsi dall'inizio del turno e una ragione causale. I minuti possono coincidere fra eventi.
- Per un'AZIONE DEL GIOCATORE mostra l'esito osservabile di quel comando: cosa riesce, cosa fallisce, quale costo viene realmente pagato e quale possibilità cambia. Non sostituire l'azione con una trama inventata.
- Per il MONDO ESTERNO fai agire indipendentemente un attore già registrato: nomina obiettivo, luogo, leva impiegata e soggetto colpito. Non farlo reagire passivamente al giocatore se possiede una propria agenda.
- Ogni fatto deve contenere 3-5 frasi complete con PRIMA → MOSSA → REAZIONE → DOPO. La conseguenza deve essere persistente e verificabile nel turno seguente.
- Vietati esiti generici come "la situazione cambia", "gli equilibri cambiano", "rafforza la posizione", "dovrà reagire", e vietati attori generici come Autorità, Opposizione o Comunità.
- STILE NARRATIVO: il fatto e la conseguenza devono essere scritti come prosa narrativa immersiva in stile romanzo storico-fantasy, con dettagli concreti, atmosfera e azioni visibili. NON usare linguaggio da game design o meta-discorsivo.
- Sono vietate nel fatto e nella conseguenza le formule: «mossa concreta», «variazione di stato», «leva», «il fronte avanza», «deve fare i conti», «ambito», «impegnato [risorsa]», «prima di agire nello stesso ambito» e qualsiasi frase che sembri un'istruzione di gioco piuttosto che narrazione.
- Usa soltanto nomi, ruoli, luoghi, istituzioni e risorse presenti nel contesto. Non confondere genere, titolo, funzione o epoca dei personaggi.
- Apri una CHAT soltanto quando lo scopo dell'azione richiede davvero parole dell'interlocutore (negoziare, interrogare, convocare, chiedere). In tal caso interaction=dialogue, conversation=required ed emetti una sola battuta iniziale. Gli altri eventi non aprono chat.
- Ogni azione strategica riceve esattamente un ESITO_STRATEGICO con il suo ID. Può essere completata, parziale, fallita o in_corso, ma non può creare una coda automatica.
- Emetti al massimo un MONDO per evento. Non emettere CODA_EVENTO, nuovi prompt, analisi strategiche o testo fuori dai tag.

FORMATO RIPETUTO PER OGNI CAUSA:
[RISOLUZIONE: ID_esatto|minuti_dall_inizio|motivo_concreto]
[EVENTO: tipo|titolo|tre-cinque frasi complete sul fatto accaduto|luogo|attori separati da virgola|una-due frasi sulla conseguenza persistente|normal/high/critical|active/developing/resolved|momento relativo|causa precisa|ancoraggio storico|spostamento politico|posta in gioco|obiettivo conversazione|available/required/none|dialogue/action/either/none]
[SCENE: breve descrizione visiva in inglese della scena — environment, lighting, mood, key visual elements, camera angle — come prompt per generatore immagini (es: "dimly lit medieval tavern interior, candle on wooden table, raven on beam overhead, shadowy figure in corner, warm amber lighting, cinematic composition")]
[ESITO_STRATEGICO: ID_esatto|completata/parziale/fallita/in_corso|risultato osservabile|conseguenza persistente|reazione concreta del mondo|attori separati da virgola]
[MONDO: attore|mossa concreta compiuta|stato|visible/hidden]
[CHAT: titolo esatto evento|un solo parlante|npc/fazione/regno/gruppo|messaggio in prima persona|destinatario|emozione]`;
    }

    function buildBatchPrompt(context = {}) {
        const batch = normalizeEventQueue(context.batch || context.seeds || context.pendingEvents, {
            turn: context.turn,
            batchId: context.batchId
        });
        const base = buildTurnPrompt({ ...context, seeds: batch });
        return `SIMULAZIONE PARALLELA DEL TURNO — RISOLVI FINO A ${batch.length} SVILUPPI INDIPENDENTI IN UN SOLO CICLO.

Genera esattamente ${batch.length || 1} eventi, uno per ogni SVILUPPO DA CONSUMARE elencato; non produrne di più e non concatenarli automaticamente.\n\n${base}`;
    }

    function parseTurnTimings(response, seeds) {
        const normalizedSeeds = normalizeEventQueue(seeds);
        const byId = new Map(normalizedSeeds.map(seed => [seed.id, seed]));
        const timings = new Map();
        const regex = /\[RISOLUZIONE:\s*([^|\]]+)\|([^|\]]+)(?:\|([^\]]*))?\]/gi;
        let match;
        while ((match = regex.exec(String(response || '')))) {
            const id = cleanText(match[1], 170).replace(/[^a-zA-Z0-9_-]/g, '');
            const seed = byId.get(id);
            if (!seed || timings.has(id)) continue;
            const parsed = parseDurationMinutes(match[2]);
            timings.set(id, {
                seedId: id,
                minutes: clampEventDelay(Math.max(Number(seed.notBeforeMinutes) || 0, parsed || inferEventDelay(seed)), inferEventDelay(seed)),
                reason: cleanText(match[3] || `Tempo necessario per «${seed.title}»`, 320),
                source: parsed ? 'timeline-ai' : 'timeline-fallback'
            });
        }
        return normalizedSeeds.map(seed => timings.get(seed.id) || {
            seedId: seed.id,
            minutes: clampEventDelay(Math.max(Number(seed.notBeforeMinutes) || 0, inferEventDelay(seed)), inferEventDelay(seed)),
            reason: `Tempo necessario per «${seed.title}»`,
            source: 'timeline-fallback'
        });
    }

    function ensureTurnBatch(incomingEvents, seeds, context = {}) {
        const normalizedSeeds = normalizeEventQueue(seeds, { turn: context.turn, batchId: context.batchId });
        const candidates = asArray(incomingEvents).filter(isMeaningfulEvent);
        const timings = parseTurnTimings(context.response, normalizedSeeds);
        const used = new Set();
        let fallbackAdded = 0;
        const assignments = normalizedSeeds.map((seed, index) => {
            const ranked = candidates.map((event, eventIndex) => ({
                event,
                eventIndex,
                score: causalAlignmentScore(event, seed),
                quality: eventCentralityScore(event, context) >= 6 && eventSpecificityScore(event, context) >= 6
            })).filter(item => !used.has(item.eventIndex) && item.quality)
                .sort((left, right) => right.score - left.score || Math.abs(left.eventIndex - index) - Math.abs(right.eventIndex - index));
            const accepted = ranked.find(item => item.score >= 2) || null;
            if (accepted) used.add(accepted.eventIndex);
            else fallbackAdded++;
            const rawEvent = accepted?.event || createFallbackEvent({ ...context, seed });
            const timing = timings.find(item => item.seedId === seed.id) || parseTurnTimings('', [seed])[0];
            const event = rawEvent ? enrichEvent({
                ...rawEvent,
                seedId: seed.id,
                queueKind: seed.kind,
                waitMinutes: timing.minutes,
                timingReason: timing.reason,
                strategicTopic: seed.choice?.topic || rawEvent.strategicTopic,
                strategicActionIds: seed.choice?.isStrategic ? [seed.choice.id] : asArray(rawEvent.strategicActionIds)
            }, { ...context, seed }, index, null) : null;
            return { seed, timing, event, usedFallback: !accepted };
        }).filter(item => item.event);
        return {
            assignments,
            events: assignments.map(item => item.event),
            timings,
            elapsedMinutes: Math.max(MIN_EVENT_DELAY_MINUTES, ...timings.map(item => Number(item.minutes) || 0)),
            fallbackAdded,
            qualityRejected: Math.max(0, candidates.length - used.size),
            usedFallback: fallbackAdded > 0
        };
    }

    function parseEventTagBody(body, context = {}) {
        const limits = [80, 140, 1600, 140, 500, 1000, 40, 40, 140, 800, 800, 900, 700, 700, 40, 40];
        const parts = String(body == null ? '' : body).split('|').map((part, index) => cleanText(part, limits[index] || 700));
        if (!parts[0]) return null;
        const isConversationModeToken = value => /^(available|required|none|open|aperta|possibile|obbligatoria|nessuna)$/i.test(keyOf(value));
        const isInteractionModeToken = value => /^(dialogue|dialogo|action|azione|either|entrambi|none|nessuna)$/i.test(keyOf(value));
        const classifyEvent = value => {
            const key = keyOf(value);
            const aliases = {
                combattimento: 'conflitto', battaglia: 'conflitto', combat: 'conflitto', conflict: 'conflitto',
                rivelazione: 'scoperta', discovery: 'scoperta', esplorazione: 'scoperta',
                incontro: 'relazione', sociale: 'relazione', relationship: 'relazione',
                scelta: 'decisione', choice: 'decisione', morale: 'decisione',
                quest: 'missione', obiettivo: 'missione', mission: 'missione',
                commercio: 'economia', business: 'economia', economic: 'economia',
                regno: 'politica', diplomazia: 'politica', political: 'politica',
                minaccia: 'pericolo', tragedia: 'pericolo', danger: 'pericolo',
                viaggio: 'viaggio', travel: 'viaggio',
                crescita: 'personale', personal: 'personale',
                ambientale: 'mondo', world: 'mondo'
            };
            const types = new Set(['conflitto', 'scoperta', 'relazione', 'decisione', 'missione', 'economia', 'politica', 'pericolo', 'viaggio', 'personale', 'mondo']);
            if (types.has(key)) return key;
            if (aliases[key]) return aliases[key];
            if (/combatt|battaglia|duello|attacc|sconfitt|vittoria|ferit|uccis/.test(key)) return 'conflitto';
            if (/scopert|trov|rivel|indizio|segreto|esplorat/.test(key)) return 'scoperta';
            if (/allean|incontr|amic|relazion|promess|negozia|fiducia/.test(key)) return 'relazione';
            if (/decis|scelt|risparmi|rifiut|accett|sacrific/.test(key)) return 'decisione';
            if (/quest|mission|obiettiv|incaric|completat|fallita/.test(key)) return 'missione';
            if (/vend|compr|guadagn|perdit|negozio|contratt|debito|denaro/.test(key)) return 'economia';
            if (/regno|legge|fazione|diplom|sovran|rivolta|decreto/.test(key)) return 'politica';
            if (/pericol|minacc|incend|tempesta|epidemi|rapiment|traged/.test(key)) return 'pericolo';
            if (/viaggi|partit|arrivat|raggiunt|trasferit/.test(key)) return 'viaggio';
            if (/livello|abilit|crescita|guarit|ferita personale/.test(key)) return 'personale';
            return 'mondo';
        };
        const deriveTitle = summary => {
            const text = cleanText(summary, 240).replace(/^(il|la|lo|i|gli|le|un|una)\s+/i, '').replace(/[.!?]+$/g, '');
            if (!text) return 'Evento senza titolo';
            const words = text.split(' ');
            const title = words.slice(0, 8).join(' ');
            return title.charAt(0).toLocaleUpperCase('it-IT') + title.slice(1);
        };
        const parseActors = value => {
            const seen = new Set();
            return cleanText(value, 320).split(/[,;]/).map(item => cleanText(item, 100)).filter(item => {
                const key = keyOf(item);
                if (!key || key === 'nessuno' || key === 'nessuna' || seen.has(key)) return false;
                seen.add(key);
                return true;
            }).slice(0, 8);
        };
        const inferActors = (summary, knownActors) => {
            const corpus = keyOf(summary);
            return asArray(knownActors).map(actor => cleanText(typeof actor === 'string' ? actor : actor?.name, 100)).filter(Boolean).filter(name => corpus.includes(keyOf(name))).slice(0, 8);
        };
        const normalizeImportance = (value, text) => {
            const key = keyOf(value);
            if (/critical|critico|cruciale|epocale/.test(key)) return 'critical';
            if (/high|alto|importante|grave/.test(key)) return 'high';
            if (/morte|uccis|guerra|assedio|tradimento|catastrofe|regno cadut|missione fallita/.test(keyOf(text))) return 'critical';
            if (/alleanza|vittoria|sconfitta|segreto|scoperta|incendio|rapimento|missione completata/.test(keyOf(text))) return 'high';
            return 'normal';
        };
        const normalizeStatus = value => {
            const key = keyOf(value);
            if (/unresolved|irrisolto|active|attivo|aperto/.test(key)) return 'active';
            if (/resolved|risolto|concluso|completed|completato|closed|chiuso/.test(key)) return 'resolved';
            if (/developing|evolving|sviluppo|evoluzione|pending|in corso/.test(key)) return 'developing';
            return 'resolved';
        };
        if (parts.length === 1) {
            return {
                type: 'mondo', title: deriveTitle(parts[0]), summary: parts[0],
                actors: inferActors(parts[0], context.knownActors), source: 'llm-legacy'
            };
        }
        let interactionIndex = -1;
        let conversationIndex = -1;
        for (let index = parts.length - 1; index >= 12; index--) {
            if (interactionIndex < 0 && isInteractionModeToken(parts[index])) interactionIndex = index;
            if (conversationIndex < 0 && isConversationModeToken(parts[index])) conversationIndex = index;
        }
        const type = classifyEvent(parts[0]);
        const title = parts[1] || deriveTitle(parts[2]);
        const summary = parts[2] || '';
        const location = parts[3] || cleanText(context.location, 100);
        const actors = parseActors(parts[4]).length ? parseActors(parts[4]) : inferActors(`${title} ${summary}`, context.knownActors);
        const consequence = parts[5] || '';
        const importance = normalizeImportance(parts[6], `${title} ${summary} ${consequence}`);
        const status = normalizeStatus(parts[7]);
        const occurredAt = parts[8] || cleanText(context.occurredAt, 100);
        const cause = parts[9] || cleanText(context.choice, 600);
        const historicalAnchor = parts[10] || '';
        const politicalShift = parts[11] || '';
        const stakes = conversationIndex === 12 ? '' : parts[12];
        const conversationGoal = conversationIndex === 13 ? '' : parts[13];
        const conversationMode = conversationIndex >= 0 ? parts[conversationIndex] : (conversationGoal ? 'available' : 'none');
        const interactionMode = interactionIndex >= 0 ? parts[interactionIndex] : (conversationMode === 'required' ? 'dialogue' : 'none');
        return {
            type, title, summary, location, actors, consequence, importance, status,
            occurredAt, cause, historicalAnchor, politicalShift, stakes, conversationGoal,
            conversationMode, interactionMode
        };
    }

    function parseBatchEventBody(response, seeds, context = {}) {
        const normalizedSeeds = normalizeEventQueue(seeds, { turn: context.turn, batchId: context.batchId });
        const text = String(response || '');
        const rawEvents = [];
        const scenePrompts = [];
        const sceneRegex = /\[SCENE:\s*([^\]]+)\]/gi;
        let sceneMatch;
        while ((sceneMatch = sceneRegex.exec(text)) !== null) {
            scenePrompts.push(cleanText(sceneMatch[1], 500));
        }
        const regex = /\[EVENTO:\s*([^\]]+)\]/gi;
        const seen = new Set();
        let match;
        while ((match = regex.exec(text)) !== null) {
            const event = parseEventTagBody(match[1], context);
            if (!event || !isMeaningfulEvent(event)) continue;
            const fp = keyOf(`${event.type}|${event.title}|${event.summary}|${event.location}`);
            if (seen.has(fp)) continue;
            seen.add(fp);
            rawEvents.push(event);
        }
        // Associa i prompt visivi [SCENE] agli eventi in ordine
        rawEvents.forEach((event, idx) => {
            if (scenePrompts[idx]) event.scenePrompt = scenePrompts[idx];
        });
        if (!rawEvents.length) {
            return ensureTurnBatch([], normalizedSeeds, { ...context, response });
        }
        if (rawEvents.length === 1 && normalizedSeeds.length > 1) {
            const best = normalizedSeeds.map(seed => ({ seed, score: causalAlignmentScore(rawEvents[0], seed) }))
                .sort((left, right) => right.score - left.score)[0] || { seed: normalizedSeeds[0] };
            const seed = best.seed;
            const timings = parseTurnTimings(response, [seed]);
            const timing = timings[0] || parseTurnTimings('', [seed])[0];
            const event = enrichEvent({
                ...rawEvents[0], seedId: seed.id, queueKind: seed.kind,
                waitMinutes: timing.minutes, timingReason: timing.reason
            }, { ...context, seed }, 0, null);
            return {
                events: [event],
                assignments: [{ seed, event, timing, usedFallback: false }],
                timings,
                elapsedMinutes: timing.minutes,
                fallbackAdded: 0,
                qualityRejected: 0,
                usedFallback: false
            };
        }
        return ensureTurnBatch(rawEvents, normalizedSeeds, { ...context, response });
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
        const playerCausalQueue = normalized.filter(seed => seed.causalLane === 'player');
        const continuingPlayerQueue = playerCausalQueue.filter(seed => seed.kind === 'dialogue_reply');
        const dueWorldQueue = normalized.filter(seed =>
            seed.causalLane === 'world' && Number(seed.notBeforeMinutes || 0) <= 0
        );
        const oldestFreshPlayerTurn = Math.min(...playerCausalQueue.map(seed => Number(seed.createdAtTurn || 0)));
        const overdueWorld = dueWorldQueue.slice().sort((left, right) =>
            Number(left.createdAtTurn || 0) - Number(right.createdAtTurn || 0) ||
            Number(right.priority || 0) - Number(left.priority || 0)
        )[0];
        const useOverdueWorld = !continuingPlayerQueue.length && overdueWorld &&
            (!playerCausalQueue.length || Number(overdueWorld.createdAtTurn || 0) < oldestFreshPlayerTurn);
        const candidates = continuingPlayerQueue.length
            ? continuingPlayerQueue
            : useOverdueWorld
                ? dueWorldQueue
                : playerCausalQueue.length ? playerCausalQueue : normalized;
        return candidates.slice().sort((left, right) => {
            if (candidates.some(seed => seed.causalLane === 'player')) {
                const rootOrder = Number(left.originTurn || 0) - Number(right.originTurn || 0);
                if (rootOrder) return rootOrder;
                const sameRoot = left.causalRootId && left.causalRootId === right.causalRootId;
                if (sameRoot) {
                    const sequenceOrder = Number(left.sequence || 0) - Number(right.sequence || 0);
                    if (sequenceOrder) return sequenceOrder;
                }
            }
            return Number(left.notBeforeMinutes || 0) - Number(right.notBeforeMinutes || 0) ||
                Number(right.priority || 0) - Number(left.priority || 0) ||
                Number(left.createdAtTurn || 0) - Number(right.createdAtTurn || 0);
        })[0] || null;
    }

    function isParallelEligible(seed) {
        if (!seed) return false;
        if (seed.parentSeedId) return false;
        if (seed.kind === 'dialogue_reply') return false;
        if (seed.interactionMode === 'dialogue') return false;
        if (seed.kind === 'strategic_action') return true;
        if (seed.kind === 'player_action' && seed.interactionMode !== 'dialogue') return true;
        if (seed.kind === 'world_initiative') {
            const urgent = Number(seed.priority || 0) >= 80 && Number(seed.notBeforeMinutes || 0) <= 0;
            return !urgent;
        }
        return false;
    }

    function selectBatchEventSeeds(queue, maxBatch = MAX_PLAYER_ACTIONS_PER_TURN) {
        const normalized = normalizeEventQueue(queue);
        const eligible = normalized.filter(isParallelEligible);
        if (!eligible.length) {
            const next = selectNextEventSeed(normalized);
            return next ? [next] : [];
        }
        const sorted = eligible.slice().sort((left, right) =>
            Number(right.priority || 0) - Number(left.priority || 0) ||
            Number(left.notBeforeMinutes || 0) - Number(right.notBeforeMinutes || 0) ||
            Number(left.createdAtTurn || 0) - Number(right.createdAtTurn || 0)
        );
        const limit = Math.max(1, Math.min(Number(maxBatch) || MAX_PLAYER_ACTIONS_PER_TURN, MAX_PLAYER_ACTIONS_PER_TURN));
        return sorted.slice(0, limit);
    }

    function createManualParallelSeeds(decisions, context = {}) {
        const turn = Math.max(0, Number(context.turn) || 0);
        const batchId = cleanText(context.batchId || `event-batch-${turn}`, 180);
        return normalizeTimelineChoices(asArray(decisions)).map((choice, index) => normalizeEventSeed({
            id: `pending-parallel-${choice.id}`,
            kind: 'player_action',
            title: choice.actionTitle || choice.topic || 'Decisione parallela',
            topic: choice.topic,
            cause: choice.command || choice.summary,
            actors: choice.actors,
            priority: 80,
            interactionMode: inferInteractionMode(choice.command || choice.summary),
            sourceId: choice.id,
            source: 'manual-parallel',
            choice,
            batchId,
            createdAtTurn: turn,
            originTurn: turn,
            causalLane: 'player',
            sequence: 0
        }, index, { turn, batchId })).filter(Boolean);
    }

    function advanceEventQueue(queue, consumedIds, elapsedMinutes) {
        const consumed = Array.isArray(consumedIds)
            ? consumedIds
            : (consumedIds != null ? [consumedIds] : []);
        const consumedSet = new Set(consumed.map(id => String(id)));
        const elapsed = Math.max(0, Number(elapsedMinutes) || 0);
        return normalizeEventQueue(queue).filter(seed =>
            !consumedSet.has(seed.id) &&
            !['action_reply', 'world_reply'].includes(seed.kind) &&
            Number(seed.depth || 0) === 0 &&
            !seed.parentSeedId &&
            !/timeline-ai-queue|causal-world-reply|strategic-follow-up|event-continuity/.test(seed.source || '')
        ).map(seed => ({
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
        // Le vecchie risposte possono ancora contenere CODA_EVENTO. Vengono
        // ignorate intenzionalmente: un evento non può generarne un altro.
        return [];
    }

    function extractScenePrompt(response, index) {
        const text = String(response || '');
        const regex = /\[SCENE:\s*([^\]]+)\]/gi;
        const prompts = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            prompts.push(cleanText(match[1], 500));
        }
        if (typeof index === 'number') return prompts[index] || '';
        return prompts;
    }

    function createFallbackEvent(context = {}) {
        const seed = normalizeEventSeed(context.seed || {
            kind: 'world_initiative',
            cause: context.world?.centralConflict || context.story?.desc || 'Il mondo continua a cambiare'
        }, 0, context);
        const actors = fallbackActors(context.world || {}, context);
        const named = seed?.actors?.map(name => actors.find(actor => keyOf(actor.name) === keyOf(name))).filter(Boolean) || [];
        const actor = named[0] || actors[0];
        const worldLed = /^world/.test(seed?.kind || '');
        const choice = seed?.choice;
        const strategic = choice?.isStrategic;
        if (!actor) {
            // Nessun attore disponibile: crea un evento mondiale minimo
            const protagonistName = cleanText(context.protagonistName, 100);
            const place = cleanText(context.location?.name || context.location, 120) || 'il territorio';
            const cause = cleanText(seed?.cause || context.world?.centralConflict || context.story?.desc, 300) || 'il mondo continua a muoversi';
            const genericEvent = worldLed ? {
                type: 'mondo',
                title: seed?.title || 'Sviluppi inattesi',
                summary: `A ${place}, ${cause}. Le forze in campo si ridispiegano senza preavviso.`,
                consequence: `La situazione a ${place} e' cambiata; nuove opportunita' e nuovi rischi emergono per ${protagonistName || 'il protagonista'}.`,
                actors: protagonistName ? [protagonistName] : []
            } : {
                type: strategic ? 'decisione' : 'missione',
                title: seed?.title || (strategic ? `Piano in azione: ${choice?.topic || 'la questione'}` : "L'azione produce effetti"),
                summary: `A ${place}, ${protagonistName || 'il protagonista'} agisce: ${cleanText(choice?.command || cause, 300)}. L'impresa ha un primo risultato concreto.`,
                consequence: strategic
                    ? `Il piano su «${choice?.topic || 'la questione'}» ha impegnato le risorse dichiarate; servira' una nuova scelta per continuare.`
                    : `L'azione ha modificato la situazione a ${place}; servira' una nuova decisione per proseguire.`,
                actors: protagonistName ? [protagonistName] : [],
                strategicTopic: choice?.topic,
                strategicActionIds: strategic ? [choice.id] : []
            };
            return enrichEvent({
                ...genericEvent,
                location: place,
                importance: seed?.priority >= 85 ? 'critical' : 'high',
                status: 'developing',
                occurredAt: context.occurredAt || context.passage?.endDate || 'prossimo momento importante',
                cause: seed?.cause || cause,
                interactionMode: seed?.interactionMode || 'either',
                source: 'timeline-fallback',
                seedId: seed?.id,
                queueKind: seed?.kind
            }, context, 0, null);
        }
        const protagonistName = cleanText(context.protagonistName, 100);
        const protagonist = protagonistName && keyOf(protagonistName) !== keyOf(actor.name)
            ? { name: protagonistName, kind: 'protagonista' }
            : null;
        const target = named[1] || actors.find(item => keyOf(item.name) !== keyOf(actor.name)) || protagonist;
        const place = actorPlace(actor, context);
        const force = asArray(context.world?.forces).find(item =>
            item?.status !== 'resolved' && (
                keyOf(item.actor) === keyOf(actor.name) ||
                keyOf(item.name) === keyOf(seed?.title) ||
                keyOf(item.id) === keyOf(seed?.sourceId)
            )
        );
        const actorResource = actorResources(actor);
        const actorPlan = actorStrategy(actor);
        const playerAction = cleanText(choice?.command || seed?.cause, 420);
        const actionKey = keyOf(playerAction);
        const intendedResult = cleanText(choice?.expectedOutcome || choice?.objective, 260);
        const committedCost = cleanText(choice?.cost, 160);
        const actorHasData = Boolean(actor?.goal || actor?.strategy || actor?.resources || actor?.publicGoal);
        let playerResult;
        if (/chied|parl|convoc|negozi|propon|interrog/.test(actionKey)) {
            playerResult = actorHasData
                ? `${actor.name} ascolta la richiesta e prepara una risposta secondo la propria posizione.`
                : `${actor.name} riceve la richiesta e prende tempo per valutarla.`;
        } else if (/indag|cerc|ispezion|esamin|studia|scopri/.test(actionKey)) {
            playerResult = actorHasData
                ? `${actor.name} reagisce mettendo in gioco le proprie leve; l'accesso a quella risorsa diventa il primo risultato verificabile dell'indagine.`
                : `${actor.name} non lascia scoprire facilmente ciò che sa; l'indagine rivela un primo indizio concreto.`;
        } else if (/attacc|assalt|arrest|blocca|minaccia|occupa/.test(actionKey)) {
            playerResult = actorHasData
                ? `${actor.name} si oppone nel punto in cui avviene il tentativo; il controllo del luogo viene ora conteso apertamente.`
                : `${actor.name} reagisce con prontezza e il controllo del luogo diventa oggetto di scontro.`;
        } else if (/compra|vende|finanzia|investe|costru|assum|paga/.test(actionKey)) {
            playerResult = actorHasData
                ? `${committedCost ? `${committedCost} viene impegnato.` : 'Le risorse dichiarate vengono impegnate.'} ${actor.name} ricalcola il proprio piano di conseguenza.`
                : `${committedCost ? `${committedCost} viene impegnato.` : 'Le risorse indicate vengono impiegate.'} ${actor.name} aggiusta la propria strategia in risposta.`;
        } else {
            playerResult = actorHasData
                ? `${actor.name} risponde con una mossa coerente: ${actorPlan}, impiegando ${actorResource}. Il tentativo produce un cambiamento osservabile.`
                : `${actor.name} reagisce alla mossa con una contromossa pragmatica. Lo scontro produce un cambiamento tangibile nella situazione.`;
        }
        const actorLabel = actor?.kind === 'faction' ? actor.name : actor.name;
        const goalText = actorHasData ? actorGoal(actor) : 'un proprio obiettivo';
        const planText = actorHasData ? actorPlan : 'una mossa pragmatica';
        const resourceText = actorHasData ? actorResource : 'le proprie leve';
        const event = worldLed ? {
            type: actor?.kind === 'faction' ? 'politica' : 'mondo',
            title: seed?.title || `La mossa di ${actor.name}`,
            summary: `A ${place}, ${actorLabel} ha agito per ${goalText}. ${actorPlan ? `La mossa concreta: ${planText}` : 'Ha portato avanti la propria strategia'}${target ? `, innescando uno scontro con ${target.name}` : ''}.${force ? ` Il fronte «${cleanText(force.name, 140)}» avanza dal ${Math.round(Number(force.progress) || 0)}% al ${Math.min(100, Math.round(Number(force.progress) || 0) + 10)}%.` : ''}`,
            consequence: `${actor.name} ha ora impegnato ${resourceText} a ${place}${target ? `; ${target.name} deve fare i conti con questa mossa prima di agire nello stesso ambito` : ''}.`,
            actors: [actor.name, target?.name].filter(Boolean)
        } : {
            type: strategic ? 'decisione' : 'missione',
            title: seed?.title || (strategic ? `${choice.topic}: il piano entra in azione` : `${actor.name} reagisce all'azione del protagonista`),
            summary: `A ${place}, ${protagonist?.name || 'il protagonista'} ha eseguito «${playerAction}»${intendedResult ? ` per ottenere ${intendedResult}` : ''}. ${playerResult}`,
            consequence: strategic
                ? `Il piano su «${choice.topic || seed?.topic || 'la questione'}» ha impegnato le risorse dichiarate; qualsiasi ulteriore sviluppo richiederà una nuova scelta.`
                : `${actor.name} ha già reagito a ${place}; la situazione è cambiata e qualsiasi nuova mossa dovrà fare i conti con questo esito.`,
            actors: [protagonist?.name, actor.name, target?.name].filter(Boolean),
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
        const accepted = meaningful.find(event =>
            eventCentralityScore(event, context) >= 6 &&
            causalAlignmentScore(event, context.seed) >= 2 &&
            eventSpecificityScore(event, context) >= 6
        );
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
        return [];
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
            const status = provided?.status || (relatedEvent?.status === 'resolved' ? 'completata' : 'parziale');
            const result = provided?.result || cleanText(
                relatedEvent?.summary || `L'azione «${choice.actionTitle || choice.command}» produce un primo risultato osservabile nel ciclo corrente.`,
                620
            );
            const consequence = provided?.consequence || cleanText(
                relatedEvent?.consequence || `Il risultato modifica risorse e credibilità sul tema «${choice.topic || 'strategia generale'}» e resta parte dello stato del mondo.`,
                520
            );
            const worldResponse = provided?.worldResponse || cleanText(
                reactingActor
                    ? `${reactingActor.name} prende posizione perseguendo ${actorGoal(reactingActor)} tramite ${actorStrategy(reactingActor)}.`
                    : 'Gli attori coinvolti ricalcolano interessi e posizioni alla luce del risultato.',
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
                `Conseguenza: ${cleanText(outcome.consequence, 320)} Reazione registrata: ${cleanText(outcome.worldResponse, 320)}`
            ).join('\n')}`
        ).join('\n\n')}`;
    }

    function buildConversationStarters(events, world, context = {}) {
        const actors = activeActors(world, context);
        const actorByName = name => actors.find(item => keyOf(item.name) === keyOf(name));
        const protagonistKey = keyOf(context.protagonistName || 'protagonista');
        const event = asArray(events).find(item =>
            isMeaningfulEvent(item) && eventRequiresConversation(item)
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
        const directFact = cleanText(event.summary || event.consequence, 420)
            .replace(new RegExp(`^${String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[,.:;\\s-]*`, 'i'), '')
            .trim();
        return [{
            eventId: event.id,
            eventTitle: event.title,
            speaker: name,
            speakerType: actor.kind === 'faction' ? 'fazione' : 'npc',
            text: `Ti rispondo direttamente su «${cleanText(event.title, 120)}»${directFact ? `: ${directFact}` : '.'} La mia priorità è ${actorGoal(actor)} e sono pronto a discutere ${cleanText(event.conversationGoal, 220)}.`,
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
        return `Durante ${cleanText(passage.description || 'il periodo', 120)}, il mondo ha prodotto questo cambiamento:\n\n${lines.join('\n\n')}` +
            (finalConsequence ? `\n\nSituazione attuale: ${finalConsequence}` : '');
    }

    return {
        TIMELINE_SIMULATOR_SCHEMA_VERSION,
        EVENT_QUEUE_LIMIT,
        MAX_PLAYER_ACTIONS_PER_TURN,
        MIN_EVENT_DELAY_MINUTES,
        MAX_EVENT_DELAY_MINUTES,
        cleanText,
        keyOf,
        isGenericActorName,
        containsPlaceholder,
        isPlaceholderSeed,
        causalTokens,
        causalLabelFor,
        causalAlignmentScore,
        parseDurationMinutes,
        normalizeInteractionMode,
        inferInteractionMode,
        inferEventDelay,
        normalizeTimelineChoice,
        normalizeTimelineChoices,
        normalizeEventSeed,
        normalizeEventQueue,
        createEventSeeds,
        createManualParallelSeeds,
        buildBatchPrompt,
        buildTurnPrompt,
        parseBatchEventBody,
        parseTurnTimings,
        ensureTurnBatch,
        scheduleEventSeeds,
        selectNextEventSeed,
        isParallelEligible,
        selectBatchEventSeeds,
        advanceEventQueue,
        parseEventTiming,
        parsePendingEventSeeds,
        extractScenePrompt,
        strategicChoiceGroups,
        desiredEventCount,
        isMeaningfulEvent,
        eventCentralityScore,
        eventSpecificityScore,
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
        eventRequiresConversation,
        buildChronicle
    };
});
