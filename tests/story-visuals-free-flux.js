'use strict';

const assert = require('assert');
const visuals = require('../js/story-visuals.js');

const url = visuals.buildFreeFluxUrl('Renaissance Florence banker office, clear scene', {
    width: 610,
    height: 220,
    seed: 1472
});

assert(url.startsWith('https://image.pollinations.ai/prompt/'), 'must use anonymous legacy Pollinations image endpoint');
assert(url.includes('model=flux'), 'must force FLUX');
assert(url.includes('width=1024'), 'event images must be generated at clear HD-ish width, not 610px');
assert(url.includes('height=576'), 'wide event images must be 16:9 and at least 576px high');
assert(!/gen\.pollinations\.ai/i.test(url), 'must not use the authenticated unified endpoint');
assert(!/[?&]key=/i.test(url), 'must not require an API key');
assert(!/pollen/i.test(url), 'must not depend on Pollen credits');

const state = {
    currentStory: {
        title: 'Il banchiere di Firenze',
        genre: 'historical business',
        setting: 'Firenze, Italia centrale',
        startTime: { year: 1472 }
    },
    currentLocation: 'Firenze',
    time: { year: 1472 },
    worldMemory: {
        world: {
            startLocation: 'Firenze',
            actors: [
                { name: 'Lorenzo Torrigiani', role: 'banchiere', location: 'Firenze' },
                { name: 'Marco Bellini', role: 'notaio', location: 'Firenze' }
            ]
        }
    }
};

const prompt = visuals.buildNarrativePrompt(
    'Il protagonista apre il libro mastro mentre un notaio aspetta davanti al banco.',
    state
);
assert(/Firenze/i.test(prompt), 'visual prompt must use the current canonical location');
assert(/1472/.test(prompt), 'visual prompt must preserve the era');
assert(/Lorenzo Torrigiani/i.test(prompt), 'visual prompt must reuse established NPCs when relevant');
assert(/crisp sharp focus/i.test(prompt), 'visual prompt must explicitly ask for clarity');
assert(/no transparency/i.test(prompt), 'visual prompt must explicitly reject transparency');

const strengthened = visuals.strengthenExistingPrompt('Florence market at sunrise');
assert(/no faded overlay/i.test(strengthened), 'event images must explicitly reject faded overlays');
assert(/cinematic 16:9/i.test(strengthened), 'event images must use a readable story composition');

console.log('free FLUX story visuals regression: ok');
