'use strict';

const assert = require('assert');
const systemicApi = require('../js/systemic-world.js');

global.CronacheManagementAgents = {
    syncAgents() {
        return [
            { id: 'cust-1', name: 'Cliente Alfa', domain: 'business', subjectId: 'b1', role: 'customer', status: 'active', trust: 70, influence: 45, urgency: 40, priority: 55, disposition: 'aligned' },
            { id: 'sup-1', name: 'Fornitore Beta', domain: 'business', subjectId: 'b1', role: 'supplier', status: 'active', trust: 60, influence: 60, urgency: 50, priority: 65, disposition: 'pragmatic' },
            { id: 'comp-1', name: 'Rivale Gamma', domain: 'business', subjectId: 'b1', role: 'competitor', status: 'active', trust: 20, influence: 88, urgency: 75, priority: 90, disposition: 'hostile' },
            { id: 'fac-1', name: 'Riformisti', domain: 'kingdom', subjectId: 'Repubblica Nova', role: 'faction', status: 'active', trust: 55, influence: 70, urgency: 65, priority: 80, disposition: 'pragmatic' },
            { id: 'fac-2', name: 'Tradizionalisti', domain: 'kingdom', subjectId: 'Repubblica Nova', role: 'faction', status: 'active', trust: 35, influence: 64, urgency: 70, priority: 78, disposition: 'wary' }
        ];
    }
};
global.CronacheManagementNetwork = { syncNetwork() { return []; } };
global.CronacheBusinessSpecializations = { inferSpecialization() { return { key: 'pawn', label: 'Banco dei pegni' }; } };

const state = {
    worldMemory: {
        turnCount: 10,
        pendingTimelineEvents: [],
        management: {
            businesses: [{
                id: 'b1', name: 'Banco Uno', propertyName: 'Banco Uno', status: 'active', narrativeInitialized: true,
                reputation: 52, customerSatisfaction: 58,
                products: [{ id: 'p1', name: 'Pegni', active: true, unitCost: 10, salePrice: 28, baseDemand: 20, stock: 20, reorderPoint: 5 }],
                suppliers: [{ id: 's1', name: 'Fornitore Beta', reliability: 80, status: 'active' }],
                customers: [{ name: 'Cliente Alfa' }],
                competitors: [{ name: 'Rivale Gamma' }],
                lastReport: { margin: 5, stockouts: 0, netProfit: 10 }
            }]
        },
        kingdom: {
            active: true,
            name: 'Repubblica Nova',
            government: 'Repubblica parlamentare',
            rulerTitle: 'Presidente',
            population: 100000,
            stability: 45,
            legitimacy: 55,
            prosperity: 42,
            food: 0,
            people: { approval: 40, unrest: 60, poverty: 48, employment: 62, foodSecurity: 20 },
            economy: { inflation: 12, gdp: 100000, debt: 50000 },
            army: { readiness: 70, morale: 65 },
            factions: [
                { id: 'f1', name: 'Riformisti', power: 55, wealth: 50, loyalty: 55, hostility: 25 },
                { id: 'f2', name: 'Tradizionalisti', power: 50, wealth: 55, loyalty: 35, hostility: 62 }
            ],
            diplomacy: [{ name: 'Stato Est', relation: 5, tension: 98, status: 'active' }],
            crises: [],
            settings: { electionTurns: 8 }
        }
    }
};

const first = systemicApi.processSystemicTurn(state, 10);
assert.equal(first.processed, true);
const systemic = state.worldMemory.systemicWorld;
assert.ok(systemic.markets.b1, 'deve creare il mercato persistente dell’attività');
assert.ok(systemic.markets.b1.competitionIndex > 45, 'un concorrente forte deve aumentare la pressione competitiva');
assert.ok(state.worldMemory.management.businesses[0].products[0].baseDemand >= 0, 'la domanda di prodotto deve restare valida');
assert.equal(Object.keys(systemic.politics.factions).length, 2, 'le fazioni devono avere stato sistemico');
assert.equal(systemic.politics.election.enabled, true, 'una repubblica parlamentare deve attivare il ciclo elettorale');
assert.ok(systemic.politics.wars['Stato Est'].risk > 75, 'una crisi diplomatica estrema deve produrre rischio di guerra');

state.worldMemory.turnCount = 11;
systemicApi.processSystemicTurn(state, 11);
assert.ok(state.worldMemory.kingdom.crises.length >= 1, 'pressioni persistenti devono emergere come crisi di stato');

systemic.politics.election.nextTurn = 11;
const candidates = systemicApi.buildSystemicCandidates(state);
assert.ok(candidates.some(candidate => candidate.election), 'a scadenza deve comparire un evento elettorale');
assert.ok(candidates.some(candidate => /Stato Est|escalation/i.test(candidate.title)), 'un rischio esterno alto deve poter generare escalation');

const timeline = {
    normalizeEventSeed(seed) { return { ...seed }; },
    normalizeEventQueue(queue) { return Array.isArray(queue) ? queue : []; },
    scheduleEventSeeds(current, seeds) { return [...current, ...seeds]; }
};
const seed = systemicApi.candidateToSeed(candidates[0], state, timeline);
assert.ok(seed && /^systemic-world-/.test(seed.source));

const added = systemicApi.enqueueSystemicSeed(state, timeline);
assert.equal(added.length, 1, 'la Fase 5 può iniettare al massimo una causa sistemica');
assert.equal(state.worldMemory.managementAutonomy.lastInjectionTurn, 11, 'una causa sistemica deve sopprimere la Fase 2 nello stesso turno per rispettare il budget');
assert.equal(systemicApi.enqueueSystemicSeed(state, timeline).length, 0, 'non deve riaccodare nello stesso turno');

systemicApi.recordSystemicEvents(state, [{
    id: 'ev-rival-1',
    title: 'Rivale Gamma chiude',
    summary: 'Rivale Gamma annuncia la chiusura dopo perdite e cede i clienti rimasti.',
    actors: ['Rivale Gamma'],
    turn: 11
}]);
assert.equal(systemic.markets.b1.rivals['comp-1'].status, 'failed', 'la chiusura narrata deve diventare stato persistente del rivale');

const context = systemicApi.buildSystemicContext(state);
assert.match(context, /MERCATI/);
assert.match(context, /POLITICA/);
assert.match(context, /Riformisti/);
assert.match(context, /Banco Uno/);

console.log('systemic-world-regression: ok');
