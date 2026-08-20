const assert = require('assert');
const patch = require('../js/world-map-v10-local-places.js');

const castle = {
  id: 'castle',
  name: 'Castello di Montefiorito',
  type: 'fortificazione',
  region: 'Colline Toscane',
  x: 320,
  y: 220,
  current: false,
  connections: ['Borgo di Montefiorito'],
  objectiveIds: [],
  factionIds: [],
  hostileFactionIds: []
};
const hall = {
  id: 'hall',
  name: 'Grande Sala del Castello di Montefiorito',
  type: 'sala del castello',
  region: 'Castello di Montefiorito',
  x: 350,
  y: 230,
  current: true,
  connections: ['Castello di Montefiorito'],
  objectiveIds: ['obj-1'],
  factionIds: ['fac-1'],
  hostileFactionIds: []
};
const village = {
  id: 'village',
  name: 'Borgo di Montefiorito',
  type: 'borgo',
  region: 'Colline Toscane',
  x: 520,
  y: 330,
  current: false,
  connections: ['Castello di Montefiorito'],
  objectiveIds: [],
  factionIds: [],
  hostileFactionIds: []
};

assert(patch.isInteriorLike(hall), 'la grande sala deve essere classificata come luogo interno');
assert(patch.isParentStructure(castle), 'il castello deve essere un contenitore geografico');
assert.strictEqual(patch.findParent(hall, [castle, hall, village]).id, 'castle', 'la sala deve essere ricondotta al castello');

const model = {
  width: 960,
  height: 620,
  currentLocationId: 'hall',
  currentLocationName: hall.name,
  locations: [castle, hall, village],
  edges: [
    { id: 'e1', from: 'hall', to: 'village', explicit: true },
    { id: 'e2', from: 'castle', to: 'village', explicit: true }
  ],
  liveSignals: [{ id: 'signal', locationId: 'hall', x: 370, y: 190 }],
  hostileMarkers: []
};

patch.collapseLocalPlaces(model, { locations: [castle, hall, village], factions: [] }, { events: [] }, {});

assert.strictEqual(model.locations.length, 2, 'la mappa non deve mostrare castello e sala come due luoghi indipendenti');
const mappedCastle = model.locations.find(item => item.id === 'castle');
assert(mappedCastle, 'il castello deve restare visibile');
assert.strictEqual(mappedCastle.current, true, 'il castello deve risultare la posizione cartografica corrente');
assert.strictEqual(mappedCastle.currentInteriorName, 'Grande Sala del Castello di Montefiorito');
assert(mappedCastle.subLocations.some(item => item.id === 'hall'), 'la sala deve essere conservata come sotto-luogo');
assert(mappedCastle.objectiveIds.includes('obj-1'), 'gli obiettivi del sotto-luogo devono restare associati al castello');
assert.strictEqual(model.currentLocationId, 'castle', 'il focus della mappa deve puntare al castello, non alla stanza');
assert.strictEqual(model.edges.length, 1, 'le rotte duplicate dopo il collasso devono essere eliminate');
assert.strictEqual(model.liveSignals[0].locationId, 'castle', 'gli eventi interni devono essere agganciati al luogo padre');

const canonical = patch.canonicalRegionSet({
  hierarchy: { continents: [{ nations: [{ regions: [{ name: 'Colline Toscane' }, { name: 'Valdarno' }] }] }] }
});
assert(canonical.has('colline-toscane'));
assert(canonical.has('valdarno'));

console.log('world-map-v10 local places regression: ok');