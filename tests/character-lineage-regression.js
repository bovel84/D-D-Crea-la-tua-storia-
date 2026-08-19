'use strict';

const assert = require('assert');
const lineage = require('../js/character-lineage.js');

const parsed = lineage.parseBootstrapLineage("[MONDO_SETUP: Firenze 1472|Premessa|Conflitto|Posta|Casata Medici|de' Medici]");
assert.ok(parsed, 'il MONDO_SETUP esteso deve produrre la casata del protagonista');
assert.strictEqual(parsed.house, 'Casata Medici');
assert.strictEqual(parsed.surname, "de' Medici");

const state = {
    character: { name: 'Andrea' },
    worldMemory: {
        turnCount: 2,
        world: { protagonistLineage: parsed },
        portraitPhotos: { schemaVersion: 1, entries: {} },
        chats: [{
            participants: ["Lorenzo de' Medici", 'Andrea'],
            messages: [
                { speaker: "Lorenzo de' Medici", speakerType: 'npc', source: 'llm' },
                { speaker: 'Andrea', speakerType: 'protagonista', source: 'player' }
            ],
            agreements: [{ parties: ['Andrea', "Lorenzo de' Medici"] }]
        }]
    }
};
assert.strictEqual(lineage.applyLineage(state), true, 'un nome singolo deve ereditare il cognome esplicito della casata');
assert.strictEqual(state.character.name, "Andrea de' Medici");
assert.strictEqual(state.character.givenName, 'Andrea');
assert.strictEqual(state.character.house, 'Casata Medici');
assert.strictEqual(state.character.surname, "de' Medici");
assert.deepStrictEqual(state.worldMemory.chats[0].participants, ["Lorenzo de' Medici", "Andrea de' Medici"], 'la chat esistente deve mostrare subito il nome completo');
assert.strictEqual(state.worldMemory.chats[0].messages[1].speaker, "Andrea de' Medici");
assert.strictEqual(state.worldMemory.chats[0].agreements[0].parties[0], "Andrea de' Medici");

const fullNameState = {
    character: { name: 'Andrea Bianchi' },
    worldMemory: { world: { protagonistLineage: parsed } }
};
assert.strictEqual(lineage.applyLineage(fullNameState), false, 'un nome completo scelto dal giocatore non deve essere sovrascritto');
assert.strictEqual(fullNameState.character.name, 'Andrea Bianchi');

const familyState = {
    character: { name: 'Giulio' },
    worldMemory: { family: [{ name: "Lorenzo de' Medici", relation: 'padre' }] }
};
const familyDetected = lineage.familyLineage(familyState);
assert.ok(familyDetected);
assert.strictEqual(familyDetected.surname, "de' Medici");

assert.strictEqual(lineage.surnameFromHouseName('Casata Medici'), 'Medici');
assert.match(lineage.augmentBootstrapPrompt('BASE'), /MONDO_SETUP: nome_mondo\|premessa\|conflitto_centrale\|posta_in_gioco\|casata_protagonista_o_vuoto\|cognome_formale/);
assert.match(lineage.augmentBootstrapPrompt('BASE'), /Non inventare una casata/i);

console.log('character-lineage-regression: ok');
