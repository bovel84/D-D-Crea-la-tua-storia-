(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheUiConsolidationV9 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-ui-consolidation-v9-style';

    function cssText() {
        return `
            /* Phase 9: consolidates interface-cleanup, management-layout and portrait-size-tuning. */
            #modal-timeline #timeline-agenda,
            #modal-timeline .timeline-pending-summary,
            #modal-timeline .ux-timeline-overview {
                display: none !important;
            }
            #modal-timeline .timeline-current {
                margin-bottom: 8px !important;
                padding: 10px 12px !important;
            }
            #modal-timeline .timeline-current small { display: none !important; }
            #modal-timeline .timeline-advance-box.ux-timeline-advance-sticky {
                margin-bottom: 10px !important;
                padding-bottom: 7px !important;
            }

            .management-hub-ready #game-screen .input-area {
                grid-template-columns: repeat(4, minmax(0, 1fr));
                column-gap: clamp(7px, 2.5vw, 18px);
                row-gap: 7px;
            }
            .management-hub-ready #play-action-composer {
                grid-column: 1 / -1;
                width: 100%;
            }

            body #btn-top-character.topbar-protagonist {
                padding: 2px !important;
                overflow: hidden;
            }
            body #btn-top-character #topbar-protagonist-portrait {
                width: 100% !important;
                height: 100% !important;
                min-width: 0 !important;
                min-height: 0 !important;
                max-width: none !important;
                max-height: none !important;
                display: block !important;
                margin: 0 !important;
                overflow: hidden !important;
                box-sizing: border-box !important;
                border-radius: 50% !important;
                border: 2px solid rgba(39,21,9,.68) !important;
                background: #2b1b12;
                box-shadow: inset 0 0 0 1px rgba(255,244,204,.24), 0 3px 10px rgba(0,0,0,.22);
            }
            body #btn-top-character #topbar-protagonist-portrait img.portrait-image,
            body #btn-top-character #topbar-protagonist-portrait img.portrait-photo,
            body #btn-top-character #topbar-protagonist-portrait > img {
                display: block !important;
                width: 100% !important;
                height: 100% !important;
                min-width: 100% !important;
                min-height: 100% !important;
                max-width: none !important;
                max-height: none !important;
                margin: 0 !important;
                padding: 0 !important;
                border: 0 !important;
                border-radius: 50% !important;
                object-fit: cover !important;
                object-position: 50% 22% !important;
                transform: none !important;
            }
            body.npc-dossiers-ready #btn-top-character #topbar-protagonist-portrait {
                width: 100% !important;
                height: 100% !important;
            }

            @media (max-width: 560px) {
                .management-hub-ready #game-screen .input-area {
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                    column-gap: 6px;
                    padding-inline: 9px;
                }
                .management-hub-ready .bottom-command {
                    min-width: 0;
                    font-size: .72rem;
                }
                .management-hub-ready .bottom-command-icon {
                    width: 45px;
                    height: 45px;
                }
            }
            @media (max-width: 380px) {
                body #btn-top-character.topbar-protagonist { padding: 2px !important; }
            }
        `;
    }

    function install(documentRef) {
        if (!documentRef) return false;
        let style = documentRef.getElementById(STYLE_ID);
        if (!style) {
            style = documentRef.createElement('style');
            style.id = STYLE_ID;
            documentRef.head.appendChild(style);
        }
        if (style.textContent !== cssText()) style.textContent = cssText();

        const agenda = documentRef.getElementById('timeline-agenda');
        if (agenda) {
            agenda.setAttribute('aria-hidden', 'true');
            agenda.setAttribute('data-ui-hidden', 'pending-events');
        }
        documentRef.body?.classList.add('ui-consolidation-v9-ready', 'portrait-size-tuning-ready');
        root.__cronacheUiConsolidationV9Version = PATCH_VERSION;
        return true;
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => install(document), { once: true });
        } else install(document);
    }

    return { PATCH_VERSION, STYLE_ID, cssText, install };
});
