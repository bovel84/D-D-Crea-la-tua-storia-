(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheMemory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const MEMORY_SCHEMA_VERSION = 2;
    const DEFAULT_SHORT_TERM_MESSAGES = 10;
    const DEFAULT_RETRIEVAL_LIMIT = 5;
    const DEFAULT_COMPRESSION_THRESHOLD = 6000;
    const DEFAULT_MEDIUM_TERM_TOKENS = 500;

    const ARRAY_FIELDS = [
        'npcs', 'locations', 'factions', 'quests', 'events', 'playerDecisions',
        'narrativeGoals', 'revealedSecrets', 'acquiredItems', 'acquiredAbilities',
        'properties', 'family', 'employees'
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
        if (type === 'eventi') return entry.summary || entry.name || `Evento turno ${entry.turn || '?'}`;
        if (type === 'decisioni') return entry.summary || entry.description || 'Decisione del giocatore';
        if (type === 'segreti') return entry.name || entry.summary || entry.secret || 'Segreto svelato';
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
            ['quest', state.quests]
        ];

        return groups.flatMap(([type, entries]) => entries.map((entry, index) => ({
            type,
            id: entry.id ?? `${type}-${index}`,
            title: entryTitle(type, entry),
            text: entryText(entry),
            turn: Number(entry.turn ?? entry.lastSeen ?? entry.discovered ?? entry.createdAtTurn ?? 0) || 0,
            importance: entry.importance || (entry.status === 'active' ? 'high' : 'normal'),
            raw: entry
        })));
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

        compress(history, memory) {
            return compressHistory(history, memory, {
                thresholdTokens: this.options.compressionThreshold,
                keepMessages: this.options.shortTermMessages,
                maxSummaryTokens: this.options.mediumTermTokens
            });
        }

        retrieve(query, memory, limit) {
            return retrieveRelevant(query, memory, limit ?? this.options.retrievalLimit);
        }

        buildContext(query, history, memory) {
            const state = migrateMemory(memory);
            const shortTerm = this.getShortTerm(history);
            const retrieved = this.retrieve(query, state, this.options.retrievalLimit);
            return {
                shortTerm,
                mediumTerm: truncateToTokens(state.mediumTerm.summary || state.sceneSummary || '', this.options.mediumTermTokens),
                retrieved,
                prompt: [
                    'MEMORIA A MEDIO TERMINE (scena/capitolo):',
                    state.mediumTerm.summary || state.sceneSummary || 'Nessun riassunto consolidato.',
                    '',
                    `RETRIEVAL A LUNGO TERMINE (top ${this.options.retrievalLimit}):`,
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
        formatRetrieved
    };
});
