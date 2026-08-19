'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const identity = require('../js/npc-identity-coherence.js');

assert.strictEqual(identity.genderFromName("Lorenzo de' Medici"), 'male', 'Lorenzo de Medici deve essere riconosciuto come uomo');
assert.strictEqual(identity.genderFromName('Clarice Orsini'), 'female', 'Clarice Orsini deve essere riconosciuta come donna');
assert.strictEqual(identity.inferGender({ name: "Lorenzo de' Medici", gender: 'female' }), 'male', 'il canone identitario deve correggere un genere legacy palesemente errato');
assert.strictEqual(identity.inferGender({ name: 'Bianca Rossi', role: 'Duchessa' }), 'female');
assert.strictEqual(identity.inferGender({ name: 'Personaggio X', role: 'Banchiere' }), 'male');

const prompt = identity.augmentBootstrapPrompt('BASE\n[PERSONAGGIO_SETUP: nome|carica_o_ruolo|fazione_o_vuoto|descrizione|personalità|obiettivo_generale|strategia|risorse|influenza_0_100|relazione_col_protagonista|active|luogo|obiettivo_pubblico|obiettivo_privato|leva_concreta|vincoli|conoscenze|agenda|ruolo_storico]');
assert.match(prompt, /ruolo_storico\|genere_male_female/);
assert.match(prompt, /personaggi storici noti rispetta il sesso storico/i);
assert.strictEqual(identity.augmentBootstrapPrompt(prompt), prompt, 'il prompt non deve essere duplicato');

const parsed = identity.parseActorGenders("[PERSONAGGIO_SETUP: Lorenzo de' Medici|Signore di Firenze|Medici|descrizione|personalità|goal|strategy|resources|95|tensione|active|Firenze|pubblico|privato|leva|vincoli|conoscenze|agenda|Magnifico|male]");
assert.deepStrictEqual(parsed, [{ name: "Lorenzo de' Medici", gender: 'male' }]);

const state = {
    currentStory: { genre: 'historical', setting: 'Firenze, 1472' },
    time: { year: 1472 },
    worldMemory: {
        turnCount: 4,
        world: { actors: [{ name: "Lorenzo de' Medici", role: 'Signore di Firenze', gender: '' }] },
        npcs: [{ name: "Lorenzo de' Medici", role: 'Signore di Firenze' }],
        chats: [{ messages: [{ speaker: "Lorenzo de' Medici", speakerType: 'npc', gender: '' }] }],
        portraitPhotos: {
            schemaVersion: 1,
            entries: {
                'npc-lorenzo-de-medici': {
                    schemaVersion: 1,
                    key: 'npc-lorenzo-de-medici',
                    name: "Lorenzo de' Medici",
                    seed: 123,
                    reroll: 0,
                    url: 'old-wrong-photo',
                    profile: { key: 'npc-lorenzo-de-medici', name: "Lorenzo de' Medici", gender: 'any', era: 'renaissance', role: 'Signore di Firenze' }
                }
            }
        }
    }
};

assert.ok(identity.stabilizeNpcGenders(state) >= 2, 'il genere deve propagarsi tra world actor, registro NPC e chat');
assert.strictEqual(state.worldMemory.world.actors[0].gender, 'male');
assert.strictEqual(state.worldMemory.npcs[0].gender, 'male');
assert.strictEqual(state.worldMemory.chats[0].messages[0].gender, 'male');

global.CronachePortraitPhotos = {
    ensureRegistry(current) { return current.worldMemory.portraitPhotos; },
    identityKey(entity) { return `npc-${identity.keyOf ? identity.keyOf(entity.name) : String(entity.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`; },
    buildPhotoProfile(entity) {
        return { key: 'npc-lorenzo-de-medici', name: entity.name, gender: entity.gender || 'any', era: 'renaissance', role: entity.role || 'personaggio' };
    },
    buildPhotoUrl(profile, _state, options) {
        return `photo://${profile.gender}/${options.seed}`;
    }
};

const repaired = identity.repairPortraitEntries(state, null);
assert.strictEqual(repaired, 1, 'il ritratto legacy senza genere deve essere rigenerato');
assert.strictEqual(state.worldMemory.portraitPhotos.entries['npc-lorenzo-de-medici'].profile.gender, 'male');
assert.strictEqual(state.worldMemory.portraitPhotos.entries['npc-lorenzo-de-medici'].url, 'photo://male/123');

const world = { actors: [{ name: 'Clarice Orsini', role: 'Nobildonna', gender: '' }] };
identity.applyParsedActorGenders(world, [{ name: 'Clarice Orsini', gender: 'female' }], {});
assert.strictEqual(world.actors[0].gender, 'female');
const memory = { npcs: [{ name: 'Clarice Orsini' }] };
identity.propagateWorldGendersToMemory(world, memory);
assert.strictEqual(memory.npcs[0].gender, 'female');

const loader = fs.readFileSync(path.join(__dirname, '../js/ai-efficiency.js'), 'utf8');
assert.match(loader, /npc-identity-coherence\.js/);
assert.match(loader, /CronacheNpcIdentityCoherence\?\.install/);

console.log('npc-identity-coherence-regression: ok');
