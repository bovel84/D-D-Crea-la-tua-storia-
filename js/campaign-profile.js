(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheCampaign = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SCHEMA_VERSION = 1;

    const OPTIONS = {
        tone: {
            heroic: {
                label: 'Eroico',
                directive: 'Tono epico e luminoso: il coraggio conta, senza rendere facili le vittorie.'
            },
            dark: {
                label: 'Oscuro',
                directive: 'Tono cupo e teso: conseguenze dure, speranza rara ma significativa.'
            },
            realistic: {
                label: 'Realistico',
                directive: 'Tono credibile e concreto: niente protezione narrativa, causalità rigorosa.'
            },
            adventurous: {
                label: 'Avventuroso',
                directive: 'Tono dinamico e meraviglioso: scoperta, ritmo e pericoli leggibili.'
            },
            light: {
                label: 'Leggero',
                directive: 'Tono brillante e umano: spazio a ironia, amicizia e momenti di sollievo.'
            }
        },
        focus: {
            balanced: {
                label: 'Bilanciato',
                directive: 'Alterna dialogo, esplorazione, conflitto e gestione secondo la storia.'
            },
            roleplay: {
                label: 'Interpretazione',
                directive: 'Dai priorità a dialoghi, relazioni, dilemmi e crescita dei personaggi.'
            },
            exploration: {
                label: 'Esplorazione',
                directive: 'Dai priorità a luoghi, scoperte, misteri, viaggio e senso di meraviglia.'
            },
            tactical: {
                label: 'Tattico',
                directive: 'Dai priorità a sfide, risorse, posizionamento, rischio e decisioni tattiche.'
            },
            management: {
                label: 'Gestionale',
                directive: 'Dai priorità a economia, proprietà, organizzazioni, personale e conseguenze sistemiche.'
            }
        },
        freedom: {
            guided: {
                label: 'Guidata',
                directive: 'Offri obiettivi chiari e indizi forti, lasciando al giocatore la decisione finale.'
            },
            balanced: {
                label: 'Equilibrata',
                directive: 'Mantieni trame riconoscibili ma accetta deviazioni e soluzioni impreviste.'
            },
            sandbox: {
                label: 'Sandbox',
                directive: 'Non forzare una trama principale: il mondo evolve e reagisce alle priorità del giocatore.'
            }
        },
        intensity: {
            gentle: {
                label: 'Morbida',
                directive: 'Evita dettagli grafici; usa dissolvenza narrativa per violenza, paura e intimità.'
            },
            standard: {
                label: 'Standard',
                directive: 'Mostra pericolo e conseguenze senza compiacimento o dettagli gratuitamente grafici.'
            },
            intense: {
                label: 'Intensa',
                directive: 'Consenti tensione e conseguenze forti, rispettando sempre i limiti espliciti del giocatore.'
            }
        }
    };

    function clean(value, maxLength) {
        const text = String(value == null ? '' : value)
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const limit = Number.isFinite(maxLength) ? maxLength : 500;
        return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
    }

    function validOption(group, value, fallback) {
        return Object.prototype.hasOwnProperty.call(OPTIONS[group], value) ? value : fallback;
    }

    function createDefaultProfile() {
        return {
            schemaVersion: SCHEMA_VERSION,
            tone: 'adventurous',
            focus: 'balanced',
            freedom: 'balanced',
            intensity: 'standard',
            premise: '',
            boundaries: '',
            createdAt: null
        };
    }

    function migrateProfile(input) {
        const source = input && typeof input === 'object' ? input : {};
        const defaults = createDefaultProfile();
        return {
            ...defaults,
            ...source,
            schemaVersion: SCHEMA_VERSION,
            tone: validOption('tone', source.tone, defaults.tone),
            focus: validOption('focus', source.focus, defaults.focus),
            freedom: validOption('freedom', source.freedom, defaults.freedom),
            intensity: validOption('intensity', source.intensity, defaults.intensity),
            premise: clean(source.premise, 1200),
            boundaries: clean(source.boundaries, 600),
            createdAt: source.createdAt || null
        };
    }

    function createProfile(input) {
        return migrateProfile({
            ...(input || {}),
            createdAt: input?.createdAt || new Date().toISOString()
        });
    }

    function profileSummary(input) {
        const profile = migrateProfile(input);
        return {
            tone: OPTIONS.tone[profile.tone].label,
            focus: OPTIONS.focus[profile.focus].label,
            freedom: OPTIONS.freedom[profile.freedom].label,
            intensity: OPTIONS.intensity[profile.intensity].label,
            premise: profile.premise,
            boundaries: profile.boundaries
        };
    }

    function buildPrompt(input) {
        const profile = migrateProfile(input);
        const boundaries = profile.boundaries
            ? `LIMITI ESPLICITI DEL GIOCATORE: ${profile.boundaries}. Non introdurre questi contenuti, neppure come sorpresa o retroscena.`
            : 'Il giocatore non ha indicato limiti aggiuntivi; mantieni comunque il contenuto coerente con l’intensità scelta.';
        const premise = profile.premise
            ? `PREMESSA PERSONALE: ${profile.premise}. Integrala come direzione iniziale, non come esito già deciso.`
            : 'Nessuna premessa personale aggiuntiva.';

        return `🎭 SESSIONE ZERO — CONTRATTO DELLA CAMPAGNA
- TONO: ${OPTIONS.tone[profile.tone].label}. ${OPTIONS.tone[profile.tone].directive}
- FOCUS: ${OPTIONS.focus[profile.focus].label}. ${OPTIONS.focus[profile.focus].directive}
- LIBERTÀ: ${OPTIONS.freedom[profile.freedom].label}. ${OPTIONS.freedom[profile.freedom].directive}
- INTENSITÀ: ${OPTIONS.intensity[profile.intensity].label}. ${OPTIONS.intensity[profile.intensity].directive}
- ${premise}
- ${boundaries}

Queste preferenze persistono per tutta la campagna. Non citarle direttamente nella narrazione e non usarle per togliere libertà decisionale al giocatore.`;
    }

    function listOptions(group) {
        if (!OPTIONS[group]) return [];
        return Object.entries(OPTIONS[group]).map(([value, item]) => ({
            value,
            label: item.label,
            directive: item.directive
        }));
    }

    return {
        SCHEMA_VERSION,
        OPTIONS,
        clean,
        createDefaultProfile,
        migrateProfile,
        createProfile,
        profileSummary,
        buildPrompt,
        listOptions
    };
});

// Runtime compatibility patch: world.actors is authoritative when it contains
// a newer autonomous NPC move than the projected worldMemory.npcs copy.
// Kept here because this module loads after world-bootstrap and before game setup.
(function installNpcStateSyncPatch(root) {
    'use strict';

    const api = root && root.CronacheWorldBootstrap;
    if (!api || api.__npcStateSyncPatchVersion >= 1) return;

    const asArray = value => Array.isArray(value) ? value : [];
    const keyOf = typeof api.keyOf === 'function'
        ? value => api.keyOf(value)
        : value => String(value || '').trim().toLowerCase();
    const cloneEntity = entity => entity && typeof entity === 'object' ? { ...entity } : entity;
    const entitiesOf = world => [
        ...asArray(world && world.actors),
        ...asArray(world && world.factions)
    ];
    const memoryEntities = memory => [
        ...asArray(memory && memory.npcs),
        ...asArray(memory && memory.factions)
    ];
    const byName = items => new Map(asArray(items)
        .filter(item => item && item.name)
        .map(item => [keyOf(item.name), cloneEntity(item)]));

    function restoreActivity(targetWorld, sourceWorld) {
        if (!targetWorld || !sourceWorld) return targetWorld;
        const sourceByName = byName(entitiesOf(sourceWorld));
        entitiesOf(targetWorld).forEach(target => {
            const source = sourceByName.get(keyOf(target.name));
            if (!source) return;
            if (Object.prototype.hasOwnProperty.call(source, 'activity')) {
                target.activity = String(source.activity || '').trim().slice(0, 80);
            }
        });
        return targetWorld;
    }

    const originalMigrateWorld = api.migrateWorld.bind(api);
    const originalSyncFromMemory = api.syncFromMemory.bind(api);
    const originalProjectToMemory = api.projectToMemory.bind(api);
    const originalApplyWorldMoves = api.applyWorldMoves.bind(api);

    api.migrateWorld = function patchedMigrateWorld(worldValue, context = {}) {
        return restoreActivity(originalMigrateWorld(worldValue, context), worldValue);
    };

    api.syncFromMemory = function patchedSyncFromMemory(worldValue, memory, context = {}) {
        const runtimeByName = byName(entitiesOf(worldValue));
        const storedByName = byName(memoryEntities(memory));
        const synced = originalSyncFromMemory(worldValue, memory, context);

        entitiesOf(synced).forEach(target => {
            const key = keyOf(target.name);
            const runtime = runtimeByName.get(key);
            const stored = storedByName.get(key);
            if (!runtime) return;

            const runtimeMoveTurn = Math.max(0, Number(runtime.lastMoveTurn) || 0);
            const storedMoveTurn = Math.max(0, Number(stored && stored.lastMoveTurn) || 0);
            const runtimeInteractionTurn = Math.max(0, Number(runtime.lastInteractionTurn) || 0);
            const storedInteractionTurn = Math.max(0, Number(stored && stored.lastInteractionTurn) || 0);

            // Never let a stale projection roll back a newer autonomous move.
            if (runtimeMoveTurn > storedMoveTurn) {
                target.lastMove = runtime.lastMove || target.lastMove;
                target.lastMoveTurn = runtimeMoveTurn;
                target.status = runtime.status || target.status;
            }
            if (runtimeInteractionTurn > storedInteractionTurn) {
                target.lastInteractionTurn = runtimeInteractionTurn;
            }

            if (Object.prototype.hasOwnProperty.call(runtime, 'activity')) {
                target.activity = String(runtime.activity || '').trim().slice(0, 80);
            } else if (stored && Object.prototype.hasOwnProperty.call(stored, 'activity')) {
                target.activity = String(stored.activity || '').trim().slice(0, 80);
            }
        });
        return synced;
    };

    api.projectToMemory = function patchedProjectToMemory(worldValue, memory, context = {}) {
        const sourceByName = byName(entitiesOf(worldValue));
        const state = originalProjectToMemory(worldValue, memory, context);
        restoreActivity(state && state.world, worldValue);

        [
            ...asArray(state && state.npcs),
            ...asArray(state && state.factions)
        ].forEach(target => {
            const source = sourceByName.get(keyOf(target.name));
            if (!source || !Object.prototype.hasOwnProperty.call(source, 'activity')) return;
            target.activity = String(source.activity || '').trim().slice(0, 80);
        });
        return state;
    };

    api.applyWorldMoves = function patchedApplyWorldMoves(worldValue, moves, turn, context = {}) {
        const world = restoreActivity(originalApplyWorldMoves(worldValue, moves, turn, context), worldValue);
        asArray(moves).forEach(move => {
            const actor = entitiesOf(world).find(item => keyOf(item.name) === keyOf(move && move.actor));
            if (!actor) return;
            const status = String(move && move.status || '').trim();
            if (status && !/in.?progress|in corso/i.test(status)) {
                actor.activity = status.slice(0, 80);
                const statusKey = keyOf(status);
                if (/dead|morto|destroyed|distrutt|removed|eliminat/.test(statusKey)) actor.status = 'dead';
                else if (/dormant|dormiente|inactive|inattiv/.test(statusKey)) actor.status = 'dormant';
            }
        });
        return world;
    };

    ['applyTimelineEvents', 'markInteraction', 'applyConversationOutcomes'].forEach(method => {
        if (typeof api[method] !== 'function') return;
        const original = api[method].bind(api);
        api[method] = function preserveNpcActivity(worldValue, ...args) {
            return restoreActivity(original(worldValue, ...args), worldValue);
        };
    });

    if (typeof api.ingestResponse === 'function') {
        const originalIngestResponse = api.ingestResponse.bind(api);
        api.ingestResponse = function patchedIngestResponse(response, currentWorld, context = {}) {
            const result = originalIngestResponse(response, currentWorld, context);
            if (result && result.world) restoreActivity(result.world, currentWorld);
            return result;
        };
    }

    api.__npcStateSyncPatchVersion = 1;
})(typeof globalThis !== 'undefined' ? globalThis : this);

// Story alignment patch: the generated world must be causally derived from the
// campaign sheet instead of treating genre labels as the main source of truth.
(function installStoryAlignedWorldBuilderPatch(root) {
    'use strict';

    const generator = root && root.CronacheWorldGenerator;
    const campaign = root && root.CronacheCampaign;
    if (!generator || generator.__storyAlignmentPatchVersion >= 1) return;

    const asArray = value => Array.isArray(value) ? value : [];
    const text = (value, limit = 900) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, limit);
    const genreKey = value => text(value, 50).toLowerCase();

    function storyDossier(story = {}, context = {}) {
        const start = story.startTime && typeof story.startTime === 'object' ? story.startTime : {};
        const date = [start.day, start.month, start.year].filter(value => value != null && value !== '').join('/');
        const starterProperties = asArray(story.starterProperties)
            .map(item => `${text(item?.name, 100)}${item?.type ? ` (${text(item.type, 50)})` : ''}`)
            .filter(Boolean)
            .join(', ');
        return [
            `Titolo: ${text(story.title, 120) || 'non definito'}`,
            `Genere: ${text(story.genre, 50) || 'non definito'}`,
            `Ambientazione dichiarata: ${text(story.setting, 220) || 'non definita'}`,
            date ? `Data/epoca iniziale: ${date}` : '',
            `Premessa e conflitto: ${text(story.desc || context.idea, 1200) || 'non definiti'}`,
            `Tono e stile: ${text(story.personality, 700) || 'non definiti'}`,
            `Regole di profondità: ${text(story.depth, 1000) || 'non definite'}`,
            `Prologo/scena iniziale: ${text(story.prologue, 1300) || 'non definito'}`,
            starterProperties ? `Proprietà/attività iniziali del protagonista: ${starterProperties}` : '',
            context.protagonistName ? `Protagonista: ${text(context.protagonistName, 100)}` : ''
        ].filter(Boolean).join('\n');
    }

    function scopeDirective(story = {}) {
        const genre = genreKey(story.genre);
        if (['business', 'sport', 'contemporary', 'crime', 'rural'].includes(genre)) {
            return [
                'SCALA LOCALE/REGIONALE: la storia viene prima della mappa.',
                '- Le precedenti quantità obbligatorie di continenti/nazioni NON devono forzare una geopolitica artificiale.',
                '- Mantieni continents/nations/regions solo come contenitori tecnici richiesti dallo schema JSON: usa 1 macro-area, 1 paese/territorio e 1-3 regioni/quartieri se la premessa non richiede di più.',
                '- Genera soprattutto 8-14 luoghi realmente utilizzabili nella storia: casa, lavoro/attività, istituzioni, concorrenti, clienti, infrastrutture, quartieri e luoghi sociali pertinenti.',
                '- Non inventare regni, castelli, culti o guerre se la premessa non li contiene.'
            ].join('\n');
        }
        if (['spy', 'diplomatic', 'military', 'pirate'].includes(genre)) {
            return [
                'SCALA MULTI-AREA MIRATA: usa solo territori necessari al conflitto.',
                '- Più nazioni/regioni sono appropriate soltanto se servono a missioni, alleanze, rotte, fronti o crisi presenti nella premessa.',
                '- Evita continenti riempitivi: ogni area deve creare una possibilità narrativa concreta.'
            ].join('\n');
        }
        if (genre === 'historical') {
            return [
                'SCALA STORICA COERENTE:',
                '- La geografia, le istituzioni, i titoli, le tecnologie e i rapporti di potere devono essere plausibili per data e luogo dichiarati.',
                '- Non trasformare automaticamente una storia locale in una guerra continentale.',
                '- Se usi entità inventate, rendile compatibili con il contesto storico e non presentarle come fatti reali certi.'
            ].join('\n');
        }
        return [
            'SCALA FANTASY/AVVENTURA COERENTE:',
            '- Espandi la geografia solo quanto richiesto dal conflitto centrale e dal prologo.',
            '- Se la storia è locale, resta locale; se la premessa è geopolitica, allora crea nazioni e potenze realmente rilevanti.',
            '- Nessun luogo deve esistere soltanto per riempire una quota numerica.'
        ].join('\n');
    }

    function factionDirective(story = {}) {
        const genre = genreKey(story.genre);
        const map = {
            business: 'Fazioni appropriate: imprese concorrenti, clienti chiave, fornitori, banche/finanziatori, associazioni, sindacati, enti pubblici o regolatori. NON regni o ribellioni salvo esplicita premessa.',
            sport: 'Fazioni appropriate: club, proprietà/dirigenza, staff, tifoserie organizzate, lega/federazione, agenti, sponsor e rivali sportivi.',
            contemporary: 'Fazioni appropriate: famiglia/reti sociali, datore di lavoro, aziende, istituzioni, associazioni, gruppi locali o politici pertinenti alla premessa.',
            crime: 'Fazioni appropriate: gruppi criminali, forze dell’ordine, attività legali di copertura, istituzioni, quartieri e reti di informatori. Ogni gruppo deve avere interessi concreti e distinti.',
            rural: 'Fazioni appropriate: famiglie, cooperative, proprietari terrieri, fornitori, commercianti, istituzioni locali, banche e gruppi della comunità.',
            historical: 'Fazioni appropriate all’epoca: casate, corporazioni, istituzioni civiche/religiose, eserciti, corti, comuni o potenze realmente plausibili per il contesto.',
            military: 'Fazioni appropriate: reparti, comandi, alleati/avversari, intelligence, popolazione civile e autorità politiche collegate al fronte.',
            diplomatic: 'Fazioni appropriate: governi, ministeri, ambasciate, partiti, blocchi economici, intelligence e gruppi di pressione.',
            spy: 'Fazioni appropriate: servizi segreti, governi, cellule, reti clandestine, intermediari e organizzazioni coperte.',
            pirate: 'Fazioni appropriate: equipaggi, marine, compagnie commerciali, governatori, porti, contrabbandieri e potenze coloniali.'
        };
        return map[genre] || 'Le fazioni devono essere organizzazioni e poteri che emergono naturalmente dalla premessa, non archetipi generici aggiunti per completare il numero.';
    }

    function locationAlignmentDirective(story, context) {
        return [
            '',
            '=== ALLINEAMENTO AUTORITATIVO CON LA STORIA ===',
            'QUESTE REGOLE HANNO PRECEDENZA sulle quantità e sugli esempi generici indicati prima.',
            storyDossier(story, context),
            '',
            scopeDirective(story),
            '',
            'LUOGHI:',
            '- Il luogo di partenza deve essere quello implicato o esplicitato dal prologo; non scegliere automaticamente la zona più stabile.',
            '- Almeno il 60% dei luoghi deve avere una funzione immediata rispetto a conflitto, vita quotidiana, proprietà, lavoro, relazioni, indagini o opportunità della premessa.',
            '- Ogni descrizione di luogo deve spiegare perché quel luogo conta in QUESTA storia, non limitarsi a descrivere atmosfera o architettura.',
            '- Se il protagonista possiede un’attività/proprietà iniziale, crea il quartiere/mercato/istituzioni/concorrenti/fornitori necessari a renderla credibile.',
            '',
            'FAZIONI:',
            factionDirective(story),
            '- Ogni fazione deve incarnare una tensione, opportunità o vincolo riconoscibile nella premessa/prologo/depth.',
            '- Ogni fazione deve avere almeno un interesse che può entrare in conflitto con un’altra fazione senza dipendere dal protagonista.',
            '- La precedente regola "la fazione più potente controlla la nazione iniziale" NON è obbligatoria: il potere dominante deve derivare dal contesto narrativo.',
            '- Non creare fazioni solo per raggiungere una quota; meglio 3-5 gruppi fortemente pertinenti che 8 gruppi decorativi.',
            '',
            'FORZE IN MOVIMENTO:',
            '- Le forze storiche devono essere sviluppi già attivi al momento del prologo: crisi, trattative, concorrenza, indagini, guerre, successioni, debiti, campagne sportive o pressioni sociali coerenti con la storia.',
            '- Almeno una forza deve poter evolvere senza intervento del protagonista e produrre conseguenze visibili nella timeline.',
            '',
            'CONTROLLO FINALE PRIMA DEL JSON:',
            '- Per ogni luogo/fazione/forza chiediti: "se lo elimino, la premessa perde qualcosa?". Se la risposta è no, sostituiscilo con qualcosa di più pertinente.',
            '- Non cambiare epoca, tecnologia, sistema economico o scala sociale rispetto alla scheda della storia.'
        ].join('\n');
    }

    function formatLocation(item) {
        return [
            text(item?.name, 120),
            item?.type ? `tipo=${text(item.type, 60)}` : '',
            item?.region ? `regione=${text(item.region, 100)}` : '',
            item?.description ? `funzione/descrizione=${text(item.description, 260)}` : '',
            item?.controller ? `controllo=${text(item.controller, 100)}` : '',
            item?.resource ? `risorsa=${text(item.resource, 120)}` : '',
            item?.danger ? `pressione/pericolo=${text(item.danger, 120)}` : ''
        ].filter(Boolean).join(' | ');
    }

    function formatFaction(item) {
        return [
            text(item?.name, 120),
            item?.type ? `tipo=${text(item.type, 60)}` : '',
            item?.leader ? `leader=${text(item.leader, 100)}` : '',
            item?.description ? `descrizione=${text(item.description, 220)}` : '',
            item?.goal ? `obiettivo=${text(item.goal, 180)}` : '',
            item?.ideology ? `ideologia=${text(item.ideology, 160)}` : '',
            item?.strategy ? `strategia=${text(item.strategy, 160)}` : '',
            item?.resources ? `risorse=${text(item.resources, 160)}` : '',
            item?.base ? `base=${text(item.base, 100)}` : ''
        ].filter(Boolean).join(' | ');
    }

    function worldDossier(world = {}) {
        const locations = asArray(world.locations).slice(0, 20).map(formatLocation).filter(Boolean);
        const factions = asArray(world.factions).slice(0, 16).map(formatFaction).filter(Boolean);
        const forces = asArray(world.forces).slice(0, 12).map(item => [
            text(item?.name, 120),
            item?.actor ? `attore=${text(item.actor, 100)}` : '',
            item?.objective ? `obiettivo=${text(item.objective, 180)}` : '',
            item?.cause ? `causa=${text(item.cause, 180)}` : '',
            item?.consequenceAt100 ? `esito=${text(item.consequenceAt100, 180)}` : ''
        ].filter(Boolean).join(' | ')).filter(Boolean);
        return [
            `Mondo: ${text(world.name, 120) || 'non nominato'}`,
            `Premessa del mondo: ${text(world.premise, 500) || 'non definita'}`,
            `Conflitto centrale: ${text(world.centralConflict, 420) || 'non definito'}`,
            `Posta in gioco: ${text(world.stakes, 320) || 'non definita'}`,
            locations.length ? `LUOGHI CON FUNZIONE:\n${locations.map((value, index) => `${index + 1}. ${value}`).join('\n')}` : '',
            factions.length ? `FAZIONI CON MOTIVAZIONI:\n${factions.map((value, index) => `${index + 1}. ${value}`).join('\n')}` : '',
            forces.length ? `FORZE GIÀ IN MOVIMENTO:\n${forces.map((value, index) => `${index + 1}. ${value}`).join('\n')}` : ''
        ].filter(Boolean).join('\n\n');
    }

    function npcAlignmentDirective(world, story, context) {
        return [
            '',
            '=== ALLINEAMENTO AUTORITATIVO DEI PERSONAGGI ===',
            'QUESTE REGOLE HANNO PRECEDENZA sugli archetipi generici indicati prima.',
            storyDossier(story, context),
            '',
            worldDossier(world),
            '',
            'REGOLE DI CAST:',
            '- Ogni NPC deve avere una ragione concreta per esistere nella premessa: collega esplicitamente ruolo, fazione, luogo, conoscenze e obiettivi a una tensione del mondo.',
            '- Non creare un cast standard di nobile/comandante/mercante/sacerdote se tali ruoli non sono naturali per questa storia.',
            '- Almeno 4 NPC devono essere ancore causali del conflitto iniziale: possono aprire opportunità, ostacolare, negoziare, investigare, competere o modificare una forza già in movimento.',
            '- Almeno 2 NPC devono avere obiettivi importanti che NON riguardano il protagonista e devono poter agire autonomamente nella timeline.',
            '- Gli NPC della stessa fazione non devono essere cloni: assegna interessi, metodi, informazioni e rischi personali differenti.',
            '- Le relazioni iniziali devono derivare da interessi concreti (denaro, potere, famiglia, contratti, ideologia, rivalità, debiti, informazioni, territorio, carriera), non da etichette casuali "alleato/nemico".',
            '- relationship verso il protagonista deve essere conseguenza della situazione iniziale; se non si sono mai incontrati usa neutrale/diffidente/interessato invece di amicizia automatica.',
            '- Distribuisci gli NPC nei luoghi che hanno funzione narrativa. Non popolare uniformemente la mappa soltanto per copertura.',
            '- Se esistono proprietà/attività iniziali del protagonista, includi persone necessarie al loro ecosistema (es. dipendente, cliente, fornitore, concorrente, creditore, funzionario) SOLO quando coerenti con la premessa.',
            '',
            'CONTROLLO FINALE:',
            '- Ogni NPC deve poter generare almeno un evento plausibile nei primi turni.',
            '- Se un personaggio potrebbe essere trasferito senza modifiche in una campagna diversa, è troppo generico: riscrivilo.'
        ].join('\n');
    }

    if (typeof generator.buildGenerationPrompt === 'function') {
        const original = generator.buildGenerationPrompt.bind(generator);
        generator.buildGenerationPrompt = function storyAlignedGenerationPrompt(story, context = {}) {
            return `${original(story, context)}${locationAlignmentDirective(story || {}, context)}`;
        };
    }

    if (typeof generator.buildLocationsPrompt === 'function') {
        const original = generator.buildLocationsPrompt.bind(generator);
        generator.buildLocationsPrompt = function storyAlignedLocationsPrompt(story, context = {}) {
            return `${original(story, context)}${locationAlignmentDirective(story || {}, context)}`;
        };
    }

    if (typeof generator.buildNpcPrompt === 'function') {
        const original = generator.buildNpcPrompt.bind(generator);
        generator.buildNpcPrompt = function storyAlignedNpcPrompt(world, story, context = {}) {
            return `${original(world, story, context)}${npcAlignmentDirective(world || {}, story || {}, context)}`;
        };
    }

    if (campaign) {
        campaign.buildWorldStoryDossier = storyDossier;
        campaign.buildGeneratedWorldDossier = worldDossier;
        campaign.buildLocationAlignmentDirective = locationAlignmentDirective;
        campaign.buildNpcAlignmentDirective = npcAlignmentDirective;
    }
    generator.__storyAlignmentPatchVersion = 1;
})(typeof globalThis !== 'undefined' ? globalThis : this);
