(function (root) {
    'use strict';
    const STYLE_ID = 'cronache-management-layout-style';
    function install(documentRef) {
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return false;
        const style = documentRef.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .management-hub-ready #game-screen .input-area {
                grid-template-columns: repeat(4, minmax(0, 1fr));
                column-gap: clamp(7px, 2.5vw, 18px);
                row-gap: 7px;
            }
            .management-hub-ready #play-action-composer {
                grid-column: 1 / -1;
                width: 100%;
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
        `;
        documentRef.head.appendChild(style);
        return true;
    }
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(document), { once: true });
        else install(document);
    }
    root.CronacheManagementLayout = { install, STYLE_ID };
})(typeof globalThis !== 'undefined' ? globalThis : this);
