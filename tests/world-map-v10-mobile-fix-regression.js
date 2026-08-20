const assert = require('assert');
const patch = require('../js/world-map-v10-mobile-fix.js');

const css = patch.cssText();
assert(css.includes('.world-map-status > .world-map-v10-layerbar'), 'la toolbar v10 deve battere il selector grid del CSS base');
assert(/display:flex!important/.test(css), 'la toolbar deve restare orizzontale su mobile');
assert(css.includes('#modal-world-map .world-map-political-zone > text'), 'le etichette politiche grandi devono poter essere nascoste su mobile');
assert(css.includes('#modal-world-map .world-map-region-labels'), 'le etichette regionali devono essere declutterate su mobile');

const model = {
    width: 960,
    height: 620,
    locations: [
        { id: 'a', name: 'Firenze', x: 430, y: 245, kind: 'location', current: true, _geoExplicit: true },
        { id: 'b', name: 'Prato', x: 432, y: 247, kind: 'location', _geoExplicit: true },
        { id: 'c', name: 'Pistoia', x: 434, y: 249, kind: 'location', _geoExplicit: true },
        { id: 'd', name: 'Banco dei Medici', x: 435, y: 250, kind: 'business', _geoExplicit: false }
    ]
};

const before = Math.hypot(model.locations[1].x - model.locations[2].x, model.locations[1].y - model.locations[2].y);
patch.spreadLocations(model);
const after = Math.hypot(model.locations[1].x - model.locations[2].x, model.locations[1].y - model.locations[2].y);
assert(after > before, 'i luoghi sovrapposti devono essere separati visivamente');
assert(model.locations.every(item => item.x >= 52 && item.x <= 908 && item.y >= 52 && item.y <= 554), 'il declutter non deve spingere i nodi fuori dalla mappa');

console.log('world-map-v10 mobile fix regression: ok');