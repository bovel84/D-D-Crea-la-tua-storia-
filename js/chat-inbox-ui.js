(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheChatInboxUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 2;
    const STYLE_ID = 'cronache-chat-inbox-ui-style';
    let observer = null;
    let scheduled = false;

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 160) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const keyOf = value => clean(value, 240).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function cssText() {
        return `
            /* Inbox chat: una conversazione in evidenza, contesto, partecipanti, discussione, archivio temporale. */
            #modal-world-chat.chat-inbox-ready .chat-layout {
                overflow: hidden !important;
            }
            #modal-world-chat.chat-inbox-ready .chat-flow-label {
                flex: 0 0 auto;
                margin: 2px 2px 5px;
                color: #7b5b20;
                font: 800 .62rem system-ui,sans-serif;
                letter-spacing: .09em;
                text-transform: uppercase;
            }
            #modal-world-chat.chat-inbox-ready .chat-flow-label[data-kind="discussion"] {
                margin-top: 5px;
            }
            #modal-world-chat.chat-inbox-ready .chat-thread-list {
                display: block !important;
                flex: 0 0 auto !important;
                max-height: 122px !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow-x: hidden !important;
                overflow-y: auto !important;
                scroll-snap-type: none !important;
                scrollbar-width: thin !important;
            }
            #modal-world-chat.chat-inbox-ready .chat-thread {
                position: relative !important;
                width: 100% !important;
                min-height: 54px !important;
                margin: 0 !important;
                padding: 8px 10px !important;
                box-sizing: border-box !important;
                scroll-snap-align: none !important;
            }
            #modal-world-chat.chat-inbox-ready .chat-thread[data-chat-role="latest"] {
                display: block !important;
                padding-top: 25px !important;
                border-color: rgba(113,58,145,.55) !important;
                background: linear-gradient(145deg, rgba(250,243,255,.98), rgba(235,217,247,.94)) !important;
                box-shadow: 0 5px 14px rgba(83,42,104,.12) !important;
            }
            #modal-world-chat.chat-inbox-ready .chat-thread[data-chat-role="latest"]::before,
            #modal-world-chat.chat-inbox-ready .chat-thread[data-chat-role="archived"]::before {
                position: absolute;
                top: 7px;
                left: 10px;
                display: inline-flex;
                align-items: center;
                min-height: 14px;
                font: 800 .54rem system-ui,sans-serif;
                letter-spacing: .07em;
                text-transform: uppercase;
            }
            #modal-world-chat.chat-inbox-ready .chat-thread[data-chat-role="latest"][data-chat-live="1"]::before {
                content: '● CHAT ATTIVA';
                color: #6f2c8d;
            }
            #modal-world-chat.chat-inbox-ready .chat-thread[data-chat-role="latest"][data-chat-live="0"]::before {
                content: '● ULTIMA CHAT';
                color: #8a6419;
            }
            #modal-world-chat.chat-inbox-ready .chat-thread[data-chat-role="archived"] {
                display: none !important;
                margin-top: 5px !important;
                padding-top: 23px !important;
                opacity: .82;
                background: rgba(255,255,255,.54) !important;
                border-style: dashed !important;
            }
            #modal-world-chat.chat-inbox-ready .chat-thread[data-chat-role="archived"]::before {
                content: 'ARCHIVIATA';
                color: #87715e;
            }
            #modal-world-chat.chat-inbox-ready .chat-thread-list.chat-archive-open {
                max-height: min(34dvh, 310px) !important;
            }
            #modal-world-chat.chat-inbox-ready .chat-thread-list.chat-archive-open .chat-thread[data-chat-role="archived"] {
                display: block !important;
            }
            #modal-world-chat.chat-inbox-ready .chat-thread[data-chat-when]:not([data-chat-when=""])::after {
                content: attr(data-chat-when);
                display: block;
                margin-top: 3px;
                color: #8b7767;
                font: 600 .57rem system-ui,sans-serif;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            #modal-world-chat.chat-inbox-ready .chat-selector-controls {
                flex: 0 0 auto;
                display: grid;
                grid-template-columns: minmax(0,1fr) auto;
                gap: 5px;
                margin: 5px 0 6px;
            }
            #modal-world-chat.chat-inbox-ready .chat-archive-toggle,
            #modal-world-chat.chat-inbox-ready .chat-actions-toggle {
                min-height: 31px;
                padding: 5px 9px;
                border: 1px solid rgba(103,72,48,.15);
                border-radius: 10px;
                background: rgba(255,255,255,.64);
                color: #654a38;
                font: 750 .62rem system-ui,sans-serif;
            }
            #modal-world-chat.chat-inbox-ready .chat-archive-toggle[hidden] {
                display: none !important;
            }
            #modal-world-chat.chat-inbox-ready .chat-tools {
                display: none !important;
                flex: 0 0 auto !important;
                margin: 0 0 6px !important;
            }
            #modal-world-chat.chat-inbox-ready.chat-inbox-actions-open .chat-tools {
                display: grid !important;
            }
            #modal-world-chat.chat-inbox-ready .chat-conversation-head {
                flex: 0 0 auto !important;
                margin-top: 0 !important;
            }
            #modal-world-chat.chat-inbox-ready .chat-messages {
                flex: 1 1 auto !important;
                min-height: 0 !important;
            }
            @media (max-width: 620px) {
                #modal-world-chat.chat-inbox-ready .chat-flow-label {
                    margin-bottom: 4px;
                    font-size: .58rem;
                }
                #modal-world-chat.chat-inbox-ready .chat-thread-list {
                    max-height: 108px !important;
                }
                #modal-world-chat.chat-inbox-ready .chat-thread-list.chat-archive-open {
                    max-height: min(31dvh, 270px) !important;
                }
                #modal-world-chat.chat-inbox-ready .chat-thread[data-chat-role="latest"] {
                    min-height: 50px !important;
                    padding: 23px 8px 6px !important;
                }
                #modal-world-chat.chat-inbox-ready .chat-thread[data-chat-role="archived"] {
                    padding: 22px 8px 6px !important;
                }
                #modal-world-chat.chat-inbox-ready .chat-thread[data-chat-role="latest"]::before,
                #modal-world-chat.chat-inbox-ready .chat-thread[data-chat-role="archived"]::before {
                    left: 8px;
                    top: 6px;
                }
                #modal-world-chat.chat-inbox-ready .chat-selector-controls {
                    margin: 4px 0 5px;
                }
                #modal-world-chat.chat-inbox-ready .chat-archive-toggle,
                #modal-world-chat.chat-inbox-ready .chat-actions-toggle {
                    min-height: 29px;
                    padding: 4px 8px;
                    font-size: .59rem;
                }
            }
        `;
    }

    function installStyles(documentRef) {
        let style = documentRef.getElementById(STYLE_ID);
        if (!style) {
            style = documentRef.createElement('style');
            style.id = STYLE_ID;
            documentRef.head.appendChild(style);
        }
        const next = cssText();
        if (style.textContent !== next) style.textContent = next;
    }

    function recencyOf(thread) {
        const messageTurn = asArray(thread?.messages).reduce((max, item) => Math.max(max, Number(item?.turn) || 0), 0);
        return Math.max(
            Number(thread?.updatedAtTurn) || 0,
            Number(thread?.createdAtTurn) || 0,
            Number(thread?.resolution?.updatedAtTurn) || 0,
            messageTurn
        );
    }

    function latestThread(threads) {
        const ordered = asArray(threads).filter(Boolean).slice().sort((a, b) => recencyOf(b) - recencyOf(a));
        return ordered.find(thread => clean(thread?.status, 30).toLowerCase() !== 'closed') || ordered[0] || null;
    }

    function cardThreadId(card) {
        return clean(
            card?.dataset?.threadId || card?.dataset?.chatId || card?.dataset?.id ||
            card?.getAttribute?.('data-thread-id') || card?.getAttribute?.('data-chat-id') || '',
            180
        );
    }

    function cardTitle(card) {
        return clean(card?.querySelector?.('strong')?.textContent || card?.textContent || '', 180);
    }

    function matchThread(card, threads) {
        const id = keyOf(cardThreadId(card));
        const title = keyOf(cardTitle(card));
        if (id) {
            const byId = asArray(threads).find(thread => keyOf(thread?.id) === id);
            if (byId) return byId;
        }
        if (!title) return null;
        return asArray(threads).find(thread => {
            const candidates = [thread?.title, thread?.eventTitle, thread?.agenda].map(keyOf).filter(Boolean);
            return candidates.some(candidate => candidate === title || candidate.includes(title) || title.includes(candidate));
        }) || null;
    }

    function timeLabel(thread) {
        const occurredAt = clean(thread?.occurredAt, 54);
        if (occurredAt) return occurredAt;
        const turn = recencyOf(thread);
        return turn > 0 ? `Turno ${turn}` : '';
    }

    function ensureFlowLabel(documentRef, target, kind, text) {
        if (!target?.parentNode) return null;
        let label = target.parentNode.querySelector(`.chat-flow-label[data-kind="${kind}"]`);
        if (!label) {
            label = documentRef.createElement('div');
            label.className = 'chat-flow-label';
            label.dataset.kind = kind;
            label.textContent = text;
        }
        if (label.nextSibling !== target) target.parentNode.insertBefore(label, target);
        return label;
    }

    function ensureControls(documentRef, list) {
        if (!list?.parentNode) return null;
        let controls = list.parentNode.querySelector('.chat-selector-controls');
        if (!controls) {
            controls = documentRef.createElement('div');
            controls.className = 'chat-selector-controls';

            const archive = documentRef.createElement('button');
            archive.type = 'button';
            archive.className = 'chat-archive-toggle';
            archive.setAttribute('aria-expanded', 'false');
            archive.addEventListener('click', () => {
                const open = !list.classList.contains('chat-archive-open');
                list.classList.toggle('chat-archive-open', open);
                archive.setAttribute('aria-expanded', open ? 'true' : 'false');
                updateControlText(controls, list);
            });

            const actions = documentRef.createElement('button');
            actions.type = 'button';
            actions.className = 'chat-actions-toggle';
            actions.textContent = '⚙ Azioni';
            actions.setAttribute('aria-expanded', 'false');
            actions.addEventListener('click', () => {
                const modal = documentRef.getElementById('modal-world-chat');
                const open = !modal?.classList.contains('chat-inbox-actions-open');
                modal?.classList.toggle('chat-inbox-actions-open', open);
                actions.setAttribute('aria-expanded', open ? 'true' : 'false');
                const nextText = open ? '✕ Azioni' : '⚙ Azioni';
                if (actions.textContent !== nextText) actions.textContent = nextText;
            });

            controls.append(archive, actions);
        }
        if (list.nextSibling !== controls) list.parentNode.insertBefore(controls, list.nextSibling);
        return controls;
    }

    function updateControlText(controls, list) {
        if (!controls || !list) return;
        const archive = controls.querySelector('.chat-archive-toggle');
        const count = list.querySelectorAll('.chat-thread[data-chat-role="archived"]').length;
        if (!archive) return;
        archive.hidden = count === 0;
        const open = list.classList.contains('chat-archive-open');
        const nextText = count === 0 ? 'Nessun archivio' : (open ? `▴ Nascondi archivio (${count})` : `▾ Archivio precedente (${count})`);
        if (archive.textContent !== nextText) archive.textContent = nextText;
        archive.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function moveToolsAfterControls(modal, controls) {
        const tools = modal?.querySelector('.chat-tools');
        if (!tools || !controls?.parentNode) return;
        if (controls.nextSibling !== tools) controls.parentNode.insertBefore(tools, controls.nextSibling);
    }

    function organize(documentRef) {
        const modal = documentRef?.getElementById('modal-world-chat');
        const list = modal?.querySelector('.chat-thread-list');
        const conversationHead = modal?.querySelector('.chat-conversation-head');
        const messages = modal?.querySelector('.chat-messages');
        if (!modal || !list) return false;

        const cards = Array.from(list.querySelectorAll('.chat-thread'));
        if (!cards.length) return false;

        const threads = asArray(getState()?.worldMemory?.chats);
        const newest = latestThread(threads);
        const infos = cards.map((card, index) => ({ card, index, thread: matchThread(card, threads) }));
        let newestInfo = newest ? infos.find(info => info.thread && keyOf(info.thread.id) === keyOf(newest.id)) : null;
        if (!newestInfo && newest) {
            const wantedTitle = keyOf(newest.title || newest.eventTitle || newest.agenda);
            newestInfo = infos.find(info => wantedTitle && keyOf(cardTitle(info.card)).includes(wantedTitle));
        }
        if (!newestInfo) newestInfo = infos.find(info => info.card.classList.contains('active')) || infos[0];

        infos.forEach(info => {
            const isLatest = info === newestInfo;
            info.card.dataset.chatRole = isLatest ? 'latest' : 'archived';
            const live = clean(info.thread?.status, 30).toLowerCase() !== 'closed';
            info.card.dataset.chatLive = isLatest && live ? '1' : '0';
            const when = timeLabel(info.thread);
            if (when) info.card.dataset.chatWhen = when;
            else delete info.card.dataset.chatWhen;
        });

        const archived = infos.filter(info => info !== newestInfo).sort((a, b) => {
            const delta = recencyOf(b.thread) - recencyOf(a.thread);
            return delta || a.index - b.index;
        });
        const desiredOrder = [newestInfo, ...archived].filter(Boolean).map(info => info.card);
        const currentOrder = Array.from(list.querySelectorAll('.chat-thread'));
        const orderChanged = desiredOrder.length === currentOrder.length && desiredOrder.some((card, index) => currentOrder[index] !== card);
        if (orderChanged) desiredOrder.forEach(card => list.appendChild(card));

        ensureFlowLabel(documentRef, list, 'available', 'Chat disponibile');
        const controls = ensureControls(documentRef, list);
        updateControlText(controls, list);
        moveToolsAfterControls(modal, controls);
        if (conversationHead) ensureFlowLabel(documentRef, conversationHead, 'context', 'Contesto e partecipanti');
        if (messages) ensureFlowLabel(documentRef, messages, 'discussion', 'Discussione');

        modal.classList.add('chat-inbox-ready');
        return true;
    }

    function scheduleOrganize(documentRef, windowRef) {
        if (scheduled) return;
        scheduled = true;
        const run = () => {
            scheduled = false;
            organize(documentRef);
        };
        if (typeof windowRef?.requestAnimationFrame === 'function') windowRef.requestAnimationFrame(run);
        else setTimeout(run, 0);
    }

    function observe(documentRef, windowRef) {
        const modal = documentRef?.getElementById('modal-world-chat');
        if (!modal || observer || typeof windowRef?.MutationObserver !== 'function') return;
        observer = new windowRef.MutationObserver(mutations => {
            if (mutations.some(mutation => mutation.type === 'childList')) scheduleOrganize(documentRef, windowRef);
        });
        observer.observe(modal, { childList: true, subtree: true });
    }

    function install(documentRef, windowRef) {
        if (!documentRef) return false;
        installStyles(documentRef);
        organize(documentRef);
        observe(documentRef, windowRef || root);
        documentRef.body?.classList.add('chat-inbox-ui-ready');
        root.__cronacheChatInboxUiVersion = PATCH_VERSION;
        return true;
    }

    if (typeof document !== 'undefined') {
        const boot = () => install(document, root);
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
        else boot();
    }

    return {
        version: PATCH_VERSION,
        cssText,
        recencyOf,
        latestThread,
        timeLabel,
        organize,
        install
    };
});
