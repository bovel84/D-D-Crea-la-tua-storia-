'use strict';

const assert = require('assert');
const dossiers = require('../js/npc-dossiers.js');

const npc = {
    id: 'npc-lucia',
    kind: 'npc',
    name: 'Lucia Bellini',
    gender: 'female',
    role: 'notaia',
    faction: 'Arte del Cambio',
    location: 'Mercato Vecchio',
    description: 'Notaia fiorentina con capelli neri raccolti e abito di lana verde.',
    publicGoal: 'garantire che il contratto venga rispettato',
    privateGoal: 'ottenere una quota segreta della società',
    relationship: 'neutrale',
    influence: 62
};

const state = {
    currentLocation: 'Mercato Vecchio',
    character: { name: 'Andrea Torrigiani', role: 'banchiere' },
    worldMemory: {
        world: { actors: [npc] },
        npcs: [], employees: [], family: [],
        kingdom: { council: [] },
        managementAgents: {
            agents: [{
                name: 'Lucia Bellini', role: 'contractor', disposition: 'wary', trust: 43, influence: 67,
                publicGoal: 'garantire che il contratto venga rispettato',
                privateGoal: 'spostare il rischio sul protagonista',
                memories: [
                    { text: 'Il protagonista ha promesso il pagamento entro venerdì.' },
                    { text: 'Hai richiesto una garanzia aggiuntiva sul contratto.' }
                ]
            }]
        }
    }
};

const dossier = dossiers.buildDossier('Lucia Bellini', state);
assert.ok(dossier, 'deve costruire la scheda di un NPC conosciuto');
assert.equal(dossier.name, 'Lucia Bellini');
assert.equal(dossier.role, 'notaia');
assert.equal(dossier.faction, 'Arte del Cambio');
assert.equal(dossier.location, 'Mercato Vecchio');
assert.equal(dossier.relationship, 'Prudente');
assert.equal(dossier.trust, 43);
assert.equal(dossier.influence, 67);
assert.match(dossier.publicGoal, /contratto/i);
assert.equal(dossier.memories.length, 2);
assert.match(dossier.memories[0], /pagamento/i);
assert.equal(Object.prototype.hasOwnProperty.call(dossier, 'privateGoal'), false,
    'la UI non deve esporre gli obiettivi privati dell NPC');

assert.equal(dossiers.dispositionLabel('hostile'), 'Ostile');
assert.equal(dossiers.dispositionLabel('aligned'), 'Collaborativo');
assert.equal(dossiers.isSameName('Lucia', 'Lucia Bellini'), true);
assert.equal(dossiers.isSameName('Lucia Bellini', 'Marco Bellini'), false);

const protagonist = dossiers.buildDossier(state.character, state);
assert.equal(protagonist.protagonist, true);

console.log('npc-dossiers-regression: ok');
