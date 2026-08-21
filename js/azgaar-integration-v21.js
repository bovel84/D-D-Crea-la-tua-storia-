(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheAzgaarIntegration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const VERSION = '21.1';
    const STYLE_ID = 'cronache-azgaar-integration-v21-style';
    let hooked = false;

    function asArray(v) { return Array.isArray(v) ? v : []; }

    /* ── CSS per relief only (niente biome fills) ── */
    function cssText() {
        return `
.biome-relief{pointer-events:none;opacity:.72}
.biome-relief path{fill:rgba(91,68,42,.38);stroke:rgba(70,50,30,.32);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.biome-relief .relief-conifer{fill:rgba(59,83,47,.48);stroke:rgba(50,70,40,.38)}
.biome-relief .relief-deciduous{fill:rgba(71,99,55,.42);stroke:rgba(55,80,42,.34)}
.biome-relief .relief-palm{fill:rgba(54,92,42,.40);stroke:rgba(40,70,35,.34)}
.biome-relief .relief-grass{fill:rgba(120,130,50,.28);stroke:rgba(100,110,40,.28)}
.biome-relief .relief-dune{fill:rgba(180,150,80,.32);stroke:rgba(150,120,60,.28)}
.biome-relief .relief-cactus{fill:rgba(80,110,40,.36);stroke:rgba(60,90,30,.28)}
.biome-relief .relief-swamp{fill:rgba(60,80,50,.32);stroke:rgba(50,70,40,.28)}
.biome-relief .relief-deadTree{fill:rgba(80,60,40,.36);stroke:rgba(60,45,30,.30)}
.biome-relief .relief-mountain{fill:rgba(120,100,80,.28);stroke:rgba(100,85,65,.24);stroke-width:2.2}
.biome-relief .relief-hill{fill:rgba(140,120,80,.24);stroke:rgba(120,100,65,.20);stroke-width:1.8}
.biome-relief .relief-acacia{fill:rgba(100,110,40,.30);stroke:rgba(80,90,30,.24)}
.biome-relief .relief-snow{fill:rgba(220,220,240,.36);stroke:rgba(200,200,220,.30);stroke-width:2.2}
@media(max-width:760px){
  .biome-relief{opacity:.78}
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

    /* ── Hook nel pipeline SVG della mappa ── */
    function hookMap() {
        const biomeEngine = root.CronacheBiomeEngine;
        const map = root.CronacheWorldMap;
        if (!biomeEngine || !map || typeof map.svgMarkup !== 'function') return false;

        if (map.svgMarkup.__azgaarV21Hooked) return true;

        const originalSvg = map.svgMarkup;
        const hookedSvg = function azgaarEnhancedSvg(model) {
            let svg = originalSvg.call(this, model);
            if (!svg || !model) return svg;

            // Assegna biomi alle location se non già fatto
            const locations = asArray(model.locations);
            if (locations.length && !locations[0].biome) {
                try { biomeEngine.assignBiomes(model); } catch (e) { /* silent */ }
            }

            // Solo relief icons, niente biome fills (v12 ha già il terrain)
            let relief = '';
            try { relief = biomeEngine.renderRelief(model); } catch (e) { /* silent */ }

            // Inietta relief subito prima di world-map-compass (dietro UI elements)
            if (relief) {
                const anchor = '<g class="world-map-compass"';
                const idx = svg.indexOf(anchor);
                if (idx >= 0) {
                    svg = svg.slice(0, idx) + relief + svg.slice(idx);
                } else {
                    // Fallback: prima della chiusura </svg>
                    const closeIdx = svg.lastIndexOf('</svg>');
                    if (closeIdx >= 0) {
                        svg = svg.slice(0, closeIdx) + relief + svg.slice(closeIdx);
                    }
                }
            }

            return svg;
        };
        hookedSvg.__azgaarV21Hooked = true;
        hookedSvg.__azgaarOriginal = originalSvg;
        map.svgMarkup = hookedSvg;
        hooked = true;
        return true;
    }

    /* ── Hook per emblem SVG nelle fazioni ── */
    function hookEmblems() {
        const emblem = root.CronacheEmblemSVG;
        if (!emblem) return false;

        root.CronacheFactionEmblem = function (name, opts, size) {
            try { return emblem.generateSVG(name, opts || {}, size || 120); }
            catch (e) { return ''; }
        };
        return true;
    }

    function install(doc) {
        const ok1 = hookMap();
        const ok2 = hookEmblems();
        if (doc) ensureStyles(doc);
        root.__cronacheAzgaarIntegration = VERSION;
        return ok1 || ok2;
    }

    // Auto-install
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading')
            document.addEventListener('DOMContentLoaded', () => install(document), { once: true });
        else install(document);
        if (typeof root.setTimeout === 'function')
            [100, 500, 1200, 2500].forEach(d => root.setTimeout(() => { hookMap(); hookEmblems(); }, d));
    }

    return { VERSION, install, hookMap, hookEmblems };
});