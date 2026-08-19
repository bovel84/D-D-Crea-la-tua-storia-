(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheManagementDirector = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 300) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

    function deriveManagementPressure(memory) {
        const management = memory?.management || {};
        const businesses = asArray(management.businesses).filter(item => item && item.status !== 'closed');
        const businessSignals = [];
        let businessLevel = 0;
        businesses.forEach(business => {
            const name = clean(business.name || business.propertyName || 'Attività', 80);
            const report = business.lastReport || {};
            const profit = number(report.netProfit);
            const lowStock = Array.isArray(report.lowStock)
                ? report.lowStock.length
                : asArray(business.products).filter(product =>
                    product?.active !== false && number(product.stock) <= Math.max(0, number(product.reorderPoint))
                ).length;
            if (number(business.cash) < 0) {
                businessLevel += 28;
                businessSignals.push(`${name}: cassa negativa`);
            }
            if (profit < 0) {
                businessLevel += 16;
                businessSignals.push(`${name}: ultimo periodo in perdita`);
            }
            if (lowStock > 0) {
                businessLevel += Math.min(22, 5 + lowStock * 4);
                businessSignals.push(`${name}: ${lowStock} prodotti sotto scorta`);
            }
            if (number(business.customerSatisfaction, 60) < 40) {
                businessLevel += 14;
                businessSignals.push(`${name}: clienti insoddisfatti`);
            }
        });
        businessLevel = Math.max(0, Math.min(100, businessLevel));

        const kingdom = memory?.kingdom || {};
        const kingdomSignals = [];
        let kingdomLevel = 0;
        if (kingdom.active) {
            if (number(kingdom.treasury) < 0) {
                kingdomLevel += 28;
                kingdomSignals.push('tesoro negativo');
            }
            if (number(kingdom.food) <= 0) {
                kingdomLevel += 30;
                kingdomSignals.push('riserve alimentari esaurite');
            }
            if (number(kingdom.stability, 50) < 40) {
                kingdomLevel += 20;
                kingdomSignals.push(`stabilità ${Math.round(number(kingdom.stability))}%`);
            }
            if (number(kingdom?.people?.unrest) >= 55) {
                kingdomLevel += 25;
                kingdomSignals.push(`disordini ${Math.round(number(kingdom.people.unrest))}%`);
            }
            if (number(kingdom?.people?.health, 50) < 35) {
                kingdomLevel += 12;
                kingdomSignals.push(`salute pubblica ${Math.round(number(kingdom.people.health))}%`);
            }
            const crises = asArray(kingdom.crises).filter(crisis => crisis?.status === 'active' && number(crisis.severity) >= 60);
            if (crises.length) {
                const severity = Math.max(...crises.map(crisis => number(crisis.severity)));
                kingdomLevel += Math.min(35, Math.round(severity * 0.35));
                kingdomSignals.push(`crisi attiva: ${clean(crises[0].name || crises[0].title || crises[0].description || 'crisi grave', 100)}`);
            }
        }
        kingdomLevel = Math.max(0, Math.min(100, kingdomLevel));

        const useKingdom = kingdomLevel >= businessLevel && kingdomLevel > 0;
        const level = useKingdom ? kingdomLevel : businessLevel;
        const signals = (useKingdom ? kingdomSignals : businessSignals).slice(0, 4);
        return {
            level,
            type: level ? (useKingdom ? 'regno' : 'attivita') : 'nessuna',
            summary: signals.length ? signals.join(' · ') : 'nessuna criticità gestionale rilevante',
            signals,
            businessLevel,
            kingdomLevel,
            businessSignals: businessSignals.slice(0, 5),
            kingdomSignals: kingdomSignals.slice(0, 5)
        };
    }

    function managementIntent(action, fallback = 'esplorazione') {
        const text = clean(action, 600).toLowerCase();
        if (/\b(tass|impost|decret|legge|consiglio|censiment|reclut|sussid|territor|sanit|istruzion|giustizia|govern|regno)\w*/.test(text)) return 'governo';
        if (/\b(compr|vend|prezz|fornitor|client|marketing|magazzin|scort|invest|assum|licenzi|pago|incass|prestito|affar|negozio|impresa|azienda)\w*/.test(text)) return 'economia';
        return fallback;
    }

    function augmentPlan(basePlan, action, context) {
        const memory = context?.memory || {};
        const management = deriveManagementPressure(memory);
        const intent = managementIntent(action, basePlan?.intent || 'esplorazione');
        const baseLevel = number(basePlan?.pressure?.level, 20);
        const bonus = management.level >= 70
            ? Math.round(management.level * 0.34)
            : management.level >= 40
                ? Math.round(management.level * 0.22)
                : Math.round(management.level * 0.10);
        const intentBonus = intent === 'governo' || intent === 'economia' ? 6 : 0;
        const pressureLevel = Math.max(10, Math.min(100, baseLevel + bonus + intentBonus));
        const managementDominates = management.level >= 45 && bonus >= 10;
        const pressureType = managementDominates ? management.type : (basePlan?.pressure?.type || 'narrativa');
        const sceneFocus = intent === 'governo'
            ? 'Decisioni pubbliche, costi, gruppi sociali, fazioni, istituzioni e conseguenze territoriali'
            : intent === 'economia'
                ? 'Costi, ricavi, scorte, contratti e reazioni di clienti, dipendenti, fornitori e concorrenti'
                : basePlan?.sceneFocus;
        const managementInstruction = `\n\nGESTIONE PERSISTENTE:\n- Pressione gestionale: ${management.level}/100 (${management.type}).\n- Segnali reali: ${management.summary}.\n- Se questi segnali sono rilevanti per il turno, trasformali in reazioni osservabili di clienti, dipendenti, fornitori, concorrenti, popolo, fazioni, istituzioni o potenze.\n- Non limitarti a cambiare numeri in silenzio e non inventare una crisi gestionale quando i segnali sono assenti.`;
        const state = basePlan?.state && typeof basePlan.state === 'object' ? {
            ...basePlan.state,
            currentIntent: intent,
            scene: {
                ...(basePlan.state.scene || {}),
                focus: sceneFocus,
                pressure: pressureLevel
            },
            lastPlan: {
                ...(basePlan.state.lastPlan || {}),
                intent,
                pressure: pressureLevel,
                managementType: management.type,
                managementPressure: management.level
            }
        } : basePlan?.state;
        return {
            ...basePlan,
            intent,
            sceneFocus,
            pressure: {
                ...(basePlan?.pressure || {}),
                level: pressureLevel,
                type: pressureType,
                management,
                description: managementDominates
                    ? `La pressione nasce anche dalla gestione: ${management.summary}.`
                    : basePlan?.pressure?.description
            },
            state,
            prompt: `${basePlan?.prompt || ''}${managementInstruction}`
        };
    }

    function install() {
        const director = root.CronacheDirector;
        if (!director?.GameDirector) return false;
        if (director.GameDirector.prototype.planTurn?.__managementDirectorWrapped) return true;
        const original = director.GameDirector.prototype.planTurn;
        if (typeof original !== 'function') return false;
        const wrapped = function managementAwarePlanTurn(action, context) {
            return augmentPlan(original.call(this, action, context), action, context);
        };
        wrapped.__managementDirectorWrapped = true;
        wrapped.__managementDirectorOriginal = original;
        director.GameDirector.prototype.planTurn = wrapped;
        director.deriveManagementPressure = deriveManagementPressure;
        director.managementIntent = managementIntent;
        root.__cronacheManagementDirectorVersion = PATCH_VERSION;
        return true;
    }

    function scheduleInstall() {
        if (install()) return;
        if (typeof setTimeout !== 'function') return;
        [0, 80, 250, 700, 1500, 3000].forEach(delay => setTimeout(install, delay));
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        deriveManagementPressure,
        managementIntent,
        augmentPlan,
        install
    };
});
