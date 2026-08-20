const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ollama = require('../js/ollama-cloud.js');
const catalog = require('../js/ollama-cloud-catalog-v2.js');
const power = require('../js/ollama-cloud-power-v3.js');

catalog.patchOllama(ollama, null);

assert.strictEqual(power.modelId('glm-5.2:cloud'), 'glm-5.2');
assert.strictEqual(power.taskClass([{ role: 'user', content: 'Analizza la strategia e le conseguenze.' }]), 'reasoning');
assert.strictEqual(power.taskClass([{ role: 'user', content: 'Restituisci JSON valido.' }], { format: 'json' }), 'structured');
assert.strictEqual(power.capabilityProfile('deepseek-v4-pro', 'reasoning').think, 'max');
assert.strictEqual(power.capabilityProfile('gpt-oss:120b', 'reasoning').think, 'high');
assert.strictEqual(power.capabilityProfile('minimax-m3', 'dialogue').think, false);
assert.deepStrictEqual(power.thinkAttempts('max').slice(0, 4), ['max', 'high', true, false]);
assert(power.structuredInstruction('json').includes('JSON valido'));

(async () => {
    const calls = [];
    const client = {
        timeoutMs: 2000,
        fetch: async (url, options) => {
            const body = JSON.parse(options.body);
            calls.push({ url, body });
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    message: { content: '{"ok":true}' },
                    eval_count: 40,
                    eval_duration: 2e9,
                    prompt_eval_count: 20
                })
            };
        }
    };

    const result = await power.requestCloud(
        ollama,
        client,
        ollama.getModel('deepseek-v4-pro'),
        [{ role: 'user', content: 'Analizza e restituisci JSON con il risultato.' }],
        { apiKey: 'test', format: 'json', nativeProxy: 'https://proxy.example/api/ollama', powerMode: true },
        1200
    );

    assert.strictEqual(result.model, 'deepseek-v4-pro');
    assert.strictEqual(result.power.enabled, true);
    assert.strictEqual(result.power.task, 'structured');
    assert.strictEqual(calls[0].body.think, 'max');
    assert(!Object.prototype.hasOwnProperty.call(calls[0].body, 'format'));
    assert(!Object.prototype.hasOwnProperty.call(calls[0].body.options, 'num_ctx'));
    assert(calls[0].body.options.num_predict >= 1200);
    assert(calls[0].body.messages.some(message => /JSON valido/.test(message.content)));

    const metrics = power.testMetrics({ eval_count: 40, eval_duration: 2e9 }, 1250);
    assert.strictEqual(metrics.tokensPerSecond, 20);
    assert.strictEqual(metrics.elapsedMs, 1250);

    const loader = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai-efficiency.js'), 'utf8');
    assert(loader.includes('js/ollama-cloud-power-v3.js?v=20260820-ollama-cloud-power-1'));
    assert(loader.includes('CronacheOllamaCloudPowerV3'));

    console.log('ollama cloud power v3 regression: ok');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});