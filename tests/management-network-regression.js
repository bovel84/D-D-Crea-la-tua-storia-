'use strict';

const assert = require('assert');
const agentsApi = require('../js/management-agents.js');
const timeline = require('../js/timeline-simulator.js');
global.CronacheManagementAgents = agentsApi;
global.CronacheTimelineSimulator = timeline;
const network = require('../js/management-network.js');

const state = {
    character: { name: 'Marco', gold: 500 },
    worldMemory: {
        turnCount: 12,
        world: { actors: [] },
        pendingTimelineEvents: [],
        employees: [
            { name: 'Elena Bianchi', property: 'Banco Aurora', role: 'Perito', skill: 82, morale: 52, status: 'active' },
            { name: 'Luca Conti', property: 'Banco Aurora', role: 'Addetto clienti', skill: 66, morale: 61, status: 'active' }
        ],
        management: {
            businesses: [{
                id: 'banco-1', name: 'Banco Aurora', propertyName: 'Banco Aurora', status: 'active', narrativeInitialized: true,
                customers: [{ name: 'Paolo Serra', loyalty: 72, satisfaction: 76, lifetimeValue: 2200 }],
                suppliers: [{ name: 'Casa d’Aste Rossi', reliability: 84, leadTurns: 2, discount: 4, status: 'active' }],
                competitors: [{ name: 'Pegni Centro', influence: 78, status: 'active' }],
                contracts: [{ title: 'Linea aste', kind: 'commerciale', counterpartyType: 'supplier', counterpartyName: 'Casa d’Aste Rossi', amount: 800, status: 'active' }]
            }]
        },
        kingdom: {
            active: true,
            name: 'Regno di Astaria',
            factions: [
                { name: 'Lega dei Mercanti', influence: 78, hostility: 62, loyalty: 28, goal: 'ridurre le imposte sul commercio' },
                { name: 'Unione dei Lavoratori', influence: 66, hostility: 35, loyalty: 46, goal: 'aumentare salari e tutele' }
            ],
            council: [{ name: 'Mara Vey', influence: 62, loyalty: 58, agenda: 'stabilizzare il bilancio' }],
            diplomacy: [{ name: 'Selkar', relation: 42, tension: 55, status: 'active' }]
        }
    }
};

agentsApi.syncAgents(state);
const relations = network.syncNetwork(state);
assert.ok(relations.length >= 4, 'deve creare una rete iniziale tra soggetti dello stesso ecosistema');
assert.ok(relations.some(item => item.type === 'competizione'));
assert.ok(relations.some(item => ['politica', 'coalizione', 'diplomazia'].includes(item.type)));

const competitorRelation = relations.find(item =>
    [item.leftName, item.rightName].includes('Pegni Centro') && [item.leftName, item.rightName].includes('Casa d’Aste Rossi')
) || relations.find(item => item.type === 'competizione');
assert.ok(competitorRelation);
const tensionBefore = competitorRelation.tension;

network.recordEvents(state, [{
    id: 'ev-network-1',
    title: 'Pegni Centro strappa l’esclusiva',
    summary: 'Pegni Centro convince Casa d’Aste Rossi a ridurre le forniture al Banco Aurora e minaccia di assorbire i lotti migliori.',
    consequence: 'La filiera diventa più contesa.',
    actors: ['Pegni Centro', 'Casa d’Aste Rossi'],
    turn: 12,
    source: 'management-autonomy-business'
}]);
const afterEvent = network.syncNetwork(state).find(item => item.id === competitorRelation.id);
assert.ok(afterEvent.tension > tensionBefore, 'un evento competitivo deve aumentare la tensione tra i due agenti');
assert.ok(afterEvent.memories.some(item => item.kind === 'event'));

const political = network.syncNetwork(state).find(item =>
    [item.leftName, item.rightName].includes('Lega dei Mercanti') && [item.leftName, item.rightName].includes('Mara Vey')
);
assert.ok(political);
const cooperationBefore = political.cooperation;
network.recordChatMessages(state, [{
    id: 'chat-network-1', threadId: 'council-1', speaker: 'Lega dei Mercanti', target: 'Mara Vey',
    text: 'Propongo un accordo: sosteniamo il bilancio se il governo mantiene aperti i mercati e collaboriamo sul nuovo decreto.',
    turn: 13, source: 'llm'
}]);
const afterChat = network.syncNetwork(state).find(item => item.id === political.id);
assert.ok(afterChat.cooperation > cooperationBefore, 'un accordo esplicito deve aumentare la cooperazione');
assert.ok(afterChat.memories.some(item => item.kind === 'chat'));

const context = network.buildRelationContext(state, { names: ['Lega dei Mercanti', 'Mara Vey'], limit: 3 });
assert.match(context, /Lega dei Mercanti/);
assert.match(context, /Mara Vey/);
assert.match(context, /cooperazione|tensione|affinità/i);

state.worldMemory.turnCount = 16;
const conflict = network.syncNetwork(state).find(item => item.id === competitorRelation.id);
conflict.tension = 92;
conflict.affinity = -65;
conflict.lastEventTurn = 12;
const candidate = network.networkCandidate(state);
assert.ok(candidate, 'una relazione molto tesa deve poter generare una mossa autonoma');
assert.equal(candidate.actors.length, 2);
assert.match(candidate.cause, /mossa concreta|mossa congiunta/i);

const seed = network.candidateToSeed(candidate, state, timeline);
assert.ok(seed);
assert.equal(seed.kind, 'world_initiative');
assert.equal(seed.source, 'management-network');
assert.equal(seed.causalLane, 'world');
assert.equal(seed.actors.length, 2);

state.worldMemory.managementNetwork.lastInjectionTurn = -1;
const added = network.enqueueNetworkSeed(state, timeline);
assert.ok(added.length <= 1);
if (added.length) assert.ok(state.worldMemory.pendingTimelineEvents.some(item => item.source === 'management-network'));

state.worldMemory.turnCount = 17;
state.worldMemory.managementNetwork.lastInjectionTurn = -1;
state.worldMemory.pendingTimelineEvents = [
    timeline.normalizeEventSeed({ id: 'm1', kind: 'world_initiative', cause: 'Crisi attività', source: 'management-autonomy-business', createdAtTurn: 17, originTurn: 17, causalLane: 'world' }, 0, { turn: 17 }),
    timeline.normalizeEventSeed({ id: 'm2', kind: 'world_initiative', cause: 'Crisi regno', source: 'management-autonomy-kingdom', createdAtTurn: 17, originTurn: 17, causalLane: 'world' }, 1, { turn: 17 })
].filter(Boolean);
assert.equal(network.countManagementSeedsThisTurn(state, timeline), 2);
assert.equal(network.enqueueNetworkSeed(state, timeline).length, 0, 'la fase 4 non deve superare il tetto di due cause gestionali per turno');

console.log('management-network-regression: ok');
