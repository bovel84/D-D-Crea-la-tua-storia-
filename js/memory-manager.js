(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheMemory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const MEMORY_SCHEMA_VERSION = 9;
    const DEFAULT_SHORT_TERM_MESSAGES = 10;
    const DEFAULT_RETRIEVAL_LIMIT = 5;
    const DEFAULT_COMPRESSION_THRESHOLD = 6000;
    const DEFAULT_MEDIUM_TERM_TOKENS = 500;

    const ARRAY_FIELDS = [
        'npcs', 'locations', 'factions', 'quests', 'events', 'playerDecisions',
        'narrativeGoals', 'revealedSecrets', 'acquiredItems', 'acquiredAbilities',
        'properties', 'family', 'employees', 'chats', 'agreements', 'pendingTimelineChoices', 'pendingTimelineEvents',
        'pendingStrategicActions', 'strategicActionHistory', 'continuityLog'
    ];

    const STOP_WORDS = new Set([
        'a', 'ad', 'al', 'alla', 'alle', 'anche', 'che', 'chi', 'con', 'da', 'dal',
        'dalla', 'del', 'della', 'delle', 'di', 'e', 'ed', 'gli', 'ha', 'hai', 'ho',
        'i', 'il', 'in', 'io', 'la', 'le', 'lo', 'ma', 'mi', 'nel', 'nella', 'non',
        'o', 'per', 'piu', 'se', 'si', 'sono', 'su', 'sul', 'tra', 'tu', 'un', 'una'
    ]);

    function clone(value) {
        if (value == null) return value;
        return JSON.parse(JSON.stringify(value));
    }

    function asArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function normalizeText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9\s_-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function tokenize(value) {
        return normalizeText(value)
            .split(' ')
            .filter(token => token.length > 1 && !STOP_WORDS.has(token));
    }

    // Stima conservativa e indipendente dal tokenizer del provider.
    function estimateTokens(value) {
        const text = typeof value === 'string' ? value : JSON.stringify(value || '');
        if (!text) return 0;
        const words = text.trim().split(/\s+/).filter(Boolean).length;
        return Math.max(1, Math.ceil(Math.max(text.length / 4, words * 1.3)));
    }

    function truncateToTokens(value, maxTokens) {
        const text = String(value || '').trim();
        if (!text || estimateTokens(text) <= maxTokens) return text;

        let low = 0;
        let high = text.length;
        while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            if (estimateTokens(text.slice(0, mid)) <= maxTokens) low = mid;
            else high = mid - 1;
        }

        const cut = text.slice(0, Math.max(0, low - 1));
        const safeBoundary = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '), cut.lastIndexOf('\n'));
        const result = safeBoundary > cut.length * 0.55 ? cut.slice(0, safeBoundary + 1) : cut;
        return `${result.trim()}…`;
    }

    function createDefaultMemory() {
        return {
            memorySchemaVersion: MEMORY_SCHEMA_VERSION,
            npcs: [],
            locations: [],
            factions: [],
            quests: [],
            events: [],
            playerDecisions: [],
            narrativeGoals: [],
            revealedSecrets: [],
            acquiredItems: [],
            acquiredAbilities: [],
            properties: [],
            family: [],
            employees: [],
            chats: [],
            agreements: [],
            pendingTimelineChoices: [],
            pendingTimelineEvents: [],
            pendingStrategicActions: [],
            strategicActionHistory: [],
            continuityLog: [],
            lastTimelineEventId: '',
            world: {},
            storySummary: '',
            sceneSummary: '',
            mediumTerm: {
                summary: '',
                chapter: 1,
                updatedAtTurn: 0,
                compressedMessages: 0
            },
            compression: {
                thresholdTokens: DEFAULT_COMPRESSION_THRESHOLD,
                lastCompressionTurn: 0,
                totalCompressedMessages: 0
            },
            lastSummaryTurn: 0,
            turnCount: 0
        };
    }

    function migrateMemory(source) {
        const defaults = createDefaultMemory();
        const legacy = source && typeof source === 'object' ? clone(source) : {};
        const migrated = { ...defaults, ...legacy };

        ARRAY_FIELDS.forEach(field => {
            migrated[field] = asArray(legacy[field]);
        });

        // Migrazione additiva: i campi legacy restano invariati e vengono solo completati.
        migrated.mediumTerm = {
            ...defaults.mediumTerm,
            ...(legacy.mediumTerm || {}),
            summary: legacy.mediumTerm?.summary || legacy.sceneSummary || ''
        };
        migrated.sceneSummary = legacy.sceneSummary || migrated.mediumTerm.summary || '';
        migrated.compression = {
            ...defaults.compression,
            ...(legacy.compression || {})
        };
        migrated.memorySchemaVersion = MEMORY_SCHEMA_VERSION;
        migrated.turnCount = Number.isFinite(Number(migrated.turnCount)) ? Number(migrated.turnCount) : 0;
        migrated.lastSummaryTurn = Number.isFinite(Number(migrated.lastSummaryTurn)) ? Number(migrated.lastSummaryTurn) : 0;

        return migrated;
    }

    function sentenceCandidates(messages) {
        const candidates = [];
        asArray(messages).forEach((message, messageIndex) => {
            const content = String(message?.content || '')
                .replace(/\[ANALISI\][\s\S]*?\[\/ANALISI\]/gi, '')
                .replace(/\[[A-ZÀ-Ü_]+\s*:[^\]]+\]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (!content) return;

            const sentences = content.match(/[^.!?]+[.!?]?/g) || [content];
            sentences.forEach((raw, sentenceIndex) => {
                const text = raw.trim();
                if (text.length < 12) return;
                let score = message?.role === 'user' ? 3 : 1;
                if (/decid|scel|promess|rifiut|accett|uccis|salvat|tradit|alleat|scopert|segreto|quest|mission|obiettiv|morto|scompar|luogo|arriv|partit/i.test(text)) score += 6;
                if (/[A-ZÀ-Ü][a-zà-ü]{2,}/.test(text)) score += 2;
                score += Math.min(3, messageIndex / Math.max(1, messages.length));
                candidates.push({ text, score, messageIndex, sentenceIndex });
            });
        });
        return candidates;
    }

    function summarizeMessages(messages, previousSummary, maxTokens) {
        const candidates = sentenceCandidates(messages);
        const selected = [];
        const seen = new Set();

        candidates
            .sort((a, b) => b.score - a.score || b.messageIndex - a.messageIndex)
            .forEach(candidate => {
                const key = normalizeText(candidate.text).slice(0, 90);
                if (!key || seen.has(key)) return;
                seen.add(key);
                selected.push(candidate);
            });

        const chronological = selected
            .slice(0, 18)
            .sort((a, b) => a.messageIndex - b.messageIndex || a.sentenceIndex - b.sentenceIndex)
            .map(item => item.text);

        const parts = [];
        if (previousSummary) parts.push(`Contesto già consolidato: ${previousSummary}`);
        if (chronological.length) parts.push(`Sviluppi della scena: ${chronological.join(' ')}`);
        if (!parts.length) parts.push('Nessuno sviluppo narrativo significativo da consolidare.');
        return truncateToTokens(parts.join('\n'), maxTokens);
    }

    function extractPlayerDecisions(messages, memory) {
        const target = memory.playerDecisions;
        asArray(messages).forEach(message => {
            if (message?.role !== 'user') return;
            const content = String(message.content || '').trim();
            if (!content || content.length < 8) return;
            const meaningful = /decid|scel|voglio|intendo|accett|rifiut|attacc|risparmi|promett|parto|torno|cerco|chiedo/i.test(content);
            if (!meaningful) return;
            const normalized = normalizeText(content);
            if (target.some(item => normalizeText(item.summary || item.description) === normalized)) return;
            target.push({
                id: `decision-${Date.now()}-${target.length}`,
                summary: truncateToTokens(content, 80),
                turn: memory.turnCount,
                importance: 'normal',
                createdAt: new Date().toISOString()
            });
        });
        if (target.length > 100) memory.playerDecisions = target.slice(-100);
    }

    function compressHistory(history, memory, options) {
        const config = {
            thresholdTokens: DEFAULT_COMPRESSION_THRESHOLD,
            keepMessages: DEFAULT_SHORT_TERM_MESSAGES,
            maxSummaryTokens: DEFAULT_MEDIUM_TERM_TOKENS,
            ...(options || {})
        };
        const safeHistory = asArray(history).filter(message => message && typeof message.content === 'string');
        const state = migrateMemory(memory);
        const totalTokens = safeHistory.reduce((sum, message) => sum + estimateTokens(message.content) + 4, 0);

        if (totalTokens <= config.thresholdTokens || safeHistory.length <= config.keepMessages) {
            return { history: safeHistory, memory: state, compressed: false, totalTokens };
        }

        const splitAt = Math.max(0, safeHistory.length - config.keepMessages);
        const olderMessages = safeHistory.slice(0, splitAt);
        const recentMessages = safeHistory.slice(splitAt);
        const previous = state.mediumTerm.summary || state.sceneSummary || '';
        const summary = summarizeMessages(olderMessages, previous, config.maxSummaryTokens);

        extractPlayerDecisions(olderMessages, state);
        state.sceneSummary = summary;
        state.mediumTerm = {
            ...state.mediumTerm,
            summary,
            updatedAtTurn: state.turnCount,
            compressedMessages: (state.mediumTerm.compressedMessages || 0) + olderMessages.length
        };
        state.compression = {
            ...state.compression,
            thresholdTokens: config.thresholdTokens,
            lastCompressionTurn: state.turnCount,
            totalCompressedMessages: (state.compression.totalCompressedMessages || 0) + olderMessages.length
        };

        return {
            history: recentMessages,
            memory: state,
            compressed: true,
            compressedMessages: olderMessages.length,
            totalTokens,
            summaryTokens: estimateTokens(summary)
        };
    }

    function entryTitle(type, entry) {
        if (type === 'eventi') return entry.title || entry.summary || entry.name || `Evento turno ${entry.turn || '?'}`;
        if (type === 'decisioni') return entry.summary || entry.description || 'Decisione del giocatore';
        if (type === 'segreti') return entry.name || entry.summary || entry.secret || 'Segreto svelato';
        if (type === 'conversazioni') return entry.title || entry.eventTitle || 'Conversazione';
        if (type === 'accordi') return entry.title || entry.terms || 'Accordo';
        if (type === 'continuità') return entry.title || entry.summary || entry.action || 'Sviluppo recente';
        return entry.name || entry.title || entry.summary || entry.role || 'Elemento di memoria';
    }

    function entryText(entry) {
        const ignored = new Set(['id', 'stats', 'inventory', 'interactions']);
        return Object.entries(entry || {})
            .filter(([key, value]) => !ignored.has(key) && value != null && typeof value !== 'object')
            .map(([key, value]) => `${key}: ${value}`)
            .join(' | ');
    }

    function flattenLongTerm(memory) {
        const state = migrateMemory(memory);
        const groups = [
            ['personaggi', state.npcs],
            ['luoghi', state.locations],
            ['fazioni', state.factions],
            ['eventi', state.events],
            ['decisioni', state.playerDecisions],
            ['obiettivi', state.narrativeGoals],
            ['segreti', state.revealedSecrets],
            ['quest', state.quests],
            ['conversazioni', state.chats],
            ['accordi', state.agreements],
            ['continuità', state.continuityLog]
        ];

        return groups.flatMap(([type, entries]) => entries.map((entry, index) => ({
            type,
            id: entry.id ?? `${type}-${index}`,
            title: entryTitle(type, entry),
            text: entryText(entry),
            turn: Number(entry.turn ?? entry.lastSeen ?? entry.discovered ?? entry.createdAtTurn ?? 0) || 0,
            importance: entry.importance || (entry.status === 'active' ? 'high' : 'normal'),
            raw: entry
        }))).filter(item =>
            !isPlaceholderEntity(item.title) &&
            !asArray(item.raw?.actors).some(isPlaceholderEntity) &&
            !/deterministic-fallback|timeline-recovery/i.test(item.raw?.source || '')
        );
    }

    function scoreEntry(query, queryTokens, entry, currentTurn) {
        const title = normalizeText(entry.title);
        const body = normalizeText(entry.text);
        let score = 0;

        if (query && title && query.includes(title)) score += 14;
        if (query && title && title.includes(query)) score += 9;

        queryTokens.forEach(token => {
            if (title.split(' ').includes(token)) score += 5;
            else if (title.includes(token)) score += 3;
            const matches = body.match(new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'));
            if (matches) score += Math.min(6, matches.length * 2);
        });

        if (entry.importance === 'critical') score += 5;
        else if (entry.importance === 'high') score += 3;
        if (entry.raw?.status === 'active') score += 2;
        if (entry.type === 'segreti' && queryTokens.some(token => /segre|mister|verit|indizi/.test(token))) score += 4;

        const age = Math.max(0, currentTurn - entry.turn);
        score += entry.turn ? Math.max(0, 2 - age * 0.04) : 0.1;
        return score;
    }

    function retrieveRelevant(queryValue, memory, limit) {
        const query = normalizeText(queryValue);
        const queryTokens = [...new Set(tokenize(query))];
        const state = migrateMemory(memory);
        const entries = flattenLongTerm(state);
        const maxResults = Number.isFinite(Number(limit)) ? Number(limit) : DEFAULT_RETRIEVAL_LIMIT;

        return entries
            .map(entry => ({ ...entry, score: scoreEntry(query, queryTokens, entry, state.turnCount) }))
            .sort((a, b) => b.score - a.score || b.turn - a.turn || String(a.title).localeCompare(String(b.title)))
            .slice(0, Math.max(0, maxResults));
    }

    function formatRetrieved(items) {
        if (!items?.length) return 'Nessun ricordo a lungo termine pertinente.';
        return items.map((item, index) => {
            const detail = item.text && normalizeText(item.text) !== normalizeText(item.title)
                ? ` — ${truncateToTokens(item.text, 90)}`
                : '';
            return `${index + 1}. [${item.type}] ${item.title}${detail}`;
        }).join('\n');
    }

    function cleanText(value, maxLength = 900) {
        return String(value == null ? '' : value)
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, maxLength);
    }

    function isPlaceholderEntity(value) {
        const key = normalizeText(value);
        return /^(?:(?:il|la|lo|i|gli|le) )?(?:autorita|opposizione|comunita|custode|voce dell opposizione|guida locale|mediatore indipendente)(?:\b| di )/.test(key) ||
            /^(?:equilibrio in cambiamento|prossimo sviluppo del mondo)$/.test(key) ||
            /(?:storico|historical)\s*\/\s*(?:business|economia)/.test(key);
    }

    function containsPlaceholderNarrative(value) {
        return /\b(?:Equilibrio in cambiamento|Prossimo sviluppo del mondo|Definire il prossimo passo)\b/i.test(String(value || '')) ||
            /(?:Storico|Historical)\s*\/\s*(?:Business|Economia)/i.test(String(value || ''));
    }

    function extractYears(value) {
        const matches = String(value || '').match(/\b(?:1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b/g) || [];
        return [...new Set(matches.map(Number).filter(year => year >= 1000 && year <= 2199))];
    }

    function inferCanonicalYear(memory, story = {}) {
        const state = migrateMemory(memory);
        const evidence = new Map();
        const add = (value, weight, source) => {
            extractYears(value).forEach(year => {
                const current = evidence.get(year) || { year, score: 0, sources: [] };
                current.score += weight;
                current.sources.push(source);
                evidence.set(year, current);
            });
        };
        const explicitStartYear = Number(story?.startTime?.year);
        if (Number.isFinite(explicitStartYear)) add(explicitStartYear, 20, 'story.startTime');
        add(story?.setting, 6, 'story.setting');
        add(story?.desc, 4, 'story.desc');
        add(story?.prologue, 4, 'story.prologue');
        add(state.world?.historicalContext?.date, state.world?.provisional ? 2 : 8, 'world.historicalContext.date');
        add(state.world?.historicalContext?.baseline, state.world?.provisional ? 1 : 3, 'world.historicalContext.baseline');
        asArray(state.events)
            .filter(item => item && item.source !== 'time-engine' && !containsPlaceholderNarrative(`${item.title || ''} ${item.summary || ''}`))
            .filter(item => !asArray(item.actors).some(isPlaceholderEntity))
            .slice(-12)
            .forEach((event, index, list) => add(event.occurredAt || event.date, 5 + Math.round((index + 1) / Math.max(1, list.length)), `event:${event.id || event.title || index}`));
        asArray(state.chats).filter(item => item && item.status !== 'closed').slice(-6)
            .forEach((thread, index) => add(thread.occurredAt, 2, `chat:${thread.id || index}`));
        const ranked = [...evidence.values()].sort((left, right) => right.score - left.score || right.year - left.year);
        const winner = ranked[0];
        const runnerUp = ranked[1];
        if (!winner || winner.score < 5) return null;
        if (runnerUp && winner.score - runnerUp.score < 2 && explicitStartYear !== winner.year) return null;
        return winner;
    }

    function uniqueNames(values, limit = 20) {
        const seen = new Set();
        return asArray(values).map(value => cleanText(value, 120)).filter(value => {
            const key = normalizeText(value);
            if (!key || seen.has(key) || isPlaceholderEntity(value)) return false;
            seen.add(key);
            return true;
        }).slice(0, limit);
    }

    function recordContinuity(memory, entry, limit = 48) {
        const state = memory && typeof memory === 'object' ? memory : createDefaultMemory();
        state.continuityLog = asArray(state.continuityLog);
        const input = entry && typeof entry === 'object' ? entry : { summary: entry };
        const item = {
            type: cleanText(input.type || 'turno', 40),
            title: cleanText(input.title || input.action, 180),
            summary: cleanText(input.summary || input.result || input.response, 1400),
            action: cleanText(input.action, 700),
            actors: uniqueNames(input.actors, 10),
            date: cleanText(input.date || input.occurredAt, 120),
            location: cleanText(input.location, 120),
            turn: Math.max(0, Number(input.turn ?? state.turnCount) || 0),
            source: cleanText(input.source || 'game', 60)
        };
        if (!item.title && !item.summary && !item.action) return state;
        if (containsPlaceholderNarrative(`${item.title} ${item.summary} ${item.action}`) || item.actors.some(isPlaceholderEntity)) return state;
        const fingerprint = normalizeText(`${item.type}|${item.title}|${item.summary}|${item.action}`).slice(0, 600);
        const previous = state.continuityLog[state.continuityLog.length - 1];
        const previousFingerprint = normalizeText(`${previous?.type || ''}|${previous?.title || ''}|${previous?.summary || ''}|${previous?.action || ''}`).slice(0, 600);
        if (fingerprint && fingerprint !== previousFingerprint) state.continuityLog.push(item);
        state.continuityLog = state.continuityLog.slice(-Math.max(8, Number(limit) || 48));
        return state;
    }

    function chatLine(thread) {
        const title = cleanText(thread?.title || thread?.eventTitle || 'Conversazione', 140);
        const participants = uniqueNames(thread?.participants, 10);
        const messages = asArray(thread?.messages).slice(-6).map(message =>
            `${cleanText(message?.speaker || 'Interlocutore', 100)}: ${cleanText(message?.text, 500)}`
        ).filter(line => !/:\s*$/.test(line));
        const resolution = cleanText(thread?.resolution?.summary || thread?.resolution?.status, 300);
        return `- ${title}${participants.length ? ` (${participants.join(', ')})` : ''}${resolution ? ` — stato: ${resolution}` : ''}` +
            (messages.length ? `\n  ${messages.join('\n  ')}` : '');
    }

    function eventLine(event) {
        const title = cleanText(event?.title || event?.summary || 'Evento', 160);
        const when = cleanText(event?.occurredAt || event?.date, 120);
        const actors = uniqueNames(event?.actors, 10);
        const summary = cleanText(event?.summary || event?.description, 900);
        const consequence = cleanText(event?.consequence, 600);
        return `- ${when ? `${when} — ` : ''}${title}${actors.length ? ` [${actors.join(', ')}]` : ''}: ${summary}` +
            (consequence ? ` Conseguenza persistente: ${consequence}` : '');
    }

    function buildContinuityContext(memory, options = {}) {
        const state = migrateMemory(memory);
        const story = options.story || {};
        const maxTokens = Math.max(500, Number(options.maxTokens) || 2200);
        const namedActors = uniqueNames([
            ...asArray(state.npcs).filter(item => !/dead|morto/i.test(item?.status || '')).map(item => item?.name),
            ...asArray(state.factions).filter(item => !/resolved|dead|inactive/i.test(item?.status || '')).map(item => item?.name),
            ...asArray(state.events).slice(-12).flatMap(item => asArray(item?.actors)),
            ...asArray(state.chats).filter(item => item?.status !== 'closed').flatMap(item => asArray(item?.participants))
        ], 30);
        const recentEvents = asArray(state.events)
            .filter(item => item && item.source !== 'time-engine' && cleanText(item.summary, 20))
            .filter(item => !isPlaceholderEntity(item.title) && !asArray(item.actors).some(isPlaceholderEntity))
            .slice(-12);
        const activeQuests = [...asArray(state.quests), ...asArray(state.narrativeGoals)]
            .filter(item => item && !/completed|resolved|failed|closed|conclus|fallit/i.test(item.status || ''))
            .filter(item => !isPlaceholderEntity(item.name || item.title))
            .slice(-10);
        const activeChats = asArray(state.chats).filter(item => item && item.status !== 'closed').slice(-6);
        const decisions = asArray(state.playerDecisions).slice(-10);
        const agreements = asArray(state.agreements)
            .filter(item => item && !/expired|terminated|closed|broken|fulfilled/i.test(item.status || ''))
            .slice(-8);
        const log = asArray(state.continuityLog).slice(-12);
        const sections = [
            'CANONE PERSISTENTE DELLA CAMPAGNA — questi fatti hanno precedenza su etichette generiche o deduzioni nuove:',
            `Campagna: ${cleanText(story.title, 160) || cleanText(state.world?.name, 160) || 'titolo non registrato'}.`,
            `Premessa: ${cleanText(story.desc, 900) || cleanText(state.world?.premise, 900) || 'non registrata'}.`,
            `Momento corrente: ${cleanText(options.currentDate, 140) || 'data non specificata'}; luogo: ${cleanText(options.location, 140) || 'non specificato'}; protagonista: ${cleanText(options.protagonistName, 120) || 'protagonista'}.`,
            namedActors.length ? `Nomi canonici disponibili: ${namedActors.join(', ')}.` : 'Nessun nome canonico affidabile ancora registrato.',
            recentEvents.length ? `\nULTIMI EVENTI VERI, IN ORDINE CRONOLOGICO:\n${recentEvents.map(eventLine).join('\n')}` : '',
            activeChats.length ? `\nCONVERSAZIONI ANCORA ATTIVE:\n${activeChats.map(chatLine).join('\n')}` : '',
            decisions.length ? `\nDECISIONI RECENTI DEL GIOCATORE:\n${decisions.map(item => `- ${cleanText(item?.summary || item?.description || item?.action, 600)}`).filter(line => line !== '- ').join('\n')}` : '',
            activeQuests.length ? `\nTRAME E OBIETTIVI APERTI:\n${activeQuests.map(item => `- ${cleanText(item?.name || item?.title, 160)}: ${cleanText(item?.description || item?.objective || item?.summary, 600)}`).join('\n')}` : '',
            agreements.length ? `\nACCORDI ATTIVI:\n${agreements.map(item => `- ${cleanText(item?.title, 160)} tra ${uniqueNames(item?.parties, 10).join(', ')}: ${cleanText(item?.terms, 600)} [${cleanText(item?.status, 50)}]`).join('\n')}` : '',
            log.length ? `\nSVILUPPI CONSOLIDATI PIÙ RECENTI:\n${log.map(item => `- ${cleanText(item?.date, 100) ? `${cleanText(item.date, 100)} — ` : ''}${cleanText(item?.title || item?.action, 180)}: ${cleanText(item?.summary, 700)}`).join('\n')}` : '',
            state.sceneSummary && !containsPlaceholderNarrative(state.sceneSummary) ? `\nSTATO DELLA SCENA CONSOLIDATO:\n${cleanText(state.sceneSummary, 2200)}` : '',
            state.storySummary && !containsPlaceholderNarrative(state.storySummary) ? `\nRIASSUNTO DI LUNGO PERIODO:\n${cleanText(state.storySummary, 2600)}` : '',
            '\nREGOLA DI CONTINUITÀ: non sostituire mai questi nomi e fatti con categorie come Autorità, Opposizione, Comunità, “Storico / Business” o “Equilibrio in cambiamento”. Se manca un dato, non inventarlo: continua dal fatto concreto più recente o segnala che serve una nuova informazione.'
        ].filter(Boolean);
        const prompt = truncateToTokens(sections.join('\n'), maxTokens);
        return { prompt, namedActors, recentEvents, activeChats, decisions, activeQuests, agreements };
    }

    class AdvancedMemoryManager {
        constructor(options) {
            this.options = {
                shortTermMessages: DEFAULT_SHORT_TERM_MESSAGES,
                retrievalLimit: DEFAULT_RETRIEVAL_LIMIT,
                compressionThreshold: DEFAULT_COMPRESSION_THRESHOLD,
                mediumTermTokens: DEFAULT_MEDIUM_TERM_TOKENS,
                ...(options || {})
            };
        }

        createDefault() {
            return createDefaultMemory();
        }

        migrate(memory) {
            return migrateMemory(memory);
        }

        getShortTerm(history) {
            return asArray(history).slice(-this.options.shortTermMessages);
        }

        compress(history, memory, options = {}) {
            return compressHistory(history, memory, {
                thresholdTokens: options.compressionThreshold ?? this.options.compressionThreshold,
                keepMessages: options.shortTermMessages ?? this.options.shortTermMessages,
                maxSummaryTokens: options.mediumTermTokens ?? this.options.mediumTermTokens
            });
        }

        retrieve(query, memory, limit) {
            return retrieveRelevant(query, memory, limit ?? this.options.retrievalLimit);
        }

        buildContext(query, history, memory, options = {}) {
            const state = migrateMemory(memory);
            const shortTermMessages = Math.max(1, Number(options.shortTermMessages) || this.options.shortTermMessages);
            const retrievalLimit = Math.max(1, Number(options.retrievalLimit) || this.options.retrievalLimit);
            const mediumTermTokens = Math.max(100, Number(options.mediumTermTokens) || this.options.mediumTermTokens);
            const continuityTokens = Math.max(500, Number(options.continuityTokens) || Math.max(1200, mediumTermTokens));
            const shortTerm = asArray(history).slice(-shortTermMessages);
            const retrieved = this.retrieve(query, state, retrievalLimit);
            const continuity = buildContinuityContext(state, {
                ...(options.continuity || {}),
                maxTokens: continuityTokens
            });
            return {
                shortTerm,
                mediumTerm: truncateToTokens(state.mediumTerm.summary || state.sceneSummary || '', mediumTermTokens),
                retrieved,
                continuity,
                prompt: [
                    continuity.prompt,
                    '',
                    'MEMORIA A MEDIO TERMINE (scena/capitolo):',
                    truncateToTokens(state.mediumTerm.summary || state.sceneSummary || 'Nessun riassunto consolidato.', mediumTermTokens),
                    '',
                    `RETRIEVAL A LUNGO TERMINE (top ${retrievalLimit}):`,
                    formatRetrieved(retrieved)
                ].join('\n')
            };
        }
    }

    return {
        MEMORY_SCHEMA_VERSION,
        DEFAULT_SHORT_TERM_MESSAGES,
        DEFAULT_RETRIEVAL_LIMIT,
        DEFAULT_COMPRESSION_THRESHOLD,
        DEFAULT_MEDIUM_TERM_TOKENS,
        AdvancedMemoryManager,
        createDefaultMemory,
        migrateMemory,
        estimateTokens,
        truncateToTokens,
        compressHistory,
        retrieveRelevant,
        flattenLongTerm,
        formatRetrieved,
        isPlaceholderEntity,
        recordContinuity,
        buildContinuityContext,
        inferCanonicalYear
    };
});
