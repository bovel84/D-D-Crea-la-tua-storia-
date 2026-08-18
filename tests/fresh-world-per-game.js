'use strict';

const assert = require('node:assert/strict');
const worldBootstrapApi = require('../js/world-bootstrap.js');
const worldGeneratorApi = require('../js/world-generator.js');
const timeApi = require('../js/time-energy.js');

function makeStaticFallbackWorld() {
    return {
        schemaVersion: 1,
        setting: 'Fantasy medievale',
        startLocation: 'Valdoria',
        locations: [
            { id: 'loc-1', name: 'Valdoria', type: 'villaggio' },
            { id: 'loc-2', name: "Il Drago d'Oro", type: 'locanda' },
            { id: 'loc-3', name: 'Bosco Ombroso', type: 'luogo' },
            { id: 'loc-4', name: 'Torre del Mago', type: 'landmark' },
            { id: 'loc-5', name: 'Tempio del Sole', type: 'religioso' }
        ],
        factions: [
            { id: 'fac-1', name: 'Sacro Romano Impero', type: 'impero', base: 'Valdoria', influence: 80, status: 'active' },
            { id: 'fac-2', name: 'Famiglia Malaspina', type: 'nobiltà', base: 'Torre del Mago', influence: 60, status: 'active' },
            { id: 'fac-3', name: 'Gilda dei Mercanti', type: 'gilda', base: "Il Drago d'Oro", influence: 45, status: 'active' }
        ],
        forces: [
            { id: 'force-1', name: 'Guardia ducale', faction: 'Sacro Romano Impero', disposition: 'Valdoria', status: 'active' }
        ],
        actors: [],
        relations: []
    };
}

{
    const memory = {
        npcs: [{ name: 'Vecchio NPC' }],
        factions: [{ name: 'Vecchia Fazione' }],
        locations: [{ name: 'Vecchio Luogo' }],
        narrativeGoals: [{ name: 'Vecchia Forza' }],
        world: { name: 'Vecchio Mondo' },
        worldGenerationSeed: 'old-seed',
        properties: [{ name: 'Negozio del protagonista' }]
    };

    timeApi.resetWorldEntities(memory);
    assert.deepEqual(memory.npcs, []);
    assert.deepEqual(memory.factions, []);
    assert.deepEqual(memory.locations, []);
    assert.deepEqual(memory.narrativeGoals, []);
    assert.deepEqual(memory.world, {});
    assert.equal(memory.worldGenerationSeed, '');
    assert.equal(memory.properties[0].name, 'Negozio del protagonista');
}

{
    const story = { title: 'Nuova Campagna', genre: 'fantasy', setting: 'Regno conteso', desc: 'Una successione difficile.' };
    const context = {};
    const locationPrompt = worldGeneratorApi.buildLocationsPrompt(story, context);
    const seed = context.worldGenerationSeed;
    assert.match(seed, /^world-/);
    assert.match(locationPrompt, new RegExp(seed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    const npcPrompt = worldGeneratorApi.buildNpcPrompt({
        name: 'Mondo Test',
        locations: [{ name: 'Città Test' }],
        factions: [{ name: 'Fazione Test' }]
    }, story, context);
    assert.match(npcPrompt, new RegExp(seed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    const otherContext = {};
    worldGeneratorApi.buildLocationsPrompt(story, otherContext);
    assert.notEqual(otherContext.worldGenerationSeed, seed);
}

{
    const first = makeStaticFallbackWorld();
    const second = makeStaticFallbackWorld();
    worldGeneratorApi.generateFallbackNpcs(first, {
        turn: 0,
        protagonistName: 'Eroe',
        worldGenerationSeed: 'world-test-a'
    });
    worldGeneratorApi.generateFallbackNpcs(second, {
        turn: 0,
        protagonistName: 'Eroe',
        worldGenerationSeed: 'world-test-b'
    });

    assert.notDeepEqual(first.locations.map(item => item.name), second.locations.map(item => item.name));
    assert.notDeepEqual(first.factions.map(item => item.name), second.factions.map(item => item.name));
    assert.notDeepEqual(first.actors.map(item => item.name), second.actors.map(item => item.name));
    assert.equal(first.generationSeed, 'world-test-a');
    assert.equal(second.generationSeed, 'world-test-b');
}

{
    const staleMemory = {
        npcs: [{ name: 'NPC della partita precedente' }],
        factions: [{ name: 'Fazione della partita precedente' }],
        locations: [{ name: 'Luogo della partita precedente' }],
        narrativeGoals: [{ name: 'Forza della partita precedente' }],
        world: { name: 'Vecchio mondo' },
        worldGenerationSeed: 'old-world'
    };
    const freshWorld = worldBootstrapApi.migrateWorld({
        name: 'Mondo Nuovo',
        generationSeed: 'fresh-world',
        locations: [{ name: 'Nuova Città', source: 'world-generator' }],
        actors: [{ name: 'Nuovo NPC', role: 'ambasciatore', source: 'world-generator' }],
        factions: [{ name: 'Nuova Fazione', source: 'world-generator' }],
        relations: [],
        forces: []
    }, { turn: 0 });
    freshWorld.generationSeed = 'fresh-world';

    const projected = worldBootstrapApi.projectToMemory(freshWorld, staleMemory, {
        turn: 0,
        worldGenerationSeed: 'fresh-world'
    });

    assert.deepEqual(projected.npcs.map(item => item.name), ['Nuovo NPC']);
    assert.deepEqual(projected.factions.map(item => item.name), ['Nuova Fazione']);
    assert.deepEqual(projected.locations.map(item => item.name), ['Nuova Città']);
    assert.equal(projected.worldGenerationSeed, 'fresh-world');
}

console.log('Fresh world per game regression tests: ok');
