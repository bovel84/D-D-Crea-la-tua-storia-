(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheManagementAutonomy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const MAX_AUTONOMOUS_SEEDS = 2;
    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 520) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
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

    function knownBusinessActors(business, employees) {
        const property = clean(business?.propertyName || business?.name, 100).toLowerCase();
        const staff = asArray(employees).filter(employee => {
            const assigned = clean(employee?.property, 100).toLowerCase();
            return employee?.status !== 'fired' && (!assigned || assigned === property);
        });
        const names = [
            ...asArray(business?.customers).map(item => item?.name),
            ...asArray(business?.suppliers).filter(item => item?.status !== 'inactive').map(item => item?.name),
            ...staff.map(item => item?.name),
            ...asArray(business?.contracts).filter(item => item?.status === 'active').map(item => item?.counterpartyName)
        ].map(item => clean(item, 100)).filter(Boolean);
        return [...new Set(names)].slice(0, 6);
    }

    function fallbackBusinessSignal(business) {
        const report = business?.lastReport || {};
        const lowStock = asArray(report.lowStock).length || asArray(business?.products).filter(product =>
            product?.active !== false && number(product?.stock) <= Math.max(0, number(product?.reorderPoint))
        ).length;
        if (number(business?.cash) < 0) return {
            severity: 'critical', score: 96,
            text: `cassa negativa (${number(business.cash)})`,
            cause: `${business.name} ha cassa negativa. Le controparti registrate devono reagire alla tensione finanziaria.`
        };
        if (number(report.netProfit) < 0) return {
            severity: 'warning', score: 72,
            text: `ultimo periodo in perdita (${number(report.netProfit)})`,
            cause: `${business.name} ha chiuso l'ultimo periodo in perdita. Costi, prezzi, domanda e controparti devono produrre una conseguenza concreta.`
        };
        if (lowStock > 0) return {
            severity: 'warning', score: 68,
            text: `${lowStock} prodotti sotto scorta`,
            cause: `${business.name} ha ${lowStock} prodotti sotto scorta. Clienti e fornitori registrati devono reagire alla disponibilità reale della merce.`
        };
        if (number(business?.customerSatisfaction, 60) < 40) return {
            severity: 'warning', score: 70,
            text: `soddisfazione clienti ${Math.round(number(business.customerSatisfaction))}%`,
            cause: `${business.name} ha una soddisfazione clienti bassa. Reclami, abbandoni o richieste di miglioramento devono diventare visibili.`
        };
        return null;
    }

    function buildBusinessCandidates(state, sectorApi) {
        const memory = state?.worldMemory || {};
        const employees = asArray(memory.employees);
        const turn = Math.max(0, number(memory.turnCount));
        const businesses = asArray(memory?.management?.businesses).filter(item => item && item.status === 'active' && item.narrativeInitialized === true);
        return businesses.map(business => {
            const snapshot = sectorApi?.buildSectorSnapshot
                ? sectorApi.buildSectorSnapshot(business, employees, turn)
                : null;
            const signal = snapshot?.primarySignal || fallbackBusinessSignal(business);
            if (!signal) {
                const report = business.lastReport || {};
                const positive = number(report.netProfit) > 0 && number(business.customerSatisfaction, 60) >= 75 && asArray(business.customers).length > 0;
                if (!positive) return null;
                const profile = snapshot?.profile || { key: 'business', label: business.type || 'attività' };
                return {
                    domain: 'business',
                    score: 56,
                    title: `${business.name}: domanda in crescita`,
                    cause: `${business.name}, attività di tipo ${profile.label}, ha chiuso in utile (${number(report.netProfit)}) con soddisfazione clienti ${Math.round(number(business.customerSatisfaction))}%. Usa soltanto clienti, dipendenti, fornitori e contratti già registrati per mostrare una conseguenza concreta della crescita: capacità, condizioni commerciali, ordini o reputazione.`,
                    actors: knownBusinessActors(business, employees),
                    sourceId: business.id || business.name,
                    fingerprint: `business:${business.id || business.name}:growth:${Math.round(number(report.netProfit))}:${Math.round(number(business.customerSatisfaction))}`,
                    cadence: 4
                };
            }
            const profile = snapshot?.profile || { key: business.type || 'business', label: business.type || 'attività' };
            return {
                domain: 'business',
                score: Math.max(45, Math.min(98, number(signal.score, 65))),
                title: `${business.name}: ${profile.label}`,
                cause: `${signal.cause} Stato reale: cassa ${number(business.cash)}, reputazione ${Math.round(number(business.reputation, 50))}%, soddisfazione ${Math.round(number(business.customerSatisfaction, 60))}%. Genera un solo evento concreto coerente con il settore ${profile.label}; non trasformarlo in un generico negozio e non inventare controparti anonime se esistono soggetti registrati.`,
                actors: signal.actors?.length ? signal.actors : knownBusinessActors(business, employees),
                sourceId: business.id || business.name,
                fingerprint: `business:${business.id || business.name}:${profile.key}:${signal.text}`,
                cadence: signal.severity === 'critical' ? 3 : 4
            };
        }).filter(Boolean);
    }

    function factionActors(kingdom) {
        return asArray(kingdom?.factions)
            .filter(item => item && item.name)
            .sort((a, b) => number(b.influence) - number(a.influence))
            .slice(0, 5)
            .map(item => clean(item.name, 100));
    }

    function buildKingdomCandidates(state) {
        const memory = state?.worldMemory || {};
        const kingdom = memory.kingdom || {};
        if (!kingdom.active) return [];
        const candidates = [];
        const actors = factionActors(kingdom);
        const population = Math.max(1, number(kingdom.population, 1));
        const people = kingdom.people || {};
        const economy = kingdom.economy || {};
        const report = kingdom.lastReport || {};
        const push = (score, title, cause, fingerprint, extraActors, cadence = 3) => candidates.push({
            domain: 'kingdom', score, title, cause: clean(cause, 760),
            actors: [...new Set([...(extraActors || []), ...actors])].filter(Boolean).slice(0, 6),
            sourceId: kingdom.name || 'kingdom', fingerprint: `kingdom:${kingdom.name}:${fingerprint}`, cadence
        });

        const severeCrises = asArray(kingdom.crises)
            .filter(crisis => crisis?.status === 'active' && number(crisis.severity) >= 50)
            .sort((a, b) => number(b.severity) - number(a.severity));
        if (severeCrises[0]) {
            const crisis = severeCrises[0];
            push(Math.min(98, Math.max(82, number(crisis.severity))),
                `${kingdom.name}: ${clean(crisis.name || crisis.title || 'crisi', 100)}`,
                `Nel ${kingdom.name} è attiva la crisi «${clean(crisis.name || crisis.title || crisis.description, 140)}» con severità ${Math.round(number(crisis.severity))}/100. Mostra una conseguenza politica, economica o sociale concreta sulle fazioni, sui territori o sulla popolazione già registrati; la crisi non deve restare un numero nel pannello.`,
                `crisis:${crisis.id || crisis.name || crisis.title}:${Math.round(number(crisis.severity))}`, [], 2);
        }
        if (number(kingdom.food) <= 0 || number(people.foodSecurity, 50) < 35) {
            push(92, `${kingdom.name}: emergenza alimentare`,
                `Il ${kingdom.name} ha viveri ${number(kingdom.food)} e sicurezza alimentare ${Math.round(number(people.foodSecurity, 50))}%. Popolazione, mercanti, contadini, autorità locali e fazioni registrate devono reagire con prezzi, proteste, razionamenti, migrazioni o richieste concrete coerenti con il mondo.`,
                `food:${Math.round(number(kingdom.food))}:${Math.round(number(people.foodSecurity, 50))}`, [], 3);
        }
        if (number(people.unrest) >= 55 || number(people.approval, 50) < 35) {
            push(90, `${kingdom.name}: tensione politica`,
                `Nel ${kingdom.name} i disordini sono al ${Math.round(number(people.unrest))}% e il consenso al ${Math.round(number(people.approval, 50))}%. Fazioni, classi sociali e istituzioni registrate devono prendere posizione in modo osservabile: petizioni, scioperi, repressione, concessioni, alleanze o proteste coerenti con i loro interessi.`,
                `unrest:${Math.round(number(people.unrest))}:${Math.round(number(people.approval, 50))}`, [], 2);
        }
        if (number(kingdom.stability, 50) < 40 || number(kingdom.legitimacy, 50) < 35) {
            push(84, `${kingdom.name}: autorità fragile`,
                `Il ${kingdom.name} ha stabilità ${Math.round(number(kingdom.stability, 50))}% e legittimità ${Math.round(number(kingdom.legitimacy, 50))}%. I gruppi con influenza e le istituzioni devono reagire alla fragilità dell'autorità con una mossa politica concreta.`,
                `authority:${Math.round(number(kingdom.stability, 50))}:${Math.round(number(kingdom.legitimacy, 50))}`, [], 3);
        }
        if (number(kingdom.treasury) < 0 || (number(economy.gdp) > 0 && number(economy.debt) > number(economy.gdp) * 0.6)) {
            push(82, `${kingdom.name}: pressione fiscale e finanziaria`,
                `Il ${kingdom.name} ha tesoro ${number(kingdom.treasury)}, PIL ${number(economy.gdp)} e debito ${number(economy.debt)}. Creditori, mercanti, contribuenti, corte o fazioni registrate devono reagire alle finanze pubbliche con condizioni, tagli, nuove entrate, resistenze o opportunità concrete.`,
                `fiscal:${Math.round(number(kingdom.treasury))}:${Math.round(number(economy.debt))}`, [], 3);
        }
        if (number(people.employment, 65) < 70 || number(people.poverty, 35) >= 40) {
            push(75, `${kingdom.name}: lavoro e povertà`,
                `Nel ${kingdom.name} l'occupazione è ${Math.round(number(people.employment, 65))}% e la povertà ${Math.round(number(people.poverty, 35))}%. Usa POP, classi sociali, professioni e territori già registrati per produrre una conseguenza sociale concreta: domanda di lavoro, salari, migrazione, radicalizzazione o pressione politica.`,
                `labor:${Math.round(number(people.employment, 65))}:${Math.round(number(people.poverty, 35))}`, [], 4);
        }
        if (number(economy.inflation, 2) >= 8) {
            push(72, `${kingdom.name}: inflazione`,
                `L'inflazione del ${kingdom.name} è ${number(economy.inflation)}%. Mercanti, lavoratori, proprietari e governo devono reagire su prezzi, salari, approvvigionamenti o consenso con effetti visibili.`,
                `inflation:${Math.round(number(economy.inflation))}`, [], 4);
        }
        const hostileFaction = asArray(kingdom.factions)
            .filter(faction => faction && (number(faction.hostility) >= 60 || number(faction.loyalty, 50) < 30))
            .sort((a, b) => number(b.influence) + number(b.hostility) - number(a.influence) - number(a.hostility))[0];
        if (hostileFaction) {
            push(78, `${clean(hostileFaction.name, 100)} prende posizione`,
                `${clean(hostileFaction.name, 100)} nel ${kingdom.name} ha ostilità ${Math.round(number(hostileFaction.hostility))}% e lealtà ${Math.round(number(hostileFaction.loyalty, 50))}%. Fagli compiere una mossa coerente con obiettivi, influenza e risorse già registrati; non limitarti a modificare la percentuale.`,
                `faction:${hostileFaction.id || hostileFaction.name}:${Math.round(number(hostileFaction.hostility))}:${Math.round(number(hostileFaction.loyalty, 50))}`,
                [hostileFaction.name], 3);
        }
        if (!candidates.length && number(report.balance) > 0 && number(kingdom.prosperity, 50) >= 70 && number(people.approval, 50) >= 65) {
            push(56, `${kingdom.name}: dividendo della prosperità`,
                `Il ${kingdom.name} ha prosperità ${Math.round(number(kingdom.prosperity, 50))}%, consenso ${Math.round(number(people.approval, 50))}% e ultimo saldo pubblico positivo (${number(report.balance)}). Mostra un'opportunità concreta creata da questa fase favorevole per un territorio, una classe o una fazione già registrata, senza inventare una crisi.`,
                `prosperity:${Math.round(number(kingdom.prosperity, 50))}:${Math.round(number(report.balance))}`, [], 5);
        }
        return candidates;
    }

    function buildAutonomousCandidates(state = getState(), sectorApi = root.CronacheBusinessSpecializations) {
        return [
            ...buildBusinessCandidates(state, sectorApi),
            ...buildKingdomCandidates(state)
        ].sort((a, b) => b.score - a.score);
    }

    function autonomyMemory(state) {
        if (!state?.worldMemory) return {};
        if (!state.worldMemory.managementAutonomy || typeof state.worldMemory.managementAutonomy !== 'object') {
            state.worldMemory.managementAutonomy = { lastByFingerprint: {}, lastSeeds: [] };
        }
        const memory = state.worldMemory.managementAutonomy;
        if (!memory.lastByFingerprint || typeof memory.lastByFingerprint !== 'object') memory.lastByFingerprint = {};
        if (!Array.isArray(memory.lastSeeds)) memory.lastSeeds = [];
        return memory;
    }

    function candidateIsDue(candidate, state) {
        const turn = Math.max(0, number(state?.worldMemory?.turnCount));
        const memory = autonomyMemory(state);
        const last = number(memory.lastByFingerprint[candidate.fingerprint], -9999);
        return turn - last >= Math.max(1, number(candidate.cadence, 3));
    }

    function candidateToSeed(candidate, state, timelineApi = root.CronacheTimelineSimulator) {
        if (!candidate || !timelineApi?.normalizeEventSeed) return null;
        const turn = Math.max(0, number(state?.worldMemory?.turnCount));
        const score = Math.max(45, Math.min(98, number(candidate.score, 60)));
        const delay = score >= 90 ? 60 : score >= 80 ? 240 : score >= 70 ? 720 : 1440;
        const fingerprintHash = hashText(candidate.fingerprint);
        return timelineApi.normalizeEventSeed({
            id: `management-auto-${candidate.domain}-${fingerprintHash}-t${turn}`,
            kind: 'world_initiative',
            title: candidate.title,
            cause: candidate.cause,
            actors: candidate.actors,
            priority: score,
            notBeforeMinutes: delay,
            interactionMode: 'either',
            sourceId: candidate.sourceId,
            source: `management-autonomy-${candidate.domain}`,
            batchId: `management-auto-${turn}`,
            createdAtTurn: turn,
            originTurn: turn,
            causalLane: 'world'
        }, 0, { turn, batchId: `management-auto-${turn}` });
    }

    function selectCandidates(state = getState(), sectorApi = root.CronacheBusinessSpecializations) {
        const due = buildAutonomousCandidates(state, sectorApi).filter(candidate => candidateIsDue(candidate, state));
        if (!due.length) return [];
        const selected = [due[0]];
        const otherDomain = due.find(candidate => candidate.domain !== due[0].domain && candidate.score >= 72);
        if (otherDomain) selected.push(otherDomain);
        return selected.slice(0, MAX_AUTONOMOUS_SEEDS);
    }

    function enqueueAutonomousSeeds(state = getState(), timelineApi = root.CronacheTimelineSimulator, sectorApi = root.CronacheBusinessSpecializations) {
        if (!state?.worldMemory || !timelineApi?.scheduleEventSeeds || !timelineApi?.normalizeEventQueue) return [];
        const selected = selectCandidates(state, sectorApi);
        if (!selected.length) return [];
        const current = timelineApi.normalizeEventQueue(state.worldMemory.pendingTimelineEvents, { turn: state.worldMemory.turnCount });
        const existingSources = new Set(current.map(seed => `${seed.source || ''}|${seed.sourceId || ''}|${clean(seed.cause, 220)}`));
        const seeds = selected.map(candidate => candidateToSeed(candidate, state, timelineApi)).filter(seed => {
            if (!seed) return false;
            const key = `${seed.source || ''}|${seed.sourceId || ''}|${clean(seed.cause, 220)}`;
            return !existingSources.has(key);
        });
        if (!seeds.length) return [];
        state.worldMemory.pendingTimelineEvents = timelineApi.scheduleEventSeeds(current, seeds, {
            turn: state.worldMemory.turnCount,
            batchId: `management-auto-${state.worldMemory.turnCount || 0}`
        });
        const memory = autonomyMemory(state);
        selected.forEach(candidate => { memory.lastByFingerprint[candidate.fingerprint] = Math.max(0, number(state.worldMemory.turnCount)); });
        memory.lastSeeds = [
            ...memory.lastSeeds,
            ...seeds.map(seed => ({ id: seed.id, title: seed.title, source: seed.source, turn: state.worldMemory.turnCount || 0 }))
        ].slice(-20);
        return seeds;
    }

    function install(documentRef, windowRef) {
        if (!documentRef || !windowRef || documentRef.__managementAutonomyInstalled) return Boolean(documentRef?.__managementAutonomyInstalled);
        const beforeAdvance = event => {
            const target = event.target?.closest?.('#btn-advance-world, #btn-simulate-timeline');
            if (!target) return;
            const state = getState();
            if (!state || state.isProcessing) return;
            const seeds = enqueueAutonomousSeeds(state);
            if (seeds.length) {
                try { if (typeof root.renderTimeline === 'function') root.renderTimeline(); } catch (_error) { }
            }
        };
        documentRef.addEventListener('click', beforeAdvance, true);
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
        PATCH_VERSION,
        MAX_AUTONOMOUS_SEEDS,
        hashText,
        buildBusinessCandidates,
        buildKingdomCandidates,
        buildAutonomousCandidates,
        candidateIsDue,
        candidateToSeed,
        selectCandidates,
        enqueueAutonomousSeeds,
        install
    };
});