(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheStoryGenerationV22 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const VERSION = 22;
    const OUTPUT_TOKENS = 7600;
    const INPUT_TOKENS = 16000;
    const TIMEOUT_MS = 120000;
    const MAX_GENERATION_ROUNDS = 2;
    const PATCH_MARK = '__storyGenerationV22';

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 1200) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);

    function clone(value) {
        if (!value || typeof value !== 'object') return value;
        try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
    }

    function balancedObjects(text) {
        const source = String(text || '');
        const results = [];
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
            if (char === '"') {
                inString = true;
                continue;
            }
            if (char === '{') {
                if (depth === 0) start = index;
                depth++;
                continue;
            }
            if (char === '}' && depth > 0) {
                depth--;
                if (depth === 0 && start >= 0) {
                    results.push(source.slice(start, index + 1));
                    start = -1;
                }
            }
        }
        return results;
    }

    function sanitizeJsonCandidate(value) {
        return String(value || '')
            .replace(/^\uFEFF/, '')
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .trim()
            .replace(/,\s*([}\]])/g, '$1');
    }

    function extractJsonObject(response) {
        const text = String(response || '').trim();
        if (!text) throw new Error('Il modello ha restituito una risposta vuota.');

        const candidates = [];
        const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
            .map(match => match[1]?.trim())
            .filter(Boolean);
        candidates.push(...fenced);
        candidates.push(...balancedObjects(text));
        if (text.startsWith('{') && text.endsWith('}')) candidates.push(text);

        const unique = [...new Set(candidates.map(sanitizeJsonCandidate).filter(Boolean))]
            .sort((a, b) => b.length - a.length);
        let lastError = null;
        for (const candidate of unique) {
            try {
                const parsed = JSON.parse(candidate);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
            } catch (error) {
                lastError = error;
            }
        }

        const open = (text.match(/{/g) || []).length;
        const close = (text.match(/}/g) || []).length;
        if (open > close) {
            throw new Error('Il JSON della storia è stato troncato prima della chiusura.');
        }
        throw new Error(`Il modello non ha restituito un JSON valido${lastError?.message ? `: ${lastError.message}` : '.'}`);
    }

    function flattenLocations(worldSeed) {
        const locations = [];
        asArray(worldSeed?.continents).forEach(continent => {
            asArray(continent?.nations).forEach(nation => {
                asArray(nation?.regions).forEach(region => {
                    asArray(region?.locations).forEach(location => locations.push(location));
                });
            });
        });
        return locations;
    }

    function flattenRegions(worldSeed) {
        const regions = [];
        asArray(worldSeed?.continents).forEach(continent => {
            asArray(continent?.nations).forEach(nation => {
                asArray(nation?.regions).forEach(region => regions.push(region));
            });
        });
        return regions;
    }

    function worldSeedStats(worldSeed) {
        return {
            continents: asArray(worldSeed?.continents).length,
            regions: flattenRegions(worldSeed).length,
            locations: flattenLocations(worldSeed).length,
            factions: asArray(worldSeed?.factions).length,
            npcs: asArray(worldSeed?.npcs).length,
            relations: asArray(worldSeed?.relations).length,
            forces: asArray(worldSeed?.forces).length
        };
    }

    function validateGeneratedPayload(raw, story, seed = {}) {
        const issues = [];
        const blueprint = raw?.worldBlueprint || story?.worldBlueprint || {};
        const seedWorld = raw?.worldSeed || story?.worldSeed || {};
        const stats = worldSeedStats(seedWorld);
        const historical = String(seed?.genre || raw?.genre || story?.genre || '').toLowerCase() === 'historical';

        if (clean(raw?.desc, 5000).length < 300) issues.push('descrizione del mondo troppo breve');
        if (clean(raw?.prologue, 5000).length < 300) issues.push('prologo troppo breve');
        if (asArray(blueprint.locationNeeds).length < 6) issues.push('servono almeno 6 locationNeeds');
        if (asArray(blueprint.factionNeeds).length < 3) issues.push('servono almeno 3 factionNeeds');
        if (asArray(blueprint.characterNeeds).length < 6) issues.push('servono almeno 6 characterNeeds');
        if (asArray(blueprint.activeForces).length < 3) issues.push('servono almeno 3 activeForces');
        if (stats.continents < 1) issues.push('worldSeed senza gerarchia geografica');
        if (stats.regions < 2) issues.push('worldSeed deve contenere almeno 2 regioni/territori');
        if (stats.locations < 6) issues.push('worldSeed deve contenere almeno 6 luoghi concreti');
        if (stats.factions < 3) issues.push('worldSeed deve contenere almeno 3 fazioni/poteri');
        if (stats.npcs < 6) issues.push('worldSeed deve contenere almeno 6 NPC concreti');
        if (stats.relations < 3) issues.push('worldSeed deve contenere almeno 3 relazioni');
        if (stats.forces < 3) issues.push('worldSeed deve contenere almeno 3 forze/eventi in movimento');
        if (!clean(seedWorld.startLocation, 180)) issues.push('worldSeed.startLocation mancante');
        if (historical) {
            const grounding = raw?.historicalGrounding || story?.historicalGrounding || {};
            if (!clean(grounding.date, 160)) issues.push('historicalGrounding.date mancante');
            if (!clean(grounding.politicalContext, 1200)) issues.push('historicalGrounding.politicalContext mancante');
            if (asArray(grounding.documentedFacts).length < 3) issues.push('servono almeno 3 fatti storici di base');
            if (!asArray(grounding.fictionalizedElements).length) issues.push('indicare gli elementi locali inventati/plausibili');
        }
        return { valid: issues.length === 0, issues, stats };
    }

    function compactWorldSeedForPrompt(worldSeed) {
        if (!worldSeed || typeof worldSeed !== 'object') return '';
        const lines = [];
        const worldName = clean(worldSeed.worldName, 140);
        if (worldName) lines.push(`Mondo: ${worldName}`);
        asArray(worldSeed.continents).slice(0, 3).forEach(continent => {
            lines.push(`Continente/area: ${clean(continent?.name, 120)}`);
            asArray(continent?.nations).slice(0, 8).forEach(nation => {
                lines.push(`- Entità politica: ${clean(nation?.name, 120)}; governo: ${clean(nation?.government, 180)}; controllo: ${clean(nation?.controllingFaction, 120)}`);
                asArray(nation?.regions).slice(0, 8).forEach(region => {
                    const places = asArray(region?.locations).slice(0, 8).map(location => clean(location?.name, 100)).filter(Boolean);
                    lines.push(`  · Regione/territorio: ${clean(region?.name, 120)} (${clean(region?.terrain, 60)}); luoghi: ${places.join(', ')}`);
                });
            });
        });
        asArray(worldSeed.factions).slice(0, 8).forEach(faction => {
            lines.push(`Fazione: ${clean(faction?.name, 120)} | leader ${clean(faction?.leader, 120)} | territorio ${clean(faction?.territory, 120)} | obiettivo ${clean(faction?.goal, 220)} | rapporto ${clean(faction?.relationship, 100)}`);
        });
        asArray(worldSeed.npcs).slice(0, 15).forEach(npc => {
            lines.push(`NPC: ${clean(npc?.name, 120)} | ${clean(npc?.role, 120)} | fazione ${clean(npc?.faction, 120)} | luogo ${clean(npc?.location, 120)} | rapporto ${clean(npc?.relationship, 100)} | obiettivo ${clean(npc?.publicGoal || npc?.goal, 220)} | privato ${clean(npc?.privateGoal, 220)}`);
        });
        asArray(worldSeed.relations).slice(0, 12).forEach(rel => {
            lines.push(`Relazione: ${clean(rel?.from, 120)} -> ${clean(rel?.to, 120)} = ${clean(rel?.type, 90)}; tensione ${Number(rel?.tension) || 0}`);
        });
        asArray(worldSeed.forces).slice(0, 8).forEach(force => {
            lines.push(`Forza attiva: ${clean(force?.name, 140)} | attore ${clean(force?.actor, 120)} | obiettivo ${clean(force?.objective, 220)} | conseguenza ${clean(force?.consequenceAt100 || force?.escalation, 260)}`);
        });
        if (worldSeed.startLocation) lines.push(`Luogo iniziale: ${clean(worldSeed.startLocation, 120)}`);
        return lines.join('\n').slice(0, 14000);
    }

    function buildEnhancedPrompt(basePrompt, seed = {}) {
        const historical = String(seed.genre || '').toLowerCase() === 'historical';
        return [
            String(basePrompt || '').trim(),
            '',
            '=== MONDO CONCRETO OBBLIGATORIO NELLA STESSA RISPOSTA ===',
            'Oltre al worldBlueprint devi generare anche worldSeed: il cast, la geografia e gli schieramenti canonici che il gioco userà davvero.',
            'worldSeed deve avere ESATTAMENTE questa struttura generale, compatibile con il world-builder:',
            '{',
            '  "worldName":"...", "premise":"...", "centralConflict":"...", "stakes":"...",',
            '  "continents":[{"name":"...","nations":[{"name":"...","government":"...","controllingFaction":"...","regions":[{"name":"...","terrain":"...","locations":[{"name":"...","type":"...","x":0-1000,"y":0-650,"description":"...","resource":"...","danger":"...","connections":["..."]}]}]}]}],',
            '  "factions":[{"name":"...","type":"...","leader":"...","ideology":"...","base":"luogo esistente","territory":"entità o regione esistente","description":"...","goal":"...","strategy":"...","resources":"...","influence":0-100,"militaryStrength":0-100,"intelligence":0-100,"hostility":0-100,"legitimacy":0-100,"tactics":"...","grievance":"...","nextMove":"...","relationship":"alleata|avversaria|neutrale|variabile"}],',
            '  "npcs":[{"name":"...","role":"...","faction":"...","location":"luogo esistente","description":"...","personality":"...","goal":"...","publicGoal":"...","privateGoal":"...","strategy":"...","resources":"...","influence":0-100,"knowledge":"...","agenda":"...","leverage":"...","constraints":"...","relationship":"alleato|avversario|neutrale|variabile","gender":"..."}],',
            '  "relations":[{"from":"...","to":"...","type":"alleanza|rivalità|dipendenza|conflitto|cooperazione|altro","trust":0-100,"tension":0-100,"description":"..."}],',
            '  "forces":[{"name":"...","actor":"...","objective":"...","progress":0-100,"urgency":0-100,"cause":"...","opposition":["..."],"consequenceAt100":"..."}],',
            '  "startLocation":"nome di un luogo esistente"',
            '}.',
            '- worldSeed: 6-14 luoghi concreti, 3-6 fazioni/poteri, 6-12 NPC, 4-10 relazioni, 3-6 forze attive.',
            '- Devono esserci alleati, avversari e soggetti neutrali/variabili. Nessuno deve esistere solo per servire il protagonista.',
            '- Ogni NPC deve avere nome proprio, luogo, ruolo, obiettivo pubblico e privato, risorse, vincoli e capacità di agire autonomamente.',
            '- Le regioni confinanti e i poteri vicini devono avere interessi concreti: commercio, diritto, tributi, guerra, successione, religione, risorse o prestigio, secondo l’epoca e la premessa.',
            '- Le coordinate devono essere distribuite e le connections devono indicare solo luoghi esistenti.',
            '',
            '=== GROUNDING / STORICITÀ ===',
            'Aggiungi historicalGrounding = {"mode":"real|plausible|fictional","date":"...","region":"...","politicalContext":"...","documentedFacts":["..."],"fictionalizedElements":["..."]}.',
            historical
                ? '- STORIA STORICA: tratta la data richiesta come vincolo forte. Usa poteri, istituzioni, cariche, tecnologia, moneta, struttura sociale e religione plausibili per quella data. Non proiettare lo Stato nazionale moderno nel passato. I grandi attori/poteri storici devono essere reali quando pertinenti; gli NPC locali inventati devono essere dichiarati in fictionalizedElements, non spacciati per personaggi documentati.'
                : '- Per generi non storici, historicalGrounding può indicare mode="fictional" e chiarire quali elementi sono canone inventato.',
            '- Se l’idea nomina un luogo reale, non sostituirlo con un equivalente fantasy.',
            '- Non usare segnaposto come “Regno vicino”, “Autorità locale”, “Nobile rivale”, “Mercante X”: assegna nomi e identità concrete.',
            '',
            'IMPORTANTE: restituisci l’intero JSON in una sola risposta. Non troncare worldSeed, NPC, fazioni, prologo o array finali.'
        ].filter(Boolean).join('\n');
    }

    function buildRepairPrompt(originalPrompt, issueMessage) {
        return [
            originalPrompt,
            '',
            '=== RIGENERAZIONE OBBLIGATORIA ===',
            `La risposta precedente non era utilizzabile: ${clean(issueMessage, 700)}.`,
            'Rigenera DA ZERO l’intero oggetto JSON. Non fare una patch e non spiegare l’errore.',
            'Controlla prima di inviare: JSON chiuso e valido; tutti i campi top-level; worldBlueprint completo; worldSeed completo; historicalGrounding completo; quantità minime rispettate.',
            'Riduci le descrizioni secondarie se necessario, ma NON eliminare NPC, luoghi, fazioni, relazioni o forze richieste.'
        ].join('\n');
    }

    function normalizeHiddenFields(value, fallback = null) {
        if (!value || typeof value !== 'object') return fallback;
        return clone(value);
    }

    function patchStoryApi() {
        const storyApi = root.CronacheStoryGenerator;
        if (!storyApi || storyApi[PATCH_MARK]) return false;

        const originalPrompt = storyApi.buildGenerationPrompt?.bind(storyApi);
        if (originalPrompt) {
            storyApi.buildGenerationPrompt = function storyGenerationV22Prompt(seed = {}) {
                return buildEnhancedPrompt(originalPrompt(seed), seed);
            };
        }

        const previousComplete = storyApi.completeStory?.bind(storyApi);
        if (previousComplete) {
            storyApi.completeStory = function storyGenerationV22Complete(input = {}, seed = {}) {
                const draft = root.__cronacheGeneratedStoryDraft;
                const source = input && typeof input === 'object' ? { ...input } : {};
                const compatibleDraft = draft && typeof draft === 'object' &&
                    (!source.genre || !draft.genre || String(source.genre) === String(draft.genre));
                if (!source.worldSeed && seed?.worldSeed) source.worldSeed = seed.worldSeed;
                if (!source.historicalGrounding && seed?.historicalGrounding) source.historicalGrounding = seed.historicalGrounding;
                if (compatibleDraft && !source.worldSeed) source.worldSeed = draft.worldSeed;
                if (compatibleDraft && !source.historicalGrounding) source.historicalGrounding = draft.historicalGrounding;
                const completed = previousComplete(source, seed);
                if (source.worldSeed) completed.worldSeed = normalizeHiddenFields(source.worldSeed, null);
                if (source.historicalGrounding) completed.historicalGrounding = normalizeHiddenFields(source.historicalGrounding, null);
                completed.generationVersion = VERSION;
                return completed;
            };
        }

        storyApi.parseGeneratedStory = function storyGenerationV22Parse(response, seed = {}) {
            const raw = extractJsonObject(response);
            const story = storyApi.completeStory({
                ...raw,
                genre: seed.genre || raw.genre
            }, seed);
            return story;
        };

        storyApi[PATCH_MARK] = true;
        return true;
    }

    function patchAiBudget() {
        const ai = root.CronacheAI;
        if (!ai || ai.__storyGenerationV22Budget || typeof ai.getTaskProfile !== 'function') return false;
        const previous = ai.getTaskProfile.bind(ai);
        ai.getTaskProfile = function storyGenerationV22Profile(task, overrides = {}) {
            const profile = previous(task, overrides);
            if (task !== 'story') return profile;
            return {
                ...profile,
                maxInputTokens: Math.max(INPUT_TOKENS, Number(profile.maxInputTokens) || 0),
                maxOutputTokens: Math.max(OUTPUT_TOKENS, Number(profile.maxOutputTokens) || 0),
                timeoutMs: Math.max(TIMEOUT_MS, Number(profile.timeoutMs) || 0),
                maxAttempts: Math.max(3, Number(profile.maxAttempts) || 0),
                temperature: Math.min(0.64, Number.isFinite(Number(profile.temperature)) ? Number(profile.temperature) : 0.58)
            };
        };
        ai.__storyGenerationV22Budget = true;
        return true;
    }

    function patchWorldGenerator() {
        const generator = root.CronacheWorldGenerator;
        if (!generator || generator.__storyGenerationV22Canon) return false;
        const names = ['buildGenerationPrompt', 'buildLocationsPrompt', 'buildNpcPrompt'];
        names.forEach(name => {
            const previous = generator[name];
            if (typeof previous !== 'function') return;
            generator[name] = function storyGenerationV22WorldPrompt(...args) {
                const result = previous.apply(this, args);
                const story = name === 'buildNpcPrompt' ? args[1] : args[0];
                if (!story?.worldSeed && !story?.historicalGrounding) return result;
                const seedText = compactWorldSeedForPrompt(story.worldSeed);
                const grounding = story.historicalGrounding ? JSON.stringify(story.historicalGrounding) : '';
                return [
                    result,
                    '',
                    '=== CANONE GIÀ GENERATO DALLA CREAZIONE STORIA ===',
                    seedText,
                    grounding ? `Grounding storico: ${grounding}` : '',
                    'REGOLA: conserva nomi, geografia, schieramenti, ruoli, relazioni e luogo iniziale già definiti. Puoi aggiungere dettaglio e correggere riferimenti tecnici, ma non sostituire questo canone con archetipi generici.'
                ].filter(Boolean).join('\n');
            };
        });
        generator.__storyGenerationV22Canon = true;
        return true;
    }

    function storyRequestMessages(prompt) {
        return [
            {
                role: 'system',
                content: [
                    'Sei il motore di creazione campagne di un GDR persistente.',
                    'Devi produrre dati canonici concreti, non una sinossi generica.',
                    'Rispondi esclusivamente con UN oggetto JSON valido e completo, senza markdown, prefazioni, commenti o ragionamento.',
                    'Per campagne storiche separa fatti/documentazione generale da personaggi locali plausibili inventati; evita anacronismi e nomi-segnaposto.',
                    'Prima di terminare verifica che tutte le parentesi e gli array JSON siano chiusi.'
                ].join(' ')
            },
            { role: 'user', content: String(prompt || '') }
        ];
    }

    async function requestStory(prompt) {
        if (typeof root.requestConfiguredAI !== 'function') {
            throw new Error('Il motore AI dell’app non è ancora disponibile. Riapri l’editor e riprova.');
        }
        return root.requestConfiguredAI(storyRequestMessages(prompt), {
            task: 'story',
            maxInputTokens: INPUT_TOKENS,
            maxTokens: OUTPUT_TOKENS,
            timeoutMs: TIMEOUT_MS,
            maxAttempts: 3,
            temperature: 0.58,
            format: 'json',
            cacheTtlMs: 0
        });
    }

    function parseRichStoryResponse(response, seed = {}) {
        const storyApi = root.CronacheStoryGenerator;
        if (!storyApi) throw new Error('Generatore storia non caricato.');
        const raw = extractJsonObject(response);
        const story = storyApi.completeStory({ ...raw, genre: seed.genre || raw.genre }, seed);
        const quality = validateGeneratedPayload(raw, story, seed);
        return { raw, story, quality };
    }

    function notify(message, type) {
        if (typeof root.notify === 'function') root.notify(message, type);
        else if (type === 'error') console.error(message);
        else console.info(message);
    }

    function setButtonState(button, busy, text) {
        if (!button) return;
        button.disabled = Boolean(busy);
        button.setAttribute('aria-busy', busy ? 'true' : 'false');
        button.textContent = text;
    }

    async function generateFromEditor() {
        const doc = root.document;
        const button = doc?.getElementById('btn-generate-story');
        if (!button || button.dataset.storyGenerationBusy === '1') return;
        if (typeof root.getStoryEditorSeed !== 'function' || typeof root.getStoryEditorProperties !== 'function') {
            notify('Editor storia non inizializzato correttamente.', 'error');
            return;
        }

        const seed = {
            ...root.getStoryEditorSeed(),
            starterProperties: root.getStoryEditorProperties()
        };
        const idea = clean(seed.idea || seed.desc, 1200);
        if (!idea && !clean(seed.setting, 300)) {
            notify('Inserisci almeno un’idea o un’ambientazione prima di generare la storia.', 'error');
            return;
        }

        button.dataset.storyGenerationBusy = '1';
        const originalText = '✨ Genera storia completa';
        let lastError = null;
        let prompt = root.CronacheStoryGenerator.buildGenerationPrompt(seed);

        try {
            for (let round = 1; round <= MAX_GENERATION_ROUNDS; round++) {
                setButtonState(button, true, round === 1
                    ? '✨ IA: creo storia, mondo e NPC…'
                    : '🛠️ IA: completo i dati mancanti…');
                try {
                    const response = await requestStory(prompt);
                    const parsed = parseRichStoryResponse(response, seed);
                    if (!parsed.quality.valid) {
                        throw new Error(`Scheda incompleta: ${parsed.quality.issues.join('; ')}`);
                    }
                    root.__cronacheGeneratedStoryDraft = parsed.story;
                    if (typeof root.renderGeneratedStory === 'function') root.renderGeneratedStory(parsed.story);
                    const stats = parsed.quality.stats;
                    notify(`Storia generata dall’IA: ${stats.locations} luoghi, ${stats.factions} fazioni, ${stats.npcs} NPC e ${stats.forces} forze attive.`, 'success');
                    return parsed.story;
                } catch (error) {
                    lastError = error;
                    console.warn(`[StoryGenerationV22] Tentativo ${round} fallito:`, error);
                    if (round < MAX_GENERATION_ROUNDS) {
                        prompt = buildRepairPrompt(root.CronacheStoryGenerator.buildGenerationPrompt(seed), error?.message || 'risposta incompleta');
                    }
                }
            }
            throw lastError || new Error('Generazione non completata.');
        } catch (error) {
            console.error('[StoryGenerationV22] Generazione IA fallita:', error);
            notify(`Generazione IA non riuscita: ${error.message}. I campi esistenti non sono stati sostituiti da una storia locale generica.`, 'error');
            return null;
        } finally {
            delete button.dataset.storyGenerationBusy;
            setButtonState(button, false, originalText);
        }
    }

    function patchRuntimeFunctions(doc = root.document) {
        if (!doc) return false;
        patchStoryApi();
        patchAiBudget();
        patchWorldGenerator();

        if (typeof root.requestConfiguredAI === 'function') {
            root.requestStoryGeneration = requestStory;
        }
        if (typeof root.getStoryEditorSeed === 'function') {
            root.generateStoryFromEditor = generateFromEditor;
        }
        const button = doc.getElementById('btn-generate-story');
        if (button) {
            button.onclick = event => {
                event?.preventDefault?.();
                generateFromEditor();
            };
            button.dataset.storyGenerationVersion = String(VERSION);
        }
        return Boolean(button && typeof root.requestConfiguredAI === 'function');
    }

    function install(doc = root.document, win = root) {
        patchStoryApi();
        patchAiBudget();
        patchWorldGenerator();
        const run = () => patchRuntimeFunctions(doc);
        run();
        if (doc?.readyState === 'loading') doc.addEventListener('DOMContentLoaded', run, { once: true });
        if (typeof win?.setTimeout === 'function') {
            win.setTimeout(run, 0);
            win.setTimeout(run, 250);
        }
        return true;
    }

    return {
        VERSION,
        OUTPUT_TOKENS,
        INPUT_TOKENS,
        TIMEOUT_MS,
        balancedObjects,
        extractJsonObject,
        worldSeedStats,
        validateGeneratedPayload,
        compactWorldSeedForPrompt,
        buildEnhancedPrompt,
        buildRepairPrompt,
        storyRequestMessages,
        parseRichStoryResponse,
        patchStoryApi,
        patchAiBudget,
        patchWorldGenerator,
        patchRuntimeFunctions,
        install
    };
});