(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheTimelineUX = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-timeline-ux-style';
    const ROOT_ID = 'timeline-agenda';

    function installStyles(documentRef) {
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
        const style = documentRef.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            /* Timeline del mondo — gerarchia visiva, ordine e leggibilità mobile. */
            #modal-timeline .modal {
                width: min(760px, calc(100vw - 28px));
            }

            #modal-timeline .modal-body {
                padding: 16px 18px 24px;
                overscroll-behavior: contain;
            }

            #modal-timeline .timeline-current {
                display: grid;
                gap: 5px;
                margin: 0 0 16px;
                padding: 13px 15px;
                border: 1px solid rgba(139, 105, 20, .30);
                border-radius: 14px;
                background: linear-gradient(135deg, rgba(255,255,255,.54), rgba(212,196,160,.30));
                box-shadow: none;
            }

            #modal-timeline .timeline-current strong {
                display: block;
                margin: 0;
                color: var(--ink);
                font-family: 'Cinzel', serif;
                font-size: clamp(1rem, 3.7vw, 1.12rem);
                line-height: 1.25;
                letter-spacing: .01em;
                text-transform: none;
            }

            #modal-timeline .timeline-current small {
                display: block;
                margin: 0;
                color: var(--ink-light);
                font-size: .78rem;
                line-height: 1.35;
            }

            #modal-timeline .ux-timeline-overview {
                display: flex;
                flex-wrap: wrap;
                gap: 7px;
                margin-top: 4px;
            }

            #modal-timeline .ux-timeline-overview span {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 3px 8px;
                border: 1px solid rgba(92,64,48,.12);
                border-radius: 999px;
                color: var(--ink-light);
                background: rgba(255,255,255,.52);
                font: 700 .68rem 'Cinzel', serif;
                letter-spacing: .02em;
            }

            #modal-timeline #timeline-agenda {
                display: grid;
                gap: 18px;
                margin: 0;
            }

            #modal-timeline .timeline-agenda-section {
                --ux-timeline-color: #8b6914;
                position: relative;
                display: grid;
                gap: 9px;
                padding-left: 38px;
            }

            #modal-timeline #timeline-agenda-parallel {
                --ux-timeline-color: #7c3aed;
            }

            #modal-timeline #timeline-agenda-sequential {
                --ux-timeline-color: #e67e22;
            }

            #modal-timeline .timeline-agenda-section:not(.ux-agenda-empty)::before {
                content: '';
                position: absolute;
                left: 13px;
                top: 38px;
                bottom: 14px;
                width: 2px;
                border-radius: 999px;
                background: linear-gradient(180deg, var(--ux-timeline-color), color-mix(in srgb, var(--ux-timeline-color) 18%, transparent));
                opacity: .42;
            }

            #modal-timeline .timeline-agenda-section h4 {
                min-height: 30px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin: 0;
                padding: 0 1px 2px;
                color: var(--ink);
                font-family: 'Cinzel', serif;
                font-size: .84rem;
                line-height: 1.2;
                letter-spacing: .025em;
            }

            #modal-timeline .ux-agenda-count {
                min-width: 25px;
                height: 25px;
                display: inline-grid;
                place-items: center;
                flex: 0 0 auto;
                padding: 0 7px;
                border: 1px solid color-mix(in srgb, var(--ux-timeline-color) 30%, transparent);
                border-radius: 999px;
                color: var(--ux-timeline-color);
                background: color-mix(in srgb, var(--ux-timeline-color) 9%, white);
                font: 800 .68rem system-ui, sans-serif;
            }

            #modal-timeline .timeline-agenda-item {
                --ux-item-color: var(--ux-timeline-color);
                position: relative;
                display: grid;
                grid-template-columns: 29px minmax(0, 1fr) 30px;
                gap: 9px;
                align-items: start;
                min-width: 0;
                padding: 11px 10px 11px 11px;
                border: 1px solid rgba(92,64,48,.14) !important;
                border-left: 3px solid var(--ux-item-color) !important;
                border-radius: 13px;
                background: rgba(255, 252, 244, .91);
                box-shadow: 0 4px 12px rgba(44,24,16,.07);
            }

            #modal-timeline .timeline-agenda-item.parallel { --ux-item-color: #7c3aed; }
            #modal-timeline .timeline-agenda-item.sequential { --ux-item-color: #e67e22; }
            #modal-timeline .timeline-agenda-item.world { --ux-item-color: #2d7a4b; }

            #modal-timeline .timeline-agenda-item::before {
                content: attr(data-ux-order);
                position: absolute;
                left: -38px;
                top: 10px;
                z-index: 2;
                width: 28px;
                height: 28px;
                display: grid;
                place-items: center;
                border: 2px solid var(--ux-item-color);
                border-radius: 50%;
                color: var(--ux-item-color);
                background: #fff9e9;
                box-shadow: 0 0 0 4px rgba(244,228,188,.94);
                font: 800 .62rem system-ui, sans-serif;
                letter-spacing: -.01em;
            }

            #modal-timeline .timeline-agenda-item.ux-agenda-active {
                border-color: color-mix(in srgb, var(--ux-item-color) 38%, rgba(92,64,48,.14)) !important;
                border-left-color: var(--ux-item-color) !important;
                background: linear-gradient(135deg, color-mix(in srgb, var(--ux-item-color) 8%, white), rgba(255,252,244,.96));
                box-shadow: 0 7px 18px color-mix(in srgb, var(--ux-item-color) 13%, transparent);
            }

            #modal-timeline .timeline-agenda-item .agenda-icon {
                width: 29px;
                height: 29px;
                display: grid;
                place-items: center;
                margin: 0;
                border: 1px solid color-mix(in srgb, var(--ux-item-color) 26%, transparent);
                border-radius: 9px;
                color: var(--ux-item-color);
                background: color-mix(in srgb, var(--ux-item-color) 7%, white);
                font-size: 1.02rem;
                line-height: 1;
                text-align: center;
            }

            #modal-timeline .timeline-agenda-item > div:nth-child(2) {
                min-width: 0;
            }

            #modal-timeline .timeline-agenda-item .agenda-meta {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 5px;
                margin: 0 0 4px;
                font-size: .68rem;
                line-height: 1.1;
            }

            #modal-timeline .timeline-agenda-item .agenda-type {
                padding: 3px 7px;
                border-radius: 999px;
                font-size: .67rem;
                line-height: 1.1;
            }

            #modal-timeline .timeline-agenda-item.ux-agenda-active .agenda-meta .agenda-type + .agenda-type {
                color: #fff;
                background: var(--ux-item-color);
                box-shadow: 0 2px 6px color-mix(in srgb, var(--ux-item-color) 22%, transparent);
            }

            #modal-timeline .timeline-agenda-item h5 {
                margin: 0 0 3px;
                padding: 0;
                color: var(--ink);
                font-family: 'Cinzel', serif;
                font-size: .92rem;
                line-height: 1.2;
                letter-spacing: .005em;
                overflow-wrap: anywhere;
            }

            #modal-timeline .timeline-agenda-item p {
                margin: 0;
                color: var(--ink-light);
                font-size: .80rem;
                line-height: 1.32;
                overflow-wrap: anywhere;
            }

            #modal-timeline .timeline-agenda-item .btn-remove {
                width: 30px;
                height: 30px;
                display: grid;
                place-items: center;
                align-self: start;
                margin: 0;
                padding: 0;
                border: 1px solid rgba(192,38,211,.16);
                border-radius: 50%;
                color: #a91db8;
                background: rgba(192,38,211,.07);
                font-size: .76rem;
                line-height: 1;
                opacity: .78;
            }

            #modal-timeline .timeline-agenda-item .btn-remove:hover,
            #modal-timeline .timeline-agenda-item .btn-remove:focus-visible {
                opacity: 1;
                background: rgba(192,38,211,.14);
            }

            #modal-timeline .timeline-empty {
                margin: 0;
                padding: 10px 12px;
                border: 1px dashed rgba(92,64,48,.20);
                border-radius: 11px;
                color: var(--ink-light);
                background: rgba(255,255,255,.34);
                font-size: .78rem;
                line-height: 1.3;
            }

            @media (max-width: 700px) {
                #modal-timeline.modal-overlay {
                    align-items: flex-end;
                }

                #modal-timeline .modal {
                    width: 100%;
                    max-height: calc(100dvh - 8px);
                    margin: 0;
                    border-radius: 20px 20px 0 0;
                }

                #modal-timeline .modal-header {
                    position: sticky;
                    top: 0;
                    z-index: 5;
                    padding: 14px 16px;
                }

                #modal-timeline .modal-body {
                    padding: 13px 13px calc(24px + env(safe-area-inset-bottom, 0px));
                }

                #modal-timeline .timeline-current {
                    margin-bottom: 14px;
                    padding: 11px 12px;
                    border-radius: 12px;
                }

                #modal-timeline .timeline-current strong {
                    font-size: .98rem;
                }

                #modal-timeline .timeline-current small {
                    font-size: .72rem;
                }

                #modal-timeline #timeline-agenda {
                    gap: 16px;
                }

                #modal-timeline .timeline-agenda-section {
                    gap: 8px;
                    padding-left: 31px;
                }

                #modal-timeline .timeline-agenda-section:not(.ux-agenda-empty)::before {
                    left: 10px;
                    top: 36px;
                }

                #modal-timeline .timeline-agenda-item {
                    grid-template-columns: 25px minmax(0, 1fr) 28px;
                    gap: 7px;
                    padding: 10px 8px 10px 9px;
                    border-radius: 12px;
                }

                #modal-timeline .timeline-agenda-item::before {
                    left: -31px;
                    top: 10px;
                    width: 22px;
                    height: 22px;
                    border-width: 2px;
                    box-shadow: 0 0 0 3px rgba(244,228,188,.94);
                    font-size: .56rem;
                }

                #modal-timeline .timeline-agenda-item .agenda-icon {
                    width: 25px;
                    height: 25px;
                    border-radius: 8px;
                    font-size: .88rem;
                }

                #modal-timeline .timeline-agenda-item h5 {
                    font-size: .86rem;
                    line-height: 1.2;
                }

                #modal-timeline .timeline-agenda-item p {
                    font-size: .76rem;
                    line-height: 1.3;
                }

                #modal-timeline .timeline-agenda-item .btn-remove {
                    width: 28px;
                    height: 28px;
                    font-size: .72rem;
                }

                #modal-timeline .timeline-agenda-item .agenda-meta {
                    gap: 4px;
                    margin-bottom: 3px;
                }

                #modal-timeline .timeline-agenda-item .agenda-type {
                    padding: 2px 6px;
                    font-size: .62rem;
                }
            }
        `;
        documentRef.head.appendChild(style);
    }

    function ensureOverview(documentRef) {
        const current = documentRef.querySelector('#modal-timeline .timeline-current');
        if (!current) return null;
        let overview = current.querySelector('.ux-timeline-overview');
        if (!overview) {
            overview = documentRef.createElement('div');
            overview.className = 'ux-timeline-overview';
            current.appendChild(overview);
        }
        return overview;
    }

    function enhanceSection(documentRef, id) {
        const section = documentRef.getElementById(id);
        if (!section) return 0;
        const items = Array.from(section.querySelectorAll(':scope > .timeline-agenda-item'));
        const heading = section.querySelector(':scope > h4');

        if (heading) {
            let count = heading.querySelector('.ux-agenda-count');
            if (!count) {
                count = documentRef.createElement('span');
                count.className = 'ux-agenda-count';
                count.setAttribute('aria-label', 'Elementi in questa sezione');
                heading.appendChild(count);
            }
            const nextCount = String(items.length);
            if (count.textContent !== nextCount) count.textContent = nextCount;
        }

        section.classList.toggle('ux-agenda-empty', items.length === 0);
        items.forEach((item, index) => {
            item.dataset.uxOrder = String(index + 1).padStart(2, '0');
            item.setAttribute('aria-posinset', String(index + 1));
            item.setAttribute('aria-setsize', String(items.length));
            const meta = item.querySelector('.agenda-meta');
            const active = Boolean(meta && /\bIN CORSO\b/i.test(meta.textContent || ''));
            item.classList.toggle('ux-agenda-active', active);
        });
        return items.length;
    }

    function refreshAgenda(documentRef) {
        if (!documentRef) return false;
        const agenda = documentRef.getElementById(ROOT_ID);
        if (!agenda) return false;

        const parallel = enhanceSection(documentRef, 'timeline-agenda-parallel');
        const sequential = enhanceSection(documentRef, 'timeline-agenda-sequential');
        const overview = ensureOverview(documentRef);
        if (overview) {
            const markup = `<span>⚡ ${parallel} decision${parallel === 1 ? 'e' : 'i'}</span>` +
                `<span>🎭 ${sequential} event${sequential === 1 ? 'o' : 'i'}</span>`;
            if (overview.innerHTML !== markup) overview.innerHTML = markup;
        }
        return true;
    }

    function install(documentRef, windowRef) {
        if (!documentRef || !windowRef) return false;
        installStyles(documentRef);
        const agenda = documentRef.getElementById(ROOT_ID);
        if (!agenda) return false;

        refreshAgenda(documentRef);
        if (!agenda.__cronacheTimelineUxObserver) {
            const observer = new windowRef.MutationObserver(() => refreshAgenda(documentRef));
            observer.observe(agenda, { childList: true, subtree: true });
            agenda.__cronacheTimelineUxObserver = observer;
        }
        documentRef.body.classList.add('timeline-ux-ready');
        root.__cronacheTimelineUxVersion = PATCH_VERSION;
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
        enhanceSection,
        refreshAgenda,
        install
    };
});
