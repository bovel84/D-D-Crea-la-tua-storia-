(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheRealWorldBuilder = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 2;
    const PIPELINE_VERSION = 1;
    const STAGES = [
        { icon: '◈', label: 'Definisco canone ed epoca', status: 'Fisso canone, epoca e regole del mondo...' },
        { icon: '⌖', label: 'Ricostruisco luoghi e città', status: 'Ricostruisco geografia, città e luoghi utili...' },
        { icon: '⚜', label: 'Organizzo poteri e fazioni', status: 'Definisco istituzioni, economia e fazioni...' },
        { icon: '♙', label: 'Diamo vita agli abitanti', status: 'Creo NPC, ruoli, obiettivi e reti sociali...' },
        { icon: '⟷', label: 'Intreccio relazioni e conflitti', status: 'Collego relazioni e forze già in movimento...' },
        { icon: '✓', label: 'Verifico la coerenza', status: 'Controllo riferimenti, epoca e continuità...' },
        { icon: '⚑', label: 'Il mondo compie la prima mossa', status: 'Il mondo è pronto e può iniziare ad agire...' }
    ];

    const CENTRAL_ITALY_ANCHORS = [
        { name: 'Roma', region: 'Lazio', x: 535, y: 500 },
        { name: 'Firenze', region: 'Toscana', x: 430, y: 245 },
        { name: 'Perugia', region: 'Umbria', x: 535, y: 330 },
        { name: 'Ancona', region: 'Marche', x: 695, y: 315 },
        { name: 'Siena', region: 'Toscana', x: 445, y: 335 },
        { name: 'Arezzo', region: 'Toscana', x: 500, y: 285 },
        { name: 'Terni', region: 'Umbria', x: 560, y: 405 },
        { name: 'Viterbo', region: 'Lazio', x: 500, y: 435 },
        { name: 'Urbino', region: 'Marche', x: 625, y: 240 },
        { name: 'Pesaro', region: 'Marche', x: 650, y: 215 },
        { name: 'Lucca', region: 'Toscana', x: 360, y: 220 },
        { name: 'Rieti', region: 'Lazio', x: 590, y: 430 },
        { name: 'Orvieto', region: 'Umbria', x: 505, y: 375 },
        { name: 'Fermo', region: 'Marche', x: 705, y: 360 },
        { name: 'Grosseto', region: 'Toscana', x: 390, y: 405 },
        { name: 'Pistoia', region: 'Toscana', x: 395, y: 230 },
        { name: 'Prato', region: 'Toscana', x: 415, y: 235 },
        { name: 'Ascoli Piceno', region: 'Marche', x: 690, y: 405 }
    ];

    const REAL_WORLD_CUES = [
        /\bitalia\b|\bitaly\b|\bitaliano\b|\bitaliana\b/,
        /\bfrancia\b|\bfrance\b|\bgermania\b|\bgermany\b|\bspagna\b|\bspain\b|\bportogallo\b|\bportugal\b/,
        /\bregno unito\b|\bunited kingdom\b|\binghilterra\b|\bengland\b|\bscozia\b|\bscotland\b|\birlanda\b|\bireland\b/,
        /\bstati uniti\b|\bunited states\b|\busa\b|\bcanada\b|\bmessico\b|\bmexico\b/,
        /\bbrasile\b|\bbrazil\b|\bargentina\b|\bcile\b|\bchile\b|\bperu\b|\bcolombia\b/,
        /\bgrecia\b|\bgreece\b|\bturchia\b|\bturkey\b|\begitto\b|\begypt\b|\bisraele\b|\bisrael\b/,
        /\bpolonia\b|\bpoland\b|\bucraina\b|\bukraine\b|\brussia\b|\bromania\b|\bungheria\b|\bhungary\b/,
        /\bcina\b|\bchina\b|\bgiappone\b|\bjapan\b|\bindia\b|\baustralia\b|\bnuova zelanda\b|\bnew zealand\b/,
        /\beuropa\b|\beurope\b|\bafrica\b|\basia\b|\bmedio oriente\b|\bmiddle east\b/,
        /\broma\b|\bfirenze\b|\bperugia\b|\bancona\b|\bmilano\b|\btorino\b|\bnapoli\b|\bvenezia\b|\bbologna\b|\bcagliari\b/,
        /\btoscana\b|\bumbria\b|\bmarche\b|\blazio\b|\babruzzo\b|\bsardegna\b|\bsicilia\b|\blombardia\b|\bpiemonte\b|\bveneto\b/
    ];
    const CENTRAL_ITALY_RE = /\bitalia\s+centrale\b|\bcentro\s+italia\b|\bcentral\s+italy\b|\btoscana\b|\bumbria\b|\bmarche\b|\blazio\b|\broma\b|\bfirenze\b|\bperugia\b|\bancona\b|\bsiena\b|\burbino\b|\bviterbo\b/;

    function clean(value, max = 1600) {
        return String(value == null ? '' : value)
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, max);
    }

    function keyOf(value) {
        return clean(value, 1800)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9\s_-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function asArray(value) { return Array.isArray(value) ? value : []; }

    function hashText(value) {
        let hash = 2166136261;
        const text = String(value || '');
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function startYear(story = {}) {
        const year = Number(story?.startTime?.year);
        return Number.isFinite(year) && year !== 0 ? Math.trunc(year) : null;
    }

    function storyText(story = {}, context = {}) {
        return clean([
            story.title, story.setting, story.desc, story.prologue, story.depth,
            story.worldBlueprint?.scope?.primaryArea,
            ...asArray(story.worldBlueprint?.scope?.secondaryAreas),
            context.idea, context.setting
        ].filter(Boolean).join(' '), 10000);
    }

    function normalizeMode(value) {
        const mode = keyOf(value);
        if (/alternate|ucroni|storia alternativa|alt history/.test(mode)) return 'alternate_history';
        if (/real|reale|histor/.test(mode)) return 'real_world';
        if (/fiction|fittiz|invent|fantasy/.test(mode)) return 'fictional';
        return '';
    }

    function inferRealityProfile(story = {}, context = {}) {
        const explicit = story.worldBlueprint?.reality && typeof story.worldBlueprint.reality === 'object'
            ? story.worldBlueprint.reality : {};
        const source = keyOf(storyText(story, context));
        const explicitMode = normalizeMode(explicit.mode);
        const centralItaly = CENTRAL_ITALY_RE.test(source);
        const hasRealCue = centralItaly || REAL_WORLD_CUES.some(pattern => pattern.test(source));
        const alternateCue = /ucroni|storia alternativa|alternate history|what if|divergenza storica/.test(source);
        const mode = explicitMode || (hasRealCue ? (alternateCue ? 'alternate_history' : 'real_world') : 'fictional');
        const year = startYear(story);
        const canonicalArea = clean(explicit.canonicalArea, 220)
            || (centralItaly ? 'Italia centrale' : clean(story.setting || context.setting, 220));
        return {
            mode,
            isReal: mode === 'real_world' || mode === 'alternate_history',
            isAlternate: mode === 'alternate_history',
            centralItaly,
            canonicalArea,
            year,
            geographyPolicy: mode === 'fictional' ? 'generative' : 'preserve_canonical_geography',
            politicsPolicy: mode === 'fictional'
                ? 'world_defined'
                : year && year < 1861 ? 'boundaries_and_institutions_as_of_start_date' : 'institutions_as_of_start_date',
            npcPolicy: mode === 'fictional'
                ? 'world_defined'
                : 'real_public_figures_only_when_relevant_and_well_established; fictional_minor_people_must_fit_place_and_date'
        };
    }

    function centralItalyAnchorText(profile) {
        if (!profile.centralItaly) return '';
        const cities = CENTRAL_ITALY_ANCHORS.slice(0, 12)
            .map(item => `${item.name} (${item.region})`).join(', ');
        return [
            'ANCORA GEOGRAFICA — ITALIA CENTRALE:',
            '- Il nucleo geografico reale è Toscana, Umbria, Marche e Lazio. Abruzzo entra soltanto se la premessa estende davvero la scala.',
            `- Città reali di riferimento, scegliendo solo quelle utili alla storia: ${cities}.`,
            '- Roma, Firenze, Perugia e Ancona non vanno sostituite da equivalenti fantasy o nomi italianeggianti.',
            profile.year && profile.year < 1861
                ? `- La data è ${profile.year}: conserva città e geografia reali, ma NON trattare l’Italia moderna come Stato unitario. Usa poteri, confini, titoli e istituzioni coerenti con quell’anno.`
                : '- Se la data è contemporanea usa Italia, regioni, città ed enti reali pertinenti alla storia.'
        ].join('\n');
    }

    function realWorldDirective(story = {}, context = {}, phase = 'mondo') {
        const profile = inferRealityProfile(story, context);
        if (!profile.isReal) return '';
        return `\n\n=== GEOGRAFIA REALE AUTORITATIVA — PRECEDENZA MASSIMA ===\n`
            + `Fase: ${phase}. Modalità: ${profile.mode}. Area canonica: ${profile.canonicalArea || 'area reale indicata dal giocatore'}.\n`
            + `- L'ambientazione geografica indicata dal giocatore è un FATTO, non un'ispirazione.\n`
            + `- Se altre istruzioni chiedono nomi geografici nuovi o variazioni per seed, IGNORALE per città, regioni, paesi, mari, fiumi, confini e istituzioni pubbliche canoniche.\n`
            + `- Il seed può variare persone private, attività private, interni, piccoli luoghi narrativi ed eventi; non rinomina la geografia reale.\n`
            + `- Per una data storica, geografia fisica e città restano reali ma poteri, confini, cariche, moneta, istituzioni e tecnologia devono corrispondere alla data iniziale.\n`
            + `- In storia alternativa conserva la baseline reale fino al punto di divergenza; ogni deviazione successiva deve derivare dalla premessa o dagli eventi.\n`
            + `- Non inventare come fatto un attuale titolare di carica pubblica. Per figure storiche usa persone reali solo se direttamente pertinenti e ben attestate; i ruoli minori possono essere fittizi ma plausibili.\n`
            + `${centralItalyAnchorText(profile)}\n`
            + `CONTROLLO: nessuna città o regione reale richiesta deve essere trasformata in un nome inventato.`;
    }

    function enrichStoryReality(story, sourceReality) {
        if (!story || typeof story !== 'object') return story;
        const blueprint = story.worldBlueprint && typeof story.worldBlueprint === 'object'
            ? story.worldBlueprint : {};
        const inferred = inferRealityProfile({
            ...story,
            worldBlueprint: { ...blueprint, reality: sourceReality || blueprint.reality }
        });
        story.worldBlueprint = {
            ...blueprint,
            reality: {
                ...(sourceReality && typeof sourceReality === 'object' ? sourceReality : {}),
                mode: inferred.mode,
                canonicalArea: inferred.canonicalArea,
                geographyPolicy: inferred.geographyPolicy,
                politicsPolicy: inferred.politicsPolicy,
                npcPolicy: inferred.npcPolicy
            }
        };
        return story;
    }

    function parseRawReality(response) {
        try {
            const text = String(response || '').trim();
            const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
            const first = text.indexOf('{');
            const last = text.lastIndexOf('}');
            const source = fenced ? fenced[1].trim() : (first >= 0 && last > first ? text.slice(first, last + 1) : '');
            return source ? JSON.parse(source)?.worldBlueprint?.reality || null : null;
        } catch (_error) {
            return null;
        }
    }

    const MODERN_FIRST = ['Marco','Giulia','Luca','Elena','Andrea','Francesca','Matteo','Sara','Davide','Chiara','Paolo','Martina','Stefano','Alessia','Simone','Valentina','Federico','Ilaria'];
    const HISTORICAL_FIRST = ['Lorenzo','Caterina','Tommaso','Ginevra','Bartolomeo','Beatrice','Niccolò','Lucrezia','Pietro','Maddalena','Bernardo','Costanza','Giovanni','Antonia'];
    const ITALIAN_LAST = ['Rossi','Bianchi','Conti','Ricci','Moretti','De Angelis','Ferri','Galli','Marini','Leoni','Benedetti','Serra','Neri','Mancini','Rinaldi','Bellini','Santini','Orsini'];

    function localNpcName(seed, index, historical) {
        const firstPool = historical ? HISTORICAL_FIRST : MODERN_FIRST;
        const first = firstPool[hashText(`${seed}|first|${index}`) % firstPool.length];
        const last = ITALIAN_LAST[hashText(`${seed}|last|${index}`) % ITALIAN_LAST.length];
        return `${first} ${last}`;
    }

    function npcProfiles(genre, historical) {
        if (historical) return [
            { role: 'notaio', goal: 'proteggere validità e valore degli atti', strategy: 'documenti, testimonianze e relazioni civiche', resources: 'atti, clienti e conoscenza delle consuetudini' },
            { role: 'mercante', goal: 'mantenere accesso a credito e mercati', strategy: 'contratti, lettere di cambio e reti commerciali', resources: 'capitale, merci e corrispondenti' },
            { role: 'artigiano di corporazione', goal: 'difendere lavoro, bottega e reputazione', strategy: 'rete professionale e pressione corporativa', resources: 'maestranze, competenza e contatti di mestiere' },
            { role: 'funzionario civico', goal: 'far rispettare competenze e decisioni dell’autorità', strategy: 'procedure, registri e mandato pubblico', resources: 'accesso agli uffici e informazioni amministrative' },
            { role: 'religioso locale', goal: 'preservare influenza e coesione della comunità', strategy: 'mediazione e rete assistenziale', resources: 'fiducia sociale e istituzioni religiose' },
            { role: 'capitano o ufficiale', goal: 'garantire sicurezza secondo il proprio mandato', strategy: 'uomini, pattuglie e controllo dei passaggi', resources: 'forza armata e autorità operativa' }
        ];
        if (genre === 'business') return [
            { role: 'imprenditore concorrente', goal: 'difendere quota di mercato e margini', strategy: 'prezzi, relazioni commerciali e reputazione', resources: 'clienti, liquidità e contatti' },
            { role: 'funzionario amministrativo', goal: 'far rispettare procedure e requisiti', strategy: 'istruttorie, autorizzazioni e controlli', resources: 'accesso agli atti e competenze procedurali' },
            { role: 'responsabile bancario', goal: 'contenere il rischio e mantenere il rapporto economico', strategy: 'credito, garanzie e condizioni contrattuali', resources: 'finanziamenti e informazioni finanziarie' },
            { role: 'fornitore', goal: 'aumentare ordini affidabili e ridurre insoluti', strategy: 'tempi di consegna, sconti e condizioni di pagamento', resources: 'merce, logistica e rete commerciale' },
            { role: 'cliente chiave', goal: 'ottenere convenienza e affidabilità', strategy: 'scelta del fornitore e passaparola', resources: 'domanda, reputazione e relazioni locali' },
            { role: 'consulente professionale', goal: 'proteggere il cliente da errori e costi evitabili', strategy: 'analisi, documentazione e negoziazione', resources: 'competenza tecnica e rete professionale' }
        ];
        return [
            { role: 'funzionario locale', goal: 'gestire un problema concreto del territorio', strategy: 'procedure e coordinamento istituzionale', resources: 'informazioni e accesso amministrativo' },
            { role: 'professionista', goal: 'difendere reputazione e interessi dei propri clienti', strategy: 'competenza e relazioni', resources: 'conoscenze tecniche e rete professionale' },
            { role: 'imprenditore locale', goal: 'far crescere la propria attività', strategy: 'investimenti e relazioni commerciali', resources: 'capitale e contatti' },
            { role: 'giornalista locale', goal: 'ottenere informazioni verificabili e rilevanti', strategy: 'fonti, interviste e verifica', resources: 'rete di fonti e visibilità pubblica' },
            { role: 'rappresentante associativo', goal: 'tutelare gli interessi del proprio gruppo', strategy: 'mobilitazione e negoziazione', resources: 'aderenti e consenso locale' },
            { role: 'residente con interesse diretto', goal: 'proteggere famiglia, lavoro o proprietà', strategy: 'relazioni di quartiere e iniziativa personale', resources: 'conoscenza del territorio e legami sociali' }
        ];
    }

    function replaceText(value, replacements) {
        if (typeof value !== 'string') return value;
        let result = value;
        [...replacements.entries()]
            .sort((a, b) => String(b[0]).length - String(a[0]).length)
            .forEach(([from, to]) => {
                if (from && to && from !== to) result = result.split(from).join(to);
            });
        return result;
    }

    function rewriteObject(target, replacements, excluded = new Set()) {
        if (!target || typeof target !== 'object') return;
        Object.keys(target).forEach(field => {
            if (excluded.has(field)) return;
            const value = target[field];
            if (typeof value === 'string') target[field] = replaceText(value, replacements);
            else if (Array.isArray(value)) {
                target[field] = value.map(item => typeof item === 'string' ? replaceText(item, replacements) : item);
            }
        });
    }

    function isFallbackWorld(world) {
        return asArray(world?.locations).some(item => /^fresh-loc-|^loc-\d+/i.test(String(item?.id || '')))
            || asArray(world?.actors).some(item => /fallback-npc/i.test(String(item?.source || '')));
    }

    function factionAnchors(profile, count, genre) {
        const historical = profile.year && profile.year < 1861;
        const historicalNames = ['Repubblica di Firenze', 'Stato Pontificio', 'Ducato di Urbino', 'Repubblica di Siena'];
        const modernNames = genre === 'business'
            ? ['Comune di Roma', 'Comune di Firenze', 'Comune di Perugia', 'Comune di Ancona']
            : ['Regione Lazio', 'Regione Toscana', 'Regione Umbria', 'Regione Marche'];
        return (historical ? historicalNames : modernNames).slice(0, Math.max(0, count));
    }

    function applyCentralItalyFallback(world, story = {}, context = {}) {
        const profile = inferRealityProfile(story, context);
        if (!profile.centralItaly || !isFallbackWorld(world)) return world;
        const locations = asArray(world.locations);
        const factions = asArray(world.factions);
        const actors = asArray(world.actors).filter(actor => /fallback-npc/i.test(String(actor?.source || '')));
        const locationMap = new Map();

        locations.forEach((location, index) => {
            if (location?.name) locationMap.set(location.name, CENTRAL_ITALY_ANCHORS[index % CENTRAL_ITALY_ANCHORS.length].name);
        });

        const geographicalNation = profile.year && profile.year < 1861 ? 'Italia centrale (area geografica)' : 'Italia';
        locations.forEach((location, index) => {
            const anchor = CENTRAL_ITALY_ANCHORS[index % CENTRAL_ITALY_ANCHORS.length];
            location.name = anchor.name;
            location.region = anchor.region;
            location.nation = geographicalNation;
            location.continent = 'Europa';
            location.type = location.type === 'village' ? 'city' : (location.type || 'city');
            location.x = anchor.x;
            location.y = anchor.y;
            location.id = `real-loc-${keyOf(anchor.name).replace(/\s+/g, '-')}`;
            if (Array.isArray(location.connections)) location.connections = location.connections.map(value => locationMap.get(value) || value);
            rewriteObject(location, locationMap, new Set(['name','id','connections','region','nation','continent']));
            location.source = 'real-world-fallback';
        });
        world.startLocation = locationMap.get(world.startLocation) || locations[0]?.name || world.startLocation;
        world.name = profile.canonicalArea || 'Italia centrale';
        world.setting = clean(story.setting || world.setting || 'Italia centrale', 180);

        const factionMap = new Map();
        const names = factionAnchors(profile, factions.length, keyOf(story.genre));
        factions.forEach((faction, index) => {
            const oldName = faction.name;
            const nextName = names[index]
                || (profile.year && profile.year < 1861
                    ? `Potere territoriale di ${locations[index % Math.max(1, locations.length)]?.name || 'Italia centrale'}`
                    : `Comune di ${locations[index % Math.max(1, locations.length)]?.name || 'Roma'}`);
            if (oldName) factionMap.set(oldName, nextName);
            faction.name = nextName;
            faction.base = locations[index % Math.max(1, locations.length)]?.name || faction.base;
            faction.location = faction.base;
            faction.territory = locations[index % Math.max(1, locations.length)]?.region || faction.territory;
            faction.id = `real-fac-${keyOf(nextName).replace(/\s+/g, '-')}`;
            faction.source = 'real-world-fallback';
        });
        factions.forEach(faction => {
            rewriteObject(faction, locationMap, new Set(['name','id','base','location','territory']));
            rewriteObject(faction, factionMap, new Set(['name','id']));
        });

        const profiles = npcProfiles(keyOf(story.genre), Boolean(profile.year && profile.year < 1900));
        const npcMap = new Map();
        const seed = clean(context.worldGenerationSeed || world.generationSeed || `${story.setting}|${story.title}`, 240);
        actors.forEach((actor, index) => {
            const oldName = actor.name;
            const nextName = localNpcName(seed, index, Boolean(profile.year && profile.year < 1900));
            if (oldName) npcMap.set(oldName, nextName);
            const role = profiles[index % profiles.length];
            actor.name = nextName;
            actor.role = role.role;
            actor.goal = role.goal;
            actor.publicGoal = role.goal;
            actor.privateGoal = `proteggere un interesse personale legato a ${actor.location || locations[index % Math.max(1, locations.length)]?.name || 'Italia centrale'}`;
            actor.strategy = role.strategy;
            actor.agenda = role.strategy;
            actor.resources = role.resources;
            actor.leverage = role.resources;
            actor.location = locationMap.get(actor.location) || locations[index % Math.max(1, locations.length)]?.name || actor.location;
            actor.faction = factionMap.get(actor.faction) || actor.faction;
            actor.description = `${nextName} è ${role.role} e opera a ${actor.location}.`;
            actor.knowledge = `Conosce persone, procedure e interessi pertinenti a ${actor.location}.`;
            actor.constraints = `Opera entro i vincoli reali del luogo e dell'anno ${profile.year || 'della campagna'}.`;
            actor.id = `real-npc-${hashText(`${seed}|${nextName}`).toString(36)}`;
            actor.fictional = true;
            actor.source = 'real-world-fallback-npc';
        });

        const allMap = new Map([...locationMap, ...factionMap, ...npcMap]);
        asArray(world.relations).forEach(relation => {
            relation.from = allMap.get(relation.from) || relation.from;
            relation.to = allMap.get(relation.to) || relation.to;
            rewriteObject(relation, allMap, new Set(['from','to','id']));
        });
        asArray(world.forces).forEach(force => {
            force.actor = allMap.get(force.actor) || force.actor;
            force.faction = allMap.get(force.faction) || force.faction;
            force.location = allMap.get(force.location) || force.location;
            rewriteObject(force, allMap, new Set(['actor','faction','location','id']));
        });
        actors.forEach(actor => rewriteObject(actor, allMap, new Set(['name','id','location','faction'])));

        const grouped = new Map();
        locations.forEach(location => {
            if (!grouped.has(location.region)) grouped.set(location.region, []);
            grouped.get(location.region).push(location.name);
        });
        world.hierarchy = {
            continents: [{
                name: 'Europa',
                nations: [{
                    name: geographicalNation,
                    government: profile.year && profile.year < 1861
                        ? 'Assetto politico storico coerente con la data iniziale'
                        : 'Repubblica Italiana',
                    controllingFaction: '',
                    regions: [...grouped.entries()].map(([name, locationNames]) => ({ name, terrain: 'urban', locationNames }))
                }]
            }]
        };
        world.historicalContext = {
            ...(world.historicalContext || {}),
            date: profile.year ? String(profile.year) : clean(world.historicalContext?.date, 120),
            region: 'Italia centrale',
            politicalSystem: profile.year && profile.year < 1861
                ? 'Usare Stati, comuni, repubbliche, signorie e poteri realmente esistenti alla data iniziale; Italia è un riferimento geografico.'
                : 'Repubblica Italiana con regioni ed enti locali reali pertinenti alla storia.',
            divergencePolicy: profile.isAlternate
                ? 'Conservare la baseline reale fino alla divergenza dichiarata; poi registrare ogni cambiamento causale.'
                : 'La geografia reale non cambia senza un evento esplicito.'
        };
        world.reality = { ...profile, anchors: locations.map(item => item.name) };
        return world;
    }

    function patchStoryGenerator() {
        const storyApi = root.CronacheStoryGenerator;
        if (!storyApi || storyApi.__realWorldFidelityPatchVersion >= PATCH_VERSION) return;

        if (typeof storyApi.buildGenerationPrompt === 'function') {
            const original = storyApi.buildGenerationPrompt.bind(storyApi);
            storyApi.buildGenerationPrompt = function realAwareStoryPrompt(seed = {}) {
                const base = original(seed);
                const profile = inferRealityProfile(seed);
                const schema = profile.isReal
                    ? `\nNel worldBlueprint aggiungi anche "reality": {"mode":"${profile.mode}","canonicalArea":"${profile.canonicalArea || clean(seed.setting, 180)}","geographyPolicy":"preserve_canonical_geography","politicsPolicy":"${profile.politicsPolicy}","npcPolicy":"personaggi coerenti con luogo e data"}.`
                    : '\nNel worldBlueprint aggiungi "reality": {"mode":"fictional","canonicalArea":"","geographyPolicy":"generative","politicsPolicy":"world_defined","npcPolicy":"world_defined"}.';
                return `${base}${schema}${realWorldDirective(seed, {}, 'Crea storia IA')}`;
            };
        }
        if (typeof storyApi.createFallbackStory === 'function') {
            const original = storyApi.createFallbackStory.bind(storyApi);
            storyApi.createFallbackStory = seed => enrichStoryReality(original(seed || {}));
        }
        if (typeof storyApi.completeStory === 'function') {
            const original = storyApi.completeStory.bind(storyApi);
            storyApi.completeStory = function realAwareCompleteStory(input = {}, seed = {}) {
                return enrichStoryReality(original(input, seed), input?.worldBlueprint?.reality || seed?.worldBlueprint?.reality);
            };
        }
        if (typeof storyApi.parseGeneratedStory === 'function') {
            const original = storyApi.parseGeneratedStory.bind(storyApi);
            storyApi.parseGeneratedStory = function realAwareParsedStory(response, seed = {}) {
                return enrichStoryReality(original(response, seed), parseRawReality(response));
            };
        }
        storyApi.inferRealityProfile = inferRealityProfile;
        storyApi.__realWorldFidelityPatchVersion = PATCH_VERSION;
    }

    function patchWorldGenerator() {
        const generator = root.CronacheWorldGenerator;
        if (!generator || generator.__realWorldFidelityPatchVersion >= PATCH_VERSION) return;

        ['buildGenerationPrompt', 'buildLocationsPrompt'].forEach(method => {
            if (typeof generator[method] !== 'function') return;
            const original = generator[method].bind(generator);
            generator[method] = function realAwareWorldPrompt(story, context = {}) {
                return `${original(story, context)}${realWorldDirective(story || {}, context, method === 'buildLocationsPrompt' ? 'geografia/fazioni' : 'mondo completo')}`;
            };
        });

        if (typeof generator.buildNpcPrompt === 'function') {
            const original = generator.buildNpcPrompt.bind(generator);
            generator.buildNpcPrompt = function realAwareNpcPrompt(world, story, context = {}) {
                const profile = inferRealityProfile(story || {}, context);
                const cast = profile.isReal
                    ? `\nNPC REALI/PLAUSIBILI:\n- Gli NPC devono appartenere ai luoghi reali già generati e avere nomi, mestieri, reti sociali, conoscenze e risorse coerenti con lingua, città e anno.\n- Non usare il cast Nobile/Comandante/Mercante/Sacerdote se il contesto non lo richiede.\n- In contemporaneo crea normalmente persone private fittizie ma plausibili; non inventare come fatto un titolare attuale di carica pubblica.\n- In storico usa una figura reale soltanto se direttamente pertinente e ben attestata; i minori possono essere fittizi ma devono rispettare ceto, mestiere e cultura.\n`
                    : '';
                return `${original(world, story, context)}${realWorldDirective(story || {}, context, 'NPC')}${cast}`;
            };
        }

        if (typeof generator.generateFallbackNpcs === 'function') {
            const original = generator.generateFallbackNpcs.bind(generator);
            generator.generateFallbackNpcs = function realAwareFallbackNpcs(world, context = {}) {
                const result = original(world, context);
                return applyCentralItalyFallback(result && typeof result === 'object' ? result : world, context.story || {}, context);
            };
        }

        generator.inferRealityProfile = inferRealityProfile;
        generator.applyCentralItalyFallback = applyCentralItalyFallback;
        generator.__realWorldFidelityPatchVersion = PATCH_VERSION;
    }

    function getGameState() {
        try {
            if (typeof G !== 'undefined') return G;
        } catch (_error) { }
        return root.G || null;
    }

    function configureProgressUi() {
        if (typeof document === 'undefined') return;
        const host = document.querySelector('.story-intro-progress');
        if (!host || host.dataset.pipelineVersion === String(PIPELINE_VERSION)) return;
        host.dataset.pipelineVersion = String(PIPELINE_VERSION);
        host.setAttribute('aria-label', 'Costruzione progressiva del mondo');
        host.innerHTML = STAGES.map((item, index) =>
            `<div class="story-intro-step${index === 0 ? ' active' : ''}" data-intro-stage="${index}"><i>${item.icon}</i><span>${item.label}</span></div>`
        ).join('');
    }

    function setStage(index, status) {
        configureProgressUi();
        if (typeof document !== 'undefined') {
            document.querySelectorAll('.story-intro-step').forEach((step, stepIndex) => {
                step.classList.toggle('active', stepIndex === index);
                step.classList.toggle('done', stepIndex < index);
            });
            const statusNode = document.getElementById('story-intro-status');
            if (statusNode) statusNode.textContent = status || STAGES[index]?.status || '';
        }
        try {
            if (typeof root.setStoryIntroStage === 'function') root.setStoryIntroStage(index, status || STAGES[index]?.status);
        } catch (_error) { }
    }

    function storyCanon(story = {}) {
        const storyApi = root.CronacheStoryGenerator;
        if (storyApi && typeof storyApi.storyBlueprintSummary === 'function') {
            try { return clean(storyApi.storyBlueprintSummary(story), 18000); } catch (_error) { }
        }
        return [
            `Titolo: ${clean(story.title, 160)}`,
            `Genere: ${clean(story.genre, 80)}`,
            `Ambientazione: ${clean(story.setting, 240)}`,
            `Data: ${story.startTime ? `${story.startTime.day || 1}/${story.startTime.month || 1}/${story.startTime.year || ''}` : ''}`,
            `Premessa: ${clean(story.desc, 1800)}`,
            `Prologo: ${clean(story.prologue, 2200)}`,
            `Profondità: ${clean(story.depth, 1800)}`
        ].filter(Boolean).join('\n');
    }

    function extractJson(response) {
        const generator = root.CronacheWorldGenerator;
        if (generator && typeof generator.extractWorldJson === 'function') return generator.extractWorldJson(response);
        const text = String(response || '').trim();
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const candidate = fenced ? fenced[1].trim() : text;
        const first = candidate.indexOf('{');
        const last = candidate.lastIndexOf('}');
        if (first < 0 || last <= first) throw new Error('Risposta JSON incompleta');
        return JSON.parse(candidate.slice(first, last + 1));
    }

    async function requestAi(messages, options) {
        if (typeof root.requestConfiguredAI === 'function') return root.requestConfiguredAI(messages, options);
        try {
            if (typeof requestConfiguredAI === 'function') return requestConfiguredAI(messages, options);
        } catch (_error) { }
        throw new Error('requestConfiguredAI non disponibile');
    }

    async function callJsonPhase(name, prompt, options = {}) {
        let lastError = null;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const strictSuffix = attempt
                    ? '\n\nRETRY DI RIPARAZIONE: la risposta precedente non era JSON valido/completo. Restituisci soltanto il JSON richiesto, senza markdown, senza commenti, chiudi tutti gli array e non aggiungere campi estranei.'
                    : '';
                const response = await requestAi([
                    { role: 'system', content: 'Sei un world-builder strutturale per un GDR persistente. Rispetta il canone ricevuto e restituisci esclusivamente JSON valido e completo.' },
                    { role: 'user', content: `${prompt}${strictSuffix}` }
                ], {
                    task: options.task || 'world-generation',
                    maxTokens: options.maxTokens || 3200,
                    timeoutMs: options.timeoutMs || 120000,
                    temperature: attempt ? 0.25 : (options.temperature ?? 0.65)
                });
                return extractJson(response);
            } catch (error) {
                lastError = error;
                console.warn(`[WorldPipeline] ${name} tentativo ${attempt + 1} fallito:`, error);
            }
        }
        throw lastError || new Error(`${name} fallita`);
    }

    function geographySummary(geo) {
        const lines = [];
        asArray(geo?.continents).forEach(continent =>
            asArray(continent.nations).forEach(nation =>
                asArray(nation.regions).forEach(region =>
                    asArray(region.locations).forEach(location => {
                        lines.push(`${clean(location.name, 120)} | ${clean(region.name, 100)} | ${clean(nation.name, 100)} | ${clean(location.type, 60)} | ${clean(location.description, 220)}`);
                    })
                )
            )
        );
        return lines.slice(0, 24).join('\n');
    }

    function factionSummary(data) {
        return asArray(data?.factions).slice(0, 12).map(f =>
            `${clean(f.name, 120)} | tipo=${clean(f.type, 70)} | base=${clean(f.base, 100)} | territorio=${clean(f.territory, 100)} | obiettivo=${clean(f.goal, 220)} | risorse=${clean(f.resources, 180)}`
        ).join('\n');
    }

    function npcSummary(data) {
        return asArray(data?.npcs).slice(0, 20).map(n =>
            `${clean(n.name, 120)} | ruolo=${clean(n.role, 100)} | luogo=${clean(n.location, 100)} | fazione=${clean(n.faction, 100)} | pubblico=${clean(n.publicGoal || n.goal, 180)} | privato=${clean(n.privateGoal, 180)}`
        ).join('\n');
    }

    function buildFoundationPrompt(story, context = {}) {
        return `FASE 1/6 — CANONE, EPOCA E REGOLE DEL MONDO.\n\n${storyCanon(story)}${realWorldDirective(story, context, 'fondazione')}\n\nRestituisci:\n{\n "worldName":"string",\n "premise":"string",\n "centralConflict":"string",\n "stakes":"string",\n "scope":{"scale":"string","primaryArea":"string","secondaryAreas":["string"],"travelLogic":"string"},\n "historicalContext":{"date":"string","region":"string","politicalSystem":"string","economy":"string","law":"string","socialStructure":"string","technology":"string","cultureReligion":"string","baseline":"string","activeTensions":"string","constraints":"string","divergencePolicy":"string"},\n "generationRules":["5-12 regole concrete che le fasi successive non possono contraddire"]\n}\nNon creare ancora città, fazioni o NPC. Se il luogo è reale, stabilisci la baseline reale della data indicata; non inventare uno Stato moderno in un'epoca precedente.`;
    }

    function buildGeographyPrompt(story, foundation, context = {}) {
        return `FASE 2/6 — GEOGRAFIA E LUOGHI.\nCANONE:\n${storyCanon(story)}\nFONDAZIONE APPROVATA:\n${JSON.stringify(foundation)}${realWorldDirective(story, context, 'geografia')}\n\nCrea SOLO la geografia necessaria alla storia. 8-16 luoghi utili sono preferibili a una mappa enorme. Ogni luogo deve avere una funzione di gioco. Per geografia reale usa città/regioni reali e aggiungi luoghi privati inventati solo come sottoluoghi plausibili.\nRestituisci:\n{\n "continents":[{"name":"string","nations":[{"name":"string","government":"string","controllingFaction":"","regions":[{"name":"string","terrain":"forest|mountain|plains|coast|desert|wetland|urban|tundra|volcanic","locations":[{"name":"string","type":"city|village|castle|port|temple|fortress|market|mine|farm|tavern|ruins|camp|monastery|bridge|crossroads","x":0,"y":0,"description":"string","resource":"string","danger":"string","connections":["nome luogo"]}]}]}]}],\n "startLocation":"nome esatto di un luogo esistente"\n}\nLe connessioni devono riferirsi solo a luoghi inclusi.`;
    }

    function buildFactionPrompt(story, foundation, geography, context = {}) {
        return `FASE 3/6 — ISTITUZIONI, ECONOMIA E FAZIONI.\nCANONE:\n${storyCanon(story)}\nFONDAZIONE:\n${JSON.stringify(foundation)}\nLUOGHI APPROVATI:\n${geographySummary(geography)}${realWorldDirective(story, context, 'fazioni e istituzioni')}\n\nCrea 3-7 fazioni/organizzazioni soltanto se hanno una funzione concreta nel conflitto. In una storia business storica possono essere banche, casate, arti/corporazioni, autorità civiche, poteri territoriali, creditori o reti mercantili coerenti con la data; non usare automaticamente regni o gilde fantasy.\nRestituisci:\n{"factions":[{"name":"string","type":"kingdom|republic|guild|cult|tribe|corporation|military|criminal|rebellion","leader":"string","ideology":"string","base":"luogo esatto","territory":"nazione o regione esatta","description":"string","goal":"string","strategy":"string","resources":"string","influence":0,"militaryStrength":0,"intelligence":0,"hostility":0,"legitimacy":0,"tactics":"string","grievance":"string","nextMove":"string","relationship":"string"}]}\nOgni base deve essere un luogo esistente e ogni territorio una nazione/regione esistente.`;
    }

    function buildNpcPhasePrompt(story, foundation, geography, factions, context = {}) {
        const profile = inferRealityProfile(story, context);
        return `FASE 4/6 — NPC E RETI SOCIALI.\nCANONE:\n${storyCanon(story)}\nFONDAZIONE:\n${JSON.stringify(foundation)}\nLUOGHI:\n${geographySummary(geography)}\nFAZIONI:\n${factionSummary(factions)}${realWorldDirective(story, context, 'NPC')}\n\nCrea 8-16 NPC che rendano giocabile la storia. Ogni NPC deve avere un ruolo causale, un luogo esatto, interessi autonomi e una ragione per conoscere o influenzare altri soggetti. Almeno 3 devono poter agire senza il protagonista e almeno 4 devono essere direttamente collegati al conflitto iniziale.\n${profile.isReal ? '- In mondo reale: nomi, mestieri, ceto, reti e conoscenze coerenti con città e anno. Figure pubbliche reali solo se pertinenti e sicure; persone minori normalmente fittizie ma plausibili.' : ''}\nRestituisci:\n{"npcs":[{"name":"string","role":"string","faction":"nome fazione o vuoto","location":"nome luogo esatto","description":"string","personality":"string","goal":"string","publicGoal":"string","privateGoal":"string","strategy":"string","resources":"string","influence":0,"knowledge":"string","agenda":"string","leverage":"string","constraints":"string","relationship":"string","gender":"string"}]}`;
    }

    function buildDynamicsPrompt(story, foundation, geography, factions, npcs, context = {}) {
        return `FASE 5/6 — RELAZIONI E FORZE IN MOVIMENTO.\nCANONE:\n${storyCanon(story)}\nFONDAZIONE:\n${JSON.stringify(foundation)}\nLUOGHI:\n${geographySummary(geography)}\nFAZIONI:\n${factionSummary(factions)}\nNPC:\n${npcSummary(npcs)}${realWorldDirective(story, context, 'relazioni e dinamiche')}\n\nCrea relazioni concrete e processi già attivi prima del primo turno. Non creare una seconda trama scollegata. Le forze devono poter produrre eventi futuri ma non devono risolversi da sole immediatamente.\nRestituisci:\n{\n "relations":[{"from":"NPC o fazione esistente","to":"NPC o fazione esistente","type":"string","trust":0,"tension":0,"description":"string"}],\n "forces":[{"name":"string","actor":"NPC o fazione esistente","objective":"string","progress":0,"urgency":0,"cause":"string","opposition":["NPC o fazione esistente"],"consequenceAt100":"string"}]\n}\nGenera 6-14 relazioni e 3-6 forze, tutte collegate a interessi già presenti.`;
    }

    function buildAuditPrompt(story, raw, context = {}) {
        const locations = [];
        asArray(raw.continents).forEach(c => asArray(c.nations).forEach(n => asArray(n.regions).forEach(r =>
            asArray(r.locations).forEach(l => locations.push(l.name))
        )));
        return `FASE 6/6 — AUDIT STRUTTURALE. Non riscrivere il mondo.\nCANONE: ${clean(story.desc, 900)} | ${clean(story.setting, 260)} | anno ${startYear(story) || 'non specificato'}.\nLUOGHI: ${locations.join(', ')}\nFAZIONI: ${asArray(raw.factions).map(x => x.name).join(', ')}\nNPC: ${asArray(raw.npcs).map(x => `${x.name}@${x.location}`).join(', ')}\nSTART: ${raw.startLocation}\n${realWorldDirective(story, context, 'audit')}\n\nControlla riferimenti e coerenza. Restituisci solo correzioni necessarie, senza inventare nuove trame:\n{\n "startLocation":"nome valido o vuoto se già valido",\n "npcRepairs":[{"name":"NPC esistente","location":"luogo valido","faction":"fazione valida o vuoto"}],\n "factionRepairs":[{"name":"fazione esistente","base":"luogo valido","territory":"nazione/regione valida"}],\n "locationRepairs":[{"name":"luogo esistente","connections":["solo luoghi validi"]}],\n "dropRelations":[{"from":"string","to":"string"}],\n "notes":["massimo 8 problemi verificati"]\n}\nSe non serve una correzione usa array vuoti e startLocation vuoto.`;
    }

    function buildPhasePrompts(story, data = {}, context = {}) {
        return {
            foundation: buildFoundationPrompt(story, context),
            geography: buildGeographyPrompt(story, data.foundation || {}, context),
            factions: buildFactionPrompt(story, data.foundation || {}, data.geography || {}, context),
            npcs: buildNpcPhasePrompt(story, data.foundation || {}, data.geography || {}, data.factions || {}, context),
            dynamics: buildDynamicsPrompt(story, data.foundation || {}, data.geography || {}, data.factions || {}, data.npcs || {}, context)
        };
    }

    function assembleWorld(story, foundation, geography, factions, npcs, dynamics) {
        return {
            worldName: clean(foundation?.worldName, 120) || clean(story?.setting || story?.title, 120) || 'Mondo della campagna',
            premise: clean(foundation?.premise, 600) || clean(story?.desc, 600),
            centralConflict: clean(foundation?.centralConflict, 420) || clean(story?.worldBlueprint?.centralConflict || story?.desc, 420),
            stakes: clean(foundation?.stakes, 320) || clean(story?.worldBlueprint?.stakes, 320),
            continents: asArray(geography?.continents),
            factions: asArray(factions?.factions),
            npcs: asArray(npcs?.npcs),
            relations: asArray(dynamics?.relations),
            forces: asArray(dynamics?.forces),
            startLocation: clean(geography?.startLocation, 120)
        };
    }

    function applyAudit(raw, audit) {
        if (!raw || typeof raw !== 'object' || !audit || typeof audit !== 'object') return raw;
        const locations = new Map();
        const regions = new Set();
        const nations = new Set();
        asArray(raw.continents).forEach(c => asArray(c.nations).forEach(n => {
            nations.add(keyOf(n.name));
            asArray(n.regions).forEach(r => {
                regions.add(keyOf(r.name));
                asArray(r.locations).forEach(l => locations.set(keyOf(l.name), l));
            });
        }));
        const factions = new Map(asArray(raw.factions).map(f => [keyOf(f.name), f]));
        const npcs = new Map(asArray(raw.npcs).map(n => [keyOf(n.name), n]));

        if (audit.startLocation && locations.has(keyOf(audit.startLocation))) raw.startLocation = audit.startLocation;
        asArray(audit.npcRepairs).forEach(repair => {
            const npc = npcs.get(keyOf(repair?.name));
            if (!npc) return;
            if (repair.location && locations.has(keyOf(repair.location))) npc.location = repair.location;
            if (repair.faction === '') npc.faction = '';
            else if (repair.faction && factions.has(keyOf(repair.faction))) npc.faction = repair.faction;
        });
        asArray(audit.factionRepairs).forEach(repair => {
            const faction = factions.get(keyOf(repair?.name));
            if (!faction) return;
            if (repair.base && locations.has(keyOf(repair.base))) faction.base = repair.base;
            if (repair.territory && (regions.has(keyOf(repair.territory)) || nations.has(keyOf(repair.territory)))) faction.territory = repair.territory;
        });
        asArray(audit.locationRepairs).forEach(repair => {
            const location = locations.get(keyOf(repair?.name));
            if (!location || !Array.isArray(repair.connections)) return;
            location.connections = repair.connections.filter(name => locations.has(keyOf(name)) && keyOf(name) !== keyOf(location.name));
        });
        const drops = new Set(asArray(audit.dropRelations).map(item => `${keyOf(item?.from)}|${keyOf(item?.to)}`));
        raw.relations = asArray(raw.relations).filter(rel => !drops.has(`${keyOf(rel?.from)}|${keyOf(rel?.to)}`));
        return raw;
    }

    function setCheckpoint(state, stageIndex, payload = {}) {
        if (!state) return;
        state.worldMemory = state.worldMemory && typeof state.worldMemory === 'object' ? state.worldMemory : {};
        const existing = state.worldMemory.worldGenerationPipeline || {};
        state.worldMemory.worldGenerationPipeline = {
            ...existing,
            version: PIPELINE_VERSION,
            status: stageIndex >= STAGES.length - 1 ? 'ready' : 'building',
            stage: stageIndex,
            stageLabel: STAGES[stageIndex]?.label || '',
            completedStages: Math.max(Number(existing.completedStages) || 0, stageIndex),
            updatedAt: new Date().toISOString(),
            counts: {
                locations: Number(payload.locations || existing.counts?.locations || 0),
                factions: Number(payload.factions || existing.counts?.factions || 0),
                npcs: Number(payload.npcs || existing.counts?.npcs || 0),
                relations: Number(payload.relations || existing.counts?.relations || 0),
                forces: Number(payload.forces || existing.counts?.forces || 0)
            }
        };
    }

    function countLocations(geo) {
        let count = 0;
        asArray(geo?.continents).forEach(c => asArray(c.nations).forEach(n => asArray(n.regions).forEach(r => { count += asArray(r.locations).length; })));
        return count;
    }

    function safeUiRefresh() {
        ['updateMemoryUI','updateInfoPanels','renderNPCRegistry','renderWorldMap'].forEach(name => {
            try { if (typeof root[name] === 'function') root[name](); } catch (error) { console.warn(`[WorldPipeline] ${name} fallita:`, error); }
        });
    }

    function patchGameWorldPipeline() {
        if (typeof document === 'undefined' || root.__cronacheMultiPhaseWorldPipelineVersion >= PIPELINE_VERSION) return false;
        const originalGenerate = typeof root.generateGameWorld === 'function' ? root.generateGameWorld : null;
        const generator = root.CronacheWorldGenerator;
        const bootstrap = root.CronacheWorldBootstrap;
        if (!originalGenerate || !generator || !bootstrap) return false;

        root.generateGameWorld = async function multiPhaseGenerateGameWorld() {
            const state = getGameState();
            const story = state?.currentStory;
            if (!state || !story) return originalGenerate();

            configureProgressUi();
            const worldCtx = {
                story,
                turn: Math.max(0, Number(state.worldMemory?.turnCount) || 0),
                currentDate: state.time ? `${state.time.day || 1}/${state.time.month || 1}/${state.time.year || startYear(story) || ''}` : '',
                setting: story.setting || '',
                protagonistName: state.character?.name || '',
                idea: story.desc || '',
                worldGenerationSeed: state.worldMemory?.worldGenerationSeed || ''
            };

            try {
                setStage(0, STAGES[0].status);
                const foundation = await callJsonPhase('fondazione', buildFoundationPrompt(story, worldCtx), {
                    maxTokens: 2200, temperature: 0.45
                });
                setCheckpoint(state, 0);

                setStage(1, STAGES[1].status);
                const geography = await callJsonPhase('geografia', buildGeographyPrompt(story, foundation, worldCtx), {
                    maxTokens: 4200, temperature: 0.55
                });
                setCheckpoint(state, 1, { locations: countLocations(geography) });

                setStage(2, STAGES[2].status);
                const factions = await callJsonPhase('fazioni', buildFactionPrompt(story, foundation, geography, worldCtx), {
                    maxTokens: 3400, temperature: 0.55
                });
                setCheckpoint(state, 2, { locations: countLocations(geography), factions: asArray(factions.factions).length });

                setStage(3, STAGES[3].status);
                const npcs = await callJsonPhase('npc', buildNpcPhasePrompt(story, foundation, geography, factions, worldCtx), {
                    task: 'world-npcs', maxTokens: 5600, temperature: 0.68
                });
                setCheckpoint(state, 3, {
                    locations: countLocations(geography),
                    factions: asArray(factions.factions).length,
                    npcs: asArray(npcs.npcs).length
                });

                setStage(4, STAGES[4].status);
                const dynamics = await callJsonPhase('relazioni e forze', buildDynamicsPrompt(story, foundation, geography, factions, npcs, worldCtx), {
                    maxTokens: 3800, temperature: 0.58
                });
                let raw = assembleWorld(story, foundation, geography, factions, npcs, dynamics);
                setCheckpoint(state, 4, {
                    locations: countLocations(geography),
                    factions: raw.factions.length,
                    npcs: raw.npcs.length,
                    relations: raw.relations.length,
                    forces: raw.forces.length
                });

                setStage(5, STAGES[5].status);
                try {
                    const audit = await callJsonPhase('audit', buildAuditPrompt(story, raw, worldCtx), {
                        maxTokens: 2200, temperature: 0.2
                    });
                    raw = applyAudit(raw, audit);
                } catch (auditError) {
                    console.warn('[WorldPipeline] Audit LLM non disponibile, uso validazione deterministica:', auditError);
                }

                if (typeof generator.autoFix === 'function') raw = generator.autoFix(raw);
                const validation = typeof generator.validateHierarchy === 'function'
                    ? generator.validateHierarchy(raw) : { errors: [], warnings: [] };
                if (validation.warnings?.length) console.info('[WorldPipeline] Avvisi finali:', validation.warnings);
                if (validation.errors?.length) console.warn('[WorldPipeline] Errori finali:', validation.errors);

                let normalized = generator.normalizeGeneratedWorld(raw, worldCtx);
                const profile = inferRealityProfile(story, worldCtx);
                if (profile.centralItaly) {
                    const known = new Set(CENTRAL_ITALY_ANCHORS.map(item => keyOf(item.name)));
                    const hits = asArray(normalized.locations).filter(item => known.has(keyOf(item.name))).length;
                    if (hits === 0 && asArray(normalized.locations).length) {
                        normalized.locations.forEach((location, index) => {
                            if (index >= CENTRAL_ITALY_ANCHORS.length) return;
                            const anchor = CENTRAL_ITALY_ANCHORS[index];
                            location.name = anchor.name;
                            location.region = anchor.region;
                            location.nation = profile.year && profile.year < 1861 ? 'Italia centrale (area geografica)' : 'Italia';
                            location.continent = 'Europa';
                            location.x = anchor.x;
                            location.y = anchor.y;
                        });
                        normalized.startLocation = normalized.locations[0]?.name || normalized.startLocation;
                        normalized.reality = { ...profile, repairedAfterGeneration: true };
                    }
                }

                state.worldMemory = bootstrap.projectToMemory(normalized, state.worldMemory, worldCtx);
                setCheckpoint(state, 5, {
                    locations: asArray(normalized.locations).length,
                    factions: asArray(normalized.factions).length,
                    npcs: asArray(normalized.actors).length,
                    relations: asArray(normalized.relations).length,
                    forces: asArray(normalized.forces).length
                });
                safeUiRefresh();

                setStage(6, STAGES[6].status);
                setCheckpoint(state, 6, {
                    locations: asArray(normalized.locations).length,
                    factions: asArray(normalized.factions).length,
                    npcs: asArray(normalized.actors).length,
                    relations: asArray(normalized.relations).length,
                    forces: asArray(normalized.forces).length
                });
                console.info(`[WorldPipeline] Completato: ${asArray(normalized.locations).length} luoghi, ${asArray(normalized.factions).length} fazioni, ${asArray(normalized.actors).length} NPC, ${asArray(normalized.relations).length} relazioni, ${asArray(normalized.forces).length} forze.`);
                return normalized;
            } catch (error) {
                console.error('[WorldPipeline] Pipeline progressiva fallita, ritorno al generatore compatibile:', error);
                setCheckpoint(state, 0);
                return originalGenerate();
            }
        };

        root.__cronacheMultiPhaseWorldPipelineVersion = PIPELINE_VERSION;
        configureProgressUi();
        return true;
    }

    function install() {
        patchStoryGenerator();
        patchWorldGenerator();
        if (root.CronacheCampaign) root.CronacheCampaign.inferRealityProfile = inferRealityProfile;
        if (typeof document !== 'undefined') {
            if (!patchGameWorldPipeline()) {
                setTimeout(patchGameWorldPipeline, 0);
                setTimeout(patchGameWorldPipeline, 100);
                setTimeout(patchGameWorldPipeline, 500);
            }
        }
    }

    install();

    return {
        PATCH_VERSION,
        PIPELINE_VERSION,
        STAGES,
        CENTRAL_ITALY_ANCHORS,
        inferRealityProfile,
        realWorldDirective,
        enrichStoryReality,
        applyCentralItalyFallback,
        buildFoundationPrompt,
        buildGeographyPrompt,
        buildFactionPrompt,
        buildNpcPhasePrompt,
        buildDynamicsPrompt,
        buildAuditPrompt,
        buildPhasePrompts,
        assembleWorld,
        applyAudit,
        install
    };
});