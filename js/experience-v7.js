(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheExperience = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const STORAGE_KEY = 'cronache_ux_v7';
    const WIZARD_LABELS = ['Storia', 'Eroe', 'Destino'];
    const THINKING_MESSAGES = [
        'Il Master interpreta la tua scelta…',
        'Il mondo reagisce alle conseguenze…',
        'La cronaca viene aggiornata…'
    ];

    function clampStep(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(WIZARD_LABELS.length - 1, Math.trunc(number)));
    }

    function getWizardStep(state) {
        return clampStep(state && state.step);
    }

    function nextWizardStep(state, direction) {
        return {
            ...(state || {}),
            step: clampStep(getWizardStep(state) + (direction < 0 ? -1 : 1))
        };
    }

    function isNearBottom(metrics, threshold) {
        const limit = Number.isFinite(threshold) ? threshold : 120;
        return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= limit;
    }

    function safeLoad(storage) {
        try {
            return JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
        } catch (_error) {
            return {};
        }
    }

    function safeSave(storage, value) {
        try {
            storage.setItem(STORAGE_KEY, JSON.stringify(value));
        } catch (_error) {
            // The enhancement must never block the game when storage is unavailable.
        }
    }

    function createElement(documentRef, tag, className, text) {
        const element = documentRef.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function setupAccessibility(documentRef) {
        const skip = createElement(documentRef, 'a', 'ux-skip-link', 'Vai alla storia');
        skip.href = '#story-scroll';
        documentRef.body.prepend(skip);

        const labels = {
            'btn-exit': 'Esci dalla partita',
            'btn-save-quick': 'Salva la partita',
            'btn-dice': 'Apri il lancio dei dadi',
            'btn-inventory': 'Apri inventario',
            'btn-character': 'Apri scheda personaggio',
            'btn-memory': 'Apri cronaca e memoria del mondo',
            'btn-send': 'Invia azione al Master'
        };
        Object.entries(labels).forEach(([id, label]) => {
            const node = documentRef.getElementById(id);
            if (node) node.setAttribute('aria-label', label);
        });

        const story = documentRef.getElementById('story-scroll');
        if (story) {
            story.setAttribute('role', 'log');
            story.setAttribute('aria-live', 'polite');
            story.setAttribute('aria-relevant', 'additions');
            story.setAttribute('tabindex', '0');
        }

        documentRef.querySelectorAll('.modal-overlay').forEach((overlay) => {
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
        });
    }

    function setupHome(documentRef) {
        const subtitle = documentRef.querySelector('.home-subtitle');
        if (!subtitle || documentRef.querySelector('.ux-version-pill')) return;
        const pill = createElement(documentRef, 'div', 'ux-version-pill', 'Esperienza Game Director');
        subtitle.insertAdjacentElement('afterend', pill);
    }

    function setupFocusMode(documentRef, windowRef, settings) {
        const group = documentRef.querySelector('#game-screen .topbar-buttons:last-child');
        if (!group) return;
        const button = createElement(documentRef, 'button', 'topbar-btn ux-focus-toggle', '◉');
        button.type = 'button';
        button.title = 'Modalità concentrazione';
        button.setAttribute('aria-label', 'Attiva modalità concentrazione');

        function apply(active) {
            documentRef.body.classList.toggle('ux-focus-mode', active);
            button.setAttribute('aria-pressed', String(active));
            button.setAttribute(
                'aria-label',
                active ? 'Disattiva modalità concentrazione' : 'Attiva modalità concentrazione'
            );
            settings.focusMode = active;
            safeSave(windowRef.localStorage, settings);
        }

        button.addEventListener('click', () => apply(!documentRef.body.classList.contains('ux-focus-mode')));
        group.appendChild(button);
        apply(Boolean(settings.focusMode));
    }

    function setupThinkingState(documentRef, windowRef) {
        const inputArea = documentRef.querySelector('.input-area');
        const send = documentRef.getElementById('btn-send');
        if (!inputArea || !send) return;

        const status = createElement(documentRef, 'div', 'ux-thinking');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        const dots = createElement(documentRef, 'span', 'ux-thinking-dots');
        dots.setAttribute('aria-hidden', 'true');
        dots.innerHTML = '<i></i><i></i><i></i>';
        const message = createElement(documentRef, 'span', 'ux-thinking-message', THINKING_MESSAGES[0]);
        status.append(dots, message);
        inputArea.prepend(status);

        let timer = null;
        let index = 0;
        const update = () => {
            const active = send.disabled;
            status.classList.toggle('is-visible', active);
            if (active && !timer) {
                index = 0;
                message.textContent = THINKING_MESSAGES[index];
                timer = windowRef.setInterval(() => {
                    index = (index + 1) % THINKING_MESSAGES.length;
                    message.textContent = THINKING_MESSAGES[index];
                }, 2600);
            } else if (!active && timer) {
                windowRef.clearInterval(timer);
                timer = null;
            }
        };
        new windowRef.MutationObserver(update).observe(send, { attributes: true, attributeFilter: ['disabled'] });
        update();
    }

    function setupInput(documentRef) {
        const input = documentRef.getElementById('action-input');
        const row = input && input.closest('.input-row');
        if (!input || !row) return;
        input.placeholder = 'Descrivi cosa fai, dici o tenti…';
        input.setAttribute('aria-label', 'Azione del personaggio');

        const hint = createElement(documentRef, 'div', 'ux-input-hint');
        hint.innerHTML = '<span>Puoi scrivere liberamente: il mondo reagirà alla tua intenzione.</span><span><kbd>Invio</kbd> per agire</span>';
        row.insertAdjacentElement('beforebegin', hint);
    }

    function setupLatestButton(documentRef) {
        const container = documentRef.querySelector('.story-container');
        const scroll = documentRef.getElementById('story-scroll');
        if (!container || !scroll) return;
        const button = createElement(documentRef, 'button', 'ux-scroll-latest', '↓ Torna al presente');
        button.type = 'button';
        button.setAttribute('aria-label', 'Scorri fino all’ultimo evento');
        container.appendChild(button);

        const refresh = () => button.classList.toggle('is-visible', !isNearBottom(scroll, 140));
        scroll.addEventListener('scroll', refresh, { passive: true });
        button.addEventListener('click', () => scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' }));
        refresh();
    }

    function setupToasts(documentRef, windowRef) {
        const region = createElement(documentRef, 'div', 'ux-toast-region');
        region.setAttribute('aria-live', 'polite');
        region.setAttribute('aria-atomic', 'true');
        documentRef.body.appendChild(region);

        function toast(text) {
            const item = createElement(documentRef, 'div', 'ux-toast', text);
            region.appendChild(item);
            windowRef.setTimeout(() => item.remove(), 2600);
        }

        const messages = {
            'btn-save-quick': 'Partita salvata',
            'btn-save-settings': 'Impostazioni aggiornate',
            'btn-add-journal': 'Nota aggiunta al diario'
        };
        Object.entries(messages).forEach(([id, message]) => {
            const target = documentRef.getElementById(id);
            if (target) target.addEventListener('click', () => windowRef.setTimeout(() => toast(message), 80));
        });
        return toast;
    }

    function validateWizardStep(documentRef, step) {
        if (step === 0) {
            const story = documentRef.getElementById('new-game-story');
            return story && story.value ? '' : 'Scegli una storia prima di continuare.';
        }
        if (step === 1) {
            const name = documentRef.getElementById('new-game-name');
            return name && name.value.trim() ? '' : 'Dai un nome al tuo personaggio.';
        }
        const origin = documentRef.querySelector('#origin-grid .selected');
        const archetype = documentRef.querySelector('#archetype-grid .selected');
        if (!origin || !archetype) return 'Scegli origine e archetipo per iniziare.';
        return '';
    }

    function setupWizard(documentRef) {
        const modal = documentRef.querySelector('#modal-new-game .modal-body');
        const start = documentRef.getElementById('btn-start-game');
        if (!modal || !start || modal.querySelector('.ux-wizard-progress')) return;

        const groups = Array.from(modal.querySelectorAll(':scope > .form-group'));
        if (groups.length < 4) return;
        const panels = [
            [groups[0]],
            [groups[1]],
            groups.slice(2)
        ];
        panels.forEach((panelGroups, index) => {
            const panel = createElement(documentRef, 'div', 'ux-wizard-panel');
            panel.dataset.wizardPanel = String(index);
            panelGroups[0].before(panel);
            panelGroups.forEach((group) => panel.appendChild(group));
        });

        const progress = createElement(documentRef, 'div', 'ux-wizard-progress');
        WIZARD_LABELS.forEach((label, index) => {
            const item = createElement(documentRef, 'div', 'ux-wizard-step', `${index + 1}. ${label}`);
            item.dataset.wizardIndicator = String(index);
            progress.appendChild(item);
        });
        modal.prepend(progress);

        const actions = createElement(documentRef, 'div', 'ux-wizard-actions');
        const back = createElement(documentRef, 'button', 'btn secondary', '← Indietro');
        const next = createElement(documentRef, 'button', 'btn primary', 'Continua →');
        back.type = next.type = 'button';
        actions.append(back, next);
        start.before(actions);

        const error = createElement(documentRef, 'div', 'ux-wizard-error');
        error.hidden = true;
        actions.before(error);
        let state = { step: 0 };

        function render() {
            const step = getWizardStep(state);
            modal.querySelectorAll('[data-wizard-panel]').forEach((panel) => {
                panel.hidden = Number(panel.dataset.wizardPanel) !== step;
            });
            modal.querySelectorAll('[data-wizard-indicator]').forEach((indicator) => {
                const value = Number(indicator.dataset.wizardIndicator);
                indicator.classList.toggle('is-active', value === step);
                indicator.classList.toggle('is-complete', value < step);
            });
            back.hidden = step === 0;
            next.hidden = step === WIZARD_LABELS.length - 1;
            start.hidden = step !== WIZARD_LABELS.length - 1;
            error.hidden = true;
        }

        next.addEventListener('click', () => {
            const message = validateWizardStep(documentRef, getWizardStep(state));
            if (message) {
                error.textContent = message;
                error.hidden = false;
                return;
            }
            state = nextWizardStep(state, 1);
            render();
        });
        back.addEventListener('click', () => {
            state = nextWizardStep(state, -1);
            render();
        });

        const openButton = documentRef.getElementById('btn-new-game');
        if (openButton) openButton.addEventListener('click', () => {
            state = { step: 0 };
            window.setTimeout(render, 0);
        });
        render();
    }

    function setupModalKeyboard(documentRef) {
        documentRef.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            const open = Array.from(documentRef.querySelectorAll('.modal-overlay'))
                .reverse()
                .find((modal) => modal.classList.contains('active') || getComputedStyle(modal).display !== 'none');
            if (!open) return;
            const close = open.querySelector('[data-close]');
            if (close) close.click();
        });
    }

    function init(documentRef, windowRef) {
        if (!documentRef || !windowRef || documentRef.body.classList.contains('ux-v7-ready')) return;
        const settings = safeLoad(windowRef.localStorage);
        setupAccessibility(documentRef);
        setupHome(documentRef);
        setupFocusMode(documentRef, windowRef, settings);
        setupThinkingState(documentRef, windowRef);
        setupInput(documentRef);
        setupLatestButton(documentRef);
        setupToasts(documentRef, windowRef);
        setupWizard(documentRef);
        setupModalKeyboard(documentRef);
        documentRef.body.classList.add('ux-v7-ready');
    }

    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => init(document, window), { once: true });
        } else {
            init(document, window);
        }
    }

    return {
        STORAGE_KEY,
        WIZARD_LABELS,
        clampStep,
        getWizardStep,
        nextWizardStep,
        isNearBottom,
        validateWizardStep,
        init
    };
});
