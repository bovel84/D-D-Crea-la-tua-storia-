(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheWorldMapV10LocalPlaces = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 2;
    const STYLE_ID = 'cronache-world-map-v10-local-places-style';
    let observer = null;

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 400) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const keyOf = value => clean(value, 700).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    function isInteriorLike(location) {
        const corpus = keyOf(`${location?.name || ''} ${location?.type || ''}`);
        return /(?:^|-)(?:sala|salone|stanza|camera|corridoio|cortile|cucina|cucine|scuderia|scuderie|biblioteca|studio|cappella|prigione|prigioni|sotterraneo|sotterranei|cantina|cantine|giardino|giardini|torre|torri|mastio|atrio|loggia|appartamento|appartamenti)(?:-|$)/.test(corpus);
    }

    function isParentStructure(location) {
        const corpus = keyOf(`${location?.name || ''} ${location?.type || ''}`);
        return /castell|rocca|fortez|palazz|villa|tenuta|abbazi|monaster|chiesa|santuar|locanda|taverna|osteria|casa|dimora|maniero|cittadella/.test(corpus);
    }

    function parentScore(child, parent) {
        if (!child || !parent || child.id === parent.id || !isParentStructure(parent)) return 0;
        const childKey = keyOf(child.name);
        const parentKey = keyOf(parent.name);
        if (!childKey || !parentKey) return 0;
        let score = 0;
        if (childKey.includes(parentKey) && childKey !== parentKey) score += 10;
        if (keyOf(child.region) === parentKey) score += 8;
        if (asArray(child.connections).some(value => keyOf(value) === parentKey)) score += 7;
        const description = keyOf(child.description);
        if (description && description.includes(parentKey)) score += 5;
        const parentRegion = keyOf(parent.region);
        if (parentRegion && parentRegion === keyOf(child.region)) score += 1;
        return score;
    }

    function findParent(child, locations) {
        if (!isInteriorLike(child)) return null;
        return locations
            .map(parent => ({ parent, score: parentScore(child, parent) }))
            .filter(item => item.score >= 7)
            .sort((a, b) => b.score - a.score || keyOf(b.parent.name).length - keyOf(a.parent.name).length)[0]?.parent || null;
    }

    function mergeIds(left, right) {
        return [...new Set([...asArray(left), ...asArray(right)].filter(Boolean))];
    }

    function remapEdges(edges, parentByChild) {
        const seen = new Set();
        const out = [];
        asArray(edges).forEach(edge => {
            const from = parentByChild.get(edge.from)?.id || edge.from;
            const to = parentByChild.get(edge.to)?.id || edge.to;
            if (!from || !to || from === to) return;
            const signature = [from, to].sort().join('|');
            if (seen.has(signature)) return;
            seen.add(signature);
            out.push({ ...edge, from, to });
        });
        return out;
    }

    function rebuildStaticLayers(model, world) {
        const v10 = root.CronacheWorldMapV10;
        if (typeof v10?.buildPoliticalZones === 'function') model.politicalZones = v10.buildPoliticalZones(model, world);
        if (typeof v10?.buildRegionLabels === 'function') model.regionLabels = v10.buildRegionLabels(model);
        const mobile = root.CronacheWorldMapV10MobileLayout;
        if (typeof mobile?.buildRegionZones === 'function') model.regionZones = mobile.buildRegionZones(model);
        return model;
    }

    function collapseLocalPlaces(model, world = {}, memory = {}, context = {}) {
        if (!model || !Array.isArray(model.locations) || model.locations.length < 2) return model;
        const original = model.locations.slice();
        const parentByChild = new Map();

        original.forEach(child => {
            const parent = findParent(child, original);
            if (!parent) return;
            parentByChild.set(child.id, parent);
            parent.subLocations = asArray(parent.subLocations);
            if (!parent.subLocations.some(item => keyOf(item.name) === keyOf(child.name))) {
                parent.subLocations.push({ id: child.id, name: child.name, type: child.type || '', current: Boolean(child.current) });
            }
            parent.objectiveIds = mergeIds(parent.objectiveIds, child.objectiveIds);
            parent.factionIds = mergeIds(parent.factionIds, child.factionIds);
            parent.hostileFactionIds = mergeIds(parent.hostileFactionIds, child.hostileFactionIds);
            parent.owned = Boolean(parent.owned || child.owned);
            if (child.current) {
                parent.current = true;
                parent.currentInteriorName = child.name;
                parent.fogState = 'visible';
                parent.discovered = true;
                model.currentLocationId = parent.id;
            }
        });

        if (!parentByChild.size) return model;

        model.locations = original.filter(location => !parentByChild.has(location.id));
        model.edges = remapEdges(model.edges, parentByChild);

        asArray(model.liveSignals).forEach(signal => {
            const parent = parentByChild.get(signal.locationId);
            if (!parent) return;
            signal.locationId = parent.id;
            signal.x = Number(parent.x) + 24;
            signal.y = Number(parent.y) - 34;
        });
        asArray(model.hostileMarkers).forEach(marker => {
            const parent = parentByChild.get(marker.locationId);
            if (!parent) return;
            marker.locationId = parent.id;
            marker.locationName = parent.name;
            marker.x = Number(parent.x) + 28;
            marker.y = Number(parent.y) - 34;
        });

        rebuildStaticLayers(model, world);
        const runtime = root.CronacheWorldMapV10?.runtime;
        if (runtime) runtime.lastModel = model;
        return model;
    }

    function wrapMapModel() {
        const map = root.CronacheWorldMap;
        if (!map || typeof map.buildMapModel !== 'function') return false;
        const original = map.buildMapModel;
        if (original.__worldMapLocalPlacesWrapped) return true;
        const wrapped = function buildMapModelWithLocalHierarchy(input = {}, context = {}) {
            const model = original.call(this, input, context);
            const world = input?.world || input || {};
            const memory = input?.memory || {};
            return collapseLocalPlaces(model, world, memory, context);
        };
        wrapped.__worldMapLocalPlacesWrapped = true;
        wrapped.__worldMapV10Wrapped = true;
        wrapped.__worldMapV10MobileFixWrapped = true;
        wrapped.__worldMapMobileLayoutWrapped = true;
        wrapped.__worldMapV10Original = original.__worldMapV10Original || original;
        map.buildMapModel = wrapped;
        return true;
    }

    function canonicalRegionSet(model) {
        const regions = new Set();
        asArray(model?.hierarchy?.continents).forEach(continent =>
            asArray(continent?.nations).forEach(nation =>
                asArray(nation?.regions).forEach(region => {
                    const name = clean(region?.name, 120);
                    if (name) regions.add(keyOf(name));
                })
            )
        );
        return regions;
    }

    function cleanRegionNav(doc) {
        const model = root.CronacheWorldMapV10?.runtime?.lastModel;
        const nav = doc?.querySelector('#modal-world-map .world-map-mobile-nav');
        if (!model || !nav) return;
        const canonical = canonicalRegionSet(model);
        const buttons = [...nav.querySelectorAll('[data-map-region]')];
        if (canonical.size && buttons.some(button => canonical.has(keyOf(button.dataset.mapRegion)))) {
            buttons.forEach(button => {
                if (!canonical.has(keyOf(button.dataset.mapRegion))) button.remove();
            });
        }
        const labels = [...nav.querySelectorAll('.world-map-mobile-label')];
        labels.forEach(label => {
            if (/region/i.test(label.textContent || '') && !nav.querySelector('[data-map-region]')) label.remove();
            if (/minacc/i.test(label.textContent || '') && !nav.querySelector('[data-map-threat]')) label.remove();
        });
    }

    function decorateInteriorDetail(doc) {
        const model = root.CronacheWorldMapV10?.runtime?.lastModel;
        const detail = doc?.getElementById('world-map-detail');
        if (!model || !detail) return;
        const selectedId = detail.dataset.mapV10Location || model.currentLocationId;
        const location = asArray(model.locations).find(item => item.id === selectedId)
            || asArray(model.locations).find(item => item.current);
        detail.querySelector('.world-map-local-position')?.remove();
        if (!location?.currentInteriorName) return;
        const box = doc.createElement('div');
        box.className = 'world-map-local-position';
        box.innerHTML = `<b>Dentro ${clean(location.name, 100)}</b><span>📍 ${clean(location.currentInteriorName, 140)}</span>`;
        const context = detail.querySelector('.world-map-v10-context');
        if (context) context.before(box);
        else detail.appendChild(box);
    }

    function cssText() {
        return `
.world-map-local-position{margin:7px 0;padding:7px 9px;border-radius:9px;background:rgba(255,255,255,.46);border-left:3px solid #8b6914;color:#5d4938;font-size:.7rem}
.world-map-local-position b{display:block;color:#3f2c1e;font:700 .58rem 'Cinzel',serif;text-transform:uppercase}
.world-map-local-position span{display:block;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:760px){
  #modal-world-map .world-map-node.current .world-map-node-label{display:block!important}
  #modal-world-map .world-map-node.current .world-map-node-ring{filter:none!important}
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

    function refresh(doc) {
        cleanRegionNav(doc);
        decorateInteriorDetail(doc);
    }

    function observe(doc) {
        if (!doc || observer || typeof MutationObserver === 'undefined') return;
        observer = new MutationObserver(() => {
            if (doc.getElementById('modal-world-map')?.classList.contains('active')) refresh(doc);
        });
        observer.observe(doc.documentElement || doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-map-v10-location'] });
    }

    function install(doc = typeof document !== 'undefined' ? document : null) {
        const patched = wrapMapModel();
        if (doc) {
            ensureStyles(doc);
            refresh(doc);
            observe(doc);
        }
        root.__cronacheWorldMapV10LocalPlacesVersion = PATCH_VERSION;
        return patched || Boolean(doc);
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(document), { once: true });
        else install(document);
        if (typeof root.setTimeout === 'function') [80, 300, 900, 1800, 3200].forEach(delay => root.setTimeout(() => install(document), delay));
    }

    return {
        PATCH_VERSION,
        isInteriorLike,
        isParentStructure,
        parentScore,
        findParent,
        collapseLocalPlaces,
        canonicalRegionSet,
        cssText,
        install
    };
});