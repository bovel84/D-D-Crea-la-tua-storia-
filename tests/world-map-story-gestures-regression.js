const assert = require('assert');
const fs = require('fs');
const path = require('path');

const gestures = require('../js/world-map-v11-gestures-persistent.js');
const storySvg = require('../js/world-map-v12-story-svg.js');

assert.deepStrictEqual(gestures.parseViewBox('10 20 300 200'), { x: 10, y: 20, width: 300, height: 200 });
assert.strictEqual(gestures.parseViewBox('10 20 0 200'), null);
const clamped = gestures.clampBox({ x: 500, y: 400, width: 100, height: 70 }, { x: 0, y: 0, width: 960, height: 620 });
assert(clamped.width >= 960 / gestures.MAX_ZOOM);
assert(clamped.x + clamped.width <= 960.01);
assert(clamped.y + clamped.height <= 620.01);

const medievalModel = {
  name: 'Montefiorito, Anno Domini 1000',
  theme: { id: 'fantasy', label: 'Regni e terre selvagge' },
  width: 960,
  height: 620,
  regionLabels: [{ name: 'Toscana', terrain: 'colline e campi' }],
  locations: [
    { name: 'Castello di Montefiorito', type: 'castello', region: 'Toscana', terrain: 'colline', x: 280, y: 260, kind: 'location' },
    { name: 'Borgo di Montefiorito', type: 'borgo', region: 'Toscana', terrain: 'campagna', x: 390, y: 330, kind: 'location' }
  ]
};
const profile = storySvg.storyProfile(medievalModel, { context: { story: { title: 'Contea di Montefiorito', setting: 'Sacro Romano Impero', startYear: 1000 } }, world: {} });
assert(profile.flags.medieval);
assert(profile.flags.hills);
const terrain = storySvg.storyTerrainMarkup(medievalModel, { context: { story: { title: 'Contea di Montefiorito', setting: 'Toscana medievale', startYear: 1000 } }, world: {} });
assert(terrain.includes('world-map-story-terrain'));
assert(terrain.includes('fields') || terrain.includes('hills'));

const baseSvg = '<svg class="world-map-svg theme-fantasy"><g class="world-map-contours"><path d="M0 0"/></g><path class="world-map-river" d="M0 0"/><g class="world-map-territories"></g><g class="world-map-routes"></g></svg>';
const replaced = storySvg.replaceGenericTerrain(baseSvg, terrain);
assert(replaced.includes('story-adaptive'));
assert(replaced.includes('world-map-story-terrain'));
assert(!replaced.includes('world-map-contours'));
assert(!replaced.includes('world-map-river'));

const loader = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai-efficiency.js'), 'utf8');
assert(loader.includes('world-map-v11-gestures-persistent.js?v=20260820-world-map-gestures-persistent-1'));
assert(loader.includes('world-map-v12-story-svg.js?v=20260820-world-map-story-svg-1'));
assert(!loader.includes('world-map-v11-gestures-safe.js?v=20260820-world-map-gestures-safe-1'));

console.log('world map persistent gestures + story SVG regression: ok');