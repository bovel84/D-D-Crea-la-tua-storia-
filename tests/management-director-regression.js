'use strict';

const assert = require('assert');
const director = require('../js/game-director.js');
const managementDirector = require('../js/management-director.js');

assert.equal(managementDirector.install(), true, 'il patch deve installarsi sul Game Director');

const memory = {
    turnCount: 4,
    management: {
        businesses: [{
            id: 'b1',
            name: 'Officina Rossa',
            status: 'active',
            cash: -120,
            customerSatisfaction: 32,
            products: [{ name: 'Ricambio', active: true, stock: 0, reorderPoint: 5 }],
            lastReport: { netProfit: -80, lowStock: ['Ricambio'] }
        }]
    },
    kingdom: {
        active: true,
        name: 'Valdoria',
        treasury: 300,
        food: 200,
        stability: 72,
        people: { unrest: 18, health: 70 },
        crises: []
    },
    world: { actors: [], factions: [] },
    npcs: [],
    factions: [],
    quests: []
};

const pressure = managementDirector.deriveManagementPressure(memory);
assert(pressure.businessLevel >= 60, 'cassa, perdita, scorte e clienti devono produrre pressione reale');
assert.equal(pressure.type, 'attivita');
assert(/Officina Rossa/.test(pressure.summary));

assert.equal(managementDirector.managementIntent('Abbasso il prezzo dei ricambi e tratto con il fornitore'), 'economia');
assert.equal(managementDirector.managementIntent('Aumento le tasse e convoco il consiglio'), 'governo');

const gameDirector = new director.GameDirector();
const plan = gameDirector.planTurn('Abbasso il prezzo dei ricambi', {
    memory,
    character: { health: { cur: 10, max: 10 }, stamina: { cur: 10, max: 10 } },
    currentLocation: 'Officina Rossa'
});

assert.equal(plan.intent, 'economia');
assert(plan.pressure.level > 20, 'la pressione gestionale deve alzare la tensione del turno');
assert.equal(plan.pressure.management.type, 'attivita');
assert(/GESTIONE PERSISTENTE/.test(plan.prompt));
assert(/clienti, dipendenti, fornitori, concorrenti/.test(plan.prompt));
assert(/Officina Rossa/.test(plan.prompt));
assert.equal(plan.state.lastPlan.managementType, 'attivita');

console.log('management director regression: ok');
