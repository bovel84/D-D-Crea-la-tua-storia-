(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronachePlayerExperienceV6 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-player-experience-v6-style';
    const MANAGEMENT_TABS_ID = 'ux-management-tabs';
    const WORLD_STATUS_ID = 'ux-world-status';
    const TOPBAR_MORE_ID = 'ux-topbar-more';
    const STORY_META_CLASS = 'ux-scene-meta';
    const MAX_DECORATED_HISTORY = 120;

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 1200) => String(value == null ? '' : value)
        .replace(/\s+/g, ' ').trim().slice(0, max);
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const keyOf = value => clean(value, 400).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

    let storyObserver = null;
    let hubObserver = null;
    let busyTimer = null;
    let lastBusyMode = 'world';
    let managementTab = 'overview';

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function eventMatchesText(event, text) {
        const corpus = keyOf(text);
        if (!event || !corpus) return false;
        const title = keyOf(event.title);
        const summary = keyOf(event.summary);
        const consequence = keyOf(event.consequence);
        if (title && title.length >= 8 && corpus.includes(title)) return true;
        if (summary && summary.length >= 24) {
            const words = summary.split(' ').filter(word => word.length >= 5).slice(0, 10);
            const hits = words.filter(word => corpus.includes(word)).length;
            if (hits >= Math.min(4, Math.max(2, Math.ceil(words.length * 0.45)))) return true;
        }
        if (consequence && consequence.length >= 24) {
            const words = consequence.split(' ').filter(word => word.length >= 5).slice(0, 8);
            const hits = words.filter(word => corpus.includes(word)).length;
            if (hits >= Math.min(3, Math.max(2, Math.ceil(words.length * 0.5)))) return true;
        }
        return false;
    }

    function eventImportance(event) {
        const value = keyOf(event?.importance);
        if (/critical|critico|cruciale|epocale/.test(value)) return 'critical';
        if (/high|alto|importante|grave/.test(value)) return 'high';
        return 'normal';
    }

    function latestMatchingEvent(state, text) {
        const events = asArray(state?.worldMemory?.events);
        for (let index = events.length - 1; index >= Math.max(0, events.length - 12); index--) {
            if (eventMatchesText(events[index], text)) return events[index];
        }
        return null;
    }

    function currentDateLabel(state = getState()) {
        try {
            if (typeof root.getFullTimeString === 'function') return clean(root.getFullTimeString(), 120);
        } catch (_error) { }
        const time = state?.time || {};
        if (time.year) {
            const month = time.month ? `/${time.month}` : '';
            const day = time.day ? `${time.day}${month}/` : '';
            return `${day}${time.year}`;
        }
        return clean(state?.worldMemory?.currentDate || state?.currentStory?.startDate || '', 120);
    }

    function sceneMeta(state, event) {
        const date = clean(event?.occurredAt || currentDateLabel(state), 100);
        const location = clean(event?.location || state?.currentLocation || state?.worldMemory?.world?.startLocation, 100);
        return { date, location };
    }

    function statusMessageForMode(mode, state = getState()) {
        const turn = Math.max(0, Math.round(number(state?.worldMemory?.turnCount)));
        const pending = asArray(state?.worldMemory?.pendingTimelineEvents).length;
        if (mode === 'analysis') return 'Valuto opportunità, rischi e possibili reazioni…';
        if (mode === 'chat') return 'I personaggi stanno formulando la loro risposta…';
        if (mode === 'management') return 'Aggiorno attività, regno e relazioni…';
        if (mode === 'action') return 'Il Master interpreta la tua azione e aggiorna il mondo…';
        if (pending > 0) return `Il mondo sta reagendo: ${pending} sviluppo${pending === 1 ? '' : 'i'} in attesa…`;
        return turn > 0 ? 'Simulo il prossimo sviluppo del mondo…' : 'Il mondo sta prendendo forma…';
    }

    function managementSectionForCard(card) {
        if (!card) return 'overview';
        const button = card.querySelector?.('[data-management-open]');
        const target = keyOf(button?.dataset?.managementOpen || '');
        if (target === 'business' || target === 'finances' || target === 'employees') return 'business';
        if (target === 'kingdom') return 'kingdom';
        return 'overview';
    }

    function installStyles(documentRef) {
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
        const style = documentRef.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            :root {
                --px-bg: #120b08;
                --px-surface: rgba(255, 252, 241, .97);
                --px-surface-soft: rgba(246, 236, 208, .94);
                --px-ink: #2b1b12;
                --px-ink-soft: #6a5540;
                --px-gold: #b98924;
                --px-gold-deep: #6a4313;
                --px-red: #9b2930;
                --px-green: #2f7650;
                --px-blue: #315d7a;
                --px-radius-sm: 10px;
                --px-radius: 15px;
                --px-radius-lg: 21px;
                --px-shadow: 0 12px 34px rgba(36, 22, 12, .16);
            }

            body.ux-player-v6-ready #game-screen { background: radial-gradient(circle at 50% 0%, rgba(113,73,25,.06), transparent 42%); }

            /* Cronaca: scena prima, interfaccia dopo. */
            body.ux-player-v6-ready #story-scroll {
                scroll-padding-bottom: 132px;
            }
            body.ux-player-v6-ready .story-entry.narrator {
                position: relative;
                overflow: hidden;
                border: 1px solid rgba(111, 76, 33, .15);
                border-radius: var(--px-radius-lg);
                background: linear-gradient(180deg, rgba(255,253,247,.99), rgba(246,236,211,.96));
                box-shadow: 0 10px 28px rgba(48, 29, 15, .09);
            }
            body.ux-player-v6-ready .story-entry.narrator .${STORY_META_CLASS} {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 6px;
                margin: -2px 0 11px;
                color: #7a644c;
                font: 700 .68rem/1.2 Arial, sans-serif;
                letter-spacing: .035em;
                text-transform: uppercase;
            }
            body.ux-player-v6-ready .story-entry.narrator .${STORY_META_CLASS} span {
                display: inline-flex;
                align-items: center;
                min-height: 23px;
                padding: 4px 8px;
                border: 1px solid rgba(92,65,34,.12);
                border-radius: 999px;
                background: rgba(255,255,255,.55);
            }
            body.ux-player-v6-ready .story-entry.narrator.ux-event-reveal {
                border-color: rgba(139,105,20,.36);
                box-shadow: 0 14px 38px rgba(55,31,12,.16);
            }
            body.ux-player-v6-ready .story-entry.narrator.ux-event-reveal::before {
                content: '';
                display: block;
                height: 4px;
                margin: -13px -14px 12px;
                background: linear-gradient(90deg, #7a5316, #d9b64d, #7a5316);
            }
            body.ux-player-v6-ready .story-entry.narrator.ux-event-critical {
                border-color: rgba(148,36,43,.42);
                box-shadow: 0 16px 42px rgba(117,26,31,.16);
            }
            body.ux-player-v6-ready .story-entry.narrator.ux-event-critical::before {
                background: linear-gradient(90deg, #6f151b, #ce565b, #6f151b);
            }
            body.ux-player-v6-ready .story-entry.narrator .ux-event-kicker {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                margin: 0 0 8px;
                color: #714b16;
                font: 800 .72rem/1.2 Arial, sans-serif;
                letter-spacing: .045em;
                text-transform: uppercase;
            }
            body.ux-player-v6-ready .story-entry.narrator.ux-event-critical .ux-event-kicker { color: #8c2027; }

            /* Le immagini appartengono alla storia: nessun branding tecnico visibile. */
            body.ux-player-v6-ready .story-scene-visual,
            body.ux-player-v6-ready .story-scene-img {
                border-radius: 16px !important;
            }
            body.ux-player-v6-ready .story-scene-visual figcaption { display: none !important; }
            body.ux-player-v6-ready .story-scene-visual.loaded img { animation: uxSceneReveal .32s ease-out both; }
            @keyframes uxSceneReveal { from { opacity: .45; transform: scale(1.012); } to { opacity: 1; transform: scale(1); } }

            /* Barra inferiore: navigazione da gioco mobile. */
            body.ux-player-v6-ready #game-screen .input-area {
                position: relative;
                padding-top: 8px;
                border-top: 1px solid rgba(86,55,26,.16);
                background: linear-gradient(180deg, rgba(248,240,218,.94), rgba(237,222,184,.98));
                box-shadow: 0 -12px 32px rgba(44,26,14,.10);
                backdrop-filter: blur(12px);
            }
            body.ux-player-v6-ready .bottom-command {
                position: relative;
                min-width: 0;
                min-height: 58px;
                padding: 5px 4px 6px;
                border: 0;
                border-radius: 14px;
                color: #6d5842;
                background: transparent;
                transition: transform .16s ease, background .16s ease, color .16s ease;
                touch-action: manipulation;
            }
            body.ux-player-v6-ready .bottom-command-icon {
                width: 38px !important;
                height: 34px !important;
                display: grid;
                place-items: center;
                margin: 0 auto 1px;
                border-radius: 12px;
                font-size: 1.13rem;
                background: rgba(255,255,255,.44);
            }
            body.ux-player-v6-ready .bottom-command > span:not(.bottom-command-icon):not(.management-alert-badge):not(.world-control-badge) {
                font: 750 .68rem/1.1 Arial, sans-serif;
            }
            body.ux-player-v6-ready .bottom-command.ux-nav-active {
                color: #4d3211;
                background: rgba(185,137,36,.12);
            }
            body.ux-player-v6-ready .bottom-command.ux-nav-active .bottom-command-icon {
                color: #fff8df;
                background: linear-gradient(180deg,#ad8125,#735014);
                box-shadow: 0 5px 12px rgba(92,57,16,.22);
            }
            body.ux-player-v6-ready #btn-advance-world {
                color: #fffbe9;
                background: linear-gradient(180deg,#8e6719,#5f3e10);
                box-shadow: 0 7px 16px rgba(82,52,16,.22);
            }
            body.ux-player-v6-ready #btn-advance-world .bottom-command-icon {
                background: rgba(255,255,255,.14);
            }
            body.ux-player-v6-ready #btn-advance-world.ux-continue-ready {
                animation: uxContinueReady 2.2s ease-in-out infinite;
            }
            @keyframes uxContinueReady { 0%,100% { box-shadow: 0 7px 16px rgba(82,52,16,.22); } 50% { box-shadow: 0 8px 21px rgba(175,128,28,.42); } }

            /* Composer più simile a una barra azione, meno a un form web. */
            body.ux-player-v6-ready #play-action-composer {
                padding: 0 0 8px;
                gap: 7px;
            }
            body.ux-player-v6-ready #play-action-composer input {
                min-height: 48px;
                border-radius: 16px;
                border-color: rgba(88,58,26,.22);
                background: rgba(255,254,248,.98);
                box-shadow: 0 4px 13px rgba(51,31,16,.06), inset 0 1px 1px rgba(51,31,16,.05);
            }
            body.ux-player-v6-ready #play-action-composer button {
                min-height: 48px;
                border-radius: 16px;
                box-shadow: 0 5px 12px rgba(82,52,16,.18);
            }

            /* Stato IA contestuale. */
            #${WORLD_STATUS_ID} {
                grid-column: 1 / -1;
                display: none;
                align-items: center;
                gap: 9px;
                min-height: 31px;
                margin: -1px 2px 5px;
                padding: 6px 10px;
                border-radius: 11px;
                color: #5f492f;
                background: rgba(255,255,255,.46);
                font: 700 .76rem/1.25 Arial, sans-serif;
            }
            #${WORLD_STATUS_ID}.is-visible { display: flex; }
            #${WORLD_STATUS_ID} .ux-world-status-orb {
                width: 8px; height: 8px; flex: 0 0 auto; border-radius: 50%;
                background: #b38625; box-shadow: 0 0 0 4px rgba(179,134,37,.12);
                animation: uxStatusPulse 1.2s ease-in-out infinite;
            }
            @keyframes uxStatusPulse { 50% { opacity:.42; transform:scale(.78); } }

            /* Topbar: mostra il necessario, il resto su richiesta. */
            #${TOPBAR_MORE_ID} { display: none; }
            @media (max-width: 700px) {
                body.ux-player-v6-ready .game-topbar { backdrop-filter: blur(10px); }
                body.ux-player-v6-ready .topbar-info-panels { overflow: visible !important; gap: 5px; }
                body.ux-player-v6-ready .topbar-info-panels .info-panel:nth-child(n+4) { display: none; }
                body.ux-player-v6-ready.ux-topbar-expanded .topbar-info-panels {
                    flex-wrap: wrap !important;
                }
                body.ux-player-v6-ready.ux-topbar-expanded .topbar-info-panels .info-panel:nth-child(n+4) { display: flex; }
                body.ux-player-v6-ready .topbar-info-panels .info-panel {
                    min-width: 0 !important;
                    padding: 5px 7px;
                    border-radius: 10px;
                }
                #${TOPBAR_MORE_ID} { display: inline-grid; place-items:center; }
            }

            /* Centro gestione: pochi livelli chiari invece di un'unica pagina lunga. */
            #${MANAGEMENT_TABS_ID} {
                position: sticky;
                top: -1px;
                z-index: 7;
                display: grid;
                grid-template-columns: repeat(4,minmax(0,1fr));
                gap: 5px;
                margin: -4px 0 12px;
                padding: 5px;
                border: 1px solid rgba(96,65,33,.14);
                border-radius: 14px;
                background: rgba(251,246,231,.96);
                backdrop-filter: blur(8px);
            }
            #${MANAGEMENT_TABS_ID} button {
                min-width: 0;
                min-height: 38px;
                padding: 6px 5px;
                border: 0;
                border-radius: 10px;
                color: #6c5842;
                background: transparent;
                font: 800 .67rem/1.1 Arial,sans-serif;
                touch-action: manipulation;
            }
            #${MANAGEMENT_TABS_ID} button[aria-selected='true'] {
                color: #fff9e4;
                background: linear-gradient(180deg,#916919,#64420f);
                box-shadow: 0 4px 10px rgba(81,50,15,.17);
            }
            body.ux-player-v6-ready .management-hub-modal { width: min(700px, calc(100vw - 18px)); }
            body.ux-player-v6-ready #management-hub-body { padding-top: 10px; }
            body.ux-player-v6-ready .management-hub-card,
            body.ux-player-v6-ready #management-agents-panel,
            body.ux-player-v6-ready #management-network-panel,
            body.ux-player-v6-ready #systemic-world-panel {
                border-radius: 15px !important;
                box-shadow: 0 6px 18px rgba(48,29,15,.07) !important;
            }
            body.ux-player-v6-ready .management-hub-alerts { max-height: 185px; overflow: auto; }
            body.ux-player-v6-ready [data-ux-management-hidden='true'] { display: none !important; }

            /* Modali più coerenti e leggibili. */
            body.ux-player-v6-ready .modal-header {
                min-height: 50px;
                border-bottom: 1px solid rgba(90,60,28,.14);
                backdrop-filter: blur(10px);
            }
            body.ux-player-v6-ready .modal-close { touch-action: manipulation; }

            @media (max-width: 560px) {
                body.ux-player-v6-ready #game-screen .input-area { padding-inline: 7px !important; column-gap: 4px !important; }
                body.ux-player-v6-ready .bottom-command { min-height: 55px; font-size: .68rem !important; }
                body.ux-player-v6-ready .bottom-command-icon { width: 34px !important; height: 32px !important; }
                body.ux-player-v6-ready .story-entry.narrator { border-radius: 17px; }
                body.ux-player-v6-ready .management-hub-grid { grid-template-columns: 1fr !important; }
                #${MANAGEMENT_TABS_ID} { gap: 3px; padding: 4px; }
                #${MANAGEMENT_TABS_ID} button { font-size: .62rem; padding-inline: 2px; }
            }

            @media (prefers-reduced-motion: reduce) {
                body.ux-player-v6-ready *, body.ux-player-v6-ready *::before, body.ux-player-v6-ready *::after {
                    animation-duration: .001ms !important;
                    animation-iteration-count: 1 !important;
                    scroll-behavior: auto !important;
                    transition-duration: .001ms !important;
                }
            }
        `;
        documentRef.head.appendChild(style);
    }

    function decorateStoryEntry(entry, state = getState()) {
        if (!entry || !entry.classList?.contains('narrator') || entry.dataset.uxSceneDecorated === '1') return false;
        const text = clean(entry.innerText || entry.textContent, 8000);
        if (!text) return false;
        entry.dataset.uxSceneDecorated = '1';
        const event = latestMatchingEvent(state, text);
        const importance = eventImportance(event);
        const meta = sceneMeta(state, event);

        const anchor = entry.querySelector('.story-scene-visual, .story-scene-img');
        const metaNode = entry.ownerDocument.createElement('div');
        metaNode.className = STORY_META_CLASS;
        metaNode.setAttribute('aria-label', 'Contesto della scena');
        const pieces = [];
        if (meta.date) pieces.push(`<span>🕰 ${escapeHtml(meta.date)}</span>`);
        if (meta.location) pieces.push(`<span>📍 ${escapeHtml(meta.location)}</span>`);
        metaNode.innerHTML = pieces.join('');

        if (importance === 'high' || importance === 'critical') {
            entry.classList.add('ux-event-reveal');
            if (importance === 'critical') entry.classList.add('ux-event-critical');
            const kicker = entry.ownerDocument.createElement('div');
            kicker.className = 'ux-event-kicker';
            kicker.textContent = importance === 'critical' ? '⚠ Evento critico' : '◆ Evento importante';
            if (anchor?.nextSibling) entry.insertBefore(kicker, anchor.nextSibling);
            else entry.prepend(kicker);
            if (event?.title) entry.setAttribute('aria-label', `${kicker.textContent}: ${clean(event.title, 120)}`);
        }

        if (anchor?.nextSibling) entry.insertBefore(metaNode, anchor.nextSibling);
        else entry.prepend(metaNode);
        return true;
    }

    function decorateRecentStory(documentRef, state = getState()) {
        const entries = Array.from(documentRef?.querySelectorAll?.('#story-scroll .story-entry.narrator') || []);
        entries.slice(-MAX_DECORATED_HISTORY).forEach(entry => decorateStoryEntry(entry, state));
        return entries.length;
    }

    function observeStory(documentRef, windowRef) {
        if (storyObserver || typeof windowRef?.MutationObserver !== 'function') return;
        const story = documentRef.getElementById('story-scroll');
        if (!story) return;
        storyObserver = new windowRef.MutationObserver(mutations => {
            const added = [];
            mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
                if (node?.nodeType !== 1) return;
                if (node.matches?.('.story-entry.narrator')) added.push(node);
                node.querySelectorAll?.('.story-entry.narrator').forEach(entry => added.push(entry));
            }));
            if (!added.length) return;
            windowRef.setTimeout(() => added.forEach(entry => decorateStoryEntry(entry, getState())), 0);
        });
        storyObserver.observe(story, { childList: true, subtree: true });
    }

    function ensureTopbarMore(documentRef) {
        if (!documentRef || documentRef.getElementById(TOPBAR_MORE_ID)) return false;
        const panels = documentRef.querySelector('.topbar-info-panels');
        if (!panels || panels.children.length < 4) return false;
        const group = documentRef.querySelector('#game-screen .topbar-buttons:last-child') || panels.parentElement;
        if (!group) return false;
        const button = documentRef.createElement('button');
        button.id = TOPBAR_MORE_ID;
        button.type = 'button';
        button.className = 'topbar-btn';
        button.textContent = '⋯';
        button.title = 'Mostra o nascondi dettagli';
        button.setAttribute('aria-label', 'Mostra altri indicatori');
        button.setAttribute('aria-expanded', 'false');
        button.addEventListener('click', () => {
            const active = !documentRef.body.classList.contains('ux-topbar-expanded');
            documentRef.body.classList.toggle('ux-topbar-expanded', active);
            button.setAttribute('aria-expanded', String(active));
            button.setAttribute('aria-label', active ? 'Nascondi indicatori aggiuntivi' : 'Mostra altri indicatori');
        });
        group.appendChild(button);
        return true;
    }

    function ensureWorldStatus(documentRef) {
        let status = documentRef.getElementById(WORLD_STATUS_ID);
        if (status) return status;
        const composer = documentRef.getElementById('play-action-composer') || documentRef.querySelector('#game-screen .input-area');
        if (!composer) return null;
        status = documentRef.createElement('div');
        status.id = WORLD_STATUS_ID;
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.innerHTML = '<span class="ux-world-status-orb" aria-hidden="true"></span><span class="ux-world-status-message"></span>';
        if (composer.id === 'play-action-composer') composer.appendChild(status);
        else composer.prepend(status);
        return status;
    }

    function detectBusy(documentRef, state = getState()) {
        const send = documentRef.getElementById('btn-send');
        const advance = documentRef.getElementById('btn-advance-world');
        const analyze = documentRef.getElementById('btn-strategic-analyze');
        return Boolean(state?.isProcessing || send?.disabled || advance?.disabled || analyze?.disabled);
    }

    function refreshWorldStatus(documentRef) {
        const status = ensureWorldStatus(documentRef);
        if (!status) return;
        const state = getState();
        const busy = detectBusy(documentRef, state);
        status.classList.toggle('is-visible', busy);
        const message = status.querySelector('.ux-world-status-message');
        if (message && busy) message.textContent = statusMessageForMode(lastBusyMode, state);
    }

    function setupContextTriggers(documentRef) {
        if (documentRef.__playerV6ContextTriggers) return;
        documentRef.__playerV6ContextTriggers = true;
        documentRef.addEventListener('click', event => {
            const target = event.target?.closest?.('button, [role="button"]');
            if (!target) return;
            if (target.id === 'btn-advance-world' || target.id === 'btn-simulate-timeline') lastBusyMode = 'world';
            else if (target.id === 'btn-strategic-actions' || target.id === 'btn-strategic-analyze') lastBusyMode = 'analysis';
            else if (target.id === 'btn-management-hub' || target.closest?.('#modal-management-hub')) lastBusyMode = 'management';
            else if (/chat/i.test(target.id || '') || target.closest?.('[data-chat]')) lastBusyMode = 'chat';
        }, true);
        const composer = documentRef.getElementById('play-action-composer');
        composer?.addEventListener('submit', () => { lastBusyMode = 'action'; }, true);
    }

    function startBusyMonitor(documentRef, windowRef) {
        if (busyTimer) return;
        refreshWorldStatus(documentRef);
        busyTimer = windowRef.setInterval(() => {
            refreshWorldStatus(documentRef);
            refreshBottomNav(documentRef);
        }, 450);
    }

    function navButtons(documentRef) {
        const management = documentRef.getElementById('btn-management-hub');
        const continueButton = documentRef.getElementById('btn-advance-world');
        const candidates = Array.from(documentRef.querySelectorAll('#game-screen .bottom-command'));
        const analysis = documentRef.getElementById('btn-strategic-actions') || candidates.find(button => /analisi/i.test(button.textContent || ''));
        const chat = candidates.find(button => /chat/i.test(button.textContent || '')) || documentRef.getElementById('btn-world-chat');
        return { analysis, chat, management, continueButton };
    }

    function refreshBottomNav(documentRef) {
        const buttons = navButtons(documentRef);
        const overlays = {
            analysis: documentRef.getElementById('modal-strategic-actions'),
            management: documentRef.getElementById('modal-management-hub')
        };
        Object.values(buttons).filter(Boolean).forEach(button => button.classList.remove('ux-nav-active'));
        if (overlays.analysis?.classList.contains('active')) buttons.analysis?.classList.add('ux-nav-active');
        if (overlays.management?.classList.contains('active')) buttons.management?.classList.add('ux-nav-active');
        const state = getState();
        const pending = asArray(state?.worldMemory?.pendingTimelineEvents).length + asArray(state?.worldMemory?.pendingParallelDecisions).length;
        buttons.continueButton?.classList.toggle('ux-continue-ready', pending > 0 && !state?.isProcessing);
    }

    function createManagementTabs(documentRef) {
        const body = documentRef.getElementById('management-hub-body');
        if (!body) return null;
        let tabs = documentRef.getElementById(MANAGEMENT_TABS_ID);
        if (tabs) return tabs;
        tabs = documentRef.createElement('nav');
        tabs.id = MANAGEMENT_TABS_ID;
        tabs.setAttribute('aria-label', 'Sezioni del centro gestione');
        tabs.innerHTML = [
            ['overview', 'Panoramica'], ['business', 'Attività'], ['kingdom', 'Regno'], ['relations', 'Relazioni']
        ].map(([id, label]) => `<button type="button" data-ux-management-tab="${id}" aria-selected="${id === managementTab}">${label}</button>`).join('');
        tabs.addEventListener('click', event => {
            const button = event.target.closest?.('[data-ux-management-tab]');
            if (!button) return;
            managementTab = button.dataset.uxManagementTab || 'overview';
            applyManagementTab(documentRef, managementTab);
        });
        body.prepend(tabs);
        return tabs;
    }

    function applyManagementTab(documentRef, tab = managementTab) {
        const body = documentRef.getElementById('management-hub-body');
        if (!body) return false;
        const tabs = createManagementTabs(documentRef);
        tabs?.querySelectorAll('[data-ux-management-tab]').forEach(button => {
            button.setAttribute('aria-selected', String(button.dataset.uxManagementTab === tab));
        });

        body.querySelectorAll('.management-hub-card').forEach(card => {
            const section = managementSectionForCard(card);
            card.dataset.uxManagementSection = section;
            const visible = tab === 'overview' || section === tab;
            card.dataset.uxManagementHidden = String(!visible);
        });

        const grid = body.querySelector('.management-hub-grid');
        if (grid) {
            const visibleCards = Array.from(grid.querySelectorAll('.management-hub-card')).some(card => card.dataset.uxManagementHidden !== 'true');
            grid.dataset.uxManagementHidden = String(!visibleCards || tab === 'relations');
        }

        const intro = body.querySelector('.management-hub-intro');
        const alerts = body.querySelector('.management-hub-alerts');
        const footer = body.querySelector('.management-hub-footer');
        [intro, alerts, footer].filter(Boolean).forEach(node => {
            node.dataset.uxManagementHidden = String(tab !== 'overview');
        });

        const relationalIds = ['management-agents-panel', 'management-network-panel', 'systemic-world-panel'];
        relationalIds.forEach(id => {
            const panel = documentRef.getElementById(id);
            if (panel) panel.dataset.uxManagementHidden = String(tab !== 'relations');
        });
        return true;
    }

    function enhanceManagementHub(documentRef, windowRef) {
        const body = documentRef.getElementById('management-hub-body');
        if (!body) return false;
        createManagementTabs(documentRef);
        applyManagementTab(documentRef, managementTab);
        if (!hubObserver && typeof windowRef?.MutationObserver === 'function') {
            let scheduled = false;
            hubObserver = new windowRef.MutationObserver(mutations => {
                if (scheduled) return;
                const changed = mutations.some(mutation => mutation.addedNodes.length || mutation.removedNodes.length);
                if (!changed) return;
                scheduled = true;
                windowRef.setTimeout(() => {
                    scheduled = false;
                    if (!documentRef.getElementById(MANAGEMENT_TABS_ID)) createManagementTabs(documentRef);
                    applyManagementTab(documentRef, managementTab);
                }, 0);
            });
            hubObserver.observe(body, { childList: true });
        }
        return true;
    }

    function install(documentRef, windowRef) {
        if (!documentRef || !windowRef) return false;
        installStyles(documentRef);
        documentRef.body?.classList.add('ux-player-v6-ready');
        decorateRecentStory(documentRef, getState());
        observeStory(documentRef, windowRef);
        ensureTopbarMore(documentRef);
        setupContextTriggers(documentRef);
        ensureWorldStatus(documentRef);
        startBusyMonitor(documentRef, windowRef);
        enhanceManagementHub(documentRef, windowRef);
        refreshBottomNav(documentRef);
        root.__cronachePlayerExperienceV6Version = PATCH_VERSION;
        return true;
    }

    function scheduleInstall() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        const attempt = () => install(document, window);
        [0, 120, 350, 900, 1800, 3500, 5500].forEach(delay => window.setTimeout(attempt, delay));
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attempt, { once: true });
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        STYLE_ID,
        eventMatchesText,
        eventImportance,
        latestMatchingEvent,
        statusMessageForMode,
        managementSectionForCard,
        decorateStoryEntry,
        decorateRecentStory,
        applyManagementTab,
        install
    };
});
