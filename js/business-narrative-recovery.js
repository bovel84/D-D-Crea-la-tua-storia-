(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheBusinessNarrativeRecovery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 2;
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
    const GENERIC_COUNTERPARTY = /^(?:cliente|cliente generico|clientela|clientela abituale|fornitore|fornitore locale|fornitore generico|mercante|azienda|impresa)$/i;

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

    function narrativeNumber(value) {
        const parser = root.CronacheBusiness?.parseNarrativeNumber;
        if (typeof parser === 'function') return parser(value);
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        const raw = String(value == null ? '' : value).replace(/\s+/g, '');
        const match = raw.match(/[+-]?(?:\d[\d.,]*|[.,]\d+)/);
        if (!match) return null;
        let normalized = match[0];
        const comma = normalized.lastIndexOf(',');
        const dot = normalized.lastIndexOf('.');
        if (comma >= 0 && dot >= 0) {
            const decimal = comma > dot ? ',' : '.';
            const thousands = decimal === ',' ? '.' : ',';
            normalized = normalized.split(thousands).join('').replace(decimal, '.');
        } else if (comma >= 0) normalized = normalized.replace(',', '.');
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
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
        return rows.find(item => keyOf(item?.name) === wanted || keyOf(item?.propertyName) === wanted) || null;
    }

    function findCustomer(business, name) {
        const wanted = keyOf(name);
        return asArray(business?.customers).find(item => keyOf(item?.name) === wanted) || null;
    }

    function findSupplier(business, name) {
        const wanted = keyOf(name);
        return asArray(business?.suppliers).find(item => keyOf(item?.name) === wanted) || null;
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
        const partyType = keyOf(next.counterpartyType);
        if (/^(?:cliente|client|customer|acquirente)$/.test(partyType)) next.counterpartyType = 'customer';
        if (/^(?:fornitore|supplier|vendor|approvvigionatore)$/.test(partyType)) next.counterpartyType = 'supplier';
        return next;
    }

    function repairCustomer(event, state) {
        const next = { ...event };
        const business = findBusiness(state, next.businessName);
        const existing = findCustomer(business, next.customerName);
        if (!clean(next.segment, 60)) next.segment = clean(existing?.segment, 60) || 'occasionale';
        if (next.loyalty == null || next.loyalty === '') next.loyalty = existing?.loyalty ?? 40;
        if (next.satisfaction == null || next.satisfaction === '') {
            next.satisfaction = existing?.satisfaction ?? business?.customerSatisfaction ?? 60;
        }
        ['loyalty', 'satisfaction', 'visits'].forEach(field => {
            if (next[field] == null || next[field] === '') return;
            const parsed = narrativeNumber(next[field]);
            if (parsed != null) next[field] = parsed;
        });
        return next;
    }

    function defaultSupplierCategory(business) {
        const type = keyOf(business?.type);
        if (/ristor|tavern|oster|locand|bar|caffe/.test(type)) return 'forniture alimentari';
        if (/artig|officin|laborator/.test(type)) return 'materie prime';
        if (/agricol|fattor|vign/.test(type)) return 'sementi e attrezzature';
        if (/produzion|fabbric|industr/.test(type)) return 'materie prime';
        if (/banc|credit|finanz|assicur/.test(type)) return 'liquidità e servizi finanziari';
        if (/serviz|studio|agenz|consul/.test(type)) return 'servizi professionali';
        return 'merci e approvvigionamenti';
    }

    function repairSupplier(event, state) {
        const next = { ...event };
        const business = findBusiness(state, next.businessName);
        const existing = findSupplier(business, next.supplierName);
        if (!clean(next.category, 80)) next.category = clean(existing?.category, 80) || defaultSupplierCategory(business);
        if (next.reliability == null || next.reliability === '') next.reliability = existing?.reliability ?? 75;
        if (next.leadTurns == null || next.leadTurns === '') next.leadTurns = existing?.leadTurns ?? 1;
        if (next.discount == null || next.discount === '') next.discount = existing?.discount ?? 0;
        if (next.status == null || next.status === '') next.status = existing?.status || 'active';
        const supplierStatus = keyOf(next.status);
        if (/^(?:attivo|attiva|operativo|operativa|active)$/.test(supplierStatus)) next.status = 'active';
        if (/^(?:inattivo|inattiva|sospeso|sospesa|inactive)$/.test(supplierStatus)) next.status = 'inactive';
        ['reliability', 'leadTurns', 'discount'].forEach(field => {
            const parsed = narrativeNumber(next[field]);
            if (parsed != null) next[field] = parsed;
        });
        return next;
    }

    function normalizeCashDirection(value) {
        const key = keyOf(value);
        if (/^(?:entra|in|entrata|incasso|incassato|ricavo|ricavi|credito|accredito|ricevuto|ricevuta)$/.test(key)) return 'in';
        if (/^(?:esce|out|uscita|spesa|costo|costi|pagamento|pagato|pagata|addebito|debito)$/.test(key)) return 'out';
        return clean(value, 30).toLowerCase();
    }

    function repairCash(event) {
        const next = { ...event };
        next.direction = normalizeCashDirection(next.direction);
        const parsed = narrativeNumber(next.amount);
        if (parsed != null) next.amount = Math.abs(parsed);
        return next;
    }

    function repairNumericEvent(event, fields) {
        const next = { ...event };
        fields.forEach(field => {
            if (next[field] == null || next[field] === '') return;
            const parsed = narrativeNumber(next[field]);
            if (parsed != null) next[field] = parsed;
        });
        return next;
    }

    function repairEvent(event, state) {
        if (!event || typeof event !== 'object') return event;
        if (event.type === 'profile') return repairProfile(event, state);
        if (event.type === 'contract') return repairContract(event);
        if (event.type === 'customer') return repairCustomer(event, state);
        if (event.type === 'supplier') return repairSupplier(event, state);
        if (event.type === 'cash') return repairCash(event);
        if (event.type === 'sale') return repairNumericEvent(event, ['qty', 'price']);
        if (event.type === 'restock') return repairNumericEvent(event, ['qty', 'cost']);
        if (event.type === 'price') return repairNumericEvent(event, ['price']);
        if (event.type === 'reputation') return repairNumericEvent(event, ['delta']);
        return event;
    }

    function repairEvents(events, state) {
        return asArray(events).map(event => repairEvent(event, state));
    }

    function concreteCounterparty(name) {
        const value = clean(name, 100);
        return value && !GENERIC_COUNTERPARTY.test(value) ? value : '';
    }

    function reconcileContractCounterparties(management, events, turn = 0) {
        const api = root.CronacheBusiness;
        if (!api) return [];
        const created = [];
        asArray(events).filter(event => event?.type === 'contract').forEach(event => {
            const business = findBusiness(management, event.businessName);
            const name = concreteCounterparty(event.counterpartyName);
            if (!business || !name) return;
            const type = keyOf(event.counterpartyType);
            if (/^(?:customer|cliente|client|acquirente)$/.test(type) && !findCustomer(business, name)) {
                api.addCustomer(business, {
                    name,
                    segment: clean(event.kind, 60) || 'contrattuale',
                    loyalty: 45,
                    satisfaction: business.customerSatisfaction ?? 60,
                    notes: `Controparte del contratto ${clean(event.title, 100)}`
                });
                created.push({ type: 'customer', business: business.name, name });
            }
            if (/^(?:supplier|fornitore|vendor|approvvigionatore)$/.test(type) && !findSupplier(business, name)) {
                api.addSupplier(business, {
                    name,
                    category: clean(event.kind, 80) || defaultSupplierCategory(business),
                    reliability: 75,
                    leadTurns: 1,
                    discount: 0,
                    status: 'active',
                    notes: `Controparte del contratto ${clean(event.title, 100)}`,
                    source: 'narration'
                });
                created.push({ type: 'supplier', business: business.name, name });
            }
        });
        created.forEach(item => {
            const business = findBusiness(management, item.business);
            api.addBusinessNote?.(business, `${item.type === 'customer' ? 'Cliente' : 'Fornitore'} registrato dalla controparte contrattuale: ${item.name}.`, turn);
        });
        return created;
    }

    function applyCashEvents(management, events, context = {}) {
        const api = root.CronacheBusiness;
        const turn = Math.max(0, Number(context.turn) || 0);
        const currency = context.currency || 'monete';
        const results = [];
        if (!api) return results;
        asArray(events).filter(event => event?.type === 'cash').forEach(event => {
            const business = findBusiness(management, event.businessName);
            if (!business) {
                results.push({ ok: false, type: 'cash', message: `Attività non trovata: ${event.businessName || '(nessuna)'}` });
                return;
            }
            business.processedNarrativeEvents = asArray(business.processedNarrativeEvents);
            const fingerprint = `${turn}:${JSON.stringify(event)}`;
            if (business.processedNarrativeEvents.includes(fingerprint)) {
                results.push({ ok: true, skipped: true, type: 'cash', business: business.name, message: `${business.name}: movimento già applicato` });
                return;
            }
            const amount = narrativeNumber(event.amount);
            const direction = normalizeCashDirection(event.direction);
            if (!amount || amount <= 0 || !['in', 'out'].includes(direction)) {
                results.push({ ok: false, type: 'cash', business: business.name, message: 'Direzione o importo CASSA_NEGOZIO non valido' });
                return;
            }
            const value = Math.round(Math.abs(amount) * 100) / 100;
            business.cash = Math.round((Number(business.cash || 0) + (direction === 'out' ? -value : value)) * 100) / 100;
            api.recordTransaction(business, {
                turn,
                direction,
                category: direction === 'out' ? 'uscita narrativa' : 'entrata narrativa',
                amount: value,
                description: clean(event.reason, 220) || (direction === 'out' ? 'Uscita narrata' : 'Entrata narrata')
            });
            api.addBusinessNote?.(business,
                `${direction === 'out' ? 'Uscita' : 'Entrata'} ${value} ${currency}${event.reason ? `: ${clean(event.reason, 160)}` : ''} (racconto).`,
                turn
            );
            business.processedNarrativeEvents.push(fingerprint);
            business.processedNarrativeEvents = business.processedNarrativeEvents.slice(-120);
            results.push({ ok: true, type: 'cash', business: business.name, message: `${business.name}: ${direction === 'out' ? '-' : '+'}${value} ${currency}, cassa ${business.cash}` });
        });
        return results;
    }

    function ensureEconomicInitialization(management, turn = 0) {
        const api = root.CronacheBusiness;
        asArray(management?.businesses).forEach(business => {
            if (business?.narrativeInitialized === true || business?.profileNarrative !== true) return;
            const hasProduct = asArray(business.products).some(product => product?.active !== false && product?.source === 'narration');
            const hasSupplier = asArray(business.suppliers).some(supplier => supplier?.status === 'active' && supplier?.source === 'narration');
            const serviceLike = /banc|credit|finanz|assicur|serviz|studio|agenz|consul|locaz|mediazion/.test(keyOf(business.type));
            if (!hasProduct || (!hasSupplier && !serviceLike)) return;
            business.narrativeInitialized = true;
            business.initializedAtTurn = Math.max(0, Number(turn) || 0);
            api?.addBusinessNote?.(business,
                serviceLike && !hasSupplier
                    ? 'Configurazione economica attivata: attività di servizi senza obbligo di fornitore fisico.'
                    : 'Configurazione economica attivata: catalogo e filiera disponibili.',
                turn
            );
        });
    }

    function install() {
        const BusinessManager = root.CronacheBusiness?.BusinessManager;
        if (!BusinessManager?.prototype) return false;
        const original = BusinessManager.prototype.applyNarrativeEvents;
        if (typeof original !== 'function') return false;
        if (original.__businessNarrativeRecoveryV2Wrapped) return true;

        const wrapped = function recoveredBusinessNarrativeEvents(state, events, context = {}) {
            const repaired = repairEvents(events, state);
            // CASSA viene gestita qui: il core storico rifiutava le uscite superiori alla cassa
            // e usava Number(), perdendo importi narrativi come "120 fiorini".
            const nonCash = repaired.filter(event => event?.type !== 'cash');
            const cashEvents = repaired.filter(event => event?.type === 'cash');
            const outcome = original.call(this, state, nonCash, context);
            outcome.results = asArray(outcome.results);
            outcome.results.push(...applyCashEvents(outcome.management, cashEvents, context));

            const counterparties = reconcileContractCounterparties(outcome.management, repaired, context.turn);
            counterparties.forEach(item => outcome.results.push({
                ok: true,
                type: item.type,
                business: item.business,
                message: `${item.business}: ${item.type === 'customer' ? 'cliente' : 'fornitore'} ${item.name} registrato dal contratto`
            }));
            ensureEconomicInitialization(outcome.management, context.turn);
            asArray(outcome.management?.businesses).forEach(business => {
                if (root.CronacheBusiness?.getReport) business.lastReport = root.CronacheBusiness.getReport(business, outcome.employees || context.employees || []);
            });
            return outcome;
        };
        wrapped.__businessNarrativeRecoveryV2Wrapped = true;
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
        normalizeCashDirection,
        narrativeNumber,
        repairProfile,
        repairContract,
        repairCustomer,
        repairSupplier,
        repairCash,
        repairEvent,
        repairEvents,
        reconcileContractCounterparties,
        applyCashEvents,
        ensureEconomicInitialization,
        install
    };
});
