/**
 * Portrait SVG Generator — ritratti procedurali deterministici.
 * Genera avatar SVG basati su genere, ruolo, era, età e seed (hash del nome).
 * Nessun file esterno necessario; varietà infinita.
 * UMD module: root.CronachePortraitSVG
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronachePortraitSVG = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /* ── Palette per era ── */
    const ERA_PALETTES = {
        medieval:  { bg: '#3a2e1f', skin: ['#e8c4a0', '#d4a578', '#c4956a', '#a67c52'], cloth: ['#4a6fa5', '#6b8e23', '#8b4513', '#4b3621', '#556b2f', '#614126', '#2f4f4f', '#722f37'], accent: ['#c5a05c', '#b8860b', '#daa520'] },
        fantasy:   { bg: '#1a1a2e', skin: ['#e8c4a0', '#d4a578', '#c4956a', '#b8865a'], cloth: ['#4a3060', '#1a5276', '#6b2d5c', '#2d5f2d', '#5b1a1a', '#1b3a4b', '#3a3a6e', '#4a1942'], accent: ['#e0c060', '#c0a0e0', '#80e0c0'] },
        ancient:   { bg: '#4a3a1f', skin: ['#e8c4a0', '#d4a578', '#c4956a', '#a67c52'], cloth: ['#8b4513', '#a0522d', '#cd853f', '#daa520', '#bc8f8f', '#8b6914', '#556032', '#704214'], accent: ['#daa520', '#ffd700', '#cd853f'] },
        renaissance:{ bg: '#2a1f3a', skin: ['#e8c4a0', '#d4a578', '#c4956a', '#a67c52'], cloth: ['#4b3621', '#556b2f', '#614126', '#483d8b', '#8b008b', '#2f4f4f', '#704214', '#36364e'], accent: ['#c5a05c', '#daa520', '#b8860b'] },
        industrial: { bg: '#2a2a2a', skin: ['#e8c4a0', '#d4a578', '#c4956a', '#a67c52'], cloth: ['#2f2f2f', '#3a3a3a', '#4a3a2a', '#1a3a5a', '#3a1a1a', '#2a3a2a', '#3a3a4a', '#4a2a2a'], accent: ['#a9a9a9', '#b8860b', '#8b8b8b'] },
        modern:    { bg: '#1e1e2e', skin: ['#e8c4a0', '#d4a578', '#c4956a', '#a67c52', '#8b7060'], cloth: ['#2c3e50', '#34495e', '#1a5276', '#7f8c8d', '#2c2c2c', '#1a3a1a', '#3a1a3a', '#2a2a4a'], accent: ['#3498db', '#e74c3c', '#2ecc71'] },
        pirate:    { bg: '#1a2a3a', skin: ['#e8c4a0', '#d4a578', '#c4956a', '#a67c52'], cloth: ['#2c2c2c', '#4a3a1a', '#1a3a5a', '#5a2a1a', '#2a2a4a', '#3a3a3a', '#4a2a2a', '#1a2a2a'], accent: ['#daa520', '#c0c0c0', '#8b0000'] }
    };

    /* ── Colori capelli per età ── */
    const HAIR_COLORS = {
        young:   ['#3b2417', '#5a3a1a', '#2c1810', '#7a4a20', '#4a3520', '#1a1a1a', '#8b6914', '#a0522d'],
        adult:   ['#3b2417', '#5a3a1a', '#2c1810', '#4a3520', '#1a1a1a', '#6b4226', '#8b6914'],
        elder:   ['#c0c0c0', '#dcdcdc', '#a9a9a9', '#f5f5dc', '#e8e8e8', '#b0b0b0'],
        veryOld: ['#f0f0f0', '#e8e8e8', '#dcdcdc', '#c0c0c0']
    };

    /* ── Stili capelli maschili ── */
    const MALE_HAIRSTYLES = ['short', 'medium', 'bald', 'tonsured', 'long'];
    /* ── Stili capelli femminili ── */
    const FEMALE_HAIRSTYLES = ['long', 'braided', 'bun', 'covered', 'medium'];

    /* ── Accessori per ruolo ── */
    const ROLE_ACCESSORIES = {
        'sovereign':  { accessory: 'crown',  clothColor: 'accent' },
        'royal-heir': { accessory: 'tiara',  clothColor: 'accent' },
        'warrior':    { accessory: 'helmet', clothColor: 'cloth' },
        'knight':     { accessory: 'helmet', clothColor: 'cloth' },
        'religious':  { accessory: 'hood',   clothColor: 'cloth' },
        'healer':     { accessory: 'none',   clothColor: 'cloth' },
        'scholar':    { accessory: 'hat',    clothColor: 'cloth' },
        'merchant':   { accessory: 'cap',    clothColor: 'cloth' },
        'noble':      { accessory: 'jewel',  clothColor: 'accent' },
        'artisan':    { accessory: 'none',   clothColor: 'cloth' },
        'commoner':   { accessory: 'none',   clothColor: 'cloth' },
        'ranger':     { accessory: 'hood',   clothColor: 'cloth' },
        'pirate':     { accessory: 'bandana', clothColor: 'cloth' },
        'executive':  { accessory: 'glasses', clothColor: 'cloth' },
        'investigator':{ accessory: 'hat',   clothColor: 'cloth' },
        'generic':    { accessory: 'none',   clothColor: 'cloth' }
    };

    /* ── Hash deterministico ── */
    function hashStr(text) {
        let h = 2166136261;
        const s = String(text || '');
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }

    function pick(arr, seed) { return arr[seed % arr.length]; }

    /* ── Rileva età dal testo ── */
    function detectAge(entity) {
        const corpus = String([
            entity?.name, entity?.role, entity?.description,
            entity?.personality, entity?.archetype
        ].filter(Boolean).join(' ')).toLowerCase();
        if (/\b(very old|very elder|molto vecchio|antico|decrepito|canuto|ottuagen|novant|centen)\b/.test(corpus)) return 'veryOld';
        if (/\b(old|elder|vecchio|anziano|saggio|antico|sacerdote anziano|nonno|canuto|grezza|stagionat|veterano)\b/.test(corpus)) return 'elder';
        if (/\b(young|giovane|ragazzo|ragazza|fanciullo|fanciulla|adolescent|bambino|bambina|piccolo|piccola)\b/.test(corpus)) return 'young';
        return 'adult';
    }

    /* ── Genera SVG ── */
    function generate(entity, context) {
        const input = entity && typeof entity === 'object' ? entity : { name: entity };
        const name = String(input.name || context?.name || 'NPC');
        const seed = hashStr(name);
        const era = context?.era || 'medieval';
        const gender = input.gender || context?.gender || 'male';
        const role = context?.role || 'generic';
        const age = detectAge(input);

        const palette = ERA_PALETTES[era] || ERA_PALETTES.medieval;
        const skin = pick(palette.skin, seed);
        const hairColors = HAIR_COLORS[age] || HAIR_COLORS.adult;
        const hair = pick(hairColors, seed >> 3);
        const acc = ROLE_ACCESSORIES[role] || ROLE_ACCESSORIES.generic;
        const useAccent = acc.clothColor === 'accent';
        const cloth = useAccent ? pick(palette.accent, seed >> 5) : pick(palette.cloth, seed >> 5);
        const accentColor = pick(palette.accent, seed >> 7);
        const bg = palette.bg;

        const isMale = gender === 'male';
        const hairstyle = isMale ? pick(MALE_HAIRSTYLES, seed >> 2) : pick(FEMALE_HAIRSTYLES, seed >> 2);
        const hasBeard = isMale && (age === 'elder' || age === 'veryOld' || (seed % 3 === 0 && age !== 'young'));
        const beardStyle = hasBeard ? pick(['full', 'goatee', 'mustache'], seed >> 9) : 'none';

        const accessory = acc.accessory;
        const eyeColor = '#3a2a1a';
        const vw = 120, vh = 140;
        const cx = vw / 2;

        // Build SVG parts
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}">`;
        svg += `<rect width="${vw}" height="${vh}" fill="${bg}"/>`;

        // Shoulders/clothing
        svg += `<path d="M15,${vh} L15,${vh-30} Q${cx},${vh-42} ${vw-15},${vh-30} L${vw-15},${vh} Z" fill="${cloth}"/>`;
        // Collar/neckline
        if (isMale) {
            svg += `<path d="M${cx-12},${vh-32} Q${cx},${vh-24} ${cx+12},${vh-32} L${cx+12},${vh-28} Q${cx},${vh-20} ${cx-12},${vh-28} Z" fill="${skin}"/>`;
        } else {
            svg += `<path d="M${cx-14},${vh-32} Q${cx},${vh-22} ${cx+14},${vh-32} L${cx+14},${vh-26} Q${cx},${vh-18} ${cx-14},${vh-26} Z" fill="${skin}"/>`;
            // Dress neckline accent
            svg += `<path d="M${cx-18},${vh-30} Q${cx},${vh-14} ${cx+18},${vh-30} L${cx+18},${vh-26} Q${cx},${vh-10} ${cx-18},${vh-26} Z" fill="${accentColor}" opacity="0.4"/>`;
        }

        // Head
        const headR = isMale ? 26 : 24;
        const headY = 48;
        svg += `<ellipse cx="${cx}" cy="${headY}" rx="${headR}" ry="${headR+3}" fill="${skin}"/>`;

        // Ears
        svg += `<ellipse cx="${cx-headR+2}" cy="${headY+2}" rx="4" ry="6" fill="${skin}"/>`;
        svg += `<ellipse cx="${cx+headR-2}" cy="${headY+2}" rx="4" ry="6" fill="${skin}"/>`;

        // Hair
        drawHair(svg, hairstyle, isMale, hair, cx, headY, headR, age);

        // Eyes
        const eyeY = headY - 2;
        const eyeDX = 9;
        svg += `<ellipse cx="${cx-eyeDX}" cy="${eyeY}" rx="3.5" ry="2.5" fill="white"/>`;
        svg += `<ellipse cx="${cx+eyeDX}" cy="${eyeY}" rx="3.5" ry="2.5" fill="white"/>`;
        svg += `<circle cx="${cx-eyeDX}" cy="${eyeY}" r="1.8" fill="${eyeColor}"/>`;
        svg += `<circle cx="${cx+eyeDX}" cy="${eyeY}" r="1.8" fill="${eyeColor}"/>`;
        // Eyebrows
        const browY = eyeY - 5;
        if (age === 'elder' || age === 'veryOld') {
            svg += `<path d="M${cx-eyeDX-4},${browY+1} Q${cx-eyeDX},${browY-1} ${cx-eyeDX+4},${browY+1}" stroke="${hair}" stroke-width="1.5" fill="none"/>`;
            svg += `<path d="M${cx+eyeDX-4},${browY+1} Q${cx+eyeDX},${browY-1} ${cx+eyeDX+4},${browY+1}" stroke="${hair}" stroke-width="1.5" fill="none"/>`;
        } else {
            svg += `<path d="M${cx-eyeDX-4},${browY} Q${cx-eyeDX},${browY-2} ${cx-eyeDX+4},${browY}" stroke="${hair}" stroke-width="2" fill="none"/>`;
            svg += `<path d="M${cx+eyeDX-4},${browY} Q${cx+eyeDX},${browY-2} ${cx+eyeDX+4},${browY}" stroke="${hair}" stroke-width="2" fill="none"/>`;
        }

        // Nose
        svg += `<path d="M${cx},${headY-2} L${cx-2},${headY+6} L${cx+2},${headY+6} Z" fill="${skin}" stroke="${shade(skin, -15)}" stroke-width="0.5"/>`;

        // Mouth
        const mouthY = headY + 12;
        if (isMale) {
            svg += `<path d="M${cx-6},${mouthY} Q${cx},${mouthY+1} ${cx+6},${mouthY}" stroke="${shade(skin, -30)}" stroke-width="1.5" fill="none"/>`;
        } else {
            svg += `<path d="M${cx-5},${mouthY} Q${cx},${mouthY+2} ${cx+5},${mouthY}" stroke="${shade(skin, -25)}" stroke-width="1.5" fill="none"/>`;
        }

        // Wrinkles for elder
        if (age === 'elder' || age === 'veryOld') {
            svg += `<path d="M${cx-eyeDX-6},${eyeY-8} L${cx-eyeDX-2},${eyeY-8}" stroke="${shade(skin,-20)}" stroke-width="0.5" opacity="0.5"/>`;
            svg += `<path d="M${cx+eyeDX+2},${eyeY-8} L${cx+eyeDX+6},${eyeY-8}" stroke="${shade(skin,-20)}" stroke-width="0.5" opacity="0.5"/>`;
            svg += `<path d="M${cx-4},${mouthY+3} L${cx+4},${mouthY+3}" stroke="${shade(skin,-20)}" stroke-width="0.4" opacity="0.4"/>`;
        }

        // Beard
        if (hasBeard) {
            drawBeard(svg, beardStyle, hair, cx, headY, headR, mouthY);
        }

        // Accessory
        drawAccessory(svg, accessory, cx, headY, headR, accentColor, cloth, era);

        // Role accent on clothing
        if (role === 'sovereign' || role === 'royal-heir') {
            svg += `<rect x="${cx-8}" y="${vh-28}" width="16" height="3" fill="${accentColor}"/>`;
        }
        if (role === 'religious') {
            // Simple cross or symbol on chest
            svg += `<path d="M${cx},${vh-24} L${cx},${vh-16} M${cx-3},${vh-20} L${cx+3},${vh-20}" stroke="${accentColor}" stroke-width="1.5"/>`;
        }

        svg += `</svg>`;
        return svg;
    }

    function drawHair(svg, style, isMale, color, cx, cy, r, age) {
        switch (style) {
            case 'short':
                svg += `<path d="M${cx-r},${cy-r+4} Q${cx},${cy-r-6} ${cx+r},${cy-r+4} Q${cx+r-2},${cy-r+8} ${cx+r-6},${cy-r+6} Q${cx},${cy-r-3} ${cx-r+6},${cy-r+6} Q${cx-r+2},${cy-r+8} ${cx-r},${cy-r+4} Z" fill="${color}"/>`;
                break;
            case 'medium':
                svg += `<path d="M${cx-r-1},${cy-r+6} Q${cx},${cy-r-8} ${cx+r+1},${cy-r+6} L${cx+r},${cy+2} Q${cx+r-4},${cy-r+2} ${cx},${cy-r-4} Q${cx-r+4},${cy-r+2} ${cx-r},${cy+2} Z" fill="${color}"/>`;
                break;
            case 'bald':
                svg += `<path d="M${cx-r+4},${cy-r+8} Q${cx},${cy-r-2} ${cx+r-4},${cy-r+8} Q${cx+r-6},${cy-r+6} ${cx},${cy-r-4} Q${cx-r+6},${cy-r+6} ${cx-r+4},${cy-r+8} Z" fill="${color}" opacity="0.5"/>`;
                break;
            case 'tonsured':
                svg += `<path d="M${cx-r+2},${cy-r+6} Q${cx},${cy-r-4} ${cx+r-2},${cy-r+6} Q${cx+r-4},${cy-r+4} ${cx+r-8},${cy-r+2} Q${cx},${cy-r-8} ${cx-r+8},${cy-r+2} Q${cx-r+4},${cy-r+4} ${cx-r+2},${cy-r+6} Z" fill="${color}"/>`;
                svg += `<ellipse cx="${cx}" cy="${cy-r+6}" rx="${r-12}" ry="6" fill="${shade(color, 20)}" opacity="0.6"/>`;
                break;
            case 'long':
                if (isMale) {
                    svg += `<path d="M${cx-r-2},${cy-r+6} Q${cx},${cy-r-8} ${cx+r+2},${cy-r+6} L${cx+r+1},${cy+12} Q${cx+r-4},${cy+6} ${cx+r-3},${cy-r+2} Q${cx},${cy-r-6} ${cx-r+3},${cy-r+2} Q${cx-r+4},${cy+6} ${cx-r-1},${cy+12} Z" fill="${color}"/>`;
                } else {
                    svg += `<path d="M${cx-r-3},${cy-r+6} Q${cx},${cy-r-10} ${cx+r+3},${cy-r+6} L${cx+r+2},${cy+18} Q${cx+r-4},${cy+14} ${cx+r-3},${cy+4} Q${cx},${cy-r-6} ${cx-r+3},${cy+4} Q${cx-r+4},${cy+14} ${cx-r-2},${cy+18} Z" fill="${color}"/>`;
                }
                break;
            case 'braided':
                svg += `<path d="M${cx-r-2},${cy-r+6} Q${cx},${cy-r-10} ${cx+r+2},${cy-r+6} L${cx+r},${cy+2} Q${cx},${cy-r-4} ${cx-r},${cy+2} Z" fill="${color}"/>`;
                svg += `<rect x="${cx-4}" y="${cy+8}" width="8" height="20" rx="3" fill="${color}"/>`;
                svg += `<rect x="${cx-4}" y="${cy+14}" width="8" height="2" fill="${shade(color,-20)}"/>`;
                svg += `<rect x="${cx-4}" y="${cy+20}" width="8" height="2" fill="${shade(color,-20)}"/>`;
                break;
            case 'bun':
                svg += `<path d="M${cx-r-1},${cy-r+6} Q${cx},${cy-r-8} ${cx+r+1},${cy-r+6} L${cx+r},${cy} Q${cx},${cy-r-4} ${cx-r},${cy} Z" fill="${color}"/>`;
                svg += `<circle cx="${cx}" cy="${cy-r-2}" r="8" fill="${color}"/>`;
                break;
            case 'covered':
                svg += `<path d="M${cx-r-4},${cy-r+2} Q${cx},${cy-r-12} ${cx+r+4},${cy-r+2} L${cx+r+4},${cy+8} Q${cx},${cy+4} ${cx-r-4},${cy+8} Z" fill="${shade(color,-10)}"/>`;
                svg += `<path d="M${cx-r-4},${cy-r+2} Q${cx},${cy-r-14} ${cx+r+4},${cy-r+2}" stroke="${shade(color,-30)}" stroke-width="1" fill="none"/>`;
                break;
        }
    }

    function drawBeard(svg, style, color, cx, cy, r, mouthY) {
        switch (style) {
            case 'full':
                svg += `<path d="M${cx-r+4},${cy+4} Q${cx-r+2},${mouthY+8} ${cx},${mouthY+12} Q${cx+r-2},${mouthY+8} ${cx+r-4},${cy+4} Q${cx+r-8},${mouthY+4} ${cx},${mouthY+10} Q${cx-r+8},${mouthY+4} ${cx-r+4},${cy+4} Z" fill="${color}"/>`;
                break;
            case 'goatee':
                svg += `<path d="M${cx-5},${mouthY+2} Q${cx},${mouthY+4} ${cx+5},${mouthY+2} L${cx+3},${mouthY+10} Q${cx},${mouthY+12} ${cx-3},${mouthY+10} Z" fill="${color}"/>`;
                svg += `<path d="M${cx-4},${mouthY-1} Q${cx},${mouthY} ${cx+4},${mouthY-1}" stroke="${color}" stroke-width="2" fill="none"/>`;
                break;
            case 'mustache':
                svg += `<path d="M${cx-8},${mouthY-2} Q${cx-3},${mouthY-4} ${cx},${mouthY-1} Q${cx+3},${mouthY-4} ${cx+8},${mouthY-2}" stroke="${color}" stroke-width="2.5" fill="none"/>`;
                break;
        }
    }

    function drawAccessory(svg, type, cx, cy, r, accent, cloth, era) {
        switch (type) {
            case 'crown':
                svg += `<path d="M${cx-r+6},${cy-r+4} L${cx-r+8},${cy-r-4} L${cx-r+2},${cy-r+2} L${cx},${cy-r-6} L${cx+r-2},${cy-r+2} L${cx+r-8},${cy-r-4} L${cx+r-6},${cy-r+4} Z" fill="${accent}" stroke="${shade(accent,-30)}" stroke-width="0.5"/>`;
                break;
            case 'tiara':
                svg += `<path d="M${cx-r+8},${cy-r+4} Q${cx},${cy-r-4} ${cx+r-8},${cy-r+4}" stroke="${accent}" stroke-width="2" fill="none"/>`;
                svg += `<circle cx="${cx}" cy="${cy-r+2}" r="2.5" fill="${accent}"/>`;
                break;
            case 'helmet':
                svg += `<path d="M${cx-r-1},${cy-r+8} Q${cx},${cy-r-10} ${cx+r+1},${cy-r+8} L${cx+r+1},${cy+4} Q${cx+r-6},${cy} ${cx+r-4},${cy-r+4} Q${cx},${cy-r-8} ${cx-r+4},${cy-r+4} Q${cx-r+6},${cy} ${cx-r-1},${cy+4} Z" fill="#6a6a6a" stroke="#4a4a4a" stroke-width="0.5"/>`;
                svg += `<rect x="${cx-3}" y="${cy-4}" width="6" height="8" fill="#3a3a3a"/>`;
                break;
            case 'hood':
                svg += `<path d="M${cx-r-6},${cy-r+2} Q${cx},${cy-r-16} ${cx+r+6},${cy-r+2} L${cx+r+4},${cy+8} Q${cx+r-2},${cy+4} ${cx+r-2},${cy-r+4} Q${cx},${cy-r-12} ${cx-r+2},${cy-r+4} Q${cx-r+2},${cy+4} ${cx-r-4},${cy+8} Z" fill="${shade(cloth,-20)}"/>`;
                break;
            case 'hat':
                svg += `<path d="M${cx-r+2},${cy-r+4} L${cx+r-2},${cy-r+4} L${cx+r-4},${cy-r-2} Q${cx},${cy-r-6} ${cx-r+4},${cy-r-2} Z" fill="${shade(cloth,-20)}"/>`;
                svg += `<rect x="${cx-r}" y="${cy-r+3}" width="${2*r}" height="3" rx="1" fill="${shade(cloth,-30)}"/>`;
                break;
            case 'cap':
                svg += `<path d="M${cx-r+4},${cy-r+6} Q${cx},${cy-r-4} ${cx+r-4},${cy-r+6} Z" fill="${shade(cloth,-15)}"/>`;
                break;
            case 'bandana':
                svg += `<path d="M${cx-r-2},${cy-r+4} Q${cx},${cy-r-8} ${cx+r+2},${cy-r+4} L${cx+r+2},${cy-r+8} Q${cx},${cy-r+2} ${cx-r-2},${cy-r+8} Z" fill="${accent}"/>`;
                svg += `<path d="M${cx+r+2},${cy-r+4} L${cx+r+8},${cy-r+10}" stroke="${accent}" stroke-width="2" fill="none"/>`;
                break;
            case 'jewel':
                svg += `<circle cx="${cx}" cy="${cy-r+8}" r="2.5" fill="${accent}"/>`;
                svg += `<circle cx="${cx}" cy="${cy-r+8}" r="1" fill="${shade(accent,40)}"/>`;
                break;
            case 'glasses':
                svg += `<circle cx="${cx-9}" cy="${cy-2}" r="5" fill="none" stroke="#333" stroke-width="1.5"/>`;
                svg += `<circle cx="${cx+9}" cy="${cy-2}" r="5" fill="none" stroke="#333" stroke-width="1.5"/>`;
                svg += `<line x1="${cx-4}" y1="${cy-2}" x2="${cx+4}" y2="${cy-2}" stroke="#333" stroke-width="1"/>`;
                break;
        }
    }

    /* ── Utility: shade color ── */
    function shade(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.max(0, Math.min(255, (num >> 16) + percent));
        const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + percent));
        const b = Math.max(0, Math.min(255, (num & 0xff) + percent));
        return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    }

    /* ── SVG → data URI ── */
    function toDataUri(svg) {
        return 'data:image/svg+xml,' + encodeURIComponent(svg);
    }

    /* ── API pubblica ── */
    return {
        generate,
        toDataUri,
        detectAge,
        hashStr
    };
});