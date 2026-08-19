const assert = require('assert');
const montageApi = require('../js/time-montage-v8.js');

const state = {
  character: { name: 'Andrea Torrigiani', presentationRole: 'Banchiere' },
  currentLocation: 'Firenze',
  worldMemory: {
    turnCount: 9,
    management: { businesses: [{ name: 'Banco Torrigiani', status: 'active', cash: 1200, customerSatisfaction: 66 }] },
    family: [{ name: 'Marco Torrigiani', status: 'alive' }],
    life: { familyNeeds: { marco: { name: 'Marco Torrigiani', need: 'ottenere un apprendistato', urgency: 55 } } },
    quests: [{ name: 'Rinegoziare i crediti', status: 'active' }],
    events: [{ title: 'Stretta creditizia', status: 'developing', summary: 'Il credito agli artigiani resta scarso.' }],
    kingdom: { active: false }
  }
};

const passage = { elapsed: 10 * 1440, description: '10 giorni', startDate: '2 aprile 1472', endDate: '12 aprile 1472' };
const montage = montageApi.buildMontage(state, passage);
assert(montage, 'a multi-day passage should create a montage');
assert(montage.beats.length >= 3);
assert(montage.beats.some(beat => beat.includes('Banco Torrigiani')));
assert(montage.beats.some(beat => beat.includes('Marco Torrigiani')) || montage.beats.some(beat => beat.includes('Rinegoziare i crediti')));
assert(montageApi.buildDirective(montage).includes('Non reintrodurre fame o sonno'));
assert(montageApi.buildSummary(montage).includes('10 giorno'));

const committed = montageApi.commitMontage(state, [{ title: 'La corporazione convoca il banco' }]);
assert(committed);
assert.strictEqual(state.worldMemory.timeMontageV8.history.length, 1);
assert.strictEqual(state.worldMemory.timeMontageV8.pending, null);

assert.strictEqual(montageApi.buildMontage(state, { elapsed: 180 }), null, 'short passages should not create a montage');
console.log('time-montage-v8 regression: ok');
