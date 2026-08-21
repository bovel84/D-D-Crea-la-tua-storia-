(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheNpcNameCoherenceV20 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const PROMPT_MARKER = 'NPC_NAME_CANON_V20';

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 500) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
    const keyOf = value => clean(value, 900)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    function hashNumber(value) {
        let hash = 2166136261;
        const text = String(value || '');
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function normalizeGender(value) {
        const key = keyOf(value);
        if (/^(f|female|femmina|donna|woman|she|lei)$/.test(key)) return 'female';
        if (/^(m|male|maschio|uomo|man|he|lui)$/.test(key)) return 'male';
        return 'any';
    }

    function storyYear(story = {}, state = getState()) {
        const candidates = [
            state?.time?.year,
            story?.startTime?.year,
            story?.year,
            state?.worldMemory?.world?.historicalContext?.date
        ];
        for (const candidate of candidates) {
            const match = String(candidate == null ? '' : candidate).match(/-?\d{3,4}/);
            if (!match) continue;
            const year = Number(match[0]);
            if (Number.isFinite(year) && year !== 0) return Math.trunc(year);
        }
        return null;
    }

    function namingCorpus(story = {}, state = getState(), world = null) {
        const memoryWorld = world || state?.worldMemory?.world || {};
        return keyOf([
            story.title, story.setting, story.desc, story.prologue, story.depth,
            story.worldBlueprint?.scope?.primaryArea,
            memoryWorld.name, memoryWorld.setting,
            memoryWorld.historicalContext?.region,
            memoryWorld.historicalContext?.politicalSystem,
            ...asArray(memoryWorld.locations).slice(0, 16).flatMap(item => [item?.name, item?.region, item?.nation, item?.continent])
        ].filter(Boolean).join(' '));
    }

    function inferProfile(story = {}, state = getState(), world = null) {
        const year = storyYear(story, state);
        const corpus = namingCorpus(story, state, world);
        const italian = /italia|italian|firenze|florence|toscana|tuscany|siena|venezia|venice|roma|rome|milano|milan|genova|bologna|napoli|sicilia|sardegna/.test(corpus);
        const french = /francia|france|francese|parigi|paris|borgogna|burgundy|normandia|normandy/.test(corpus);
        const english = /inghilterra|england|english|londra|london|britann|united-kingdom|scotland|scozia/.test(corpus);
        const german = /germania|germany|tedesc|deutsch|sacro-romano|holy-roman|austria|vienna|vienna/.test(corpus);
        const spanish = /spagna|spain|spagnol|castiglia|castile|aragona|aragon|madrid|barcellona|barcelona/.test(corpus);
        const renaissance = /rinasciment|renaissance/.test(corpus) || Boolean(italian && year && year >= 1350 && year <= 1650);
        const medieval = /medioev|medieval/.test(corpus) || Boolean(year && year < 1350);
        const historical = Boolean(year && year < 1900) || /storico|historical|rinasciment|renaissance|medioev|medieval/.test(corpus);
        let culture = 'generic';
        if (italian && renaissance) culture = 'italian_renaissance';
        else if (italian && historical) culture = 'italian_historical';
        else if (italian) culture = 'italian_modern';
        else if (french) culture = historical ? 'french_historical' : 'french_modern';
        else if (english) culture = historical ? 'english_historical' : 'english_modern';
        else if (german) culture = historical ? 'german_historical' : 'german_modern';
        else if (spanish) culture = historical ? 'spanish_historical' : 'spanish_modern';
        else if (/fantasy|magia|draghi|elf|regni-fantastici/.test(corpus)) culture = 'fantasy';

        const area = clean(
            story?.worldBlueprint?.scope?.primaryArea
            || story?.setting
            || world?.historicalContext?.region
            || state?.worldMemory?.world?.historicalContext?.region
            || world?.setting
            || state?.worldMemory?.world?.setting,
            220
        );
        return { year, corpus, culture, area, historical, renaissance, medieval };
    }

    const NAME_POOLS = Object.freeze({
        italian_renaissance: {
            male: ['Bartolomeo','Bernardo','Cosimo','Domenico','Filippo','Francesco','Giovanni','Jacopo','Lorenzo','Matteo','Niccolò','Piero','Tommaso'],
            female: ['Agnese','Alessandra','Antonia','Beatrice','Caterina','Contessina','Ginevra','Isabella','Lucrezia','Maddalena','Margherita'],
            byname: ['di Piero','di Bernardo','di Matteo','di Jacopo','di Tommaso','da Fiesole','da Prato','da Siena','da Lucca','da Arezzo']
        },
        italian_historical: {
            male: ['Alberto','Antonio','Bernardo','Domenico','Francesco','Giacomo','Giovanni','Lorenzo','Matteo','Niccolò','Pietro','Tommaso'],
            female: ['Agnese','Anna','Antonia','Beatrice','Caterina','Elena','Francesca','Ginevra','Isabella','Lucia','Margherita'],
            byname: ['di Pietro','di Giovanni','di Bernardo','di Matteo','da Firenze','da Siena','da Lucca','da Bologna','da Perugia','da Roma']
        },
        italian_modern: {
            male: ['Alessandro','Andrea','Davide','Federico','Francesco','Luca','Marco','Matteo','Paolo','Stefano'],
            female: ['Alessia','Chiara','Elena','Francesca','Giulia','Ilaria','Martina','Sara','Valentina'],
            last: ['Benedetti','Conti','Ferri','Galli','Leoni','Mancini','Marini','Rinaldi','Santini','Serra']
        },
        french_historical: {
            male: ['Antoine','Étienne','François','Guillaume','Jacques','Jean','Louis','Martin','Nicolas','Pierre'],
            female: ['Anne','Catherine','Charlotte','Élisabeth','Isabeau','Jeanne','Louise','Marguerite','Marie'],
            last: ['Bernard','Dubois','Fournier','Lambert','Martin','Mercier','Moreau','Petit','Robert']
        },
        french_modern: {
            male: ['Alexandre','Antoine','Julien','Lucas','Mathieu','Nicolas','Pierre','Thomas'],
            female: ['Camille','Claire','Élodie','Julie','Léa','Manon','Sophie'],
            last: ['Bernard','Dubois','Lefèvre','Leroy','Martin','Moreau','Petit','Roux']
        },
        english_historical: {
            male: ['Edmund','Edward','Geoffrey','Henry','John','Nicholas','Richard','Robert','Thomas','William'],
            female: ['Alice','Anne','Catherine','Eleanor','Elizabeth','Joan','Margaret','Mary'],
            last: ['Atwood','Baker','Carter','Fletcher','Hill','Miller','Smith','Taylor','Ward','Wright']
        },
        english_modern: {
            male: ['Daniel','David','James','John','Michael','Oliver','Thomas','William'],
            female: ['Charlotte','Emily','Emma','Grace','Lucy','Olivia','Sophie'],
            last: ['Brown','Clark','Davies','Evans','Hall','Smith','Taylor','Walker','Wilson']
        },
        german_historical: {
            male: ['Albrecht','Friedrich','Georg','Hans','Heinrich','Johann','Konrad','Ludwig','Martin','Wilhelm'],
            female: ['Anna','Barbara','Elisabeth','Gertrud','Katharina','Margarethe','Ursula'],
            last: ['Bauer','Fischer','Hoffmann','Keller','Klein','Meyer','Schmidt','Schneider','Weber']
        },
        german_modern: {
            male: ['Andreas','Daniel','Felix','Johannes','Lukas','Martin','Michael','Thomas'],
            female: ['Anna','Julia','Katharina','Laura','Lea','Sophie'],
            last: ['Bauer','Fischer','Hoffmann','Klein','Meyer','Schmidt','Schneider','Weber']
        },
        spanish_historical: {
            male: ['Alonso','Diego','Fernando','Francisco','Gonzalo','Juan','Martín','Miguel','Pedro'],
            female: ['Beatriz','Catalina','Elvira','Inés','Isabel','Juana','Leonor','María'],
            last: ['Álvarez','Díaz','Fernández','García','Gómez','López','Martínez','Pérez','Ruiz']
        },
        spanish_modern: {
            male: ['Alejandro','Carlos','Daniel','Javier','Jorge','Miguel','Pablo'],
            female: ['Ana','Carmen','Elena','Laura','Lucía','María','Sofía'],
            last: ['Díaz','García','Gómez','López','Martínez','Moreno','Pérez','Ruiz']
        }
    });

    function isGenericName(value) {
        const key = keyOf(value);
        return !key || /^(autorita|opposizione|guida-locale|mediatore|npc|personaggio|mercante|nobile|comandante|sacerdote|funzionario|leader|capitano)(-|$)/.test(key);
    }

    function looksLikeProceduralFantasy(value) {
        const key = keyOf(value);
        return /valdoria|morvane|ravenhollow|altavalle|selvalunga|roccaforte/.test(key);
    }

    function factionLeader(faction) {
        const leader = clean(faction?.leader, 120);
        if (!leader || isGenericName(leader) || looksLikeProceduralFantasy(leader)) return '';
        return leader;
    }

    function contextualFallbackName(actor, index, profile, usedNames, faction, seed = '') {
        const leader = factionLeader(faction);
        if (leader && !usedNames.has(keyOf(leader))) return leader;
        const pool = NAME_POOLS[profile.culture];
        if (!pool) {
            const existing = clean(actor?.name, 120);
            if (existing && !looksLikeProceduralFantasy(existing) && !isGenericName(existing)) return existing;
            return `Personaggio ${index + 1}`;
        }
        const gender = normalizeGender(actor?.gender);
        const firstPool = gender === 'female' ? pool.female : gender === 'male' ? pool.male : [...pool.male, ...pool.female];
        const basis = `${seed}|${profile.year || ''}|${profile.area}|${actor?.role}|${actor?.location}|${actor?.faction}|${index}`;
        const first = firstPool[hashNumber(`${basis}|first`) % firstPool.length];
        const suffixPool = pool.byname || pool.last || [];
        const suffix = suffixPool.length ? suffixPool[hashNumber(`${basis}|suffix`) % suffixPool.length] : '';
        let candidate = clean(`${first} ${suffix}`, 120);
        let attempt = 0;
        while (usedNames.has(keyOf(candidate)) && attempt < firstPool.length * 2) {
            attempt++;
            const alternative = firstPool[(hashNumber(`${basis}|first|${attempt}`) + attempt) % firstPool.length];
            const altSuffix = suffixPool.length ? suffixPool[(hashNumber(`${basis}|suffix|${attempt}`) + attempt) % suffixPool.length] : '';
            candidate = clean(`${alternative} ${altSuffix}`, 120);
        }
        return candidate || `Personaggio ${index + 1}`;
    }

    function replaceNamesInObject(value, replacements, depth = 0) {
        if (!value || depth > 10 || !replacements?.size) return value;
        if (typeof value === 'string') {
            let text = value;
            [...replacements.entries()].sort((a, b) => b[0].length - a[0].length).forEach(([from, to]) => {
                if (from && to && from !== to) text = text.split(from).join(to);
            });
            return text;
        }
        if (Array.isArray(value)) {
            for (let index = 0; index < value.length; index++) value[index] = replaceNamesInObject(value[index], replacements, depth + 1);
            return value;
        }
        if (typeof value === 'object') {
            Object.keys(value).forEach(key => { value[key] = replaceNamesInObject(value[key], replacements, depth + 1); });
        }
        return value;
    }

    function repairFallbackNames(world, context = {}) {
        if (!world || typeof world !== 'object') return { world, replacements: new Map(), changed: 0 };
        const state = context.state || getState();
        const story = context.story || state?.currentStory || {};
        const profile = inferProfile(story, state, world);
        const actors = asArray(world.actors);
        const factions = asArray(world.factions);
        const factionByName = new Map(factions.map(item => [keyOf(item?.name), item]));
        const fallbackActors = actors.filter(actor => /fallback-npc|real-world-fallback-npc/i.test(String(actor?.source || '')));
        if (!fallbackActors.length) return { world, replacements: new Map(), changed: 0 };

        const usedNames = new Set(actors.filter(actor => !fallbackActors.includes(actor)).map(actor => keyOf(actor?.name)).filter(Boolean));
        const replacements = new Map();
        const seed = clean(context.worldGenerationSeed || world.generationSeed || `${story.setting || world.setting}|${story.title || world.name}|${profile.year || ''}`, 300);
        let changed = 0;

        fallbackActors.forEach((actor, index) => {
            const oldName = clean(actor?.name, 120);
            const faction = factionByName.get(keyOf(actor?.faction));
            let nextName = contextualFallbackName(actor, index, profile, usedNames, faction, seed);
            if (!nextName || isGenericName(nextName)) nextName = oldName || `Personaggio ${index + 1}`;
            if (usedNames.has(keyOf(nextName))) {
                nextName = contextualFallbackName(actor, index + 31, profile, usedNames, null, `${seed}|unique`);
            }
            usedNames.add(keyOf(nextName));
            if (oldName && nextName && oldName !== nextName) {
                replacements.set(oldName, nextName);
                actor.name = nextName;
                actor.id = `ctx-npc-${hashNumber(`${seed}|${nextName}`).toString(36)}`;
                actor.nameSource = 'contextual-canon-v20';
                changed++;
            } else if (nextName) {
                actor.nameSource = actor.nameSource || 'contextual-canon-v20';
            }
        });

        if (replacements.size) replaceNamesInObject(world, replacements);
        world.namingCanon = {
            version: PATCH_VERSION,
            culture: profile.culture,
            area: profile.area,
            year: profile.year,
            policy: 'contextual_stable_names'
        };
        return { world, replacements, changed };
    }

    function namingDirective(story = {}, state = getState(), world = null) {
        const profile = inferProfile(story, state, world);
        const area = profile.area || 'il luogo specifico indicato dalla campagna';
        const year = profile.year || 'la data canonica della campagna';
        const cultureHint = profile.culture === 'italian_renaissance'
            ? '- Per Firenze/Toscana rinascimentale usa forme onomastiche plausibili del XV-XVI secolo (nomi italiani/toscani, patronimici, provenienze o cognomi attestabili per il ceto). Evita nomi fantasy, anglosassoni moderni e combinazioni casuali di culture.'
            : profile.historical
                ? '- Per ambientazioni storiche usa onomastica realmente plausibile per lingua, territorio, ceto e secolo; non applicare liste moderne a epoche precedenti.'
                : '- Per ambientazioni contemporanee o fittizie deriva lo stile dei nomi dalla cultura concreta del luogo e mantienilo coerente tra personaggi della stessa comunità.';
        return `\n\n=== ${PROMPT_MARKER} — CANONE DEI NOMI NPC ===\n`
            + `Data canonica: ${year}. Area/cultura di riferimento: ${area}. Profilo: ${profile.culture}.\n`
            + '- I nomi degli NPC sono DATI CANONICI DEL MONDO, non decorazioni casuali. Non estrarli da una lista casuale indipendente dal contesto.\n'
            + '- Prima di nominare ogni NPC determina: luogo esatto, lingua/cultura locale, anno, ceto, mestiere, fazione e possibile origine straniera. Il nome deve derivare da questi dati.\n'
            + '- Un personaggio locale deve avere un nome plausibile per quel luogo e periodo. Un nome straniero è ammesso solo se l’origine straniera è esplicita e ha senso nella biografia o nel ruolo.\n'
            + '- Non mescolare nello stesso luogo nomi italiani, fantasy, inglesi, tedeschi, francesi ecc. senza una motivazione narrativa concreta.\n'
            + '- Figure storiche/pubbliche: usa il nome reale esatto solo se la persona è pertinente, viva/presente alla data e sufficientemente attestata. Non inventare titolari pubblici come se fossero reali.\n'
            + '- NPC minori fittizi: devono essere plausibili ma non devono impersonare casualmente personaggi storici famosi.\n'
            + '- Una volta assegnato un nome, conservalo identico in timeline, chat, relazioni, mappa e turni successivi. Non rinominare lo stesso NPC e non riutilizzare lo stesso nome per persone diverse.\n'
            + `${cultureHint}\n`
            + '- Controllo finale: se un nome potrebbe appartenere indifferentemente a qualunque epoca o paese senza legame col personaggio, rigeneralo mentalmente prima di rispondere.';
    }

    function appendDirective(prompt, story = {}, state = getState(), world = null) {
        const text = String(prompt || '');
        if (!text || text.includes(PROMPT_MARKER)) return text;
        return `${text}${namingDirective(story, state, world)}`;
    }

    function shouldInject(messages) {
        const text = asArray(messages).map(message => String(message?.content || '')).join('\n');
        if (!text || text.includes(PROMPT_MARKER)) return false;
        return /FASE 4\/6|NPC E RETI SOCIALI|REQUISITI NPC|PERSONAGGIO_SETUP|Crea i personaggi non giocanti|NPC REALI\/PLAUSIBILI|world-builder.*NPC|"npcs"/i.test(text);
    }

    function patchAiRequest() {
        const original = root.requestConfiguredAI;
        if (typeof original !== 'function') return false;
        if (original.__npcNameCanonV20Wrapped) return true;
        const wrapped = function npcNameAwareRequest(messages, options, ...rest) {
            if (!shouldInject(messages)) return original.call(this, messages, options, ...rest);
            const state = getState();
            const story = state?.currentStory || {};
            const world = state?.worldMemory?.world || null;
            const next = asArray(messages).map(message => ({ ...message }));
            let index = -1;
            for (let cursor = next.length - 1; cursor >= 0; cursor--) {
                if (next[cursor]?.role === 'user') { index = cursor; break; }
            }
            if (index < 0 && next.length) index = next.length - 1;
            if (index >= 0) next[index].content = appendDirective(next[index].content, story, state, world);
            return original.call(this, next, options, ...rest);
        };
        wrapped.__npcNameCanonV20Wrapped = true;
        wrapped.__npcNameCanonV20Original = original;
        root.requestConfiguredAI = wrapped;
        return true;
    }

    function patchPromptApi(holder, method, contextResolver) {
        const original = holder?.[method];
        if (typeof original !== 'function' || original.__npcNameCanonV20Wrapped) return false;
        const wrapped = function npcNameAwarePrompt(...args) {
            const base = original.apply(this, args);
            const resolved = typeof contextResolver === 'function' ? contextResolver(args) : {};
            return appendDirective(base, resolved.story || {}, resolved.state || getState(), resolved.world || null);
        };
        wrapped.__npcNameCanonV20Wrapped = true;
        wrapped.__npcNameCanonV20Original = original;
        holder[method] = wrapped;
        return true;
    }

    function patchPromptBuilders() {
        let patched = false;
        const generator = root.CronacheWorldGenerator;
        if (generator) {
            ['buildGenerationPrompt', 'buildLocationsPrompt'].forEach(method => {
                patched = patchPromptApi(generator, method, args => ({ story: args[0] || {}, world: null })) || patched;
            });
            patched = patchPromptApi(generator, 'buildNpcPrompt', args => ({ world: args[0] || null, story: args[1] || {} })) || patched;
        }
        const bootstrap = root.CronacheWorldBootstrap;
        if (bootstrap) {
            ['buildBootstrapPrompt', 'buildRuntimePrompt', 'buildTimelinePrompt', 'buildInteractionPrompt'].forEach(method => {
                patched = patchPromptApi(bootstrap, method, () => ({ story: getState()?.currentStory || {}, world: getState()?.worldMemory?.world || null })) || patched;
            });
        }
        return patched;
    }

    function patchFallbackGenerator() {
        const generator = root.CronacheWorldGenerator;
        const original = generator?.generateFallbackNpcs;
        if (typeof original !== 'function') return false;
        if (original.__npcNameCanonV20Wrapped) return true;
        const wrapped = function contextualFallbackNpcs(world, context = {}) {
            const result = original.call(this, world, context);
            const target = result && typeof result === 'object' ? result : world;
            repairFallbackNames(target, context || {});
            return target;
        };
        wrapped.__npcNameCanonV20Wrapped = true;
        wrapped.__npcNameCanonV20Original = original;
        generator.generateFallbackNpcs = wrapped;
        return true;
    }

    function repairCurrentState() {
        const state = getState();
        const world = state?.worldMemory?.world;
        if (!state || !world) return 0;
        const turn = Math.max(0, Number(state?.worldMemory?.turnCount) || Number(world?.updatedAtTurn) || 0);
        if (turn > 1) return 0;
        const result = repairFallbackNames(world, {
            state,
            story: state.currentStory || {},
            worldGenerationSeed: state.worldMemory?.worldGenerationSeed || world.generationSeed || ''
        });
        if (!result.changed || !result.replacements.size) return 0;
        // At the opening turn it is safe to keep mirrors, chats and UI registries in sync.
        replaceNamesInObject(state.worldMemory, result.replacements);
        return result.changed;
    }

    function install() {
        patchPromptBuilders();
        patchFallbackGenerator();
        patchAiRequest();
        repairCurrentState();
        root.__cronacheNpcNameCoherenceV20Version = PATCH_VERSION;
        return true;
    }

    if (typeof root.setTimeout === 'function') {
        [0, 120, 500, 1400, 3000].forEach(delay => root.setTimeout(() => install(), delay));
    } else {
        install();
    }

    return {
        PATCH_VERSION,
        PROMPT_MARKER,
        inferProfile,
        namingDirective,
        contextualFallbackName,
        repairFallbackNames,
        replaceNamesInObject,
        patchAiRequest,
        patchPromptBuilders,
        patchFallbackGenerator,
        repairCurrentState,
        install
    };
});