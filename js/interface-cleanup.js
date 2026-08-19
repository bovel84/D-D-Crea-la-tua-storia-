(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheInterfaceCleanup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 2;
    const STYLE_ID = 'cronache-interface-cleanup-style';

    function installStyles(documentRef) {
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
        const style = documentRef.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            /* Timeline pulita: la coda interna "Eventi in corso" non è parte della cronologia visibile. */
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
        `;
        documentRef.head.appendChild(style);
    }

    function install(documentRef) {
        if (!documentRef) return false;
        installStyles(documentRef);
        const agenda = documentRef.getElementById('timeline-agenda');
        if (agenda) {
            agenda.setAttribute('aria-hidden', 'true');
            agenda.setAttribute('data-ui-hidden', 'pending-events');
        }
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
