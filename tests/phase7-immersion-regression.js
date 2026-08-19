const assert = require('assert');
global.CronacheQuestManagerV7 = { processTurn(){}, buildQuestContext(){ return 'QUESTCTX'; } };
global.CronacheOffscreenWorldV7 = { advance(){}, buildContext(){ return 'WORLDCTX'; } };
class GameDirector {
  planTurn(){ return { prompt: 'BASE' }; }
  commitTurn(){ return { ok: true }; }
}
global.CronacheDirector = { GameDirector };
const api = require('../js/turn-resolution-v7.js');
api.install();
const memory = { turnCount: 2, worldGenerationSeed: 'smoke' };
const director = new GameDirector();
const plan = director.planTurn('Provo a convincere il mercante', { memory, character:{attrs:{car:14}}, story:{genre:'historical'}, currentLocation:'Firenze' });
assert(plan.resolution && plan.prompt.includes('RISOLUZIONE AUTORITATIVA V7'));
assert(plan.prompt.includes('QUESTCTX') && plan.prompt.includes('WORLDCTX'));
director.commitTurn('Provo a convincere il mercante', 'Esito narrato', memory, {});
assert.strictEqual(memory.turnResolution.history.length, 1);
console.log('phase7-immersion-regression: ok');
