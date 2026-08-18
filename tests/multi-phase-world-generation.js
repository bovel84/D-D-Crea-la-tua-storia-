'use strict';

const assert = require('node:assert/strict');
const pipeline = require('../js/real-world-worldbuilder.js');

const story = {
    title: 'Il banchiere di Firenze',
    genre: 'historical',
    setting: 'Italia centrale',
    desc: 'Nel 1472 eredito un banco a Firenze e devo competere con famiglie, creditori e reti mercantili.',
    prologue: 'La bottega bancaria apre a Firenze mentre un debitore importante manca a un pagamento.',
    startTime: { day: 2, month: 4, year: 1472, hour: 9, minute: 0 },
    worldBlueprint: {
        centralConflict: 'credito, reputazione e potere economico a Firenze',
        stakes: 'il banco può espandersi o fallire',
        scope: { primaryArea: 'Italia centrale', secondaryAreas: ['Roma', 'Urbino'] }
    }
};

assert.equal(pipeline.PIPELINE_VERSION, 1);
assert.equal(pipeline.STAGES.length, 7);
assert.deepEqual(
    pipeline.STAGES.map(item => item.label),
    [
        'Definisco canone ed epoca',
        'Ricostruisco luoghi e città',
        'Organizzo poteri e fazioni',
        'Diamo vita agli abitanti',
        'Intreccio relazioni e conflitti',
        'Verifico la coerenza',
        'Il mondo compie la prima mossa'
    ]
);

const foundationPrompt = pipeline.buildFoundationPrompt(story, {});
assert.match(foundationPrompt, /FASE 1\/6/);
assert.match(foundationPrompt, /CANONE, EPOCA E REGOLE DEL MONDO/);
assert.match(foundationPrompt, /NON trattare l’Italia moderna come Stato unitario/);
assert.doesNotMatch(foundationPrompt, /Crea 8-16 NPC/);

const foundation = {
    worldName: 'Italia centrale, 1472',
    premise: story.desc,
    centralConflict: 'credito e influenza',
    stakes: 'sopravvivenza del banco',
    historicalContext: { date: '2/4/1472', politicalSystem: 'poteri italiani del 1472' }
};

const geographyPrompt = pipeline.buildGeographyPrompt(story, foundation, {});
assert.match(geographyPrompt, /FASE 2\/6/);
assert.match(geographyPrompt, /GEOGRAFIA E LUOGHI/);
assert.match(geographyPrompt, /Roma \(Lazio\)/);
assert.match(geographyPrompt, /Firenze \(Toscana\)/);
assert.doesNotMatch(geographyPrompt, /"npcs"/);

const geography = {
    continents: [{
        name: 'Europa',
        nations: [{
            name: 'Italia centrale (area geografica)',
            government: 'assetti del 1472',
            controllingFaction: '',
            regions: [{
                name: 'Toscana',
                terrain: 'urban',
                locations: [
                    { name: 'Firenze', type: 'city', x: 430, y: 245, description: 'Centro del banco', connections: ['Siena'] },
                    { name: 'Siena', type: 'city', x: 445, y: 335, description: 'Mercato e rivale', connections: ['Firenze'] }
                ]
            }]
        }]
    }],
    startLocation: 'Firenze'
};

const factionPrompt = pipeline.buildFactionPrompt(story, foundation, geography, {});
assert.match(factionPrompt, /FASE 3\/6/);
assert.match(factionPrompt, /ISTITUZIONI, ECONOMIA E FAZIONI/);
assert.match(factionPrompt, /Firenze/);
assert.match(factionPrompt, /banche, casate, arti\/corporazioni/);

const factions = {
    factions: [{
        name: 'Arte del Cambio',
        type: 'guild',
        base: 'Firenze',
        territory: 'Toscana',
        goal: 'tutelare interessi dei cambiatori',
        resources: 'credito e rete mercantile'
    }]
};

const npcPrompt = pipeline.buildNpcPhasePrompt(story, foundation, geography, factions, {});
assert.match(npcPrompt, /FASE 4\/6/);
assert.match(npcPrompt, /NPC E RETI SOCIALI/);
assert.match(npcPrompt, /nomi, mestieri, ceto, reti e conoscenze coerenti/);
assert.match(npcPrompt, /Arte del Cambio/);

const npcs = {
    npcs: [
        { name: 'Tommaso Bianchi', role: 'cambiatore', location: 'Firenze', faction: 'Arte del Cambio', publicGoal: 'proteggere il credito', privateGoal: 'superare un rivale' },
        { name: 'Ginevra Conti', role: 'mercante', location: 'Siena', faction: '', publicGoal: 'ottenere credito', privateGoal: 'salvare la compagnia' }
    ]
};

const dynamicsPrompt = pipeline.buildDynamicsPrompt(story, foundation, geography, factions, npcs, {});
assert.match(dynamicsPrompt, /FASE 5\/6/);
assert.match(dynamicsPrompt, /RELAZIONI E FORZE IN MOVIMENTO/);
assert.match(dynamicsPrompt, /Tommaso Bianchi/);

let raw = pipeline.assembleWorld(story, foundation, geography, factions, npcs, {
    relations: [{ from: 'Tommaso Bianchi', to: 'Ginevra Conti', type: 'credito', trust: 40, tension: 60 }],
    forces: [{ name: 'Stretta del credito', actor: 'Arte del Cambio', objective: 'ridurre rischio', progress: 20, urgency: 70 }]
});
assert.equal(raw.startLocation, 'Firenze');
assert.equal(raw.factions.length, 1);
assert.equal(raw.npcs.length, 2);
assert.equal(raw.relations.length, 1);
assert.equal(raw.forces.length, 1);

raw.npcs[1].location = 'Luogo inesistente';
raw = pipeline.applyAudit(raw, {
    startLocation: 'Firenze',
    npcRepairs: [{ name: 'Ginevra Conti', location: 'Siena', faction: '' }],
    factionRepairs: [],
    locationRepairs: [{ name: 'Firenze', connections: ['Siena', 'Non esiste'] }],
    dropRelations: []
});
assert.equal(raw.npcs[1].location, 'Siena');
assert.deepEqual(raw.continents[0].nations[0].regions[0].locations[0].connections, ['Siena']);

const auditPrompt = pipeline.buildAuditPrompt(story, raw, {});
assert.match(auditPrompt, /FASE 6\/6/);
assert.match(auditPrompt, /AUDIT STRUTTURALE/);
assert.match(auditPrompt, /Tommaso Bianchi@Firenze/);
assert.match(auditPrompt, /Ginevra Conti@Siena/);

console.log('multi-phase world generation regression: ok');