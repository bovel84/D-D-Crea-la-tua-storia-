'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const storyApi = require('../js/story-generator.js');
const runtime = require('../js/story-generation-v22.js');

function text(label, min = 340) {
    return `${label} `.repeat(Math.ceil(min / (label.length + 1))).slice(0, min + 20);
}

function makeWorldSeed() {
    const locations = Array.from({ length: 6 }, (_, index) => ({
        name: `Luogo ${index + 1}`,
        type: index === 0 ? 'castle' : 'village',
        x: 100 + index * 120,
        y: 100 + (index % 3) * 140,
        description: `Luogo concreto ${index + 1}`,
        resource: index % 2 ? 'grano' : 'legname',
        danger: index % 2 ? 'dazi' : 'faida',
        connections: index ? [`Luogo ${index}`] : ['Luogo 2']
    }));
    return {
        worldName: 'Italia centrale nell’anno Mille',
        premise: 'Una contea di confine deve sopravvivere tra poteri maggiori.',
        centralConflict: 'La successione locale apre una contesa su tributi e fedeltà.',
        stakes: 'Autonomia della contea e sicurezza dei villaggi.',
        continents: [{
            name: 'Europa',
            nations: [{
                name: 'Marca dell’Italia centrale',
                government: 'ordinamento feudale e poteri cittadini/ecclesiastici concorrenti',
                controllingFaction: 'Casa di Montefiorito',
                regions: [
                    { name: 'Contea di Montefiorito', terrain: 'plains', locations: locations.slice(0, 3) },
                    { name: 'Marca confinante', terrain: 'mountain', locations: locations.slice(3) }
                ]
            }]
        }],
        factions: Array.from({ length: 3 }, (_, index) => ({
            name: ['Casa di Montefiorito', 'Vescovado', 'Marca confinante'][index],
            type: index === 1 ? 'religious' : 'lordship',
            leader: `Leader ${index + 1}`,
            base: `Luogo ${index + 1}`,
            territory: index === 2 ? 'Marca confinante' : 'Contea di Montefiorito',
            goal: `Obiettivo autonomo ${index + 1}`,
            relationship: ['alleata', 'variabile', 'avversaria'][index]
        })),
        npcs: Array.from({ length: 6 }, (_, index) => ({
            name: `Persona ${index + 1}`,
            role: `Ruolo ${index + 1}`,
            faction: ['Casa di Montefiorito', 'Vescovado', 'Marca confinante'][index % 3],
            location: `Luogo ${index + 1}`,
            publicGoal: `Scopo pubblico ${index + 1}`,
            privateGoal: `Scopo privato ${index + 1}`,
            relationship: ['alleato', 'neutrale', 'avversario'][index % 3]
        })),
        relations: Array.from({ length: 4 }, (_, index) => ({
            from: `Persona ${index + 1}`,
            to: ['Casa di Montefiorito', 'Vescovado', 'Marca confinante'][index % 3],
            type: index % 2 ? 'rivalità' : 'cooperazione',
            trust: 40 + index,
            tension: 30 + index
        })),
        forces: Array.from({ length: 3 }, (_, index) => ({
            name: `Pressione ${index + 1}`,
            actor: ['Casa di Montefiorito', 'Vescovado', 'Marca confinante'][index],
            objective: `Obiettivo ${index + 1}`,
            progress: 20 + index * 10,
            urgency: 50 + index * 10,
            consequenceAt100: `Conseguenza ${index + 1}`
        })),
        startLocation: 'Luogo 1'
    };
}

function makePayload() {
    const worldSeed = makeWorldSeed();
    return {
        title: 'Contea di Montefiorito',
        setting: 'Italia centrale, anno 1000 d.C.',
        genre: 'historical',
        difficulty: 'normal',
        starterGold: 500,
        desc: text('La contea vive una crisi politica concreta con villaggi, rendite, giurisdizioni e poteri confinanti.'),
        personality: 'Realistico, politico e causale.',
        depth: 'PNG e poteri agiscono autonomamente; economia, diritto e conseguenze persistono.',
        prologue: text('All’alba il protagonista riceve messi rivali mentre il consiglio della contea attende una decisione.'),
        startTime: { day: 15, month: 3, year: 1000, hour: 8, minute: 0 },
        starterProperties: [],
        worldBlueprint: {
            centralConflict: 'Successione, tributi e controllo delle strade.',
            stakes: 'Autonomia e sicurezza della contea.',
            scope: { scale: 'regionale', primaryArea: 'Contea di Montefiorito', secondaryAreas: ['Marca confinante'], travelLogic: 'politica, guerra e commercio' },
            institutions: { politicalSystem: 'signoria locale', economy: 'rendite e mercati', law: 'consuetudini e giurisdizioni', socialStructure: 'nobili, clero, liberi e dipendenti', technology: 'anno 1000', cultureReligion: 'cristianesimo latino' },
            locationNeeds: Array.from({ length: 6 }, (_, i) => ({ nameHint: `Luogo ${i + 1}`, type: 'insediamento', purpose: 'funzione politica', storyLink: 'conflitto' })),
            factionNeeds: Array.from({ length: 3 }, (_, i) => ({ nameHint: `Fazione ${i + 1}`, type: 'potere', roleInConflict: 'parte attiva', goal: 'potere', resources: 'terre', autonomousPressure: 'agisce' })),
            characterNeeds: Array.from({ length: 6 }, (_, i) => ({ nameHint: `Persona ${i + 1}`, role: 'ruolo', storyFunction: 'conflitto', factionHint: 'fazione', locationHint: `Luogo ${i + 1}`, publicGoal: 'pubblico', privateGoal: 'privato', autonomy: 'agisce fuori scena' })),
            activeForces: Array.from({ length: 3 }, (_, i) => ({ name: `Pressione ${i + 1}`, actor: 'potere', objective: 'obiettivo', cause: 'causa', escalation: 'escalation' })),
            startingSituation: { locationHint: 'Luogo 1', immediateProblem: 'ultimatum', openThreads: ['tributi', 'successione', 'confine'], firstDecision: 'chi ricevere per primo' }
        },
        canonFacts: ['fatto 1', 'fatto 2', 'fatto 3', 'fatto 4'],
        openThreads: ['filo 1', 'filo 2', 'filo 3'],
        worldSeed,
        historicalGrounding: {
            mode: 'real',
            date: '15 marzo 1000',
            region: 'Italia centrale',
            politicalContext: 'Poteri signorili, imperiali ed ecclesiastici si sovrappongono; non esiste uno Stato nazionale italiano moderno.',
            documentedFacts: ['L’Italia è politicamente frammentata.', 'Il potere ecclesiastico è rilevante.', 'Le giurisdizioni sono sovrapposte.'],
            fictionalizedElements: ['La contea e i suoi personaggi locali sono plausibili ma inventati.']
        }
    };
}

const payload = makePayload();
const fenced = `prefazione da ignorare\n\`\`\`json\n${JSON.stringify(payload, null, 2).replace(/\n}\s*$/, '\n,\n}')}\n\`\`\``;
const parsed = runtime.extractJsonObject(fenced);
assert.equal(parsed.title, payload.title);
assert.equal(parsed.worldSeed.npcs.length, 6);

const stats = runtime.worldSeedStats(payload.worldSeed);
assert.deepEqual(stats, { continents: 1, regions: 2, locations: 6, factions: 3, npcs: 6, relations: 4, forces: 3 });

const story = storyApi.completeStory(payload, { genre: 'historical', setting: payload.setting });
const quality = runtime.validateGeneratedPayload(payload, story, { genre: 'historical' });
assert.equal(quality.valid, true, quality.issues.join('; '));

const enhanced = runtime.buildEnhancedPrompt('BASE PROMPT', { genre: 'historical' });
assert.match(enhanced, /worldSeed/);
assert.match(enhanced, /historicalGrounding/);
assert.match(enhanced, /Non proiettare lo Stato nazionale moderno/i);
assert.match(enhanced, /6-12 NPC/);

const summary = runtime.compactWorldSeedForPrompt(payload.worldSeed);
assert.match(summary, /Contea di Montefiorito/);
assert.match(summary, /Persona 1/);
assert.match(summary, /Marca confinante/);

const loader = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai-efficiency.js'), 'utf8');
assert.match(loader, /story-generation-v22\.js/);
assert.match(loader, /CronacheStoryGenerationV22/);

console.log('story-generation-v22-regression: OK');