const assert = require('assert');
const levels = require('../js/world-map-v11-levels.js');

const model = {
  width: 960,
  height: 620,
  currentLocationId: 'castle',
  locations: [
    { id: 'florence', name: 'Firenze', continent: 'Europa', nation: 'Repubblica Fiorentina', region: 'Toscana', x: 180, y: 220 },
    { id: 'siena', name: 'Siena', continent: 'Europa', nation: 'Repubblica di Siena', region: 'Toscana meridionale', x: 560, y: 390 },
    {
      id: 'castle', name: 'Castello di Montefiorito', continent: 'Europa', nation: 'Contea di Montefiorito', region: 'Colline Toscane', x: 410, y: 300, current: true,
      currentInteriorName: 'Grande Sala del Castello di Montefiorito',
      subLocations: [
        { id: 'hall', name: 'Grande Sala del Castello di Montefiorito', type: 'sala', current: true },
        { id: 'yard', name: 'Cortile del Castello di Montefiorito', type: 'cortile' },
        { id: 'chapel', name: 'Cappella del Castello di Montefiorito', type: 'cappella' },
        { id: 'stable', name: 'Scuderie del Castello di Montefiorito', type: 'scuderie' }
      ]
    },
    { id: 'village', name: 'Borgo di Montefiorito', continent: 'Europa', nation: 'Contea di Montefiorito', region: 'Colline Toscane', x: 500, y: 335 }
  ]
};

const castle = model.locations.find(item => item.id === 'castle');
const path = levels.hierarchyPath(castle);
assert.deepStrictEqual(path.map(item => item.level), ['world', 'continent', 'nation', 'region', 'site']);
assert(path.some(item => item.label === 'Contea di Montefiorito'));
assert(path.some(item => item.label === 'Colline Toscane'));

assert.strictEqual(levels.locationsForScope(model, 'nation', 'Contea di Montefiorito').length, 2);
const region = levels.locationsForScope(model, 'region', 'Colline Toscane');
assert.strictEqual(region.length, 2);
const site = levels.locationsForScope(model, 'site', 'castle', castle);
assert(site.some(item => item.id === 'castle'));
assert(site.some(item => item.id === 'village'));
assert(!site.some(item => item.id === 'florence'));

const box = levels.scopeBox(model, region, 'region');
assert(box.width < model.width && box.height < model.height);
assert(box.x >= 0 && box.y >= 0);

const interior = levels.buildInteriorModel(castle);
assert.strictEqual(interior.rooms.length, 4);
assert(interior.rooms.find(item => item.id === 'hall').current);
assert(interior.rooms.every(item => Number.isFinite(item.x) && Number.isFinite(item.y)));
assert.strictEqual(levels.roomIcon({ name: 'Cappella', type: 'cappella' }), '✞');
assert.strictEqual(levels.roomIcon({ name: 'Scuderie', type: 'scuderie' }), '♞');

const svg = levels.interiorMarkup(castle);
assert(svg.includes('world-map-local-svg'));
assert(svg.includes('Grande Sala del Castello di Montefiorito'));
assert(svg.includes('Cappella del Castello di Montefiorito'));
assert(svg.includes('map-v11-room current'));

console.log('world-map-v11 levels regression: ok');