'use strict';

const assert = require('assert');

global.CronacheStoryGenerator = {
    completeStory(input) { return { ...input }; }
};
const generator = require('../js/story-generation-v26.js');

const seed = {
    title: 'Contea',
    setting: 'Italia centrale, anno 1000 d.C.',
    genre: 'historical',
    difficulty: 'normal',
    starterGold: 500,
    idea: 'Governa una contea con storia reale, NPC, geografia e territori vicini.'
};

const corePrompt = generator.buildCorePrompt(seed);
const worldPrompt = generator.buildWorldPrompt(seed, {
    title: 'Contea',
    setting: seed.setting,
    startTime: { day: 1, month: 3, year: 1000, hour: 8, minute: 0 },
    historicalGrounding: { mode: 'plausible', date: '1000 d.C.', politicalContext: 'Italia post-carolingia' },
    worldBlueprint: { centralConflict: 'Successione e controllo del contado' }
});
assert(corePrompt.includes('CANONE'));
assert(!corePrompt.includes('"worldSeed"'));
assert(worldPrompt.includes('worldSeed'));
assert(worldPrompt.includes('NON generare ancora i PNG'));

const core = {
    title: 'Contea',
    setting: seed.setting,
    genre: 'historical',
    difficulty: 'normal',
    starterGold: 500,
    desc: 'x'.repeat(400),
    personality: 'Storico e realistico',
    depth: 'Causale e persistente',
    prologue: 'y'.repeat(400),
    startTime: { day: 1, month: 3, year: 1000, hour: 8, minute: 0 },
    starterProperties: [],
    canonFacts: ['a', 'b', 'c', 'd'],
    openThreads: ['a', 'b', 'c'],
    historicalGrounding: {
        mode: 'plausible', date: '1000 d.C.', region: 'Italia centrale', politicalContext: 'Italia post-carolingia',
        documentedFacts: ['fatto 1', 'fatto 2', 'fatto 3'], fictionalizedElements: ['Contea locale']
    },
    worldBlueprint: {
        centralConflict: 'Conflitto', stakes: 'Posta',
        locationNeeds: Array.from({ length: 6 }, (_, i) => ({ nameHint: `L${i}` })),
        factionNeeds: Array.from({ length: 3 }, (_, i) => ({ nameHint: `F${i}` })),
        characterNeeds: Array.from({ length: 6 }, (_, i) => ({ nameHint: `N${i}` })),
        activeForces: Array.from({ length: 3 }, (_, i) => ({ name: `A${i}` }))
    }
};

const locations = Array.from({ length: 6 }, (_, i) => ({ name: `Luogo ${i}`, type: 'village', x: 100 + i * 100, y: 100 + i * 50 }));
const worldPhase = {
    worldSeed: {
        worldName: 'Contado', premise: 'Premessa', centralConflict: 'Conflitto', stakes: 'Posta',
        continents: [{ name: 'Italia', nations: [{ name: 'Marca', government: 'contea', controllingFaction: 'Casata A', regions: [
            { name: 'Valle', terrain: 'plains', locations: locations.slice(0, 3) },
            { name: 'Colline', terrain: 'mountain', locations: locations.slice(3) }
        ] }] }],
        factions: [
            { name: 'Casata A', base: 'Luogo 0' },
            { name: 'Casata B', base: 'Luogo 1' },
            { name: 'Vescovado', base: 'Luogo 2' }
        ],
        relations: [{ from: 'Casata A', to: 'Casata B', type: 'rivalità' }],
        forces: [{ name: 'Forza 1' }, { name: 'Forza 2' }, { name: 'Forza 3' }],
        npcs: [],
        startLocation: 'Luogo 0'
    }
};
const people = {
    npcs: Array.from({ length: 6 }, (_, i) => ({
        name: `NPC ${i}`, role: 'nobile', faction: i < 2 ? 'Casata A' : i < 4 ? 'Casata B' : 'Vescovado', location: `Luogo ${i}`
    })),
    relations: [
        { from: 'NPC 0', to: 'NPC 1', type: 'alleanza' },
        { from: 'NPC 1', to: 'NPC 2', type: 'rivalità' },
        { from: 'NPC 2', to: 'NPC 3', type: 'cooperazione' },
        { from: 'NPC 4', to: 'Vescovado', type: 'dipendenza' }
    ]
};

const story = generator.mergeStory(seed, core, worldPhase, people);
const stats = generator.countWorld(story.worldSeed);
assert.strictEqual(stats.locations, 6);
assert.strictEqual(stats.factions, 3);
assert.strictEqual(stats.npcs, 6);
assert.strictEqual(stats.forces, 3);
assert.strictEqual(story.generationVersion, 26);
assert.strictEqual(story.startTime.year, 1000);
console.log('story generation v26 regression: ok');