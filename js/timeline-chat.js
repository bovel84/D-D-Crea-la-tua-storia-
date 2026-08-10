(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheTimelineChat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const CHAT_SCHEMA_VERSION = 1;
    const MAX_THREADS = 60;
    const MAX_MESSAGES_PER_THREAD = 80;
    const SPEAKER_TYPES = ['protagonista', 'npc', 'fazione', 'regno', 'gruppo'];

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
        const text = cleanText(value, 700);
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
            ...messages.flatMap(message => [message.speaker, message.target])
        ].filter(Boolean))].slice(0, 12);
        return {
            chatSchemaVersion: CHAT_SCHEMA_VERSION,
            id,
            eventId,
            eventTitle,
            title: cleanText(input.title || eventTitle, 120),
            participants,
            messages,
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
            const parts = match[1].split('|').map(part => cleanText(part, 700));
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
            thread.participants = [...new Set([...thread.participants, message.speaker, message.target].filter(Boolean))].slice(0, 12);
            thread.updatedAtTurn = Math.max(thread.updatedAtTurn, message.turn);
            added.push(message);
        });
        return { chats: threads.slice(-MAX_THREADS), added, changed: added.length > 0 };
    }

    function ensureEventThreads(chats, events, context = {}) {
        const threads = migrateChats(chats, { ...context, events });
        const created = [];
        asArray(events).forEach(event => {
            const participants = asArray(event?.actors).map(actor => cleanText(actor, 100)).filter(Boolean);
            if (participants.length < 2) return;
            const id = threadIdFor(event.id, event.title);
            if (threads.some(thread => thread.id === id)) return;
            const thread = normalizeThread({
                id,
                eventId: event.id,
                eventTitle: event.title,
                title: event.title,
                participants,
                occurredAt: event.occurredAt,
                importance: event.importance,
                createdAtTurn: event.turn
            }, { ...context, events });
            threads.push(thread);
            created.push(thread);
        });
        return { chats: threads.slice(-MAX_THREADS), created };
    }

    function buildSimulationPrompt(context = {}) {
        const choices = asArray(context.recentChoices)
            .map(choice => cleanText(typeof choice === 'string' ? choice : choice?.summary || choice?.description, 240))
            .filter(Boolean)
            .slice(-5);
        return `💬 **CONVERSAZIONI GENERATE DAGLI EVENTI**
- Le conseguenze devono derivare dalle scelte recenti del giocatore, dagli eventi aperti e dagli obiettivi autonomi degli altri attori.
- Scelte da sviluppare: ${choices.length ? choices.join(' / ') : 'nessuna scelta esplicita; sviluppa soltanto le trame già aperte'}.
- Per ogni EVENTO con almeno due parti coinvolte, genera da 1 a 4 messaggi che aprano o sviluppino la relativa chat.
- Formato: [CHAT: titolo_esatto_evento|nome_parlante|protagonista/npc/fazione/regno/gruppo|messaggio_in_prima_persona|destinatario|emozione]
- Ogni parte parla direttamente in prima persona («io» o «noi»), con voce, interessi e conoscenze proprie. Vietato descriverla dall'esterno.
- Non generare mai battute del protagonista: nella chat il protagonista parla soltanto quando scrive il giocatore.
- Le parti possono mentire, dissentire, minacciare, proporre accordi o rifiutare. Non devono conoscere segreti non ancora scoperti.
- La chat deve reagire a un EVENTO realmente generato nello stesso turno e potrà influenzare i futuri salti temporali.`;
    }

    function buildChatPrompt(thread, playerMessage, context = {}) {
        const item = normalizeThread(thread, context);
        const history = item.messages.slice(-12).map(message =>
            `${message.speaker} → ${message.target || 'tutti'}: ${message.text}`
        ).join('\n') || 'La conversazione non è ancora iniziata.';
        const participants = item.participants.filter(Boolean).join(', ') || 'le parti coinvolte nell’evento';
        return `Sei il motore di dialogo di un gioco narrativo. Interpreta esclusivamente gli interlocutori diversi dal protagonista.

EVENTO: ${item.eventTitle}
PARTECIPANTI: ${participants}
CONTESTO: ${cleanText(context.eventSummary, 500) || 'Usa i fatti registrati nell’evento.'}
CONTESTO DELLE PARTI: ${cleanText(context.actorContext, 900) || 'Mantieni identità, obiettivi e risorse già stabiliti.'}
CONVERSAZIONE RECENTE:
${history}

IL PROTAGONISTA DICE: ${cleanText(playerMessage, 700)}

Rispondi con 1-3 soli tag, senza narrazione esterna:
[CHAT: ${item.eventTitle}|nome_parlante|npc/fazione/regno/gruppo|messaggio_in_prima_persona|destinatario|emozione]
Ogni interlocutore parla in prima persona, conserva obiettivi, carattere, alleanze e conoscenze, reagisce davvero alle parole del protagonista e può non essere d'accordo. Non parlare mai al posto del protagonista.`;
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
        buildSimulationPrompt,
        buildChatPrompt,
        threadIdFor,
        iconForEvent
    };
});
