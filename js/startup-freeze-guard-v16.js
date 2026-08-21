(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheStartupFreezeGuardV16 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 2;
    const MIN_NARRATION = 40;
    const RELEASE_DELAY_MS = 1400;
    let startupPromise = null;
    let lastNewGameAt = 0;
    let observer = null;
    let releaseTimer = null;

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 20000) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);

    function getGameState() {
        try {
            if (typeof G !== 'undefined') return G;
        } catch (_error) { }
        return root.G || null;
    }

    // Più moduli runtime avvolgono le stesse funzioni (valuta, tempo, startup).
    // I loro installer vengono ritentati dopo il caricamento. Controllare soltanto
    // il wrapper esterno faceva quindi creare più StartupFreezeGuard annidati.
    // Nel caso startNewGame il wrapper esterno impostava lastNewGameAt e quello
    // interno interpretava la STESSA chiamata come un doppio tap, fermando l'avvio.
    function chainHasMarker(fn, marker, seen = new Set()) {
        if (typeof fn !== 'function' || seen.has(fn)) return false;
        if (fn[marker]) return true;
        seen.add(fn);
        for (const name of Object.keys(fn)) {
            if (!/Original$/i.test(name)) continue;
            const inner = fn[name];
            if (typeof inner === 'function' && chainHasMarker(inner, marker, seen)) return true;
        }
        return false;
    }

    function storyNarratorText(state = getGameState()) {
        const entries = asArray(state?.storyLog).filter(entry => entry?.type === 'narrator');
        return clean(entries.slice(-1)[0]?.text, 20000);
    }

    function visibleNarratorText(doc = typeof document !== 'undefined' ? document : null) {
        if (!doc) return '';
        const entries = Array.from(doc.querySelectorAll('#story-scroll .story-entry.narrator .story-entry-text'));
        return clean(entries.slice(-1)[0]?.textContent, 20000);
    }

    function existingNarration(doc = typeof document !== 'undefined' ? document : null, state = getGameState()) {
        const stored = storyNarratorText(state);
        if (stored.length >= MIN_NARRATION) return stored;
        const visible = visibleNarratorText(doc);
        return visible.length >= MIN_NARRATION ? visible : '';
    }

    function sanitizeNarratorText(value) {
        let text = String(value == null ? '' : value);
        text = text
            .replace(/\[(?:MECCANICA|LOOT|LOOT_PROPRIETA|TEMPO|SCENE|ATTIVITA_NEGOZIO|CATALOGO_NEGOZIO|FORNITORE_NEGOZIO|CLIENTE_NEGOZIO|DIPENDENTE_NEGOZIO|CONTRATTO_NEGOZIO):[^\]]*\]/gi, '')
            .replace(/(?:\r?\n|^)[ \t]*\[(?:MECCANICA|LOOT|LOOT_PROPRIETA|TEMPO|SCENE|ATTIVITA_NEGOZIO|CATALOGO_NEGOZIO|FORNITORE_NEGOZIO|CLIENTE_NEGOZIO|DIPENDENTE_NEGOZIO|CONTRATTO_NEGOZIO):[^\]\r\n]*$/gi, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        return text;
    }

    function syncNarrationState(state = getGameState(), text = '') {
        const narrative = clean(text, 20000);
        if (!state || narrative.length < MIN_NARRATION || storyNarratorText(state).length >= MIN_NARRATION) return false;
        state.storyLog = asArray(state.storyLog);
        state.storyLog.push({ text: narrative, type: 'narrator', time: Date.now(), recovered: true });
        state.history = asArray(state.history);
        if (!state.history.some(entry => entry?.role === 'assistant' && clean(entry?.content, 20000) === narrative)) {
            state.history.push({ role: 'assistant', content: narrative });
        }
        return true;
    }

    function isOpeningTurn(state = getGameState()) {
        return Boolean(state?.currentStory) && Math.max(0, Number(state?.worldMemory?.turnCount) || 0) === 0;
    }

    function releaseStartup(doc = typeof document !== 'undefined' ? document : null) {
        const state = getGameState();
        const narrative = existingNarration(doc, state);
        if (!state || !isOpeningTurn(state) || narrative.length < MIN_NARRATION) return false;

        syncNarrationState(state, narrative);
        const send = doc?.getElementById('btn-send');
        const input = doc?.getElementById('action-input');
        const wasLocked = Boolean(state.isProcessing || send?.disabled || root.__cronacheOpeningNarrativePending);
        if (!wasLocked) return false;

        state.isProcessing = false;
        if (send) send.disabled = false;
        if (input) input.disabled = false;
        root.__cronacheOpeningNarrativePending = false;
        root.__cronacheOpeningNarrativeDeferredFailure = false;
        try { if (typeof root.updateActionBar === 'function') root.updateActionBar(); } catch (_error) { }
        try { if (typeof root.updateVaultControls === 'function') root.updateVaultControls(); } catch (_error) { }

        const overlay = doc?.getElementById('story-intro-overlay');
        if (overlay && !overlay.hidden) {
            try {
                if (typeof root.__cronacheOpeningNarrativeOriginalFinish === 'function') {
                    root.__cronacheOpeningNarrativeOriginalFinish(false);
                } else if (typeof root.finishStoryIntro === 'function') {
                    root.finishStoryIntro(false);
                }
            } catch (error) {
                console.warn('[StartupFreezeGuard] Impossibile chiudere overlay iniziale:', error);
            }
        }
        console.warn('[StartupFreezeGuard] Blocco iniziale rilasciato: la prima scena era già disponibile.');
        return true;
    }

    function scheduleRelease(doc = typeof document !== 'undefined' ? document : null) {
        if (!doc || releaseTimer || !isOpeningTurn()) return;
        const narrative = existingNarration(doc);
        if (narrative.length < MIN_NARRATION) return;
        releaseTimer = root.setTimeout(() => {
            releaseTimer = null;
            releaseStartup(doc);
        }, RELEASE_DELAY_MS);
    }

    function wrapRequestConfiguredAI() {
        const original = root.requestConfiguredAI;
        if (typeof original !== 'function') return false;
        if (chainHasMarker(original, '__startupFreezeGuardV16Wrapped')) return true;
        const wrapped = function guardedConfiguredAI(messages, options = {}) {
            const state = getGameState();
            const task = String(options?.task || '').toLowerCase();
            if (task === 'start' && isOpeningTurn(state)) {
                const narrative = existingNarration(typeof document !== 'undefined' ? document : null, state);
                if (narrative.length >= MIN_NARRATION) {
                    syncNarrationState(state, narrative);
                    return Promise.resolve(narrative);
                }
            }
            return original.apply(this, arguments);
        };
        wrapped.__startupFreezeGuardV16Wrapped = true;
        wrapped.__startupFreezeGuardV16Original = original;
        root.requestConfiguredAI = wrapped;
        return true;
    }

    function wrapGenerateAI() {
        const original = root.generateAI;
        if (typeof original !== 'function') return false;
        if (chainHasMarker(original, '__startupFreezeGuardV16Wrapped')) return true;
        const wrapped = function guardedGenerateAI(action, isStart = false) {
            if (!isStart) return original.apply(this, arguments);
            const state = getGameState();
            const narrative = existingNarration(typeof document !== 'undefined' ? document : null, state);
            if (isOpeningTurn(state) && narrative.length >= MIN_NARRATION) {
                syncNarrationState(state, narrative);
                scheduleRelease(typeof document !== 'undefined' ? document : null);
                return Promise.resolve(narrative);
            }
            if (startupPromise) return startupPromise;
            let result;
            try {
                result = original.apply(this, arguments);
            } catch (error) {
                throw error;
            }
            startupPromise = Promise.resolve(result).finally(() => {
                startupPromise = null;
                scheduleRelease(typeof document !== 'undefined' ? document : null);
            });
            return startupPromise;
        };
        wrapped.__startupFreezeGuardV16Wrapped = true;
        wrapped.__startupFreezeGuardV16Original = original;
        root.generateAI = wrapped;
        return true;
    }

    function wrapStartNewGame() {
        const original = root.startNewGame;
        if (typeof original !== 'function') return false;
        if (chainHasMarker(original, '__startupFreezeGuardV16Wrapped')) return true;
        const wrapped = function guardedStartNewGame() {
            // Protezione re-entrante: anche se un vecchio runtime avesse già lasciato
            // un guard annidato, la chiamata interna non deve essere scambiata per un doppio tap.
            const depth = Math.max(0, Number(root.__cronacheStartGuardDepth) || 0);
            if (depth > 0) return original.apply(this, arguments);

            const now = Date.now();
            if (now - lastNewGameAt < 2500) return;
            lastNewGameAt = now;
            startupPromise = null;
            root.__cronacheStartGuardDepth = depth + 1;
            try {
                return original.apply(this, arguments);
            } finally {
                root.__cronacheStartGuardDepth = depth;
            }
        };
        wrapped.__startupFreezeGuardV16Wrapped = true;
        wrapped.__startupFreezeGuardV16Original = original;
        root.startNewGame = wrapped;
        return true;
    }

    function wrapAddStoryEntry() {
        const original = root.addStoryEntry;
        if (typeof original !== 'function') return false;
        if (chainHasMarker(original, '__startupFreezeGuardV16Wrapped')) return true;
        const wrapped = function guardedAddStoryEntry(text, type) {
            const args = Array.from(arguments);
            if (type === 'narrator') args[0] = sanitizeNarratorText(text);
            const result = original.apply(this, args);
            if (type === 'narrator') scheduleRelease(typeof document !== 'undefined' ? document : null);
            return result;
        };
        wrapped.__startupFreezeGuardV16Wrapped = true;
        wrapped.__startupFreezeGuardV16Original = original;
        root.addStoryEntry = wrapped;
        return true;
    }

    function observe(doc) {
        if (!doc || observer || typeof MutationObserver === 'undefined') return;
        const story = doc.getElementById('story-scroll') || doc.body;
        if (!story) return;
        observer = new MutationObserver(() => scheduleRelease(doc));
        observer.observe(story, { childList: true, subtree: true });
    }

    function install(doc = typeof document !== 'undefined' ? document : null) {
        wrapRequestConfiguredAI();
        wrapGenerateAI();
        wrapStartNewGame();
        wrapAddStoryEntry();
        if (doc) {
            observe(doc);
            scheduleRelease(doc);
        }
        root.__cronacheStartupFreezeGuardV16Version = PATCH_VERSION;
        return true;
    }

    function scheduleInstall(doc = typeof document !== 'undefined' ? document : null) {
        install(doc);
        if (typeof root.setTimeout !== 'function') return;
        [0, 80, 250, 700, 1500, 3000, 5000].forEach(delay => root.setTimeout(() => install(doc), delay));
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scheduleInstall(document), { once: true });
        else scheduleInstall(document);
    }

    return {
        PATCH_VERSION,
        MIN_NARRATION,
        chainHasMarker,
        storyNarratorText,
        visibleNarratorText,
        existingNarration,
        sanitizeNarratorText,
        syncNarrationState,
        releaseStartup,
        install
    };
});