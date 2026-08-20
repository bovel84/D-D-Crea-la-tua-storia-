(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheWorldMapV10MobileLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-world-map-v10-mobile-layout-style';
    let observer = null;

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 320) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const keyOf = value => clean(value, 700).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function factionSource(world, name) {
        const wanted = keyOf(name);
        return asArray(world?.factions).find(item => keyOf(item?.name) === wanted) || null;
    }

    function findLocation(model, value) {
        const wanted = keyOf(value);
        if (!wanted) return null;
        return asArray(model?.locations).find(item => keyOf(item?.name) === wanted)
            || asArray(model?.locations).find(item => keyOf(item?.name).includes(wanted) || wanted.includes(keyOf(item?.name)))
            || null;
    }

    function territoryForFaction(world, faction, model) {
        const raw = factionSource(world, faction?.name) || {};
        const explicit = clean(raw.territory || raw.territoryName || raw.region || raw.nation, 140);
        if (explicit) return explicit;
        const baseName = clean(raw.base || raw.location || faction?.location, 140);
        const base = findLocation(model, baseName);
        return clean(base?.region || base?.nation || '', 140);
    }

    function ensureFactionTerritories(world) {
        if (!world || typeof world !== 'object') return world;
        const locations = asArray(world.locations);
        asArray(world.factions).forEach(faction => {
            if (clean(faction?.territory, 140)) return;
            const baseName = clean(faction?.base || faction?.location, 140);
            if (!baseName) return;
            const wanted = keyOf(baseName);
            const base = locations.find(item => keyOf(item?.name) === wanted)
                || locations.find(item => keyOf(item?.name).includes(wanted) || wanted.includes(keyOf(item?.name)));
            if (base) faction.territory = clean(base.region || base.nation || base.name, 140);
        });
        return world;
    }

    function preserveFactionTerritories(original, self, args) {
        const source = args[0] && typeof args[0] === 'object' ? args[0] : null;
        const sourceByName = new Map(asArray(source?.factions).map(item => [keyOf(item?.name), item]));
        if (source) ensureFactionTerritories(source);
        const result = original.apply(self, args);
        if (!result || typeof result !== 'object' || !Array.isArray(result.factions)) return result;
        result.factions.forEach(faction => {
            const previous = sourceByName.get(keyOf(faction?.name));
            if (!clean(faction?.territory, 140) && clean(previous?.territory, 140)) faction.territory = previous.territory;
            if (!clean(faction?.territory, 140)) {
                const baseName = clean(faction?.base || faction?.location, 140);
                const base = asArray(result.locations).find(item => keyOf(item?.name) === keyOf(baseName));
                if (base) faction.territory = clean(base.region || base.nation || base.name, 140);
            }
        });
        return result;
    }

    function wrapBootstrap() {
        const bootstrap = root.CronacheWorldBootstrap;
        if (!bootstrap) return false;
        let patched = false;
        ['migrateWorld', 'ensureMinimumWorld', 'ingestResponse', 'syncFromMemory', 'applyWorldMoves', 'applyTimelineEvents', 'markInteraction', 'applyConversationOutcomes'].forEach(name => {
            const original = bootstrap[name];
            if (typeof original !== 'function' || original.__worldMapMobileLayoutWrapped) return;
            const wrapped = function preserveTerritoryWrapper(...args) {
                return preserveFactionTerritories(original, this, args);
            };
            wrapped.__worldMapMobileLayoutWrapped = true;
            wrapped.__worldMapV10Wrapped = true;
            wrapped.__worldMapV10Original = original.__worldMapV10Original || original;
            bootstrap[name] = wrapped;
            patched = true;
        });
        return patched;
    }

    function groupRegionLocations(model) {
        const groups = new Map();
        asArray(model?.locations).forEach(location => {
            if (/property|business|resource/.test(clean(location?.kind, 40))) return;
            const region = clean(location?.region, 120);
            if (!region) return;
            const id = `${keyOf(location?.nation)}|${keyOf(region)}`;
            if (!groups.has(id)) groups.set(id, { id, name: region, nation: clean(location?.nation, 120), locations: [] });
            groups.get(id).locations.push(location);
        });
        return [...groups.values()];
    }

    function buildRegionZones(model) {
        const v10 = root.CronacheWorldMapV10;
        const width = Number(model?.width) || 960;
        const height = Number(model?.height) || 620;
        return groupRegionLocations(model).map(group => {
            const sourcePoints = group.locations.map(location => ({ x: Number(location.x), y: Number(location.y) }))
                .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
            if (!sourcePoints.length) return null;
            const points = typeof v10?.paddedPolygon === 'function'
                ? v10.paddedPolygon(sourcePoints, 30, width, height)
                : sourcePoints;
            const center = group.locations.reduce((sum, location) => ({
                x: sum.x + Number(location.x || 0) / group.locations.length,
                y: sum.y + Number(location.y || 0) / group.locations.length
            }), { x: 0, y: 0 });
            return { ...group, points, x: Math.round(center.x), y: Math.round(center.y) };
        }).filter(Boolean);
    }

    function buildHostileMarkers(model, world) {
        const markers = [];
        asArray(model?.factions).filter(faction => faction?.stance === 'hostile' || Number(faction?.hostility) >= 65).forEach((faction, index) => {
            const raw = factionSource(world, faction.name) || {};
            const baseName = clean(raw.base || raw.location || faction.location, 140);
            let location = findLocation(model, baseName);
            const territory = territoryForFaction(world, faction, model);
            if (!location && territory) {
                const candidates = asArray(model?.locations).filter(item =>
                    keyOf(item?.region) === keyOf(territory) || keyOf(item?.nation) === keyOf(territory)
                );
                if (candidates.length) location = candidates[index % candidates.length];
            }
            if (!location) return;
            const sameBaseCount = markers.filter(item => item.locationId === location.id).length;
            markers.push({
                id: `hostile-${keyOf(faction.name) || index}`,
                factionId: faction.id,
                name: clean(faction.name, 120),
                locationId: location.id,
                locationName: location.name,
                territory,
                hostility: Math.round(Number(faction.hostility) || 70),
                color: faction.color || '#9b272b',
                x: clamp(Number(location.x) + 27 + sameBaseCount * 19, 24, (Number(model.width) || 960) - 24),
                y: clamp(Number(location.y) - 32 - sameBaseCount * 10, 24, (Number(model.height) || 620) - 24),
                nextMove: clean(faction.nextMove, 180)
            });
        });
        return markers;
    }

    function wrapMapModel() {
        const map = root.CronacheWorldMap;
        if (!map || typeof map.buildMapModel !== 'function') return false;
        const original = map.buildMapModel;
        if (original.__worldMapMobileLayoutWrapped) return true;
        const wrapped = function buildMapModelWithRegionsAndThreats(input = {}, context = {}) {
            const world = input?.world || input || {};
            ensureFactionTerritories(world);
            const model = original.call(this, input, context);
            model.regionZones = buildRegionZones(model);
            model.hostileMarkers = buildHostileMarkers(model, world);
            const runtime = root.CronacheWorldMapV10?.runtime;
            if (runtime) runtime.lastModel = model;
            return model;
        };
        wrapped.__worldMapMobileLayoutWrapped = true;
        wrapped.__worldMapV10Wrapped = true;
        wrapped.__worldMapV10MobileFixWrapped = true;
        wrapped.__worldMapV10Original = original.__worldMapV10Original || original;
        map.buildMapModel = wrapped;
        return true;
    }

    function overlaysMarkup(model) {
        const regionZones = `<g class="world-map-region-zones">${asArray(model?.regionZones).map(region => {
            const points = asArray(region.points).map(point => `${Math.round(point.x)},${Math.round(point.y)}`).join(' ');
            return points ? `<g class="world-map-region-zone"><polygon points="${points}"/><title>${escapeHtml(region.name)}${region.nation ? ` — ${escapeHtml(region.nation)}` : ''}</title></g>` : '';
        }).join('')}</g>`;
        const threats = `<g class="world-map-hostile-markers">${asArray(model?.hostileMarkers).map(marker =>
            `<g class="world-map-hostile-marker" transform="translate(${Math.round(marker.x)} ${Math.round(marker.y)})" style="--hostile-color:${escapeHtml(marker.color)}"><circle class="world-map-hostile-pulse" r="17"/><circle r="11"/><text text-anchor="middle" dominant-baseline="central">⚑</text><title>${escapeHtml(marker.name)} · ostilità ${marker.hostility}/100 · ${escapeHtml(marker.locationName)}${marker.nextMove ? ` — ${escapeHtml(marker.nextMove)}` : ''}</title></g>`
        ).join('')}</g>`;
        return { regionZones, threats };
    }

    function wrapSvg() {
        const map = root.CronacheWorldMap;
        if (!map || typeof map.svgMarkup !== 'function') return false;
        const original = map.svgMarkup;
        if (original.__worldMapMobileLayoutWrapped) return true;
        const wrapped = function svgMarkupWithRegionsAndThreats(model) {
            let svg = original.call(this, model);
            if (!svg || !model) return svg;
            const overlays = overlaysMarkup(model);
            svg = svg.replace('<g class="world-map-routes">', `${overlays.regionZones}<g class="world-map-routes">`);
            svg = svg.replace('<g class="world-map-compass"', `${overlays.threats}<g class="world-map-compass"`);
            return svg;
        };
        wrapped.__worldMapMobileLayoutWrapped = true;
        wrapped.__worldMapV10Wrapped = true;
        wrapped.__worldMapV10Original = original.__worldMapV10Original || original;
        map.svgMarkup = wrapped;
        return true;
    }

    function cssText() {
        return `
.world-map-region-zone{pointer-events:none}
.world-map-region-zone polygon{fill:rgba(255,248,216,.035);stroke:rgba(77,56,34,.38);stroke-width:2;stroke-dasharray:5 6}
.world-map-hostile-markers{pointer-events:none}
.world-map-hostile-marker circle:not(.world-map-hostile-pulse){fill:var(--hostile-color);stroke:#ffe59b;stroke-width:3;filter:url(#map-shadow)}
.world-map-hostile-marker text{fill:#fff8dc;font:700 13px Georgia,serif}
.world-map-hostile-pulse{fill:none;stroke:var(--hostile-color);stroke-width:4;opacity:.78;animation:mapMobileHostilePulse 1.9s ease-out infinite}
@keyframes mapMobileHostilePulse{0%{transform:scale(.7);opacity:.9}100%{transform:scale(1.55);opacity:0}}
.world-map-mobile-nav{display:none}

@media(max-width:760px){
  .world-map-modal{width:calc(100vw - 4px)!important;height:calc(100dvh - 4px)!important;margin:2px!important;border-radius:14px!important}
  .world-map-modal .modal-header{min-height:48px!important;padding:8px 12px!important}
  .world-map-modal .modal-header>span{font-size:.9rem!important}
  .world-map-modal .modal-close{width:36px!important;height:36px!important;font-size:1.45rem!important}
  .world-map-body{height:calc(100dvh - 54px)!important;padding:6px!important;gap:5px!important;grid-template-areas:'status' 'tools' 'mobile-nav' 'map'!important;grid-template-rows:auto auto auto minmax(0,1fr)!important}
  .world-map-status{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;gap:4px 7px!important;padding:7px 8px!important;border-radius:11px!important}
  .world-map-status>div:first-child{display:block!important;min-width:0!important}
  .world-map-status strong{display:block!important;font-size:.78rem!important;line-height:1.15!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
  .world-map-status small{display:block!important;margin-top:2px!important;font-size:.59rem!important;line-height:1.2!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
  .world-map-position{grid-column:2!important;grid-row:1!important;max-width:38vw!important;padding:5px 7px!important;border-radius:999px!important;font-size:.59rem!important;min-height:30px!important;box-shadow:none!important}
  .world-map-status>.world-map-v10-layerbar{grid-column:1/-1!important;grid-row:2!important;padding-top:4px!important;gap:4px!important;border-top-color:rgba(105,69,24,.12)!important}
  .world-map-v10-breadcrumb{display:none!important}
  .world-map-v10-layer,.world-map-v10-reset{min-height:27px!important;padding:3px 7px!important;font-size:.5rem!important}

  .world-map-tools{grid-area:tools!important;gap:4px!important;min-height:34px!important;padding:0 1px!important;overflow-x:auto!important;scroll-snap-type:x proximity!important}
  .world-map-tool{min-height:32px!important;padding:4px 8px!important;border-radius:999px!important;font-size:.55rem!important;scroll-snap-align:start!important}
  #btn-map-refresh,#btn-map-dice,#btn-map-images{display:none!important}

  .world-map-mobile-nav{grid-area:mobile-nav;display:flex;align-items:center;gap:5px;min-height:31px;overflow-x:auto;scrollbar-width:none;padding:1px 0}
  .world-map-mobile-nav::-webkit-scrollbar{display:none}
  .world-map-mobile-label{flex:0 0 auto;color:#6b5035;font:700 .52rem 'Cinzel',serif;text-transform:uppercase}
  .world-map-mobile-chip{flex:0 0 auto;min-height:28px;padding:4px 8px;border:1px solid rgba(105,69,24,.28);border-radius:999px;background:rgba(255,250,230,.82);color:#4b321f;font:700 .54rem 'Cinzel',serif;white-space:nowrap}
  .world-map-mobile-chip.threat{color:#fff8dc;background:#86292f;border-color:#86292f}
  .world-map-mobile-chip.active{outline:2px solid #8b6914;outline-offset:1px}

  .world-map-viewport{grid-area:map!important;height:auto!important;min-height:0!important;border-radius:10px!important;border-width:1px!important}
  .world-map-canvas{padding:3px!important}
  .world-map-side{left:5px!important;right:5px!important;bottom:5px!important;max-height:min(54dvh,500px)!important;transform:translateY(calc(100% - 45px))!important}
  .world-map-side.map-v10-sheet-open{transform:translateY(0)!important}
  .world-map-v10-sheet-handle{min-height:39px!important;margin-bottom:5px!important}
  .world-map-region-zone polygon{stroke-width:2.5;stroke-dasharray:6 5;opacity:.85}
  .world-map-hostile-marker text{font-size:12px}
}

@media(max-width:430px){
  .world-map-status small{display:none!important}
  .world-map-position{max-width:42vw!important}
  .world-map-body{grid-template-rows:auto auto auto minmax(0,1fr)!important}
  .world-map-tool{font-size:.51rem!important;padding:4px 7px!important}
  .world-map-mobile-chip{font-size:.5rem!important;padding:4px 7px!important}
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

    function scrollToLocation(doc, location) {
        if (!doc || !location) return;
        const viewport = doc.getElementById('world-map-viewport');
        const svg = doc.querySelector('#world-map-canvas .world-map-svg');
        if (!viewport || !svg) return;
        const model = root.CronacheWorldMapV10?.runtime?.lastModel;
        const scale = svg.getBoundingClientRect().width / Math.max(1, Number(model?.width) || 960);
        viewport.scrollTo({
            left: Math.max(0, Number(location.x) * scale - viewport.clientWidth / 2),
            top: Math.max(0, Number(location.y) * scale - viewport.clientHeight / 2),
            behavior: 'smooth'
        });
    }

    function focusRegion(doc, regionName) {
        const model = root.CronacheWorldMapV10?.runtime?.lastModel;
        if (!model) return;
        const matches = asArray(model.locations).filter(item => keyOf(item?.region) === keyOf(regionName));
        const ids = new Set(matches.map(item => item.id));
        doc.querySelectorAll('#modal-world-map .world-map-node').forEach(node => {
            node.classList.toggle('map-v10-outscope', matches.length > 0 && !ids.has(node.dataset.mapLocationId));
        });
        if (matches.length) {
            const center = matches.reduce((sum, item) => ({ x: sum.x + Number(item.x) / matches.length, y: sum.y + Number(item.y) / matches.length }), { x: 0, y: 0 });
            scrollToLocation(doc, center);
        }
        doc.querySelectorAll('.world-map-mobile-chip[data-map-region]').forEach(button =>
            button.classList.toggle('active', keyOf(button.dataset.mapRegion) === keyOf(regionName))
        );
    }

    function focusThreat(doc, factionName) {
        const model = root.CronacheWorldMapV10?.runtime?.lastModel;
        if (!model) return;
        const marker = asArray(model.hostileMarkers).find(item => keyOf(item.name) === keyOf(factionName));
        if (!marker) return;
        const location = asArray(model.locations).find(item => item.id === marker.locationId);
        if (location) {
            scrollToLocation(doc, location);
            const node = doc.querySelector(`#modal-world-map .world-map-node[data-map-location-id="${CSS.escape(location.id)}"]`);
            if (node) node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
    }

    function ensureMobileNav(doc) {
        const body = doc?.querySelector('#modal-world-map .world-map-body');
        const model = root.CronacheWorldMapV10?.runtime?.lastModel;
        if (!body || !model) return;
        let nav = body.querySelector('.world-map-mobile-nav');
        if (!nav) {
            nav = doc.createElement('div');
            nav.className = 'world-map-mobile-nav';
            const viewport = body.querySelector('.world-map-viewport');
            if (viewport) body.insertBefore(nav, viewport);
            else body.appendChild(nav);
        }
        const regions = groupRegionLocations(model);
        const threats = asArray(model.hostileMarkers);
        const signature = `${regions.map(item => item.name).join('|')}::${threats.map(item => item.name).join('|')}`;
        if (nav.dataset.signature === signature) return;
        nav.dataset.signature = signature;
        nav.innerHTML = '';
        if (regions.length) {
            nav.insertAdjacentHTML('beforeend', '<span class="world-map-mobile-label">Regioni</span>');
            regions.forEach(region => nav.insertAdjacentHTML('beforeend', `<button type="button" class="world-map-mobile-chip" data-map-region="${escapeHtml(region.name)}">${escapeHtml(region.name)}</button>`));
        }
        if (threats.length) {
            nav.insertAdjacentHTML('beforeend', '<span class="world-map-mobile-label">Minacce</span>');
            threats.forEach(threat => nav.insertAdjacentHTML('beforeend', `<button type="button" class="world-map-mobile-chip threat" data-map-threat="${escapeHtml(threat.name)}">⚑ ${escapeHtml(threat.name)}</button>`));
        }
        nav.querySelectorAll('[data-map-region]').forEach(button => button.addEventListener('click', () => focusRegion(doc, button.dataset.mapRegion)));
        nav.querySelectorAll('[data-map-threat]').forEach(button => button.addEventListener('click', () => focusThreat(doc, button.dataset.mapThreat)));
    }

    function bindReset(doc) {
        if (!doc || doc.documentElement?.dataset.worldMapMobileLayoutBound === '1') return;
        if (doc.documentElement) doc.documentElement.dataset.worldMapMobileLayoutBound = '1';
        doc.addEventListener('click', event => {
            if (!event.target.closest?.('.world-map-v10-reset,[data-map-filter="all"]')) return;
            doc.querySelectorAll('.world-map-mobile-chip.active').forEach(button => button.classList.remove('active'));
        }, true);
    }

    function refresh(doc) {
        ensureMobileNav(doc);
    }

    function observe(doc) {
        if (!doc || observer || typeof MutationObserver === 'undefined') return;
        observer = new MutationObserver(() => {
            if (doc.getElementById('modal-world-map')?.classList.contains('active')) refresh(doc);
        });
        observer.observe(doc.documentElement || doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    function install(doc = typeof document !== 'undefined' ? document : null) {
        const patched = [wrapBootstrap(), wrapMapModel(), wrapSvg()].some(Boolean);
        if (doc) {
            ensureStyles(doc);
            bindReset(doc);
            refresh(doc);
            observe(doc);
        }
        root.__cronacheWorldMapV10MobileLayoutVersion = PATCH_VERSION;
        return patched || Boolean(doc);
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(document), { once: true });
        else install(document);
        if (typeof root.setTimeout === 'function') [80, 300, 900, 1800, 3200].forEach(delay => root.setTimeout(() => install(document), delay));
    }

    return {
        PATCH_VERSION,
        ensureFactionTerritories,
        buildRegionZones,
        buildHostileMarkers,
        cssText,
        install
    };
});