(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheWorldMap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const MAP_WIDTH = 960;
    const MAP_HEIGHT = 620;
    const MAP_POSITIONS = Object.freeze([
        [50, 50], [25, 25], [74, 24], [24, 72], [76, 72],
        [49, 17], [50, 83], [13, 47], [87, 48], [37, 35],
        [63, 36], [36, 65], [64, 64], [15, 18], [86, 18],
        [13, 82], [87, 82], [31, 12], [69, 12], [31, 88],
        [69, 88], [8, 32], [92, 32], [8, 67], [92, 67]
    ]);

    const THEMES = Object.freeze({
        fantasy: { id: 'fantasy', label: 'Regni e terre selvagge', icon: '✦', background: '#d7c488', land: '#c8ad68', water: '#638da0', ink: '#3a291d', route: '#704a2b' },
        maritime: { id: 'maritime', label: 'Mari, isole e rotte', icon: '⚓', background: '#9bc0c3', land: '#d4bd78', water: '#4f8798', ink: '#233e45', route: '#f3e0a0' },
        ancient: { id: 'ancient', label: 'Mondo antico', icon: '☀', background: '#d8b76f', land: '#c89d51', water: '#4f8f9b', ink: '#4b2e18', route: '#744221' },
        industrial: { id: 'industrial', label: 'Età industriale', icon: '⚙', background: '#a79d89', land: '#b8ad91', water: '#657d82', ink: '#302f2b', route: '#65402d' },
        modern: { id: 'modern', label: 'Mappa contemporanea', icon: '◉', background: '#aeb8b4', land: '#cad0c7', water: '#6996a5', ink: '#26343a', route: '#4f5e62' },
        rural: { id: 'rural', label: 'Valli e comunità', icon: '❦', background: '#c5cb92', land: '#aeb66d', water: '#6d9aa0', ink: '#344127', route: '#6b5430' }
    });

    function cleanText(value, maxLength = 300) {
        return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
    }

    function keyOf(value) {
        return cleanText(value, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    }

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

    function asList(value) {
        if (Array.isArray(value)) return value.map(item => cleanText(item, 120)).filter(Boolean);
        return cleanText(value, 700).split(/[,;|]/).map(item => cleanText(item, 120)).filter(Boolean);
    }

    function inferTheme(context = {}) {
        const story = context.story || {};
        const corpus = keyOf([context.genre, context.setting, story.genre, story.setting, story.title, story.desc].filter(Boolean).join(' '));
        const year = Number(context.year ?? story.startYear ?? story.year ?? story.startTime?.year);
        if (/pirat|corsar|marin|ocean|mare|isole|naval|porto/.test(corpus)) return THEMES.maritime;
        if (/antich|roman|roma|grec|ellen|egitt|faraon/.test(corpus) || (Number.isFinite(year) && year < 600)) return THEMES.ancient;
        if (/vittorian|industr|ottocent|steampunk|risorgiment/.test(corpus) || (Number.isFinite(year) && year >= 1700 && year < 1920)) return THEMES.industrial;
        if (/modern|contempor|cyber|business|odiern|metropoli/.test(corpus) || (Number.isFinite(year) && year >= 1920)) return THEMES.modern;
        if (/rural|villaggio|campagna|agricol|valle/.test(corpus)) return THEMES.rural;
        return THEMES.fantasy;
    }

    function locationIcon(location, themeId = 'fantasy') {
        const corpus = keyOf([location?.name, location?.type, location?.description].filter(Boolean).join(' '));
        if (/cripta|tomba|catacomb|cimiter|rovina|dungeon/.test(corpus)) return '☠';
        if (/castell|fort|rocca|palazzo|cittadella/.test(corpus)) return '♜';
        if (/foresta|bosco|selva|giungla/.test(corpus)) return '♣';
        if (/montagn|picco|passo|collina/.test(corpus)) return '▲';
        if (/porto|molo|baia|isola|nave/.test(corpus)) return '⚓';
        if (/mare|oceano|lago|fiume|palude/.test(corpus)) return '≈';
        if (/tempio|chiesa|abbazia|santuario|monaster/.test(corpus)) return '✞';
        if (/locanda|taverna|osteria/.test(corpus)) return '⌂';
        if (/villaggio|borgo|frazione|comunita/.test(corpus)) return '⌂';
        if (/citta|capitale|metropoli|quartiere|centro/.test(corpus)) return themeId === 'modern' ? '▦' : '◉';
        if (/fabbrica|officina|miniera|stazione/.test(corpus)) return '⚙';
        if (/deserto|oasi|duna/.test(corpus)) return '☀';
        if (/grotta|caverna|miniera/.test(corpus)) return '◆';
        return '●';
    }

    function mergeLocations(world, memory, context) {
        const merged = [];
        const byName = new Map();
        const sources = [...(Array.isArray(world?.locations) ? world.locations : []), ...(Array.isArray(memory?.locations) ? memory.locations : [])];
        const current = cleanText(context.currentLocation || context.location, 120);
        if (current && !/sconosciut|unknown/i.test(current)) sources.push({ name: current, type: 'posizione attuale', description: 'Posizione confermata del protagonista.' });
        sources.forEach((source, index) => {
            const name = cleanText(source?.name, 120);
            const key = keyOf(name);
            if (!key) return;
            const next = {
                id: cleanText(source?.id, 140) || `map-location-${hashNumber(name).toString(36)}`,
                name,
                type: cleanText(source?.type || 'luogo', 80),
                region: cleanText(source?.region || context.setting || context.story?.setting, 120),
                description: cleanText(source?.description || source?.notes, 420),
                controller: cleanText(source?.controller, 120),
                resource: cleanText(source?.resource, 160),
                danger: cleanText(source?.danger, 180),
                connections: asList(source?.connections),
                discoveredAtTurn: Math.max(0, Number(source?.discovered ?? source?.createdAtTurn ?? index) || 0)
            };
            if (!byName.has(key)) {
                byName.set(key, next);
                merged.push(next);
                return;
            }
            const existing = byName.get(key);
            Object.keys(next).forEach(field => {
                if ((existing[field] == null || existing[field] === '' || (Array.isArray(existing[field]) && !existing[field].length)) && next[field]) existing[field] = next[field];
            });
            existing.connections = [...new Set([...existing.connections, ...next.connections])];
        });
        return merged.slice(0, MAP_POSITIONS.length);
    }

    function findCurrentLocation(locations, currentLocation) {
        const currentKey = keyOf(currentLocation);
        if (!currentKey) return null;
        return locations.find(item => keyOf(item.name) === currentKey)
            || locations.find(item => keyOf(item.name).includes(currentKey) || currentKey.includes(keyOf(item.name)))
            || null;
    }

    function assignCoordinates(locations, seed) {
        const occupied = new Set();
        return locations.map(location => {
            let slot = hashNumber(`${seed}|${location.name}`) % MAP_POSITIONS.length;
            for (let attempt = 0; attempt < MAP_POSITIONS.length && occupied.has(slot); attempt++) slot = (slot + 7) % MAP_POSITIONS.length;
            occupied.add(slot);
            const point = MAP_POSITIONS[slot];
            return { ...location, x: Math.round(MAP_WIDTH * point[0] / 100), y: Math.round(MAP_HEIGHT * point[1] / 100) };
        });
    }

    function distance(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function buildEdges(locations) {
        const edges = [];
        const seen = new Set();
        const addEdge = (a, b, explicit = false) => {
            if (!a || !b || a.id === b.id) return;
            const key = [a.id, b.id].sort().join('|');
            if (seen.has(key)) return;
            seen.add(key);
            edges.push({ id: `route-${hashNumber(key).toString(36)}`, from: a.id, to: b.id, explicit });
        };
        locations.forEach(location => {
            location.connections.forEach(connection => {
                const targetKey = keyOf(connection);
                const target = locations.find(item => keyOf(item.name) === targetKey)
                    || locations.find(item => keyOf(item.name).includes(targetKey) || targetKey.includes(keyOf(item.name)));
                addEdge(location, target, true);
            });
        });
        locations.slice(1).forEach((location, index) => {
            const previous = locations.slice(0, index + 1).sort((a, b) => distance(location, a) - distance(location, b));
            if (!edges.some(edge => edge.from === location.id || edge.to === location.id)) addEdge(location, previous[0], false);
        });
        return edges;
    }

    function buildMapModel(input = {}, context = {}) {
        const world = input.world || input;
        const memory = input.memory || {};
        const theme = inferTheme(context);
        const seed = cleanText(world?.name || context.story?.title || context.setting || 'mondo', 120);
        const baseLocations = mergeLocations(world, memory, context);
        const locations = assignCoordinates(baseLocations, seed).map(location => ({ ...location, icon: locationIcon(location, theme.id) }));
        const current = findCurrentLocation(locations, context.currentLocation || context.location);
        locations.forEach(location => { location.current = Boolean(current && current.id === location.id); });
        return {
            id: `world-map-${hashNumber(seed).toString(36)}`,
            name: seed || 'Mondo conosciuto',
            theme,
            width: MAP_WIDTH,
            height: MAP_HEIGHT,
            locations,
            edges: buildEdges(locations),
            currentLocationId: current?.id || '',
            currentLocationName: current?.name || cleanText(context.currentLocation || context.location, 120) || 'Sconosciuto'
        };
    }

    function wrapLabel(value, max = 18) {
        const words = cleanText(value, 90).split(' ');
        const lines = [''];
        words.forEach(word => {
            const current = lines[lines.length - 1];
            if (current && `${current} ${word}`.length > max && lines.length < 2) lines.push(word);
            else lines[lines.length - 1] = current ? `${current} ${word}` : word;
        });
        return lines.filter(Boolean);
    }

    function terrainMarkup(model) {
        if (model.theme.id === 'modern' || model.theme.id === 'industrial') {
            return `<g class="world-map-grid">${Array.from({ length: 12 }, (_, i) => `<path d="M ${i * 90 - 20} 0 L ${i * 90 - 120} ${model.height}"/>`).join('')}${Array.from({ length: 8 }, (_, i) => `<path d="M 0 ${i * 90 - 10} L ${model.width} ${i * 90 + 55}"/>`).join('')}</g>`;
        }
        return `<g class="world-map-contours"><path d="M-40 410 C120 300 180 505 355 396 S650 290 1000 430"/><path d="M-20 455 C160 350 245 550 415 440 S720 340 990 478"/><ellipse cx="176" cy="145" rx="118" ry="73"/><ellipse cx="782" cy="465" rx="145" ry="88"/></g><path class="world-map-river" d="M35 55 C210 160 120 310 342 340 S570 250 705 360 S815 510 930 574"/>`;
    }

    function svgMarkup(model) {
        if (!model || !model.locations?.length) return '';
        const byId = new Map(model.locations.map(location => [location.id, location]));
        const routes = model.edges.map(edge => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (!from || !to) return '';
            const bend = Math.round((from.x + to.x) / 2);
            const lift = Math.round(Math.min(from.y, to.y) - Math.abs(from.x - to.x) * 0.08);
            return `<path class="world-map-route${edge.explicit ? ' explicit' : ''}" d="M ${from.x} ${from.y} Q ${bend} ${lift} ${to.x} ${to.y}"/>`;
        }).join('');
        const nodes = model.locations.map(location => {
            const lines = wrapLabel(location.name);
            const label = lines.map((line, index) => `<tspan x="0" dy="${index ? 17 : 0}">${escapeHtml(line)}</tspan>`).join('');
            return `<g class="world-map-node${location.current ? ' current' : ''}" data-map-location-id="${escapeHtml(location.id)}" transform="translate(${location.x} ${location.y})" role="button" tabindex="0" aria-label="${escapeHtml(location.name)}${location.current ? ', posizione attuale' : ''}"><title>${escapeHtml(location.name)}${location.description ? ` — ${escapeHtml(location.description)}` : ''}</title>${location.current ? '<circle class="world-map-player-pulse" r="34"/><circle class="world-map-player-ring" r="25"/>' : '<circle class="world-map-node-ring" r="22"/>'}<text class="world-map-node-icon" text-anchor="middle" dominant-baseline="central">${escapeHtml(location.icon)}</text><text class="world-map-node-label" text-anchor="middle" y="37">${label}</text>${location.danger ? '<path class="world-map-danger" d="M 17 -25 l 9 16 h -18 z"/>' : ''}</g>`;
        }).join('');
        const p = model.theme;
        return `<svg class="world-map-svg theme-${escapeHtml(p.id)}" viewBox="0 0 ${model.width} ${model.height}" xmlns="http://www.w3.org/2000/svg" aria-label="Mappa di ${escapeHtml(model.name)}"><defs><linearGradient id="map-paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.background}"/><stop offset=".52" stop-color="${p.land}"/><stop offset="1" stop-color="${p.background}"/></linearGradient><filter id="map-shadow"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity=".35"/></filter></defs><rect width="100%" height="100%" rx="22" fill="url(#map-paper)"/><rect class="world-map-frame" x="18" y="18" width="${model.width - 36}" height="${model.height - 36}" rx="16"/>${terrainMarkup(model)}<g class="world-map-routes">${routes}</g><g class="world-map-nodes">${nodes}</g><g class="world-map-compass" transform="translate(885 82)"><circle r="39"/><path d="M0-31 L8-7 L0 0 L-8-7 Z M0 31 L8 7 L0 0 L-8 7 Z"/><text text-anchor="middle" y="-45">N</text></g><text class="world-map-signature" x="46" y="574">${escapeHtml(p.icon)} ${escapeHtml(model.name)}</text></svg>`;
    }

    return {
        MAP_WIDTH,
        MAP_HEIGHT,
        THEMES,
        cleanText,
        keyOf,
        inferTheme,
        locationIcon,
        findCurrentLocation,
        buildMapModel,
        svgMarkup
    };
});
