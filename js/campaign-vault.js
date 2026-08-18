(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheVault = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VAULT_KEY = 'cronache_campaign_vault_v1';
    const BACKUP_FORMAT = 'cronache-del-destino-backup';
    const BACKUP_VERSION = 1;
    const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
    const DEFAULT_CAPACITY = 3;

    function clone(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function safeArray(value, max) {
        const array = Array.isArray(value) ? value : [];
        return Number.isFinite(max) ? array.slice(0, max) : array;
    }

    function cleanLabel(value, maxLength) {
        const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
        const limit = Number.isFinite(maxLength) ? maxLength : 120;
        return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
    }

    function sanitizeSettings(value) {
        if (value === null || typeof value !== 'object') return clone(value);
        if (Array.isArray(value)) return value.map(sanitizeSettings);
        return Object.entries(value).reduce((safe, [key, entry]) => {
            if (/(?:api)?key|token|secret|password|authorization/i.test(key)) return safe;
            safe[key] = entry && typeof entry === 'object' ? sanitizeSettings(entry) : clone(entry);
            return safe;
        }, {});
    }

    function hashText(text) {
        let hash = 2166136261;
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    function buildSnapshot(game, action) {
        const source = game && typeof game === 'object' ? game : {};
        return {
            schemaVersion: 1,
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            createdAt: new Date().toISOString(),
            action: cleanLabel(action, 300),
            character: clone(source.character || null),
            story: clone(source.story || source.currentStory || null),
            storyLog: clone(safeArray(source.storyLog)),
            history: clone(safeArray(source.history)),
            time: clone(source.time || null),
            worldMemory: clone(source.worldMemory || null),
            currentLocation: cleanLabel(source.currentLocation || 'Sconosciuto', 180)
        };
    }

    function isValidSnapshot(snapshot) {
        return Boolean(
            snapshot &&
            typeof snapshot === 'object' &&
            snapshot.schemaVersion === 1 &&
            snapshot.character &&
            snapshot.story &&
            Array.isArray(snapshot.storyLog) &&
            Array.isArray(snapshot.history)
        );
    }

    function snapshotLabel(snapshot) {
        if (!isValidSnapshot(snapshot)) return 'Checkpoint non valido';
        const name = cleanLabel(snapshot.character?.name || 'Eroe', 50);
        const turn = Number(snapshot.worldMemory?.turnCount || 0);
        const action = cleanLabel(snapshot.action || 'Turno precedente', 70);
        return `${name} · turno ${turn} · ${action}`;
    }

    function createPortableBackup(data) {
        const source = data && typeof data === 'object' ? data : {};
        const payload = {
            format: BACKUP_FORMAT,
            version: BACKUP_VERSION,
            exportedAt: new Date().toISOString(),
            stories: clone(safeArray(source.stories, 200)),
            saves: clone(safeArray(source.saves, 20)),
            settings: sanitizeSettings(source.settings)
        };
        const canonical = JSON.stringify(payload);
        return JSON.stringify({
            ...payload,
            checksum: hashText(canonical)
        }, null, 2);
    }

    function parsePortableBackup(text) {
        if (typeof text !== 'string' || !text.trim()) throw new Error('Il file di backup è vuoto.');
        if (text.length > MAX_BACKUP_BYTES) throw new Error('Il backup supera il limite di 10 MB.');
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (_error) {
            throw new Error('Il file non contiene JSON valido.');
        }
        if (parsed?.format !== BACKUP_FORMAT || parsed?.version !== BACKUP_VERSION) {
            throw new Error('Formato di backup non riconosciuto.');
        }
        if (!Array.isArray(parsed.stories) || !Array.isArray(parsed.saves)) {
            throw new Error('Il backup non contiene storie e salvataggi validi.');
        }
        const { checksum, ...payload } = parsed;
        if (checksum && checksum !== hashText(JSON.stringify(payload))) {
            throw new Error('Il backup risulta incompleto o modificato.');
        }
        return {
            stories: clone(parsed.stories),
            saves: clone(parsed.saves),
            settings: sanitizeSettings(parsed.settings)
        };
    }

    class CampaignVault {
        constructor(options) {
            const config = options || {};
            this.storage = config.storage || null;
            this.key = config.key || VAULT_KEY;
            this.capacity = Math.max(1, Math.min(10, parseInt(config.capacity, 10) || DEFAULT_CAPACITY));
            this.memory = [];
            this._load();
        }

        _load() {
            if (!this.storage) return;
            try {
                const parsed = JSON.parse(this.storage.getItem(this.key) || '[]');
                this.memory = safeArray(parsed)
                    .filter(isValidSnapshot)
                    .slice(-this.capacity);
            } catch (_error) {
                this.memory = [];
            }
        }

        _persist() {
            if (!this.storage) return false;
            try {
                this.storage.setItem(this.key, JSON.stringify(this.memory));
                return true;
            } catch (_error) {
                while (this.memory.length > 1) {
                    this.memory.shift();
                    try {
                        this.storage.setItem(this.key, JSON.stringify(this.memory));
                        return true;
                    } catch (_retryError) {
                        // Continua a ridurre i checkpoint finché il salvataggio riesce.
                    }
                }
                return false;
            }
        }

        push(snapshot) {
            if (!isValidSnapshot(snapshot)) throw new Error('Checkpoint di campagna non valido.');
            this.memory.push(clone(snapshot));
            this.memory = this.memory.slice(-this.capacity);
            this._persist();
            return this.peek();
        }

        capture(game, action) {
            return this.push(buildSnapshot(game, action));
        }

        peek() {
            return this.memory.length ? clone(this.memory[this.memory.length - 1]) : null;
        }

        pop() {
            const snapshot = this.memory.pop() || null;
            this._persist();
            return clone(snapshot);
        }

        canUndo() {
            return this.memory.length > 0;
        }

        count() {
            return this.memory.length;
        }

        clear() {
            this.memory = [];
            if (this.storage) {
                try { this.storage.removeItem(this.key); } catch (_error) { /* no-op */ }
            }
        }
    }

    return {
        VAULT_KEY,
        BACKUP_FORMAT,
        BACKUP_VERSION,
        MAX_BACKUP_BYTES,
        DEFAULT_CAPACITY,
        CampaignVault,
        clone,
        sanitizeSettings,
        hashText,
        buildSnapshot,
        isValidSnapshot,
        snapshotLabel,
        createPortableBackup,
        parsePortableBackup
    };
});

// Runtime guard for the two interaction surfaces that depend most heavily on
// coordinated module versions: world chat and timeline. The HTML entry point has
// historically reused the same cache-buster while these modules evolved; a stale
// cached API can therefore make a click fail before the modal is opened.
(function installInteractionUiRecovery(root) {
    'use strict';

    if (!root || typeof document === 'undefined' || root.__cronacheInteractionUiRecoveryVersion >= 1) return;

    const BUILD_ID = '20260818-chat-timeline-fix-1';
    const CHAT_SCHEMA = 6;
    const TIMELINE_SCHEMA = 10;
    const REQUIRED_CHAT_METHODS = [
        'migrateChats', 'normalizeThread', 'createThread', 'recordMessages',
        'chooseNextSpeaker', 'chooseSpeakerRound', 'buildChatPrompt', 'closeConversation'
    ];
    const REQUIRED_TIMELINE_METHODS = [
        'normalizeEventQueue', 'createEventSeeds', 'createManualParallelSeeds',
        'scheduleEventSeeds', 'selectBatchEventSeeds', 'advanceEventQueue',
        'causalLabelFor', 'isMeaningfulEvent', 'buildBatchPrompt', 'parseBatchEventBody'
    ];

    let refreshPromise = null;
    let wrapped = false;

    function getGameState() {
        try {
            // G is a global lexical binding declared by the main classic script.
            if (typeof G !== 'undefined') return G;
        } catch (_error) {
            // The inline game script may not have run yet.
        }
        return root.G || null;
    }

    function hasMethods(api, names) {
        return Boolean(api) && names.every(name => typeof api[name] === 'function');
    }

    function needsFreshChat(api) {
        return !hasMethods(api, REQUIRED_CHAT_METHODS) || Number(api?.CHAT_SCHEMA_VERSION || 0) < CHAT_SCHEMA;
    }

    function needsFreshTimeline(api) {
        return !hasMethods(api, REQUIRED_TIMELINE_METHODS) || Number(api?.TIMELINE_SIMULATOR_SCHEMA_VERSION || 0) < TIMELINE_SCHEMA;
    }

    function reloadAndMerge(src, globalName, previousApi) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.async = true;
            script.src = `${src}?v=${BUILD_ID}`;
            script.onload = () => {
                const freshApi = root[globalName];
                if (!freshApi) {
                    reject(new Error(`${globalName} non disponibile dopo il reload`));
                    return;
                }
                // The inline script keeps const aliases to the original API object.
                // Mutating that object updates those aliases without reloading the page.
                if (previousApi && previousApi !== freshApi && typeof previousApi === 'object') {
                    Object.assign(previousApi, freshApi);
                    root[globalName] = previousApi;
                    resolve(previousApi);
                    return;
                }
                resolve(freshApi);
            };
            script.onerror = () => reject(new Error(`Impossibile ricaricare ${src}`));
            document.head.appendChild(script);
        });
    }

    function ensureFreshInteractionApis() {
        if (refreshPromise) return refreshPromise;
        const chatApi = root.CronacheTimelineChat;
        const timelineApi = root.CronacheTimelineSimulator;
        const jobs = [];
        if (needsFreshChat(chatApi)) {
            jobs.push(reloadAndMerge('js/timeline-chat.js', 'CronacheTimelineChat', chatApi));
        }
        if (needsFreshTimeline(timelineApi)) {
            jobs.push(reloadAndMerge('js/timeline-simulator.js', 'CronacheTimelineSimulator', timelineApi));
        }
        refreshPromise = Promise.all(jobs).catch(error => {
            console.error('[InteractionUI] Aggiornamento moduli fallito:', error);
            return [];
        });
        return refreshPromise;
    }

    function normalizeChatState() {
        const state = getGameState();
        const api = root.CronacheTimelineChat;
        if (!state?.worldMemory || typeof api?.migrateChats !== 'function') return;
        state.worldMemory.chats = api.migrateChats(state.worldMemory.chats, {
            events: Array.isArray(state.worldMemory.events) ? state.worldMemory.events : [],
            turn: Math.max(0, Number(state.worldMemory.turnCount) || 0),
            protagonistName: state.character?.name || '',
            occurredAt: ''
        });
    }

    function normalizeTimelineState() {
        const state = getGameState();
        const api = root.CronacheTimelineSimulator;
        if (!state?.worldMemory) return;
        const memory = state.worldMemory;
        [
            'events', 'pendingTimelineChoices', 'pendingStrategicActions',
            'pendingParallelDecisions', 'strategicActionHistory', 'playerDecisions'
        ].forEach(field => {
            if (!Array.isArray(memory[field])) memory[field] = [];
        });
        if (typeof api?.normalizeEventQueue === 'function') {
            memory.pendingTimelineEvents = api.normalizeEventQueue(memory.pendingTimelineEvents, {
                turn: Math.max(0, Number(memory.turnCount) || 0)
            });
        } else if (!Array.isArray(memory.pendingTimelineEvents)) {
            memory.pendingTimelineEvents = [];
        }
    }

    function forceOpenModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.add('active');
    }

    function showRecoveryMessage(containerId, message) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = `<div class="timeline-empty">${String(message || 'Interfaccia ripristinata. Riprova il comando.')}</div>`;
    }

    function wrapUiFunctions() {
        if (wrapped) return true;
        const originalOpenChats = typeof root.openWorldChats === 'function' ? root.openWorldChats : null;
        const originalOpenTimeline = typeof root.openTimeline === 'function' ? root.openTimeline : null;
        if (!originalOpenChats || !originalOpenTimeline) return false;

        root.openWorldChats = function recoveredOpenWorldChats(...args) {
            normalizeChatState();
            try {
                return originalOpenChats.apply(this, args);
            } catch (error) {
                console.error('[InteractionUI] Apertura chat recuperata dopo errore:', error);
                forceOpenModal('modal-world-chat');
                showRecoveryMessage('chat-messages', 'La chat salvata è stata riallineata. Chiudi e riapri la chat oppure convoca una nuova riunione.');
                normalizeChatState();
                return null;
            }
        };

        root.openTimeline = function recoveredOpenTimeline(...args) {
            normalizeTimelineState();
            try {
                return originalOpenTimeline.apply(this, args);
            } catch (error) {
                console.error('[InteractionUI] Apertura timeline recuperata dopo errore:', error);
                forceOpenModal('modal-timeline');
                showRecoveryMessage('timeline-events-list', 'La timeline è stata riallineata. Puoi riprovare ad avanzare il turno.');
                const button = document.getElementById('btn-simulate-timeline');
                if (button) button.disabled = false;
                return null;
            }
        };

        const chatButton = document.getElementById('btn-world-chats');
        if (chatButton) chatButton.onclick = () => root.openWorldChats();
        const timelineButton = document.getElementById('btn-advance-world');
        if (timelineButton) timelineButton.onclick = () => root.openTimeline();

        wrapped = true;
        root.__cronacheInteractionUiWrapped = true;
        return true;
    }

    async function install() {
        await ensureFreshInteractionApis();
        normalizeChatState();
        normalizeTimelineState();
        if (!wrapUiFunctions()) {
            setTimeout(wrapUiFunctions, 50);
            setTimeout(wrapUiFunctions, 250);
        }
    }

    root.__cronacheInteractionUiRecoveryVersion = 1;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(install, 0), { once: true });
    } else {
        setTimeout(install, 0);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
