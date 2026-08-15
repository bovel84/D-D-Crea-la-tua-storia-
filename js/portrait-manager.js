(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronachePortraits = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const PORTRAIT_SCHEMA_VERSION = 4;
    const ATLAS_COLUMNS = 3;
    const ATLAS_ROWS = 2;
    const CHRONICLE_GENRES = new Set(['fantasy', 'historical', 'pirate', 'rural']);
    const VISUAL_GENDERS = Object.freeze({
        'chronicle-vanguard': 'female', 'chronicle-scholar': 'male', 'chronicle-merchant': 'female',
        'chronicle-corsair': 'male', 'chronicle-healer': 'female', 'chronicle-artisan': 'male',
        'modern-investigator': 'male', 'modern-analyst': 'female', 'modern-executive': 'female',
        'modern-specialist': 'male', 'modern-medic': 'male', 'modern-handler': 'female',
        'ancient-heir': 'male', 'ancient-queen': 'female', 'ancient-general': 'male',
        'ancient-priestess': 'female', 'ancient-noble': 'male', 'ancient-scholar': 'male',
        'medieval-prince': 'male', 'medieval-princess': 'female', 'medieval-king': 'male',
        'medieval-queen': 'female', 'medieval-knight': 'male', 'medieval-diplomat': 'male',
        'medieval-innkeeper': 'male', 'medieval-blacksmith': 'male', 'medieval-peasant': 'male',
        'medieval-healer': 'female', 'medieval-monk': 'male', 'medieval-ranger': 'male',
        'renaissance-prince': 'male', 'renaissance-princess': 'female', 'renaissance-merchant': 'male',
        'renaissance-diplomat': 'male', 'renaissance-scholar': 'male', 'renaissance-captain': 'male',
        'industrial-heir': 'male', 'industrial-princess': 'female', 'industrial-officer': 'male',
        'industrialist': 'male', 'industrial-scientist': 'male', 'industrial-worker': 'male'
    });

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

    function portrait(id, family, atlas, column, row, label, tags, metadata = {}) {
        const identityCorpus = keyOf([id, label, ...tags].join(' '));
        const inferredGender = /\b(princess|principessa|queen|regina|empress|imperatrice|priestess|sacerdotessa|guaritrice|consigliera|nobildonna|ereditiera)\b/.test(identityCorpus)
            ? 'female'
            : /\b(prince|principe|king|re|emperor|imperatore|cavaliere|monaco|fabbro|locandiere|diplomatico|capitano|scienziato|lavoratore|investigatore|analista|dirigente|specialista|medico|studioso|mercante|artigiano|generale|senatore|scriba|contadino|ranger|industriale)\b/.test(identityCorpus)
                ? 'male'
                : 'any';
        return Object.freeze({
            id,
            family,
            atlas,
            image: `assets/portraits/${id}.webp`,
            column,
            row,
            label,
            tags: Object.freeze(tags.slice()),
            eras: Object.freeze((metadata.eras || [family === 'modern' ? 'modern' : 'medieval']).slice()),
            roles: Object.freeze((metadata.roles || ['generic']).slice()),
            genders: Object.freeze((metadata.genders || [VISUAL_GENDERS[id] || inferredGender]).slice()),
            backgroundSize: `${ATLAS_COLUMNS * 100}% ${ATLAS_ROWS * 100}%`,
            backgroundPosition: `${column === 0 ? 0 : column === ATLAS_COLUMNS - 1 ? 100 : 50}% ${row === 0 ? 0 : 100}%`
        });
    }

    const PORTRAITS = Object.freeze([
        portrait('chronicle-vanguard', 'chronicle', 'assets/portraits/chronicle-cast-v1.webp', 0, 0, 'Avanguardia',
            ['warrior', 'guerriero', 'knight', 'cavaliere', 'guard', 'guardia', 'ranger', 'ramingo', 'scout', 'soldier', 'fante'], { eras: ['medieval', 'fantasy', 'pirate'], roles: ['warrior', 'ranger'] }),
        portrait('chronicle-scholar', 'chronicle', 'assets/portraits/chronicle-cast-v1.webp', 1, 0, 'Studioso',
            ['scholar', 'studioso', 'diplomat', 'diplomatico', 'advisor', 'consigliere', 'mage', 'mago', 'cleric', 'chierico', 'mediator', 'orator'], { eras: ['medieval', 'fantasy', 'pirate'], roles: ['scholar', 'religious'] }),
        portrait('chronicle-merchant', 'chronicle', 'assets/portraits/chronicle-cast-v1.webp', 2, 0, 'Mercante',
            ['merchant', 'mercante', 'noble', 'nobile', 'leader', 'capo', 'courtier', 'cortigiano', 'emissary', 'emissario', 'negotiator'], { eras: ['medieval', 'fantasy', 'pirate'], roles: ['merchant', 'noble'] }),
        portrait('chronicle-corsair', 'chronicle', 'assets/portraits/chronicle-cast-v1.webp', 0, 1, 'Corsaro',
            ['rogue', 'ladro', 'outlaw', 'fuorilegge', 'pirate', 'pirata', 'corsair', 'corsaro', 'sailor', 'marinaio', 'spy', 'spia'], { eras: ['pirate'], roles: ['pirate'] }),
        portrait('chronicle-healer', 'chronicle', 'assets/portraits/chronicle-cast-v1.webp', 1, 1, 'Guaritrice',
            ['healer', 'guaritore', 'guaritrice', 'mystic', 'mistico', 'priest', 'sacerdote', 'cleric', 'chierico', 'elder', 'saggio', 'alchemist'], { eras: ['medieval', 'fantasy', 'pirate'], roles: ['healer', 'religious'] }),
        portrait('chronicle-artisan', 'chronicle', 'assets/portraits/chronicle-cast-v1.webp', 2, 1, 'Artigiano',
            ['artisan', 'artigiano', 'farmer', 'contadino', 'captain', 'capitano', 'worker', 'lavoratore', 'builder', 'costruttore', 'navigator', 'allevatore'], { eras: ['medieval', 'fantasy', 'pirate'], roles: ['artisan', 'commoner'] }),
        portrait('modern-investigator', 'modern', 'assets/portraits/modern-cast-v1.webp', 0, 0, 'Investigatore',
            ['investigator', 'investigatore', 'journalist', 'giornalista', 'detective', 'reporter', 'spy', 'spia', 'field agent', 'agente'], { eras: ['modern'], roles: ['investigator'] }),
        portrait('modern-analyst', 'modern', 'assets/portraits/modern-cast-v1.webp', 1, 0, 'Analista',
            ['analyst', 'analista', 'hacker', 'scientist', 'scienziato', 'coder', 'sviluppatore', 'technician', 'tecnico', 'controller'], { eras: ['modern'], roles: ['scholar'] }),
        portrait('modern-executive', 'modern', 'assets/portraits/modern-cast-v1.webp', 2, 0, 'Dirigente',
            ['executive', 'dirigente', 'manager', 'diplomat', 'diplomatico', 'official', 'funzionario', 'leader', 'ceo', 'fondatore', 'orator'], { eras: ['modern'], roles: ['executive', 'noble'] }),
        portrait('modern-specialist', 'modern', 'assets/portraits/modern-cast-v1.webp', 0, 1, 'Specialista',
            ['athlete', 'atleta', 'sportivo', 'player', 'giocatore', 'scout', 'ricognitore', 'driver', 'autista', 'infiltrator', 'infiltrato', 'operative'], { eras: ['modern'], roles: ['ranger', 'worker'] }),
        portrait('modern-medic', 'modern', 'assets/portraits/modern-cast-v1.webp', 1, 1, 'Medico',
            ['medic', 'medico', 'doctor', 'dottore', 'officer', 'ufficiale', 'military', 'militare', 'caregiver', 'soccorritore', 'veteran'], { eras: ['modern'], roles: ['healer', 'warrior'] }),
        portrait('modern-handler', 'modern', 'assets/portraits/modern-cast-v1.webp', 2, 1, 'Consigliera',
            ['handler', 'fixer', 'facilitatore', 'professor', 'professore', 'advisor', 'consigliere', 'mediator', 'mediatore', 'intelligence', 'diplomat'], { eras: ['modern'], roles: ['scholar', 'executive'] }),
        portrait('ancient-heir', 'chronicle', 'assets/portraits/antiquity-cast-v1.webp', 0, 0, 'Erede antico', ['prince', 'principe', 'heir', 'erede'], { eras: ['ancient'], roles: ['royal-heir'] }),
        portrait('ancient-queen', 'chronicle', 'assets/portraits/antiquity-cast-v1.webp', 1, 0, 'Regina antica', ['queen', 'regina', 'empress', 'imperatrice'], { eras: ['ancient'], roles: ['sovereign', 'royal-heir'] }),
        portrait('ancient-general', 'chronicle', 'assets/portraits/antiquity-cast-v1.webp', 2, 0, 'Generale antico', ['general', 'generale', 'commander', 'comandante'], { eras: ['ancient'], roles: ['warrior'] }),
        portrait('ancient-priestess', 'chronicle', 'assets/portraits/antiquity-cast-v1.webp', 0, 1, 'Sacerdotessa antica', ['priestess', 'sacerdotessa', 'oracle', 'oracolo'], { eras: ['ancient'], roles: ['religious', 'healer'] }),
        portrait('ancient-noble', 'chronicle', 'assets/portraits/antiquity-cast-v1.webp', 1, 1, 'Nobile antico', ['senator', 'senatore', 'noble', 'nobile'], { eras: ['ancient'], roles: ['noble', 'sovereign'] }),
        portrait('ancient-scholar', 'chronicle', 'assets/portraits/antiquity-cast-v1.webp', 2, 1, 'Sapiente antico', ['scholar', 'studioso', 'scribe', 'scriba'], { eras: ['ancient'], roles: ['scholar', 'artisan'] }),
        portrait('medieval-prince', 'chronicle', 'assets/portraits/medieval-court-v1.webp', 0, 0, 'Principe medievale', ['prince', 'principe', 'heir', 'erede'], { eras: ['medieval', 'fantasy'], roles: ['royal-heir'] }),
        portrait('medieval-princess', 'chronicle', 'assets/portraits/medieval-court-v1.webp', 1, 0, 'Principessa medievale', ['princess', 'principessa', 'heir', 'erede'], { eras: ['medieval', 'fantasy'], roles: ['royal-heir'] }),
        portrait('medieval-king', 'chronicle', 'assets/portraits/medieval-court-v1.webp', 2, 0, 'Re medievale', ['king', 're', 'sovereign', 'sovrano'], { eras: ['medieval', 'fantasy'], roles: ['sovereign'] }),
        portrait('medieval-queen', 'chronicle', 'assets/portraits/medieval-court-v1.webp', 0, 1, 'Regina medievale', ['queen', 'regina', 'sovereign', 'sovrana'], { eras: ['medieval', 'fantasy'], roles: ['sovereign'] }),
        portrait('medieval-knight', 'chronicle', 'assets/portraits/medieval-court-v1.webp', 1, 1, 'Cavaliere medievale', ['knight', 'cavaliere', 'commander', 'comandante'], { eras: ['medieval', 'fantasy'], roles: ['warrior'] }),
        portrait('medieval-diplomat', 'chronicle', 'assets/portraits/medieval-court-v1.webp', 2, 1, 'Diplomatico medievale', ['diplomat', 'diplomatico', 'advisor', 'consigliere'], { eras: ['medieval', 'fantasy'], roles: ['scholar', 'noble'] }),
        portrait('medieval-innkeeper', 'chronicle', 'assets/portraits/medieval-people-v1.webp', 0, 0, 'Locandiere', ['innkeeper', 'locandiere', 'host', 'oste'], { eras: ['medieval', 'fantasy'], roles: ['commoner', 'merchant'] }),
        portrait('medieval-blacksmith', 'chronicle', 'assets/portraits/medieval-people-v1.webp', 1, 0, 'Fabbro', ['blacksmith', 'fabbro', 'smith'], { eras: ['medieval', 'fantasy'], roles: ['artisan'] }),
        portrait('medieval-peasant', 'chronicle', 'assets/portraits/medieval-people-v1.webp', 2, 0, 'Contadino', ['peasant', 'contadino', 'farmer'], { eras: ['medieval', 'fantasy'], roles: ['commoner'] }),
        portrait('medieval-healer', 'chronicle', 'assets/portraits/medieval-people-v1.webp', 0, 1, 'Guaritrice del villaggio', ['healer', 'guaritrice', 'herbalist', 'erborista'], { eras: ['medieval', 'fantasy'], roles: ['healer'] }),
        portrait('medieval-monk', 'chronicle', 'assets/portraits/medieval-people-v1.webp', 1, 1, 'Monaco', ['monk', 'monaco', 'cleric', 'chierico', 'padre', 'frate', 'prete', 'sacerdote', 'vescovo', 'abate'], { eras: ['medieval', 'fantasy'], roles: ['religious', 'scholar'] }),
        portrait('medieval-ranger', 'chronicle', 'assets/portraits/medieval-people-v1.webp', 2, 1, 'Ranger', ['ranger', 'ramingo', 'scout', 'esploratore'], { eras: ['medieval', 'fantasy'], roles: ['ranger'] }),
        portrait('renaissance-prince', 'chronicle', 'assets/portraits/renaissance-cast-v1.webp', 0, 0, 'Principe rinascimentale', ['prince', 'principe', 'heir', 'erede'], { eras: ['renaissance'], roles: ['royal-heir'] }),
        portrait('renaissance-princess', 'chronicle', 'assets/portraits/renaissance-cast-v1.webp', 1, 0, 'Principessa rinascimentale', ['princess', 'principessa', 'noblewoman', 'nobildonna'], { eras: ['renaissance'], roles: ['royal-heir', 'noble'] }),
        portrait('renaissance-merchant', 'chronicle', 'assets/portraits/renaissance-cast-v1.webp', 2, 0, 'Banchiere rinascimentale', ['banker', 'banchiere', 'merchant', 'mercante'], { eras: ['renaissance'], roles: ['merchant', 'noble'] }),
        portrait('renaissance-diplomat', 'chronicle', 'assets/portraits/renaissance-cast-v1.webp', 0, 1, 'Diplomatico rinascimentale', ['diplomat', 'diplomatico', 'statesman', 'statista'], { eras: ['renaissance'], roles: ['noble', 'executive'] }),
        portrait('renaissance-scholar', 'chronicle', 'assets/portraits/renaissance-cast-v1.webp', 1, 1, 'Artista rinascimentale', ['artist', 'artista', 'scholar', 'studioso'], { eras: ['renaissance'], roles: ['scholar', 'artisan'] }),
        portrait('renaissance-captain', 'chronicle', 'assets/portraits/renaissance-cast-v1.webp', 2, 1, 'Capitano rinascimentale', ['captain', 'capitano', 'guard', 'guardia'], { eras: ['renaissance'], roles: ['warrior'] }),
        portrait('industrial-heir', 'chronicle', 'assets/portraits/industrial-cast-v1.webp', 0, 0, 'Erede aristocratico', ['prince', 'principe', 'heir', 'erede'], { eras: ['industrial'], roles: ['royal-heir', 'noble'] }),
        portrait('industrial-princess', 'chronicle', 'assets/portraits/industrial-cast-v1.webp', 1, 0, 'Principessa industriale', ['princess', 'principessa', 'heiress', 'ereditiera'], { eras: ['industrial'], roles: ['royal-heir', 'noble'] }),
        portrait('industrial-officer', 'chronicle', 'assets/portraits/industrial-cast-v1.webp', 2, 0, 'Ufficiale industriale', ['officer', 'ufficiale', 'military', 'militare'], { eras: ['industrial'], roles: ['warrior'] }),
        portrait('industrialist', 'chronicle', 'assets/portraits/industrial-cast-v1.webp', 0, 1, 'Industriale', ['industrialist', 'industriale', 'entrepreneur', 'imprenditore'], { eras: ['industrial'], roles: ['executive', 'merchant'] }),
        portrait('industrial-scientist', 'chronicle', 'assets/portraits/industrial-cast-v1.webp', 1, 1, 'Scienziato industriale', ['scientist', 'scienziato', 'doctor', 'medico'], { eras: ['industrial'], roles: ['scholar', 'healer'] }),
        portrait('industrial-worker', 'chronicle', 'assets/portraits/industrial-cast-v1.webp', 2, 1, 'Lavoratore industriale', ['worker', 'lavoratore', 'journalist', 'giornalista'], { eras: ['industrial'], roles: ['worker', 'commoner', 'investigator'] })
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

    function resolveEra(context = {}) {
        const story = context.story || {};
        const genre = keyOf(context.genre || story.genre);
        const setting = keyOf(context.setting || story.setting || story.description);
        const yearSources = [context.year, story.year, story.startYear, story.startTime?.year, story.startDate?.year, story.calendar?.year];
        const explicitYear = yearSources.map(Number).find(Number.isFinite);
        const embeddedYear = Number((setting.match(/\b([12]\d{3}|[1-9]\d{2})\b/) || [])[1]);
        const year = Number.isFinite(explicitYear) ? explicitYear : embeddedYear;
        if (/pirat|corsar|sailor|marinaio/.test(`${genre} ${setting}`)) return 'pirate';
        if (Number.isFinite(year)) {
            if (year < 600) return 'ancient';
            if (year >= 1400 && year < 1700) return 'renaissance';
            if (year >= 1700 && year < 1920) return 'industrial';
            if (year >= 1920) return 'modern';
            return 'medieval';
        }
        if (/antich|ancient|roma|roman|grec|ellen|egitt|faraon|mesopotam/.test(setting)) return 'ancient';
        if (/rinasc|renaissance|quattrocent|cinquecent/.test(setting)) return 'renaissance';
        if (/vittorian|victorian|ottocent|industr|belle epoque|western|risorgiment/.test(setting)) return 'industrial';
        if (/contempor|modern|business|cyber|sport|crime|odiern/.test(`${genre} ${setting}`)) return 'modern';
        if (/fantasy|medioevo|medieval|feud|castello|regno|cavaliere/.test(`${genre} ${setting}`)) return 'medieval';
        return genre === 'historical' ? 'medieval' : resolveFamily(context) === 'modern' ? 'modern' : 'medieval';
    }

    function resolveRole(entity, context = {}) {
        const corpus = entityCorpus(entity, context);
        if (/\b(prince|principe|princess|principessa|royal heir|erede al trono|erede reale|delfino)\b/.test(corpus)) return 'royal-heir';
        if (/\b(king|queen|re|regina|sovrano|sovrana|monarca|imperatore|imperatrice|emperor|empress)\b/.test(corpus)) return 'sovereign';
        if (/\b(pirate|pirata|corsair|corsaro|buccaneer|bucaniere|sailor|marinaio)\b/.test(corpus)) return 'pirate';
        if (/\b(priest|priestess|sacerdote|sacerdotessa|prete|padre|frate|monk|monaco|cleric|chierico|vescovo|abate|monsignor|oracle|oracolo)\b/.test(corpus)) return 'religious';
        if (/\b(healer|guaritore|guaritrice|medic|medico|doctor|dottore|herbalist|erborista)\b/.test(corpus)) return 'healer';
        if (/\b(knight|cavaliere|general|generale|soldier|soldato|guard|guardia|officer|ufficiale|captain|capitano|warrior|guerriero)\b/.test(corpus)) return 'warrior';
        if (/\b(ranger|ramingo|scout|esploratore|hunter|cacciatore)\b/.test(corpus)) return 'ranger';
        if (/\b(noble|nobile|nobildonna|duke|duca|duchess|duchessa|count|conte|baron|barone|courtier|cortigiano)\b/.test(corpus)) return 'noble';
        if (/\b(merchant|mercante|banker|banchiere|trader|commerciante|innkeeper|locandiere|oste)\b/.test(corpus)) return 'merchant';
        if (/\b(artisan|artigiano|blacksmith|fabbro|artist|artista|builder|costruttore)\b/.test(corpus)) return 'artisan';
        if (/\b(scholar|studioso|scientist|scienziato|scribe|scriba|diplomat|diplomatico|advisor|consigliere|professor|professore|mage|mago)\b/.test(corpus)) return 'scholar';
        if (/\b(executive|dirigente|manager|industrialist|industriale|entrepreneur|imprenditore|official|funzionario)\b/.test(corpus)) return 'executive';
        if (/\b(investigator|investigatore|detective|journalist|giornalista|spy|spia|agent|agente)\b/.test(corpus)) return 'investigator';
        if (/\b(worker|lavoratore|operaio|peasant|contadino|farmer|servant|servo|popolano)\b/.test(corpus)) return 'commoner';
        return 'generic';
    }

    function resolveGender(entity, context = {}) {
        const input = entity && typeof entity === 'object' ? entity : {};
        const declared = keyOf(input.gender || input.sex || input.pronouns || context.gender || context.sex || context.pronouns);
        if (/^(female|femmina|donna|she her|lei)$/.test(declared)) return 'female';
        if (/^(male|maschio|uomo|he him|lui)$/.test(declared)) return 'male';
        const corpus = entityCorpus(entity, context);
        if (/\b(princess|principessa|queen|regina|empress|imperatrice|priestess|sacerdotessa|woman|donna|female|femmina|madre|suora|sorella|badessa|signora|lady|guaritrice|nobildonna|duchessa|contessa|baronessa|ereditiera|dottoressa|fata|strega|maghetta|serva|ancella|cameriera|cuoca|tessitrice|ricamatrice|merce|contadinella|ragazza|bambina|figlia|nipote|zia|cugina|moglie|sposa|vedova|monaca|vergine|dama|ancella|nutrice|balia|levatrice|sarta|lavandaia)\b/.test(corpus)) return 'female';
        if (/\b(prince|principe|king|re|emperor|imperatore|man|uomo|male|maschio|padre|frate|prete|monsignor|vescovo|abate|don|signore|sir|lord|conte|duca|barone|dottore|knight|cavaliere|monk|monaco|blacksmith|fabbro|guardia|soldato|guerriero|mercenario|cacciatore|pescatore|contadino|servo|stalliere|scudiero|arciere|bandito|brigante|carceriere|boia| Nunzio|messo|araldo|notaio|giudice|magistrato|ciabattino|calzolaio|macellaio|fornaio|oste|locandiere|mercante|commerciante|artigiano|apprendista|maestro|maestro d'armi|precettore|tutore|precettore|chierico|chieraco|diacono|parroco|curato|eremita|pellegrino|crociato|templare|ospitaliere|teutonico|frate|frate mendicante|barbagianni|rapace)\b/.test(corpus)) return 'male';
        return 'any';
    }

    function getPortrait(id) {
        return PORTRAIT_BY_ID.get(cleanText(id, 80)) || null;
    }

    function listPortraits(context = {}) {
        const era = resolveEra(context);
        const matches = PORTRAITS.filter(item => item.eras.includes(era));
        return matches.length ? matches : PORTRAITS.filter(item => item.family === resolveFamily(context));
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

    function listCompatiblePortraits(entity, context = {}) {
        const input = entity && typeof entity === 'object' ? entity : { name: entity };
        const role = resolveRole(input, context);
        const gender = resolveGender(input, context);
        let candidates = listPortraits(context);
        const roleMatches = candidates.filter(item => item.roles.includes(role));
        if (roleMatches.length) candidates = roleMatches;
        else if (role !== 'generic') {
            const family = resolveFamily(context);
            const familyRoleMatches = PORTRAITS.filter(item => item.family === family && item.roles.includes(role));
            if (familyRoleMatches.length) candidates = familyRoleMatches;
        }
        else if (role === 'royal-heir') {
            const courtMatches = candidates.filter(item => item.roles.includes('sovereign') || item.roles.includes('noble'));
            if (courtMatches.length) candidates = courtMatches;
        } else if (role === 'sovereign') {
            const courtMatches = candidates.filter(item => item.roles.includes('royal-heir') || item.roles.includes('noble'));
            if (courtMatches.length) candidates = courtMatches;
        }
        if (role !== 'pirate') {
            const nonPirates = candidates.filter(item => !item.roles.includes('pirate'));
            if (nonPirates.length) candidates = nonPirates;
        }
        if (gender !== 'any') {
            const genderMatches = candidates.filter(item => item.genders.includes('any') || item.genders.includes(gender));
            if (genderMatches.length) candidates = genderMatches;
        }
        return candidates;
    }

    function choosePortrait(entity, context = {}) {
        const input = entity && typeof entity === 'object' ? entity : { name: entity };
        const explicit = getPortrait(input.portraitId || context.portraitId);
        const era = resolveEra(context);
        const role = resolveRole(input, context);
        const gender = resolveGender(input, context);
        let candidates = listCompatiblePortraits(input, context);
        if (explicit && candidates.some(item => item.id === explicit.id)) return explicit;
        if (!candidates.length) return PORTRAITS[0] || null;
        const corpus = entityCorpus(input, context);
        const scored = candidates.map(item => ({ item, score: roleScore(item, corpus) }));
        const bestScore = Math.max(...scored.map(entry => entry.score));
        const best = scored.filter(entry => entry.score === bestScore).map(entry => entry.item);
        const identity = keyOf(input.name || context.name || `${context.role || ''}|${context.archetype || ''}`) || 'protagonista';
        return best[hashNumber(`${identity}|${era}|${role}|${gender}|${bestScore}`) % best.length];
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
        resolveEra,
        resolveRole,
        resolveGender,
        getPortrait,
        listPortraits,
        listCompatiblePortraits,
        choosePortrait,
        assignPortrait,
        imageSrc,
        spriteStyle
    };
});
