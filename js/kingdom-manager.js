(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheKingdom = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SCHEMA_VERSION = 4;
    const MAX_HISTORY = 100;
    const MAX_PROCESSED_EVENTS = 240;
    const MAX_STAT_SNAPSHOTS = 24;
    const SOCIAL_CLASSES = {
        nobles: 'Nobiltà', clergy: 'Clero', merchants: 'Mercanti',
        artisans: 'Artigiani e gilde', peasants: 'Contadini',
        workers: 'Lavoratori', marginalized: 'Emarginati'
    };
    const OCCUPATIONS = {
        unemployed: { name: 'Disoccupati', stratum: 'lower', minEducation: 0, wage: 0, classKey: 'marginalized', allowed: '*' },
        peasants: { name: 'Contadini', stratum: 'lower', minEducation: 0, wage: 1.4, classKey: 'peasants', allowed: 'peasants,marginalized' },
        laborers: { name: 'Braccianti e operai', stratum: 'lower', minEducation: 0, wage: 1.8, classKey: 'workers', allowed: 'workers,peasants,marginalized' },
        soldiers: { name: 'Soldati', stratum: 'lower', minEducation: 5, wage: 2.2, classKey: 'workers', allowed: 'workers,peasants,marginalized' },
        artisans: { name: 'Artigiani', stratum: 'middle', minEducation: 15, wage: 3, classKey: 'artisans', allowed: 'artisans,workers,peasants' },
        clergy: { name: 'Clero', stratum: 'middle', minEducation: 25, wage: 3.4, classKey: 'clergy', allowed: 'clergy,nobles,artisans' },
        merchants: { name: 'Mercanti', stratum: 'middle', minEducation: 25, wage: 4, classKey: 'merchants', allowed: 'merchants,artisans,nobles' },
        clerks: { name: 'Impiegati', stratum: 'middle', minEducation: 35, wage: 4.2, classKey: 'workers', allowed: 'workers,artisans,merchants' },
        bureaucrats: { name: 'Burocrati', stratum: 'middle', minEducation: 45, wage: 5.2, classKey: 'artisans', allowed: 'artisans,merchants,nobles,clergy' },
        officers: { name: 'Ufficiali', stratum: 'middle', minEducation: 45, wage: 5.5, classKey: 'nobles', allowed: 'nobles,artisans,merchants,workers' },
        engineers: { name: 'Ingegneri', stratum: 'middle', minEducation: 60, wage: 7, classKey: 'artisans', allowed: 'artisans,workers,merchants,nobles' },
        academics: { name: 'Accademici', stratum: 'middle', minEducation: 65, wage: 7.5, classKey: 'artisans', allowed: 'artisans,clergy,nobles,merchants' },
        aristocrats: { name: 'Aristocratici', stratum: 'upper', minEducation: 20, wage: 8, classKey: 'nobles', allowed: 'nobles' },
        capitalists: { name: 'Proprietari e capitalisti', stratum: 'upper', minEducation: 50, wage: 10, classKey: 'merchants', allowed: 'merchants,nobles' }
    };

    function clean(value, limit = 180) {
        const text = String(value == null ? '' : value)
            .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
        return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
    }

    function keyOf(value) {
        return clean(value, 120).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    function parseNumber(value, fallback = null) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
        const raw = String(value == null ? '' : value).trim();
        if (!raw) return fallback;
        const match = raw.replace(/\s+/g, '').match(/[+-]?(?:\d[\d.,]*|[.,]\d+)/);
        if (!match) return fallback;
        let normalized = match[0];
        const comma = normalized.lastIndexOf(',');
        const dot = normalized.lastIndexOf('.');
        if (comma >= 0 && dot >= 0) {
            const decimal = comma > dot ? ',' : '.';
            normalized = normalized.split(decimal === ',' ? '.' : ',').join('').replace(decimal, '.');
        } else {
            const separator = comma >= 0 ? ',' : dot >= 0 ? '.' : '';
            if (separator) {
                const chunks = normalized.split(separator);
                normalized = chunks.length > 2 || (chunks.length === 2 && chunks[1].length === 3)
                    ? chunks.join('') : normalized.replace(separator, '.');
            }
        }
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function integer(value, fallback = 0) {
        const parsed = parseNumber(value, fallback);
        return Math.round(parsed == null ? fallback : parsed);
    }

    function clamp(value, min = 0, max = 100) {
        const parsed = parseNumber(value, min);
        return Math.max(min, Math.min(max, parsed == null ? min : parsed));
    }

    function compactPatch(raw) {
        return Object.fromEntries(Object.entries(raw || {}).filter(([, value]) =>
            value !== '' && value !== null && value !== undefined
        ));
    }

    function createClass(key, population = 0) {
        return {
            key,
            name: SOCIAL_CLASSES[key] || clean(key, 80) || 'Altro',
            population: Math.max(0, integer(population)),
            wealth: key === 'nobles' ? 85 : key === 'clergy' || key === 'merchants' ? 65 : 30,
            loyalty: 50,
            influence: key === 'nobles' || key === 'clergy' ? 70 : 35,
            needs: ''
        };
    }

    function defaultClasses(population = 0) {
        const shares = {
            nobles: 0.02, clergy: 0.04, merchants: 0.06, artisans: 0.12,
            peasants: 0.56, workers: 0.15, marginalized: 0.05
        };
        let assigned = 0;
        const classes = Object.keys(SOCIAL_CLASSES).map((key, index, all) => {
            const count = index === all.length - 1
                ? Math.max(0, population - assigned)
                : Math.round(population * shares[key]);
            assigned += count;
            return createClass(key, count);
        });
        return classes;
    }

    function resolveClassKey(value, fallback = 'workers') {
        const sourceKey = keyOf(value);
        const alias = {
            nobilta: 'nobles', nobility: 'nobles', clero: 'clergy',
            mercanti: 'merchants', artigiani: 'artisans', gilde: 'artisans',
            contadini: 'peasants', lavoratori: 'workers', emarginati: 'marginalized'
        };
        return alias[sourceKey] || (SOCIAL_CLASSES[sourceKey] ? sourceKey : sourceKey || fallback);
    }

    function defaultPops(classes, territoryName = '') {
        const defaults = {
            nobles: ['aristocrats', 48], clergy: ['clergy', 45],
            merchants: ['merchants', 38], artisans: ['artisans', 28],
            peasants: ['peasants', 10], workers: ['laborers', 16],
            marginalized: ['unemployed', 6]
        };
        return classes.filter(item => item.population > 0).map((item, index) => {
            const [profession, education] = defaults[item.key] || ['laborers', 10];
            return normalizePop({
                id: `pop-${item.key}-${index + 1}`,
                name: `${item.name} ${territoryName ? 'di ' + territoryName : 'del regno'}`,
                classKey: item.key,
                territoryName,
                culture: 'cultura principale',
                faith: 'fede principale',
                profession,
                population: item.population,
                employed: profession === 'unemployed' ? 0 : Math.round(item.population * 0.88),
                education,
                literacy: Math.max(5, education),
                qualifications: education,
                income: OCCUPATIONS[profession]?.wage || 0,
                standardOfLiving: Math.max(4, Math.round(item.wealth / 5)),
                basicNeeds: clamp(45 + item.wealth / 2),
                comfortNeeds: clamp(item.wealth / 1.4),
                luxuryNeeds: clamp(item.wealth / 2.5),
                loyalists: 8,
                radicals: 5,
                desires: item.needs
            }, index);
        });
    }

    function defaultJobs(population = 0, territoryName = '') {
        const shares = {
            peasants: 0.4, laborers: 0.16, soldiers: 0.03, artisans: 0.1,
            clergy: 0.035, merchants: 0.055, clerks: 0.05, bureaucrats: 0.025,
            officers: 0.01, engineers: 0.008, academics: 0.007,
            aristocrats: 0.02, capitalists: 0.01
        };
        return Object.entries(shares).map(([profession, share], index) =>
            normalizeJob({
                id: `job-${profession}-${index + 1}`,
                territoryName,
                profession,
                positions: Math.round(population * share),
                employed: 0,
                wage: OCCUPATIONS[profession].wage,
                minEducation: OCCUPATIONS[profession].minEducation,
                allowedClasses: OCCUPATIONS[profession].allowed,
                status: 'active'
            }, index)
        );
    }

    function createDefaultKingdom() {
        return {
            schemaVersion: SCHEMA_VERSION,
            active: false,
            initialized: false,
            name: '',
            rulerTitle: '',
            rulerName: '',
            government: '',
            capital: '',
            treasury: 0,
            population: 0,
            stability: 50,
            legitimacy: 50,
            prosperity: 50,
            food: 0,
            period: 0,
            lastPeriodTurn: 0,
            taxRate: 10,
            people: {
                approval: 50, unrest: 20, health: 50, literacy: 25,
                employment: 65, poverty: 35, foodSecurity: 50,
                housing: 50, crime: 20, birthRate: 12,
                deathRate: 9, migration: 0, averageLivingStandard: 8,
                loyalists: 0, radicals: 0, classes: defaultClasses(0), pops: [],
                popsInitializedByNarrator: false
            },
            economy: {
                gdp: 0, tradeBalance: 0, inflation: 2, debt: 0,
                administrationEfficiency: 50
            },
            services: {
                infrastructure: 40, healthcare: 30, education: 25,
                justice: 40, sanitation: 30
            },
            army: {
                levies: 0, professionals: 0, cavalry: 0, navy: 0,
                morale: 50, readiness: 50, upkeep: 0
            },
            territories: [],
            jobs: [],
            resources: [],
            crises: [],
            factions: [],
            diplomacy: [],
            laws: [],
            council: [],
            governance: {
                lastAssessmentTurn: 0,
                lastStatisticsTurn: 0,
                statisticsSource: '',
                summary: '',
                priorities: [],
                confidence: 0
            },
            statisticsHistory: [],
            history: [],
            processedNarrativeEvents: [],
            lastReport: {
                period: 0, income: 0, armyUpkeep: 0, administration: 0,
                servicesCost: 0, balance: 0, foodProduced: 0, foodConsumed: 0,
                foodBalance: 0, populationDelta: 0, approvalDelta: 0,
                unrestDelta: 0, gdp: 0, employed: 0, unemployed: 0,
                qualificationsBlocked: 0, promoted: 0, warnings: []
            },
            settings: { periodTurns: 5 }
        };
    }

    function normalizeArmy(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        return {
            levies: Math.max(0, integer(source.levies)),
            professionals: Math.max(0, integer(source.professionals)),
            cavalry: Math.max(0, integer(source.cavalry)),
            navy: Math.max(0, integer(source.navy)),
            morale: clamp(source.morale ?? 50),
            readiness: clamp(source.readiness ?? 50),
            upkeep: Math.max(0, integer(source.upkeep))
        };
    }

    function normalizePop(raw, index = 0) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const profession = OCCUPATIONS[keyOf(source.profession)] ? keyOf(source.profession) : 'unemployed';
        const classKey = resolveClassKey(source.classKey || source.socialClass, OCCUPATIONS[profession].classKey);
        const population = Math.max(0, integer(source.population));
        const employed = Math.max(0, Math.min(population, integer(source.employed)));
        const name = clean(source.name || `${SOCIAL_CLASSES[classKey] || classKey} ${index + 1}`, 120);
        return {
            id: clean(source.id || source.popId || `pop-${keyOf(name) || index + 1}`, 140),
            name,
            classKey,
            territoryName: clean(source.territoryName || '', 100),
            culture: clean(source.culture || 'cultura principale', 80),
            faith: clean(source.faith || 'fede principale', 80),
            profession,
            population,
            employed,
            unemployed: Math.max(0, population - employed),
            education: clamp(source.education ?? source.instruction ?? 10),
            literacy: clamp(source.literacy ?? source.education ?? 10),
            qualifications: clamp(source.qualifications ?? source.education ?? 10),
            income: Math.max(0, parseNumber(source.income, OCCUPATIONS[profession].wage)),
            standardOfLiving: Math.max(1, Math.min(30, parseNumber(source.standardOfLiving, 8))),
            needs: {
                basic: clamp(source.basicNeeds ?? source.needs?.basic ?? 50),
                comfort: clamp(source.comfortNeeds ?? source.needs?.comfort ?? 25),
                luxury: clamp(source.luxuryNeeds ?? source.needs?.luxury ?? 5)
            },
            loyalists: Math.max(0, Math.min(population, integer(source.loyalists))),
            radicals: Math.max(0, Math.min(population, integer(source.radicals))),
            desires: clean(source.desires || source.needsText || '', 220)
        };
    }

    function normalizeJob(raw, index = 0) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const profession = OCCUPATIONS[keyOf(source.profession)] ? keyOf(source.profession) : 'laborers';
        const profile = OCCUPATIONS[profession];
        const positions = Math.max(0, integer(source.positions));
        return {
            id: clean(source.id || `job-${keyOf(source.territoryName)}-${profession}-${index + 1}`, 140),
            territoryName: clean(source.territoryName || '', 100),
            profession,
            name: clean(source.name || profile.name, 100),
            positions,
            employed: Math.max(0, Math.min(positions, integer(source.employed))),
            vacancies: Math.max(0, positions - integer(source.employed)),
            wage: Math.max(0, parseNumber(source.wage, profile.wage)),
            minEducation: Math.max(profile.minEducation, clamp(source.minEducation ?? profile.minEducation)),
            allowedClasses: clean(source.allowedClasses || profile.allowed, 160),
            status: clean(source.status || 'active', 40)
        };
    }

    function normalizePeople(raw, population = 0) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const classes = Array.isArray(source.classes) && source.classes.length
            ? source.classes.map((item, index) => normalizeSocialClass(item, index))
            : defaultClasses(population);
        const pops = Array.isArray(source.pops) && source.pops.length
            ? source.pops.map((item, index) => normalizePop(item, index))
            : defaultPops(classes);
        return {
            approval: clamp(source.approval ?? 50),
            unrest: clamp(source.unrest ?? 20),
            health: clamp(source.health ?? 50),
            literacy: clamp(source.literacy ?? 25),
            employment: clamp(source.employment ?? 65),
            poverty: clamp(source.poverty ?? 35),
            foodSecurity: clamp(source.foodSecurity ?? 50),
            housing: clamp(source.housing ?? 50),
            crime: clamp(source.crime ?? 20),
            birthRate: Math.max(0, parseNumber(source.birthRate, 12)),
            deathRate: Math.max(0, parseNumber(source.deathRate, 9)),
            migration: integer(source.migration),
            averageLivingStandard: Math.max(1, Math.min(30, parseNumber(source.averageLivingStandard, 8))),
            loyalists: Math.max(0, integer(source.loyalists)),
            radicals: Math.max(0, integer(source.radicals)),
            classes,
            pops,
            popsInitializedByNarrator: source.popsInitializedByNarrator === true
        };
    }

    function normalizeEconomy(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        return {
            gdp: Math.max(0, integer(source.gdp)),
            tradeBalance: integer(source.tradeBalance),
            inflation: Math.max(-20, Math.min(200, parseNumber(source.inflation, 2))),
            debt: Math.max(0, integer(source.debt)),
            administrationEfficiency: clamp(source.administrationEfficiency ?? 50)
        };
    }

    function normalizeServices(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        return {
            infrastructure: clamp(source.infrastructure ?? 40),
            healthcare: clamp(source.healthcare ?? 30),
            education: clamp(source.education ?? 25),
            justice: clamp(source.justice ?? 40),
            sanitation: clamp(source.sanitation ?? 30)
        };
    }

    function normalizeGovernance(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        return {
            lastAssessmentTurn: Math.max(0, integer(source.lastAssessmentTurn)),
            lastStatisticsTurn: Math.max(0, integer(source.lastStatisticsTurn)),
            statisticsSource: clean(source.statisticsSource || '', 80),
            summary: clean(source.summary || '', 400),
            priorities: Array.isArray(source.priorities)
                ? source.priorities.map(value => clean(value, 180)).filter(Boolean).slice(0, 3) : [],
            confidence: clamp(source.confidence ?? 0)
        };
    }

    function normalizeTerritory(raw, index = 0) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const name = clean(source.name || `Territorio ${index + 1}`, 100);
        return {
            id: clean(source.id || `territory-${keyOf(name) || index + 1}`, 120),
            name,
            type: clean(source.territoryType || source.type || 'dominio', 60),
            capital: clean(source.capital || source.mainSettlement || '', 100),
            population: Math.max(0, integer(source.population)),
            foodProduction: Math.max(0, integer(source.foodProduction)),
            taxIncome: Math.max(0, integer(source.taxIncome)),
            fortification: clamp(source.fortification ?? 0),
            loyalty: clamp(source.loyalty ?? 50),
            prosperity: clamp(source.prosperity ?? 50),
            publicOrder: clamp(source.publicOrder ?? source.order ?? 50),
            health: clamp(source.health ?? 50),
            infrastructure: clamp(source.infrastructure ?? 40),
            employment: clamp(source.employment ?? 65),
            poverty: clamp(source.poverty ?? 35),
            controller: clean(source.controller || '', 100),
            strategicResource: clean(source.strategicResource || '', 120),
            status: clean(source.status || 'controllato', 40)
        };
    }

    function normalizeSocialClass(raw, index = 0) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const key = resolveClassKey(source.classKey || source.key || source.name, `class-${index + 1}`);
        return {
            key,
            name: clean(source.name || SOCIAL_CLASSES[key] || source.classKey || `Classe ${index + 1}`, 80),
            population: Math.max(0, integer(source.population)),
            wealth: clamp(source.wealth ?? 30),
            loyalty: clamp(source.loyalty ?? 50),
            influence: clamp(source.influence ?? 30),
            needs: clean(source.needs || '', 220)
        };
    }

    function normalizeResource(raw, index = 0) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const name = clean(source.name || `Risorsa ${index + 1}`, 100);
        return {
            id: clean(source.id || `resource-${keyOf(source.territoryName)}-${keyOf(name) || index + 1}`, 140),
            territoryName: clean(source.territoryName || '', 100),
            name,
            category: clean(source.category || 'materia prima', 70),
            production: Math.max(0, integer(source.production)),
            stock: Math.max(0, integer(source.stock)),
            unitValue: Math.max(0, parseNumber(source.unitValue ?? source.value, 0)),
            status: clean(source.status || 'attiva', 50)
        };
    }

    function normalizeCrisis(raw, index = 0) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const name = clean(source.name || `Crisi ${index + 1}`, 120);
        return {
            id: clean(source.id || `crisis-${keyOf(name) || index + 1}`, 140),
            name,
            severity: clamp(source.severity ?? 25),
            territoryName: clean(source.territoryName || '', 100),
            effect: clean(source.effect || '', 240),
            status: clean(source.status || 'active', 40)
        };
    }

    function normalizeFaction(raw, index = 0) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const name = clean(source.name || `Fazione ${index + 1}`, 100);
        return {
            id: clean(source.id || `faction-${keyOf(name) || index + 1}`, 120),
            name, category: clean(source.category || 'altro', 70),
            leader: clean(source.leader || '', 100), power: clamp(source.power ?? 25),
            loyalty: clamp(source.loyalty ?? 50), wealth: clamp(source.wealth ?? 25),
            goal: clean(source.goal || '', 180), status: clean(source.status || 'attiva', 50)
        };
    }

    function normalizeDiplomacy(raw, index = 0) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const realm = clean(source.realm || source.name || `Regno ${index + 1}`, 100);
        return {
            id: clean(source.id || `diplomacy-${keyOf(realm) || index + 1}`, 120),
            realm, relation: clean(source.relation || 'neutrale', 50),
            trust: clamp(source.trust ?? 50), tension: clamp(source.tension ?? 20),
            treaty: clean(source.treaty || '', 120), trade: clean(source.trade || '', 120),
            claims: clean(source.claims || '', 160)
        };
    }

    function normalizeLaw(raw, index = 0) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const title = clean(source.title || `Legge ${index + 1}`, 120);
        return {
            id: clean(source.id || `law-${keyOf(title) || index + 1}`, 140),
            title, area: clean(source.area || 'generale', 60),
            effect: clean(source.effect || '', 200), status: clean(source.status || 'in vigore', 50),
            support: clean(source.support || '', 140), opposition: clean(source.opposition || '', 140)
        };
    }

    function normalizeCouncilor(raw, index = 0) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const name = clean(source.name || `Consigliere ${index + 1}`, 100);
        return {
            id: clean(source.id || `council-${keyOf(name) || index + 1}`, 120),
            name, role: clean(source.role || 'consigliere', 80),
            competence: clamp(source.competence ?? 50), loyalty: clamp(source.loyalty ?? 50),
            faction: clean(source.faction || '', 100), status: clean(source.status || 'attivo', 50)
        };
    }

    function migrateKingdom(input) {
        const base = createDefaultKingdom();
        const source = input && typeof input === 'object' ? input : {};
        const population = Math.max(0, integer(source.population));
        const people = normalizePeople(source.people, population);
        const savedPops = Array.isArray(source.people?.pops) ? source.people.pops : [];
        if (!savedPops.length && population > 0) {
            people.pops = defaultPops(people.classes, clean(source.capital, 100));
        }
        const defaultPopId = /^pop-(?:nobles|clergy|merchants|artisans|peasants|workers|marginalized)-\d+$/;
        if (!people.popsInitializedByNarrator && savedPops.some(pop => !defaultPopId.test(clean(pop.id)))) {
            people.popsInitializedByNarrator = true;
        }
        const jobs = Array.isArray(source.jobs) && source.jobs.length
            ? source.jobs.map((item, index) => normalizeJob(item, index))
            : defaultJobs(population, clean(source.capital, 100));
        return {
            ...base, ...source, schemaVersion: SCHEMA_VERSION,
            active: source.active === true || Boolean(clean(source.name)),
            initialized: source.initialized === true || Boolean(clean(source.name)),
            name: clean(source.name, 100), rulerTitle: clean(source.rulerTitle, 80),
            rulerName: clean(source.rulerName, 100), government: clean(source.government, 100),
            capital: clean(source.capital, 100), treasury: integer(source.treasury),
            population, stability: clamp(source.stability ?? 50),
            legitimacy: clamp(source.legitimacy ?? 50), prosperity: clamp(source.prosperity ?? 50),
            food: Math.max(0, integer(source.food)), period: Math.max(0, integer(source.period)),
            lastPeriodTurn: Math.max(0, integer(source.lastPeriodTurn)),
            taxRate: clamp(source.taxRate ?? 10, 0, 40),
            people,
            economy: normalizeEconomy(source.economy),
            services: normalizeServices(source.services),
            army: normalizeArmy(source.army),
            territories: Array.isArray(source.territories) ? source.territories.map(normalizeTerritory) : [],
            jobs,
            resources: Array.isArray(source.resources) ? source.resources.map(normalizeResource) : [],
            crises: Array.isArray(source.crises) ? source.crises.map(normalizeCrisis) : [],
            factions: Array.isArray(source.factions) ? source.factions.map(normalizeFaction) : [],
            diplomacy: Array.isArray(source.diplomacy) ? source.diplomacy.map(normalizeDiplomacy) : [],
            laws: Array.isArray(source.laws) ? source.laws.map(normalizeLaw) : [],
            council: Array.isArray(source.council) ? source.council.map(normalizeCouncilor) : [],
            governance: normalizeGovernance(source.governance),
            statisticsHistory: Array.isArray(source.statisticsHistory)
                ? source.statisticsHistory.slice(-MAX_STAT_SNAPSHOTS) : [],
            history: Array.isArray(source.history) ? source.history.slice(-MAX_HISTORY) : [],
            processedNarrativeEvents: Array.isArray(source.processedNarrativeEvents)
                ? source.processedNarrativeEvents.slice(-MAX_PROCESSED_EVENTS) : [],
            settings: { periodTurns: Math.max(1, integer(source.settings?.periodTurns, 5)) },
            lastReport: { ...base.lastReport, ...(source.lastReport || {}) }
        };
    }

    function upsert(collection, raw, normalize, identity) {
        const patch = compactPatch(raw);
        const probe = normalize(patch, collection.length);
        const key = keyOf(identity(probe));
        const index = collection.findIndex(item => keyOf(identity(item)) === key);
        if (index >= 0) collection[index] = normalize({ ...collection[index], ...patch }, index);
        else collection.push(probe);
        return index >= 0 ? collection[index] : probe;
    }

    function addHistory(state, text, turn, type = 'evento') {
        const entry = { turn: Math.max(0, integer(turn)), type: clean(type, 40), text: clean(text, 300) };
        if (entry.text) state.history.push(entry);
        state.history = state.history.slice(-MAX_HISTORY);
        return entry;
    }

    function eventFingerprint(event, turn) {
        return `${Math.max(0, integer(turn))}:${keyOf(JSON.stringify(event))}`;
    }

    function parseNarrativeTags(response) {
        const source = String(response || '').replace(/\[ANALISI\][\s\S]*?\[\/ANALISI\]/gi, '');
        const events = [];
        const map = {
            REGNO: ['profile', ['name', 'rulerTitle', 'rulerName', 'government', 'capital', 'treasury', 'population', 'stability', 'legitimacy', 'prosperity', 'food']],
            POPOLO_REGNO: ['people', ['kingdomName', 'approval', 'unrest', 'health', 'literacy', 'employment', 'poverty', 'foodSecurity', 'housing', 'crime', 'averageLivingStandard', 'loyalists', 'radicals']],
            CLASSE_REGNO: ['socialClass', ['kingdomName', 'classKey', 'population', 'wealth', 'loyalty', 'influence', 'needs']],
            POP_REGNO: ['pop', ['kingdomName', 'popId', 'name', 'classKey', 'territoryName', 'culture', 'faith', 'profession', 'population', 'employed', 'education', 'literacy', 'qualifications', 'income', 'standardOfLiving', 'basicNeeds', 'comfortNeeds', 'luxuryNeeds', 'loyalists', 'radicals', 'desires']],
            LAVORO_REGNO: ['job', ['kingdomName', 'territoryName', 'profession', 'positions', 'employed', 'wage', 'minEducation', 'allowedClasses', 'status']],
            STATISTICHE_REGNO: ['statistics', ['kingdomName', 'gdp', 'tradeBalance', 'inflation', 'debt', 'administrationEfficiency', 'birthRate', 'deathRate', 'migration']],
            SERVIZI_REGNO: ['services', ['kingdomName', 'infrastructure', 'healthcare', 'education', 'justice', 'sanitation']],
            TERRITORIO_REGNO: ['territory', ['kingdomName', 'name', 'territoryType', 'population', 'foodProduction', 'taxIncome', 'fortification', 'loyalty', 'controller', 'strategicResource', 'status', 'prosperity', 'publicOrder', 'health', 'infrastructure', 'employment', 'poverty', 'capital']],
            RISORSA_REGNO: ['resource', ['kingdomName', 'territoryName', 'name', 'category', 'production', 'stock', 'unitValue', 'status']],
            CRISI_REGNO: ['crisis', ['kingdomName', 'name', 'severity', 'territoryName', 'effect', 'status']],
            FAZIONE_REGNO: ['faction', ['kingdomName', 'name', 'category', 'leader', 'power', 'loyalty', 'wealth', 'goal', 'status']],
            ESERCITO_REGNO: ['army', ['kingdomName', 'levies', 'professionals', 'cavalry', 'navy', 'morale', 'readiness', 'upkeep']],
            DIPLOMAZIA_REGNO: ['diplomacy', ['kingdomName', 'realm', 'relation', 'trust', 'tension', 'treaty', 'trade', 'claims']],
            LEGGE_REGNO: ['law', ['kingdomName', 'title', 'area', 'effect', 'status', 'support', 'opposition']],
            CONSIGLIERE_REGNO: ['councilor', ['kingdomName', 'name', 'role', 'competence', 'loyalty', 'faction', 'status']],
            VALUTAZIONE_REGNO: ['assessment', ['kingdomName', 'summary', 'priority1', 'priority2', 'priority3', 'confidence']],
            TESORO_REGNO: ['treasury', ['kingdomName', 'direction', 'amount', 'reason']],
            EVENTO_REGNO: ['event', ['kingdomName', 'eventKind', 'description', 'treasuryDelta', 'foodDelta', 'populationDelta', 'stabilityDelta', 'legitimacyDelta', 'prosperityDelta', 'approvalDelta', 'unrestDelta', 'healthDelta']]
        };
        Object.entries(map).forEach(([tag, definition]) => {
            const regex = new RegExp('\\[' + tag + ':\\s*([^\\]]+)\\]', 'gi');
            let match;
            while ((match = regex.exec(source)) !== null) {
                const fields = match[1].split('|').map(value => value.trim());
                const event = { type: definition[0] };
                definition[1].forEach((field, index) => {
                    if (fields[index] !== undefined && fields[index] !== '') event[field] = fields[index];
                });
                events.push(event);
            }
        });
        return events;
    }

    function applyNumericPatch(target, event, fields, percentageFields = [], decimalFields = []) {
        fields.forEach(field => {
            const value = parseNumber(event[field], null);
            if (value == null) return;
            target[field] = percentageFields.includes(field)
                ? clamp(value) : decimalFields.includes(field) ? value : Math.round(value);
        });
    }

    function applyNarrativeEvents(input, events, context = {}) {
        const state = migrateKingdom(input);
        const turn = Math.max(0, integer(context.turn));
        const results = [];
        (Array.isArray(events) ? events : []).forEach(event => {
            const fingerprint = eventFingerprint(event, turn);
            if (state.processedNarrativeEvents.includes(fingerprint)) {
                results.push({ ok: true, skipped: true, type: event.type, message: 'Evento già applicato nel turno' });
                return;
            }
            let message = '';
            try {
                if (event.type !== 'profile' && clean(event.kingdomName) && state.active &&
                    keyOf(event.kingdomName) !== keyOf(state.name)) {
                    throw new Error(`tag destinato a ${clean(event.kingdomName)}, non a ${state.name}`);
                }
                if (event.type === 'profile') {
                    if (!clean(event.name)) throw new Error('REGNO senza nome');
                    const previousPopulation = state.population;
                    Object.assign(state, compactPatch({
                        name: clean(event.name, 100), rulerTitle: clean(event.rulerTitle, 80),
                        rulerName: clean(event.rulerName, 100), government: clean(event.government, 100),
                        capital: clean(event.capital, 100)
                    }));
                    applyNumericPatch(state, event,
                        ['treasury', 'population', 'stability', 'legitimacy', 'prosperity', 'food'],
                        ['stability', 'legitimacy', 'prosperity']);
                    state.population = Math.max(0, state.population);
                    state.food = Math.max(0, state.food);
                    if (!state.people.classes.some(item => item.population > 0) && state.population > 0) {
                        state.people.classes = defaultClasses(state.population);
                        state.people.pops = defaultPops(state.people.classes, state.capital);
                    } else if (state.population !== previousPopulation) {
                        const delta = state.population - previousPopulation;
                        state.people.classes = distributePopulationDelta(state.people.classes, delta);
                        state.people.pops = distributePopulationDelta(state.people.pops, delta);
                        state.territories = distributePopulationDelta(state.territories, delta);
                    }
                    state.active = true;
                    state.initialized = true;
                    if (!state.lastPeriodTurn) state.lastPeriodTurn = turn;
                    message = `Regno registrato: ${state.name}`;
                } else if (!state.active) {
                    throw new Error('regno non ancora registrato con [REGNO]');
                } else if (event.type === 'people') {
                    applyNumericPatch(state.people, event,
                        ['approval', 'unrest', 'health', 'literacy', 'employment', 'poverty', 'foodSecurity', 'housing', 'crime', 'averageLivingStandard', 'loyalists', 'radicals'],
                        ['approval', 'unrest', 'health', 'literacy', 'employment', 'poverty', 'foodSecurity', 'housing', 'crime'],
                        ['averageLivingStandard']);
                    state.people.averageLivingStandard = Math.max(1, Math.min(30, state.people.averageLivingStandard));
                    state.people.loyalists = Math.max(0, state.people.loyalists);
                    state.people.radicals = Math.max(0, state.people.radicals);
                    message = 'Indicatori del popolo aggiornati';
                } else if (event.type === 'socialClass') {
                    if (!clean(event.classKey)) throw new Error('CLASSE_REGNO senza classe');
                    const item = upsert(state.people.classes, event, normalizeSocialClass, value => value.key);
                    message = `Classe sociale aggiornata: ${item.name}`;
                } else if (event.type === 'pop') {
                    if (!clean(event.popId || event.name)) throw new Error('POP_REGNO senza identificativo');
                    const initializesNarratorPops = !state.people.popsInitializedByNarrator;
                    const existing = state.people.pops.find(item =>
                        item.id === clean(event.popId || event.id, 140) ||
                        keyOf(item.name) === keyOf(event.name)
                    );
                    const candidate = normalizePop({ ...(existing || {}), ...compactPatch(event) });
                    const occupation = OCCUPATIONS[candidate.profession];
                    const allowedClasses = occupation.allowed === '*'
                        ? ['*'] : occupation.allowed.split(',');
                    if (candidate.profession !== 'unemployed' &&
                        (candidate.education < occupation.minEducation ||
                            (!allowedClasses.includes('*') && !allowedClasses.includes(candidate.classKey)))) {
                        throw new Error(`qualifiche o classe insufficienti per ${occupation.name}`);
                    }
                    if (initializesNarratorPops) {
                        state.people.pops = [];
                        state.people.popsInitializedByNarrator = true;
                    }
                    const item = upsert(state.people.pops, event, normalizePop,
                        value => value.id || `${value.name}:${value.territoryName}:${value.profession}`);
                    message = `Gruppo di popolazione aggiornato: ${item.name}`;
                } else if (event.type === 'job') {
                    if (!clean(event.profession)) throw new Error('LAVORO_REGNO senza professione');
                    const item = upsert(state.jobs, event, normalizeJob,
                        value => `${value.territoryName}:${value.profession}`);
                    message = `Mercato del lavoro aggiornato: ${item.name}`;
                } else if (event.type === 'statistics') {
                    applyNumericPatch(state.economy, event,
                        ['gdp', 'tradeBalance', 'inflation', 'debt', 'administrationEfficiency'],
                        ['administrationEfficiency'], ['inflation']);
                    applyNumericPatch(state.people, event, ['birthRate', 'deathRate', 'migration'], [],
                        ['birthRate', 'deathRate']);
                    message = 'Statistiche demografiche ed economiche aggiornate';
                } else if (event.type === 'services') {
                    applyNumericPatch(state.services, event,
                        ['infrastructure', 'healthcare', 'education', 'justice', 'sanitation'],
                        ['infrastructure', 'healthcare', 'education', 'justice', 'sanitation']);
                    message = 'Servizi pubblici aggiornati';
                } else if (event.type === 'territory') {
                    if (!clean(event.name)) throw new Error('TERRITORIO_REGNO senza nome');
                    const territory = upsert(state.territories, event, normalizeTerritory, item => item.name);
                    message = `Territorio aggiornato: ${territory.name}`;
                } else if (event.type === 'resource') {
                    if (!clean(event.name)) throw new Error('RISORSA_REGNO senza nome');
                    const item = upsert(state.resources, event, normalizeResource,
                        value => `${value.territoryName}:${value.name}`);
                    message = `Risorsa aggiornata: ${item.name}`;
                } else if (event.type === 'crisis') {
                    if (!clean(event.name)) throw new Error('CRISI_REGNO senza nome');
                    const item = upsert(state.crises, event, normalizeCrisis, value => value.name);
                    message = `Crisi aggiornata: ${item.name}`;
                } else if (event.type === 'faction') {
                    if (!clean(event.name)) throw new Error('FAZIONE_REGNO senza nome');
                    message = `Fazione aggiornata: ${upsert(state.factions, event, normalizeFaction, item => item.name).name}`;
                } else if (event.type === 'diplomacy') {
                    if (!clean(event.realm)) throw new Error('DIPLOMAZIA_REGNO senza controparte');
                    message = `Diplomazia aggiornata: ${upsert(state.diplomacy, event, normalizeDiplomacy, item => item.realm).realm}`;
                } else if (event.type === 'army') {
                    state.army = normalizeArmy({ ...state.army, ...compactPatch(event) });
                    message = 'Forze armate aggiornate';
                } else if (event.type === 'law') {
                    if (!clean(event.title)) throw new Error('LEGGE_REGNO senza titolo');
                    message = `Legge aggiornata: ${upsert(state.laws, event, normalizeLaw, item => item.title).title}`;
                } else if (event.type === 'councilor') {
                    if (!clean(event.name)) throw new Error('CONSIGLIERE_REGNO senza nome');
                    message = `Consiglio aggiornato: ${upsert(state.council, event, normalizeCouncilor, item => item.name).name}`;
                } else if (event.type === 'assessment') {
                    const priorities = [event.priority1, event.priority2, event.priority3]
                        .map(value => clean(value, 180)).filter(Boolean);
                    state.governance = normalizeGovernance({
                        ...state.governance,
                        lastAssessmentTurn: turn,
                        summary: event.summary,
                        priorities,
                        confidence: event.confidence
                    });
                    message = 'Valutazione strategica del Master aggiornata';
                } else if (event.type === 'treasury') {
                    const amount = Math.abs(integer(event.amount));
                    if (!amount) throw new Error('TESORO_REGNO senza importo valido');
                    const incoming = /entra|incasso|credito|\+/.test(clean(event.direction).toLowerCase());
                    state.treasury += incoming ? amount : -amount;
                    message = `${incoming ? 'Entrata' : 'Uscita'} del tesoro: ${amount}`;
                } else if (event.type === 'event') {
                    const previousPopulation = state.population;
                    const targets = {
                        treasuryDelta: ['treasury', state], foodDelta: ['food', state],
                        populationDelta: ['population', state], stabilityDelta: ['stability', state],
                        legitimacyDelta: ['legitimacy', state], prosperityDelta: ['prosperity', state],
                        approvalDelta: ['approval', state.people], unrestDelta: ['unrest', state.people],
                        healthDelta: ['health', state.people]
                    };
                    Object.entries(targets).forEach(([field, [targetField, target]]) => {
                        const delta = integer(event[field]);
                        if (!delta) return;
                        target[targetField] += delta;
                        if (['stability', 'legitimacy', 'prosperity', 'approval', 'unrest', 'health'].includes(targetField)) {
                            target[targetField] = clamp(target[targetField]);
                        }
                    });
                    state.population = Math.max(0, state.population);
                    state.food = Math.max(0, state.food);
                    const populationDelta = state.population - previousPopulation;
                    state.people.classes = distributePopulationDelta(state.people.classes, populationDelta);
                    state.people.pops = distributePopulationDelta(state.people.pops, populationDelta);
                    state.territories = distributePopulationDelta(state.territories, populationDelta);
                    message = clean(event.description || 'Evento del regno', 220);
                } else {
                    throw new Error(`tipo evento regno sconosciuto: ${event.type}`);
                }
                state.processedNarrativeEvents.push(fingerprint);
                state.processedNarrativeEvents = state.processedNarrativeEvents.slice(-MAX_PROCESSED_EVENTS);
                addHistory(state, message, turn, event.type);
                results.push({ ok: true, type: event.type, message });
            } catch (error) {
                results.push({ ok: false, type: event.type, message: error.message });
            }
        });
        const appliedTypes = new Set(results.filter(result => result.ok && !result.skipped).map(result => result.type));
        if (appliedTypes.has('pop') || appliedTypes.has('job')) reconcileDerivedStatistics(state);
        if ([...appliedTypes].some(type => [
            'profile', 'people', 'pop', 'job', 'statistics', 'services', 'territory',
            'resource', 'crisis', 'faction', 'army', 'treasury', 'event'
        ].includes(type))) {
            recordStatistics(state, turn, 'Master LLM');
        }
        return { state, results };
    }

    function distributePopulationDelta(collection, delta, field = 'population') {
        const total = collection.reduce((sum, item) => sum + Math.max(0, integer(item[field])), 0);
        if (!total || !delta) return collection;
        let assigned = 0;
        return collection.map((item, index) => {
            const share = index === collection.length - 1
                ? delta - assigned : Math.round(delta * item[field] / total);
            assigned += share;
            return { ...item, [field]: Math.max(0, item[field] + share) };
        });
    }

    function weightedAverage(collection, field, weightField = 'population', fallback = 0) {
        const weight = collection.reduce((sum, item) => sum + Math.max(0, parseNumber(item[weightField], 0)), 0);
        if (!weight) return fallback;
        return collection.reduce((sum, item) =>
            sum + parseNumber(item[field], 0) * Math.max(0, parseNumber(item[weightField], 0)), 0
        ) / weight;
    }

    function laborTerritoryMatches(job, pop) {
        const jobTerritory = keyOf(job.territoryName);
        const popTerritory = keyOf(pop.territoryName);
        return jobTerritory === popTerritory;
    }

    function jobAllowsPop(job, pop) {
        if (job.status !== 'active') return false;
        const allowed = job.allowedClasses === '*'
            ? ['*'] : job.allowedClasses.split(',').map(value => keyOf(value)).filter(Boolean);
        const occupationAllowed = OCCUPATIONS[job.profession].allowed === '*'
            ? ['*'] : OCCUPATIONS[job.profession].allowed.split(',');
        const classAllowed = (allowed.includes('*') || allowed.includes(pop.classKey)) &&
            (occupationAllowed.includes('*') || occupationAllowed.includes(pop.classKey));
        const qualificationScore = pop.education * 0.6 + pop.literacy * 0.2 + pop.qualifications * 0.2;
        return classAllowed && pop.education >= job.minEducation && qualificationScore >= job.minEducation;
    }

    function mergeCompatiblePops(pops) {
        const merged = [];
        pops.filter(item => item.population > 0).forEach(raw => {
            const pop = normalizePop(raw, merged.length);
            const identity = [
                pop.territoryName, pop.culture, pop.faith, pop.classKey, pop.profession
            ].map(keyOf).join(':');
            const existing = merged.find(item => item._identity === identity);
            if (!existing) {
                merged.push({ ...pop, _identity: identity });
                return;
            }
            const total = existing.population + pop.population;
            const combine = field => total
                ? (existing[field] * existing.population + pop[field] * pop.population) / total : 0;
            ['education', 'literacy', 'qualifications', 'income', 'standardOfLiving'].forEach(field => {
                existing[field] = combine(field);
            });
            ['basic', 'comfort', 'luxury'].forEach(field => {
                existing.needs[field] = total
                    ? (existing.needs[field] * existing.population + pop.needs[field] * pop.population) / total : 0;
            });
            existing.population = total;
            existing.employed += pop.employed;
            existing.unemployed += pop.unemployed;
            existing.loyalists += pop.loyalists;
            existing.radicals += pop.radicals;
            if (!existing.desires && pop.desires) existing.desires = pop.desires;
        });
        return merged.map(({ _identity, ...pop }, index) => normalizePop(pop, index));
    }

    function summarizeClassesFromPops(pops, existingClasses) {
        const classes = Object.keys(SOCIAL_CLASSES).map(key => {
            const groups = pops.filter(pop => pop.classKey === key);
            const population = groups.reduce((sum, pop) => sum + pop.population, 0);
            const loyalists = groups.reduce((sum, pop) => sum + pop.loyalists, 0);
            const radicals = groups.reduce((sum, pop) => sum + pop.radicals, 0);
            const previous = existingClasses.find(item => item.key === key) || createClass(key, 0);
            const leadingDesire = groups.slice().sort((a, b) => b.population - a.population)
                .find(pop => pop.desires)?.desires || previous.needs;
            return normalizeSocialClass({
                ...previous,
                key,
                name: SOCIAL_CLASSES[key],
                population,
                wealth: clamp(weightedAverage(groups, 'standardOfLiving', 'population', previous.wealth / 3) * 3),
                loyalty: population ? clamp(50 + (loyalists - radicals) / population * 100) : previous.loyalty,
                needs: leadingDesire
            });
        });
        existingClasses.filter(item => !SOCIAL_CLASSES[item.key]).forEach(item => classes.push(item));
        return classes;
    }

    function reconcileDerivedStatistics(state) {
        const pops = state.people.pops.filter(pop => pop.population > 0);
        if (!pops.length) return state;
        const detailedPopulation = pops.reduce((sum, pop) => sum + pop.population, 0);
        const employed = pops.reduce((sum, pop) => sum + pop.employed, 0);
        state.people.employment = detailedPopulation ? clamp(employed / detailedPopulation * 100) : 0;
        state.people.literacy = weightedAverage(pops, 'literacy', 'population', state.people.literacy);
        state.people.averageLivingStandard = weightedAverage(
            pops, 'standardOfLiving', 'population', state.people.averageLivingStandard
        );
        state.people.loyalists = pops.reduce((sum, pop) => sum + pop.loyalists, 0);
        state.people.radicals = pops.reduce((sum, pop) => sum + pop.radicals, 0);
        state.people.poverty = clamp(
            pops.filter(pop => pop.standardOfLiving < 8)
                .reduce((sum, pop) => sum + pop.population, 0) / detailedPopulation * 100
        );
        state.people.classes = summarizeClassesFromPops(pops, state.people.classes);
        state.jobs = state.jobs.map((job, index) => {
            const matchingEmployment = pops.filter(pop =>
                pop.profession === job.profession && laborTerritoryMatches(job, pop)
            ).reduce((sum, pop) => sum + pop.employed, 0);
            return normalizeJob({
                ...job,
                employed: Math.min(job.positions, matchingEmployment)
            }, index);
        });
        return state;
    }

    function createStatisticsSnapshot(state, turn, source) {
        return {
            turn: Math.max(0, integer(turn)),
            period: state.period,
            source: clean(source || 'motore', 80),
            treasury: state.treasury,
            population: state.population,
            food: state.food,
            gdp: state.economy.gdp,
            approval: Math.round(state.people.approval),
            unrest: Math.round(state.people.unrest),
            employment: Math.round(state.people.employment),
            poverty: Math.round(state.people.poverty),
            livingStandard: Number(state.people.averageLivingStandard.toFixed(1)),
            radicals: state.people.radicals,
            loyalists: state.people.loyalists,
            stability: Math.round(state.stability)
        };
    }

    function recordStatistics(state, turn, source) {
        const snapshot = createStatisticsSnapshot(state, turn, source);
        const last = state.statisticsHistory[state.statisticsHistory.length - 1];
        if (last && last.turn === snapshot.turn && last.source === snapshot.source) {
            state.statisticsHistory[state.statisticsHistory.length - 1] = snapshot;
        } else {
            state.statisticsHistory.push(snapshot);
            state.statisticsHistory = state.statisticsHistory.slice(-MAX_STAT_SNAPSHOTS);
        }
        state.governance.lastStatisticsTurn = snapshot.turn;
        state.governance.statisticsSource = snapshot.source;
        return snapshot;
    }

    function buildKingdomAdvisor(input) {
        const state = migrateKingdom(input);
        const activeCrises = state.crises.filter(item => item.status === 'active');
        const radicalRate = state.population ? state.people.radicals / state.population * 100 : 0;
        const debtRate = state.economy.gdp ? state.economy.debt / state.economy.gdp * 100 : 0;
        const score = Math.round(clamp(
            (state.stability + state.legitimacy + state.prosperity + state.people.approval +
                state.people.health + state.people.employment + (100 - state.people.unrest) +
                (100 - state.people.poverty)) / 8 -
            Math.min(20, debtRate / 5) - Math.min(15, radicalRate) -
            activeCrises.reduce((sum, item) => sum + item.severity / 30, 0)
        ));
        const risks = [];
        const opportunities = [];
        const priorities = [];
        if (state.food <= 0 || state.people.foodSecurity < 40) {
            risks.push('sicurezza alimentare critica');
            priorities.push('Finanziare aiuti e aumentare la produzione alimentare');
        }
        if (state.people.unrest >= 45 || radicalRate >= 8) {
            risks.push('radicalizzazione e disordini');
            priorities.push('Ridurre i bisogni insoddisfatti dei gruppi più radicali');
        }
        if (state.people.employment < 65) {
            risks.push('disoccupazione elevata');
            priorities.push('Creare posti compatibili con le qualifiche disponibili');
        }
        const blocked = state.lastReport.qualificationsBlocked || 0;
        if (blocked > 0 || state.people.literacy < 35) {
            risks.push('carenza di qualifiche');
            priorities.push('Investire in istruzione e formazione professionale');
        }
        if (debtRate > 80) {
            risks.push('debito pubblico eccessivo');
            priorities.push('Riequilibrare bilancio e crescita senza comprimere i servizi essenziali');
        }
        if (state.jobs.some(job => job.vacancies > 0) && state.people.employment < 90) {
            opportunities.push('posti vacanti utilizzabili con formazione mirata');
        }
        if (state.resources.some(item => item.status !== 'inactive' && item.production > 0)) {
            opportunities.push('risorse produttive da valorizzare');
        }
        if (state.people.averageLivingStandard >= 12) {
            opportunities.push('tenore di vita favorevole alla lealtà e ai consumi');
        }
        if (!priorities.length) priorities.push('Consolidare crescita, servizi e coesione sociale');
        const level = score >= 75 ? 'solido' : score >= 55 ? 'stabile' : score >= 35 ? 'fragile' : 'critico';
        return {
            score,
            level,
            risks: risks.slice(0, 4),
            opportunities: opportunities.slice(0, 3),
            priorities: priorities.slice(0, 3)
        };
    }

    function simulateLaborMarket(state, shortage) {
        let pops = state.people.pops.map((item, index) => {
            const pop = normalizePop(item, index);
            const accessFactor = pop.classKey === 'marginalized' ? 0.45
                : pop.classKey === 'peasants' || pop.classKey === 'workers' ? 0.7 : 1;
            const educationGain = state.services.education / 180 * accessFactor;
            return normalizePop({
                ...pop,
                education: pop.education + educationGain,
                literacy: pop.literacy + educationGain * 0.8,
                qualifications: pop.qualifications + educationGain * (0.5 + state.economy.administrationEfficiency / 200)
            }, index);
        });
        const jobs = state.jobs.map((item, index) => normalizeJob({ ...item, employed: 0 }, index));
        let qualificationsBlocked = 0;
        let promoted = 0;

        pops = pops.map(pop => {
            const matching = jobs.filter(job =>
                job.profession === pop.profession && laborTerritoryMatches(job, pop)
            );
            let remaining = pop.population;
            let employed = 0;
            matching.forEach(job => {
                if (!jobAllowsPop(job, pop) || !remaining) return;
                const hired = Math.min(remaining, job.positions - job.employed);
                job.employed += hired;
                job.vacancies = Math.max(0, job.positions - job.employed);
                employed += hired;
                remaining -= hired;
            });
            return { ...pop, employed, unemployed: pop.population - employed };
        });

        const promotedPops = [];
        pops.forEach(pop => {
            if (!pop.unemployed) return;
            const vacancies = jobs.filter(job =>
                job.vacancies > 0 && jobAllowsPop(job, pop) &&
                laborTerritoryMatches(job, pop)
            ).sort((a, b) => b.wage - a.wage);
            const currentWage = OCCUPATIONS[pop.profession]?.wage || 0;
            const target = vacancies.find(job => pop.profession === 'unemployed' || job.wage > currentWage * 1.1);
            if (!target) {
                if (jobs.some(job => job.vacancies > 0 && job.minEducation > pop.education)) {
                    qualificationsBlocked += pop.unemployed;
                }
                return;
            }
            const mobilityRate = Math.max(0.01, state.services.education / 2000 + pop.qualifications / 5000);
            const moved = Math.min(pop.unemployed, target.vacancies,
                Math.max(1, Math.round(pop.population * mobilityRate)));
            if (!moved) return;
            pop.population -= moved;
            pop.unemployed -= moved;
            target.employed += moved;
            target.vacancies = Math.max(0, target.positions - target.employed);
            promoted += moved;
            promotedPops.push(normalizePop({
                ...pop,
                id: `${pop.id}-${target.profession}-${state.period + 1}`,
                name: `${target.name} — ${pop.culture}`,
                classKey: OCCUPATIONS[target.profession].classKey,
                profession: target.profession,
                population: moved,
                employed: moved,
                income: target.wage,
                loyalists: Math.round(pop.loyalists * moved / Math.max(1, pop.population + moved)),
                radicals: Math.round(pop.radicals * moved / Math.max(1, pop.population + moved))
            }, promotedPops.length));
        });
        pops = mergeCompatiblePops([...pops, ...promotedPops]);

        const priceIndex = Math.max(0.5, 1 + state.economy.inflation / 100);
        pops = pops.map((pop, index) => {
            const job = jobs.find(item => item.profession === pop.profession &&
                laborTerritoryMatches(item, pop));
            const wage = job?.wage ?? OCCUPATIONS[pop.profession].wage;
            const income = pop.population ? wage * pop.employed / pop.population : 0;
            const basicCost = 1.5 * priceIndex * (shortage ? 1.8 : 1);
            const comfortCost = 2.5 * priceIndex;
            const luxuryCost = 5 * priceIndex;
            const basic = clamp(income / basicCost * 100);
            const comfort = clamp(Math.max(0, income - basicCost) / comfortCost * 100);
            const luxury = clamp(Math.max(0, income - basicCost - comfortCost) / luxuryCost * 100);
            const standardOfLiving = Math.max(1, Math.min(30,
                4 + income * 1.5 + (basic + comfort + luxury) / 45
            ));
            const livingStandardChange = standardOfLiving - pop.standardOfLiving;
            const dissatisfaction = Math.max(0, 60 - basic) / 100;
            const unemploymentRate = pop.population ? (pop.population - pop.employed) / pop.population : 0;
            const radicalDelta = Math.round(pop.population * (dissatisfaction * 0.012 + unemploymentRate * 0.006));
            const radicalRecovery = Math.round(pop.population * (livingStandardChange > 0.25 ? 0.006 : 0));
            const loyalistDelta = Math.round(pop.population *
                ((basic >= 85 && comfort >= 50 ? 0.004 : 0) + (livingStandardChange > 0.25 ? 0.004 : 0)));
            const loyalistLoss = Math.round(pop.population * (livingStandardChange < -0.25 ? 0.006 : 0));
            let desires = pop.desires;
            if (basic < 60) desires = 'cibo, abitazione e beni essenziali accessibili';
            else if (unemploymentRate > 0.2) desires = 'un impiego stabile e salari migliori';
            else if (pop.education < 35) desires = 'accesso all’istruzione e qualifiche professionali';
            else if (comfort < 55) desires = 'servizi, sicurezza e beni di comfort';
            else if (luxury < 35) desires = 'prestigio, proprietà e beni di lusso';
            return normalizePop({
                ...pop,
                id: pop.id || `pop-${index + 1}`,
                income,
                standardOfLiving,
                basicNeeds: basic,
                comfortNeeds: comfort,
                luxuryNeeds: luxury,
                loyalists: Math.max(0, Math.min(pop.population, pop.loyalists + loyalistDelta - loyalistLoss)),
                radicals: Math.max(0, Math.min(pop.population, pop.radicals + radicalDelta - radicalRecovery)),
                desires
            }, index);
        });

        const population = pops.reduce((sum, pop) => sum + pop.population, 0);
        const employed = pops.reduce((sum, pop) => sum + pop.employed, 0);
        const radicals = pops.reduce((sum, pop) => sum + pop.radicals, 0);
        const loyalists = pops.reduce((sum, pop) => sum + pop.loyalists, 0);
        state.people.pops = pops;
        state.jobs = jobs;
        state.people.classes = summarizeClassesFromPops(pops, state.people.classes);
        state.people.employment = population ? clamp(employed / population * 100) : 0;
        state.people.literacy = weightedAverage(pops, 'literacy', 'population', state.people.literacy);
        state.people.averageLivingStandard = weightedAverage(pops, 'standardOfLiving', 'population', 8);
        state.people.radicals = radicals;
        state.people.loyalists = loyalists;
        state.people.poverty = population
            ? clamp(pops.filter(pop => pop.standardOfLiving < 8)
                .reduce((sum, pop) => sum + pop.population, 0) / population * 100) : 0;
        return {
            employed,
            unemployed: Math.max(0, population - employed),
            qualificationsBlocked,
            promoted
        };
    }

    function runPeriod(input, context = {}) {
        const state = migrateKingdom(input);
        if (!state.active) return { state, report: null };
        const incomeBase = state.territories.reduce((sum, item) => sum + item.taxIncome, 0);
        const territoryProsperity = state.territories.length
            ? state.territories.reduce((sum, item) => sum + item.prosperity, 0) / state.territories.length : state.prosperity;
        const loyalty = state.territories.length
            ? state.territories.reduce((sum, item) => sum + item.loyalty, 0) / state.territories.length : 50;
        const efficiency = state.economy.administrationEfficiency / 100;
        const income = Math.round(incomeBase * (state.taxRate / 10) *
            (0.55 + loyalty / 250) * (0.65 + efficiency * 0.35));
        const resourceValue = state.resources.filter(item => item.status !== 'inactive')
            .reduce((sum, item) => sum + item.production * item.unitValue, 0);
        const armyUpkeep = state.army.upkeep || Math.round(
            state.army.levies * 0.08 + state.army.professionals * 0.6 +
            state.army.cavalry * 1.4 + state.army.navy * 2
        );
        const administration = Math.round(Math.max(10, state.population * 0.0025 * (1.3 - efficiency * 0.4)));
        const serviceAverage = Object.values(state.services).reduce((sum, value) => sum + value, 0) / 5;
        const servicesCost = state.population > 0
            ? Math.max(1, Math.round(state.population * serviceAverage / 100 * 0.0015)) : 0;
        const foodProduced = state.territories.reduce((sum, item) => sum + item.foodProduction, 0);
        const foodConsumed = Math.round(state.population * 0.02 + state.army.professionals * 0.15);
        const foodBalance = foodProduced - foodConsumed;
        const balance = income + state.economy.tradeBalance + Math.round(resourceValue) - armyUpkeep - administration - servicesCost;
        state.treasury += balance;
        if (state.treasury < 0) {
            state.economy.debt += Math.abs(state.treasury);
            state.treasury = 0;
        }
        state.food = Math.max(0, state.food + foodBalance);
        state.period += 1;
        state.lastPeriodTurn = Math.max(state.lastPeriodTurn, integer(context.turn));

        const shortage = state.food === 0 && foodBalance < 0;
        const taxPressure = Math.max(0, state.taxRate - 15);
        const serviceBenefit = (state.services.healthcare + state.services.sanitation + state.services.education) / 300;
        const laborReport = simulateLaborMarket(state, shortage);
        const radicalPressure = state.population
            ? (state.people.radicals - state.people.loyalists) / state.population * 10 : 0;
        const livingStandardEffect = (state.people.averageLivingStandard - 8) / 4;
        const approvalDelta = Math.round((balance >= 0 ? 1 : -2) + serviceBenefit * 3 +
            livingStandardEffect - taxPressure / 5 - radicalPressure - (shortage ? 8 : 0));
        const unrestDelta = Math.round((shortage ? 7 : 0) + taxPressure / 6 + state.people.poverty / 40 -
            state.services.justice / 50 + radicalPressure / 2 - (state.stability >= 60 ? 1 : 0));
        state.people.approval = clamp(state.people.approval + approvalDelta);
        state.people.unrest = clamp(state.people.unrest + unrestDelta);
        state.people.foodSecurity = clamp(state.people.foodSecurity + (foodBalance >= 0 ? 2 : -6));
        state.people.health = clamp(state.people.health + serviceBenefit * 2 - (shortage ? 5 : 0));
        state.people.literacy = clamp(state.people.literacy + state.services.education / 100);
        state.people.crime = clamp(state.people.crime + state.people.poverty / 50 + state.people.unrest / 60 - state.services.justice / 50);

        const mortalityPenalty = shortage ? 8 : Math.max(0, 50 - state.people.health) / 10;
        const naturalGrowth = Math.round(state.population *
            (state.people.birthRate - state.people.deathRate - mortalityPenalty) / 1000);
        const populationDelta = naturalGrowth + state.people.migration;
        state.population = Math.max(0, state.population + populationDelta);
        state.territories = distributePopulationDelta(state.territories, populationDelta);
        state.people.classes = distributePopulationDelta(state.people.classes, populationDelta);
        state.people.pops = distributePopulationDelta(state.people.pops, populationDelta)
            .map((pop, index) => normalizePop(pop, index));
        laborReport.unemployed = Math.max(0, state.population - laborReport.employed);
        state.people.employment = state.population
            ? clamp(laborReport.employed / state.population * 100) : 0;

        state.stability = clamp(state.stability + (approvalDelta >= 0 ? 1 : -1) - Math.ceil(state.people.unrest / 40));
        state.legitimacy = clamp(state.legitimacy + (state.people.approval >= 55 ? 1 : -1));
        state.prosperity = clamp(state.prosperity + (foodBalance >= 0 ? 1 : -2) + (balance >= 0 ? 1 : -1));
        state.economy.gdp = Math.max(0, Math.round(
            state.population * (0.4 + state.prosperity / 100) + resourceValue * 5
        ));
        state.economy.inflation = Math.max(-20, Math.min(200,
            state.economy.inflation + (shortage ? 3 : -0.2) + (state.economy.debt > state.economy.gdp ? 1 : 0)
        ));

        state.territories = state.territories.map(item => ({
            ...item,
            loyalty: clamp(item.loyalty + approvalDelta / 3 - unrestDelta / 4),
            prosperity: clamp(item.prosperity + (foodBalance >= 0 ? 1 : -2) + (balance >= 0 ? 1 : -1)),
            publicOrder: clamp(item.publicOrder - unrestDelta / 2 + state.services.justice / 100),
            health: clamp(item.health + state.people.health / 100 - (shortage ? 4 : 0)),
            infrastructure: clamp(item.infrastructure + state.services.infrastructure / 200),
            employment: clamp(item.employment + (balance >= 0 ? 1 : -1)),
            poverty: clamp(item.poverty + (balance >= 0 ? -1 : 2))
        }));
        state.factions = state.factions.map(item => ({
            ...item,
            loyalty: clamp(item.loyalty + approvalDelta / 4 - taxPressure / 8)
        }));
        state.people.classes = state.people.classes.map(item => ({
            ...item,
            loyalty: clamp(item.loyalty + approvalDelta / 3 -
                (item.key === 'peasants' && shortage ? 5 : 0) -
                (item.key === 'merchants' && state.taxRate > 20 ? 3 : 0))
        }));

        const warnings = [];
        if (shortage) warnings.push('Carestia: viveri esauriti');
        if (state.people.unrest >= 60) warnings.push('Disordini popolari');
        if (state.economy.debt > state.economy.gdp && state.economy.debt > 0) warnings.push('Debito superiore al PIL');
        if (state.people.health < 35) warnings.push('Emergenza sanitaria');
        warnings.forEach(text => {
            if (!state.crises.some(item => item.status === 'active' && item.name === text)) {
                state.crises.push(normalizeCrisis({ name: text, severity: 60, effect: text, status: 'active' }, state.crises.length));
            }
        });

        const report = {
            period: state.period, income, resourceValue: Math.round(resourceValue),
            armyUpkeep, administration, servicesCost, balance,
            foodProduced, foodConsumed, foodBalance, shortage,
            populationDelta, approvalDelta, unrestDelta, gdp: state.economy.gdp,
            employed: laborReport.employed, unemployed: laborReport.unemployed,
            qualificationsBlocked: laborReport.qualificationsBlocked,
            promoted: laborReport.promoted, warnings
        };
        state.lastReport = report;
        addHistory(state,
            `Periodo ${state.period}: bilancio ${balance >= 0 ? '+' : ''}${balance}, popolazione ${populationDelta >= 0 ? '+' : ''}${populationDelta}, consenso ${approvalDelta >= 0 ? '+' : ''}${approvalDelta}`,
            state.lastPeriodTurn, 'periodo');
        recordStatistics(state, state.lastPeriodTurn, 'simulazione periodo');
        return { state, report };
    }

    function processPeriods(input, context = {}) {
        let state = migrateKingdom(input);
        if (!state.active) return { state, reports: [] };
        const turn = Math.max(0, integer(context.turn));
        const reports = [];
        while (turn - state.lastPeriodTurn >= state.settings.periodTurns) {
            const result = runPeriod(state, { ...context, turn: state.lastPeriodTurn + state.settings.periodTurns });
            state = result.state;
            if (result.report) reports.push(result.report);
        }
        return { state, reports };
    }

    function buildNarrativeContext(input, turn = 0, currency = 'monete') {
        const state = migrateKingdom(input);
        if (!state.active) return '';
        const advisor = buildKingdomAdvisor(state);
        const classes = state.people.classes.map(item =>
            `${item.name}: ${item.population}, ricchezza ${Math.round(item.wealth)}, lealtà ${Math.round(item.loyalty)}, influenza ${Math.round(item.influence)}${item.needs ? ', bisogni: ' + item.needs : ''}`
        ).join('; ');
        const territories = state.territories.map(item =>
            `${item.name} (${item.type}, pop. ${item.population}, lealtà ${Math.round(item.loyalty)}, ordine ${Math.round(item.publicOrder)}, prosperità ${Math.round(item.prosperity)}, salute ${Math.round(item.health)}, infrastrutture ${Math.round(item.infrastructure)}, occupazione ${Math.round(item.employment)}, povertà ${Math.round(item.poverty)}, entrate ${item.taxIncome}, viveri ${item.foodProduction}${item.strategicResource ? ', risorsa: ' + item.strategicResource : ''})`
        ).join('; ');
        const resources = state.resources.map(item =>
            `${item.name}@${item.territoryName || 'regno'}: produzione ${item.production}, scorte ${item.stock}, valore ${item.unitValue}, stato ${item.status}`
        ).join('; ');
        const pops = state.people.pops.map(item => {
            const occupation = OCCUPATIONS[item.profession]?.name || item.profession;
            return `${item.id}/${item.name}: classe ${SOCIAL_CLASSES[item.classKey] || item.classKey}, ${occupation}, ${item.territoryName || 'regno'}, pop. ${item.population}, occupati ${item.employed}, istruzione ${Math.round(item.education)}, qualifiche ${Math.round(item.qualifications)}, reddito ${item.income.toFixed(1)}, tenore ${item.standardOfLiving.toFixed(1)}/30, bisogni base/comfort/lusso ${Math.round(item.needs.basic)}/${Math.round(item.needs.comfort)}/${Math.round(item.needs.luxury)}, lealisti ${item.loyalists}, radicali ${item.radicals}, desideri: ${item.desires || 'non rilevati'}`
        }).join('; ');
        const jobs = state.jobs.map(item =>
            `${item.name}@${item.territoryName || 'regno'}: ${item.employed}/${item.positions}, vacanti ${item.vacancies}, salario ${item.wage}, istruzione minima ${item.minEducation}, classi ${item.allowedClasses}`
        ).join('; ');
        return [
            '\n👑 REGNO GESTITO — STATO AUTORITATIVO DEL MOTORE',
            `${state.name} · ${state.rulerTitle || 'Governante'} ${state.rulerName || ''} · Governo: ${state.government || 'non definito'} · Capitale: ${state.capital || 'non definita'}`,
            `Tesoro: ${state.treasury} ${currency} | Debito: ${state.economy.debt} | PIL: ${state.economy.gdp} | Popolazione: ${state.population} | Viveri: ${state.food}`,
            `Stabilità ${Math.round(state.stability)}/100 | Legittimità ${Math.round(state.legitimacy)}/100 | Prosperità ${Math.round(state.prosperity)}/100 | Imposte ${state.taxRate}% | Inflazione ${state.economy.inflation.toFixed(1)}%`,
            `POPOLO: consenso ${Math.round(state.people.approval)}, disordini ${Math.round(state.people.unrest)}, salute ${Math.round(state.people.health)}, alfabetizzazione ${Math.round(state.people.literacy)}, occupazione ${Math.round(state.people.employment)}, povertà ${Math.round(state.people.poverty)}, sicurezza alimentare ${Math.round(state.people.foodSecurity)}, abitazioni ${Math.round(state.people.housing)}, criminalità ${Math.round(state.people.crime)}.`,
            `DEMOGRAFIA: natalità ${state.people.birthRate}/1000, mortalità ${state.people.deathRate}/1000, migrazione ${state.people.migration}/periodo, tenore medio ${state.people.averageLivingStandard.toFixed(1)}/30, lealisti ${state.people.loyalists}, radicali ${state.people.radicals}. CLASSI: ${classes || 'non censite'}.`,
            `GRUPPI POP: ${pops || 'non censiti'}.`,
            `MERCATO DEL LAVORO: ${jobs || 'nessun posto censito'}.`,
            `SERVIZI: infrastrutture ${Math.round(state.services.infrastructure)}, sanità ${Math.round(state.services.healthcare)}, istruzione ${Math.round(state.services.education)}, giustizia ${Math.round(state.services.justice)}, igiene ${Math.round(state.services.sanitation)}.`,
            `TERRITORI: ${territories || 'nessuno registrato'}.`,
            `RISORSE: ${resources || 'nessuna censita'}.`,
            `ESERCITO: ${state.army.levies} leve, ${state.army.professionals} professionisti, ${state.army.cavalry} cavalleria, ${state.army.navy} flotta; morale ${Math.round(state.army.morale)}, prontezza ${Math.round(state.army.readiness)}, costo ${state.army.upkeep}.`,
            `FAZIONI: ${state.factions.length ? state.factions.map(item => `${item.name}/${item.category}: potere ${Math.round(item.power)}, lealtà ${Math.round(item.loyalty)}, obiettivo ${item.goal || 'ignoto'}`).join('; ') : 'nessuna'}.`,
            `DIPLOMAZIA: ${state.diplomacy.length ? state.diplomacy.map(item => `${item.realm}: ${item.relation}, fiducia ${Math.round(item.trust)}, tensione ${Math.round(item.tension)}`).join('; ') : 'nessuna'}.`,
            `CRISI: ${state.crises.filter(item => item.status === 'active').map(item => `${item.name} (${Math.round(item.severity)}/100${item.territoryName ? ', ' + item.territoryName : ''}): ${item.effect}`).join('; ') || 'nessuna attiva'}.`,
            `DIAGNOSI MOTORE: governo ${advisor.level} (${advisor.score}/100). Rischi: ${advisor.risks.join('; ') || 'nessuno grave'}. Priorità: ${advisor.priorities.join('; ')}.`,
            `ULTIMO AUDIT MASTER: ${state.governance.summary || 'non ancora disponibile'}; priorità ${state.governance.priorities.join('; ') || 'non definite'}; attendibilità ${Math.round(state.governance.confidence)}/100.`,
            `Turno ${turn}, periodo ${state.period}. Il tesoro reale è separato dal denaro personale e dalla cassa delle attività.`,
            'Usa questo stato come verità. Prima di rispondere esegui internamente un audit prima/dopo: identifica soltanto gli effetti causati dalla scena, verifica coerenza fra totali e dettagli, poi aggiorna gli indicatori assoluti. Professioni e promozioni dipendono da istruzione, qualifiche, classe ammessa e posti disponibili: non assegnare professioni qualificate a gruppi che non rispettano i requisiti. Ogni cambiamento narrato a pop, lavoro, bisogni, classi, territorio, economia, servizi, risorse, crisi, fazioni, esercito o diplomazia DEVE essere trasmesso con il relativo tag *_REGNO; non limitarti alla prosa e non duplicare variazioni.'
        ].join('\n');
    }

    function manualAction(input, action, context = {}) {
        const state = migrateKingdom(input);
        if (!state.active) throw new Error('Nessun regno attivo');
        if (action === 'tax') {
            state.taxRate = clamp(context.value, 0, 40);
            addHistory(state, `Aliquota fiscale fissata al ${state.taxRate}%`, context.turn, 'decreto');
        } else if (action === 'council') {
            const cost = Math.max(10, Math.round(state.population * 0.0005));
            if (state.treasury < cost) throw new Error('Tesoro insufficiente per convocare il consiglio');
            state.treasury -= cost;
            state.stability = clamp(state.stability + 3);
            state.people.approval = clamp(state.people.approval + 2);
            state.factions = state.factions.map(item => ({ ...item, loyalty: clamp(item.loyalty + 2) }));
            addHistory(state, `Consiglio convocato (costo ${cost})`, context.turn, 'consiglio');
        } else if (action === 'relief') {
            const cost = Math.max(50, integer(context.value, 100));
            if (state.treasury < cost) throw new Error('Tesoro insufficiente per gli aiuti');
            state.treasury -= cost;
            state.people.approval = clamp(state.people.approval + 5);
            state.people.poverty = clamp(state.people.poverty - 3);
            state.people.foodSecurity = clamp(state.people.foodSecurity + 4);
            state.legitimacy = clamp(state.legitimacy + 2);
            state.people.pops = state.people.pops.map(pop => normalizePop({
                ...pop,
                basicNeeds: pop.needs.basic + 8,
                radicals: Math.max(0, pop.radicals - Math.round(pop.population * 0.01))
            }));
            addHistory(state, `Aiuti alla popolazione per ${cost}`, context.turn, 'decreto');
        } else if (action === 'recruit') {
            const quantity = Math.max(1, integer(context.value, 10));
            const cost = quantity * 5;
            if (state.treasury < cost) throw new Error('Tesoro insufficiente per il reclutamento');
            state.treasury -= cost;
            state.army.professionals += quantity;
            state.people.employment = clamp(state.people.employment + 1);
            addHistory(state, `Reclutati ${quantity} professionisti (costo ${cost})`, context.turn, 'esercito');
        } else if (action === 'investTerritory') {
            const cost = Math.max(50, integer(context.value, 100));
            const territory = state.territories.find(item => keyOf(item.name) === keyOf(context.territoryName));
            if (!territory) throw new Error('Territorio non trovato');
            if (state.treasury < cost) throw new Error('Tesoro insufficiente per l’investimento');
            state.treasury -= cost;
            const gain = Math.max(1, Math.round(Math.log10(cost + 10) * 2));
            territory.infrastructure = clamp(territory.infrastructure + gain);
            territory.prosperity = clamp(territory.prosperity + Math.ceil(gain / 2));
            territory.employment = clamp(territory.employment + Math.ceil(gain / 2));
            state.services.infrastructure = clamp(state.services.infrastructure + 1);
            ['laborers', 'artisans', 'engineers'].forEach((profession, index) => {
                const positions = Math.max(1, Math.round(cost / (index === 0 ? 8 : index === 1 ? 20 : 50)));
                const existing = state.jobs.find(job => job.profession === profession &&
                    keyOf(job.territoryName) === keyOf(territory.name));
                if (existing) {
                    existing.positions += positions;
                    existing.vacancies = Math.max(0, existing.positions - existing.employed);
                } else {
                    state.jobs.push(normalizeJob({ territoryName: territory.name, profession, positions }));
                }
            });
            addHistory(state, `Investiti ${cost} in ${territory.name}`, context.turn, 'territorio');
        } else if (action === 'publicService') {
            const service = ['healthcare', 'education', 'justice', 'sanitation'].includes(context.service)
                ? context.service : 'healthcare';
            const cost = Math.max(50, integer(context.value, 100));
            if (state.treasury < cost) throw new Error('Tesoro insufficiente per i servizi');
            state.treasury -= cost;
            const gain = Math.max(1, Math.round(Math.log10(cost + 10) * 2));
            state.services[service] = clamp(state.services[service] + gain);
            addHistory(state, `Investiti ${cost} nel servizio ${service}`, context.turn, 'servizi');
        } else if (action === 'census') {
            const cost = Math.max(20, Math.round(state.population * 0.0002));
            if (state.treasury < cost) throw new Error('Tesoro insufficiente per il censimento');
            state.treasury -= cost;
            state.economy.administrationEfficiency = clamp(state.economy.administrationEfficiency + 3);
            addHistory(state, `Censimento completato (costo ${cost})`, context.turn, 'popolo');
        } else if (action === 'trainPop') {
            const pop = state.people.pops.find(item => item.id === clean(context.popId, 140));
            if (!pop) throw new Error('Gruppo di popolazione non trovato');
            const cost = Math.max(50, integer(context.value, 100));
            if (state.treasury < cost) throw new Error('Tesoro insufficiente per la formazione');
            state.treasury -= cost;
            const gain = Math.max(2, Math.round(Math.log10(cost + 10) * 3));
            pop.education = clamp(pop.education + gain);
            pop.literacy = clamp(pop.literacy + Math.ceil(gain / 2));
            pop.qualifications = clamp(pop.qualifications + gain * 1.5);
            pop.desires = 'ottenere una professione più qualificata e meglio retribuita';
            addHistory(state, `Formazione finanziata per ${pop.name} (costo ${cost})`, context.turn, 'popolo');
        } else if (action === 'period') {
            if (integer(context.turn) <= state.lastPeriodTurn) throw new Error('Il periodo è già stato chiuso in questo turno');
            return runPeriod(state, context).state;
        } else {
            throw new Error('Azione del regno non riconosciuta');
        }
        recordStatistics(state, context.turn, 'decisione del giocatore');
        return state;
    }

    class KingdomManager {
        createDefault() { return createDefaultKingdom(); }
        migrate(input) { return migrateKingdom(input); }
        applyNarrativeEvents(input, events, context) { return applyNarrativeEvents(input, events, context); }
        processPeriods(input, context) { return processPeriods(input, context); }
        runPeriod(input, context) { return runPeriod(input, context); }
        buildNarrativeContext(input, turn, currency) { return buildNarrativeContext(input, turn, currency); }
        manualAction(input, action, context) { return manualAction(input, action, context); }
        parseNarrativeTags(response) { return parseNarrativeTags(response); }
    }

    return {
        SCHEMA_VERSION, SOCIAL_CLASSES, OCCUPATIONS, KingdomManager, createDefaultKingdom,
        migrateKingdom, applyNarrativeEvents, processPeriods, runPeriod,
        buildNarrativeContext, manualAction, parseNarrativeTags,
        normalizeTerritory, normalizePeople, normalizePop, normalizeJob,
        simulateLaborMarket, reconcileDerivedStatistics, recordStatistics,
        buildKingdomAdvisor, parseNumber, clean, keyOf
    };
});
