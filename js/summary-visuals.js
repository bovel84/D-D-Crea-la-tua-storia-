(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheSummaryVisuals = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 2;
    const STYLE_ID = 'cronache-summary-visuals-style';
    const SUMMARY_RE = /(?:il mondo ha prodotto questo cambiamento|situazione attuale:|esito del piano strategico:)/i;
    const attempted = new WeakSet();
    let observer = null;

    function clean(value, max = 8000) {
        return String(value == null ? '' : value)
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, max);
    }

    function isSummaryText(value) {
        return SUMMARY_RE.test(clean(value, 12000));
    }

    function hasVisual(entry) {
        return Boolean(entry?.querySelector?.('.story-scene-visual, .story-scene-img'));
    }

    function installStyles(documentRef) {
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
        const style = documentRef.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #story-scroll .story-entry.narrator .story-scene-visual.summary-scene-visual {
                margin-bottom: 14px;
            }
            #story-scroll .story-entry.narrator .story-scene-visual.summary-scene-visual figcaption {
                display: none;
            }
            @media (max-width: 640px) {
                #story-scroll .story-entry.narrator .story-scene-visual.summary-scene-visual {
                    margin-bottom: 11px;
                }
            }
        `;
        documentRef.head.appendChild(style);
    }

    function scheduleRetry(entry, delay = 65000) {
        if (typeof window === 'undefined') return;
        window.setTimeout(() => {
            attempted.delete(entry);
            if (!hasVisual(entry) && entry?.isConnected) attachSummaryImage(entry);
        }, delay);
    }

    function attachSummaryImage(entry) {
        if (!entry || attempted.has(entry) || hasVisual(entry)) return false;
        const text = clean(entry.innerText || entry.textContent, 12000);
        if (!isSummaryText(text)) return false;

        const visuals = root.CronacheStoryVisuals;
        if (!visuals || typeof visuals.attachNarrativeImage !== 'function') return false;

        attempted.add(entry);
        const attached = Boolean(visuals.attachNarrativeImage(entry, text));
        if (attached) {
            const figure = entry.querySelector('.story-scene-visual');
            if (figure) {
                figure.classList.add('summary-scene-visual');
                figure.setAttribute('aria-label', 'Illustrazione del riassunto degli eventi');
            }
            // Se il provider rimuove la figura dopo un errore asincrono, riprova una volta terminato il cooldown.
            scheduleRetry(entry);
        } else {
            scheduleRetry(entry);
        }
        return attached;
    }

    function processNode(node) {
        if (!node || node.nodeType !== 1) return;
        const entries = [];
        if (node.matches?.('#story-scroll .story-entry.narrator, .story-entry.narrator')) entries.push(node);
        node.querySelectorAll?.('.story-entry.narrator').forEach(entry => entries.push(entry));
        entries.forEach(entry => window.setTimeout(() => attachSummaryImage(entry), 30));
    }

    function backfillLatest(documentRef) {
        const summaries = Array.from(documentRef.querySelectorAll('#story-scroll .story-entry.narrator'))
            .filter(entry => isSummaryText(entry.innerText || entry.textContent) && !hasVisual(entry));
        summaries.slice(-3).forEach((entry, index) => {
            window.setTimeout(() => attachSummaryImage(entry), 80 + index * 120);
        });
    }

    function install(documentRef, windowRef) {
        if (!documentRef || !windowRef) return false;
        installStyles(documentRef);
        const scroll = documentRef.getElementById('story-scroll');
        if (!scroll) return false;

        backfillLatest(documentRef);

        if (!observer) {
            observer = new windowRef.MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(processNode);
                });
            });
            observer.observe(scroll, { childList: true, subtree: true });
        }

        documentRef.body?.classList.add('summary-visuals-ready');
        root.__cronacheSummaryVisualsVersion = PATCH_VERSION;
        return true;
    }

    function scheduleInstall() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        const attempt = () => install(document, window);
        if (attempt()) return;
        [0, 80, 250, 700, 1500, 3000, 5000].forEach(delay => window.setTimeout(attempt, delay));
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', attempt, { once: true });
        }
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        STYLE_ID,
        isSummaryText,
        attachSummaryImage,
        install
    };
});
