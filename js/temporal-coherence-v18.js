(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheTemporalCoherenceV18 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const DEFAULT_TIME = Object.freeze({ day: 2, month: 4, year: 1472, hour: 9, minute: 0 });
    const ERA_RULES = Object.freeze([
        Object.freeze({ id: 'renaissance', label: 'Rinascimento', min: 1350, max: 1600, defaultYear: 1472, re: /rinasc|rinasciment|umanesim|quattrocent|cinquecent|medici|pazzi|lorenzo il magnifico|repubblica fiorentina|signoria di firenze/i }),
        Object.freeze({ id: 'ancient', label: 'Età antica', min: 1, max: 600, defaultYear: 100, re: /roma antica|repubblica romana|impero romano|antica roma|grecia antica|ellenistic|egitto antico|legionari?/i }),
        Object.freeze({ id: 'medieval', label: 'Medioevo', min: 500, max: 1499, defaultYear: 1200, re: /medioev|medieval|feudal|crociat|anno mille|viching|sacro romano impero/i }),
        Object.freeze({ id: 'industrial', label: 'Età industriale', min: 1760, max: 1914, defaultYear: 1890, re: /rivoluzione industriale|età industriale|eta industriale|vittorian|ottocento|industrializzazione/i }),
        Object.freeze({ id: 'contemporary', label: 'Età contemporanea', min: 1945, max: 2199, defaultYear: 2024, re: /mondo contemporaneo|epoca contemporanea|giorni nostri|xxi secolo|21.? secolo/i })
    ]);

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 16000) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);

    function getGameState() {
        try {
            if (typeof G !== 'undefined') return G;
        } catch (_error) { }
        return root.G || null;
    }

    function storyText(story = {}) {
        return clean([
            story.title, story.setting, story.genre, story.desc, story.description,
            story.prologue, story.depth, ...(asArray(story.canonFacts))
        ].filter(Boolean).join(' '), 24000);
    }

    function detectEra(story = {}) {
        const text = storyText(story);
        return ERA_RULES.find(rule => rule.re.test(text)) || null;
    }

    function yearsInText(story = {}) {
        const text = [story.title, story.setting, story.desc, story.description, story.prologue, ...(asArray(story.canonFacts))]
            .filter(Boolean).join(' ');
        return [...text.matchAll(/\b(\d{3,4})\b/g)]
            .map(match => Number(match[1]))
            .filter(year => Number.isFinite(year) && year > 0 && year <= 2199);
    }

    function isYearValidForEra(year, era) {
        const value = Number(year);
        return Boolean(era && Number.isFinite(value) && value >= era.min && value <= era.max);
    }

    function pickCanonicalYear(story = {}, era = detectEra(story)) {
        if (!era) {
            const year = Number(story?.startTime?.year);
            return Number.isFinite(year) ? Math.trunc(year) : null;
        }
        const explicit = Number(story?.startTime?.year);
        if (isYearValidForEra(explicit, era)) return Math.trunc(explicit);
        const textual = yearsInText(story).find(year => isYearValidForEra(year, era));
        return textual || era.defaultYear;
    }

    function integer(value, fallback, min, max) {
        const parsed = Math.trunc(Number(value));
        return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
    }

    function normalizeTimeObject(value = {}, story = {}, options = {}) {
        const era = options.era || detectEra(story);
        const fallback = story?.startTime && typeof story.startTime === 'object' ? story.startTime : DEFAULT_TIME;
        const canonicalYear = pickCanonicalYear(story, era);
        const year = era
            ? (isYearValidForEra(value?.year, era) ? Math.trunc(Number(value.year)) : canonicalYear)
            : integer(value?.year, integer(fallback?.year, DEFAULT_TIME.year, 1, 2199), 1, 2199);
        return {
            ...value,
            day: integer(value?.day, integer(fallback?.day, DEFAULT_TIME.day, 1, 31), 1, 31),
            month: integer(value?.month, integer(fallback?.month, DEFAULT_TIME.month, 1, 12), 1, 12),
            year: year || DEFAULT_TIME.year,
            hour: integer(value?.hour, integer(fallback?.hour, DEFAULT_TIME.hour, 0, 23), 0, 23),
            minute: integer(value?.minute, integer(fallback?.minute, DEFAULT_TIME.minute, 0, 59), 0, 59)
        };
    }

    function repairTemporalText(value, oldYear, newYear) {
        if (typeof value !== 'string' || !oldYear || !newYear || oldYear === newYear) return value;
        const old = String(oldYear);
        const next = String(newYear);
        let text = value;
        // Corregge solo riferimenti temporali espliciti, non importi economici casualmente uguali all'anno errato.
        text = text.replace(new RegExp(`(\\b(?:anno|nell['’]anno|dal|nel|del|data iniziale[^\\d]{0,30})\\s*)${old}\\b`, 'giu'), `$1${next}`);
        text = text.replace(new RegExp(`(\\b\\d{1,2}[\\/.-]\\d{1,2}[\\/.-])${old}\\b`, 'g'), `$1${next}`);
        const months = 'gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre';
        text = text.replace(new RegExp(`(\\b\\d{1,2}\\s+(?:${months})\\s+)${old}\\b`, 'giu'), `$1${next}`);
        return text;
    }

    function repairStory(story) {
        if (!story || typeof story !== 'object') return { story, changed: false, era: null, oldYear: null, newYear: null };
        const era = detectEra(story);
        if (!era) return { story, changed: false, era: null, oldYear: null, newYear: null };
        const oldYear = Number(story?.startTime?.year);
        const newYear = pickCanonicalYear(story, era);
        const startTime = normalizeTimeObject(story.startTime || {}, story, { era });
        const changed = Number(startTime.year) !== Number(oldYear) || !story.temporalCanon || story.temporalCanon.era !== era.id;
        story.startTime = startTime;
        story.temporalCanon = {
            era: era.id,
            label: era.label,
            minYear: era.min,
            maxYear: era.max,
            startYear: startTime.year,
            canonical: true,
            schemaVersion: 18
        };
        if (changed && Number.isFinite(oldYear) && oldYear > 0 && oldYear !== newYear) {
            ['desc', 'description', 'prologue', 'depth'].forEach(field => {
                if (typeof story[field] === 'string') story[field] = repairTemporalText(story[field], oldYear, newYear);
            });
            story.canonFacts = asArray(story.canonFacts).map(fact => repairTemporalText(String(fact || ''), oldYear, newYear));
        }
        const canon = `Canone temporale: ${era.label}, anno iniziale ${startTime.year}.`;
        story.canonFacts = asArray(story.canonFacts).filter(fact => !/^Canone temporale:/i.test(String(fact || '')));
        story.canonFacts.push(canon);
        return { story, changed, era, oldYear, newYear: startTime.year };
    }

    function syncState(state = getGameState()) {
        if (!state) return null;
        if (Array.isArray(state.stories)) state.stories.forEach(story => repairStory(story));
        if (!state.currentStory) return null;

        const result = repairStory(state.currentStory);
        const era = result.era;
        if (!era) return result;

        const targetStartYear = Number(state.currentStory.startTime?.year) || era.defaultYear;
        if (state.time && !isYearValidForEra(state.time.year, era)) {
            const currentYear = Number(state.time.year);
            const oldStartYear = Number(result.oldYear);
            const elapsedYears = Number.isFinite(currentYear) && Number.isFinite(oldStartYear)
                ? Math.max(0, Math.min(100, Math.trunc(currentYear - oldStartYear)))
                : 0;
            state.time = normalizeTimeObject({ ...state.time, year: targetStartYear + elapsedYears }, state.currentStory, { era });
        }

        if (state.worldMemory && typeof state.worldMemory === 'object') {
            state.worldMemory.temporalCanon = {
                era: era.id,
                label: era.label,
                startYear: targetStartYear,
                currentYear: Number(state.time?.year) || targetStartYear,
                minYear: era.min,
                maxYear: era.max,
                canonical: true,
                schemaVersion: 18
            };
        }
        return result;
    }

    function temporalDirective(story = {}, state = getGameState()) {
        const era = detectEra(story);
        if (!era) return '';
        const year = pickCanonicalYear(story, era);
        return [
            '',
            '=== CANONE TEMPORALE OBBLIGATORIO ===',
            `Epoca: ${era.label}. Anno iniziale canonico: ${year}.`,
            `Ogni data, istituzione, tecnologia, moneta, personaggio ed evento deve essere compatibile con ${era.label} e con l'anno ${year}.`,
            `Non usare anni incompatibili con l'epoca (intervallo ammesso ${era.min}-${era.max}) salvo che la storia descriva esplicitamente un ricordo o un documento storico del passato.`,
            'La data corrente registrata dal gioco è autoritativa e non deve essere sostituita dall’LLM.'
        ].join('\n');
    }

    function patchStoryGenerator() {
        const generator = root.CronacheStoryGenerator;
        if (!generator || generator.__temporalCoherenceV18) return Boolean(generator);

        ['createFallbackStory', 'completeStory', 'parseGeneratedStory'].forEach(name => {
            const previous = generator[name];
            if (typeof previous !== 'function') return;
            generator[name] = function() {
                const story = previous.apply(this, arguments);
                repairStory(story);
                return story;
            };
        });

        const previousPrompt = generator.buildGenerationPrompt;
        if (typeof previousPrompt === 'function') {
            generator.buildGenerationPrompt = function(seed) {
                return previousPrompt.apply(this, arguments) + [
                    '',
                    '=== COERENZA TEMPORALE VINCOLANTE ===',
                    'La data iniziale deve essere storicamente compatibile con il periodo dichiarato dalla campagna.',
                    'Esempio vincolante: una campagna nel Rinascimento italiano non può iniziare nell’anno 1000; se non è indicato un anno preciso usa un anno plausibile tra 1350 e 1600 (preferenza 1472).',
                    'Se l’utente indica esplicitamente un anno compatibile, preservalo. Non generare anacronismi tra data, moneta, istituzioni, tecnologia e personaggi.'
                ].join('\n');
            };
        }
        generator.__temporalCoherenceV18 = true;
        return true;
    }

    function patchGetStartTimeForStory() {
        const previous = root.getStartTimeForStory;
        if (typeof previous !== 'function' || previous.__temporalCoherenceV18) return Boolean(previous);
        const wrapped = function(story) {
            repairStory(story);
            const result = previous.apply(this, arguments);
            return normalizeTimeObject(result || story?.startTime || {}, story || {}, { era: detectEra(story || {}) });
        };
        wrapped.__temporalCoherenceV18 = true;
        wrapped.__temporalCoherenceV18Original = previous;
        root.getStartTimeForStory = wrapped;
        return true;
    }

    function patchRequestConfiguredAI() {
        const previous = root.requestConfiguredAI;
        if (typeof previous !== 'function' || previous.__temporalCoherenceV18) return Boolean(previous);
        const wrapped = function(messages, options = {}) {
            const state = getGameState();
            syncState(state);
            const directive = temporalDirective(state?.currentStory || {} , state);
            if (!directive) return previous.apply(this, arguments);
            const nextMessages = asArray(messages).map(message => ({ ...message }));
            if (nextMessages.length) {
                const index = nextMessages.findIndex(message => message?.role === 'system');
                if (index >= 0) nextMessages[index].content = `${nextMessages[index].content || ''}${directive}`;
                else nextMessages.unshift({ role: 'system', content: directive.trim() });
            }
            const args = Array.from(arguments);
            args[0] = nextMessages;
            return previous.apply(this, args);
        };
        wrapped.__temporalCoherenceV18 = true;
        wrapped.__temporalCoherenceV18Original = previous;
        root.requestConfiguredAI = wrapped;
        return true;
    }

    function patchLifecycle(name) {
        const previous = root[name];
        if (typeof previous !== 'function' || previous.__temporalCoherenceV18) return false;
        const wrapped = function() {
            syncState(getGameState());
            const result = previous.apply(this, arguments);
            const finish = () => {
                syncState(getGameState());
                try { if (typeof root.updateTimeDisplay === 'function') root.updateTimeDisplay(); } catch (_error) { }
            };
            if (result && typeof result.then === 'function') return result.finally(finish);
            finish();
            return result;
        };
        wrapped.__temporalCoherenceV18 = true;
        wrapped.__temporalCoherenceV18Original = previous;
        root[name] = wrapped;
        return true;
    }

    function install() {
        patchStoryGenerator();
        patchGetStartTimeForStory();
        patchRequestConfiguredAI();
        ['startNewGame', 'startGameUI', 'loadFromSlot', 'restoreCampaignSnapshot', 'generateGameWorld'].forEach(patchLifecycle);
        syncState(getGameState());
        root.__cronacheTemporalCoherenceV18Version = PATCH_VERSION;
        return true;
    }

    function scheduleInstall() {
        install();
        if (typeof root.setTimeout !== 'function') return;
        [0, 80, 250, 700, 1500, 3000, 5000].forEach(delay => root.setTimeout(install, delay));
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleInstall, { once: true });
        else scheduleInstall();
    }

    return {
        PATCH_VERSION,
        ERA_RULES,
        detectEra,
        yearsInText,
        pickCanonicalYear,
        normalizeTimeObject,
        repairTemporalText,
        repairStory,
        syncState,
        temporalDirective,
        install
    };
});
