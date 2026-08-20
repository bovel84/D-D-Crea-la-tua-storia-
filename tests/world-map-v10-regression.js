const assert = require('assert');

const generator = require('../js/world-generator.js');
const bootstrap = require('../js/world-bootstrap.js');
const map = require('../js/world-map.js');
const travel = require('../js/world-travel-v8.js');
const patch = require('../js/world-map-v10.js');

assert.strictEqual(patch.install(null), true);

const generated = {
  worldName: 'Italia dei Comuni',
  premise: 'Una campagna politica e commerciale nella Toscana rinascimentale.',
  centralConflict: 'Firenze e Siena competono per influenza e rotte.',
  stakes: 'Controllo politico ed economico della regione.',
  continents: [{
    name: 'Europa',
    nations: [{
      name: 'Repubblica di Firenze',
      government: 'repubblica oligarchica',
      controllingFaction: 'Casa Medici',
      regions: [{
        name: 'Toscana',
        terrain: 'hills',
        locations: [
          { name: 'Firenze', type: 'city', x: 430, y: 245, description: 'Centro politico e mercantile.', resource: 'credito e tessuti', danger: '', connections: ['Siena'] },
          { name: 'Siena', type: 'city', x: 445, y: 335, description: 'Rivale regionale.', resource: 'commercio', danger: 'tensione politica', connections: ['Firenze'] }
        ]
      }]
    }]
  }],
  factions: [{
    name: 'Casa Medici', type: 'republic', leader: 'Lorenzo de Medici', territory: 'Repubblica di Firenze',
    base: 'Firenze', influence: 82, militaryStrength: 55, intelligence: 70, hostility: 15,
    relationship: 'alleata', goal: 'mantenere il controllo di Firenze'
  }],
  npcs: [{
    name: 'Mercante Senese', role: 'mercante', faction: '', location: 'Siena', influence: 45,
    relationship: 'neutrale', goal: 'aprire nuove rotte'
  }],
  relations: [],
  forces: [],
  startLocation: 'Firenze'
};

const normalized = generator.normalizeGeneratedWorld(generated, {
  turn: 1,
  setting: 'Toscana',
  story: { title: 'Italia dei Comuni', setting: 'Toscana' },
  protagonistName: 'Andrea'
});

assert(normalized.geography, 'il world generator deve conservare uno snapshot geografico persistente');
assert.strictEqual(normalized.geography.locations.find(item => item.name === 'Firenze').x, 430);
assert.strictEqual(normalized.locations.find(item => item.name === 'Siena').nation, 'Repubblica di Firenze');

const migrated = bootstrap.migrateWorld(normalized, { story: { title: 'Italia dei Comuni', setting: 'Toscana' }, turn: 1 });
const florence = migrated.locations.find(item => item.name === 'Firenze');
const siena = migrated.locations.find(item => item.name === 'Siena');
assert.strictEqual(florence.x, 430, 'la migrazione non deve più perdere le coordinate generate');
assert.strictEqual(siena.y, 335, 'la migrazione deve preservare y');
assert.strictEqual(siena.nation, 'Repubblica di Firenze', 'la gerarchia politica deve sopravvivere alla normalizzazione');
assert.strictEqual(siena.terrain, 'hills', 'il terreno regionale deve restare disponibile alla mappa');

const memory = {
  turnCount: 3,
  world: migrated,
  events: [{
    id: 'evt-siena',
    title: 'Tumulti a Siena',
    summary: 'Una protesta dei mercanti agita Siena.',
    location: 'Siena',
    turn: 3,
    status: 'active'
  }]
};

const model = map.buildMapModel({ world: migrated, memory }, {
  story: { title: 'Italia dei Comuni', setting: 'Toscana' },
  setting: 'Toscana',
  currentLocation: 'Firenze',
  turn: 3,
  year: 1478,
  protagonistName: 'Andrea'
});

const mappedFlorence = model.locations.find(item => item.name === 'Firenze');
const mappedSiena = model.locations.find(item => item.name === 'Siena');
assert(mappedFlorence._geoExplicit, 'le coordinate geografiche devono avere precedenza sul layout hash');
assert.strictEqual(mappedFlorence.nation, 'Repubblica di Firenze');
assert.strictEqual(model.politicalZones.length, 1, 'la mappa deve disegnare il territorio politico della nazione');
assert.strictEqual(model.politicalZones[0].controller, 'Casa Medici');
assert(model.liveSignals.some(signal => signal.locationId === mappedSiena.id), 'gli eventi recenti devono comparire sul luogo interessato');

const svg = map.svgMarkup(model);
assert(svg.includes('world-map-territories'), 'SVG deve includere il layer politico');
assert(svg.includes('Repubblica di Firenze'), 'SVG deve mostrare l’etichetta territoriale');
assert(svg.includes('world-map-live-signals'), 'SVG deve includere gli eventi vivi');

const state = {
  currentStory: { genre: 'historical' },
  currentLocation: 'Firenze',
  time: { year: 1478, month: 4, day: 10, hour: 9, minute: 0 },
  worldMemory: { turnCount: 3, world: migrated, locations: [] }
};
const plan = travel.planTravel('Vado a Siena', state);
assert(plan, 'il pulsante di viaggio deve poter attivare il motore WorldTravel');
assert.strictEqual(plan.from, 'Firenze');
assert.strictEqual(plan.to, 'Siena');
assert(plan.legs.length >= 1);
assert(plan.legs.some(leg => leg.basis === 'map-relative' || leg.basis === 'geographic'), 'il viaggio deve usare la geometria persistente quando disponibile');

const fallbackModel = {
  width: 960,
  height: 620,
  locations: [
    { id: 'a', name: 'A', nation: 'Nord', region: 'R1', x: 100, y: 100, kind: 'location', _geoExplicit: false },
    { id: 'b', name: 'B', nation: 'Nord', region: 'R1', x: 800, y: 500, kind: 'location', _geoExplicit: false },
    { id: 'c', name: 'C', nation: 'Sud', region: 'R2', x: 500, y: 250, kind: 'location', _geoExplicit: false }
  ]
};
patch.assignHierarchyLayout(fallbackModel);
const north = fallbackModel.locations.filter(item => item.nation === 'Nord');
assert(Math.abs(north[0].x - north[1].x) < 150, 'nei salvataggi legacy i luoghi della stessa nazione devono essere raggruppati');

console.log('world-map-v10 regression: ok');
