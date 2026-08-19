const assert = require('assert');
const fs = require('fs');

const loader = fs.readFileSync('js/ai-efficiency.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

for (const file of ['world-travel-v8.js', 'time-montage-v8.js', 'scene-continuity-v8.js']) {
  assert(loader.includes(file), `${file} must be loaded by ai-efficiency.js`);
  assert(pkg.scripts.check.includes(`node --check js/${file}`), `${file} must be syntax-checked`);
}
assert(loader.indexOf('turn-resolution-v7.js') < loader.indexOf('world-travel-v8.js'), 'travel must wrap the Phase 7 resolution layer');
assert(loader.indexOf('world-travel-v8.js') < loader.indexOf('time-montage-v8.js'));
assert(loader.indexOf('time-montage-v8.js') < loader.indexOf('scene-continuity-v8.js'));

console.log('phase8 world experience regression: ok');
