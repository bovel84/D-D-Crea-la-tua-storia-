(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheWorldMapV12StorySvg = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-world-map-v12-story-svg-style';
    let wrapped = false;

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 500) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const keyOf = value => clean(value, 900).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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

    function contextNow() {
        return root.CronacheWorldMapV10?.runtime?.lastContext || {};
    }

    function storyCorpus(model, runtimeContext = contextNow()) {
        const context = runtimeContext?.context || {};
        const story = context.story || {};
        const world = runtimeContext?.world || {};
        const regions = asArray(model?.regionLabels).flatMap(item => [item?.name, item?.terrain]);
        const locations = asArray(model?.locations).flatMap(item => [item?.name, item?.type, item?.terrain, item?.description]);
        return clean([
            model?.name, model?.theme?.label,
            context.genre, context.setting, context.year,
            story.title, story.genre, story.setting, story.desc, story.description, story.startYear,
            world.name, world.description,
            ...regions, ...locations
        ].filter(Boolean).join(' '), 6000).toLowerCase();
    }

    function storyProfile(model, runtimeContext = contextNow()) {
        const corpus = storyCorpus(model, runtimeContext);
        const theme = clean(model?.theme?.id, 40) || 'fantasy';
        const flags = {
            maritime: /mare|maritt|porto|costa|isola|oceano|naval|laguna|baia/.test(corpus) || theme === 'maritime',
            river: /fiume|river|torrente|canale|delta/.test(corpus),
            mountain: /montagn|monte|alpi|appenn|picco|passo|roccios|highland/.test(corpus),
            hills: /collin|toscana|valle|vigneto|vigna|rural|campagna/.test(corpus) || theme === 'rural',
            forest: /forest|foresta|bosco|selva|woods|giungla/.test(corpus),
            desert: /desert|duna|oasi|arid|sabbia/.test(corpus),
            urban: /metropoli|quartiere|industrial|moderno|contempor|citta|città/.test(corpus) || theme === 'modern' || theme === 'industrial',
            medieval: /medioev|feudal|castell|contea|duca|ducato|anno domini|sacro romano impero/.test(corpus),
            ancient: /roman|grec|ellen|egitt|faraon|antich/.test(corpus) || theme === 'ancient'
        };
        const id = flags.maritime ? 'maritime'
            : flags.desert ? 'desert'
                : flags.mountain ? 'mountain'
                    : flags.forest ? 'forest'
                        : flags.urban ? 'urban'
                            : flags.hills || flags.medieval ? 'hills'
                                : theme;
        return { id, flags, corpus };
    }

    function groupTerrain(model) {
        const groups = [];
        const regionGroups = new Map();
        asArray(model?.locations).forEach(location => {
            if (/property|business|resource/.test(clean(location?.kind, 40))) return;
            const region = clean(location?.region, 100) || clean(location?.nation, 100) || 'territorio';
            const key = keyOf(region);
            if (!regionGroups.has(key)) regionGroups.set(key, { name: region, terrain: '', locations: [] });
            const group = regionGroups.get(key);
            group.locations.push(location);
            if (!group.terrain && clean(location?.terrain, 80)) group.terrain = clean(location.terrain, 80);
        });
        asArray(model?.regionLabels).forEach(region => {
            const key = keyOf(region?.name);
            const group = regionGroups.get(key);
            if (group && clean(region?.terrain, 80)) group.terrain = clean(region.terrain, 80);
        });
        regionGroups.forEach(group => {
            if (!group.locations.length) return;
            const x = group.locations.reduce((sum, item) => sum + Number(item.x || 0), 0) / group.locations.length;
            const y = group.locations.reduce((sum, item) => sum + Number(item.y || 0), 0) / group.locations.length;
            groups.push({ ...group, x: Math.round(x), y: Math.round(y) });
        });
        return groups;
    }

    function terrainKind(value, fallback = '') {
        const corpus = clean(value, 300).toLowerCase();
        if (/mare|costa|coast|porto|isola|laguna|baia/.test(corpus)) return 'coast';
        if (/fium|river|canale|torrente|lago|palude/.test(corpus)) return 'water';
        if (/mont|alpi|appenn|picco|passo|rocc/.test(corpus)) return 'mountain';
        if (/collin|valle|vigna|rural|campagna/.test(corpus)) return 'hills';
        if (/forest|foresta|bosco|selva|giungla/.test(corpus)) return 'forest';
        if (/desert|duna|oasi|arid/.test(corpus)) return 'desert';
        if (/urban|citta|città|metropoli|industrial/.test(corpus)) return 'urban';
        if (/pian|plain|campo|agricol/.test(corpus)) return 'fields';
        return fallback || 'hills';
    }

    function hillMarkup(x, y, seed) {
        const offset = seed % 23;
        return `<g class="story-terrain hills" transform="translate(${x} ${y})"><path d="M -92 ${24 + offset % 7} Q -48 -20 0 18 T 94 16"/><path d="M -78 ${46 + offset % 9} Q -28 8 18 40 T 102 37"/></g>`;
    }

    function mountainMarkup(x, y, seed) {
        const shift = seed % 18;
        return `<g class="story-terrain mountains" transform="translate(${x} ${y})"><path d="M-80 45 L-42 ${-24 - shift / 3} L-12 43 M-35 44 L8 ${-42 + shift / 4} L48 44 M20 45 L60 ${-18 - shift / 5} L94 45"/><path class="snow" d="M-53 -5 L-42 -24 L-30 -3 M-3 -22 L8 -42 L20 -20"/></g>`;
    }

    function forestMarkup(x, y, seed) {
        const trees = Array.from({ length: 7 }, (_, index) => {
            const dx = -72 + ((hashNumber(`${seed}|x|${index}`) % 145));
            const dy = -32 + ((hashNumber(`${seed}|y|${index}`) % 75));
            const size = 9 + hashNumber(`${seed}|s|${index}`) % 7;
            return `<path d="M${dx} ${dy + size} v${size} M${dx - size} ${dy + size} L${dx} ${dy - size} L${dx + size} ${dy + size} Z"/>`;
        }).join('');
        return `<g class="story-terrain forest" transform="translate(${x} ${y})">${trees}</g>`;
    }

    function fieldsMarkup(x, y, seed) {
        const tilt = (seed % 16) - 8;
        return `<g class="story-terrain fields" transform="translate(${x} ${y}) rotate(${tilt})"><rect x="-86" y="-42" width="172" height="84" rx="13"/>${[-52,-26,0,26,52].map(v => `<path d="M${v} -37 L${v + 24} 37"/>`).join('')}</g>`;
    }

    function desertMarkup(x, y, seed) {
        const lift = seed % 12;
        return `<g class="story-terrain desert" transform="translate(${x} ${y})"><path d="M-94 ${12 + lift} Q-52 -18 -10 12 T82 10"/><path d="M-76 ${42 + lift / 2} Q-30 16 15 42 T96 40"/></g>`;
    }

    function urbanMarkup(x, y, seed) {
        const rotate = (seed % 24) - 12;
        return `<g class="story-terrain urban" transform="translate(${x} ${y}) rotate(${rotate})"><path d="M-82 -42 H82 M-82 -14 H82 M-82 14 H82 M-82 42 H82 M-56 -58 V58 M-18 -58 V58 M20 -58 V58 M58 -58 V58"/></g>`;
    }

    function waterMarkup(model, profile, groups) {
        const width = Number(model?.width) || 960;
        const height = Number(model?.height) || 620;
        const waterGroups = groups.filter(group => ['coast', 'water'].includes(terrainKind(group.terrain, '')));
        const explicitWaterLocations = asArray(model?.locations).filter(item => /fium|river|mare|lago|porto|costa|coast|laguna|baia/i.test(`${item?.name || ''} ${item?.type || ''} ${item?.terrain || ''}`));
        if (profile.flags.river || explicitWaterLocations.some(item => /fium|river|canale|torrente/i.test(`${item.name} ${item.type}`))) {
            const points = explicitWaterLocations.length >= 2 ? explicitWaterLocations.slice().sort((a, b) => Number(a.x) - Number(b.x)) : groups.slice().sort((a, b) => a.x - b.x).slice(0, 4);
            if (points.length >= 2) {
                const d = points.map((point, index) => `${index ? 'L' : 'M'} ${Math.round(point.x)} ${Math.round(point.y)}`).join(' ');
                return `<path class="story-water river" d="${d}"/>`;
            }
        }
        if (profile.flags.maritime || waterGroups.some(group => terrainKind(group.terrain) === 'coast')) {
            const side = hashNumber(model?.name) % 2;
            return side
                ? `<path class="story-water coast" d="M ${width - 135} -10 Q ${width - 235} ${height * .28} ${width - 120} ${height * .55} T ${width - 155} ${height + 10} L ${width + 10} ${height + 10} L ${width + 10} -10 Z"/>`
                : `<path class="story-water coast" d="M -10 -10 L 145 -10 Q 245 ${height * .28} 125 ${height * .55} T 160 ${height + 10} L -10 ${height + 10} Z"/>`;
        }
        return '';
    }

    function storyTerrainMarkup(model, runtimeContext = contextNow()) {
        if (!model) return '';
        const profile = storyProfile(model, runtimeContext);
        const groups = groupTerrain(model);
        const rendered = groups.slice(0, 10).map((group, index) => {
            const seed = hashNumber(`${model.name}|${group.name}|${index}`);
            const kind = terrainKind(group.terrain, profile.id === 'mountain' ? 'mountain' : profile.id === 'forest' ? 'forest' : profile.id === 'desert' ? 'desert' : profile.id === 'urban' ? 'urban' : 'hills');
            if (kind === 'mountain') return mountainMarkup(group.x, group.y, seed);
            if (kind === 'forest') return forestMarkup(group.x, group.y, seed);
            if (kind === 'desert') return desertMarkup(group.x, group.y, seed);
            if (kind === 'urban') return urbanMarkup(group.x, group.y, seed);
            if (kind === 'fields') return fieldsMarkup(group.x, group.y, seed);
            if (kind === 'coast' || kind === 'water') return hillMarkup(group.x, group.y, seed);
            return profile.flags.medieval || profile.flags.hills ? fieldsMarkup(group.x, group.y, seed) + hillMarkup(group.x, group.y, seed) : hillMarkup(group.x, group.y, seed);
        }).join('');
        const water = waterMarkup(model, profile, groups);
        return `<g class="world-map-story-terrain profile-${escapeHtml(profile.id)}" data-story-terrain="${escapeHtml(profile.id)}">${water}${rendered}</g>`;
    }

    function replaceGenericTerrain(svg, storyMarkup) {
        let next = String(svg || '');
        next = next.replace(/<g class="world-map-grid">[\s\S]*?<\/g>/, '');
        next = next.replace(/<g class="world-map-contours">[\s\S]*?<\/g>/, '');
        next = next.replace(/<path class="world-map-river"[^>]*\/>/, '');
        const anchor = '<g class="world-map-territories">';
        if (next.includes(anchor)) next = next.replace(anchor, `${storyMarkup}${anchor}`);
        else next = next.replace('<g class="world-map-routes">', `${storyMarkup}<g class="world-map-routes">`);
        next = next.replace('<svg class="world-map-svg ', '<svg class="world-map-svg story-adaptive ');
        return next;
    }

    function wrapMap() {
        const map = root.CronacheWorldMap;
        if (!map || typeof map.svgMarkup !== 'function') return false;
        if (map.svgMarkup.__worldMapStorySvgWrapped) return true;
        const original = map.svgMarkup;
        const wrappedSvg = function storyAdaptiveSvg(model) {
            const svg = original.call(this, model);
            if (!svg || !model) return svg;
            return replaceGenericTerrain(svg, storyTerrainMarkup(model));
        };
        wrappedSvg.__worldMapStorySvgWrapped = true;
        wrappedSvg.__worldMapV10Wrapped = true;
        wrappedSvg.__worldMapV10Original = original.__worldMapV10Original || original;
        map.svgMarkup = wrappedSvg;
        wrapped = true;
        return true;
    }

    function cssText() {
        return `
.world-map-story-terrain{pointer-events:none;opacity:.54}
.world-map-story-terrain .story-terrain{fill:none;stroke:rgba(91,68,42,.38);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.world-map-story-terrain .hills path{stroke-width:3.2}
.world-map-story-terrain .mountains path{stroke-width:3.4}.world-map-story-terrain .mountains .snow{stroke:rgba(255,247,215,.72);stroke-width:4}
.world-map-story-terrain .forest path{fill:rgba(71,99,55,.12);stroke:rgba(59,83,47,.52);stroke-width:2.2}
.world-map-story-terrain .fields rect{fill:rgba(137,116,59,.05);stroke:rgba(111,86,42,.24);stroke-width:2}.world-map-story-terrain .fields path{stroke:rgba(111,86,42,.27);stroke-width:2}
.world-map-story-terrain .desert path{stroke:rgba(126,88,42,.36);stroke-width:3.4}
.world-map-story-terrain .urban path{stroke:rgba(67,63,55,.28);stroke-width:2.5}
.world-map-story-terrain .story-water{fill:none;stroke:rgba(70,131,145,.62);stroke-width:22;stroke-linecap:round;stroke-linejoin:round;opacity:.72}
.world-map-story-terrain .story-water.coast{fill:rgba(75,138,151,.24);stroke:rgba(69,128,144,.52);stroke-width:7}
.world-map-svg.story-adaptive.theme-modern .world-map-story-terrain,.world-map-svg.story-adaptive.theme-industrial .world-map-story-terrain{opacity:.45}
@media(max-width:760px){.world-map-story-terrain{opacity:.46}.world-map-story-terrain .story-water{stroke-width:18}}
`;
    }

    function ensureStyles(doc) {
        if (!doc || doc.getElementById(STYLE_ID)) return;
        const style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = cssText();
        (doc.head || doc.documentElement).appendChild(style);
    }

    function install(doc = typeof document !== 'undefined' ? document : null) {
        const ok = wrapMap();
        if (doc) ensureStyles(doc);
        root.__cronacheWorldMapV12StorySvgVersion = PATCH_VERSION;
        return ok || Boolean(doc);
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(document), { once: true });
        else install(document);
        if (typeof root.setTimeout === 'function') [80, 300, 900, 1800].forEach(delay => root.setTimeout(() => install(document), delay));
    }

    return {
        PATCH_VERSION,
        storyCorpus,
        storyProfile,
        groupTerrain,
        terrainKind,
        storyTerrainMarkup,
        replaceGenericTerrain,
        install
    };
});