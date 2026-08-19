'use strict';

const assert = require('assert');
const portraits = require('../js/portrait-photos.js');

const state = {
    currentStory: {
        title: 'Il banchiere di Firenze',
        genre: 'historical business',
        setting: 'Firenze, Repubblica fiorentina',
        startTime: { year: 1472 }
    },
    time: { year: 1472 },
    currentLocation: 'Mercato Vecchio',
    character: {
        name: 'Andrea Torrigiani',
        gender: 'male',
        role: 'banchiere',
        archetype: 'mercante',
        origin: 'famiglia di cambiavalute',
        description: 'trentacinquenne con capelli castani corti, barba curata e cicatrice sottile sul sopracciglio sinistro'
    },
    worldMemory: {
        turnCount: 4,
        world: {
            setting: 'Firenze, 1472',
            startLocation: 'Mercato Vecchio',
            actors: [{
                id: 'npc-lucia',
                kind: 'npc',
                name: 'Lucia Bellini',
                gender: 'female',
                role: 'notaia',
                faction: 'Arte del Cambio',
                location: 'Mercato Vecchio',
                description: 'donna sui quarant anni, capelli neri raccolti, occhi scuri, abito sobrio di lana verde e cartella di pergamene'
            }]
        },
        npcs: [], employees: [], family: [],
        management: { businesses: [] },
        managementAgents: { agents: [] },
        kingdom: { council: [] }
    }
};

const npc = state.worldMemory.world.actors[0];
const profile = portraits.buildPhotoProfile(npc, state);
assert.equal(profile.gender, 'female');
assert.equal(profile.era, 'renaissance');
assert.match(profile.setting, /Firenze/i);
assert.match(profile.appearance, /capelli neri/i);

const prompt = portraits.buildPhotoPrompt(profile, state);
assert.match(prompt, /woman/i, 'deve rispettare il genere del personaggio');
assert.match(prompt, /notaia/i, 'deve mantenere il ruolo');
assert.match(prompt, /1472/i, 'deve mantenere l epoca');
assert.match(prompt, /lana verde/i, 'deve usare i dettagli fisici e di abbigliamento noti');
assert.match(prompt, /no other people/i, 'deve richiedere un solo soggetto');
assert.match(prompt, /do not use modern clothes/i, 'deve impedire anacronismi');
assert.match(prompt, /face clearly visible/i, 'il volto deve essere leggibile nelle piccole UI');

const url = portraits.buildPhotoUrl(profile, state, { seed: 12345 });
assert.ok(url.startsWith('https://image.pollinations.ai/prompt/'));
assert.ok(url.includes('model=flux'));
assert.ok(url.includes('width=768'));
assert.ok(url.includes('height=768'));
assert.ok(url.includes('seed=12345'));
assert.ok(!/[?&]key=/i.test(url), 'non deve richiedere API key');

const first = portraits.ensurePhotoEntry(npc, state);
const second = portraits.ensurePhotoEntry(npc, state);
assert.equal(first.url, second.url, 'la stessa persona deve mantenere la stessa foto tra render e turni');
assert.equal(first.seed, second.seed);
assert.ok(state.worldMemory.portraitPhotos.entries[first.key]);

const rerolled = portraits.rerollPhoto(npc, state);
assert.notEqual(rerolled.seed, first.seed, 'rigenera deve creare un identita visiva alternativa deterministica');
assert.notEqual(rerolled.url, first.url);
assert.equal(rerolled.reroll, 1);

assert.equal(portraits.isPersonEntity({ name: 'Lega dei Mercanti', kind: 'faction', role: 'fazione' }, state), false,
    'una fazione non deve essere trasformata in una persona casuale');
assert.equal(portraits.isPersonEntity(npc, state), true);

console.log('portrait-photos-regression: ok');
