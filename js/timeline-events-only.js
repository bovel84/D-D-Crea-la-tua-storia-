(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheTimelineEventsOnly = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-timeline-events-only-style';
    let refreshing = false;

    function installStyles(documentRef) {
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
        const style = documentRef.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            /* La Timeline è un registro di EVENTI: le azioni restano nella coda causale ma non sono mostrate. */
            #modal-timeline #timeline-agenda-parallel,
            #modal-timeline .timeline-agenda-add,
            #modal-timeline .ux-action-hidden {
                display: none !important;
            }

            #modal-timeline #timeline-agenda {
                gap: 14px !important;
            }

            #modal-timeline #timeline-agenda-sequential {
                --ux-timeline-color: #e67e22;
            }

            #modal-timeline .ux-event-empty {
                margin: 0;
                padding: 11px 12px;
                border: 1px dashed rgba(92,64,48,.20);
                border-radius: 11px;
                color: var(--ink-light);
                background: rgba(255,255,255,.34);
                font-size: .78rem;
                line-height: 1.3;
            }

            #modal-timeline .timeline-agenda-item.ux-dialogue-event {
                --ux-item-color: #7c3aed;
            }

            /* “Continua” rimane subito sotto la data e resta visibile durante lo scroll. */
            #modal-timeline .timeline-advance-box.ux-timeline-advance-sticky {
                position: sticky;
                top: 58px;
                z-index: 5;
                margin: 0 0 14px;
                padding: 7px 0 9px;
                background: linear-gradient(180deg, rgba(244,228,188,.99) 0%, rgba(244,228,188,.95) 74%, rgba(244,228,188,0) 100%);
            }

            #modal-timeline .timeline-advance-box.ux-timeline-advance-sticky .timeline-simulate {
                width: 100%;
                min-height: 50px;
                margin: 0;
                border-radius: 14px;
                box-shadow: 0 8px 18px rgba(98,31,176,.20);
                font-size: .98rem;
                letter-spacing: .02em;
            }

            #modal-timeline .timeline-advance-box.ux-timeline-advance-sticky .timeline-simulate:disabled {
                opacity: .78;
            }

            @media (max-width: 700px) {
                #modal-timeline .timeline-current {
                    margin-bottom: 8px !important;
                }

                #modal-timeline .timeline-advance-box.ux-timeline-advance-sticky {
                    top: 54px;
                    margin-bottom: 12px;
                    padding: 6px 0 8px;
                }

                #modal-timeline .timeline-advance-box.ux-timeline-advance-sticky .timeline-simulate {
                    min-height: 48px;
                    border-radius: 13px;
                    font-size: .92rem;
                }
            }
        `;
        documentRef.head.appendChild(style);
    }

    function typeLabel(item) {
        return String(item?.querySelector('.agenda-meta .agenda-type')?.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function isActionItem(item) {
        if (!item) return false;
        const label = typeLabel(item);
        const source = String(item.dataset.source || '').toLowerCase();

        // Questi sono già eventi/conseguenze: non nasconderli anche se derivano da una scelta del giocatore.
        if (label === 'dialogo' || label === 'iniziativa mondo') return false;

        // Piano del giocatore: non deve comparire nella Timeline.
        if (label === 'strategica' || label === 'azione' || label === 'conversazione' || label === 'parallela') return true;
        return /strategic-advisor|player-action|manual-parallel|manual-action|player-choice/.test(source);
    }

    function mergeEventsIntoSingleLane(documentRef) {
        const parallel = documentRef.getElementById('timeline-agenda-parallel');
        const sequential = documentRef.getElementById('timeline-agenda-sequential');
        if (!sequential) return [];

        const parallelItems = parallel
            ? Array.from(parallel.querySelectorAll(':scope > .timeline-agenda-item'))
            : [];

        parallelItems.forEach(item => {
            if (isActionItem(item)) {
                item.classList.add('ux-action-hidden');
                item.setAttribute('aria-hidden', 'true');
                return;
            }
            item.classList.remove('parallel', 'ux-action-hidden');
            item.classList.add('sequential', 'ux-event-only');
            item.removeAttribute('aria-hidden');
            sequential.appendChild(item);
        });

        Array.from(sequential.querySelectorAll(':scope > .timeline-agenda-item')).forEach(item => {
            const action = isActionItem(item);
            item.classList.toggle('ux-action-hidden', action);
            if (action) {
                item.setAttribute('aria-hidden', 'true');
                return;
            }
            item.removeAttribute('aria-hidden');
            item.classList.add('ux-event-only');
            item.classList.toggle('ux-dialogue-event', typeLabel(item) === 'dialogo');
        });

        if (parallel) parallel.setAttribute('aria-hidden', 'true');
        return Array.from(sequential.querySelectorAll(':scope > .timeline-agenda-item:not(.ux-action-hidden)'));
    }

    function updateEventSection(documentRef, items) {
        const section = documentRef.getElementById('timeline-agenda-sequential');
        if (!section) return 0;
        const heading = section.querySelector(':scope > h4');

        if (heading) {
            let title = heading.querySelector('.ux-event-heading-title');
            let count = heading.querySelector('.ux-agenda-count');
            if (!title || !count) {
                heading.textContent = '';
                title = documentRef.createElement('span');
                title.className = 'ux-event-heading-title';
                title.textContent = '🎭 Eventi in corso';
                count = documentRef.createElement('span');
                count.className = 'ux-agenda-count';
                count.setAttribute('aria-label', 'Eventi visibili in questa sezione');
                heading.append(title, count);
            }
            const nextCount = String(items.length);
            if (count.textContent !== nextCount) count.textContent = nextCount;
        }

        items.forEach((item, index) => {
            item.dataset.uxOrder = String(index + 1).padStart(2, '0');
            item.setAttribute('aria-posinset', String(index + 1));
            item.setAttribute('aria-setsize', String(items.length));
        });

        section.classList.toggle('ux-agenda-empty', items.length === 0);
        const nativeEmpty = section.querySelector(':scope > .timeline-empty');
        if (nativeEmpty) nativeEmpty.style.display = 'none';

        let empty = section.querySelector(':scope > .ux-event-empty');
        if (!items.length) {
            if (!empty) {
                empty = documentRef.createElement('div');
                empty.className = 'ux-event-empty';
                section.appendChild(empty);
            }
            empty.textContent = 'Nessun evento in attesa. Premi “Continua la storia” per far avanzare il mondo.';
        } else if (empty) {
            empty.remove();
        }
        return items.length;
    }

    function updateSummary(documentRef, eventCount) {
        const current = documentRef.querySelector('#modal-timeline .timeline-current');
        if (!current) return;
        const help = current.querySelector('small');
        if (help) {
            help.textContent = 'Qui vedi solo gli eventi e le conseguenze del mondo; le tue azioni vengono elaborate dietro le quinte.';
        }
        let overview = current.querySelector('.ux-timeline-overview');
        if (!overview) {
            overview = documentRef.createElement('div');
            overview.className = 'ux-timeline-overview';
            current.appendChild(overview);
        }
        const markup = `<span>🎭 ${eventCount} event${eventCount === 1 ? 'o' : 'i'} in attesa</span>`;
        if (overview.innerHTML !== markup) overview.innerHTML = markup;
    }

    function prepareAdvanceControl(documentRef, windowRef) {
        const body = documentRef.querySelector('#modal-timeline .modal-body');
        const current = body?.querySelector('.timeline-current');
        const box = body?.querySelector('.timeline-advance-box');
        const button = documentRef.getElementById('btn-simulate-timeline');
        if (!body || !current || !box || !button) return;

        if (box.previousElementSibling !== current) current.insertAdjacentElement('afterend', box);
        box.classList.add('ux-timeline-advance-sticky');

        const syncLabel = () => {
            const next = button.disabled ? '⌛ Il mondo reagisce…' : '▶ Continua la storia';
            if (button.textContent !== next) button.textContent = next;
            button.setAttribute(
                'aria-label',
                button.disabled ? 'Il mondo sta elaborando il prossimo evento' : 'Continua la storia e genera il prossimo evento'
            );
        };
        syncLabel();

        if (!button.__cronacheEventsOnlyLabelObserver) {
            const observer = new windowRef.MutationObserver(syncLabel);
            observer.observe(button, {
                attributes: true,
                attributeFilter: ['disabled'],
                childList: true,
                characterData: true,
                subtree: true
            });
            button.__cronacheEventsOnlyLabelObserver = observer;
        }
    }

    function refresh(documentRef, windowRef) {
        if (!documentRef || refreshing) return false;
        const agenda = documentRef.getElementById('timeline-agenda');
        if (!agenda) return false;
        refreshing = true;
        try {
            const items = mergeEventsIntoSingleLane(documentRef);
            const eventCount = updateEventSection(documentRef, items);
            updateSummary(documentRef, eventCount);
            prepareAdvanceControl(documentRef, windowRef);
            return true;
        } finally {
            refreshing = false;
        }
    }

    function install(documentRef, windowRef) {
        if (!documentRef || !windowRef) return false;
        installStyles(documentRef);
        const agenda = documentRef.getElementById('timeline-agenda');
        if (!agenda) return false;

        refresh(documentRef, windowRef);
        if (!agenda.__cronacheEventsOnlyObserver) {
            const observer = new windowRef.MutationObserver(() => refresh(documentRef, windowRef));
            observer.observe(agenda, { childList: true, subtree: true });
            agenda.__cronacheEventsOnlyObserver = observer;
        }
        documentRef.body.classList.add('timeline-events-only');
        root.__cronacheTimelineEventsOnlyVersion = PATCH_VERSION;
        return true;
    }

    function scheduleInstall() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        const attempt = () => install(document, window);
        if (attempt()) return;
        [0, 80, 250, 700, 1500, 3000].forEach(delay => window.setTimeout(attempt, delay));
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', attempt, { once: true });
        }
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        STYLE_ID,
        isActionItem,
        refresh,
        install
    };
});
