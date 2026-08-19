const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ui = require('../js/ui-consolidation-v9.js');
const css = ui.cssText();
assert(css.includes('#modal-timeline #timeline-agenda'));
assert(css.includes('.management-hub-ready #game-screen .input-area'));
assert(css.includes('#btn-top-character #topbar-protagonist-portrait'));
assert(css.includes('object-fit: cover'));
assert(/#modal-world-chat \.chat-modal\s*\{[\s\S]*display:\s*flex\s*!important/i.test(css), 'il modale chat deve essere un layout flex verticale');
assert(/#modal-world-chat \.chat-modal > \.modal-body\s*\{[\s\S]*min-height:\s*0\s*!important/i.test(css), 'il body chat deve poter restringersi dentro il viewport');
assert(/#modal-world-chat \.chat-messages\s*\{[\s\S]*max-height:\s*none\s*!important/i.test(css), 'i messaggi devono usare lo spazio residuo senza spingere fuori il composer');
assert(/#modal-world-chat \.chat-compose\s*\{[\s\S]*visibility:\s*visible\s*!important/i.test(css), 'la barra input deve restare visibile');

const loader = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai-efficiency.js'), 'utf8');
assert(loader.includes('CronacheRuntimeV9'));
assert(loader.includes('data-ui-consolidation-v9'));
assert(!loader.includes('data-interface-cleanup'));
assert(!loader.includes('data-management-layout'));
assert(!loader.includes('data-portrait-size-tuning'));

const resolutionIndex = loader.indexOf('data-turn-resolution-v7');
const travelIndex = loader.indexOf('data-world-travel-v8');
const montageIndex = loader.indexOf('data-time-montage-v8');
const continuityIndex = loader.indexOf('data-scene-continuity-v8');
assert(resolutionIndex >= 0 && travelIndex > resolutionIndex);
assert(montageIndex > travelIndex);
assert(continuityIndex > montageIndex);

console.log('phase9 consolidation regression: ok');
