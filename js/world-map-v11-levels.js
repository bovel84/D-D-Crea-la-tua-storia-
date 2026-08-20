(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheWorldMapV11Levels = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-world-map-v11-levels-style';
    const runtime = {
        level: 'world',
        scopeName: '',
        selectedLocationId: '',
        interiorParentId: '',
        worldMarkup: '',
        observer: null,
        refreshing: false
    };

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 400) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const keyOf = value => clean(value, 700).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function modelNow() {
        return root.CronacheWorldMapV10?.runtime?.lastModel || null;
    }

    function locationById(model, id) {
        return asArray(model?.locations).find(item => item.id === id) || null;
    }

    function selectedLocation(model = modelNow()) {
        return locationById(model, runtime.selectedLocationId)
            || locationById(model, model?.currentLocationId)
            || asArray(model?.locations).find(item => item.current)
            || null;
    }

    function hierarchyPath(location) {
        if (!location) return [{ level: 'world', label: 'Mondo', value: '' }];
        const path = [{ level: 'world', label: 'Mondo', value: '' }];
        if (clean(location.continent, 100)) path.push({ level: 'continent', label: clean(location.continent, 100), value: location.continent });
        if (clean(location.nation, 100)) path.push({ level: 'nation', label: clean(location.nation, 100), value: location.nation });
        if (clean(location.region, 100)) path.push({ level: 'region', label: clean(location.region, 100), value: location.region });
        path.push({ level: 'site', label: clean(location.name, 100), value: location.id });
        if (runtime.level === 'interior') path.push({ level: 'interior', label: 'Interni', value: location.id });
        return path;
    }

    function locationsForScope(model, level, value, anchor = null) {
        const locations = asArray(model?.locations);
        const wanted = keyOf(value);
        if (!locations.length || level === 'world' || !wanted) return locations;
        if (level === 'continent') return locations.filter(item => keyOf(item.continent) === wanted);
        if (level === 'nation') return locations.filter(item => keyOf(item.nation) === wanted);
        if (level === 'region') return locations.filter(item => keyOf(item.region) === wanted);
        if (level === 'site') {
            const site = anchor || locationById(model, value);
            if (!site) return locations;
            return locations.filter(item => {
                if (item.id === site.id) return true;
                if (keyOf(item.region) !== keyOf(site.region)) return false;
                const dx = Number(item.x || 0) - Number(site.x || 0);
                const dy = Number(item.y || 0) - Number(site.y || 0);
                return Math.hypot(dx, dy) <= 245;
            });
        }
        return locations;
    }

    function scopeBox(model, locations, level) {
        const width = Number(model?.width) || 960;
        const height = Number(model?.height) || 620;
        if (!locations.length || level === 'world') return { x: 0, y: 0, width, height };
        const xs = locations.map(item => Number(item.x)).filter(Number.isFinite);
        const ys = locations.map(item => Number(item.y)).filter(Number.isFinite);
        if (!xs.length || !ys.length) return { x: 0, y: 0, width, height };
        let minX = Math.min(...xs);
        let maxX = Math.max(...xs);
        let minY = Math.min(...ys);
        let maxY = Math.max(...ys);
        const padding = level === 'site' ? 112 : level === 'region' ? 78 : 96;
        if (maxX - minX < 230) {
            const center = (minX + maxX) / 2;
            minX = center - 115;
            maxX = center + 115;
        }
        if (maxY - minY < 180) {
            const center = (minY + maxY) / 2;
            minY = center - 90;
            maxY = center + 90;
        }
        minX = clamp(minX - padding, 0, width);
        minY = clamp(minY - padding, 0, height);
        maxX = clamp(maxX + padding, 0, width);
        maxY = clamp(maxY + padding, 0, height);
        const boxWidth = Math.max(220, maxX - minX);
        const boxHeight = Math.max(170, maxY - minY);
        return {
            x: clamp(minX, 0, Math.max(0, width - boxWidth)),
            y: clamp(minY, 0, Math.max(0, height - boxHeight)),
            width: Math.min(width, boxWidth),
            height: Math.min(height, boxHeight)
        };
    }

    function setSvgScope(doc, level, value, anchor = null) {
        const model = modelNow();
        const svg = doc?.querySelector('#world-map-canvas .world-map-svg');
        if (!model || !svg || runtime.level === 'interior') return;
        const matches = locationsForScope(model, level, value, anchor);
        const ids = new Set(matches.map(item => item.id));
        doc.querySelectorAll('#modal-world-map .world-map-node').forEach(node => {
            node.classList.toggle('map-v11-level-hidden', level !== 'world' && !ids.has(node.dataset.mapLocationId));
        });
        const box = scopeBox(model, matches, level);
        svg.setAttribute('viewBox', `${Math.round(box.x)} ${Math.round(box.y)} ${Math.round(box.width)} ${Math.round(box.height)}`);
        const modal = doc.getElementById('modal-world-map');
        if (modal) {
            modal.dataset.mapLevel = level;
            modal.classList.toggle('map-v11-scoped', level !== 'world');
        }
    }

    function resetWorldMarkup(doc) {
        const canvas = doc?.getElementById('world-map-canvas');
        if (!canvas || !runtime.worldMarkup) return false;
        canvas.innerHTML = runtime.worldMarkup;
        runtime.worldMarkup = '';
        const modal = doc.getElementById('modal-world-map');
        modal?.classList.remove('map-v11-interior');
        runtime.interiorParentId = '';
        return true;
    }

    function setLevel(doc, level, value = '', anchor = null) {
        const model = modelNow();
        if (!model) return;
        if (runtime.level === 'interior' && level !== 'interior') resetWorldMarkup(doc);
        runtime.level = level;
        runtime.scopeName = clean(value, 160);
        if (anchor?.id) runtime.selectedLocationId = anchor.id;
        setSvgScope(doc, level, value, anchor);
        refreshOverlay(doc);
    }

    function roomIcon(room) {
        const corpus = keyOf(`${room?.name || ''} ${room?.type || ''}`);
        if (/cappell|chiesa|santuar/.test(corpus)) return '✞';
        if (/prigion|sotterr|cantin/.test(corpus)) return '◆';
        if (/bibliotec|studio|archiv/.test(corpus)) return '▤';
        if (/cortil|giardin/.test(corpus)) return '❦';
        if (/scuderi/.test(corpus)) return '♞';
        if (/cucin/.test(corpus)) return '♨';
        if (/torre|mastio/.test(corpus)) return '▲';
        if (/sala|salone/.test(corpus)) return '♜';
        return '●';
    }

    function buildInteriorModel(parent) {
        const rooms = asArray(parent?.subLocations).map((room, index) => ({
            ...room,
            id: clean(room.id, 160) || `room-${hashNumber(`${parent?.id}|${room?.name}|${index}`).toString(36)}`,
            name: clean(room.name, 140) || `Ambiente ${index + 1}`,
            current: Boolean(room.current || keyOf(room.name) === keyOf(parent?.currentInteriorName)),
            icon: roomIcon(room)
        }));
        const count = rooms.length;
        const cols = Math.max(2, Math.ceil(Math.sqrt(Math.max(1, count) * 1.45)));
        const rows = Math.max(1, Math.ceil(count / cols));
        const width = 760;
        const height = Math.max(420, 160 + rows * 135);
        const cellW = (width - 120) / cols;
        const cellH = (height - 130) / Math.max(1, rows);
        rooms.forEach((room, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            room.x = Math.round(60 + cellW * (col + .5));
            room.y = Math.round(80 + cellH * (row + .5));
        });
        const edges = [];
        rooms.slice(1).forEach((room, index) => edges.push({ from: rooms[index].id, to: room.id }));
        return { parent, rooms, edges, width, height };
    }

    function interiorMarkup(parent) {
        const model = buildInteriorModel(parent);
        const byId = new Map(model.rooms.map(room => [room.id, room]));
        const edges = model.edges.map(edge => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (!from || !to) return '';
            return `<path class="map-v11-room-route" d="M ${from.x} ${from.y} L ${to.x} ${to.y}"/>`;
        }).join('');
        const rooms = model.rooms.map(room => {
            const label = escapeHtml(room.name.length > 28 ? `${room.name.slice(0, 27)}…` : room.name);
            return `<g class="map-v11-room${room.current ? ' current' : ''}" data-map-v11-room-id="${escapeHtml(room.id)}" data-map-v11-room-name="${escapeHtml(room.name)}" transform="translate(${room.x} ${room.y})" role="button" tabindex="0"><rect x="-82" y="-38" width="164" height="76" rx="16"/><text class="map-v11-room-icon" y="-8" text-anchor="middle">${escapeHtml(room.icon)}</text><text class="map-v11-room-label" y="20" text-anchor="middle">${label}</text>${room.current ? '<circle class="map-v11-room-current" r="48"/>' : ''}</g>`;
        }).join('');
        return `<div class="map-v11-interior-shell"><svg class="world-map-local-svg" viewBox="0 0 ${model.width} ${model.height}" xmlns="http://www.w3.org/2000/svg" aria-label="Interni di ${escapeHtml(parent.name)}"><rect class="map-v11-floor" x="8" y="8" width="${model.width - 16}" height="${model.height - 16}" rx="28"/>${edges}${rooms}<text class="map-v11-interior-title" x="28" y="38">${escapeHtml(parent.name)}</text></svg></div>`;
    }

    function enterInterior(doc, parent) {
        const canvas = doc?.getElementById('world-map-canvas');
        if (!canvas || !parent || !asArray(parent.subLocations).length) return false;
        if (runtime.level !== 'interior') runtime.worldMarkup = canvas.innerHTML;
        runtime.level = 'interior';
        runtime.selectedLocationId = parent.id;
        runtime.interiorParentId = parent.id;
        canvas.innerHTML = interiorMarkup(parent);
        doc.getElementById('modal-world-map')?.classList.add('map-v11-interior');
        const viewport = doc.getElementById('world-map-viewport');
        if (viewport) viewport.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
        refreshOverlay(doc);
        decorateInteriorDetail(doc, parent, asArray(parent.subLocations).find(room => room.current || keyOf(room.name) === keyOf(parent.currentInteriorName)) || null);
        return true;
    }

    function dispatchMove(doc, roomName) {
        const input = doc?.getElementById('action-input');
        const send = doc?.getElementById('btn-send');
        if (!input || !send || !clean(roomName, 140)) return;
        input.value = `Mi sposto verso ${clean(roomName, 140)}`;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        doc.querySelector('#modal-world-map .modal-close,[data-close="modal-world-map"]')?.click();
        setTimeout(() => send.click(), 40);
    }

    function decorateInteriorDetail(doc, parent, room) {
        const detail = doc?.getElementById('world-map-detail');
        if (!detail || !parent) return;
        detail.querySelector('.map-v11-room-detail')?.remove();
        const box = doc.createElement('div');
        box.className = 'map-v11-room-detail';
        box.innerHTML = `<b>${escapeHtml(room?.name || parent.currentInteriorName || 'Interni')}</b><span>Dentro ${escapeHtml(parent.name)}</span>` +
            (room && !room.current ? `<button type="button" data-map-v11-move-room="${escapeHtml(room.name)}">Vai qui</button>` : '<em>Posizione attuale</em>');
        detail.prepend(box);
        box.querySelector('[data-map-v11-move-room]')?.addEventListener('click', event => dispatchMove(doc, event.currentTarget.dataset.mapV11MoveRoom));
        doc.querySelector('#modal-world-map .world-map-side')?.classList.add('map-v10-sheet-open');
    }

    function ensureStructureAction(doc) {
        if (runtime.level === 'interior') return;
        const model = modelNow();
        const detail = doc?.getElementById('world-map-detail');
        if (!model || !detail) return;
        const id = detail.dataset.mapV10Location || runtime.selectedLocationId || model.currentLocationId;
        const location = locationById(model, id) || selectedLocation(model);
        detail.querySelector('[data-map-v11-enter-interior]')?.remove();
        if (!location || !asArray(location.subLocations).length) return;
        let actions = detail.querySelector('.world-map-v10-actions');
        if (!actions) {
            actions = doc.createElement('div');
            actions.className = 'world-map-v10-actions';
            detail.appendChild(actions);
        }
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'world-map-v10-action map-v11-enter';
        button.dataset.mapV11EnterInterior = location.id;
        button.textContent = `⌂ Interni (${location.subLocations.length})`;
        actions.prepend(button);
    }

    function breadcrumbMarkup(model) {
        const location = selectedLocation(model);
        const path = hierarchyPath(location);
        return path.map(item => {
            const active = runtime.level === item.level || (runtime.level === 'interior' && item.level === 'interior');
            const value = item.level === 'site' || item.level === 'interior' ? location?.id || '' : item.value;
            return `<button type="button" class="map-v11-crumb${active ? ' active' : ''}" data-map-v11-level="${escapeHtml(item.level)}" data-map-v11-value="${escapeHtml(value)}">${escapeHtml(item.label)}</button>`;
        }).join('<span>›</span>');
    }

    function ensureOverlay(doc) {
        const viewport = doc?.getElementById('world-map-viewport');
        if (!viewport) return null;
        let overlay = viewport.querySelector('.map-v11-level-overlay');
        if (!overlay) {
            overlay = doc.createElement('div');
            overlay.className = 'map-v11-level-overlay';
            viewport.prepend(overlay);
        }
        return overlay;
    }

    function refreshOverlay(doc) {
        if (runtime.refreshing) return;
        runtime.refreshing = true;
        try {
            const model = modelNow();
            const overlay = ensureOverlay(doc);
            if (!model || !overlay) return;
            overlay.innerHTML = `<div class="map-v11-breadcrumb">${breadcrumbMarkup(model)}</div>`;
            ensureStructureAction(doc);
        } finally {
            runtime.refreshing = false;
        }
    }

    function clickCrumb(doc, button) {
        const model = modelNow();
        if (!model || !button) return;
        const level = button.dataset.mapV11Level;
        const value = button.dataset.mapV11Value || '';
        const location = selectedLocation(model);
        if (level === 'interior') {
            if (location) enterInterior(doc, location);
            return;
        }
        if (level === 'site') {
            setLevel(doc, 'site', location?.id || value, location);
            return;
        }
        setLevel(doc, level || 'world', value, location);
    }

    function bindDom(doc) {
        if (!doc || doc.documentElement?.dataset.worldMapV11LevelsBound === '1') return;
        if (doc.documentElement) doc.documentElement.dataset.worldMapV11LevelsBound = '1';
        doc.addEventListener('click', event => {
            const crumb = event.target.closest?.('[data-map-v11-level]');
            if (crumb) {
                event.preventDefault();
                event.stopPropagation();
                clickCrumb(doc, crumb);
                return;
            }
            const enter = event.target.closest?.('[data-map-v11-enter-interior]');
            if (enter) {
                event.preventDefault();
                const model = modelNow();
                const parent = locationById(model, enter.dataset.mapV11EnterInterior);
                if (parent) enterInterior(doc, parent);
                return;
            }
            const roomNode = event.target.closest?.('[data-map-v11-room-id]');
            if (roomNode) {
                const model = modelNow();
                const parent = locationById(model, runtime.interiorParentId || runtime.selectedLocationId);
                const room = asArray(parent?.subLocations).find(item => item.id === roomNode.dataset.mapV11RoomId || keyOf(item.name) === keyOf(roomNode.dataset.mapV11RoomName));
                if (parent) decorateInteriorDetail(doc, parent, room || { name: roomNode.dataset.mapV11RoomName });
                return;
            }
            const mapNode = event.target.closest?.('#modal-world-map .world-map-node');
            if (mapNode) {
                runtime.selectedLocationId = mapNode.dataset.mapLocationId || '';
                const location = locationById(modelNow(), runtime.selectedLocationId);
                if (location && runtime.level === 'world') {
                    runtime.scopeName = '';
                }
                setTimeout(() => refreshOverlay(doc), 0);
                return;
            }
            const regionButton = event.target.closest?.('[data-map-region]');
            if (regionButton) {
                const location = selectedLocation(modelNow());
                setTimeout(() => setLevel(doc, 'region', regionButton.dataset.mapRegion || '', location), 0);
            }
        }, true);
    }

    function cssText() {
        return `
#world-map-viewport{position:relative!important}
.map-v11-level-overlay{position:absolute;z-index:36;left:8px;top:8px;max-width:calc(100% - 16px);pointer-events:none}
.map-v11-breadcrumb{display:flex;align-items:center;gap:3px;max-width:100%;padding:4px 5px;border:1px solid rgba(93,58,28,.24);border-radius:999px;background:rgba(250,241,204,.91);box-shadow:0 3px 12px rgba(39,26,14,.16);overflow-x:auto;scrollbar-width:none;pointer-events:auto}
.map-v11-breadcrumb::-webkit-scrollbar{display:none}
.map-v11-breadcrumb>span{flex:0 0 auto;color:#846b4b;font-size:.6rem}
.map-v11-crumb{flex:0 0 auto;min-height:26px;padding:3px 7px;border:0;border-radius:999px;background:transparent;color:#4d3927;font:700 .55rem 'Cinzel',serif;white-space:nowrap;cursor:pointer}
.map-v11-crumb.active{background:#792a31;color:#fff7dc}
.map-v11-level-hidden{display:none!important}
#modal-world-map[data-map-level='world'] .world-map-node.site:not(.current) .world-map-node-label{display:none!important}
#modal-world-map[data-map-level='region'] .world-map-node.map-v10-major .world-map-node-label,
#modal-world-map[data-map-level='site'] .world-map-node .world-map-node-label{display:block!important}
.map-v11-enter{border-style:dashed!important}
.map-v11-interior #world-map-canvas{min-height:100%;display:flex;align-items:stretch}
.map-v11-interior-shell{width:100%;min-height:100%;padding:4px}
.world-map-local-svg{display:block;width:100%;height:auto;min-height:100%;background:linear-gradient(145deg,rgba(220,198,132,.76),rgba(244,232,190,.86));border-radius:16px}
.map-v11-floor{fill:rgba(255,250,224,.42);stroke:rgba(91,60,31,.42);stroke-width:3}
.map-v11-room-route{fill:none;stroke:rgba(96,67,41,.36);stroke-width:7;stroke-linecap:round;stroke-dasharray:9 8}
.map-v11-room{cursor:pointer}
.map-v11-room rect{fill:#f5e9bd;stroke:#755735;stroke-width:3;filter:drop-shadow(0 5px 6px rgba(50,35,20,.16))}
.map-v11-room.current rect{fill:#8b2e35;stroke:#ffe39a;stroke-width:5}
.map-v11-room-icon{fill:#442f1e;font:700 24px Georgia,serif}
.map-v11-room.current .map-v11-room-icon,.map-v11-room.current .map-v11-room-label{fill:#fff8df}
.map-v11-room-label{fill:#4d3724;font:700 12px 'Cinzel',serif}
.map-v11-room-current{fill:none;stroke:#b91f2d;stroke-width:5;opacity:.68;animation:mapV11RoomPulse 1.8s ease-out infinite}
@keyframes mapV11RoomPulse{0%{r:42;opacity:.75}100%{r:62;opacity:0}}
.map-v11-interior-title{fill:#60462f;font:italic 700 18px Georgia,serif}
.map-v11-room-detail{margin:4px 0 8px;padding:9px;border-radius:11px;background:rgba(255,255,255,.52);border-left:3px solid #852b32;color:#5d4938}
.map-v11-room-detail b{display:block;font:700 .7rem 'Cinzel',serif;color:#3f2c1e}
.map-v11-room-detail span{display:block;margin-top:2px;font-size:.68rem}
.map-v11-room-detail em{display:inline-block;margin-top:6px;font-size:.62rem;color:#7b5b36}
.map-v11-room-detail button{margin-top:7px;min-height:34px;padding:6px 10px;border:1px solid #7e2930;border-radius:9px;background:#7e2930;color:#fff7dd;font:700 .6rem 'Cinzel',serif}
@media(max-width:760px){
  .map-v11-level-overlay{left:5px;right:5px;top:5px;max-width:none}
  .map-v11-breadcrumb{padding:3px 4px;background:rgba(249,239,200,.94)}
  .map-v11-crumb{min-height:24px;padding:3px 6px;font-size:.49rem}
  .map-v11-interior .world-map-tools,.map-v11-interior .world-map-mobile-nav{display:none!important}
  .map-v11-interior .world-map-body{grid-template-areas:'status' 'map'!important;grid-template-rows:auto minmax(0,1fr)!important}
  .map-v11-interior #world-map-viewport{grid-area:map!important}
  .map-v11-interior .world-map-status>.world-map-v10-layerbar{display:none!important}
  .world-map-local-svg{min-width:650px;min-height:100%}
}
@media(max-width:430px){
  .map-v11-crumb{font-size:.46rem;padding:3px 5px}
  .map-v11-breadcrumb>span{font-size:.5rem}
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
        if (!modal?.classList.contains('active')) return;
        const model = modelNow();
        if (!model) return;
        if (!runtime.selectedLocationId) runtime.selectedLocationId = model.currentLocationId || '';
        if (runtime.level !== 'interior') setSvgScope(doc, runtime.level, runtime.scopeName, selectedLocation(model));
        refreshOverlay(doc);
    }

    function observe(doc) {
        if (!doc || runtime.observer || typeof MutationObserver === 'undefined') return;
        runtime.observer = new MutationObserver(() => {
            if (runtime.refreshing) return;
            setTimeout(() => refresh(doc), 0);
        });
        runtime.observer.observe(doc.documentElement || doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-map-v10-location'] });
    }

    function install(doc = typeof document !== 'undefined' ? document : null) {
        if (doc) {
            ensureStyles(doc);
            bindDom(doc);
            observe(doc);
            refresh(doc);
        }
        root.__cronacheWorldMapV11LevelsVersion = PATCH_VERSION;
        return true;
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(document), { once: true });
        else install(document);
        if (typeof root.setTimeout === 'function') [80, 300, 900, 1800, 3200].forEach(delay => root.setTimeout(() => install(document), delay));
    }

    return {
        PATCH_VERSION,
        hierarchyPath,
        locationsForScope,
        scopeBox,
        buildInteriorModel,
        interiorMarkup,
        roomIcon,
        install,
        runtime
    };
});