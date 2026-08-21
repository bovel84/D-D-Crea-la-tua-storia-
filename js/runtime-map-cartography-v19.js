(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheRuntimeMapCartographyV19 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 2;

    function cleanup(doc = typeof document !== 'undefined' ? document : null) {
        if (!doc) return false;
        const modal = doc.getElementById('modal-world-map');
        if (modal?.classList.contains('map-v19-clean-cartography')) {
            modal.classList.remove('map-v19-clean-cartography');
        }
        if (modal?.hasAttribute('data-map-v19-level')) {
            modal.removeAttribute('data-map-v19-level');
        }
        doc.querySelectorAll('#modal-world-map .map-v19-cartography-layer').forEach(node => node.remove());
        return true;
    }

    function install(doc = typeof document !== 'undefined' ? document : null) {
        cleanup(doc);
        root.__cronacheRuntimeMapCartographyV19Version = PATCH_VERSION;
        return true;
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => install(document), { once: true });
        } else {
            install(document);
        }
    }

    return { PATCH_VERSION, cleanup, install };
});