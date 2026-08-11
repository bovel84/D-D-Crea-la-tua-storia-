(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheStoryGenerator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const GENRES = new Set([
        'fantasy', 'contemporary', 'sport', 'business', 'crime', 'historical',
        'military', 'diplomatic', 'rural', 'pirate', 'spy'
    ]);

    const BLUEPRINTS = {
        fantasy: ['Fantasy medievale', 'un potere antico si risveglia e altera gli equilibri del regno', 'una città di frontiera stretta tra rovine, foreste e rivalità', 'Evocativo, avventuroso e misterioso, con conseguenze concrete.', 'Fazioni, PNG e luoghi hanno obiettivi autonomi. Magia, politica e risorse seguono regole coerenti.'],
        contemporary: ['Mondo contemporaneo', 'un evento inatteso costringe il protagonista a cambiare vita', 'una città moderna piena di opportunità, pressioni economiche e relazioni', 'Realistico, umano e cinematografico, con dialoghi naturali.', 'Lavoro, denaro, famiglia, reputazione e rapporti personali evolvono nel tempo.'],
        sport: ['Sport professionistico contemporaneo', 'una squadra in difficoltà offre al protagonista una possibilità irripetibile', 'un ambiente sportivo competitivo tra campo, spogliatoio e dirigenza', 'Energico e realistico, alternando tensione agonistica e vita privata.', 'Prestazioni, allenamento, contratti, morale, rivalità e scelte societarie producono conseguenze.'],
        business: ['Economia e impresa contemporanea', 'una piccola attività con pochi mezzi può diventare un impero oppure fallire', 'un mercato vivo fatto di clienti, fornitori, concorrenti e istituzioni', 'Realistico e manageriale, con dialoghi naturali e rischi economici credibili.', 'Cassa, magazzino, contratti, personale, reputazione e concorrenza devono sempre restare coerenti.'],
        crime: ['Crime contemporaneo', 'un debito, un segreto e una proposta pericolosa trascinano il protagonista nel crimine', 'una città divisa tra quartieri, famiglie criminali e forze dell’ordine', 'Teso, noir e realistico, senza glorificare gratuitamente la violenza.', 'Le fazioni ricordano tradimenti e favori; denaro, prove, sospetti e reputazione hanno conseguenze.'],
        historical: ['Epoca storica', 'una crisi politica e sociale apre al protagonista una strada rischiosa verso il potere', 'una comunità storica coerente con istituzioni, mestieri e tecnologie dell’epoca', 'Storico, immersivo e concreto, evitando elementi anacronistici.', 'Ceto sociale, legge, religione, economia e rapporti di potere condizionano ogni scelta.'],
        military: ['Conflitto militare', 'una missione critica mette alla prova lealtà, comando e sopravvivenza', 'un fronte instabile con civili, reparti, logistica e intelligence', 'Teso e realistico, attento al costo umano delle decisioni.', 'Morale, ordini, risorse, terreno, catena di comando e conseguenze politiche restano persistenti.'],
        diplomatic: ['Intrigo politico e diplomatico', 'un equilibrio fragile tra potenze rischia di spezzarsi', 'una capitale dove ambasciate, fazioni e interessi economici si scontrano', 'Strategico, elegante e ricco di sottotesto.', 'Trattati, fiducia, informazioni, reputazione e rapporti tra fazioni cambiano in modo tracciabile.'],
        rural: ['Vita rurale e gestione agricola', 'una terra trascurata può rinascere, ma debiti e stagioni non aspettano', 'una comunità rurale legata a raccolti, mercati e famiglie', 'Caldo e realistico, con momenti di fatica, scoperta e comunità.', 'Stagioni, scorte, animali, lavoratori, debiti, clienti e fornitori evolvono concretamente.'],
        pirate: ['Età della vela e pirateria', 'una mappa incompleta promette ricchezza e attira nemici', 'un arcipelago di porti, rotte commerciali, imperi e isole inesplorate', 'Avventuroso, salmastro e imprevedibile.', 'Equipaggio, nave, provviste, reputazione, rotte e alleanze influenzano ogni viaggio.'],
        spy: ['Spionaggio internazionale', 'un’informazione rubata può impedire una crisi o provocarla', 'una rete di città, coperture, servizi segreti e doppi giochi', 'Teso, intelligente e cinematografico.', 'Coperture, prove, sospetti, contatti e obiettivi delle agenzie restano coerenti e persistenti.']
    };

    const START_PRESETS = {
        fantasy: { day: 1, month: 3, year: 1400, hour: 8, minute: 0 },
        contemporary: { day: 2, month: 5, year: 2024, hour: 9, minute: 0 },
        sport: { day: 15, month: 8, year: 2024, hour: 10, minute: 0 },
        business: { day: 2, month: 4, year: 2023, hour: 9, minute: 0 },
        crime: { day: 7, month: 10, year: 1986, hour: 22, minute: 0 },
        historical: { day: 2, month: 4, year: 1472, hour: 9, minute: 0 },
        military: { day: 1, month: 11, year: 1943, hour: 5, minute: 0 },
        diplomatic: { day: 10, month: 9, year: 2025, hour: 10, minute: 0 },
        rural: { day: 20, month: 4, year: 1890, hour: 6, minute: 0 },
        pirate: { day: 5, month: 7, year: 1720, hour: 14, minute: 0 },
        spy: { day: 3, month: 3, year: 1968, hour: 21, minute: 0 }
    };

    function clean(value, limit = 1200) {
        const text = String(value == null ? '' : value)
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return text.length > limit ? text.slice(0, limit).trim() : text;
    }

    function genreOf(value) {
        const key = clean(value, 40).toLowerCase();
        return GENRES.has(key) ? key : 'fantasy';
    }

    function blueprintFor(genre) {
        const values = BLUEPRINTS[genreOf(genre)] || BLUEPRINTS.fantasy;
        return { setting: values[0], hook: values[1], place: values[2], tone: values[3], depth: values[4] };
    }

    function inferStartTime(source = {}, genreValue) {
        const genre = genreOf(genreValue || source.genre);
        const explicit = source.startTime && typeof source.startTime === 'object' ? source.startTime : {};
        const explicitYear = Number(explicit.year);
        const combined = [source.setting, source.idea, source.desc, source.prologue]
            .map(value => clean(value, 2000)).filter(Boolean).join(' ');
        const historicalBusiness = genre === 'business' &&
            /\b(?:storico|medici|pazzi|signoria|rinascimento|rinascimentale|quattrocento|cinquecento|fiorini)\b/i.test(combined);
        const preset = { ...(START_PRESETS[historicalBusiness ? 'historical' : genre] || START_PRESETS.fantasy) };
        const years = combined.match(/\b(?:1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b/g) || [];
        const inferredYear = years.length ? Number(years[0]) : NaN;
        const year = Number.isFinite(explicitYear) && explicitYear >= 1000 && explicitYear <= 2199
            ? explicitYear
            : (Number.isFinite(inferredYear) ? inferredYear : preset.year);
        const integer = (value, fallback, min, max) => {
            const parsed = Math.trunc(Number(value));
            return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
        };
        return {
            day: integer(explicit.day, preset.day, 1, 31),
            month: integer(explicit.month, preset.month, 1, 12),
            year,
            hour: integer(explicit.hour, preset.hour, 0, 23),
            minute: integer(explicit.minute, preset.minute, 0, 59)
        };
    }

    function titleFrom(seed, blueprint) {
        const explicit = clean(seed.title, 100);
        if (explicit && !/^nuova storia$/i.test(explicit)) return explicit;
        const idea = clean(seed.idea || seed.desc, 100);
        if (idea) {
            const words = idea.replace(/[^\p{L}\p{N}\s'-]/gu, '').split(/\s+/).filter(Boolean).slice(0, 6);
            if (words.length) return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        }
        return `Cronache di ${blueprint.setting}`;
    }

    function normalizeProperty(raw, genre, index) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const name = clean(source.name, 100);
        if (!name) return null;
        const businessLike = genre === 'business' || genre === 'rural' ||
            /negozio|bottega|impresa|azienda|locanda|taverna|fattoria|studio|officina/i.test(name);
        return {
            id: clean(source.id, 120) || `generated-property-${Date.now()}-${index}`,
            name,
            description: clean(source.description, 300),
            notes: clean(source.notes, 300),
            type: clean(source.type, 40) || (businessLike ? 'business' : 'property'),
            condition: Math.max(0, Math.min(100, Number(source.condition) || 70)),
            baseValue: Math.max(0, Math.round(Number(source.baseValue) || 0)),
            income: Math.round(Number(source.income) || 0),
            businessCash: businessLike ? Math.max(0, Math.round(Number(source.businessCash) || 100)) : 0
        };
    }

    function createFallbackStory(seed = {}) {
        const genre = genreOf(seed.genre);
        const blueprint = blueprintFor(genre);
        const title = titleFrom(seed, blueprint);
        const setting = clean(seed.setting, 160) || blueprint.setting;
        const idea = clean(seed.idea || seed.desc, 700);
        const premise = idea || blueprint.hook;
        const properties = Array.isArray(seed.starterProperties)
            ? seed.starterProperties.map((item, index) => normalizeProperty(item, genre, index)).filter(Boolean)
            : [];
        return {
            title,
            setting,
            genre,
            difficulty: ['easy', 'normal', 'hard'].includes(seed.difficulty) ? seed.difficulty : 'normal',
            starterGold: Number.isFinite(Number(seed.starterGold)) ? Math.round(Number(seed.starterGold)) : 100,
            desc: clean(seed.desc, 1200) || `${setting}. ${premise}. La campagna si svolge in ${blueprint.place}. Il mondo reagisce alle decisioni del protagonista e continua a evolversi anche fuori scena.`,
            personality: clean(seed.personality, 800) || blueprint.tone,
            depth: clean(seed.depth, 1200) || `${blueprint.depth} Introduci obiettivi chiari, almeno tre fazioni o gruppi d’interesse e PNG con motivazioni indipendenti. Non regalare successi: applica costi, rischi e conseguenze.`,
            prologue: clean(seed.prologue, 1600) || `È l’inizio di una giornata destinata a cambiare tutto. Ti trovi in ${blueprint.place}: ${premise}. Un segnale concreto della crisi è già davanti a te, mentre due possibili strade richiedono una decisione immediata. Nessuno sceglierà al posto tuo.`,
            startTime: inferStartTime(seed, genre),
            starterProperties: properties
        };
    }

    function extractJson(response) {
        const text = String(response || '').trim();
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const first = text.indexOf('{');
        const last = text.lastIndexOf('}');
        const source = fenced ? fenced[1].trim() : (first >= 0 && last > first ? text.slice(first, last + 1) : '');
        if (!source) throw new Error('Il generatore non ha restituito una scheda JSON valida.');
        return JSON.parse(source);
    }

    function completeStory(input = {}, seed = {}) {
        const merged = { ...seed, ...input };
        const fallback = createFallbackStory(merged);
        const requestedTitle = clean(merged.title, 100);
        const properties = Array.isArray(merged.starterProperties)
            ? merged.starterProperties.map((item, index) => normalizeProperty(item, fallback.genre, index)).filter(Boolean)
            : fallback.starterProperties;
        return {
            ...fallback,
            title: requestedTitle && !/^nuova storia$/i.test(requestedTitle) ? requestedTitle : fallback.title,
            setting: clean(merged.setting, 160) || fallback.setting,
            desc: clean(merged.desc, 1200) || fallback.desc,
            personality: clean(merged.personality, 800) || fallback.personality,
            depth: clean(merged.depth, 1200) || fallback.depth,
            prologue: clean(merged.prologue, 1600) || fallback.prologue,
            startTime: inferStartTime(merged, fallback.genre),
            starterProperties: properties
        };
    }

    function parseGeneratedStory(response, seed = {}) {
        const generated = extractJson(response);
        return completeStory({
            ...generated,
            genre: genreOf(seed.genre || generated.genre)
        }, seed);
    }

    function buildGenerationPrompt(seed = {}) {
        const base = createFallbackStory(seed);
        return [
            'Crea una campagna completa e immediatamente giocabile per un GDR narrativo.',
            'Restituisci esclusivamente un oggetto JSON valido, senza markdown e senza commenti.',
            `Idea del giocatore: ${clean(seed.idea || seed.desc, 700) || 'nessuna idea aggiuntiva'}`,
            `Genere: ${base.genre}. Ambientazione richiesta: ${clean(seed.setting, 160) || base.setting}.`,
            `Difficoltà: ${base.difficulty}. Titolo suggerito: ${clean(seed.title, 100) || 'da inventare'}.`,
            'Campi obbligatori: title, setting, genre, difficulty, starterGold, desc, personality, depth, prologue, startTime, starterProperties.',
            'startTime deve essere un oggetto {"day":numero,"month":numero,"year":numero,"hour":numero,"minute":numero}. Scegli la data di calendario esatta della scena iniziale in base alla premessa e all’epoca; non usare l’anno reale corrente come riempitivo.',
            'desc deve fissare mondo, conflitto centrale, posta in gioco e almeno tre forze attive.',
            'depth deve imporre coerenza di PNG, fazioni, economia, tempo, proprietà e conseguenze.',
            'prologue deve essere una scena iniziale in seconda persona con luogo, problema concreto e una scelta aperta; non decidere per il protagonista.',
            'starterProperties è un array. Usalo solo se la premessa assegna davvero un bene; ogni elemento contiene name, description, notes, type, condition, baseValue, income e businessCash.',
            'Per negozi, imprese, fattorie, locande e attività usa type "business"; altrimenti "property".',
            'Non inserire tag meccanici nella scheda e non citare queste istruzioni.'
        ].join('\n');
    }

    return {
        GENRES,
        BLUEPRINTS,
        genreOf,
        START_PRESETS,
        inferStartTime,
        createFallbackStory,
        completeStory,
        parseGeneratedStory,
        buildGenerationPrompt
    };
});
