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
const phase4 = [
    { role: 'system', content: 'FASE 4/6 — NPC E RETI SOCIALI' },
    { role: 'user', content: 'Crea 8-16 NPC e restituisci JSON completo.' }
];
const phase5 = [
    { role: 'system', content: 'FASE 5/6 — RELAZIONI E FORZE IN MOVIMENTO' },
    { role: 'user', content: 'Crea relazioni e forze e restituisci JSON completo.' }
];

assert.strictEqual(guard.isWorldBootstrap(phase1), true);
assert.strictEqual(guard.phaseNumber(phase1), 1);
assert.strictEqual(guard.phaseBudget(phase1, 4096), 1800);
assert.strictEqual(guard.phaseNumber(phase4), 4);
assert.strictEqual(guard.phaseBudget(phase4, 5600), 5600, 'la fase NPC non deve essere troncata a 3200 token');
assert.strictEqual(guard.phaseBudget(phase5, 3800), 3800, 'la fase relazioni non deve essere troncata a 2200 token');
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

    const npcCalls = [];
    const npcClient = {
        timeoutMs: 2000,
        fetch: async (url, options) => {
            npcCalls.push({ url, body: JSON.parse(options.body) });
            return {
                ok: true,
                status: 200,
                json: async () => ({ message: { content: '{"npcs":[{"name":"A","role":"Mercante"}]}' } })
            };
        }
    };
    const npcResult = await guard.startupRequest(
        ollama,
        npcClient,
        ollama.getModel('deepseek-v4-flash'),
        phase4,
        { apiKey: 'test-key', format: 'json', timeoutMs: 2000 },
        5600
    );
    assert.strictEqual(npcCalls.length, 1);
    assert.strictEqual(npcCalls[0].body.think, false);
    assert.strictEqual(npcCalls[0].body.options.num_predict, 5600);
    assert.strictEqual(npcResult.power.phase, 4);

    const loader = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai-efficiency.js'), 'utf8');
    assert(loader.includes('js/ollama-cloud-startup-guard.js?v=20260820-ollama-startup-2'));
    assert(loader.indexOf('ollama-cloud-startup-guard.js') > loader.indexOf('ollama-cloud-power-v3.js'));

    console.log('ollama cloud startup resilience regression: ok');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});