(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheRuntimeFixesV14 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-runtime-fixes-v14-style';
    const LEVEL_SCALE = Object.freeze({ world: 0.92, continent: 0.78, nation: 0.64, region: 0.50, site: 0.38 });
    let observer = null;
    let refreshQueued = false;

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 400) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const keyOf = value => clean(value, 700).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    function parseNarrativeNumber(value) {
        const parser = root.CronacheBusiness?.parseNarrativeNumber;
        if (typeof parser === 'function') return parser(value);
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        const raw = String(value == null ? '' : value).trim();
        if (!raw) return null;
        const match = raw.replace(/\s+/g, '').match(/[+-]?(?:\d[\d.,]*|[.,]\d+)/);
        if (!match) return null;
        let normalized = match[0];
        const comma = normalized.lastIndexOf(',');
        const dot = normalized.lastIndexOf('.');
        if (comma >= 0 && dot >= 0) {
            const decimal = comma > dot ? ',' : '.';
            const thousands = decimal === ',' ? '.' : ',';
            normalized = normalized.split(thousands).join('').replace(decimal, '.');
        } else if (comma >= 0) normalized = normalized.replace(',', '.');
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function normalizeBusinessStatus(value, fallback = 'active') {
        const key = keyOf(value);
        if (!key) return fallback;
        if (/^(?:active|attiv[oa]|operativ[oa]|apert[oa]|funzionante|vigente|corrente)$/.test(key) ||
            /(?:in-attivita|in-corso|apert[oa]-al-pubblico|regolarmente-operativ)/.test(key)) return 'active';
        if (/^(?:paused|sospes[oa]|fermo|ferma|congelat[oa])$/.test(key) || /(?:in-pausa|temporaneamente-chius)/.test(key)) return 'paused';
        if (/^(?:closed|chius[oa]|cessat[oa]|terminat[oa])$/.test(key) || /(?:fuori-attivita|cessazione)/.test(key)) return 'closed';
        return fallback;
    }

    function normalizeContractStatus(value, fallback = 'active') {
        const key = keyOf(value);
        if (!key) return fallback;
        if (/^(?:draft|bozza|proposta|preventivo)$/.test(key) || /(?:da-firmare|in-negoziazione|da-approvare)/.test(key)) return 'draft';
        if (/^(?:active|attiv[oa]|vigente|valid[oa]|efficace|esecutiv[oa]|firmat[oa]|sottoscritt[oa]|operativ[oa])$/.test(key) ||
            /(?:in-corso|regolarmente-attiv|contratto-firmato)/.test(key)) return 'active';
        if (/^(?:paused|sospes[oa]|congelat[oa])$/.test(key) || /in-pausa/.test(key)) return 'paused';
        if (/^(?:expired|scadut[oa])$/.test(key) || /scaden/.test(key)) return 'expired';
        if (/^(?:terminated|terminat[oa]|risolt[oa]|chius[oa]|revocat[oa]|annullat[oa]|conclus[oa])$/.test(key)) return 'terminated';
        return fallback;
    }

    function managementBusinesses(state) {
        if (asArray(state?.businesses).length) return state.businesses;
        return asArray(state?.management?.businesses);
    }

    function findBusiness(state, name) {
        const wanted = keyOf(name);
        if (!wanted) return null;
        return managementBusinesses(state).find(item => keyOf(item?.name) === wanted || keyOf(item?.propertyName) === wanted) || null;
    }

    function findContract(business, event) {
        if (!business) return null;
        const title = keyOf(event?.title);
        const party = keyOf(event?.counterpartyName);
        return asArray(business.contracts).find(item =>
            (!title || keyOf(item?.title) === title) && (!party || keyOf(item?.counterpartyName) === party)
        ) || null;
    }

    function normalizeContractAmount(value) {
        if (value == null || value === '') return '';
        const parsed = parseNarrativeNumber(value);
        if (parsed != null) return Math.max(0, parsed);
        const key = keyOf(value);
        if (!key) return '';
        if (/^(?:zero|gratis|gratuito|gratuita|nessun-importo|nessun-corrispettivo|senza-corrispettivo|a-titolo-gratuito)$/.test(key)) return 0;
        if (/(?:non-definit|da-definire|da-concordare|non-quantificat|non-specificat|variabile|a-consumo|secondo-consumo|secondo-fattura|su-ordine|da-calcolare|da-determinare)/.test(key)) return '';
        // Un importo puramente narrativo non deve invalidare l'intero contratto.
        return '';
    }

    function normalizeProfileEvent(event, state) {
        const next = { ...event };
        const business = findBusiness(state, next.businessName);
        next.businessType = clean(next.businessType, 60) || clean(business?.type, 60) || 'commercio';
        const cash = parseNarrativeNumber(next.cash);
        const reputation = parseNarrativeNumber(next.reputation);
        const satisfaction = parseNarrativeNumber(next.satisfaction);
        next.cash = cash == null ? Number(business?.cash) || 0 : Math.max(0, cash);
        next.reputation = reputation == null ? Number(business?.reputation ?? 50) : clamp(reputation, 0, 100);
        next.satisfaction = satisfaction == null ? Number(business?.customerSatisfaction ?? 65) : clamp(satisfaction, 0, 100);
        next.status = normalizeBusinessStatus(next.status, normalizeBusinessStatus(business?.status, 'active'));
        next.description = clean(next.description, 240) || clean(business?.description, 240) ||
            `Assetto di ${clean(next.businessName, 100) || 'attività'} definito dalla storia`;
        return next;
    }

    function normalizeContractEvent(event, state) {
        const next = { ...event };
        const business = findBusiness(state, next.businessName);
        const existing = findContract(business, next);
        next.amount = normalizeContractAmount(next.amount);
        next.status = normalizeContractStatus(next.status, normalizeContractStatus(existing?.status, 'active'));
        const partyType = keyOf(next.counterpartyType);
        if (/^(?:cliente|client|customer|acquirente)$/.test(partyType)) next.counterpartyType = 'customer';
        else if (/^(?:fornitore|supplier|vendor|approvvigionatore)$/.test(partyType)) next.counterpartyType = 'supplier';
        if (!clean(next.kind, 60)) next.kind = clean(existing?.kind, 60) || 'commerciale';
        if (!clean(next.frequency, 40)) next.frequency = clean(existing?.frequency, 40) || 'una tantum';
        return next;
    }

    function normalizeBusinessEvent(event, state) {
        if (!event || typeof event !== 'object') return event;
        if (event.type === 'profile') return normalizeProfileEvent(event, state);
        if (event.type === 'contract') return normalizeContractEvent(event, state);
        return event;
    }

    function normalizeBusinessEvents(events, state) {
        return asArray(events).map(event => normalizeBusinessEvent(event, state));
    }

    function wrapBusinessApply(holder, name, marker) {
        const original = holder?.[name];
        if (typeof original !== 'function' || original[marker]) return false;
        const wrapped = function tolerantBusinessNarrativeApply(state, events, context) {
            return original.call(this, state, normalizeBusinessEvents(events, state), context);
        };
        wrapped[marker] = true;
        wrapped.__runtimeFixV14Original = original;
        holder[name] = wrapped;
        return true;
    }

    function installBusinessFix() {
        const api = root.CronacheBusiness;
        if (!api) return false;
        let patched = false;
        patched = wrapBusinessApply(api, 'applyNarrativeEvents', '__runtimeFixV14StaticWrapped') || patched;
        patched = wrapBusinessApply(api.BusinessManager?.prototype, 'applyNarrativeEvents', '__runtimeFixV14PrototypeWrapped') || patched;
        return patched || Boolean(api.BusinessManager?.prototype?.applyNarrativeEvents?.__runtimeFixV14PrototypeWrapped);
    }

    function locationById(model, id) {
        return asArray(model?.locations).find(item => item?.id === id) || null;
    }

    function locationsForLevel(model, level, value, anchor) {
        const levels = root.CronacheWorldMapV11Levels;
        if (typeof levels?.locationsForScope === 'function') return levels.locationsForScope(model, level, value, anchor);
        const locations = asArray(model?.locations);
        const wanted = keyOf(value);
        if (level === 'world' || !wanted) return locations;
        if (level === 'continent') return locations.filter(item => keyOf(item?.continent) === wanted);
        if (level === 'nation') return locations.filter(item => keyOf(item?.nation) === wanted);
        if (level === 'region') return locations.filter(item => keyOf(item?.region) === wanted);
        if (level === 'site') return anchor ? [anchor] : locations;
        return locations;
    }

    function boxForLevel(model, level = 'world', locations = [], anchor = null, viewportAspect = null) {
        const width = Math.max(1, Number(model?.width) || 960);
        const height = Math.max(1, Number(model?.height) || 620);
        const normalizedLevel = LEVEL_SCALE[level] ? level : 'world';
        const scale = LEVEL_SCALE[normalizedLevel];
        const mapAspect = width / height;
        const requestedAspect = Number(viewportAspect);
        const aspect = Number.isFinite(requestedAspect) && requestedAspect > 0
            ? clamp(requestedAspect, 0.42, 2.4)
            : mapAspect;

        function baseSize(multiplier = scale) {
            if (aspect <= mapAspect) {
                const boxHeight = height * multiplier;
                return { width: Math.min(width, boxHeight * aspect), height: boxHeight };
            }
            const boxWidth = width * multiplier;
            return { width: boxWidth, height: Math.min(height, boxWidth / aspect) };
        }

        const points = asArray(locations).filter(item => Number.isFinite(Number(item?.x)) && Number.isFinite(Number(item?.y)));
        let centerX = width / 2;
        let centerY = height / 2;
        let size = baseSize();

        if (normalizedLevel === 'world') {
            // The previous full-map viewBox had no horizontal pan range. On phones the
            // viewBox now follows the viewport aspect, leaving real map space at both sides.
            return {
                x: clamp(centerX - size.width / 2, 0, width - size.width),
                y: clamp(centerY - size.height / 2, 0, height - size.height),
                width: size.width,
                height: size.height
            };
        }

        // Site is deliberately centred on the selected place. Nearby nodes stay visible
        // when they fall inside the window, but they no longer force Site to look like Region.
        const geometryPoints = normalizedLevel === 'site' && anchor ? [anchor] : points;
        if (geometryPoints.length) {
            const xs = geometryPoints.map(item => Number(item.x));
            const ys = geometryPoints.map(item => Number(item.y));
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            centerX = (minX + maxX) / 2;
            centerY = (minY + maxY) / 2;
            const padding = normalizedLevel === 'site' ? 20 : normalizedLevel === 'region' ? 32 : normalizedLevel === 'nation' ? 44 : 56;
            const requiredWidth = Math.max(1, maxX - minX + padding * 2);
            const requiredHeight = Math.max(1, maxY - minY + padding * 2);
            const expansion = Math.max(1, requiredWidth / size.width, requiredHeight / size.height);
            size = { width: size.width * expansion, height: size.height * expansion };
            if (size.width > width * 0.98) {
                const ratio = (width * 0.98) / size.width;
                size.width *= ratio;
                size.height *= ratio;
            }
            if (size.height > height * 0.98) {
                const ratio = (height * 0.98) / size.height;
                size.width *= ratio;
                size.height *= ratio;
            }
        } else if (anchor && Number.isFinite(Number(anchor.x)) && Number.isFinite(Number(anchor.y))) {
            centerX = Number(anchor.x);
            centerY = Number(anchor.y);
        }

        size.width = Math.min(width * 0.98, Math.max(120, size.width));
        size.height = Math.min(height * 0.98, Math.max(120 / aspect, size.height));
        return {
            x: clamp(centerX - size.width / 2, 0, width - size.width),
            y: clamp(centerY - size.height / 2, 0, height - size.height),
            width: size.width,
            height: size.height
        };
    }

    function boxString(box) {
        return [box.x, box.y, box.width, box.height].map(value => Math.round(Number(value) * 100) / 100).join(' ');
    }

    function isMobile(doc) {
        const view = doc?.defaultView || root;
        if (typeof view?.matchMedia === 'function') return view.matchMedia('(max-width: 760px)').matches;
        return Number(view?.innerWidth || 0) > 0 && Number(view.innerWidth) <= 760;
    }

    function applyMapLevelView(doc, force = false) {
        if (!doc || !isMobile(doc)) return false;
        const modal = doc.getElementById('modal-world-map');
        if (!modal?.classList.contains('active') || modal.classList.contains('map-v11-interior')) return false;
        const svg = doc.querySelector('#world-map-canvas .world-map-svg');
        const model = root.CronacheWorldMapV10?.runtime?.lastModel;
        const levels = root.CronacheWorldMapV11Levels;
        if (!svg || !model || !levels?.runtime) return false;
        // Once the player starts a gesture, persistent-gestures owns the viewBox until
        // the next hierarchy navigation, avoiding fights between observers.
        if (!force && svg.dataset.mapGestureManual === '1') return false;

        const runtime = levels.runtime;
        const level = LEVEL_SCALE[runtime.level] ? runtime.level : 'world';
        const anchor = locationById(model, runtime.selectedLocationId) || locationById(model, model.currentLocationId) ||
            asArray(model.locations).find(item => item?.current) || null;
        const value = runtime.scopeName || (level === 'site' ? anchor?.id : '');
        const matches = locationsForLevel(model, level, value, anchor);
        const rect = doc.getElementById('world-map-viewport')?.getBoundingClientRect?.();
        const viewportAspect = rect?.width && rect?.height ? rect.width / rect.height : null;
        const box = boxForLevel(model, level, matches, anchor, viewportAspect);
        const next = boxString(box);
        if (svg.getAttribute('viewBox') !== next) svg.setAttribute('viewBox', next);
        svg.dataset.mapV14Level = level;
        svg.dataset.mapV14ViewBox = next;
        modal.dataset.mapLevel = level;
        return true;
    }

    function queueMapRefresh(doc, force = false) {
        if (refreshQueued) return;
        refreshQueued = true;
        const run = () => {
            refreshQueued = false;
            applyMapLevelView(doc, force);
        };
        if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(run);
        else if (typeof root.setTimeout === 'function') root.setTimeout(run, 0);
        else run();
    }

    function bindMap(doc) {
        if (!doc || doc.documentElement?.dataset.runtimeFixV14MapBound === '1') return;
        if (doc.documentElement) doc.documentElement.dataset.runtimeFixV14MapBound = '1';
        doc.addEventListener('click', event => {
            const nav = event.target?.closest?.('[data-map-v11-level],[data-map-region],.world-map-v10-reset,[data-map-filter="all"]');
            if (!nav) return;
            const svg = doc.querySelector('#world-map-canvas .world-map-svg');
            if (svg) {
                delete svg.dataset.mapGestureManual;
                delete svg.dataset.mapGestureViewBox;
            }
            // V11 region chips update their runtime in a zero-delay callback; schedule twice
            // so our visual level is applied after that state transition.
            if (typeof root.setTimeout === 'function') {
                root.setTimeout(() => queueMapRefresh(doc, true), 0);
                root.setTimeout(() => queueMapRefresh(doc, true), 24);
            } else queueMapRefresh(doc, true);
        }, false);
    }

    function observeMap(doc) {
        if (!doc || observer || typeof MutationObserver === 'undefined') return;
        observer = new MutationObserver(mutations => {
            const relevant = mutations.some(mutation => {
                if (mutation.target?.closest?.('.map-v11-level-overlay,.map-v11-room-detail')) return false;
                return true;
            });
            if (relevant) queueMapRefresh(doc, false);
        });
        observer.observe(doc.documentElement || doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-map-level'] });
    }

    function ensureStyles(doc) {
        if (!doc || doc.getElementById(STYLE_ID)) return;
        const style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
@media(max-width:760px){
  #modal-world-map .world-map-viewport{overflow:hidden!important}
  #modal-world-map .world-map-canvas{width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;padding:3px!important}
  #modal-world-map .world-map-svg{width:100%!important;height:100%!important;min-width:0!important;max-width:none!important}
  #modal-world-map[data-map-level='continent'] .map-v11-breadcrumb,
  #modal-world-map[data-map-level='nation'] .map-v11-breadcrumb,
  #modal-world-map[data-map-level='region'] .map-v11-breadcrumb,
  #modal-world-map[data-map-level='site'] .map-v11-breadcrumb{box-shadow:0 4px 14px rgba(75,38,27,.23)}
}`;
        (doc.head || doc.documentElement).appendChild(style);
    }

    function install(doc = typeof document !== 'undefined' ? document : null) {
        installBusinessFix();
        if (doc) {
            ensureStyles(doc);
            bindMap(doc);
            observeMap(doc);
            queueMapRefresh(doc, true);
        }
        if (typeof root.setTimeout === 'function') [80, 250, 700, 1500, 3000].forEach(delay => root.setTimeout(() => {
            installBusinessFix();
            if (doc) queueMapRefresh(doc, false);
        }, delay));
        root.__cronacheRuntimeFixesV14Version = PATCH_VERSION;
        return true;
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(document), { once: true });
        else install(document);
    }

    return {
        PATCH_VERSION,
        LEVEL_SCALE,
        parseNarrativeNumber,
        normalizeBusinessStatus,
        normalizeContractStatus,
        normalizeContractAmount,
        normalizeProfileEvent,
        normalizeContractEvent,
        normalizeBusinessEvent,
        normalizeBusinessEvents,
        boxForLevel,
        boxString,
        installBusinessFix,
        applyMapLevelView,
        install
    };
});