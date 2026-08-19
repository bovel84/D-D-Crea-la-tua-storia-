(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheBusinessSectorEffects = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const asArray = value => Array.isArray(value) ? value : [];
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, number(value, min)));
    const clean = (value, max = 220) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);

    function addEffect(report, text) {
        report.sectorEffects = Array.isArray(report.sectorEffects) ? report.sectorEffects : [];
        const value = clean(text, 260);
        if (value && !report.sectorEffects.includes(value)) report.sectorEffects.push(value);
        report.sectorEffects = report.sectorEffects.slice(-6);
    }

    function activeStaff(business, employees) {
        const property = clean(business?.propertyName || business?.name, 100).toLowerCase();
        return asArray(employees).filter(employee =>
            employee?.status !== 'fired' && clean(employee?.property, 100).toLowerCase() === property
        );
    }

    function avg(items, field, fallback) {
        const list = asArray(items);
        if (!list.length) return fallback;
        return list.reduce((total, item) => total + number(item?.[field], fallback), 0) / list.length;
    }

    function loseStock(products, rate, predicate) {
        let lost = 0;
        asArray(products).forEach(product => {
            if (product?.active === false || (predicate && !predicate(product))) return;
            const stock = Math.max(0, Math.round(number(product.stock)));
            const threshold = Math.max(2, Math.round(number(product.reorderPoint, 0) * 1.25));
            if (stock <= threshold) return;
            const quantity = Math.min(stock - threshold, Math.max(0, Math.floor(stock * rate)));
            if (!quantity) return;
            product.stock = stock - quantity;
            lost += quantity;
        });
        return lost;
    }

    function applySectorPeriodEffects(business, report, context = {}, sectorApi = root.CronacheBusinessSpecializations, businessApi = root.CronacheBusiness) {
        if (!business || !report || !sectorApi?.buildSectorSnapshot) return report;
        const employees = asArray(context.employees);
        const turn = number(context.turn);
        const before = sectorApi.buildSectorSnapshot(business, employees, turn);
        const profile = before.profile;
        const staff = activeStaff(business, employees);
        const supplierReliability = before.supplierReliability;
        const lowStock = before.lowStock.length;

        if (profile.key === 'greengrocer') {
            const lost = loseStock(business.products, 0.06, product =>
                /frutt|verdur|ortaggi|fresc|aliment|erbe|insalat|pomodor|agrum|mele|pere/i.test(`${product.name || ''} ${product.category || ''}`)
            );
            if (lost > 0) {
                business.customerSatisfaction = clamp(number(business.customerSatisfaction, 60) - 1);
                addEffect(report, `Deperibilità ortofrutta: ${lost} unità non più vendibili a fine periodo.`);
                businessApi?.addBusinessNote?.(business, `🥬 ${lost} unità di merce fresca perse per deperibilità e rotazione insufficiente.`, turn);
            }
        } else if (profile.key === 'farm') {
            const sold = Math.max(1, number(report.unitsSold, 0));
            const stock = asArray(business.products).reduce((total, product) => total + number(product.stock), 0);
            if (stock > sold * 5) {
                const lost = loseStock(business.products, 0.02);
                if (lost > 0) {
                    addEffect(report, `Perdite di stoccaggio agricolo: ${lost} unità su scorte eccedenti.`);
                    businessApi?.addBusinessNote?.(business, `🌾 ${lost} unità perse nello stoccaggio del raccolto eccedente.`, turn);
                }
            }
        } else if (profile.key === 'restaurant') {
            const morale = avg(staff, 'morale', 60);
            const skill = avg(staff, 'skill', 50);
            let delta = 0;
            if (lowStock > 0) delta -= Math.min(4, lowStock);
            if (morale < 40) delta -= 2;
            if (skill >= 70 && morale >= 60 && lowStock === 0) delta += 2;
            if (delta) {
                business.customerSatisfaction = clamp(number(business.customerSatisfaction, 60) + delta);
                business.reputation = clamp(number(business.reputation, 50) + Math.sign(delta));
                addEffect(report, `Servizio ristorazione: soddisfazione ${delta > 0 ? '+' : ''}${delta} per menu, scorte e qualità dello staff.`);
            }
        } else if (profile.key === 'factory') {
            if (lowStock > 0 && supplierReliability < 65) {
                business.customerSatisfaction = clamp(number(business.customerSatisfaction, 60) - 2);
                business.reputation = clamp(number(business.reputation, 50) - 1);
                addEffect(report, `Collo di bottiglia produttivo: ${lowStock} scorte critiche e affidabilità filiera ${supplierReliability}%.`);
                businessApi?.addBusinessNote?.(business, '🏭 La filiera ha limitato la continuità produttiva e le consegne.', turn);
            }
        } else if (profile.key === 'workshop') {
            const skill = avg(staff, 'skill', 50);
            const activeContracts = asArray(business.contracts).filter(item => item.status === 'active').length;
            if (activeContracts > 0 && skill >= 70) {
                business.reputation = clamp(number(business.reputation, 50) + 1);
                addEffect(report, `Qualità artigiana: reputazione +1 con competenza media ${Math.round(skill)}% sulle commesse attive.`);
            } else if (activeContracts > 0 && skill < 40) {
                business.customerSatisfaction = clamp(number(business.customerSatisfaction, 60) - 2);
                addEffect(report, `Commesse sotto pressione: competenza media ${Math.round(skill)}%.`);
            }
        } else if (profile.key === 'services') {
            const activeContracts = asArray(business.contracts).filter(item => item.status === 'active').length;
            if (activeContracts > 0 && number(business.customerSatisfaction, 60) >= 75) {
                business.reputation = clamp(number(business.reputation, 50) + 1);
                addEffect(report, 'Servizi professionali: reputazione +1 grazie a contratti attivi e clienti soddisfatti.');
            }
        } else if (profile.key === 'pawnbroker' || profile.key === 'bank') {
            const loanPattern = /pegno|prestito|credito|mutuo|finanziamento|factoring|fido/i;
            const exposure = asArray(business.contracts)
                .filter(contract => contract?.status === 'active' && loanPattern.test(`${contract.title || ''} ${contract.kind || ''} ${contract.notes || ''}`))
                .reduce((total, contract) => total + number(contract.amount), 0);
            if (exposure > 0) {
                const liquidity = Math.round((number(business.cash) / exposure) * 100);
                addEffect(report, `${profile.label}: liquidità/esposizione ${liquidity}% su ${exposure.toLocaleString('it-IT')} di rapporti attivi.`);
            }
        }

        if (businessApi?.inventoryValue) report.inventoryValue = businessApi.inventoryValue(business);
        report.customerSatisfaction = business.customerSatisfaction;
        report.reputation = business.reputation;
        business.lastReport = report;
        return report;
    }

    function install() {
        const api = root.CronacheBusiness;
        const proto = api?.BusinessManager?.prototype;
        if (!proto) return false;

        if (typeof proto.runPeriod === 'function' && !proto.runPeriod.__sectorEffectsWrapped) {
            const originalRun = proto.runPeriod;
            const wrappedRun = function sectorRunPeriod(business, context, random) {
                const report = originalRun.call(this, business, context, random);
                return applySectorPeriodEffects(business, report, context, root.CronacheBusinessSpecializations, api);
            };
            wrappedRun.__sectorEffectsWrapped = true;
            wrappedRun.__sectorEffectsOriginal = originalRun;
            proto.runPeriod = wrappedRun;
        }

        if (typeof proto.processPeriods === 'function' && !proto.processPeriods.__sectorEffectsWrapped) {
            const originalProcess = proto.processPeriods;
            const wrappedProcess = function sectorProcessPeriods(state, context, random) {
                const outcome = originalProcess.call(this, state, context, random);
                asArray(outcome?.reports).forEach(entry => {
                    applySectorPeriodEffects(entry.business, entry.report, context, root.CronacheBusinessSpecializations, api);
                });
                return outcome;
            };
            wrappedProcess.__sectorEffectsWrapped = true;
            wrappedProcess.__sectorEffectsOriginal = originalProcess;
            proto.processPeriods = wrappedProcess;
        }

        root.__cronacheBusinessSectorEffectsVersion = PATCH_VERSION;
        return true;
    }

    function scheduleInstall() {
        if (install()) return;
        if (typeof setTimeout !== 'function') return;
        [0, 100, 350, 900, 1800, 3500].forEach(delay => setTimeout(install, delay));
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        applySectorPeriodEffects,
        install
    };
});