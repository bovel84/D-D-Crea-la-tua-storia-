'use strict';

const assert = require('node:assert/strict');
const recovery = require('../js/ai-credential-recovery-v23.js');

function makeDoc({ provider = 'ollama-cloud', key = 'secret', onSave = () => {} } = {}) {
    const nodes = {
        'set-model': { value: provider },
        'set-ollama-key': { value: provider === 'ollama-cloud' ? key : '' },
        'set-openrouter-key': { value: provider.startsWith('openrouter') ? key : '' },
        'set-kimera-key': { value: provider === 'deepseek' ? key : '' },
        'set-groq-key': { value: provider === 'groq' ? key : '' },
        'btn-save-settings': { onclick: onSave }
    };
    return { getElementById(id) { return nodes[id] || null; } };
}

assert.equal(recovery.missingCredentialError(new Error('API key Ollama Cloud non configurata')), true);
assert.equal(recovery.missingCredentialError(new Error('Timeout del modello')), false);
assert.equal(recovery.providerCredential(makeDoc()).apiKeyPresent, true);
assert.equal(recovery.providerCredential(makeDoc({ key: '' })).apiKeyPresent, false);

(async () => {
    let saveCount = 0;
    const doc = makeDoc({ onSave: () => { saveCount++; } });
    assert.equal(await recovery.syncSettingsFromUi(doc), true);
    assert.equal(saveCount, 1);

    let synced = false;
    let calls = 0;
    global.document = makeDoc({ onSave: () => { synced = true; } });
    global.requestConfiguredAI = async () => {
        calls++;
        if (!synced) throw new Error('API key Ollama Cloud non configurata');
        return 'ok';
    };

    assert.equal(recovery.patchRequestConfiguredAI(), true);
    assert.equal(await global.requestConfiguredAI([], {}), 'ok');
    assert.equal(calls, 2);
    assert.equal(synced, true);

    console.log('ai-credential-recovery-v23 regression: ok');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});