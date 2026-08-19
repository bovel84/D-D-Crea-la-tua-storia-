(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheUiConsolidationV9 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 2;
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

            /* Chat mobile: il modale deve avere un vero layout a colonna.
               Prima .chat-modal aveva overflow:hidden ma il body non era vincolato:
               con messaggi/partecipanti il composer finiva sotto il bordo del modale. */
            #modal-world-chat .chat-modal {
                display: flex !important;
                flex-direction: column !important;
                min-height: 0 !important;
                overflow: hidden !important;
            }
            #modal-world-chat .chat-modal > .modal-header {
                flex: 0 0 auto !important;
            }
            #modal-world-chat .chat-modal > .modal-body {
                display: flex !important;
                flex-direction: column !important;
                flex: 1 1 auto !important;
                min-height: 0 !important;
                overflow: hidden !important;
            }
            #modal-world-chat .chat-layout {
                display: flex !important;
                flex-direction: column !important;
                flex: 1 1 auto !important;
                min-height: 0 !important;
                overflow: hidden !important;
            }
            #modal-world-chat .chat-thread-list,
            #modal-world-chat .chat-conversation-head {
                flex: 0 0 auto !important;
            }
            #modal-world-chat .chat-conversation {
                display: flex !important;
                flex-direction: column !important;
                flex: 1 1 auto !important;
                min-height: 0 !important;
                overflow: hidden !important;
            }
            #modal-world-chat .chat-messages {
                flex: 1 1 auto !important;
                min-height: 0 !important;
                max-height: none !important;
                overflow-y: auto !important;
                overscroll-behavior: contain;
            }
            #modal-world-chat .chat-compose {
                position: relative !important;
                bottom: auto !important;
                flex: 0 0 auto !important;
                display: grid !important;
                visibility: visible !important;
                opacity: 1 !important;
                z-index: 5 !important;
            }
            #modal-world-chat #chat-input,
            #modal-world-chat #btn-send-chat {
                visibility: visible !important;
                opacity: 1 !important;
                pointer-events: auto !important;
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
                #modal-world-chat .chat-modal {
                    height: min(92dvh, 900px) !important;
                    max-height: calc(100dvh - 8px) !important;
                }
                #modal-world-chat .chat-compose {
                    padding-bottom: max(4px, env(safe-area-inset-bottom)) !important;
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
        const nextCss = cssText();
        if (style.textContent !== nextCss) style.textContent = nextCss;

        const agenda = documentRef.getElementById('timeline-agenda');
        if (agenda) {
            agenda.setAttribute('aria-hidden', 'true');
            agenda.setAttribute('data-ui-hidden', 'pending-events');
        }
        documentRef.body?.classList.add('ui-consolidation-v9-ready', 'portrait-size-tuning-ready');
        root.__cronacheUiConsolidationV9Version = PATCH_VERSION;
        root.__cronacheInterfaceCleanupVersion = Math.max(2, Number(root.__cronacheInterfaceCleanupVersion) || 0);
        root.__cronachePortraitSizeTuningVersion = Math.max(2, Number(root.__cronachePortraitSizeTuningVersion) || 0);
        return true;
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => install(document), { once: true });
        } else install(document);
    }

    return { PATCH_VERSION, STYLE_ID, cssText, install };
});
