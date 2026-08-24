(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheStoryGenerationV26 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const VERSION = 26;
    const PATCH_MARK = '__cronacheStoryGenerationV26';
    const MAX_PHASE_ATTEMPTS = 2;
    const state = { intervalId: null, bindAttempts: 0 };

    const clean = (value, max = 2400) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
    const asArray = value => Array.isArray(value) ? value : [];

    function clone(value) {
        try { return JSON.parse(JSON.stringify(value)); } catch (_error) { return value; }
    }

    function balancedObjects(text) {
        const source = String(text || '');
        const output = [];
        let start = -1;
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let index = 0; index < source.length; index++) {
            const char = source[index];
            if (inString) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') inString = false;
                continue;
            }
            if (char === '"') { inString = true; continue; }
            if (char === '{') {
                if (depth === 0) start = index;
                depth++;
            } else if (char === '}' && depth > 0) {
                depth--;
                if (depth === 0 && start >= 0) {
                    output.push(source.slice(start, index + 1));
                    start = -1;
                }
            }
        }
        return output;
    }

    function extractJson(response) {
        const preferred = root.CronacheStoryGenerationV22?.extractJsonObject;
        if (typeof preferred === 'function') return preferred(response);
        const text = String(response || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        const candidates = [
            ...[...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(match => match[1]),
            ...balancedObjects(text),
            text
        ].map(value => String(value || '').trim().replace(/,\s*([}\]])/g, '$1')).filter(Boolean);
        let lastError = null;
        for (const candidate of candidates.sort((a, b) => b.length - a.length)) {
            try {
                const parsed = JSON.parse(candidate);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
            } catch (error) { lastError = error; }
        }
        throw new Error(lastError?.message ? `JSON non valido: ${lastError.message}` : 'Risposta JSON non valida.');
    }

    function seedSummary(seed = {}) {
        return [
            `Titolo richiesto: ${clean(seed.title, 160) || 'da proporre'}`,
            `Ambientazione: ${clean(seed.setting, 320) || 'da definire'}`,
            `Genere: ${clean(seed.genre, 80) || 'fantasy'}`,
            `Difficoltà: ${clean(seed.difficulty, 40) || 'normal'}`,
            `Capitale iniziale: ${Number.isFinite(Number(seed.starterGold)) ? Number(seed.starterGold) : 'da definire'}`,
            `Idea del giocatore: ${clean(seed.idea || seed.desc, 1600) || 'nessuna indicazione aggiuntiva'}`
        ].join('\n');
    }

    function buildCorePrompt(seed = {}) {
        const historical = clean(seed.genre, 80).toLowerCase() === 'historical';
        return [
            'Sei il game designer di un GDR narrativo persistente. Crea il CANONE della campagna, non ancora l’intero elenco di luoghi e PNG.',
            'Restituisci esclusivamente UN oggetto JSON valido, senza markdown o testo esterno.',
            '',
            '=== INPUT ===',
            seedSummary(seed),
            '',
            '=== JSON OBBLIGATORIO ===',
            '{',
            '  "title":"...", "setting":"...", "genre":"...", "difficulty":"easy|normal|hard", "starterGold":numero,',
            '  "desc":"situazione iniziale, conflitto e posta in gioco (500-1300 caratteri)",',
            '  "personality":"tono, ritmo, dialoghi e livello di realismo",',
            '  "depth":"regole di causalità, persistenza, economia/istituzioni e autonomia degli attori",',
            '  "prologue":"scena iniziale in seconda persona (500-1400 caratteri), concreta e senza decidere per il protagonista",',
            '  "startTime":{"day":numero,"month":numero,"year":numero,"hour":numero,"minute":numero},',
            '  "starterProperties":[],',
            '  "canonFacts":["4-8 fatti già veri"],',
            '  "openThreads":["3-7 tensioni aperte"],',
            '  "historicalGrounding":{"mode":"real|plausible|fictional","date":"...","region":"...","politicalContext":"...","documentedFacts":["..."],"fictionalizedElements":["..."]},',
            '  "worldBlueprint":{',
            '    "centralConflict":"...", "stakes":"...",',
            '    "scope":{"scale":"locale|regionale|multi-area|geopolitica","primaryArea":"...","secondaryAreas":["..."],"travelLogic":"..."},',
            '    "institutions":{"politicalSystem":"...","economy":"...","law":"...","socialStructure":"...","technology":"...","cultureReligion":"..."},',
            '    "locationNeeds":[{"nameHint":"...","type":"...","purpose":"...","storyLink":"..."}],',
            '    "factionNeeds":[{"nameHint":"...","type":"...","roleInConflict":"...","goal":"...","resources":"...","autonomousPressure":"..."}],',
            '    "characterNeeds":[{"nameHint":"...","role":"...","storyFunction":"...","factionHint":"...","locationHint":"...","publicGoal":"...","privateGoal":"...","autonomy":"..."}],',
            '    "activeForces":[{"name":"...","actor":"...","objective":"...","cause":"...","escalation":"..."}],',
            '    "startingSituation":{"locationHint":"...","immediateProblem":"...","openThreads":["..."],"firstDecision":"..."}',
            '  }',
            '}',
            '',
            'Quantità: locationNeeds 6-10, factionNeeds 3-5, characterNeeds 6-10, activeForces 3-5.',
            'Non usare segnaposto generici. Mantieni la scala richiesta dal giocatore.',
            historical
                ? 'VINCOLO STORICO: la data e l’area richieste sono vincoli forti. Usa istituzioni, poteri, tecnologia, moneta, religione e struttura sociale plausibili per quell’epoca; distingui fatti storici generali da personaggi locali inventati.'
                : 'Per campagne non storiche, historicalGrounding.mode può essere "fictional".',
            'Prima di rispondere verifica che il JSON sia completo e chiuso.'
        ].filter(Boolean).join('\n');
    }

    function buildWorldPrompt(seed, core) {
        const blueprint = core.worldBlueprint || {};
        return [
            'Sei il world-builder della stessa campagna. Ora concretizza geografia, poteri e forze del mondo. NON generare ancora i PNG individuali.',
            'Restituisci esclusivamente UN oggetto JSON valido.',
            '',
            '=== CAMPAGNA ===',
            seedSummary(seed),
            `Canone: ${JSON.stringify({ title: core.title, setting: core.setting, startTime: core.startTime, historicalGrounding: core.historicalGrounding, worldBlueprint: blueprint })}`,
            '',
            '=== OUTPUT ===',
            '{"worldSeed":{',
            '  "worldName":"...","premise":"...","centralConflict":"...","stakes":"...",',
            '  "continents":[{"name":"macroarea geografica coerente","nations":[{"name":"entità politica reale/plausibile, non necessariamente Stato moderno","government":"...","controllingFaction":"...","regions":[{"name":"...","terrain":"forest|mountain|plains|coast|desert|wetland|urban|tundra|volcanic","locations":[{"name":"...","type":"city|village|castle|port|temple|fortress|market|mine|farm|tavern|ruins|camp|monastery|bridge|crossroads","x":0,"y":0,"description":"...","resource":"...","danger":"...","connections":["nomi luoghi esistenti"]}]}]}]}],',
            '  "factions":[{"name":"...","type":"...","leader":"...","ideology":"...","base":"luogo esistente","territory":"regione o entità esistente","description":"...","goal":"...","strategy":"...","resources":"...","influence":0,"militaryStrength":0,"intelligence":0,"hostility":0,"legitimacy":0,"tactics":"...","grievance":"...","nextMove":"...","relationship":"alleata|avversaria|neutrale|variabile"}],',
            '  "relations":[{"from":"fazione","to":"fazione","type":"...","trust":0,"tension":0,"description":"..."}],',
            '  "forces":[{"name":"...","actor":"...","objective":"...","progress":0,"urgency":0,"cause":"...","opposition":["..."],"consequenceAt100":"..."}],',
            '  "npcs":[], "startLocation":"nome luogo esistente"',
            '}}',
            '',
            'Crea 8-14 luoghi concreti, 3-6 fazioni/poteri, 3-6 relazioni tra fazioni e 3-6 forze attive.',
            'Le coordinate sono su canvas 1000x650 e devono essere distribuite. Le connections devono riferirsi soltanto a luoghi realmente presenti.',
            'Per ambientazioni storiche non trasformare entità medievali/antiche in Stati nazionali moderni. Usa il contenitore continents/nations solo come gerarchia tecnica.',
            'Conserva conflitto, scala, data e istituzioni del canone. JSON completo e chiuso.'
        ].join('\n');
    }

    function compactWorldForNpc(worldSeed) {
        const locations = [];
        asArray(worldSeed?.continents).forEach(continent => asArray(continent?.nations).forEach(nation => asArray(nation?.regions).forEach(region => {
            asArray(region?.locations).forEach(location => locations.push({ name: clean(location?.name, 120), region: clean(region?.name, 120), nation: clean(nation?.name, 120) }));
        })));
        return {
            worldName: clean(worldSeed?.worldName, 140),
            startLocation: clean(worldSeed?.startLocation, 140),
            locations: locations.slice(0, 20),
            factions: asArray(worldSeed?.factions).slice(0, 8).map(faction => ({
                name: clean(faction?.name, 120), leader: clean(faction?.leader, 120), base: clean(faction?.base, 120), territory: clean(faction?.territory, 120), goal: clean(faction?.goal, 220), relationship: clean(faction?.relationship, 80)
            })),
            forces: asArray(worldSeed?.forces).slice(0, 8).map(force => ({ name: clean(force?.name, 120), actor: clean(force?.actor, 120), objective: clean(force?.objective, 220) }))
        };
    }

    function buildNpcPrompt(seed, core, worldSeed) {
        return [
            'Sei il casting director e simulatore sociale della stessa campagna. Crea i PNG canonici e le loro relazioni usando SOLO luoghi e fazioni già esistenti.',
            'Restituisci esclusivamente UN oggetto JSON valido.',
            '',
            `Campagna: ${JSON.stringify({ title: core.title, setting: core.setting, startTime: core.startTime, characterNeeds: core.worldBlueprint?.characterNeeds, activeForces: core.worldBlueprint?.activeForces })}`,
            `Mondo disponibile: ${JSON.stringify(compactWorldForNpc(worldSeed))}`,
            '',
            '=== OUTPUT ===',
            '{',
            '  "npcs":[{"name":"nome proprio coerente","role":"...","faction":"fazione esistente o vuoto","location":"luogo esistente","description":"...","personality":"...","goal":"...","publicGoal":"...","privateGoal":"...","strategy":"...","resources":"...","influence":0,"knowledge":"...","agenda":"...","leverage":"...","constraints":"...","relationship":"alleato|avversario|neutrale|variabile","gender":"..."}],',
            '  "relations":[{"from":"PNG o fazione esistente","to":"PNG o fazione esistente","type":"alleanza|rivalità|dipendenza|conflitto|cooperazione|parentela|altro","trust":0,"tension":0,"description":"..."}]',
            '}',
            '',
            'Crea 7-12 PNG e 6-12 relazioni. Devono esserci alleati, avversari e neutrali/variabili.',
            'Almeno 2 PNG devono perseguire obiettivi importanti indipendenti dal protagonista. Ogni PNG deve poter agire autonomamente fuori scena.',
            'Non creare il protagonista. Non inventare nuovi luoghi o nuove fazioni. Niente nomi-segnaposto. JSON completo e chiuso.'
        ].join('\n');
    }

    function phaseMessages(name, prompt) {
        return [
            { role: 'system', content: `Sei il modulo ${name} di un motore GDR persistente. Produci esclusivamente JSON valido e completo. Non mostrare ragionamento interno.` },
            { role: 'user', content: prompt }
        ];
    }

    async function requestPhase(name, prompt, options = {}) {
        if (typeof root.requestConfiguredAI !== 'function') throw new Error('Motore AI non disponibile nell’app.');
        const task = options.task || 'story';
        let lastError = null;
        for (let attempt = 1; attempt <= MAX_PHASE_ATTEMPTS; attempt++) {
            const repair = attempt === 1 ? prompt : `${prompt}\n\nLa risposta precedente della fase ${name} non era valida: ${clean(lastError?.message, 500)}. Rigenera l’intero JSON da zero, più compatto ma completo.`;
            try {
                const response = await root.requestConfiguredAI(phaseMessages(name, repair), {
                    task,
                    maxInputTokens: options.maxInputTokens || 12000,
                    maxTokens: options.maxTokens || 3600,
                    timeoutMs: options.timeoutMs || 90000,
                    maxAttempts: 2,
                    temperature: options.temperature ?? 0.5,
                    format: 'json',
                    cacheTtlMs: 0
                });
                return extractJson(response);
            } catch (error) {
                lastError = error;
                console.warn(`[StoryGenerationV26] ${name} tentativo ${attempt} fallito:`, error);
            }
        }
        throw new Error(`${name}: ${lastError?.message || 'generazione fallita'}`);
    }

    function countWorld(worldSeed) {
        let regions = 0;
        let locations = 0;
        asArray(worldSeed?.continents).forEach(continent => asArray(continent?.nations).forEach(nation => asArray(nation?.regions).forEach(region => {
            regions++;
            locations += asArray(region?.locations).length;
        })));
        return {
            regions,
            locations,
            factions: asArray(worldSeed?.factions).length,
            npcs: asArray(worldSeed?.npcs).length,
            relations: asArray(worldSeed?.relations).length,
            forces: asArray(worldSeed?.forces).length
        };
    }

    function validateCore(core, seed) {
        const issues = [];
        if (clean(core?.desc, 5000).length < 250) issues.push('descrizione troppo breve');
        if (clean(core?.prologue, 5000).length < 250) issues.push('prologo troppo breve');
        if (asArray(core?.worldBlueprint?.locationNeeds).length < 5) issues.push('locationNeeds insufficienti');
        if (asArray(core?.worldBlueprint?.factionNeeds).length < 3) issues.push('factionNeeds insufficienti');
        if (asArray(core?.worldBlueprint?.characterNeeds).length < 5) issues.push('characterNeeds insufficienti');
        if (asArray(core?.worldBlueprint?.activeForces).length < 3) issues.push('activeForces insufficienti');
        if (clean(seed?.genre, 80).toLowerCase() === 'historical') {
            if (!clean(core?.historicalGrounding?.politicalContext, 1200)) issues.push('grounding storico mancante');
            if (asArray(core?.historicalGrounding?.documentedFacts).length < 2) issues.push('fatti storici insufficienti');
        }
        if (issues.length) throw new Error(`Canone incompleto: ${issues.join('; ')}`);
    }

    function validateWorld(worldSeed) {
        const stats = countWorld(worldSeed);
        const issues = [];
        if (stats.regions < 2) issues.push('meno di 2 regioni');
        if (stats.locations < 6) issues.push('meno di 6 luoghi');
        if (stats.factions < 3) issues.push('meno di 3 fazioni');
        if (stats.forces < 3) issues.push('meno di 3 forze attive');
        if (!clean(worldSeed?.startLocation, 140)) issues.push('startLocation mancante');
        if (issues.length) throw new Error(`Mondo incompleto: ${issues.join('; ')}`);
        return stats;
    }

    function validatePeople(people, worldSeed) {
        const locationNames = new Set();
        asArray(worldSeed?.continents).forEach(continent => asArray(continent?.nations).forEach(nation => asArray(nation?.regions).forEach(region => asArray(region?.locations).forEach(location => locationNames.add(clean(location?.name, 140))))));
        const factionNames = new Set(asArray(worldSeed?.factions).map(faction => clean(faction?.name, 140)));
        const npcs = asArray(people?.npcs);
        if (npcs.length < 6) throw new Error('PNG insufficienti: ne servono almeno 6.');
        const invalidLocation = npcs.find(npc => clean(npc?.location, 140) && !locationNames.has(clean(npc.location, 140)));
        if (invalidLocation) throw new Error(`PNG ${clean(invalidLocation.name, 120)} usa un luogo inesistente: ${clean(invalidLocation.location, 120)}`);
        const invalidFaction = npcs.find(npc => clean(npc?.faction, 140) && !factionNames.has(clean(npc.faction, 140)));
        if (invalidFaction) throw new Error(`PNG ${clean(invalidFaction.name, 120)} usa una fazione inesistente: ${clean(invalidFaction.faction, 120)}`);
        if (asArray(people?.relations).length < 4) throw new Error('Relazioni tra PNG/fazioni insufficienti.');
    }

    function mergeStory(seed, core, worldPhase, people) {
        const worldSeed = clone(worldPhase?.worldSeed || worldPhase || {});
        worldSeed.npcs = asArray(people?.npcs).map(clone);
        worldSeed.relations = [
            ...asArray(worldSeed.relations).map(clone),
            ...asArray(people?.relations).map(clone)
        ];
        validateCore(core, seed);
        validateWorld(worldSeed);
        validatePeople(people, worldSeed);

        const storyApi = root.CronacheStoryGenerator;
        if (!storyApi?.completeStory) throw new Error('Generatore storia non disponibile.');
        const story = storyApi.completeStory({
            ...core,
            genre: seed.genre || core.genre,
            worldSeed,
            historicalGrounding: core.historicalGrounding,
            generationVersion: VERSION
        }, seed);
        story.worldSeed = worldSeed;
        story.historicalGrounding = clone(core.historicalGrounding || story.historicalGrounding || {});
        story.generationVersion = VERSION;
        return story;
    }

    function notify(message, type) {
        if (typeof root.notify === 'function') root.notify(message, type);
        else if (type === 'error') console.error(message);
        else console.info(message);
    }

    function setButton(button, busy, label) {
        if (!button) return;
        button.disabled = Boolean(busy);
        button.setAttribute('aria-busy', busy ? 'true' : 'false');
        button.textContent = label;
    }

    async function generateFromEditor() {
        const doc = root.document;
        const button = doc?.getElementById('btn-generate-story');
        if (!button || button.dataset.storyGenerationBusy === '1') return null;
        if (typeof root.getStoryEditorSeed !== 'function' || typeof root.getStoryEditorProperties !== 'function') {
            notify('Editor storia non inizializzato.', 'error');
            return null;
        }

        const seed = { ...root.getStoryEditorSeed(), starterProperties: root.getStoryEditorProperties() };
        if (!clean(seed.idea || seed.desc, 1200) && !clean(seed.setting, 300)) {
            notify('Inserisci almeno un’idea o un’ambientazione.', 'error');
            return null;
        }

        button.dataset.storyGenerationBusy = '1';
        try {
            const recovery = root.CronacheAICredentialRecoveryV24 || root.CronacheAICredentialRecoveryV23;
            if (typeof recovery?.syncSettingsFromUi === 'function') {
                await recovery.syncSettingsFromUi(doc, root.localStorage).catch(() => false);
            }

            setButton(button, true, '1/3 · IA: creo il canone…');
            const core = await requestPhase('CANONE', buildCorePrompt(seed), { task: 'story', maxTokens: 3600, timeoutMs: 90000, temperature: 0.52 });
            validateCore(core, seed);

            setButton(button, true, '2/3 · IA: creo mondo e fazioni…');
            const worldPhase = await requestPhase('MONDO', buildWorldPrompt(seed, core), { task: 'world-generation', maxTokens: 4400, timeoutMs: 100000, temperature: 0.5 });
            const worldSeed = worldPhase?.worldSeed || worldPhase;
            validateWorld(worldSeed);

            setButton(button, true, '3/3 · IA: creo PNG e relazioni…');
            const people = await requestPhase('PNG', buildNpcPrompt(seed, core, worldSeed), { task: 'world-npcs', maxTokens: 3800, timeoutMs: 100000, temperature: 0.56 });
            const story = mergeStory(seed, core, worldPhase, people);
            const stats = countWorld(story.worldSeed);

            root.__cronacheGeneratedStoryDraft = story;
            if (typeof root.renderGeneratedStory === 'function') root.renderGeneratedStory(story);
            notify(`Storia generata: ${stats.locations} luoghi, ${stats.factions} fazioni, ${stats.npcs} PNG, ${stats.relations} relazioni.`, 'success');
            return story;
        } catch (error) {
            console.error('[StoryGenerationV26] Generazione fallita:', error);
            const credential = (root.CronacheAICredentialRecoveryV24 || root.CronacheAICredentialRecoveryV23)?.providerCredential?.(doc, root.localStorage);
            const credentialHint = credential?.apiKeyPresent ? ` Provider ${credential.provider}: chiave rilevata da ${credential.source}.` : '';
            notify(`Generazione IA fallita: ${error?.message || error}.${credentialHint}`, 'error');
            return null;
        } finally {
            delete button.dataset.storyGenerationBusy;
            setButton(button, false, '✨ Genera storia completa');
        }
    }

    function bind(doc = root.document) {
        state.bindAttempts++;
        const button = doc?.getElementById('btn-generate-story');
        if (!button || typeof root.requestConfiguredAI !== 'function' || typeof root.getStoryEditorSeed !== 'function') return false;
        button.onclick = event => {
            event?.preventDefault?.();
            generateFromEditor();
        };
        button.dataset.storyGenerationVersion = String(VERSION);
        root.generateStoryFromEditor = generateFromEditor;
        return true;
    }

    function install(doc = root.document, win = root) {
        const run = () => {
            const ok = bind(doc);
            if (ok && state.intervalId && state.bindAttempts >= 4) {
                try { win.clearInterval(state.intervalId); } catch (_error) { }
                state.intervalId = null;
            }
            return ok;
        };
        run();
        if (doc?.readyState === 'loading') doc.addEventListener('DOMContentLoaded', run, { once: true });
        if (typeof win?.setTimeout === 'function') [0, 250, 1000, 2500].forEach(delay => win.setTimeout(run, delay));
        if (typeof win?.setInterval === 'function' && !state.intervalId) {
            state.intervalId = win.setInterval(() => {
                if (state.bindAttempts >= 30) {
                    try { win.clearInterval(state.intervalId); } catch (_error) { }
                    state.intervalId = null;
                    return;
                }
                run();
            }, 500);
        }
        return true;
    }

    return {
        VERSION,
        buildCorePrompt,
        buildWorldPrompt,
        buildNpcPrompt,
        extractJson,
        requestPhase,
        countWorld,
        validateCore,
        validateWorld,
        validatePeople,
        mergeStory,
        generateFromEditor,
        bind,
        install
    };
});