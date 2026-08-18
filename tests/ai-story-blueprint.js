'use strict';

const assert = require('node:assert/strict');
const worldGenerator = require('../js/world-generator.js');
const storyGenerator = require('../js/story-generator.js');

{
    const prompt = storyGenerator.buildGenerationPrompt({
        genre: 'business',
        setting: 'Cagliari contemporanea',
        idea: 'Eredito un banco dei pegni in Via Roma con debiti, clienti difficili e un concorrente che vuole comprarmi.',
        difficulty: 'normal'
    });

    assert.match(prompt, /worldBlueprint OBBLIGATORIO/);
    assert.match(prompt, /centralConflict/);
    assert.match(prompt, /locationNeeds/);
    assert.match(prompt, /factionNeeds/);
    assert.match(prompt, /characterNeeds/);
    assert.match(prompt, /activeForces/);
    assert.match(prompt, /canonFacts/);
    assert.match(prompt, /openThreads/);
    assert.match(prompt, /cassa, credito, prezzi, domanda, fornitori, concorrenti e fiscalità/i);
    assert.match(prompt, /Non sostituire l’idea del giocatore con una trama standard/i);
    assert.match(prompt, /non deve inventare regni\/continenti\/guerre/i);
}

{
    const generated = {
        title: 'Pegni di Via Roma',
        setting: 'Cagliari, 2026',
        genre: 'business',
        difficulty: 'normal',
        starterGold: 700,
        desc: 'Un banco dei pegni ereditato rischia il fallimento mentre una banca pretende il rientro e un concorrente tenta di acquisire il portafoglio clienti.',
        personality: 'Realistico, manageriale e umano.',
        depth: 'Cassa, contratti, reputazione, dipendenti e rapporti con gli enti devono essere persistenti.',
        prologue: 'È mattina in Via Roma. Apri la serranda del banco dei pegni e trovi una diffida della banca mentre un cliente contesta un pegno in scadenza.',
        startTime: { day: 18, month: 8, year: 2026, hour: 9, minute: 0 },
        starterProperties: [{ name: 'Banco dei pegni Via Roma', type: 'business', condition: 58, businessCash: 1500 }],
        canonFacts: [
            'Il banco dei pegni è stato ereditato dal protagonista.',
            'La banca ha già chiesto un piano di rientro.',
            'Il concorrente Pegni Tirreno vuole espandersi in Via Roma.',
            'Il negozio dispone di poca liquidità.'
        ],
        openThreads: [
            'Perché il precedente proprietario ha accumulato i debiti?',
            'Quale cliente possiede il pegno più rischioso?',
            'Il concorrente sta agendo da solo?'
        ],
        worldBlueprint: {
            centralConflict: 'Salvare il banco dei pegni senza perdere controllo e reputazione.',
            stakes: 'Fallimento, perdita del negozio e deterioramento dei rapporti con clienti e creditori.',
            scope: {
                scale: 'locale',
                primaryArea: 'Via Roma e centro di Cagliari',
                secondaryAreas: ['porto di Cagliari'],
                travelLogic: 'Uscire dal centro solo per fornitori, aste o pratiche indispensabili.'
            },
            institutions: {
                politicalSystem: 'Comune e amministrazioni pubbliche locali',
                economy: 'credito bancario, aste, compravendita dell’usato, liquidità e domanda locale',
                law: 'contratti di pegno, scadenze, identificazione della clientela e licenze',
                socialStructure: 'clienti, commercianti, lavoratori, professionisti e famiglie',
                technology: 'strumenti contemporanei di valutazione, pagamenti e registrazione',
                cultureReligion: 'reputazione di quartiere e fiducia commerciale'
            },
            locationNeeds: [
                { nameHint: 'Banco dei pegni Via Roma', type: 'attività', purpose: 'sede principale', storyLink: 'centro del conflitto economico' },
                { nameHint: 'Filiale Banco Sardo', type: 'banca', purpose: 'negoziare il debito', storyLink: 'creditore principale' },
                { nameHint: 'Pegni Tirreno', type: 'concorrente', purpose: 'pressione competitiva', storyLink: 'tentativo di acquisizione' }
            ],
            factionNeeds: [
                { nameHint: 'Banco Sardo', type: 'finanziatore', roleInConflict: 'creditore', goal: 'ridurre l’esposizione', resources: 'credito e garanzie', autonomousPressure: 'revocare affidamenti' },
                { nameHint: 'Pegni Tirreno', type: 'concorrente', roleInConflict: 'rivale', goal: 'acquisire clienti e attività', resources: 'liquidità e pubblicità', autonomousPressure: 'fare offerte aggressive' },
                { nameHint: 'Comune di Cagliari', type: 'istituzione', roleInConflict: 'regolatore', goal: 'far rispettare autorizzazioni', resources: 'permessi e controlli', autonomousPressure: 'effettuare verifiche' }
            ],
            characterNeeds: [
                { nameHint: 'Laura Piras', role: 'titolare concorrente', storyFunction: 'rivale commerciale', factionHint: 'Pegni Tirreno', locationHint: 'Via Roma', publicGoal: 'espandere il mercato', privateGoal: 'acquistare il negozio sotto prezzo', autonomy: 'può contattare clienti e creditori' }
            ],
            activeForces: [
                { name: 'Rientro bancario', actor: 'Banco Sardo', objective: 'ridurre il credito', cause: 'rate arretrate', escalation: 'revoca dell’affidamento' },
                { name: 'Pressione competitiva', actor: 'Pegni Tirreno', objective: 'acquisire clientela', cause: 'debolezza del banco', escalation: 'offerta di acquisto ostile' },
                { name: 'Crisi reputazionale', actor: 'clientela', objective: 'ottenere garanzie sui pegni', cause: 'contestazioni recenti', escalation: 'calo di nuovi clienti' }
            ],
            startingSituation: {
                locationHint: 'Banco dei pegni Via Roma',
                immediateProblem: 'Diffida della banca e contestazione di un cliente arrivano nello stesso momento.',
                openThreads: ['origine del debito', 'cliente contestato', 'mossa del concorrente'],
                firstDecision: 'scegliere quale emergenza affrontare per prima'
            }
        }
    };

    const story = storyGenerator.parseGeneratedStory(JSON.stringify(generated), { genre: 'business' });
    assert.equal(story.worldBlueprint.centralConflict, generated.worldBlueprint.centralConflict);
    assert.equal(story.worldBlueprint.scope.scale, 'locale');
    assert.match(story.worldBlueprint.institutions.economy, /credito bancario/);
    assert.equal(story.worldBlueprint.factionNeeds[0].nameHint, 'Banco Sardo');
    assert.equal(story.worldBlueprint.characterNeeds[0].nameHint, 'Laura Piras');
    assert.equal(story.worldBlueprint.activeForces[0].name, 'Rientro bancario');
    assert.equal(story.canonFacts.length, 4);
    assert.equal(story.openThreads.length, 3);
    assert.equal(story.starterProperties[0].name, 'Banco dei pegni Via Roma');

    const worldPrompt = worldGenerator.buildLocationsPrompt(story, { protagonistName: 'Marco Serra' });
    assert.match(worldPrompt, /BLUEPRINT STRUTTURATO DELLA STORIA \(CANONE\)/);
    assert.match(worldPrompt, /Salvare il banco dei pegni/);
    assert.match(worldPrompt, /Banco Sardo/);
    assert.match(worldPrompt, /Pegni Tirreno/);
    assert.match(worldPrompt, /Comune di Cagliari/);
    assert.match(worldPrompt, /Rientro bancario/);
    assert.match(worldPrompt, /non sostituirlo con archetipi del genere/i);
}

{
    const legacyStory = storyGenerator.completeStory({
        title: 'Vecchia campagna',
        genre: 'historical',
        setting: 'Firenze 1472',
        desc: 'Una disputa tra famiglie mercantili e corporazioni minaccia la stabilità cittadina.',
        startTime: { day: 2, month: 4, year: 1472, hour: 9, minute: 0 }
    });

    assert.ok(legacyStory.worldBlueprint);
    assert.match(legacyStory.worldBlueprint.scope.scale, /luogo, anno e conflitto/i);
    assert.match(legacyStory.worldBlueprint.institutions.technology, /epoca/i);
    assert.ok(legacyStory.worldBlueprint.locationNeeds.length >= 6);
    assert.ok(legacyStory.worldBlueprint.factionNeeds.length >= 4);
    assert.ok(legacyStory.worldBlueprint.characterNeeds.length >= 6);
    assert.ok(legacyStory.worldBlueprint.activeForces.length >= 3);
}

console.log('AI story blueprint regression tests: ok');
