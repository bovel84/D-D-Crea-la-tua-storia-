'use strict';

const assert = require('assert');
const director = require('../js/game-director.js');
const narrative = require('../js/narrative-master.js');
const managementDirector = require('../js/management-director.js');

assert.equal(managementDirector.install(), true, 'il patch deve installarsi sul Game Director e sul Narrative Master');

const memory = {
    turnCount: 4,
    management: {
        businesses: [{
            id: 'b1',
            name: 'Officina Rossa',
            status: 'active',
            cash: -120,
            customerSatisfaction: 32,
            products: [{ name: 'Ricambio', active: true, stock: 0, reorderPoint: 5 }],
            lastReport: { netProfit: -80, lowStock: ['Ricambio'] }
        }]
    },
    kingdom: {
        active: true,
        name: 'Valdoria',
        treasury: 300,
        food: 200,
        stability: 72,
        people: { unrest: 18, health: 70 },
        crises: []
    },
    world: { actors: [], factions: [] },
    npcs: [],
    factions: [],
    quests: []
};

const pressure = managementDirector.deriveManagementPressure(memory);
assert(pressure.businessLevel >= 60, 'cassa, perdita, scorte e clienti devono produrre pressione reale');
assert.equal(pressure.type, 'attivita');
assert(/Officina Rossa/.test(pressure.summary));

assert.equal(managementDirector.managementIntent('Abbasso il prezzo dei ricambi e tratto con il fornitore'), 'economia');
assert.equal(managementDirector.managementIntent('Aumento le tasse e convoco il consiglio'), 'governo');

assert.equal(
    managementDirector.detectNarrativeMode('Aumento le tasse e convoco il consiglio', { memory }),
    'regno',
    'le decisioni pubbliche devono usare la scala di regno'
);
assert.equal(
    managementDirector.detectNarrativeMode('Abbasso il prezzo e assumo due dipendenti', { memory }),
    'attivita',
    'le decisioni aziendali devono usare la scala attività'
);
assert.equal(
    managementDirector.detectNarrativeMode('Entro nella taverna e parlo con l’oste', { memory }),
    'personaggio',
    'una scena personale deve restare RPG anche se il personaggio possiede regno o attività'
);

assert.equal(
    managementDirector.detectNarrativeMode('Parlo con il ministro della sua famiglia', { memory }),
    'personaggio',
    'citare un ministro non deve trasformare un dialogo personale in gestione del regno'
);
assert.equal(
    managementDirector.detectNarrativeMode('Entro nell’officina e saluto i dipendenti', { memory }),
    'personaggio',
    'entrare fisicamente nell’attività e interagire come personaggio deve restare RPG'
);
assert.equal(
    managementDirector.detectNarrativeMode('Parlo con il fornitore e negozio un prezzo migliore', { memory }),
    'attivita',
    'una negoziazione economica deve restare gestione dell’attività anche se avviene in dialogo'
);
assert.equal(
    managementDirector.detectNarrativeMode('Ordino al ministro di aumentare le tasse', { memory }),
    'regno',
    'un ordine politico esplicito deve avere priorità sulla forma dialogica'
);

const gameDirector = new director.GameDirector();
const plan = gameDirector.planTurn('Abbasso il prezzo dei ricambi', {
    memory,
    character: { health: { cur: 10, max: 10 }, stamina: { cur: 10, max: 10 } },
    currentLocation: 'Officina Rossa'
});

assert.equal(plan.intent, 'economia');
assert.equal(plan.narrativeMode, 'attivita');
assert(plan.pressure.level > 20, 'la pressione gestionale deve alzare la tensione del turno');
assert.equal(plan.pressure.management.type, 'attivita');
assert(/GESTIONE PERSISTENTE/.test(plan.prompt));
assert(/GESTIONE DELL’ATTIVITÀ/.test(plan.prompt));
assert(/clienti, dipendenti, fornitori, concorrenti/.test(plan.prompt));
assert(/Officina Rossa/.test(plan.prompt));
assert.equal(plan.state.lastPlan.managementType, 'attivita');
assert.equal(plan.state.lastPlan.narrativeMode, 'attivita');

const kingdomPlan = gameDirector.planTurn('Aumento le tasse e convoco il consiglio', {
    memory,
    character: { health: { cur: 10, max: 10 }, stamina: { cur: 10, max: 10 } },
    currentLocation: 'Palazzo Reale'
});
assert.equal(kingdomPlan.intent, 'governo');
assert.equal(kingdomPlan.narrativeMode, 'regno');
assert(/GESTIONE DEL REGNO/.test(kingdomPlan.prompt));
assert(/attuazione/.test(kingdomPlan.prompt));
assert(/classi sociali/.test(kingdomPlan.prompt));
assert.equal(kingdomPlan.state.lastPlan.narrativeMode, 'regno');

const personalPlan = gameDirector.planTurn('Entro nella taverna e parlo con l’oste', {
    memory,
    character: { health: { cur: 10, max: 10 }, stamina: { cur: 10, max: 10 } },
    currentLocation: 'Taverna'
});
assert.equal(personalPlan.narrativeMode, 'personaggio');
assert(/PERSONAGGIO \/ RPG/.test(personalPlan.prompt));

const narrativeMaster = new narrative.NarrativeMasterEngine();
const kingdomNarrative = narrativeMaster.decide('Aumento le tasse e convoco il consiglio', {
    memory,
    character: { health: { cur: 10, max: 10 }, stamina: { cur: 10, max: 10 }, gold: 20 },
    currentLocation: 'Palazzo Reale',
    story: {}
});
assert.equal(kingdomNarrative.narrativeMode, 'regno');
assert.equal(kingdomNarrative.decision.focus, 'governo');
assert(/GESTIONE DEL REGNO/.test(kingdomNarrative.prompt));
assert(/reazione sistemica/.test(kingdomNarrative.decision.proactiveBeat));

const personalNarrative = narrativeMaster.decide('Entro nella taverna e parlo con l’oste', {
    memory,
    character: { health: { cur: 10, max: 10 }, stamina: { cur: 10, max: 10 }, gold: 20 },
    currentLocation: 'Taverna',
    story: {}
});
assert.equal(personalNarrative.narrativeMode, 'personaggio');
assert.notEqual(personalNarrative.decision.focus, 'governo');
assert(/PERSONAGGIO \/ RPG/.test(personalNarrative.prompt));

// —— Default management mode when protagonist is ruler or business owner ——
// Generic actions (no personal verb, no explicit management command) should
// default to management mode, not RPG, when the protagonist holds a role.
// With the test memory, business pressure (67) > kingdom pressure (0), so attivita wins.
assert.equal(
    managementDirector.detectNarrativeMode('aspetto notizie', { memory }),
    'attivita',
    'un\'azione generica con regno e attività attivi deve defaultare alla gestione con pressione maggiore'
);
assert.equal(
    managementDirector.detectNarrativeMode('controllo i rapporti', { memory }),
    'attivita',
    'un\'azione generica con regno e attività attivi deve defaultare alla gestione con pressione maggiore'
);

const onlyBusinessMemory = { ...memory, kingdom: { active: false } };
assert.equal(
    managementDirector.detectNarrativeMode('aspetto notizie', { memory: onlyBusinessMemory }),
    'attivita',
    'un\'azione generica con solo attività attiva deve defaultare a gestione attività'
);

const onlyKingdomMemory = { ...memory, management: { businesses: [] } };
assert.equal(
    managementDirector.detectNarrativeMode('penso alla situazione', { memory: onlyKingdomMemory }),
    'regno',
    'un\'azione generica con solo regno attivo deve defaultare a gestione del regno'
);

// When kingdom has higher pressure than business, generic actions default to regno
const kingdomPressureMemory = {
    ...memory,
    management: { businesses: [{ id: 'b2', name: 'Bottega', status: 'active', cash: 500, customerSatisfaction: 80 }] },
    kingdom: { active: true, name: 'Valdoria', treasury: -50, food: 0, stability: 30, people: { unrest: 60, health: 30 }, crises: [{ name: 'Carestia', status: 'active', severity: 80 }] }
};
assert.equal(
    managementDirector.detectNarrativeMode('aspetto notizie', { memory: kingdomPressureMemory }),
    'regno',
    'quando la pressione del regno supera quella dell\'attività, il default è regno'
);

const noManagementMemory = { ...memory, kingdom: { active: false }, management: { businesses: [] } };
assert.equal(
    managementDirector.detectNarrativeMode('aspetto notizie', { memory: noManagementMemory }),
    'personaggio',
    'senza regno né attività, il default resta RPG'
);

// Personal verbs must still override to CHARACTER even with management active
assert.equal(
    managementDirector.detectNarrativeMode('passeggio nel giardino', { memory }),
    'personaggio',
    'un verbo personale deve restare RPG anche con regno attivo'
);

console.log('management director regression: ok');
