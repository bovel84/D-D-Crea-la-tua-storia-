(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheChatCompactUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-chat-compact-ui-style';

    function cssText() {
        return `
            /* Chat mondo compatta: piu spazio ai messaggi, meno pannelli e metadati. */
            #modal-world-chat .chat-modal {
                max-height: min(96dvh, 920px) !important;
            }
            #modal-world-chat .modal-header {
                min-height: 54px !important;
                padding: 9px 14px !important;
                font-size: clamp(.92rem, 3vw, 1.08rem) !important;
            }
            #modal-world-chat .modal-close {
                width: 36px !important;
                height: 36px !important;
                font-size: 1.05rem !important;
            }
            #modal-world-chat .modal-body {
                padding: 8px 10px 10px !important;
            }
            #modal-world-chat .chat-tools {
                gap: 6px !important;
                margin-bottom: 7px !important;
            }
            #modal-world-chat .chat-tool-btn {
                min-height: 36px !important;
                padding: 5px 7px !important;
                border-radius: 11px !important;
                font-size: .68rem !important;
                box-shadow: none !important;
            }
            #modal-world-chat .chat-convocation-panel {
                margin-bottom: 7px !important;
                padding: 8px !important;
                border-radius: 12px !important;
            }
            #modal-world-chat .chat-thread-list {
                gap: 6px !important;
                padding: 0 1px 6px !important;
                margin-bottom: 1px !important;
            }
            #modal-world-chat .chat-thread {
                flex-basis: min(224px, 67vw) !important;
                min-height: 52px !important;
                padding: 7px 9px !important;
                border-radius: 12px !important;
                box-shadow: none !important;
            }
            #modal-world-chat .chat-thread strong {
                display: -webkit-box !important;
                -webkit-line-clamp: 1 !important;
                -webkit-box-orient: vertical !important;
                overflow: hidden !important;
                font-size: .74rem !important;
            }
            #modal-world-chat .chat-thread small {
                margin-top: 3px !important;
                -webkit-line-clamp: 1 !important;
                font-size: .64rem !important;
                line-height: 1.15 !important;
            }
            #modal-world-chat .chat-conversation-head {
                margin: 2px 0 6px !important;
                padding: 7px 9px !important;
                border-radius: 12px !important;
                box-shadow: none !important;
            }
            #modal-world-chat .chat-conversation-head > strong {
                margin-bottom: 1px !important;
                font-size: .9rem !important;
                line-height: 1.18 !important;
            }
            #modal-world-chat .chat-conversation-head > small {
                display: block !important;
                font-size: .67rem !important;
                line-height: 1.2 !important;
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
            }
            #modal-world-chat .chat-resolution {
                margin-top: 5px !important;
                padding: 5px 7px !important;
                border-radius: 8px !important;
                border-left-width: 2px !important;
                font-size: .68rem !important;
                line-height: 1.22 !important;
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
            }
            #modal-world-chat .chat-resolution + .chat-resolution {
                display: none !important;
            }
            #modal-world-chat .chat-participant-chips {
                flex-wrap: nowrap !important;
                overflow-x: auto !important;
                gap: 5px !important;
                margin-top: 6px !important;
                scrollbar-width: none !important;
            }
            #modal-world-chat .chat-participant-chips::-webkit-scrollbar {
                display: none !important;
            }
            #modal-world-chat .chat-participant-chips > span {
                flex: 0 0 auto !important;
                min-height: 28px !important;
                padding: 2px 7px 2px 2px !important;
                gap: 5px !important;
                font-size: .64rem !important;
            }
            #modal-world-chat .participant-portrait {
                width: 24px !important;
                height: 24px !important;
                min-width: 24px !important;
            }
            #modal-world-chat .chat-messages {
                min-height: 300px !important;
                max-height: 58dvh !important;
                padding: 8px 7px !important;
                border-radius: 14px !important;
            }
            #modal-world-chat .chat-message {
                gap: 7px !important;
                margin-bottom: 9px !important;
            }
            #modal-world-chat .chat-avatar {
                flex-basis: 42px !important;
                width: 42px !important;
                height: 42px !important;
                border-radius: 13px !important;
                border-width: 1px !important;
                box-shadow: none !important;
            }
            #modal-world-chat .chat-avatar img,
            #modal-world-chat .chat-avatar .portrait-image {
                border-radius: 12px !important;
            }
            #modal-world-chat .chat-bubble {
                max-width: calc(100% - 49px) !important;
                padding: 8px 10px 9px !important;
                border-radius: 14px 14px 14px 5px !important;
                box-shadow: none !important;
                font-size: .92rem !important;
                line-height: 1.34 !important;
            }
            #modal-world-chat .chat-message.player .chat-bubble {
                border-radius: 14px 14px 5px 14px !important;
            }
            #modal-world-chat .chat-speaker {
                gap: 4px !important;
                margin-bottom: 3px !important;
                font-size: .68rem !important;
            }
            #modal-world-chat .chat-act-badge {
                padding: 1px 5px !important;
                font-size: .56rem !important;
            }
            #modal-world-chat .chat-compose {
                grid-template-columns: minmax(0,1fr) 44px !important;
                gap: 6px !important;
                margin-top: 6px !important;
                padding: 7px 0 1px !important;
            }
            #modal-world-chat #chat-input {
                min-height: 44px !important;
                padding: 8px 12px !important;
                border-radius: 13px !important;
            }
            #modal-world-chat #btn-send-chat {
                min-width: 44px !important;
                min-height: 44px !important;
                border-radius: 13px !important;
                box-shadow: none !important;
            }

            @media (max-width: 620px) {
                #modal-world-chat .chat-modal {
                    height: calc(100dvh - 6px) !important;
                    max-height: calc(100dvh - 6px) !important;
                    border-radius: 18px 18px 0 0 !important;
                }
                #modal-world-chat .modal-header {
                    min-height: 50px !important;
                    padding: 7px 10px !important;
                }
                #modal-world-chat .modal-body {
                    padding: 6px 7px calc(7px + env(safe-area-inset-bottom)) !important;
                }
                #modal-world-chat .chat-tools {
                    gap: 4px !important;
                    margin-bottom: 5px !important;
                }
                #modal-world-chat .chat-tool-btn {
                    min-height: 34px !important;
                    padding: 4px !important;
                    border-radius: 9px !important;
                    font-size: .62rem !important;
                }
                #modal-world-chat .chat-thread {
                    flex-basis: min(205px, 62vw) !important;
                    min-height: 48px !important;
                    padding: 6px 8px !important;
                }
                #modal-world-chat .chat-conversation-head {
                    padding: 6px 8px !important;
                    margin-bottom: 5px !important;
                }
                #modal-world-chat .chat-participant-chips {
                    margin-top: 5px !important;
                }
                #modal-world-chat .chat-messages {
                    min-height: 320px !important;
                    max-height: 62dvh !important;
                    padding: 7px 6px !important;
                }
                #modal-world-chat .chat-avatar {
                    flex-basis: 38px !important;
                    width: 38px !important;
                    height: 38px !important;
                    border-radius: 12px !important;
                }
                #modal-world-chat .chat-avatar img,
                #modal-world-chat .chat-avatar .portrait-image {
                    border-radius: 11px !important;
                }
                #modal-world-chat .chat-bubble {
                    max-width: calc(100% - 44px) !important;
                    padding: 7px 9px 8px !important;
                    font-size: .9rem !important;
                    line-height: 1.31 !important;
                }
                #modal-world-chat .chat-act-badge {
                    display: none !important;
                }
            }

            @media (max-width: 390px) {
                #modal-world-chat .modal-header {
                    font-size: .88rem !important;
                }
                #modal-world-chat .chat-tool-btn {
                    font-size: .58rem !important;
                }
                #modal-world-chat .chat-thread {
                    flex-basis: min(190px, 60vw) !important;
                }
                #modal-world-chat .chat-conversation-head > strong {
                    font-size: .84rem !important;
                }
                #modal-world-chat .chat-bubble {
                    font-size: .88rem !important;
                }
            }
        `;
    }

    function install(documentRef) {
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return false;
        const style = documentRef.createElement('style');
        style.id = STYLE_ID;
        style.textContent = cssText();
        documentRef.head.appendChild(style);
        return true;
    }

    if (typeof document !== 'undefined') install(document);

    return {
        version: PATCH_VERSION,
        cssText,
        install
    };
});
