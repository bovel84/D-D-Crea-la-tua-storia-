'use strict';

const assert = require('assert');
const tuning = require('../js/portrait-size-tuning.js');

const css = tuning.cssText();
assert.match(css, /#btn-character #topbar-protagonist-portrait/);
assert.match(css, /clamp\(64px, 17vw, 74px\)/, 'il ritratto centrale deve essere molto più grande della vecchia miniatura da 42px');
assert.match(css, /object-fit:\s*cover/i, 'la foto deve riempire il cerchio senza deformarsi');
assert.match(css, /border-radius:\s*50%/i, 'il ritratto centrale deve restare circolare');
assert.match(css, /@media \(max-width: 380px\)/, 'serve una misura leggermente ridotta sui telefoni stretti');

console.log('portrait-size-tuning-regression: ok');
