(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheManagementHub = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-management-hub-style';
    const HUB_ID = 'modal-management-hub';
    const BUTTON_ID = 'btn-management-hub';
    const COMPOSER_ID = 'play-action-composer';
    const QUEUEABLE_BUSINESS_ACTIONS = new Set([
        'price', 'order', 'add-product', 'add-supplier', 'add-customer', 'hire', 'marketing',
        'invest', 'withdraw', 'train', 'stock', 'toggle', 'remove', 'update'
    ]);
    const QUEUEABLE_KINGDOM_ACTIONS = new Set([
        'tax', 'council', 'relief', 'census', 'publicService', 'recruit',
        'investTerritory', 'trainPop', 'subsidizeJob'
    ]);

    let managementObserver = null;
    let actionBridgeInstalled = false;
    let lastQueuedFingerprint = '';
    let lastQueuedAt = 0;

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 500) => String(value == null ? '' : value)
        .replace(/\s+/g, ' ').trim().slice(0, max);
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function businessLowStockCount(business) {
        const reportLow = business?.lastReport?.lowStock;
        if (Array.isArray(reportLow)) return reportLow.length;
        if (Number.isFinite(Number(reportLow))) return Math.max(0, Number(reportLow));
        return asArray(business?.products).filter(product =>
            product?.active !== false && number(product?.stock) <= Math.max(0, number(product?.reorderPoint))
        ).length;
    }

    function summarizeState(state = getState()) {
        const memory = state?.worldMemory || {};
        const businesses = asArray(memory?.management?.businesses).filter(item => item && item.status !== 'closed');
        const employees = asArray(memory?.employees).filter(item => item && item.status !== 'fired');
        const kingdom = memory?.kingdom && typeof memory.kingdom === 'object' ? memory.kingdom : {};
        const alerts = [];
        let totalProfit = 0;
        let lowStock = 0;

        businesses.forEach(business => {
            const profit = number(business?.lastReport?.netProfit);
            const low = businessLowStockCount(business);
            totalProfit += profit;
            lowStock += low;
            if (number(business?.cash) < 0) {
                alerts.push({ severity: 'critical', area: 'Attività', text: `${clean(business.name, 80)} ha cassa negativa.` });
            }
            if (profit < 0) {
                alerts.push({ severity: 'warning', area: 'Attività', text: `${clean(business.name, 80)} ha chiuso l'ultimo periodo in perdita.` });
            }
            if (low > 0) {
                alerts.push({ severity: 'warning', area: 'Magazzino', text: `${clean(business.name, 80)} ha ${low} prodotti sotto scorta.` });
            }
            if (number(business?.customerSatisfaction, 60) < 40) {
                alerts.push({ severity: 'warning', area: 'Clienti', text: `${clean(business.name, 80)} ha una soddisfazione clienti critica.` });
            }
        });

        if (kingdom?.active) {
            if (number(kingdom.treasury) < 0) alerts.push({ severity: 'critical', area: 'Regno', text: 'Il tesoro del regno è negativo.' });
            if (number(kingdom.food) <= 0) alerts.push({ severity: 'critical', area: 'Regno', text: 'Le riserve alimentari sono esaurite.' });
            if (number(kingdom.stability, 50) < 40) alerts.push({ severity: 'warning', area: 'Regno', text: 'La stabilità del regno è fragile.' });
            if (number(kingdom?.people?.unrest, 0) >= 55) alerts.push({ severity: 'critical', area: 'Popolo', text: 'I disordini popolari hanno raggiunto un livello pericoloso.' });
            asArray(kingdom.crises).filter(crisis => crisis?.status === 'active' && number(crisis?.severity) >= 60).slice(0, 2).forEach(crisis => {
                alerts.push({ severity: 'critical', area: 'Crisi', text: clean(crisis.name || crisis.title || crisis.description || 'Crisi grave nel regno', 150) });
            });
        }

        return {
            businesses,
            businessCount: businesses.length,
            businessProfit: Math.round(totalProfit * 100) / 100,
            lowStock,
            employees,
            employeeCount: employees.length,
            kingdom,
            kingdomActive: Boolean(kingdom?.active),
            cash: number(state?.character?.gold),
            alerts: alerts.slice(0, 8),
            alertCount: alerts.length
        };
    }

    function installStyles(documentRef) {
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
        const style = documentRef.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #play-action-composer {
                flex: 1 0 100%; width: 100%; display: grid; grid-template-columns: minmax(0,1fr) 48px;
                gap: 8px; padding: 2px 0 7px; order: -20;
            }
            #play-action-composer input {
                width: 100%; min-width: 0; min-height: 45px; padding: 10px 13px;
                border: 1px solid rgba(99,64,28,.34); border-radius: 13px;
                color: #2c1810; background: rgba(255,252,241,.96); font: 16px 'Crimson Text', Georgia, serif;
                box-shadow: inset 0 1px 2px rgba(52,31,16,.08);
            }
            #play-action-composer button {
                min-width: 48px; min-height: 45px; border: 1px solid rgba(95,59,20,.45); border-radius: 13px;
                color: #fff9df; background: linear-gradient(180deg,#9a6d20,#654111); font-size: 1.15rem; cursor: pointer;
                touch-action: manipulation;
            }
            #play-action-composer button:disabled { opacity: .45; cursor: default; }
            #btn-management-hub { position: relative; }
            #btn-management-hub .management-alert-badge {
                position: absolute; top: 4px; right: 6px; min-width: 18px; height: 18px; padding: 0 5px;
                display: grid; place-items: center; border-radius: 999px; color: #fff; background: #9c2228;
                font: 700 .64rem/1 Arial, sans-serif; box-shadow: 0 2px 6px rgba(0,0,0,.25);
            }
            #btn-management-hub .management-alert-badge[hidden] { display: none; }
            .management-hub-modal { width: min(760px, calc(100vw - 22px)); }
            .management-hub-intro { margin: 0 0 12px; color: #66513e; line-height: 1.4; }
            .management-hub-alerts { display: grid; gap: 7px; margin-bottom: 12px; }
            .management-hub-alert {
                display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: start;
                padding: 9px 10px; border-radius: 10px; color: #5a3a20; background: rgba(190,139,42,.12);
                border: 1px solid rgba(139,105,20,.18); font-size: .86rem;
            }
            .management-hub-alert.critical { color: #6e171b; background: rgba(145,31,37,.09); border-color: rgba(145,31,37,.22); }
            .management-hub-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
            .management-hub-card {
                min-width: 0; padding: 14px; border: 1px solid rgba(104,69,26,.22); border-radius: 14px;
                background: linear-gradient(155deg,rgba(255,253,244,.98),rgba(229,211,163,.78));
                box-shadow: 0 5px 14px rgba(46,28,13,.08);
            }
            .management-hub-card header { display: flex; align-items: center; gap: 9px; margin-bottom: 8px; }
            .management-hub-card header span { font-size: 1.35rem; }
            .management-hub-card h4 { margin: 0; color: #372319; font-family: 'Cinzel',serif; font-size: .9rem; }
            .management-hub-card strong { display: block; margin: 5px 0; color: #2c1810; font-size: 1.02rem; }
            .management-hub-card p { min-height: 36px; margin: 0 0 10px; color: #69533d; font-size: .82rem; line-height: 1.35; }
            .management-hub-card button { width: 100%; min-height: 39px; }
            .management-hub-card button:disabled { opacity: .5; }
            .management-hub-footer {
                margin-top: 12px; padding: 10px 12px; border-radius: 11px; color: #59442e;
                background: rgba(46,139,87,.08); border: 1px solid rgba(46,139,87,.18); font-size: .82rem;
            }
            @media (max-width: 640px) {
                #play-action-composer { padding-inline: 1px; }
                .management-hub-grid { grid-template-columns: 1fr; }
                .management-hub-modal { width: 100%; }
            }
        `;
        documentRef.head.appendChild(style);
    }

    function sendMainAction(text, documentRef) {
        const action = clean(text, 900);
        if (!action) return false;
        const state = getState();
        if (state?.isProcessing) return false;
        const hiddenInput = documentRef.getElementById('action-input');
        const hiddenSend = documentRef.getElementById('btn-send');
        if (!hiddenInput || !hiddenSend) return false;
        hiddenInput.value = action;
        hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
        hiddenSend.click();
        return true;
    }

    function ensureComposer(documentRef) {
        const inputArea = documentRef.querySelector('#game-screen .input-area');
        if (!inputArea || documentRef.getElementById(COMPOSER_ID)) return false;
        const composer = documentRef.createElement('form');
        composer.id = COMPOSER_ID;
        composer.setAttribute('aria-label', 'Azione libera del protagonista');
        composer.innerHTML = '<input id="play-action-input" type="text" maxlength="900" autocomplete="off" placeholder="Cosa fai, dici o decidi?">' +
            '<button type="submit" aria-label="Invia azione">➤</button>';
        inputArea.prepend(composer);
        const input = composer.querySelector('input');
        const button = composer.querySelector('button');
        composer.addEventListener('submit', event => {
            event.preventDefault();
            if (sendMainAction(input.value, documentRef)) input.value = '';
        });
        const syncBusy = () => {
            const state = getState();
            const hiddenSend = documentRef.getElementById('btn-send');
            button.disabled = Boolean(state?.isProcessing || hiddenSend?.disabled);
        };
        const hiddenSend = documentRef.getElementById('btn-send');
        if (hiddenSend && typeof MutationObserver !== 'undefined') {
            new MutationObserver(syncBusy).observe(hiddenSend, { attributes: true, attributeFilter: ['disabled'] });
        }
        syncBusy();
        return true;
    }

    function ensureManagementButton(documentRef) {
        const inputArea = documentRef.querySelector('#game-screen .input-area');
        const timeline = documentRef.getElementById('btn-advance-world');
        if (!inputArea || !timeline) return false;
        let button = documentRef.getElementById(BUTTON_ID);
        if (!button) {
            button = documentRef.createElement('button');
            button.type = 'button';
            button.id = BUTTON_ID;
            button.className = 'bottom-command management';
            button.dataset.bottomCommand = 'management';
            button.title = 'Apri attività, regno, finanze e personale';
            button.innerHTML = '<span class="bottom-command-icon" aria-hidden="true">🏛</span><span>Gestione</span><span class="management-alert-badge" hidden>0</span>';
            timeline.before(button);
            button.addEventListener('click', () => openHub(documentRef));
        }
        const timelineLabel = timeline.querySelector('span:not(.bottom-command-icon):not(.world-control-badge)');
        if (timelineLabel) timelineLabel.textContent = 'Continua';
        timeline.title = 'Continua la storia e lascia reagire il mondo';
        return true;
    }

    function ensureModal(documentRef) {
        let overlay = documentRef.getElementById(HUB_ID);
        if (overlay) return overlay;
        overlay = documentRef.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = HUB_ID;
        overlay.innerHTML = `
            <div class="modal management-hub-modal">
                <div class="modal-header">🏛 Centro gestione <button class="modal-close" type="button" data-management-close>✕</button></div>
                <div class="modal-body" id="management-hub-body"></div>
            </div>`;
        documentRef.body.appendChild(overlay);
        overlay.addEventListener('click', event => {
            if (event.target === overlay || event.target.closest('[data-management-close]')) {
                closeHub(documentRef);
                return;
            }
            const target = event.target.closest('[data-management-open]');
            if (!target || target.disabled) return;
            closeHub(documentRef);
            openManagementTarget(target.dataset.managementOpen, documentRef);
        });
        return overlay;
    }

    function formatNumber(value) {
        return number(value).toLocaleString('it-IT', { maximumFractionDigits: 2 });
    }

    function renderHub(documentRef) {
        const body = documentRef.getElementById('management-hub-body');
        if (!body) return;
        const summary = summarizeState();
        const kingdom = summary.kingdom;
        const businessLine = summary.businessCount
            ? `${summary.businessCount} attività · ${summary.businessProfit >= 0 ? '+' : ''}${formatNumber(summary.businessProfit)} ultimo risultato`
            : 'Nessuna attività gestita';
        const businessDetail = summary.businessCount
            ? `${summary.lowStock} prodotti sotto scorta · ${summary.employeeCount} dipendenti registrati`
            : 'Quando possiedi un negozio o un’impresa comparirà qui senza dover cercare altri menu.';
        const kingdomLine = summary.kingdomActive
            ? `${clean(kingdom.name, 90) || 'Regno'} · tesoro ${formatNumber(kingdom.treasury)}`
            : 'Nessun regno sotto il tuo governo';
        const kingdomDetail = summary.kingdomActive
            ? `Consenso ${Math.round(number(kingdom?.people?.approval, 50))}% · disordini ${Math.round(number(kingdom?.people?.unrest))}% · stabilità ${Math.round(number(kingdom.stability, 50))}%`
            : 'La sezione resta visibile e si attiva automaticamente quando la storia ti assegna un dominio.';
        const alerts = summary.alerts.length
            ? `<div class="management-hub-alerts">${summary.alerts.map(alert =>
                `<div class="management-hub-alert ${alert.severity}"><strong>${escapeHtml(alert.area)}</strong><span>${escapeHtml(alert.text)}</span></div>`
            ).join('')}</div>`
            : '<div class="management-hub-alerts"><div class="management-hub-alert"><strong>✓</strong><span>Nessuna criticità gestionale importante al momento.</span></div></div>';

        body.innerHTML = `
            <p class="management-hub-intro">Qui trovi i sistemi gestionali della campagna. Le decisioni operative rilevanti vengono ricordate e il mondo potrà reagire quando premi <strong>Continua</strong>.</p>
            ${alerts}
            <div class="management-hub-grid">
                <section class="management-hub-card"><header><span>🏢</span><h4>Attività</h4></header><strong>${escapeHtml(businessLine)}</strong><p>${escapeHtml(businessDetail)}</p><button class="btn primary" data-management-open="business" ${summary.businessCount ? '' : 'disabled'}>Apri gestione attività</button></section>
                <section class="management-hub-card"><header><span>👑</span><h4>Regno</h4></header><strong>${escapeHtml(kingdomLine)}</strong><p>${escapeHtml(kingdomDetail)}</p><button class="btn primary" data-management-open="kingdom" ${summary.kingdomActive ? '' : 'disabled'}>Apri gestione regno</button></section>
                <section class="management-hub-card"><header><span>💰</span><h4>Finanze</h4></header><strong>${formatNumber(summary.cash)}</strong><p>Contanti personali, patrimonio, entrate e uscite della campagna.</p><button class="btn" data-management-open="finances">Apri finanze</button></section>
                <section class="management-hub-card"><header><span>👷</span><h4>Personale</h4></header><strong>${summary.employeeCount} dipendenti</strong><p>Ruoli, stipendi, competenze e personale collegato alle tue proprietà.</p><button class="btn" data-management-open="employees">Apri personale</button></section>
            </div>
            <div class="management-hub-footer">Le modifiche gestionali non restano isolate: quando cambiano davvero lo stato di attività o regno vengono accodate come causa del prossimo sviluppo del mondo.</div>`;
        refreshBadge(documentRef, summary);
    }

    function openHub(documentRef) {
        const overlay = ensureModal(documentRef);
        renderHub(documentRef);
        overlay.classList.add('active');
        overlay.style.display = 'flex';
    }

    function closeHub(documentRef) {
        const overlay = documentRef.getElementById(HUB_ID);
        if (!overlay) return;
        overlay.classList.remove('active');
        overlay.style.display = '';
    }

    function invokeGlobal(name) {
        const fn = root?.[name];
        if (typeof fn !== 'function') return false;
        fn();
        return true;
    }

    function openManagementTarget(target, documentRef) {
        if (target === 'business') {
            if (!invokeGlobal('openBusinessManager')) documentRef.getElementById('btn-business-manage')?.click();
            return;
        }
        if (target === 'kingdom') {
            if (!invokeGlobal('openKingdomManager')) documentRef.getElementById('btn-kingdom-manage')?.click();
            return;
        }
        if (target === 'finances') {
            if (!invokeGlobal('showFinancesDetail')) documentRef.getElementById('panel-finances')?.click();
            return;
        }
        if (target === 'employees') {
            if (!invokeGlobal('showEmployeesDetail')) documentRef.getElementById('panel-employees')?.click();
        }
    }

    function refreshBadge(documentRef, precomputed) {
        const summary = precomputed || summarizeState();
        const badge = documentRef.querySelector(`#${BUTTON_ID} .management-alert-badge`);
        const button = documentRef.getElementById(BUTTON_ID);
        if (badge) {
            badge.textContent = String(Math.min(99, summary.alertCount));
            badge.hidden = summary.alertCount === 0;
        }
        if (button) button.classList.toggle('attention', summary.alertCount > 0);
    }

    function snapshotArea(kind) {
        const state = getState();
        const memory = state?.worldMemory || {};
        try {
            return JSON.stringify(kind === 'kingdom' ? memory.kingdom || {} : memory.management || {});
        } catch (_error) {
            return '';
        }
    }

    function shouldQueueManagementAction(kind, action) {
        if (kind === 'kingdom') return QUEUEABLE_KINGDOM_ACTIONS.has(action);
        return QUEUEABLE_BUSINESS_ACTIONS.has(action);
    }

    function activeBusiness(memory) {
        const management = memory?.management || {};
        const businesses = asArray(management.businesses);
        return businesses.find(item => item?.id === management.activeBusinessId) || businesses[0] || null;
    }

    function describeManagementAction(kind, action, button, state = getState()) {
        const memory = state?.worldMemory || {};
        const label = clean(button?.textContent || action, 120).replace(/^[^A-Za-zÀ-ÿ0-9]+/, '');
        if (kind === 'kingdom') {
            const kingdom = memory.kingdom || {};
            const details = [];
            if (action === 'tax') details.push(`aliquota ${Math.round(number(kingdom.taxRate))}%`);
            if (action === 'recruit') details.push(`professionisti ${Math.round(number(kingdom?.army?.professionals))}`);
            if (['relief', 'publicService', 'investTerritory', 'trainPop', 'subsidizeJob'].includes(action)) details.push(`tesoro ${formatNumber(kingdom.treasury)}`);
            return `Gestione regno — ${clean(kingdom.name, 100) || 'dominio'}: ${label || action}${details.length ? ` (${details.join(', ')})` : ''}. Mostra la reazione concreta di popolo, fazioni, istituzioni o potenze interessate.`;
        }
        const business = activeBusiness(memory);
        const details = [];
        const productId = button?.dataset?.productId || button?.dataset?.id;
        const product = asArray(business?.products).find(item => String(item?.id) === String(productId));
        if (product && action === 'price') details.push(`${clean(product.name, 80)} a ${formatNumber(product.salePrice)}`);
        if (product && action === 'order') details.push(`rifornimento ${clean(product.name, 80)}`);
        if (business) details.push(`cassa ${formatNumber(business.cash)}`);
        return `Gestione attività — ${clean(business?.name, 100) || 'attività'}: ${label || action}${details.length ? ` (${details.join(', ')})` : ''}. Mostra la reazione concreta di clienti, dipendenti, fornitori, concorrenti o mercato.`;
    }

    function enqueueDecision(text) {
        const now = Date.now();
        const fingerprint = clean(text, 500).toLowerCase();
        if (!fingerprint || (fingerprint === lastQueuedFingerprint && now - lastQueuedAt < 1500)) return false;
        const fn = root?.addParallelDecision;
        if (typeof fn !== 'function') return false;
        lastQueuedFingerprint = fingerprint;
        lastQueuedAt = now;
        fn(text);
        return true;
    }

    function installManagementActionBridge(documentRef, windowRef) {
        if (actionBridgeInstalled) return;
        actionBridgeInstalled = true;
        documentRef.addEventListener('click', event => {
            const kingdomButton = event.target.closest?.('[data-kingdom-action]');
            const managerButton = event.target.closest?.('[data-manager-action], [data-detail-action]');
            const button = kingdomButton || managerButton;
            if (!button || button.disabled) return;
            const kind = kingdomButton ? 'kingdom' : 'business';
            const action = kingdomButton ? button.dataset.kingdomAction : (button.dataset.managerAction || button.dataset.detailAction);
            if (!shouldQueueManagementAction(kind, action)) return;
            const before = snapshotArea(kind);
            windowRef.setTimeout(() => {
                const after = snapshotArea(kind);
                if (!after || after === before) return;
                enqueueDecision(describeManagementAction(kind, action, button));
                renderHub(documentRef);
            }, 0);
        }, true);
    }

    function observeManagementState(documentRef, windowRef) {
        if (managementObserver || typeof windowRef.MutationObserver !== 'function') return;
        const panelArea = documentRef.querySelector('.topbar-info-panels');
        if (!panelArea) return;
        managementObserver = new windowRef.MutationObserver(() => refreshBadge(documentRef));
        managementObserver.observe(panelArea, { childList: true, subtree: true, characterData: true, attributes: true });
    }

    function install(documentRef, windowRef) {
        if (!documentRef || !windowRef) return false;
        installStyles(documentRef);
        const hasInput = ensureComposer(documentRef);
        const hasManagement = ensureManagementButton(documentRef);
        if (!documentRef.getElementById(COMPOSER_ID) || !documentRef.getElementById(BUTTON_ID)) return false;
        ensureModal(documentRef);
        installManagementActionBridge(documentRef, windowRef);
        observeManagementState(documentRef, windowRef);
        refreshBadge(documentRef);
        documentRef.body?.classList.add('management-hub-ready');
        root.__cronacheManagementHubVersion = PATCH_VERSION;
        return hasInput || hasManagement || true;
    }

    function scheduleInstall() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        const attempt = () => install(document, window);
        [0, 80, 250, 700, 1500, 3000, 5000].forEach(delay => window.setTimeout(attempt, delay));
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attempt, { once: true });
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        STYLE_ID,
        HUB_ID,
        BUTTON_ID,
        COMPOSER_ID,
        summarizeState,
        shouldQueueManagementAction,
        describeManagementAction,
        sendMainAction,
        install
    };
});
