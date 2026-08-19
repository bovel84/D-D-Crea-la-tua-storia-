(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheBusinessNarrativeRecovery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 300) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const keyOf = value => clean(value, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const BUSINESS_STATUS_ALIASES = new Map([
        ['active', 'active'], ['attivo', 'active'], ['attiva', 'active'], ['operativo', 'active'], ['operativa', 'active'],
        ['aperto', 'active'], ['aperta', 'active'], ['in-corso', 'active'], ['vigente', 'active'], ['funzionante', 'active'],
        ['paused', 'paused'], ['sospeso', 'paused'], ['sospesa', 'paused'], ['in-pausa', 'paused'], ['fermo', 'paused'], ['ferma', 'paused'],
        ['closed', 'closed'], ['chiuso', 'closed'], ['chiusa', 'closed'], ['cessato', 'closed'], ['cessata', 'closed'],
        ['terminato', 'closed'], ['terminata', 'closed']
    ]);

    const CONTRACT_STATUS_ALIASES = new Map([
        ['draft', 'draft'], ['bozza', 'draft'], ['proposta', 'draft'], ['da-firmare', 'draft'], ['in-negoziazione', 'draft'],
        ['active', 'active'], ['attivo', 'active'], ['attiva', 'active'], ['in-corso', 'active'], ['vigente', 'active'],
        ['efficace', 'active'], ['esecutivo', 'active'], ['esecutiva', 'active'],
        ['paused', 'paused'], ['sospeso', 'paused'], ['sospesa', 'paused'], ['in-pausa', 'paused'], ['congelato', 'paused'],
        ['expired', 'expired'], ['scaduto', 'expired'], ['scaduta', 'expired'],
        ['terminated', 'terminated'], ['terminato', 'terminated'], ['terminata', 'terminated'], ['risolto', 'terminated'],
        ['risolta', 'terminated'], ['concluso', 'terminated'], ['conclusa', 'terminated'], ['chiuso', 'terminated'], ['chiusa', 'terminated'],
        ['revocato', 'terminated'], ['revocata', 'terminated']
    ]);

    const UNSPECIFIED_AMOUNT = /^(?:n\/?d|nd|n\.d\.|non definito|non definita|da definire|da concordare|non quantificato|non quantificata|non specificato|non specificata|variabile|a consumo|secondo consumo|secondo fattura|su ordine|da calcolare)$/i;

    function normalizeBusinessStatus(value) {
        const raw = clean(value, 80);
        if (!raw) return '';
        return BUSINESS_STATUS_ALIASES.get(keyOf(raw)) || '';
    }

    function normalizeContractStatus(value) {
        const raw = clean(value, 80);
        if (!raw) return '';
        return CONTRACT_STATUS_ALIASES.get(keyOf(raw)) || '';
    }

    function containsNarrativeNumber(value) {
        if (typeof value === 'number') return Number.isFinite(value);
        return /[+-]?(?:\d[\d.,]*|[.,]\d+)/.test(String(value == null ? '' : value));
    }

    function normalizeOptionalAmount(value) {
        if (value == null || value === '') return value;
        if (containsNarrativeNumber(value)) return value;
        const raw = clean(value, 100);
        return UNSPECIFIED_AMOUNT.test(raw) ? '' : value;
    }

    function findBusiness(state, businessName) {
        const wanted = keyOf(businessName);
        if (!wanted) return null;
        const rows = asArray(state?.businesses).length
            ? asArray(state.businesses)
            : asArray(state?.management?.businesses);
        return rows.find(item => keyOf(item?.name || item?.propertyName) === wanted) || null;
    }

    function repairProfile(event, state) {
        const next = { ...event };
        const business = findBusiness(state, next.businessName);
        const currentStatus = normalizeBusinessStatus(next.status);
        const satisfactionAsStatus = normalizeBusinessStatus(next.satisfaction);

        // Common LLM omission: satisfaction is omitted and the remaining positional fields shift left.
        if (!currentStatus && satisfactionAsStatus && !clean(next.description, 240)) {
            next.description = clean(next.status, 240);
            next.status = satisfactionAsStatus;
            next.satisfaction = business?.customerSatisfaction ?? 65;
        } else {
            next.status = currentStatus || normalizeBusinessStatus(business?.status) || 'active';
        }

        if (!clean(next.businessType, 60)) next.businessType = clean(business?.type, 60) || 'commercio';
        if (next.cash == null || next.cash === '') next.cash = business?.cash ?? 0;
        if (next.reputation == null || next.reputation === '') next.reputation = business?.reputation ?? 50;
        if (next.satisfaction == null || next.satisfaction === '') next.satisfaction = business?.customerSatisfaction ?? 65;
        if (!clean(next.description, 240)) {
            next.description = clean(business?.description, 240) || `Assetto di ${clean(next.businessName, 100) || 'attività'} definito dalla storia`;
        }
        return next;
    }

    function repairContract(event) {
        const next = { ...event };
        next.amount = normalizeOptionalAmount(next.amount);
        const normalized = normalizeContractStatus(next.status);
        if (normalized) next.status = normalized;
        return next;
    }

    function repairEvent(event, state) {
        if (!event || typeof event !== 'object') return event;
        if (event.type === 'profile') return repairProfile(event, state);
        if (event.type === 'contract') return repairContract(event);
        return event;
    }

    function repairEvents(events, state) {
        return asArray(events).map(event => repairEvent(event, state));
    }

    function install() {
        const BusinessManager = root.CronacheBusiness?.BusinessManager;
        if (!BusinessManager?.prototype) return false;
        const original = BusinessManager.prototype.applyNarrativeEvents;
        if (typeof original !== 'function') return false;
        if (original.__businessNarrativeRecoveryWrapped) return true;

        const wrapped = function recoveredBusinessNarrativeEvents(state, events, context) {
            const repaired = repairEvents(events, state);
            return original.call(this, state, repaired, context);
        };
        wrapped.__businessNarrativeRecoveryWrapped = true;
        wrapped.__businessNarrativeRecoveryOriginal = original;
        BusinessManager.prototype.applyNarrativeEvents = wrapped;
        root.__cronacheBusinessNarrativeRecoveryVersion = PATCH_VERSION;
        return true;
    }

    function scheduleInstall() {
        if (install()) return;
        if (typeof root.setTimeout !== 'function') return;
        [0, 80, 250, 700, 1500].forEach(delay => root.setTimeout(install, delay));
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        normalizeBusinessStatus,
        normalizeContractStatus,
        normalizeOptionalAmount,
        repairProfile,
        repairContract,
        repairEvent,
        repairEvents,
        install
    };
});
