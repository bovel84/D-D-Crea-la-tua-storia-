'use strict';

const assert = require('assert');
const lineage = require('../js/character-lineage.js');

const storyState = {
    character: {
        name: "Andrea de' Medici",
        givenName: 'Andrea',
        surname: "de' Medici",
        cognome: "de' Medici",
        house: 'Casata Medici',
        casata: 'Casata Medici'
    },
    currentStory: {
        title: 'Il Banco dei Torrigiani',
        premise: 'Andrea appartiene alla casata dei Torrigiani e deve difendere il patrimonio familiare a Firenze.',
        setting: 'Firenze, 1472'
    },
    worldMemory: {
        turnCount: 4,
        characterLineage: {
            schemaVersion: 1,
            house: 'Casata Medici',
            surname: "de' Medici",
            source: 'world-bootstrap',
            managed: true
        },
        world: {
            protagonistLineage: {
                house: 'Casata Medici',
                surname: "de' Medici",
                source: 'world-bootstrap',
                managed: true
            }
        }
    }
};

const detected = lineage.storyLineage(storyState);
assert.ok(detected, 'la casata deve essere ricavata dalla storia');
assert.strictEqual(detected.surname, 'Torrigiani');
assert.match(detected.house, /Torrigiani/);
assert.strictEqual(lineage.detectLineage(storyState).surname, 'Torrigiani', 'la storia deve avere priorità sul bootstrap del mondo');
assert.strictEqual(lineage.applyLineage(storyState), true, 'un cognome auto-generato errato deve poter essere corretto');
assert.strictEqual(storyState.character.name, 'Andrea Torrigiani');
assert.strictEqual(storyState.character.surname, 'Torrigiani');
assert.match(storyState.character.house, /Torrigiani/);

const manualName = {
    character: { name: 'Andrea Bianchi', givenName: 'Andrea' },
    currentStory: { premise: 'Andrea appartiene alla casata dei Torrigiani.', setting: 'Firenze, 1472' },
    worldMemory: {}
};
assert.strictEqual(lineage.applyLineage(manualName), false, 'un cognome completo inserito manualmente non deve essere sovrascritto');
assert.strictEqual(manualName.character.name, 'Andrea Bianchi');

const prompt = lineage.augmentBootstrapPrompt('BASE');
assert.match(prompt, /dato della STORIA e del PERSONAGGIO/i);
assert.match(prompt, /non assegnare automaticamente Medici/i);

console.log('story-lineage-regression: ok');
