const assert = require('assert');
const travel = require('../js/world-travel-v8.js');

const state = {
  currentStory: { genre: 'historical', setting: 'Toscana rinascimentale' },
  currentLocation: 'Firenze',
  time: { year: 1472, month: 4, day: 2, hour: 9, minute: 0 },
  worldMemory: {
    turnCount: 4,
    worldGenerationSeed: 'phase8-travel-test',
    world: {
      locations: [
        { name: 'Firenze', region: 'Toscana', type: 'città', connections: ['Prato'] },
        { name: 'Prato', region: 'Toscana', type: 'città', connections: ['Firenze', 'Pistoia'] },
        { name: 'Pistoia', region: 'Toscana', type: 'città', connections: ['Prato'] }
      ]
    }
  }
};

const plan = travel.planTravel('Parto a cavallo e raggiungo Pistoia', state, {
  resolution: { outcome: 'success', requiresCheck: false }
});
assert(plan, 'travel plan should be created');
assert.deepStrictEqual(plan.route, ['Firenze', 'Prato', 'Pistoia']);
assert.strictEqual(plan.mode, 'horse');
assert(plan.estimatedMinutes > 0);
assert(travel.buildDirective(plan).includes('NON emettere [TEMPO]'));

const before = travel.clockStamp(state.time);
const committed = travel.commitTravel('Parto a cavallo e raggiungo Pistoia', state);
assert(committed && committed.arrived, 'successful travel should arrive');
assert.strictEqual(state.currentLocation, 'Pistoia');
assert(travel.clockStamp(state.time) > before, 'travel must advance time');
assert.strictEqual(state.worldMemory.travelV8.history.length, 1);

const failureState = JSON.parse(JSON.stringify(state));
failureState.currentLocation = 'Firenze';
failureState.worldMemory.travelV8 = undefined;
const failedPlan = travel.planTravel('Parto a cavallo e raggiungo Pistoia', failureState, {
  resolution: { outcome: 'hard-failure', requiresCheck: true }
});
assert(failedPlan);
const failed = travel.commitTravel('Parto a cavallo e raggiungo Pistoia', failureState);
assert.strictEqual(failed.arrived, false);
assert.strictEqual(failureState.currentLocation, 'Firenze');

console.log('world-travel-v8 regression: ok');
