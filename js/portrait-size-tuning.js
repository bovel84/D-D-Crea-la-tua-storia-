(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronachePortraitSizeTuning = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const PATCH_VERSION = 2;
    const STYLE_ID = 'cronache-portrait-size-tuning-style';

    function cssText() {
        return `
            /* Il pulsante reale è #btn-top-character: il ritratto deve riempire il medaglione. */
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
            /* Neutralizza il vecchio limite da 42px introdotto dal dossier NPC. */
            body.npc-dossiers-ready #btn-top-character #topbar-protagonist-portrait {
                width: 100% !important;
                height: 100% !important;
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
        style.textContent = cssText();
        documentRef.body?.classList.add('portrait-size-tuning-ready');
        if (root) root.__cronachePortraitSizeTuningVersion = PATCH_VERSION;
        return true;
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => install(document), { once: true });
        } else install(document);
    }

    return { PATCH_VERSION, STYLE_ID, cssText, install };
});
