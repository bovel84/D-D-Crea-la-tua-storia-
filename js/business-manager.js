(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheBusiness = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SCHEMA_VERSION = 1;
    const MAX_TRANSACTIONS = 120;
    const MAX_HISTORY = 24;
    const BUSINESS_WORDS = /impresa|azienda|negozio|bottega|officina|taverna|locanda|osteria|ristorante|farmacia|studio|laboratorio|emporio|mercato|banca|agenzia|fabbrica|attivit/i;

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
        const type = inferBusinessType(property);
        const supplier = defaultSupplier(`Fornitore di ${property.name || 'attività'}`);
        const products = starterNames(type).map((name, index) => {
            const product = defaultProduct(name);
            product.id = `product-${keyOf(property.name)}-${index + 1}`;
            product.salePrice = index ? 12 : 22;
            product.unitCost = index ? 5 : 10;
            product.stock = index ? 15 : 20;
            product.targetStock = index ? 25 : 30;
            product.baseDemand = index ? 9 : 12;
            product.supplierId = supplier.id;
            return product;
        });
        return {
            id: `business-${property.id || keyOf(property.name) || Date.now()}`,
            propertyId: property.id || null,
            propertyName: clean(property.name || 'Attività'),
            name: clean(property.name || 'Attività'),
            type,
            status: 'active',
            cash: Math.max(0, roundMoney(number(property.businessCash, 500))),
            reputation: 50,
            customerSatisfaction: 65,
            capacity: 100,
            period: 0,
            lastPeriodTurn: Math.max(0, parseInt(turn, 10) || 0),
            products,
            suppliers: [supplier],
            customers: [],
            pendingOrders: [],
            transactions: [],
            history: [],
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
        return {
            id: clean(source.id || `business-${index + 1}`),
            propertyId: source.propertyId ?? null,
            propertyName: clean(source.propertyName || source.name || `Attività ${index + 1}`),
            name: clean(source.name || source.propertyName || `Attività ${index + 1}`),
            type: clean(source.type || 'commercio', 60),
            status: ['active', 'paused', 'closed'].includes(source.status) ? source.status : 'active',
            cash: roundMoney(source.cash),
            reputation: clamp(source.reputation ?? 50, 0, 100),
            customerSatisfaction: clamp(source.customerSatisfaction ?? 60, 0, 100),
            capacity: Math.max(1, parseInt(source.capacity, 10) || 100),
            period: Math.max(0, parseInt(source.period, 10) || 0),
            lastPeriodTurn: Math.max(0, parseInt(source.lastPeriodTurn, 10) || 0),
            products,
            suppliers,
            customers,
            pendingOrders: Array.isArray(source.pendingOrders) ? source.pendingOrders.slice(-50) : [],
            transactions: Array.isArray(source.transactions) ? source.transactions.slice(-MAX_TRANSACTIONS) : [],
            history: Array.isArray(source.history) ? source.history.slice(-MAX_HISTORY) : [],
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
        if (!business.customers.length && customersServed > 0) {
            addCustomer(business, {
                name: 'Clientela abituale',
                segment: 'abituale',
                loyalty: 35,
                satisfaction: business.customerSatisfaction,
                visits: customersServed,
                lifetimeValue: revenue
            });
        } else {
            business.customers.forEach(customer => {
                customer.visits += Math.max(0, Math.round(customersServed / Math.max(1, business.customers.length)));
                customer.satisfaction = clamp((customer.satisfaction * 0.7) + (business.customerSatisfaction * 0.3), 0, 100);
                customer.loyalty = clamp(customer.loyalty + (satisfactionDelta > 0 ? 1 : -2), 0, 100);
                customer.lifetimeValue = roundMoney(customer.lifetimeValue + revenue / Math.max(1, business.customers.length));
            });
        }

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
    }

    return {
        SCHEMA_VERSION,
        MAX_TRANSACTIONS,
        MAX_HISTORY,
        BUSINESS_WORDS,
        BusinessManager,
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
