(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheWorldMapV11GesturesPersistent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-world-map-v11-gestures-persistent-style';
    const MAX_ZOOM = 7;
    const MOVE_THRESHOLD = 6;
    const pointers = new Map();
    const manualViews = new WeakMap();
    const observers = new WeakMap();
    let gesture = null;
    let suppressClickUntil = 0;
    let installed = false;
    let internalViewWrite = false;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const round = value => Math.round(Number(value) * 100) / 100;

    function parseViewBox(value) {
        const parts = String(value || '').trim().split(/[\s,]+/).map(Number);
        if (parts.length !== 4 || parts.some(part => !Number.isFinite(part)) || parts[2] <= 0 || parts[3] <= 0) return null;
        return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }

    function boxString(box) {
        return `${round(box.x)} ${round(box.y)} ${round(box.width)} ${round(box.height)}`;
    }

    function viewportFor(target) {
        return target?.closest?.('#world-map-viewport') || null;
    }

    function activeSvg(viewport) {
        return viewport?.querySelector?.('.world-map-local-svg,.world-map-svg') || null;
    }

    function boundsFor(svg) {
        if (!svg) return { x: 0, y: 0, width: 960, height: 620 };
        if (svg.classList.contains('world-map-svg')) {
            const model = root.CronacheWorldMapV10?.runtime?.lastModel;
            return { x: 0, y: 0, width: Math.max(1, Number(model?.width) || 960), height: Math.max(1, Number(model?.height) || 620) };
        }
        const stored = parseViewBox(svg.dataset.mapGestureBounds);
        if (stored) return stored;
        const initial = parseViewBox(svg.getAttribute('viewBox')) || { x: 0, y: 0, width: 760, height: 520 };
        svg.dataset.mapGestureBounds = boxString(initial);
        return initial;
    }

    function currentBox(svg) {
        return parseViewBox(svg?.getAttribute('viewBox')) || boundsFor(svg);
    }

    function clampBox(box, bounds) {
        const base = currentAspectBox(box, bounds);
        const minScale = 1 / MAX_ZOOM;
        let scale = Math.max(base.width / bounds.width, base.height / bounds.height);
        scale = clamp(scale, minScale, 1);
        let width = bounds.width * scale;
        let height = width / base.aspect;
        if (height > bounds.height) {
            height = bounds.height * scale;
            width = height * base.aspect;
        }
        width = Math.min(bounds.width, Math.max(bounds.width / MAX_ZOOM, width));
        height = Math.min(bounds.height, Math.max(bounds.height / MAX_ZOOM, height));
        const maxX = bounds.x + bounds.width - width;
        const maxY = bounds.y + bounds.height - height;
        return {
            x: clamp(Number(box.x) || bounds.x, bounds.x, Math.max(bounds.x, maxX)),
            y: clamp(Number(box.y) || bounds.y, bounds.y, Math.max(bounds.y, maxY)),
            width,
            height
        };
    }

    function currentAspectBox(box, bounds) {
        const width = Math.max(1, Number(box?.width) || bounds.width);
        const height = Math.max(1, Number(box?.height) || bounds.height);
        return { width, height, aspect: width / height || bounds.width / bounds.height };
    }

    function pointToMap(clientX, clientY, rect, box) {
        return {
            x: box.x + ((clientX - rect.left) / Math.max(1, rect.width)) * box.width,
            y: box.y + ((clientY - rect.top) / Math.max(1, rect.height)) * box.height
        };
    }

    function observeViewBox(svg) {
        if (!svg || observers.has(svg) || typeof MutationObserver === 'undefined') return;
        const observer = new MutationObserver(() => {
            if (internalViewWrite) return;
            const saved = manualViews.get(svg);
            if (!saved) return;
            const actual = svg.getAttribute('viewBox') || '';
            if (actual === saved) return;
            internalViewWrite = true;
            svg.setAttribute('viewBox', saved);
            internalViewWrite = false;
        });
        observer.observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
        observers.set(svg, observer);
    }

    function applyBox(svg, box) {
        if (!svg) return null;
        const next = clampBox(box, boundsFor(svg));
        const value = boxString(next);
        internalViewWrite = true;
        if (svg.getAttribute('viewBox') !== value) svg.setAttribute('viewBox', value);
        internalViewWrite = false;
        manualViews.set(svg, value);
        svg.dataset.mapGestureManual = '1';
        svg.dataset.mapGestureViewBox = value;
        observeViewBox(svg);
        return next;
    }

    function clearManual(svg) {
        if (!svg) return;
        manualViews.delete(svg);
        delete svg.dataset.mapGestureManual;
        delete svg.dataset.mapGestureViewBox;
    }

    function clearCurrentManual(doc) {
        const viewport = doc?.getElementById('world-map-viewport');
        clearManual(activeSvg(viewport));
    }

    function ignoreTarget(target) {
        return Boolean(target?.closest?.('button,input,select,textarea,a,.map-v11-level-overlay,.world-map-side'));
    }

    function startPan(pointer, svg) {
        gesture = { type: 'pan', pointerId: pointer.id, startX: pointer.x, startY: pointer.y, startBox: currentBox(svg), moved: false, svg };
    }

    function midpoint(a, b) {
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    function distance(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function startPinch(svg) {
        const pair = [...pointers.values()].filter(item => item.svg === svg).slice(0, 2);
        if (pair.length < 2) return;
        gesture = {
            type: 'pinch', svg,
            startBox: currentBox(svg),
            startMid: midpoint(pair[0], pair[1]),
            startDistance: Math.max(1, distance(pair[0], pair[1])),
            moved: true
        };
    }

    function onPointerDown(event) {
        const viewport = viewportFor(event.target);
        if (!viewport || ignoreTarget(event.target)) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const svg = activeSvg(viewport);
        if (!svg) return;
        const pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, viewport, svg };
        pointers.set(event.pointerId, pointer);
        try { viewport.setPointerCapture?.(event.pointerId); } catch (_error) { }
        const sameSvgCount = [...pointers.values()].filter(item => item.svg === svg).length;
        if (sameSvgCount >= 2) startPinch(svg);
        else startPan(pointer, svg);
    }

    function onPointerMove(event) {
        const pointer = pointers.get(event.pointerId);
        if (!pointer) return;
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        const svg = pointer.svg;
        const rect = svg.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const pair = [...pointers.values()].filter(item => item.svg === svg).slice(0, 2);

        if (pair.length >= 2) {
            if (gesture?.type !== 'pinch' || gesture.svg !== svg) startPinch(svg);
            const mid = midpoint(pair[0], pair[1]);
            const ratio = Math.max(0.08, distance(pair[0], pair[1]) / Math.max(1, gesture.startDistance));
            const anchor = pointToMap(gesture.startMid.x, gesture.startMid.y, rect, gesture.startBox);
            const width = gesture.startBox.width / ratio;
            const height = gesture.startBox.height / ratio;
            const ux = clamp((mid.x - rect.left) / Math.max(1, rect.width), 0, 1);
            const uy = clamp((mid.y - rect.top) / Math.max(1, rect.height), 0, 1);
            applyBox(svg, { x: anchor.x - ux * width, y: anchor.y - uy * height, width, height });
            suppressClickUntil = Date.now() + 320;
            event.preventDefault();
            return;
        }

        if (gesture?.type !== 'pan' || gesture.pointerId !== event.pointerId || gesture.svg !== svg) startPan(pointer, svg);
        const dx = event.clientX - gesture.startX;
        const dy = event.clientY - gesture.startY;
        if (!gesture.moved && Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
        gesture.moved = true;
        const box = gesture.startBox;
        applyBox(svg, {
            ...box,
            x: box.x - (dx / Math.max(1, rect.width)) * box.width,
            y: box.y - (dy / Math.max(1, rect.height)) * box.height
        });
        suppressClickUntil = Date.now() + 280;
        event.preventDefault();
    }

    function onPointerEnd(event) {
        const pointer = pointers.get(event.pointerId);
        if (!pointer) return;
        const moved = Boolean(gesture?.moved);
        pointers.delete(event.pointerId);
        try { pointer.viewport?.releasePointerCapture?.(event.pointerId); } catch (_error) { }
        if (moved) suppressClickUntil = Date.now() + 280;
        const remaining = [...pointers.values()].filter(item => item.svg === pointer.svg);
        if (remaining.length === 1) startPan(remaining[0], pointer.svg);
        else if (!remaining.length) gesture = null;
    }

    function onWheel(event) {
        const viewport = viewportFor(event.target);
        if (!viewport || ignoreTarget(event.target)) return;
        const svg = activeSvg(viewport);
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const box = currentBox(svg);
        const anchor = pointToMap(event.clientX, event.clientY, rect, box);
        const factor = Math.exp(-event.deltaY * 0.0015);
        const width = box.width / factor;
        const height = box.height / factor;
        const ux = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
        const uy = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
        applyBox(svg, { x: anchor.x - ux * width, y: anchor.y - uy * height, width, height });
        event.preventDefault();
    }

    function onClick(event) {
        const viewport = viewportFor(event.target);
        if (!viewport) return;
        if (Date.now() < suppressClickUntil && !ignoreTarget(event.target)) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }

    function onNavigationClick(event, doc) {
        const target = event.target?.closest?.('[data-map-v11-level],[data-map-region],.world-map-v10-reset,#btn-map-zoom-in,#btn-map-zoom-out');
        if (!target) return;
        clearCurrentManual(doc);
    }

    function ensureStyles(doc) {
        if (!doc || doc.getElementById(STYLE_ID)) return;
        const style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
#world-map-viewport{touch-action:none!important;overscroll-behavior:none!important;user-select:none;-webkit-user-select:none;cursor:grab}
#world-map-viewport:active{cursor:grabbing}
#world-map-viewport .world-map-svg,#world-map-viewport .world-map-local-svg{touch-action:none!important}
#world-map-viewport .world-map-node,#world-map-viewport .map-v11-room{pointer-events:all}
@media(max-width:760px){#world-map-viewport{cursor:default}}
`;
        (doc.head || doc.documentElement).appendChild(style);
    }

    function install(doc = typeof document !== 'undefined' ? document : null) {
        if (!doc || installed) return Boolean(doc);
        installed = true;
        ensureStyles(doc);
        doc.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true });
        doc.addEventListener('pointermove', onPointerMove, { passive: false, capture: true });
        doc.addEventListener('pointerup', onPointerEnd, { passive: true, capture: true });
        doc.addEventListener('pointercancel', onPointerEnd, { passive: true, capture: true });
        doc.addEventListener('wheel', onWheel, { passive: false, capture: true });
        doc.addEventListener('click', event => onNavigationClick(event, doc), true);
        doc.addEventListener('click', onClick, true);
        root.__cronacheWorldMapV11GesturesPersistentVersion = PATCH_VERSION;
        return true;
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(document), { once: true });
        else install(document);
    }

    return {
        PATCH_VERSION,
        MAX_ZOOM,
        parseViewBox,
        clampBox,
        pointToMap,
        boxString,
        install
    };
});