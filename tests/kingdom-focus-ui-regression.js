const assert = require('assert');
const fs = require('fs');
const path = require('path');

const focus = require('../js/kingdom-focus-ui.js');

assert.strictEqual(focus.classifySectionHeading('Popolo e qualità della vita'), 'kingdom-people');
assert.strictEqual(focus.classifySectionHeading('Classi sociali'), 'kingdom-people');
assert.strictEqual(focus.classifySectionHeading('Mercato del lavoro'), 'kingdom-economy');
assert.strictEqual(focus.classifySectionHeading('Risorse strategiche'), 'kingdom-economy');
assert.strictEqual(focus.classifySectionHeading('Territori'), 'kingdom-territories');
assert.strictEqual(focus.classifySectionHeading('Crisi attive'), 'kingdom-territories');
assert.strictEqual(focus.classifySectionHeading('Corte e fazioni'), 'kingdom-politics');
assert.strictEqual(focus.classifySectionHeading('Diplomazia'), 'kingdom-politics');
assert.strictEqual(focus.classifySectionHeading('Leggi e decreti'), 'kingdom-politics');
assert.strictEqual(focus.classifySectionHeading('Esercito'), 'kingdom-defense');

assert.deepStrictEqual(focus.actionNamesForSection('kingdom-overview'), ['council', 'census', 'period']);
assert.deepStrictEqual(focus.actionNamesForSection('kingdom-defense'), ['recruit']);

const healthy = focus.buildSummaryData({
  treasury: 1200,
  stability: 72,
  population: 5000,
  food: 800,
  people: { approval: 66, unrest: 18 },
  crises: [],
  factions: []
});
assert.strictEqual(healthy.metrics.length, 4);
assert.strictEqual(healthy.alert.tone, 'good');

const crisis = focus.buildSummaryData({
  treasury: 400,
  stability: 55,
  population: 5000,
  food: 200,
  people: { approval: 44, unrest: 35 },
  crises: [{ name: 'Carestia nel nord', severity: 78, status: 'active' }],
  factions: [{ name: 'Casata rivale', hostility: 80 }]
});
assert.strictEqual(crisis.alert.tone, 'critical');
assert(crisis.alert.text.includes('Carestia nel nord'));
assert.strictEqual(crisis.activeCrises, 1);
assert.strictEqual(crisis.hostileFactions, 1);

const loader = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai-efficiency.js'), 'utf8');
assert(loader.includes('js/kingdom-focus-ui.js?v=20260820-kingdom-focus-1'));
assert(loader.includes('CronacheKingdomFocusUI'));
assert(loader.includes('data-kingdom-focus-ui'));

console.log('kingdom focus UI regression: ok');