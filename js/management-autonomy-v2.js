(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheManagementAutonomy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 2;
    const MAX_AUTONOMOUS_SEEDS = 2;
    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 620) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function hashText(value) {
        const text = String(value || '');
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function businessActors(business, employees) {
        const property = clean(business?.propertyName || business?.name, 100).toLowerCase();
        const names = [
            ...asArray(business?.customers).map(item => item?.name),
            ...asArray(business?.suppliers).filter(item => item?.status !== 'inactive').map(item => item?.name),
            ...asArray(employees).filter(item => item?.status !== 'fired' && clean(item?.property, 100).toLowerCase() === property).map(item => item?.name),
            ...asArray(business?.contracts).filter(item => item?.status === 'active').map(item => item?.counterpartyName)
        ].map(item => clean(item, 100)).filter(Boolean);
        return [...new Set(names)].slice(0, 6);
    }

    function fallbackBusinessSignal(business) {
        const report = business?.lastReport || {};
        const lowStock = asArray(report.lowStock).length || asArray(business?.products).filter(product =>
            product?.active !== false && number(product?.stock) <= Math.max(0, number(product?.reorderPoint))
        ).length;
        if (number(business?.cash) < 0) return { score: 96, text: `cassa negativa ${number(business.cash)}`, cause: `${business.name} ha cassa negativa: creditori, dipendenti, fornitori o clienti registrati devono reagire.` };
        if (number(report.netProfit) < 0) return { score: 72, text: `perdita ${number(report.netProfit)}`, cause: `${business.name} ha chiuso l'ultimo periodo in perdita: costi, prezzi, domanda e controparti devono produrre una conseguenza concreta.` };
        if (lowStock > 0) return { score: 68, text: `${lowStock} sotto scorta`, cause: `${business.name} ha ${lowStock} prodotti sotto scorta: clienti e fornitori registrati devono reagire alla disponibilità reale.` };
        if (number(business?.customerSatisfaction, 60) < 40) return { score: 70, text: `clienti ${Math.round(number(business.customerSatisfaction))}%`, cause: `${business.name} ha clienti insoddisfatti: reclami, abbandoni o richieste devono diventare visibili.` };
        return null;
    }

    function buildBusinessCandidates(state, sectorApi = root.CronacheBusinessSpecializations) {
        const memory = state?.worldMemory || {};
        const employees = asArray(memory.employees);
        const turn = Math.max(0, number(memory.turnCount));
        return asArray(memory?.management?.businesses)
            .filter(business => business && business.status === 'active' && business.narrativeInitialized === true)
            .map(business => {
                const snapshot = sectorApi?.buildSectorSnapshot?.(business, employees, turn) || null;
                const signal = snapshot?.primarySignal || fallbackBusinessSignal(business);
                const profile = snapshot?.profile || { key: business.type || 'business', label: business.type || 'attività' };
                if (signal) return {
                    domain: 'business', score: Math.max(45, Math.min(98, number(signal.score, 65))),
                    title: `${business.name}: ${profile.label}`,
                    cause: `${signal.cause} Stato reale: cassa ${number(business.cash)}, reputazione ${Math.round(number(business.reputation, 50))}%, soddisfazione ${Math.round(number(business.customerSatisfaction, 60))}%. Genera un solo evento concreto coerente con ${profile.label}; non usare un generico modello di negozio e non inventare controparti anonime quando esistono soggetti registrati.`,
                    actors: signal.actors?.length ? signal.actors : businessActors(business, employees),
                    sourceId: business.id || business.name,
                    fingerprint: `business:${business.id || business.name}:${profile.key}:${signal.text}`,
                    cadence: signal.severity === 'critical' || number(signal.score) >= 90 ? 3 : 4
                };
                const report = business.lastReport || {};
                if (number(report.netProfit) > 0 && number(business.customerSatisfaction, 60) >= 75 && asArray(business.customers).length) return {
                    domain: 'business', score: 56,
                    title: `${business.name}: crescita da gestire`,
                    cause: `${business.name}, ${profile.label}, ha utile ${number(report.netProfit)} e soddisfazione clienti ${Math.round(number(business.customerSatisfaction))}%. Usa soltanto soggetti e contratti registrati per mostrare una conseguenza concreta della crescita su capacità, ordini, condizioni commerciali o reputazione.`,
                    actors: businessActors(business, employees), sourceId: business.id || business.name,
                    fingerprint: `business:${business.id || business.name}:growth:${Math.round(number(report.netProfit))}:${Math.round(number(business.customerSatisfaction))}`,
                    cadence: 5
                };
                return null;
            }).filter(Boolean);
    }

    function buildKingdomCandidates(state) {
        const kingdom = state?.worldMemory?.kingdom || {};
        if (!kingdom.active) return [];
        const people = kingdom.people || {};
        const economy = kingdom.economy || {};
        const report = kingdom.lastReport || {};
        const factionNames = asArray(kingdom.factions).filter(item => item?.name)
            .sort((a, b) => number(b.influence) - number(a.influence)).slice(0, 5).map(item => clean(item.name, 100));
        const list = [];
        const push = (score, title, cause, fingerprint, actors = [], cadence = 3) => list.push({
            domain: 'kingdom', score, title, cause: clean(cause, 900),
            actors: [...new Set([...actors, ...factionNames])].filter(Boolean).slice(0, 6),
            sourceId: kingdom.name || 'kingdom', fingerprint: `kingdom:${kingdom.name}:${fingerprint}`, cadence
        });

        const crisis = asArray(kingdom.crises).filter(item => item?.status === 'active' && number(item.severity) >= 50)
            .sort((a, b) => number(b.severity) - number(a.severity))[0];
        if (crisis) push(Math.min(98, Math.max(82, number(crisis.severity))), `${kingdom.name}: ${clean(crisis.name || crisis.title || 'crisi', 100)}`,
            `Nel ${kingdom.name} è attiva la crisi «${clean(crisis.name || crisis.title || crisis.description, 160)}» con severità ${Math.round(number(crisis.severity))}/100. Mostra una conseguenza politica, economica o sociale concreta su fazioni, territori o popolazione già registrati: la crisi non deve restare una statistica.`,
            `crisis:${crisis.id || crisis.name}:${Math.round(number(crisis.severity))}`, [], 2);
        if (number(kingdom.food) <= 0 || number(people.foodSecurity, 50) < 35) push(92, `${kingdom.name}: emergenza alimentare`,
            `Il ${kingdom.name} ha viveri ${number(kingdom.food)} e sicurezza alimentare ${Math.round(number(people.foodSecurity, 50))}%. Popolazione, mercanti, contadini, autorità e fazioni registrate devono reagire con prezzi, proteste, razionamenti, migrazioni o richieste concrete coerenti col mondo.`,
            `food:${Math.round(number(kingdom.food))}:${Math.round(number(people.foodSecurity, 50))}`, [], 3);
        if (number(people.unrest) >= 55 || number(people.approval, 50) < 35) push(90, `${kingdom.name}: tensione politica`,
            `Nel ${kingdom.name} i disordini sono ${Math.round(number(people.unrest))}% e il consenso ${Math.round(number(people.approval, 50))}%. Fazioni, classi sociali e istituzioni registrate devono prendere posizione con petizioni, scioperi, repressione, concessioni, alleanze o proteste coerenti con i loro interessi.`,
            `unrest:${Math.round(number(people.unrest))}:${Math.round(number(people.approval, 50))}`, [], 2);
        if (number(kingdom.stability, 50) < 40 || number(kingdom.legitimacy, 50) < 35) push(84, `${kingdom.name}: autorità fragile`,
            `Il ${kingdom.name} ha stabilità ${Math.round(number(kingdom.stability, 50))}% e legittimità ${Math.round(number(kingdom.legitimacy, 50))}%. Gruppi influenti e istituzioni devono reagire con una mossa politica concreta.`,
            `authority:${Math.round(number(kingdom.stability, 50))}:${Math.round(number(kingdom.legitimacy, 50))}`, [], 3);
        if (number(kingdom.treasury) < 0 || (number(economy.gdp) > 0 && number(economy.debt) > number(economy.gdp) * 0.6)) push(82, `${kingdom.name}: pressione finanziaria`,
            `Il ${kingdom.name} ha tesoro ${number(kingdom.treasury)}, PIL ${number(economy.gdp)} e debito ${number(economy.debt)}. Creditori, mercanti, contribuenti, corte o fazioni registrate devono reagire con condizioni, tagli, nuove entrate, resistenze o opportunità concrete.`,
            `fiscal:${Math.round(number(kingdom.treasury))}:${Math.round(number(economy.debt))}`, [], 3);
        if (number(people.employment, 65) < 70 || number(people.poverty, 35) >= 40) push(75, `${kingdom.name}: lavoro e povertà`,
            `Nel ${kingdom.name} l'occupazione è ${Math.round(number(people.employment, 65))}% e la povertà ${Math.round(number(people.poverty, 35))}%. Usa POP, classi, professioni e territori registrati per produrre una conseguenza sociale concreta su salari, lavoro, migrazione o radicalizzazione.`,
            `labor:${Math.round(number(people.employment, 65))}:${Math.round(number(people.poverty, 35))}`, [], 4);
        if (number(economy.inflation, 2) >= 8) push(72, `${kingdom.name}: inflazione`,
            `L'inflazione del ${kingdom.name} è ${number(economy.inflation)}%. Mercanti, lavoratori, proprietari e governo devono reagire su prezzi, salari, approvvigionamenti o consenso con effetti visibili.`,
            `inflation:${Math.round(number(economy.inflation))}`, [], 4);

        const hostile = asArray(kingdom.factions).filter(faction => faction && (number(faction.hostility) >= 60 || number(faction.loyalty, 50) < 30))
            .sort((a, b) => (number(b.influence) + number(b.hostility)) - (number(a.influence) + number(a.hostility)))[0];
        if (hostile) push(78, `${clean(hostile.name, 100)} prende posizione`,
            `${clean(hostile.name, 100)} nel ${kingdom.name} ha ostilità ${Math.round(number(hostile.hostility))}% e lealtà ${Math.round(number(hostile.loyalty, 50))}%. Fagli compiere una mossa coerente con obiettivi, influenza e risorse già registrati: non limitarti a modificare percentuali.`,
            `faction:${hostile.id || hostile.name}:${Math.round(number(hostile.hostility))}:${Math.round(number(hostile.loyalty, 50))}`, [hostile.name], 3);

        if (!list.length && number(report.balance) > 0 && number(kingdom.prosperity, 50) >= 70 && number(people.approval, 50) >= 65) push(56, `${kingdom.name}: dividendo della prosperità`,
            `Il ${kingdom.name} ha prosperità ${Math.round(number(kingdom.prosperity, 50))}%, consenso ${Math.round(number(people.approval, 50))}% e saldo pubblico positivo ${number(report.balance)}. Mostra un'opportunità concreta per un territorio, una classe o una fazione già registrata, senza inventare una crisi.`,
            `prosperity:${Math.round(number(kingdom.prosperity, 50))}:${Math.round(number(report.balance))}`, [], 5);
        return list;
    }

    function buildAutonomousCandidates(state = getState(), sectorApi = root.CronacheBusinessSpecializations) {
        return [...buildBusinessCandidates(state, sectorApi), ...buildKingdomCandidates(state)].sort((a, b) => b.score - a.score);
    }

    function autonomyMemory(state) {
        if (!state?.worldMemory) return {};
        if (!state.worldMemory.managementAutonomy || typeof state.worldMemory.managementAutonomy !== 'object') {
            state.worldMemory.managementAutonomy = { lastByFingerprint: {}, lastSeeds: [], lastInjectionTurn: -1 };
        }
        const memory = state.worldMemory.managementAutonomy;
        if (!memory.lastByFingerprint || typeof memory.lastByFingerprint !== 'object') memory.lastByFingerprint = {};
        if (!Array.isArray(memory.lastSeeds)) memory.lastSeeds = [];
        if (!Number.isFinite(Number(memory.lastInjectionTurn))) memory.lastInjectionTurn = -1;
        return memory;
    }

    function candidateIsDue(candidate, state) {
        const turn = Math.max(0, number(state?.worldMemory?.turnCount));
        const last = number(autonomyMemory(state).lastByFingerprint[candidate.fingerprint], -9999);
        return turn - last >= Math.max(1, number(candidate.cadence, 3));
    }

    function selectCandidates(state = getState(), sectorApi = root.CronacheBusinessSpecializations) {
        const due = buildAutonomousCandidates(state, sectorApi).filter(candidate => candidateIsDue(candidate, state));
        if (!due.length) return [];
        const selected = [due[0]];
        const otherDomain = due.find(item => item.domain !== due[0].domain && item.score >= 72);
        if (otherDomain) selected.push(otherDomain);
        return selected.slice(0, MAX_AUTONOMOUS_SEEDS);
    }

    function candidateToSeed(candidate, state, timelineApi = root.CronacheTimelineSimulator) {
        if (!candidate || !timelineApi?.normalizeEventSeed) return null;
        const turn = Math.max(0, number(state?.worldMemory?.turnCount));
        const score = Math.max(45, Math.min(98, number(candidate.score, 60)));
        const delay = score >= 90 ? 60 : score >= 80 ? 240 : score >= 70 ? 720 : 1440;
        return timelineApi.normalizeEventSeed({
            id: `management-auto-${candidate.domain}-${hashText(candidate.fingerprint)}-t${turn}`,
            kind: 'world_initiative', title: candidate.title, cause: candidate.cause, actors: candidate.actors,
            priority: score, notBeforeMinutes: delay, interactionMode: 'either', sourceId: candidate.sourceId,
            source: `management-autonomy-${candidate.domain}`, batchId: `management-auto-${turn}`,
            createdAtTurn: turn, originTurn: turn, causalLane: 'world'
        }, 0, { turn, batchId: `management-auto-${turn}` });
    }

    function enqueueAutonomousSeeds(state = getState(), timelineApi = root.CronacheTimelineSimulator, sectorApi = root.CronacheBusinessSpecializations) {
        if (!state?.worldMemory || !timelineApi?.scheduleEventSeeds || !timelineApi?.normalizeEventQueue) return [];
        const turn = Math.max(0, number(state.worldMemory.turnCount));
        const memory = autonomyMemory(state);
        if (number(memory.lastInjectionTurn, -1) === turn) return [];
        const selected = selectCandidates(state, sectorApi);
        memory.lastInjectionTurn = turn;
        if (!selected.length) return [];
        const current = timelineApi.normalizeEventQueue(state.worldMemory.pendingTimelineEvents, { turn });
        const seeds = selected.map(candidate => candidateToSeed(candidate, state, timelineApi)).filter(Boolean);
        if (!seeds.length) return [];
        state.worldMemory.pendingTimelineEvents = timelineApi.scheduleEventSeeds(current, seeds, { turn, batchId: `management-auto-${turn}` });
        selected.forEach(candidate => { memory.lastByFingerprint[candidate.fingerprint] = turn; });
        memory.lastSeeds = [...memory.lastSeeds, ...seeds.map(seed => ({ id: seed.id, title: seed.title, source: seed.source, turn }))].slice(-20);
        return seeds;
    }

    function install(documentRef, windowRef) {
        if (!documentRef || !windowRef || documentRef.__managementAutonomyInstalled) return Boolean(documentRef?.__managementAutonomyInstalled);
        documentRef.addEventListener('click', event => {
            const target = event.target?.closest?.('#btn-advance-world, #btn-simulate-timeline');
            if (!target) return;
            const state = getState();
            if (!state || state.isProcessing) return;
            const seeds = enqueueAutonomousSeeds(state);
            if (seeds.length) {
                try { root.renderTimeline?.(); } catch (_error) { }
            }
        }, true);
        documentRef.__managementAutonomyInstalled = true;
        root.__cronacheManagementAutonomyVersion = PATCH_VERSION;
        return true;
    }

    function scheduleInstall() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        const attempt = () => install(document, window);
        [0, 100, 350, 900, 1800, 3500].forEach(delay => window.setTimeout(attempt, delay));
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attempt, { once: true });
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION, MAX_AUTONOMOUS_SEEDS, hashText, buildBusinessCandidates, buildKingdomCandidates,
        buildAutonomousCandidates, candidateIsDue, candidateToSeed, selectCandidates, enqueueAutonomousSeeds, install
    };
});