const assert = require('assert');
const businessApi = require('../js/business-manager.js');
global.CronacheBusiness = businessApi;
const recovery = require('../js/business-narrative-recovery.js');

assert.strictEqual(recovery.normalizeBusinessStatus('attiva'), 'active');
assert.strictEqual(recovery.normalizeBusinessStatus('in corso'), 'active');
assert.strictEqual(recovery.normalizeContractStatus('in corso'), 'active');
assert.strictEqual(recovery.normalizeContractStatus('scaduto'), 'expired');
assert.strictEqual(recovery.normalizeOptionalAmount('da definire'), '');
assert.strictEqual(recovery.normalizeOptionalAmount('1.250 fiorini'), '1.250 fiorini');

const business = businessApi.createBusinessFromProperty({
  id: 'banco-torrigiani',
  name: 'Banco Torrigiani',
  description: 'Banco mercantile fiorentino',
  type: 'business',
  managementEnabled: true,
  businessCash: 0
}, 1);
const management = {
  schemaVersion: businessApi.SCHEMA_VERSION,
  businesses: [business],
  activeBusinessId: business.id,
  updatedAtTurn: 1
};

const manager = new businessApi.BusinessManager();
assert.strictEqual(recovery.install(), true);

const result = manager.applyNarrativeEvents(management, [
  {
    type: 'profile',
    businessName: 'Banco Torrigiani',
    businessType: 'banca mercantile',
    cash: '2.000 fiorini',
    reputation: '58%',
    satisfaction: 'attiva',
    status: 'Credito e cambio per mercanti e artigiani',
    description: ''
  },
  {
    type: 'catalogProduct',
    businessName: 'Banco Torrigiani',
    productName: 'Prestito su cambiale',
    category: 'credito',
    salePrice: '12 fiorini',
    unitCost: '6 fiorini',
    stock: '10',
    demand: '4',
    reorderPoint: '2'
  },
  {
    type: 'supplier',
    businessName: 'Banco Torrigiani',
    supplierName: 'Compagnia degli Strozzi',
    category: 'liquidità e corrispondenza',
    reliability: '82%',
    leadTurns: '1',
    discount: '0',
    status: 'active',
    notes: 'Corrispondenti commerciali'
  },
  {
    type: 'contract',
    businessName: 'Banco Torrigiani',
    title: 'Linea di corrispondenza',
    kind: 'credito',
    counterpartyType: 'compagnia mercantile',
    counterpartyName: 'Compagnia degli Strozzi',
    amount: 'da definire',
    frequency: 'a chiamata',
    status: 'in corso',
    notes: 'Importo variabile secondo necessità'
  }
], { turn: 1, currency: 'fiorini', employees: [] });

const failures = result.results.filter(item => item.ok === false);
assert.deepStrictEqual(failures, []);
const updated = result.management.businesses[0];
assert.strictEqual(updated.status, 'active');
assert.strictEqual(updated.customerSatisfaction, 65);
assert.match(updated.description, /Credito e cambio/);
assert.strictEqual(updated.contracts[0].status, 'active');
assert.strictEqual(updated.contracts[0].amount, 0);
assert.strictEqual(updated.narrativeInitialized, true);
console.log('business-narrative-recovery regression: ok');
