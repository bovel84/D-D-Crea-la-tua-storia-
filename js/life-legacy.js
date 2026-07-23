(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheLife = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SCHEMA_VERSION = 1;
    const MAX_TIMELINE = 80;
    const MAX_MILESTONES = 30;
    const DOMAINS = {
        body: { label: 'Corpo', icon: '💪' },
        mind: { label: 'Mente', icon: '🧠' },
        social: { label: 'Relazioni', icon: '🤝' },
        profession: { label: 'Professione', icon: '🧰' },
        leadership: { label: 'Leadership', icon: '👑' },
        craft: { label: 'Talento', icon: '✨' }
    };

    function clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function clean(value, maxLength) {
        const text = String(value == null ? '' : value)
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const limit = Number.isFinite(maxLength) ? maxLength : 500;
        return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
    }

    function keyOf(value) {
        return clean(value, 120)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    function clamp(value, min, max) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return min;
        return Math.max(min, Math.min(max, parsed));
    }

    function domainLevel(xp) {
        return Math.max(1, Math.min(10, 1 + Math.floor(Math.max(0, xp) / 100)));
    }

    function createDomains(source) {
        return Object.keys(DOMAINS).reduce((domains, key) => {
            const raw = source?.[key] || {};
            const xp = Math.max(0, parseInt(raw.xp, 10) || 0);
            domains[key] = {
                xp,
                level: domainLevel(xp),
                lastGain: clean(raw.lastGain, 180)
            };
            return domains;
        }, {});
    }

    function createDefaultLife() {
        return {
            schemaVersion: SCHEMA_VERSION,
            domains: createDomains(),
            talentPoints: 0,
            spentTalentPoints: 0,
            bonds: {},
            familyNeeds: {},
            milestones: [],
            timeline: [],
            portfolio: {
                totalValue: 0,
                monthlyIncome: 0,
                monthlyCosts: 0,
                netIncome: 0,
                averageCondition: 0,
                propertyCount: 0,
                employeeCount: 0
            },
            legacy: {
                score: 0,
                tier: 'Sconosciuto',
                nextTier: 'Promettente',
                progress: 0
            },
            updatedAtTurn: 0
        };
    }

    function normalizeBond(raw, fallbackName) {
        const source = raw && typeof raw === 'object' ? raw : {};
        return {
            name: clean(source.name || fallbackName || 'Sconosciuto', 100),
            type: clean(source.type || 'conoscenza', 50).toLowerCase(),
            trust: clamp(source.trust ?? 10, -100, 100),
            affection: clamp(source.affection ?? 0, -100, 100),
            respect: clamp(source.respect ?? 10, -100, 100),
            interactions: Math.max(0, parseInt(source.interactions, 10) || 0),
            lastInteraction: Math.max(0, parseInt(source.lastInteraction, 10) || 0),
            note: clean(source.note, 240)
        };
    }

    function normalizeFamilyNeed(raw, fallbackName) {
        const source = raw && typeof raw === 'object' ? raw : {};
        return {
            name: clean(source.name || fallbackName || 'Familiare', 100),
            bond: clamp(source.bond ?? 50, -100, 100),
            mood: clean(source.mood || 'content', 50),
            need: clean(source.need, 220),
            urgency: clamp(source.urgency ?? 20, 0, 100),
            lastUpdated: Math.max(0, parseInt(source.lastUpdated, 10) || 0)
        };
    }

    function migrateLife(input) {
        const source = input && typeof input === 'object' ? clone(input) : {};
        const defaults = createDefaultLife();
        const bonds = Object.entries(source.bonds || {}).reduce((result, [key, value]) => {
            const bond = normalizeBond(value, value?.name || key);
            result[keyOf(bond.name) || key] = bond;
            return result;
        }, {});
        const familyNeeds = Object.entries(source.familyNeeds || {}).reduce((result, [key, value]) => {
            const need = normalizeFamilyNeed(value, value?.name || key);
            result[keyOf(need.name) || key] = need;
            return result;
        }, {});
        return {
            ...defaults,
            ...source,
            schemaVersion: SCHEMA_VERSION,
            domains: createDomains(source.domains),
            talentPoints: Math.max(0, parseInt(source.talentPoints, 10) || 0),
            spentTalentPoints: Math.max(0, parseInt(source.spentTalentPoints, 10) || 0),
            bonds,
            familyNeeds,
            milestones: Array.isArray(source.milestones) ? source.milestones.slice(-MAX_MILESTONES) : [],
            timeline: Array.isArray(source.timeline) ? source.timeline.slice(-MAX_TIMELINE) : [],
            portfolio: { ...defaults.portfolio, ...(source.portfolio || {}) },
            legacy: { ...defaults.legacy, ...(source.legacy || {}) },
            updatedAtTurn: Math.max(0, parseInt(source.updatedAtTurn, 10) || 0)
        };
    }

    function relationshipLabel(bond) {
        const average = (bond.trust + bond.affection + bond.respect) / 3;
        if (average <= -50) return 'Nemico';
        if (average < 0) return 'Ostile';
        if (average < 20) return 'Conoscenza';
        if (average < 40) return 'Alleato';
        if (average < 65) return 'Amico';
        if (average < 85) return 'Amico stretto';
        return bond.type === 'partner' ? 'Compagno di vita' : 'Legame indissolubile';
    }

    function addTimeline(state, event) {
        state.timeline.push({
            turn: Math.max(0, parseInt(event.turn, 10) || 0),
            type: clean(event.type || 'life', 40),
            title: clean(event.title || 'Evento di vita', 100),
            description: clean(event.description, 300),
            importance: ['normal', 'high', 'critical'].includes(event.importance) ? event.importance : 'normal'
        });
        state.timeline = state.timeline.slice(-MAX_TIMELINE);
    }

    function addGrowth(state, area, xp, description, turn) {
        const key = Object.prototype.hasOwnProperty.call(DOMAINS, area) ? area : 'craft';
        const gain = Math.max(0, Math.min(500, parseInt(xp, 10) || 0));
        if (!gain) return { area: key, gain: 0, levelsGained: 0 };
        const domain = state.domains[key];
        const before = domain.level;
        domain.xp += gain;
        domain.level = domainLevel(domain.xp);
        domain.lastGain = clean(description, 180);
        const levelsGained = Math.max(0, domain.level - before);
        state.talentPoints += levelsGained;
        addTimeline(state, {
            turn,
            type: 'growth',
            title: `${DOMAINS[key].label} +${gain}`,
            description: description || `Crescita nell’area ${DOMAINS[key].label}.`,
            importance: levelsGained ? 'high' : 'normal'
        });
        if (levelsGained) {
            state.milestones.push({
                turn,
                title: `${DOMAINS[key].label} livello ${domain.level}`,
                area: key,
                level: domain.level
            });
            state.milestones = state.milestones.slice(-MAX_MILESTONES);
        }
        return { area: key, gain, levelsGained };
    }

    function updateBond(state, update, turn) {
        const name = clean(update.name, 100);
        if (!name) return null;
        const key = keyOf(name);
        const bond = normalizeBond(state.bonds[key], name);
        bond.name = name;
        if (update.type) bond.type = clean(update.type, 50).toLowerCase();
        bond.trust = clamp(bond.trust + Number(update.trust || 0), -100, 100);
        bond.affection = clamp(bond.affection + Number(update.affection || 0), -100, 100);
        bond.respect = clamp(bond.respect + Number(update.respect || 0), -100, 100);
        bond.interactions += 1;
        bond.lastInteraction = turn;
        if (update.note) bond.note = clean(update.note, 240);
        state.bonds[key] = bond;
        addTimeline(state, {
            turn,
            type: 'bond',
            title: `${name} · ${relationshipLabel(bond)}`,
            description: bond.note || 'Il rapporto è cambiato.',
            importance: Math.max(Math.abs(Number(update.trust || 0)), Math.abs(Number(update.affection || 0)), Math.abs(Number(update.respect || 0))) >= 15 ? 'high' : 'normal'
        });
        return bond;
    }

    function updateFamilyNeed(state, update, turn) {
        const name = clean(update.name, 100);
        if (!name) return null;
        const key = keyOf(name);
        const item = normalizeFamilyNeed(state.familyNeeds[key], name);
        item.name = name;
        item.bond = clamp(item.bond + Number(update.bond || 0), -100, 100);
        if (update.mood) item.mood = clean(update.mood, 50);
        if (update.need !== undefined) item.need = clean(update.need, 220);
        if (update.urgency !== undefined) item.urgency = clamp(update.urgency, 0, 100);
        item.lastUpdated = turn;
        state.familyNeeds[key] = item;
        addTimeline(state, {
            turn,
            type: 'family',
            title: `${name} · ${item.mood}`,
            description: item.need || 'Il rapporto familiare è cambiato.',
            importance: item.urgency >= 70 ? 'high' : 'normal'
        });
        return item;
    }

    function computePortfolio(properties, employees) {
        const safeProperties = Array.isArray(properties) ? properties : [];
        const activeEmployees = (Array.isArray(employees) ? employees : []).filter(employee => employee?.status !== 'fired');
        const totals = safeProperties.reduce((result, property) => {
            const condition = clamp(property?.condition ?? 80, 0, 100);
            const baseValue = Math.max(0, Number(property?.baseValue || 0));
            const conditionFactor = 0.2 + condition / 100;
            result.totalValue += Math.round(baseValue * conditionFactor);
            result.monthlyIncome += Number(property?.income || 0);
            result.monthlyCosts += Number(property?.maintenanceCost || 0);
            result.conditionTotal += condition;
            return result;
        }, { totalValue: 0, monthlyIncome: 0, monthlyCosts: 0, conditionTotal: 0 });
        const salaries = activeEmployees.reduce((sum, employee) => sum + Number(employee?.salary || 0), 0);
        return {
            totalValue: totals.totalValue,
            monthlyIncome: totals.monthlyIncome,
            monthlyCosts: totals.monthlyCosts + salaries,
            netIncome: totals.monthlyIncome - totals.monthlyCosts - salaries,
            averageCondition: safeProperties.length ? Math.round(totals.conditionTotal / safeProperties.length) : 0,
            propertyCount: safeProperties.length,
            employeeCount: activeEmployees.length
        };
    }

    function legacyTier(score) {
        if (score >= 600) return { tier: 'Leggendario', nextTier: null, floor: 600, ceiling: 600 };
        if (score >= 350) return { tier: 'Rinomato', nextTier: 'Leggendario', floor: 350, ceiling: 600 };
        if (score >= 180) return { tier: 'Affermato', nextTier: 'Rinomato', floor: 180, ceiling: 350 };
        if (score >= 70) return { tier: 'Promettente', nextTier: 'Affermato', floor: 70, ceiling: 180 };
        return { tier: 'Sconosciuto', nextTier: 'Promettente', floor: 0, ceiling: 70 };
    }

    function computeLegacy(state, character, worldMemory) {
        const domainLevels = Object.values(state.domains).reduce((sum, domain) => sum + domain.level, 0);
        const closeBonds = Object.values(state.bonds).filter(bond => ['Amico', 'Amico stretto', 'Compagno di vita', 'Legame indissolubile'].includes(relationshipLabel(bond))).length;
        const livingFamily = (Array.isArray(worldMemory?.family) ? worldMemory.family : []).filter(member => member?.status !== 'dead').length;
        const propertyScore = Math.round(Math.log10(Math.max(1, state.portfolio.totalValue + 1)) * 24);
        const score = Math.round(
            Math.max(1, Number(character?.level || 1)) * 20 +
            domainLevels * 7 +
            closeBonds * 12 +
            livingFamily * 8 +
            state.milestones.length * 14 +
            propertyScore
        );
        const tier = legacyTier(score);
        const progress = tier.nextTier
            ? Math.round(((score - tier.floor) / (tier.ceiling - tier.floor)) * 100)
            : 100;
        return { score, tier: tier.tier, nextTier: tier.nextTier, progress: clamp(progress, 0, 100) };
    }

    function extractTags(response) {
        const text = String(response == null ? '' : response);
        const growth = [];
        const bonds = [];
        const family = [];
        const property = [];
        let match;
        const growthRe = /\[CRESCITA:\s*([^|\]]+)\|([^|\]]+)(?:\|([^\]]+))?\]/gi;
        while ((match = growthRe.exec(text)) !== null) {
            growth.push({ area: keyOf(match[1]), xp: parseInt(match[2], 10) || 0, description: clean(match[3], 240) });
        }
        const bondRe = /\[LEGAME:\s*([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)(?:\|([^\]]+))?\]/gi;
        while ((match = bondRe.exec(text)) !== null) {
            bonds.push({
                name: clean(match[1], 100),
                type: clean(match[2], 50),
                trust: parseInt(match[3], 10) || 0,
                affection: parseInt(match[4], 10) || 0,
                respect: parseInt(match[5], 10) || 0,
                note: clean(match[6], 240)
            });
        }
        const familyRe = /\[FAMIGLIA_STATO:\s*([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)(?:\|([^\]]+))?\]/gi;
        while ((match = familyRe.exec(text)) !== null) {
            family.push({
                name: clean(match[1], 100),
                bond: parseInt(match[2], 10) || 0,
                mood: clean(match[3], 50),
                need: clean(match[4], 220),
                urgency: match[5] === undefined ? undefined : parseInt(match[5], 10)
            });
        }
        const propertyRe = /\[PROPRIETA_STATO:\s*([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)(?:\|([^\]]+))?\]/gi;
        while ((match = propertyRe.exec(text)) !== null) {
            property.push({
                name: clean(match[1], 100),
                condition: parseInt(match[2], 10) || 0,
                value: parseInt(match[3], 10) || 0,
                income: parseInt(match[4], 10) || 0,
                note: clean(match[5], 240)
            });
        }
        return { growth, bonds, family, property };
    }

    function mirrorBond(worldMemory, bond) {
        const npc = (worldMemory?.npcs || []).find(item => keyOf(item?.name) === keyOf(bond.name));
        if (npc) {
            npc.bond = {
                trust: bond.trust,
                affection: bond.affection,
                respect: bond.respect,
                label: relationshipLabel(bond)
            };
        }
    }

    function mirrorFamily(worldMemory, familyNeed) {
        const member = (worldMemory?.family || []).find(item => keyOf(item?.name) === keyOf(familyNeed.name));
        if (member) {
            member.bond = familyNeed.bond;
            member.mood = familyNeed.mood;
            member.need = familyNeed.need;
            member.needUrgency = familyNeed.urgency;
        }
    }

    function updateProperty(worldMemory, update, turn) {
        const property = (worldMemory?.properties || []).find(item => keyOf(item?.name) === keyOf(update.name));
        if (!property) return null;
        property.condition = clamp(Number(property.condition || 0) + update.condition, 0, 100);
        property.baseValue = Math.max(0, Number(property.baseValue || 0) + update.value);
        property.income = Number(property.income || 0) + update.income;
        property.lastUpdated = turn;
        property.events = Array.isArray(property.events) ? property.events : [];
        if (update.note) property.events.push({ turn, text: update.note, type: 'life-engine' });
        property.events = property.events.slice(-30);
        return property;
    }

    function syncExistingRelationships(state, worldMemory, turn) {
        (worldMemory?.family || []).forEach(member => {
            const key = keyOf(member?.name);
            if (!key || state.familyNeeds[key]) return;
            state.familyNeeds[key] = normalizeFamilyNeed({
                name: member.name,
                bond: member.bond ?? 50,
                mood: member.mood || 'content',
                need: member.need || '',
                urgency: member.needUrgency ?? 20,
                lastUpdated: turn
            }, member.name);
        });
        (worldMemory?.npcs || []).forEach(npc => {
            const key = keyOf(npc?.name);
            if (!key || state.bonds[key]) return;
            const friendly = /amic|alleat|friend/i.test(npc.relationship || '');
            const hostile = /nemic|ostil|hostile/i.test(npc.relationship || '');
            state.bonds[key] = normalizeBond({
                name: npc.name,
                type: friendly ? 'amicizia' : hostile ? 'rivalità' : 'conoscenza',
                trust: friendly ? 35 : hostile ? -35 : 10,
                affection: friendly ? 25 : hostile ? -20 : 0,
                respect: friendly ? 30 : hostile ? 5 : 10,
                interactions: npc.interactionCount || 0,
                lastInteraction: npc.lastSeen || 0
            }, npc.name);
        });
    }

    function commitTurn(action, response, character, worldMemory) {
        if (!character || typeof character !== 'object') return null;
        const state = migrateLife(character.life);
        const turn = Math.max(0, parseInt(worldMemory?.turnCount, 10) || state.updatedAtTurn + 1);
        syncExistingRelationships(state, worldMemory || {}, turn);
        const tags = extractTags(response);
        tags.growth.forEach(item => addGrowth(state, item.area, item.xp, item.description, turn));
        tags.bonds.forEach(item => {
            const bond = updateBond(state, item, turn);
            if (bond) mirrorBond(worldMemory, bond);
        });
        tags.family.forEach(item => {
            const familyNeed = updateFamilyNeed(state, item, turn);
            if (familyNeed) mirrorFamily(worldMemory, familyNeed);
        });
        tags.property.forEach(item => {
            const property = updateProperty(worldMemory, item, turn);
            if (property) {
                addTimeline(state, {
                    turn,
                    type: 'property',
                    title: property.name,
                    description: item.note || 'La proprietà è cambiata.',
                    importance: Math.abs(item.condition) >= 15 || Math.abs(item.value) >= 1000 ? 'high' : 'normal'
                });
            }
        });
        state.portfolio = computePortfolio(worldMemory?.properties, worldMemory?.employees);
        state.legacy = computeLegacy(state, character, worldMemory || {});
        state.updatedAtTurn = turn;
        character.life = state;
        return {
            state,
            action: clean(action, 240),
            applied: {
                growth: tags.growth.length,
                bonds: tags.bonds.length,
                family: tags.family.length,
                property: tags.property.length
            }
        };
    }

    function buildPrompt(character, worldMemory) {
        const state = migrateLife(character?.life);
        syncExistingRelationships(state, worldMemory || {}, worldMemory?.turnCount || 0);
        state.portfolio = computePortfolio(worldMemory?.properties, worldMemory?.employees);
        state.legacy = computeLegacy(state, character || {}, worldMemory || {});
        if (character) character.life = state;
        const domains = Object.entries(state.domains)
            .map(([key, domain]) => `${DOMAINS[key].label} Lv.${domain.level} (${domain.xp} XP)`)
            .join(' · ');
        const bonds = Object.values(state.bonds)
            .sort((a, b) => (b.trust + b.affection + b.respect) - (a.trust + a.affection + a.respect))
            .slice(0, 6)
            .map(bond => `${bond.name}: ${relationshipLabel(bond)} [fiducia ${bond.trust}, affetto ${bond.affection}, rispetto ${bond.respect}]`)
            .join('\n') || 'Nessun legame significativo.';
        const needs = Object.values(state.familyNeeds)
            .filter(item => item.need)
            .sort((a, b) => b.urgency - a.urgency)
            .slice(0, 5)
            .map(item => `${item.name}: ${item.need} (urgenza ${item.urgency}/100, umore ${item.mood})`)
            .join('\n') || 'Nessun bisogno familiare aperto.';
        return `🌱 VITA, CRESCITA E LEGAMI
Profilo di crescita: ${domains}
Punti talento disponibili: ${state.talentPoints}
Eredità: ${state.legacy.tier} (${state.legacy.score} punti)
Patrimonio: ${state.portfolio.propertyCount} proprietà, valore ${state.portfolio.totalValue}, reddito netto ${state.portfolio.netIncome}

LEGAMI PRINCIPALI:
${bonds}

BISOGNI FAMILIARI:
${needs}

Quando il turno produce un cambiamento reale, usa solo i tag pertinenti:
- [CRESCITA: body/mind/social/profession/leadership/craft|XP 1-50|motivo]
- [LEGAME: nome|tipo|fiducia_delta|affetto_delta|rispetto_delta|nota]
- [FAMIGLIA_STATO: nome|legame_delta|umore|bisogno|urgenza_0_100]
- [PROPRIETA_STATO: nome|condizione_delta|valore_delta|reddito_delta|nota]

Non assegnare crescita o variazioni di rapporto per azioni banali. I cambiamenti devono derivare da ciò che accade nella scena.`;
    }

    class LifeLegacyEngine {
        createDefault() { return createDefaultLife(); }
        migrate(input) { return migrateLife(input); }
        commitTurn(action, response, character, worldMemory) { return commitTurn(action, response, character, worldMemory); }
        buildPrompt(character, worldMemory) { return buildPrompt(character, worldMemory); }
        computePortfolio(properties, employees) { return computePortfolio(properties, employees); }
        computeLegacy(state, character, worldMemory) { return computeLegacy(state, character, worldMemory); }
    }

    return {
        SCHEMA_VERSION,
        MAX_TIMELINE,
        MAX_MILESTONES,
        DOMAINS,
        LifeLegacyEngine,
        clean,
        keyOf,
        clamp,
        domainLevel,
        createDefaultLife,
        migrateLife,
        relationshipLabel,
        addGrowth,
        updateBond,
        updateFamilyNeed,
        computePortfolio,
        computeLegacy,
        extractTags,
        commitTurn,
        buildPrompt
    };
});
