'use strict';

const assert = require('assert');
const agentsApi = require('../js/management-agents.js');

const state = {
    character: { name: 'Marco', gold: 500 },
    worldMemory: {
        turnCount: 12,
        world: { actors: [] },
        employees: [
            { name: 'Elena Bianchi', property: 'Banco Aurora', role: 'Perito', salary: 90, skill: 82, morale: 38, status: 'active' }
        ],
        management: {
            businesses: [{
                id: 'banco-1', name: 'Banco Aurora', propertyName: 'Banco Aurora', status: 'active', narrativeInitialized: true,
                customers: [{ name: 'Paolo Serra', loyalty: 72, satisfaction: 76, lifetimeValue: 2200 }],
                suppliers: [{ name: 'Casa d’Aste Rossi', reliability: 84, leadTurns: 2, discount: 4, status: 'active' }],
                competitors: [{ name: 'Pegni Centro', influence: 68, status: 'active' }],
                contracts: [{ title: 'Linea aste', kind: 'commerciale', counterpartyType: 'supplier', counterpartyName: 'Casa d’Aste Rossi', amount: 800, status: 'active' }]
            }]
        },
        kingdom: {
            active: true,
            name: 'Regno di Astaria',
            factions: [{ name: 'Lega dei Mercanti', influence: 78, hostility: 62, loyalty: 28, goal: 'ridurre le imposte sul commercio' }],
            council: [{ name: 'Mara Vey', influence: 62, loyalty: 58, agenda: 'stabilizzare il bilancio' }],
            diplomacy: [{ name: 'Selkar', relation: 42, tension: 55, status: 'active' }]
        }
    }
};

const synced = agentsApi.syncAgents(state);
assert.ok(synced.length >= 7, 'deve creare agenti da clienti, fornitori, dipendenti, concorrenti, contratti e regno');
assert.ok(synced.some(agent => agent.name === 'Paolo Serra' && agent.role === 'customer'));
assert.ok(synced.some(agent => agent.name === 'Casa d’Aste Rossi' && ['supplier', 'contractor'].includes(agent.role)));
assert.ok(synced.some(agent => agent.name === 'Elena Bianchi' && agent.role === 'employee'));
assert.ok(synced.some(agent => agent.name === 'Pegni Centro' && agent.role === 'competitor'));
assert.ok(synced.some(agent => agent.name === 'Lega dei Mercanti' && agent.role === 'faction'));
assert.ok(state.worldMemory.world.actors.some(actor => actor.source === 'management-agent'));

const supplierBefore = agentsApi.findAgentByName(state, 'Casa d’Aste Rossi');
const trustBefore = supplierBefore.trust;
agentsApi.recordDecision(state, 'Gestione attività — Banco Aurora: ritardo il pagamento alla Casa d’Aste Rossi e chiedo nuove condizioni.', 12);
const supplierAfter = agentsApi.findAgentByName(state, 'Casa d’Aste Rossi');
assert.ok(supplierAfter.memories.length >= 1);
assert.ok(supplierAfter.trust <= trustBefore, 'un ritardo di pagamento non deve aumentare la fiducia');
assert.ok(['wary', 'hostile', 'pragmatic'].includes(supplierAfter.disposition));

agentsApi.recordEvents(state, [{
    id: 'ev-supplier-1', title: 'Il fornitore irrigidisce le condizioni',
    summary: 'Casa d’Aste Rossi rifiuta altro credito e pretende pagamento anticipato.',
    actors: ['Casa d’Aste Rossi'], consequence: 'Le prossime aste richiedono liquidità immediata.',
    turn: 13, source: 'management-autonomy-business'
}]);
const supplierEvent = agentsApi.findAgentByName(state, 'Casa d’Aste Rossi');
assert.ok(supplierEvent.memories.some(memory => memory.kind === 'event'));
assert.equal(supplierEvent.lastMoveTurn, 13);

const seed = agentsApi.enrichSeedInput({
    source: 'management-autonomy-business', sourceId: 'banco-1', kind: 'world_initiative',
    title: 'Tensione con la filiera', cause: 'La liquidità del Banco Aurora è sotto pressione.', actors: ['Casa d’Aste Rossi'], interactionMode: 'either'
}, state);
assert.equal(seed.actors[0], 'Casa d’Aste Rossi');
assert.match(seed.cause, /agente persistente/i);
assert.match(seed.cause, /strategia/i);
assert.match(seed.cause, /fiducia/i);

const context = agentsApi.buildAgentContext(state, { names: ['Casa d’Aste Rossi'], limit: 1 });
assert.match(context, /obiettivo pubblico/i);
assert.match(context, /memoria/i);
assert.match(context, /Casa d.Aste Rossi|Casa d’Aste Rossi/);

const profile = agentsApi.agentProfile(supplierEvent);
assert.equal(profile.name, 'Casa d’Aste Rossi');
assert.ok(profile.publicGoal.length > 20);
assert.ok(profile.strategy.length > 20);

agentsApi.recordChatMessages(state, [{
    threadId: 'chat-1', speaker: 'Marco', speakerType: 'protagonista', source: 'player',
    target: 'Casa d’Aste Rossi', text: 'Ti pago oggi e rinnovo il contratto se mantieni le consegne.', turn: 14
}], { protagonistName: 'Marco' });
const supplierChat = agentsApi.findAgentByName(state, 'Casa d’Aste Rossi');
assert.ok(supplierChat.memories.some(memory => memory.kind === 'chat-player'));

const countBeforeResync = supplierChat.memories.length;
state.worldMemory.turnCount = 15;
agentsApi.syncAgents(state);
const supplierPersistent = agentsApi.findAgentByName(state, 'Casa d’Aste Rossi');
assert.equal(supplierPersistent.memories.length, countBeforeResync, 'la sincronizzazione non deve cancellare la memoria');

console.log('management-agents-regression: ok');
