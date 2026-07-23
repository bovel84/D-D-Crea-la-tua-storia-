'use strict';

const assert = require('node:assert/strict');
const memoryApi = require('../js/memory-manager.js');
const narrativeApi = require('../js/narrative-master.js');
const ollamaApi = require('../js/ollama-cloud.js');
const ollamaProxyHandler = require('../api/ollama/[action].js');
const experienceApi = require('../js/experience-v7.js');
const directorApi = require('../js/game-director.js');
const vaultApi = require('../js/campaign-vault.js');
const campaignApi = require('../js/campaign-profile.js');
const lifeApi = require('../js/life-legacy.js');

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
    ['gpt-oss:120b', 'deepseek-v4-flash', 'qwen3.5:397b', 'gpt-oss:20b']
        .forEach(id => assert.ok(ids.has(id), `Modello mancante: ${id}`));
    assert.ok(ollamaApi.OLLAMA_MODELS.every(model => model.localCloudId.endsWith('-cloud')));
});

test('usa il proxy Vercel nell’app e consente un proxy esplicito', () => {
    assert.equal(
        ollamaApi.resolveEndpoint().url,
        'https://storia-app.vercel.app/api/ollama/chat'
    );
    assert.equal(ollamaApi.resolveEndpoint().tagsUrl, 'https://storia-app.vercel.app/api/ollama/tags');
    assert.equal(
        ollamaApi.resolveEndpoint({ nativeProxy: '/api/ollama/' }).url,
        '/api/ollama/chat'
    );
});

test('recupera e normalizza i modelli disponibili per la API key Cloud', async () => {
    const models = await ollamaApi.fetchCloudModels('test-key', async (url, options) => {
        assert.equal(url, 'https://storia-app.vercel.app/api/ollama/tags');
        assert.equal(options.headers.Authorization, 'Bearer test-key');
        return {
            ok: true,
            status: 200,
            json: async () => ({
                models: [{ name: 'gemma3:27b', details: { family: 'gemma', parameter_size: '27B', context_length: 131072 } }]
            })
        };
    });
    assert.equal(models[0].id, 'gemma3:27b');
    assert.equal(models[0].contextSize, 131072);
    assert.ok(ollamaApi.getModel('gemma3:27b', models));
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
        apiKey: 'test-key',
        preferredModels: ['gpt-oss:120b', 'deepseek-v4-flash']
    });
    assert.deepEqual(calls, ['gpt-oss:120b', 'deepseek-v4-flash']);
    assert.equal(result.model, 'deepseek-v4-flash');
    assert.equal(result.content, 'La storia continua.');
});

test('accetta un ID modello Ollama inserito manualmente', async () => {
    const client = new ollamaApi.OllamaCloudClient({
        fetch: async (_url, options) => ({
            ok: true, status: 200,
            json: async () => ({ message: { content: JSON.parse(options.body).model } })
        })
    });
    const result = await client.generate([{ role: 'user', content: 'test' }], {
        apiKey: 'test-key', preferredModels: ['modello-privato:70b']
    });
    assert.equal(result.content, 'modello-privato:70b');
});

test('il proxy risponde al preflight CORS della WebView', async () => {
    const output = { statusCode: 0, headers: {}, body: null };
    const response = {
        status(code) { output.statusCode = code; return this; },
        setHeader(name, value) { output.headers[name] = value; },
        send(body) { output.body = body; return this; },
        json(body) { output.body = JSON.stringify(body); return this; }
    };
    await ollamaProxyHandler({
        method: 'OPTIONS',
        query: { action: 'chat' },
        headers: { origin: 'https://bovel84.github.io' }
    }, response);
    assert.equal(output.statusCode, 204);
    assert.equal(output.headers['Access-Control-Allow-Origin'], '*');
    assert.match(output.headers['Access-Control-Allow-Methods'], /POST/);
    assert.match(output.headers['Access-Control-Allow-Headers'], /Authorization/);
});

test('il collegamento nativo inoltra chiave e richiesta a Ollama Cloud', async () => {
    const originalFetch = global.fetch;
    let upstreamCall;
    global.fetch = async (url, options) => {
        upstreamCall = { url, options };
        return {
            status: 200,
            headers: { get: () => 'application/json' },
            text: async () => '{"message":{"content":"ok"}}'
        };
    };
    const output = { statusCode: 0, headers: {}, body: '' };
    const response = {
        status(code) { output.statusCode = code; return this; },
        setHeader(name, value) { output.headers[name] = value; },
        send(body) { output.body = body; return this; },
        json(body) { output.body = JSON.stringify(body); return this; }
    };
    try {
        await ollamaProxyHandler({
            method: 'POST', query: { action: 'chat' },
            headers: { authorization: 'Bearer test-key' },
            body: { model: 'gpt-oss:120b', messages: [] }
        }, response);
    } finally {
        global.fetch = originalFetch;
    }
    assert.equal(upstreamCall.url, 'https://ollama.com/api/chat');
    assert.equal(upstreamCall.options.headers.Authorization, 'Bearer test-key');
    assert.equal(JSON.parse(upstreamCall.options.body).model, 'gpt-oss:120b');
    assert.equal(output.statusCode, 200);
});

test('limita correttamente i passaggi della creazione guidata', () => {
    assert.equal(experienceApi.clampStep(-3), 0);
    assert.equal(experienceApi.clampStep(99), 3);
    assert.equal(experienceApi.clampStep('1'), 1);
    assert.equal(experienceApi.clampStep('non valido'), 0);
});

test('naviga nella creazione guidata senza modificare lo stato originale', () => {
    const original = { step: 0, campaign: 'Astaria' };
    const forward = experienceApi.nextWizardStep(original, 1);
    const back = experienceApi.nextWizardStep(forward, -1);
    assert.equal(original.step, 0);
    assert.equal(forward.step, 1);
    assert.equal(forward.campaign, 'Astaria');
    assert.equal(back.step, 0);
});

test('riconosce quando il giocatore sta leggendo eventi precedenti', () => {
    assert.equal(experienceApi.isNearBottom({
        scrollHeight: 1000, scrollTop: 780, clientHeight: 200
    }, 30), true);
    assert.equal(experienceApi.isNearBottom({
        scrollHeight: 1000, scrollTop: 300, clientHeight: 200
    }, 30), false);
});

test('classifica gli intenti del Game Director', () => {
    assert.equal(directorApi.classifyIntent('Parlo con il mercante e provo a convincerlo'), 'dialogo');
    assert.equal(directorApi.classifyIntent('Cerco impronte vicino alla porta'), 'investigazione');
    assert.equal(directorApi.classifyIntent('Compro le provviste e pago il conto'), 'economia');
    assert.equal(directorApi.classifyIntent('Attacco la guardia'), 'conflitto');
});

test('il Game Director coordina pressione e attore in movimento', () => {
    const director = new directorApi.GameDirector();
    const plan = director.planTurn('Cerco una via di fuga', {
        memory: {
            npcs: [{ name: 'Elara', goals: 'raggiungere il porto', status: 'traveling', location: 'Locanda' }],
            quests: []
        },
        character: {
            health: { cur: 25, max: 100 },
            stamina: { cur: 40, max: 100 },
            hunger: { cur: 80, max: 100 }
        },
        currentLocation: 'Locanda'
    });
    assert.equal(plan.intent, 'investigazione');
    assert.equal(plan.spotlight.name, 'Elara');
    assert.ok(plan.pressure.level >= 70);
    assert.match(plan.prompt, /TRE RUOLI, UNA SOLA RISPOSTA/);
    assert.equal(plan.state.tick, 1);
});

test('estrae i tag separati di Cronista e Simulatore del mondo', () => {
    const tags = directorApi.extractTags(
        '[CRONISTA: Il patto|Elara accetta di collaborare|high] ' +
        '[MONDO: Casa Vareth|Invia una spia al porto|traveling|hidden] ' +
        '[PRESSIONE: minaccia|80|La spia è vicina]'
    );
    assert.equal(tags.chronicles[0].title, 'Il patto');
    assert.equal(tags.chronicles[0].importance, 'high');
    assert.equal(tags.worldMoves[0].visibility, 'hidden');
    assert.equal(tags.pressures[0].level, 80);
});

test('registra il turno del Game Director nella memoria persistente', () => {
    const memory = { turnCount: 7 };
    const result = directorApi.commitTurn(
        'Parlo con Elara',
        'Elara accetta. [CRONISTA: Alleanza|Elara offre il proprio aiuto|critical] ' +
        '[MONDO: Elara|Prepara il viaggio|working|visible]',
        memory
    );
    assert.equal(result.recordedChronicles, 1);
    assert.equal(result.recordedWorldMoves, 1);
    assert.equal(memory.director.timeline[0].turn, 7);
    assert.equal(memory.director.worldMoves[0].actor, 'Elara');
    assert.equal(memory.director.agents.chronicler.status, 'updated');
});

test('mantiene compatibile e limitata la memoria del Game Director', () => {
    const legacy = {
        customField: 42,
        timeline: Array.from({ length: 90 }, (_, index) => ({ title: String(index) })),
        worldMoves: Array.from({ length: 55 }, (_, index) => ({ actor: String(index) }))
    };
    const migrated = directorApi.migrateDirectorState(legacy);
    assert.equal(migrated.customField, 42);
    assert.equal(migrated.timeline.length, directorApi.MAX_TIMELINE);
    assert.equal(migrated.worldMoves.length, directorApi.MAX_WORLD_MOVES);
});

test('crea checkpoint completi e indipendenti della campagna', () => {
    const game = {
        character: { name: 'Elara', level: 3 },
        currentStory: { title: 'Il porto' },
        storyLog: [{ text: 'Inizio', type: 'narrator' }],
        history: [{ role: 'user', content: 'Vado al porto' }],
        time: { day: 2, hour: 9 },
        worldMemory: { turnCount: 4 },
        currentLocation: 'Porto'
    };
    const snapshot = vaultApi.buildSnapshot(game, 'Cerco la nave');
    game.character.name = 'Modificato';
    assert.equal(vaultApi.isValidSnapshot(snapshot), true);
    assert.equal(snapshot.character.name, 'Elara');
    assert.equal(snapshot.action, 'Cerco la nave');
    assert.match(vaultApi.snapshotLabel(snapshot), /turno 4/);
});

test('il Campaign Vault conserva soltanto gli ultimi tre turni', () => {
    const values = {};
    const storage = {
        getItem: key => values[key] || null,
        setItem: (key, value) => { values[key] = value; },
        removeItem: key => { delete values[key]; }
    };
    const vault = new vaultApi.CampaignVault({ storage, capacity: 3 });
    for (let index = 0; index < 5; index++) {
        vault.capture({
            character: { name: 'Eroe' },
            currentStory: { title: 'Campagna' },
            storyLog: [],
            history: [],
            worldMemory: { turnCount: index }
        }, `azione ${index}`);
    }
    assert.equal(vault.count(), 3);
    assert.equal(vault.peek().action, 'azione 4');
    assert.equal(vault.pop().action, 'azione 4');
    assert.equal(vault.count(), 2);
});

test('il backup portabile esclude tutte le credenziali', () => {
    const backupText = vaultApi.createPortableBackup({
        stories: [{ title: 'Astaria' }],
        saves: [null],
        settings: {
            model: 'ollama-cloud',
            groqKey: 'segreto',
            providers: [{ name: 'test', apiKey: 'nascosta', models: ['a', 'b'] }],
            ollama: { apiKey: 'ollama-secret', primaryModel: 'qwen3.5:397b' }
        }
    });
    const raw = JSON.parse(backupText);
    assert.equal(raw.settings.model, 'ollama-cloud');
    assert.equal(raw.settings.groqKey, undefined);
    assert.equal(raw.settings.providers[0].apiKey, undefined);
    assert.deepEqual(raw.settings.providers[0].models, ['a', 'b']);
    assert.equal(raw.settings.ollama.apiKey, undefined);
    assert.equal(raw.settings.ollama.primaryModel, 'qwen3.5:397b');
});

test('esporta e reimporta storie e salvataggi con checksum valido', () => {
    const text = vaultApi.createPortableBackup({
        stories: [{ id: 1, title: 'Astaria' }],
        saves: [{ character: { name: 'Elara' } }],
        settings: { length: 'medium' }
    });
    const restored = vaultApi.parsePortableBackup(text);
    assert.equal(restored.stories[0].title, 'Astaria');
    assert.equal(restored.saves[0].character.name, 'Elara');
    assert.equal(restored.settings.length, 'medium');
});

test('rifiuta un backup modificato dopo l’esportazione', () => {
    const raw = JSON.parse(vaultApi.createPortableBackup({
        stories: [{ title: 'Originale' }],
        saves: [],
        settings: {}
    }));
    raw.stories[0].title = 'Alterata';
    assert.throws(
        () => vaultApi.parsePortableBackup(JSON.stringify(raw)),
        /incompleto o modificato/
    );
});

test('la procedura guidata espone i quattro passaggi della Sessione Zero', () => {
    assert.deepEqual(experienceApi.WIZARD_LABELS, ['Storia', 'Eroe', 'Stile', 'Destino']);
    assert.equal(experienceApi.clampStep(12), 3);
    assert.equal(experienceApi.nextWizardStep({ step: 2 }, 1).step, 3);
});

test('crea e migra un profilo campagna persistente', () => {
    const profile = campaignApi.createProfile({
        tone: 'dark',
        focus: 'roleplay',
        freedom: 'sandbox',
        intensity: 'gentle',
        premise: 'Inizio come apprendista.',
        boundaries: 'Niente violenza grafica.'
    });
    assert.equal(profile.schemaVersion, 1);
    assert.equal(profile.tone, 'dark');
    assert.equal(profile.freedom, 'sandbox');
    assert.ok(profile.createdAt);
    const migrated = campaignApi.migrateProfile({ tone: 'inesistente', customField: 42 });
    assert.equal(migrated.tone, 'adventurous');
    assert.equal(migrated.customField, 42);
});

test('traduce la Sessione Zero in istruzioni persistenti per il Master', () => {
    const prompt = campaignApi.buildPrompt({
        tone: 'realistic',
        focus: 'management',
        freedom: 'sandbox',
        intensity: 'standard',
        premise: 'Costruire una compagnia commerciale dal nulla.',
        boundaries: 'Niente crudeltà sugli animali.'
    });
    assert.match(prompt, /SESSIONE ZERO/);
    assert.match(prompt, /Realistico/);
    assert.match(prompt, /Gestionale/);
    assert.match(prompt, /Sandbox/);
    assert.match(prompt, /compagnia commerciale/);
    assert.match(prompt, /Niente crudeltà sugli animali/);
    assert.match(prompt, /Non introdurre questi contenuti/);
});

test('normalizza e limita i testi liberi della Sessione Zero', () => {
    const profile = campaignApi.migrateProfile({
        premise: 'A'.repeat(1500),
        boundaries: 'tema\u0000 vietato'
    });
    assert.ok(profile.premise.length <= 1200);
    assert.equal(profile.boundaries.includes('\u0000'), false);
});


test('migra la vita del personaggio senza perdere campi futuri', () => {
    const life = lifeApi.migrateLife({
        customField: 42,
        domains: { mind: { xp: 135 } },
        bonds: { elara: { name: 'Elara', trust: 40 } }
    });
    assert.equal(life.schemaVersion, 1);
    assert.equal(life.customField, 42);
    assert.equal(life.domains.mind.level, 2);
    assert.equal(life.bonds.elara.name, 'Elara');
});

test('la crescita assegna livelli, punti talento e traguardi', () => {
    const life = lifeApi.createDefaultLife();
    const gain = lifeApi.addGrowth(life, 'mind', 220, 'Ha risolto un enigma antico', 5);
    assert.equal(gain.levelsGained, 2);
    assert.equal(life.domains.mind.level, 3);
    assert.equal(life.talentPoints, 2);
    assert.equal(life.milestones.length, 1);
});

test('i legami evolvono su fiducia, affetto e rispetto', () => {
    const life = lifeApi.createDefaultLife();
    const bond = lifeApi.updateBond(life, {
        name: 'Elara', type: 'amicizia', trust: 35, affection: 45, respect: 40, note: 'Ha mantenuto la promessa.'
    }, 4);
    assert.equal(bond.interactions, 1);
    assert.equal(lifeApi.relationshipLabel(bond), 'Amico');
});

test('registra bisogni e urgenza della famiglia', () => {
    const life = lifeApi.createDefaultLife();
    const member = lifeApi.updateFamilyNeed(life, {
        name: 'Marta', bond: 5, mood: 'preoccupata', need: 'Pagare il medico', urgency: 85
    }, 8);
    assert.equal(member.mood, 'preoccupata');
    assert.equal(member.urgency, 85);
    assert.equal(life.timeline[0].importance, 'high');
});

test('calcola valore e reddito netto del patrimonio', () => {
    const portfolio = lifeApi.computePortfolio([
        { baseValue: 1000, condition: 80, income: 120, maintenanceCost: 20 },
        { baseValue: 500, condition: 60, income: 50, maintenanceCost: 10 }
    ], [
        { salary: 40, status: 'working' },
        { salary: 999, status: 'fired' }
    ]);
    assert.equal(portfolio.totalValue, 1700);
    assert.equal(portfolio.netIncome, 100);
    assert.equal(portfolio.employeeCount, 1);
});

test('estrae gli aggiornamenti strutturati di vita e patrimonio', () => {
    const tags = lifeApi.extractTags(
        '[CRESCITA: mind|25|Studio intenso] ' +
        '[LEGAME: Elara|amicizia|5|8|3|Una promessa mantenuta] ' +
        '[FAMIGLIA_STATO: Marta|4|serena|Nessun bisogno|10] ' +
        '[PROPRIETA_STATO: Officina|5|200|30|Nuovi macchinari]'
    );
    assert.equal(tags.growth[0].area, 'mind');
    assert.equal(tags.bonds[0].affection, 8);
    assert.equal(tags.family[0].urgency, 10);
    assert.equal(tags.property[0].value, 200);
});

test('applica un turno a NPC, famiglia e proprietà persistenti', () => {
    const character = { name: 'Aria', level: 2 };
    const memory = {
        turnCount: 9,
        npcs: [{ name: 'Elara', relationship: 'alleata' }],
        family: [{ name: 'Marta', mood: 'content' }],
        properties: [{ name: 'Officina', condition: 70, baseValue: 1000, income: 80, maintenanceCost: 10 }],
        employees: []
    };
    const result = lifeApi.commitTurn('Parlo con tutti',
        '[CRESCITA: social|110|Ha ricomposto il conflitto] ' +
        '[LEGAME: Elara|amicizia|10|10|5|Fiducia rinnovata] ' +
        '[FAMIGLIA_STATO: Marta|5|serena|Riposo|15] ' +
        '[PROPRIETA_STATO: Officina|5|100|20|Riparata]', character, memory);
    assert.equal(result.applied.growth, 1);
    assert.equal(character.life.domains.social.level, 2);
    assert.equal(memory.npcs[0].bond.label, 'Amico');
    assert.equal(memory.family[0].need, 'Riposo');
    assert.equal(memory.properties[0].condition, 75);
    assert.equal(memory.properties[0].baseValue, 1100);
});

test('l’eredità cresce con esperienza, rapporti e proprietà', () => {
    const life = lifeApi.createDefaultLife();
    life.domains.leadership.xp = 500;
    life.domains.leadership.level = 6;
    life.bonds.elara = { name: 'Elara', type: 'amicizia', trust: 80, affection: 80, respect: 80 };
    life.portfolio = lifeApi.computePortfolio([{ baseValue: 50000, condition: 100 }], []);
    const legacy = lifeApi.computeLegacy(life, { level: 8 }, { family: [{ name: 'Marta', status: 'alive' }] });
    assert.ok(legacy.score >= 180);
    assert.notEqual(legacy.tier, 'Sconosciuto');
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
