(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheWorldMapV10MobileFix = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-world-map-v10-mobile-fix-style';
    let observer = null;

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 300) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    function hashNumber(value) {
        let hash = 2166136261;
        const text = String(value || '');
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function isSite(location) {
        return /property|business|resource/.test(clean(location?.kind, 40));
    }

    function spreadLocations(model) {
        const locations = asArray(model?.locations).filter(item => Number.isFinite(Number(item?.x)) && Number.isFinite(Number(item?.y)));
        if (locations.length < 2) return model;
        const width = Number(model.width) || 960;
        const height = Number(model.height) || 620;
        const anchors = new Map(locations.map(item => [item.id, { x: Number(item.x), y: Number(item.y) }]));

        for (let iteration = 0; iteration < 34; iteration++) {
            for (let leftIndex = 0; leftIndex < locations.length; leftIndex++) {
                for (let rightIndex = leftIndex + 1; rightIndex < locations.length; rightIndex++) {
                    const left = locations[leftIndex];
                    const right = locations[rightIndex];
                    let dx = Number(right.x) - Number(left.x);
                    let dy = Number(right.y) - Number(left.y);
                    const leftSite = isSite(left);
                    const rightSite = isSite(right);
                    const minX = leftSite && rightSite ? 48 : (leftSite || rightSite ? 62 : 82);
                    const minY = leftSite && rightSite ? 42 : (leftSite || rightSite ? 50 : 64);
                    let normalized = Math.sqrt((dx * dx) / (minX * minX) + (dy * dy) / (minY * minY));
                    if (normalized >= 1) continue;
                    if (Math.abs(dx) + Math.abs(dy) < 0.5) {
                        const angle = (hashNumber(`${left.name}|${right.name}`) % 360) * Math.PI / 180;
                        dx = Math.cos(angle) || 0.7;
                        dy = Math.sin(angle) || 0.7;
                        normalized = 0.02;
                    }
                    const distance = Math.max(1, Math.hypot(dx, dy));
                    const force = (1 - normalized) * (iteration < 10 ? 12 : 7);
                    const ux = dx / distance;
                    const uy = dy / distance;
                    const leftWeight = left.current ? 0.22 : (leftSite ? 0.42 : 0.5);
                    const rightWeight = right.current ? 0.22 : (rightSite ? 0.42 : 0.5);
                    left.x -= ux * force * leftWeight;
                    left.y -= uy * force * leftWeight;
                    right.x += ux * force * rightWeight;
                    right.y += uy * force * rightWeight;
                }
            }

            locations.forEach(location => {
                const anchor = anchors.get(location.id);
                if (!anchor) return;
                const spring = location.current ? 0.16 : (location._geoExplicit ? 0.045 : 0.02);
                location.x += (anchor.x - location.x) * spring;
                location.y += (anchor.y - location.y) * spring;
                location.x = Math.round(clamp(location.x, 52, width - 52));
                location.y = Math.round(clamp(location.y, 52, height - 66));
            });
        }
        return model;
    }

    function rebuildDerivedLayers(model, world, memory, context) {
        const v10 = root.CronacheWorldMapV10;
        if (!v10 || !model) return model;
        if (typeof v10.buildPoliticalZones === 'function') model.politicalZones = v10.buildPoliticalZones(model, world);
        if (typeof v10.buildRegionLabels === 'function') model.regionLabels = v10.buildRegionLabels(model);
        if (typeof v10.buildLiveSignals === 'function') model.liveSignals = v10.buildLiveSignals(model, memory, context);
        return model;
    }

    function wrapMapModel() {
        const map = root.CronacheWorldMap;
        if (!map || typeof map.buildMapModel !== 'function') return false;
        const original = map.buildMapModel;
        if (original.__worldMapV10MobileFixWrapped) return true;
        const wrapped = function buildMapModelMobileDeclutter(input = {}, context = {}) {
            const model = original.call(this, input, context);
            spreadLocations(model);
            const world = input?.world || input || {};
            const memory = input?.memory || {};
            rebuildDerivedLayers(model, world, memory, context);
            return model;
        };
        wrapped.__worldMapV10MobileFixWrapped = true;
        // Keep the v10 marker so its delayed installer does not wrap this function a second time.
        wrapped.__worldMapV10Wrapped = true;
        wrapped.__worldMapV10Original = original.__worldMapV10Original || original;
        map.buildMapModel = wrapped;
        return true;
    }

    function cssText() {
        return `
/* The base stylesheet targets every direct child div of .world-map-status as a grid.
   This selector deliberately wins and restores the v10 toolbar to one horizontal row. */
.world-map-status > .world-map-v10-layerbar{
    display:flex!important;
    grid-template-columns:none!important;
    grid-auto-flow:column!important;
    align-items:center!important;
    flex-wrap:nowrap!important;
    width:100%!important;
    max-width:100%!important;
}
.world-map-status > .world-map-v10-layerbar .world-map-v10-layer,
.world-map-status > .world-map-v10-layerbar .world-map-v10-reset{
    width:auto!important;
    min-width:max-content!important;
    max-width:none!important;
}
.world-map-position.map-v10-position-unknown{display:none!important}

@media(max-width:760px){
    .world-map-status{gap:6px!important;padding:8px 9px!important}
    .world-map-status > div:first-child{gap:1px!important;min-width:0!important;flex:1 1 0!important}
    .world-map-status strong{font-size:.82rem!important}
    .world-map-status small{font-size:.65rem!important;line-height:1.25!important}
    .world-map-v10-layerbar{gap:5px!important;padding-top:5px!important;overflow-x:auto!important;overscroll-behavior-x:contain!important}
    .world-map-v10-breadcrumb{flex:0 1 auto!important;max-width:52vw!important;overflow:hidden!important;text-overflow:ellipsis!important;font-size:.58rem!important}
    .world-map-v10-layer,.world-map-v10-reset{min-height:29px!important;padding:4px 8px!important;font-size:.56rem!important;border-radius:999px!important}

    /* On a phone political/region text competes with place names. Keep the zones, hide only their big labels. */
    #modal-world-map .world-map-political-zone > text,
    #modal-world-map .world-map-region-labels{display:none!important}
    #modal-world-map .world-map-node-label{font-size:12px!important;stroke-width:4px!important}
    #modal-world-map .world-map-node.site:not(.current):not(.selected) .world-map-node-label{display:none!important}
    #modal-world-map .world-map-node.site .world-map-node-ring{r:14px}
    #modal-world-map .world-map-live-signal circle{r:11px}
    #modal-world-map .world-map-live-signal text{font-size:11px!important}
}

@media(max-width:430px){
    .world-map-v10-breadcrumb{max-width:46vw!important}
    .world-map-v10-layer,.world-map-v10-reset{padding:4px 7px!important;font-size:.52rem!important}
    #modal-world-map .world-map-node-label{font-size:11px!important}
    #modal-world-map .world-map-node.site:not(.current):not(.selected) .world-map-node-label{display:none!important}
}
`;
    }

    function ensureStyles(doc) {
        if (!doc || doc.getElementById(STYLE_ID)) return;
        const style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = cssText();
        (doc.head || doc.documentElement).appendChild(style);
    }

    function repairStatus(doc) {
        const position = doc?.querySelector('#modal-world-map .world-map-position');
        if (!position) return;
        const text = clean(position.textContent, 120).toLowerCase();
        position.classList.toggle('map-v10-position-unknown', /sconosciut|unknown/.test(text));
    }

    function markMajorNodes(doc) {
        const model = root.CronacheWorldMapV10?.runtime?.lastModel;
        if (!doc || !model) return;
        const byId = new Map(asArray(model.locations).map(item => [item.id, item]));
        doc.querySelectorAll('#modal-world-map .world-map-node').forEach(node => {
            const location = byId.get(node.dataset.mapLocationId);
            if (!location) return;
            const type = clean(location.type, 80).toLowerCase();
            const major = Boolean(location.current || location.objectiveIds?.length || location.hostileFactionIds?.length || /capital|capitale|city|citta|città|port|porto|castle|castello|fortress|fortezza/.test(type));
            node.classList.toggle('map-v10-major', major);
            node.classList.toggle('map-v10-minor', !major);
        });
    }

    function refreshDom(doc) {
        repairStatus(doc);
        markMajorNodes(doc);
    }

    function observe(doc) {
        if (!doc || observer || typeof MutationObserver === 'undefined') return;
        observer = new MutationObserver(() => refreshDom(doc));
        observer.observe(doc.documentElement || doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    function install(doc = typeof document !== 'undefined' ? document : null) {
        const patched = wrapMapModel();
        if (doc) {
            ensureStyles(doc);
            refreshDom(doc);
            observe(doc);
        }
        root.__cronacheWorldMapV10MobileFixVersion = PATCH_VERSION;
        return patched || Boolean(doc);
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(document), { once: true });
        else install(document);
        if (typeof root.setTimeout === 'function') [80, 300, 900, 1800].forEach(delay => root.setTimeout(() => install(document), delay));
    }

    return { PATCH_VERSION, spreadLocations, rebuildDerivedLayers, cssText, install };
});