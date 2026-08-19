(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheInterfaceCleanup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-interface-cleanup-style';

    function installStyles(documentRef) {
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
        const style = documentRef.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            /* Timeline: mostra la cronologia degli eventi, non la coda interna in lavorazione. */
            #modal-timeline #timeline-agenda,
            #modal-timeline .timeline-pending-summary,
            #modal-timeline .ux-timeline-overview {
                display: none !important;
            }

            #modal-timeline .timeline-current {
                margin-bottom: 8px !important;
                padding: 10px 12px !important;
            }

            #modal-timeline .timeline-current small {
                display: none !important;
            }

            #modal-timeline .timeline-advance-box.ux-timeline-advance-sticky {
                margin-bottom: 10px !important;
                padding-bottom: 7px !important;
            }

            /* Analisi strategica: più leggera, leggibile e pensata per il touch. */
            #modal-strategic-actions .strategic-modal {
                width: min(720px, calc(100vw - 20px));
                max-width: 720px !important;
                overflow: hidden;
            }

            #modal-strategic-actions .modal-header {
                position: sticky;
                top: 0;
                z-index: 8;
                padding: 12px 15px;
            }

            #modal-strategic-actions .modal-body {
                gap: 0;
                padding: 12px 12px calc(14px + env(safe-area-inset-bottom, 0px));
                background: rgba(255, 250, 238, .72);
            }

            #modal-strategic-actions .strategic-intro {
                margin: 0;
                padding: 9px 11px;
                border: 1px solid rgba(92,64,48,.14);
                border-radius: 11px;
                background: rgba(255,255,255,.58);
                color: var(--ink-light);
                font-size: .86rem;
                line-height: 1.35;
            }

            #modal-strategic-actions .strategic-toolbar {
                margin: 8px 0;
                gap: 6px;
            }

            #modal-strategic-actions .strategic-analyze-btn {
                min-height: 42px;
                padding: 8px 12px;
                border: 1px solid rgba(107,46,155,.22);
                border-radius: 11px;
                box-shadow: none;
                font-size: .82rem;
                touch-action: manipulation;
            }

            #modal-strategic-actions .strategic-analyze-btn:disabled {
                opacity: .72;
            }

            #modal-strategic-actions .strategic-source {
                display: none !important;
            }

            #modal-strategic-actions .strategic-loading {
                grid-template-columns: 30px minmax(0, 1fr);
                gap: 8px;
                margin: 0 0 8px;
                padding: 9px 10px;
                border: 1px solid rgba(107,46,155,.15);
                border-radius: 11px;
                background: rgba(255,255,255,.62);
                box-shadow: none;
            }

            #modal-strategic-actions .strategic-loading.active {
                display: grid;
            }

            #modal-strategic-actions .strategic-loading-icon {
                width: 30px;
                height: 30px;
                display: grid;
                place-items: center;
                font-size: 1rem;
            }

            #modal-strategic-actions .strategic-loading strong {
                align-self: end;
                font-size: .80rem;
            }

            #modal-strategic-actions .strategic-loading small {
                grid-column: 2;
                margin: -2px 0 0;
                font-size: .72rem;
                line-height: 1.25;
            }

            #modal-strategic-actions #strategic-content {
                padding: 0;
            }

            #modal-strategic-actions .strategic-briefing {
                margin: 0 0 8px;
                padding: 11px 12px;
                border: 1px solid rgba(107,46,155,.18);
                border-radius: 12px;
                color: var(--ink);
                background: rgba(255,255,255,.74);
                box-shadow: none;
            }

            #modal-strategic-actions .strategic-briefing h3 {
                margin-bottom: 5px;
                font-size: .92rem;
            }

            #modal-strategic-actions .strategic-briefing p {
                color: var(--ink-light);
                font-size: .84rem;
                line-height: 1.36;
            }

            #modal-strategic-actions .strategic-briefing small {
                margin-top: 6px;
                color: var(--ink-light);
                font-size: .70rem;
            }

            #modal-strategic-actions .strategic-signal-strip {
                gap: 6px;
                margin-bottom: 9px;
            }

            #modal-strategic-actions .strategic-signal {
                padding: 7px 8px;
                border-radius: 10px;
                background: rgba(255,255,255,.64);
            }

            #modal-strategic-actions .strategic-signal strong {
                font-size: .62rem;
            }

            #modal-strategic-actions .strategic-signal span {
                font-size: .75rem;
            }

            #modal-strategic-actions .strategic-topics-title {
                margin: 2px 0 7px;
                font-size: .88rem;
            }

            #modal-strategic-actions .strategic-issue-list {
                gap: 7px;
            }

            #modal-strategic-actions .strategic-issue {
                border-width: 1px 1px 1px 4px;
                border-radius: 12px;
                background: rgba(255,255,255,.72);
                box-shadow: none;
            }

            #modal-strategic-actions .strategic-issue > summary {
                padding: 10px 11px;
                gap: 8px;
                touch-action: manipulation;
            }

            #modal-strategic-actions .strategic-issue-title {
                font-size: .88rem;
            }

            #modal-strategic-actions .strategic-issue-meta {
                gap: 4px;
                margin-top: 4px;
            }

            #modal-strategic-actions .strategic-chip {
                padding: 2px 6px;
                font-size: .65rem;
            }

            #modal-strategic-actions .strategic-issue-body {
                padding: 0 10px 10px;
            }

            #modal-strategic-actions .strategic-assessment {
                margin: 9px 0 5px;
                font-size: .82rem;
                line-height: 1.38;
            }

            #modal-strategic-actions .strategic-stakes {
                margin-bottom: 8px;
                font-size: .78rem;
                line-height: 1.32;
            }

            #modal-strategic-actions .strategic-options-title {
                margin: 8px 0 6px;
                font-size: .80rem;
            }

            #modal-strategic-actions .strategic-action-list {
                gap: 7px;
            }

            #modal-strategic-actions .strategic-action-card {
                padding: 9px;
                border-radius: 10px;
                background: rgba(250,248,253,.76);
            }

            #modal-strategic-actions .strategic-action-card h4 {
                margin-bottom: 4px;
                font-size: .84rem;
            }

            #modal-strategic-actions .strategic-action-card p {
                margin-bottom: 6px;
                font-size: .78rem;
                line-height: 1.32;
            }

            #modal-strategic-actions .strategic-action-facts {
                gap: 4px;
                margin-bottom: 6px;
            }

            #modal-strategic-actions .strategic-action-facts span {
                padding: 2px 6px;
                font-size: .68rem;
            }

            #modal-strategic-actions .strategic-action-detail {
                margin: 4px 0;
                font-size: .75rem;
                line-height: 1.3;
            }

            /* Il comando tecnico duplicava il titolo e rendeva le schede molto lunghe. */
            #modal-strategic-actions .strategic-action-command {
                display: none;
            }

            #modal-strategic-actions .strategic-action-execute {
                min-height: 40px;
                border-radius: 10px;
                font-size: .76rem;
                touch-action: manipulation;
            }

            #modal-strategic-actions .strategic-free-action {
                grid-template-columns: minmax(0, 1fr) 46px;
                gap: 6px;
                margin-top: 8px;
                padding: 8px;
                border: 1px solid rgba(92,64,48,.17);
                border-radius: 11px;
                background: rgba(255,255,255,.88);
                box-shadow: 0 -3px 10px rgba(44,24,16,.08);
            }

            #modal-strategic-actions .strategic-free-action > div {
                margin-bottom: 0;
            }

            #modal-strategic-actions .strategic-free-action > div strong {
                font-size: .82rem;
            }

            #modal-strategic-actions .strategic-free-action small {
                margin-top: 2px;
                font-size: .70rem;
                line-height: 1.2;
            }

            #modal-strategic-actions .strategic-free-action textarea {
                min-height: 44px;
                max-height: 88px;
                padding: 9px 10px;
                border-radius: 9px;
                font-size: .88rem;
                resize: none;
            }

            #modal-strategic-actions .strategic-free-action button {
                min-width: 46px;
                min-height: 44px;
                border-radius: 9px;
                touch-action: manipulation;
            }

            #modal-strategic-actions .strategic-selection-summary {
                margin-top: 8px;
                padding: 9px;
                border-radius: 11px;
                box-shadow: 0 -3px 10px rgba(44,24,16,.08);
            }

            @media (max-width: 600px) {
                #modal-strategic-actions .strategic-modal {
                    width: 100%;
                    max-height: 95dvh;
                    border-radius: 18px 18px 0 0;
                }

                #modal-strategic-actions .modal-body {
                    padding: 9px 9px calc(10px + env(safe-area-inset-bottom, 0px));
                }

                #modal-strategic-actions .strategic-intro {
                    padding: 8px 9px;
                    font-size: .80rem;
                }

                #modal-strategic-actions .strategic-signal-strip {
                    display: flex;
                    overflow-x: auto;
                    padding-bottom: 2px;
                    scrollbar-width: none;
                }

                #modal-strategic-actions .strategic-signal-strip::-webkit-scrollbar {
                    display: none;
                }

                #modal-strategic-actions .strategic-signal {
                    flex: 0 0 132px;
                    display: block;
                }

                #modal-strategic-actions .strategic-free-action textarea {
                    font-size: .84rem;
                }
            }
        `;
        documentRef.head.appendChild(style);
    }

    function simplifyCopy(documentRef) {
        const intro = documentRef.querySelector('#modal-strategic-actions .strategic-intro');
        if (intro) {
            intro.innerHTML = 'Scegli una proposta oppure scrivi la tua. Le azioni verranno applicate quando <strong>continui la storia</strong>.';
        }

        const loading = documentRef.getElementById('strategic-loading');
        const loadingStrong = loading?.querySelector('strong');
        const loadingSmall = loading?.querySelector('small');
        if (loadingStrong) loadingStrong.textContent = 'Aggiorno i consigli…';
        if (loadingSmall) loadingSmall.textContent = 'Valuto gli ultimi eventi e le relazioni attive.';

        const empty = documentRef.querySelector('#strategic-content .strategic-empty');
        if (empty) empty.textContent = 'Tocca “Analizza la situazione” per ricevere proposte concrete.';

        const freeActionSmall = documentRef.querySelector('#modal-strategic-actions .strategic-free-action small');
        if (freeActionSmall) freeActionSmall.textContent = 'Scrivi un’iniziativa alternativa alle proposte.';
    }

    function install(documentRef) {
        if (!documentRef) return false;
        installStyles(documentRef);
        simplifyCopy(documentRef);
        documentRef.body?.classList.add('interface-cleanup-ready');
        root.__cronacheInterfaceCleanupVersion = PATCH_VERSION;
        return true;
    }

    function scheduleInstall() {
        if (typeof document === 'undefined') return;
        const attempt = () => install(document);
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', attempt, { once: true });
        } else {
            attempt();
        }
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        STYLE_ID,
        install
    };
});
