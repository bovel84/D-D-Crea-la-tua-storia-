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
assert.strictEqual(recovery.normalizeCashDirection('entrata'), 'in');
assert.strictEqual(recovery.normalizeCashDirection('uscita'), 'out');
assert.strictEqual(recovery.narrativeNumber('2.250 fiorini'), 2250);

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
    category: '',
    reliability: '',
    leadTurns: '',
    discount: '',
    status: '',
    notes: 'Corrispondenti commerciali'
  },
  {
    type: 'customer',
    businessName: 'Banco Torrigiani',
    customerName: 'Arte della Lana',
    segment: '',
    loyalty: '',
    satisfaction: '',
    notes: 'Cliente istituzionale'
  },
  {
    type: 'sale',
    businessName: 'Banco Torrigiani',
    product: 'Prestito su cambiale',
    qty: '2 operazioni',
    price: '15 fiorini'
  },
  {
    type: 'cash',
    businessName: 'Banco Torrigiani',
    direction: 'uscita',
    amount: '2.250 fiorini',
    reason: 'Anticipo a un mercante'
  },
  {
    type: 'cash',
    businessName: 'Banco Torrigiani',
    direction: 'entrata',
    amount: '300 fiorini',
    reason: 'Rimborso parziale'
  },
  {
    type: 'contract',
    businessName: 'Banco Torrigiani',
    title: 'Linea di corrispondenza',
    kind: 'credito',
    counterpartyType: 'fornitore',
    counterpartyName: 'Compagnia degli Strozzi',
    amount: 'da definire',
    frequency: 'a chiamata',
    status: 'in corso',
    notes: 'Importo variabile secondo necessità'
  },
  {
    type: 'contract',
    businessName: 'Banco Torrigiani',
    title: 'Mandato di cambio',
    kind: 'servizio',
    counterpartyType: 'cliente',
    counterpartyName: 'Arte dei Mercanti',
    amount: '200 fiorini',
    frequency: 'mensile',
    status: 'attivo',
    notes: 'Mandato continuativo'
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
assert.ok(updated.suppliers.some(item => item.name === 'Compagnia degli Strozzi'), 'il fornitore incompleto deve essere recuperato');
assert.ok(updated.customers.some(item => item.name === 'Arte della Lana'), 'il cliente incompleto deve essere recuperato');
assert.ok(updated.customers.some(item => item.name === 'Arte dei Mercanti'), 'una controparte cliente di un contratto deve entrare in anagrafica');
assert.ok(updated.transactions.some(tx => tx.direction === 'out' && tx.amount === 2250), 'l’uscita narrativa deve essere registrata anche oltre la cassa disponibile');
assert.ok(updated.transactions.some(tx => tx.direction === 'in' && tx.amount === 300), 'l’entrata narrativa deve essere registrata');
assert.ok(updated.transactions.some(tx => tx.direction === 'in' && tx.category === 'vendite' && tx.amount === 30), 'la vendita con prezzo narrativo deve generare un movimento');
assert.strictEqual(updated.cash, 80, 'la cassa deve riflettere vendita, uscita e rientro');

// Le attività di servizi/bancarie non devono restare congelate solo perché non hanno un fornitore fisico.
const serviceBusiness = businessApi.createBusinessFromProperty({
  id: 'studio-cambio',
  name: 'Studio di Cambio',
  description: 'Servizi di cambio e consulenza',
  type: 'business',
  managementEnabled: true,
  businessCash: 0
}, 1);
const serviceManagement = {
  schemaVersion: businessApi.SCHEMA_VERSION,
  businesses: [serviceBusiness],
  activeBusinessId: serviceBusiness.id,
  updatedAtTurn: 1
};
const serviceResult = manager.applyNarrativeEvents(serviceManagement, [
  {
    type: 'profile', businessName: 'Studio di Cambio', businessType: 'servizi finanziari', cash: '500 fiorini',
    reputation: '50', satisfaction: '60', status: 'active', description: 'Cambio valuta per mercanti'
  },
  {
    type: 'catalogProduct', businessName: 'Studio di Cambio', productName: 'Cambio valuta', category: 'servizio',
    salePrice: '10 fiorini', unitCost: '2 fiorini', stock: '30', demand: '5', reorderPoint: '5'
  }
], { turn: 1, currency: 'fiorini', employees: [] });
const serviceUpdated = serviceResult.management.businesses[0];
assert.strictEqual(serviceUpdated.narrativeInitialized, true, 'un servizio deve potersi inizializzare senza fornitore fisico');
const periods = manager.processPeriods(serviceResult.management, { turn: 6, employees: [], properties: [] }, () => 0.5);
assert.strictEqual(periods.reports.length, 1, 'il periodo economico deve avanzare automaticamente');
assert.ok(periods.management.businesses[0].transactions.some(tx => tx.category === 'vendite'), 'il periodo deve produrre movimenti di entrata');

console.log('business-narrative-recovery regression: ok');
