'use strict';

const assert = require('assert');
const sectors = require('../js/business-specializations.js');
const timeline = require('../js/timeline-simulator.js');
global.CronacheBusinessSpecializations = sectors;
global.CronacheTimelineSimulator = timeline;
const autonomy = require('../js/management-autonomy.js');

const state = {
    character: { gold: 500 },
    worldMemory: {
        turnCount: 10,
        employees: [],
        pendingTimelineEvents: [],
        management: {
            businesses: [{
                id: 'pawn-1', name: 'Banco dei Pegni San Luca', propertyName: 'Banco dei Pegni San Luca',
                description: 'Prestiti su pegno e rivendita di beni non riscattati.', type: 'commercio',
                status: 'active', narrativeInitialized: true, cash: 100, reputation: 55, customerSatisfaction: 62,
                products: [{ id: 'p1', name: 'Orologi in pegno', category: 'garanzie', stock: 15, unitCost: 80, reorderPoint: 2, active: true }],
                suppliers: [], customers: [{ name: 'Mario Rossi' }],
                contracts: [{ id: 'c1', title: 'Prestito su pegno Rossi', kind: 'prestito', counterpartyName: 'Mario Rossi', amount: 1000, status: 'active', endTurn: 11 }],
                lastReport: { revenue: 0, netProfit: -15, unitsSold: 0, margin: -5 }
            }]
        },
        kingdom: {
            active: true, name: 'Regno di Astaria', treasury: -200, population: 10000, stability: 34, legitimacy: 42, prosperity: 40, food: 0,
            people: { approval: 31, unrest: 64, health: 45, employment: 61, poverty: 46, foodSecurity: 22 },
            economy: { gdp: 10000, debt: 7000, inflation: 9 },
            factions: [{ id: 'f1', name: 'Lega dei Mercanti', influence: 70, hostility: 66, loyalty: 24 }],
            crises: [{ id: 'cr1', name: 'Carestia del Nord', severity: 82, status: 'active' }],
            lastReport: { balance: -300 }
        }
    }
};

const candidates = autonomy.buildAutonomousCandidates(state, sectors);
assert.ok(candidates.some(item => item.domain === 'business'));
assert.ok(candidates.some(item => item.domain === 'kingdom'));
assert.ok(candidates[0].score >= 80);

const selected = autonomy.selectCandidates(state, sectors);
assert.ok(selected.length >= 1 && selected.length <= 2);
assert.ok(selected.some(item => item.domain === 'kingdom'));

const seed = autonomy.candidateToSeed(selected[0], state, timeline);
assert.ok(seed);
assert.equal(seed.kind, 'world_initiative');
assert.equal(seed.causalLane, 'world');
assert.match(seed.source, /^management-autonomy-/);
assert.ok(seed.cause.length > 40);

const added = autonomy.enqueueAutonomousSeeds(state, timeline, sectors);
assert.ok(added.length >= 1);
assert.ok(state.worldMemory.pendingTimelineEvents.length >= added.length);
assert.ok(state.worldMemory.pendingTimelineEvents.every(item => item.kind === 'world_initiative'));
assert.ok(state.worldMemory.managementAutonomy.lastSeeds.length >= added.length);

const second = autonomy.enqueueAutonomousSeeds(state, timeline, sectors);
assert.equal(second.length, 0, 'lo stesso segnale non deve essere riaccodato nello stesso turno');

const kingdomCandidates = autonomy.buildKingdomCandidates(state);
assert.ok(kingdomCandidates.some(item => /emergenza alimentare/i.test(item.title)));
assert.ok(kingdomCandidates.some(item => /tensione politica/i.test(item.title)));
assert.ok(kingdomCandidates.some(item => /Carestia del Nord/i.test(item.title)));

console.log('management-autonomy-regression: ok');
