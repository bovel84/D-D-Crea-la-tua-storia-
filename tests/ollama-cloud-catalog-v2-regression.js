const assert = require('assert');
const fs = require('fs');
const path = require('path');

const base = require('../js/ollama-cloud.js');
const catalog = require('../js/ollama-cloud-catalog-v2.js');

assert.strictEqual(catalog.normalizeCloudApiId('glm-5.2:cloud'), 'glm-5.2');
assert.strictEqual(catalog.normalizeCloudApiId('qwen3.5:397b-cloud'), 'qwen3.5:397b');
assert.strictEqual(catalog.normalizeCloudApiId('deepseek-v4-flash:0731-cloud'), 'deepseek-v4-flash:0731');
assert.strictEqual(catalog.normalizeCloudApiId('kimi-k2.7'), 'kimi-k2.7-code');
assert.strictEqual(catalog.cloudTagFor('glm-5.2'), 'glm-5.2:cloud');
assert.strictEqual(catalog.cloudTagFor('qwen3.5:397b'), 'qwen3.5:397b-cloud');

const discovered = [
    { name: 'glm-5.2:cloud', context_length: 999424 },
    { name: 'qwen3.5:397b-cloud', context_length: 262144 },
    { name: 'kimi-k2.7-code:cloud', context_length: 262144 },
    { name: 'deepseek-v4-flash:0731-cloud', context_length: 1048576 }
].map(catalog.modelFromRaw);

assert.deepStrictEqual(discovered.map(model => model.id), [
    'glm-5.2', 'qwen3.5:397b', 'kimi-k2.7-code', 'deepseek-v4-flash:0731'
]);
assert.strictEqual(catalog.mergeModels(catalog.CURRENT_MODELS, discovered).filter(model => model.id === 'glm-5.2').length, 1);
assert(catalog.CURRENT_MODELS.some(model => model.id === 'kimi-k3'));
assert(catalog.CURRENT_MODELS.some(model => model.id === 'nemotron-3-ultra'));
assert(catalog.CURRENT_MODELS.some(model => model.id === 'minimax-m3'));

catalog.patchOllama(base, null);
assert.strictEqual(base.getModel('glm-5.2:cloud').apiId, 'glm-5.2');
assert.strictEqual(base.getModel('kimi-k2.7').apiId, 'kimi-k2.7-code');
assert(base.OLLAMA_MODELS.length >= 20);
assert(base.OllamaCloudClient.prototype.request.__cloudCatalogV2Wrapped);

(async () => {
    const calls = [];
    const fakeFetch = async url => {
        calls.push(url);
        return {
            ok: true,
            status: 200,
            json: async () => ({ models: [
                { name: 'kimi-k3:cloud', details: { family: 'kimi' }, context_length: 1048576 },
                { name: 'nemotron-3-super:cloud', context_length: 262144 }
            ] })
        };
    };
    const result = await catalog.fetchModelsWithFallback(base, 'test-key', fakeFetch);
    assert.strictEqual(result[0].id, 'kimi-k3');
    assert.strictEqual(result[1].id, 'nemotron-3-super');
    assert(calls[0].endsWith('/tags'));

    const loader = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai-efficiency.js'), 'utf8');
    assert(loader.includes('js/ollama-cloud-catalog-v2.js?v=20260820-ollama-cloud-catalog-2'));
    assert(loader.includes('CronacheOllamaCloudCatalogV2'));
    console.log('ollama cloud catalog v2 regression: ok');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});