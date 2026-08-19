(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronachePortraitSizeTuning = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-portrait-size-tuning-style';

    function cssText() {
        return `
            /* Il protagonista deve riempire il grande pulsante centrale, non restare una miniatura. */
            body #btn-character {
                padding: 5px !important;
                overflow: hidden;
            }
            body #btn-character #topbar-protagonist-portrait {
                width: clamp(64px, 17vw, 74px) !important;
                height: clamp(64px, 17vw, 74px) !important;
                min-width: 64px;
                min-height: 64px;
                display: block;
                margin: 0;
                overflow: hidden;
                border-radius: 50% !important;
                background: #2b1b12;
                box-shadow: inset 0 0 0 2px rgba(255,244,204,.35), 0 3px 10px rgba(0,0,0,.22);
            }
            body #btn-character #topbar-protagonist-portrait img.portrait-image,
            body #btn-character #topbar-protagonist-portrait img.portrait-photo {
                display: block;
                width: 100% !important;
                height: 100% !important;
                max-width: none !important;
                max-height: none !important;
                margin: 0 !important;
                border-radius: 50% !important;
                object-fit: cover !important;
                object-position: 50% 24% !important;
                transform: none !important;
            }
            @media (max-width: 380px) {
                body #btn-character { padding: 4px !important; }
                body #btn-character #topbar-protagonist-portrait {
                    width: 62px !important;
                    height: 62px !important;
                    min-width: 62px;
                    min-height: 62px;
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
