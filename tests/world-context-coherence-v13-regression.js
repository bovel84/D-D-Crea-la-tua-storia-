const assert = require('assert');
const context = require('../js/world-context-coherence-v13.js');

const messages = [
  { role: 'system', content: 'FASE 4/6 — NPC E RETI SOCIALI' },
  { role: 'user', content: `CANONE:\nTitolo: Firenze dei Banchieri\nAmbientazione: Firenze, Toscana, anno 1480\nPremessa: una famiglia di mercanti entra nel credito cittadino.\nLUOGHI:\nFirenze | Toscana | Firenze | city | centro\nMercato Vecchio | Toscana | Firenze | market | affari\nPalazzo dei Priori | Toscana | Firenze | palace | politica\nFAZIONI:\nCompagnia dei Mercanti | tipo=corporation | base=Firenze\nBanco rivale | tipo=corporation | base=Mercato Vecchio\nRestituisci:` }
];

const fallback = JSON.parse(context.contextualFallbackNpcJson(messages));
assert.strictEqual(fallback.npcs.length, 8);
assert(fallback.npcs.some(n => /banchiere|credito|conti|mercante/i.test(`${n.role} ${n.resources}`)));
assert(fallback.npcs.every(n => !['Andrea Rossi','Elena Bianchi','Lorenzo Conti','Giulia Ferri'].includes(n.name)));
assert(fallback.npcs.some(n => n.location === 'Firenze'));
assert.strictEqual(context.phaseNumber(messages), 4);
assert.strictEqual(context.isJsonComplete('{"npcs":[]}'), true);
assert.strictEqual(context.isJsonComplete('{"npcs":['), false);

const model = {
  locations: [
    { id:'fi', name:'Firenze', region:'Toscana', nation:'Italia', x:120, y:110, current:true },
    { id:'mv', name:'Mercato Vecchio', region:'Toscana', nation:'Italia', x:150, y:125 },
    { id:'po', name:'Ponte Vecchio', region:'Toscana', nation:'Italia', x:170, y:130 },
    { id:'pr', name:'Prato', region:'Toscana', nation:'Italia', x:190, y:140 },
    { id:'ve', name:'Venezia', region:'Veneto', nation:'Italia', x:210, y:150 },
    { id:'an', name:'Ancona', region:'Marche', nation:'Italia', x:230, y:160 }
  ],
  regionLabels:[{name:'Toscana'},{name:'Veneto'},{name:'Marche'}],
  regionZones:[], routeEdges:[], liveSignals:[], hostileMarkers:[]
};
const focused = context.focusModel(model, { story:{ title:'Firenze dei Banchieri', setting:'Firenze, Toscana nel 1480' } });
assert(focused.storyFocus);
assert(focused.locations.every(l => l.region === 'Toscana'));
const xs = focused.locations.map(l => l.x), ys = focused.locations.map(l => l.y);
assert(Math.max(...xs)-Math.min(...xs) > 300);
assert(Math.max(...ys)-Math.min(...ys) > 180);
console.log('world context coherence v13 regression: ok');