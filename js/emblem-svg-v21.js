/**
 * Emblem SVG v21 — Stemmi araldici procedurali per fazioni/nazioni/nobili.
 * Adattato da Azgaar/Fantasy-Map-Generator (MIT).
 * UMD module: root.CronacheEmblemSVG
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheEmblemSVG = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /* ── Tinctures (colori araldici) ── */
    const TINCTURES = {
        argent: '#ececec', or: '#f4e57a', or2: '#e8c870',
        gules: '#a32638', azure: '#2a4bad', sable: '#1a1a1a',
        purpure: '#7a2860', vert: '#2d6a3a',
        murrey: '#5a2840', sanguine: '#6b1a1a', tenné: '#b85a1a',
        bronze: '#8b5a2a', copper: '#b87333', steel: '#8a8a9a',
        rose: '#c08070', copperRed: '#a04030'
    };

    /* ── Pattern tincture (semplificato: ritorna colore diretto) ── */
    function clr(tincture) {
        if (!tincture) return TINCTURES.argent;
        if (tincture.includes('-')) {
            const parts = tincture.split('-');
            return TINCTURES[parts[1]] || TINCTURES.argent;
        }
        return TINCTURES[tincture] || TINCTURES.argent;
    }

    /* ── Scudi (path data SVG, 200×200 viewBox) ── */
    const SHIELD_PATHS = {
        heater:  'M10,10 L190,10 L190,100 Q190,160 100,190 Q10,160 10,100 Z',
        spanish: 'M10,10 L190,10 L190,170 Q100,200 10,170 Z',
        french:  'M10,10 L190,10 L190,120 Q190,175 100,190 Q10,175 10,120 Z',
        round:   'M100,10 A90,90 0 1 0 100,190 A90,90 0 1 0 100,10 Z',
        oval:    'M100,15 A85,85 0 1 0 100,185 A85,85 0 1 0 100,15 Z',
        diamond: 'M100,10 L190,100 L100,190 L10,100 Z',
        fantasy: 'M10,10 L100,10 L190,10 L190,80 Q190,120 160,140 L100,190 L40,140 Q10,120 10,80 Z',
        horsehead: 'M10,10 L60,10 L100,30 L140,10 L190,10 L190,170 Q100,200 10,170 Z',
        pavise:   'M10,10 L190,10 L190,180 L100,195 L10,180 Z',
        kite:     'M10,10 L190,10 L190,150 Q100,200 10,150 Z'
    };

    const SHIELD_VARIANTS = Object.keys(SHIELD_PATHS);

    /* ── Divisioni (linee di partizione) ── */
    const DIVISIONS = {
        perPale:   { path: 'M100,10 L100,190', type: 'split' },
        perFess:   { path: 'M10,100 L190,100', type: 'split' },
        perBend:   { path: 'M10,10 L190,190', type: 'split' },
        perBendSinister: { path: 'M190,10 L10,190', type: 'split' },
        perCross:  { path: 'M100,10 L100,190 M10,100 L190,100', type: 'quarter' },
        perChevron: { path: 'M10,10 L100,130 L190,10', type: 'split' },
        perSaltire: { path: 'M10,10 L100,100 L10,190 M190,10 L100,100 L190,190', type: 'quarter' },
        gyronny:   { path: 'M10,10 L100,100 L10,190 M190,10 L100,100 L190,190 M10,10 L100,100 L190,10 M10,190 L100,100 L190,190', type: 'multi' }
    };

    const DIVISION_VARIANTS = Object.keys(DIVISIONS);

    /* ── Ordinarie (geometrie araldiche) ── */
    const ORDINARIES = {
        pale:     { path: 'M85,10 L115,10 L115,190 L85,190 Z' },
        fess:     { path: 'M10,85 L190,85 L190,115 L10,115 Z' },
        bend:     { path: 'M10,10 L40,10 L190,160 L190,190 Z' },
        bendSinister: { path: 'M190,10 L160,10 L10,160 L10,190 Z' },
        chief:    { path: 'M10,10 L190,10 L190,45 L10,45 Z' },
        chevron:  { path: 'M10,100 L100,40 L190,100 L190,130 L100,70 L10,130 Z' },
        cross:    { path: 'M85,10 L115,10 L115,85 L190,85 L190,115 L115,115 L115,190 L85,190 L85,115 L10,115 L10,85 L85,85 Z' },
        saltire:  { path: 'M10,10 L40,10 L100,75 L160,10 L190,10 L110,100 L190,190 L160,190 L100,125 L40,190 L10,190 L90,100 Z' },
        bordure:  { path: 'M10,10 L190,10 L190,190 L10,190 Z M25,25 L175,25 L175,175 L25,175 Z', fillRule: 'evenodd' },
        pile:     { path: 'M70,10 L130,10 L100,190 Z' },
        mount:    { path: 'M10,190 Q100,120 190,190 Z' },
        canton:   { path: 'M10,10 L70,10 L70,70 L10,70 Z' },
        label:    { path: 'M50,10 L150,10 L150,25 L130,25 L130,20 L120,20 L120,25 L100,25 L100,20 L90,20 L90,25 L70,25 L70,20 L60,20 L60,25 L50,25 Z' }
    };

    const ORDINARY_VARIANTS = Object.keys(ORDINARIES);

    /* ── Cariche (simboli) semplificate — path inline ── */
    const CHARGES = {
        lionRampant: 'M100,40 Q80,35 70,50 Q60,65 65,85 Q55,95 60,110 Q70,130 90,135 L90,150 Q80,160 85,175 L95,170 L100,150 L110,170 L120,175 Q115,160 105,150 L105,135 Q120,130 130,110 Q135,95 125,85 Q130,65 120,50 Q110,35 100,40 Z',
        eagle: 'M100,30 Q70,40 55,70 Q50,90 60,110 Q50,130 55,160 L70,150 L80,130 L100,150 L120,130 L130,150 L145,160 Q150,130 140,110 Q150,90 145,70 Q130,40 100,30 Z M85,55 L90,55 L90,62 L85,62 Z M110,55 L115,55 L115,62 L110,62 Z',
        cross: 'M90,40 L110,40 L110,90 L160,90 L160,110 L110,110 L110,160 L90,160 L90,110 L40,110 L40,90 L90,90 Z',
        fleurDeLis: 'M100,30 Q85,50 80,80 Q70,70 65,85 Q75,100 90,100 L85,160 L115,160 L110,100 Q125,100 135,85 Q130,70 120,80 Q115,50 100,30 Z',
        star: 'M100,30 L110,75 L155,75 L120,100 L135,145 L100,120 L65,145 L80,100 L45,75 L90,75 Z',
        sun: 'M100,40 A60,60 0 1 1 99,40 Z M100,30 L100,20 M100,180 L100,170 M30,100 L20,100 M180,100 L170,100 M50,50 L42,42 M150,150 L158,158 M150,50 L158,42 M50,150 L42,158',
        moon: 'M100,100 A55,55 0 1 0 100,100.1 M120,70 A45,45 0 1 1 120,130 A55,55 0 1 0 120,70 Z',
        sword: 'M95,30 L105,30 L105,140 L115,145 L115,155 L85,155 L85,145 L95,140 Z M80,155 L120,155 L120,165 L80,165 Z',
        crown: 'M50,70 L50,90 L60,80 L70,100 L80,80 L90,100 L100,75 L110,100 L120,80 L130,100 L140,80 L150,90 L150,70 L140,80 L130,60 L120,80 L100,50 L80,80 L70,60 L60,80 Z',
        tower: 'M70,60 L130,60 L130,70 L135,70 L135,80 L130,80 L130,150 L70,150 L70,80 L65,80 L65,70 L70,70 Z M85,85 L85,100 L95,100 L95,85 Z M105,85 L105,100 L115,100 L115,85 Z M85,110 L85,125 L95,125 L95,110 Z M105,110 L105,125 L115,125 L115,110 Z',
        rose: 'M100,50 Q120,50 120,70 Q120,90 100,90 Q80,90 80,70 Q80,50 100,50 Z M90,60 L95,60 L95,65 L90,65 Z M105,60 L110,60 L110,65 L105,65 Z M100,80 L110,95 L100,110 L90,95 Z',
        dragon: 'M70,40 Q90,30 100,50 Q110,30 130,40 Q125,60 115,70 Q130,80 125,110 L110,100 L100,120 L90,100 L75,110 Q70,80 85,70 Q75,60 70,40 Z',
        wolf: 'M80,45 Q100,35 120,45 Q130,60 125,80 Q120,100 100,105 Q80,100 75,80 Q70,60 80,45 Z M90,55 L92,60 L88,60 Z M108,55 L112,60 L108,60 Z M95,75 L105,75 L100,85 Z',
        horse: 'M75,50 Q85,35 95,45 L105,45 Q115,35 125,50 L120,70 L120,100 L110,100 L110,130 L90,130 L90,100 L80,100 Z',
        anchor: 'M100,30 L100,150 M90,150 L110,150 M85,40 L115,40 M100,30 A15,15 0 1 0 100,30.1',
        key: 'M100,40 A20,20 0 1 0 100,40.1 M100,60 L100,160 M90,160 L110,160 L110,145 L90,145 Z',
        fleur: 'M100,30 Q85,50 80,80 Q70,70 65,85 Q75,100 90,100 L85,160 L115,160 L110,100 Q125,100 135,85 Q130,70 120,80 Q115,50 100,30 Z',
        trefoil: 'M100,40 A25,25 0 1 0 100,40.1 M75,70 A25,25 0 1 0 75,70.1 M125,70 A25,25 0 1 0 125,70.1 M100,100 L100,160',
        shell: 'M60,150 Q100,50 140,150 Z M70,140 L130,140 M75,130 L125,130 M80,120 L120,120 M85,110 L115,110 M90,100 L110,100 M95,90 L105,90',
        heart: 'M100,50 Q70,30 60,60 Q50,90 100,160 Q150,90 140,60 Q130,30 100,50 Z',
        diamond_lozenge: 'M100,30 L160,100 L100,170 L40,100 Z',
        annulet: 'M100,50 A50,50 0 1 0 100,50.1 M100,70 A30,30 0 1 1 100,70.1',
        crescent: 'M100,50 A50,50 0 1 1 100,50.1 M120,55 A40,40 0 1 0 120,130 A55,55 0 1 0 120,55 Z',
        mulet: 'M100,30 L115,80 L165,80 L125,110 L140,160 L100,130 L60,160 L75,110 L35,80 L85,80 Z',
        roundel: 'M100,50 A50,50 0 1 0 100,50.1',
        compass: 'M100,30 L110,90 L170,100 L110,110 L100,170 L90,110 L30,100 L90,90 Z',
        gem: 'M70,60 L130,60 L150,90 L100,160 L50,90 Z M70,60 L100,30 L130,60 Z',
        olive: 'M90,40 Q110,30 120,60 Q130,90 110,120 Q90,140 70,110 Q60,80 80,50 Z M95,50 L105,55 M85,70 L115,70 M80,90 L120,90 M85,110 L115,110'
    };

    const CHARGE_VARIANTS = Object.keys(CHARGES);

    /* ── Hash deterministico ── */
    function hashStr(text) {
        let h = 2166136261;
        const s = String(text || '');
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }

    function mulberry32(seed) {
        return function () {
            seed = (seed + 0x6D2B79F5) | 0;
            let t = seed;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }

    function weightedPick(rand, obj) {
        const entries = Object.entries(obj);
        const total = entries.reduce((s, [, w]) => s + w, 0);
        let r = rand() * total;
        for (const [key, w] of entries) {
            r -= w;
            if (r <= 0) return key;
        }
        return entries[0][0];
    }

    /* ── Tincture pools ── */
    const FIELD_TINCTURES = {
        argent: 3, or: 2, gules: 5, azure: 4, sable: 3, purpure: 3, vert: 2
    };
    const CHARGE_TINCTURES = {
        argent: 3, or: 3, gules: 2, azure: 2, sable: 1, purpure: 1, vert: 1
    };
    const ORDINARY_TINCTURES = {
        argent: 2, or: 2, gules: 3, azure: 2, sable: 2, purpure: 2, vert: 1
    };

    /* ── Genera coat of arms (emblem) ── */
    function generate(seedText, options) {
        const opts = options || {};
        const seed = hashStr(seedText);
        const rand = mulberry32(seed);

        const shield = opts.shield || pick(rand, SHIELD_VARIANTS);
        const t1 = weightedPick(rand, FIELD_TINCTURES);
        const hasDivision = rand() < 0.35;
        const division = hasDivision ? pick(rand, DIVISION_VARIANTS) : null;
        const divTincture = hasDivision ? weightedPick(rand, FIELD_TINCTURES) : null;

        const hasOrdinary = !hasDivision ? rand() < 0.45 : rand() < 0.2;
        const ordinary = hasOrdinary ? pick(rand, ORDINARY_VARIANTS) : null;
        const ordTincture = hasOrdinary ? weightedPick(rand, ORDINARY_TINCTURES) : null;

        const hasCharge = rand() < 0.7;
        const charge = hasCharge ? pick(rand, CHARGE_VARIANTS) : null;
        const chargeTincture = hasCharge ? weightedPick(rand, CHARGE_TINCTURES) : null;

        return {
            shield, t1,
            division, divTincture,
            ordinary, ordTincture,
            charge, chargeTincture,
            seed
        };
    }

    /* ── Render SVG da coat of arms ── */
    function render(coa, size) {
        const s = size || 200;
        const shieldPath = SHIELD_PATHS[coa.shield] || SHIELD_PATHS.heater;
        const shieldId = `sh_${coa.seed}`;

        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${s}" height="${s}">`;

        // Clip path
        svg += `<defs><clipPath id="${shieldId}"><path d="${shieldPath}"/></clipPath></defs>`;

        // Field
        svg += `<path d="${shieldPath}" fill="${clr(coa.t1)}"/>`;

        // Division
        if (coa.division && DIVISIONS[coa.division]) {
            const div = DIVISIONS[coa.division];
            if (div.type === 'split') {
                // Simple two-color split
                svg += `<path d="${shieldPath}" fill="${clr(coa.divTincture)}" clip-path="url(#${shieldId})" transform="${coa.division === 'perPale' ? 'translate(100,0)' : coa.division === 'perFess' ? 'translate(0,100)' : ''}"/>`;
                // Draw line
                svg += `<path d="${div.path}" stroke="#1a1a1a" stroke-width="1.5" fill="none" clip-path="url(#${shieldId})"/>`;
            } else if (div.type === 'quarter') {
                // Quarter: alternate colors
                svg += `<g clip-path="url(#${shieldId})">`;
                svg += `<rect x="100" y="0" width="100" height="100" fill="${clr(coa.divTincture)}"/>`;
                svg += `<rect x="0" y="100" width="100" height="100" fill="${clr(coa.divTincture)}"/>`;
                svg += `</g>`;
                svg += `<path d="${div.path}" stroke="#1a1a1a" stroke-width="1.5" fill="none" clip-path="url(#${shieldId})"/>`;
            } else {
                svg += `<path d="${div.path}" stroke="#1a1a1a" stroke-width="1" fill="none" clip-path="url(#${shieldId})"/>`;
            }
        }

        // Ordinary
        if (coa.ordinary && ORDINARIES[coa.ordinary]) {
            const ord = ORDINARIES[coa.ordinary];
            svg += `<path d="${ord.path}" fill="${clr(coa.ordTincture)}" clip-path="url(#${shieldId})"`;
            if (ord.fillRule) svg += ` fill-rule="${ord.fillRule}"`;
            svg += `/>`;
        }

        // Charge
        if (coa.charge && CHARGES[coa.charge]) {
            const chargePath = CHARGES[coa.charge];
            svg += `<g clip-path="url(#${shieldId})" fill="${clr(coa.chargeTincture)}" stroke="#1a1a1a" stroke-width="0.8">`;
            svg += `<path d="${chargePath}"/>`;
            svg += `</g>`;
        }

        // Shield outline
        svg += `<path d="${shieldPath}" fill="none" stroke="#1a1a1a" stroke-width="2.5"/>`;

        // Backlight gradient
        svg += `<defs><radialGradient id="bl_${shieldId}" cx="100%" cy="100%" r="150%"><stop stop-color="#fff" stop-opacity=".25" offset="0"/><stop stop-color="#000" stop-opacity="0" offset="1"/></radialGradient></defs>`;
        svg += `<path d="${shieldPath}" fill="url(#bl_${shieldId})" clip-path="url(#${shieldId})"/>`;

        svg += `</svg>`;
        return svg;
    }

    /* ── Genera e renderizza in un colpo ── */
    function generateSVG(seedText, options, size) {
        const coa = generate(seedText, options);
        return render(coa, size);
    }

    /* ── API pubblica ── */
    return {
        generate,
        render,
        generateSVG,
        TINCTURES,
        SHIELD_PATHS,
        CHARGES,
        ORDINARIES,
        DIVISIONS,
        version: '21.0'
    };
});