(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheSecrets = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const STORAGE_KEY = 'cronache_secrets';
    const SCHEMA_VERSION = 1;
    const MAX_SECRETS = 200;

    /* ==================== STORAGE ==================== */

    function load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            var data = JSON.parse(raw);
            if (Array.isArray(data)) return data;
            return [];
        } catch (_) { return []; }
    }

    function save(secrets) {
        try {
            if (secrets.length > MAX_SECRETS) secrets = secrets.slice(-MAX_SECRETS);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(secrets));
        } catch (_) { /* quota */ }
    }

    /* ==================== UTILS ==================== */

    function uid() {
        return 'sec_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function cleanText(v, max) {
        var t = String(v == null ? '' : v).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        return Number.isFinite(max) && t.length > max ? t.slice(0, max - 1) + '…' : t;
    }

    /* ==================== SECRET CRUD ==================== */

    /**
     * Crea un nuovo segreto.
     * @param {Object} opts
     * @param {string} opts.title - Titolo del segreto
     * @param {string} opts.content - Contenuto/descrizione
     * @param {string} [opts.category] - 'crime' | 'political' | 'personal' | 'magical' | 'economic'
     * @param {Array} [opts.clues] - Indizi che portano alla scoperta
     * @param {Array} [opts.revealedTo] - Chi conosce già il segreto
     * @param {boolean} [opts.isPublic] - Se true, il segreto è di dominio pubblico
     * @param {string} [opts.relatedEntity] - Entità collegata (NPC, luogo, fazione)
     * @param {string} [opts.consequence] - Cosa succede quando viene rivelato
     * @returns {Object} Il segreto creato
     */
    function createSecret(opts) {
        var secrets = load();
        var secret = {
            id: uid(),
            schemaVersion: SCHEMA_VERSION,
            title: cleanText(opts.title, 100),
            content: cleanText(opts.content, 500),
            category: cleanText(opts.category, 30) || 'personal',
            clues: (opts.clues || []).map(function (c) {
                return {
                    id: uid(),
                    text: cleanText(c.text || c, 200),
                    found: false,
                    foundBy: null,
                    foundAt: null
                };
            }),
            revealedTo: (opts.revealedTo || []).map(function (r) { return cleanText(r, 60); }),
            isPublic: !!opts.isPublic,
            relatedEntity: cleanText(opts.relatedEntity, 60) || null,
            consequence: cleanText(opts.consequence, 300) || null,
            isResolved: false,
            createdAt: Date.now(),
            revealedAt: null
        };
        secrets.push(secret);
        save(secrets);
        return secret;
    }

    function getSecret(id) {
        return load().find(function (s) { return s.id === id; }) || null;
    }

    function listSecrets(filter) {
        var secrets = load();
        if (!filter) return secrets;

        var filtered = secrets;
        if (filter.category) {
            filtered = filtered.filter(function (s) { return s.category === filter.category; });
        }
        if (filter.isPublic != null) {
            filtered = filtered.filter(function (s) { return s.isPublic === filter.isPublic; });
        }
        if (filter.isResolved != null) {
            filtered = filtered.filter(function (s) { return s.isResolved === filter.isResolved; });
        }
        if (filter.relatedEntity) {
            var e = cleanText(filter.relatedEntity, 60).toLowerCase();
            filtered = filtered.filter(function (s) {
                return s.relatedEntity && s.relatedEntity.toLowerCase() === e;
            });
        }
        if (filter.knownBy) {
            var by = cleanText(filter.knownBy, 60).toLowerCase();
            filtered = filtered.filter(function (s) {
                return s.revealedTo.some(function (r) { return r.toLowerCase() === by; }) || s.isPublic;
            });
        }
        return filtered;
    }

    function deleteSecret(id) {
        var secrets = load();
        var idx = secrets.findIndex(function (s) { return s.id === id; });
        if (idx === -1) return false;
        secrets.splice(idx, 1);
        save(secrets);
        return true;
    }

    /* ==================== CLUES ==================== */

    function addClue(secretId, clueText) {
        var secrets = load();
        var s = secrets.find(function (x) { return x.id === secretId; });
        if (!s) return { success: false, error: 'Segreto non trovato' };
        var clue = {
            id: uid(),
            text: cleanText(clueText, 200),
            found: false,
            foundBy: null,
            foundAt: null
        };
        s.clues.push(clue);
        save(secrets);
        return { success: true, clue: clue };
    }

    /**
     * Marca un indizio come trovato da un personaggio.
     */
    function discoverClue(secretId, clueId, foundBy) {
        var secrets = load();
        var s = secrets.find(function (x) { return x.id === secretId; });
        if (!s) return { success: false, error: 'Segreto non trovato' };
        var c = s.clues.find(function (x) { return x.id === clueId; });
        if (!c) return { success: false, error: 'Indizio non trovato' };
        c.found = true;
        c.foundBy = cleanText(foundBy, 60);
        c.foundAt = Date.now();
        save(secrets);
        return { success: true, clue: c };
    }

    /* ==================== REVELATION ==================== */

    /**
     * Rivela un segreto a un personaggio.
     */
    function revealTo(secretId, characterName) {
        var secrets = load();
        var s = secrets.find(function (x) { return x.id === secretId; });
        if (!s) return { success: false, error: 'Segreto non trovato' };
        var name = cleanText(characterName, 60);
        if (!s.revealedTo.includes(name)) {
            s.revealedTo.push(name);
        }
        save(secrets);
        return { success: true, secret: s };
    }

    /**
     * Rende un segreto pubblico (conosciuto da tutti).
     */
    function makePublic(secretId) {
        var secrets = load();
        var s = secrets.find(function (x) { return x.id === secretId; });
        if (!s) return { success: false, error: 'Segreto non trovato' };
        s.isPublic = true;
        s.revealedAt = Date.now();
        save(secrets);
        return { success: true, secret: s };
    }

    /**
     * Marca un segreto come risolto/conseguenze applicate.
     */
    function resolveSecret(secretId) {
        var secrets = load();
        var s = secrets.find(function (x) { return x.id === secretId; });
        if (!s) return { success: false, error: 'Segreto non trovato' };
        s.isResolved = true;
        save(secrets);
        return { success: true, secret: s };
    }

    /* ==================== QUERIES FOR LLM ==================== */

    /**
     * Restituisce i segreti che un personaggio conosce.
     */
    function getCharacterKnowledge(characterName) {
        var name = cleanText(characterName, 60).toLowerCase();
        return load().filter(function (s) {
            if (s.isResolved) return false;
            if (s.isPublic) return true;
            return s.revealedTo.some(function (r) { return r.toLowerCase() === name; });
        });
    }

    /**
     * Restituisce i segreti NON ancora scoperti dal personaggio (per il Game Director).
     * Include solo quelli con indizi non ancora trovati.
     */
    function getUndiscoveredSecrets(characterName) {
        var name = cleanText(characterName, 60).toLowerCase();
        return load().filter(function (s) {
            if (s.isResolved) return false;
            if (s.isPublic) return false;
            if (s.revealedTo.some(function (r) { return r.toLowerCase() === name; })) return false;
            return s.clues.some(function (c) { return !c.found; });
        });
    }

    /**
     * Genera un riepilogo testuale dei segreti per il prompt del LLM.
     * @param {string} [characterName] - Se fornito, filtra per what this character knows
     * @param {boolean} [forDirector] - Se true, include segreti non scoperti (per Game Director)
     */
    function summary(characterName, forDirector) {
        var secrets;
        if (characterName) {
            var known = getCharacterKnowledge(characterName);
            var undiscovered = forDirector ? getUndiscoveredSecrets(characterName) : [];
            secrets = { known: known, undiscovered: undiscovered };
        } else {
            secrets = { all: load() };
        }

        if (characterName) {
            var lines = [];
            if (secrets.known.length) {
                lines.push('SEGRETI CONOSCIUTI DA ' + characterName + ':');
                secrets.known.forEach(function (s) {
                    lines.push('  • ' + s.title + ': ' + s.content);
                    if (s.consequence) lines.push('    Conseguenza: ' + s.consequence);
                });
            } else {
                lines.push(characterName + ' non conosce segreti.');
            }
            if (forDirector && secrets.undiscovered.length) {
                lines.push('');
                lines.push('SEGRETI NON ANCORA SCOPERTI (per generazione indizi):');
                secrets.undiscovered.forEach(function (s) {
                    var unfound = s.clues.filter(function (c) { return !c.found; });
                    lines.push('  • ' + s.title + ' (' + unfound.length + ' indizi non trovati)');
                    if (s.relatedEntity) lines.push('    Collegato a: ' + s.relatedEntity);
                });
            }
            return lines.join('\n');
        }

        // Full summary
        var all = secrets.all;
        if (!all.length) return 'Nessun segreto registrato.';
        var lines = ['SEGRETI (' + all.length + ' totali):'];
        all.forEach(function (s) {
            var status = s.isResolved ? '✓risolto' : (s.isPublic ? 'pubblico' : 'nascosto');
            var clues = s.clues.length;
            var found = s.clues.filter(function (c) { return c.found; }).length;
            lines.push('  • [' + status + '] ' + s.title + ' (' + found + '/' + clues + ' indizi) — noto a: ' + (s.revealedTo.join(', ') || 'nessuno'));
        });
        return lines.join('\n');
    }

    function clearAll() {
        save([]);
    }

    /* ==================== EXPORTS ==================== */

    return {
        SCHEMA_VERSION: SCHEMA_VERSION,
        STORAGE_KEY: STORAGE_KEY,
        MAX_SECRETS: MAX_SECRETS,
        createSecret: createSecret,
        getSecret: getSecret,
        listSecrets: listSecrets,
        deleteSecret: deleteSecret,
        addClue: addClue,
        discoverClue: discoverClue,
        revealTo: revealTo,
        makePublic: makePublic,
        resolveSecret: resolveSecret,
        getCharacterKnowledge: getCharacterKnowledge,
        getUndiscoveredSecrets: getUndiscoveredSecrets,
        summary: summary,
        clearAll: clearAll
    };
});