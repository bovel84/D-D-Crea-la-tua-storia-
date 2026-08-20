const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ollama = require('../js/ollama-cloud.js');
const catalog = require('../js/ollama-cloud-catalog-v2.js');
const guard = require('../js/ollama-cloud-startup-guard.js');

catalog.patchOllama(ollama, null);

const phase1 = [
    { role: 'system', content: 'FASE 1/6 — CANONE, EPOCA E REGOLE DEL MONDO' },
    { role: 'user', content: 'Genera il fondamento del mondo in JSON.' }
];

assert.strictEqual(guard.isWorldBootstrap(phase1), true);
assert.strictEqual(guard.phaseNumber(phase1), 1);
assert.strictEqual(guard.phaseBudget(phase1, 4096), 1800);
assert.strictEqual(guard.isWorldBootstrap([{ role: 'user', content: 'Parla con il mercante.' }]), false);
assert.deepStrictEqual(guard.endpointBases({}), [guard.APP_PROXY, guard.OFFICIAL_API]);

(async () => {
    const calls = [];
    const client = {
        timeoutMs: 2000,
        fetch: async (url, options) => {
            calls.push({ url, body: JSON.parse(options.body) });
            if (url.startsWith(guard.APP_PROXY)) throw new TypeError('proxy temporarily unavailable');
            return {
                ok: true,
                status: 200,
                json: async () => ({ message: { content: '{"worldBlueprint":{"reality":{"mode":"fictional"}}}' } })
            };
        }
    };

    const result = await guard.startupRequest(
        ollama,
        client,
        ollama.getModel('deepseek-v4-flash'),
        phase1,
        { apiKey: 'test-key', format: 'json', timeoutMs: 2000 },
        4096
    );

    assert.strictEqual(calls.length, 2, 'un errore di rete deve passare all endpoint successivo senza moltiplicare i tentativi thinking');
    assert(calls[0].url.startsWith(guard.APP_PROXY));
    assert(calls[1].url.startsWith(guard.OFFICIAL_API));
    assert.strictEqual(calls[0].body.think, false);
    assert.strictEqual(calls[0].body.options.num_predict, 1800);
    assert.strictEqual(result.power.startupGuard, true);
    assert.strictEqual(result.power.phase, 1);
    assert.strictEqual(result.power.think, false);

    const loader = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai-efficiency.js'), 'utf8');
    assert(loader.includes('js/ollama-cloud-startup-guard.js?v=20260820-ollama-startup-1'));
    assert(loader.indexOf('ollama-cloud-startup-guard.js') > loader.indexOf('ollama-cloud-power-v3.js'));

    console.log('ollama cloud startup resilience regression: ok');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});