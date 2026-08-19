(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheChatRuntimeV3 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 3;
    const MAX_GROUP_REPLIES = 2;
    const PATCH_MARK = '__cronacheChatRuntimeV3';

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 1800) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
    const keyOf = value => clean(value, 600)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    function escapeRegex(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function extractTextFromPayload(value, depth = 0) {
        if (depth > 6 || value == null) return '';
        if (typeof value === 'string') return clean(value, 8000);
        if (Array.isArray(value)) {
            for (const item of value) {
                const found = extractTextFromPayload(item, depth + 1);
                if (found) return found;
            }
            return '';
        }
        if (typeof value !== 'object') return '';
        const preferred = [
            'content', 'message', 'text', 'reply', 'response', 'answer', 'output',
            'completion', 'assistant', 'result', 'data', 'choices'
        ];
        for (const field of preferred) {
            if (!(field in value)) continue;
            const found = extractTextFromPayload(value[field], depth + 1);
            if (found) return found;
        }
        return '';
    }

    function parseStructuredResponse(response) {
        if (response && typeof response === 'object') return extractTextFromPayload(response);
        const raw = String(response == null ? '' : response).trim();
        if (!raw || !/^[\[{]/.test(raw)) return '';
        try {
            return extractTextFromPayload(JSON.parse(raw));
        } catch (_error) {
            return '';
        }
    }

    function stripModelEnvelope(value, speaker) {
        let text = clean(value, 8000)
            .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
            .replace(/<analysis>[\s\S]*?<\/analysis>/gi, ' ')
            .replace(/```(?:json|markdown|text|txt)?/gi, ' ')
            .replace(/```/g, ' ')
            .replace(/\[(?:ESITO_CHAT|ACCORDO_CHAT):[^\]]*\]/gi, ' ')
            .replace(/^\s*(?:risposta|reply|assistant|message|content)\s*:\s*/i, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (speaker) {
            text = text.replace(new RegExp(`^\\*{0,2}${escapeRegex(speaker)}\\*{0,2}\\s*[:—-]\\s*`, 'i'), '').trim();
        }
        return text;
    }

    function looksLikeInstructionEcho(value) {
        const text = keyOf(value);
        if (!text) return true;
        return [
            'prossimo e unico parlante', 'profilo del parlante', 'ciclo del dialogo',
            'ordine del giorno', 'canone della campagna', 'snodo attuale',
            'rispondi senza narrazione esterna', 'produci esattamente una chat',
            'messaggio originale del protagonista', 'interlocutori diversi dal protagonista'
        ].some(fragment => text.includes(keyOf(fragment)));
    }

    function repairThread(thread, context, chatApi) {
        if (!thread || typeof thread !== 'object') return thread;
        const protagonistName = clean(
            context?.protagonistName || asArray(thread.messages).find(message => message?.source === 'player')?.speaker,
            120
        );
        const seenMessages = new Set();
        thread.messages = asArray(thread.messages).filter(message => {
            if (!message) return false;
            if (message.source !== 'player' && protagonistName && chatApi.isProtagonistAlias?.(message.speaker, protagonistName)) {
                return false;
            }
            const fingerprint = clean(message.fingerprint || message.id || `${message.speaker}|${message.text}`, 1200).toLowerCase();
            if (!fingerprint || seenMessages.has(fingerprint)) return false;
            seenMessages.add(fingerprint);
            return true;
        });

        const participants = [];
        asArray(thread.participants).forEach(name => {
            const candidate = clean(name, 120);
            if (!candidate) return;
            if (protagonistName && chatApi.isProtagonistAlias?.(candidate, protagonistName)) return;
            if (participants.some(existing =>
                keyOf(existing) === keyOf(candidate) || chatApi.isSamePersonName?.(existing, candidate)
            )) return;
            participants.push(candidate);
        });
        if (protagonistName) participants.push(protagonistName);
        thread.participants = participants.slice(0, 12);
        return thread;
    }

    function repairChats(chats, context, chatApi) {
        return asArray(chats).map(thread => repairThread(thread, context || {}, chatApi));
    }

    function mentionedCandidates(thread, playerMessage, context, chatApi) {
        const protagonistName = clean(context?.protagonistName, 120);
        const text = keyOf(playerMessage);
        if (!text) return [];
        return asArray(thread?.participants).filter(name => {
            if (!name || chatApi.isProtagonistAlias?.(name, protagonistName)) return false;
            const full = keyOf(name);
            if (full && full.length >= 3 && (` ${text} `).includes(` ${full} `)) return true;
            const tokens = full.split(' ').filter(token => token.length >= 4 && !/^(signor|signora|conte|duca|duchessa|re|regina|lord|lady)$/.test(token));
            return tokens.some(token => new RegExp(`(?:^|\\s)${escapeRegex(token)}(?:\\s|$)`).test(text));
        });
    }

    function explicitCloseRequested(thread) {
        const messages = asArray(thread?.messages);
        if (!messages.length) return false;
        const recent = messages.slice(-2).map(message => keyOf(message?.text)).join(' ');
        return /\b(conclud\w*|chiud\w*|conversazione finita|fine della conversazione|non ho altro|non abbiamo altro|arrivederci|saluti|basta cosi|termina qui|terminiamo qui)\b/.test(recent);
    }

    function installEngine(chatApi) {
        if (!chatApi || chatApi[PATCH_MARK]) return Boolean(chatApi);
        if (typeof chatApi.parseChatResponse !== 'function' || typeof chatApi.normalizeMessage !== 'function') return false;

        const originalParseChatResponse = chatApi.parseChatResponse.bind(chatApi);
        const originalMigrateChats = chatApi.migrateChats.bind(chatApi);
        const originalRecordMessages = chatApi.recordMessages.bind(chatApi);
        const originalChooseSpeakerRound = chatApi.chooseSpeakerRound.bind(chatApi);
        const originalCloseConversation = chatApi.closeConversation.bind(chatApi);

        chatApi.parseChatResponse = function patchedParseChatResponse(response, context = {}) {
            const normal = originalParseChatResponse(response, context);
            if (normal.length) return normal;

            const speaker = clean(context.nextSpeaker, 120);
            if (!speaker || chatApi.isProtagonistAlias?.(speaker, context.protagonistName)) return [];
            const structured = parseStructuredResponse(response);
            if (structured) {
                const structuredParsed = originalParseChatResponse(structured, context);
                if (structuredParsed.length) return structuredParsed;
            }
            const candidate = stripModelEnvelope(structured || response, speaker);
            if (!candidate || candidate === '[object Object]' || candidate.length < 8 || looksLikeInstructionEcho(candidate)) return [];
            const message = chatApi.normalizeMessage({
                event: context.event,
                eventId: context.eventId,
                eventTitle: context.eventTitle,
                threadId: context.threadId,
                speaker,
                speakerType: context.speakerType || 'npc',
                text: candidate,
                target: context.target || context.triggerSpeaker || context.protagonistName || 'Protagonista',
                mood: 'reattivo',
                source: 'llm-recovered'
            }, context);
            return message ? [message] : [];
        };

        chatApi.migrateChats = function patchedMigrateChats(chats, context = {}) {
            return repairChats(originalMigrateChats(chats, context), context, chatApi);
        };

        chatApi.recordMessages = function patchedRecordMessages(chats, incomingMessages, context = {}) {
            const result = originalRecordMessages(repairChats(chats, context, chatApi), incomingMessages, context);
            result.chats = repairChats(result.chats, context, chatApi);
            return result;
        };

        chatApi.chooseSpeakerRound = function patchedChooseSpeakerRound(thread, playerMessage = '', context = {}) {
            const repaired = repairThread(chatApi.normalizeThread(thread, context), context, chatApi);
            const round = originalChooseSpeakerRound(repaired, playerMessage, {
                ...context,
                maxSpeakers: Math.min(MAX_GROUP_REPLIES, Math.max(1, Number(context.maxSpeakers) || MAX_GROUP_REPLIES))
            });
            const unique = round.filter((name, index, list) => name && !list.slice(0, index).some(existing =>
                keyOf(existing) === keyOf(name) || chatApi.isSamePersonName?.(existing, name)
            ));
            const mentioned = mentionedCandidates(repaired, playerMessage, context, chatApi);
            if (mentioned.length === 1) {
                const requested = unique.find(name => chatApi.isSamePersonName?.(name, mentioned[0]) || keyOf(name) === keyOf(mentioned[0]));
                if (requested) return [requested];
            }
            const metrics = chatApi.conversationMetrics?.(repaired);
            if (metrics?.finalRound) return unique.slice(0, 1);
            return unique.slice(0, MAX_GROUP_REPLIES);
        };

        chatApi.closeConversation = function patchedCloseConversation(chats, threadId, context = {}) {
            let result = originalCloseConversation(chats, threadId, context);
            if (result.closed || context.force === true) return result;
            const thread = asArray(result.chats).find(item => item.id === threadId);
            if (!thread) return result;
            const metrics = chatApi.conversationMetrics?.(thread) || { playerTurns: 0 };
            const lastMessage = asArray(thread.messages).slice(-1)[0];
            const lastAct = chatApi.classifyDialogueAct?.(lastMessage?.text || '') || '';
            const shouldFinish = explicitCloseRequested(thread) ||
                (metrics.playerTurns >= 4 && lastMessage?.source !== 'player' && !['question', 'proposal'].includes(lastAct));
            if (!shouldFinish) return result;
            return originalCloseConversation(result.chats, threadId, {
                ...context,
                force: true,
                summary: context.summary || `Le parti hanno espresso una posizione finale su ${clean(thread.agenda || thread.title, 260)}.`,
                consequence: context.consequence || clean(lastMessage?.text, 420),
                followUp: context.followUp || 'Un nuovo confronto richiederà un fatto nuovo, una nuova proposta o un nuovo evento.'
            });
        };

        chatApi[PATCH_MARK] = PATCH_VERSION;
        return true;
    }

    let wrappedSend = null;
    function installUi(documentRef, windowRef) {
        if (!documentRef || !windowRef) return false;
        const current = windowRef.sendWorldChatMessage;
        if (typeof current !== 'function') return false;

        if (current.__chatRuntimeV3) {
            wrappedSend = current;
        } else {
            const original = current;
            wrappedSend = async function chatRuntimeV3Send(...args) {
                const button = documentRef.getElementById('btn-send-chat');
                const input = documentRef.getElementById('chat-input');
                if (button?.disabled || input?.disabled) return;
                if (button) {
                    button.disabled = true;
                    button.setAttribute('aria-busy', 'true');
                }
                if (input) input.disabled = true;
                try {
                    return await original.apply(this, args);
                } finally {
                    if (button) {
                        button.disabled = false;
                        button.removeAttribute('aria-busy');
                    }
                    if (input) input.disabled = false;
                }
            };
            wrappedSend.__original = original;
            wrappedSend.__chatRuntimeV3 = true;
            windowRef.sendWorldChatMessage = wrappedSend;
        }

        const button = documentRef.getElementById('btn-send-chat');
        if (button) button.onclick = wrappedSend;
        const input = documentRef.getElementById('chat-input');
        if (input) {
            input.onkeydown = event => {
                if (event.key === 'Enter' && !event.repeat && !event.isComposing) {
                    event.preventDefault();
                    wrappedSend();
                }
            };
        }
        return true;
    }

    function install(documentRef, windowRef) {
        const chatApi = root.CronacheTimelineChat || windowRef?.CronacheTimelineChat;
        const engineReady = installEngine(chatApi);
        const uiReady = installUi(documentRef, windowRef || root);
        root.__cronacheChatRuntimeV3Version = PATCH_VERSION;
        return engineReady || uiReady;
    }

    function scheduleInstall() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        const attempt = () => install(document, window);
        [0, 50, 180, 500, 1200, 2500].forEach(delay => window.setTimeout(attempt, delay));
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attempt, { once: true });
    }

    if (root.CronacheTimelineChat) installEngine(root.CronacheTimelineChat);
    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        MAX_GROUP_REPLIES,
        clean,
        keyOf,
        extractTextFromPayload,
        parseStructuredResponse,
        stripModelEnvelope,
        repairThread,
        repairChats,
        mentionedCandidates,
        explicitCloseRequested,
        installEngine,
        installUi,
        install
    };
});
