'use strict';

const assert = require('assert');
global.CronachePortraitPhotos = require('../js/portrait-photos.js');
const evolution = require('../js/portrait-evolution.js');

const npc = {
    id: 'npc-lucia',
    kind: 'npc',
    name: 'Lucia Bellini',
    gender: 'female',
    role: 'notaia',
    faction: 'Arte del Cambio',
    location: 'Firenze',
    age: 34,
    description: 'capelli neri raccolti, occhi scuri, abito sobrio di lana verde',
    createdAtTurn: 0,
    worldSeed: true,
    status: 'active'
};

const state = {
    currentStory: {
        genre: 'historical business',
        setting: 'Firenze, Repubblica fiorentina',
        startTime: { year: 1472 }
    },
    time: { year: 1472 },
    currentLocation: 'Firenze',
    character: { name: 'Andrea Torrigiani', gender: 'male', role: 'banchiere' },
    worldMemory: {
        turnCount: 0,
        world: { setting: 'Firenze, 1472', actors: [npc] },
        npcs: [npc], employees: [], family: [], events: [],
        management: { businesses: [] }, managementAgents: { agents: [] }, kingdom: { council: [] }
    }
};

const baselineEntry = evolution.ensureEvolutionEntry(npc, state);
assert.equal(baselineEntry.firstSeenYear, 1472);
assert.equal(baselineEntry.baseRole, 'notaia');
let derived = evolution.deriveEvolution(npc, state, baselineEntry);
assert.equal(derived.meaningful, false, 'nessun cambiamento visivo all ingresso');

state.time.year = 1482;
state.worldMemory.turnCount = 22;
state.worldMemory.events.push({
    id: 'event-ferita', turn: 18, actors: ['Lucia Bellini'], occurredAt: '1480',
    title: 'Agguato al ponte', summary: 'Lucia Bellini viene ferita al volto e resta con una cicatrice sottile dopo l agguato.',
    consequence: 'La ferita è curata ma il segno resta visibile.'
});
npc.role = 'cancelliera';
npc.faction = 'Cancelleria della Repubblica';

derived = evolution.deriveEvolution(npc, state, baselineEntry);
assert.equal(derived.meaningful, true);
assert.equal(derived.elapsedYears, 10);
assert.equal(derived.currentAge, 44);
assert.equal(derived.injury, 'scar');
assert.equal(derived.roleChanged, true);
assert.equal(derived.factionChanged, true);
assert.ok(derived.labels.some(label => /10 anni/i.test(label)));
assert.ok(derived.labels.some(label => /Cicatrice/i.test(label)));
assert.ok(derived.labels.some(label => /cancelliera/i.test(label)));

const evolvedProfile = evolution.buildEvolvedProfile(npc, state);
assert.match(evolvedProfile.appearance, /same core facial geometry|same recognizable face/i,
    'l evoluzione deve chiedere di preservare l identita del volto');
assert.match(evolvedProfile.appearance, /cancelliera/i);
assert.match(evolvedProfile.age, /44/);

const basePhoto = global.CronachePortraitPhotos.ensurePhotoEntry(npc, state);
const evolvedPhoto = evolution.buildEvolvedPhoto(npc, state);
assert.equal(evolvedPhoto.seed, basePhoto.seed, 'l evoluzione non deve cambiare il seed identitario');
assert.notEqual(evolvedPhoto.url, basePhoto.url, 'un cambiamento visivo deve produrre un nuovo ritratto');

state.worldMemory.events.push({
    id: 'event-malattia', turn: 23, actors: ['Lucia Bellini'], occurredAt: '1482',
    title: 'Febbre', summary: 'Lucia Bellini si ammala e appare pallida e debilitata.'
});
assert.equal(evolution.deriveEvolution(npc, state, baselineEntry).labels.includes('Affaticato'), true);
state.worldMemory.events.push({
    id: 'event-guarigione', turn: 24, actors: ['Lucia Bellini'], occurredAt: '1482',
    title: 'Guarigione', summary: 'Lucia Bellini è guarita dalla malattia e si è ristabilita.'
});
assert.equal(evolution.deriveEvolution(npc, state, baselineEntry).labels.includes('Affaticato'), false,
    'una guarigione successiva deve rimuovere i segni temporanei di malattia');

assert.equal(evolution.eventMentionsEntity({ actors: ['Mario Rossi'], summary: 'Altro evento' }, npc), false);
assert.equal(evolution.eventMentionsEntity({ actors: ['Lucia Bellini'], summary: 'Evento personale' }, npc), true);

console.log('portrait-evolution-regression: ok');
