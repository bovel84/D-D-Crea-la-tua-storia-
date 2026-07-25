(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheKingdom = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SCHEMA_VERSION = 1;
    const MAX_HISTORY = 80;
    const MAX_PROCESSED_EVENTS = 160;

    function clean(value, limit = 180) {
        const text = String(value == null ? '' : value)
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
    }

    function keyOf(value) {
        return clean(value, 100).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    function parseNumber(value, fallback = null) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
        const raw = String(value == null ? '' : value).trim();
        if (!raw) return fallback;
        const match = raw.replace(/\s+/g, '').match(/[+-]?(?:\d[\d.,]*|[.,]\d+)/);
        if (!match) return fallback;
        let normalized = match[0];
        const comma = normalized.lastIndexOf(',');
        const dot = normalized.lastIndexOf('.');
        if (comma >= 0 && dot >= 0) {
            const decimal = comma > dot ? ',' : '.';
            normalized = normalized
                .split(decimal === ',' ? '.' : ',').join('')
                .replace(decimal, '.');
        } else {
            const separator = comma >= 0 ? ',' : dot >= 0 ? '.' : '';
            if (separator) {
                const chunks = normalized.split(separator);
                normalized = chunks.length > 2 || (chunks.length === 2 && chunks[1].length === 3)
                    ? chunks.join('')
                    : normalized.replace(separator, '.');
            }
        }
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function integer(value, fallback = 0) {
        const parsed = parseNumber(value, fallback);
        return Math.round(parsed == null ? fallback : parsed);
    }

    function clamp(value, min = 0, max = 100) {
        return Math.max(min, Math.min(max, Number(value) || 0));
    }

    function createDefaultKingdom() {
        return {
            schemaVersion: SCHEMA_VERSION,
            active: false,
            initialized: false,
            name: '',
            rulerTitle: '',
            rulerName: '',
            government: '',
            capital: '',
            treasury: 0,
            population: 0,
            stability: 50,
            legitimacy: 50,
            prosperity: 50,
            food: 0,
            period: 0,
            lastPeriodTurn: 0,
            taxRate: 10,
            army: {
                levies: 0,
                professionals: 0,
                cavalry: 0,
                navy: 0,
                morale: 50,
                readiness: 50,
                upkeep: 0
            },
            territories: [],
            factions: [],
            diplomacy: [],
            laws: [],
            council: [],
            history: [],
            processedNarrativeEvents: [],
            lastReport: {
                period: 0, income: 0, armyUpkeep: 0, administration: 0,
                balance: 0, foodProduced: 0, foodConsumed: 0, foodBalance: 0
            },
            settings: { periodTurns: 5 }
        };
    }

    function normalizeArmy(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        return {
            levies: Math.max(0, integer(source.levies)),
            professionals: Math.max(0, integer(source.professionals)),
            cavalry: Math.max(0, integer(source.cavalry)),
            navy: Math.max(0, integer(source.navy)),
            morale: clamp(source.morale ?? 50),
            readiness: clamp(source.readiness ?? 50),
            upkeep: Math.max(0, integer(source.upkeep))
        };
    }

    function normalizeTerritory(raw, index = 0) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const name = clean(source.name || `Territorio ${index + 1}`, 100);
        return {
            id: clean(source.id || `territory-${keyOf(name) || index + 1}`, 120),
            name,
            type: clean(source.territoryType || source.type || 'dominio', 60),
            population: Math.max(0, integer(source.population)),
            foodProduction: Math.max(0, integer(source.foodProduction)),
            taxIncome: Math.max(0, integer(source.taxIncome)),
            fortification: clamp(source.fortification ?? 0),
            loyalty: clamp(source.loyalty ?? 50),
            controller: clean(source.controller || '', 100),
            strategicResource: clean(source.strategicResource || '', 120),
            status: clean(source.status || 'controllato', 40)
        };
    }

    function normalizeFaction(raw, index = 0) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const name = clean(source.name || `Fazione ${index + 1}`, 100);
        return {
            id: clean(source.id || `faction-${keyOf(name) || index + 1}`, 120),
            name,
            category: clean(source.category || 'altro', 70),
            leader: clean(source.leader || '', 100),
            power: clamp(source.power ?? 25),
            loyalty: clamp(source.loyalty ?? 50),
            wealth: clamp(source.wealth ?? 25),
            goal: clean(source.goal || '', 180),
            status: clean(source.status || 'attiva', 50)
        };
    }

    function normalizeDiplomacy(raw, index = 0) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const realm = clean(source.realm || source.name || `Regno ${index + 1}`, 100);
        return {
            id: clean(source.id || `diplomacy-${keyOf(realm) || index + 1}`, 120),
            realm,
            relation: clean(source.relation || 'neutrale', 50),
            trust: clamp(source.trust ?? 50),
            tension: clamp(source.tension ?? 20),
            treaty: clean(source.treaty || '', 120),
            trade: clean(source.trade || '', 120),
            claims: clean(source.claims || '', 160)
        };
    }

    function normalizeLaw(raw, index = 0) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const title = clean(source.title || `Legge ${index + 1}`, 120);
        return {
            id: clean(source.id || `law-${keyOf(title) || index + 1}`, 140),
            title,
            area: clean(source.area || 'generale', 60),
            effect: clean(source.effect || '', 200),
            status: clean(source.status || 'in vigore', 50),
            support: clean(source.support || '', 140),
            opposition: clean(source.opposition || '', 140)
        };
    }

    function normalizeCouncilor(raw, index = 0) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const name = clean(source.name || `Consigliere ${index + 1}`, 100);
        return {
            id: clean(source.id || `council-${keyOf(name) || index + 1}`, 120),
            name,
            role: clean(source.role || 'consigliere', 80),
            competence: clamp(source.competence ?? 50),
            loyalty: clamp(source.loyalty ?? 50),
            faction: clean(source.faction || '', 100),
            status: clean(source.status || 'attivo', 50)
        };
    }

    function migrateKingdom(input) {
        const base = createDefaultKingdom();
        const source = input && typeof input === 'object' ? input : {};
        const kingdom = {
            ...base,
            ...source,
            schemaVersion: SCHEMA_VERSION,
            active: source.active === true || Boolean(clean(source.name)),
            initialized: source.initialized === true || Boolean(clean(source.name)),
            name: clean(source.name, 100),
            rulerTitle: clean(source.rulerTitle, 80),
            rulerName: clean(source.rulerName, 100),
            government: clean(source.government, 100),
            capital: clean(source.capital, 100),
            treasury: integer(source.treasury),
            population: Math.max(0, integer(source.population)),
            stability: clamp(source.stability ?? 50),
            legitimacy: clamp(source.legitimacy ?? 50),
            prosperity: clamp(source.prosperity ?? 50),
            food: Math.max(0, integer(source.food)),
            period: Math.max(0, integer(source.period)),
            lastPeriodTurn: Math.max(0, integer(source.lastPeriodTurn)),
            taxRate: clamp(source.taxRate ?? 10, 0, 40),
            army: normalizeArmy(source.army),
            territories: Array.isArray(source.territories) ? source.territories.map(normalizeTerritory) : [],
            factions: Array.isArray(source.factions) ? source.factions.map(normalizeFaction) : [],
            diplomacy: Array.isArray(source.diplomacy) ? source.diplomacy.map(normalizeDiplomacy) : [],
            laws: Array.isArray(source.laws) ? source.laws.map(normalizeLaw) : [],
            council: Array.isArray(source.council) ? source.council.map(normalizeCouncilor) : [],
            history: Array.isArray(source.history) ? source.history.slice(-MAX_HISTORY) : [],
            processedNarrativeEvents: Array.isArray(source.processedNarrativeEvents)
                ? source.processedNarrativeEvents.slice(-MAX_PROCESSED_EVENTS) : [],
            settings: {
                periodTurns: Math.max(1, integer(source.settings?.periodTurns, 5))
            },
            lastReport: { ...base.lastReport, ...(source.lastReport || {}) }
        };
        return kingdom;
    }

    function upsert(collection, raw, normalize, identity) {
        const normalized = normalize(raw, collection.length);
        const key = keyOf(identity(normalized));
        const index = collection.findIndex(item => keyOf(identity(item)) === key);
        if (index >= 0) collection[index] = normalize({ ...collection[index], ...raw }, index);
        else collection.push(normalized);
        return index >= 0 ? collection[index] : normalized;
    }

    function addHistory(state, text, turn, type = 'evento') {
        const entry = { turn: Math.max(0, integer(turn)), type: clean(type, 40), text: clean(text, 260) };
        if (entry.text) state.history.push(entry);
        state.history = state.history.slice(-MAX_HISTORY);
        return entry;
    }

    function eventFingerprint(event) {
        return keyOf(JSON.stringify(event));
    }

    function parseNarrativeTags(response) {
        const source = String(response || '').replace(/\[ANALISI\][\s\S]*?\[\/ANALISI\]/gi, '');
        const events = [];
        const map = {
            REGNO: ['profile', ['name', 'rulerTitle', 'rulerName', 'government', 'capital', 'treasury', 'population', 'stability', 'legitimacy', 'prosperity', 'food']],
            TERRITORIO_REGNO: ['territory', ['kingdomName', 'name', 'territoryType', 'population', 'foodProduction', 'taxIncome', 'fortification', 'loyalty', 'controller', 'strategicResource', 'status']],
            FAZIONE_REGNO: ['faction', ['kingdomName', 'name', 'category', 'leader', 'power', 'loyalty', 'wealth', 'goal', 'status']],
            ESERCITO_REGNO: ['army', ['kingdomName', 'levies', 'professionals', 'cavalry', 'navy', 'morale', 'readiness', 'upkeep']],
            DIPLOMAZIA_REGNO: ['diplomacy', ['kingdomName', 'realm', 'relation', 'trust', 'tension', 'treaty', 'trade', 'claims']],
            LEGGE_REGNO: ['law', ['kingdomName', 'title', 'area', 'effect', 'status', 'support', 'opposition']],
            CONSIGLIERE_REGNO: ['councilor', ['kingdomName', 'name', 'role', 'competence', 'loyalty', 'faction', 'status']],
            TESORO_REGNO: ['treasury', ['kingdomName', 'direction', 'amount', 'reason']],
            EVENTO_REGNO: ['event', ['kingdomName', 'eventKind', 'description', 'treasuryDelta', 'foodDelta', 'populationDelta', 'stabilityDelta', 'legitimacyDelta', 'prosperityDelta']]
        };
        Object.entries(map).forEach(([tag, definition]) => {
            const regex = new RegExp('\\[' + tag + ':\\s*([^\\]]+)\\]', 'gi');
            let match;
            while ((match = regex.exec(source)) !== null) {
                const fields = match[1].split('|').map(value => value.trim());
                const event = { type: definition[0] };
                definition[1].forEach((field, index) => { event[field] = fields[index] || ''; });
                events.push(event);
            }
        });
        return events;
    }

    function applyNarrativeEvents(input, events, context = {}) {
        const state = migrateKingdom(input);
        const turn = Math.max(0, integer(context.turn));
        const results = [];
        (Array.isArray(events) ? events : []).forEach(event => {
            const fingerprint = eventFingerprint(event);
            if (state.processedNarrativeEvents.includes(fingerprint)) {
                results.push({ ok: true, skipped: true, type: event.type, message: 'Evento già applicato' });
                return;
            }
            let message = '';
            try {
                if (event.type !== 'profile' && clean(event.kingdomName) &&
                    state.active && keyOf(event.kingdomName) !== keyOf(state.name)) {
                    throw new Error(`tag destinato a ${clean(event.kingdomName)}, non a ${state.name}`);
                }
                if (event.type === 'profile') {
                    if (!clean(event.name)) throw new Error('REGNO senza nome');
                    state.name = clean(event.name, 100);
                    state.rulerTitle = clean(event.rulerTitle || state.rulerTitle, 80);
                    state.rulerName = clean(event.rulerName || state.rulerName, 100);
                    state.government = clean(event.government || state.government, 100);
                    state.capital = clean(event.capital || state.capital, 100);
                    ['treasury', 'population', 'stability', 'legitimacy', 'prosperity', 'food'].forEach(field => {
                        const value = parseNumber(event[field], null);
                        if (value != null) state[field] = field === 'population' || field === 'food'
                            ? Math.max(0, Math.round(value))
                            : field === 'stability' || field === 'legitimacy' || field === 'prosperity'
                                ? clamp(value) : Math.round(value);
                    });
                    state.active = true;
                    state.initialized = true;
                    if (!state.lastPeriodTurn) state.lastPeriodTurn = turn;
                    message = `Regno registrato: ${state.name}`;
                } else if (!state.active) {
                    throw new Error('regno non ancora registrato con [REGNO]');
                } else if (event.type === 'territory') {
                    if (!clean(event.name)) throw new Error('TERRITORIO_REGNO senza nome');
                    const territory = upsert(state.territories, event, normalizeTerritory, item => item.name);
                    state.population = state.territories.reduce((sum, item) => sum + item.population, 0) || state.population;
                    message = `Territorio aggiornato: ${territory.name}`;
                } else if (event.type === 'faction') {
                    if (!clean(event.name)) throw new Error('FAZIONE_REGNO senza nome');
                    const faction = upsert(state.factions, event, normalizeFaction, item => item.name);
                    message = `Fazione aggiornata: ${faction.name}`;
                } else if (event.type === 'diplomacy') {
                    if (!clean(event.realm)) throw new Error('DIPLOMAZIA_REGNO senza controparte');
                    const relation = upsert(state.diplomacy, event, normalizeDiplomacy, item => item.realm);
                    message = `Diplomazia aggiornata: ${relation.realm}`;
                } else if (event.type === 'army') {
                    state.army = normalizeArmy({ ...state.army, ...event });
                    message = 'Forze armate aggiornate';
                } else if (event.type === 'law') {
                    if (!clean(event.title)) throw new Error('LEGGE_REGNO senza titolo');
                    const law = upsert(state.laws, event, normalizeLaw, item => item.title);
                    message = `Legge aggiornata: ${law.title}`;
                } else if (event.type === 'councilor') {
                    if (!clean(event.name)) throw new Error('CONSIGLIERE_REGNO senza nome');
                    const councilor = upsert(state.council, event, normalizeCouncilor, item => item.name);
                    message = `Consiglio aggiornato: ${councilor.name}`;
                } else if (event.type === 'treasury') {
                    const amount = Math.abs(integer(event.amount));
                    if (!amount) throw new Error('TESORO_REGNO senza importo valido');
                    const incoming = /entra|incasso|credito|\+/.test(clean(event.direction).toLowerCase());
                    state.treasury += incoming ? amount : -amount;
                    message = `${incoming ? 'Entrata' : 'Uscita'} del tesoro: ${amount}`;
                } else if (event.type === 'event') {
                    const deltas = {
                        treasury: integer(event.treasuryDelta),
                        food: integer(event.foodDelta),
                        population: integer(event.populationDelta),
                        stability: integer(event.stabilityDelta),
                        legitimacy: integer(event.legitimacyDelta),
                        prosperity: integer(event.prosperityDelta)
                    };
                    state.treasury += deltas.treasury;
                    state.food = Math.max(0, state.food + deltas.food);
                    state.population = Math.max(0, state.population + deltas.population);
                    state.stability = clamp(state.stability + deltas.stability);
                    state.legitimacy = clamp(state.legitimacy + deltas.legitimacy);
                    state.prosperity = clamp(state.prosperity + deltas.prosperity);
                    message = clean(event.description || 'Evento del regno', 200);
                } else {
                    throw new Error(`tipo evento regno sconosciuto: ${event.type}`);
                }
                state.processedNarrativeEvents.push(fingerprint);
                state.processedNarrativeEvents = state.processedNarrativeEvents.slice(-MAX_PROCESSED_EVENTS);
                addHistory(state, message, turn, event.type);
                results.push({ ok: true, type: event.type, message });
            } catch (error) {
                results.push({ ok: false, type: event.type, message: error.message });
            }
        });
        return { state, results };
    }

    function runPeriod(input, context = {}) {
        const state = migrateKingdom(input);
        if (!state.active) return { state, report: null };
        const incomeBase = state.territories.reduce((sum, item) => sum + item.taxIncome, 0);
        const loyaltyFactor = state.territories.length
            ? state.territories.reduce((sum, item) => sum + item.loyalty, 0) / state.territories.length / 100
            : 0.5;
        const income = Math.round(incomeBase * (state.taxRate / 10) * (0.65 + loyaltyFactor * 0.35));
        const armyUpkeep = state.army.upkeep || Math.round(
            state.army.levies * 0.08 + state.army.professionals * 0.6 +
            state.army.cavalry * 1.4 + state.army.navy * 2
        );
        const administration = Math.round(Math.max(10, state.population * 0.002));
        const foodProduced = state.territories.reduce((sum, item) => sum + item.foodProduction, 0);
        const foodConsumed = Math.round(state.population * 0.02 + state.army.professionals * 0.15);
        const foodBalance = foodProduced - foodConsumed;
        const balance = income - armyUpkeep - administration;
        state.treasury += balance;
        state.food = Math.max(0, state.food + foodBalance);
        state.period += 1;
        state.lastPeriodTurn = Math.max(state.lastPeriodTurn, integer(context.turn));
        const shortage = state.food === 0 && foodBalance < 0;
        const taxPressure = Math.max(0, state.taxRate - 15);
        state.stability = clamp(state.stability + (balance >= 0 ? 1 : -2) - (shortage ? 8 : 0) - Math.ceil(taxPressure / 5));
        state.prosperity = clamp(state.prosperity + (foodBalance >= 0 ? 1 : -3) + (balance >= 0 ? 1 : -1));
        state.population = Math.max(0, Math.round(state.population * (shortage ? 0.995 : 1.001)));
        state.factions = state.factions.map(faction => ({
            ...faction,
            loyalty: clamp(faction.loyalty + (shortage ? -4 : 0) - Math.ceil(taxPressure / 8) + (state.stability >= 60 ? 1 : 0))
        }));
        const report = {
            period: state.period, income, armyUpkeep, administration, balance,
            foodProduced, foodConsumed, foodBalance, shortage
        };
        state.lastReport = report;
        addHistory(state,
            `Periodo ${state.period}: bilancio ${balance >= 0 ? '+' : ''}${balance}, viveri ${foodBalance >= 0 ? '+' : ''}${foodBalance}`,
            state.lastPeriodTurn, 'periodo');
        return { state, report };
    }

    function processPeriods(input, context = {}) {
        let state = migrateKingdom(input);
        if (!state.active) return { state, reports: [] };
        const turn = Math.max(0, integer(context.turn));
        const reports = [];
        while (turn - state.lastPeriodTurn >= state.settings.periodTurns) {
            const result = runPeriod(state, { ...context, turn: state.lastPeriodTurn + state.settings.periodTurns });
            state = result.state;
            if (result.report) reports.push(result.report);
        }
        return { state, reports };
    }

    function buildNarrativeContext(input, turn = 0, currency = 'monete') {
        const state = migrateKingdom(input);
        if (!state.active) return '';
        const lines = [
            '\n👑 REGNO GESTITO — STATO AUTORITATIVO DEL MOTORE',
            `${state.name} · ${state.rulerTitle || 'Governante'} ${state.rulerName || ''} · Capitale: ${state.capital || 'non definita'}`,
            `Tesoro: ${state.treasury} ${currency} | Popolazione: ${state.population} | Viveri: ${state.food}`,
            `Stabilità ${Math.round(state.stability)}/100 | Legittimità ${Math.round(state.legitimacy)}/100 | Prosperità ${Math.round(state.prosperity)}/100 | Imposte ${state.taxRate}%`,
            `Esercito: ${state.army.levies} leve, ${state.army.professionals} professionisti, ${state.army.cavalry} cavalleria, ${state.army.navy} flotta; morale ${Math.round(state.army.morale)}, prontezza ${Math.round(state.army.readiness)}.`,
            `Territori: ${state.territories.length ? state.territories.map(item => `${item.name} (${item.type}, pop. ${item.population}, lealtà ${Math.round(item.loyalty)}, entrate ${item.taxIncome}, viveri ${item.foodProduction}${item.strategicResource ? ', risorsa: ' + item.strategicResource : ''})`).join('; ') : 'nessuno registrato'}.`,
            `Fazioni di corte: ${state.factions.length ? state.factions.map(item => `${item.name}/${item.category} (potere ${Math.round(item.power)}, lealtà ${Math.round(item.loyalty)}, obiettivo: ${item.goal || 'ignoto'})`).join('; ') : 'nessuna registrata'}.`,
            `Diplomazia: ${state.diplomacy.length ? state.diplomacy.map(item => `${item.realm}: ${item.relation}, fiducia ${Math.round(item.trust)}, tensione ${Math.round(item.tension)}${item.claims ? ', rivendicazioni: ' + item.claims : ''}`).join('; ') : 'nessuna relazione registrata'}.`,
            `Turno ${turn}, periodo ${state.period}. Il tesoro del regno è separato dal denaro personale e dalla cassa delle attività.`,
            'Non inventare possedimenti, truppe o fondi fuori da questo stato. Ogni cambiamento narrato deve essere trasmesso con un tag REGNO/TERRITORIO_REGNO/FAZIONE_REGNO/ESERCITO_REGNO/DIPLOMAZIA_REGNO/LEGGE_REGNO/CONSIGLIERE_REGNO/TESORO_REGNO/EVENTO_REGNO.'
        ];
        return lines.join('\n');
    }

    function manualAction(input, action, context = {}) {
        const state = migrateKingdom(input);
        if (!state.active) throw new Error('Nessun regno attivo');
        if (action === 'tax') {
            state.taxRate = clamp(context.value, 0, 40);
            addHistory(state, `Aliquota fiscale fissata al ${state.taxRate}%`, context.turn, 'decreto');
        } else if (action === 'council') {
            const cost = Math.max(10, Math.round(state.population * 0.0005));
            if (state.treasury < cost) throw new Error('Tesoro insufficiente per convocare il consiglio');
            state.treasury -= cost;
            state.stability = clamp(state.stability + 3);
            state.factions = state.factions.map(item => ({ ...item, loyalty: clamp(item.loyalty + 2) }));
            addHistory(state, `Consiglio convocato (costo ${cost})`, context.turn, 'consiglio');
        } else if (action === 'relief') {
            const cost = Math.max(50, integer(context.value, 100));
            if (state.treasury < cost) throw new Error('Tesoro insufficiente per gli aiuti');
            state.treasury -= cost;
            state.stability = clamp(state.stability + 5);
            state.legitimacy = clamp(state.legitimacy + 3);
            state.factions = state.factions.map(item =>
                /contadin|artigian|mercant|popol/.test(item.category.toLowerCase())
                    ? { ...item, loyalty: clamp(item.loyalty + 5) } : item
            );
            addHistory(state, `Aiuti alla popolazione per ${cost}`, context.turn, 'decreto');
        } else if (action === 'recruit') {
            const quantity = Math.max(1, integer(context.value, 10));
            const cost = quantity * 5;
            if (state.treasury < cost) throw new Error('Tesoro insufficiente per il reclutamento');
            state.treasury -= cost;
            state.army.professionals += quantity;
            state.army.morale = clamp(state.army.morale + 1);
            addHistory(state, `Reclutati ${quantity} professionisti (costo ${cost})`, context.turn, 'esercito');
        } else if (action === 'period') {
            return runPeriod(state, context).state;
        }
        return state;
    }

    class KingdomManager {
        createDefault() { return createDefaultKingdom(); }
        migrate(input) { return migrateKingdom(input); }
        applyNarrativeEvents(input, events, context) { return applyNarrativeEvents(input, events, context); }
        processPeriods(input, context) { return processPeriods(input, context); }
        runPeriod(input, context) { return runPeriod(input, context); }
        buildNarrativeContext(input, turn, currency) { return buildNarrativeContext(input, turn, currency); }
        manualAction(input, action, context) { return manualAction(input, action, context); }
        parseNarrativeTags(response) { return parseNarrativeTags(response); }
    }

    return {
        SCHEMA_VERSION,
        KingdomManager,
        createDefaultKingdom,
        migrateKingdom,
        applyNarrativeEvents,
        processPeriods,
        runPeriod,
        buildNarrativeContext,
        manualAction,
        parseNarrativeTags,
        parseNumber,
        clean,
        keyOf
    };
});
