'use strict';

const assert = require('assert');
const hub = require('../js/management-hub.js');

const state = {
    character: { gold: 850 },
    worldMemory: {
        employees: [
            { id: 'e1', name: 'Marta', status: 'active' },
            { id: 'e2', name: 'Luca', status: 'fired' }
        ],
        management: {
            activeBusinessId: 'b1',
            businesses: [{
                id: 'b1',
                name: 'Emporio del Porto',
                status: 'active',
                cash: -50,
                customerSatisfaction: 35,
                products: [
                    { id: 'p1', name: 'Corda', active: true, stock: 1, reorderPoint: 4, salePrice: 12 }
                ],
                lastReport: { netProfit: -20, lowStock: ['p1'] }
            }]
        },
        kingdom: {
            active: true,
            name: 'Astaria',
            treasury: -100,
            food: 0,
            stability: 32,
            people: { approval: 41, unrest: 61 },
            crises: [{ status: 'active', severity: 75, name: 'Rivolta delle Gilde' }]
        }
    }
};

const summary = hub.summarizeState(state);
assert.equal(summary.businessCount, 1, 'deve riconoscere le attività attive');
assert.equal(summary.employeeCount, 1, 'deve ignorare i dipendenti licenziati');
assert.equal(summary.lowStock, 1, 'deve segnalare il magazzino sotto scorta');
assert(summary.alertCount >= 6, 'deve aggregare criticità di attività e regno');
assert(summary.alerts.some(item => /tesoro/i.test(item.text)), 'deve mostrare il rischio sul tesoro');
assert(summary.alerts.some(item => /scorta/i.test(item.text)), 'deve mostrare il rischio sul magazzino');

assert.equal(hub.shouldQueueManagementAction('business', 'price'), true);
assert.equal(hub.shouldQueueManagementAction('business', 'run-period'), false, 'chiudere un periodo non deve creare una seconda causa artificiale');
assert.equal(hub.shouldQueueManagementAction('kingdom', 'tax'), true);
assert.equal(hub.shouldQueueManagementAction('kingdom', 'period'), false);

const button = { textContent: 'Prezzo', dataset: { productId: 'p1' } };
const description = hub.describeManagementAction('business', 'price', button, state);
assert(/Emporio del Porto/.test(description));
assert(/Corda/.test(description));
assert(/12/.test(description));
assert(/clienti|fornitori|concorrenti/i.test(description));

console.log('management hub regression: ok');
