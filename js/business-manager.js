(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheBusiness = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SCHEMA_VERSION = 2;
    const MAX_TRANSACTIONS = 120;
    const MAX_HISTORY = 24;
    const MAX_NOTES = 24;
    const BUSINESS_WORDS = /impresa|azienda|negozio|bottega|officina|taverna|locanda|osteria|ristorante|farmacia|studio|laboratorio|emporio|mercato|banca|agenzia|fabbrica|attivit/i;
    const GENERIC_ENTITY_WORDS = /^(?:(?:articolo|prodotto|servizio|merce|fornitore|cliente)(?:\s+(?:generico|generica|standard|principale|complementare|locale|base))?|clientela abituale)$/i;

    function clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function clean(value, limit = 160) {
        const text = String(value == null ? '' : value)
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
    }

    function keyOf(value) {
        return clean(value, 100).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    function number(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    // I modelli spesso restituiscono valori come "12,50 fiorini", "80%" o "+ 5".
    // Il gestionale deve accettare questi formati senza trasformare un catalogo valido
    // in una sequenza di errori tecnici visibili al giocatore.
    function parseNarrativeNumber(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        const raw = String(value == null ? '' : value).trim();
        if (!raw) return null;
        const match = raw.replace(/\s+/g, '').match(/[+-]?(?:\d[\d.,]*|[.,]\d+)/);
        if (!match) return null;
        let normalized = match[0];
        const comma = normalized.lastIndexOf(',');
        const dot = normalized.lastIndexOf('.');
        if (comma >= 0 && dot >= 0) {
            const decimalSeparator = comma > dot ? ',' : '.';
            const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
            normalized = normalized.split(thousandsSeparator).join('').replace(decimalSeparator, '.');
        } else if (comma >= 0 || dot >= 0) {
            const separator = comma >= 0 ? ',' : '.';
            const chunks = normalized.split(separator);
            const looksLikeThousands = chunks.length > 2 ||
                (chunks.length === 2 && chunks[1].length === 3 && chunks[0].replace(/[+-]/g, '').length >= 1);
            normalized = looksLikeThousands ? chunks.join('') : normalized.replace(separator, '.');
        }
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, number(value, min)));
    }

    function roundMoney(value) {
        return Math.round(number(value, 0) * 100) / 100;
    }

    function createDefaultManagement() {
        return {
            schemaVersion: SCHEMA_VERSION,
            businesses: [],
            activeBusinessId: null,
            updatedAtTurn: 0
        };
    }

    function defaultSupplier(name) {
        return {
            id: `supplier-${keyOf(name)}-${Date.now()}`,
            name: clean(name || 'Fornitore locale'),
            category: 'generico',
            reliability: 75,
            leadTurns: 2,
            discount: 0,
            status: 'active',
            totalPurchases: 0,
            notes: ''
        };
    }

    function defaultProduct(name) {
        return {
            id: `product-${keyOf(name)}-${Date.now()}`,
            name: clean(name || 'Prodotto principale'),
            category: 'generico',
            salePrice: 20,
            unitCost: 9,
            stock: 20,
            reorderPoint: 8,
            targetStock: 30,
            baseDemand: 12,
            soldUnits: 0,
            lostSales: 0,
            supplierId: null,
            active: true
        };
    }

    function inferBusinessType(property) {
        const text = `${property?.name || ''} ${property?.description || ''}`.toLowerCase();
        if (/taverna|locanda|osteria|ristorante|bar|caffè|cafe/.test(text)) return 'ristorazione';
        if (/officina|laboratorio|bottega|artigian/.test(text)) return 'artigianato';
        if (/fattoria|azienda agricola|vigna|agricol/.test(text)) return 'agricoltura';
        if (/studio|agenzia|consulenza|servizi/.test(text)) return 'servizi';
        if (/fabbrica|industria|manifatt/.test(text)) return 'produzione';
        return 'commercio';
    }

    function starterNames(type) {
        const map = {
            ristorazione: ['Pasto della casa', 'Bevanda'],
            artigianato: ['Lavorazione su misura', 'Riparazione'],
            agricoltura: ['Prodotto fresco', 'Fornitura stagionale'],
            servizi: ['Servizio base', 'Consulenza'],
            produzione: ['Prodotto standard', 'Lotto speciale'],
            commercio: ['Articolo principale', 'Articolo complementare']
        };
        return map[type] || map.commercio;
    }

    function isBusinessProperty(property) {
        if (!property || typeof property !== 'object') return false;
        if (property.managementEnabled === true || property.type === 'business') return true;
        return BUSINESS_WORDS.test(`${property.name || ''} ${property.description || ''}`);
    }

    function createBusinessFromProperty(property, turn = 0) {
        return {
            id: `business-${property.id || keyOf(property.name) || Date.now()}`,
            propertyId: property.id || null,
            propertyName: clean(property.name || 'Attività'),
            name: clean(property.name || 'Attività'),
            description: clean(property.description || '', 240),
            type: inferBusinessType(property),
            status: 'active',
            // Le nuove attività partono vuote: assetto, cassa, catalogo e relazioni
            // devono essere definiti dalla prima scena LLM, non da placeholder locali.
            cash: Math.max(0, roundMoney(number(property.businessCash, 0))),
            reputation: 50,
            customerSatisfaction: 65,
            capacity: 100,
            period: 0,
            lastPeriodTurn: Math.max(0, parseInt(turn, 10) || 0),
            narrativeInitialized: false,
            profileNarrative: false,
            narrativeEventRecorded: false,
            initializedAtTurn: null,
            products: [],
            suppliers: [],
            customers: [],
            pendingOrders: [],
            transactions: [],
            history: [],
            notes: [],
            processedNarrativeEvents: [],
            settings: {
                marketingBudget: 0,
                qualityFocus: 50,
                periodTurns: 10
            },
            lastReport: emptyReport()
        };
    }

    function emptyReport() {
        return {
            period: 0,
            revenue: 0,
            unitsSold: 0,
            cogs: 0,
            grossProfit: 0,
            payroll: 0,
            overhead: 0,
            marketing: 0,
            operatingCosts: 0,
            netProfit: 0,
            inventoryValue: 0,
            stockouts: 0,
            customersServed: 0,
            margin: 0,
            cash: 0
        };
    }

    function normalizeProduct(raw, index) {
        const source = raw && typeof raw === 'object' ? raw : {};
        return {
            ...defaultProduct(source.name || `Prodotto ${index + 1}`),
            ...source,
            id: clean(source.id || `product-${index + 1}`),
            name: clean(source.name || `Prodotto ${index + 1}`),
            category: clean(source.category || 'generico', 80),
            salePrice: Math.max(0, roundMoney(source.salePrice)),
            unitCost: Math.max(0, roundMoney(source.unitCost)),
            stock: Math.max(0, parseInt(source.stock, 10) || 0),
            reorderPoint: Math.max(0, parseInt(source.reorderPoint, 10) || 0),
            targetStock: Math.max(0, parseInt(source.targetStock, 10) || 0),
            baseDemand: Math.max(0, parseInt(source.baseDemand, 10) || 0),
            soldUnits: Math.max(0, parseInt(source.soldUnits, 10) || 0),
            lostSales: Math.max(0, parseInt(source.lostSales, 10) || 0),
            active: source.active !== false
        };
    }

    function normalizeSupplier(raw, index) {
        const source = raw && typeof raw === 'object' ? raw : {};
        return {
            ...defaultSupplier(source.name || `Fornitore ${index + 1}`),
            ...source,
            id: clean(source.id || `supplier-${index + 1}`),
            name: clean(source.name || `Fornitore ${index + 1}`),
            category: clean(source.category || 'generico', 80),
            reliability: clamp(source.reliability ?? 70, 0, 100),
            leadTurns: Math.max(0, parseInt(source.leadTurns, 10) || 0),
            discount: clamp(source.discount ?? 0, 0, 60),
            totalPurchases: Math.max(0, roundMoney(source.totalPurchases)),
            status: source.status === 'inactive' ? 'inactive' : 'active',
            notes: clean(source.notes || '', 240)
        };
    }

    function normalizeCustomer(raw, index) {
        const source = raw && typeof raw === 'object' ? raw : {};
        return {
            id: clean(source.id || `customer-${index + 1}`),
            name: clean(source.name || `Cliente ${index + 1}`),
            segment: clean(source.segment || 'abituale', 80),
            loyalty: clamp(source.loyalty ?? 40, 0, 100),
            satisfaction: clamp(source.satisfaction ?? 60, 0, 100),
            lifetimeValue: Math.max(0, roundMoney(source.lifetimeValue)),
            visits: Math.max(0, parseInt(source.visits, 10) || 0),
            notes: clean(source.notes || '', 240)
        };
    }

    function normalizeBusiness(raw, index) {
        const source = raw && typeof raw === 'object' ? clone(raw) : {};
        const products = Array.isArray(source.products) ? source.products.map(normalizeProduct) : [];
        const suppliers = Array.isArray(source.suppliers) ? source.suppliers.map(normalizeSupplier) : [];
        const customers = Array.isArray(source.customers) ? source.customers.map(normalizeCustomer) : [];
        // I salvataggi v1 con catalogo/fornitori reali sono già inizializzati.
        // Solo i nuovi record v2 dichiarano esplicitamente lo stato pending.
        const legacyInitialized = products.length > 0 || suppliers.length > 0 || customers.length > 0;
        return {
            id: clean(source.id || `business-${index + 1}`),
            propertyId: source.propertyId ?? null,
            propertyName: clean(source.propertyName || source.name || `Attività ${index + 1}`),
            name: clean(source.name || source.propertyName || `Attività ${index + 1}`),
            description: clean(source.description || '', 240),
            type: clean(source.type || 'commercio', 60),
            status: ['active', 'paused', 'closed'].includes(source.status) ? source.status : 'active',
            cash: roundMoney(source.cash),
            reputation: clamp(source.reputation ?? 50, 0, 100),
            customerSatisfaction: clamp(source.customerSatisfaction ?? 60, 0, 100),
            capacity: Math.max(1, parseInt(source.capacity, 10) || 100),
            period: Math.max(0, parseInt(source.period, 10) || 0),
            lastPeriodTurn: Math.max(0, parseInt(source.lastPeriodTurn, 10) || 0),
            narrativeInitialized: source.narrativeInitialized == null ? legacyInitialized : source.narrativeInitialized === true,
            profileNarrative: source.profileNarrative == null ? legacyInitialized : source.profileNarrative === true,
            narrativeEventRecorded: source.narrativeEventRecorded == null ? legacyInitialized : source.narrativeEventRecorded === true,
            initializedAtTurn: source.initializedAtTurn == null ? null : Math.max(0, parseInt(source.initializedAtTurn, 10) || 0),
            products,
            suppliers,
            customers,
            pendingOrders: Array.isArray(source.pendingOrders) ? source.pendingOrders.slice(-50) : [],
            transactions: Array.isArray(source.transactions) ? source.transactions.slice(-MAX_TRANSACTIONS) : [],
            history: Array.isArray(source.history) ? source.history.slice(-MAX_HISTORY) : [],
            notes: Array.isArray(source.notes) ? source.notes.slice(-MAX_NOTES) : [],
            processedNarrativeEvents: Array.isArray(source.processedNarrativeEvents) ? source.processedNarrativeEvents.slice(-120) : [],
            settings: {
                marketingBudget: Math.max(0, roundMoney(source.settings?.marketingBudget)),
                qualityFocus: clamp(source.settings?.qualityFocus ?? 50, 0, 100),
                periodTurns: Math.max(1, parseInt(source.settings?.periodTurns, 10) || 10)
            },
            lastReport: { ...emptyReport(), ...(source.lastReport || {}) }
        };
    }

    function migrateManagement(input) {
        const source = input && typeof input === 'object' ? clone(input) : {};
        return {
            ...createDefaultManagement(),
            ...source,
            schemaVersion: SCHEMA_VERSION,
            businesses: Array.isArray(source.businesses) ? source.businesses.map(normalizeBusiness) : [],
            activeBusinessId: source.activeBusinessId || null,
            updatedAtTurn: Math.max(0, parseInt(source.updatedAtTurn, 10) || 0)
        };
    }

    function syncProperties(state, properties, turn = 0) {
        const management = migrateManagement(state);
        (Array.isArray(properties) ? properties : []).filter(isBusinessProperty).forEach(property => {
            const existing = management.businesses.find(business =>
                (property.id != null && business.propertyId === property.id) ||
                keyOf(business.propertyName) === keyOf(property.name)
            );
            if (!existing) {
                management.businesses.push(createBusinessFromProperty(property, turn));
                property.managementEnabled = true;
            } else {
                existing.propertyId = property.id ?? existing.propertyId;
                existing.propertyName = clean(property.name || existing.propertyName);
                if (!existing.name) existing.name = existing.propertyName;
            }
        });
        if (!management.activeBusinessId && management.businesses[0]) {
            management.activeBusinessId = management.businesses[0].id;
        }
        management.updatedAtTurn = Math.max(management.updatedAtTurn, parseInt(turn, 10) || 0);
        return management;
    }

    function getBusiness(state, businessId) {
        return (state?.businesses || []).find(item => item.id === businessId) || null;
    }

    function recordTransaction(business, transaction) {
        const entry = {
            id: `tx-${Date.now()}-${business.transactions.length}`,
            turn: Math.max(0, parseInt(transaction.turn, 10) || 0),
            period: Math.max(0, parseInt(transaction.period ?? business.period, 10) || 0),
            direction: transaction.direction === 'out' ? 'out' : 'in',
            category: clean(transaction.category || 'altro', 80),
            amount: Math.max(0, roundMoney(transaction.amount)),
            description: clean(transaction.description || '', 220)
        };
        business.transactions.push(entry);
        business.transactions = business.transactions.slice(-MAX_TRANSACTIONS);
        return entry;
    }

    function addProduct(business, input) {
        const name = clean(input?.name);
        if (!name) throw new Error('Il prodotto deve avere un nome.');
        const existing = business.products.find(item => keyOf(item.name) === keyOf(name));
        if (existing) {
            Object.assign(existing, normalizeProduct({ ...existing, ...input, name }, 0));
            return existing;
        }
        const product = normalizeProduct({
            ...input,
            id: `product-${keyOf(name)}-${business.products.length + 1}`,
            name
        }, business.products.length);
        business.products.push(product);
        return product;
    }

    function updateProductPrice(business, productId, salePrice) {
        const product = business.products.find(item => item.id === productId);
        if (!product) throw new Error('Prodotto non trovato.');
        product.salePrice = Math.max(0, roundMoney(salePrice));
        return product;
    }

    function addSupplier(business, input) {
        const name = clean(input?.name);
        if (!name) throw new Error('Il fornitore deve avere un nome.');
        const existing = business.suppliers.find(item => keyOf(item.name) === keyOf(name));
        if (existing) {
            Object.assign(existing, normalizeSupplier({ ...existing, ...input, name }, 0));
            return existing;
        }
        const supplier = normalizeSupplier({
            ...input,
            id: `supplier-${keyOf(name)}-${business.suppliers.length + 1}`,
            name
        }, business.suppliers.length);
        business.suppliers.push(supplier);
        return supplier;
    }

    function addCustomer(business, input) {
        const name = clean(input?.name);
        if (!name) throw new Error('Il cliente deve avere un nome.');
        const existing = business.customers.find(item => keyOf(item.name) === keyOf(name));
        if (existing) {
            Object.assign(existing, normalizeCustomer({ ...existing, ...input, name }, 0));
            return existing;
        }
        const customer = normalizeCustomer({
            ...input,
            id: `customer-${keyOf(name)}-${business.customers.length + 1}`,
            name
        }, business.customers.length);
        business.customers.push(customer);
        return customer;
    }

    function findProductById(business, productId) {
        return business.products.find(item => item.id === productId) || null;
    }
    function setProductActive(business, productId, active) {
        const product = findProductById(business, productId);
        if (!product) throw new Error('Prodotto non trovato.');
        product.active = !!active;
        return product;
    }
    function adjustProductStock(business, productId, delta) {
        const product = findProductById(business, productId);
        if (!product) throw new Error('Prodotto non trovato.');
        product.stock = Math.max(0, Math.round(product.stock + Number(delta || 0)));
        return product;
    }
    function removeProduct(business, productId) {
        const before = business.products.length;
        business.products = business.products.filter(item => item.id !== productId);
        return business.products.length < before;
    }
    function findSupplierById(business, supplierId) {
        return business.suppliers.find(item => item.id === supplierId) || null;
    }
    function updateSupplier(business, supplierId, patch) {
        const supplier = findSupplierById(business, supplierId);
        if (!supplier) throw new Error('Fornitore non trovato.');
        if (patch.category != null) supplier.category = clean(patch.category, 80);
        if (patch.reliability != null) supplier.reliability = clamp(patch.reliability, 0, 100);
        if (patch.leadTurns != null) supplier.leadTurns = Math.max(0, parseInt(patch.leadTurns, 10) || 0);
        if (patch.discount != null) supplier.discount = clamp(patch.discount, 0, 60);
        if (patch.status != null) supplier.status = patch.status === 'inactive' ? 'inactive' : 'active';
        if (patch.notes != null) supplier.notes = clean(patch.notes, 240);
        return supplier;
    }
    function removeSupplier(business, supplierId) {
        const before = business.suppliers.length;
        business.suppliers = business.suppliers.filter(item => item.id !== supplierId);
        return business.suppliers.length < before;
    }
    function findCustomerById(business, customerId) {
        return business.customers.find(item => item.id === customerId) || null;
    }
    function updateCustomer(business, customerId, patch) {
        const customer = findCustomerById(business, customerId);
        if (!customer) throw new Error('Cliente non trovato.');
        if (patch.segment != null) customer.segment = clean(patch.segment, 80);
        if (patch.loyalty != null) customer.loyalty = clamp(patch.loyalty, 0, 100);
        if (patch.satisfaction != null) customer.satisfaction = clamp(patch.satisfaction, 0, 100);
        if (patch.notes != null) customer.notes = clean(patch.notes, 240);
        return customer;
    }
    function removeCustomer(business, customerId) {
        const before = business.customers.length;
        business.customers = business.customers.filter(item => item.id !== customerId);
        return business.customers.length < before;
    }

    function placeOrder(business, input, turn = 0) {
        const product = business.products.find(item => item.id === input?.productId);
        if (!product) throw new Error('Prodotto non trovato.');
        const supplier = business.suppliers.find(item => item.id === (input?.supplierId || product.supplierId));
        if (!supplier || supplier.status !== 'active') throw new Error('Fornitore non disponibile.');
        const quantity = Math.max(1, parseInt(input.quantity, 10) || 1);
        const discount = clamp(supplier.discount, 0, 60) / 100;
        const unitCost = Math.max(0, roundMoney(number(input.unitCost, product.unitCost) * (1 - discount)));
        const total = roundMoney(unitCost * quantity);
        if (business.cash < total) throw new Error('Cassa aziendale insufficiente per questo ordine.');
        business.cash = roundMoney(business.cash - total);
        supplier.totalPurchases = roundMoney(supplier.totalPurchases + total);
        product.supplierId = supplier.id;
        const order = {
            id: `order-${Date.now()}-${business.pendingOrders.length}`,
            productId: product.id,
            supplierId: supplier.id,
            quantity,
            unitCost,
            total,
            placedAtTurn: Math.max(0, parseInt(turn, 10) || 0),
            dueTurn: Math.max(0, parseInt(turn, 10) || 0) + supplier.leadTurns,
            status: supplier.leadTurns === 0 ? 'delivered' : 'pending'
        };
        business.pendingOrders.push(order);
        if (order.status === 'delivered') product.stock += quantity;
        recordTransaction(business, {
            turn,
            direction: 'out',
            category: 'acquisti',
            amount: total,
            description: `Ordine ${quantity} × ${product.name} da ${supplier.name}`
        });
        return order;
    }

    function processDeliveries(state, turn, random = Math.random) {
        const delivered = [];
        (state?.businesses || []).forEach(business => {
            business.pendingOrders.forEach(order => {
                if (order.status !== 'pending' || order.dueTurn > turn) return;
                const supplier = business.suppliers.find(item => item.id === order.supplierId);
                const reliability = clamp(supplier?.reliability ?? 70, 0, 100) / 100;
                if (random() > reliability && !order.delayedOnce) {
                    order.delayedOnce = true;
                    order.dueTurn += 1;
                    return;
                }
                const product = business.products.find(item => item.id === order.productId);
                if (product) product.stock += order.quantity;
                order.status = 'delivered';
                order.deliveredAtTurn = turn;
                delivered.push({ businessId: business.id, orderId: order.id, productName: product?.name, quantity: order.quantity });
            });
            business.pendingOrders = business.pendingOrders.slice(-50);
        });
        return delivered;
    }

    function employeeMetrics(business, employees) {
        const active = (Array.isArray(employees) ? employees : []).filter(employee =>
            employee?.status !== 'fired' &&
            keyOf(employee?.property) === keyOf(business.propertyName)
        );
        const payroll = active.reduce((sum, employee) => sum + Math.max(0, number(employee.salary)), 0);
        const skill = active.length ? active.reduce((sum, employee) => sum + clamp(employee.skill ?? 50, 0, 100), 0) / active.length : 45;
        const morale = active.length ? active.reduce((sum, employee) => sum + clamp(employee.morale ?? 60, 0, 100), 0) / active.length : 50;
        return { active, payroll: roundMoney(payroll), skill, morale };
    }

    function customerFactor(business) {
        const known = business.customers;
        const loyalty = known.length ? known.reduce((sum, customer) => sum + customer.loyalty, 0) / known.length : 40;
        return 0.7 + business.reputation / 250 + business.customerSatisfaction / 300 + loyalty / 500;
    }

    function inventoryValue(business) {
        return roundMoney(business.products.reduce((sum, product) => sum + product.stock * product.unitCost, 0));
    }

    function runPeriod(business, context = {}, random = Math.random) {
        if (!business || business.status !== 'active') throw new Error('L’attività non è operativa.');
        if (business.narrativeInitialized === false) throw new Error('L’attività deve essere inizializzata dalla storia prima di chiudere un periodo.');
        const employees = employeeMetrics(business, context.employees);
        const property = (context.properties || []).find(item =>
            (business.propertyId != null && item.id === business.propertyId) ||
            keyOf(item.name) === keyOf(business.propertyName)
        );
        const staffFactor = 0.65 + employees.skill / 250 + employees.morale / 400;
        const qualityFactor = 0.75 + business.settings.qualityFocus / 200;
        const audienceFactor = customerFactor(business);
        const marketingFactor = 1 + Math.min(0.5, business.settings.marketingBudget / 1000);
        let revenue = 0;
        let cogs = 0;
        let unitsSold = 0;
        let lostSales = 0;
        let stockouts = 0;

        business.products.filter(product => product.active).forEach(product => {
            const targetMarkupPrice = Math.max(0.01, product.unitCost * 2.2);
            const priceFactor = clamp(targetMarkupPrice / Math.max(0.01, product.salePrice), 0.35, 1.45);
            const variability = 0.85 + clamp(random(), 0, 1) * 0.3;
            const demand = Math.max(0, Math.round(
                product.baseDemand * priceFactor * staffFactor * qualityFactor * audienceFactor * marketingFactor * variability
            ));
            const sold = Math.min(product.stock, demand);
            const missed = Math.max(0, demand - sold);
            product.stock -= sold;
            product.soldUnits += sold;
            product.lostSales += missed;
            unitsSold += sold;
            lostSales += missed;
            if (missed > 0) stockouts += 1;
            revenue += sold * product.salePrice;
            cogs += sold * product.unitCost;
        });

        const payroll = employees.payroll;
        const overhead = Math.max(0, roundMoney(number(property?.maintenanceCost, 0)));
        const marketing = Math.max(0, roundMoney(business.settings.marketingBudget));
        const operatingCosts = roundMoney(payroll + overhead + marketing);
        const grossProfit = roundMoney(revenue - cogs);
        const netProfit = roundMoney(grossProfit - operatingCosts);
        business.cash = roundMoney(business.cash + revenue - operatingCosts);
        business.period += 1;
        business.lastPeriodTurn = Math.max(business.lastPeriodTurn, parseInt(context.turn, 10) || 0);
        const satisfactionDelta = stockouts ? -Math.min(12, stockouts * 3) : 2;
        business.customerSatisfaction = clamp(business.customerSatisfaction + satisfactionDelta, 0, 100);
        business.reputation = clamp(business.reputation + (netProfit > 0 ? 1 : -1) + (stockouts ? -1 : 0), 0, 100);

        const customersServed = Math.max(0, Math.round(unitsSold / 1.4));
        // Il motore non inventa clienti anonimi: aggiorna soltanto persone/gruppi
        // introdotti dalla narrazione tramite CLIENTE_NEGOZIO.
        business.customers.forEach(customer => {
            customer.visits += Math.max(0, Math.round(customersServed / Math.max(1, business.customers.length)));
            customer.satisfaction = clamp((customer.satisfaction * 0.7) + (business.customerSatisfaction * 0.3), 0, 100);
            customer.loyalty = clamp(customer.loyalty + (satisfactionDelta > 0 ? 1 : -2), 0, 100);
            customer.lifetimeValue = roundMoney(customer.lifetimeValue + revenue / Math.max(1, business.customers.length));
        });

        const report = {
            period: business.period,
            revenue: roundMoney(revenue),
            unitsSold,
            cogs: roundMoney(cogs),
            grossProfit,
            payroll,
            overhead,
            marketing,
            operatingCosts,
            netProfit,
            inventoryValue: inventoryValue(business),
            stockouts,
            lostSales,
            customersServed,
            margin: revenue ? Math.round((netProfit / revenue) * 1000) / 10 : 0,
            cash: business.cash
        };
        business.lastReport = report;
        business.history.push(report);
        business.history = business.history.slice(-MAX_HISTORY);
        recordTransaction(business, {
            turn: context.turn,
            direction: 'in',
            category: 'vendite',
            amount: revenue,
            description: `Vendite periodo ${business.period}`
        });
        if (payroll) recordTransaction(business, {
            turn: context.turn, direction: 'out', category: 'stipendi', amount: payroll,
            description: `Stipendi periodo ${business.period}`
        });
        if (overhead) recordTransaction(business, {
            turn: context.turn, direction: 'out', category: 'costi fissi', amount: overhead,
            description: `Costi della sede periodo ${business.period}`
        });
        if (marketing) recordTransaction(business, {
            turn: context.turn, direction: 'out', category: 'marketing', amount: marketing,
            description: `Marketing periodo ${business.period}`
        });
        if (property) {
            property.income = netProfit;
            property.businessCash = business.cash;
            property.lastBusinessPeriod = business.period;
        }
        return report;
    }

    function transferFunds(business, character, amount, direction) {
        const value = Math.max(0, roundMoney(amount));
        if (!value) throw new Error('Inserisci un importo valido.');
        character.gold = roundMoney(character.gold || 0);
        if (direction === 'toBusiness') {
            if (character.gold < value) throw new Error('Fondi personali insufficienti.');
            character.gold = roundMoney(character.gold - value);
            business.cash = roundMoney(business.cash + value);
            recordTransaction(business, { direction: 'in', category: 'capitale', amount: value, description: 'Versamento del proprietario' });
        } else {
            if (business.cash < value) throw new Error('Cassa aziendale insufficiente.');
            business.cash = roundMoney(business.cash - value);
            character.gold = roundMoney(character.gold + value);
            recordTransaction(business, { direction: 'out', category: 'prelievo', amount: value, description: 'Prelievo del proprietario' });
        }
        return { businessCash: business.cash, personalCash: character.gold };
    }

    function getReport(business, employees) {
        const staff = employeeMetrics(business, employees);
        const inventory = inventoryValue(business);
        const lowStock = business.products.filter(product => product.active && product.stock <= product.reorderPoint);
        const pendingValue = roundMoney(business.pendingOrders
            .filter(order => order.status === 'pending')
            .reduce((sum, order) => sum + order.total, 0));
        const topProducts = business.products.slice().sort((a, b) => b.soldUnits - a.soldUnits).slice(0, 5);
        return {
            ...business.lastReport,
            cash: business.cash,
            inventoryValue: inventory,
            lowStock,
            pendingValue,
            pendingOrders: business.pendingOrders.filter(order => order.status === 'pending'),
            employeeCount: staff.active.length,
            averageSkill: Math.round(staff.skill),
            averageMorale: Math.round(staff.morale),
            payroll: staff.payroll,
            customerCount: business.customers.length,
            supplierCount: business.suppliers.filter(item => item.status === 'active').length,
            topProducts
        };
    }

    function resolveBusinessByName(state, name) {
        const businesses = state?.businesses || [];
        const key = keyOf(name);
        if (!businesses.length || !key) return null;
        // I tag LLM devono indicare l'attività esatta: nessun fallback sull'attiva/prima,
        // altrimenti un refuso può modificare l'impresa sbagliata in campagne multi-attività.
        return businesses.find(item => keyOf(item.name) === key || keyOf(item.propertyName) === key) || null;
    }

    function findProductByName(business, name) {
        if (!business || !name) return null;
        const key = keyOf(name);
        return business.products.find(item => keyOf(item.name) === key || item.id === name) || null;
    }

    function addBusinessNote(business, text, turn = 0) {
        if (!business || !text) return;
        business.notes = Array.isArray(business.notes) ? business.notes : [];
        business.notes.push({ turn: parseInt(turn, 10) || 0, text: clean(text, 200) });
        business.notes = business.notes.slice(-MAX_NOTES);
    }

    function buildNarrativeContext(state, employees, turn = 0, currency = 'monete') {
        const management = migrateManagement(state);
        const list = management.businesses.filter(business => business.status !== 'closed');
        if (!list.length) return '';
        const staff = Array.isArray(employees) ? employees : [];
        const lines = [];
        list.forEach(business => {
            const report = getReport(business, staff);
            const lowStock = (report.lowStock || []).map(p => p.name).join(', ');
            const products = business.products
                .filter(p => p.active)
                .slice(0, 8)
                .map(p => `${p.name} (scorte ${p.stock}, prezzo ${p.salePrice})`)
                .join('; ');
            const pending = (report.pendingOrders || []).length;
            lines.push(`- ${business.name} [${business.type}, ${business.status}]`);
            lines.push(`  cassa: ${business.cash} ${currency} | reputazione: ${business.reputation}/100 | soddisfazione clienti: ${business.customerSatisfaction}/100`);
            if (business.description) lines.push(`  identità narrativa: ${business.description}`);
            if (!business.narrativeInitialized) {
                lines.push('  📋 CONFIGURAZIONE NARRATIVA IN CORSO: questa attività è appena entrata nella storia e non usa dati generici locali.');
                lines.push(`  Completa progressivamente assetto, catalogo e filiera di ${business.name} con [ATTIVITA_NEGOZIO], [CATALOGO_NEGOZIO] e [FORNITORE_NEGOZIO] validi, senza interrompere o impoverire la scena narrativa.`);
                lines.push('  Introduci clienti e dipendenti solo se compaiono davvero nella scena; non inventare placeholder anonimi.');
            }
            if (report.netProfit != null) {
                lines.push(`  ultimo periodo: entrate ${report.revenue || 0}, utile netto ${report.netProfit || 0} (${report.margin || 0}% margine), clienti serviti ${report.customersServed || 0}`);
            }
            if (products) lines.push(`  prodotti: ${products}`);
            if (lowStock) lines.push(`  ⚠️ sotto scorta: ${lowStock}`);
            if (pending) lines.push(`  ordini in arrivo: ${pending}`);
            if (business.suppliers && business.suppliers.length) {
                const activeSup = business.suppliers.filter(s => s.status === 'active');
                if (activeSup.length) lines.push(`  fornitori: ${activeSup.slice(0, 6).map(s => `${s.name} [${s.category}, affidabilità ${Math.round(s.reliability)}%]`).join('; ')}`);
            }
            if (business.customers && business.customers.length) {
                lines.push(`  clienti noti: ${business.customers.slice(0, 6).map(c => `${c.name} (${c.segment}, fedeltà ${Math.round(c.loyalty)}%)`).join('; ')}`);
            }
            if (report.employeeCount) lines.push(`  dipendenti: ${report.employeeCount} (competenza ${report.averageSkill}/100, morale ${report.averageMorale}/100, stipendi ${report.payroll} ${currency}/periodo)`);
            if (business.notes && business.notes.length) {
                const recent = business.notes.slice(-6).map(note => note.text).join(' | ');
                lines.push(`  cronaca recente (narrati + modifiche del giocatore ✋): ${recent}`);
            }
        });
        return '\n🏪 ATTIVITÀ GESTITE (numeri reali, allinea la narrazione a questi valori):\n' + lines.join('\n');
    }

    function refreshNarrativeInitialization(business, turn = 0) {
        if (!business) return false;
        const narrativeProducts = business.products.filter(product => product.active && product.source === 'narration');
        const hasSupplier = business.suppliers.some(supplier => supplier.status === 'active' && supplier.source === 'narration');
        const ready = business.profileNarrative === true && narrativeProducts.length >= 2 && hasSupplier && business.narrativeEventRecorded === true;
        if (ready && !business.narrativeInitialized) {
            business.narrativeInitialized = true;
            business.initializedAtTurn = Math.max(0, parseInt(turn, 10) || 0);
            addBusinessNote(business, 'Configurazione narrativa iniziale completata: attività, catalogo e filiera nascono dalla storia.', turn);
        }
        return business.narrativeInitialized === true;
    }

    function applyNarrativeEvents(state, events, context = {}) {
        const management = migrateManagement(state);
        const turn = parseInt(context.turn, 10) || 0;
        const currency = context.currency || 'monete';
        const staff = Array.isArray(context.employees) ? context.employees : [];
        const results = [];
        (Array.isArray(events) ? events : []).forEach(event => {
            if (!event || !event.type) return;
            const business = resolveBusinessByName(management, event.businessName);
            if (!business) {
                results.push({ ok: false, type: event.type, message: `Attività non trovata: ${event.businessName || '(nessuna)'}` });
                return;
            }
            business.processedNarrativeEvents = Array.isArray(business.processedNarrativeEvents) ? business.processedNarrativeEvents : [];
            const stateEvent = ['profile', 'catalogProduct', 'renameProduct', 'customer', 'supplier', 'status', 'price'].includes(event.type);
            const fingerprint = `${stateEvent ? 'state' : turn}:${JSON.stringify(event)}`;
            if (business.processedNarrativeEvents.includes(fingerprint)) {
                results.push({ ok: true, skipped: true, type: event.type, business: business.name, message: `${business.name}: evento già applicato` });
                return;
            }
            const resultStart = results.length;
            switch (event.type) {
                case 'profile': {
                    const status = String(event.status || '').toLowerCase();
                    const cash = parseNarrativeNumber(event.cash);
                    const reputation = parseNarrativeNumber(event.reputation);
                    const satisfaction = parseNarrativeNumber(event.satisfaction);
                    const complete = clean(event.businessType, 60) && cash != null &&
                        reputation != null && satisfaction != null &&
                        ['active', 'paused', 'closed'].includes(status) && clean(event.description, 240);
                    if (!complete) {
                        results.push({ ok: false, type: 'profile', business: business.name, message: 'ATTIVITA_NEGOZIO incompleto o non valido' });
                        break;
                    }
                    business.type = clean(event.businessType, 60);
                    business.cash = Math.max(0, roundMoney(cash));
                    business.reputation = clamp(reputation, 0, 100);
                    business.customerSatisfaction = clamp(satisfaction, 0, 100);
                    business.status = status;
                    business.description = clean(event.description, 240);
                    business.profileNarrative = true;
                    addBusinessNote(business, `Assetto iniziale definito dalla storia: ${business.description || business.type}; cassa ${business.cash} ${currency}.`, turn);
                    results.push({ ok: true, type: 'profile', business: business.name, message: `${business.name}: assetto narrativo inizializzato` });
                    break;
                }
                case 'catalogProduct': {
                    const name = clean(event.productName, 80);
                    const category = clean(event.category, 80);
                    const salePrice = parseNarrativeNumber(event.salePrice);
                    const unitCost = parseNarrativeNumber(event.unitCost);
                    const stockValue = parseNarrativeNumber(event.stock);
                    const demand = parseNarrativeNumber(event.demand);
                    const reorderValue = parseNarrativeNumber(event.reorderPoint);
                    const validNumbers = [salePrice, unitCost, stockValue, demand, reorderValue]
                        .every(value => value != null && value >= 0);
                    if (!name || GENERIC_ENTITY_WORDS.test(name) || !category || !validNumbers || salePrice <= 0 || demand <= 0) {
                        results.push({ ok: false, type: 'catalogProduct', business: business.name, message: 'CATALOGO_NEGOZIO incompleto, generico o con valori non validi' });
                        break;
                    }
                    const reorderPoint = Math.max(0, Math.round(reorderValue));
                    const stock = Math.max(0, Math.round(stockValue));
                    const product = addProduct(business, {
                        name,
                        category,
                        salePrice: Math.max(0, roundMoney(salePrice)),
                        unitCost: Math.max(0, roundMoney(unitCost)),
                        stock,
                        baseDemand: Math.max(0, Math.round(demand)),
                        reorderPoint,
                        targetStock: Math.max(stock, reorderPoint * 2),
                        source: 'narration',
                        active: true
                    });
                    const soleSupplier = business.suppliers.filter(supplier => supplier.status === 'active' && supplier.source === 'narration');
                    if (!product.supplierId && soleSupplier.length === 1) product.supplierId = soleSupplier[0].id;
                    addBusinessNote(business, `Catalogo dalla narrazione: ${product.name} (${product.category}), prezzo ${product.salePrice}, scorte ${product.stock}.`, turn);
                    results.push({ ok: true, type: 'catalogProduct', business: business.name, message: `${business.name}: catalogo ${product.name}` });
                    break;
                }
                case 'sale': {
                    const product = findProductByName(business, event.product);
                    if (!product) {
                        results.push({ ok: false, type: 'sale', business: business.name, message: `Prodotto non trovato: ${event.product}` });
                        break;
                    }
                    const qty = Math.max(1, parseInt(event.qty, 10) || 1);
                    const price = Math.max(0, roundMoney(event.price != null ? event.price : product.salePrice));
                    const sold = Math.min(product.stock, qty);
                    if (sold <= 0) {
                        results.push({ ok: false, type: 'sale', business: business.name, message: `Scorte esaurite per ${product.name}` });
                        break;
                    }
                    product.stock -= sold;
                    product.soldUnits += sold;
                    const revenue = roundMoney(sold * price);
                    business.cash = roundMoney(business.cash + revenue);
                    business.customerSatisfaction = clamp(business.customerSatisfaction + (sold >= qty ? 1 : -2), 0, 100);
                    recordTransaction(business, { turn, direction: 'in', category: 'vendite', amount: revenue, description: `Vendita narrata: ${sold} × ${product.name}` });
                    addBusinessNote(business, `Vendita di ${sold} × ${product.name} a ${price} ${currency} (racconto).`, turn);
                    results.push({ ok: true, type: 'sale', business: business.name, message: `${business.name}: +${revenue} ${currency} (vendita ${sold}×${product.name})` });
                    break;
                }
                case 'restock': {
                    const product = findProductByName(business, event.product);
                    if (!product) {
                        results.push({ ok: false, type: 'restock', business: business.name, message: `Prodotto non trovato: ${event.product}` });
                        break;
                    }
                    const qty = Math.max(1, parseInt(event.qty, 10) || 1);
                    const cost = event.cost != null ? Math.max(0, roundMoney(event.cost)) : null;
                    product.stock += qty;
                    if (cost != null && cost > 0) {
                        business.cash = roundMoney(business.cash - cost);
                        recordTransaction(business, { turn, direction: 'out', category: 'approvvigionamento', amount: cost, description: `Rifornimento narrato: ${qty} × ${product.name}` });
                    }
                    addBusinessNote(business, `Rifornimento di ${qty} × ${product.name}${cost != null ? ` (costo ${cost} ${currency})` : ''} (racconto).`, turn);
                    results.push({ ok: true, type: 'restock', business: business.name, message: `${business.name}: +${qty} ${product.name}` });
                    break;
                }
                case 'price': {
                    const product = findProductByName(business, event.product);
                    if (!product) {
                        results.push({ ok: false, type: 'price', business: business.name, message: `Prodotto non trovato: ${event.product}` });
                        break;
                    }
                    const price = Math.max(0, roundMoney(event.price));
                    updateProductPrice(business, product.id, price);
                    results.push({ ok: true, type: 'price', business: business.name, message: `${business.name}: ${product.name} → ${price} ${currency}` });
                    break;
                }
                case 'renameProduct': {
                    const product = findProductByName(business, event.product);
                    if (!product) {
                        results.push({ ok: false, type: 'renameProduct', business: business.name, message: `Prodotto non trovato: ${event.product}` });
                        break;
                    }
                    const newName = clean(event.newName, 80);
                    if (newName) product.name = newName;
                    if (event.price != null && Number.isFinite(Number(event.price))) {
                        updateProductPrice(business, product.id, Math.max(0, roundMoney(event.price)));
                    }
                    addBusinessNote(business, `Prodotto «${event.product}» ridefinito come «${newName}» (racconto).`, turn);
                    results.push({ ok: true, type: 'renameProduct', business: business.name, message: `${business.name}: ${event.product} → ${newName}` });
                    break;
                }
                case 'customer': {
                    const customerName = clean(event.customerName, 60);
                    const existingCustomer = business.customers.find(item => keyOf(item.name) === keyOf(customerName));
                    const segment = clean(event.segment, 40);
                    const loyaltyProvided = event.loyalty != null && event.loyalty !== '';
                    const satisfactionProvided = event.satisfaction != null && event.satisfaction !== '';
                    const loyaltyValid = !loyaltyProvided || (Number.isFinite(Number(event.loyalty)) && Number(event.loyalty) >= 0 && Number(event.loyalty) <= 100);
                    const satisfactionValid = !satisfactionProvided || (Number.isFinite(Number(event.satisfaction)) && Number(event.satisfaction) >= 0 && Number(event.satisfaction) <= 100);
                    const fullCreate = segment && loyaltyProvided && satisfactionProvided;
                    if (!customerName || GENERIC_ENTITY_WORDS.test(customerName) || !loyaltyValid || !satisfactionValid || (!existingCustomer && !fullCreate)) {
                        results.push({ ok: false, type: 'customer', business: business.name, message: 'CLIENTE_NEGOZIO incompleto, generico o con valori non validi' });
                        break;
                    }
                    const customerInput = { name: customerName, source: 'narration' };
                    if (segment) customerInput.segment = segment;
                    if (loyaltyProvided) customerInput.loyalty = clamp(event.loyalty, 0, 100);
                    if (satisfactionProvided) customerInput.satisfaction = clamp(event.satisfaction, 0, 100);
                    if (event.visits != null && event.visits !== '') customerInput.visits = Math.max(0, parseInt(event.visits, 10) || 0);
                    if (event.notes != null && event.notes !== '') customerInput.notes = clean(event.notes, 240);
                    addCustomer(business, customerInput);
                    addBusinessNote(business, `Cliente dalla narrazione: ${customerInput.name}${event.notes ? ` — ${event.notes}` : ''}.`, turn);
                    results.push({ ok: true, type: 'customer', business: business.name, message: `${business.name}: cliente ${customerInput.name}` });
                    break;
                }
                case 'supplier': {
                    const supplierName = clean(event.supplierName, 60);
                    const supplierCategory = clean(event.category, 40);
                    const existingSupplier = business.suppliers.find(item => keyOf(item.name) === keyOf(supplierName));
                    const reliabilityProvided = event.reliability != null && event.reliability !== '';
                    const leadProvided = event.leadTurns != null && event.leadTurns !== '';
                    const discountProvided = event.discount != null && event.discount !== '';
                    const statusProvided = event.status != null && event.status !== '';
                    const reliabilityValid = !reliabilityProvided || (Number.isFinite(Number(event.reliability)) && Number(event.reliability) >= 0 && Number(event.reliability) <= 100);
                    const leadValid = !leadProvided || (Number.isFinite(Number(event.leadTurns)) && Number(event.leadTurns) >= 0);
                    const discountValid = !discountProvided || (Number.isFinite(Number(event.discount)) && Number(event.discount) >= 0 && Number(event.discount) <= 60);
                    const statusValid = !statusProvided || ['active', 'inactive'].includes(String(event.status).toLowerCase());
                    const fullCreate = supplierCategory && reliabilityProvided && leadProvided;
                    const supplierValid = supplierName && !GENERIC_ENTITY_WORDS.test(supplierName) && reliabilityValid && leadValid && discountValid && statusValid && (existingSupplier || fullCreate);
                    if (!supplierValid) {
                        results.push({ ok: false, type: 'supplier', business: business.name, message: 'FORNITORE_NEGOZIO incompleto, generico o con valori non validi' });
                        break;
                    }
                    const supplierInput = { name: supplierName, source: 'narration' };
                    if (supplierCategory) supplierInput.category = supplierCategory;
                    if (reliabilityProvided) supplierInput.reliability = clamp(event.reliability, 0, 100);
                    if (leadProvided) supplierInput.leadTurns = Math.max(0, parseInt(event.leadTurns, 10) || 0);
                    if (event.discount != null && event.discount !== '') supplierInput.discount = clamp(event.discount, 0, 60);
                    if (event.status != null && event.status !== '' && ['active', 'inactive'].includes(String(event.status).toLowerCase())) supplierInput.status = String(event.status).toLowerCase();
                    if (event.notes != null && event.notes !== '') supplierInput.notes = clean(event.notes, 240);
                    const supplier = addSupplier(business, supplierInput);
                    business.products.filter(product => product.source === 'narration' && !product.supplierId).forEach(product => { product.supplierId = supplier.id; });
                    addBusinessNote(business, `Fornitore dalla narrazione: ${supplierInput.name}${event.notes ? ` — ${event.notes}` : ''}.`, turn);
                    results.push({ ok: true, type: 'supplier', business: business.name, message: `${business.name}: fornitore ${supplierInput.name}` });
                    break;
                }
                case 'status': {
                    const status = String(event.status || '').toLowerCase();
                    if (['active', 'paused', 'closed'].includes(status)) {
                        business.status = status;
                        addBusinessNote(business, `Stato attività: ${status} (racconto).`, turn);
                        results.push({ ok: true, type: 'status', business: business.name, message: `${business.name}: stato → ${status}` });
                    } else {
                        results.push({ ok: false, type: 'status', business: business.name, message: `Stato non valido: ${event.status}` });
                    }
                    break;
                }
                case 'reputation': {
                    const delta = parseInt(event.delta, 10) || 0;
                    business.reputation = clamp(business.reputation + delta, 0, 100);
                    if (event.reason) addBusinessNote(business, `Reputazione ${delta >= 0 ? '+' : ''}${delta}: ${event.reason} (racconto).`, turn);
                    results.push({ ok: true, type: 'reputation', business: business.name, message: `${business.name}: reputazione ${delta >= 0 ? '+' : ''}${delta}` });
                    break;
                }
                case 'cash': {
                    const direction = String(event.direction || '').toLowerCase();
                    const amount = Math.max(0, roundMoney(event.amount));
                    if (!['entra', 'in', 'esce', 'out'].includes(direction) || !amount) {
                        results.push({ ok: false, type: 'cash', business: business.name, message: 'Direzione o importo CASSA_NEGOZIO non valido' });
                        break;
                    }
                    if (direction === 'esce' || direction === 'out') {
                        if (business.cash < amount) {
                            results.push({ ok: false, type: 'cash', business: business.name, message: 'Cassa insufficiente' });
                            break;
                        }
                        business.cash = roundMoney(business.cash - amount);
                        recordTransaction(business, { turn, direction: 'out', category: 'straordinaria', amount, description: event.reason || 'Uscita straordinaria' });
                    } else {
                        business.cash = roundMoney(business.cash + amount);
                        recordTransaction(business, { turn, direction: 'in', category: 'straordinaria', amount, description: event.reason || 'Entrata straordinaria' });
                    }
                    addBusinessNote(business, `${direction === 'esce' || direction === 'out' ? 'Uscita' : 'Entrata'} straordinaria ${amount} ${currency}${event.reason ? `: ${event.reason}` : ''} (racconto).`, turn);
                    results.push({ ok: true, type: 'cash', business: business.name, message: `${business.name}: cassa ${business.cash} ${currency}` });
                    break;
                }
                case 'note': {
                    if (event.text) {
                        addBusinessNote(business, event.text, turn);
                        business.narrativeEventRecorded = true;
                        results.push({ ok: true, type: 'note', business: business.name, message: `${business.name}: evento narrato registrato` });
                    }
                    break;
                }
                default:
                    results.push({ ok: false, type: event.type, message: 'Tipo evento non riconosciuto' });
            }
            const applied = results.slice(resultStart).some(result => result.ok && !result.skipped);
            if (applied) {
                business.processedNarrativeEvents.push(fingerprint);
                business.processedNarrativeEvents = business.processedNarrativeEvents.slice(-120);
            }
        });
        // Completa il bootstrap solo quando profilo, catalogo e fornitore provengono davvero dalla storia.
        management.businesses.forEach(business => {
            refreshNarrativeInitialization(business, turn);
            business.lastReport = getReport(business, staff);
        });
        return { management, results };
    }

    class BusinessManager {
        createDefault() { return createDefaultManagement(); }
        migrate(input) { return migrateManagement(input); }
        sync(state, properties, turn) { return syncProperties(state, properties, turn); }
        getBusiness(state, id) { return getBusiness(state, id); }
        addProduct(business, input) { return addProduct(business, input); }
        updateProductPrice(business, productId, price) { return updateProductPrice(business, productId, price); }
        addSupplier(business, input) { return addSupplier(business, input); }
        addCustomer(business, input) { return addCustomer(business, input); }
        placeOrder(business, input, turn) { return placeOrder(business, input, turn); }
        processDeliveries(state, turn, random) { return processDeliveries(state, turn, random); }
        runPeriod(business, context, random) { return runPeriod(business, context, random); }
        transferFunds(business, character, amount, direction) { return transferFunds(business, character, amount, direction); }
        getReport(business, employees) { return getReport(business, employees); }
        setProductActive(business, productId, active) { return setProductActive(business, productId, active); }
        adjustProductStock(business, productId, delta) { return adjustProductStock(business, productId, delta); }
        removeProduct(business, productId) { return removeProduct(business, productId); }
        updateSupplier(business, supplierId, patch) { return updateSupplier(business, supplierId, patch); }
        removeSupplier(business, supplierId) { return removeSupplier(business, supplierId); }
        updateCustomer(business, customerId, patch) { return updateCustomer(business, customerId, patch); }
        removeCustomer(business, customerId) { return removeCustomer(business, customerId); }
        addBusinessNote(business, text, turn) { return addBusinessNote(business, text, turn); }
        buildNarrativeContext(state, employees, turn, currency) { return buildNarrativeContext(state, employees, turn, currency); }
        applyNarrativeEvents(state, events, context) { return applyNarrativeEvents(state, events, context); }
        refreshNarrativeInitialization(business, turn) { return refreshNarrativeInitialization(business, turn); }
    }

    return {
        SCHEMA_VERSION,
        MAX_TRANSACTIONS,
        MAX_HISTORY,
        BUSINESS_WORDS,
        BusinessManager,
        addBusinessNote,
        buildNarrativeContext,
        applyNarrativeEvents,
        refreshNarrativeInitialization,
        parseNarrativeNumber,
        setProductActive,
        adjustProductStock,
        removeProduct,
        updateSupplier,
        removeSupplier,
        updateCustomer,
        removeCustomer,
        clean,
        keyOf,
        clamp,
        createDefaultManagement,
        migrateManagement,
        inferBusinessType,
        isBusinessProperty,
        createBusinessFromProperty,
        syncProperties,
        getBusiness,
        recordTransaction,
        addProduct,
        updateProductPrice,
        addSupplier,
        addCustomer,
        placeOrder,
        processDeliveries,
        employeeMetrics,
        inventoryValue,
        runPeriod,
        transferFunds,
        getReport
    };
});
