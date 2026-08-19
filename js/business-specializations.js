(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheBusinessSpecializations = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-business-specializations-style';
    const PANEL_ID = 'business-sector-panel';

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 300) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const sum = (items, getter) => asArray(items).reduce((total, item) => total + number(getter(item)), 0);
    const average = (items, getter, fallback = 0) => {
        const list = asArray(items);
        return list.length ? sum(list, getter) / list.length : fallback;
    };
    const format = value => number(value).toLocaleString('it-IT', { maximumFractionDigits: 1 });

    const PROFILES = {
        pawnbroker: {
            key: 'pawnbroker', icon: '💎', label: 'Banco dei pegni',
            description: 'La liquidità è immobilizzata nei prestiti e nelle garanzie: scadenze, riscatti e rivendita contano più del semplice volume di magazzino.',
            rules: ['liquidità disponibile', 'prestiti e scadenze', 'valore delle garanzie', 'rotazione dell’usato'],
            pattern: /banco\s+dei\s+pegni|monte\s+di\s+piet[aà]|compro\s*oro|pegno|pawn/i
        },
        greengrocer: {
            key: 'greengrocer', icon: '🥬', label: 'Ortofrutta',
            description: 'La merce è deperibile: freschezza, rotazione rapida, fornitori affidabili e sprechi determinano il risultato.',
            rules: ['freschezza', 'rotazione scorte', 'sprechi', 'prezzi giornalieri e forniture'],
            pattern: /ortofrutt|frutta\s+e\s+verdura|fruttivend|verduraio|mercato\s+ortofrutt/i
        },
        restaurant: {
            key: 'restaurant', icon: '🍽️', label: 'Ristorazione',
            description: 'Menu, coperti, qualità del servizio, personale e continuità delle forniture incidono direttamente sulla reputazione.',
            rules: ['menu disponibile', 'coperti e domanda', 'qualità del servizio', 'forniture alimentari'],
            pattern: /ristorante|taverna|osteria|locanda|trattoria|pizzeria|bar\b|caff[eè]/i
        },
        bank: {
            key: 'bank', icon: '🏦', label: 'Credito e finanza',
            description: 'Liquidità, esposizioni, scadenze, qualità dei debitori e concentrazione del credito sono il cuore dell’attività.',
            rules: ['liquidità', 'esposizione creditizia', 'scadenze', 'rischio controparte'],
            pattern: /banca|credito|finanziar|factoring|microcredito|prestiti|mutui|cassa\s+di\s+risparmio/i
        },
        factory: {
            key: 'factory', icon: '🏭', label: 'Produzione',
            description: 'Materie prime, capacità produttiva, costo unitario, ordini e affidabilità della filiera determinano continuità e margini.',
            rules: ['materie prime', 'capacità produttiva', 'costo unitario', 'filiera e consegne'],
            pattern: /fabbrica|industria|manifatt|stabilimento|produzione\s+industriale|opificio/i
        },
        farm: {
            key: 'farm', icon: '🌾', label: 'Agricoltura',
            description: 'Stagionalità, raccolto, scorte, manodopera e canali di vendita rendono i periodi molto diversi tra loro.',
            rules: ['stagionalità', 'raccolto e rese', 'manodopera', 'stoccaggio e sbocchi'],
            pattern: /fattoria|azienda\s+agricola|agricol|vigna|vigneto|allevamento|podere/i
        },
        workshop: {
            key: 'workshop', icon: '🛠️', label: 'Artigianato',
            description: 'Competenze, tempi di lavorazione, commesse e materiali contano più delle vendite anonime di massa.',
            rules: ['commesse', 'competenza del personale', 'tempi di lavorazione', 'materiali'],
            pattern: /officina|laboratorio|bottega|artigian|falegnam|fabbro|sartoria/i
        },
        services: {
            key: 'services', icon: '🧾', label: 'Servizi professionali',
            description: 'Portafoglio clienti, contratti, reputazione e capacità del personale sono le leve principali.',
            rules: ['contratti', 'clienti ricorrenti', 'competenze', 'reputazione'],
            pattern: /studio\b|agenzia|consulenza|servizi\b|professionale/i
        },
        retail: {
            key: 'retail', icon: '🏪', label: 'Commercio',
            description: 'Assortimento, margini, scorte, domanda e fornitori governano la redditività del punto vendita.',
            rules: ['assortimento', 'margini', 'scorte', 'domanda e fornitori'],
            pattern: /negozio|emporio|mercato|commercio|rivendita/i
        }
    };

    function inferSpecialization(business) {
        const text = clean([
            business?.name, business?.propertyName, business?.description, business?.type
        ].filter(Boolean).join(' '), 900);
        const exact = Object.values(PROFILES).find(profile => profile.key !== 'retail' && profile.pattern.test(text));
        if (exact) return exact;
        if (/ristorazione/i.test(business?.type || '')) return PROFILES.restaurant;
        if (/agricoltura/i.test(business?.type || '')) return PROFILES.farm;
        if (/artigianato/i.test(business?.type || '')) return PROFILES.workshop;
        if (/produzione/i.test(business?.type || '')) return PROFILES.factory;
        if (/servizi/i.test(business?.type || '')) return PROFILES.services;
        return PROFILES.retail;
    }

    function contractExposure(business, pattern) {
        return asArray(business?.contracts)
            .filter(contract => contract?.status === 'active' && pattern.test(`${contract.title || ''} ${contract.kind || ''} ${contract.notes || ''}`))
            .reduce((total, contract) => total + number(contract.amount), 0);
    }

    function dueContracts(business, turn, pattern) {
        return asArray(business?.contracts).filter(contract =>
            contract?.status === 'active' && pattern.test(`${contract.title || ''} ${contract.kind || ''} ${contract.notes || ''}`) &&
            number(contract.endTurn, Infinity) <= number(turn) + 2
        );
    }

    function lowStockProducts(business) {
        const reportLow = business?.lastReport?.lowStock;
        if (Array.isArray(reportLow)) return reportLow;
        return asArray(business?.products).filter(product =>
            product?.active !== false && number(product.stock) <= Math.max(0, number(product.reorderPoint))
        );
    }

    function activeEmployees(business, employees) {
        const property = clean(business?.propertyName || business?.name, 100).toLowerCase();
        return asArray(employees).filter(employee => {
            const assigned = clean(employee?.property, 100).toLowerCase();
            return employee?.status !== 'fired' && (!assigned || assigned === property);
        });
    }

    function baseSnapshot(business, employees, turn) {
        const products = asArray(business?.products).filter(product => product?.active !== false);
        const suppliers = asArray(business?.suppliers).filter(supplier => supplier?.status !== 'inactive');
        const staff = activeEmployees(business, employees);
        const report = business?.lastReport || {};
        return {
            products, suppliers, staff, report,
            stockUnits: sum(products, item => item.stock),
            inventoryValue: sum(products, item => number(item.stock) * number(item.unitCost)),
            lowStock: lowStockProducts(business),
            supplierReliability: Math.round(average(suppliers, item => item.reliability, 70)),
            staffSkill: Math.round(average(staff, item => item.skill ?? item.competence, 50)),
            staffMorale: Math.round(average(staff, item => item.morale, 60)),
            customerSatisfaction: Math.round(number(business?.customerSatisfaction, 60)),
            cash: number(business?.cash),
            revenue: number(report.revenue),
            netProfit: number(report.netProfit),
            unitsSold: number(report.unitsSold),
            turn: number(turn)
        };
    }

    function signal(severity, score, text, cause, actors) {
        return { severity, score, text: clean(text, 220), cause: clean(cause || text, 520), actors: asArray(actors).map(item => clean(item, 100)).filter(Boolean).slice(0, 6) };
    }

    function buildSectorSnapshot(business, employees = [], turn = 0) {
        const profile = inferSpecialization(business);
        const base = baseSnapshot(business, employees, turn);
        const signals = [];
        const metrics = [];
        const knownCustomers = asArray(business?.customers).map(item => item.name).filter(Boolean);
        const knownSuppliers = base.suppliers.map(item => item.name).filter(Boolean);
        const knownStaff = base.staff.map(item => item.name).filter(Boolean);

        if (profile.key === 'pawnbroker') {
            const loanPattern = /pegno|prestito|credito|loan|finanziamento/i;
            const exposure = contractExposure(business, loanPattern);
            const due = dueContracts(business, turn, loanPattern);
            const collateral = base.products.filter(product => /pegno|usato|oro|gioiell|orolog|garanzia|collateral/i.test(`${product.name || ''} ${product.category || ''}`));
            const collateralUnits = sum(collateral, item => item.stock);
            metrics.push(['Esposizione', format(exposure)], ['Pegni in scadenza', String(due.length)], ['Garanzie in stock', format(collateralUnits)]);
            if (exposure > 0 && base.cash < exposure * 0.2) signals.push(signal('critical', 92,
                `Liquidità ${format(base.cash)} contro ${format(exposure)} di prestiti/pegni attivi.`,
                `${business.name} ha liquidità stretta rispetto ai prestiti garantiti ancora aperti. I clienti e le controparti registrate reagiscono a rinnovi, riscatti e nuove richieste di credito.`,
                [...knownCustomers, ...knownStaff]));
            if (due.length) signals.push(signal('warning', 82,
                `${due.length} prestiti su pegno sono in scadenza entro due turni.`,
                `${business.name} ha ${due.length} contratti di prestito/pegno prossimi alla scadenza. Occorre mostrare chi riscatta, chi rinnova e quali garanzie rischiano di passare alla rivendita, senza inventare controparti non registrate.`,
                due.map(item => item.counterpartyName).filter(Boolean)));
            if (collateralUnits > Math.max(10, base.unitsSold * 4) && base.revenue <= 0) signals.push(signal('warning', 68,
                'Le garanzie accumulate ruotano lentamente.',
                `${business.name} sta accumulando beni dati in garanzia o usato senza una rotazione sufficiente: il mercato secondario, la valutazione dei beni o i clienti devono produrre una conseguenza concreta.`,
                knownCustomers));
        } else if (profile.key === 'greengrocer') {
            const perishables = base.products.filter(product => /frutt|verdur|ortaggi|fresc|aliment|erbe|insalat|pomodor|agrum|mele|pere/i.test(`${product.name || ''} ${product.category || ''}`));
            const perishableUnits = sum(perishables, item => item.stock);
            const sold = Math.max(0, base.unitsSold);
            const turnover = perishableUnits + sold > 0 ? Math.round((sold / (perishableUnits + sold)) * 100) : 0;
            metrics.push(['Merce deperibile', format(perishableUnits)], ['Rotazione', `${turnover}%`], ['Affidabilità fornitori', `${base.supplierReliability}%`]);
            if (perishableUnits >= 30 && turnover < 25) signals.push(signal('warning', 80,
                `Rotazione bassa (${turnover}%) su ${format(perishableUnits)} unità deperibili.`,
                `${business.name} ha molta merce fresca con rotazione insufficiente. Freschezza, ribassi, sprechi, domanda locale e fornitori devono produrre un evento commerciale concreto.`,
                [...knownSuppliers, ...knownCustomers]));
            if (base.supplierReliability < 60) signals.push(signal('warning', 74,
                `Affidabilità media fornitori ${base.supplierReliability}%.`,
                `${business.name} dipende da forniture fresche poco affidabili: ritardi, qualità e disponibilità della merce possono cambiare prezzi e rapporti con i clienti.`,
                knownSuppliers));
        } else if (profile.key === 'restaurant') {
            const menuCount = base.products.length;
            const stockouts = number(base.report.stockouts);
            metrics.push(['Voci menu', String(menuCount)], ['Soddisfazione', `${base.customerSatisfaction}%`], ['Morale staff', `${base.staffMorale}%`]);
            if (stockouts > 0 || base.lowStock.length >= Math.max(2, Math.ceil(menuCount / 3))) signals.push(signal('warning', 78,
                `${Math.max(stockouts, base.lowStock.length)} criticità tra menu e scorte.`,
                `${business.name} rischia di non poter servire parte del menu per mancanza di scorte. Clienti, cucina, sala e fornitori devono reagire in modo osservabile.`,
                [...knownCustomers, ...knownSuppliers, ...knownStaff]));
            if (base.customerSatisfaction < 45 || base.staffMorale < 40) signals.push(signal('critical', 86,
                `Servizio sotto pressione: clienti ${base.customerSatisfaction}%, morale staff ${base.staffMorale}%.`,
                `${business.name} ha un problema di servizio o personale. Reclami, reputazione, turni di lavoro e gestione della sala devono produrre una conseguenza concreta nella storia.`,
                [...knownCustomers, ...knownStaff]));
        } else if (profile.key === 'bank') {
            const loanPattern = /prestito|credito|mutuo|finanziamento|factoring|fido/i;
            const exposure = contractExposure(business, loanPattern);
            const due = dueContracts(business, turn, loanPattern);
            const liquidity = exposure > 0 ? Math.round((base.cash / exposure) * 100) : 100;
            metrics.push(['Crediti attivi', format(exposure)], ['Liquidità/esposizione', `${liquidity}%`], ['Scadenze vicine', String(due.length)]);
            if (exposure > 0 && liquidity < 20) signals.push(signal('critical', 94,
                `Liquidità solo ${liquidity}% dell’esposizione attiva.`,
                `${business.name} ha una liquidità ridotta rispetto al credito concesso. Incassi, nuove richieste, rinnovi e rischio controparte devono produrre un evento finanziario coerente con i contratti esistenti.`,
                [...knownCustomers, ...due.map(item => item.counterpartyName)]));
            if (due.length >= 2) signals.push(signal('warning', 80,
                `${due.length} rapporti di credito sono prossimi alla scadenza.`,
                `${business.name} affronta più scadenze creditizie ravvicinate. Mostra pagamenti, ritardi, rinegoziazioni o conseguenze sui rapporti registrati, senza creare debitori anonimi.`,
                due.map(item => item.counterpartyName).filter(Boolean)));
        } else if (profile.key === 'factory') {
            const utilization = number(business?.capacity) > 0 ? Math.min(100, Math.round((base.unitsSold / number(business.capacity)) * 100)) : 0;
            metrics.push(['Utilizzo capacità', `${utilization}%`], ['Scorte', format(base.stockUnits)], ['Affidabilità filiera', `${base.supplierReliability}%`]);
            if (base.lowStock.length && base.supplierReliability < 70) signals.push(signal('critical', 84,
                `${base.lowStock.length} input/prodotti sotto scorta con filiera al ${base.supplierReliability}%.`,
                `${business.name} rischia un collo di bottiglia produttivo: materiali insufficienti e fornitori non abbastanza affidabili devono incidere su consegne, personale o clienti.`,
                [...knownSuppliers, ...knownStaff]));
            if (utilization < 20 && number(business?.capacity) > 0 && base.products.length) signals.push(signal('warning', 62,
                `Capacità utilizzata circa ${utilization}%.`,
                `${business.name} sta usando poca capacità produttiva. Ordini, domanda, costi fissi o nuovi contratti devono creare una pressione o un’opportunità concreta.`,
                [...knownCustomers, ...knownStaff]));
        } else if (profile.key === 'farm') {
            metrics.push(['Scorte/raccolto', format(base.stockUnits)], ['Vendite periodo', format(base.unitsSold)], ['Personale', String(base.staff.length)]);
            if (base.stockUnits > Math.max(40, base.unitsSold * 5) && base.unitsSold >= 0) signals.push(signal('warning', 64,
                'Il raccolto/scorte supera nettamente la velocità di vendita.',
                `${business.name} ha produzione agricola o scorte superiori agli sbocchi correnti. Conservazione, prezzi, intermediari e domanda devono produrre un evento economico concreto.`,
                [...knownCustomers, ...knownSuppliers]));
        } else if (profile.key === 'workshop') {
            metrics.push(['Competenza staff', `${base.staffSkill}%`], ['Commesse/contratti', String(asArray(business?.contracts).filter(item => item.status === 'active').length)], ['Margine', `${number(base.report.margin)}%`]);
            if (base.staff.length && base.staffSkill < 45) signals.push(signal('warning', 66,
                `Competenza media ${base.staffSkill}%.`,
                `${business.name} ha commesse o lavorazioni che possono essere limitate dalla competenza disponibile. Tempi, qualità e clienti devono reagire in modo concreto.`,
                [...knownStaff, ...knownCustomers]));
        } else if (profile.key === 'services') {
            const activeContracts = asArray(business?.contracts).filter(item => item.status === 'active').length;
            metrics.push(['Contratti attivi', String(activeContracts)], ['Clienti', String(asArray(business?.customers).length)], ['Reputazione', `${Math.round(number(business?.reputation, 50))}%`]);
            if (!activeContracts && asArray(business?.customers).length > 0) signals.push(signal('warning', 58,
                'Clienti presenti ma nessun contratto attivo registrato.',
                `${business.name} ha relazioni commerciali ma nessun incarico attivo: rinnovi, nuove proposte o perdita di clienti possono diventare un evento.`,
                knownCustomers));
        } else {
            metrics.push(['Scorte', format(base.stockUnits)], ['Sotto scorta', String(base.lowStock.length)], ['Margine', `${number(base.report.margin)}%`]);
            if (base.lowStock.length) signals.push(signal('warning', 70,
                `${base.lowStock.length} prodotti sotto scorta.`,
                `${business.name} ha articoli sotto scorta: fornitori, clienti e prezzi devono reagire alla disponibilità reale della merce.`,
                [...knownSuppliers, ...knownCustomers]));
        }

        if (base.cash < 0) signals.push(signal('critical', 96,
            `Cassa negativa: ${format(base.cash)}.`,
            `${business.name} ha cassa negativa. Creditori, dipendenti, fornitori o clienti registrati devono reagire alla tensione finanziaria.`,
            [...knownSuppliers, ...knownStaff]));
        if (base.netProfit < 0) signals.push(signal('warning', 72,
            `Ultimo risultato netto ${format(base.netProfit)}.`,
            `${business.name} ha chiuso l’ultimo periodo in perdita. Costi, prezzi, personale, domanda o fornitori devono produrre una conseguenza coerente col settore ${profile.label}.`,
            [...knownCustomers, ...knownSuppliers, ...knownStaff]));
        if (base.customerSatisfaction < 35) signals.push(signal('critical', 88,
            `Soddisfazione clienti ${base.customerSatisfaction}%.`,
            `${business.name} ha una soddisfazione clienti critica. Reclami, abbandoni, passaparola o negoziazioni devono diventare visibili nella storia.`,
            knownCustomers));

        signals.sort((a, b) => b.score - a.score);
        return {
            profile,
            metrics: metrics.slice(0, 4),
            signals: signals.slice(0, 6),
            primarySignal: signals[0] || null,
            ...base
        };
    }

    function buildSectorNarrativeContext(state, employees = [], turn = 0, currency = 'monete') {
        const businesses = asArray(state?.businesses).filter(item => item && item.status !== 'closed');
        if (!businesses.length) return '';
        const blocks = businesses.map(business => {
            const snap = buildSectorSnapshot(business, employees, turn);
            const metrics = snap.metrics.map(([label, value]) => `${label}: ${value}`).join(' | ');
            const signals = snap.signals.length ? snap.signals.slice(0, 3).map(item => item.text).join(' · ') : 'nessuna criticità specifica';
            return `- ${business.name}: PROFILO ${snap.profile.label}. ${snap.profile.description}\n` +
                `  KPI settore: ${metrics || `cassa ${format(business.cash)} ${currency}`}.\n` +
                `  Segnali: ${signals}.\n` +
                `  Regole operative: ${snap.profile.rules.join(', ')}. Quando la storia tocca questa attività usa queste leve, non un generico modello di negozio.`;
        });
        return `\n🏭 SPECIALIZZAZIONE DELLE ATTIVITÀ — REGOLE DI SETTORE\n${blocks.join('\n')}`;
    }

    function installBusinessContextWrapper() {
        const businessApi = root.CronacheBusiness;
        const proto = businessApi?.BusinessManager?.prototype;
        if (!proto || typeof proto.buildNarrativeContext !== 'function') return false;
        if (proto.buildNarrativeContext.__sectorAwareWrapped) return true;
        const original = proto.buildNarrativeContext;
        const wrapped = function sectorAwareBusinessContext(state, employees, turn, currency) {
            const base = original.call(this, state, employees, turn, currency);
            return `${base || ''}${buildSectorNarrativeContext(state, employees, turn, currency)}`;
        };
        wrapped.__sectorAwareWrapped = true;
        wrapped.__sectorAwareOriginal = original;
        proto.buildNarrativeContext = wrapped;
        return true;
    }

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function activeBusiness(state) {
        const management = state?.worldMemory?.management || {};
        const businesses = asArray(management.businesses);
        return businesses.find(item => item?.id === management.activeBusinessId) || businesses[0] || null;
    }

    function installStyles(documentRef) {
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
        const style = documentRef.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .business-sector-panel { margin: 10px 0 12px; padding: 12px; border: 1px solid rgba(105,69,24,.22); border-radius: 14px; background: linear-gradient(145deg,rgba(255,252,240,.96),rgba(227,209,164,.72)); }
            .business-sector-head { display:flex; gap:10px; align-items:flex-start; margin-bottom:9px; }
            .business-sector-icon { display:grid; place-items:center; width:42px; height:42px; flex:0 0 42px; border-radius:12px; background:#3b291b; color:#fff5ce; font-size:1.35rem; }
            .business-sector-head h4 { margin:0 0 3px; font:700 .9rem 'Cinzel',serif; color:#332116; }
            .business-sector-head p { margin:0; color:#66513c; font-size:.79rem; line-height:1.35; }
            .business-sector-kpis { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; }
            .business-sector-kpi { min-width:0; padding:8px; border-radius:10px; background:rgba(255,255,255,.58); }
            .business-sector-kpi span { display:block; color:#79654f; font-size:.67rem; text-transform:uppercase; letter-spacing:.04em; }
            .business-sector-kpi strong { display:block; margin-top:2px; color:#332116; font-size:.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .business-sector-signals { display:grid; gap:5px; margin-top:9px; }
            .business-sector-signal { padding:7px 9px; border-radius:9px; color:#63451f; background:rgba(190,139,42,.1); font-size:.76rem; }
            .business-sector-signal.critical { color:#76191d; background:rgba(145,31,37,.09); }
            .business-sector-rules { margin-top:8px; color:#69543e; font-size:.72rem; }
            @media (max-width:640px) { .business-sector-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); } }
        `;
        documentRef.head.appendChild(style);
    }

    function renderSectorPanel(documentRef) {
        const dashboard = documentRef?.getElementById('business-dashboard');
        if (!dashboard) return false;
        const business = activeBusiness(getState());
        if (!business) return false;
        const existing = documentRef.getElementById(PANEL_ID);
        const snap = buildSectorSnapshot(business, getState()?.worldMemory?.employees || [], getState()?.worldMemory?.turnCount || 0);
        const panel = existing || documentRef.createElement('section');
        panel.id = PANEL_ID;
        panel.className = 'business-sector-panel';
        panel.dataset.businessId = clean(business.id, 120);
        panel.innerHTML = `
            <div class="business-sector-head"><div class="business-sector-icon">${snap.profile.icon}</div><div><h4>${snap.profile.label}</h4><p>${snap.profile.description}</p></div></div>
            <div class="business-sector-kpis">${snap.metrics.map(([label, value]) => `<div class="business-sector-kpi"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>
            ${snap.signals.length ? `<div class="business-sector-signals">${snap.signals.slice(0, 3).map(item => `<div class="business-sector-signal ${item.severity}">⚑ ${item.text}</div>`).join('')}</div>` : '<div class="business-sector-signals"><div class="business-sector-signal">✓ Nessuna pressione specifica del settore in questo momento.</div></div>'}
            <div class="business-sector-rules"><strong>Cosa conta:</strong> ${snap.profile.rules.join(' · ')}</div>`;
        if (!existing) {
            const hero = dashboard.querySelector('.manager-hero');
            if (hero?.nextSibling) dashboard.insertBefore(panel, hero.nextSibling);
            else if (hero) hero.after(panel);
            else dashboard.prepend(panel);
        }
        return true;
    }

    function install(documentRef) {
        if (!documentRef) return false;
        installStyles(documentRef);
        installBusinessContextWrapper();
        const dashboard = documentRef.getElementById('business-dashboard');
        if (!dashboard) return false;
        let scheduled = false;
        const refresh = () => {
            scheduled = false;
            const panel = documentRef.getElementById(PANEL_ID);
            const business = activeBusiness(getState());
            if (!business) return;
            if (!panel || panel.dataset.businessId !== clean(business.id, 120)) renderSectorPanel(documentRef);
        };
        if (typeof MutationObserver !== 'undefined' && !dashboard.__sectorObserver) {
            const observer = new MutationObserver(() => {
                if (scheduled) return;
                scheduled = true;
                setTimeout(refresh, 0);
            });
            observer.observe(dashboard, { childList: true, subtree: true });
            dashboard.__sectorObserver = observer;
        }
        renderSectorPanel(documentRef);
        root.__cronacheBusinessSpecializationsVersion = PATCH_VERSION;
        return true;
    }

    function scheduleInstall() {
        if (typeof document === 'undefined') return;
        const attempt = () => install(document);
        [0, 100, 350, 900, 1800, 3500].forEach(delay => setTimeout(attempt, delay));
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attempt, { once: true });
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        PROFILES,
        inferSpecialization,
        buildSectorSnapshot,
        buildSectorNarrativeContext,
        installBusinessContextWrapper,
        install
    };
});