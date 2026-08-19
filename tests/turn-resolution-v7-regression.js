const assert = require('assert');
const api = require('../js/turn-resolution-v7.js');

const state = {
  currentStory: { title: 'Firenze 1472', genre: 'historical', setting: 'Firenze rinascimentale' },
  character: {
    name: 'Andrea Torrigiani',
    attrs: { car: 14, int: 12, dex: 10, for: 9 },
    skills: ['Negoziazione', 'Analisi'],
    health: { cur: 10, max: 10 },
    stamina: { cur: 100, max: 100 }
  },
  worldMemory: {
    turnCount: 7,
    worldGenerationSeed: 'test-world',
    managementAgents: { agents: [{ name: "Lorenzo de' Medici", trust: 68 }] }
  }
};

assert.strictEqual(api.classifyContext("Negozio con Lorenzo de' Medici un prestito per la bottega", state), 'negotiation');
const first = api.resolveAction("Negozio con Lorenzo de' Medici un prestito per la bottega", state);
assert(first.requiresCheck);
assert.strictEqual(first.attribute, 'car');
assert(first.roll >= 1 && first.roll <= 20);
assert(first.total !== null && first.difficulty !== null);
assert(first.ruleProfile.includes('casata'));
const second = api.resolveAction("Negozio con Lorenzo de' Medici un prestito per la bottega", state);
assert.strictEqual(second.id, first.id, 'same action/turn must reuse authoritative result');
assert.strictEqual(second.roll, first.roll, 'retries must never reroll');
assert(api.buildPromptDirective(first).includes('NON RITIRARE'));
assert(api.buildPromptDirective(first).includes('ESITO:'));

const ordinary = api.resolveAction('Saluto il mercante e osservo la piazza', { ...state, worldMemory: { ...state.worldMemory, turnCount: 8, turnResolution: null } });
assert.strictEqual(ordinary.requiresCheck, false);
assert.strictEqual(ordinary.outcome, 'automatic');
console.log('turn-resolution-v7-regression: ok');
