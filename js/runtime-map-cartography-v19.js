(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheRuntimeMapCartographyV19 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 3;
    const STYLE_ID = 'cronache-runtime-map-cartography-v19-style';
    let renderTimer = 0;

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 300) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    function isMobile(doc) {
        const view = doc?.defaultView || root;
        return typeof view?.matchMedia === 'function'
            ? view.matchMedia('(max-width: 760px)').matches
            : Number(view?.innerWidth || 0) <= 760;
    }

    function svgNode(doc, tag, attrs = {}) {
        const node = doc.createElementNS('http://www.w3.org/2000/svg', tag);
        Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, String(value)));
        return node;
    }

    function currentContext() {
        const model = root.CronacheWorldMapV10?.runtime?.lastModel || null;
        const runtime = root.CronacheWorldMapV11Levels?.runtime || null;
        if (!model || !runtime) return { model: null, runtime: null, anchor: null };
        const locations = asArray(model.locations);
        const anchor = locations.find(item => item?.id === runtime.selectedLocationId)
            || locations.find(item => item?.id === model.currentLocationId)
            || locations.find(item => item?.current)
            || null;
        return { model, runtime, anchor };
    }

    function siteBox(anchor, doc) {
        if (!anchor || !Number.isFinite(Number(anchor.x)) || !Number.isFinite(Number(anchor.y))) return null;
        const rect = doc?.getElementById('world-map-viewport')?.getBoundingClientRect?.();
        const aspect = rect?.width && rect?.height ? clamp(rect.width / rect.height, 0.5, 1.25) : 0.68;
        const height = 360;
        const width = height * aspect;
        return { x: Number(anchor.x) - width / 2, y: Number(anchor.y) - height / 2, width, height };
    }

    function setViewBox(svg, box) {
        if (!svg || !box || svg.dataset.mapGestureManual === '1') return;
        const value = [box.x, box.y, box.width, box.height]
            .map(number => Math.round(Number(number) * 100) / 100).join(' ');
        if (svg.getAttribute('viewBox') !== value) svg.setAttribute('viewBox', value);
        svg.dataset.mapV19ViewBox = value;
    }

    function buildSiteLayer(doc, anchor) {
        if (!anchor) return null;
        const x = Number(anchor.x);
        const y = Number(anchor.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const layer = svgNode(doc, 'g', { class: 'map-v19-cartography-layer' });
        layer.dataset.locationId = clean(anchor.id, 160);
        layer.appendChild(svgNode(doc, 'rect', {
            class: 'map-v19-paper', x: x - 245, y: y - 200, width: 490, height: 400, rx: 28
        }));
        [
            `M ${x - 270} ${y + 62} C ${x - 130} ${y + 15}, ${x + 95} ${y + 80}, ${x + 270} ${y + 30}`,
            `M ${x - 78} ${y - 225} C ${x - 55} ${y - 105}, ${x - 46} ${y + 55}, ${x - 10} ${y + 225}`,
            `M ${x + 128} ${y - 220} C ${x + 90} ${y - 85}, ${x + 96} ${y + 70}, ${x + 155} ${y + 215}`
        ].forEach((d, index) => layer.appendChild(svgNode(doc, 'path', {
            class: index === 0 ? 'map-v19-road-major' : 'map-v19-road-minor', d
        })));
        const blocks = [
            [-205,-145,82,58],[-105,-150,88,62],[35,-150,80,58],[135,-135,68,52],
            [-215,-55,90,58],[-105,-50,72,52],[52,-55,88,54],[150,-48,60,50],
            [-205,105,82,54],[-98,105,75,52],[48,102,90,56],[150,92,58,50]
        ];
        blocks.forEach(([dx, dy, width, height]) => layer.appendChild(svgNode(doc, 'rect', {
            class: 'map-v19-building', x: x + dx, y: y + dy, width, height, rx: 5
        })));
        layer.appendChild(svgNode(doc, 'rect', {
            class: 'map-v19-square', x: x - 46, y: y - 43, width: 92, height: 86, rx: 13
        }));
        return layer;
    }

    function cleanup(doc = typeof document !== 'undefined' ? document : null, restore = false) {
        if (!doc) return false;
        const modal = doc.getElementById('modal-world-map');
        modal?.classList.remove('map-v19-clean-cartography');
        modal?.removeAttribute('data-map-v19-level');
        doc.querySelectorAll('#modal-world-map .map-v19-cartography-layer').forEach(node => node.remove());
        if (restore && modal?.classList.contains('active')) {
            root.CronacheRuntimeFixesV14?.applyMapLevelView?.(doc, true);
        }
        return true;
    }

    function render(doc = typeof document !== 'undefined' ? document : null) {
        if (!doc || !isMobile(doc)) return false;
        const modal = doc.getElementById('modal-world-map');
        if (!modal?.classList.contains('active')) return false;
        const svg = doc.querySelector('#world-map-canvas .world-map-svg');
        const { runtime, anchor } = currentContext();
        if (!svg || !runtime || runtime.level === 'interior') return false;
        const level = clean(runtime.level, 30) || 'world';
        if (level !== 'site' && level !== 'region') {
            cleanup(doc, true);
            return true;
        }

        modal.classList.add('map-v19-clean-cartography');
        modal.dataset.mapV19Level = level;
        if (level === 'site' && anchor) {
            let layer = svg.querySelector('.map-v19-cartography-layer');
            if (!layer || layer.dataset.locationId !== clean(anchor.id, 160)) {
                layer?.remove();
                layer = buildSiteLayer(doc, anchor);
                const nodes = svg.querySelector('.world-map-nodes');
                if (layer && nodes?.parentNode) nodes.parentNode.insertBefore(layer, nodes);
                else if (layer) svg.appendChild(layer);
            }
            setViewBox(svg, siteBox(anchor, doc));
        } else {
            doc.querySelectorAll('#modal-world-map .map-v19-cartography-layer').forEach(node => node.remove());
        }
        return true;
    }

    function scheduleRender(doc, delay = 120) {
        if (!doc || typeof root.setTimeout !== 'function') return;
        if (renderTimer) root.clearTimeout?.(renderTimer);
        renderTimer = root.setTimeout(() => {
            renderTimer = 0;
            render(doc);
        }, Math.max(0, Number(delay) || 0));
    }

    function bind(doc) {
        if (!doc || doc.documentElement?.dataset.runtimeMapCartographyV19Bound === '3') return;
        if (doc.documentElement) doc.documentElement.dataset.runtimeMapCartographyV19Bound = '3';
        // Deliberately event-driven: no DOM observer and no render loop.
        doc.addEventListener('click', () => scheduleRender(doc, 120), false);
        const view = doc.defaultView || root;
        view?.addEventListener?.('orientationchange', () => scheduleRender(doc, 120), { passive: true });
    }

    function ensureStyles(doc) {
        if (!doc || doc.getElementById(STYLE_ID)) return;
        const style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
@media(max-width:760px){
  #modal-world-map.map-v19-clean-cartography .world-map-territories,
  #modal-world-map.map-v19-clean-cartography .world-map-region-zones,
  #modal-world-map.map-v19-clean-cartography .world-map-routes,
  #modal-world-map.map-v19-clean-cartography .world-map-story-terrain,
  #modal-world-map.map-v19-clean-cartography .world-map-grid,
  #modal-world-map.map-v19-clean-cartography .world-map-contours,
  #modal-world-map.map-v19-clean-cartography .world-map-river,
  #modal-world-map.map-v19-clean-cartography .world-map-region-labels{display:none!important}
  #modal-world-map .map-v19-cartography-layer{pointer-events:none}
  #modal-world-map .map-v19-paper{fill:rgba(232,199,125,.38);stroke:rgba(91,61,31,.28);stroke-width:2}
  #modal-world-map .map-v19-road-major{fill:none;stroke:rgba(82,59,37,.52);stroke-width:12;stroke-linecap:round}
  #modal-world-map .map-v19-road-minor{fill:none;stroke:rgba(103,77,47,.38);stroke-width:6;stroke-linecap:round}
  #modal-world-map .map-v19-building{fill:rgba(112,76,42,.18);stroke:rgba(78,49,26,.38);stroke-width:2}
  #modal-world-map .map-v19-square{fill:rgba(252,233,174,.60);stroke:rgba(111,75,35,.38);stroke-width:2}
  #modal-world-map[data-map-v19-level='site'] .world-map-node:not(.current){opacity:.20!important}
  #modal-world-map[data-map-v19-level='site'] .world-map-node.current{opacity:1!important}
  #modal-world-map[data-map-v19-level='site'] .world-map-hostile-markers,
  #modal-world-map[data-map-v19-level='site'] .world-map-live-signals{display:none!important}
}
`;
        (doc.head || doc.documentElement).appendChild(style);
    }

    function install(doc = typeof document !== 'undefined' ? document : null) {
        if (!doc) return false;
        cleanup(doc, false);
        ensureStyles(doc);
        bind(doc);
        root.__cronacheRuntimeMapCartographyV19Version = PATCH_VERSION;
        return true;
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(document), { once: true });
        else install(document);
    }

    return { PATCH_VERSION, currentContext, siteBox, buildSiteLayer, cleanup, render, scheduleRender, install };
});