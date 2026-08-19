(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheStatus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const STORAGE_KEY = 'cronache_status_effects';
    const SCHEMA_VERSION = 1;

    /* ==================== STORAGE ==================== */

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const data = JSON.parse(raw);
            if (Array.isArray(data)) return data;
            return [];
        } catch (_) { return []; }
    }

    function save(effects) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(effects));
        } catch (_) { /* quota */ }
    }

    /* ==================== UTILS ==================== */

    function uid() {
        return 'se_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function cleanText(v, max) {
        var t = String(v == null ? '' : v).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        return Number.isFinite(max) && t.length > max ? t.slice(0, max - 1) + '…' : t;
    }

    /* ==================== CORE API ==================== */

    /**
     * Applica un effetto di stato a un target.
     * Se l'effetto esiste già, lo accumula (rispettando maxStacks).
     * @param {Object} opts
     * @param {string} opts.targetId - ID del bersaglio (es. nome PNG o 'player')
     * @param {string} opts.name - Nome effetto (es. 'Avvelenato', 'Bless')
     * @param {string} [opts.description] - Descrizione
     * @param {string} [opts.effectType] - 'buff' | 'debuff' | 'neutral'
     * @param {number} [opts.duration] - Turni di durata (null = permanente)
     * @param {number} [opts.stacks] - Stack iniziali (default 1)
     * @param {number} [opts.maxStacks] - Stack massimo (null = illimitati)
     * @param {Object} [opts.effects] - Modifier { ac: +2, attack: -1, ... }
     * @param {string} [opts.sourceId] - Chi ha applicato l'effetto
     * @param {string} [opts.sourceType] - 'spell' | 'ability' | 'item' | 'environment'
     * @returns {Object} L'effetto creato/aggiornato
     */
    function applyStatusEffect(opts) {
        var effects = load();
        var now = Date.now();
        var name = cleanText(opts.name, 60);
        var targetId = cleanText(opts.targetId, 60);

        // Cerca effetto esistente
        var existing = effects.find(function (e) {
            return e.targetId === targetId && e.name === name;
        });

        if (existing) {
            var addStacks = opts.stacks || 1;
            if (existing.maxStacks != null) {
                existing.stacks = Math.min(existing.stacks + addStacks, existing.maxStacks);
            } else {
                existing.stacks += addStacks;
            }
            // Refresh duration se fornita
            if (opts.duration != null) existing.duration = opts.duration;
            if (opts.effects) existing.effects = opts.effects;
            save(effects);
            return existing;
        }

        var effect = {
            id: uid(),
            schemaVersion: SCHEMA_VERSION,
            targetId: targetId,
            name: name,
            description: cleanText(opts.description, 240),
            effectType: opts.effectType || 'neutral',
            duration: opts.duration != null ? opts.duration : null,
            stacks: opts.stacks || 1,
            maxStacks: opts.maxStacks != null ? opts.maxStacks : null,
            effects: opts.effects || {},
            sourceId: cleanText(opts.sourceId, 60) || null,
            sourceType: cleanText(opts.sourceType, 30) || null,
            createdAt: now
        };

        effects.push(effect);
        save(effects);
        return effect;
    }

    function getStatusEffect(id) {
        return load().find(function (e) { return e.id === id; }) || null;
    }

    function removeStatusEffect(id) {
        var effects = load();
        var idx = effects.findIndex(function (e) { return e.id === id; });
        if (idx === -1) return false;
        effects.splice(idx, 1);
        save(effects);
        return true;
    }

    function listStatusEffects(targetId, filter) {
        var effects = load();
        var filtered = targetId
            ? effects.filter(function (e) { return e.targetId === targetId; })
            : effects;

        if (filter && filter.effectType) {
            filtered = filtered.filter(function (e) { return e.effectType === filter.effectType; });
        }
        if (filter && filter.name) {
            filtered = filtered.filter(function (e) { return e.name === filter.name; });
        }
        return filtered.sort(function (a, b) { return a.createdAt - b.createdAt; });
    }

    /**
     * Tick di durata: riduce di `amount` la durata di tutti gli effetti.
     * Rimuove quelli scaduti. Ritorna { expired, remaining }.
     * @param {number} [amount=1] - Turni da scalare
     * @returns {{ expired: Array, remaining: Array }}
     */
    function tickDurations(amount) {
        var amt = amount || 1;
        var effects = load();
        var expired = [];
        var remaining = [];

        for (var i = effects.length - 1; i >= 0; i--) {
            var e = effects[i];
            if (e.duration == null) { remaining.push(e); continue; }
            e.duration -= amt;
            if (e.duration <= 0) {
                expired.push(e);
                effects.splice(i, 1);
            } else {
                remaining.push(e);
            }
        }
        save(effects);
        return { expired: expired, remaining: remaining };
    }

    function modifyStacks(id, delta) {
        var effects = load();
        var e = effects.find(function (x) { return x.id === id; });
        if (!e) return null;
        e.stacks += delta;
        if (e.stacks <= 0) {
            effects.splice(effects.indexOf(e), 1);
            save(effects);
            return { id: id, stacks: 0, removed: true };
        }
        if (e.maxStacks != null) e.stacks = Math.min(e.stacks, e.maxStacks);
        save(effects);
        return e;
    }

    /**
     * Rimuove effetti per target, opzionalmente filtrati per tipo o nome.
     * @returns {number} Effetti rimossi
     */
    function clearEffects(targetId, filter) {
        var effects = load();
        var before = effects.length;
        effects = effects.filter(function (e) {
            if (e.targetId !== targetId) return true;
            if (filter && filter.effectType && e.effectType !== filter.effectType) return true;
            if (filter && filter.name && e.name !== filter.name) return true;
            return false; // rimuovi
        });
        save(effects);
        return before - effects.length;
    }

    /**
     * Calcola tutti i modifier attivi su un target sommando gli effetti.
     * @returns {{ targetId: string, modifiers: Object, effects: Array }}
     */
    function getEffectiveModifiers(targetId) {
        var effects = listStatusEffects(targetId);
        var modifiers = {};
        effects.forEach(function (e) {
            Object.keys(e.effects || {}).forEach(function (key) {
                var val = (e.effects[key] || 0) * e.stacks;
                modifiers[key] = (modifiers[key] || 0) + val;
            });
        });
        return { targetId: targetId, modifiers: modifiers, effects: effects };
    }

    /**
     * Genera un riepilogo testuale degli effetti attivi su un target.
     * Utile per iniettare nel prompt del LLM.
     */
    function describeActiveEffects(targetId) {
        var effects = listStatusEffects(targetId);
        if (!effects.length) return 'Nessun effetto attivo.';
        return effects.map(function (e) {
            var dur = e.duration == null ? 'permanente' : e.duration + ' turni';
            var stk = e.stacks > 1 ? ' x' + e.stacks : '';
            var mods = Object.keys(e.effects || {}).length
                ? ' [' + Object.keys(e.effects).map(function (k) { return k + (e.effects[k] >= 0 ? '+' : '') + e.effects[k]; }).join(', ') + ']'
                : '';
            return e.name + stk + ' (' + dur + ', ' + (e.effectType || 'neutral') + ')' + mods;
        }).join('; ');
    }

    function clearAll() {
        save([]);
    }

    /* ==================== EXPORTS ==================== */

    return {
        SCHEMA_VERSION: SCHEMA_VERSION,
        STORAGE_KEY: STORAGE_KEY,
        applyStatusEffect: applyStatusEffect,
        getStatusEffect: getStatusEffect,
        removeStatusEffect: removeStatusEffect,
        listStatusEffects: listStatusEffects,
        tickDurations: tickDurations,
        modifyStacks: modifyStacks,
        clearEffects: clearEffects,
        getEffectiveModifiers: getEffectiveModifiers,
        describeActiveEffects: describeActiveEffects,
        clearAll: clearAll
    };
});