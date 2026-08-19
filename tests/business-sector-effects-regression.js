'use strict';

const assert = require('assert');
const sectors = require('../js/business-specializations.js');
const effects = require('../js/business-sector-effects.js');

const notes = [];
const businessApi = {
    addBusinessNote(_business, text) { notes.push(text); },
    inventoryValue(business) {
        return business.products.reduce((sum, product) => sum + Number(product.stock || 0) * Number(product.unitCost || 0), 0);
    }
};

const produce = {
    id: 'veg', name: 'Ortofrutta Verdi', propertyName: 'Ortofrutta Verdi', type: 'commercio',
    cash: 500, reputation: 55, customerSatisfaction: 70,
    products: [{ id: 'p1', name: 'Pomodori freschi', category: 'verdura fresca', stock: 100, reorderPoint: 10, unitCost: 1, active: true }],
    suppliers: [{ name: 'Mercato', reliability: 80, status: 'active' }], customers: [], contracts: [],
    lastReport: { unitsSold: 10, netProfit: 20, revenue: 100, margin: 20 }
};
const produceReport = { ...produce.lastReport };
effects.applySectorPeriodEffects(produce, produceReport, { turn: 5, employees: [] }, sectors, businessApi);
assert.ok(produce.products[0].stock < 100, 'l’ortofrutta deve subire deperibilità quando le scorte sono elevate');
assert.ok(produceReport.sectorEffects.some(text => /Deperibilità/i.test(text)));
assert.ok(notes.some(text => /merce fresca/i.test(text)));

const restaurant = {
    id: 'rest', name: 'Trattoria del Porto', propertyName: 'Trattoria del Porto', type: 'ristorazione',
    cash: 1200, reputation: 60, customerSatisfaction: 60,
    products: [
        { id: 'p1', name: 'Pasta', category: 'menu', stock: 1, reorderPoint: 5, unitCost: 3, active: true },
        { id: 'p2', name: 'Pesce', category: 'menu', stock: 2, reorderPoint: 5, unitCost: 6, active: true }
    ],
    suppliers: [], customers: [], contracts: [], lastReport: { stockouts: 2, unitsSold: 20, netProfit: 50, revenue: 300, margin: 16 }
};
const restaurantReport = { ...restaurant.lastReport };
effects.applySectorPeriodEffects(restaurant, restaurantReport, {
    turn: 6,
    employees: [{ name: 'Luca', property: 'Trattoria del Porto', status: 'active', skill: 55, morale: 35 }]
}, sectors, businessApi);
assert.ok(restaurant.customerSatisfaction < 60, 'menu corto e morale basso devono penalizzare il servizio');
assert.ok(restaurantReport.sectorEffects.some(text => /Servizio ristorazione/i.test(text)));

const bank = {
    id: 'bank', name: 'Banca Popolare', propertyName: 'Banca Popolare', type: 'servizi',
    cash: 100, reputation: 50, customerSatisfaction: 60, products: [], suppliers: [], customers: [],
    contracts: [{ title: 'Finanziamento Alfa', kind: 'credito', amount: 1000, status: 'active' }],
    lastReport: { unitsSold: 0, netProfit: 0, revenue: 0, margin: 0 }
};
const bankReport = { ...bank.lastReport };
effects.applySectorPeriodEffects(bank, bankReport, { turn: 7, employees: [] }, sectors, businessApi);
assert.ok(bankReport.sectorEffects.some(text => /liquidità\/esposizione/i.test(text)));

console.log('business-sector-effects-regression: ok');
