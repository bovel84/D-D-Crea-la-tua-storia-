(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheWorldMapV11Gestures = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-world-map-v11-gestures-style';
    const MAX_ZOOM = 6;
    const MOVE_THRESHOLD = 5;

    const runtime = {
        viewport: null,
        svg: null,
        pointers: new Map(),
        gesture: null,
        manualBox: '',
        suppressClickUntil: 0,
        observer: null,
        bound: false,
        hintHidden: false
    };

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    function parseViewBox(value) {
        const parts = String(value || '').trim().split(/[\s,]+/).map(Number);
        if (parts.length !== 4 || parts.some(part => !Number.isFinite(part))) return null;
        return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }

    function boxString(box) {
        return `${round(box.x)} ${round(box.y)} ${round(box.width)} ${round(box.height)}`;
    }

    function round(value) {
        return Math.round(Number(value) * 100) / 100;
    }

    function activeSvg(doc) {
        const canvas = doc?.getElementById('world-map-canvas');
        if (!canvas) return null;
        return canvas.querySelector('.world-map-local-svg') || canvas.querySelector('.world-map-svg');
    }

    function mapBounds(svg) {
        if (!svg) return { x: 0, y: 0, width: 960, height: 620 };
        if (svg.classList.contains('world-map-svg')) {
            const model = root.CronacheWorldMapV10?.runtime?.lastModel;
            return {
                x: 0,
                y: 0,
                width: Math.max(1, Number(model?.width) || 960),
                height: Math.max(1, Number(model?.height) || 620)
            };
        }
        const stored = parseViewBox(svg.dataset.mapGestureBounds);
        if (stored) return stored;
        const initial = parseViewBox(svg.getAttribute('viewBox')) || { x: 0, y: 0, width: 760, height: 520 };
        svg.dataset.mapGestureBounds = boxString(initial);
        return initial;
    }

    function normalizeSize(box, bounds, maxZoom = MAX_ZOOM) {
        let width = Math.max(1, Number(box.width) || bounds.width);
        let height = Math.max(1, Number(box.height) || bounds.height);
        const minWidth = bounds.width / Math.max(1, maxZoom);
        const minHeight = bounds.height / Math.max(1, maxZoom);
        if (width < minWidth || height < minHeight) {
            const scale = Math.max(minWidth / width, minHeight / height);
            width *= scale;
            height *= scale;
        }
        if (width > bounds.width || height > bounds.height) {
            const scale = Math.min(bounds.width / width, bounds.height / height);
            width *= scale;
            height *= scale;
        }
        return { width, height };
    }

    function clampBox(box, bounds, maxZoom = MAX_ZOOM) {
        const size = normalizeSize(box, bounds, maxZoom);
        const maxX = bounds.x + bounds.width - size.width;
        const maxY = bounds.y + bounds.height - size.height;
        return {
            x: clamp(Number(box.x) || 0, bounds.x, Math.max(bounds.x, maxX)),
            y: clamp(Number(box.y) || 0, bounds.y, Math.max(bounds.y, maxY)),
            width: size.width,
            height: size.height
        };
    }

    function clientPointToSvg(clientX, clientY, rect, box) {
        const width = Math.max(1, rect?.width || 1);
        const height = Math.max(1, rect?.height || 1);
        return {
            x: box.x + (clientX - rect.left) / width * box.width,
            y: box.y + (clientY - rect.top) / height * box.height
        };
    }

    function zoomBox(box, bounds, rect, clientX, clientY, factor) {
        const safeFactor = Math.max(0.08, Number(factor) || 1);
        const anchor = clientPointToSvg(clientX, clientY, rect, box);
        const ux = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
        const uy = clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1);
        const desired = normalizeSize({ width: box.width / safeFactor, height: box.height / safeFactor }, bounds);
        return clampBox({
            x: anchor.x - ux * desired.width,
            y: anchor.y - uy * desired.height,
            width: desired.width,
            height: desired.height
        }, bounds);
    }

    function panBox(box, bounds, rect, deltaX, deltaY) {
        const dx = deltaX / Math.max(1, rect.width) * box.width;
        const dy = deltaY / Math.max(1, rect.height) * box.height;
        return clampBox({ ...box, x: box.x - dx, y: box.y - dy }, bounds);
    }

    function pinchBox(startBox, bounds, rect, startMid, currentMid, distanceRatio) {
        const anchor = clientPointToSvg(startMid.x, startMid.y, rect, startBox);
        const desired = normalizeSize({
            width: startBox.width / Math.max(0.08, distanceRatio || 1),
            height: startBox.height / Math.max(0.08, distanceRatio || 1)
        }, bounds);
        const ux = clamp((currentMid.x - rect.left) / Math.max(1, rect.width), 0, 1);
        const uy = clamp((currentMid.y - rect.top) / Math.max(1, rect.height), 0, 1);
        return clampBox({
            x: anchor.x - ux * desired.width,
            y: anchor.y - uy * desired.height,
            width: desired.width,
            height: desired.height
        }, bounds);
    }

    function applyBox(svg, box, manual = true) {
        if (!svg || !box) return;
        const value = boxString(box);
        if (svg.getAttribute('viewBox') !== value) svg.setAttribute('viewBox', value);
        if (manual) runtime.manualBox = value;
        const viewport = runtime.viewport;
        if (viewport) viewport.classList.toggle('map-gesture-zoomed', isZoomed(svg, box));
    }

    function isZoomed(svg, box = parseViewBox(svg?.getAttribute('viewBox'))) {
        if (!svg || !box) return false;
        const bounds = mapBounds(svg);
        return box.width < bounds.width * 0.985 || box.height < bounds.height * 0.985 || box.x > bounds.x + 0.5 || box.y > bounds.y + 0.5;
    }

    function pointerPair() {
        return [...runtime.pointers.values()].slice(0, 2);
    }

    function distance(left, right) {
        return Math.hypot(right.x - left.x, right.y - left.y);
    }

    function midpoint(left, right) {
        return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
    }

    function currentBox(svg) {
        return parseViewBox(svg?.getAttribute('viewBox')) || mapBounds(svg);
    }

    function startPan(svg, pointer) {
        runtime.gesture = {
            type: 'pan',
            pointerId: pointer.id,
            startX: pointer.x,
            startY: pointer.y,
            startBox: currentBox(svg),
            moved: false
        };
    }

    function startPinch(svg) {
        const pair = pointerPair();
        if (pair.length < 2) return;
        const startDistance = Math.max(1, distance(pair[0], pair[1]));
        runtime.gesture = {
            type: 'pinch',
            startDistance,
            startMid: midpoint(pair[0], pair[1]),
            startBox: currentBox(svg),
            moved: true
        };
        hideHint();
    }

    function ignoreTarget(target) {
        return Boolean(target?.closest?.('button,input,select,textarea,a,.map-v11-level-overlay,.world-map-side'));
    }

    function hideHint() {
        runtime.hintHidden = true;
        runtime.viewport?.classList.add('map-gesture-used');
    }

    function onPointerDown(event) {
        if (!runtime.viewport || !runtime.svg || ignoreTarget(event.target)) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        runtime.pointers.set(event.pointerId, {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            pointerType: event.pointerType,
            target: event.target
        });
        if (runtime.pointers.size >= 2) startPinch(runtime.svg);
        else startPan(runtime.svg, runtime.pointers.get(event.pointerId));
        runtime.viewport.classList.add('map-gesture-active');
    }

    function onPointerMove(event) {
        const pointer = runtime.pointers.get(event.pointerId);
        if (!pointer || !runtime.svg || !runtime.viewport) return;
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        const rect = runtime.svg.getBoundingClientRect();
        const bounds = mapBounds(runtime.svg);

        if (runtime.pointers.size >= 2) {
            if (runtime.gesture?.type !== 'pinch') startPinch(runtime.svg);
            const pair = pointerPair();
            const currentDistance = Math.max(1, distance(pair[0], pair[1]));
            const currentMid = midpoint(pair[0], pair[1]);
            const next = pinchBox(
                runtime.gesture.startBox,
                bounds,
                rect,
                runtime.gesture.startMid,
                currentMid,
                currentDistance / runtime.gesture.startDistance
            );
            applyBox(runtime.svg, next);
            runtime.gesture.moved = true;
            runtime.suppressClickUntil = Date.now() + 280;
            hideHint();
            event.preventDefault();
            return;
        }

        if (runtime.gesture?.type !== 'pan' || runtime.gesture.pointerId !== event.pointerId) {
            startPan(runtime.svg, pointer);
        }
        const dx = event.clientX - runtime.gesture.startX;
        const dy = event.clientY - runtime.gesture.startY;
        if (!runtime.gesture.moved && Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
        runtime.gesture.moved = true;
        const next = panBox(runtime.gesture.startBox, bounds, rect, dx, dy);
        applyBox(runtime.svg, next);
        runtime.suppressClickUntil = Date.now() + 220;
        hideHint();
        event.preventDefault();
    }

    function onPointerEnd(event) {
        const existed = runtime.pointers.has(event.pointerId);
        if (!existed) return;
        const moved = Boolean(runtime.gesture?.moved);
        runtime.pointers.delete(event.pointerId);
        if (moved) runtime.suppressClickUntil = Date.now() + 220;
        if (runtime.pointers.size === 1 && runtime.svg) {
            const remaining = [...runtime.pointers.values()][0];
            startPan(runtime.svg, remaining);
        } else if (!runtime.pointers.size) {
            runtime.gesture = null;
            runtime.viewport?.classList.remove('map-gesture-active');
        }
    }

    function onWheel(event) {
        if (!runtime.svg || !runtime.viewport || ignoreTarget(event.target)) return;
        const rect = runtime.svg.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const factor = Math.exp(-event.deltaY * 0.0015);
        const next = zoomBox(currentBox(runtime.svg), mapBounds(runtime.svg), rect, event.clientX, event.clientY, factor);
        applyBox(runtime.svg, next);
        hideHint();
        event.preventDefault();
    }

    function onDoubleClick(event) {
        if (!runtime.svg || ignoreTarget(event.target) || event.target.closest?.('.world-map-node,.map-v11-room')) return;
        const rect = runtime.svg.getBoundingClientRect();
        const next = zoomBox(currentBox(runtime.svg), mapBounds(runtime.svg), rect, event.clientX, event.clientY, 1.65);
        applyBox(runtime.svg, next);
        hideHint();
        event.preventDefault();
    }

    function resetManualView() {
        runtime.manualBox = '';
        runtime.gesture = null;
        runtime.pointers.clear();
        runtime.viewport?.classList.remove('map-gesture-active', 'map-gesture-zoomed');
    }

    function bindViewport(doc) {
        const viewport = doc?.getElementById('world-map-viewport');
        const svg = activeSvg(doc);
        if (!viewport || !svg) return false;
        if (runtime.viewport === viewport && runtime.svg === svg && viewport.dataset.mapGestureBound === '1') return true;

        if (runtime.viewport && runtime.viewport !== viewport) runtime.viewport.dataset.mapGestureBound = '';
        runtime.viewport = viewport;
        runtime.svg = svg;
        runtime.pointers.clear();
        runtime.gesture = null;
        runtime.manualBox = '';
        viewport.dataset.mapGestureBound = '1';
        viewport.addEventListener('pointerdown', onPointerDown, { passive: true });
        viewport.addEventListener('pointermove', onPointerMove, { passive: false });
        viewport.addEventListener('pointerup', onPointerEnd, { passive: true });
        viewport.addEventListener('pointercancel', onPointerEnd, { passive: true });
        viewport.addEventListener('wheel', onWheel, { passive: false });
        viewport.addEventListener('dblclick', onDoubleClick, { passive: false });
        ensureHint(doc, viewport);
        return true;
    }

    function ensureHint(doc, viewport) {
        let hint = viewport.querySelector('.map-gesture-hint');
        if (!hint) {
            hint = doc.createElement('div');
            hint.className = 'map-gesture-hint';
            hint.innerHTML = '<span>☝ trascina</span><span>🤏 zoom</span>';
            viewport.appendChild(hint);
            setTimeout(() => viewport.classList.add('map-gesture-hint-soft'), 4200);
        }
        if (runtime.hintHidden) viewport.classList.add('map-gesture-used');
    }

    function bindDocument(doc) {
        if (!doc || runtime.bound) return;
        runtime.bound = true;
        doc.addEventListener('click', event => {
            const insideViewport = event.target.closest?.('#world-map-viewport');
            if (insideViewport && Date.now() < runtime.suppressClickUntil && !ignoreTarget(event.target)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                return;
            }
            if (event.target.closest?.('[data-map-v11-level],[data-map-region],[data-map-filter],.world-map-v10-reset')) {
                resetManualView();
                setTimeout(() => bindViewport(doc), 0);
                return;
            }
            const node = event.target.closest?.('#world-map-viewport .world-map-node,#world-map-viewport .map-v11-room');
            if (node && runtime.manualBox) {
                const svg = runtime.svg;
                const saved = runtime.manualBox;
                setTimeout(() => {
                    if (runtime.svg === svg && activeSvg(doc) === svg && runtime.manualBox === saved) {
                        svg.setAttribute('viewBox', saved);
                    }
                }, 0);
            }
        }, true);
    }

    function cssText() {
        return `
#world-map-viewport{touch-action:none!important;overscroll-behavior:none!important;user-select:none;-webkit-user-select:none;cursor:grab}
#world-map-viewport.map-gesture-active{cursor:grabbing}
#world-map-viewport .world-map-svg,#world-map-viewport .world-map-local-svg{touch-action:none!important}
#world-map-viewport .world-map-node,#world-map-viewport .map-v11-room{pointer-events:all;touch-action:none}
.map-gesture-hint{position:absolute;z-index:34;right:8px;top:48px;display:flex;gap:5px;pointer-events:none;transition:opacity .25s ease,transform .25s ease}
.map-gesture-hint span{padding:4px 7px;border:1px solid rgba(73,50,28,.22);border-radius:999px;background:rgba(255,247,216,.9);color:#5a402a;font:700 .5rem 'Cinzel',serif;box-shadow:0 2px 8px rgba(42,28,14,.12)}
.map-gesture-hint-soft .map-gesture-hint{opacity:.48}
.map-gesture-used .map-gesture-hint{opacity:0;transform:translateY(-4px)}
@media(max-width:760px){
  .map-gesture-hint{right:6px;top:40px}
  .map-gesture-hint span{font-size:.46rem;padding:3px 6px}
  #world-map-viewport{cursor:default}
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
        const modal = doc?.getElementById('modal-world-map');
        if (!modal?.classList.contains('active')) return false;
        const previousSvg = runtime.svg;
        const nextSvg = activeSvg(doc);
        if (previousSvg && nextSvg && previousSvg !== nextSvg) resetManualView();
        return bindViewport(doc);
    }

    function observe(doc) {
        if (!doc || runtime.observer || typeof MutationObserver === 'undefined') return;
        runtime.observer = new MutationObserver(() => {
            if (!doc.getElementById('modal-world-map')?.classList.contains('active')) return;
            const nextSvg = activeSvg(doc);
            if (nextSvg !== runtime.svg || !runtime.viewport?.isConnected) refresh(doc);
        });
        runtime.observer.observe(doc.documentElement || doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    function install(doc = typeof document !== 'undefined' ? document : null) {
        if (doc) {
            ensureStyles(doc);
            bindDocument(doc);
            refresh(doc);
            observe(doc);
        }
        root.__cronacheWorldMapV11GesturesVersion = PATCH_VERSION;
        return true;
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(document), { once: true });
        else install(document);
        if (typeof root.setTimeout === 'function') [80, 300, 900, 1800, 3200].forEach(delay => root.setTimeout(() => install(document), delay));
    }

    return {
        PATCH_VERSION,
        MAX_ZOOM,
        parseViewBox,
        clampBox,
        zoomBox,
        panBox,
        pinchBox,
        cssText,
        install,
        runtime
    };
});