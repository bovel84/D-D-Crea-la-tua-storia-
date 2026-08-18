'use strict';

const assert = require('node:assert/strict');
const generator = require('../js/world-generator.js');
require('../js/campaign-profile.js');

{
    const story = {
        title: 'Il banco dei pegni di Via Roma',
        genre: 'business',
        setting: 'Cagliari contemporanea',
        desc: 'Il protagonista eredita un banco dei pegni indebitato. Deve trattare con clienti, fornitori, una banca creditrice, concorrenti locali e il Comune mentre cerca di evitare il fallimento.',
        personality: 'Realistico e manageriale, con dialoghi naturali.',
        depth: 'Cassa, contratti, clienti, fornitori, personale e concorrenza devono produrre conseguenze persistenti.',
        prologue: 'È mattina in Via Roma. Il protagonista apre il negozio ereditato e trova una raccomandata della banca insieme a un cliente che pretende la restituzione di un oggetto contestato.',
        startTime: { day: 18, month: 8, year: 2026, hour: 9, minute: 0 },
        starterProperties: [{ name: 'Banco dei pegni di Via Roma', type: 'business' }]
    };
    const prompt = generator.buildLocationsPrompt(story, { protagonistName: 'Marco Serra' });
    assert.match(prompt, /ALLINEAMENTO AUTORITATIVO CON LA STORIA/);
    assert.match(prompt, /SCALA LOCALE\/REGIONALE/);
    assert.match(prompt, /banco dei pegni indebitato/i);
    assert.match(prompt, /Banco dei pegni di Via Roma/);
    assert.match(prompt, /banche\/finanziatori/i);
    assert.match(prompt, /NON regni o ribellioni/i);
    assert.match(prompt, /luogo di partenza deve essere quello implicato o esplicitato dal prologo/i);
    assert.match(prompt, /60% dei luoghi/i);
}

{
    const story = {
        title: 'Firenze 1472',
        genre: 'historical',
        setting: 'Firenze rinascimentale',
        desc: 'Una crisi tra famiglie mercantili, corporazioni e istituzioni cittadine minaccia gli equilibri della Repubblica.',
        personality: 'Storico, immersivo e concreto.',
        depth: 'Ceto sociale, moneta, corporazioni, religione e legge devono restare coerenti.',
        prologue: 'Il protagonista arriva in Piazza della Signoria durante una disputa commerciale che coinvolge due casate.',
        startTime: { day: 2, month: 4, year: 1472, hour: 9, minute: 0 }
    };
    const prompt = generator.buildLocationsPrompt(story, {});
    assert.match(prompt, /SCALA STORICA COERENTE/);
    assert.match(prompt, /2\/4\/1472/);
    assert.match(prompt, /corporazioni/i);
    assert.match(prompt, /non trasformare automaticamente una storia locale in una guerra continentale/i);
}

{
    const story = {
        title: 'Il banco dei pegni di Via Roma',
        genre: 'business',
        setting: 'Cagliari contemporanea',
        desc: 'Un banco dei pegni indebitato è al centro della storia.',
        prologue: 'Una banca pretende il rientro e un concorrente prova ad acquisire il negozio.',
        starterProperties: [{ name: 'Banco dei pegni di Via Roma', type: 'business' }]
    };
    const world = {
        name: 'Cagliari economica',
        premise: 'Una piccola attività lotta per sopravvivere.',
        centralConflict: 'Debito bancario e pressione competitiva.',
        stakes: 'Perdita del negozio e dei clienti.',
        startLocation: 'Via Roma',
        locations: [
            { name: 'Via Roma', type: 'quartiere commerciale', description: 'Sede del banco dei pegni e principale area clienti.' },
            { name: 'Filiale Banco Sardo', type: 'banca', description: 'Istituto creditore che può revocare gli affidamenti.' }
        ],
        factions: [
            { name: 'Banco Sardo', type: 'banca', leader: 'Direzione crediti', goal: 'Ridurre l’esposizione deteriorata', strategy: 'Rientro e garanzie', resources: 'Credito e informazioni finanziarie', ideology: 'Prudenza bancaria', base: 'Filiale Banco Sardo' },
            { name: 'Pegni Tirreno', type: 'concorrente', leader: 'Laura Piras', goal: 'Acquisire quote di mercato', strategy: 'Prezzi aggressivi', resources: 'Liquidità e pubblicità', base: 'Via Roma' }
        ],
        forces: [
            { name: 'Rientro del credito', actor: 'Banco Sardo', objective: 'Ottenere il pagamento', cause: 'Rate arretrate', consequenceAt100: 'Revoca del credito e azioni sul negozio' }
        ]
    };
    const prompt = generator.buildNpcPrompt(world, story, { protagonistName: 'Marco Serra' });
    assert.match(prompt, /ALLINEAMENTO AUTORITATIVO DEI PERSONAGGI/);
    assert.match(prompt, /Banco Sardo/);
    assert.match(prompt, /Ridurre l’esposizione deteriorata/);
    assert.match(prompt, /Filiale Banco Sardo/);
    assert.match(prompt, /Rientro del credito/);
    assert.match(prompt, /Almeno 4 NPC devono essere ancore causali/);
    assert.match(prompt, /obiettivi importanti che NON riguardano il protagonista/);
    assert.match(prompt, /non creare un cast standard di nobile\/comandante\/mercante\/sacerdote/i);
}

console.log('World/story alignment regression tests: ok');
