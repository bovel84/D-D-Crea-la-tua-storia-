(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheCurrencyCoherenceV17 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const CURRENCIES = Object.freeze({
        euro: Object.freeze({ id: 'euro', name: 'Euro', singular: 'euro', plural: 'euro', short: 'euro', symbol: '€' }),
        florin: Object.freeze({ id: 'florin', name: 'Fiorino', singular: 'fiorino', plural: 'fiorini', short: 'fiorini', symbol: 'ƒ' }),
        denaro: Object.freeze({ id: 'denaro', name: 'Denaro', singular: 'denaro', plural: 'denari', short: 'denari', symbol: 'd' }),
        denarius: Object.freeze({ id: 'denarius', name: 'Denario', singular: 'denario', plural: 'denari', short: 'denari', symbol: 'd' }),
        lira: Object.freeze({ id: 'lira', name: 'Lira', singular: 'lira', plural: 'lire', short: 'lire', symbol: '₤' }),
        dollar: Object.freeze({ id: 'dollar', name: 'Dollaro', singular: 'dollaro', plural: 'dollari', short: 'dollari', symbol: '$' }),
        pound: Object.freeze({ id: 'pound', name: 'Sterlina', singular: 'sterlina', plural: 'sterline', short: 'sterline', symbol: '£' }),
        gold: Object.freeze({ id: 'gold', name: "Moneta d'oro", singular: "moneta d'oro", plural: "monete d'oro", short: "monete d'oro", symbol: '🪙' }),
        pieces8: Object.freeze({ id: 'pieces8', name: "Pezzo d'otto", singular: "pezzo d'otto", plural: "pezzi d'otto", short: "pezzi d'otto", symbol: '🪙' })
    });

    const OTHER_CURRENCY_ALIASES = [
        'euro', 'euros', '€',
        'fiorino', 'fiorini', 'florin', 'florins', 'ƒ',
        'denaro', 'denari', 'denario', 'denarii',
        'lira', 'lire', '₤',
        'dollaro', 'dollari', 'dollar', 'dollars', '$',
        'sterlina', 'sterline', 'pound', 'pounds', '£',
        "moneta d'oro", "monete d'oro", 'moneta d’oro', 'monete d’oro',
        "pezzo d'otto", "pezzi d'otto", 'pezzo d’otto', 'pezzi d’otto',
        'ducato', 'ducati', 'scudo', 'scudi'
    ];

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 12000) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
    const key = value => clean(value, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    function cloneCurrency(currency, source = 'runtime-v17') {
        const base = currency && typeof currency === 'object' ? currency : CURRENCIES.gold;
        return {
            id: clean(base.id, 40) || 'currency',
            name: clean(base.name, 80) || clean(base.singular, 80) || 'Moneta',
            singular: clean(base.singular, 80) || clean(base.name, 80) || 'moneta',
            plural: clean(base.plural, 80) || clean(base.short, 80) || clean(base.name, 80) || 'monete',
            short: clean(base.short, 80) || clean(base.plural, 80) || clean(base.name, 80) || 'monete',
            symbol: clean(base.symbol, 12) || '🪙',
            source,
            canonical: true,
            schemaVersion: 17
        };
    }

    function getGameState() {
        try {
            if (typeof G !== 'undefined') return G;
        } catch (_error) { }
        return root.G || null;
    }

    function storyYear(story = {}, state = getGameState()) {
        const candidates = [story?.startTime?.year, state?.time?.year];
        for (const candidate of candidates) {
            const year = Number(candidate);
            if (Number.isFinite(year) && year > 0) return Math.trunc(year);
        }
        const match = clean([story?.title, story?.setting, story?.desc, story?.prologue].join(' '), 12000).match(/\b(\d{3,4})\b/);
        return match ? Number(match[1]) : 0;
    }

    function storyText(story = {}) {
        return key([
            story?.title, story?.setting, story?.genre, story?.desc, story?.description,
            story?.prologue, story?.depth, ...(asArray(story?.canonFacts))
        ].filter(Boolean).join(' '));
    }

    function currencyFromExplicit(value) {
        if (!value) return null;
        if (typeof value === 'object') {
            const id = key(value.id || value.name || value.short || value.singular || value.plural);
            if (/fior|florin/.test(id)) return CURRENCIES.florin;
            if (/euro/.test(id)) return CURRENCIES.euro;
            if (/denar/.test(id)) return CURRENCIES.denarius;
            if (/lir/.test(id)) return CURRENCIES.lira;
            if (/dollar|dollar/.test(id)) return CURRENCIES.dollar;
            if (/sterlin|pound/.test(id)) return CURRENCIES.pound;
            if (/pez.*otto/.test(id)) return CURRENCIES.pieces8;
            if (/oro|gold|monet/.test(id)) return CURRENCIES.gold;
            if (value.canonical === true && value.short) return value;
        }
        const text = key(value);
        if (/fior|florin/.test(text)) return CURRENCIES.florin;
        if (/euro/.test(text)) return CURRENCIES.euro;
        if (/denar/.test(text)) return CURRENCIES.denarius;
        if (/lir/.test(text)) return CURRENCIES.lira;
        if (/dollar/.test(text)) return CURRENCIES.dollar;
        if (/sterlin|pound/.test(text)) return CURRENCIES.pound;
        if (/pez.*otto/.test(text)) return CURRENCIES.pieces8;
        if (/oro|gold|monet/.test(text)) return CURRENCIES.gold;
        return null;
    }

    function inferCurrency(story = {}, fallbackCurrency = null, state = getGameState()) {
        if (story?.currency?.canonical === true && story?.currency?.schemaVersion >= 17) {
            return cloneCurrency(story.currency, story.currency.source || 'story-v17');
        }

        const text = storyText(story);
        const genre = key(story?.genre);
        const year = storyYear(story, state);

        // Strong geographic / period signals override legacy generic genre currencies.
        if (/rinasc|firenze|fiorentin|medici|toscana|quattrocent|cinquecent|banco dei|signoria di firenze/.test(text)) {
            return cloneCurrency(CURRENCIES.florin, 'historical-context');
        }
        if (/roma antica|repubblica romana|impero romano|legion|patrizi|senato romano/.test(text)) {
            return cloneCurrency(CURRENCIES.denarius, 'historical-context');
        }
        if (/pirat|corsar|bucanier|caraibi|galeone|eta della vela/.test(text) || genre === 'pirate') {
            return cloneCurrency(CURRENCIES.pieces8, 'setting-context');
        }
        if (/regno unito|gran bretagna|inghilterra|londra|british|england|uk\b/.test(text) && year >= 1700) {
            return cloneCurrency(CURRENCIES.pound, 'geographic-context');
        }
        if (/stati uniti|usa\b|new york|wall street|america contemporanea/.test(text) && year >= 1792) {
            return cloneCurrency(CURRENCIES.dollar, 'geographic-context');
        }
        if (/italia|italian|roma\b|milano|torino|napoli|sardegna|cagliari/.test(text)) {
            if (year >= 2002) return cloneCurrency(CURRENCIES.euro, 'italy-period');
            if (year >= 1861) return cloneCurrency(CURRENCIES.lira, 'italy-period');
            if (year > 0 && year < 1252) return cloneCurrency(CURRENCIES.denaro, 'italy-period');
        }
        if (/medioev|medieval|feudal|anno mille|sacro romano/.test(text) || (genre === 'historical' && year > 0 && year < 1252)) {
            return cloneCurrency(CURRENCIES.denaro, 'medieval-context');
        }
        if (genre === 'historical') {
            if (year >= 2002) return cloneCurrency(CURRENCIES.euro, 'historical-year');
            if (year >= 1861) return cloneCurrency(CURRENCIES.lira, 'historical-year');
            if (year >= 1252 && year <= 1600) return cloneCurrency(CURRENCIES.florin, 'historical-year');
            if (year > 0) return cloneCurrency(CURRENCIES.denaro, 'historical-year');
        }
        if (genre === 'fantasy') return cloneCurrency(CURRENCIES.gold, 'fantasy-context');
        if (['contemporary', 'business', 'sport', 'diplomatic'].includes(genre)) {
            const explicitFallback = currencyFromExplicit(fallbackCurrency);
            return cloneCurrency(explicitFallback || CURRENCIES.euro, 'modern-context');
        }

        const explicit = currencyFromExplicit(story?.currency) || currencyFromExplicit(fallbackCurrency);
        return cloneCurrency(explicit || (year >= 2002 ? CURRENCIES.euro : CURRENCIES.gold), explicit ? 'existing-config' : 'default-context');
    }

    function canonicalAliases(currency) {
        const values = [currency?.name, currency?.singular, currency?.plural, currency?.short, currency?.symbol]
            .map(value => clean(value, 80)).filter(Boolean);
        return new Set(values.map(key));
    }

    function normalizeCurrencyText(value, currency) {
        let text = String(value == null ? '' : value);
        const canonical = cloneCurrency(currency);
        const keep = canonicalAliases(canonical);
        const replacement = canonical.plural;

        OTHER_CURRENCY_ALIASES
            .slice()
            .sort((a, b) => b.length - a.length)
            .forEach(alias => {
                if (keep.has(key(alias))) return;
                const escaped = escapeRegex(alias);
                const wordish = /^[\p{L}\p{N}]/u.test(alias) && /[\p{L}\p{N}]$/u.test(alias);
                const pattern = wordish
                    ? new RegExp(`\\b${escaped}\\b`, 'giu')
                    : new RegExp(escaped, 'g');
                text = text.replace(pattern, replacement);
            });

        const p = escapeRegex(replacement);
        text = text
            .replace(new RegExp(`\\b${p}\\s+e\\s+${p}\\b(?:\\s+misti?)?`, 'giu'), replacement)
            .replace(new RegExp(`\\b${p}\\s*\\(\\s*${p}(?:\\s+e\\s+${p})?(?:\\s+misti?)?\\s*\\)`, 'giu'), replacement)
            .replace(new RegExp(`\\b${p}\\s+${p}\\b`, 'giu'), replacement);
        return text;
    }

    function currencyDirective(currency) {
        const c = cloneCurrency(currency);
        return [
            '',
            '=== MONETA CANONICA DELLA CAMPAGNA ===',
            `L'unica moneta contabile e narrativa è: ${c.name} (${c.plural}; simbolo ${c.symbol}).`,
            `Qualsiasi somma, prezzo, saldo, contratto, cassa, stipendio o ricchezza deve essere espresso esclusivamente in ${c.plural}.`,
            'Non introdurre valute parallele, cambi, monete miste o sinonimi di altre valute. Non usare euro, fiorini, denari, lire, dollari o sterline se non coincidono con la moneta canonica indicata sopra.',
            'I tag [MECCANICA: soldi=...] contengono solo l’importo numerico: l’unità è sempre la moneta canonica della campagna.'
        ].join('\n');
    }

    function syncState(state = getGameState(), options = {}) {
        if (!state?.currentStory) return null;
        const currency = inferCurrency(state.currentStory, state.character?.currency, state);
        state.currentStory.currency = cloneCurrency(currency, currency.source || 'campaign');
        if (state.character) state.character.currency = cloneCurrency(currency, currency.source || 'campaign');
        if (state.worldMemory && typeof state.worldMemory === 'object') {
            state.worldMemory.currency = cloneCurrency(currency, currency.source || 'campaign');
        }

        if (options.normalizeLogs !== false) {
            state.storyLog = asArray(state.storyLog).map(entry => entry && typeof entry === 'object'
                ? { ...entry, text: normalizeCurrencyText(entry.text, currency) }
                : entry);
            state.history = asArray(state.history).map(entry => entry && typeof entry === 'object' && typeof entry.content === 'string'
                ? { ...entry, content: normalizeCurrencyText(entry.content, currency) }
                : entry);
            if (state.worldMemory?.sceneSummary) state.worldMemory.sceneSummary = normalizeCurrencyText(state.worldMemory.sceneSummary, currency);
            if (state.worldMemory?.storySummary) state.worldMemory.storySummary = normalizeCurrencyText(state.worldMemory.storySummary, currency);
        }
        return currency;
    }

    function normalizeDom(doc, currency) {
        if (!doc || !currency) return;
        const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.parentElement?.closest('script,style,textarea,input,select,option')) continue;
            if (!node.parentElement?.closest('#game-screen,.modal-overlay')) continue;
            nodes.push(node);
        }
        nodes.forEach(node => {
            const next = normalizeCurrencyText(node.nodeValue, currency);
            if (next !== node.nodeValue) node.nodeValue = next;
        });
    }

    function patchStoryGenerator() {
        const generator = root.CronacheStoryGenerator;
        if (!generator || generator.__currencyCoherenceV17) return Boolean(generator);

        ['createFallbackStory', 'completeStory'].forEach(name => {
            const previous = generator[name];
            if (typeof previous !== 'function') return;
            generator[name] = function() {
                const story = previous.apply(this, arguments);
                const seed = arguments[0] || {};
                story.currency = inferCurrency(story, seed?.currency, null);
                story.canonFacts = asArray(story.canonFacts).filter(fact => !/moneta canonica/i.test(String(fact || '')));
                story.canonFacts.push(`Moneta canonica: ${story.currency.plural}. Non esistono valute parallele nel sistema di gioco.`);
                return story;
            };
        });

        if (typeof generator.parseGeneratedStory === 'function') {
            const previous = generator.parseGeneratedStory;
            generator.parseGeneratedStory = function(response, seed) {
                const story = previous.apply(this, arguments);
                let generatedCurrency = null;
                try {
                    const text = String(response || '').trim();
                    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
                    const source = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
                    generatedCurrency = JSON.parse(source)?.currency || null;
                } catch (_error) { }
                story.currency = inferCurrency({ ...story, currency: generatedCurrency }, seed?.currency, null);
                story.canonFacts = asArray(story.canonFacts).filter(fact => !/moneta canonica/i.test(String(fact || '')));
                story.canonFacts.push(`Moneta canonica: ${story.currency.plural}. Non esistono valute parallele nel sistema di gioco.`);
                return story;
            };
        }

        if (typeof generator.buildGenerationPrompt === 'function') {
            const previous = generator.buildGenerationPrompt;
            generator.buildGenerationPrompt = function(seed = {}) {
                const basePrompt = previous.apply(this, arguments);
                const preferred = inferCurrency(seed, seed?.currency, null);
                return `${basePrompt}\n\n=== MONETA OBBLIGATORIA ===\nAggiungi il campo top-level currency = {"id":"${preferred.id}","name":"${preferred.name}","singular":"${preferred.singular}","plural":"${preferred.plural}","short":"${preferred.short}","symbol":"${preferred.symbol}"}.\nLa campagna usa UNA SOLA moneta. Non creare valute parallele o miste.`;
            };
        }
        generator.__currencyCoherenceV17 = true;
        return true;
    }

    function patchCharacterOptions() {
        const character = root.CronacheCharacter;
        if (character && typeof character.getGenreConfig === 'function' && !character.getGenreConfig.__currencyCoherenceV17) {
            const previous = character.getGenreConfig;
            const wrapped = function(genres, story) {
                const config = previous.apply(this, arguments) || {};
                return { ...config, currency: inferCurrency(story || {}, config.currency, getGameState()) };
            };
            wrapped.__currencyCoherenceV17 = true;
            character.getGenreConfig = wrapped;
        }
        if (typeof root.getGenreConfig === 'function' && !root.getGenreConfig.__currencyCoherenceV17) {
            const previous = root.getGenreConfig;
            const wrapped = function(story) {
                const config = previous.apply(this, arguments) || {};
                const targetStory = story || getGameState()?.currentStory || {};
                return { ...config, currency: inferCurrency(targetStory, config.currency, getGameState()) };
            };
            wrapped.__currencyCoherenceV17 = true;
            root.getGenreConfig = wrapped;
        }
        return true;
    }

    function patchRequestConfiguredAI() {
        const previous = root.requestConfiguredAI;
        if (typeof previous !== 'function') return false;
        if (previous.__currencyCoherenceV17) return true;
        const wrapped = function(messages, options = {}) {
            const state = getGameState();
            const currency = syncState(state, { normalizeLogs: false });
            if (!currency || !Array.isArray(messages)) return previous.apply(this, arguments);
            const task = key(options?.task || 'narrative');
            if (task === 'story') return previous.apply(this, arguments);
            const directive = currencyDirective(currency);
            const patched = messages.map((message, index) => {
                if (!message || typeof message !== 'object') return message;
                if (index === 0 && message.role === 'system') return { ...message, content: `${message.content || ''}${directive}` };
                return message;
            });
            return previous.call(this, patched, options);
        };
        wrapped.__currencyCoherenceV17 = true;
        wrapped.__currencyCoherenceV17Original = previous;
        root.requestConfiguredAI = wrapped;
        return true;
    }

    function patchCallAI() {
        const previous = root.callAI;
        if (typeof previous !== 'function') return false;
        if (previous.__currencyCoherenceV17) return true;
        const wrapped = function() {
            syncState(getGameState(), { normalizeLogs: false });
            return previous.apply(this, arguments);
        };
        wrapped.__currencyCoherenceV17 = true;
        wrapped.__currencyCoherenceV17Original = previous;
        root.callAI = wrapped;
        return true;
    }

    function patchParseAIResponse() {
        const previous = root.parseAIResponse;
        if (typeof previous !== 'function') return false;
        if (previous.__currencyCoherenceV17) return true;
        const wrapped = function(response) {
            const state = getGameState();
            const currency = syncState(state, { normalizeLogs: false });
            const args = Array.from(arguments);
            if (currency && typeof response === 'string') args[0] = normalizeCurrencyText(response, currency);
            return previous.apply(this, args);
        };
        wrapped.__currencyCoherenceV17 = true;
        wrapped.__currencyCoherenceV17Original = previous;
        root.parseAIResponse = wrapped;
        return true;
    }

    function patchAddStoryEntry() {
        const previous = root.addStoryEntry;
        if (typeof previous !== 'function') return false;
        if (previous.__currencyCoherenceV17) return true;
        const wrapped = function(text) {
            const state = getGameState();
            const currency = syncState(state, { normalizeLogs: false });
            const args = Array.from(arguments);
            if (currency && typeof text === 'string') args[0] = normalizeCurrencyText(text, currency);
            return previous.apply(this, args);
        };
        wrapped.__currencyCoherenceV17 = true;
        wrapped.__currencyCoherenceV17Original = previous;
        root.addStoryEntry = wrapped;
        return true;
    }

    function patchLifecycle(name) {
        const previous = root[name];
        if (typeof previous !== 'function' || previous.__currencyCoherenceV17) return false;
        const wrapped = function() {
            syncState(getGameState());
            const result = previous.apply(this, arguments);
            const state = getGameState();
            const currency = syncState(state);
            if (currency && typeof document !== 'undefined') root.setTimeout?.(() => normalizeDom(document, currency), 0);
            return result;
        };
        wrapped.__currencyCoherenceV17 = true;
        wrapped.__currencyCoherenceV17Original = previous;
        root[name] = wrapped;
        return true;
    }

    function install(doc = typeof document !== 'undefined' ? document : null) {
        patchStoryGenerator();
        patchCharacterOptions();
        patchRequestConfiguredAI();
        patchCallAI();
        patchParseAIResponse();
        patchAddStoryEntry();
        ['startNewGame', 'startGameUI', 'loadFromSlot', 'restoreCampaignSnapshot'].forEach(patchLifecycle);
        const currency = syncState(getGameState());
        if (doc && currency) normalizeDom(doc, currency);
        root.__cronacheCurrencyCoherenceV17Version = PATCH_VERSION;
        return true;
    }

    function scheduleInstall(doc = typeof document !== 'undefined' ? document : null) {
        install(doc);
        if (typeof root.setTimeout !== 'function') return;
        [0, 80, 250, 700, 1500, 3000, 5000].forEach(delay => root.setTimeout(() => install(doc), delay));
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scheduleInstall(document), { once: true });
        else scheduleInstall(document);
    }

    return {
        PATCH_VERSION,
        CURRENCIES,
        storyYear,
        inferCurrency,
        normalizeCurrencyText,
        currencyDirective,
        syncState,
        install
    };
});