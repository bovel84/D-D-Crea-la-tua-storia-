const assert = require('assert');

global.CronachePortraitPhotos = {
  isPersonEntity: () => true,
  buildPhotoProfile(entity) {
    return {
      name: entity.name,
      gender: entity.gender || 'any',
      age: entity.age ? `adult, about ${entity.age} years old` : 'adult',
      role: entity.role || 'personaggio',
      faction: entity.faction || '',
      appearance: entity.appearance || '',
      era: 'renaissance'
    };
  }
};

const continuity = require('../js/scene-continuity-v8.js');

const state = {
  character: { name: 'Andrea Torrigiani', gender: 'male', age: 28, role: 'Banchiere', appearance: 'dark wavy hair, narrow face, brown eyes' },
  currentStory: { title: 'Firenze 1472', genre: 'historical', setting: 'Firenze rinascimentale', startTime: { year: 1472 } },
  currentLocation: 'Palazzo Medici',
  time: { year: 1472 },
  worldMemory: {
    turnCount: 3,
    world: {
      startLocation: 'Firenze',
      actors: [
        { name: "Lorenzo de' Medici", gender: 'male', age: 23, role: 'Signore di Firenze', location: 'Palazzo Medici', appearance: 'dark curled hair, prominent nose, olive complexion' },
        { name: 'Clarice Orsini', gender: 'female', age: 19, role: 'Nobildonna', location: 'Palazzo Medici', appearance: 'dark hair, oval face' }
      ]
    },
    npcs: []
  }
};

const narrative = "Lorenzo de' Medici osserva Andrea Torrigiani con aria sospettosa mentre discutono nel palazzo.";
const selected = continuity.selectActors(narrative, state);
assert(selected.some(actor => actor.name === "Lorenzo de' Medici"));
assert(selected.some(actor => actor.name === 'Andrea Torrigiani'));

const descriptor = continuity.actorDescriptor(state.worldMemory.world.actors[0], narrative, state);
assert(descriptor.includes('man'));
assert(descriptor.includes('dark curled hair'));
assert(descriptor.includes('same recurring person'));
assert(descriptor.includes('calculating') || descriptor.includes('guarded'));

const prompt = continuity.buildContinuityPrompt(narrative, state);
assert(prompt.includes('CHARACTER CONTINUITY REFERENCES'));
assert(prompt.includes("Lorenzo de' Medici"));
assert(prompt.includes('preserve the same identities'));
console.log('scene-continuity-v8 regression: ok');
