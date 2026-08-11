(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheTimelineChat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const CHAT_SCHEMA_VERSION = 3;
    const MAX_THREADS = 60;
    const MAX_MESSAGES_PER_THREAD = 80;
    const SPEAKER_TYPES = ['protagonista', 'npc', 'fazione', 'regno', 'gruppo'];
    const RESOLUTION_STATUSES = ['open', 'proposal', 'agreement', 'refused', 'failed', 'closed'];
    const AGREEMENT_STATUSES = ['draft', 'active', 'rejected', 'broken', 'fulfilled'];

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

    function normalizeSpeakerType(value) {
        const key = keyOf(value);
        if (/player|giocatore|protagonist/.test(key)) return 'protagonista';
        if (/faction|fazione|partito|gilda/.test(key)) return 'fazione';
        if (/kingdom|regno|nazione|stato|governo/.test(key)) return 'regno';
        if (/group|gruppo|popolo|classe/.test(key)) return 'gruppo';
        return SPEAKER_TYPES.includes(key) ? key : 'npc';
    }

    function speaksInFirstPerson(value) {
        const text = keyOf(value);
        return /\b(io|noi|mio|mia|miei|mie|nostro|nostra|nostri|nostre|sono|siamo|ho|abbiamo|voglio|vogliamo|intendo|intendiamo|credo|crediamo|chiedo|chiediamo|propongo|proponiamo|accetto|accettiamo|rifiuto|rifiutiamo|prometto|promettiamo)\b/.test(text);
    }

    function ensureFirstPerson(value, source) {
        const text = cleanText(value, 1400);
        if (!text || source === 'player' || speaksInFirstPerson(text)) return text;
        return `Io dichiaro: ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
    }

    function findEvent(events, reference) {
        const key = keyOf(reference);
        return [...asArray(events)].reverse().find(event =>
            keyOf(event?.id) === key || keyOf(event?.title) === key
        ) || null;
    }

    function threadIdFor(eventId, eventTitle) {
        return `chat-${hashText(eventId || eventTitle || 'mondo')}`;
    }

    function splitParticipants(value, limit = 12) {
        const source = Array.isArray(value) ? value : String(value || '').split(/[,;]/);
        const seen = new Set();
        return source.map(item => cleanText(item, 100)).filter(item => {
            const key = keyOf(item);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, limit);
    }

    function normalizeResolutionStatus(value) {
        const key = keyOf(value);
        if (/accord|agreement|accepted|accett/.test(key)) return 'agreement';
        if (/proposal|proposta|draft|bozza/.test(key)) return 'proposal';
        if (/refused|rifiut|rejected/.test(key)) return 'refused';
        if (/failed|fallit|broken|rotto/.test(key)) return 'failed';
        if (/closed|chius/.test(key)) return 'closed';
        return RESOLUTION_STATUSES.includes(key) ? key : 'open';
    }

    function normalizeAgreementStatus(value) {
        const key = keyOf(value);
        if (/active|attiv|accepted|accett|firmat/.test(key)) return 'active';
        if (/reject|rifiut/.test(key)) return 'rejected';
        if (/broken|violat|rotto/.test(key)) return 'broken';
        if (/fulfilled|adempi|complet/.test(key)) return 'fulfilled';
        return AGREEMENT_STATUSES.includes(key) ? key : 'draft';
    }

    function normalizeAgreement(source, context = {}) {
        const input = source && typeof source === 'object' ? source : {};
        const title = cleanText(input.title, 140);
        const parties = splitParticipants(input.parties || input.participants, 12);
        const terms = cleanText(input.terms, 700);
        if (!title || parties.length < 2 || !terms) return null;
        const turn = Math.max(0, Number(input.turn ?? context.turn) || 0);
        const agreement = {
            chatSchemaVersion: CHAT_SCHEMA_VERSION,
            id: cleanText(input.id, 160) || `agreement-${turn}-${hashText(`${title}|${parties.join('|')}|${terms}`)}`,
            threadId: cleanText(input.threadId || context.threadId, 160),
            title,
            parties,
            type: cleanText(input.type || 'accordo', 80),
            terms,
            status: normalizeAgreementStatus(input.status),
            deadline: cleanText(input.deadline, 120),
            consequence: cleanText(input.consequence, 420),
            scope: cleanText(input.scope, 140),
            turn,
            source: cleanText(input.source || context.source || 'llm', 30)
        };
        agreement.fingerprint = keyOf(`${agreement.title}|${agreement.parties.join('|')}|${agreement.terms}`);
        return agreement;
    }

    function normalizeOutcome(source, context = {}) {
        const input = source && typeof source === 'object' ? source : {};
        const threadRef = cleanText(input.threadRef || input.threadId || input.title, 160);
        const summary = cleanText(input.summary, 500);
        if (!threadRef || !summary) return null;
        return {
            threadRef,
            threadId: cleanText(input.threadId, 160),
            status: normalizeResolutionStatus(input.status),
            summary,
            consequence: cleanText(input.consequence, 420),
            followUp: cleanText(input.followUp, 320),
            participants: splitParticipants(input.participants, 12),
            turn: Math.max(0, Number(input.turn ?? context.turn) || 0),
            source: cleanText(input.source || context.source || 'llm', 30)
        };
    }

    function normalizeMessage(source, context = {}) {
        const input = source && typeof source === 'object' ? source : {};
        const speaker = cleanText(input.speaker, 100);
        const messageSource = cleanText(input.source || context.source || 'llm', 30);
        const text = ensureFirstPerson(input.text || input.message, messageSource);
        if (!speaker || !text) return null;
        const event = input.event || findEvent(context.events, input.eventId || input.eventTitle || input.eventRef);
        const eventId = cleanText(input.eventId || event?.id, 140);
        const eventTitle = cleanText(input.eventTitle || input.eventRef || event?.title || 'Conversazione del mondo', 120);
        const turn = Math.max(0, Math.trunc(Number(input.turn ?? context.turn ?? 0) || 0));
        const threadId = cleanText(input.threadId, 140) || threadIdFor(eventId, eventTitle);
        const message = {
            chatSchemaVersion: CHAT_SCHEMA_VERSION,
            id: cleanText(input.id, 160) || `msg-${turn}-${hashText(`${threadId}|${speaker}|${text}`)}`,
            threadId,
            eventId,
            eventTitle,
            speaker,
            speakerType: normalizeSpeakerType(input.speakerType),
            text,
            target: cleanText(input.target, 100),
            mood: cleanText(input.mood || 'neutrale', 40),
            turn,
            occurredAt: cleanText(input.occurredAt || event?.occurredAt || context.occurredAt, 100),
            source: messageSource
        };
        message.fingerprint = keyOf(`${threadId}|${speaker}|${text}`);
        return message;
    }

    function normalizeThread(source, context = {}) {
        const input = source && typeof source === 'object' ? source : {};
        const event = input.event || findEvent(context.events, input.eventId || input.eventTitle);
        const eventId = cleanText(input.eventId || event?.id, 140);
        const eventTitle = cleanText(input.eventTitle || input.title || event?.title || 'Conversazione del mondo', 120);
        const id = cleanText(input.id, 140) || threadIdFor(eventId, eventTitle);
        const messages = asArray(input.messages)
            .map(message => normalizeMessage({ ...message, threadId: id, eventId, eventTitle }, context))
            .filter(Boolean)
            .slice(-MAX_MESSAGES_PER_THREAD);
        const participants = [...new Set([
            ...asArray(input.participants).map(item => cleanText(item, 100)),
            ...messages.flatMap(message => [message.speaker, ...splitParticipants(message.target, 12)])
        ].filter(Boolean))].slice(0, 12);
        const resolutionInput = input.resolution && typeof input.resolution === 'object' ? input.resolution : {};
        const resolution = {
            status: normalizeResolutionStatus(resolutionInput.status || input.resolutionStatus),
            summary: cleanText(resolutionInput.summary || input.resolutionSummary, 500),
            consequence: cleanText(resolutionInput.consequence || input.resolutionConsequence, 420),
            followUp: cleanText(resolutionInput.followUp || input.followUp, 320),
            updatedAtTurn: Math.max(0, Number(resolutionInput.updatedAtTurn ?? input.updatedAtTurn ?? context.turn) || 0)
        };
        const agreements = asArray(input.agreements)
            .map(agreement => normalizeAgreement({ ...agreement, threadId: id }, context))
            .filter(Boolean)
            .slice(-20);
        const rawAgenda = cleanText(input.agenda || input.subject || event?.conversationGoal || event?.consequence, 420);
        const agenda = /^(available|required|none|open|dialogue|action|either)$/i.test(keyOf(rawAgenda))
            ? cleanText(event?.conversationGoal || event?.consequence || input.purpose || 'Affrontare le conseguenze dell’evento', 420)
            : rawAgenda;
        return {
            chatSchemaVersion: CHAT_SCHEMA_VERSION,
            id,
            eventId,
            eventTitle,
            title: cleanText(input.title || eventTitle, 120),
            participants,
            messages,
            purpose: cleanText(input.purpose || event?.type || 'dialogo', 80),
            agenda,
            origin: cleanText(input.origin || (event ? 'event' : 'player'), 40),
            resolution,
            agreements,
            status: /closed|chius/.test(keyOf(input.status)) ? 'closed' : 'active',
            createdAtTurn: Math.max(0, Number(input.createdAtTurn ?? event?.turn ?? context.turn) || 0),
            updatedAtTurn: Math.max(0, Number(input.updatedAtTurn ?? input.createdAtTurn ?? event?.turn ?? context.turn) || 0),
            occurredAt: cleanText(input.occurredAt || event?.occurredAt || context.occurredAt, 100),
            importance: cleanText(input.importance || event?.importance || 'normal', 20)
        };
    }

    function migrateChats(chats, context = {}) {
        return asArray(chats)
            .map(thread => normalizeThread(thread, context))
            .filter(thread => thread.eventTitle || thread.messages.length)
            .slice(-MAX_THREADS);
    }

    function parseChatTags(response, context = {}) {
        const messages = [];
        const regex = /\[CHAT:\s*([^\]]+)\]/gi;
        let match;
        while ((match = regex.exec(String(response || ''))) !== null) {
            const limits = [140, 100, 40, 1400, 100, 60];
            const parts = match[1].split('|').map((part, index) => cleanText(part, limits[index] || 700));
            if (parts.length < 4) continue;
            const event = findEvent(context.events, parts[0]);
            const message = normalizeMessage({
                event,
                eventRef: parts[0],
                speaker: parts[1],
                speakerType: parts[2],
                text: parts[3],
                target: parts[4],
                mood: parts[5],
                source: 'llm'
            }, context);
            if (message) messages.push(message);
        }
        return messages.slice(0, 24);
    }

    function recordMessages(chats, incomingMessages, context = {}) {
        const threads = migrateChats(chats, context);
        const added = [];
        asArray(incomingMessages).forEach(raw => {
            const message = normalizeMessage(raw, context);
            if (!message) return;
            let thread = threads.find(item => item.id === message.threadId);
            if (!thread) {
                thread = normalizeThread({
                    id: message.threadId,
                    eventId: message.eventId,
                    eventTitle: message.eventTitle,
                    title: message.eventTitle,
                    occurredAt: message.occurredAt,
                    createdAtTurn: message.turn
                }, context);
                threads.push(thread);
            }
            if (thread.messages.some(item => item.fingerprint === message.fingerprint)) return;
            thread.messages.push(message);
            thread.messages = thread.messages.slice(-MAX_MESSAGES_PER_THREAD);
            thread.participants = splitParticipants([
                ...thread.participants,
                message.speaker,
                ...splitParticipants(message.target, 12)
            ], 12);
            thread.updatedAtTurn = Math.max(thread.updatedAtTurn, message.turn);
            added.push(message);
        });
        return { chats: threads.slice(-MAX_THREADS), added, changed: added.length > 0 };
    }

    function ensureEventThreads(chats, events, context = {}) {
        const threads = migrateChats(chats, { ...context, events });
        const created = [];
        asArray(events).forEach(event => {
            if (event?.conversationMode === 'none') return;
            const participants = splitParticipants([
                ...asArray(event?.actors),
                ...(context.protagonistName ? [context.protagonistName] : [])
            ], 12);
            if (participants.length < 2) return;
            const id = threadIdFor(event.id, event.title);
            if (threads.some(thread => thread.id === id)) return;
            const thread = normalizeThread({
                id,
                eventId: event.id,
                eventTitle: event.title,
                title: event.title,
                participants,
                purpose: event.type || 'evento',
                agenda: event.conversationGoal || event.consequence,
                origin: 'event',
                occurredAt: event.occurredAt,
                importance: event.importance,
                createdAtTurn: event.turn
            }, { ...context, events });
            threads.push(thread);
            created.push(thread);
        });
        return { chats: threads.slice(-MAX_THREADS), created };
    }

    function createThread(chats, input = {}, context = {}) {
        const threads = migrateChats(chats, context);
        const participants = splitParticipants([
            ...splitParticipants(input.participants, 12),
            ...(context.protagonistName ? [context.protagonistName] : [])
        ], 12);
        const title = cleanText(input.title || input.subject, 120);
        const agenda = cleanText(input.agenda || input.subject, 420);
        if (!title || !agenda || participants.length < 2) return { chats: threads, thread: null, created: false };
        const turn = Math.max(0, Number(context.turn) || 0);
        const id = cleanText(input.id, 140) || `chat-player-${turn}-${hashText(`${title}|${agenda}|${participants.join('|')}|${threads.length}`)}`;
        const duplicate = threads.find(thread => thread.id === id);
        if (duplicate) return { chats: threads, thread: duplicate, created: false };
        const thread = normalizeThread({
            id,
            eventId: cleanText(input.eventId, 140),
            eventTitle: cleanText(input.eventTitle || title, 120),
            title,
            participants,
            purpose: input.purpose || 'dialogo',
            agenda,
            origin: input.origin || 'player',
            occurredAt: input.occurredAt || context.occurredAt,
            importance: input.importance || 'normal',
            createdAtTurn: turn,
            updatedAtTurn: turn
        }, context);
        threads.push(thread);
        return { chats: threads.slice(-MAX_THREADS), thread, created: true };
    }

    function inviteParticipants(chats, threadId, participants, context = {}) {
        const threads = migrateChats(chats, context);
        const thread = threads.find(item => item.id === threadId);
        if (!thread) return { chats: threads, thread: null, invited: [] };
        const current = new Set(thread.participants.map(keyOf));
        const invited = splitParticipants(participants, 12).filter(name => !current.has(keyOf(name)));
        thread.participants = splitParticipants([...thread.participants, ...invited], 12);
        thread.updatedAtTurn = Math.max(thread.updatedAtTurn, Number(context.turn) || 0);
        return { chats: threads, thread, invited };
    }

    function chooseNextSpeaker(thread, playerMessage = '', context = {}) {
        const item = normalizeThread(thread, context);
        const protagonistKey = keyOf(context.protagonistName || 'protagonista');
        const playerSpeakers = new Set(item.messages
            .filter(message => message.source === 'player' || message.speakerType === 'protagonista')
            .map(message => keyOf(message.speaker))
            .filter(Boolean));
        const candidates = item.participants.filter(name => {
            const key = keyOf(name);
            return key && key !== protagonistKey && !playerSpeakers.has(key) && !/^(protagonista|giocatore|player)$/.test(key);
        });
        if (!candidates.length) return '';
        const messageKey = keyOf(playerMessage);
        const addressed = candidates.find(name => {
            const nameKey = keyOf(name);
            return nameKey.length >= 3 && messageKey.includes(nameKey);
        });
        if (addressed) return addressed;
        const counts = new Map(candidates.map(name => [keyOf(name), 0]));
        item.messages.forEach(message => {
            const speakerKey = keyOf(message.speaker);
            if (counts.has(speakerKey)) counts.set(speakerKey, counts.get(speakerKey) + 1);
        });
        const minimum = Math.min(...counts.values());
        return candidates.find(name => counts.get(keyOf(name)) === minimum) || candidates[0];
    }

    function selectSingleReply(messages, requestedSpeaker) {
        const replies = asArray(messages).filter(Boolean);
        if (!replies.length) return [];
        const requestedKey = keyOf(requestedSpeaker);
        const selected = requestedKey
            ? replies.find(message => keyOf(message.speaker) === requestedKey)
            : replies[0];
        return [selected || replies[0]];
    }

    function buildFallbackReply(thread, playerMessage, context = {}) {
        const item = normalizeThread(thread, context);
        const speaker = cleanText(
            context.nextSpeaker || chooseNextSpeaker(item, playerMessage, context) ||
            item.participants.find(name => !/^(protagonista|giocatore|player)$/i.test(keyOf(name))),
            100
        );
        if (!speaker) return null;
        const statement = cleanText(playerMessage, 260) || 'la tua posizione';
        const agenda = cleanText(item.agenda || item.purpose || 'questa questione', 240);
        const purpose = keyOf(item.purpose);
        let text;
        let mood = 'prudente';
        if (/contratt|negozia|diplomaz|trattat/.test(purpose)) {
            text = `Io ho ascoltato la tua proposta: «${statement}». Prima di impegnarmi su ${agenda}, voglio una garanzia concreta e termini che tutelino anche i miei interessi. Quale concessione sei disposto a mettere per iscritto?`;
        } else if (/strateg/.test(purpose)) {
            text = `Io posso discutere il piano su ${agenda}, ma non darò il mio appoggio al buio. Indicami il compito che affidi a me, le risorse disponibili e il rischio che sei disposto ad assumerti.`;
            mood = 'determinato';
        } else if (/personal/.test(purpose)) {
            text = `Io ti ho ascoltato quando hai detto «${statement}». Voglio capire se parli con sincerità: dimmi che cosa chiedi davvero a me e che cosa sei pronto a fare in cambio.`;
            mood = 'attento';
        } else {
            text = `Io prendo sul serio ciò che hai detto: «${statement}». Su ${agenda} non posso limitarmi a un assenso generico; dimmi quale risultato concreto vuoi ottenere e quale responsabilità chiedi a me.`;
        }
        return normalizeMessage({
            threadId: item.id,
            eventId: item.eventId,
            eventTitle: item.eventTitle,
            speaker,
            speakerType: 'npc',
            text,
            target: cleanText(context.protagonistName || 'Protagonista', 100),
            mood,
            turn: context.turn,
            occurredAt: context.occurredAt || item.occurredAt,
            source: 'local-fallback'
        }, context);
    }

    function parseOutcomeTags(response, context = {}) {
        const outcomes = [];
        const agreements = [];
        const text = String(response || '');
        let match;
        const outcomeRe = /\[ESITO_CHAT:\s*([^\]]+)\]/gi;
        while ((match = outcomeRe.exec(text)) !== null) {
            const parts = match[1].split('|').map(item => cleanText(item, 700));
            const outcome = normalizeOutcome({
                threadRef: parts[0], status: parts[1], summary: parts[2],
                consequence: parts[3], followUp: parts[4], turn: context.turn, source: 'llm'
            }, context);
            if (outcome) outcomes.push(outcome);
        }
        const agreementRe = /\[ACCORDO_CHAT:\s*([^\]]+)\]/gi;
        while ((match = agreementRe.exec(text)) !== null) {
            const parts = match[1].split('|').map(item => cleanText(item, 700));
            const agreement = normalizeAgreement({
                threadId: parts[0], title: parts[1], parties: parts[2], type: parts[3],
                terms: parts[4], status: parts[5], deadline: parts[6], consequence: parts[7],
                scope: parts[8], turn: context.turn, source: 'llm'
            }, context);
            if (agreement) agreements.push(agreement);
        }
        return { outcomes: outcomes.slice(0, 4), agreements: agreements.slice(0, 4) };
    }

    function findThreadByReference(threads, reference) {
        const key = keyOf(reference);
        return threads.find(thread =>
            keyOf(thread.id) === key || keyOf(thread.title) === key || keyOf(thread.eventTitle) === key
        ) || null;
    }

    function hasExplicitAcceptance(thread, participant) {
        const participantKey = keyOf(participant);
        return asArray(thread?.messages).some(message =>
            keyOf(message.speaker) === participantKey &&
            /\b(accetto|accettiamo|approvo|approviamo|confermo|confermiamo|firmo|firmiamo|aderisco|aderiamo|i accept|we accept|agreed)\b/i.test(message.text || '')
        );
    }

    function canActivateAgreement(agreement, thread) {
        return agreement.parties.every(party => hasExplicitAcceptance(thread, party));
    }

    function applyConversationResults(chats, parsed, context = {}) {
        const threads = migrateChats(chats, context);
        const appliedOutcomes = [];
        const appliedAgreements = [];
        asArray(parsed?.outcomes).forEach(raw => {
            const outcome = normalizeOutcome(raw, context);
            if (!outcome) return;
            const thread = findThreadByReference(threads, outcome.threadId || outcome.threadRef);
            if (!thread) return;
            thread.resolution = {
                status: outcome.status,
                summary: outcome.summary,
                consequence: outcome.consequence,
                followUp: outcome.followUp,
                updatedAtTurn: outcome.turn
            };
            thread.status = outcome.status === 'closed' ? 'closed' : 'active';
            thread.updatedAtTurn = Math.max(thread.updatedAtTurn, outcome.turn);
            outcome.threadId = thread.id;
            outcome.participants = thread.participants.slice();
            appliedOutcomes.push(outcome);
        });
        asArray(parsed?.agreements).forEach(raw => {
            const agreement = normalizeAgreement(raw, context);
            if (!agreement) return;
            const thread = findThreadByReference(threads, agreement.threadId);
            if (!thread) return;
            if (agreement.status === 'active' && !canActivateAgreement(agreement, thread)) {
                agreement.status = 'draft';
                if (thread.resolution.status === 'agreement') {
                    thread.resolution.status = 'proposal';
                    thread.resolution.summary = `Proposta in attesa dell'accettazione esplicita di tutte le parti: ${agreement.terms}`;
                }
            }
            agreement.threadId = thread.id;
            const duplicate = thread.agreements.find(item => item.fingerprint === agreement.fingerprint);
            if (duplicate) Object.assign(duplicate, agreement);
            else thread.agreements.push(agreement);
            thread.agreements = thread.agreements.slice(-20);
            if (agreement.status === 'active') {
                thread.resolution = {
                    status: 'agreement', summary: agreement.terms,
                    consequence: agreement.consequence, followUp: agreement.deadline,
                    updatedAtTurn: agreement.turn
                };
            }
            thread.updatedAtTurn = Math.max(thread.updatedAtTurn, agreement.turn);
            appliedAgreements.push(agreement);
        });
        return { chats: threads.slice(-MAX_THREADS), outcomes: appliedOutcomes, agreements: appliedAgreements, changed: Boolean(appliedOutcomes.length || appliedAgreements.length) };
    }

    function buildSimulationPrompt(context = {}) {
        const choices = asArray(context.recentChoices)
            .map(choice => cleanText(typeof choice === 'string' ? choice : choice?.summary || choice?.description, 240))
            .filter(Boolean)
            .slice(-5);
        return `💬 **CONVERSAZIONI GENERATE DAGLI EVENTI**
- Le conseguenze devono derivare dalle scelte recenti del giocatore, dagli eventi aperti e dagli obiettivi autonomi degli altri attori.
- Scelte da sviluppare: ${choices.length ? choices.join(' / ') : 'nessuna scelta esplicita; sviluppa soltanto le trame già aperte'}.
- Se l'unico EVENTO generato consente una conversazione, genera al massimo UNA battuta di apertura pronunciata da un solo soggetto. Gli altri interlocutori risponderanno in chiamate successive, uno alla volta.
- Formato: [CHAT: titolo_esatto_evento|nome_parlante|protagonista/npc/fazione/regno/gruppo|messaggio_in_prima_persona|destinatario|emozione]
- Ogni parte parla direttamente in prima persona («io» o «noi»), con voce, interessi e conoscenze proprie. Vietato descriverla dall'esterno.
- Non generare mai battute del protagonista: nella chat il protagonista parla soltanto quando scrive il giocatore.
- Le parti possono mentire, dissentire, minacciare, proporre accordi o rifiutare. Non devono conoscere segreti non ancora scoperti.
- La chat deve reagire a un EVENTO realmente generato nello stesso turno e potrà influenzare i futuri salti temporali.`;
    }

    function buildChatPrompt(thread, playerMessage, context = {}) {
        const item = normalizeThread(thread, context);
        const historyLimit = Math.max(12, Math.min(
            MAX_MESSAGES_PER_THREAD,
            Math.trunc(Number(context.historyLimit) || 24)
        ));
        const history = item.messages.slice(-historyLimit).map(message =>
            `${message.speaker} → ${message.target || 'tutti'}: ${message.text}`
        ).join('\n') || 'La conversazione non è ancora iniziata.';
        const participants = item.participants.filter(Boolean).join(', ') || 'le parti coinvolte nell’evento';
        const activeAgreements = item.agreements.length
            ? item.agreements.map(agreement => `${agreement.title}: ${agreement.terms} [${agreement.status}]`).join(' / ')
            : 'nessuno';
        const nextSpeaker = cleanText(context.nextSpeaker || chooseNextSpeaker(item, playerMessage, context), 100) ||
            item.participants.find(name => !/^(protagonista|giocatore|player)$/i.test(keyOf(name))) || 'Interlocutore';
        return `Sei il motore di dialogo di un gioco narrativo. Interpreta esclusivamente gli interlocutori diversi dal protagonista.

EVENTO: ${item.eventTitle}
PARTECIPANTI: ${participants}
SCOPO: ${item.purpose || 'dialogo'}
ORDINE DEL GIORNO: ${item.agenda || 'affrontare le conseguenze dell’evento'}
STATO DELLA TRATTATIVA: ${item.resolution.status}; ${item.resolution.summary || 'nessun esito ancora'}
ACCORDI ESISTENTI: ${activeAgreements}
CONTESTO: ${cleanText(context.eventSummary, 2000) || 'Usa i fatti registrati nell’evento.'}
CONTESTO DELLE PARTI: ${cleanText(context.actorContext, 6000) || 'Mantieni identità, obiettivi e risorse già stabiliti.'}
CONVERSAZIONE RECENTE:
${history}

IL PROTAGONISTA DICE: ${cleanText(playerMessage, 1400)}
PROSSIMO E UNICO PARLANTE: ${nextSpeaker}

Rispondi senza narrazione esterna e produci ESATTAMENTE UNA CHAT, pronunciata soltanto da ${nextSpeaker}:
[CHAT: ${item.eventTitle}|${nextSpeaker}|npc/fazione/regno/gruppo|messaggio_in_prima_persona|destinatario|emozione]
${nextSpeaker} parla in prima persona e conserva carica, obiettivi pubblici e privati, carattere, alleanze, leve, vincoli e conoscenze parziali. Può contraddire quanto detto prima, mentire, chiedere garanzie, rifiutare o fare una controproposta. Non far parlare nessun altro in questa chiamata, non parlare mai al posto del protagonista e non rendere tutti automaticamente disponibili o concordi.
La battuta deve essere completa, reattiva e dialogica: 2-5 frasi, circa 50-180 parole, senza interrompere l'ultima frase. Deve rispondere a ciò che il giocatore ha appena detto e concludere con una posizione, una domanda, una richiesta o una controproposta che permetta di continuare l'interazione.

Se e soltanto se questo scambio cambia davvero la situazione, aggiungi:
[ESITO_CHAT: ${item.id}|open/proposal/agreement/refused/failed/closed|esito concreto|conseguenza sul mondo|azione successiva]
Se nasce un contratto, trattato, patto o incarico con termini verificabili, aggiungi anche:
[ACCORDO_CHAT: ${item.id}|titolo|parti separate da virgola|contratto/trattato/patto/incarico|termini precisi|draft/active/rejected/broken/fulfilled|scadenza o vuoto|conseguenza se rispettato o violato|ambito o attività]
Usa active soltanto se tutte le parti necessarie hanno accettato esplicitamente nella conversazione; una proposta unilaterale resta draft. Le parole del protagonista contano soltanto se sono state scritte dal giocatore.`;
    }

    function iconForEvent(type) {
        const icons = {
            conflitto: '⚔️', scoperta: '🔎', relazione: '🤝', decisione: '⚖️', missione: '📜',
            economia: '💰', politica: '👑', pericolo: '⚠️', viaggio: '🧭', personale: '🌱', mondo: '🌍'
        };
        return icons[keyOf(type)] || '📌';
    }

    return {
        CHAT_SCHEMA_VERSION,
        MAX_THREADS,
        MAX_MESSAGES_PER_THREAD,
        SPEAKER_TYPES,
        RESOLUTION_STATUSES,
        AGREEMENT_STATUSES,
        cleanText,
        keyOf,
        speaksInFirstPerson,
        ensureFirstPerson,
        normalizeMessage,
        normalizeThread,
        migrateChats,
        parseChatTags,
        recordMessages,
        ensureEventThreads,
        createThread,
        inviteParticipants,
        chooseNextSpeaker,
        selectSingleReply,
        buildFallbackReply,
        normalizeAgreement,
        normalizeOutcome,
        canActivateAgreement,
        parseOutcomeTags,
        applyConversationResults,
        buildSimulationPrompt,
        buildChatPrompt,
        threadIdFor,
        iconForEvent
    };
});
