'use strict';

const assert = require('node:assert/strict');
const memoryApi = require('../js/memory-manager.js');
const narrativeApi = require('../js/narrative-master.js');
const ollamaApi = require('../js/ollama-cloud.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('migra la memoria legacy senza perdere i campi esistenti', () => {
    const legacy = { npcs: [{ name: 'Elara' }], events: [{ summary: 'Incontro' }], customField: 42 };
    const migrated = memoryApi.migrateMemory(legacy);
    assert.equal(migrated.memorySchemaVersion, 2);
    assert.equal(migrated.npcs[0].name, 'Elara');
    assert.equal(migrated.customField, 42);
    assert.deepEqual(migrated.factions, []);
    assert.deepEqual(migrated.revealedSecrets, []);
});

test('mantiene esattamente gli ultimi 10 messaggi a breve termine', () => {
    const manager = new memoryApi.AdvancedMemoryManager();
    const history = Array.from({ length: 15 }, (_, index) => ({ role: 'user', content: `messaggio ${index}` }));
    const short = manager.getShortTerm(history);
    assert.equal(short.length, 10);
    assert.equal(short[0].content, 'messaggio 5');
});

test('comprime i messaggi vecchi entro 500 token e conserva i recenti', () => {
    const manager = new memoryApi.AdvancedMemoryManager({ compressionThreshold: 180 });
    const history = Array.from({ length: 18 }, (_, index) => ({
        role: index % 2 ? 'assistant' : 'user',
        content: `Turno ${index}. Decido di cercare Elara nella locanda del Cigno Nero perché la sua scomparsa è legata alla Casa Vareth. `.repeat(3)
    }));
    const result = manager.compress(history, memoryApi.createDefaultMemory());
    assert.equal(result.compressed, true);
    assert.equal(result.history.length, 10);
    assert.ok(result.memory.mediumTerm.summary.includes('Elara'));
    assert.ok(memoryApi.estimateTokens(result.memory.mediumTerm.summary) <= 500);
    assert.ok(result.memory.mediumTerm.compressedMessages > 0);
});

test('recupera i cinque ricordi più pertinenti', () => {
    const memory = memoryApi.migrateMemory({
        turnCount: 12,
        npcs: [
            { name: 'Elara', description: 'Amica d’infanzia scomparsa', relationship: 'alleata', lastSeen: 9 },
            { name: 'Mirella', description: 'Taverniera del Cigno Nero', lastSeen: 10 }
        ],
        locations: [{ name: 'Locanda del Cigno Nero', description: 'Vecchia locanda sul porto', discovered: 2 }],
        factions: [{ name: 'Casa Vareth', description: 'Casata dal sigillo del pugnale' }],
        events: [{ summary: 'Elara è scomparsa tre giorni fa', turn: 8, importance: 'high' }],
        quests: [{ name: 'Trovare Elara', description: 'Seguire le tracce dalla locanda', status: 'active' }],
        revealedSecrets: [{ name: 'Passaggio del mulino', description: 'Un tunnel dimenticato' }]
    });
    const results = memoryApi.retrieveRelevant('Torno alla locanda del Cigno Nero e chiedo notizie di Elara', memory, 5);
    assert.equal(results.length, 5);
    assert.ok(results.slice(0, 3).some(item => item.title.includes('Elara')));
    assert.ok(results.slice(0, 3).some(item => item.title.includes('Cigno Nero')));
});

test('la memoria migrata è persistibile con JSON', () => {
    const original = memoryApi.migrateMemory({ factions: [{ name: 'Custodi' }], sceneSummary: 'Scena corrente' });
    const restored = memoryApi.migrateMemory(JSON.parse(JSON.stringify(original)));
    assert.equal(restored.factions[0].name, 'Custodi');
    assert.equal(restored.mediumTerm.summary, 'Scena corrente');
});

test('il Master sceglie il focus e produce un beat proattivo', () => {
    const engine = new narrativeApi.NarrativeMasterEngine();
    const memory = memoryApi.migrateMemory({
        turnCount: 4,
        npcs: [{ name: 'Varek', goals: 'radunare mercenari', status: 'working', relationship: 'ostile' }]
    });
    const result = engine.decide('Chiedo a Mirella dove sia Elara', {
        memory,
        character: {},
        story: { setting: 'Fantasy oscuro' },
        time: { hour: 20 },
        currentLocation: 'Cigno Nero'
    });
    assert.equal(result.decision.focus, 'dialogo');
    assert.match(result.decision.proactiveBeat, /Varek/);
    assert.match(result.prompt, /CICLO DECISIONALE/);
});

test('rileva una contraddizione con un NPC morto', () => {
    const contradictions = narrativeApi.findContradictions('Parlo con Elara e le chiedo aiuto', {
        memory: { npcs: [{ name: 'Elara', status: 'dead' }] },
        currentLocation: 'Locanda'
    });
    assert.equal(contradictions.length, 1);
    assert.equal(contradictions[0].type, 'npc_status');
});

test('il catalogo contiene solo modelli Ollama Cloud remoti', () => {
    const ids = new Set(ollamaApi.OLLAMA_MODELS.map(model => model.id));
    ['gpt-oss:120b', 'deepseek-v3.1:671b', 'qwen3-coder:480b', 'gpt-oss:20b']
        .forEach(id => assert.ok(ids.has(id), `Modello mancante: ${id}`));
    assert.ok(ollamaApi.OLLAMA_MODELS.every(model => model.localCloudId.endsWith('-cloud')));
});

test('forza l’endpoint remoto ufficiale e rifiuta localhost', () => {
    assert.equal(
        ollamaApi.resolveEndpoint({}).url,
        'https://ollama.com/api/chat'
    );
    assert.throws(() => ollamaApi.resolveEndpoint({ endpoint: 'http://localhost:11434' }), /esclusivamente Ollama Cloud/);
});

test('usa il modello successivo quando Ollama è sovraccarico', async () => {
    const calls = [];
    const fakeFetch = async (_url, options) => {
        const body = JSON.parse(options.body);
        calls.push(body.model);
        if (calls.length === 1) {
            return { ok: false, status: 503, json: async () => ({ error: 'overloaded' }) };
        }
        return { ok: true, status: 200, json: async () => ({ message: { content: 'La storia continua.' } }) };
    };
    const client = new ollamaApi.OllamaCloudClient({ fetch: fakeFetch, timeoutMs: 1000 });
    const result = await client.generate([{ role: 'user', content: 'Continua' }], {
        endpoint: 'https://ollama.com',
        apiKey: 'test-key',
        preferredModels: ['gpt-oss:120b', 'deepseek-v3.1:671b']
    });
    assert.deepEqual(calls, ['gpt-oss:120b', 'deepseek-v3.1:671b']);
    assert.equal(result.model, 'deepseek-v3.1:671b');
    assert.equal(result.content, 'La storia continua.');
});

(async () => {
    let passed = 0;
    for (const item of tests) {
        try {
            await item.fn();
            passed++;
            console.log(`✓ ${item.name}`);
        } catch (error) {
            console.error(`✗ ${item.name}`);
            console.error(error);
            process.exitCode = 1;
        }
    }
    console.log(`\n${passed}/${tests.length} test superati`);
})();
