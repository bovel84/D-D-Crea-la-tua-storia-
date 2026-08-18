'use strict';

const assert = require('node:assert/strict');
const worldBootstrapApi = require('../js/world-bootstrap.js');

// campaign-profile loads after world-bootstrap in the browser and installs the
// runtime state-sync patch on the same API object.
require('../js/campaign-profile.js');

function makeWorld() {
    return worldBootstrapApi.migrateWorld({
        name: 'Regression World',
        actors: [
            {
                name: 'Elara Vey',
                role: 'diplomatica',
                goal: 'evitare la guerra',
                influence: 70,
                status: 'active',
                source: 'test',
                lastMove: 'Attende una decisione del consiglio',
                lastMoveTurn: 1
            },
            {
                name: 'Taren',
                role: 'informatore',
                goal: 'proteggere la propria rete',
                influence: 45,
                status: 'active',
                source: 'test',
                lastMoveTurn: 1
            }
        ],
        factions: [],
        locations: [],
        relations: [],
        forces: []
    });
}

{
    const world = makeWorld();
    const memory = {
        locations: [],
        npcs: [{
            name: 'Elara Vey',
            role: 'diplomatica',
            goals: 'evitare la guerra',
            influence: 70,
            status: 'active',
            source: 'test',
            lastMove: 'Attende una decisione del consiglio',
            lastMoveTurn: 1
        }],
        factions: [],
        narrativeGoals: []
    };

    let moved = worldBootstrapApi.applyWorldMoves(world, [{
        actor: 'Elara Vey',
        action: 'Convoca segretamente Mira Sol per costruire una maggioranza',
        status: 'resolved',
        visibility: 'hidden'
    }], 2);

    moved = worldBootstrapApi.syncFromMemory(moved, memory, { turn: 2 });
    const actor = moved.actors.find(item => item.name === 'Elara Vey');

    assert.equal(actor.lastMove, 'Convoca segretamente Mira Sol per costruire una maggioranza');
    assert.equal(actor.lastMoveTurn, 2);
    assert.equal(actor.activity, 'resolved');
    assert.equal(actor.status, 'active');

    worldBootstrapApi.projectToMemory(moved, memory, { turn: 2 });
    const projected = memory.npcs.find(item => item.name === 'Elara Vey');
    assert.equal(projected.lastMove, actor.lastMove);
    assert.equal(projected.lastMoveTurn, 2);
    assert.equal(projected.activity, 'resolved');
}

{
    const world = makeWorld();
    const moved = worldBootstrapApi.applyWorldMoves(world, [{
        actor: 'Taren',
        action: 'Scompare dai quartieri della capitale',
        status: 'dormant',
        visibility: 'hidden'
    }], 3);

    const actor = moved.actors.find(item => item.name === 'Taren');
    assert.equal(actor.status, 'dormant');
    assert.equal(actor.activity, 'dormant');
}

console.log('NPC state sync regression tests: ok');
