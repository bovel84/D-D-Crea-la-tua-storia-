'use strict';

const assert = require('assert');
const recovery = require('../js/ai-credential-recovery-v23.js');

const elements = {
    'set-model': { value: 'groq', dispatchEvent() {} },
    'set-ollama-key': { value: '' },
    'set-openrouter-key': { value: '' },
    'set-kimera-key': { value: '' },
    'set-groq-key': { value: '' },
    'set-ollama-model': { value: '' },
    'btn-save-settings': { saved: false, onclick() { this.saved = true; } }
};

const doc = {
    getElementById(id) { return elements[id] || null; }
};
const storage = {
    getItem(key) {
        if (key !== 'dnd_v4') return null;
        return JSON.stringify({
            settings: {
                model: 'ollama-cloud',
                ollama: { apiKey: 'ollama-saved-key', primaryModel: 'glm-5.2' }
            }
        });
    }
};

(async () => {
    const credential = recovery.providerCredential(doc, storage);
    assert.strictEqual(credential.provider, 'ollama-cloud');
    assert.strictEqual(credential.apiKey, 'ollama-saved-key');
    assert.strictEqual(credential.source, 'storage');

    const synced = await recovery.syncSettingsFromUi(doc, storage);
    assert.strictEqual(synced, true);
    assert.strictEqual(elements['set-model'].value, 'ollama-cloud');
    assert.strictEqual(elements['set-ollama-key'].value, 'ollama-saved-key');
    assert.strictEqual(elements['set-ollama-model'].value, 'glm-5.2');
    assert.strictEqual(elements['btn-save-settings'].saved, true);

    assert.strictEqual(recovery.missingCredentialError(new Error('API key Ollama Cloud non configurata.')), true);
    assert.strictEqual(recovery.missingCredentialError(new Error('Timeout del modello')), false);
    console.log('ai credential recovery v24 regression: ok');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});