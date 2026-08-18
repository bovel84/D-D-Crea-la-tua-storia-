'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const chat = require('../js/timeline-chat.js');
const timeline = require('../js/timeline-simulator.js');

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

console.log('Chat/timeline UI regression tests: ok');
