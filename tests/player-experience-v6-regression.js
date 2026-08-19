'use strict';

const assert = require('assert');
const api = require('../js/player-experience-v6.js');

assert.equal(api.PATCH_VERSION, 1);

const importantEvent = {
    title: 'La Lega dei Mercanti rompe con il governo',
    summary: 'La Lega dei Mercanti ritira il proprio sostegno al governo dopo l’aumento delle imposte commerciali.',
    consequence: 'Il governo perde voti nel consiglio e deve cercare una nuova maggioranza.',
    importance: 'high'
};

assert.equal(
    api.eventMatchesText(
        importantEvent,
        'Durante la seduta la Lega dei Mercanti ritira il proprio sostegno al governo. Il governo perde voti nel consiglio.'
    ),
    true,
    'una scena deve riconoscere l’evento canonico che sta narrando'
);
assert.equal(api.eventImportance(importantEvent), 'high');
assert.equal(api.eventImportance({ importance: 'critical' }), 'critical');
assert.equal(api.eventImportance({ importance: 'normal' }), 'normal');

const state = {
    worldMemory: {
        turnCount: 8,
        pendingTimelineEvents: [{ id: 'a' }, { id: 'b' }],
        events: [importantEvent]
    }
};
assert.match(api.statusMessageForMode('world', state), /2 sviluppi in attesa/i);
assert.match(api.statusMessageForMode('analysis', state), /opportunità/i);
assert.match(api.statusMessageForMode('chat', state), /personaggi/i);
assert.match(api.statusMessageForMode('management', state), /attività, regno/i);
assert.match(api.statusMessageForMode('action', state), /interpreta la tua azione/i);

function fakeCard(target) {
    return {
        querySelector(selector) {
            if (selector !== '[data-management-open]') return null;
            return { dataset: { managementOpen: target } };
        }
    };
}

assert.equal(api.managementSectionForCard(fakeCard('business')), 'business');
assert.equal(api.managementSectionForCard(fakeCard('finances')), 'business');
assert.equal(api.managementSectionForCard(fakeCard('employees')), 'business');
assert.equal(api.managementSectionForCard(fakeCard('kingdom')), 'kingdom');
assert.equal(api.managementSectionForCard(fakeCard('other')), 'overview');

const source = require('fs').readFileSync(require('path').join(__dirname, '../js/player-experience-v6.js'), 'utf8');
assert.match(source, /story-scene-visual figcaption\s*\{\s*display:\s*none/i, 'il branding tecnico delle immagini non deve essere visibile nel gioco');
assert.match(source, /Panoramica/);
assert.match(source, /Attività/);
assert.match(source, /Regno/);
assert.match(source, /Relazioni/);
assert.match(source, /prefers-reduced-motion/);
assert.match(source, /ux-event-reveal/);
assert.match(source, /ux-continue-ready/);

console.log('player-experience-v6-regression: ok');
