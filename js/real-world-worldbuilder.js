(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheRealWorldBuilder = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
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

    function clean(value, max = 1200) {
        return String(value == null ? '' : value)
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, max);
    }

    function keyOf(value) {
        return clean(value, 1200)
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

    function storyText(story = {}, context = {}) {
        return clean([
            story.title,
            story.setting,
            story.desc,
            story.prologue,
            story.depth,
            story.worldBlueprint?.scope?.primaryArea,
            ...asArray(story.worldBlueprint?.scope?.secondaryAreas),
            context.idea,
            context.setting
        ].filter(Boolean).join(' '), 9000);
    }

    function startYear(story = {}) {
        const year = Number(story?.startTime?.year);
        return Number.isFinite(year) && year !== 0 ? Math.trunc(year) : null;
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
            ? story.worldBlueprint.reality
            : {};
        const explicitMode = normalizeMode(explicit.mode);
        const source = keyOf(storyText(story, context));
        const centralItaly = CENTRAL_ITALY_RE.test(source);
        const hasRealCue = centralItaly || REAL_WORLD_CUES.some(pattern => pattern.test(source));
        const alternateCue = /ucroni|storia alternativa|alternate history|what if|divergenza storica/.test(source);
        const mode = explicitMode || (hasRealCue ? (alternateCue ? 'alternate_history' : 'real_world') : 'fictional');
        const year = startYear(story);
        const canonicalArea = clean(explicit.canonicalArea, 220) || (centralItaly ? 'Italia centrale' : clean(story.setting || context.setting, 220));
        return {
            mode,
            isReal: mode === 'real_world' || mode === 'alternate_history',
            isAlternate: mode === 'alternate_history',
            centralItaly,
            canonicalArea,
            year,
            geographyPolicy: 'preserve_canonical_geography',
            politicsPolicy: year && year < 1861 ? 'boundaries_and_institutions_as_of_start_date' : 'institutions_as_of_start_date',
            npcPolicy: 'real_public_figures_only_when_relevant_and_well_established; fictional_minor_people_must_fit_place_and_date'
        };
    }

    function centralItalyAnchorText(profile) {
        if (!profile.centralItaly) return '';
        const cities = CENTRAL_ITALY_ANCHORS.slice(0, 12).map(item => `${item.name} (${item.region})`).join(', ');
        return [
            'ANCORA GEOGRAFICA — ITALIA CENTRALE:',
            '- Il nucleo geografico reale è Toscana, Umbria, Marche e Lazio. Abruzzo può entrare soltanto se la premessa estende esplicitamente la scala verso sud-est.',
            `- Città reali da usare come riferimenti, scegliendo quelle utili alla storia: ${cities}.`,
            '- Roma non va sostituita da una capitale inventata; Firenze, Perugia e Ancona non vanno sostituite da equivalenti fantasy.',
            profile.year && profile.year < 1861
                ? `- La data è ${profile.year}: conserva città e geografia reali, ma NON trattare l’Italia moderna come Stato unitario. Usa poteri, confini, titoli e istituzioni coerenti con quell’anno.`
                : '- Se la data è contemporanea usa Italia come Stato reale e regioni/città reali; non inventare regioni amministrative sostitutive.'
        ].join('\n');
    }

    function realWorldDirective(story = {}, context = {}, phase = 'mondo') {
        const profile = inferRealityProfile(story, context);
        if (!profile.isReal) return '';
        return `\n\n=== GEOGRAFIA REALE AUTORITATIVA — PRECEDENZA MASSIMA ===\n` +
            `Fase: ${phase}. Modalità: ${profile.mode}. Area canonica: ${profile.canonicalArea || 'area reale indicata dal giocatore'}.\n` +
            `- Se una precedente istruzione dice di inventare nomi nuovi, variare la geografia o creare un mondo riconoscibilmente diverso per seed, IGNORALA per città, regioni, paesi, mari, fiumi, istituzioni pubbliche e confini canonici.\n` +
            `- L'ambientazione geografica indicata dal giocatore è un FATTO, non un'ispirazione. Non creare un equivalente fantasy, un paese sostitutivo o una città dal nome italianeggiante al posto di una città reale.\n` +
            `- Il seed può variare soltanto personaggi privati inventati, attività private, interni, piccoli luoghi narrativi ed eventi; non deve rinominare la geografia reale.\n` +
            `- Ricostruisci la scala richiesta con luoghi reali e con relazioni spaziali plausibili. Se la storia è locale, non espandere inutilmente la mappa.\n` +
            `- Per una data storica, geografia fisica e città restano reali ma poteri politici, confini, cariche, moneta, istituzioni e tecnologie devono corrispondere alla data iniziale.\n` +
            `- In una storia alternativa conserva la baseline geografica e istituzionale reale fino al punto di divergenza; ogni deviazione successiva deve derivare dalla premessa o dagli eventi di gioco.\n` +
            `- Puoi inventare un negozio, una casa, una società privata o un personaggio minore se serve alla storia, ma deve essere collocato dentro la geografia reale e non sostituire un'entità pubblica reale attesa.\n` +
            `- Non inventare come fatto il nome di un attuale titolare di carica pubblica se non è già nel canone della storia. Per figure storiche usa persone reali soltanto quando sono direttamente pertinenti e sufficientemente note; per ruoli minori crea personaggi fittizi ma plausibili per luogo, lingua, ceto e anno.\n` +
            `${centralItalyAnchorText(profile)}\n` +
            `CONTROLLO: prima di restituire il JSON verifica che nessuna città o regione reale richiesta sia stata trasformata in un nome inventato.`;
    }

    function enrichStoryReality(story, sourceReality) {
        if (!story || typeof story !== 'object') return story;
        const inferred = inferRealityProfile({ ...story, worldBlueprint: { ...(story.worldBlueprint || {}), reality: sourceReality || story.worldBlueprint?.reality } });
        const blueprint = story.worldBlueprint && typeof story.worldBlueprint === 'object' ? story.worldBlueprint : {};
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
            const source = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
            const parsed = JSON.parse(source);
            return parsed?.worldBlueprint?.reality || null;
        } catch (_error) {
            return null;
        }
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
                    ? `\nNel worldBlueprint aggiungi obbligatoriamente anche: "reality": {"mode":"${profile.mode}","canonicalArea":"${profile.canonicalArea || clean(seed.setting, 180)}","geographyPolicy":"preserve_canonical_geography","politicsPolicy":"${profile.politicsPolicy}","npcPolicy":"personaggi coerenti con luogo e data"}.`
                    : '\nNel worldBlueprint aggiungi "reality": {"mode":"fictional","canonicalArea":"","geographyPolicy":"generative","politicsPolicy":"world_defined","npcPolicy":"world_defined"}.';
                return `${base}${schema}${realWorldDirective(seed, {}, 'Crea storia IA')}`;
            };
        }

        if (typeof storyApi.createFallbackStory === 'function') {
            const original = storyApi.createFallbackStory.bind(storyApi);
            storyApi.createFallbackStory = function realAwareFallbackStory(seed = {}) {
                return enrichStoryReality(original(seed));
            };
        }

        if (typeof storyApi.completeStory === 'function') {
            const original = storyApi.completeStory.bind(storyApi);
            storyApi.completeStory = function realAwareCompleteStory(input = {}, seed = {}) {
                const sourceReality = input?.worldBlueprint?.reality || seed?.worldBlueprint?.reality;
                return enrichStoryReality(original(input, seed), sourceReality);
            };
        }

        if (typeof storyApi.parseGeneratedStory === 'function') {
            const original = storyApi.parseGeneratedStory.bind(storyApi);
            storyApi.parseGeneratedStory = function realAwareParsedStory(response, seed = {}) {
                return enrichStoryReality(original(response, seed), parseRawReality(response));
            };
        }

        if (typeof storyApi.storyBlueprintSummary === 'function') {
            const original = storyApi.storyBlueprintSummary.bind(storyApi);
            storyApi.storyBlueprintSummary = function realAwareBlueprintSummary(story = {}) {
                return `${original(story)}${realWorldDirective(story, {}, 'blueprint canonico')}`;
            };
        }

        storyApi.inferRealityProfile = inferRealityProfile;
        storyApi.__realWorldFidelityPatchVersion = PATCH_VERSION;
    }

    function replaceText(value, replacements) {
        if (typeof value !== 'string') return value;
        let result = value;
        [...replacements.entries()].sort((a, b) => String(b[0]).length - String(a[0]).length).forEach(([from, to]) => {
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
            else if (Array.isArray(value)) target[field] = value.map(item => typeof item === 'string' ? replaceText(item, replacements) : item);
        });
    }

    function isFallbackWorld(world) {
        const locations = asArray(world?.locations);
        const actors = asArray(world?.actors);
        return locations.some(item => /^fresh-loc-|^loc-\d+/i.test(String(item?.id || ''))) ||
            actors.some(item => keyOf(item?.source) === 'fallback-npc');
    }

    function factionAnchors(profile, count, genre) {
        const historical = profile.year && profile.year < 1861;
        const historicalNames = ['Repubblica di Firenze', 'Stato Pontificio', 'Ducato di Urbino', 'Repubblica di Siena'];
        const modernNames = genre === 'business'
            ? ['Comune di Roma', 'Comune di Firenze', 'Comune di Perugia', 'Comune di Ancona']
            : ['Regione Lazio', 'Regione Toscana', 'Regione Umbria', 'Regione Marche'];
        return (historical ? historicalNames : modernNames).slice(0, Math.max(0, count));
    }

    const MODERN_FIRST = ['Marco','Giulia','Luca','Elena','Andrea','Francesca','Matteo','Sara','Davide','Chiara','Paolo','Martina','Stefano','Alessia','Simone','Valentina','Federico','Ilaria'];
    const HISTORICAL_FIRST = ['Lorenzo','Caterina','Tommaso','Ginevra','Bartolomeo','Beatrice','Niccolò','Lucrezia','Pietro','Maddalena','Bernardo','Costanza','Giovanni','Antonia'];
    const ITALIAN_LAST = ['Rossi','Bianchi','Conti','Ricci','Moretti','De Angelis','Ferri','Galli','Marini','Leoni','Benedetti','Serra','Neri','Mancini','Rinaldi','Bellini','Santini','Orsini'];

    function localNpcName(seed, index, historical) {
        const firstPool = historical ? HISTORICAL_FIRST : MODERN_FIRST;
        const first = firstPool[hashText(`${seed}|first|${index}`) % firstPool.length];
        let last = ITALIAN_LAST[hashText(`${seed}|last|${index}`) % ITALIAN_LAST.length];
        if (keyOf(first) === keyOf(last)) last = ITALIAN_LAST[(index + 7) % ITALIAN_LAST.length];
        return `${first} ${last}`;
    }

    function npcProfiles(genre, historical) {
        if (historical) return [
            { role: 'notaio', goal: 'proteggere validità e valore degli atti', strategy: 'documenti, testimonianze e relazioni civiche', resources: 'atti, clienti e conoscenza delle consuetudini' },
            { role: 'mercante', goal: 'mantenere accesso a credito e mercati', strategy: 'contratti, lettere di cambio e reti commerciali', resources: 'capitale, merci e corrispondenti' },
            { role: 'artigiano di corporazione', goal: 'difendere lavoro, bottega e reputazione', strategy: 'rete professionale e pressione corporativa', resources: 'maestranze, competenza e contatti di mestiere' },
            { role: 'funzionario civico', goal: 'far rispettare competenze e decisioni dell’autorità', strategy: 'procedure, registri e mandato pubblico', resources: 'accesso agli uffici e informazioni amministrative' },
            { role: 'religioso locale', goal: 'preservare influenza e coesione della comunità', strategy: 'mediazione, predicazione e rete assistenziale', resources: 'fiducia sociale e istituzioni religiose' },
            { role: 'capitano o ufficiale', goal: 'garantire sicurezza e ordine secondo il proprio mandato', strategy: 'uomini, pattuglie e controllo dei passaggi', resources: 'forza armata e autorità operativa' }
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
            { role: 'giornalista locale', goal: 'ottenere informazioni verificabili e rilevanti', strategy: 'fonti, interviste e verifica dei fatti', resources: 'rete di fonti e visibilità pubblica' },
            { role: 'rappresentante associativo', goal: 'tutelare gli interessi del proprio gruppo', strategy: 'mobilitazione e negoziazione', resources: 'aderenti e consenso locale' },
            { role: 'residente con interesse diretto', goal: 'proteggere famiglia, lavoro o proprietà', strategy: 'relazioni di quartiere e iniziativa personale', resources: 'conoscenza del territorio e legami sociali' }
        ];
    }

    function applyCentralItalyFallback(world, story = {}, context = {}) {
        const profile = inferRealityProfile(story, context);
        if (!profile.centralItaly || !isFallbackWorld(world)) return world;
        const locations = asArray(world.locations);
        const factions = asArray(world.factions);
        const actors = asArray(world.actors).filter(actor => keyOf(actor?.source) === 'fallback-npc');
        const locationMap = new Map();
        locations.forEach((location, index) => {
            if (!location?.name) return;
            const anchor = CENTRAL_ITALY_ANCHORS[index % CENTRAL_ITALY_ANCHORS.length];
            locationMap.set(location.name, anchor.name);
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
        const factionNames = factionAnchors(profile, factions.length, keyOf(story.genre));
        factions.forEach((faction, index) => {
            const oldName = faction.name;
            const nextName = factionNames[index] || (profile.year && profile.year < 1861 ? `Potere territoriale di ${locations[index % locations.length]?.name || 'Italia centrale'}` : `Comune di ${locations[index % locations.length]?.name || 'Roma'}`);
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
        const npcNameMap = new Map();
        const seed = clean(context.worldGenerationSeed || world.generationSeed || `${story.setting}|${story.title}`, 240);
        actors.forEach((actor, index) => {
            const oldName = actor.name;
            const nextName = localNpcName(seed, index, Boolean(profile.year && profile.year < 1900));
            if (oldName) npcNameMap.set(oldName, nextName);
            const roleProfile = profiles[index % profiles.length];
            actor.name = nextName;
            actor.role = roleProfile.role;
            actor.goal = roleProfile.goal;
            actor.publicGoal = roleProfile.goal;
            actor.privateGoal = `proteggere un interesse personale legato a ${actor.location || locations[index % locations.length]?.name || 'Italia centrale'}`;
            actor.strategy = roleProfile.strategy;
            actor.agenda = roleProfile.strategy;
            actor.resources = roleProfile.resources;
            actor.leverage = roleProfile.resources;
            actor.location = locationMap.get(actor.location) || locations[index % Math.max(1, locations.length)]?.name || actor.location;
            actor.faction = factionMap.get(actor.faction) || actor.faction;
            actor.description = `${nextName} è ${roleProfile.role} e opera a ${actor.location}. Il suo ruolo deriva dalla situazione concreta della campagna, non da un archetipo fantasy.`;
            actor.knowledge = `Conosce persone, procedure e interessi pertinenti a ${actor.location}.`;
            actor.constraints = `Opera entro i vincoli reali del luogo e dell'anno ${profile.year || 'della campagna'}.`;
            actor.id = `real-npc-${hashText(`${seed}|${nextName}`).toString(36)}`;
            actor.fictional = true;
            actor.source = 'real-world-fallback-npc';
        });

        const allMap = new Map([...locationMap, ...factionMap, ...npcNameMap]);
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
                    government: profile.year && profile.year < 1861 ? 'Assetto politico storico da determinare in base alla data' : 'Repubblica Italiana',
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
                ? 'Usare gli Stati, comuni, repubbliche, signorie e poteri realmente esistenti alla data iniziale; Italia è solo un riferimento geografico.'
                : 'Repubblica Italiana con regioni ed enti locali reali pertinenti alla storia.',
            divergencePolicy: profile.isAlternate
                ? 'Conservare la baseline reale fino alla divergenza dichiarata; poi registrare ogni cambiamento causale.'
                : 'La geografia reale non cambia senza un evento esplicito; istituzioni e storia divergono solo per conseguenze di gioco.'
        };
        world.reality = { ...profile, anchors: locations.map(item => item.name) };
        return world;
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
                const castDirective = profile.isReal
                    ? `\nNPC REALI/PLAUSIBILI:\n- Gli NPC devono appartenere ai luoghi reali già generati e avere nomi, professioni, reti sociali, conoscenze e risorse coerenti con lingua, città e anno.\n- Non usare il cast fallback Nobile/Comandante/Mercante/Sacerdote se il contesto non lo richiede.\n- Per un'ambientazione contemporanea crea normalmente persone private fittizie ma plausibili; non inventare come fatto un attuale titolare di carica pubblica.\n- Per una campagna storica inserisci una figura storica reale soltanto se è direttamente pertinente e ben attestata; i personaggi minori possono essere fittizi ma devono rispettare ceto, mestiere e cultura dell'epoca.\n- Ogni NPC deve essere collegato a una città reale, una fazione/istituzione pertinente e una pressione del conflitto.\n`
                    : '';
                return `${original(world, story, context)}${realWorldDirective(story || {}, context, 'NPC')}${castDirective}`;
            };
        }

        if (typeof generator.generateFallbackNpcs === 'function') {
            const original = generator.generateFallbackNpcs.bind(generator);
            generator.generateFallbackNpcs = function realAwareFallbackNpcs(world, context = {}) {
                const result = original(world, context);
                const target = result && typeof result === 'object' ? result : world;
                return applyCentralItalyFallback(target, context.story || {}, context);
            };
        }

        generator.inferRealityProfile = inferRealityProfile;
        generator.applyCentralItalyFallback = applyCentralItalyFallback;
        generator.__realWorldFidelityPatchVersion = PATCH_VERSION;
    }

    function install() {
        patchStoryGenerator();
        patchWorldGenerator();
        if (root.CronacheCampaign) root.CronacheCampaign.inferRealityProfile = inferRealityProfile;
    }

    install();

    return {
        PATCH_VERSION,
        CENTRAL_ITALY_ANCHORS,
        inferRealityProfile,
        realWorldDirective,
        enrichStoryReality,
        applyCentralItalyFallback,
        install
    };
});
