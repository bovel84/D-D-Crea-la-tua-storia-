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
        if (!value || typeof value !== 'object') return {};
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
                // If the browser quota is full, progressively keep fewer checkpoints.
                while (this.memory.length > 1) {
                    this.memory.shift();
                    try {
                        this.storage.setItem(this.key, JSON.stringify(this.memory));
                        return true;
                    } catch (_retryError) {
                        // Keep pruning until one checkpoint remains.
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
