const assert = require('assert');
const api = require('../js/quest-manager-v7.js');

const state = {
  worldMemory: {
    turnCount: 3,
    quests: [{ name: 'Salvare la bottega', description: 'Ottenere credito per evitare il pignoramento', status: 'active', progress: 'Convincere Lorenzo a concedere credito', deadlineTurn: 5 }]
  }
};
let quests = api.syncQuests(state);
assert.strictEqual(quests.length, 1);
assert.strictEqual(quests[0].questSchemaVersion, 1);
assert.strictEqual(quests[0].stages.length, 1);
assert.strictEqual(quests[0].status, 'active');

api.processEvents(state, [{ id: 'evt-1', turn: 3, title: 'Credito concesso', summary: 'Lorenzo viene convinto e concede credito alla bottega, completando l’obiettivo.', actors: ["Lorenzo de' Medici"] }]);
quests = state.worldMemory.quests;
assert.strictEqual(quests[0].status, 'completed', 'objective evidence should complete the single-stage legacy quest');
const beforeIds = quests[0].processedEventIds.length;
api.processEvents(state, [{ id: 'evt-1', turn: 3, title: 'Credito concesso', summary: 'Lorenzo viene convinto e concede credito alla bottega, completando l’obiettivo.' }]);
assert.strictEqual(quests[0].processedEventIds.length, beforeIds, 'same event must not be processed twice');

state.worldMemory.quests.push({ name: 'Pagare i creditori', description: 'Pagare i creditori entro la scadenza', status: 'active', deadlineTurn: 4 });
state.worldMemory.turnCount = 6;
api.processDeadlines(state);
const expired = state.worldMemory.quests.find(q => q.name === 'Pagare i creditori');
assert.strictEqual(expired.status, 'failed');
assert(!api.buildQuestContext(state).includes('Pagare i creditori'), 'failed quests must not stay in active context');
console.log('quest-manager-v7-regression: ok');
