(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheSystemicWorld = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const SCHEMA_VERSION = 1;
    const PATCH_VERSION = 1;
    const MAX_HISTORY = 40;
    const MAX_PROCESSED_EVENTS = 180;
    const MAX_MARKET_RIVALS = 8;
    const MAX_SYSTEMIC_SEEDS_PER_TURN = 1;
    const STYLE_ID = 'cronache-systemic-world-style';
    const PANEL_ID = 'systemic-world-panel';

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 700) => String(value == null ? '' : value)
        .replace(/\s+/g, ' ').trim().slice(0, max);
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, number(value, min)));
    const keyOf = value => clean(value, 300).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    let hubObserver = null;

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function hashText(value) {
        const text = String(value || '');
        let hash = 2166136261;
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function deterministicNoise(key, turn = 0) {
        const hash = parseInt(hashText(`${key}|${Math.max(0, Math.round(number(turn)))}`), 36) || 0;
        return ((hash % 2001) - 1000) / 1000;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function ensureSystemicState(state = getState()) {
        if (!state?.worldMemory) {
            return {
                schemaVersion: SCHEMA_VERSION,
                lastProcessedTurn: -1,
                lastInjectionTurn: -1,
                markets: {},
                politics: { factions: {}, election: {}, wars: {}, pressureStreaks: {} },
                history: [], processedEvents: []
            };
        }
        const memory = state.worldMemory;
        if (!memory.systemicWorld || typeof memory.systemicWorld !== 'object') {
            memory.systemicWorld = {
                schemaVersion: SCHEMA_VERSION,
                lastProcessedTurn: -1,
                lastInjectionTurn: -1,
                markets: {},
                politics: { factions: {}, election: {}, wars: {}, pressureStreaks: {} },
                history: [],
                processedEvents: []
            };
        }
        const systemic = memory.systemicWorld;
        systemic.schemaVersion = SCHEMA_VERSION;
        if (!systemic.markets || typeof systemic.markets !== 'object' || Array.isArray(systemic.markets)) systemic.markets = {};
        if (!systemic.politics || typeof systemic.politics !== 'object') systemic.politics = {};
        if (!systemic.politics.factions || typeof systemic.politics.factions !== 'object') systemic.politics.factions = {};
        if (!systemic.politics.election || typeof systemic.politics.election !== 'object') systemic.politics.election = {};
        if (!systemic.politics.wars || typeof systemic.politics.wars !== 'object') systemic.politics.wars = {};
        if (!systemic.politics.pressureStreaks || typeof systemic.politics.pressureStreaks !== 'object') systemic.politics.pressureStreaks = {};
        if (!Array.isArray(systemic.history)) systemic.history = [];
        if (!Array.isArray(systemic.processedEvents)) systemic.processedEvents = [];
        if (!Number.isFinite(Number(systemic.lastProcessedTurn))) systemic.lastProcessedTurn = -1;
        if (!Number.isFinite(Number(systemic.lastInjectionTurn))) systemic.lastInjectionTurn = -1;
        return systemic;
    }

    function businessId(business) {
        return clean(business?.id || business?.name || business?.propertyName, 150) || 'business';
    }

    function specializationFor(business) {
        try {
            const profile = root.CronacheBusinessSpecializations?.inferSpecialization?.(business);
            if (profile?.key || profile?.label) return { key: clean(profile.key || business?.type || 'business', 60), label: clean(profile.label || profile.key || business?.type || 'Attività', 100) };
        } catch (_error) { }
        return { key: clean(business?.type || 'business', 60), label: clean(business?.type || 'Attività', 100) };
    }

    function agentsForBusiness(state, business) {
        const id = keyOf(businessId(business));
        const api = root.CronacheManagementAgents;
        const agents = api?.syncAgents ? api.syncAgents(state) : asArray(state?.worldMemory?.managementAgents?.agents);
        return agents.filter(agent => agent?.domain === 'business' && keyOf(agent.subjectId) === id && agent.status === 'active');
    }

    function relationsForBusiness(state, business) {
        const id = keyOf(businessId(business));
        const api = root.CronacheManagementNetwork;
        const relations = api?.syncNetwork ? api.syncNetwork(state) : asArray(state?.worldMemory?.managementNetwork?.relations);
        return relations.filter(relation => relation?.status === 'active' && keyOf(relation.subjectId) === id);
    }

    function ensureMarket(systemic, business, turn) {
        const id = businessId(business);
        if (!systemic.markets[id] || typeof systemic.markets[id] !== 'object') {
            const profile = specializationFor(business);
            systemic.markets[id] = {
                businessId: id,
                name: clean(business?.name || business?.propertyName || 'Attività', 120),
                sector: profile.key,
                sectorLabel: profile.label,
                demandIndex: 100,
                priceIndex: 100,
                supplyIndex: 100,
                competitionIndex: 45,
                marketShare: 50,
                previousMarketShare: 50,
                sentiment: 0,
                momentum: 0,
                productBaselines: {},
                supplierBaselines: {},
                rivals: {},
                lastTurn: Math.max(0, number(turn)),
                history: []
            };
        }
        const market = systemic.markets[id];
        if (!market.productBaselines || typeof market.productBaselines !== 'object') market.productBaselines = {};
        if (!market.supplierBaselines || typeof market.supplierBaselines !== 'object') market.supplierBaselines = {};
        if (!market.rivals || typeof market.rivals !== 'object') market.rivals = {};
        if (!Array.isArray(market.history)) market.history = [];
        return market;
    }

    function relationBetween(relations, leftName, rightName) {
        const left = keyOf(leftName);
        const right = keyOf(rightName);
        return relations.find(relation => {
            const a = keyOf(relation.leftName);
            const b = keyOf(relation.rightName);
            return (a === left && b === right) || (a === right && b === left);
        }) || null;
    }

    function marketPriceIndex(business) {
        const products = asArray(business?.products).filter(product => product?.active !== false && number(product?.unitCost) > 0);
        if (!products.length) return 100;
        const ratios = products.map(product => number(product.salePrice) / Math.max(0.01, number(product.unitCost)));
        const avg = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
        return clamp(100 + (avg - 2.2) * 28, 55, 155);
    }

    function marketSupplyIndex(business, agents, relations) {
        const suppliers = asArray(business?.suppliers).filter(item => item?.status !== 'inactive');
        if (!suppliers.length) return 92;
        const values = suppliers.map(supplier => {
            const agent = agents.find(item => keyOf(item.name) === keyOf(supplier.name));
            const relationPenalty = relations.reduce((penalty, relation) => {
                if (![keyOf(relation.leftName), keyOf(relation.rightName)].includes(keyOf(supplier.name))) return penalty;
                return penalty + Math.max(0, number(relation.tension) - 50) * 0.18 - Math.max(0, number(relation.cooperation) - 50) * 0.1;
            }, 0);
            return clamp(number(supplier.reliability, 70) + (number(agent?.trust, 50) - 50) * 0.25 - relationPenalty, 15, 100);
        });
        return clamp(values.reduce((sum, value) => sum + value, 0) / values.length, 20, 110);
    }

    function marketCompetitionIndex(business, agents, relations) {
        const competitors = agents.filter(agent => agent.role === 'competitor');
        if (!competitors.length) return 38;
        const pressure = competitors.map(agent => {
            const hostile = agent.disposition === 'hostile' ? 18 : agent.disposition === 'wary' ? 8 : 0;
            const relation = relationBetween(relations, agent.name, business?.name || business?.propertyName || '');
            const networkPressure = relation ? Math.max(0, number(relation.tension) - 45) * 0.25 : 0;
            return clamp(number(agent.influence, 50) * 0.75 + number(agent.urgency, 50) * 0.2 + hostile + networkPressure, 0, 100);
        });
        return clamp(pressure.reduce((sum, value) => sum + value, 0) / pressure.length, 10, 100);
    }

    function macroDemandModifier(state) {
        const kingdom = state?.worldMemory?.kingdom || {};
        if (!kingdom.active) return 0;
        const people = kingdom.people || {};
        const economy = kingdom.economy || {};
        return clamp(
            (number(kingdom.prosperity, 50) - 50) * 0.22 +
            (number(people.employment, 65) - 65) * 0.15 -
            Math.max(0, number(economy.inflation, 2) - 4) * 1.4 -
            Math.max(0, number(people.poverty, 35) - 35) * 0.18,
            -28,
            24
        );
    }

    function updateDemandBaselines(business, market) {
        asArray(business?.products).forEach(product => {
            if (!product || product.active === false) return;
            const id = clean(product.id || product.name, 120);
            if (!id) return;
            const current = Math.max(0, number(product.baseDemand));
            let base = market.productBaselines[id];
            if (!base || typeof base !== 'object') {
                base = { baseline: current, lastApplied: current };
                market.productBaselines[id] = base;
            } else if (Math.abs(current - number(base.lastApplied, current)) >= Math.max(3, number(base.lastApplied, current) * 0.28)) {
                base.baseline = current;
            }
            const competitionFactor = clamp(1.08 - market.competitionIndex / 260, 0.62, 1.08);
            const target = Math.max(0, Math.round(number(base.baseline, current) * (market.demandIndex / 100) * competitionFactor));
            product.baseDemand = target;
            base.lastApplied = target;
        });
    }

    function updateSupplierReliability(business, market, agents, relations) {
        asArray(business?.suppliers).forEach(supplier => {
            if (!supplier || supplier.status === 'inactive') return;
            const id = clean(supplier.id || supplier.name, 120);
            if (!id) return;
            const current = clamp(supplier.reliability ?? 70);
            let base = market.supplierBaselines[id];
            if (!base || typeof base !== 'object') {
                base = { baseline: current, lastApplied: current };
                market.supplierBaselines[id] = base;
            } else if (Math.abs(current - number(base.lastApplied, current)) >= 12) {
                base.baseline = current;
            }
            const agent = agents.find(item => keyOf(item.name) === keyOf(supplier.name));
            const relationTension = relations.filter(relation => [keyOf(relation.leftName), keyOf(relation.rightName)].includes(keyOf(supplier.name)))
                .reduce((sum, relation) => sum + Math.max(0, number(relation.tension) - 50), 0);
            const target = clamp(number(base.baseline, current) + (number(agent?.trust, 50) - 50) * 0.08 - relationTension * 0.025, 20, 100);
            const applied = clamp(current + Math.max(-1.5, Math.min(1.5, target - current)), 20, 100);
            supplier.reliability = Math.round(applied * 10) / 10;
            base.lastApplied = supplier.reliability;
        });
    }

    function syncRivals(market, agents, turn) {
        const competitorAgents = agents.filter(agent => agent.role === 'competitor').slice(0, MAX_MARKET_RIVALS);
        const seen = new Set();
        competitorAgents.forEach(agent => {
            const id = clean(agent.id || agent.name, 150);
            if (!id) return;
            seen.add(id);
            let rival = market.rivals[id];
            if (!rival || typeof rival !== 'object') {
                rival = market.rivals[id] = {
                    id, name: clean(agent.name, 120), strength: clamp(agent.influence, 10, 100),
                    health: 70, momentum: 0, status: 'stable', firstTurn: turn, lastTurn: turn
                };
            }
            const pressure = clamp(number(agent.influence, 50) + (agent.disposition === 'hostile' ? 15 : 0), 0, 100);
            const relative = pressure - market.marketShare;
            rival.momentum = clamp(number(rival.momentum) * 0.55 + relative * 0.28 + deterministicNoise(id, turn) * 4, -35, 35);
            rival.health = clamp(number(rival.health, 70) + rival.momentum * 0.16, 0, 100);
            rival.strength = clamp(number(rival.strength, 50) * 0.7 + pressure * 0.3, 0, 100);
            const age = Math.max(0, turn - number(rival.firstTurn, turn));
            rival.status = age >= 8 && rival.health <= 8 ? 'failed'
                : rival.momentum >= 8 ? 'growing'
                    : rival.momentum <= -8 ? 'strained'
                        : 'stable';
            rival.lastTurn = turn;
        });
        Object.values(market.rivals).forEach(rival => {
            if (!seen.has(rival.id) && rival.status !== 'failed') rival.status = 'dormant';
        });
    }

    function processMarketBusiness(state, business, turn, systemic = ensureSystemicState(state)) {
        if (!business || business.status !== 'active' || business.narrativeInitialized !== true) return null;
        const market = ensureMarket(systemic, business, turn);
        const agents = agentsForBusiness(state, business);
        const relations = relationsForBusiness(state, business);
        const report = business.lastReport || {};
        const priceIndex = marketPriceIndex(business);
        const supplyIndex = marketSupplyIndex(business, agents, relations);
        const competitionIndex = marketCompetitionIndex(business, agents, relations);
        const satisfaction = number(business.customerSatisfaction, 60);
        const reputation = number(business.reputation, 50);
        const profitMargin = number(report.margin, 0);
        const stockouts = number(report.stockouts, 0);
        const macro = macroDemandModifier(state);
        const wordOfMouth = clamp((satisfaction - 60) * 0.25 + (reputation - 50) * 0.2 + number(market.sentiment) * 0.8, -24, 26);
        const pricePressure = Math.max(0, priceIndex - 108) * 0.22 - Math.max(0, 82 - priceIndex) * 0.08;
        const supplyPenalty = Math.max(0, 75 - supplyIndex) * 0.22 + stockouts * 2.5;
        const targetDemand = clamp(100 + wordOfMouth + macro - pricePressure - supplyPenalty + deterministicNoise(market.businessId, turn) * 3.5, 45, 155);
        market.demandIndex = clamp(number(market.demandIndex, 100) * 0.62 + targetDemand * 0.38, 45, 155);
        market.priceIndex = priceIndex;
        market.supplyIndex = clamp(number(market.supplyIndex, 100) * 0.6 + supplyIndex * 0.4, 20, 110);
        market.competitionIndex = clamp(number(market.competitionIndex, 45) * 0.6 + competitionIndex * 0.4, 10, 100);
        market.previousMarketShare = number(market.marketShare, 50);
        const shareTarget = clamp(
            50 + (reputation - 50) * 0.42 + (satisfaction - 60) * 0.36 + (market.demandIndex - 100) * 0.24 +
            profitMargin * 0.15 - (market.competitionIndex - 45) * 0.4,
            8, 88
        );
        market.marketShare = clamp(number(market.marketShare, 50) * 0.72 + shareTarget * 0.28, 8, 88);
        market.momentum = clamp((market.marketShare - market.previousMarketShare) * 4 + (market.demandIndex - 100) * 0.08, -25, 25);
        market.sentiment = clamp(number(market.sentiment) * 0.82 + (satisfaction - 60) * 0.05 + deterministicNoise(`${market.businessId}:sentiment`, turn), -25, 25);
        market.lastTurn = turn;

        updateDemandBaselines(business, market);
        updateSupplierReliability(business, market, agents, relations);
        syncRivals(market, agents, turn);

        market.history.push({
            turn,
            demandIndex: Math.round(market.demandIndex * 10) / 10,
            supplyIndex: Math.round(market.supplyIndex * 10) / 10,
            competitionIndex: Math.round(market.competitionIndex * 10) / 10,
            marketShare: Math.round(market.marketShare * 10) / 10,
            momentum: Math.round(market.momentum * 10) / 10
        });
        market.history = market.history.slice(-MAX_HISTORY);
        return market;
    }

    function processMarkets(state = getState(), turn = state?.worldMemory?.turnCount || 0, systemic = ensureSystemicState(state)) {
        const activeIds = new Set();
        const markets = [];
        asArray(state?.worldMemory?.management?.businesses).forEach(business => {
            const market = processMarketBusiness(state, business, turn, systemic);
            if (!market) return;
            activeIds.add(market.businessId);
            markets.push(market);
        });
        Object.values(systemic.markets).forEach(market => {
            if (!activeIds.has(market.businessId)) market.status = 'dormant';
            else market.status = 'active';
        });
        return markets;
    }

    function isElectoralGovernment(kingdom) {
        const text = keyOf(`${kingdom?.government || ''} ${kingdom?.rulerTitle || ''}`);
        return /repubblic|democra|parlament|elett|elezion|assemblea|senato/.test(text) && !/monarch-assolut|dittatur|autocraz|teocraz/.test(text);
    }

    function ensureFactionState(systemic, faction, kingdom, turn) {
        const id = clean(faction?.id || faction?.name, 150);
        if (!id) return null;
        let item = systemic.politics.factions[id];
        if (!item || typeof item !== 'object') {
            const population = Math.max(0, number(kingdom?.population));
            const baselineSupport = clamp(
                18 + number(faction.power, 25) * 0.34 + number(faction.loyalty, 50) * 0.12 - number(faction.hostility, 20) * 0.09,
                3, 75
            );
            item = systemic.politics.factions[id] = {
                id,
                name: clean(faction.name, 120),
                support: baselineSupport,
                resources: clamp(number(faction.wealth, 25) * 0.65 + number(faction.power, 25) * 0.35, 0, 100),
                mobilization: clamp(number(faction.hostility, 20) * 0.55 + number(faction.power, 25) * 0.25, 0, 100),
                members: population ? Math.round(population * baselineSupport / 100 * 0.18) : 0,
                momentum: 0,
                lastTurn: turn,
                status: 'active'
            };
        }
        return item;
    }

    function factionNetworkModifier(state, factionName) {
        const api = root.CronacheManagementNetwork;
        const relations = api?.syncNetwork ? api.syncNetwork(state) : asArray(state?.worldMemory?.managementNetwork?.relations);
        const factionKey = keyOf(factionName);
        return relations.filter(relation => relation?.status === 'active' && [keyOf(relation.leftName), keyOf(relation.rightName)].includes(factionKey))
            .reduce((sum, relation) => sum + (number(relation.cooperation) - 50) * 0.08 - Math.max(0, number(relation.tension) - 55) * 0.07, 0);
    }

    function processFactionPolitics(state, systemic, kingdom, turn) {
        const people = kingdom.people || {};
        const economy = kingdom.economy || {};
        const totalPopulation = Math.max(0, number(kingdom.population));
        const factionStates = [];
        asArray(kingdom.factions).forEach(faction => {
            if (!faction?.name || /resolved|sciolta|closed/.test(keyOf(faction.status))) return;
            const item = ensureFactionState(systemic, faction, kingdom, turn);
            if (!item) return;
            const network = factionNetworkModifier(state, faction.name);
            const grievance = Math.max(0, number(people.unrest, 20) - 35) * 0.12 + Math.max(0, number(people.poverty, 35) - 35) * 0.08;
            const economicMood = (number(kingdom.prosperity, 50) - 50) * 0.08 - Math.max(0, number(economy.inflation, 2) - 5) * 0.35;
            const governmentAlignment = (number(faction.loyalty, 50) - 50) * 0.06 - number(faction.hostility, 20) * 0.035;
            const targetMomentum = clamp(network + grievance * (number(faction.hostility, 20) >= 45 ? 1 : -0.35) + economicMood * (number(faction.loyalty, 50) >= 50 ? 1 : -0.6) + governmentAlignment + deterministicNoise(faction.name, turn) * 3, -18, 18);
            item.momentum = clamp(number(item.momentum) * 0.58 + targetMomentum * 0.42, -20, 20);
            item.support = clamp(number(item.support, 20) + item.momentum * 0.14, 2, 82);
            item.resources = clamp(number(item.resources, 35) + item.momentum * 0.08 + number(faction.wealth, 25) * 0.01, 0, 100);
            item.mobilization = clamp(number(item.mobilization, 30) + Math.max(0, grievance) * 0.08 + number(faction.hostility, 20) * 0.015 - Math.max(0, number(people.approval, 50) - 60) * 0.04, 0, 100);
            item.members = totalPopulation ? Math.round(totalPopulation * item.support / 100 * (0.12 + item.mobilization / 700)) : item.members;
            item.lastTurn = turn;
            item.status = 'active';
            faction.power = clamp(number(faction.power, 25) * 0.8 + item.support * 0.2, 0, 100);
            faction.wealth = clamp(number(faction.wealth, 25) * 0.88 + item.resources * 0.12, 0, 100);
            faction.loyalty = clamp(number(faction.loyalty, 50) + Math.max(-1.2, Math.min(1.2, (number(people.approval, 50) - 50) * 0.025 - number(faction.hostility, 20) * 0.008)), 0, 100);
            faction.hostility = clamp(number(faction.hostility, 20) + Math.max(-1.2, Math.min(1.2, item.momentum * 0.05 + Math.max(0, number(people.unrest, 20) - 45) * 0.02 - Math.max(0, number(people.approval, 50) - 60) * 0.02)), 0, 100);
            factionStates.push(item);
        });
        return factionStates;
    }

    function electionState(systemic, kingdom, turn, factionStates) {
        const election = systemic.politics.election;
        const electoral = isElectoralGovernment(kingdom);
        election.enabled = electoral;
        if (!electoral) {
            election.nextTurn = null;
            election.pending = false;
            return election;
        }
        const cycle = Math.max(8, Math.min(40, Math.round(number(kingdom?.settings?.electionTurns, election.cycleTurns || 16))));
        election.cycleTurns = cycle;
        if (!Number.isFinite(Number(election.nextTurn)) || number(election.nextTurn) <= 0) election.nextTurn = turn + cycle;
        const ranked = factionStates.slice().sort((a, b) => (number(b.support) + number(b.resources) * 0.18) - (number(a.support) + number(a.resources) * 0.18));
        election.frontRunner = ranked[0]?.name || '';
        election.frontRunnerScore = ranked[0] ? Math.round((number(ranked[0].support) + number(ranked[0].resources) * 0.18) * 10) / 10 : 0;
        election.turnsUntil = Math.max(0, Math.round(number(election.nextTurn) - turn));
        return election;
    }

    function diplomacyName(entry) {
        return clean(entry?.name || entry?.counterpart || entry?.kingdom || entry?.target || entry?.state || '', 120);
    }

    function processWarRisks(state, systemic, kingdom, turn) {
        const wars = systemic.politics.wars;
        const army = kingdom.army || {};
        const readiness = (number(army.readiness, 50) + number(army.morale, 50)) / 2;
        const instability = Math.max(0, 45 - number(kingdom.stability, 50));
        const activeNames = new Set();
        asArray(kingdom.diplomacy).forEach(entry => {
            const name = diplomacyName(entry);
            if (!name || /closed|resolved/.test(keyOf(entry.status))) return;
            activeNames.add(name);
            const relation = number(entry.relation, entry.trust ?? 50);
            const tension = number(entry.tension, entry.hostility ?? Math.max(0, 55 - relation));
            const explicitWar = /war|guerra|conflitt|ostil/.test(keyOf(`${entry.status || ''} ${entry.type || ''}`));
            const riskTarget = clamp(tension * 0.72 + Math.max(0, 45 - relation) * 0.5 + instability * 0.4 + Math.max(0, readiness - 65) * 0.12 + (explicitWar ? 25 : 0), 0, 100);
            let item = wars[name];
            if (!item || typeof item !== 'object') item = wars[name] = { name, risk: riskTarget, status: explicitWar ? 'war' : 'peace', lastTurn: turn };
            item.risk = clamp(number(item.risk, riskTarget) * 0.62 + riskTarget * 0.38, 0, 100);
            item.status = explicitWar ? 'war' : item.risk >= 88 ? 'escalation' : item.risk >= 68 ? 'crisis' : 'peace';
            item.lastTurn = turn;
        });
        Object.keys(wars).forEach(name => { if (!activeNames.has(name) && wars[name].status !== 'war') wars[name].status = 'dormant'; });
        return Object.values(wars).filter(item => item.status !== 'dormant');
    }

    function updatePressureStreak(systemic, key, active) {
        const streaks = systemic.politics.pressureStreaks;
        streaks[key] = active ? Math.max(0, number(streaks[key])) + 1 : 0;
        return streaks[key];
    }

    function ensureEmergentCrises(systemic, kingdom, turn) {
        const people = kingdom.people || {};
        const economy = kingdom.economy || {};
        const created = [];
        const crisisExists = token => asArray(kingdom.crises).some(crisis =>
            crisis?.status === 'active' && keyOf(`${crisis.name || ''} ${crisis.type || ''}`).includes(token)
        );
        const push = (token, name, severity, description) => {
            if (crisisExists(token)) return;
            kingdom.crises = asArray(kingdom.crises);
            const crisis = {
                id: `systemic-${token}-${turn}`,
                name,
                type: token,
                severity: Math.round(clamp(severity)),
                status: 'active',
                description: clean(description, 320),
                source: 'systemic-world',
                createdAtTurn: turn
            };
            kingdom.crises.push(crisis);
            kingdom.crises = kingdom.crises.slice(-40);
            created.push(crisis);
        };
        const foodPressure = clamp(Math.max(0, 35 - number(people.foodSecurity, 50)) * 2 + (number(kingdom.food) <= 0 ? 35 : 0));
        const socialPressure = clamp(Math.max(0, number(people.unrest, 20) - 50) * 1.6 + Math.max(0, number(people.poverty, 35) - 42) * 0.8);
        const inflationPressure = clamp(Math.max(0, number(economy.inflation, 2) - 9) * 5 + Math.max(0, 55 - number(kingdom.prosperity, 50)) * 0.5);
        if (updatePressureStreak(systemic, 'food', foodPressure >= 60) >= 2) {
            push('food', 'Crisi dei viveri e dei prezzi', Math.max(65, foodPressure), `Sicurezza alimentare ${Math.round(number(people.foodSecurity, 50))}% e scorte ${number(kingdom.food)}: la pressione è durata più turni e diventa una crisi sistemica.`);
        }
        if (updatePressureStreak(systemic, 'social', socialPressure >= 62) >= 2) {
            push('social', 'Mobilitazione sociale', Math.max(64, socialPressure), `Disordini ${Math.round(number(people.unrest, 20))}% e povertà ${Math.round(number(people.poverty, 35))}% hanno superato una soglia persistente.`);
        }
        if (updatePressureStreak(systemic, 'inflation', inflationPressure >= 60) >= 2) {
            push('inflation', 'Crisi del costo della vita', Math.max(62, inflationPressure), `Inflazione ${number(economy.inflation, 2)}% e prosperità ${Math.round(number(kingdom.prosperity, 50))}% stanno comprimendo consumi e consenso.`);
        }
        return created;
    }

    function processPolitics(state = getState(), turn = state?.worldMemory?.turnCount || 0, systemic = ensureSystemicState(state)) {
        const kingdom = state?.worldMemory?.kingdom || {};
        if (!kingdom.active) return { active: false, factionStates: [], wars: [], createdCrises: [] };
        const factionStates = processFactionPolitics(state, systemic, kingdom, turn);
        const election = electionState(systemic, kingdom, turn, factionStates);
        const wars = processWarRisks(state, systemic, kingdom, turn);
        const createdCrises = ensureEmergentCrises(systemic, kingdom, turn);
        return { active: true, factionStates, election, wars, createdCrises };
    }

    function processSystemicTurn(state = getState(), turn = state?.worldMemory?.turnCount || 0) {
        if (!state?.worldMemory) return { processed: false, markets: [], politics: null };
        const hasInputs = asArray(state.worldMemory?.management?.businesses).some(business => business?.status === 'active' && business?.narrativeInitialized === true) || Boolean(state.worldMemory?.kingdom?.active);
        if (!hasInputs) return { processed: false, markets: [], politics: null };
        const systemic = ensureSystemicState(state);
        const resolvedTurn = Math.max(0, Math.round(number(turn)));
        if (number(systemic.lastProcessedTurn, -1) === resolvedTurn) {
            return { processed: false, markets: Object.values(systemic.markets), politics: systemic.politics };
        }
        const markets = processMarkets(state, resolvedTurn, systemic);
        const politics = processPolitics(state, resolvedTurn, systemic);
        systemic.lastProcessedTurn = resolvedTurn;
        systemic.history.push({
            turn: resolvedTurn,
            markets: markets.map(market => ({ id: market.businessId, demand: Math.round(market.demandIndex), share: Math.round(market.marketShare), competition: Math.round(market.competitionIndex) })),
            politicalPressure: politics?.active ? Math.round(Math.max(0, ...politics.factionStates.map(item => number(item.mobilization)))) : 0,
            warRisk: politics?.active ? Math.round(Math.max(0, ...politics.wars.map(item => number(item.risk)))) : 0
        });
        systemic.history = systemic.history.slice(-MAX_HISTORY);
        return { processed: true, markets, politics };
    }

    function marketCandidates(state = getState(), systemic = ensureSystemicState(state)) {
        const result = [];
        const businesses = asArray(state?.worldMemory?.management?.businesses);
        Object.values(systemic.markets).forEach(market => {
            if (market.status === 'dormant') return;
            const business = businesses.find(item => businessId(item) === market.businessId);
            if (!business) return;
            const actors = agentsForBusiness(state, business).sort((a, b) => number(b.priority) - number(a.priority)).map(agent => agent.name).slice(0, 5);
            const rivals = Object.values(market.rivals).filter(rival => rival.status !== 'dormant');
            const growing = rivals.sort((a, b) => number(b.momentum) - number(a.momentum))[0];
            const failing = rivals.find(rival => rival.status === 'failed' || (rival.status === 'strained' && number(rival.health) < 25));
            const push = (score, title, cause, fingerprint, extraActors = []) => result.push({
                domain: 'market', score, title, cause: clean(cause, 1000), sourceId: market.businessId,
                actors: [...new Set([...extraActors, ...actors])].filter(Boolean).slice(0, 6),
                fingerprint: `market:${market.businessId}:${fingerprint}`
            });
            if (market.demandIndex <= 67) push(88, `${market.name}: domanda in contrazione`,
                `Il mercato di ${market.name} (${market.sectorLabel}) ha domanda ${Math.round(market.demandIndex)}/100, quota ${Math.round(market.marketShare)}% e concorrenza ${Math.round(market.competitionIndex)}/100. Fai emergere una conseguenza concreta su vendite, clienti, prezzi o capacità usando soggetti già registrati. La contrazione deve avere una causa osservabile e non essere solo una percentuale.`, `demand-low:${Math.round(market.demandIndex / 5)}`);
            else if (market.supplyIndex <= 58) push(86, `${market.name}: filiera sotto pressione`,
                `La disponibilità della filiera di ${market.name} è scesa a ${Math.round(market.supplyIndex)}/100. Usa fornitori, contratti e relazioni registrate per mostrare ritardi, priorità, rincari o rinegoziazioni reali che influenzino il prossimo periodo.`, `supply:${Math.round(market.supplyIndex / 5)}`);
            else if (market.competitionIndex >= 78 && growing) push(84, `${growing.name} aumenta la pressione su ${market.name}`,
                `${growing.name} è un concorrente registrato con forza ${Math.round(number(growing.strength))}/100 e momentum ${Math.round(number(growing.momentum))}; ${market.name} ha quota ${Math.round(market.marketShare)}%. Produci una mossa competitiva concreta su prezzi, clienti, forniture, reputazione o capacità.`, `competition:${growing.id}:${Math.round(market.competitionIndex / 5)}`, [growing.name]);
            else if (failing) push(75, `${failing.name}: crisi competitiva`,
                `${failing.name} è in ${failing.status === 'failed' ? 'uscita dal mercato' : 'forte difficoltà'} con salute ${Math.round(number(failing.health))}/100. Mostra una conseguenza realistica: cessione clienti, rinegoziazione di forniture, acquisizione, chiusura o reazione disperata solo se coerente con il mondo.`, `rival-fail:${failing.id}:${failing.status}`, [failing.name]);
            else if (market.marketShare >= 67 && market.momentum >= 5) push(68, `${market.name}: espansione del mercato`,
                `${market.name} ha quota stimata ${Math.round(market.marketShare)}%, domanda ${Math.round(market.demandIndex)}/100 e momentum positivo. Trasforma la crescita in una scelta concreta su capacità, personale, fornitura, reputazione o reazione dei concorrenti; non regalare crescita infinita senza costi.`, `growth:${Math.round(market.marketShare / 5)}:${Math.round(market.momentum)}`);
        });
        return result;
    }

    function politicalCandidates(state = getState(), systemic = ensureSystemicState(state)) {
        const kingdom = state?.worldMemory?.kingdom || {};
        if (!kingdom.active) return [];
        const result = [];
        const election = systemic.politics.election || {};
        const factionStates = Object.values(systemic.politics.factions).filter(item => item.status === 'active');
        if (election.enabled && factionStates.length && number(election.nextTurn, 999999) <= number(state.worldMemory.turnCount)) {
            const ranked = factionStates.slice().sort((a, b) => (number(b.support) + number(b.resources) * 0.18) - (number(a.support) + number(a.resources) * 0.18));
            const top = ranked.slice(0, 3);
            result.push({
                domain: 'politics', score: 94,
                title: `${kingdom.name}: appuntamento elettorale`,
                cause: `Nel ${kingdom.name} il sistema di governo (${clean(kingdom.government, 100)}) prevede competizione elettorale e il ciclo è arrivato alla scadenza. Forze principali: ${top.map(item => `${item.name} sostegno ${Math.round(number(item.support))}%, risorse ${Math.round(number(item.resources))}/100`).join('; ') || 'nessuna forza registrata'}. Genera un solo evento elettorale concreto coerente con regole, coalizioni e fatti della campagna. Non scegliere un vincitore casuale: usa sostegno, risorse, relazioni e crisi reali.`,
                sourceId: kingdom.name,
                actors: top.map(item => item.name).slice(0, 6),
                fingerprint: `election:${kingdom.name}:${Math.round(number(election.nextTurn))}`,
                election: true
            });
        }
        const war = Object.values(systemic.politics.wars).filter(item => item.status !== 'dormant')
            .sort((a, b) => number(b.risk) - number(a.risk))[0];
        if (war && number(war.risk) >= 78 && war.status !== 'war') {
            result.push({
                domain: 'politics', score: Math.min(96, Math.round(number(war.risk) + 4)),
                title: `${kingdom.name} e ${war.name}: escalation diplomatica`,
                cause: `Il rischio di conflitto tra ${kingdom.name} e ${war.name} è ${Math.round(number(war.risk))}/100, stato ${war.status}. Genera una mossa concreta di una delle parti — ultimatum, mobilitazione, mediazione, sanzioni, concessione o incidente — coerente con diplomazia, eserciti e relazioni registrate. Non dichiarare guerra automaticamente se non esiste una causa sufficiente.`,
                sourceId: war.name,
                actors: [war.name, kingdom.name],
                fingerprint: `war-risk:${war.name}:${Math.round(number(war.risk) / 5)}`
            });
        }
        const mobilized = factionStates.filter(item => number(item.mobilization) >= 72 || Math.abs(number(item.momentum)) >= 12)
            .sort((a, b) => (number(b.mobilization) + Math.abs(number(b.momentum)) * 2) - (number(a.mobilization) + Math.abs(number(a.momentum)) * 2))[0];
        if (mobilized) {
            result.push({
                domain: 'politics', score: Math.min(90, Math.round(68 + number(mobilized.mobilization) * 0.22)),
                title: `${mobilized.name}: mobilitazione politica`,
                cause: `${mobilized.name} ha sostegno ${Math.round(number(mobilized.support))}%, risorse ${Math.round(number(mobilized.resources))}/100 e mobilitazione ${Math.round(number(mobilized.mobilization))}/100. Fagli compiere una mossa coerente con obiettivo, rete di alleanze e situazione del ${kingdom.name}: campagna, protesta, coalizione, pressione istituzionale o sostegno al governo devono produrre un effetto osservabile.`,
                sourceId: mobilized.id,
                actors: [mobilized.name],
                fingerprint: `faction:${mobilized.id}:${Math.round(number(mobilized.mobilization) / 5)}:${Math.round(number(mobilized.momentum))}`
            });
        }
        return result;
    }

    function buildSystemicCandidates(state = getState()) {
        const systemic = ensureSystemicState(state);
        return [...politicalCandidates(state, systemic), ...marketCandidates(state, systemic)]
            .sort((a, b) => number(b.score) - number(a.score));
    }

    function systemicCandidateIsDue(candidate, state = getState()) {
        const systemic = ensureSystemicState(state);
        const turn = Math.max(0, number(state?.worldMemory?.turnCount));
        systemic.lastCandidateTurns = systemic.lastCandidateTurns && typeof systemic.lastCandidateTurns === 'object' ? systemic.lastCandidateTurns : {};
        const last = number(systemic.lastCandidateTurns[candidate.fingerprint], -9999);
        return turn - last >= (candidate.election ? 1 : candidate.score >= 90 ? 3 : 4);
    }

    function selectSystemicCandidate(state = getState()) {
        return buildSystemicCandidates(state).find(candidate => systemicCandidateIsDue(candidate, state)) || null;
    }

    function candidateToSeed(candidate, state = getState(), timelineApi = root.CronacheTimelineSimulator) {
        if (!candidate || !timelineApi?.normalizeEventSeed) return null;
        const turn = Math.max(0, number(state?.worldMemory?.turnCount));
        const score = clamp(candidate.score, 50, 98);
        return timelineApi.normalizeEventSeed({
            id: `systemic-world-${candidate.domain}-${hashText(`${candidate.fingerprint}|${turn}`)}`,
            kind: 'world_initiative',
            title: candidate.title,
            cause: candidate.cause,
            actors: candidate.actors,
            priority: score,
            notBeforeMinutes: score >= 92 ? 60 : score >= 82 ? 240 : score >= 72 ? 720 : 1440,
            interactionMode: 'either',
            sourceId: candidate.sourceId,
            source: `systemic-world-${candidate.domain}`,
            batchId: `systemic-world-${turn}`,
            createdAtTurn: turn,
            originTurn: turn,
            causalLane: 'world'
        }, 0, { turn, batchId: `systemic-world-${turn}` });
    }

    function countSystemicAndManagementSeeds(state, timelineApi) {
        const turn = Math.max(0, number(state?.worldMemory?.turnCount));
        return timelineApi.normalizeEventQueue(state?.worldMemory?.pendingTimelineEvents, { turn }).filter(seed =>
            number(seed.createdAtTurn) === turn && /^(?:management-|systemic-world-)/.test(seed.source || '')
        ).length;
    }

    function suppressPhase2ForTurn(state, turn) {
        if (!state?.worldMemory) return;
        if (!state.worldMemory.managementAutonomy || typeof state.worldMemory.managementAutonomy !== 'object') {
            state.worldMemory.managementAutonomy = { lastByFingerprint: {}, lastSeeds: [], lastInjectionTurn: turn };
        } else {
            state.worldMemory.managementAutonomy.lastInjectionTurn = turn;
        }
    }

    function enqueueSystemicSeed(state = getState(), timelineApi = root.CronacheTimelineSimulator) {
        if (!state?.worldMemory || !timelineApi?.normalizeEventQueue || !timelineApi?.scheduleEventSeeds) return [];
        const systemic = ensureSystemicState(state);
        const turn = Math.max(0, number(state.worldMemory.turnCount));
        if (number(systemic.lastInjectionTurn, -1) === turn) {
            if (systemic.lastSeedTurn === turn) suppressPhase2ForTurn(state, turn);
            return [];
        }
        systemic.lastInjectionTurn = turn;
        if (countSystemicAndManagementSeeds(state, timelineApi) >= 2) return [];
        const candidate = selectSystemicCandidate(state);
        if (!candidate) return [];
        const seed = candidateToSeed(candidate, state, timelineApi);
        if (!seed) return [];
        const current = timelineApi.normalizeEventQueue(state.worldMemory.pendingTimelineEvents, { turn });
        state.worldMemory.pendingTimelineEvents = timelineApi.scheduleEventSeeds(current, [seed], { turn, batchId: seed.batchId });
        systemic.lastCandidateTurns = systemic.lastCandidateTurns && typeof systemic.lastCandidateTurns === 'object' ? systemic.lastCandidateTurns : {};
        systemic.lastCandidateTurns[candidate.fingerprint] = turn;
        systemic.lastSeed = { id: seed.id, title: seed.title, source: seed.source, turn, fingerprint: candidate.fingerprint };
        systemic.lastSeedTurn = turn;
        suppressPhase2ForTurn(state, turn);
        if (candidate.election && systemic.politics.election.enabled) {
            const election = systemic.politics.election;
            election.pending = true;
            election.lastTriggeredTurn = turn;
            election.nextTurn = turn + Math.max(8, number(election.cycleTurns, 16));
        }
        return [seed].slice(0, MAX_SYSTEMIC_SEEDS_PER_TURN);
    }

    function eventSentiment(text) {
        const value = keyOf(text);
        if (/falliment|chiusur|boicott|scandal|sabot|insolven|carenz|ritard|protest|perdit|reclam|rifiut/.test(value)) return -6;
        if (/accord|success|espansion|crescita|nuov-client|fornitur-preferenz|alleanz|investiment|consegna-puntual|reputazion/.test(value)) return 5;
        return 0;
    }

    function recordSystemicEvents(state = getState(), events = []) {
        if (!state?.worldMemory) return [];
        const systemic = ensureSystemicState(state);
        const touched = [];
        const businesses = asArray(state.worldMemory.management?.businesses);
        asArray(events).forEach(event => {
            const eventId = clean(event?.id || event?.fingerprint, 180) || hashText(`${event?.title}|${event?.summary}`);
            if (systemic.processedEvents.includes(eventId)) return;
            const text = `${event?.title || ''} ${event?.summary || ''} ${event?.consequence || ''} ${asArray(event?.actors).join(' ')}`;
            const sentiment = eventSentiment(text);
            businesses.forEach(business => {
                const market = systemic.markets[businessId(business)];
                if (!market) return;
                const related = keyOf(text).includes(keyOf(business.name || business.propertyName)) ||
                    asArray(event?.actors).some(name => agentsForBusiness(state, business).some(agent => keyOf(agent.name) === keyOf(name)));
                if (!related) return;
                market.sentiment = clamp(number(market.sentiment) + sentiment, -25, 25);
                Object.values(market.rivals).forEach(rival => {
                    if (!keyOf(text).includes(keyOf(rival.name))) return;
                    if (/falliment|chiusur|ritir|liquidaz|cessaz/.test(keyOf(text))) {
                        rival.status = 'failed';
                        rival.health = Math.min(5, number(rival.health, 5));
                    } else if (/espansion|crescita|conquist|acquis/.test(keyOf(text))) {
                        rival.status = 'growing';
                        rival.health = clamp(number(rival.health, 70) + 8);
                    }
                });
                touched.push(`market:${market.businessId}`);
            });
            const election = systemic.politics.election || {};
            if (election.pending && /elezion|ballott|voto|urna|scrutin|coalizion-govern|maggioranz/.test(keyOf(text))) {
                const faction = Object.values(systemic.politics.factions).find(item => keyOf(text).includes(keyOf(item.name)));
                election.pending = false;
                election.lastResultTurn = Math.max(0, number(event?.turn, state.worldMemory.turnCount));
                election.lastWinner = faction?.name || election.frontRunner || '';
                touched.push('politics:election');
            }
            Object.values(systemic.politics.wars).forEach(war => {
                if (!keyOf(text).includes(keyOf(war.name))) return;
                if (/dichiar-guerra|guerra-aperta|inizio-ostilit|invas/.test(keyOf(text))) war.status = 'war';
                else if (/tregua|armistiz|pace-firmat|deescal/.test(keyOf(text))) {
                    war.status = 'peace';
                    war.risk = clamp(number(war.risk) - 30);
                } else if (/ultimatum|mobilit|sanzion|incidente-frontiera|minacc/.test(keyOf(text))) {
                    war.risk = clamp(number(war.risk) + 8);
                    war.status = war.risk >= 88 ? 'escalation' : 'crisis';
                }
                touched.push(`war:${war.name}`);
            });
            systemic.processedEvents.push(eventId);
        });
        systemic.processedEvents = systemic.processedEvents.slice(-MAX_PROCESSED_EVENTS);
        return [...new Set(touched)];
    }

    function buildMarketContext(state = getState(), options = {}) {
        const systemic = ensureSystemicState(state);
        const markets = Object.values(systemic.markets).filter(market => market.status !== 'dormant');
        const selected = options.businessId ? markets.filter(market => keyOf(market.businessId) === keyOf(options.businessId)) : markets;
        if (!selected.length) return '';
        return selected.slice(0, 8).map(market => {
            const rivals = Object.values(market.rivals).filter(rival => rival.status !== 'dormant').slice(0, 4)
                .map(rival => `${rival.name} [${rival.status}, forza ${Math.round(number(rival.strength))}, salute ${Math.round(number(rival.health))}]`).join('; ');
            return `- ${market.name} (${market.sectorLabel}): domanda ${Math.round(number(market.demandIndex))}/100, prezzi relativi ${Math.round(number(market.priceIndex))}/100, filiera ${Math.round(number(market.supplyIndex))}/100, concorrenza ${Math.round(number(market.competitionIndex))}/100, quota stimata ${Math.round(number(market.marketShare))}%, momentum ${Math.round(number(market.momentum))}. Rivali: ${rivals || 'nessun rivale registrato'}.`;
        }).join('\n');
    }

    function buildPoliticsContext(state = getState()) {
        const kingdom = state?.worldMemory?.kingdom || {};
        if (!kingdom.active) return '';
        const systemic = ensureSystemicState(state);
        const factions = Object.values(systemic.politics.factions).filter(item => item.status === 'active')
            .sort((a, b) => number(b.support) - number(a.support)).slice(0, 8)
            .map(item => `${item.name}: sostegno ${Math.round(number(item.support))}%, risorse ${Math.round(number(item.resources))}/100, mobilitazione ${Math.round(number(item.mobilization))}/100, membri stimati ${Math.round(number(item.members))}`).join('; ');
        const election = systemic.politics.election || {};
        const wars = Object.values(systemic.politics.wars).filter(item => item.status !== 'dormant')
            .sort((a, b) => number(b.risk) - number(a.risk)).slice(0, 5)
            .map(item => `${item.name}: rischio ${Math.round(number(item.risk))}/100 [${item.status}]`).join('; ');
        return `- Forze politiche: ${factions || 'nessuna fazione registrata'}.\n- Elezioni: ${election.enabled ? `prossimo ciclo tra ${Math.max(0, Math.round(number(election.nextTurn) - number(state.worldMemory.turnCount)))} turni; favorita ${election.frontRunner || 'non definita'}${election.pending ? '; voto in corso' : ''}` : 'il sistema di governo non usa elezioni periodiche'}.\n- Relazioni esterne: ${wars || 'nessuna escalation sistemica registrata'}.`;
    }

    function buildSystemicContext(state = getState(), options = {}) {
        const market = buildMarketContext(state, options);
        const politics = buildPoliticsContext(state);
        if (!market && !politics) return '';
        return `🌐 MONDO SISTEMICO — questi valori derivano dai dati reali della campagna e devono produrre conseguenze, non decorazione:\n${market ? `MERCATI:\n${market}\n` : ''}${politics ? `POLITICA:\n${politics}\n` : ''}`;
    }

    function patchNarrativeContexts() {
        let patched = false;
        const Business = root.CronacheBusiness?.BusinessManager;
        const businessOriginal = Business?.prototype?.buildNarrativeContext;
        if (typeof businessOriginal === 'function' && !businessOriginal.__systemicWorldWrapped) {
            const wrappedBusiness = function systemicBusinessContext(state, employees, turn, currency) {
                const base = businessOriginal.call(this, state, employees, turn, currency);
                const globalState = getState();
                try { processSystemicTurn(globalState, globalState?.worldMemory?.turnCount || turn); } catch (_error) { }
                const extra = buildMarketContext(globalState);
                return extra ? `${base || ''}\n📈 MERCATO SISTEMICO — usa domanda, filiera, quota e concorrenza come cause reali:\n${extra}\n` : base;
            };
            wrappedBusiness.__systemicWorldWrapped = true;
            wrappedBusiness.__systemicWorldOriginal = businessOriginal;
            Business.prototype.buildNarrativeContext = wrappedBusiness;
            patched = true;
        }
        const Kingdom = root.CronacheKingdom?.KingdomManager;
        const kingdomOriginal = Kingdom?.prototype?.buildNarrativeContext;
        if (typeof kingdomOriginal === 'function' && !kingdomOriginal.__systemicWorldWrapped) {
            const wrappedKingdom = function systemicKingdomContext(input, turn, currency) {
                const base = kingdomOriginal.call(this, input, turn, currency);
                const globalState = getState();
                try { processSystemicTurn(globalState, globalState?.worldMemory?.turnCount || turn); } catch (_error) { }
                const extra = buildPoliticsContext(globalState);
                return extra ? `${base || ''}\n🏛 POLITICA SISTEMICA — supporto, risorse, elezioni e rischio esterno evolvono dai dati:\n${extra}\n` : base;
            };
            wrappedKingdom.__systemicWorldWrapped = true;
            wrappedKingdom.__systemicWorldOriginal = kingdomOriginal;
            Kingdom.prototype.buildNarrativeContext = wrappedKingdom;
            patched = true;
        }
        return patched;
    }

    function patchEventManager() {
        const Manager = root.CronacheEvents?.EventManager;
        const original = Manager?.prototype?.record;
        if (typeof original !== 'function' || original.__systemicWorldWrapped) return Boolean(original?.__systemicWorldWrapped);
        const wrapped = function systemicEventRecord(events, incoming, context) {
            const result = original.call(this, events, incoming, context);
            try { if (result?.added?.length) recordSystemicEvents(getState(), result.added); } catch (error) { console.warn('[SystemicWorld] evento non acquisito:', error); }
            return result;
        };
        wrapped.__systemicWorldWrapped = true;
        wrapped.__systemicWorldOriginal = original;
        Manager.prototype.record = wrapped;
        return true;
    }

    function installStyles(documentRef) {
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
        const style = documentRef.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${PANEL_ID} { margin-top:12px; padding:12px; border:1px solid rgba(54,73,87,.16); border-radius:13px; background:rgba(246,250,252,.76); }
            #${PANEL_ID} .systemic-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:9px; }
            #${PANEL_ID} h4 { margin:0; color:#263b47; font-family:'Cinzel',serif; font-size:.88rem; }
            #${PANEL_ID} .systemic-badge { padding:3px 8px; border-radius:999px; background:rgba(41,98,125,.10); color:#31586c; font:700 .62rem Arial,sans-serif; }
            #${PANEL_ID} .systemic-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
            #${PANEL_ID} .systemic-card { padding:9px 10px; border:1px solid rgba(52,75,87,.12); border-radius:10px; background:rgba(255,255,255,.64); }
            #${PANEL_ID} .systemic-card strong { display:block; color:#24333b; font-size:.82rem; margin-bottom:4px; }
            #${PANEL_ID} .systemic-card small { display:block; color:#586d77; font-size:.71rem; line-height:1.35; }
            #${PANEL_ID} .systemic-card.alert { border-color:rgba(157,61,51,.22); background:rgba(255,246,244,.72); }
            @media(max-width:640px){ #${PANEL_ID}{padding:10px} #${PANEL_ID} .systemic-grid{grid-template-columns:1fr;} }
        `;
        documentRef.head.appendChild(style);
    }

    function renderSystemicPanel(documentRef) {
        const body = documentRef?.getElementById('management-hub-body');
        if (!body || documentRef.getElementById(PANEL_ID)) return false;
        const state = getState();
        if (!state?.worldMemory) return false;
        try { processSystemicTurn(state); } catch (_error) { }
        const systemic = ensureSystemicState(state);
        const markets = Object.values(systemic.markets).filter(item => item.status !== 'dormant').slice(0, 4);
        const election = systemic.politics.election || {};
        const war = Object.values(systemic.politics.wars).filter(item => item.status !== 'dormant').sort((a, b) => number(b.risk) - number(a.risk))[0];
        const factions = Object.values(systemic.politics.factions).filter(item => item.status === 'active').sort((a, b) => number(b.support) - number(a.support)).slice(0, 3);
        const cards = [];
        markets.forEach(market => {
            const alert = market.demandIndex < 72 || market.supplyIndex < 62 || market.competitionIndex > 78;
            cards.push(`<article class="systemic-card${alert ? ' alert' : ''}"><strong>📈 ${escapeHtml(market.name)}</strong><small>Domanda ${Math.round(number(market.demandIndex))} · quota ${Math.round(number(market.marketShare))}% · concorrenza ${Math.round(number(market.competitionIndex))}</small><small>Filiera ${Math.round(number(market.supplyIndex))} · momentum ${Math.round(number(market.momentum))}</small></article>`);
        });
        if (factions.length) {
            cards.push(`<article class="systemic-card"><strong>🏛 Forze politiche</strong><small>${factions.map(item => `${escapeHtml(item.name)} ${Math.round(number(item.support))}%`).join(' · ')}</small><small>${election.enabled ? `Elezioni tra ${Math.max(0, Math.round(number(election.nextTurn) - number(state.worldMemory.turnCount)))} turni` : 'Nessun ciclo elettorale automatico'}</small></article>`);
        }
        if (war) {
            cards.push(`<article class="systemic-card${number(war.risk) >= 78 ? ' alert' : ''}"><strong>🕊 ${escapeHtml(war.name)}</strong><small>Rischio conflitto ${Math.round(number(war.risk))}/100 · ${escapeHtml(war.status)}</small><small>Diplomazia ed eserciti possono far salire o scendere il rischio.</small></article>`);
        }
        const section = documentRef.createElement('section');
        section.id = PANEL_ID;
        section.innerHTML = `<div class="systemic-head"><h4>🌐 Mercati e politica sistemica</h4><span class="systemic-badge">turno ${Math.round(number(state.worldMemory.turnCount))}</span></div><div class="systemic-grid">${cards.join('') || '<article class="systemic-card"><small>I sistemi si attiveranno quando esisteranno attività gestite o un regno attivo.</small></article>'}</div>`;
        body.appendChild(section);
        return true;
    }

    function observeHub(documentRef, windowRef) {
        if (hubObserver || typeof windowRef?.MutationObserver !== 'function') return;
        const body = documentRef.getElementById('management-hub-body');
        if (!body) return;
        hubObserver = new windowRef.MutationObserver(() => {
            if (!documentRef.getElementById(PANEL_ID)) windowRef.setTimeout(() => renderSystemicPanel(documentRef), 0);
        });
        hubObserver.observe(body, { childList: true });
    }

    function handleAdvanceIntent() {
        const state = getState();
        if (!state?.worldMemory || state.isProcessing) return;
        try {
            processSystemicTurn(state);
            const seeds = enqueueSystemicSeed(state);
            if (seeds.length) {
                try { root.renderTimeline?.(); } catch (_error) { }
            }
        } catch (error) {
            console.warn('[SystemicWorld] aggiornamento turno ignorato:', error);
        }
    }

    function installUiEvents(documentRef, windowRef) {
        if (!documentRef || documentRef.__systemicWorldUiInstalled) return;
        documentRef.__systemicWorldUiInstalled = true;
        documentRef.addEventListener('click', event => {
            const target = event.target?.closest?.('#btn-advance-world, #btn-simulate-timeline');
            if (!target) return;
            handleAdvanceIntent();
        }, true);
        documentRef.addEventListener('click', event => {
            if (!event.target?.closest?.('#btn-management-hub')) return;
            try { processSystemicTurn(getState()); } catch (_error) { }
            windowRef?.setTimeout?.(() => renderSystemicPanel(documentRef), 0);
        }, true);
    }

    function install(documentRef, windowRef) {
        const state = getState();
        if (state?.worldMemory) {
            try { processSystemicTurn(state); } catch (_error) { }
        }
        const patched = [patchNarrativeContexts(), patchEventManager()].some(Boolean);
        if (documentRef && windowRef) {
            installStyles(documentRef);
            installUiEvents(documentRef, windowRef);
            observeHub(documentRef, windowRef);
            renderSystemicPanel(documentRef);
            documentRef.body?.classList.add('systemic-world-ready');
        }
        root.__cronacheSystemicWorldVersion = PATCH_VERSION;
        return patched || Boolean(state?.worldMemory);
    }

    function scheduleInstall() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        const attempt = () => install(document, window);
        [0, 100, 350, 900, 1800, 3500].forEach(delay => window.setTimeout(attempt, delay));
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attempt, { once: true });
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        SCHEMA_VERSION, PATCH_VERSION, MAX_SYSTEMIC_SEEDS_PER_TURN,
        ensureSystemicState, deterministicNoise, processMarketBusiness, processMarkets, processPolitics,
        processSystemicTurn, buildSystemicCandidates, selectSystemicCandidate, candidateToSeed, enqueueSystemicSeed,
        recordSystemicEvents, buildMarketContext, buildPoliticsContext, buildSystemicContext,
        isElectoralGovernment, install
    };
});
