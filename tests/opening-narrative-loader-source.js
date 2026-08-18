'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai-efficiency.js'), 'utf8');
assert.match(source, /opening-narrative-guard\.js\?v=20260818-opening-scene-1/);
assert.match(source, /CronacheOpeningNarrativeGuard/);
console.log('opening narrative loader source: ok');
