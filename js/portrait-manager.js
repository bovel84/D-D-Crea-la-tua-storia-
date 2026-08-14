(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronachePortraits = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const PORTRAIT_SCHEMA_VERSION = 1;
    const ATLAS_COLUMNS = 3;
    const ATLAS_ROWS = 2;
    const CHRONICLE_GENRES = new Set(['fantasy', 'historical', 'pirate', 'rural']);

    function cleanText(value, maxLength = 320) {
        return String(value == null ? '' : value)
            .replace(/[\[\]]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, maxLength);
    }

    function keyOf(value) {
        return cleanText(value, 600)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9\s_-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
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

    function portrait(id, family, atlas, column, row, label, tags) {
        return Object.freeze({
            id,
            family,
            atlas,
            image: `assets/portraits/${id}.webp`,
            column,
            row,
            label,
            tags: Object.freeze(tags.slice()),
            backgroundSize: `${ATLAS_COLUMNS * 100}% ${ATLAS_ROWS * 100}%`,
            backgroundPosition: `${column === 0 ? 0 : column === ATLAS_COLUMNS - 1 ? 100 : 50}% ${row === 0 ? 0 : 100}%`
        });
    }

    const PORTRAITS = Object.freeze([
        portrait('chronicle-vanguard', 'chronicle', 'assets/portraits/chronicle-cast-v1.webp', 0, 0, 'Avanguardia',
            ['warrior', 'guerriero', 'knight', 'cavaliere', 'guard', 'guardia', 'ranger', 'ramingo', 'scout', 'soldier', 'fante']),
        portrait('chronicle-scholar', 'chronicle', 'assets/portraits/chronicle-cast-v1.webp', 1, 0, 'Studioso',
            ['scholar', 'studioso', 'diplomat', 'diplomatico', 'advisor', 'consigliere', 'mage', 'mago', 'cleric', 'chierico', 'mediator', 'orator']),
        portrait('chronicle-merchant', 'chronicle', 'assets/portraits/chronicle-cast-v1.webp', 2, 0, 'Mercante',
            ['merchant', 'mercante', 'noble', 'nobile', 'leader', 'capo', 'courtier', 'cortigiano', 'emissary', 'emissario', 'negotiator']),
        portrait('chronicle-corsair', 'chronicle', 'assets/portraits/chronicle-cast-v1.webp', 0, 1, 'Corsaro',
            ['rogue', 'ladro', 'outlaw', 'fuorilegge', 'pirate', 'pirata', 'corsair', 'corsaro', 'sailor', 'marinaio', 'spy', 'spia']),
        portrait('chronicle-healer', 'chronicle', 'assets/portraits/chronicle-cast-v1.webp', 1, 1, 'Guaritrice',
            ['healer', 'guaritore', 'guaritrice', 'mystic', 'mistico', 'priest', 'sacerdote', 'cleric', 'chierico', 'elder', 'saggio', 'alchemist']),
        portrait('chronicle-artisan', 'chronicle', 'assets/portraits/chronicle-cast-v1.webp', 2, 1, 'Artigiano',
            ['artisan', 'artigiano', 'farmer', 'contadino', 'captain', 'capitano', 'worker', 'lavoratore', 'builder', 'costruttore', 'navigator', 'allevatore']),
        portrait('modern-investigator', 'modern', 'assets/portraits/modern-cast-v1.webp', 0, 0, 'Investigatore',
            ['investigator', 'investigatore', 'journalist', 'giornalista', 'detective', 'reporter', 'spy', 'spia', 'field agent', 'agente']),
        portrait('modern-analyst', 'modern', 'assets/portraits/modern-cast-v1.webp', 1, 0, 'Analista',
            ['analyst', 'analista', 'hacker', 'scientist', 'scienziato', 'coder', 'sviluppatore', 'technician', 'tecnico', 'controller']),
        portrait('modern-executive', 'modern', 'assets/portraits/modern-cast-v1.webp', 2, 0, 'Dirigente',
            ['executive', 'dirigente', 'manager', 'diplomat', 'diplomatico', 'official', 'funzionario', 'leader', 'ceo', 'fondatore', 'orator']),
        portrait('modern-specialist', 'modern', 'assets/portraits/modern-cast-v1.webp', 0, 1, 'Specialista',
            ['athlete', 'atleta', 'sportivo', 'player', 'giocatore', 'scout', 'ricognitore', 'driver', 'autista', 'infiltrator', 'infiltrato', 'operative']),
        portrait('modern-medic', 'modern', 'assets/portraits/modern-cast-v1.webp', 1, 1, 'Medico',
            ['medic', 'medico', 'doctor', 'dottore', 'officer', 'ufficiale', 'military', 'militare', 'caregiver', 'soccorritore', 'veteran']),
        portrait('modern-handler', 'modern', 'assets/portraits/modern-cast-v1.webp', 2, 1, 'Consigliera',
            ['handler', 'fixer', 'facilitatore', 'professor', 'professore', 'advisor', 'consigliere', 'mediator', 'mediatore', 'intelligence', 'diplomat'])
    ]);

    const PORTRAIT_BY_ID = new Map(PORTRAITS.map(item => [item.id, item]));

    function resolveFamily(context = {}) {
        const story = context.story || {};
        const genre = keyOf(context.genre || story.genre);
        const setting = keyOf(context.setting || story.setting);
        if (CHRONICLE_GENRES.has(genre)) return 'chronicle';
        if (/fantasy|medioevo|medieval|rinasc|antica|antico|roma|pirat|corsar|feud|regno|castello|vittorian|ottocento|rurale|agricol/.test(setting)) {
            return 'chronicle';
        }
        return 'modern';
    }

    function getPortrait(id) {
        return PORTRAIT_BY_ID.get(cleanText(id, 80)) || null;
    }

    function listPortraits(context = {}) {
        const family = resolveFamily(context);
        return PORTRAITS.filter(item => item.family === family);
    }

    function entityCorpus(entity, context = {}) {
        const input = entity && typeof entity === 'object' ? entity : { name: entity };
        return keyOf([
            input.name,
            input.role,
            input.archetype,
            input.origin,
            input.description,
            input.personality,
            input.historicalRole,
            context.role,
            context.archetype,
            context.origin
        ].filter(Boolean).join(' '));
    }

    function roleScore(item, corpus) {
        return item.tags.reduce((score, tag) => score + (corpus.includes(keyOf(tag)) ? 1 : 0), 0);
    }

    function choosePortrait(entity, context = {}) {
        const input = entity && typeof entity === 'object' ? entity : { name: entity };
        const explicit = getPortrait(input.portraitId || context.portraitId);
        if (explicit) return explicit;
        const candidates = listPortraits(context);
        if (!candidates.length) return PORTRAITS[0] || null;
        const corpus = entityCorpus(input, context);
        const scored = candidates.map(item => ({ item, score: roleScore(item, corpus) }));
        const bestScore = Math.max(...scored.map(entry => entry.score));
        const best = scored.filter(entry => entry.score === bestScore).map(entry => entry.item);
        const identity = keyOf(input.name || context.name || `${context.role || ''}|${context.archetype || ''}`) || 'protagonista';
        return best[hashNumber(`${identity}|${resolveFamily(context)}|${bestScore}`) % best.length];
    }

    function assignPortrait(entity, context = {}) {
        if (!entity || typeof entity !== 'object') return entity;
        const selected = choosePortrait(entity, context);
        if (!selected) return entity;
        entity.portraitId = selected.id;
        entity.portraitSchemaVersion = PORTRAIT_SCHEMA_VERSION;
        return entity;
    }

    function spriteStyle(portraitOrId) {
        const item = typeof portraitOrId === 'string' ? getPortrait(portraitOrId) : portraitOrId;
        if (!item) return '';
        return `--portrait-image:url('${item.atlas}');--portrait-size:${item.backgroundSize};--portrait-position:${item.backgroundPosition};`;
    }

    function imageSrc(portraitOrId) {
        const item = typeof portraitOrId === 'string' ? getPortrait(portraitOrId) : portraitOrId;
        return item?.image || '';
    }

    return {
        PORTRAIT_SCHEMA_VERSION,
        ATLAS_COLUMNS,
        ATLAS_ROWS,
        PORTRAITS,
        cleanText,
        keyOf,
        resolveFamily,
        getPortrait,
        listPortraits,
        choosePortrait,
        assignPortrait,
        imageSrc,
        spriteStyle
    };
});
