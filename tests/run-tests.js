'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const memoryApi = require('../js/memory-manager.js');
const worldBootstrapApi = require('../js/world-bootstrap.js');
const eventApi = require('../js/event-manager.js');
const timelineChatApi = require('../js/timeline-chat.js');
const timelineSimulatorApi = require('../js/timeline-simulator.js');
const strategicAdvisorApi = require('../js/strategic-advisor.js');
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
const kingdomApi = require('../js/kingdom-manager.js');
const storyGeneratorApi = require('../js/story-generator.js');
const packageMetadata = require('../package.json');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('migra la memoria legacy senza perdere i campi esistenti', () => {
    const legacy = { npcs: [{ name: 'Elara' }], events: [{ summary: 'Incontro' }], customField: 42 };
    const migrated = memoryApi.migrateMemory(legacy);
    assert.equal(migrated.memorySchemaVersion, 5);
    assert.equal(migrated.npcs[0].name, 'Elara');
    assert.equal(migrated.customField, 42);
    assert.deepEqual(migrated.factions, []);
    assert.deepEqual(migrated.revealedSecrets, []);
    assert.deepEqual(migrated.chats, []);
    assert.deepEqual(migrated.agreements, []);
    assert.deepEqual(migrated.pendingTimelineChoices, []);
    assert.deepEqual(migrated.world, {});
});

test('costruisce all’avvio un mondo persistente con luoghi, attori, fazioni e forze', () => {
    const response = [
        '[MONDO_SETUP: Astaria|Sei potenze competono per le rotte|Il trono è vacante|Una guerra può travolgere la popolazione]',
        '[CONTESTO_STORICO_SETUP: Anno 417 dell’Interregno|Daran|Consiglio oligarchico, Legione di frontiera e gilde portuali|La morte dell’ultimo sovrano ha aperto la successione|Legione e Consiglio competono per la nomina|Nessuna parte controlla insieme capitale, porto ed esercito|Ogni divergenza nasce dalle decisioni registrate]',
        '[LUOGO_SETUP: Khepra|capitale|Daran|Città sul Fiume Rosso|Consiglio di Daran|grano|rivolta|Porto Rosso, Frontiera]',
        '[LUOGO_SETUP: Porto Rosso|porto|Daran|Mercato delle rotte meridionali|Gilda dei Mercanti|navi|pirati|Khepra]',
        '[LUOGO_SETUP: Frontiera|confine|Daran|Terre contese tra fortezze|Legione|ferro|guerra|Khepra]',
        '[PERSONAGGIO_SETUP: Elara Vey|diplomatica|Consiglio di Daran|Ambasciatrice del consiglio|lucida e paziente|evitare la guerra|creare un’alleanza|rete diplomatica|72|alleata potenziale|active|Khepra]',
        '[PERSONAGGIO_SETUP: Varos Kain|generale|Legione|Comandante della frontiera|rigido e ambizioso|ottenere pieni poteri|provocare una crisi|esercito|81|diffidente|active|Frontiera]',
        '[PERSONAGGIO_SETUP: Mira Sol|mercante|Gilda dei Mercanti|Armatrice influente|pragmatica|proteggere le rotte|finanziare entrambe le parti|flotta commerciale|65|neutrale|active|Porto Rosso]',
        '[PERSONAGGIO_SETUP: Taren|informatore||Guida dei quartieri|ironico e prudente|vendere il segreto giusto|osservare tutti|informatori|48|amichevole|active|Khepra]',
        '[FAZIONE_SETUP: Consiglio di Daran|governo|Elara Vey|Governa la capitale|mantenere la pace|negoziare|leggi e diplomazia|75|neutrale|active|Khepra]',
        '[FAZIONE_SETUP: Legione|militare|Varos Kain|Difende il confine|espandere il potere|pressione militare|soldati e fortezze|82|diffidente|active|Frontiera]',
        '[RELAZIONE_SETUP: Consiglio di Daran|Legione|rivalità|25|78|Il governo teme un colpo di mano]',
        '[RELAZIONE_SETUP: Elara Vey|Mira Sol|cooperazione|62|28|Collaborano per mantenere aperto il porto]',
        '[FORZA_SETUP: Crisi di successione|Consiglio di Daran|trovare un nuovo equilibrio|20|80|active]'
    ].join('\n');
    const result = worldBootstrapApi.ingestResponse(response, {}, {
        story: { title: 'Cronache di Astaria', setting: 'Astaria' }, turn: 0
    });
    assert.equal(result.world.status, 'ready');
    assert.equal(result.world.actors.length, 4);
    assert.equal(result.world.factions.length, 2);
    assert.equal(result.world.locations.length, 3);
    assert.equal(result.world.relations[0].tension, 78);
    assert.match(result.world.historicalContext.politicalSystem, /Consiglio oligarchico/);
    assert.equal(worldBootstrapApi.needsHistoricalRepair(result.world), false);
    const memory = worldBootstrapApi.projectToMemory(result.world, memoryApi.createDefaultMemory(), { turn: 0 });
    assert.equal(memory.npcs.find(item => item.name === 'Varos Kain').goals, 'ottenere pieni poteri');
    assert.equal(memory.factions.find(item => item.name === 'Legione').leader, 'Varos Kain');
    assert.equal(memory.narrativeGoals[0].name, 'Crisi di successione');
});

test('garantisce un mondo minimo giocabile se il modello omette i tag iniziali', () => {
    const result = worldBootstrapApi.ingestResponse('La storia comincia.', {}, {
        story: { title: 'Il porto', setting: 'Trieste, 1984', desc: 'Una rete di doppi agenti.' },
        turn: 0,
        ensureMinimum: true
    });
    assert.equal(result.usedFallback, true);
    assert.equal(result.world.initialized, true);
    assert.ok(result.world.actors.length >= 4);
    assert.ok(result.world.factions.length >= 2);
    assert.ok(result.world.locations.length >= 3);
    assert.equal(worldBootstrapApi.needsHistoricalRepair(result.world), true);
});

test('sostituisce i segnaposto provvisori con un mondo storico-politico specifico', () => {
    const provisional = worldBootstrapApi.ensureMinimumWorld({}, {
        story: { title: 'Firenze contesa', setting: 'Firenze, 1520' }, turn: 0,
        source: 'timeline-recovery'
    });
    const response = [
        '[MONDO_SETUP: Repubblica fiorentina|Firenze difende la propria autonomia|Le istituzioni repubblicane fronteggiano la pressione medicea|Il controllo della Signoria]',
        '[CONTESTO_STORICO_SETUP: 12 luglio 1520|Firenze e contado|Signoria, Gonfaloniere e Consiglio degli Ottanta|La repubblica governa mentre i sostenitori dei Medici riorganizzano reti e credito|Pressione pontificia, rivalità tra ottimati e popolo minuto|Le cariche dipendono dai consigli e il tesoro è limitato|La storia diverge solo dopo mosse registrate]',
        '[LUOGO_SETUP: Palazzo Vecchio|sede politica|Firenze|Sede della Signoria|Signoria di Firenze|archivi|congiure|Mercato Vecchio, Porta Romana]',
        '[LUOGO_SETUP: Mercato Vecchio|mercato|Firenze|Centro del credito cittadino|Arti Maggiori|credito|serrate|Palazzo Vecchio]',
        '[LUOGO_SETUP: Porta Romana|porta|Contado|Accesso meridionale alla città|Otto di Guardia|dazi|infiltrazioni|Palazzo Vecchio]',
        '[PERSONAGGIO_SETUP: Niccolò Capponi|gonfaloniere|Signoria di Firenze|Magistrato repubblicano|prudente|difendere la repubblica|convocare i consigli|carica e reti patrizie|78|neutrale|active|Palazzo Vecchio|preservare le istituzioni|limitare i rivali ottimati|accesso alla Signoria|deve ottenere voti|conosce gli equilibri dei consigli|formare una maggioranza|magistrato fiorentino]',
        '[PERSONAGGIO_SETUP: Jacopo Gherardi|banchiere|Arte del Cambio|Finanziere degli ottimati|calcolatore|proteggere il credito|condizionare i prestiti|capitale e clienti|69|incerta|active|Mercato Vecchio|evitare il panico|ottenere concessioni fiscali|credito cittadino|dipende dalla fiducia|conosce debiti privati|negoziare garanzie|banchiere influente]',
        '[PERSONAGGIO_SETUP: Alessandra Macinghi|mercante|Arte della Lana|Rappresentante manifatturiera|diretta|tenere aperti i commerci|coordinare le botteghe|magazzini e maestranze|61|neutrale|active|Mercato Vecchio|difendere la produzione|ridurre i dazi|maestranze|teme serrate|conosce le scorte|formare un fronte delle arti|mercante cittadina]',
        '[PERSONAGGIO_SETUP: Bernardo Segni|segretario|Signoria di Firenze|Segretario dei consigli|analitico|evitare una congiura|incrociare dispacci|archivi e messaggeri|57|alleato potenziale|active|Palazzo Vecchio|proteggere il governo|scoprire il finanziatore dei rivali|informazioni|non comanda truppe|conosce i dispacci|identificare la rete medicea|funzionario repubblicano]',
        '[FAZIONE_SETUP: Signoria di Firenze|governo repubblicano|Niccolò Capponi|Magistratura cittadina|mantenere autonomia|voti e decreti|istituzioni|78|neutrale|active|Palazzo Vecchio|repubblicanesimo civico|68|nomine e leggi|maggioranze instabili]',
        '[FAZIONE_SETUP: Arte del Cambio|gilda finanziaria|Jacopo Gherardi|Controlla credito e cambi|proteggere capitale|prestiti selettivi|credito|72|incerta|active|Mercato Vecchio|oligarchia mercantile|64|liquidità|rischio di panico]',
        '[RELAZIONE_SETUP: Signoria di Firenze|Arte del Cambio|dipendenza conflittuale|42|63|Il governo necessita credito ma teme il ricatto finanziario]',
        '[RELAZIONE_SETUP: Niccolò Capponi|Jacopo Gherardi|negoziazione|38|58|Si cercano senza fidarsi]',
        '[FORZA_SETUP: Rete medicea|Arte del Cambio|ottenere appoggi nei consigli|35|76|active|Pressione degli esuli e dei creditori|Signoria di Firenze|La maggioranza della Signoria passa ai sostenitori medicei]'
    ].join('\n');
    const repaired = worldBootstrapApi.ingestResponse(response, provisional, {
        story: { title: 'Firenze contesa', setting: 'Firenze, 1520' }, turn: 1, source: 'historical-repair'
    });
    assert.equal(repaired.world.provisional, false);
    assert.equal(repaired.world.actors.some(item => worldBootstrapApi.isGenericActorName(item.name)), false);
    assert.equal(worldBootstrapApi.needsHistoricalRepair(repaired.world), false);
});

test('seleziona attori influenti e registra le loro mosse e interazioni', () => {
    let world = worldBootstrapApi.ensureMinimumWorld({}, {
        story: { title: 'Astaria', setting: 'Khepra' }, turn: 0
    });
    world.actors[0].name = 'Elara';
    world.actors[0].location = 'Palazzo';
    world.actors[0].influence = 40;
    world.actors[1].name = 'Varos';
    world.actors[1].location = 'Frontiera';
    world.actors[1].influence = 90;
    const selected = worldBootstrapApi.selectInfluences(world, { turn: 2, location: 'Palazzo', limit: 1 });
    assert.equal(selected[0].name, 'Elara', 'la presenza nella scena deve pesare oltre l’influenza remota');
    world = worldBootstrapApi.applyWorldMoves(world, [{ actor: 'Elara', action: 'Convoca il consiglio', status: 'working' }], 3);
    world = worldBootstrapApi.markInteraction(world, 'Elara', 3, 'Propone un patto');
    assert.equal(world.actors.find(item => item.name === 'Elara').lastMoveTurn, 3);
    assert.equal(world.actors.find(item => item.name === 'Elara').lastMove, 'Propone un patto');
});

test('i prompt collegano il mondo iniziale a timeline e conversazioni', () => {
    const startPrompt = worldBootstrapApi.buildBootstrapPrompt({ story: { title: 'Astaria', setting: 'Khepra' } });
    assert.match(startPrompt, /MONDO_SETUP/);
    assert.match(startPrompt, /6 PERSONAGGIO_SETUP/);
    assert.match(startPrompt, /CONTESTO_STORICO_SETUP/);
    assert.match(startPrompt, /Vietati segnaposto/);
    const world = worldBootstrapApi.ensureMinimumWorld({}, { story: { title: 'Astaria', setting: 'Khepra' } });
    const timelinePrompt = worldBootstrapApi.buildTimelinePrompt(world, { duration: 'un mese', turn: 4 });
    assert.match(timelinePrompt, /SIMULAZIONE CAUSALE/);
    assert.match(timelinePrompt, /EVENTO datati/);
    const interaction = worldBootstrapApi.buildInteractionPrompt(world, [world.actors[0].name]);
    assert.match(interaction, /obiettivo/i);
    assert.match(interaction, /strategia/i);
});

test('il simulatore dedicato impone un arco causale invece della sola routine', () => {
    const world = worldBootstrapApi.ensureMinimumWorld({}, {
        story: { title: 'Montefeltro', setting: 'Contea di Montefeltro' }, turn: 30
    });
    const prompt = timelineSimulatorApi.buildPrompt({
        story: { title: 'Montefeltro', setting: 'Contea di Montefeltro' },
        world,
        passage: {
            elapsed: timeEnergyApi.MINUTES_PER_MONTH,
            days: 30,
            description: '1 mese',
            summary: '30 notti di sonno e circa 90 pasti',
            startDate: '12 luglio 1520',
            endDate: '11 agosto 1520'
        },
        choices: []
    });
    assert.match(prompt, /esattamente 4 EVENTO/);
    assert.match(prompt, /una parte agisce, un'altra reagisce/i);
    assert.match(prompt, /non trasformarla in EVENTO/i);
    assert.match(prompt, /azione osservabile e risultato/i);
    assert.match(prompt, /\[CHAT:/);
});

test('un mese produce sempre eventi vivi distribuiti con attori e conseguenze', () => {
    const world = worldBootstrapApi.ensureMinimumWorld({}, {
        story: { title: 'Astaria', setting: 'Khepra' }, turn: 10
    });
    const arc = timelineSimulatorApi.ensureEventArc([], {
        story: { title: 'Astaria', setting: 'Khepra' },
        world,
        passage: { elapsed: timeEnergyApi.MINUTES_PER_MONTH, days: 30, description: '1 mese' },
        location: 'Khepra'
    });
    assert.equal(arc.events.length, 4);
    assert.equal(arc.fallbackAdded, 4);
    assert.ok(arc.events.every(event => event.actors.length >= 2));
    assert.ok(arc.events.every(event => event.summary.split('.').filter(Boolean).length >= 2));
    assert.ok(arc.events.every(event => event.consequence && /giorno \d+ di 30/i.test(event.occurredAt)));
    assert.match(arc.events[1].summary, new RegExp(arc.events[0].actors[0], 'i'));
    assert.equal(arc.events.some(event => /^Vita durante/i.test(event.title)), false);
});

test('completa i tag IA mancanti senza eliminare gli eventi validi', () => {
    const world = worldBootstrapApi.ensureMinimumWorld({}, {
        story: { title: 'Astaria', setting: 'Khepra' }, turn: 10
    });
    const existing = eventApi.normalizeEvent({
        type: 'politica', title: 'Il consiglio vota',
        summary: 'Il consiglio approva una tassa. I mercanti lasciano la sala in protesta.',
        actors: ['Consiglio', 'Mercanti'], consequence: 'I prezzi saliranno.',
        source: 'timeline-ai'
    });
    const arc = timelineSimulatorApi.ensureEventArc([existing], {
        story: { title: 'Astaria', setting: 'Khepra' }, world,
        passage: { days: 7, description: '1 settimana' }
    });
    assert.equal(arc.events.length, 3);
    assert.equal(arc.events[0].title, 'Il consiglio vota');
    assert.equal(arc.fallbackAdded, 2);
});

test('rifiuta eventi politici generici e mantiene soltanto attori specifici della storia', () => {
    const world = worldBootstrapApi.migrateWorld({
        name: 'Firenze', setting: 'Firenze, 1520', initialized: true,
        historicalContext: {
            date: '12 luglio 1520', region: 'Firenze', politicalSystem: 'Signoria e Consiglio degli Ottanta',
            baseline: 'La repubblica difende la propria autonomia', activeTensions: 'Credito e influenza medicea'
        },
        actors: [
            { name: 'Niccolò Capponi', role: 'gonfaloniere', goal: 'difendere la Signoria', strategy: 'convocare il consiglio', resources: 'carica e voti', influence: 80 },
            { name: 'Jacopo Gherardi', role: 'banchiere', goal: 'condizionare il governo', strategy: 'limitare il credito', resources: 'capitale', influence: 70 },
            { name: 'Bernardo Segni', role: 'segretario', goal: 'scoprire la congiura', strategy: 'incrociare dispacci', resources: 'archivi', influence: 55 },
            { name: 'Alessandra Macinghi', role: 'mercante', goal: 'proteggere le botteghe', strategy: 'mobilitare le arti', resources: 'maestranze', influence: 60 }
        ],
        factions: [
            { name: 'Signoria di Firenze', goal: 'mantenere autonomia', strategy: 'voti e decreti', resources: 'istituzioni', influence: 82 },
            { name: 'Arte del Cambio', goal: 'proteggere il credito', strategy: 'prestiti selettivi', resources: 'liquidità', influence: 74 }
        ],
        relations: [{ from: 'Signoria di Firenze', to: 'Arte del Cambio', type: 'rivalità', trust: 30, tension: 70 }],
        forces: [{ name: 'Crisi del credito', actor: 'Arte del Cambio', objective: 'ottenere garanzie fiscali', progress: 35, urgency: 70 }]
    });
    const generic = eventApi.normalizeEvent({
        type: 'politica', title: 'Il mediatore propone un incontro',
        summary: 'Il Mediatore convoca l’Autorità e l’Opposizione. Le parti promettono di discutere.',
        actors: ['Il Mediatore indipendente', 'l’Autorità'],
        consequence: 'La tensione potrebbe cambiare nei prossimi giorni.', source: 'timeline-ai'
    });
    assert.ok(timelineSimulatorApi.eventCentralityScore(generic, { world }) < 6);
    const arc = timelineSimulatorApi.ensureEventArc([generic], {
        story: { title: 'Firenze contesa', setting: 'Firenze, 1520' }, world,
        passage: { days: 7, description: '1 settimana' }, location: 'Palazzo Vecchio'
    });
    assert.equal(arc.qualityRejected, 1);
    assert.equal(arc.events.some(event => event.title === generic.title), false);
    assert.ok(arc.events.every(event => event.actors.every(name => !timelineSimulatorApi.keyOf(name).includes('mediatore indipendente'))));
});

test('gli eventi della timeline aprono conversazioni vive in prima persona', () => {
    const world = worldBootstrapApi.ensureMinimumWorld({}, {
        story: { title: 'Astaria', setting: 'Khepra' }, turn: 10
    });
    const arc = timelineSimulatorApi.createFallbackArc({
        story: { title: 'Astaria', setting: 'Khepra' }, world,
        passage: { days: 7, description: '1 settimana' }, turn: 17
    });
    const events = arc.events.map((event, index) => ({ ...event, id: `event-live-${index}`, turn: 17 }));
    const messages = timelineSimulatorApi.buildConversationStarters(events, world, {
        turn: 17, protagonistName: 'Nerissa'
    });
    assert.ok(messages.length >= 3);
    assert.ok(messages.every(message => timelineChatApi.speaksInFirstPerson(message.text)));
    assert.ok(messages.every(message => message.eventId && message.target));
});

test('gli eventi modificano davvero attori, relazioni e forze del mondo', () => {
    let world = worldBootstrapApi.ensureMinimumWorld({}, {
        story: { title: 'Astaria', setting: 'Khepra' }, turn: 0
    });
    const relation = world.relations[0];
    const force = world.forces[0];
    force.actor = relation.from;
    const oldTension = relation.tension;
    const oldProgress = force.progress;
    world = worldBootstrapApi.applyTimelineEvents(world, [{
        type: 'conflitto', title: force.name,
        summary: `${relation.from} attacca gli interessi di ${relation.to}.`,
        actors: [relation.from, relation.to], importance: 'high'
    }], 30, { days: 30 });
    assert.ok(world.relations[0].tension > oldTension);
    assert.ok(world.forces[0].progress > oldProgress);
    assert.equal(world.factions.find(item => item.name === relation.from).lastMoveTurn, 30);
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

test('interpreta eventi LLM strutturati con causa, attori e conseguenza', () => {
    const events = eventApi.parseNarrativeTags(
        '[EVENTO: relazione|Il patto del porto|Elara accetta di aiutare il protagonista|Porto Vecchio|Elara, protagonista|Elara preparerà una barca entro l\'alba|high|active]',
        { turn: 7, location: 'Locanda', knownActors: ['Elara'] }
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'relazione');
    assert.equal(events[0].title, 'Il patto del porto');
    assert.equal(events[0].location, 'Porto Vecchio');
    assert.deepEqual(events[0].actors, ['Elara', 'protagonista']);
    assert.match(events[0].consequence, /barca entro l'alba/);
    assert.equal(events[0].importance, 'high');
    assert.equal(events[0].status, 'active');
    assert.equal(events[0].turn, 7);
});

test('mantiene compatibili i vecchi EVENTO e ne deduce la categoria', () => {
    const events = eventApi.parseNarrativeTags(
        '[EVENTO: Sconfitto il brigante che minacciava la strada]',
        { turn: 3, location: 'Via del Mulino' }
    );
    assert.equal(events[0].type, 'conflitto');
    assert.equal(events[0].summary, 'Sconfitto il brigante che minacciava la strada');
    assert.equal(events[0].location, 'Via del Mulino');
    assert.equal(events[0].eventSchemaVersion, eventApi.EVENT_SCHEMA_VERSION);
});

test('recupera dal CRONISTA il fatto principale se manca EVENTO', () => {
    const events = eventApi.parseNarrativeTags(
        'Elara tende la mano. [CRONISTA: Alleanza al porto|Elara accetta di collaborare|critical]',
        { turn: 4, location: 'Porto' }
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].title, 'Alleanza al porto');
    assert.equal(events[0].summary, 'Elara accetta di collaborare');
    assert.equal(events[0].importance, 'critical');
    assert.equal(events[0].source, 'cronista-fallback');
});

test('deduplica lo stesso evento e conserva i dettagli più ricchi', () => {
    const first = eventApi.normalizeEvent({
        type: 'scoperta', title: 'La cripta', summary: 'Trovato l ingresso della cripta',
        location: 'Bosco', actors: ['Elara'], consequence: '', turn: 5
    });
    const second = eventApi.normalizeEvent({
        type: 'scoperta', title: 'La cripta', summary: 'Trovato l ingresso della cripta',
        location: 'Bosco', actors: ['Varek'], consequence: 'La cripta può ora essere esplorata', importance: 'high', turn: 5
    });
    const result = eventApi.recordEvents([first], [second], { turn: 5 });
    assert.equal(result.events.length, 1);
    assert.equal(result.added.length, 0);
    assert.equal(result.updated.length, 1);
    assert.deepEqual(result.events[0].actors, ['Elara', 'Varek']);
    assert.equal(result.events[0].importance, 'high');
    assert.match(result.events[0].consequence, /esplorata/);
});

test('il prompt eventi impone tag completi e usa il contesto della campagna', () => {
    const prompt = eventApi.buildPrompt({
        location: 'Porto Vecchio',
        activeQuests: [{ name: 'Trovare Elara' }],
        recentEvents: [{ summary: 'Elara è scomparsa', turn: 2 }]
    });
    assert.match(prompt, /tipo\|titolo\|fatto_accaduto\|luogo/);
    assert.match(prompt, /Registra l'ESITO realmente narrato/);
    assert.match(prompt, /Trovare Elara/);
    assert.match(prompt, /Porto Vecchio/);
    assert.match(prompt, /Elara è scomparsa/);
});

test('il prompt di un salto lungo richiede routine ed eventi distribuiti nel periodo', () => {
    const prompt = eventApi.buildPrompt({
        location: 'Castello di Montefeltro',
        timePassage: {
            elapsed: timeEnergyApi.MINUTES_PER_MONTH,
            days: 30,
            description: '30 giorni',
            summary: '30 notti di sonno e circa 90 pasti'
        }
    });
    assert.match(prompt, /montaggio cronologico dell'intero periodo/i);
    assert.match(prompt, /sonno, pasti, lavoro, relazioni/i);
    assert.match(prompt, /momenti diversi del periodo/i);
    assert.match(prompt, /30 notti di sonno e circa 90 pasti/i);
});

test('gli eventi del periodo conservano data e scelta causale', () => {
    const events = eventApi.parseNarrativeTags(
        '[EVENTO: politica|Il consiglio si divide|Il consiglio respinge la nuova tassa|Sala del Consiglio|Regina, mercanti|I mercanti sospendono i prestiti|high|active|18 marzo, mattina]',
        { turn: 12, choice: 'Aumentare la tassa sui mercanti' }
    );
    assert.equal(events[0].occurredAt, '18 marzo, mattina');
    assert.equal(events[0].choice, 'Aumentare la tassa sui mercanti');
    const prompt = eventApi.buildPrompt({ recentChoices: ['Aumentare la tassa sui mercanti'] });
    assert.match(prompt, /data_o_momento/);
    assert.match(prompt, /Aumentare la tassa sui mercanti/);
});

test('gli eventi centrali conservano causa storica, spostamento politico e trattativa', () => {
    const events = eventApi.parseNarrativeTags(
        '[EVENTO: politica|Il credito viene sospeso|Jacopo Gherardi ordina ai banchieri di congelare i prestiti alla Signoria. Niccolò Capponi convoca il Consiglio degli Ottanta.|Mercato Vecchio|Jacopo Gherardi, Niccolò Capponi, Arte del Cambio|Il governo non può finanziare le guardie senza nuove garanzie|critical|developing|14 luglio 1520|Il rifiuto della Signoria di concedere esenzioni|La repubblica fiorentina dipende dal credito delle Arti|L’Arte del Cambio ottiene potere di veto finanziario|Il pagamento delle guardie cittadine|Negoziare garanzie e durata dei prestiti|required]',
        { turn: 14 }
    );
    assert.equal(events[0].cause, 'Il rifiuto della Signoria di concedere esenzioni');
    assert.match(events[0].historicalAnchor, /repubblica fiorentina/);
    assert.match(events[0].politicalShift, /potere di veto/);
    assert.equal(events[0].conversationMode, 'required');
    assert.match(events[0].conversationGoal, /garanzie/);
});

test('crea chat persistenti collegate agli eventi e in prima persona', () => {
    const event = eventApi.normalizeEvent({
        id: 'event-patto', type: 'relazione', title: 'Il patto del porto',
        summary: 'Elara propone un accordo', actors: ['Elara', 'Protagonista'], turn: 7,
        occurredAt: '12 marzo, sera'
    });
    const parsed = timelineChatApi.parseChatTags(
        '[CHAT: Il patto del porto|Elara|npc|Io accetto il patto, ma voglio una garanzia.|Protagonista|cauta]',
        { events: [event], turn: 7 }
    );
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].eventId, 'event-patto');
    assert.equal(parsed[0].speaker, 'Elara');
    assert.equal(timelineChatApi.speaksInFirstPerson(parsed[0].text), true);
    const recorded = timelineChatApi.recordMessages([], parsed, { events: [event], turn: 7 });
    assert.equal(recorded.chats.length, 1);
    assert.deepEqual(recorded.chats[0].participants, ['Elara', 'Protagonista']);
    assert.equal(recorded.chats[0].messages.length, 1);
});

test('normalizza in prima persona una risposta esterna e collega una chat anche prima dei messaggi', () => {
    const event = eventApi.normalizeEvent({
        id: 'event-gilda', type: 'economia', title: 'Sciopero della gilda',
        summary: 'La gilda chiude le botteghe', actors: ['Gilda dei Fabbri', 'Consiglio'], turn: 8
    });
    const message = timelineChatApi.normalizeMessage({
        event, speaker: 'Gilda dei Fabbri', speakerType: 'fazione',
        text: 'La gilda non accetta le nuove imposte', source: 'llm', turn: 8
    });
    assert.match(message.text, /^Io dichiaro:/);
    const ensured = timelineChatApi.ensureEventThreads([], [event], { events: [event], turn: 8 });
    assert.equal(ensured.created.length, 1);
    assert.deepEqual(ensured.chats[0].participants, ['Gilda dei Fabbri', 'Consiglio']);
    const solitary = timelineChatApi.ensureEventThreads([], [{ ...event, id: 'event-solo', actors: ['Viandante'] }], {
        events: [event], turn: 8
    });
    assert.equal(solitary.created.length, 0);
});

test('i prompt della simulazione e della chat fanno reagire le parti alle scelte', () => {
    const simulationPrompt = timelineChatApi.buildSimulationPrompt({
        recentChoices: [{ summary: 'Rifiutare il tributo della gilda' }]
    });
    assert.match(simulationPrompt, /Rifiutare il tributo della gilda/);
    assert.match(simulationPrompt, /prima persona/i);
    assert.match(simulationPrompt, /protagonista parla soltanto quando scrive il giocatore/i);
    const chatPrompt = timelineChatApi.buildChatPrompt({
        id: 'chat-1', eventTitle: 'Sciopero della gilda', participants: ['Gilda', 'Protagonista'], messages: []
    }, 'Propongo una tregua', { eventSummary: 'Le botteghe sono chiuse' });
    assert.match(chatPrompt, /IL PROTAGONISTA DICE: Propongo una tregua/);
    assert.match(chatPrompt, /Non parlare mai al posto del protagonista/);
});

test('il giocatore convoca una chat multi-NPC e invita altri soggetti', () => {
    const created = timelineChatApi.createThread([], {
        title: 'Consiglio sul credito', purpose: 'contratto',
        agenda: 'Definire garanzie, importo e durata del prestito',
        participants: ['Jacopo Gherardi', 'Niccolò Capponi']
    }, { protagonistName: 'Lorenzo', turn: 8, occurredAt: '14 luglio 1520' });
    assert.equal(created.created, true);
    assert.deepEqual(created.thread.participants, ['Jacopo Gherardi', 'Niccolò Capponi', 'Lorenzo']);
    assert.equal(created.thread.purpose, 'contratto');
    const invited = timelineChatApi.inviteParticipants(created.chats, created.thread.id, ['Alessandra Macinghi'], { turn: 9 });
    assert.deepEqual(invited.invited, ['Alessandra Macinghi']);
    assert.ok(invited.thread.participants.includes('Alessandra Macinghi'));
    const prompt = timelineChatApi.buildChatPrompt(invited.thread, 'Propongo un prestito garantito dai dazi', {
        actorContext: 'Jacopo controlla il credito; Alessandra rappresenta le botteghe.'
    });
    assert.match(prompt, /2-5 CHAT/);
    assert.match(prompt, /almeno due soggetti/);
    assert.match(prompt, /ACCORDO_CHAT/);
});

test('una negoziazione registra esito e contratto persistente senza accettazioni automatiche', () => {
    const created = timelineChatApi.createThread([], {
        title: 'Prestito alle guardie', purpose: 'contratto', agenda: 'Finanziare le guardie cittadine',
        participants: ['Jacopo Gherardi', 'Niccolò Capponi']
    }, { protagonistName: 'Lorenzo', turn: 10 });
    const response = [
        `[ESITO_CHAT: ${created.thread.id}|agreement|Le parti approvano il finanziamento|L’Arte del Cambio ottiene garanzie sui dazi|Verificare il primo pagamento]`,
        `[ACCORDO_CHAT: ${created.thread.id}|Prestito delle guardie|Jacopo Gherardi, Niccolò Capponi, Lorenzo|contratto|Cento fiorini contro il gettito dei dazi per tre mesi|active|tre mesi|Il mancato pagamento sospende il credito|Tesoreria della Signoria]`
    ].join('\n');
    const parsed = timelineChatApi.parseOutcomeTags(response, { turn: 10 });
    assert.equal(parsed.outcomes[0].status, 'agreement');
    assert.equal(parsed.agreements[0].status, 'active');
    const premature = timelineChatApi.applyConversationResults(created.chats, parsed, { turn: 10 });
    assert.equal(premature.chats[0].agreements[0].status, 'draft');
    assert.equal(premature.chats[0].resolution.status, 'proposal');
    const acceptedMessages = timelineChatApi.recordMessages(created.chats, [
        { threadId: created.thread.id, eventTitle: created.thread.eventTitle, speaker: 'Jacopo Gherardi', speakerType: 'npc', text: 'Io accetto questi termini.', source: 'llm' },
        { threadId: created.thread.id, eventTitle: created.thread.eventTitle, speaker: 'Niccolò Capponi', speakerType: 'npc', text: 'Io approvo e firmo il prestito.', source: 'llm' },
        { threadId: created.thread.id, eventTitle: created.thread.eventTitle, speaker: 'Lorenzo', speakerType: 'protagonista', text: 'Accetto il contratto.', source: 'player' }
    ], { turn: 10 });
    const applied = timelineChatApi.applyConversationResults(acceptedMessages.chats, parsed, { turn: 10 });
    assert.equal(applied.changed, true);
    assert.equal(applied.chats[0].resolution.status, 'agreement');
    assert.equal(applied.chats[0].agreements[0].title, 'Prestito delle guardie');
    assert.equal(applied.chats[0].agreements[0].status, 'active');
});

test('gli esiti delle chat modificano fiducia e tensione tra le parti', () => {
    let world = worldBootstrapApi.migrateWorld({
        actors: [
            { name: 'Jacopo Gherardi', status: 'active' },
            { name: 'Niccolò Capponi', status: 'active' }
        ],
        relations: [{ from: 'Jacopo Gherardi', to: 'Niccolò Capponi', type: 'negoziazione', trust: 40, tension: 60 }]
    });
    world = worldBootstrapApi.applyConversationOutcomes(world, [{
        participants: ['Jacopo Gherardi', 'Niccolò Capponi'], status: 'agreement',
        summary: 'Le parti firmano il prestito.'
    }], 12);
    assert.equal(world.relations[0].trust, 48);
    assert.equal(world.relations[0].tension, 54);
    assert.equal(world.actors[0].lastMoveTurn, 12);
});

test('il consigliere strategico usa soltanto informazioni note al protagonista', () => {
    const context = {
        story: { title: 'Firenze contesa', setting: 'Firenze, 1520', desc: 'La repubblica difende la propria autonomia.' },
        character: {
            name: 'Lorenzo', archetype: 'Diplomatico', level: 2, gold: 120,
            currency: { short: 'fiorini' }, health: { cur: 40, max: 100 },
            stamina: { cur: 65, max: 100 }, hunger: { cur: 70, max: 100 }, inventory: []
        },
        timeLabel: '12 luglio 1520', location: 'Palazzo Vecchio',
        memory: {
            turnCount: 8,
            events: [{
                title: 'Credito bloccato', summary: 'L’Arte del Cambio sospende i prestiti alla Signoria.',
                consequence: 'Il tesoro rischia una crisi di liquidità', actors: ['Arte del Cambio'],
                importance: 'high', status: 'active', turn: 8
            }],
            quests: [{ name: 'Salvare la Repubblica', objective: 'Trovare una maggioranza nei consigli', status: 'active' }],
            world: {
                actors: [{
                    name: 'Jacopo Gherardi', publicGoal: 'Proteggere il credito cittadino',
                    privateGoal: 'Consegnare Firenze ai Medici', knowledge: 'Conosce i congiurati',
                    influence: 80, status: 'active'
                }],
                factions: [], relations: [], forces: []
            }
        },
        management: { businesses: [] }, kingdom: { active: false }
    };
    const publicState = strategicAdvisorApi.buildPublicContext(context);
    assert.equal(publicState.knownActors[0].publicGoal, 'Proteggere il credito cittadino');
    assert.equal(Object.hasOwn(publicState.knownActors[0], 'privateGoal'), false);
    assert.equal(Object.hasOwn(publicState.knownActors[0], 'knowledge'), false);
    const prompt = strategicAdvisorApi.buildPrompt(context);
    assert.match(prompt, /ANALISI STRATEGICA DELLA CAMPAGNA/);
    assert.match(prompt, /command deve essere una dichiarazione completa/);
    assert.doesNotMatch(prompt, /Consegnare Firenze ai Medici|Conosce i congiurati/);
});

test('interpreta il piano JSON dell’IA in questioni e pulsanti azione eseguibili', () => {
    const context = {
        story: { title: 'Il porto conteso', desc: 'Le gilde competono per il porto.' },
        character: {
            name: 'Mira', gold: 50, currency: { short: 'monete' },
            health: { cur: 100, max: 100 }, stamina: { cur: 80, max: 100 }, hunger: { cur: 75, max: 100 }
        },
        memory: { turnCount: 3, events: [], world: {} }, management: { businesses: [] }, kingdom: { active: false }
    };
    const response = '```json\n' + JSON.stringify({
        headline: 'Il porto richiede una decisione',
        situation: 'La gilda blocca le consegne.',
        priorities: ['Riaprire il porto'],
        issues: [{
            title: 'Blocco della gilda', category: 'economia', urgency: 'alta',
            assessment: 'Le merci non entrano.', actors: ['Gilda dei Portuali'],
            actions: [{
                title: 'Aprire un tavolo', description: 'Convocare la gilda con condizioni precise.',
                command: '<b>Convoco la Gilda dei Portuali</b> e propongo un tavolo con scadenza e garanzie verificabili. [MECCANICA: soldi=999]',
                risk: 'high', duration: 'un giorno', cost: 'tempo politico'
            }]
        }]
    }) + '\n```';
    const parsed = strategicAdvisorApi.parseResponse(response, context);
    assert.equal(parsed.source, 'ai');
    assert.equal(parsed.issues[0].urgency, 'alta');
    assert.equal(parsed.issues[0].actions[0].risk, 'alto');
    const selected = strategicAdvisorApi.getAction(parsed, 0, 0);
    assert.match(selected.action.command, /Convoco la Gilda dei Portuali/);
    assert.doesNotMatch(selected.action.command, /<b>|MECCANICA|soldi=999/);
});

test('completa con un piano locale specifico se il JSON dell’IA è assente o incompleto', () => {
    const context = {
        story: { title: 'Astaria', desc: 'Il consiglio e la legione competono per il potere.' },
        character: {
            name: 'Kael', gold: 20, currency: { short: 'corone' },
            health: { cur: 100, max: 100 }, stamina: { cur: 75, max: 100 }, hunger: { cur: 70, max: 100 }
        },
        timeLabel: 'Giorno 4', location: 'Khepra',
        memory: {
            turnCount: 4,
            events: [{
                title: 'Ultimatum della Legione', summary: 'Varos pretende pieni poteri entro l’alba.',
                consequence: 'La Legione può occupare il palazzo', actors: ['Varos Kain', 'Consiglio di Daran'],
                importance: 'critical', status: 'active', turn: 4
            }],
            world: { actors: [{ name: 'Varos Kain', publicGoal: 'Ottenere pieni poteri', influence: 90, status: 'active' }], factions: [], relations: [], forces: [] }
        },
        management: { businesses: [] }, kingdom: { active: false }
    };
    const plan = strategicAdvisorApi.ensureAnalysis('risposta non JSON', context);
    assert.equal(plan.source, 'local');
    assert.ok(plan.issues.length >= 3);
    assert.match(plan.issues[0].title, /Ultimatum della Legione/);
    assert.ok(plan.issues.every(item => item.actions.length >= 2));
    assert.ok(plan.issues.flatMap(item => item.actions).every(item => item.command.length > 20));
});

test('rigenera l’analisi strategica quando cambia lo stato del gioco', () => {
    const base = {
        story: { title: 'Astaria' },
        character: {
            name: 'Kael', gold: 20, health: { cur: 100, max: 100 },
            stamina: { cur: 75, max: 100 }, hunger: { cur: 70, max: 100 }
        },
        memory: { turnCount: 1, events: [], world: {} }, management: { businesses: [] }, kingdom: { active: false }
    };
    const plan = strategicAdvisorApi.buildFallback(base);
    assert.equal(strategicAdvisorApi.isFresh(plan, base), true);
    assert.equal(strategicAdvisorApi.isFresh(plan, { ...base, memory: { ...base.memory, turnCount: 2 } }), false);
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

test('un mese simula pasti e sonno senza ridurre il protagonista a fame ed energia zero', () => {
    const routine = timeEnergyApi.simulateDailyRoutine({
        health: { cur: 3, max: 9 },
        stamina: { cur: 4, max: 100 },
        hunger: { cur: 2, max: 100 }
    }, timeEnergyApi.MINUTES_PER_MONTH);
    assert.equal(routine.nights, 30);
    assert.equal(routine.meals, 90);
    assert.ok(routine.stamina >= 70);
    assert.ok(routine.hunger >= 65);
    assert.equal(routine.health, 9);
    assert.equal(timeEnergyApi.simulateDailyRoutine({}, 12 * 60), null, 'le azioni brevi usano ancora il metabolismo normale');
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

test('il Game Director dà priorità agli attori creati dal mondo iniziale', () => {
    const plan = directorApi.planTurn('Aspetto gli sviluppi', {
        memory: {
            turnCount: 5,
            world: {
                actors: [{ name: 'Varos', kind: 'npc', goal: 'prendere il potere', strategy: 'muovere la legione', influence: 85, status: 'active', location: 'Frontiera', lastMoveTurn: 0 }],
                factions: []
            },
            npcs: [{ name: 'Comparsa', goals: 'restare ferma', status: 'active' }]
        },
        character: {},
        currentLocation: 'Khepra'
    });
    assert.equal(plan.spotlight.name, 'Varos');
    assert.match(plan.prompt, /muovere la legione/);
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

test('il Game Director usa correttamente EVENTO strutturato come fallback', () => {
    const memory = { turnCount: 9 };
    directorApi.commitTurn(
        'Cerco la cripta',
        '[EVENTO: scoperta|Ingresso della cripta|Il protagonista trova la porta sotto le radici|Bosco|protagonista|La cripta è accessibile|high|active]',
        memory
    );
    assert.equal(memory.director.timeline[0].title, 'Ingresso della cripta');
    assert.equal(memory.director.timeline[0].summary, 'Il protagonista trova la porta sotto le radici');
    assert.equal(memory.director.timeline[0].importance, 'high');
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

test('recupera una nuova merce emessa con il vecchio tag PRODOTTO_NEGOZIO', () => {
    const management = businessApi.syncProperties(null, [
        { id: 74, name: 'Emporio Rossi', type: 'business' }
    ], 0);
    const outcome = businessApi.applyNarrativeEvents(management, [{
        type: 'renameProduct',
        businessName: 'Emporio Rossi',
        product: 'articolo elettronico',
        newName: 'Walkman Sony 1997',
        price: '65 euro',
        category: 'elettronica',
        stock: '3 unità'
    }], { turn: 1, currency: 'euro' });
    const product = outcome.management.businesses[0].products[0];
    assert.equal(outcome.results[0].ok, true);
    assert.equal(product.name, 'Walkman Sony 1997');
    assert.equal(product.salePrice, 65);
    assert.equal(product.stock, 3);
    assert.equal(product.source, 'narration');
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

test('un salto di molti turni chiude tutti i periodi economici intermedi', () => {
    const property = { id: 42, name: 'Bottega del Mese', type: 'business', businessCash: 100 };
    const business = businessApi.createBusinessFromProperty(property, 0);
    initializeBusinessForTest(business, { stock: 500, baseDemand: 2, salePrice: 12, unitCost: 4 });
    business.settings.periodTurns = 5;
    const result = businessApi.processPeriods({ businesses: [business] }, {
        properties: [property], employees: [], turn: 30
    }, () => 0.5);
    assert.equal(result.reports.length, 6);
    assert.equal(result.management.businesses[0].period, 6);
    assert.equal(result.management.businesses[0].lastPeriodTurn, 30);
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
    assert.match(html, /Gestisci attività/);
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
    assert.match(html, /vecchio validatore aveva escluso dal catalogo/);
    assert.match(html, /normalizePropertyCategory\(item\.category\) === 'vendibili'/);
    assert.match(html, /Applica i tag gestionali soltanto dopo LOOT_PROPRIETA/);
    assert.match(html, /CATALOGO_NEGOZIO.*serve soltanto a rinominare una voce già esistente/);
    assert.match(html, /pannello può essere aperto mentre arriva la risposta/i);
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
    assert.match(html, /CronacheTimeEnergy\.simulateDailyRoutine/);
    assert.match(html, /\[A-ZÀ-Ü_\]\+_REGNO/);
    assert.match(html, /normale vita quotidiana del protagonista/);
    assert.match(html, /advanceTime\(480, \{ resting: true \}\)/);
    assert.match(html, /case 'stamina': case 'energia': case 'energy'/);
    assert.equal(html.includes('const regenAmount = 3'), false, 'l’energia non deve rigenerarsi durante ogni azione');
});

test('la barra mobile mostra soltanto la gestione di attività e regno', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const actionBar = html.match(/<div class="action-bar" id="action-bar"[\s\S]*?<div class="input-row">/)?.[0] || '';
    assert.match(actionBar, /id="btn-business-manage"/);
    assert.match(actionBar, /id="btn-kingdom-manage"/);
    assert.doesNotMatch(actionBar, /id="btn-(?:rest|eat|heal|wait|train)"/);
    assert.doesNotMatch(actionBar, /id="quick-actions"/);
    assert.match(html, /managementActionBar\.hidden = businessManageButton\.hidden && kingdomButton\.hidden/);
});

test('l’avvio protegge i dati legacy e collega i pulsanti anche dopo una migrazione incompleta', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /function preserveStartupRecoveryCopy/);
    assert.match(html, /dnd_v4_recovery_v2/);
    assert.match(html, /function normalizeStoredStories/);
    assert.match(html, /function normalizeStoredSaves/);
    assert.match(html, /function safeStartupMigration/);
    assert.match(html, /recordStartupWarning\('inizializzazione dell’interfaccia'/);
    assert.match(html, /Avvio ripristinato: alcuni dati legacy sono stati messi in sicurezza e normalizzati/);
    assert.doesNotMatch(html, /unpkg\.com\/@openrouter\/sdk/);
    assert.match(html, /nessuna dipendenza CDN deve bloccare l'avvio dell'app/);
    assert.match(html, /document\.readyState === 'loading'/);
});

test('integra avanzamento, schermate evento e chat del mondo nell’interfaccia mobile', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /src="js\/timeline-chat\.js"/);
    assert.match(html, /src="js\/timeline-simulator\.js"/);
    assert.match(html, /id="btn-advance-world"/);
    assert.match(html, /id="modal-timeline"/);
    assert.match(html, /id="btn-simulate-timeline"/);
    assert.match(html, /id="modal-event-screen"/);
    assert.match(html, /id="modal-world-chat"/);
    assert.match(html, /id="chat-thread-list"/);
    assert.match(html, /id="chat-input"/);
    assert.match(html, /id="btn-new-world-chat"/);
    assert.match(html, /id="btn-invite-world-chat"/);
    assert.match(html, /id="chat-invite-candidates"/);
    assert.match(html, /function simulateTimelineEvents/);
    assert.match(html, /function sendWorldChatMessage/);
    assert.match(html, /function confirmWorldConvocation/);
    assert.match(html, /function applyWorldChatResults/);
    assert.match(html, /timelineChatEngine\.parseOutcomeTags/);
    assert.match(html, /timelineChatEngine\.inviteParticipants/);
    assert.match(html, /function queueTimelineChoice/);
    assert.match(html, /function requestTimelineAI/);
    assert.match(html, /timelineSimulator\.ensureEventArc/);
    assert.match(html, /timelineSimulator\.buildConversationStarters/);
    assert.match(html, /timelineSimulator\.isMeaningfulEvent/);
    assert.match(html, /Vita quotidiana garantita/);
    assert.match(html, /timelineChatEngine\.parseChatTags/);
});

test('integra analisi strategica IA, questioni espandibili e pulsante Azione', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /src="js\/strategic-advisor\.js"/);
    assert.match(html, /id="btn-strategic-actions"/);
    assert.match(html, /id="modal-strategic-actions"/);
    assert.match(html, /id="btn-strategic-analyze"/);
    assert.match(html, /class="strategic-action-execute"/);
    assert.match(html, />▶ Azione</);
    assert.match(html, /function requestStrategicAI/);
    assert.match(html, /function buildStrategicAdvisorContext/);
    assert.match(html, /strategicAdvisor\.buildPrompt/);
    assert.match(html, /strategicAdvisor\.ensureAnalysis/);
    assert.match(html, /sendAction\(\{ skipBasicNeeds: true, source: 'strategic-advisor' \}\)/);
    assert.match(html, /informazioni note al protagonista/i);
});

test('integra la creazione iniziale del mondo con narrazione, timeline e chat', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /src="js\/world-bootstrap\.js"/);
    assert.match(html, /worldBootstrapEngine\.buildBootstrapPrompt/);
    assert.match(html, /worldBootstrapEngine\.ingestResponse/);
    assert.match(html, /worldBootstrapEngine\.projectToMemory/);
    assert.match(html, /worldBootstrapEngine\.buildTimelinePrompt/);
    assert.match(html, /worldBootstrapEngine\.buildInteractionPrompt/);
    assert.match(html, /worldBootstrapEngine\.applyWorldMoves/);
    assert.match(html, /worldBootstrapEngine\.applyTimelineEvents/);
    assert.match(html, /worldBootstrapEngine\.needsHistoricalRepair/);
    assert.match(html, /function repairTimelineWorldIfNeeded/);
    assert.match(html, /Mondo creato:/);
    assert.match(html, /isStart \? 3600/);
});

test('espone coerentemente la versione applicativa 2.0', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.equal(packageMetadata.version, '2.0.0');
    assert.match(html, /<title>🐉 Cronache del Destino v2\.0<\/title>/);
    assert.match(html, /Un'avventura narrata dall'IA • v2\.0/);
});

test('inizializza e migra un regno senza confonderne il tesoro con altre finanze', () => {
    const engine = new kingdomApi.KingdomManager();
    const outcome = engine.applyNarrativeEvents(engine.createDefault(), [{
        type: 'profile',
        name: 'Astaria',
        rulerTitle: 'Regina',
        rulerName: 'Nerissa',
        capital: 'Khepra',
        treasury: '12.500 fiorini',
        population: '40.000',
        stability: 64,
        legitimacy: 72,
        prosperity: 58,
        food: 900
    }], { turn: 3 });
    assert.equal(outcome.state.active, true);
    assert.equal(outcome.state.name, 'Astaria');
    assert.equal(outcome.state.treasury, 12500);
    assert.equal(outcome.state.population, 40000);
    assert.equal(outcome.state.lastPeriodTurn, 3);
});

test('riceve territori, fazioni sociali, esercito e diplomazia dal narratore', () => {
    const engine = new kingdomApi.KingdomManager();
    let state = engine.applyNarrativeEvents(engine.createDefault(), [
        { type: 'profile', name: 'Astaria', treasury: 5000, population: 1000 },
        { type: 'territory', name: 'Kael', territoryType: 'contea mineraria', population: 600, foodProduction: 30, taxIncome: 200, loyalty: 55, strategicResource: 'ferro' },
        { type: 'faction', name: 'Gilda dei Minatori', category: 'artigiani/gilde', leader: 'Orvek', power: 60, loyalty: 45, goal: 'ridurre le gabelle' },
        { type: 'army', levies: 300, professionals: 80, cavalry: 20, morale: 70, readiness: 65, upkeep: 90 },
        { type: 'diplomacy', realm: 'Karsov', relation: 'tesa', trust: 20, tension: 75, claims: 'Miniere di Kael' }
    ], { turn: 1 }).state;
    assert.equal(state.territories[0].name, 'Kael');
    assert.equal(state.population, 1000, 'un singolo territorio non deve sostituire la popolazione totale');
    assert.equal(state.territories[0].population, 600);
    assert.equal(state.factions[0].category, 'artigiani/gilde');
    assert.equal(state.army.professionals, 80);
    assert.equal(state.diplomacy[0].claims, 'Miniere di Kael');
});

test('migra i salvataggi del regno alla struttura sociale ed economica approfondita', () => {
    const state = kingdomApi.migrateKingdom({
        schemaVersion: 1,
        active: true,
        name: 'Astaria',
        treasury: 900,
        population: 10000
    });
    assert.equal(state.schemaVersion, 4);
    assert.equal(state.treasury, 900);
    assert.equal(state.population, 10000);
    assert.equal(state.people.classes.reduce((sum, item) => sum + item.population, 0), 10000);
    assert.equal(typeof state.people.approval, 'number');
    assert.equal(typeof state.economy.administrationEfficiency, 'number');
    assert.equal(typeof state.services.healthcare, 'number');
    assert.equal(state.people.pops.reduce((sum, item) => sum + item.population, 0), 10000);
    assert.ok(state.jobs.length > 0);
    assert.deepEqual(state.statisticsHistory, []);
    assert.equal(state.governance.confidence, 0);
});

test('registra l’audit del Master e aggiorna le statistiche assolute a ogni elaborazione', () => {
    const engine = new kingdomApi.KingdomManager();
    const state = kingdomApi.migrateKingdom({
        active: true,
        name: 'Astaria',
        population: 1000,
        people: { popsInitializedByNarrator: true }
    });
    const events = kingdomApi.parseNarrativeTags(
        '[POPOLO_REGNO: Astaria|58|24|53|31|67|29|70|55|18|9.5|80|45]\\n' +
        '[STATISTICHE_REGNO: Astaria|72000|400|3.2|5000|64|12|8|20]\\n' +
        '[VALUTAZIONE_REGNO: Astaria|Il regno cresce ma le qualifiche restano insufficienti|Ampliare le scuole|Formare gli operai|Sorvegliare i prezzi|88]'
    );
    const outcome = engine.applyNarrativeEvents(state, events, { turn: 7 });
    assert.ok(outcome.results.every(result => result.ok));
    assert.equal(outcome.state.people.approval, 58);
    assert.equal(outcome.state.people.averageLivingStandard, 9.5);
    assert.equal(outcome.state.people.loyalists, 80);
    assert.equal(outcome.state.economy.gdp, 72000);
    assert.equal(outcome.state.economy.inflation, 3.2);
    assert.equal(outcome.state.governance.lastAssessmentTurn, 7);
    assert.equal(outcome.state.governance.confidence, 88);
    assert.equal(outcome.state.governance.priorities.length, 3);
    assert.equal(outcome.state.governance.lastStatisticsTurn, 7);
    assert.equal(outcome.state.governance.statisticsSource, 'Master LLM');
    assert.equal(outcome.state.statisticsHistory.length, 1);
});

test('riconcilia automaticamente POP, lavori e indicatori aggregati', () => {
    const engine = new kingdomApi.KingdomManager();
    const state = kingdomApi.migrateKingdom({
        active: true,
        name: 'Astaria',
        population: 100,
        people: {
            popsInitializedByNarrator: true,
            pops: [{
                id: 'pop-operai',
                name: 'Operai',
                classKey: 'workers',
                profession: 'laborers',
                population: 100,
                employed: 40,
                education: 20,
                literacy: 30,
                qualifications: 20,
                standardOfLiving: 6,
                radicals: 15
            }]
        },
        jobs: [{ profession: 'laborers', positions: 100, employed: 40 }]
    });
    const outcome = engine.applyNarrativeEvents(state, [{
        type: 'pop',
        popId: 'pop-operai',
        employed: 75,
        literacy: 45,
        standardOfLiving: 10,
        radicals: 5
    }], { turn: 3 });
    assert.equal(outcome.state.people.employment, 75);
    assert.equal(outcome.state.people.literacy, 45);
    assert.equal(outcome.state.people.averageLivingStandard, 10);
    assert.equal(outcome.state.people.radicals, 5);
    assert.equal(outcome.state.jobs[0].employed, 75);
    assert.equal(outcome.state.people.classes.find(item => item.key === 'workers').population, 100);
});

test('preserva i POP narrativi v3 e separa correttamente i mercati territoriali', () => {
    const engine = new kingdomApi.KingdomManager();
    let state = kingdomApi.migrateKingdom({
        schemaVersion: 3,
        active: true,
        name: 'Astaria',
        population: 100,
        people: {
            pops: [
                { id: 'kael-workers', name: 'Operai di Kael', classKey: 'workers', territoryName: 'Kael', profession: 'laborers', population: 60, employed: 40, education: 15 },
                { id: 'ostria-workers', name: 'Operai di Ostria', classKey: 'workers', territoryName: 'Ostria', profession: 'laborers', population: 40, employed: 20, education: 15 }
            ]
        },
        jobs: [
            { territoryName: 'Kael', profession: 'laborers', positions: 60 },
            { territoryName: 'Ostria', profession: 'laborers', positions: 40 }
        ]
    });
    assert.equal(state.people.popsInitializedByNarrator, true);
    state = engine.applyNarrativeEvents(state, [{
        type: 'pop',
        popId: 'kael-workers',
        employed: 50
    }], { turn: 4 }).state;
    assert.equal(state.people.pops.length, 2);
    assert.equal(state.jobs.find(job => job.territoryName === 'Kael').employed, 50);
    assert.equal(state.jobs.find(job => job.territoryName === 'Ostria').employed, 20);
});

test('genera priorità di governo deterministiche dai rischi reali', () => {
    const advisor = kingdomApi.buildKingdomAdvisor({
        active: true,
        name: 'Astaria',
        population: 1000,
        food: 0,
        people: {
            unrest: 70,
            employment: 40,
            foodSecurity: 20,
            radicals: 200,
            pops: []
        }
    });
    assert.equal(advisor.level, 'critico');
    assert.ok(advisor.risks.some(item => /alimentare/i.test(item)));
    assert.ok(advisor.risks.some(item => /disoccupazione/i.test(item)));
    assert.ok(advisor.priorities.length > 0);
});

test('analizza i tag LLM per gruppi di popolazione e mercato del lavoro', () => {
    const events = kingdomApi.parseNarrativeTags(
        '[POP_REGNO: Astaria|pop-kael-operai|Operai di Kael|workers|Kael|kaeliti|culto solare|laborers|800|620|18|22|20|1.8|7|72|18|0|20|60|lavoro stabile]\\n' +
        '[LAVORO_REGNO: Astaria|Kael|engineers|120|35|7|60|workers,artisans,merchants,nobles|active]'
    );
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'pop');
    assert.equal(events[0].popId, 'pop-kael-operai');
    assert.equal(events[0].profession, 'laborers');
    assert.equal(events[1].type, 'job');
    assert.equal(events[1].minEducation, '60');
});

test('impedisce all’LLM di assegnare lavori qualificati senza istruzione o classe ammessa', () => {
    const engine = new kingdomApi.KingdomManager();
    const state = kingdomApi.migrateKingdom({
        active: true,
        name: 'Astaria',
        population: 100,
        people: {
            pops: [{
                id: 'pop-operai',
                name: 'Operai',
                classKey: 'workers',
                profession: 'laborers',
                population: 100,
                employed: 80,
                education: 12,
                literacy: 20,
                qualifications: 15
            }]
        }
    });
    const denied = engine.applyNarrativeEvents(state, [{
        type: 'pop',
        popId: 'pop-operai',
        profession: 'engineers'
    }], { turn: 1 });
    assert.equal(denied.results[0].ok, false);
    assert.match(denied.results[0].message, /qualifiche/i);
    assert.equal(denied.state.people.pops[0].profession, 'laborers');
});

test('il mercato assume soltanto popolazioni qualificate e registra la mobilità sociale', () => {
    const engine = new kingdomApi.KingdomManager();
    const state = kingdomApi.migrateKingdom({
        active: true,
        name: 'Astaria',
        treasury: 1000,
        population: 100,
        food: 100,
        people: {
            pops: [{
                id: 'pop-disoccupati',
                name: 'Disoccupati di Kael',
                classKey: 'workers',
                territoryName: 'Kael',
                profession: 'unemployed',
                population: 100,
                education: 10,
                literacy: 15,
                qualifications: 10
            }]
        },
        jobs: [
            { territoryName: 'Kael', profession: 'engineers', positions: 100, wage: 7, minEducation: 0, allowedClasses: '*' },
            { territoryName: 'Kael', profession: 'laborers', positions: 50, wage: 2, minEducation: 0, allowedClasses: 'workers' }
        ]
    });
    const result = engine.runPeriod(state, { turn: 1 });
    const engineers = result.state.jobs.find(job => job.profession === 'engineers');
    const laborers = result.state.jobs.find(job => job.profession === 'laborers');
    assert.equal(engineers.employed, 0);
    assert.equal(engineers.minEducation, 60, 'l’LLM non può abbassare il requisito minimo della professione');
    assert.ok(laborers.employed > 0);
    assert.ok(result.report.promoted > 0);
    assert.ok(result.state.people.pops.some(pop => pop.profession === 'laborers'));
});

test('formazione, bisogni e radicalizzazione incidono sui gruppi POP', () => {
    const engine = new kingdomApi.KingdomManager();
    let state = kingdomApi.migrateKingdom({
        active: true,
        name: 'Astaria',
        treasury: 5000,
        population: 100,
        food: 0,
        people: {
            pops: [{
                id: 'pop-aspiranti',
                name: 'Aspiranti tecnici',
                classKey: 'workers',
                profession: 'unemployed',
                population: 100,
                education: 58,
                literacy: 60,
                qualifications: 58,
                radicals: 0
            }]
        },
        jobs: [{ profession: 'engineers', positions: 20, wage: 7, minEducation: 60, allowedClasses: 'workers' }]
    });
    state = engine.manualAction(state, 'trainPop', { popId: 'pop-aspiranti', value: 200, turn: 1 });
    assert.ok(state.people.pops[0].education >= 60);
    const result = engine.runPeriod(state, { turn: 2 });
    assert.ok(result.state.jobs[0].employed > 0);
    assert.ok(result.state.people.radicals > 0);
    assert.ok(result.state.people.pops.every(pop => pop.desires.length > 0));
});

test('analizza tutti i tag sociali, territoriali ed economici del regno', () => {
    const events = kingdomApi.parseNarrativeTags(
        '[REGNO: Astaria|Regina|Nerissa|monarchia|Khepra|12500|40000|64|72|58|900]\\n' +
        '[POPOLO_REGNO: Astaria|61|23|54|32|67|29|71|58|18]\\n' +
        '[CLASSE_REGNO: Astaria|artigiani|4800|52|63|44|credito accessibile]\\n' +
        '[STATISTICHE_REGNO: Astaria|65000|1200|3.5|4000|71|13|8|25]\\n' +
        '[SERVIZI_REGNO: Astaria|62|48|44|57|39]\\n' +
        '[TERRITORIO_REGNO: Astaria|Kael|contea mineraria|6000|300|900|70|55|Corona|ferro|controllato|64|59|52|61|68|27|Rocca Kael]\\n' +
        '[RISORSA_REGNO: Astaria|Kael|Ferro|minerale|40|120|8|attiva]\\n' +
        '[CRISI_REGNO: Astaria|Sciopero dei minatori|45|Kael|produzione ridotta|active]'
    );
    assert.equal(events.length, 8);
    assert.equal(events[0].type, 'profile');
    assert.equal(events[0].name, 'Astaria');
    assert.equal(events[1].type, 'people');
    assert.equal(events[2].classKey, 'artigiani');
    assert.equal(events[3].gdp, '65000');
    assert.equal(events[4].healthcare, '48');
    assert.equal(events[5].name, 'Kael');
    assert.equal(events[5].capital, 'Rocca Kael');
    assert.equal(events[6].type, 'resource');
    assert.equal(events[7].type, 'crisis');
});

test('applica patch narrative parziali senza azzerare i dati esistenti', () => {
    const engine = new kingdomApi.KingdomManager();
    let state = engine.applyNarrativeEvents(engine.createDefault(), [
        { type: 'profile', name: 'Astaria', population: 1000 },
        { type: 'territory', name: 'Kael', population: 600, taxIncome: 200, foodProduction: 30, loyalty: 55 },
        { type: 'army', professionals: 80, morale: 60, upkeep: 90 }
    ], { turn: 1 }).state;
    state = engine.applyNarrativeEvents(state, [
        { type: 'territory', name: 'Kael', loyalty: 72 },
        { type: 'army', morale: 81 }
    ], { turn: 2 }).state;
    assert.equal(state.territories[0].loyalty, 72);
    assert.equal(state.territories[0].population, 600);
    assert.equal(state.territories[0].taxIncome, 200);
    assert.equal(state.army.morale, 81);
    assert.equal(state.army.professionals, 80);
    assert.equal(state.army.upkeep, 90);
});

test('simula periodi del regno con entrate, mantenimento e viveri', () => {
    const engine = new kingdomApi.KingdomManager();
    const state = kingdomApi.migrateKingdom({
        active: true, name: 'Astaria', treasury: 1000, population: 1000, food: 100,
        lastPeriodTurn: 0, settings: { periodTurns: 5 },
        army: { professionals: 50, upkeep: 40, morale: 60, readiness: 60 },
        territories: [{ name: 'Daran', population: 1000, taxIncome: 300, foodProduction: 80, loyalty: 70 }]
    });
    const result = engine.processPeriods(state, { turn: 5 });
    assert.equal(result.reports.length, 1);
    assert.equal(result.state.period, 1);
    assert.ok(result.reports[0].income > result.reports[0].armyUpkeep);
    assert.equal(result.state.treasury, 1000 + result.reports[0].balance);
    assert.equal(result.state.food, 152);
    assert.ok(Number.isFinite(result.reports[0].servicesCost));
    assert.ok(result.reports[0].administration > 0);
    assert.ok(Number.isFinite(result.reports[0].populationDelta));
    assert.ok(result.state.economy.gdp > 0);
    assert.notEqual(result.state.people.approval, 50);
});

test('deduplica gli eventi solo nel medesimo turno', () => {
    const engine = new kingdomApi.KingdomManager();
    const event = { type: 'treasury', direction: 'entrata', amount: 100, reason: 'pedaggi' };
    let state = engine.applyNarrativeEvents(engine.applyNarrativeEvents(engine.createDefault(), [
        { type: 'profile', name: 'Astaria', treasury: 500 }
    ], { turn: 1 }).state, [event, event], { turn: 2 }).state;
    assert.equal(state.treasury, 600);
    state = engine.applyNarrativeEvents(state, [event], { turn: 3 }).state;
    assert.equal(state.treasury, 700);
});

test('ripartisce le variazioni demografiche narrative tra classi e territori', () => {
    const engine = new kingdomApi.KingdomManager();
    let state = kingdomApi.migrateKingdom({
        active: true,
        name: 'Astaria',
        population: 1000,
        territories: [
            { name: 'Kael', population: 600 },
            { name: 'Ostria', population: 400 }
        ]
    });
    state = engine.applyNarrativeEvents(state, [{
        type: 'event',
        description: 'Arrivano profughi dai monti',
        populationDelta: 100
    }], { turn: 3 }).state;
    assert.equal(state.population, 1100);
    assert.equal(state.territories.reduce((sum, item) => sum + item.population, 0), 1100);
    assert.equal(state.people.classes.reduce((sum, item) => sum + item.population, 0), 1100);
});

test('rende operative le decisioni su censimento, servizi e territori', () => {
    const engine = new kingdomApi.KingdomManager();
    let state = kingdomApi.migrateKingdom({
        active: true,
        name: 'Astaria',
        treasury: 2000,
        population: 5000,
        territories: [{ name: 'Kael', infrastructure: 30, prosperity: 40 }]
    });
    state = engine.manualAction(state, 'census', { turn: 1 });
    assert.equal(state.economy.administrationEfficiency, 53);
    state = engine.manualAction(state, 'publicService', { service: 'healthcare', value: 200, turn: 1 });
    assert.ok(state.services.healthcare > 30);
    state = engine.manualAction(state, 'investTerritory', { territoryName: 'Kael', value: 200, turn: 1 });
    assert.ok(state.territories[0].infrastructure > 30);
    state = engine.manualAction(state, 'period', { turn: 2 });
    assert.throws(() => engine.manualAction(state, 'period', { turn: 2 }), /già stato chiuso/);
});

test('aggrega condizioni sociali e segnala il divario di qualifiche nel lavoro', () => {
    const state = kingdomApi.migrateKingdom({
        active: true,
        name: 'Astaria',
        population: 100,
        people: {
            pops: [{
                id: 'pop-operai',
                name: 'Operai di Kael',
                classKey: 'workers',
                territoryName: 'Kael',
                profession: 'unemployed',
                population: 100,
                employed: 0,
                education: 20,
                literacy: 30,
                qualifications: 15,
                standardOfLiving: 6,
                loyalists: 5,
                radicals: 20,
                desires: 'lavoro stabile'
            }]
        },
        jobs: [{
            territoryName: 'Kael',
            profession: 'engineers',
            positions: 10,
            employed: 0,
            wage: 7
        }]
    });
    kingdomApi.reconcileDerivedStatistics(state);
    const workers = state.people.classes.find(item => item.key === 'workers');
    const labor = kingdomApi.buildLaborMarketSummary(state);
    assert.equal(workers.employment, 0);
    assert.equal(workers.education, 20);
    assert.equal(workers.livingStandard, 6);
    assert.equal(workers.radicals, 20);
    assert.equal(labor.vacancies, 10);
    assert.equal(labor.qualificationBlocked, 10);
    assert.equal(labor.unemployed, 100);
});

test('gli incentivi ampliano un settore lavorativo e aggiornano il tesoro', () => {
    const engine = new kingdomApi.KingdomManager();
    let state = kingdomApi.migrateKingdom({
        active: true,
        name: 'Astaria',
        treasury: 1000,
        jobs: [{ territoryName: 'Kael', profession: 'artisans', positions: 10, employed: 7, wage: 3 }]
    });
    const jobId = state.jobs[0].id;
    state = engine.manualAction(state, 'subsidizeJob', { jobId, value: 240, turn: 2 });
    assert.equal(state.treasury, 760);
    assert.ok(state.jobs[0].positions > 10);
    assert.ok(state.jobs[0].wage > 3);
    assert.match(state.history.at(-1).text, /Incentivato il settore/);
});

test('inietta lo stato autoritativo del regno nel contesto LLM', () => {
    const context = kingdomApi.buildNarrativeContext({
        active: true, name: 'Astaria', treasury: 700, population: 1200,
        territories: [{ name: 'Ostria', population: 1200, taxIncome: 40, foodProduction: 70, loyalty: 60 }],
        factions: [{ name: 'Mercanti del Porto', category: 'mercanti', power: 55, loyalty: 48 }],
        diplomacy: [{ realm: 'Tazir', relation: 'commerciale', trust: 65, tension: 10 }]
    }, 7, 'fiorini');
    assert.match(context, /STATO AUTORITATIVO/);
    assert.match(context, /Tesoro: 700 fiorini/);
    assert.match(context, /Ostria/);
    assert.match(context, /Mercanti del Porto/);
    assert.match(context, /Tazir/);
    assert.match(context, /POPOLO:/);
    assert.match(context, /CLASSI:/);
    assert.match(context, /SERVIZI:/);
    assert.match(context, /CRISI:/);
    assert.match(context, /GRUPPI POP:/);
    assert.match(context, /MERCATO DEL LAVORO:/);
    assert.match(context, /DIAGNOSI MOTORE:/);
    assert.match(context, /ULTIMO AUDIT MASTER:/);
    assert.match(context, /audit prima\/dopo/i);
    assert.match(context, /Professioni e promozioni dipendono da istruzione/i);
    assert.match(context, /ogni cambiamento narrato/i);
    assert.match(context, /separato dal denaro personale/);
});

test('integra pannello, ciclo turni e protocollo dei tag del regno', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /src="js\/kingdom-manager\.js"/);
    assert.match(html, /id="btn-kingdom-manage"/);
    assert.match(html, /id="modal-kingdom"/);
    assert.match(html, /function parseKingdomTags/);
    assert.match(html, /processKingdomTurn\(\)/);
    assert.match(html, /kingdomEngine\.buildNarrativeContext/);
    assert.match(html, /TERRITORIO_REGNO/);
    assert.match(html, /POPOLO_REGNO/);
    assert.match(html, /STATISTICHE_REGNO/);
    assert.match(html, /SERVIZI_REGNO/);
    assert.match(html, /RISORSA_REGNO/);
    assert.match(html, /CRISI_REGNO/);
    assert.match(html, /POP_REGNO/);
    assert.match(html, /LAVORO_REGNO/);
    assert.match(html, /VALUTAZIONE_REGNO/);
    assert.match(html, /FAZIONE_REGNO/);
    assert.match(html, /DIPLOMAZIA_REGNO/);
    assert.match(html, /data-kingdom-action="investTerritory"/);
    assert.match(html, /data-kingdom-action="publicService"/);
    assert.match(html, /data-kingdom-action="trainPop"/);
    assert.match(html, /data-kingdom-action="subsidizeJob"/);
    assert.match(html, /data-kingdom-filter="socialClass"/);
    assert.match(html, /data-kingdom-filter="jobStatus"/);
    assert.match(html, /Mercato del lavoro/);
    assert.match(html, /Audit del Master/);
    assert.match(html, /data-kingdom-section="kingdom-people"/);
    assert.match(html, /emetti SEMPRE un POPOLO_REGNO, uno STATISTICHE_REGNO e una VALUTAZIONE_REGNO/);
    assert.match(html, /Il tesoro reale NON è denaro personale/);
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'experience-v7.css'), 'utf8');
    assert.match(css, /\.kingdom-command-center/);
    assert.match(css, /\.kingdom-nav/);
    assert.match(css, /\.kingdom-score/);
    assert.match(css, /\.kingdom-filter-bar/);
    assert.match(css, /\.kingdom-social-card/);
    assert.match(css, /min-height:\s*44px/);
});

test('completa una storia minima con tutti i campi necessari al motore', () => {
    const story = storyGeneratorApi.createFallbackStory({
        genre: 'spy',
        idea: 'Una chiave cifrata scompare durante un vertice internazionale.'
    });
    assert.equal(story.genre, 'spy');
    ['title', 'setting', 'desc', 'personality', 'depth', 'prologue']
        .forEach(field => assert.ok(story[field].length > 20, `${field} deve essere completo`));
    assert.ok(Number.isFinite(story.starterGold));
    assert.deepEqual(story.starterProperties, []);
});

test('non salva il titolo generico quando può ricavarlo dall’idea', () => {
    const story = storyGeneratorApi.completeStory({
        title: 'Nuova Storia',
        genre: 'pirate',
        idea: 'La mappa spezzata del capitano scomparso'
    });
    assert.notEqual(story.title, 'Nuova Storia');
    assert.match(story.title, /Mappa Spezzata/i);
});

test('normalizza il JSON generato dall’IA e conserva l’idea del giocatore', () => {
    const story = storyGeneratorApi.parseGeneratedStory(
        '```json\n{"title":"Il Porto delle Ombre","prologue":"Una sirena lacera la notte mentre stringi la valigetta scomparsa.","starterProperties":[]}\n```',
        { genre: 'spy', setting: 'Trieste, 1984', idea: 'Una rete di doppi agenti.' }
    );
    assert.equal(story.title, 'Il Porto delle Ombre');
    assert.equal(story.setting, 'Trieste, 1984');
    assert.match(story.desc, /rete di doppi agenti/i);
    assert.ok(story.depth.length > 20);
});

test('rende gestibili le attività iniziali create dal generatore', () => {
    const story = storyGeneratorApi.completeStory({
        title: 'La Locanda Assediata',
        genre: 'business',
        starterProperties: [{ name: 'Locanda del Ponte', description: 'Un edificio indebitato.' }]
    });
    assert.equal(story.starterProperties.length, 1);
    assert.equal(story.starterProperties[0].type, 'business');
    assert.ok(story.starterProperties[0].businessCash > 0);
});

test('il prompt del generatore richiede una campagna giocabile e JSON puro', () => {
    const prompt = storyGeneratorApi.buildGenerationPrompt({
        genre: 'fantasy',
        idea: 'Un regno senza erede.'
    });
    assert.match(prompt, /JSON valido/);
    assert.match(prompt, /conflitto centrale/);
    assert.match(prompt, /scelta aperta/);
    assert.match(prompt, /starterProperties/);
});

test('integra il generatore nella schermata Crea storia', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /src="js\/story-generator\.js"/);
    assert.match(html, /id="edit-story-idea"/);
    assert.match(html, /id="btn-generate-story"/);
    assert.match(html, /function generateStoryFromEditor/);
    assert.match(html, /CronacheStoryGenerator\.completeStory/);
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
