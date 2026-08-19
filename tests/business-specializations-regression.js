'use strict';

const assert = require('assert');
const sectors = require('../js/business-specializations.js');

function business(overrides = {}) {
    return {
        id: 'b1', name: 'Attività', propertyName: 'Attività', description: '', type: 'commercio',
        status: 'active', narrativeInitialized: true, cash: 1000, reputation: 55, customerSatisfaction: 65,
        capacity: 100, products: [], suppliers: [], customers: [], contracts: [], lastReport: { revenue: 0, netProfit: 0, unitsSold: 0, margin: 0 },
        ...overrides
    };
}

assert.equal(sectors.inferSpecialization(business({ name: 'Banco dei Pegni San Luca' })).key, 'pawnbroker');
assert.equal(sectors.inferSpecialization(business({ name: 'Ortofrutta Verdi' })).key, 'greengrocer');
assert.equal(sectors.inferSpecialization(business({ name: 'Trattoria del Porto' })).key, 'restaurant');
assert.equal(sectors.inferSpecialization(business({ name: 'Banca Popolare', type: 'servizi' })).key, 'bank');
assert.equal(sectors.inferSpecialization(business({ name: 'Fabbrica Tessile Aurora', type: 'produzione' })).key, 'factory');

const pawn = business({
    name: 'Banco dei Pegni San Luca', cash: 100,
    products: [{ id: 'p1', name: 'Orologi in pegno', category: 'garanzie', stock: 18, unitCost: 80, reorderPoint: 2, active: true }],
    contracts: [
        { id: 'c1', title: 'Prestito su pegno Rossi', kind: 'prestito', counterpartyName: 'Mario Rossi', amount: 900, status: 'active', endTurn: 11 },
        { id: 'c2', title: 'Prestito su pegno Bianchi', kind: 'pegno', counterpartyName: 'Anna Bianchi', amount: 600, status: 'active', endTurn: 12 }
    ],
    customers: [{ name: 'Mario Rossi' }, { name: 'Anna Bianchi' }],
    lastReport: { revenue: 0, netProfit: -20, unitsSold: 0, margin: -10 }
});
const pawnSnapshot = sectors.buildSectorSnapshot(pawn, [], 10);
assert.equal(pawnSnapshot.profile.key, 'pawnbroker');
assert.ok(pawnSnapshot.metrics.some(([label]) => label === 'Esposizione'));
assert.ok(pawnSnapshot.signals.some(item => /liquidità/i.test(item.text)));
assert.ok(pawnSnapshot.signals.some(item => /scadenza/i.test(item.text)));
assert.ok(pawnSnapshot.primarySignal.score >= 80);

const produce = business({
    name: 'Ortofrutta Verdi',
    products: [
        { id: 'a', name: 'Pomodori freschi', category: 'verdura fresca', stock: 80, unitCost: 1, reorderPoint: 10, active: true },
        { id: 'b', name: 'Mele', category: 'frutta fresca', stock: 60, unitCost: 1, reorderPoint: 10, active: true }
    ],
    suppliers: [{ name: 'Mercato Ortofrutticolo', reliability: 52, status: 'active' }],
    lastReport: { revenue: 20, netProfit: 2, unitsSold: 8, margin: 10 }
});
const produceSnapshot = sectors.buildSectorSnapshot(produce, [], 4);
assert.equal(produceSnapshot.profile.key, 'greengrocer');
assert.ok(produceSnapshot.signals.some(item => /rotazione/i.test(item.text)));
assert.ok(produceSnapshot.signals.some(item => /fornitori/i.test(item.text)));

const context = sectors.buildSectorNarrativeContext({ businesses: [pawn, produce] }, [], 10, 'EUR');
assert.match(context, /PROFILO Banco dei pegni/);
assert.match(context, /PROFILO Ortofrutta/);
assert.match(context, /Regole operative/);
assert.match(context, /non un generico modello di negozio/);

console.log('business-specializations-regression: ok');
