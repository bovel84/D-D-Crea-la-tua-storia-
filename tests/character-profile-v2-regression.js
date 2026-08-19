'use strict';

const assert = require('assert');
const profile = require('../js/character-profile-v2.js');

const state = {
    character: {
        name: 'Andrea Torrigiani',
        givenName: 'Andrea',
        surname: 'Torrigiani',
        house: 'Casata dei Torrigiani',
        genre: 'business',
        origin: 'startup',
        archetype: 'ceo',
        level: 1
    },
    currentStory: {
        genre: 'business',
        title: 'Il Banco dei Torrigiani',
        premise: 'Andrea appartiene alla casata dei Torrigiani e amministra un banco nella Firenze del Quattrocento.',
        setting: 'Firenze, 1472'
    },
    currentLocation: 'Firenze',
    time: { year: 1472 },
    worldMemory: {
        characterLineage: { house: 'Casata dei Torrigiani', surname: 'Torrigiani', source: 'story-text' },
        management: { businesses: [{ active: true, name: 'Banco Torrigiani', type: 'bank' }] },
        world: { actors: [] }
    }
};

const context = profile.detectPresentationContext(state);
assert.strictEqual(context.historical, true, '1472 deve essere presentato come contesto storico anche con meccaniche business');
assert.strictEqual(context.era, 'renaissance');
assert.strictEqual(profile.contextualRole(state, context), 'Banchiere');
assert.strictEqual(profile.contextualBackground(state, context), 'Casa mercantile');

const model = profile.profileModel(state);
assert.strictEqual(model.name, 'Andrea Torrigiani');
assert.strictEqual(model.house, 'Casata dei Torrigiani');
assert.strictEqual(model.role, 'Banchiere');
assert.strictEqual(model.background, 'Casa mercantile');
assert.match(model.period, /Rinascimento/);
assert.match(model.period, /1472/);
assert.strictEqual(model.theme, 'renaissance');

profile.updatePresentationIdentity(state, model);
assert.strictEqual(state.character.role, 'Banchiere', 'il ritratto non deve più ricevere CEO come identità storica');
assert.strictEqual(state.character.faction, 'Casata dei Torrigiani', 'la casata deve entrare nel contesto visivo del ritratto');

const css = profile.cssText();
assert.match(css, /profile-world-card/);
assert.match(css, /profile-equipment-empty/);
assert.match(css, /data-profile-theme='renaissance'/);
assert.match(css, /#char-portrait/);

console.log('character-profile-v2-regression: ok');
