'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const chat = require('../js/timeline-chat.js');
const chatRuntime = require('../js/chat-runtime-v3.js');
const timeline = require('../js/timeline-simulator.js');

chatRuntime.installEngine(chat);

{
    const migrated = chat.migrateChats([
        {
            id: 'legacy-thread',
            title: 'Riunione legacy',
            eventTitle: 'Riunione legacy',
            participants: null,
            messages: null,
            status: 'active'
        }
    ], {
        turn: 4,
        protagonistName: 'Marco Serra',
        events: []
    });

    assert.equal(migrated.length, 1);
    assert.ok(Array.isArray(migrated[0].participants));
    assert.ok(Array.isArray(migrated[0].messages));
    assert.ok(Array.isArray(migrated[0].agreements));
    assert.ok(migrated[0].resolution && typeof migrated[0].resolution === 'object');
    // Le operazioni usate dal renderer non devono più lanciare eccezioni.
    assert.doesNotThrow(() => migrated[0].participants.join(', '));
    assert.doesNotThrow(() => migrated[0].messages.length);
}

{
    assert.ok(chat.CHAT_SCHEMA_VERSION >= 6);
    [
        'migrateChats', 'normalizeThread', 'createThread', 'recordMessages',
        'chooseNextSpeaker', 'chooseSpeakerRound', 'buildChatPrompt', 'closeConversation'
    ].forEach(name => assert.equal(typeof chat[name], 'function', `API chat mancante: ${name}`));
}

{
    const recovered = chat.parseChatResponse(JSON.stringify({
        message: 'Non accetto questi termini. Posso però concedere tre giorni, non di più.'
    }), {
        nextSpeaker: 'Livia Conti',
        protagonistName: 'Marco Serra',
        threadId: 'chat-json',
        eventTitle: 'Ultimatum',
        target: 'Marco Serra',
        turn: 2
    });
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].speaker, 'Livia Conti');
    assert.match(recovered[0].text, /Non accetto questi termini/i);
    assert.ok(['llm', 'llm-recovered'].includes(recovered[0].source));
}

{
    const migrated = chat.migrateChats([
        {
            id: 'duplicates',
            title: 'Consiglio',
            eventTitle: 'Consiglio',
            participants: ['Marco Serra', 'Protagonista', 'Livia Conti', 'Livia Conti'],
            messages: [
                { id: 'p1', threadId: 'duplicates', eventTitle: 'Consiglio', speaker: 'Marco Serra', speakerType: 'protagonista', text: 'Parliamone.', source: 'player' },
                { id: 'p1', threadId: 'duplicates', eventTitle: 'Consiglio', speaker: 'Marco Serra', speakerType: 'protagonista', text: 'Parliamone.', source: 'player' },
                { id: 'bad-protagonist', threadId: 'duplicates', eventTitle: 'Consiglio', speaker: 'Protagonista', speakerType: 'npc', text: 'Io parlo al posto tuo.', source: 'llm' },
                { id: 'n1', threadId: 'duplicates', eventTitle: 'Consiglio', speaker: 'Livia Conti', speakerType: 'npc', text: 'Io ascolto.', source: 'llm' }
            ]
        }
    ], { protagonistName: 'Marco Serra', turn: 3, events: [] });
    assert.deepEqual(migrated[0].participants, ['Livia Conti', 'Marco Serra']);
    assert.equal(migrated[0].messages.filter(message => message.source === 'player').length, 1);
    assert.equal(migrated[0].messages.some(message => message.id === 'bad-protagonist'), false);
}

{
    const thread = chat.normalizeThread({
        id: 'direct-address',
        title: 'Riunione',
        eventTitle: 'Riunione',
        participants: ['Marco Serra', 'Livia Conti', 'Otto Bianchi'],
        messages: [
            { threadId: 'direct-address', eventTitle: 'Riunione', speaker: 'Marco Serra', speakerType: 'protagonista', text: 'Livia, che cosa proponi?', source: 'player' }
        ]
    }, { protagonistName: 'Marco Serra', turn: 1, events: [] });
    const round = chat.chooseSpeakerRound(thread, 'Livia, che cosa proponi?', {
        protagonistName: 'Marco Serra',
        maxSpeakers: 2
    });
    assert.deepEqual(round, ['Livia Conti']);
}

{
    const thread = chat.normalizeThread({
        id: 'close-request',
        title: 'Trattativa',
        eventTitle: 'Trattativa',
        agenda: 'definire i termini',
        participants: ['Marco Serra', 'Livia Conti'],
        messages: [
            { threadId: 'close-request', eventTitle: 'Trattativa', speaker: 'Marco Serra', speakerType: 'protagonista', text: 'Va bene, chiudiamo qui.', source: 'player' },
            { threadId: 'close-request', eventTitle: 'Trattativa', speaker: 'Livia Conti', speakerType: 'npc', text: 'Per me la conversazione termina qui.', source: 'llm' }
        ]
    }, { protagonistName: 'Marco Serra', turn: 5, events: [] });
    const closed = chat.closeConversation([thread], thread.id, { protagonistName: 'Marco Serra', turn: 5 });
    assert.equal(closed.closed, true);
    assert.equal(closed.thread.status, 'closed');
    assert.match(closed.thread.resolution.summary, /^Le parti hanno espresso una posizione finale/i);
}

{
    assert.ok(timeline.TIMELINE_SIMULATOR_SCHEMA_VERSION >= 10);
    [
        'normalizeEventQueue', 'createEventSeeds', 'createManualParallelSeeds',
        'scheduleEventSeeds', 'selectBatchEventSeeds', 'advanceEventQueue',
        'causalLabelFor', 'isMeaningfulEvent', 'buildBatchPrompt', 'parseBatchEventBody'
    ].forEach(name => assert.equal(typeof timeline[name], 'function', `API timeline mancante: ${name}`));

    const normalized = timeline.normalizeEventQueue(null, { turn: 3 });
    assert.deepEqual(normalized, []);
    const manual = timeline.createManualParallelSeeds([
        { id: 'manual-1', summary: 'Convoco il direttore e la banca per discutere il rientro.' }
    ], { turn: 3 });
    assert.equal(manual.length, 1);
    assert.ok(manual[0].id);
}

{
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'campaign-vault.js'), 'utf8');
    assert.match(source, /installInteractionUiRecovery/);
    assert.match(source, /20260818-chat-timeline-fix-1/);
    assert.match(source, /migrateChats/);
    assert.match(source, /js\/timeline-chat\.js/);
    assert.match(source, /js\/timeline-simulator\.js/);
    assert.match(source, /Object\.assign\(previousApi, freshApi\)/);
    assert.match(source, /btn-world-chats/);
    assert.match(source, /btn-advance-world/);
}

{
    const loader = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai-efficiency.js'), 'utf8');
    assert.match(loader, /js\/chat-runtime-v3\.js/);
    assert.match(loader, /CronacheChatRuntimeV3/);
}

console.log('Chat/timeline UI regression tests: ok');
