(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheStrategicFriendly = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-strategic-friendly-style';
    let refreshQueued = false;

    function installStyles(documentRef) {
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
        const style = documentRef.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            /* Consigliere strategico: più compatto, chiaro e mobile-first. */
            #modal-strategic-actions .strategic-modal {
                width: min(720px, calc(100vw - 24px));
                max-width: 720px !important;
            }
            #modal-strategic-actions .modal-header {
                padding: 12px 15px;
                font-size: .96rem;
            }
            #modal-strategic-actions .modal-body {
                gap: 0;
                padding: 12px 14px 14px;
                background: linear-gradient(180deg, #f7e9c5 0%, #f4e4bc 100%);
            }
            #modal-strategic-actions .strategic-intro {
                margin: 0 0 9px;
                padding: 9px 11px;
                border: 1px solid rgba(107,46,155,.13);
                border-radius: 11px;
                color: var(--ink-light);
                background: rgba(255,255,255,.42);
                box-shadow: none;
                font-size: .82rem;
                line-height: 1.35;
            }
            #modal-strategic-actions .strategic-toolbar {
                display: grid;
                grid-template-columns: minmax(0,1fr) auto;
                gap: 7px;
                margin: 0 0 9px;
            }
            #modal-strategic-actions .strategic-analyze-btn {
                min-height: 42px;
                padding: 8px 12px;
                border-radius: 11px;
                background: linear-gradient(135deg, #6b2e9b, #8b4ac1);
                box-shadow: 0 4px 10px rgba(80,34,116,.16);
                font-size: .78rem;
                letter-spacing: .01em;
                touch-action: manipulation;
            }
            #modal-strategic-actions .strategic-analyze-btn:disabled {
                opacity: 1;
                color: #563a62;
                background: rgba(107,46,155,.11);
                box-shadow: none;
            }
            #modal-strategic-actions .strategic-source {
                align-self: center;
                max-width: 145px;
                overflow: hidden;
                padding: 4px 8px;
                text-overflow: ellipsis;
                font-size: .66rem;
            }
            #modal-strategic-actions .strategic-loading {
                min-height: 44px;
                margin: 0 0 9px;
                padding: 8px 10px;
                border: 1px solid rgba(107,46,155,.12);
                border-radius: 11px;
                background: rgba(255,255,255,.5);
            }
            #modal-strategic-actions .strategic-loading-icon { font-size: 1rem; }
            #modal-strategic-actions .strategic-loading strong { font-size: .78rem; }
            #modal-strategic-actions .strategic-loading small { font-size: .69rem; }
            #modal-strategic-actions #strategic-content {
                padding: 0 2px 2px 0;
                scrollbar-width: thin;
            }
            #modal-strategic-actions .strategic-empty {
                padding: 22px 14px;
                border-radius: 12px;
                font-size: .84rem;
                line-height: 1.4;
            }
            #modal-strategic-actions .strategic-briefing {
                margin: 0 0 9px;
                padding: 11px 12px;
                border: 1px solid rgba(107,46,155,.16);
                border-radius: 12px;
                color: var(--ink);
                background: linear-gradient(135deg, rgba(255,255,255,.82), rgba(236,221,247,.76));
                box-shadow: none;
            }
            #modal-strategic-actions .strategic-briefing h3 {
                margin: 0 0 4px;
                color: #54206f;
                font-size: .93rem;
                line-height: 1.25;
            }
            #modal-strategic-actions .strategic-briefing p {
                display: -webkit-box;
                overflow: hidden;
                margin: 0;
                color: var(--ink-light);
                font-size: .82rem;
                line-height: 1.38;
                -webkit-box-orient: vertical;
                -webkit-line-clamp: 3;
            }
            #modal-strategic-actions .strategic-briefing small {
                margin-top: 6px;
                color: #765f68;
                font-size: .68rem;
                opacity: 1;
            }
            #modal-strategic-actions .strategic-signal-strip {
                display: flex;
                gap: 6px;
                margin: 0 0 10px;
                overflow-x: auto;
                scrollbar-width: none;
                scroll-snap-type: x proximity;
            }
            #modal-strategic-actions .strategic-signal-strip::-webkit-scrollbar { display: none; }
            #modal-strategic-actions .strategic-signal {
                flex: 0 0 auto;
                min-width: 120px;
                max-width: 180px;
                padding: 7px 9px;
                border-radius: 10px;
                background: rgba(255,255,255,.62);
                scroll-snap-align: start;
            }
            #modal-strategic-actions .strategic-signal strong { font-size: .62rem; }
            #modal-strategic-actions .strategic-signal span { margin-top: 2px; font-size: .73rem; }
            #modal-strategic-actions .strategic-topics-title {
                margin: 2px 0 7px;
                font-size: .82rem;
            }
            #modal-strategic-actions .strategic-issue-list { gap: 7px; }
            #modal-strategic-actions .strategic-issue {
                border-width: 1px;
                border-left-width: 4px;
                border-radius: 12px;
                background: rgba(255,255,255,.72);
                box-shadow: 0 3px 9px rgba(44,24,16,.06);
            }
            #modal-strategic-actions .strategic-issue > summary {
                padding: 10px 11px;
                gap: 8px;
                touch-action: manipulation;
            }
            #modal-strategic-actions .strategic-issue > summary::after { font-size: 1rem; }
            #modal-strategic-actions .strategic-issue-title { font-size: .86rem; line-height: 1.22; }
            #modal-strategic-actions .strategic-issue-meta { gap: 4px; margin-top: 4px; }
            #modal-strategic-actions .strategic-chip { padding: 2px 6px; font-size: .63rem; }
            #modal-strategic-actions .strategic-issue-body { padding: 0 10px 10px; }
            #modal-strategic-actions .strategic-assessment {
                margin: 9px 0 5px;
                font-size: .82rem;
                line-height: 1.38;
            }
            #modal-strategic-actions .strategic-stakes {
                margin: 0 0 9px;
                padding: 7px 8px;
                border-radius: 8px;
                background: rgba(201,162,39,.08);
                font-size: .76rem;
                line-height: 1.32;
            }
            #modal-strategic-actions .strategic-options-title {
                margin: 9px 0 6px;
                font-size: .76rem;
            }
            #modal-strategic-actions .strategic-action-list { gap: 7px; }
            #modal-strategic-actions .strategic-action-card {
                padding: 9px;
                border-radius: 10px;
                background: rgba(248,245,252,.78);
            }
            #modal-strategic-actions .strategic-action-card h4 {
                margin: 0 0 3px;
                font-size: .82rem;
                line-height: 1.2;
            }
            #modal-strategic-actions .strategic-action-card > p {
                margin: 0 0 6px;
                font-size: .75rem;
                line-height: 1.32;
            }
            #modal-strategic-actions .strategic-action-facts { gap: 4px; margin-bottom: 6px; }
            #modal-strategic-actions .strategic-action-facts span {
                padding: 2px 6px;
                border-radius: 7px;
                font-size: .66rem;
            }
            #modal-strategic-actions .ux-strategic-more { margin: 5px 0 7px; border: 0; }
            #modal-strategic-actions .ux-strategic-more > summary {
                width: fit-content;
                padding: 3px 0;
                color: #6b2e9b;
                cursor: pointer;
                list-style: none;
                font: 700 .68rem system-ui, sans-serif;
                touch-action: manipulation;
            }
            #modal-strategic-actions .ux-strategic-more > summary::-webkit-details-marker { display: none; }
            #modal-strategic-actions .ux-strategic-more > summary::before { content: '＋ '; }
            #modal-strategic-actions .ux-strategic-more[open] > summary::before { content: '− '; }
            #modal-strategic-actions .ux-strategic-more-content {
                margin-top: 4px;
                padding: 7px 8px;
                border-radius: 8px;
                background: rgba(255,255,255,.65);
            }
            #modal-strategic-actions .strategic-action-detail {
                margin: 4px 0;
                font-size: .72rem;
                line-height: 1.3;
            }
            #modal-strategic-actions .strategic-action-command {
                margin: 6px 0 0;
                padding: 7px 8px;
                font-size: .72rem;
                line-height: 1.32;
            }
            #modal-strategic-actions .strategic-action-execute {
                min-height: 38px;
                border-radius: 9px;
                font-size: .72rem;
                touch-action: manipulation;
            }
            #modal-strategic-actions .strategic-free-action {
                grid-template-columns: minmax(0,1fr) 48px;
                gap: 7px;
                margin-top: 9px;
                padding: 8px;
                border-color: rgba(139,105,20,.28);
                border-radius: 12px;
                background: rgba(255,251,241,.98);
                box-shadow: 0 -3px 12px rgba(44,24,16,.08);
            }
            #modal-strategic-actions .strategic-free-action > div {
                display: flex;
                align-items: baseline;
                justify-content: space-between;
                gap: 8px;
            }
            #modal-strategic-actions .strategic-free-action > div strong { font-size: .78rem; }
            #modal-strategic-actions .strategic-free-action > div small {
                margin: 0;
                font-size: .66rem;
                text-align: right;
            }
            #modal-strategic-actions .strategic-free-action textarea {
                min-height: 46px;
                max-height: 84px;
                padding: 9px 10px;
                border-radius: 9px;
                resize: none;
                font-size: 16px;
                line-height: 1.25;
            }
            #modal-strategic-actions .strategic-free-action button {
                min-width: 48px;
                width: 48px;
                min-height: 46px;
                border-radius: 10px;
                background: linear-gradient(135deg, #6b2e9b, #8b4ac1);
                font-size: 1rem;
                touch-action: manipulation;
            }
            #modal-strategic-actions .strategic-selection-summary {
                margin-top: 8px;
                padding: 9px;
                border-radius: 11px;
                box-shadow: 0 -3px 12px rgba(44,24,16,.1);
            }
            #modal-strategic-actions .strategic-selection-head { margin-bottom: 5px; font-size: .75rem; }
            #modal-strategic-actions .strategic-selection-groups { gap: 4px; margin-bottom: 6px; }
            #modal-strategic-actions .strategic-selection-group {
                padding: 5px 7px;
                border-radius: 8px;
                font-size: .71rem;
            }
            #modal-strategic-actions .strategic-selection-advance {
                min-height: 40px;
                border-radius: 9px;
                font-size: .74rem;
                touch-action: manipulation;
            }

            @media (max-width: 600px) {
                #modal-strategic-actions .strategic-modal {
                    width: 100%;
                    max-height: 96dvh;
                    border-radius: 18px 18px 0 0;
                }
                #modal-strategic-actions .modal-header {
                    position: sticky;
                    top: 0;
                    z-index: 8;
                    padding: 11px 14px;
                }
                #modal-strategic-actions .modal-body {
                    padding: 9px 9px calc(10px + env(safe-area-inset-bottom, 0px));
                }
                #modal-strategic-actions .strategic-intro {
                    margin-bottom: 7px;
                    padding: 7px 9px;
                    font-size: .75rem;
                }
                #modal-strategic-actions .strategic-toolbar { margin-bottom: 7px; }
                #modal-strategic-actions .strategic-analyze-btn {
                    min-height: 40px;
                    font-size: .73rem;
                }
                #modal-strategic-actions .strategic-loading small { display: none; }
                #modal-strategic-actions .strategic-briefing p { -webkit-line-clamp: 2; }
                #modal-strategic-actions .strategic-signal { min-width: 108px; max-width: 150px; }
                #modal-strategic-actions .strategic-issue > summary { padding: 9px 10px; }
                #modal-strategic-actions .strategic-free-action {
                    grid-template-columns: minmax(0,1fr) 46px;
                    padding: 7px;
                }
                #modal-strategic-actions .strategic-free-action > div small { display: none; }
                #modal-strategic-actions .strategic-free-action textarea,
                #modal-strategic-actions .strategic-free-action button { min-height: 44px; }
                #modal-strategic-actions .strategic-free-action button { width: 46px; min-width: 46px; }
            }
        `;
        documentRef.head.appendChild(style);
    }

    function setTextIfDifferent(node, text) {
        if (node && node.textContent !== text) node.textContent = text;
    }

    function wrapCardDetails(documentRef, card) {
        if (!card || card.dataset.friendlyStrategicReady === '1') return;
        const nodes = Array.from(card.querySelectorAll(':scope > .strategic-action-detail, :scope > .strategic-action-command'));
        if (nodes.length) {
            const details = documentRef.createElement('details');
            details.className = 'ux-strategic-more';
            const summary = documentRef.createElement('summary');
            summary.textContent = 'Dettagli';
            const body = documentRef.createElement('div');
            body.className = 'ux-strategic-more-content';
            nodes.forEach(node => body.appendChild(node));
            details.append(summary, body);
            const execute = card.querySelector(':scope > .strategic-action-execute');
            if (execute) card.insertBefore(details, execute);
            else card.appendChild(details);
        }
        card.dataset.friendlyStrategicReady = '1';
    }

    function enhanceDynamicContent(documentRef) {
        const content = documentRef.getElementById('strategic-content');
        if (!content) return;
        const title = content.querySelector('.strategic-options-title');
        setTextIfDifferent(title, 'Scegli una mossa');
        content.querySelectorAll('.strategic-action-card').forEach(card => wrapCardDetails(documentRef, card));

        const issues = Array.from(content.querySelectorAll('.strategic-issue'));
        if (issues.length && !issues.some(issue => issue.open) && !content.dataset.friendlyAutoOpened) {
            const preferred = issues.find(issue => issue.classList.contains('urgency-critica')) ||
                issues.find(issue => issue.classList.contains('urgency-alta')) || issues[0];
            if (preferred) preferred.open = true;
            content.dataset.friendlyAutoOpened = '1';
        }
    }

    function syncStaticCopy(documentRef) {
        const modal = documentRef.getElementById('modal-strategic-actions');
        if (!modal) return false;
        setTextIfDifferent(modal.querySelector('.strategic-intro'), 'Scegli una priorità: il consigliere ti propone poche mosse concrete. Puoi anche scriverne una tua.');
        setTextIfDifferent(modal.querySelector('.strategic-loading strong'), 'Valuto le priorità…');
        setTextIfDifferent(modal.querySelector('.strategic-loading small'), 'Cerco le mosse più utili per la situazione attuale.');
        setTextIfDifferent(modal.querySelector('.strategic-free-action > div strong'), '✍️ La tua mossa');
        setTextIfDifferent(modal.querySelector('.strategic-free-action > div small'), 'Scrivi un’azione alternativa');
        const input = documentRef.getElementById('strategic-free-action-input');
        if (input) input.placeholder = 'Scrivi cosa vuoi fare…';
        const add = documentRef.getElementById('btn-add-free-strategic');
        if (add) {
            add.title = 'Aggiungi questa mossa';
            add.setAttribute('aria-label', 'Aggiungi questa mossa al piano');
        }
        return true;
    }

    function syncAnalyzeButton(documentRef) {
        const button = documentRef.getElementById('btn-strategic-analyze');
        if (!button) return;
        const text = button.disabled ? '🧭 Sto valutando…' : '↻ Aggiorna consigli';
        if (button.textContent !== text) button.textContent = text;
        button.setAttribute('aria-label', button.disabled ? 'Analisi strategica in corso' : 'Aggiorna i consigli strategici');
    }

    function scheduleEnhance(documentRef, windowRef) {
        if (refreshQueued) return;
        refreshQueued = true;
        windowRef.requestAnimationFrame(() => {
            refreshQueued = false;
            enhanceDynamicContent(documentRef);
        });
    }

    function install(documentRef, windowRef) {
        if (!documentRef || !windowRef) return false;
        const modal = documentRef.getElementById('modal-strategic-actions');
        if (!modal) return false;
        installStyles(documentRef);
        syncStaticCopy(documentRef);
        syncAnalyzeButton(documentRef);
        enhanceDynamicContent(documentRef);

        const button = documentRef.getElementById('btn-strategic-analyze');
        if (button && !button.__cronacheStrategicFriendlyObserver) {
            const observer = new windowRef.MutationObserver(() => syncAnalyzeButton(documentRef));
            observer.observe(button, { attributes: true, attributeFilter: ['disabled'] });
            button.__cronacheStrategicFriendlyObserver = observer;
        }

        const content = documentRef.getElementById('strategic-content');
        if (content && !content.__cronacheStrategicFriendlyObserver) {
            const observer = new windowRef.MutationObserver(() => scheduleEnhance(documentRef, windowRef));
            observer.observe(content, { childList: true, subtree: true });
            content.__cronacheStrategicFriendlyObserver = observer;
        }
        documentRef.body.classList.add('strategic-friendly-ready');
        root.__cronacheStrategicFriendlyVersion = PATCH_VERSION;
        return true;
    }

    function scheduleInstall() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        const attempt = () => install(document, window);
        if (attempt()) return;
        [0, 80, 250, 700, 1500, 3000].forEach(delay => window.setTimeout(attempt, delay));
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attempt, { once: true });
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return { PATCH_VERSION, STYLE_ID, enhanceDynamicContent, install };
});
