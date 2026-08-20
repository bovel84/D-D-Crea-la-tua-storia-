(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheKingdomFocusUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-kingdom-focus-ui-style';
    const PRIMARY_SECTIONS = [
        'kingdom-overview', 'kingdom-people', 'kingdom-economy',
        'kingdom-territories', 'kingdom-politics', 'kingdom-defense'
    ];
    const NAV_LABELS = {
        'kingdom-overview': '⌂ Sintesi',
        'kingdom-people': '👥 Popolo',
        'kingdom-economy': '💰 Economia',
        'kingdom-territories': '🗺 Territori',
        'kingdom-politics': '⚖ Politica',
        'kingdom-defense': '⚔ Difesa'
    };
    const ACTIONS_BY_SECTION = {
        'kingdom-overview': ['council', 'census', 'period'],
        'kingdom-people': ['relief', 'publicService'],
        'kingdom-economy': ['tax', 'census'],
        'kingdom-territories': [],
        'kingdom-politics': ['council'],
        'kingdom-defense': ['recruit']
    };

    let activeSection = 'kingdom-overview';
    let observer = null;
    let refreshScheduled = false;
    const collapsedSections = new Map();

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 320) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const keyOf = value => clean(value, 600).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, number(value, min)));

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function getKingdom() {
        const state = getState();
        return state?.worldMemory?.kingdom || null;
    }

    function classifySectionHeading(value, explicitId = '') {
        if (PRIMARY_SECTIONS.includes(explicitId)) return explicitId;
        const heading = keyOf(value);
        if (!heading) return '';
        if (/popolo|qualita-della-vita|gruppi-di-popolazione|classi-sociali|demograf/.test(heading)) return 'kingdom-people';
        if (/mercato-del-lavoro|lavoro|economia|servizi-pubblici|risorse|produzione|commerc/.test(heading)) return 'kingdom-economy';
        if (/territori|territorio|crisi/.test(heading)) return 'kingdom-territories';
        if (/corte|fazioni|fazione|diplomazia|leggi|decreti|consiglio|politic/.test(heading)) return 'kingdom-politics';
        if (/esercito|difesa|forze-armate|militar|flotta/.test(heading)) return 'kingdom-defense';
        if (/storico|cronologia|andamento|audit|riepilogo|statistiche-generali/.test(heading)) return 'kingdom-overview';
        return '';
    }

    function actionNamesForSection(section) {
        return (ACTIONS_BY_SECTION[section] || []).slice();
    }

    function buildSummaryData(kingdomValue) {
        const kingdom = kingdomValue && typeof kingdomValue === 'object' ? kingdomValue : {};
        const people = kingdom.people || {};
        const activeCrises = asArray(kingdom.crises).filter(item => !item?.status || /active|attiv|open|ongoing/i.test(String(item.status)));
        const hostileFactions = asArray(kingdom.factions).filter(item => {
            const relation = `${item?.relationship || ''} ${item?.stance || ''} ${item?.status || ''}`.toLowerCase();
            return number(item?.hostility) >= 65 || /ostil|nemic|avvers|guerra|rival/.test(relation);
        });
        const metrics = [
            { key: 'treasury', label: 'Tesoro', value: Math.round(number(kingdom.treasury)).toLocaleString('it-IT'), tone: number(kingdom.treasury) < 0 ? 'critical' : 'normal' },
            { key: 'stability', label: 'Stabilità', value: `${Math.round(clamp(kingdom.stability, 0, 100))}%`, tone: number(kingdom.stability, 50) < 40 ? 'warning' : 'normal' },
            { key: 'approval', label: 'Consenso', value: `${Math.round(clamp(people.approval, 0, 100))}%`, tone: number(people.approval, 50) < 40 ? 'warning' : 'normal' },
            { key: 'pressure', label: 'Pressioni', value: `${activeCrises.length + hostileFactions.length}`, tone: activeCrises.length || hostileFactions.length ? 'warning' : 'good' }
        ];

        let alert = { tone: 'good', icon: '✓', text: 'Nessuna emergenza prioritaria rilevata.' };
        const severeCrisis = activeCrises.slice().sort((a, b) => number(b?.severity) - number(a?.severity))[0];
        if (severeCrisis && number(severeCrisis.severity) >= 55) {
            alert = { tone: 'critical', icon: '⚠', text: `Crisi prioritaria: ${clean(severeCrisis.name || severeCrisis.title || severeCrisis.description || 'crisi del regno', 140)}` };
        } else if (number(kingdom.treasury) < 0) {
            alert = { tone: 'critical', icon: '⚠', text: 'Tesoro negativo: ridurre costi o creare nuove entrate.' };
        } else if (number(people.unrest) >= 55) {
            alert = { tone: 'critical', icon: '⚠', text: `Disordini popolari al ${Math.round(number(people.unrest))}%.` };
        } else if (number(kingdom.food) <= 0 && number(kingdom.population) > 0) {
            alert = { tone: 'critical', icon: '⚠', text: 'Riserve alimentari esaurite.' };
        } else if (number(kingdom.stability, 50) < 40) {
            alert = { tone: 'warning', icon: '!', text: `Stabilità fragile: ${Math.round(number(kingdom.stability, 50))}%.` };
        } else if (hostileFactions.length) {
            alert = { tone: 'warning', icon: '⚑', text: `${hostileFactions.length} fazion${hostileFactions.length === 1 ? 'e avversaria' : 'i avversarie'} da monitorare.` };
        }

        return { metrics, alert, activeCrises: activeCrises.length, hostileFactions: hostileFactions.length };
    }

    function ensureStyles(doc) {
        if (!doc || doc.getElementById(STYLE_ID)) return;
        const style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
#kingdom-dashboard.kingdom-focused-ui{display:flex;flex-direction:column;gap:9px;min-width:0}
.kingdom-focused-ui .manager-hero{margin:0!important;padding:12px 14px!important;border-radius:13px!important}
.kingdom-focused-ui .manager-hero h3{margin:2px 0 3px!important;font-size:1.05rem!important}
.kingdom-focused-ui .manager-hero p{margin:0!important;font-size:.72rem!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kingdom-focused-ui .manager-cash{padding:7px 9px!important;min-width:150px!important}
.kingdom-focused-ui .manager-cash span{font-size:.56rem!important}
.kingdom-focused-ui .manager-cash strong{font-size:.86rem!important}
.kingdom-focused-ui .kingdom-nav{position:sticky!important;top:0!important;z-index:8!important;display:flex!important;gap:5px!important;margin:0!important;padding:6px!important;overflow-x:auto!important;flex-wrap:nowrap!important;scrollbar-width:none!important;border-radius:12px!important;background:rgba(247,238,215,.97)!important}
.kingdom-focused-ui .kingdom-nav::-webkit-scrollbar{display:none}
.kingdom-focused-ui .kingdom-nav button{flex:0 0 auto!important;min-height:34px!important;padding:6px 10px!important;font-size:.61rem!important;white-space:nowrap!important}
.kingdom-focused-ui .kingdom-nav button.is-active{color:#fff8dc!important;background:#294b3f!important;border-color:#294b3f!important;box-shadow:0 3px 9px rgba(20,50,40,.18)}
.kingdom-focus-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.kingdom-focus-metric{min-width:0;padding:8px 9px;border:1px solid rgba(75,55,31,.14);border-radius:10px;background:rgba(255,252,242,.76)}
.kingdom-focus-metric span{display:block;color:#76604a;font:700 .52rem 'Cinzel',serif;text-transform:uppercase;letter-spacing:.02em}
.kingdom-focus-metric strong{display:block;margin-top:2px;color:#342317;font:700 .9rem 'Cinzel',serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kingdom-focus-metric.warning{border-color:rgba(170,104,18,.3);background:rgba(202,151,52,.1)}
.kingdom-focus-metric.critical{border-color:rgba(145,31,37,.34);background:rgba(145,31,37,.09)}
.kingdom-focus-metric.good{border-color:rgba(46,120,78,.24);background:rgba(46,120,78,.08)}
.kingdom-focus-alert{display:flex;align-items:center;gap:8px;min-height:34px;padding:7px 9px;border-radius:10px;color:#5d4938;background:rgba(139,105,20,.08);border:1px solid rgba(139,105,20,.14);font-size:.7rem}
.kingdom-focus-alert>span{display:grid;place-items:center;flex:0 0 23px;width:23px;height:23px;border-radius:999px;background:rgba(139,105,20,.14);font-weight:800}
.kingdom-focus-alert.critical{color:#711c21;background:rgba(145,31,37,.08);border-color:rgba(145,31,37,.22)}
.kingdom-focus-alert.warning{color:#714d13;background:rgba(184,122,24,.09);border-color:rgba(184,122,24,.22)}
.kingdom-focus-alert.good{color:#315b45;background:rgba(46,120,78,.07);border-color:rgba(46,120,78,.16)}
.kingdom-focus-actions{display:flex;align-items:center;gap:6px;min-height:38px;overflow-x:auto;scrollbar-width:none;padding:1px 0}
.kingdom-focus-actions::-webkit-scrollbar{display:none}
.kingdom-focus-actions-label{flex:0 0 auto;color:#765f46;font:700 .55rem 'Cinzel',serif;text-transform:uppercase}
.kingdom-focus-action{flex:0 0 auto;min-height:34px!important;padding:6px 10px!important;border:1px solid rgba(78,59,36,.23)!important;border-radius:999px!important;color:#4a3421!important;background:linear-gradient(180deg,#fff9e8,#e1cf9d)!important;font:700 .58rem 'Cinzel',serif!important;white-space:nowrap;cursor:pointer}
.kingdom-focus-source-actions{display:none!important}
.kingdom-focused-ui .manager-columns{display:block!important;min-width:0!important}
.kingdom-focused-ui .kingdom-focus-hidden{display:none!important}
.kingdom-focused-ui .manager-section{margin:0 0 8px!important;padding:11px!important;border-radius:12px!important}
.kingdom-focused-ui .manager-section-head{margin-bottom:8px!important}
.kingdom-focused-ui .manager-section-head h4{font-size:.78rem!important}
.kingdom-focused-ui .manager-section-head>span{font-size:.63rem!important}
.kingdom-focused-ui .manager-kpi-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:6px!important}
.kingdom-focused-ui .manager-kpi{padding:8px!important;min-width:0}
.kingdom-focused-ui .manager-kpi span{font-size:.55rem!important}
.kingdom-focused-ui .manager-kpi strong{font-size:.86rem!important}
.kingdom-focused-ui .kingdom-command-center{margin:0!important;gap:7px!important}
.kingdom-focused-ui .kingdom-advisor{padding:10px!important}
.kingdom-focused-ui .kingdom-advisor p{font-size:.72rem!important;line-height:1.35!important}
.kingdom-focused-ui .kingdom-advisor ol{margin-top:6px!important;font-size:.68rem!important}
.kingdom-focused-ui .kingdom-risks{padding:9px!important}
.kingdom-focused-ui .kingdom-card-list{gap:6px!important}
.kingdom-focused-ui .manager-compact-card,.kingdom-focused-ui .kingdom-social-card,.kingdom-focused-ui .kingdom-faction-card{margin:0!important}
.kingdom-focus-collapsible>.manager-section-head{cursor:pointer;user-select:none}
.kingdom-focus-collapsible>.manager-section-head::after{content:'⌃';margin-left:auto;color:#6e563d;font-size:.7rem}
.kingdom-focus-collapsible.is-collapsed>.manager-section-head::after{content:'⌄'}
.kingdom-focus-collapsible.is-collapsed>:not(.manager-section-head){display:none!important}

@media(max-width:760px){
  #modal-kingdom{align-items:stretch!important;padding:0!important}
  #modal-kingdom .kingdom-manager-modal{width:100vw!important;max-width:100vw!important;height:100dvh!important;max-height:100dvh!important;margin:0!important;border-radius:0!important}
  #modal-kingdom .modal-header{min-height:48px!important;padding:8px 11px!important;font-size:.9rem!important}
  #modal-kingdom .modal-close{width:36px!important;height:36px!important;font-size:1.3rem!important}
  #modal-kingdom .modal-body{padding:6px!important;overflow-y:auto!important;overscroll-behavior:contain}
  #kingdom-dashboard.kingdom-focused-ui{gap:6px}
  .kingdom-focused-ui .manager-hero{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:7px!important;padding:8px 9px!important}
  .kingdom-focused-ui .manager-kicker{display:none!important}
  .kingdom-focused-ui .manager-hero h3{font-size:.84rem!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .kingdom-focused-ui .manager-hero p{font-size:.59rem!important;max-width:60vw}
  .kingdom-focused-ui .manager-cash{min-width:0!important;padding:5px 7px!important}
  .kingdom-focused-ui .manager-cash span{display:none!important}
  .kingdom-focused-ui .manager-cash strong{font-size:.7rem!important;max-width:36vw;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .kingdom-focused-ui .kingdom-nav{top:-6px!important;margin-inline:-1px!important;padding:4px!important;border-radius:9px!important}
  .kingdom-focused-ui .kingdom-nav button{min-height:31px!important;padding:5px 8px!important;font-size:.54rem!important}
  .kingdom-focus-summary{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(98px,1fr);grid-template-columns:none;gap:5px;overflow-x:auto;scrollbar-width:none}
  .kingdom-focus-summary::-webkit-scrollbar{display:none}
  .kingdom-focus-metric{padding:6px 7px}
  .kingdom-focus-metric span{font-size:.47rem}
  .kingdom-focus-metric strong{font-size:.76rem}
  .kingdom-focus-alert{min-height:31px;padding:5px 7px;font-size:.62rem}
  .kingdom-focus-alert>span{width:20px;height:20px;flex-basis:20px;font-size:.65rem}
  .kingdom-focus-actions{min-height:33px;gap:5px}
  .kingdom-focus-actions-label{font-size:.49rem}
  .kingdom-focus-action{min-height:31px!important;padding:5px 8px!important;font-size:.52rem!important}
  .kingdom-focused-ui .kingdom-command-center{grid-template-columns:1fr!important}
  .kingdom-focused-ui .kingdom-score{display:grid!important;grid-template-columns:1fr auto auto!important;padding:8px!important;align-items:center!important}
  .kingdom-focused-ui .kingdom-score strong{font-size:1.25rem!important}
  .kingdom-focused-ui .kingdom-advisor{padding:8px!important}
  .kingdom-focused-ui .kingdom-advisor-head{gap:4px!important}
  .kingdom-focused-ui .kingdom-advisor-head span{font-size:.67rem!important}
  .kingdom-focused-ui .kingdom-advisor-head small{font-size:.52rem!important}
  .kingdom-focused-ui .kingdom-advisor ol{padding-left:17px!important}
  .kingdom-focused-ui .manager-section{padding:8px!important;margin-bottom:6px!important}
  .kingdom-focused-ui .manager-section-head{min-height:29px!important;margin-bottom:6px!important}
  .kingdom-focused-ui .manager-section-head h4{font-size:.7rem!important}
  .kingdom-focused-ui .manager-section-head>span{font-size:.56rem!important}
  .kingdom-focused-ui .manager-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:5px!important}
  .kingdom-focused-ui .manager-kpi{padding:6px!important}
  .kingdom-focused-ui .manager-compact-card{grid-template-columns:minmax(0,1fr)!important;gap:4px!important;padding:8px!important}
  .kingdom-focused-ui .kingdom-social-card,.kingdom-focused-ui .kingdom-faction-card{padding:8px!important}
  .kingdom-focused-ui .kingdom-filterbar{overflow-x:auto!important;display:flex!important;flex-wrap:nowrap!important;gap:5px!important}
  .kingdom-focused-ui .kingdom-filterbar>*{flex:0 0 auto!important;min-width:125px!important}
}

@media(max-width:390px){
  .kingdom-focused-ui .manager-hero p{display:none!important}
  .kingdom-focused-ui .manager-cash strong{max-width:42vw}
  .kingdom-focused-ui .kingdom-nav button{font-size:.5rem!important;padding-inline:7px!important}
  .kingdom-focus-summary{grid-auto-columns:minmax(90px,1fr)}
}
`;
        (doc.head || doc.documentElement).appendChild(style);
    }

    function assignSectionGroups(rootEl) {
        const columns = rootEl?.querySelector('.manager-columns');
        if (!columns) return [];
        const sections = [...columns.children].filter(node => node.matches?.('section.manager-section'));
        let currentGroup = 'kingdom-people';
        sections.forEach(section => {
            const heading = clean(section.querySelector('.manager-section-head h4,h4')?.textContent, 160);
            const explicit = PRIMARY_SECTIONS.includes(section.id) ? section.id : '';
            const classified = classifySectionHeading(heading, explicit);
            if (explicit) currentGroup = explicit;
            const group = classified || currentGroup || 'kingdom-overview';
            section.dataset.kingdomFocusGroup = group;
            if (classified) currentGroup = classified;
        });
        return sections;
    }

    function ensureSummary(rootEl) {
        const nav = rootEl?.querySelector('.kingdom-nav');
        if (!nav) return;
        rootEl.querySelector('.kingdom-focus-summary')?.remove();
        rootEl.querySelector('.kingdom-focus-alert')?.remove();
        const summary = buildSummaryData(getKingdom());
        const metrics = rootEl.ownerDocument.createElement('section');
        metrics.className = 'kingdom-focus-summary';
        metrics.setAttribute('aria-label', 'Indicatori principali del regno');
        metrics.innerHTML = summary.metrics.map(metric =>
            `<article class="kingdom-focus-metric ${escapeHtml(metric.tone)}"><span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(metric.value)}</strong></article>`
        ).join('');
        nav.after(metrics);
        const alert = rootEl.ownerDocument.createElement('div');
        alert.className = `kingdom-focus-alert ${summary.alert.tone}`;
        alert.innerHTML = `<span aria-hidden="true">${escapeHtml(summary.alert.icon)}</span><strong>${escapeHtml(summary.alert.text)}</strong>`;
        metrics.after(alert);
    }

    function ensureActionPanel(rootEl) {
        const source = rootEl?.querySelector('.manager-actions');
        rootEl?.querySelector('.kingdom-focus-actions')?.remove();
        if (!source) return;
        source.classList.add('kingdom-focus-source-actions');
        const allowed = new Set(actionNamesForSection(activeSection));
        const buttons = [...source.querySelectorAll('[data-kingdom-action]')].filter(button => allowed.has(button.dataset.kingdomAction));
        if (!buttons.length) return;
        const panel = rootEl.ownerDocument.createElement('div');
        panel.className = 'kingdom-focus-actions';
        panel.innerHTML = '<span class="kingdom-focus-actions-label">Azioni</span>';
        buttons.forEach(button => {
            const clone = button.cloneNode(true);
            clone.removeAttribute('id');
            clone.className = 'kingdom-focus-action';
            panel.appendChild(clone);
        });
        const alert = rootEl.querySelector('.kingdom-focus-alert');
        if (alert) alert.after(panel);
        else source.before(panel);
    }

    function setSectionVisibility(rootEl) {
        const overview = rootEl?.querySelector('#kingdom-overview');
        if (overview) overview.classList.toggle('kingdom-focus-hidden', activeSection !== 'kingdom-overview');
        const sections = assignSectionGroups(rootEl);
        let visibleIndex = 0;
        sections.forEach(section => {
            const visible = section.dataset.kingdomFocusGroup === activeSection;
            section.classList.toggle('kingdom-focus-hidden', !visible);
            section.classList.remove('kingdom-focus-collapsible');
            if (!visible) return;
            const heading = clean(section.querySelector('.manager-section-head h4,h4')?.textContent, 160) || section.id || `section-${visibleIndex}`;
            const collapseKey = `${activeSection}|${keyOf(heading)}`;
            if (visibleIndex > 0) {
                section.classList.add('kingdom-focus-collapsible');
                const stored = collapsedSections.has(collapseKey) ? collapsedSections.get(collapseKey) : true;
                section.classList.toggle('is-collapsed', Boolean(stored));
                section.dataset.kingdomCollapseKey = collapseKey;
            } else {
                section.classList.remove('is-collapsed');
                delete section.dataset.kingdomCollapseKey;
            }
            visibleIndex += 1;
        });
        const columns = rootEl?.querySelector('.manager-columns');
        if (columns) {
            const anyVisible = sections.some(section => !section.classList.contains('kingdom-focus-hidden'));
            columns.classList.toggle('kingdom-focus-hidden', !anyVisible);
        }
    }

    function updateNav(rootEl) {
        rootEl?.querySelectorAll('.kingdom-nav [data-kingdom-section]').forEach(button => {
            const section = button.dataset.kingdomSection;
            if (NAV_LABELS[section]) button.textContent = NAV_LABELS[section];
            const active = section === activeSection;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });
    }

    function applyFocus(rootEl, options = {}) {
        if (!rootEl || !rootEl.querySelector('.kingdom-nav')) return false;
        rootEl.classList.add('kingdom-focused-ui');
        if (!PRIMARY_SECTIONS.includes(activeSection)) activeSection = 'kingdom-overview';
        updateNav(rootEl);
        setSectionVisibility(rootEl);
        ensureSummary(rootEl);
        ensureActionPanel(rootEl);
        if (options.scrollTop) {
            const body = rootEl.closest('.modal-body');
            if (body) body.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return true;
    }

    function bindEvents(doc) {
        if (!doc || doc.documentElement?.dataset.kingdomFocusUiBound === '1') return;
        if (doc.documentElement) doc.documentElement.dataset.kingdomFocusUiBound = '1';
        doc.addEventListener('click', event => {
            const navButton = event.target.closest?.('#kingdom-dashboard .kingdom-nav [data-kingdom-section]');
            if (navButton) {
                const next = navButton.dataset.kingdomSection;
                if (!PRIMARY_SECTIONS.includes(next)) return;
                event.preventDefault();
                event.stopImmediatePropagation();
                activeSection = next;
                const rootEl = doc.getElementById('kingdom-dashboard');
                if (rootEl) applyFocus(rootEl, { scrollTop: true });
                return;
            }
            const head = event.target.closest?.('#kingdom-dashboard .kingdom-focus-collapsible > .manager-section-head');
            if (!head || event.target.closest('button,input,select,textarea,a')) return;
            const section = head.parentElement;
            const key = section?.dataset?.kingdomCollapseKey;
            if (!section || !key) return;
            section.classList.toggle('is-collapsed');
            collapsedSections.set(key, section.classList.contains('is-collapsed'));
        }, true);
    }

    function refresh(doc) {
        const modal = doc?.getElementById('modal-kingdom');
        const dashboard = doc?.getElementById('kingdom-dashboard');
        if (!modal || !dashboard) return false;
        if (!dashboard.querySelector('.kingdom-nav')) return false;
        return applyFocus(dashboard);
    }

    function scheduleRefresh(doc) {
        if (refreshScheduled) return;
        refreshScheduled = true;
        const run = () => {
            refreshScheduled = false;
            refresh(doc);
        };
        if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(run);
        else if (typeof root.setTimeout === 'function') root.setTimeout(run, 0);
        else run();
    }

    function observe(doc) {
        if (!doc || observer || typeof MutationObserver === 'undefined') return;
        const dashboard = doc.getElementById('kingdom-dashboard');
        const target = dashboard || doc.documentElement || doc.body;
        observer = new MutationObserver(() => {
            if (doc.getElementById('modal-kingdom')?.classList.contains('active')) scheduleRefresh(doc);
        });
        observer.observe(target, { childList: true, subtree: true });
    }

    function install(doc = typeof document !== 'undefined' ? document : null) {
        if (!doc) return true;
        ensureStyles(doc);
        bindEvents(doc);
        refresh(doc);
        observe(doc);
        root.__cronacheKingdomFocusUIVersion = PATCH_VERSION;
        return true;
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(document), { once: true });
        else install(document);
        if (typeof root.setTimeout === 'function') [80, 300, 900, 1800].forEach(delay => root.setTimeout(() => refresh(document), delay));
    }

    return {
        PATCH_VERSION,
        PRIMARY_SECTIONS,
        classifySectionHeading,
        actionNamesForSection,
        buildSummaryData,
        assignSectionGroups,
        applyFocus,
        cssText: () => docCssTextFallback(),
        install,
        get activeSection() { return activeSection; },
        setActiveSection(value) { if (PRIMARY_SECTIONS.includes(value)) activeSection = value; return activeSection; }
    };

    function docCssTextFallback() {
        return '#kingdom-dashboard.kingdom-focused-ui .kingdom-focus-hidden{display:none!important}.kingdom-focus-summary{display:grid}.kingdom-nav button.is-active{font-weight:700}';
    }
});