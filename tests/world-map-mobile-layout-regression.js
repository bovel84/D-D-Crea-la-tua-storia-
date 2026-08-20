const assert = require('assert');

const map = require('../js/world-map.js');
const v10 = require('../js/world-map-v10.js');
const mobileFix = require('../js/world-map-v10-mobile-fix.js');
const mobileLayout = require('../js/world-map-v10-mobile-layout.js');

assert.strictEqual(v10.install(null), true);
assert.strictEqual(mobileFix.install(null), true);
assert.strictEqual(mobileLayout.install(null), true);

const world = {
  name: 'Rinascimento italiano',
  hierarchy: {
    continents: [{
      name: 'Europa',
      nations: [{
        name: 'Repubblica Fiorentina',
        controllingFaction: 'Signoria',
        regions: [
          { name: 'Toscana', terrain: 'hills', locationNames: ['Firenze', 'Montepulciano'] },
          { name: 'Umbria', terrain: 'mountain', locationNames: ['Perugia'] }
        ]
      }]
    }]
  },
  locations: [
    { id: 'firenze', name: 'Firenze', nation: 'Repubblica Fiorentina', region: 'Toscana', x: 420, y: 220, type: 'city', source: 'world-generator', connections: ['Montepulciano'] },
    { id: 'montepulciano', name: 'Montepulciano', nation: 'Repubblica Fiorentina', region: 'Toscana', x: 480, y: 300, type: 'castle', source: 'world-generator', connections: ['Firenze', 'Perugia'] },
    { id: 'perugia', name: 'Perugia', nation: 'Repubblica Fiorentina', region: 'Umbria', x: 610, y: 310, type: 'city', source: 'world-generator', connections: ['Montepulciano'] }
  ],
  factions: [
    { id: 'signoria', name: 'Signoria', base: 'Firenze', relationship: 'alleata', hostility: 10, influence: 80 },
    { id: 'rovere', name: 'Famiglia della Rovere', base: 'Montepulciano', relationship: 'ostile', hostility: 82, influence: 66, nextMove: 'rafforzare le truppe' }
  ]
};

mobileLayout.ensureFactionTerritories(world);
assert.strictEqual(world.factions[1].territory, 'Toscana', 'il territorio ostile deve essere inferito dalla base se manca');

const memory = { turnCount: 4, world, events: [] };
const model = map.buildMapModel({ world, memory }, {
  story: { title: 'Rinascimento italiano', setting: 'Italia centrale' },
  setting: 'Italia centrale',
  currentLocation: 'Firenze',
  turn: 4,
  year: 1472
});

assert(model.regionZones.some(zone => zone.name === 'Toscana'), 'la regione Toscana deve avere un confine dedicato');
assert(model.regionZones.some(zone => zone.name === 'Umbria'), 'la regione Umbria deve essere navigabile separatamente');
assert(model.hostileMarkers.some(marker => marker.name === 'Famiglia della Rovere'), 'le fazioni ostili devono avere un indicatore dedicato');
assert.strictEqual(model.hostileMarkers.find(marker => marker.name === 'Famiglia della Rovere').locationName, 'Montepulciano');

const svg = map.svgMarkup(model);
assert(svg.includes('world-map-region-zones'), 'SVG deve includere i confini delle regioni');
assert(svg.includes('world-map-hostile-markers'), 'SVG deve includere i marker delle minacce');
assert(svg.includes('Famiglia della Rovere'), 'il marker deve mantenere il nome della fazione nel title accessibile');

const css = mobileLayout.cssText();
assert(css.includes("grid-template-areas:'status' 'tools' 'mobile-nav' 'map'"), 'la mappa mobile deve dedicare lo spazio residuo alla viewport');
assert(css.includes('#btn-map-refresh,#btn-map-dice,#btn-map-images{display:none!important}'), 'i comandi secondari non devono affollare il telefono');
assert(css.includes('.world-map-mobile-chip.threat'), 'le minacce devono essere selezionabili da chip mobili');
assert(css.includes('.world-map-status small{display:none!important}'), 'sui telefoni stretti il sottotitolo deve sparire');

console.log('world-map mobile layout regression: ok');