/**
 * Biome Engine v21 — 13 biomi Whittaker + relief icons procedurali.
 * Adattato da Azgaar/Fantasy-Map-Generator (MIT).
 * UMD module: root.CronacheBiomeEngine
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheBiomeEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /* ── 13 biomi Whittaker (semi Azgaar) ── */
    const BIOMES = [
        { id: 0,  name: 'Marine',                 color: '#466eab', habitability: 0,   iconsDensity: 0,   icons: [],                     cost: 10   },
        { id: 1,  name: 'Deserto caldo',           color: '#fbe79f', habitability: 4,   iconsDensity: 3,   icons: ['dune','cactus','deadTree'], cost: 200 },
        { id: 2,  name: 'Deserto freddo',           color: '#e8d6a0', habitability: 3,   iconsDensity: 2,   icons: ['dune','deadTree'],    cost: 220 },
        { id: 3,  name: 'Savana',                  color: '#d4c470', habitability: 12,  iconsDensity: 2,   icons: ['acacia','grass'],     cost: 90  },
        { id: 4,  name: 'Prateria',                color: '#c8d690', habitability: 18,  iconsDensity: 4,   icons: ['grass','hill'],       cost: 60  },
        { id: 5,  name: 'Foresta tropicale stagionale', color: '#a8c060', habitability: 14, iconsDensity: 4, icons: ['deciduous','palm'], cost: 80 },
        { id: 6,  name: 'Foresta decidua temperata',    color: '#8aad60', habitability: 20, iconsDensity: 5, icons: ['deciduous','hill'], cost: 50 },
        { id: 7,  name: 'Foresta pluviale tropicale',   color: '#4b8b3a', habitability: 16, iconsDensity: 6, icons: ['palm','deciduous'], cost: 70 },
        { id: 8,  name: 'Steppe aride',             color: '#d0c080', habitability: 8,   iconsDensity: 1,   icons: ['grass'],              cost: 120 },
        { id: 9,  name: 'Taiga',                   color: '#6a8b5a', habitability: 10,  iconsDensity: 5,   icons: ['conifer','mountain'], cost: 80  },
        { id: 10, name: 'Tundra',                  color: '#a0b8a0', habitability: 5,   iconsDensity: 1,   icons: ['hill'],               cost: 150 },
        { id: 11, name: 'Ghiacciaio',               color: '#e0ecf0', habitability: 1,   iconsDensity: 0,   icons: ['snow','mountain'],    cost: 300 },
        { id: 12, name: 'Palude',                  color: '#5a7a50', habitability: 6,   iconsDensity: 3,   icons: ['swamp','deadTree'],   cost: 130 }
    ];

    /* ── Matrice moisture × temperature (Whittaker) ── */
    // righe = moisture (0-4), colonne = temperature bande (-15,0,10,20,30+)
    // valori = biome id
    const BIOME_MATRIX = [
        [11,11,10, 8, 2],  // moisture 0 (arid)
        [11,10, 9, 4, 2],  // moisture 1
        [10, 9, 6, 5, 1],  // moisture 2
        [ 9, 6, 6, 5, 7],  // moisture 3
        [12,12, 6, 5, 7]   // moisture 4 (wet)
    ];

    function hashStr(text) {
        let h = 2166136261;
        for (let i = 0; i < (text || '').length; i++) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    function biomeId(moisture, temperature, maxLat, marine) {
        if (marine) return 0;
        const mBand = clamp(Math.floor(moisture / 20), 0, 4);
        const tBand = clamp(Math.floor((temperature + 15) / 10), 0, 4) | 0;
        return BIOME_MATRIX[mBand][tBand];
    }

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    /* ── Assegna biomi alle location del modello mappa ── */
    function assignBiomes(model) {
        if (!model || !Array.isArray(model.locations)) return model;
        const height = model.height || 620;
        for (const loc of model.locations) {
            if (loc.biome) continue; // già assegnato
            const terrain = String(loc.terrain || loc.type || '').toLowerCase();
            const yNorm = (loc.y || 0) / height;
            const latitudeTemp = yNorm * 25 - 15; // nord=freddo, sud=caldo

            // Primary: terrain keywords → biome
            let bid;
            if (/desert|deserto|duna/.test(terrain))         bid = 1;
            else if (/desert.*fredd|cold.*desert/.test(terrain)) bid = 2;
            else if (/tundra|ghiacc|permafrost|neve|glac/.test(terrain)) bid = 11;
            else if (/palude|swamp|marsh|wetland/.test(terrain)) bid = 12;
            else if (/giungla|jungle|rainforest|pluviale/.test(terrain)) bid = 7;
            else if (/savana|savanna/.test(terrain))          bid = 3;
            else if (/taiga|conifer|abeti/.test(terrain))     bid = 9;
            else if (/foresta.*decidu|deciduous|bosco/.test(terrain)) bid = 6;
            else if (/foresta.*tropic|stagional/.test(terrain)) bid = 5;
            else if (/foresta|forest/.test(terrain))          bid = 6;
            else if (/prateria|grassland|plain|pianura/.test(terrain)) bid = 4;
            else if (/mont|mount|alp|picco/.test(terrain))    bid = 9;
            else if (/collin|hill|altopian/.test(terrain))   bid = yNorm < 0.25 ? 9 : 6;
            else if (/mare|ocean|costa|coast|isola|port|laguna|baia/.test(terrain)) bid = 0;
            else if (/fiume|river|torrente|canale/.test(terrain))  bid = 12;
            else if (/lago|lake/.test(terrain))               bid = 0;
            else {
                // Fallback: latitude-based Whittaker
                const moist = 30 + (hashStr(loc.name || 'x') % 30);
                bid = biomeId(moist, latitudeTemp, 40, false);
            }
            loc.biome = BIOMES[bid] || BIOMES[0];
        }
        return model;
    }

    /* ── Path SVG per icone relief (semi Azgaar draw-relief-icons) ── */
    const RELIEF_PATHS = {
        mountain:  'M-12 8 L-6 -10 L0 6 L4 -14 L10 8 Z',
        hill:      'M-14 6 Q-7 -4 0 4 Q7 -6 14 6',
        conifer:   'M0 -12 L-5 4 L5 4 Z M-3 4 L3 4 L0 8',
        deciduous: 'M0 -10 Q-7 -4 -6 4 Q0 8 6 4 Q7 -4 0 -10',
        palm:      'M0 8 L0 -6 M0 -6 Q-7 -9 -10 -4 M0 -6 Q7 -9 10 -4 M0 -6 Q-4 -10 -2 -12 M0 -6 Q4 -10 2 -12',
        acacia:    'M0 8 L0 -2 M0 -2 Q-8 -6 -10 -2 M0 -2 Q8 -6 10 -2',
        swamp:     'M-8 4 Q-4 0 0 4 Q4 0 8 4 M-6 8 Q-3 4 0 8',
        grass:     'M-8 6 L-8 0 M-4 8 L-4 2 M0 6 L0 0 M4 8 L4 2 M8 6 L8 0',
        dune:      'M-12 4 Q-6 -2 0 4 Q6 -4 12 4',
        cactus:    'M0 8 L0 -4 M0 -4 Q-5 -6 -5 -2 M0 -4 Q5 -6 5 -2 M0 0 Q-4 -2 -4 2',
        deadTree:  'M0 8 L0 -6 M0 -6 L-5 -10 M0 -6 L5 -10 M0 -2 L-4 -4 M0 -2 L4 -4',
        snow:      'M-8 0 L8 0 M0 -8 L0 8 M-6 -6 L6 6 M6 -6 L-6 6'
    };

    function reliefIconsFor(bid, x, y, size, rand) {
        const biome = BIOMES[bid] || BIOMES[0];
        const icons = biome.icons || [];
        if (!icons.length) return '';
        const count = Math.min(icons.length, 2 + Math.floor(rand() * Math.max(1, biome.iconsDensity)));
        let svg = '';
        for (let i = 0; i < count; i++) {
            const icon = icons[Math.floor(rand() * icons.length)] || icons[0];
            const path = RELIEF_PATHS[icon] || '';
            if (!path) continue;
            const dx = (rand() - 0.5) * size * 0.6;
            const dy = (rand() - 0.5) * size * 0.4;
            const s = size / 24;
            const cls = 'relief-' + icon;
            svg += '<g class="' + cls + '" transform="translate(' + (x + dx).toFixed(1) + ' ' + (y + dy).toFixed(1) + ') scale(' + s.toFixed(2) + ')"><path d="' + path + '"/></g>';
        }
        return svg;
    }

    /* ── Genera blocco SVG relief per tutto il modello ── */
    function renderRelief(model) {
        const locations = Array.isArray(model?.locations) ? model.locations : [];
        const seed = hashStr(model?.name || 'world-relief');
        const rand = mulberry32(seed);

        let svg = '<g class="biome-relief" aria-hidden="true">';
        for (const loc of locations) {
            if (!loc.biome || loc.biome.id === 0) continue;
            const size = 36 + (hashStr(loc.name) % 24);
            svg += reliefIconsFor(loc.biome.id, loc.x, loc.y, size, rand);
        }
        svg += '</g>';
        return svg;
    }

    /* ── Genera fill SVG per biomi con radial gradients morbidi ── */
    function renderBiomeFills(model) {
        const locations = Array.isArray(model?.locations) ? model.locations : [];
        if (!locations.length) return '';

        // Radial gradient per ogni location → copre area circostante con colore bioma
        var defs = '<defs>';
        var circles = '';
        var used = new Set();

        for (var i = 0; i < locations.length; i++) {
            var loc = locations[i];
            var bid = loc.biome ? loc.biome.id : 0;
            if (bid === 0) continue; // skip marine
            var biome = BIOMES[bid] || BIOMES[0];
            var gid = 'biome-grad-' + i;
            var radius = 160 + (hashStr(loc.name) % 80); // 160-240px
            defs += '<radialGradient id="' + gid + '" cx="50%" cy="50%" r="50%">' +
                '<stop offset="0%" stop-color="' + biome.color + '" stop-opacity="0.5"/>' +
                '<stop offset="50%" stop-color="' + biome.color + '" stop-opacity="0.28"/>' +
                '<stop offset="100%" stop-color="' + biome.color + '" stop-opacity="0"/>' +
                '</radialGradient>';
            circles += '<circle cx="' + loc.x + '" cy="' + loc.y + '" r="' + radius + '" fill="url(#' + gid + ')"/>';
        }
        defs += '</defs>';

        return '<g class="biome-fills" aria-hidden="true">' + defs + circles + '</g>';
    }

    function convexHull(points) {
        var unique = [];
        var seen = {};
        for (var i = 0; i < points.length; i++) {
            var key = Math.round(points[i][0]) + ':' + Math.round(points[i][1]);
            if (!seen[key]) { seen[key] = true; unique.push(points[i]); }
        }
        if (unique.length <= 2) return unique;
        unique.sort(function(a, b) { return a[0] - b[0] || a[1] - b[1]; });
        function cross(o, a, b) { return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]); }
        var lower = [];
        for (var i = 0; i < unique.length; i++) {
            while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], unique[i]) <= 0) lower.pop();
            lower.push(unique[i]);
        }
        var upper = [];
        for (var i = unique.length - 1; i >= 0; i--) {
            while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], unique[i]) <= 0) upper.pop();
            upper.push(unique[i]);
        }
        lower.pop(); upper.pop();
        return lower.concat(upper);
    }

    function pointsToBlobPath(points, padding) {
        if (points.length < 3) return '';
        var hull = convexHull(points);
        if (hull.length < 3) return '';
        var cx = 0, cy = 0;
        for (var i = 0; i < hull.length; i++) { cx += hull[i][0]; cy += hull[i][1]; }
        cx /= hull.length; cy /= hull.length;
        var padded = hull.map(function(p) {
            var dx = p[0] - cx, dy = p[1] - cy;
            var len = Math.max(1, Math.hypot(dx, dy));
            return [p[0] + dx/len*padding, p[1] + dy/len*padding];
        });
        var d = 'M ' + padded[0][0].toFixed(1) + ' ' + padded[0][1].toFixed(1);
        for (var i = 0; i < padded.length; i++) {
            var p0 = padded[(i-1+padded.length)%padded.length];
            var p1 = padded[i];
            var p2 = padded[(i+1)%padded.length];
            var p3 = padded[(i+2)%padded.length];
            var cp1x = p1[0] + (p2[0]-p0[0])/6;
            var cp1y = p1[1] + (p2[1]-p0[1])/6;
            var cp2x = p2[0] - (p3[0]-p1[0])/6;
            var cp2y = p2[1] - (p3[1]-p1[1])/6;
            d += ' C ' + cp1x.toFixed(1) + ' ' + cp1y.toFixed(1) + ', ' + cp2x.toFixed(1) + ' ' + cp2y.toFixed(1) + ', ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
        }
        d += ' Z';
        return d;
    }

    /* ── API pubblica ── */
    return {
        BIOMES: BIOMES,
        biomeId: biomeId,
        assignBiomes: assignBiomes,
        renderRelief: renderRelief,
        renderBiomeFills: renderBiomeFills,
        reliefIconsFor: reliefIconsFor,
        RELIEF_PATHS: RELIEF_PATHS,
        version: '21.0'
    };
});