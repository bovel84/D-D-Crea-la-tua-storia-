'use strict';

const assert = require('node:assert/strict');
const guard = require('../js/opening-narrative-guard.js');

function makeState() {
    return {
        currentStory: {
            title: 'Il banchiere di Firenze',
            genre: 'historical',
            setting: 'Italia centrale',
            desc: 'Nel 1472 un giovane banchiere fiorentino eredita una piccola banca familiare e deve muoversi tra credito, famiglie potenti e corporazioni.',
            prologue: 'Il banco di legno scuro apparteneva a tuo padre. La mattina del 2 aprile 1472 apri il libro mastro nella bottega di Firenze mentre un cliente attende davanti alla porta.',
            personality: 'Storico, realistico, economico e immersivo.',
            depth: 'Rispetta istituzioni, moneta, mestieri e rapporti di potere del 1472.',
            startTime: { day: 2, month: 4, year: 1472, hour: 9, minute: 0 },
            starterProperties: [{ name: 'Banco Torrigiani', type: 'banca familiare' }]
        },
        character: {
            name: 'Lorenzo Torrigiani',
            gold: 2000,
            currency: { short: 'fiorini' }
        },
        time: { day: 2, month: 4, year: 1472, hour: 9, minute: 0 },
        currentLocation: 'Firenze',
        storyLog: [{ type: 'system', text: 'La tua attività è stata riconosciuta.' }],
        history: [],
        worldMemory: {
            worldGenerationPipeline: { version: 1, status: 'ready', stage: 6, completedStages: 6 },
            world: {
                name: 'Italia centrale nel 1472',
                startLocation: 'Firenze',
                premise: 'Credito e potere nella Firenze rinascimentale.',
                centralConflict: 'Il banco deve sopravvivere tra debiti, clienti e famiglie dominanti.',
                stakes: 'Perdita del banco, reputazione e autonomia familiare.',
                locations: [
                    { name: 'Firenze', region: 'Toscana' },
                    { name: 'Roma', region: 'Lazio' },
                    { name: 'Urbino', region: 'Marche' }
                ],
                factions: [
                    { name: 'Repubblica di Firenze', goal: 'preservare l’ordine civico e fiscale' },
                    { name: 'Arte del Cambio', goal: 'difendere reputazione e regole dei cambiatori' }
                ],
                actors: [
                    { name: 'Bernardo Rinaldi', role: 'mercante', location: 'Firenze', goal: 'ottenere credito' },
                    { name: 'Tommaso Bianchi', role: 'notaio', location: 'Firenze', goal: 'proteggere validità degli atti' }
                ],
                forces: [{ name: 'Pressione sul credito', objective: 'ridurre la liquidità disponibile' }]
            }
        }
    };
}

(async () => {
    {
        const state = makeState();
        let activeState = state;
        let calls = 0;
        let captured = '';
        global.addStoryEntry = (text, type) => activeState.storyLog.push({ text, type });
        global.requestConfiguredAI = async messages => {
            calls += 1;
            captured = messages.map(message => message.content).join('\n');
            return 'Le campane di Firenze hanno appena battuto le nove quando sollevi la serranda di legno del Banco Torrigiani. L’aria di aprile porta l’odore umido delle pietre e quello più acre delle botteghe già aperte. Sul banco ti attendono il libro mastro di tuo padre, due lettere sigillate e una piccola cassa di fiorini che da oggi risponde soltanto alle tue decisioni.\n\nBernardo Rinaldi, mercante di lana, è il primo a entrare. Non viene per porgere condoglianze: posa davanti a te una richiesta di credito e ti ricorda che entro pochi giorni dovrà pagare una partita di stoffe. Dietro di lui, il notaio Tommaso Bianchi osserva in silenzio i registri ereditati, consapevole che alcuni impegni del banco potrebbero essere più pesanti di quanto apparisse ieri.\n\nFuori, Firenze continua a muoversi senza aspettarti. Cambiatori e mercanti aprono i loro banchi, messi comunali attraversano la strada e le grandi famiglie fanno circolare denaro e favori con la stessa rapidità delle notizie. Il tuo nome è conosciuto, ma non abbastanza da proteggerti.\n\nRinaldi indica il libro mastro e abbassa la voce: «Prima di mezzogiorno devo sapere se posso contare su di voi». La porta resta aperta alle tue spalle, e con essa l’intera città.';
        };
        global.autoSave = () => {};

        const result = await guard.ensureOpeningNarrative(state);
        assert.equal(result.ok, true);
        assert.equal(result.source, 'focused-opening-llm');
        assert.equal(calls, 1);
        assert.ok(guard.hasNarration(state));
        assert.match(state.storyLog.find(entry => entry.type === 'narrator').text, /campane di Firenze/i);
        assert.match(captured, /1472/);
        assert.match(captured, /Firenze/);
        assert.match(captured, /NON rigenerare il mondo/);
        assert.match(captured, /Nessun JSON|NON restituire JSON/);
        assert.equal(state.worldMemory.worldGenerationPipeline.stage, 7);
        assert.equal(state.worldMemory.worldGenerationPipeline.status, 'ready');
        assert.equal(state.worldMemory.worldGenerationPipeline.completedStages, 8);
    }

    {
        const state = makeState();
        state.storyLog.push({ type: 'narrator', text: 'Una scena iniziale già valida e sufficientemente lunga è presente nel registro.' });
        let calls = 0;
        global.requestConfiguredAI = async () => { calls += 1; return 'Non dovrebbe essere chiamato'; };
        const result = await guard.ensureOpeningNarrative(state);
        assert.equal(result.ok, true);
        assert.equal(result.source, 'primary-start');
        assert.equal(calls, 0);
    }

    {
        const state = makeState();
        let activeState = state;
        global.addStoryEntry = (text, type) => activeState.storyLog.push({ text, type });
        global.requestConfiguredAI = async () => { throw new Error('provider non disponibile'); };
        const result = await guard.ensureOpeningNarrative(state);
        assert.equal(result.ok, true);
        assert.equal(result.source, 'prologue-fallback');
        assert.match(state.storyLog.find(entry => entry.type === 'narrator').text, /banco di legno scuro/i);
    }

    assert.equal(guard.sanitizeNarrative('[MONDO_SETUP: Firenze|premessa|conflitto|posta]\n[FAZIONE_SETUP: Arte del Cambio|corporazione]'), '');
    console.log('opening narrative guard regression: ok');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
