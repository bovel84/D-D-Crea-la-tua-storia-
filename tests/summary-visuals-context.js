'use strict';

const assert = require('assert');
const summaryVisuals = require('../js/summary-visuals.js');

const state = {
    currentStory: {
        title: 'Carriera al Bologna',
        genre: 'dramma sportivo contemporaneo',
        setting: 'Bologna, Italia',
        startTime: { year: 2015 }
    },
    character: {
        name: 'Andrea Cannas',
        role: 'calciatore professionista'
    },
    currentLocation: 'Bologna',
    time: { year: 2015 },
    worldMemory: {
        world: {
            startLocation: 'Bologna',
            actors: [
                { name: 'Marco Sabatini', role: 'dirigente del Bologna FC 1909', location: 'Bologna' },
                { name: 'Claudio Venturi', role: 'amministratore delegato', location: 'Bologna' }
            ]
        },
        events: [
            {
                id: 'evt-contract-payment',
                title: 'Il bonifico viene bloccato',
                summary: 'Andrea Cannas riceve una notifica sul telefono: il bonifico delle tre mensilità promesse non è partito. Marco Sabatini conferma dal suo ufficio che Claudio Venturi ha bloccato i fondi.',
                consequence: 'Il pagamento resta sospeso e la rescissione rischia di saltare.',
                location: 'Ufficio dirigenziale del Bologna FC 1909, Via Castiglione, Bologna',
                actors: ['Andrea Cannas', 'Marco Sabatini', 'Claudio Venturi'],
                occurredAt: 'Sabato 28 Agosto 2015, 15:06',
                importance: 'high',
                scenePrompt: 'modern Italian football club executive office, smartphone with bank notification in foreground, tense sporting director on phone, Bologna city afternoon light through office window'
            }
        ]
    }
};

const summary = 'Durante 2 giorni e 17 ore, il mondo ha prodotto questo cambiamento: Sabato 28 Agosto 2015, 15:06 — La notifica sul telefono di Andrea Cannas conferma che il bonifico delle tre mensilità non è mai partito. Situazione attuale: il pagamento resta sospeso.';

const selected = summaryVisuals.selectSummaryEvent(summary, state);
assert(selected && selected.id === 'evt-contract-payment', 'must select the concrete event represented in the summary');

const prompt = summaryVisuals.buildSummaryPrompt(summary, state);
assert(/Ufficio dirigenziale del Bologna FC 1909/i.test(prompt), 'prompt must preserve the exact event location');
assert(/Marco Sabatini/i.test(prompt), 'prompt must preserve named actors');
assert(/smartphone with bank notification/i.test(prompt), 'prompt must prioritize the Game Master scene prompt');
assert(/year 2015/i.test(prompt), 'prompt must preserve the exact era');
assert(/not a generic mood image/i.test(prompt), 'prompt must explicitly reject generic imagery');
assert(/NO fantasy elements/i.test(prompt), 'non-fantasy stories must reject unrelated fantasy imagery');

console.log('summary visuals contextual prompt regression: ok');
