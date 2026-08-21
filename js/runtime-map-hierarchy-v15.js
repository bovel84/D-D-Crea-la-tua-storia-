(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheRuntimeMapHierarchyV15 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-runtime-map-hierarchy-v15-style';
    let observer = null;
    let queued = false;

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 240) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const keyOf = value => clean(value, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    function isMobile(doc) {
        const view = doc?.defaultView || root;
        if (typeof view?.matchMedia === 'function') return view.matchMedia('(max-width: 760px)').matches;
        return Number(view?.innerWidth || 0) > 0 && Number(view.innerWidth) <= 760;
    }

    function stabilizeBusinessRecovery() {
        const fn = root.CronacheBusiness?.BusinessManager?.prototype?.applyNarrativeEvents;
        if (!fn || !fn.__runtimeFixV14PrototypeWrapped) return false;
        // business-narrative-recovery has delayed installers. Preserve its marker on the
        // final v14 wrapper so those retries do not wrap the same call chain repeatedly.
        fn.__businessNarrativeRecoveryV2Wrapped = true;
        return true;
    }

    function hierarchyGroups(model, level, scopeName = '') {
        const locations = asArray(model?.locations).filter(item => item && Number.isFinite(Number(item.x)) && Number.isFinite(Number(item.y)));
        let source = locations;
        let field = '';
        let nextLevel = '';
        if (level === 'world') {
            field = 'continent';
            nextLevel = 'continent';
        } else if (level === 'continent') {
            source = locations.filter(item => keyOf(item.continent) === keyOf(scopeName));
            field = 'nation';
            nextLevel = 'nation';
        } else if (level === 'nation') {
            source = locations.filter(item => keyOf(item.nation) === keyOf(scopeName));
            field = 'region';
            nextLevel = 'region';
        } else return [];

        const grouped = new Map();
        source.forEach(location => {
            const value = clean(location?.[field], 120);
            if (!value) return;
            const key = keyOf(value);
            if (!grouped.has(key)) grouped.set(key, { key, value, label: value, nextLevel, locations: [] });
            grouped.get(key).locations.push(location);
        });

        return Array.from(grouped.values()).map(group => {
            const x = group.locations.reduce((sum, item) => sum + Number(item.x), 0) / group.locations.length;
            const y = group.locations.reduce((sum, item) => sum + Number(item.y), 0) / group.locations.length;
            const representative = group.locations.find(item => item.current) || group.locations[0];
            return {
                ...group,
                x: Math.round(x),
                y: Math.round(y),
                count: group.locations.length,
                representativeId: representative?.id || ''
            };
        });
    }

    function iconFor(nextLevel) {
        if (nextLevel === 'continent') return '◎';
        if (nextLevel === 'nation') return '⚑';
        if (nextLevel === 'region') return '◆';
        return '●';
    }

    function render(doc) {
        if (!doc || !isMobile(doc)) return false;
        const modal = doc.getElementById('modal-world-map');
        const svg = doc.querySelector('#world-map-canvas .world-map-svg');
        const model = root.CronacheWorldMapV10?.runtime?.lastModel;
        const runtime = root.CronacheWorldMapV11Levels?.runtime;
        if (!modal?.classList.contains('active') || !svg || !model || !runtime || runtime.level === 'interior') return false;

        const groups = hierarchyGroups(model, runtime.level, runtime.scopeName);
        const signature = `${runtime.level}|${runtime.scopeName}|` + groups
            .map(group => `${group.nextLevel}:${group.key}:${group.x}:${group.y}:${group.count}`).join('|');
        const existing = svg.querySelector('.map-v15-hierarchy-layer');

        if (!groups.length) {
            existing?.remove();
            modal.classList.remove('map-v15-aggregate-level');
            return true;
        }
        modal.classList.add('map-v15-aggregate-level');
        if (existing?.dataset.signature === signature) return true;
        existing?.remove();

        const ns = 'http://www.w3.org/2000/svg';
        const layer = doc.createElementNS(ns, 'g');
        layer.setAttribute('class', 'map-v15-hierarchy-layer');
        layer.dataset.signature = signature;

        groups.forEach(group => {
            const node = doc.createElementNS(ns, 'g');
            node.setAttribute('class', `map-v15-hierarchy-node level-${group.nextLevel}`);
            node.setAttribute('transform', `translate(${group.x} ${group.y})`);
            node.setAttribute('role', 'button');
            node.setAttribute('tabindex', '0');
            node.setAttribute('aria-label', `${group.label}, apri livello ${group.nextLevel}`);
            node.dataset.mapV15NextLevel = group.nextLevel;
            node.dataset.mapV15Value = group.value;
            node.dataset.mapV15Representative = group.representativeId;

            const halo = doc.createElementNS(ns, 'circle');
            halo.setAttribute('class', 'map-v15-hierarchy-halo');
            halo.setAttribute('r', '38');
            const ring = doc.createElementNS(ns, 'circle');
            ring.setAttribute('class', 'map-v15-hierarchy-ring');
            ring.setAttribute('r', '28');
            const icon = doc.createElementNS(ns, 'text');
            icon.setAttribute('class', 'map-v15-hierarchy-icon');
            icon.setAttribute('text-anchor', 'middle');
            icon.setAttribute('dominant-baseline', 'central');
            icon.textContent = iconFor(group.nextLevel);
            const label = doc.createElementNS(ns, 'text');
            label.setAttribute('class', 'map-v15-hierarchy-label');
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('y', '46');
            label.textContent = group.label;
            node.append(halo, ring, icon, label);
            layer.appendChild(node);
        });

        const nodesLayer = svg.querySelector('.world-map-nodes');
        if (nodesLayer?.parentNode) nodesLayer.parentNode.insertBefore(layer, nodesLayer);
        else svg.appendChild(layer);
        return true;
    }

    function queueRender(doc) {
        if (queued) return;
        queued = true;
        const run = () => {
            queued = false;
            stabilizeBusinessRecovery();
            render(doc);
        };
        if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(run);
        else if (typeof root.setTimeout === 'function') root.setTimeout(run, 0);
        else run();
    }

    function openGroup(doc, node) {
        const levels = root.CronacheWorldMapV11Levels;
        const model = root.CronacheWorldMapV10?.runtime?.lastModel;
        if (!levels?.runtime || !model || !node) return false;
        levels.runtime.level = clean(node.dataset.mapV15NextLevel, 30) || 'world';
        levels.runtime.scopeName = clean(node.dataset.mapV15Value, 160);
        levels.runtime.selectedLocationId = clean(node.dataset.mapV15Representative, 160) || levels.runtime.selectedLocationId;
        const svg = doc.querySelector('#world-map-canvas .world-map-svg');
        if (svg) {
            delete svg.dataset.mapGestureManual;
            delete svg.dataset.mapGestureViewBox;
        }
        if (typeof levels.install === 'function') levels.install(doc);
        root.CronacheRuntimeFixesV14?.applyMapLevelView?.(doc, true);
        queueRender(doc);
        return true;
    }

    function bind(doc) {
        if (!doc || doc.documentElement?.dataset.runtimeMapHierarchyV15Bound === '1') return;
        if (doc.documentElement) doc.documentElement.dataset.runtimeMapHierarchyV15Bound = '1';
        doc.addEventListener('click', event => {
            const node = event.target?.closest?.('[data-map-v15-next-level]');
            if (node) {
                event.preventDefault();
                event.stopPropagation();
                openGroup(doc, node);
                return;
            }
            if (event.target?.closest?.('[data-map-v11-level],[data-map-region],.world-map-v10-reset')) {
                if (typeof root.setTimeout === 'function') root.setTimeout(() => queueRender(doc), 30);
                else queueRender(doc);
            }
        }, true);
        doc.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const node = event.target?.closest?.('[data-map-v15-next-level]');
            if (!node) return;
            event.preventDefault();
            openGroup(doc, node);
        });
    }

    function observe(doc) {
        if (!doc || observer || typeof MutationObserver === 'undefined') return;
        observer = new MutationObserver(mutations => {
            const relevant = mutations.some(mutation => !mutation.target?.closest?.('.map-v15-hierarchy-layer'));
            if (relevant) queueRender(doc);
        });
        observer.observe(doc.documentElement || doc.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'data-map-level', 'data-map-v10-location']
        });
    }

    function ensureStyles(doc) {
        if (!doc || doc.getElementById(STYLE_ID)) return;
        const style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
@media(max-width:760px){
  #modal-world-map.map-v15-aggregate-level .world-map-node{opacity:0!important;pointer-events:none!important}
  #modal-world-map .map-v15-hierarchy-node{cursor:pointer;outline:none}
  #modal-world-map .map-v15-hierarchy-halo{fill:rgba(255,216,92,.18);stroke:rgba(255,232,146,.58);stroke-width:3}
  #modal-world-map .map-v15-hierarchy-ring{fill:#842a31;stroke:#ffd85a;stroke-width:6;filter:url(#map-shadow)}
  #modal-world-map .map-v15-hierarchy-icon{fill:#fff8d9;font:700 22px Georgia,serif;pointer-events:none}
  #modal-world-map .map-v15-hierarchy-label{fill:#5a251f;paint-order:stroke;stroke:rgba(248,233,185,.97);stroke-width:5px;stroke-linejoin:round;font:700 14px 'Cinzel',Georgia,serif;pointer-events:none}
  #modal-world-map .map-v15-hierarchy-node:focus-visible .map-v15-hierarchy-ring{stroke-width:9}
}`;
        (doc.head || doc.documentElement).appendChild(style);
    }

    function install(doc = typeof document !== 'undefined' ? document : null) {
        stabilizeBusinessRecovery();
        if (doc) {
            ensureStyles(doc);
            bind(doc);
            observe(doc);
            queueRender(doc);
        }
        if (typeof root.setTimeout === 'function') [80, 250, 700, 1500].forEach(delay => root.setTimeout(() => {
            stabilizeBusinessRecovery();
            if (doc) queueRender(doc);
        }, delay));
        root.__cronacheRuntimeMapHierarchyV15Version = PATCH_VERSION;
        return true;
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(document), { once: true });
        else install(document);
    }

    return { PATCH_VERSION, hierarchyGroups, stabilizeBusinessRecovery, render, openGroup, install };
});