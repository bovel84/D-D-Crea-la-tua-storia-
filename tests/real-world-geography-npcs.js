'use strict';

const assert = require('node:assert/strict');

// Riproduce l'ordine logico dei patch del browser: world builder -> allineamento
// storia -> fresh-world -> Crea storia IA -> fedeltà geografica reale.
const worldGenerator = require('../js/world-generator.js');
require('../js/campaign-profile.js');
require('../js/time-energy.js');
const storyGenerator = require('../js/story-generator.js');
const realWorld = require('../js/real-world-worldbuilder.js');
realWorld.install();

{
    const story = storyGenerator.completeStory({
        title: 'Una nuova vita nel Centro Italia',
        genre: 'contemporary',
        setting: 'Italia centrale',
        desc: 'Voglio ricominciare da zero muovendomi tra Roma, Firenze, Perugia e Ancona.',
        startTime: { day: 18, month: 8, year: 2026, hour: 9, minute: 0 }
    });

    assert.equal(story.worldBlueprint.reality.mode, 'real_world');
    assert.equal(story.worldBlueprint.reality.canonicalArea, 'Italia centrale');
    assert.equal(story.worldBlueprint.reality.geographyPolicy, 'preserve_canonical_geography');

    const prompt = worldGenerator.buildLocationsPrompt(story, { story, worldGenerationSeed: 'real-italy-2026' });
    assert.match(prompt, /GEOGRAFIA REALE AUTORITATIVA/);
    assert.match(prompt, /Toscana, Umbria, Marche e Lazio/);
    assert.match(prompt, /Roma \(Lazio\)/);
    assert.match(prompt, /Firenze \(Toscana\)/);
    assert.match(prompt, /Perugia \(Umbria\)/);
    assert.match(prompt, /Ancona \(Marche\)/);
    assert.match(prompt, /non rinomina la geografia reale/i);
    assert.ok(prompt.lastIndexOf('GEOGRAFIA REALE AUTORITATIVA') > prompt.lastIndexOf('IDENTITÀ UNICA DELLA NUOVA PARTITA'));

    const npcPrompt = worldGenerator.buildNpcPrompt({
        name: 'Italia centrale',
        locations: [
            { name: 'Roma', region: 'Lazio', description: 'Capitale e centro istituzionale.' },
            { name: 'Firenze', region: 'Toscana', description: 'Centro economico e culturale.' }
        ],
        factions: [
            { name: 'Regione Lazio', goal: 'gestire competenze regionali', base: 'Roma' },
            { name: 'Regione Toscana', goal: 'gestire competenze regionali', base: 'Firenze' }
        ],
        forces: []
    }, story, { story });
    assert.match(npcPrompt, /NPC REALI\/PLAUSIBILI/);
    assert.match(npcPrompt, /persone private fittizie ma plausibili/i);
    assert.match(npcPrompt, /luoghi reali già generati/i);
}

{
    const story1472 = storyGenerator.completeStory({
        title: 'Mercanti e potere nel 1472',
        genre: 'historical',
        setting: 'Italia centrale',
        desc: 'La storia segue mercanti e funzionari tra Firenze, Roma e Urbino nel 1472.',
        startTime: { day: 2, month: 4, year: 1472, hour: 9, minute: 0 }
    });
    const profile = realWorld.inferRealityProfile(story1472);
    assert.equal(profile.centralItaly, true);
    assert.equal(profile.year, 1472);
    assert.equal(profile.politicsPolicy, 'boundaries_and_institutions_as_of_start_date');
    const prompt = worldGenerator.buildLocationsPrompt(story1472, { story: story1472 });
    assert.match(prompt, /NON trattare l’Italia moderna come Stato unitario/);
    assert.match(prompt, /poteri, confini, titoli e istituzioni coerenti con quell’anno/);
}

{
    const story = storyGenerator.completeStory({
        title: 'Impresa nel Centro Italia',
        genre: 'business',
        setting: 'Italia centrale',
        desc: 'Gestisco una piccola impresa con clienti e fornitori distribuiti nel Centro Italia.',
        startTime: { day: 18, month: 8, year: 2026, hour: 9, minute: 0 }
    });
    const world = {
        name: 'Fallback',
        setting: 'Italia centrale',
        locations: [
            { id: 'loc-1', name: 'Valdoria', type: 'city', connections: ['Locanda del Drago'] },
            { id: 'loc-2', name: 'Locanda del Drago', type: 'tavern', connections: ['Valdoria'] },
            { id: 'loc-3', name: 'Bosco Ombroso', type: 'village', connections: [] },
            { id: 'loc-4', name: 'Torre del Mago', type: 'castle', connections: [] },
            { id: 'loc-5', name: 'Tempio del Sole', type: 'temple', connections: [] }
        ],
        factions: [
            { id: 'fac-1', name: 'Sacro Romano Impero', base: 'Valdoria', territory: 'Valdoria', influence: 70 },
            { id: 'fac-2', name: 'Famiglia Malaspina', base: 'Locanda del Drago', territory: 'Valdoria', influence: 55 },
            { id: 'fac-3', name: 'Gilda dei Mercanti', base: 'Bosco Ombroso', territory: 'Valdoria', influence: 45 }
        ],
        actors: [],
        relations: [],
        forces: [{ id: 'force-1', name: 'Vecchia pressione', actor: 'Sacro Romano Impero', location: 'Valdoria' }],
        startLocation: 'Valdoria'
    };

    const result = worldGenerator.generateFallbackNpcs(world, {
        story,
        setting: story.setting,
        worldGenerationSeed: 'central-italy-fallback-test',
        turn: 0,
        protagonistName: 'Protagonista'
    });

    const locationNames = result.locations.map(item => item.name);
    assert.deepEqual(locationNames.slice(0, 4), ['Roma', 'Firenze', 'Perugia', 'Ancona']);
    assert.equal(result.locations[0].region, 'Lazio');
    assert.equal(result.locations[1].region, 'Toscana');
    assert.equal(result.locations[2].region, 'Umbria');
    assert.equal(result.locations[3].region, 'Marche');
    assert.equal(result.locations[0].nation, 'Italia');
    assert.ok(result.factions.every(item => !/Dominio|Casata|Lega di/i.test(item.name)));
    assert.ok(result.factions.some(item => /Comune di Roma/i.test(item.name)));
    assert.ok(result.actors.length >= 4);
    assert.ok(result.actors.every(item => item.source === 'real-world-fallback-npc'));
    assert.ok(result.actors.every(item => !/^(Nobile|Comandante|Mercante|Sacerdote|Spiaccico)$/i.test(item.role)));
    assert.ok(result.actors.every(item => locationNames.includes(item.location)));
    assert.ok(result.actors.every(item => /\s/.test(item.name)));
    assert.equal(result.reality.centralItaly, true);
}

console.log('real-world geography/NPC regression: ok');
