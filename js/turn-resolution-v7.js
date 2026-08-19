(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheTurnResolutionV7 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const SCHEMA_VERSION = 1;
    const PATCH_VERSION = 1;
    const MAX_HISTORY = 80;

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 900) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, number(value, min)));
    const keyOf = value => clean(value, 600).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
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

    function deterministicD20(seed) {
        return (hashNumber(seed) % 20) + 1;
    }

    function normalizedGenre(state) {
        const raw = keyOf(`${state?.currentStory?.genre || ''} ${state?.currentStory?.setting || ''}`);
        if (/sport|calcio|football|basket|tennis|atlet/.test(raw)) return 'sport';
        if (/business|impresa|econom|finanza|azienda|broker/.test(raw)) return 'business';
        if (/crime|criminal|mafia|gang|noir/.test(raw)) return 'crime';
        if (/militar|guerra|war|esercit/.test(raw)) return 'military';
        if (/diplomat|geopolit|ambasci/.test(raw)) return 'diplomatic';
        if (/rural|agricol|fattoria|contadin/.test(raw)) return 'rural';
        if (/pirat|corsar|vela/.test(raw)) return 'pirate';
        if (/spia|spy|intelligence|servizi-segreti/.test(raw)) return 'spy';
        if (/stor|rinasc|medioev|antica|ottocent|vittorian/.test(raw)) return 'historical';
        if (/contempor|modern|oggi/.test(raw)) return 'contemporary';
        return 'fantasy';
    }

    function classifyContext(action, state = getState()) {
        const text = keyOf(action);
        const genre = normalizedGenre(state);
        const rules = [
            ['combat', /attacc|combat|colp|duell|spar|uccid|difend|lotta|scontro|battaglia|assalt/],
            ['negotiation', /negozi|convinc|persuad|tratt|accord|contratt|media|intimid|ricatt|chiedo-un-prestito|prestito|credito/],
            ['investigation', /indag|investig|esamin|analizz|cerc-indizi|interrog|verific|ricerca|scopr|ispezion/],
            ['stealth', /nascond|furtiv|infiltr|pedin|spion|rub|scassin|evit.*guard|sabot/],
            ['commerce', /compr|vend|prezz|fornitor|cliente|magazz|invest|affar|ordine|appalto|finanzi|assum|licenzi/],
            ['governance', /decreto|legge|govern|tassa|impost|fazione|consiglio|senato|assemblea|nomino|riforma|mobilit/],
            ['sport', /allen|partita|gara|match|tiro|passaggio|tattic|sprint|dribbl|segn|difesa|campionato/],
            ['travel', /viaggi|parto|raggiung|attravers|cavalc|navig|volo|cammin|marcia|rotta/],
            ['craft', /costru|ripar|fabbric|produ|creo|forgi|cucin|alchim|program|progetto/],
            ['social', /parl|chied|domand|salut|consol|seduc|present|raccont|confess|ascolt/]
        ];
        const found = rules.find(([, pattern]) => pattern.test(text));
        if (found) return found[0];
        if (genre === 'sport') return 'sport';
        if (genre === 'diplomatic') return 'negotiation';
        if (genre === 'business') return 'commerce';
        return 'general';
    }

    function requiresCheck(action, context) {
        const text = keyOf(action);
        if (!text) return false;
        if (/salut|guardo|osservo|ascolto|aspetto|riposo|mangio|dormo|apro-il-menu|controllo/.test(text)) return false;
        if (/provo|tento|cerco-di|risch|forzo|convinc|negozi|intimid|attacc|combat|fuggo|insegu|indag|infiltr|rub|sabot|persuad|corromp|sfid|scommett|gara|partita|riforma|decreto|investo|prestito/.test(text)) return true;
        return ['combat', 'stealth', 'negotiation', 'investigation', 'sport'].includes(context);
    }

    const CONTEXT_STAT_PREFERENCES = {
        combat: ['for', 'str', 'dex', 'vio', 'tec', 'vel', 'con'],
        negotiation: ['car', 'cha', 'neg', 'conn', 'resp', 'men', 'int'],
        investigation: ['int', 'wis', 'ast', 'per', 'tac', 'net'],
        stealth: ['dex', 'ast', 'vel', 'luck', 'lck', 'wis'],
        commerce: ['net', 'int', 'car', 'neg', 'conn', 'luck', 'lck'],
        governance: ['car', 'cha', 'int', 'neg', 'resp', 'tac', 'men'],
        sport: ['tec', 'tac', 'men', 'vel', 'for', 'dex'],
        travel: ['wis', 'con', 'for', 'tac', 'vel', 'luck', 'lck'],
        craft: ['int', 'dex', 'tec', 'wis', 'net'],
        social: ['car', 'cha', 'neg', 'conn', 'resp', 'wis'],
        general: ['int', 'car', 'cha', 'wis', 'dex', 'for', 'luck', 'lck']
    };

    function attributeEntries(character) {
        const attrs = character?.attrs && typeof character.attrs === 'object' ? character.attrs : {};
        return Object.entries(attrs).filter(([, value]) => Number.isFinite(Number(value)));
    }

    function selectAttribute(character, context) {
        const attrs = character?.attrs && typeof character.attrs === 'object' ? character.attrs : {};
        const entries = attributeEntries(character);
        const preferences = CONTEXT_STAT_PREFERENCES[context] || CONTEXT_STAT_PREFERENCES.general;
        for (const key of preferences) {
            if (Number.isFinite(Number(attrs[key]))) return { key, value: Number(attrs[key]) };
        }
        if (!entries.length) return { key: 'base', value: 10 };
        const best = entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0];
        return { key: best[0], value: Number(best[1]) };
    }

    function skillBonus(character, context, action) {
        const skills = asArray(character?.skills).map(item => keyOf(typeof item === 'string' ? item : item?.name));
        if (!skills.length) return 0;
        const corpus = keyOf(`${context} ${action}`);
        const related = {
            combat: /combatt|tiro|arma|difes|lotta|tattic/,
            negotiation: /negoz|diplom|persuas|psicolog|leadership|intervista|mediazion/,
            investigation: /indag|analisi|ricerca|percezion|investig|intelligence/,
            stealth: /furtiv|infiltr|spion|scassin|astuzia/,
            commerce: /strateg|budget|controll|valutaz|analisi|negoz|organizz/,
            governance: /leadership|diplom|politic|strateg|organizz|tattic/,
            sport: /tattic|tiro|passagg|visione|freddezza|leadership/,
            craft: /ripar|artig|alchim|elettron|tecnic|produzion/
        }[context] || /.^/;
        const hits = skills.filter(skill => related.test(skill) || (skill && corpus.includes(skill))).length;
        return Math.min(4, hits * 2);
    }

    function relationshipModifier(state, action, context) {
        if (!['negotiation', 'social', 'commerce', 'governance'].includes(context)) return 0;
        const text = keyOf(action);
        const bonds = Object.values(state?.worldMemory?.life?.bonds || state?.life?.bonds || {});
        let best = 0;
        bonds.forEach(bond => {
            const name = keyOf(bond?.name);
            if (!name || !text.includes(name)) return;
            const avg = (number(bond.trust) + number(bond.respect) + number(bond.affection)) / 3;
            best = Math.max(best, Math.round(clamp(avg / 25, -3, 3)));
        });
        const rawAgents = state?.worldMemory?.managementAgents?.agents;
        const agents = Array.isArray(rawAgents) ? rawAgents : Object.values(rawAgents || {});
        agents.forEach(agent => {
            const name = keyOf(agent?.name);
            if (!name || !text.includes(name)) return;
            best = Math.max(best, Math.round(clamp((number(agent.trust, 50) - 50) / 18, -3, 3)));
        });
        return best;
    }

    function conditionModifier(state, context) {
        const character = state?.character || {};
        let mod = 0;
        if (context === 'combat') {
            const health = character.health || {};
            if (number(health.max) > 0 && number(health.cur) / number(health.max) < 0.35) mod -= 2;
            const stamina = character.stamina || {};
            if (number(stamina.max) > 0 && number(stamina.cur) / number(stamina.max) < 0.25) mod -= 1;
        }
        if (context === 'governance') {
            const kingdom = state?.worldMemory?.kingdom || {};
            if (kingdom.active) mod += Math.round(clamp((number(kingdom.legitimacy, 50) - 50) / 25, -2, 2));
        }
        if (context === 'commerce') {
            const businesses = asArray(state?.worldMemory?.management?.businesses).filter(item => item?.status === 'active');
            if (businesses.some(item => number(item.cash) > 0 && number(item.reputation, 50) >= 65)) mod += 1;
            if (businesses.some(item => number(item.cash) < 0)) mod -= 1;
        }
        return mod;
    }

    function difficultyFor(action, context, state) {
        const text = keyOf(action);
        let difficulty = {
            combat: 13, negotiation: 12, investigation: 12, stealth: 13,
            commerce: 11, governance: 13, sport: 12, travel: 10, craft: 11,
            social: 9, general: 10
        }[context] || 10;
        if (/impossibil|estremo|disperat|fortezza|massima-sicurezza|senza-prove|contro-tutti|suicid/.test(text)) difficulty += 5;
        else if (/difficil|rischios|protett|segreto|elite|potente|ostile|rivale|urgente/.test(text)) difficulty += 3;
        if (/preparo|piano|studio|vantaggio|alleat|prove|document|garanzia|copertura/.test(text)) difficulty -= 1;
        const systemic = state?.worldMemory?.systemicWorld || {};
        if (context === 'commerce') {
            const markets = Object.values(systemic.markets || {});
            if (markets.some(item => number(item.competitionIndex) >= 80)) difficulty += 1;
        }
        return Math.max(6, Math.min(22, difficulty));
    }

    function outcomeFor(roll, total, difficulty) {
        const margin = total - difficulty;
        if (roll === 20) return { code: 'critical-success', label: 'successo eccezionale', margin };
        if (roll === 1) return { code: 'critical-failure', label: 'fallimento grave', margin };
        if (margin >= 5) return { code: 'strong-success', label: 'successo netto', margin };
        if (margin >= 0) return { code: 'success', label: 'successo con margine limitato', margin };
        if (margin >= -4) return { code: 'costly-failure', label: 'fallimento con costo o opportunità parziale', margin };
        return { code: 'hard-failure', label: 'fallimento netto', margin };
    }

    function ruleProfileFor(state, context) {
        const genre = normalizedGenre(state);
        const genreRules = {
            historical: 'status sociale, casata, reputazione, denaro disponibile, usi giuridici e tecnologie dell epoca',
            business: 'cassa, margini, contratti, reputazione, domanda, concorrenza e potere negoziale reale',
            sport: 'tecnica, forma, tattica, pressione, morale e qualità dell opposizione',
            crime: 'reputazione, prove, sospetti, rischio legale, relazioni e capacità operative',
            military: 'catena di comando, morale, terreno, logistica, intelligence e forza disponibile',
            diplomatic: 'mandato, reputazione, trattati, leve economiche, fazioni e reciprocità',
            spy: 'copertura, sospetto, accesso, intelligence, contatti e contro-sorveglianza',
            rural: 'stagione, scorte, strumenti, manodopera, condizioni naturali e mercato locale',
            pirate: 'equipaggio, nave, provviste, vento, rotta, reputazione e forze avversarie',
            contemporary: 'competenze, credenziali, denaro, legge, tecnologia, reputazione e relazioni',
            fantasy: 'abilità, equipaggiamento, conoscenze, risorse, reputazione e regole della magia già stabilite'
        };
        const contextRule = {
            combat: 'Il combattimento deve rispettare posizione, equipaggiamento, ferite, numero di avversari e possibilità reale di ritirata.',
            negotiation: 'La negoziazione deve rispettare interessi, fiducia, leve, promesse precedenti e alternative della controparte.',
            investigation: 'L investigazione può produrre solo indizi accessibili con i mezzi disponibili; non può rivelare automaticamente segreti non scoperti.',
            stealth: 'Furtività e infiltrazione dipendono da accesso, copertura, sorveglianza, tempo e conseguenze se scoperti.',
            commerce: 'Ogni esito economico deve essere compatibile con cassa, prezzi, inventario, contratti, reputazione e stato del mercato.',
            governance: 'Le decisioni politiche dipendono da autorità formale, legittimità, fazioni, risorse e capacità amministrativa.',
            sport: 'La prestazione dipende da qualità tecnica, tattica, forma, pressione e opposizione, non da un tiro generico isolato.',
            travel: 'Il viaggio deve rispettare distanza, accessibilità, mezzi, tempo e rischi conosciuti.',
            craft: 'Produzione e riparazione richiedono materiali, strumenti, tempo e competenza pertinenti.',
            social: 'Le reazioni sociali dipendono dal rapporto esistente e non possono cancellare memoria, rancori o interessi.',
            general: 'Usa una prova solo quando esiste vera incertezza con conseguenze significative.'
        }[context] || '';
        return `${genreRules[genre] || genreRules.fantasy}. ${contextRule}`.trim();
    }

    function ensureResolutionState(state = getState()) {
        if (!state?.worldMemory) return { schemaVersion: SCHEMA_VERSION, pending: null, history: [] };
        const memory = state.worldMemory;
        if (!memory.turnResolution || typeof memory.turnResolution !== 'object') {
            memory.turnResolution = { schemaVersion: SCHEMA_VERSION, pending: null, history: [] };
        }
        memory.turnResolution.schemaVersion = SCHEMA_VERSION;
        if (!Array.isArray(memory.turnResolution.history)) memory.turnResolution.history = [];
        return memory.turnResolution;
    }

    function resolveAction(action, state = getState()) {
        const text = clean(action, 1200);
        if (!text) return null;
        const registry = ensureResolutionState(state);
        const turn = Math.max(0, Math.round(number(state?.worldMemory?.turnCount)));
        const fingerprint = keyOf(`${turn}|${text}`);
        if (registry.pending?.fingerprint === fingerprint) return registry.pending;
        const context = classifyContext(text, state);
        const check = requiresCheck(text, context);
        const attribute = selectAttribute(state?.character, context);
        const attrModifier = Math.round((attribute.value - 10) / 2);
        const expertise = skillBonus(state?.character, context, text);
        const relation = relationshipModifier(state, text, context);
        const condition = conditionModifier(state, context);
        const difficulty = difficultyFor(text, context, state);
        const seed = `${state?.worldMemory?.worldGenerationSeed || state?.currentStory?.title || 'cronache'}|${turn}|${fingerprint}|resolution-v7`;
        const roll = check ? deterministicD20(seed) : null;
        const total = check ? roll + attrModifier + expertise + relation + condition : null;
        const outcome = check ? outcomeFor(roll, total, difficulty) : { code: 'automatic', label: 'azione ordinaria senza prova', margin: null };
        const result = {
            schemaVersion: SCHEMA_VERSION,
            id: `resolution-${turn}-${hashNumber(fingerprint).toString(36)}`,
            fingerprint,
            turn,
            action: text,
            context,
            genre: normalizedGenre(state),
            requiresCheck: check,
            attribute: attribute.key,
            attributeValue: attribute.value,
            modifiers: { attribute: attrModifier, expertise, relationship: relation, condition },
            roll,
            total,
            difficulty: check ? difficulty : null,
            outcome: outcome.code,
            outcomeLabel: outcome.label,
            margin: outcome.margin,
            ruleProfile: ruleProfileFor(state, context),
            status: 'planned'
        };
        registry.pending = result;
        return result;
    }

    function buildPromptDirective(result) {
        if (!result) return '';
        if (!result.requiresCheck) {
            return `🎲 RISOLUZIONE AUTORITATIVA V7\n- Contesto: ${result.context}.\n- Regole pertinenti: ${result.ruleProfile}.\n- L'azione è ordinaria e NON richiede una prova. Non inventare un fallimento casuale: narrane l'esecuzione e applica soltanto conseguenze causali già presenti nel mondo.`;
        }
        const mods = result.modifiers || {};
        return `🎲 RISOLUZIONE AUTORITATIVA V7 — NON RITIRARE E NON CAMBIARE L'ESITO\n` +
            `- Contesto: ${result.context}; caratteristica ${result.attribute} ${result.attributeValue}.\n` +
            `- Regole pertinenti: ${result.ruleProfile}.\n` +
            `- Tiro deterministico: d20 ${result.roll} + caratteristica ${mods.attribute >= 0 ? '+' : ''}${mods.attribute} + competenza ${mods.expertise >= 0 ? '+' : ''}${mods.expertise} + relazioni ${mods.relationship >= 0 ? '+' : ''}${mods.relationship} + condizioni ${mods.condition >= 0 ? '+' : ''}${mods.condition} = ${result.total} contro difficoltà ${result.difficulty}.\n` +
            `- ESITO: ${result.outcomeLabel.toUpperCase()} (${result.outcome}).\n` +
            `- Il Master deve narrare questo esito, non sostituirlo con una decisione arbitraria. Un fallimento può aprire una via alternativa ma deve avere un costo reale; un successo non cancella costi già maturati. Gli aggiornamenti di stato devono restare coerenti con i sistemi deterministici esistenti.`;
    }

    function commitResolution(action, response, state = getState()) {
        if (!state?.worldMemory) return null;
        const registry = ensureResolutionState(state);
        const pending = registry.pending;
        if (!pending || keyOf(pending.action) !== keyOf(action)) return null;
        const committed = {
            ...pending,
            status: 'committed',
            responseDigest: clean(response, 360),
            committedAtTurn: Math.max(0, Math.round(number(state.worldMemory.turnCount)))
        };
        registry.history.push(committed);
        registry.history = registry.history.slice(-MAX_HISTORY);
        registry.pending = null;
        return committed;
    }

    function stateFromDirectorContext(context) {
        const live = getState();
        if (live?.worldMemory === context?.memory) return live;
        if (!context?.memory) return live;
        return {
            character: context.character || live?.character || null,
            currentStory: context.story || live?.currentStory || null,
            time: context.time || live?.time || null,
            currentLocation: context.currentLocation || live?.currentLocation || '',
            worldMemory: context.memory
        };
    }

    function enrichPrompt(plan, action, state) {
        if (!plan || typeof plan !== 'object') return plan;
        const resolution = resolveAction(action, state);
        const questContext = root.CronacheQuestManagerV7?.buildQuestContext?.(state) || '';
        const offscreenContext = root.CronacheOffscreenWorldV7?.buildContext?.(state) || '';
        const extras = [buildPromptDirective(resolution), questContext, offscreenContext].filter(Boolean).join('\n\n');
        return {
            ...plan,
            resolution,
            prompt: extras ? `${plan.prompt || ''}\n\n${extras}` : plan.prompt
        };
    }

    function installDirectorWrapper() {
        const Director = root.CronacheDirector?.GameDirector;
        if (!Director?.prototype) return false;
        let patched = false;
        const originalPlan = Director.prototype.planTurn;
        if (typeof originalPlan === 'function' && !originalPlan.__phase7ResolutionWrapped) {
            const wrappedPlan = function phase7PlanTurn(action, context) {
                const state = stateFromDirectorContext(context || {});
                try { root.CronacheQuestManagerV7?.processTurn?.(state); } catch (_error) { }
                try { root.CronacheOffscreenWorldV7?.advance?.(state); } catch (_error) { }
                const plan = originalPlan.apply(this, arguments);
                return enrichPrompt(plan, action, state);
            };
            wrappedPlan.__phase7ResolutionWrapped = true;
            wrappedPlan.__phase7ResolutionOriginal = originalPlan;
            Director.prototype.planTurn = wrappedPlan;
            patched = true;
        }
        const originalCommit = Director.prototype.commitTurn;
        if (typeof originalCommit === 'function' && !originalCommit.__phase7ResolutionWrapped) {
            const wrappedCommit = function phase7CommitTurn(action, response, memory, context) {
                const result = originalCommit.apply(this, arguments);
                const live = getState();
                const state = live?.worldMemory === memory ? live : { ...(live || {}), worldMemory: memory };
                try { commitResolution(action, response, state); } catch (_error) { }
                return result;
            };
            wrappedCommit.__phase7ResolutionWrapped = true;
            wrappedCommit.__phase7ResolutionOriginal = originalCommit;
            Director.prototype.commitTurn = wrappedCommit;
            patched = true;
        }
        return patched;
    }

    function install() {
        if (root.__cronacheTurnResolutionV7Patch >= PATCH_VERSION) return true;
        root.__cronacheTurnResolutionV7Patch = PATCH_VERSION;
        installDirectorWrapper();
        const retry = () => installDirectorWrapper();
        if (typeof root.setTimeout === 'function') {
            root.setTimeout(retry, 0);
            root.setTimeout(retry, 900);
        }
        return true;
    }

    const api = {
        SCHEMA_VERSION,
        PATCH_VERSION,
        normalizedGenre,
        classifyContext,
        requiresCheck,
        selectAttribute,
        difficultyFor,
        ruleProfileFor,
        deterministicD20,
        resolveAction,
        buildPromptDirective,
        commitResolution,
        ensureResolutionState,
        install
    };

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
        else install();
    }
    return api;
});
