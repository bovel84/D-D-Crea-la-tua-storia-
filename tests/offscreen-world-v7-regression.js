const assert = require('assert');
const api = require('../js/offscreen-world-v7.js');

const state = {
  worldMemory: {
    turnCount: 4,
    world: {
      actors: [
        { id: 'lorenzo', name: "Lorenzo de' Medici", role: 'Signore di Firenze', goal: 'mantenere il controllo politico', strategy: 'cooptare alleati', influence: 90, status: 'active' },
        { id: 'antinori', name: 'Tomaso Antinori', role: 'Artigiano', goal: 'salvare la compagnia', influence: 55, status: 'active' }
      ],
      factions: [{ id: 'lana', name: 'Arte della Lana', goal: 'proteggere gli artigiani', influence: 80, hostility: 60, status: 'active' }]
    },
    managementAgents: { agents: [{ id: 'supplier-1', name: 'Mercante Bardi', role: 'supplier', publicGoal: 'ottenere pagamenti puntuali', influence: 60, pressure: 70, trust: 35, status: 'active' }] }
  }
};
const first = api.advance(state);
assert(first.length >= 3 && first.length <= api.MAX_ACTIVE_MOVERS);
assert(first.every(move => move.visibility === 'hidden'));
const second = api.advance(state);
assert.deepStrictEqual(second.map(x => x.id), first.map(x => x.id), 'same turn must not simulate twice');
assert(api.buildContext(state).includes('SIMULAZIONE OFF-SCREEN V7'));

const registry = state.worldMemory.offscreenWorld;
const lorenzo = Object.values(registry.actors).find(a => a.name.includes('Lorenzo'));
lorenzo.heat = 90;
lorenzo.progress = 95;
api.acknowledgeEvents(state, [{ id: 'visible-1', turn: 4, title: 'Lorenzo interviene', summary: "Lorenzo de' Medici convoca Andrea." }]);
assert(lorenzo.heat < 90, 'visible event must discharge hidden pressure');
assert.strictEqual(lorenzo.lastVisibleTurn, 4);
console.log('offscreen-world-v7-regression: ok');
