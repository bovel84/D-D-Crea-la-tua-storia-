'use strict';

const assert = require('assert');
const tuning = require('../js/portrait-size-tuning.js');

const css = tuning.cssText();
assert.match(css, /#btn-top-character #topbar-protagonist-portrait/,
    'la correzione deve colpire il vero pulsante centrale della topbar');
assert.match(css, /width:\s*100%\s*!important/i,
    'il ritratto deve riempire il contenitore del medaglione');
assert.match(css, /height:\s*100%\s*!important/i);
assert.match(css, /npc-dossiers-ready #btn-top-character #topbar-protagonist-portrait/,
    'deve neutralizzare il vecchio limite da 42px del dossier NPC');
assert.match(css, /object-fit:\s*cover/i, 'la foto deve riempire il cerchio senza deformarsi');
assert.match(css, /object-position:\s*50% 22%/i, 'il crop deve privilegiare volto e testa');
assert.match(css, /border-radius:\s*50%/i, 'il ritratto centrale deve restare circolare');
assert.equal(tuning.PATCH_VERSION, 2);

console.log('portrait-size-tuning-regression: ok');
