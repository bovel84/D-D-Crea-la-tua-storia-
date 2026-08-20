(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheWorldMapV11GesturesSafe = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-world-map-v11-gestures-safe-style';
    const MAX_ZOOM = 6;
    const MOVE_THRESHOLD = 7;
    const pointers = new Map();
    let gesture = null;
    let suppressClickUntil = 0;
    let installed = false;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const round = value => Math.round(Number(value) * 100) / 100;

    function parseViewBox(value) {
        const parts = String(value || '').trim().split(/[\s,]+/).map(Number);
        if (parts.length !== 4 || parts.some(part => !Number.isFinite(part))) return null;
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
        const original = parseViewBox(svg.dataset.mapGestureBounds) || parseViewBox(svg.getAttribute('viewBox')) || { x: 0, y: 0, width: 760, height: 520 };
        if (!svg.dataset.mapGestureBounds) svg.dataset.mapGestureBounds = boxString(original);
        return original;
    }

    function currentBox(svg) {
        return parseViewBox(svg?.getAttribute('viewBox')) || boundsFor(svg);
    }

    function normalizeBox(box, bounds) {
        const ratio = bounds.width / bounds.height;
        let width = Math.max(bounds.width / MAX_ZOOM, Math.min(bounds.width, Number(box.width) || bounds.width));
        let height = width / ratio;
        if (height > bounds.height) {
            height = bounds.height;
            width = height * ratio;
        }
        const x = clamp(Number(box.x) || 0, bounds.x, bounds.x + bounds.width - width);
        const y = clamp(Number(box.y) || 0, bounds.y, bounds.y + bounds.height - height);
        return { x, y, width, height };
    }

    function pointToMap(clientX, clientY, rect, box) {
        return {
            x: box.x + ((clientX - rect.left) / Math.max(1, rect.width)) * box.width,
            y: box.y + ((clientY - rect.top) / Math.max(1, rect.height)) * box.height
        };
    }

    function applyBox(svg, box) {
        const next = normalizeBox(box, boundsFor(svg));
        svg.setAttribute('viewBox', boxString(next));
        return next;
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
        const pair = [...pointers.values()].slice(0, 2);
        if (pair.length < 2) return;
        gesture = { type: 'pinch', startBox: currentBox(svg), startMid: midpoint(pair[0], pair[1]), startDistance: Math.max(1, distance(pair[0], pair[1])), moved: true, svg };
    }

    function onPointerDown(event) {
        const viewport = viewportFor(event.target);
        if (!viewport || ignoreTarget(event.target)) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const svg = activeSvg(viewport);
        if (!svg) return;
        pointers.set(event.pointerId, { id: event.pointerId, x: event.clientX, y: event.clientY, viewport, svg });
        if (pointers.size >= 2) startPinch(svg);
        else startPan(pointers.get(event.pointerId), svg);
    }

    function onPointerMove(event) {
        const pointer = pointers.get(event.pointerId);
        if (!pointer) return;
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        const svg = pointer.svg;
        const rect = svg.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        if (pointers.size >= 2) {
            if (gesture?.type !== 'pinch' || gesture.svg !== svg) startPinch(svg);
            const pair = [...pointers.values()].slice(0, 2);
            if (pair.length < 2) return;
            const mid = midpoint(pair[0], pair[1]);
            const ratio = Math.max(0.1, distance(pair[0], pair[1]) / Math.max(1, gesture.startDistance));
            const anchor = pointToMap(gesture.startMid.x, gesture.startMid.y, rect, gesture.startBox);
            const width = gesture.startBox.width / ratio;
            const height = gesture.startBox.height / ratio;
            const ux = clamp((mid.x - rect.left) / Math.max(1, rect.width), 0, 1);
            const uy = clamp((mid.y - rect.top) / Math.max(1, rect.height), 0, 1);
            applyBox(svg, { x: anchor.x - ux * width, y: anchor.y - uy * height, width, height });
            suppressClickUntil = Date.now() + 250;
            event.preventDefault();
            return;
        }

        if (gesture?.type !== 'pan' || gesture.pointerId !== event.pointerId || gesture.svg !== svg) startPan(pointer, svg);
        const dx = event.clientX - gesture.startX;
        const dy = event.clientY - gesture.startY;
        if (!gesture.moved && Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
        gesture.moved = true;
        const box = gesture.startBox;
        applyBox(svg, { ...box, x: box.x - (dx / Math.max(1, rect.width)) * box.width, y: box.y - (dy / Math.max(1, rect.height)) * box.height });
        suppressClickUntil = Date.now() + 220;
        event.preventDefault();
    }

    function onPointerEnd(event) {
        if (!pointers.has(event.pointerId)) return;
        const moved = Boolean(gesture?.moved);
        pointers.delete(event.pointerId);
        if (moved) suppressClickUntil = Date.now() + 220;
        if (pointers.size === 1) {
            const remaining = [...pointers.values()][0];
            startPan(remaining, remaining.svg);
        } else if (!pointers.size) gesture = null;
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
        const factor = Math.exp(-event.deltaY * 0.0014);
        const width = box.width / factor;
        const height = box.height / factor;
        const ux = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
        const uy = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
        applyBox(svg, { x: anchor.x - ux * width, y: anchor.y - uy * height, width, height });
        event.preventDefault();
    }

    function onClick(event) {
        if (Date.now() >= suppressClickUntil) return;
        if (!viewportFor(event.target) || ignoreTarget(event.target)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    function ensureStyles(doc) {
        if (!doc || doc.getElementById(STYLE_ID)) return;
        const style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = '#world-map-viewport{touch-action:none!important;overscroll-behavior:none!important;user-select:none;-webkit-user-select:none}#world-map-viewport .world-map-svg,#world-map-viewport .world-map-local-svg{touch-action:none!important}';
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
        doc.addEventListener('click', onClick, true);
        root.__cronacheWorldMapV11GesturesSafeVersion = PATCH_VERSION;
        return true;
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(document), { once: true });
        else install(document);
    }

    return { PATCH_VERSION, parseViewBox, normalizeBox, install };
});