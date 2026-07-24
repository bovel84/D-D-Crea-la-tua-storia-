'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const memoryApi = require('../js/memory-manager.js');
const narrativeApi = require('../js/narrative-master.js');
const ollamaApi = require('../js/ollama-cloud.js');
const ollamaProxyHandler = require('../api/ollama/[action].js');
const experienceApi = require('../js/experience-v7.js');
const directorApi = require('../js/game-director.js');
const vaultApi = require('../js/campaign-vault.js');
const campaignApi = require('../js/campaign-profile.js');
const lifeApi = require('../js/life-legacy.js');
const characterApi = require('../js/character-options.js');
const timeEnergyApi = require('../js/time-energy.js');
const businessApi = require('../js/business-manager.js');

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

test('interpreta il tempo narrativo e applica il metabolismo senza rigenerazione gratuita', () => {
    assert.equal(timeEnergyApi.parseTimeExpression('2h'), 120);
    assert.equal(timeEnergyApi.parseTimeExpression('90 min'), 90);
    assert.equal(timeEnergyApi.parseTimeExpression('1 giorno, 5 ore'), 1740);
    assert.equal(timeEnergyApi.parseTimeExpression('2 settimane'), 20160);
    assert.equal(timeEnergyApi.parseTimeExpression('+45'), 45);
    assert.equal(timeEnergyApi.parseTimeExpression('domani'), 0);

    let state = { _metabolismCarry: { stamina: 0, hunger: 0 } };
    let result = timeEnergyApi.consumeMetabolism(state, 10, false);
    assert.equal(result.staminaLoss, 0);
    state._metabolismCarry = result.carry;
    result = timeEnergyApi.consumeMetabolism(state, 10, false);
    assert.equal(result.staminaLoss, 1);
    assert.equal(result.hungerLoss, 1);
    result = timeEnergyApi.consumeMetabolism({ _metabolismCarry: { stamina: 0, hunger: 0 } }, 480, true);
    assert.equal(result.staminaLoss, 0);
    assert.equal(result.hungerLoss, 12);
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
    assert.equal(portfolio.totalValue, 1400);
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
    assert.equal(memory.npcs[0].bond.label, 'Alleato');
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


test('corregge un genere storico incompatibile con un’ambientazione moderna', () => {
    const genres = { fantasy: {}, contemporary: {}, historical: {}, crime: {} };
    assert.equal(characterApi.resolveGenreKey({
        genre: 'historical',
        setting: 'Roma moderna, anno 2026'
    }, genres), 'contemporary');
    assert.equal(characterApi.resolveGenreKey({
        genre: 'crime',
        setting: 'Thriller criminale nella Roma moderna'
    }, genres), 'crime');
});

test('seleziona personaggi storici coerenti con il periodo', () => {
    const genres = {
        fantasy: {},
        historical: { name: 'Storico', origins: {}, archetypes: {}, items: {} }
    };
    const ancient = characterApi.getGenreConfig(genres, {
        genre: 'historical', setting: 'Antica Roma imperiale'
    });
    const industrial = characterApi.getGenreConfig(genres, {
        genre: 'historical', setting: 'Londra vittoriana durante la rivoluzione industriale'
    });
    assert.equal(ancient.eraKey, 'ancient');
    assert.equal(ancient.archetypes.centurion.name, 'Centurione');
    assert.equal(industrial.eraKey, 'industrial');
    assert.equal(industrial.archetypes.centurion, undefined);
    assert.equal(industrial.archetypes.engineer.name, 'Ingegnere');
});

test('amplia le scelte contemporanee oltre le opzioni di base', () => {
    const genres = {
        fantasy: {},
        contemporary: {
            name: 'Contemporaneo',
            origins: { student: { name: 'Studente' } },
            archetypes: { coder: { name: 'Sviluppatore' } },
            items: {}
        }
    };
    const config = characterApi.getGenreConfig(genres, {
        genre: 'contemporary', setting: 'Milano moderna'
    });
    const summary = characterApi.getChoiceSummary(config);
    assert.ok(summary.origins >= 6);
    assert.ok(summary.archetypes >= 7);
    assert.ok(config.archetypes.medic);
    assert.ok(config.archetypes.investigator);
});

test('genera una dotazione iniziale diversa per origine e ruolo', () => {
    const genres = {
        fantasy: {},
        contemporary: {
            name: 'Contemporaneo',
            origins: {},
            archetypes: {},
            items: {},
            starterInventory: [{ name: 'Portafoglio', icon: '👛' }]
        }
    };
    const config = characterApi.getGenreConfig(genres, {
        genre: 'contemporary', setting: 'Giorni nostri'
    });
    const medic = characterApi.getStarterInventory(config, 'graduate', 'medic');
    const journalist = characterApi.getStarterInventory(config, 'graduate', 'journalist');
    assert.ok(medic.some(item => item.name === 'Kit di Pronto Soccorso'));
    assert.ok(journalist.some(item => item.name === 'Registratore Digitale'));
    assert.ok(medic.some(item => item.name === 'Computer Portatile'));
    assert.notDeepEqual(medic.map(item => item.name), journalist.map(item => item.name));
});

test('non duplica gli oggetti condivisi tra origine e ruolo', () => {
    const config = {
        origins: { worker: { kit: ['phone'] } },
        archetypes: { manager: { kit: ['phone'] } },
        items: { phone: { name: 'Telefono', icon: '📱' } },
        starterInventory: []
    };
    const inventory = characterApi.getStarterInventory(config, 'worker', 'manager');
    assert.equal(inventory.length, 1);
    assert.equal(inventory[0].count, 1);
});


function initializeBusinessForTest(business, options = {}) {
    const product = businessApi.addProduct(business, {
        name: options.productName || 'Prodotto narrativo',
        category: options.category || 'narrativo',
        salePrice: options.salePrice ?? 25,
        unitCost: options.unitCost ?? 8,
        stock: options.stock ?? 30,
        baseDemand: options.baseDemand ?? 10,
        reorderPoint: options.reorderPoint ?? 5,
        targetStock: options.targetStock ?? 30,
        source: 'narration'
    });
    businessApi.addProduct(business, {
        name: (options.productName || 'Prodotto narrativo') + ' secondario',
        category: options.category || 'narrativo',
        salePrice: (options.salePrice ?? 25) + 5,
        unitCost: options.unitCost ?? 8,
        stock: Math.max(options.stock ?? 30, (options.reorderPoint ?? 5) + 10),
        baseDemand: Math.max(1, (options.baseDemand ?? 10) - 2),
        reorderPoint: options.reorderPoint ?? 5,
        targetStock: options.targetStock ?? 30,
        source: 'narration'
    });
    const supplier = businessApi.addSupplier(business, {
        name: options.supplierName || 'Fornitore narrativo',
        category: options.supplierCategory || 'materie prime',
        reliability: options.reliability ?? 90,
        leadTurns: options.leadTurns ?? 2,
        source: 'narration'
    });
    product.supplierId = supplier.id;
    business.profileNarrative = true;
    business.narrativeEventRecorded = true;
    businessApi.refreshNarrativeInitialization(business, options.turn || 0);
    return { product, supplier };
}

test('riconosce imprese e negozi tra le proprietà possedute', () => {
    assert.equal(businessApi.isBusinessProperty({ type: 'business', name: 'Holding' }), true);
    assert.equal(businessApi.isBusinessProperty({ type: 'building', name: 'Emporio Rossi' }), true);
    assert.equal(businessApi.isBusinessProperty({ type: 'building', name: 'Casa di famiglia' }), false);
});

test('sincronizza le attività senza creare duplicati', () => {
    const property = { id: 7, name: 'Bottega Blu', type: 'business', income: 50 };
    let management = businessApi.syncProperties(null, [property], 3);
    management = businessApi.syncProperties(management, [property], 4);
    assert.equal(management.businesses.length, 1);
    assert.equal(management.activeBusinessId, management.businesses[0].id);
    assert.equal(management.businesses[0].products.length, 0);
    assert.equal(management.businesses[0].suppliers.length, 0);
    assert.equal(management.businesses[0].narrativeInitialized, false);
    assert.equal(property.managementEnabled, true);
});

test('mantiene pending un bootstrap incompleto e blocca il periodo economico', () => {
    let management = businessApi.syncProperties(null, [{ id: 71, name: 'Locanda Nuova', type: 'business' }], 0);
    let business = management.businesses[0];
    assert.throws(() => businessApi.runPeriod(business, {}, () => 0.5), /inizializzata dalla storia/);

    // Profilo e catalogo senza fornitore non sono sufficienti.
    let outcome = businessApi.applyNarrativeEvents(management, [
        { type: 'profile', businessName: 'Locanda Nuova', businessType: 'ristorazione', cash: 100, reputation: 45, satisfaction: 60, status: 'active', description: 'Locanda appena riaperta' },
        { type: 'catalogProduct', businessName: 'Locanda Nuova', productName: 'Zuppa calda', category: 'cucina', salePrice: 6, unitCost: 2, stock: 8, demand: 5, reorderPoint: 2 }
    ], { turn: 1, currency: 'monete' });
    management = outcome.management;
    assert.equal(management.businesses[0].narrativeInitialized, false);

    // Seconda voce, fornitore ed evento completano il bootstrap senza duplicare il catalogo.
    outcome = businessApi.applyNarrativeEvents(management, [
        { type: 'catalogProduct', businessName: 'Locanda Nuova', productName: 'Pane rustico', category: 'cucina', salePrice: 3, unitCost: 1, stock: 12, demand: 7, reorderPoint: 3 },
        { type: 'supplier', businessName: 'Locanda Nuova', supplierName: 'Fattoria Bianchi', category: 'ortaggi', reliability: 80, leadTurns: 1 },
        { type: 'note', businessName: 'Locanda Nuova', text: 'La locanda riapre le porte al villaggio' }
    ], { turn: 2, currency: 'monete' });
    business = outcome.management.businesses[0];
    assert.equal(business.narrativeInitialized, true);
    assert.equal(business.products.length, 2);
    assert.equal(business.suppliers.length, 1);
});

test('accetta prezzi e quantità narrativi con virgole, simboli e unità', () => {
    assert.equal(businessApi.parseNarrativeNumber('12,50 fiorini'), 12.5);
    assert.equal(businessApi.parseNarrativeNumber('80%'), 80);
    assert.equal(businessApi.parseNarrativeNumber('+ 5 unità'), 5);
    assert.equal(businessApi.parseNarrativeNumber('1.250,50 fiorini'), 1250.5);
    assert.equal(businessApi.parseNarrativeNumber('10.000 monete'), 10000);
    assert.equal(businessApi.parseNarrativeNumber('nessun valore'), null);

    const management = businessApi.syncProperties(null, [
        { id: 72, name: 'Ortofrutta dei Rossi', type: 'business' }
    ], 0);
    const outcome = businessApi.applyNarrativeEvents(management, [{
        type: 'catalogProduct',
        businessName: 'Ortofrutta dei Rossi',
        productName: 'Pomodori San Marzano',
        category: 'verdura fresca',
        salePrice: '3,50 €/kg',
        unitCost: '1,20 euro',
        stock: '24 kg',
        demand: '8 al giorno',
        reorderPoint: '6 kg'
    }], { turn: 1, currency: 'euro' });
    assert.equal(outcome.results[0].ok, true);
    assert.equal(outcome.management.businesses[0].products[0].salePrice, 3.5);
    assert.equal(outcome.management.businesses[0].products[0].unitCost, 1.2);
    assert.equal(outcome.management.businesses[0].products[0].stock, 24);
});

test('recupera un catalogo concreto quando l’LLM omette valori gestionali secondari', () => {
    const management = businessApi.syncProperties(null, [
        { id: 73, name: 'Emporio Rossi', type: 'business' }
    ], 0);
    const outcome = businessApi.applyNarrativeEvents(management, [{
        type: 'catalogProduct',
        businessName: 'Emporio Rossi',
        productName: 'Nokia 3310',
        category: 'telefonia',
        salePrice: '45 euro',
        unitCost: '',
        stock: '12 unità',
        demand: '',
        reorderPoint: ''
    }], { turn: 1, currency: 'euro' });
    const product = outcome.management.businesses[0].products[0];
    assert.equal(outcome.results[0].ok, true);
    assert.equal(product.name, 'Nokia 3310');
    assert.equal(product.stock, 12);
    assert.equal(product.unitCost, 22.5);
    assert.ok(product.baseDemand > 0);
    assert.ok(product.reorderPoint > 0);
});

test('migra e limita lo storico gestionale', () => {
    const migrated = businessApi.migrateManagement({
        customField: 42,
        businesses: [{
            id: 'shop',
            name: 'Negozio',
            history: Array.from({ length: 40 }, (_, index) => ({ period: index })),
            transactions: Array.from({ length: 160 }, (_, index) => ({ id: index }))
        }]
    });
    assert.equal(migrated.customField, 42);
    assert.equal(migrated.businesses[0].history.length, businessApi.MAX_HISTORY);
    assert.equal(migrated.businesses[0].transactions.length, businessApi.MAX_TRANSACTIONS);
    assert.equal(migrated.schemaVersion, 2);
});

test('considera inizializzati i salvataggi legacy con dati gestionali reali', () => {
    const migrated = businessApi.migrateManagement({
        schemaVersion: 1,
        businesses: [{
            id: 'legacy-shop', name: 'Vecchio Emporio', cash: 100,
            products: [{ id: 'p1', name: 'Farina', stock: 5, salePrice: 3, unitCost: 1 }],
            suppliers: [{ id: 's1', name: 'Mulino Rossi', category: 'farina', status: 'active' }]
        }]
    });
    assert.equal(migrated.businesses[0].narrativeInitialized, true);
    assert.equal(migrated.businesses[0].profileNarrative, true);
});

test('ordina scorte, usa la cassa e consegna nei turni successivi', () => {
    const business = businessApi.createBusinessFromProperty({
        id: 3, name: 'Emporio', type: 'business', businessCash: 1000
    }, 5);
    const { product, supplier } = initializeBusinessForTest(business, {
        productName: 'Merce emporio', supplierName: 'Grossista Centro', stock: 20,
        leadTurns: 2, reliability: 100
    });
    const beforeCash = business.cash;
    const beforeStock = product.stock;
    const order = businessApi.placeOrder(business, {
        productId: product.id, supplierId: supplier.id, quantity: 10
    }, 5);
    assert.equal(order.status, 'pending');
    assert.ok(business.cash < beforeCash);
    businessApi.processDeliveries({ businesses: [business] }, 6, () => 0);
    assert.equal(product.stock, beforeStock);
    businessApi.processDeliveries({ businesses: [business] }, 7, () => 0);
    assert.equal(product.stock, beforeStock + 10);
    assert.equal(order.status, 'delivered');
});

test('calcola vendite, margine, stipendi e risultato del periodo', () => {
    const property = {
        id: 4, name: 'Officina Aurora', type: 'business',
        maintenanceCost: 20, businessCash: 500
    };
    const business = businessApi.createBusinessFromProperty(property, 0);
    initializeBusinessForTest(business, { stock: 100, baseDemand: 20, salePrice: 25, unitCost: 8 });
    const report = businessApi.runPeriod(business, {
        properties: [property],
        employees: [{
            id: 1, name: 'Luca', property: 'Officina Aurora',
            status: 'active', salary: 40, skill: 80, morale: 80
        }],
        turn: 10
    }, () => 0.5);
    assert.ok(report.revenue > 0);
    assert.equal(report.payroll, 40);
    assert.equal(report.overhead, 20);
    assert.equal(report.grossProfit, report.revenue - report.cogs);
    assert.equal(report.netProfit, report.grossProfit - report.operatingCosts);
    assert.equal(property.income, report.netProfit);
    assert.equal(business.history.length, 1);
});

test('chiude automaticamente il periodo quando l’attività matura i turni necessari', () => {
    const property = { id: 41, name: 'Negozio Automatico', type: 'business', businessCash: 100 };
    const business = businessApi.createBusinessFromProperty(property, 0);
    initializeBusinessForTest(business, { stock: 50, baseDemand: 10, salePrice: 12, unitCost: 4 });
    business.settings.periodTurns = 3;
    const result = businessApi.processPeriods({ businesses: [business] }, {
        properties: [property], employees: [], turn: 3
    }, () => 0.5);
    assert.equal(result.reports.length, 1);
    assert.ok(result.reports[0].report.revenue > 0);
    assert.equal(result.management.businesses[0].period, 1);
    assert.ok(result.management.businesses[0].cash > 100);
    assert.equal(businessApi.processPeriods(result.management, {
        properties: [property], employees: [], turn: 3
    }, () => 0.5).reports.length, 0, 'non deve chiudere due volte lo stesso periodo');
});

test('evidenzia prodotti sotto scorta e ordini aperti', () => {
    const business = businessApi.createBusinessFromProperty({
        id: 5, name: 'Negozio Centro', type: 'business'
    }, 0);
    const { product } = initializeBusinessForTest(business, { stock: 5, reorderPoint: 5 });
    product.stock = product.reorderPoint;
    const report = businessApi.getReport(business, []);
    assert.equal(report.lowStock.length, 1);
    assert.equal(report.inventoryValue, businessApi.inventoryValue(business));
});

test('trasferisce capitale tra proprietario e cassa aziendale', () => {
    const business = businessApi.createBusinessFromProperty({
        id: 6, name: 'Agenzia Nova', type: 'business', businessCash: 300
    }, 0);
    const character = { gold: 500 };
    businessApi.transferFunds(business, character, 100, 'toBusiness');
    assert.equal(character.gold, 400);
    assert.equal(business.cash, 400);
    businessApi.transferFunds(business, character, 50, 'toOwner');
    assert.equal(character.gold, 450);
    assert.equal(business.cash, 350);
    assert.equal(business.transactions.length, 2);
});

test('gestisce prodotti, fornitori e clienti senza duplicare i nomi', () => {
    const business = businessApi.createBusinessFromProperty({
        id: 8, name: 'Studio Alfa', type: 'business'
    }, 0);
    const product = businessApi.addProduct(business, { name: 'Consulenza Premium', salePrice: 100, unitCost: 20 });
    businessApi.addProduct(business, { name: 'Consulenza Premium', salePrice: 120, unitCost: 25 });
    const supplier = businessApi.addSupplier(business, { name: 'Servizi Beta', reliability: 90 });
    businessApi.addSupplier(business, { name: 'Servizi Beta', reliability: 95 });
    const customer = businessApi.addCustomer(business, { name: 'Cliente Uno', loyalty: 45 });
    businessApi.addCustomer(business, { name: 'Cliente Uno', loyalty: 60 });
    assert.equal(business.products.filter(item => item.name === product.name).length, 1);
    assert.equal(business.suppliers.filter(item => item.name === supplier.name).length, 1);
    assert.equal(business.customers.filter(item => item.name === customer.name).length, 1);
    assert.equal(business.products.find(item => item.id === product.id).salePrice, 120);
    assert.equal(business.customers.find(item => item.id === customer.id).loyalty, 60);
});


test('applica il bootstrap e gli eventi narrati dell’LLM ai numeri reali', () => {
    const property = { id: 9, name: 'Taverna del Sole', type: 'business', businessCash: 0 };
    let management = businessApi.syncProperties(null, [property], 3);
    assert.equal(management.businesses[0].narrativeInitialized, false);

    // La prima scena definisce assetto, catalogo e filiera: niente placeholder locali.
    let outcome = businessApi.applyNarrativeEvents(management, [
        { type: 'profile', businessName: 'Taverna del Sole', businessType: 'ristorazione', cash: 500, reputation: 50, satisfaction: 65, status: 'active', description: 'Taverna di quartiere ereditata' },
        { type: 'catalogProduct', businessName: 'Taverna del Sole', productName: 'Birra della casa', category: 'bevande', salePrice: 3, unitCost: 1, stock: 20, demand: 12, reorderPoint: 5 },
        { type: 'catalogProduct', businessName: 'Taverna del Sole', productName: 'Stufato del giorno', category: 'cucina', salePrice: 8, unitCost: 3, stock: 10, demand: 7, reorderPoint: 3 },
        { type: 'supplier', businessName: 'Taverna del Sole', supplierName: 'Cantina dei Colli', category: 'vini', reliability: 88, leadTurns: 2 },
        { type: 'note', businessName: 'Taverna del Sole', text: 'La taverna apre per la prima volta sotto la nuova gestione' }
    ], { turn: 4, currency: 'monete' });
    management = outcome.management;
    const initialized = management.businesses[0];
    assert.equal(outcome.results.every(result => result.ok), true);
    assert.equal(initialized.narrativeInitialized, true);
    assert.equal(initialized.products.length, 2);
    assert.equal(initialized.suppliers.length, 1);
    assert.equal(initialized.cash, 500);
    assert.ok(initialized.products.every(product => product.source === 'narration'));

    // LLM narra una vendita: scorte diminuiscono, cassa aumenta, transazione registrata.
    const before = { cash: initialized.cash, stock: initialized.products[0].stock };
    outcome = businessApi.applyNarrativeEvents(management, [{
        type: 'sale', businessName: 'Taverna del Sole', product: 'Birra della casa', qty: 4, price: 3
    }], { turn: 4, currency: 'monete' });
    management = outcome.management;
    const after = management.businesses[0];
    assert.equal(after.cash, before.cash + 12);
    assert.equal(after.products[0].stock, before.stock - 4);
    assert.ok(after.transactions.some(tx => tx.category === 'vendite'));

    outcome = businessApi.applyNarrativeEvents(management, [
        { type: 'restock', businessName: 'Taverna del Sole', product: 'Birra della casa', qty: 10, cost: 15 },
        { type: 'reputation', businessName: 'Taverna del Sole', delta: 3, reason: 'cliente soddisfatto' },
        { type: 'note', businessName: 'Taverna del Sole', text: 'Ispezione della sala: tutto in ordine' }
    ], { turn: 5, currency: 'monete' });
    const b = outcome.management.businesses[0];
    assert.equal(outcome.results.every(result => result.ok), true);
    assert.equal(b.reputation, 53);
    assert.equal(b.notes[b.notes.length - 1].text, 'Ispezione della sala: tutto in ordine');
});

test('il contesto LLM richiede il bootstrap e poi espone solo dati narrativi reali', () => {
    const property = { id: 11, name: 'Emporio Mercanti', type: 'business', businessCash: 0, description: 'Emporio appena ereditato' };
    const management = businessApi.syncProperties(null, [property], 2);
    const pending = businessApi.buildNarrativeContext(management, [], 2, 'monete');
    assert.ok(pending.includes('ATTIVITÀ GESTITE'));
    assert.ok(pending.includes('Emporio Mercanti'));
    assert.ok(pending.includes('CONFIGURAZIONE NARRATIVA IN CORSO'));
    assert.ok(pending.includes('[ATTIVITA_NEGOZIO]'));
    assert.ok(pending.includes('[CATALOGO_NEGOZIO]'));
    assert.equal(pending.includes('Articolo principale'), false);
    assert.equal(pending.includes('Fornitore di Emporio Mercanti'), false);

    const initialized = businessApi.applyNarrativeEvents(management, [
        { type: 'profile', businessName: 'Emporio Mercanti', businessType: 'commercio', cash: 800, reputation: 55, satisfaction: 60, status: 'active', description: 'Emporio di spezie e tessuti' },
        { type: 'catalogProduct', businessName: 'Emporio Mercanti', productName: 'Spezie orientali', category: 'spezie', salePrice: 20, unitCost: 8, stock: 12, demand: 7, reorderPoint: 4 },
        { type: 'catalogProduct', businessName: 'Emporio Mercanti', productName: 'Tessuto damascato', category: 'tessuti', salePrice: 35, unitCost: 16, stock: 6, demand: 4, reorderPoint: 2 },
        { type: 'supplier', businessName: 'Emporio Mercanti', supplierName: 'Carovana Safir', category: 'spezie', reliability: 85, leadTurns: 3 },
        { type: 'note', businessName: 'Emporio Mercanti', text: 'L’emporio espone il nuovo catalogo sulla piazza' }
    ], { turn: 2, currency: 'monete' });
    const ready = businessApi.buildNarrativeContext(initialized.management, [], 2, 'monete');
    assert.ok(ready.includes('Spezie orientali'));
    assert.ok(ready.includes('Carovana Safir'));
    assert.equal(ready.includes('CONFIGURAZIONE NARRATIVA IN CORSO'), false);
    assert.equal(businessApi.buildNarrativeContext(businessApi.createDefaultManagement(), [], 0, 'monete'), '');
});

test('rifiuta eventi narrati su attività o prodotti inesistenti', () => {
    const management = businessApi.syncProperties(null, [{ id: 12, name: 'Bottega', type: 'business' }], 0);
    const outcome = businessApi.applyNarrativeEvents(management, [{
        type: 'sale', businessName: 'Negozio inesistente', product: 'Niente', qty: 1, price: 1
    }], { turn: 1, currency: 'monete' });
    assert.equal(outcome.results[0].ok, false);
});

test('rifiuta bootstrap generici o indirizzati all’attività sbagliata e deduplica le vendite', () => {
    let management = businessApi.syncProperties(null, [
        { id: 121, name: 'Emporio A', type: 'business' },
        { id: 122, name: 'Emporio B', type: 'business' }
    ], 0);
    let outcome = businessApi.applyNarrativeEvents(management, [
        { type: 'profile', businessName: 'Nome errato', businessType: 'commercio', cash: 100, reputation: 50, satisfaction: 60, status: 'active', description: 'Negozio' },
        { type: 'catalogProduct', businessName: 'Emporio A', productName: 'Articolo principale', category: 'generico', salePrice: 10, unitCost: 2, stock: 5, demand: 3, reorderPoint: 1 },
        { type: 'catalogProduct', businessName: 'Emporio A', productName: 'Prodotto standard', category: 'generico', salePrice: 10, unitCost: 2, stock: 5, demand: 3, reorderPoint: 1 },
        { type: 'catalogProduct', businessName: 'Emporio A', productName: 'Merce generica', category: 'generico', salePrice: 10, unitCost: 2, stock: 5, demand: 3, reorderPoint: 1 },
        { type: 'supplier', businessName: 'Emporio A', supplierName: 'Fornitore generico', category: 'generico', reliability: 70, leadTurns: 2 },
        { type: 'customer', businessName: 'Emporio A', customerName: 'Mario', segment: '', loyalty: 'non-numero', satisfaction: '' },
        { type: 'cash', businessName: 'Emporio A', direction: 'banana', amount: 25, reason: 'malformato' }
    ], { turn: 1, currency: 'monete' });
    assert.equal(outcome.results.every(result => result.ok), false);
    assert.equal(outcome.management.businesses[0].narrativeInitialized, false);
    assert.equal(outcome.management.businesses[1].profileNarrative, false);
    assert.equal(outcome.management.businesses[0].products.length, 0);
    assert.equal(outcome.management.businesses[0].suppliers.length, 0);
    assert.equal(outcome.management.businesses[0].customers.length, 0);
    assert.equal(outcome.management.businesses[0].cash, 0);

    const business = outcome.management.businesses[0];
    initializeBusinessForTest(business, { productName: 'Farina scelta', stock: 10, salePrice: 4 });
    management = outcome.management;
    const sale = { type: 'sale', businessName: 'Emporio A', product: 'Farina scelta', qty: 2, price: 4 };
    outcome = businessApi.applyNarrativeEvents(management, [sale], { turn: 2, currency: 'monete' });
    const cashAfterFirst = outcome.management.businesses[0].cash;
    const transactionsAfterFirst = outcome.management.businesses[0].transactions.length;
    outcome = businessApi.applyNarrativeEvents(outcome.management, [sale], { turn: 2, currency: 'monete' });
    assert.equal(outcome.management.businesses[0].cash, cashAfterFirst);
    assert.equal(outcome.management.businesses[0].transactions.length, transactionsAfterFirst);
    assert.equal(outcome.results[0].skipped, true);
});

test('modifica e rimuove prodotti, fornitori e clienti dal motore gestionale', () => {
    const property = { id: 14, name: 'Emporio Sole', type: 'business', businessCash: 200 };
    const business = businessApi.createBusinessFromProperty(property, 0);
    const { product } = initializeBusinessForTest(business, { productName: 'Spezie', supplierName: 'Cantina' });
    businessApi.addCustomer(business, { name: 'Bernardo', loyalty: 40 });

    // Prodotti: toggle attivo, modifica scorte, rimuovi
    assert.equal(businessApi.setProductActive(business, product.id, false).active, false);
    const stockBefore = product.stock;
    businessApi.adjustProductStock(business, product.id, 5);
    assert.equal(product.stock, stockBefore + 5);
    assert.equal(businessApi.removeProduct(business, product.id), true);
    assert.equal(business.products.some(p => p.id === product.id), false);

    // Fornitori: aggiorna campi e rimuovi
    const supplier = business.suppliers.find(s => s.name === 'Cantina');
    businessApi.updateSupplier(business, supplier.id, { reliability: 90, discount: 10, leadTurns: 3, status: 'inactive' });
    assert.equal(supplier.reliability, 90);
    assert.equal(supplier.discount, 10);
    assert.equal(supplier.status, 'inactive');
    assert.equal(businessApi.removeSupplier(business, supplier.id), true);
    assert.equal(business.suppliers.some(s => s.id === supplier.id), false);

    // Clienti: aggiorna campi e rimuovi
    const customer = business.customers.find(c => c.name === 'Bernardo');
    businessApi.updateCustomer(business, customer.id, { loyalty: 75, satisfaction: 80, notes: 'Fisso' });
    assert.equal(customer.loyalty, 75);
    assert.equal(customer.satisfaction, 80);
    assert.equal(customer.notes, 'Fisso');
    assert.equal(businessApi.removeCustomer(business, customer.id), true);
    assert.equal(business.customers.some(c => c.id === customer.id), false);

    // Funzioni su ID inesistente lanciano / restituiscono false
    assert.throws(() => businessApi.setProductActive(business, 'nope', true), /Prodotto non trovato/);
    assert.equal(businessApi.removeProduct(business, 'nope'), false);
});

test('fornitori e clienti sono generati e aggiornati dalla narrazione dell’LLM', () => {
    const property = { id: 13, name: 'Taverna del Lupo', type: 'business', businessCash: 300 };
    let management = businessApi.syncProperties(null, [property], 1);
    const biz0 = management.businesses[0];
    assert.equal(biz0.suppliers.length, 0); // nessun placeholder: la filiera nasce dalla storia
    assert.equal(biz0.products.length, 0);
    // LLM narra un fornitore concreto: un cantiniere affidabile con sconto
    let outcome = businessApi.applyNarrativeEvents(management, [{
        type: 'supplier', businessName: 'Taverna del Lupo',
        supplierName: 'Cantina dei Colli', category: 'vini',
        reliability: 88, leadTurns: 2, discount: 5, status: 'active',
        notes: 'Fornisce birra e vino locale'
    }], { turn: 2, currency: 'monete' });
    management = outcome.management;
    const biz = management.businesses[0];
    assert.equal(outcome.results[0].ok, true);
    const cantiniere = biz.suppliers.find(s => s.name === 'Cantina dei Colli');
    assert.ok(cantiniere, 'il fornitore narrato deve essere registrato');
    assert.equal(cantiniere.category, 'vini');
    assert.equal(cantiniere.reliability, 88);
    assert.equal(cantiniere.discount, 5);
    // Riemettere lo stesso nome aggiorna i dati senza duplicare
    outcome = businessApi.applyNarrativeEvents(management, [{
        type: 'supplier', businessName: 'Taverna del Lupo',
        supplierName: 'Cantina dei Colli', reliability: 92
    }], { turn: 3, currency: 'monete' });
    management = outcome.management;
    assert.equal(management.businesses[0].suppliers.filter(s => s.name === 'Cantina dei Colli').length, 1);
    assert.equal(management.businesses[0].suppliers.find(s => s.name === 'Cantina dei Colli').reliability, 92);

    // LLM narra un cliente notevole: un mercante con soddisfazione e note
    outcome = businessApi.applyNarrativeEvents(management, [{
        type: 'customer', businessName: 'Taverna del Lupo',
        customerName: 'Bernardo dei Mari', segment: 'mercante',
        loyalty: 55, satisfaction: 80, notes: 'Cliente fisso del giovedì'
    }], { turn: 3, currency: 'monete' });
    management = outcome.management;
    const bernardo = management.businesses[0].customers.find(c => c.name === 'Bernardo dei Mari');
    assert.ok(bernardo, 'il cliente narrato deve essere registrato');
    assert.equal(bernardo.segment, 'mercante');
    assert.equal(bernardo.loyalty, 55);
    assert.equal(bernardo.satisfaction, 80);
    assert.equal(bernardo.notes, 'Cliente fisso del giovedì');

    // Il contesto narrativo riflette i fornitori e clienti nominati
    const ctx = businessApi.buildNarrativeContext(management, [], 3, 'monete');
    assert.ok(ctx.includes('Cantina dei Colli'));
    assert.ok(ctx.includes('Bernardo dei Mari'));
});

test('crea e aggiorna anagrafiche gestionali con valori narrativi realistici', () => {
    let management = businessApi.syncProperties(null, [
        { id: 16, name: 'Frutta e Verdura Aurora', type: 'business' }
    ], 1);
    const employees = [];

    let outcome = businessApi.applyNarrativeEvents(management, [
        {
            type: 'customer', businessName: 'Frutta e Verdura Aurora',
            customerName: 'Lucia Serra', segment: 'abituale', loyalty: '65%',
            notes: 'Compra ogni mattina'
        },
        {
            type: 'supplier', businessName: 'Frutta e Verdura Aurora',
            supplierName: 'Azienda Agricola Piras', category: 'ortaggi',
            reliability: '88%', leadTurns: '2 turni', discount: '5%'
        },
        {
            type: 'employee', businessName: 'Frutta e Verdura Aurora',
            employeeName: 'Marco Lai', role: 'commesso', salary: '45 euro',
            skill: '62%', morale: '74%', status: 'active', description: 'Addetto al banco'
        }
    ], { turn: 2, currency: 'euro', employees });

    management = outcome.management;
    assert.equal(outcome.results.every(result => result.ok), true);
    assert.equal(management.businesses[0].customers[0].name, 'Lucia Serra');
    assert.equal(management.businesses[0].customers[0].loyalty, 65);
    assert.equal(management.businesses[0].customers[0].satisfaction, 60);
    assert.equal(management.businesses[0].suppliers[0].reliability, 88);
    assert.equal(management.businesses[0].suppliers[0].leadTurns, 2);
    assert.equal(outcome.employees.length, 1);
    assert.equal(outcome.employees[0].salary, 45);

    outcome = businessApi.applyNarrativeEvents(management, [
        {
            type: 'customer', businessName: 'Frutta e Verdura Aurora',
            customerName: 'Lucia Serra', loyalty: '78%', satisfaction: '91%'
        },
        {
            type: 'supplier', businessName: 'Frutta e Verdura Aurora',
            supplierName: 'Azienda Agricola Piras', reliability: '94%'
        },
        {
            type: 'employee', businessName: 'Frutta e Verdura Aurora',
            employeeName: 'Marco Lai', morale: '86%', description: 'Promosso capoturno'
        }
    ], { turn: 3, currency: 'euro', employees: outcome.employees });

    const business = outcome.management.businesses[0];
    assert.equal(business.customers.length, 1);
    assert.equal(business.customers[0].loyalty, 78);
    assert.equal(business.suppliers.length, 1);
    assert.equal(business.suppliers[0].reliability, 94);
    assert.equal(outcome.employees.length, 1);
    assert.equal(outcome.employees[0].morale, 86);
    assert.equal(outcome.employees[0].salary, 45, 'un aggiornamento parziale non deve azzerare lo stipendio');
    assert.equal(outcome.employees[0].skill, 62, 'un aggiornamento parziale non deve reimpostare la competenza');
    const context = businessApi.buildNarrativeContext(outcome.management, outcome.employees, 3, 'euro');
    assert.ok(context.includes('Marco Lai'));
    assert.ok(context.includes('Promosso capoturno'));
    assert.ok(context.includes('Azienda Agricola Piras'));
    assert.ok(context.includes('Lucia Serra'));
});

test('registra e aggiorna contratti narrativi senza duplicarli', () => {
    let management = businessApi.syncProperties(null, [
        { id: 17, name: 'Banco Aurora', type: 'business' }
    ], 1);
    let outcome = businessApi.applyNarrativeEvents(management, [{
        type: 'contract', businessName: 'Banco Aurora', title: 'Fornitura settimanale',
        kind: 'fornitura', counterpartyType: 'fornitore', counterpartyName: 'Orto dei Fratelli',
        amount: '240 euro', frequency: 'settimanale', status: 'active', notes: 'Consegna del lunedì'
    }], { turn: 2, currency: 'euro', employees: [] });
    management = outcome.management;
    assert.equal(outcome.results[0].ok, true);
    assert.equal(management.businesses[0].contracts.length, 1);
    assert.equal(management.businesses[0].contracts[0].amount, 240);

    outcome = businessApi.applyNarrativeEvents(management, [{
        type: 'contract', businessName: 'Banco Aurora', title: 'Fornitura settimanale',
        counterpartyName: 'Orto dei Fratelli', amount: '260 euro', status: 'paused'
    }], { turn: 3, currency: 'euro', employees: [] });
    management = outcome.management;
    assert.equal(outcome.results[0].ok, true);
    assert.equal(management.businesses[0].contracts.length, 1);
    assert.equal(management.businesses[0].contracts[0].amount, 260);
    assert.equal(management.businesses[0].contracts[0].status, 'paused');
    assert.ok(businessApi.buildNarrativeContext(management, [], 3, 'euro').includes('Fornitura settimanale'));
});

test('valida le nuove assunzioni senza corrompere i dipendenti esistenti', () => {
    const employees = [];
    assert.throws(() => businessApi.upsertEmployee(employees, {
        name: 'Dipendente generico', property: 'Emporio', role: 'commesso',
        salary: 20, skill: 50, morale: 60
    }), /nome concreto/);
    assert.throws(() => businessApi.upsertEmployee(employees, {
        name: 'Anna', property: 'Emporio', role: 'commessa', salary: 20
    }), /incompleto/);
    assert.equal(employees.length, 0);
});

test('le modifiche manuali vengono registrate come eventi nella cronaca visibile all’LLM', () => {
    const property = { id: 15, name: 'Bottega Verde', type: 'business', businessCash: 100 };
    let management = businessApi.syncProperties(null, [property], 0);
    const business = management.businesses[0];
    // Simula due modifiche manuali e un evento narrato
    businessApi.addBusinessNote(business, '✋ prezzo di Articolo principale → 25', 1);
    businessApi.addBusinessNote(business, 'Vendita di 2 × Articolo principale', 2);
    businessApi.addBusinessNote(business, '✋ fornitore disattivato: Fornitore locale', 2);
    const ctx = businessApi.buildNarrativeContext(management, [], 2, 'monete');
    assert.ok(ctx.includes('cronaca recente'));
    assert.ok(ctx.includes('✋ prezzo di Articolo principale → 25'));
    assert.ok(ctx.includes('✋ fornitore disattivato: Fornitore locale'));
    assert.ok(ctx.includes('Vendita di 2 × Articolo principale'));
});

test('espone accessi visibili alla gestione del negozio', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /id="btn-business-manage"/);
    assert.match(html, /Gestisci negozio/);
    assert.match(html, /property-manage-business/);
    assert.match(html, /Inventario → Proprietà & Beni/);
    assert.match(html, /ATTIVITA_NEGOZIO/);
    assert.match(html, /CATALOGO_NEGOZIO/);
    assert.match(html, /INTEGRAZIONE ATTIVITÀ \(NON DEVE BLOCCARE LA NARRAZIONE\)/);
    assert.match(html, /Configurazione narrativa in corso/);
    assert.match(html, /preserveExisting: true/);
    assert.match(html, /businessResponse.*ANALISI/);
    assert.match(html, /parseAIResponse\(response, \{ isStart \}\)/);
    assert.match(html, /parseBusinessTags\(response, \{ deferEntries: true \}\)/);
    assert.match(html, /DIPENDENTE_NEGOZIO/);
    assert.match(html, /CONTRATTO_NEGOZIO/);
    assert.match(html, /VERBALE DI CONSEGNA/);
    assert.match(html, /beni che restano nel negozio.*LOOT_PROPRIETA/i);
    assert.match(html, /Distribuzioni Bianchi/);
    assert.match(html, /function enrichStarterProperty/);
    assert.match(html, /vecchio salvataggio riceve/);
    assert.match(html, /versione precedente dello starter salvava zero come cassa/i);
    assert.match(html, /LOOT_PROPRIETA viene letto prima dei tag gestionali/);
    assert.match(html, /outcome\.employees/);
    assert.match(html, /splitTagFields/);
    assert.match(html, /const businessEmployeeRe = .*DIPENDENTE_NEGOZIO/);
    assert.match(html, /const contractRe = .*CONTRATTO_NEGOZIO.*ACCORDO_NEGOZIO.*CONTRATTO/);
    assert.ok(
        html.indexOf('const hasNarrative = G.storyLog.some') <
        html.indexOf('if (management.businesses.length && !management.accessAnnounced)'),
        'il controllo di avvio deve precedere l’annuncio gestionale'
    );
});

test('collega tempo ed energia al motore deterministico', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /src="js\/time-energy\.js"/);
    assert.match(html, /CronacheTimeEnergy\.normalizeMinutes/);
    assert.match(html, /CronacheTimeEnergy\.parseTimeExpression/);
    assert.match(html, /advanceTime\(480, \{ resting: true \}\)/);
    assert.match(html, /case 'stamina': case 'energia': case 'energy'/);
    assert.equal(html.includes('const regenAmount = 3'), false, 'l’energia non deve rigenerarsi durante ogni azione');
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
