(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheTimelineChat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const CHAT_SCHEMA_VERSION = 5;
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

    function nameTokens(value) {
        return keyOf(value).split(/\s+/).filter(token => token.length >= 2);
    }

    function isSamePersonName(left, right) {
        const leftKey = keyOf(left);
        const rightKey = keyOf(right);
        if (!leftKey || !rightKey) return false;
        if (leftKey === rightKey) return true;
        const placeholders = /^(protagonista|giocatore|player)$/;
        if (placeholders.test(leftKey) || placeholders.test(rightKey)) return false;
        const leftTokens = nameTokens(left);
        const rightTokens = nameTokens(right);
        if (leftTokens.length === 1 || rightTokens.length === 1) {
            const short = leftTokens.length === 1 ? leftTokens[0] : rightTokens[0];
            const long = leftTokens.length === 1 ? rightTokens : leftTokens;
            return short.length >= 3 && long.includes(short);
        }
        return false;
    }

    function isProtagonistAlias(value, protagonistName) {
        const key = keyOf(value);
        return /^(protagonista|giocatore|player)$/.test(key) ||
            (protagonistName && isSamePersonName(value, protagonistName));
    }

    function dedupeParticipants(values, context = {}, limit = 12) {
        const protagonistName = cleanText(context.protagonistName, 100);
        const source = Array.isArray(values) ? values : String(values || '').split(/[,;]/);
        const result = [];
        let includedProtagonist = Boolean(protagonistName);
        source.map(item => cleanText(item, 100)).filter(Boolean).forEach(name => {
            if (protagonistName && isProtagonistAlias(name, protagonistName)) {
                includedProtagonist = true;
                return;
            }
            if (result.some(existing => keyOf(existing) === keyOf(name))) return;
            result.push(name);
        });
        if (includedProtagonist && protagonistName) result.push(protagonistName);
        return result.slice(0, limit);
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

    function classifyDialogueAct(value) {
        const raw = cleanText(value, 1600);
        const text = keyOf(raw);
        if (/\b(accetto|accettiamo|approvo|approviamo|confermo|confermiamo|firmo|firmiamo|aderisco|aderiamo|va bene)\b/.test(text)) return 'acceptance';
        if (/\b(rifiuto|rifiutiamo|respingo|respingiamo|non accetto|non approvo|impossibile)\b/.test(text)) return 'refusal';
        if (/\b(minaccio|ultimatum|altrimenti|pagherai|attacch|punir|ritorsion|conseguenze)\b/.test(text)) return 'threat';
        if (/\b(propongo|proponiamo|offro|offriamo|condizione|termini|garanzia|accordo|contratto|patto|prestito)\b/.test(text)) return 'proposal';
        if (raw.includes('?') || /^(chi|cosa|come|quando|dove|perche|quale|quali|quanto|puoi|potete|vuoi|volete)\b/.test(text)) return 'question';
        if (/\b(so|sappiamo|ho scoperto|abbiamo scoperto|confermo che|risulta|prova|documento|lettera|notizia)\b/.test(text)) return 'information';
        return 'position';
    }

    function dialogueActLabel(value) {
        return {
            acceptance: 'accettazione', refusal: 'rifiuto', threat: 'pressione o minaccia',
            proposal: 'proposta concreta', question: 'domanda aperta', information: 'nuova informazione',
            position: 'presa di posizione'
        }[classifyDialogueAct(value)] || 'presa di posizione';
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
            act: cleanText(input.act || classifyDialogueAct(text), 30),
            replyToId: cleanText(input.replyToId || context.replyToId, 160),
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
        const normalizedMessages = asArray(input.messages)
            .map(message => normalizeMessage({ ...message, threadId: id, eventId, eventTitle }, context))
            .filter(Boolean)
            .slice(-MAX_MESSAGES_PER_THREAD);
        const recordedPlayerName = normalizedMessages.find(message => message.source === 'player')?.speaker || '';
        const protagonistName = cleanText(context.protagonistName || recordedPlayerName, 100);
        const messages = normalizedMessages.filter(message =>
            !protagonistName || !isProtagonistAlias(message.speaker, protagonistName) ||
            message.source === 'player' || message.speakerType === 'protagonista'
        );
        const participants = dedupeParticipants([
            ...asArray(input.participants).map(item => cleanText(item, 100)),
            ...messages.flatMap(message => [message.speaker, ...splitParticipants(message.target, 12)])
        ].filter(Boolean), { protagonistName }, 12);
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

    function buildDialogueState(thread, context = {}) {
        const item = normalizeThread(thread, context);
        const lastMessage = item.messages[item.messages.length - 1] || null;
        const lastAct = lastMessage?.act || classifyDialogueAct(lastMessage?.text || '');
        const latestProposal = [...item.messages].reverse().find(message =>
            (message.act || classifyDialogueAct(message.text)) === 'proposal'
        ) || null;
        const latestQuestion = [...item.messages].reverse().find(message =>
            (message.act || classifyDialogueAct(message.text)) === 'question'
        ) || null;
        const directTarget = cleanText(lastMessage?.target, 100);
        return {
            lastMessage,
            lastAct,
            lastActLabel: dialogueActLabel(lastMessage?.text || ''),
            lastSpeaker: cleanText(lastMessage?.speaker, 100),
            directTarget,
            latestProposal,
            latestQuestion,
            resolutionStatus: item.resolution.status,
            openAgreementCount: item.agreements.filter(agreement =>
                !['rejected', 'broken', 'fulfilled'].includes(agreement.status)
            ).length
        };
    }

    function actorProfileFor(name, context = {}) {
        const actor = asArray(context.actors || context.worldActors).find(item =>
            isSamePersonName(item?.name, name)
        ) || (context.actor && (!context.actor.name || isSamePersonName(context.actor.name, name))
            ? context.actor
            : null) || {};
        return {
            name: cleanText(actor.name || name, 100),
            role: cleanText(actor.role || actor.title || actor.type, 120),
            publicGoal: cleanText(actor.publicGoal || actor.goal || actor.goals, 320),
            privateGoal: cleanText(actor.privateGoal || actor.hiddenGoal, 320),
            strategy: cleanText(actor.strategy || actor.plan, 320),
            resources: cleanText(actor.resources || actor.leverage, 320),
            personality: cleanText(actor.personality || actor.traits, 240),
            constraints: cleanText(actor.constraints || actor.limits, 260),
            influence: Math.max(0, Math.min(100, Number(actor.influence) || 0)),
            status: cleanText(actor.status, 60)
        };
    }

    function formatActorProfile(profile) {
        const entries = [
            ['ruolo', profile.role], ['obiettivo pubblico', profile.publicGoal],
            ['obiettivo privato', profile.privateGoal], ['strategia', profile.strategy],
            ['risorse e leve', profile.resources], ['personalità', profile.personality],
            ['vincoli', profile.constraints]
        ].filter(([, value]) => value);
        return entries.length
            ? entries.map(([label, value]) => `${label}: ${value}`).join('; ')
            : 'nessun profilo aggiuntivo; usa soltanto i fatti già registrati';
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

    function parseChatResponse(response, context = {}) {
        const tagged = parseChatTags(response, context).filter(message =>
            !isProtagonistAlias(message.speaker, context.protagonistName)
        );
        if (tagged.length) return tagged;
        const speaker = cleanText(context.nextSpeaker, 100);
        if (!speaker || isProtagonistAlias(speaker, context.protagonistName)) return [];
        let text = String(response || '')
            .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
            .replace(/<analysis>[\s\S]*?<\/analysis>/gi, ' ')
            .replace(/```(?:\w+)?/g, ' ')
            .replace(/\[(?:ESITO_CHAT|ACCORDO_CHAT):[^\]]*\]/gi, ' ')
            .replace(/^\s*(?:risposta|reply|assistant)\s*:\s*/i, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!text || /^[\[{]/.test(text) || text.length < 8) return [];
        const message = normalizeMessage({
            event: context.event,
            eventId: context.eventId,
            eventTitle: context.eventTitle,
            threadId: context.threadId,
            speaker,
            speakerType: context.speakerType || 'npc',
            text,
            target: context.target || context.triggerSpeaker || context.protagonistName || 'Protagonista',
            mood: 'reattivo',
            source: 'llm'
        }, context);
        return message ? [message] : [];
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
            const protagonistName = cleanText(
                context.protagonistName || thread.messages.find(item => item.source === 'player')?.speaker,
                100
            );
            if (message.source !== 'player' && isProtagonistAlias(message.speaker, protagonistName)) return;
            if (thread.messages.some(item => item.fingerprint === message.fingerprint)) return;
            thread.messages.push(message);
            thread.messages = thread.messages.slice(-MAX_MESSAGES_PER_THREAD);
            thread.participants = dedupeParticipants([
                ...thread.participants,
                message.speaker,
                ...splitParticipants(message.target, 12)
            ], { protagonistName }, 12);
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
            if (event?.conversationMode !== 'required' && context.force !== true) return;
            const participants = dedupeParticipants([
                ...asArray(event?.actors),
                ...(context.protagonistName ? [context.protagonistName] : [])
            ], context, 12);
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
        const participants = dedupeParticipants([
            ...splitParticipants(input.participants, 12),
            ...(context.protagonistName ? [context.protagonistName] : [])
        ], context, 12);
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
        const protagonistName = cleanText(context.protagonistName || thread.messages.find(item => item.source === 'player')?.speaker, 100);
        const invited = splitParticipants(participants, 12).filter(name =>
            !isProtagonistAlias(name, protagonistName) &&
            !thread.participants.some(existing => keyOf(existing) === keyOf(name))
        );
        thread.participants = dedupeParticipants([...thread.participants, ...invited], { protagonistName }, 12);
        thread.updatedAtTurn = Math.max(thread.updatedAtTurn, Number(context.turn) || 0);
        return { chats: threads, thread, invited };
    }

    function chooseNextSpeaker(thread, playerMessage = '', context = {}) {
        const item = normalizeThread(thread, context);
        const protagonistName = cleanText(
            context.protagonistName || item.messages.find(message => message.source === 'player')?.speaker,
            100
        );
        const playerSpeakers = item.messages
            .filter(message => message.source === 'player' || message.speakerType === 'protagonista')
            .map(message => message.speaker)
            .filter(Boolean);
        const candidates = item.participants.filter(name => {
            const key = keyOf(name);
            return key && !isProtagonistAlias(name, protagonistName) &&
                !playerSpeakers.some(player => isSamePersonName(name, player));
        });
        if (!candidates.length) return '';
        const messageKey = keyOf(playerMessage);
        const addressed = candidates.map(name => {
            const nameKey = keyOf(name);
            if (nameKey.length >= 3 && messageKey.includes(nameKey)) return { name, score: 1000 + nameKey.length };
            const tokens = nameTokens(name).filter(token =>
                token.length >= 3 && !/^(?:del|della|dello|dei|degli|delle|van|von|de|di|da|la|lo|il)$/.test(token)
            );
            const matched = tokens.filter(token => new RegExp(`(?:^|\\s)${token}(?:\\s|$)`).test(messageKey));
            return { name, score: matched.reduce((total, token) => total + token.length, 0) };
        }).filter(item => item.score > 0).sort((left, right) => right.score - left.score)[0];
        if (addressed) return addressed.name;
        const state = buildDialogueState(item, context);
        const directTarget = candidates.find(name =>
            state.directTarget && isSamePersonName(name, state.directTarget)
        );
        if (directTarget && !isSamePersonName(directTarget, state.lastSpeaker)) return directTarget;
        const counts = new Map(candidates.map(name => [keyOf(name), 0]));
        const lastSpokenAt = new Map(candidates.map(name => [keyOf(name), -1]));
        item.messages.forEach(message => {
            const candidate = candidates.find(name => isSamePersonName(name, message.speaker));
            const speakerKey = keyOf(candidate);
            if (candidate && counts.has(speakerKey)) counts.set(speakerKey, counts.get(speakerKey) + 1);
            if (candidate) lastSpokenAt.set(speakerKey, item.messages.indexOf(message));
        });
        return candidates.slice().sort((left, right) => {
            const leftProfile = actorProfileFor(left, context);
            const rightProfile = actorProfileFor(right, context);
            const leftRepeated = isSamePersonName(left, state.lastSpeaker) ? 1 : 0;
            const rightRepeated = isSamePersonName(right, state.lastSpeaker) ? 1 : 0;
            return leftRepeated - rightRepeated ||
                Number(counts.get(keyOf(left)) || 0) - Number(counts.get(keyOf(right)) || 0) ||
                Number(lastSpokenAt.get(keyOf(left)) ?? -1) - Number(lastSpokenAt.get(keyOf(right)) ?? -1) ||
                rightProfile.influence - leftProfile.influence ||
                candidates.indexOf(left) - candidates.indexOf(right);
        })[0] || candidates[0];
    }

    function chooseSpeakerRound(thread, playerMessage = '', context = {}) {
        const item = normalizeThread(thread, context);
        const protagonistName = cleanText(
            context.protagonistName || item.messages.find(message => message.source === 'player')?.speaker,
            100
        );
        const candidates = item.participants.filter(name =>
            !isProtagonistAlias(name, protagonistName) &&
            !item.messages.some(message =>
                (message.source === 'player' || message.speakerType === 'protagonista') &&
                isSamePersonName(message.speaker, name)
            )
        );
        if (!candidates.length) return [];
        const limit = Math.max(1, Math.min(3, Math.trunc(Number(context.maxSpeakers) || 2)));
        const primary = chooseNextSpeaker(item, playerMessage, context);
        const counts = new Map(candidates.map(name => [keyOf(name), 0]));
        const lastSpokenAt = new Map(candidates.map(name => [keyOf(name), -1]));
        item.messages.forEach((message, index) => {
            const candidate = candidates.find(name => isSamePersonName(name, message.speaker));
            if (!candidate) return;
            const key = keyOf(candidate);
            counts.set(key, counts.get(key) + 1);
            lastSpokenAt.set(key, index);
        });
        return candidates.slice().sort((left, right) => {
            if (primary && isSamePersonName(left, primary)) return -1;
            if (primary && isSamePersonName(right, primary)) return 1;
            return Number(counts.get(keyOf(left)) || 0) - Number(counts.get(keyOf(right)) || 0) ||
                Number(lastSpokenAt.get(keyOf(left)) ?? -1) - Number(lastSpokenAt.get(keyOf(right)) ?? -1) ||
                candidates.indexOf(left) - candidates.indexOf(right);
        }).slice(0, Math.min(limit, candidates.length));
    }

    function selectSingleReply(messages, requestedSpeaker) {
        const replies = asArray(messages).filter(Boolean);
        if (!replies.length) return [];
        const selected = requestedSpeaker
            ? replies.find(message => isSamePersonName(message.speaker, requestedSpeaker))
            : replies[0];
        return selected ? [selected] : [];
    }

    function buildFallbackReply(thread, playerMessage, context = {}) {
        const item = normalizeThread(thread, context);
        const speaker = cleanText(
            context.nextSpeaker || chooseNextSpeaker(item, playerMessage, context) ||
            item.participants.find(name => !/^(protagonista|giocatore|player)$/i.test(keyOf(name))),
            100
        );
        if (!speaker) return null;
        const agenda = cleanText(item.agenda || item.purpose || 'questa questione', 240);
        const purpose = keyOf(item.purpose);
        const statementKey = keyOf(playerMessage);
        const personality = keyOf(context.actor?.personality || context.personality);
        const actorProfile = actorProfileFor(speaker, context);
        const publicGoal = actorProfile.publicGoal || actorProfile.strategy || 'proteggere i miei interessi';
        const resources = actorProfile.resources || 'le risorse che controllo';
        const dialogueAct = classifyDialogueAct(context.triggerMessage || playerMessage);
        const triggerSpeaker = cleanText(context.triggerSpeaker, 100);
        const target = triggerSpeaker && !isSamePersonName(triggerSpeaker, speaker)
            ? triggerSpeaker
            : cleanText(context.protagonistName || 'Protagonista', 100);
        let text;
        let mood = 'prudente';
        if (context.autonomous && triggerSpeaker) {
            if (/ambiz|domin|aggress|impuls|orgogli|autorit/.test(personality)) {
                text = `Io non lascio che sia ${triggerSpeaker} a fissare da solo i termini su ${agenda}. La mia posizione conta, e pretendo che rischi, vantaggi e responsabilità siano ripartiti in modo esplicito prima di procedere.`;
                mood = 'assertivo';
            } else if (/diffident|caut|prudent|sospett|meticol/.test(personality)) {
                text = `Io ho ascoltato ${triggerSpeaker}, ma non considero ancora sufficienti le garanzie su ${agenda}. Prima di appoggiare questa linea voglio verificare i fatti, chiarire chi risponde di un fallimento e stabilire una scadenza concreta.`;
                mood = 'cauto';
            } else {
                text = `Io comprendo la posizione di ${triggerSpeaker}, ma su ${agenda} devo aggiungere la mia. Posso collaborare soltanto se il mio ruolo, le risorse disponibili e la responsabilità di ciascuno vengono chiariti prima della decisione.`;
                mood = 'partecipe';
            }
        } else if (dialogueAct === 'acceptance' || /\b(accetto|accettiamo|va bene|firmiamo|confermo|confermiamo)\b/.test(statementKey)) {
            text = `Io registro la tua disponibilità, ma prima di considerare chiuso l'accordo su ${agenda} voglio che importo, obblighi, garanzie e scadenza siano messi per iscritto. Confermi questi termini senza altre condizioni?`;
            mood = 'concreto';
        } else if (dialogueAct === 'refusal') {
            text = `Io prendo atto del tuo rifiuto su ${agenda}, ma il problema resta aperto. Per perseguire ${publicGoal}, quale condizione concreta dovrebbe cambiare perché tu riapra la trattativa?`;
            mood = 'fermo';
        } else if (dialogueAct === 'threat') {
            text = `Io ho compreso la minaccia, ma non deciderò sotto pressione. Se vuoi evitare che io impieghi ${resources} per ${publicGoal}, quale garanzia verificabile offri adesso?`;
            mood = 'teso';
        } else if (dialogueAct === 'question') {
            text = `Io rispondo per ciò che conosco: il mio obiettivo è ${publicGoal}, e posso contare su ${resources}. Quale parte di questa posizione vuoi trasformare in un impegno preciso?`;
            mood = 'diretto';
        } else if (dialogueAct === 'proposal') {
            text = `Io valuto la proposta alla luce del mio obiettivo, ${publicGoal}. Posso prenderla in considerazione soltanto se chiarisci cosa ricevo, cosa devo impegnare e chi risponde del fallimento: quali termini metti per iscritto?`;
            mood = 'negoziale';
        } else if (/contratt|negozia|diplomaz|trattat/.test(purpose)) {
            text = `Io sono disposto a discutere ${agenda}, ma voglio una garanzia concreta e termini che tutelino anche i miei interessi. Quale concessione sei disposto a mettere per iscritto?`;
        } else if (/strateg/.test(purpose)) {
            text = `Io posso discutere il piano su ${agenda}, ma non darò il mio appoggio al buio. Indicami il compito che affidi a me, le risorse disponibili e il rischio che sei disposto ad assumerti.`;
            mood = 'determinato';
        } else if (/personal/.test(purpose)) {
            text = `Io voglio capire se parli con sincerità: dimmi che cosa chiedi davvero a me e che cosa sei pronto a fare in cambio.`;
            mood = 'attento';
        } else {
            text = `Io prendo sul serio la tua posizione. Su ${agenda} non posso limitarmi a un assenso generico: dimmi quale risultato concreto vuoi ottenere e quale responsabilità chiedi a me.`;
        }
        return normalizeMessage({
            threadId: item.id,
            eventId: item.eventId,
            eventTitle: item.eventTitle,
            speaker,
            speakerType: 'npc',
            text,
            target,
            mood,
            turn: context.turn,
            occurredAt: context.occurredAt || item.occurredAt,
            source: 'local-fallback'
        }, { ...context, replyToId: context.replyToId || buildDialogueState(item, context).lastMessage?.id });
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
        const triggerSpeaker = cleanText(context.triggerSpeaker, 100);
        const triggerMessage = cleanText(context.triggerMessage || playerMessage, 1400);
        const autonomousExchange = Boolean(context.autonomous && triggerSpeaker);
        const dialogueState = buildDialogueState(item, context);
        const speakerProfile = context.speakerProfile && typeof context.speakerProfile === 'object'
            ? { ...actorProfileFor(nextSpeaker, context), ...context.speakerProfile }
            : actorProfileFor(nextSpeaker, context);
        const profileText = formatActorProfile(speakerProfile);
        const lastAct = classifyDialogueAct(triggerMessage || dialogueState.lastMessage?.text || '');
        const replyTarget = triggerSpeaker || dialogueState.lastSpeaker || context.protagonistName || 'protagonista';
        const triggerBlock = autonomousExchange
            ? `MESSAGGIO ORIGINALE DEL PROTAGONISTA: ${cleanText(playerMessage, 1400)}\nULTIMA BATTUTA DI ${triggerSpeaker}: ${triggerMessage}`
            : `IL PROTAGONISTA DICE: ${triggerMessage}`;
        return `Sei il motore di dialogo di un gioco narrativo. Interpreta esclusivamente gli interlocutori diversi dal protagonista.

EVENTO: ${item.eventTitle}
PARTECIPANTI: ${participants}
SCOPO: ${item.purpose || 'dialogo'}
ORDINE DEL GIORNO: ${item.agenda || 'affrontare le conseguenze dell’evento'}
STATO DELLA TRATTATIVA: ${item.resolution.status}; ${item.resolution.summary || 'nessun esito ancora'}
ACCORDI ESISTENTI: ${activeAgreements}
CONTESTO: ${cleanText(context.eventSummary, 2000) || 'Usa i fatti registrati nell’evento.'}
CANONE DELLA CAMPAGNA: ${cleanText(context.continuityPrompt, 12000) || 'Continua esclusivamente dai fatti e dai nomi già registrati.'}
CONTESTO DELLE PARTI: ${cleanText(context.actorContext, 6000) || 'Mantieni identità, obiettivi e risorse già stabiliti.'}
PROFILO DEL PARLANTE (${nextSpeaker}): ${cleanText(profileText, 1800)}
SNODO ATTUALE: ${dialogueActLabel(triggerMessage)} di ${replyTarget}; atto=${lastAct}; destinatario esplicito=${dialogueState.directTarget || 'nessuno'}.
CONVERSAZIONE RECENTE:
${history}

${triggerBlock}
PROSSIMO E UNICO PARLANTE: ${nextSpeaker}

Rispondi senza narrazione esterna e produci ESATTAMENTE UNA CHAT, pronunciata soltanto da ${nextSpeaker}:
[CHAT: ${item.eventTitle}|${nextSpeaker}|npc/fazione/regno/gruppo|messaggio_in_prima_persona|destinatario|emozione]
${nextSpeaker} parla in prima persona e conserva carica, obiettivi pubblici e privati, carattere, alleanze, leve, vincoli e conoscenze parziali. La personalità deve essere udibile nel lessico, nella lunghezza delle frasi, nella deferenza o aggressività e nel modo di dissentire: non usare una voce da assistente generico. Può contraddire quanto detto prima, mentire, chiedere garanzie, rifiutare o fare una controproposta. Non far parlare nessun altro in questa chiamata, non parlare mai al posto del protagonista e non rendere tutti automaticamente disponibili o concordi.
La battuta deve essere completa, reattiva e dialogica: 2-5 frasi, circa 50-160 parole, senza interrompere l'ultima frase. Reagisci prima di tutto all'ULTIMA battuta disponibile: ${autonomousExchange ? `quella di ${triggerSpeaker}, intervenendo come partecipante autonomo e rivolgendoti a lui, al protagonista o al gruppo secondo il tuo interesse` : 'quella del giocatore'}. Se contiene una domanda, rispondi; se accetta o rifiuta, riconoscilo; se propone termini, valutali uno per uno. Non ripetere né parafrasare le battute precedenti e non ricominciare dall'ordine del giorno. Fai avanzare il dialogo con una decisione, un fatto noto al parlante, una richiesta concreta o una controproposta coerente. Non usare formule metanarrative come «dimmi quale risultato vuoi ottenere» quando è già stato specificato.

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
        classifyDialogueAct,
        dialogueActLabel,
        buildDialogueState,
        migrateChats,
        parseChatTags,
        parseChatResponse,
        isSamePersonName,
        isProtagonistAlias,
        recordMessages,
        ensureEventThreads,
        createThread,
        inviteParticipants,
        chooseNextSpeaker,
        chooseSpeakerRound,
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
