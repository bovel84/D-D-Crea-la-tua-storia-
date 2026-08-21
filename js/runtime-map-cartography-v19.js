(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheRuntimeMapCartographyV19 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-runtime-map-cartography-v19-style';
    let observer = null;
    let queued = false;
    let applying = false;

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 500) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const keyOf = value => clean(value, 900).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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

    function isMobile(doc) {
        const view = doc?.defaultView || root;
        if (typeof view?.matchMedia === 'function') return view.matchMedia('(max-width: 760px)').matches;
        return Number(view?.innerWidth || 0) > 0 && Number(view.innerWidth) <= 760;
    }

    function modelNow() {
        return root.CronacheWorldMapV10?.runtime?.lastModel || null;
    }

    function levelsNow() {
        return root.CronacheWorldMapV11Levels?.runtime || null;
    }

    function locationById(model, id) {
        return asArray(model?.locations).find(item => item?.id === id) || null;
    }

    function selectedLocation(model, runtime) {
        return locationById(model, runtime?.selectedLocationId)
            || locationById(model, model?.currentLocationId)
            || asArray(model?.locations).find(item => item?.current)
            || null;
    }

    function scopedLocations(model, runtime, anchor) {
        const level = runtime?.level || 'world';
        const value = runtime?.scopeName || (level === 'site' ? anchor?.id : '');
        const helper = root.CronacheWorldMapV11Levels?.locationsForScope;
        if (typeof helper === 'function') return helper(model, level, value, anchor);
        const wanted = keyOf(value);
        const locations = asArray(model?.locations);
        if (level === 'world' || !wanted) return locations;
        if (level === 'continent') return locations.filter(item => keyOf(item?.continent) === wanted);
        if (level === 'nation') return locations.filter(item => keyOf(item?.nation) === wanted);
        if (level === 'region') return locations.filter(item => keyOf(item?.region) === wanted);
        if (level === 'site') return anchor ? locations.filter(item => item.id === anchor.id || keyOf(item.region) === keyOf(anchor.region)) : locations;
        return locations;
    }

    function viewportAspect(doc) {
        const rect = doc?.getElementById('world-map-viewport')?.getBoundingClientRect?.();
        if (rect?.width && rect?.height) return clamp(rect.width / rect.height, 0.42, 2.4);
        return 0.72;
    }

    function setCleanViewBox(doc, svg, model, runtime, anchor, points) {
        if (!svg || !model || !runtime || svg.dataset.mapGestureManual === '1') return false;
        const level = runtime.level;
        const aspect = viewportAspect(doc);
        const usable = asArray(points).filter(item => Number.isFinite(Number(item?.x)) && Number.isFinite(Number(item?.y)));
        let box = null;

        if ((level === 'site' || (level === 'region' && usable.length <= 1)) && anchor) {
            const height = level === 'site' ? 330 : 410;
            const width = height * aspect;
            box = {
                x: Number(anchor.x) - width / 2,
                y: Number(anchor.y) - height / 2,
                width,
                height
            };
        } else if (level === 'region' && usable.length) {
            const xs = usable.map(item => Number(item.x));
            const ys = usable.map(item => Number(item.y));
            let minX = Math.min(...xs) - 72;
            let maxX = Math.max(...xs) + 72;
            let minY = Math.min(...ys) - 66;
            let maxY = Math.max(...ys) + 66;
            let width = Math.max(300, maxX - minX);
            let height = Math.max(300, maxY - minY);
            const currentAspect = width / height;
            if (currentAspect < aspect) {
                const target = height * aspect;
                minX -= (target - width) / 2;
                width = target;
            } else if (currentAspect > aspect) {
                const target = width / aspect;
                minY -= (target - height) / 2;
                height = target;
            }
            box = { x: minX, y: minY, width, height };
        }

        if (!box) return false;
        const value = [box.x, box.y, box.width, box.height]
            .map(number => Math.round(Number(number) * 100) / 100).join(' ');
        if (svg.getAttribute('viewBox') !== value) svg.setAttribute('viewBox', value);
        svg.dataset.mapV19ViewBox = value;
        return true;
    }

    function svgNode(doc, tag, attrs = {}) {
        const node = doc.createElementNS('http://www.w3.org/2000/svg', tag);
        Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, String(value)));
        return node;
    }

    function localProfile(anchor, model) {
        const story = root.CronacheWorldMapV10?.runtime?.lastContext?.context?.story || {};
        const corpus = keyOf([
            anchor?.name, anchor?.type, anchor?.region, anchor?.nation, anchor?.terrain,
            story?.title, story?.setting, story?.desc, model?.name
        ].filter(Boolean).join(' '));
        if (/firenze|quartiere|mercato|banco|banca|palazzo|piazza|citta|citta|urbano|urban/.test(corpus)) return 'urban';
        if (/porto|mare|costa|laguna|molo/.test(corpus)) return 'port';
        if (/bosco|foresta|selva/.test(corpus)) return 'forest';
        if (/campagna|rural|vign|campo|fattoria|collin|toscana/.test(corpus)) return 'rural';
        return 'urban';
    }

    function addUrbanSiteLayer(doc, layer, anchor) {
        const x = Number(anchor.x);
        const y = Number(anchor.y);
        const paper = svgNode(doc, 'rect', { class: 'map-v19-local-paper', x: x - 225, y: y - 178, width: 450, height: 356, rx: 26 });
        layer.appendChild(paper);

        const roads = [
            `M ${x - 250} ${y + 42} C ${x - 120} ${y + 18}, ${x + 95} ${y + 65}, ${x + 250} ${y + 32}`,
            `M ${x - 72} ${y - 205} C ${x - 54} ${y - 98}, ${x - 42} ${y + 45}, ${x - 12} ${y + 210}`,
            `M ${x + 122} ${y - 190} C ${x + 88} ${y - 85}, ${x + 95} ${y + 65}, ${x + 150} ${y + 190}`
        ];
        roads.forEach((d, index) => layer.appendChild(svgNode(doc, 'path', { class: index === 0 ? 'map-v19-road-major' : 'map-v19-road-minor', d })));

        const offsets = [
            [-174,-126,70,52],[-91,-132,78,58],[24,-137,72,55],[115,-119,64,51],
            [-185,-48,82,57],[-83,-42,66,48],[42,-44,78,50],[132,-36,58,46],
            [-183,88,76,50],[-88,94,68,48],[38,88,82,54],[133,78,55,48]
        ];
        offsets.forEach((item, index) => {
            const [dx, dy, width, height] = item;
            const rotate = (hashNumber(`${anchor.id}|block|${index}`) % 9) - 4;
            const rect = svgNode(doc, 'rect', {
                class: 'map-v19-building-block', x: x + dx, y: y + dy, width, height, rx: 5,
                transform: `rotate(${rotate} ${x + dx + width / 2} ${y + dy + height / 2})`
            });
            layer.appendChild(rect);
        });

        const square = svgNode(doc, 'rect', { class: 'map-v19-piazza', x: x - 42, y: y - 40, width: 84, height: 80, rx: 12 });
        layer.appendChild(square);
    }

    function addRuralSiteLayer(doc, layer, anchor, profile) {
        const x = Number(anchor.x);
        const y = Number(anchor.y);
        layer.appendChild(svgNode(doc, 'rect', { class: 'map-v19-local-paper', x: x - 225, y: y - 178, width: 450, height: 356, rx: 26 }));
        [-115, -58, 0, 64, 122].forEach((dy, index) => {
            const wobble = (hashNumber(`${anchor.id}|field|${index}`) % 35) - 17;
            layer.appendChild(svgNode(doc, 'path', {
                class: 'map-v19-contour',
                d: `M ${x - 230} ${y + dy} C ${x - 110} ${y + dy - 24 + wobble}, ${x + 90} ${y + dy + 22 - wobble}, ${x + 230} ${y + dy}`
            }));
        });
        layer.appendChild(svgNode(doc, 'path', {
            class: 'map-v19-road-major',
            d: `M ${x - 250} ${y + 80} C ${x - 90} ${y + 40}, ${x + 70} ${y - 25}, ${x + 250} ${y - 52}`
        }));
        if (profile === 'forest') {
            for (let index = 0; index < 18; index++) {
                const dx = -205 + (hashNumber(`${anchor.id}|tree-x|${index}`) % 410);
                const dy = -145 + (hashNumber(`${anchor.id}|tree-y|${index}`) % 290);
                if (Math.hypot(dx, dy) < 70) continue;
                layer.appendChild(svgNode(doc, 'circle', { class: 'map-v19-tree', cx: x + dx, cy: y + dy, r: 6 + (index % 3) }));
            }
        }
    }

    function buildSiteLayer(doc, anchor, model) {
        if (!anchor || !Number.isFinite(Number(anchor.x)) || !Number.isFinite(Number(anchor.y))) return null;
        const layer = svgNode(doc, 'g', { class: 'map-v19-cartography-layer map-v19-site-layer' });
        const profile = localProfile(anchor, model);
        layer.dataset.profile = profile;
        if (profile === 'urban' || profile === 'port') addUrbanSiteLayer(doc, layer, anchor);
        else addRuralSiteLayer(doc, layer, anchor, profile);
        return layer;
    }

    function nearestTree(points) {
        const cleanPoints = asArray(points).filter(item => Number.isFinite(Number(item?.x)) && Number.isFinite(Number(item?.y)));
        if (cleanPoints.length < 2) return [];
        const connected = [cleanPoints[0]];
        const remaining = cleanPoints.slice(1);
        const edges = [];
        while (remaining.length) {
            let best = null;
            connected.forEach(from => remaining.forEach((to, index) => {
                const distance = Math.hypot(Number(from.x) - Number(to.x), Number(from.y) - Number(to.y));
                if (!best || distance < best.distance) best = { from, to, index, distance };
            }));
            if (!best) break;
            edges.push(best);
            connected.push(best.to);
            remaining.splice(best.index, 1);
        }
        return edges;
    }

    function buildRegionLayer(doc, points, runtime) {
        const usable = asArray(points).filter(item => Number.isFinite(Number(item?.x)) && Number.isFinite(Number(item?.y)));
        if (!usable.length) return null;
        const layer = svgNode(doc, 'g', { class: 'map-v19-cartography-layer map-v19-region-layer' });
        const xs = usable.map(item => Number(item.x));
        const ys = usable.map(item => Number(item.y));
        const minX = Math.min(...xs) - 95;
        const maxX = Math.max(...xs) + 95;
        const minY = Math.min(...ys) - 85;
        const maxY = Math.max(...ys) + 85;
        layer.appendChild(svgNode(doc, 'rect', {
            class: 'map-v19-region-paper', x: minX, y: minY, width: Math.max(250, maxX - minX), height: Math.max(230, maxY - minY), rx: 35
        }));

        nearestTree(usable).forEach((edge, index) => {
            const x1 = Number(edge.from.x); const y1 = Number(edge.from.y);
            const x2 = Number(edge.to.x); const y2 = Number(edge.to.y);
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const bend = ((hashNumber(`${runtime.scopeName}|${index}`) % 31) - 15);
            const dx = x2 - x1; const dy = y2 - y1;
            const length = Math.max(1, Math.hypot(dx, dy));
            const cx = mx - dy / length * bend;
            const cy = my + dx / length * bend;
            layer.appendChild(svgNode(doc, 'path', { class: 'map-v19-region-road', d: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}` }));
        });
        return layer;
    }

    function insertLayer(svg, layer) {
        if (!svg || !layer) return;
        const nodes = svg.querySelector('.world-map-nodes');
        if (nodes?.parentNode) nodes.parentNode.insertBefore(layer, nodes);
        else svg.appendChild(layer);
    }

    function cleanup(doc) {
        const modal = doc?.getElementById('modal-world-map');
        modal?.classList.remove('map-v19-clean-cartography');
        modal?.removeAttribute('data-map-v19-level');
        doc?.querySelectorAll('#modal-world-map .map-v19-cartography-layer').forEach(node => node.remove());
    }

    function render(doc) {
        if (!doc || !isMobile(doc) || applying) return false;
        const modal = doc.getElementById('modal-world-map');
        const svg = doc.querySelector('#world-map-canvas .world-map-svg');
        const model = modelNow();
        const runtime = levelsNow();
        if (!modal?.classList.contains('active') || !svg || !model || !runtime || runtime.level === 'interior') {
            cleanup(doc);
            return false;
        }

        applying = true;
        try {
            modal.classList.add('map-v19-clean-cartography');
            modal.dataset.mapV19Level = runtime.level || 'world';
            const anchor = selectedLocation(model, runtime);
            const points = scopedLocations(model, runtime, anchor);
            const signature = `${runtime.level}|${runtime.scopeName}|${runtime.selectedLocationId}|${points.map(item => `${item.id}:${item.x}:${item.y}`).join(',')}`;
            const existing = svg.querySelector('.map-v19-cartography-layer');

            if (['world', 'continent', 'nation'].includes(runtime.level)) {
                existing?.remove();
                return true;
            }

            if (existing?.dataset.signature !== signature) {
                existing?.remove();
                const layer = runtime.level === 'site'
                    ? buildSiteLayer(doc, anchor, model)
                    : runtime.level === 'region' ? buildRegionLayer(doc, points, runtime) : null;
                if (layer) {
                    layer.dataset.signature = signature;
                    insertLayer(svg, layer);
                }
            }
            setCleanViewBox(doc, svg, model, runtime, anchor, points);
            return true;
        } finally {
            applying = false;
        }
    }

    function queueRender(doc) {
        if (queued) return;
        queued = true;
        const run = () => {
            queued = false;
            render(doc);
        };
        if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(run);
        else if (typeof root.setTimeout === 'function') root.setTimeout(run, 0);
        else run();
    }

    function bind(doc) {
        if (!doc || doc.documentElement?.dataset.runtimeMapCartographyV19Bound === '1') return;
        if (doc.documentElement) doc.documentElement.dataset.runtimeMapCartographyV19Bound = '1';
        doc.addEventListener('click', event => {
            const control = event.target?.closest?.('[data-map-v11-level],[data-map-region],[data-map-v15-next-level],.world-map-v10-reset,.world-map-node');
            if (!control) return;
            if (typeof root.setTimeout === 'function') {
                root.setTimeout(() => queueRender(doc), 0);
                root.setTimeout(() => queueRender(doc), 40);
            } else queueRender(doc);
        }, false);
    }

    function observe(doc) {
        if (!doc || observer || typeof MutationObserver === 'undefined') return;
        observer = new MutationObserver(mutations => {
            if (applying) return;
            const relevant = mutations.some(mutation => !mutation.target?.closest?.('.map-v19-cartography-layer'));
            if (relevant && doc.getElementById('modal-world-map')?.classList.contains('active')) queueRender(doc);
        });
        observer.observe(doc.documentElement || doc.body, {
            childList: true, subtree: true, attributes: true,
            attributeFilter: ['class', 'data-map-level', 'data-map-v10-location']
        });
    }

    function ensureStyles(doc) {
        if (!doc || doc.getElementById(STYLE_ID)) return;
        const style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
@media(max-width:760px){
  #modal-world-map.map-v19-clean-cartography .world-map-territories,
  #modal-world-map.map-v19-clean-cartography .world-map-routes,
  #modal-world-map.map-v19-clean-cartography .world-map-story-terrain,
  #modal-world-map.map-v19-clean-cartography .world-map-grid,
  #modal-world-map.map-v19-clean-cartography .world-map-contours,
  #modal-world-map.map-v19-clean-cartography .world-map-river{display:none!important}
  #modal-world-map .map-v19-cartography-layer{pointer-events:none}
  #modal-world-map .map-v19-local-paper{fill:rgba(232,196,112,.23);stroke:rgba(105,72,38,.18);stroke-width:2}
  #modal-world-map .map-v19-region-paper{fill:rgba(231,199,126,.17);stroke:rgba(109,75,38,.18);stroke-width:2}
  #modal-world-map .map-v19-road-major{fill:none;stroke:rgba(92,69,45,.48);stroke-width:12;stroke-linecap:round}
  #modal-world-map .map-v19-road-major::after{stroke:#fff}
  #modal-world-map .map-v19-road-minor{fill:none;stroke:rgba(110,84,54,.34);stroke-width:6;stroke-linecap:round}
  #modal-world-map .map-v19-region-road{fill:none;stroke:rgba(105,76,45,.36);stroke-width:7;stroke-linecap:round;stroke-dasharray:none}
  #modal-world-map .map-v19-building-block{fill:rgba(128,92,52,.15);stroke:rgba(93,62,33,.34);stroke-width:2}
  #modal-world-map .map-v19-piazza{fill:rgba(247,228,171,.40);stroke:rgba(112,77,36,.30);stroke-width:2}
  #modal-world-map .map-v19-contour{fill:none;stroke:rgba(109,91,53,.24);stroke-width:3;stroke-linecap:round}
  #modal-world-map .map-v19-tree{fill:rgba(80,101,53,.28);stroke:rgba(55,73,40,.28);stroke-width:1}
  #modal-world-map[data-map-v19-level='site'] .world-map-node:not(.current){opacity:.50}
  #modal-world-map[data-map-v19-level='site'] .world-map-node.current{opacity:1!important}
  #modal-world-map[data-map-v19-level='site'] .world-map-node.current .world-map-node-ring{filter:none!important}
}
`;
        (doc.head || doc.documentElement).appendChild(style);
    }

    function install(doc = typeof document !== 'undefined' ? document : null) {
        if (doc) {
            ensureStyles(doc);
            bind(doc);
            observe(doc);
            queueRender(doc);
        }
        if (typeof root.setTimeout === 'function') [80, 250, 700, 1500, 3000].forEach(delay => root.setTimeout(() => doc && queueRender(doc), delay));
        root.__cronacheRuntimeMapCartographyV19Version = PATCH_VERSION;
        return true;
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(document), { once: true });
        else install(document);
    }

    return {
        PATCH_VERSION,
        scopedLocations,
        localProfile,
        nearestTree,
        setCleanViewBox,
        render,
        install
    };
});