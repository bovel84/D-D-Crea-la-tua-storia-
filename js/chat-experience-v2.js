(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheChatExperienceV2 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 2;
    const STYLE_ID = 'cronache-chat-experience-v2-style';

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 240) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const keyOf = value => clean(value, 400).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    let chatObserver = null;

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function cssText() {
        return `
            /* World chat: da pannello tecnico a conversazione leggibile e mobile-first. */
            #modal-world-chat .chat-modal {
                width: min(780px, calc(100vw - 18px)) !important;
                max-width: 780px !important;
                max-height: min(92dvh, 900px);
                overflow: hidden;
                border: 1px solid rgba(220,177,69,.54);
                border-radius: 24px;
                box-shadow: 0 28px 80px rgba(13,7,4,.48);
                background: linear-gradient(180deg, #f8e9bd 0%, #f2dda6 100%);
            }
            #modal-world-chat .modal-header {
                min-height: 68px;
                padding: 15px 18px;
                color: #f4d87c;
                background:
                    radial-gradient(circle at 15% 0%, rgba(125,65,157,.24), transparent 34%),
                    linear-gradient(135deg, #2c150d, #1c0e09 72%);
                border-bottom: 1px solid rgba(228,189,79,.46);
                font-size: clamp(.98rem, 3.6vw, 1.18rem);
                letter-spacing: .035em;
            }
            #modal-world-chat .modal-close {
                width: 42px; height: 42px; display:grid; place-items:center;
                border-radius: 50%; color:#fff3c2; background:rgba(255,255,255,.06);
                border:1px solid rgba(255,229,145,.22); font-size:1.25rem;
            }
            #modal-world-chat .modal-body {
                padding: 12px 14px 14px;
                overflow: auto;
                overscroll-behavior: contain;
                background: linear-gradient(180deg, rgba(255,250,233,.22), rgba(255,255,255,.04));
            }
            #modal-world-chat .chat-tools {
                display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px;
                margin:0 0 12px;
            }
            #modal-world-chat .chat-tool-btn {
                min-height:44px; padding:8px 10px; border-radius:14px;
                border:1px solid rgba(102,52,126,.24);
                color:#63337d; background:rgba(255,255,255,.72);
                box-shadow:0 4px 12px rgba(70,40,20,.06);
                font:700 .76rem 'Cinzel',serif; line-height:1.18;
                text-transform:none;
            }
            #modal-world-chat .chat-tool-btn:not(:disabled):active { transform:scale(.985); }
            #modal-world-chat #btn-close-world-chat { color:#7a5310; border-color:rgba(139,105,20,.28); }
            #modal-world-chat .chat-convocation-panel {
                margin-bottom:12px; padding:12px; border-radius:16px;
                background:rgba(248,241,255,.86); box-shadow:0 8px 24px rgba(68,31,87,.08);
            }
            #modal-world-chat .chat-layout { display:block; min-height:0; }
            #modal-world-chat .chat-thread-list {
                display:flex; gap:8px; max-height:none; overflow-x:auto; overflow-y:hidden;
                padding:0 2px 10px; margin:0 0 4px; border-right:0;
                scroll-snap-type:x proximity; scrollbar-width:none;
            }
            #modal-world-chat .chat-thread-list::-webkit-scrollbar { display:none; }
            #modal-world-chat .chat-thread {
                flex:0 0 min(280px, 76vw); min-height:70px; margin:0; padding:10px 12px;
                border-radius:15px; scroll-snap-align:start;
                border:1px solid rgba(78,57,40,.12); background:rgba(255,255,255,.67);
                box-shadow:0 4px 13px rgba(58,35,20,.06); color:#39251b;
            }
            #modal-world-chat .chat-thread.active {
                color:#4f2868; border-color:rgba(107,46,155,.48);
                background:linear-gradient(145deg, rgba(247,239,255,.98), rgba(234,214,246,.88));
                box-shadow:0 6px 18px rgba(93,44,120,.12);
            }
            #modal-world-chat .chat-thread strong { font-size:.82rem; line-height:1.2; }
            #modal-world-chat .chat-thread small {
                margin-top:5px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
                overflow:hidden; font:500 .72rem system-ui,sans-serif; line-height:1.25;
            }
            #modal-world-chat .chat-conversation { padding:0; min-width:0; }
            #modal-world-chat .chat-conversation-head {
                margin:4px 0 10px; padding:12px 13px; border:1px solid rgba(86,58,35,.12);
                border-radius:17px; background:rgba(255,253,246,.62); box-shadow:0 5px 16px rgba(55,32,16,.05);
            }
            #modal-world-chat .chat-conversation-head > strong {
                display:block; margin-bottom:3px; color:#321d14; font-size:1rem; line-height:1.25;
            }
            #modal-world-chat .chat-conversation-head > small { color:#7b6550; font-size:.76rem; }
            #modal-world-chat .chat-resolution {
                margin:8px 0 0; padding:8px 10px; border-radius:11px;
                border-left:3px solid rgba(170,126,25,.6); background:rgba(232,190,80,.13);
                color:#5c4328; font-size:.8rem; line-height:1.35;
            }
            #modal-world-chat .chat-participant-chips {
                display:flex; gap:7px; flex-wrap:wrap; margin-top:10px;
            }
            #modal-world-chat .chat-participant-chips > span {
                min-height:38px; display:inline-flex; align-items:center; gap:7px;
                padding:4px 9px 4px 4px; border-radius:999px;
                border:1px solid rgba(107,46,155,.13); background:rgba(107,46,155,.08);
                color:#62347a; font:700 .73rem system-ui,sans-serif;
            }
            #modal-world-chat .participant-portrait {
                width:32px !important; height:32px !important; min-width:32px; border-radius:50% !important;
                object-fit:cover !important; object-position:50% 24% !important;
                border:1px solid rgba(255,255,255,.8); box-shadow:0 2px 7px rgba(42,23,12,.14);
            }
            #modal-world-chat .chat-messages {
                min-height:260px; max-height:48dvh; overflow-y:auto;
                padding:14px 10px; border:1px solid rgba(91,63,37,.1); border-radius:18px;
                background:
                    radial-gradient(circle at 8% 0%, rgba(107,46,155,.055), transparent 28%),
                    linear-gradient(180deg, rgba(255,253,246,.66), rgba(250,240,211,.56));
                scrollbar-width:thin; overscroll-behavior:contain;
            }
            #modal-world-chat .chat-message {
                width:100%; display:flex; align-items:flex-end; gap:10px; margin:0 0 14px;
            }
            #modal-world-chat .chat-message.player { flex-direction:row-reverse; }
            #modal-world-chat .chat-avatar {
                flex:0 0 58px; width:58px; height:58px; padding:0; overflow:hidden;
                border-radius:19px; background:#352119; color:white;
                border:2px solid rgba(215,173,56,.48); box-shadow:0 7px 18px rgba(50,28,13,.14);
            }
            #modal-world-chat .chat-avatar img,
            #modal-world-chat .chat-avatar .portrait-image {
                width:100% !important; height:100% !important; max-width:none !important; max-height:none !important;
                display:block; object-fit:cover !important; object-position:50% 24% !important; border-radius:17px !important;
            }
            #modal-world-chat .chat-message.player .chat-avatar { border-color:rgba(107,46,155,.48); }
            #modal-world-chat .chat-bubble {
                position:relative; max-width:min(78%, 560px); padding:11px 13px 12px;
                border-radius:18px 18px 18px 6px; border:1px solid rgba(87,61,41,.1);
                color:#3d291e; background:rgba(255,255,255,.94);
                box-shadow:0 7px 20px rgba(56,34,18,.08); font-size:1rem; line-height:1.43;
            }
            #modal-world-chat .chat-message.player .chat-bubble {
                border-radius:18px 18px 6px 18px;
                color:#3e2350; border-color:rgba(107,46,155,.18);
                background:linear-gradient(145deg,#f2e7fa,#ead8f5);
            }
            #modal-world-chat .chat-speaker {
                display:flex; align-items:center; flex-wrap:wrap; gap:5px;
                margin-bottom:5px; color:#6a3586; font:700 .77rem system-ui,sans-serif;
            }
            #modal-world-chat .chat-message.player .chat-speaker { color:#7d5c13; justify-content:flex-end; }
            #modal-world-chat .chat-act-badge {
                display:inline-flex; padding:2px 6px; border-radius:999px;
                color:#795f54; background:rgba(93,60,40,.07); font-size:.62rem; font-weight:650;
            }
            #modal-world-chat .chat-message.pending .chat-bubble { opacity:.74; }
            #modal-world-chat .chat-compose {
                position:sticky; bottom:0; z-index:3; display:grid; grid-template-columns:minmax(0,1fr) 52px;
                gap:8px; margin-top:10px; padding:10px 0 2px;
                border-top:1px solid rgba(87,61,41,.12);
                background:linear-gradient(180deg, rgba(243,224,174,0), #f3dfa9 34%);
            }
            #modal-world-chat #chat-input {
                min-width:0; min-height:48px; padding:10px 14px; border-radius:16px;
                border:1px solid rgba(93,64,39,.18); background:rgba(255,255,255,.92);
                color:#352218; font-size:16px; outline:none;
            }
            #modal-world-chat #chat-input:focus { border-color:rgba(107,46,155,.46); box-shadow:0 0 0 3px rgba(107,46,155,.08); }
            #modal-world-chat #btn-send-chat {
                min-width:52px; min-height:48px; border-radius:16px;
                background:linear-gradient(145deg,#8b54ab,#5a2874); box-shadow:0 6px 14px rgba(74,34,94,.18);
            }
            @media (max-width:620px) {
                #modal-world-chat { align-items:flex-end; }
                #modal-world-chat .chat-modal {
                    width:100% !important; max-width:none !important; max-height:calc(100dvh - 18px);
                    margin:0; border-radius:24px 24px 0 0;
                }
                #modal-world-chat .modal-header { min-height:62px; padding:12px 14px; }
                #modal-world-chat .modal-body { padding:10px 10px calc(10px + env(safe-area-inset-bottom)); }
                #modal-world-chat .chat-tools { gap:6px; }
                #modal-world-chat .chat-tool-btn { min-height:42px; padding:7px 5px; font-size:.67rem; }
                #modal-world-chat .chat-thread { flex-basis:min(245px,74vw); }
                #modal-world-chat .chat-conversation-head { padding:10px 11px; }
                #modal-world-chat .chat-messages { min-height:250px; max-height:50dvh; padding:12px 8px; }
                #modal-world-chat .chat-avatar { flex-basis:56px; width:56px; height:56px; border-radius:18px; }
                #modal-world-chat .chat-bubble { max-width:calc(100% - 66px); padding:10px 12px; font-size:.98rem; }
            }
            @media (max-width:390px) {
                #modal-world-chat .chat-tool-btn { font-size:.61rem; }
                #modal-world-chat .chat-avatar { flex-basis:52px; width:52px; height:52px; }
                #modal-world-chat .chat-bubble { max-width:calc(100% - 60px); }
            }
        `;
    }

    function installStyles(documentRef) {
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return false;
        const style = documentRef.createElement('style');
        style.id = STYLE_ID;
        style.textContent = cssText();
        documentRef.head.appendChild(style);
        return true;
    }

    function speakerRecord(name, state = getState()) {
        const wanted = keyOf(name);
        if (!wanted) return null;
        const character = state?.character;
        if (character && (keyOf(character.name) === wanted || keyOf(character.givenName) === wanted)) {
            return { entity: character, speakerType: 'protagonista' };
        }
        const photos = root.CronachePortraitPhotos;
        const detailed = photos?.findEntity?.(name, state);
        if (detailed) return { entity: detailed, speakerType: 'npc' };
        let found = null;
        asArray(state?.worldMemory?.chats).some(thread => asArray(thread?.messages).some(message => {
            if (keyOf(message?.speaker) !== wanted) return false;
            found = message;
            return true;
        }));
        if (found) {
            const type = keyOf(found.speakerType || 'npc');
            if (/fazione|faction|regno|kingdom|gruppo|group/.test(type)) return { entity: null, speakerType: type };
            return {
                speakerType: type || 'npc',
                entity: {
                    name: clean(found.speaker, 120),
                    role: clean(found.role || found.speakerRole || 'personaggio della conversazione', 120),
                    location: clean(found.location || state?.currentLocation, 120),
                    gender: clean(found.gender, 20),
                    source: 'chat'
                }
            };
        }
        return null;
    }

    function staticFallback(entity, state = getState()) {
        const portraits = root.CronachePortraits;
        if (!portraits || !entity) return '';
        try {
            const portrait = portraits.choosePortrait?.(entity, {
                story: state?.currentStory,
                genre: state?.currentStory?.genre,
                setting: state?.currentStory?.setting,
                year: state?.time?.year,
                role: entity.role || entity.historicalRole,
                gender: entity.gender
            });
            return clean(portraits.imageSrc?.(portrait), 700);
        } catch (_error) {
            return '';
        }
    }

    function imageLabel(img) {
        const alt = clean(img?.getAttribute?.('alt'), 180);
        const title = clean(img?.getAttribute?.('title'), 180);
        return (alt.replace(/^ritratto\s+di\s+/i, '').replace(/^portrait\s+of\s+/i, '').trim() || title);
    }

    function isLikelyHuman(entity, name, speakerType) {
        const photos = root.CronachePortraitPhotos;
        if (entity && photos?.isPersonEntity) return photos.isPersonEntity(entity, getState());
        if (/fazione|faction|regno|kingdom|gruppo|group/.test(keyOf(speakerType))) return false;
        if (photos?.looksLikeOrganization?.(name)) return false;
        return Boolean(clean(name, 80));
    }

    function decorateChatPortrait(img, state = getState()) {
        if (!img || !state?.worldMemory || img.dataset.chatPortraitV2 === '1') return false;
        const name = imageLabel(img);
        if (!name) return false;
        const record = speakerRecord(name, state);
        const entity = record?.entity;
        if (!isLikelyHuman(entity, name, record?.speakerType)) return false;
        const effective = entity || { name, role: 'personaggio della conversazione', location: state.currentLocation };
        const fallback = staticFallback(effective, state);
        const original = img.currentSrc || img.src || '';
        if (fallback && (/^data:image\/svg/i.test(original) || !original)) img.dataset.portraitFallbackSrc = fallback;
        else if (!img.dataset.portraitFallbackSrc) img.dataset.portraitFallbackSrc = original || fallback;

        const photos = root.CronachePortraitPhotos;
        const entry = photos?.ensurePhotoEntry?.(effective, state);
        if (entry?.url) {
            img.dataset.portraitPhotoDecorated = '1';
            img.dataset.portraitPhotoLoaded = '1';
            img.dataset.portraitPhotoKey = entry.key;
            img.dataset.portraitPhotoUrl = entry.url;
            img.decoding = 'async';
            img.loading = 'eager';
            img.classList.add('portrait-photo');
            if (img.src !== entry.url) img.src = entry.url;
        } else if (fallback && img.src !== fallback) {
            img.src = fallback;
        }
        img.dataset.chatPortraitV2 = '1';
        return true;
    }

    function scanChatPortraits(documentRef, state = getState()) {
        const modal = documentRef?.getElementById('modal-world-chat');
        if (!modal || !state?.worldMemory) return 0;
        let count = 0;
        modal.querySelectorAll('img.portrait-image, img.participant-portrait, img.chat-candidate-portrait').forEach(img => {
            if (decorateChatPortrait(img, state)) count++;
        });
        return count;
    }

    function compactToolbar(documentRef) {
        const labels = {
            'btn-new-world-chat': ['＋ Riunione', 'Convoca una nuova riunione'],
            'btn-invite-world-chat': ['👥 Invita', 'Invita altri personaggi'],
            'btn-close-world-chat': ['✓ Concludi', 'Concludi la conversazione']
        };
        Object.entries(labels).forEach(([id, [text, title]]) => {
            const button = documentRef?.getElementById(id);
            if (!button || button.dataset.chatUiV2 === '1') return;
            button.textContent = text;
            button.title = title;
            button.dataset.chatUiV2 = '1';
        });
    }

    function observeChat(documentRef, windowRef) {
        if (chatObserver || typeof windowRef?.MutationObserver !== 'function') return;
        const modal = documentRef?.getElementById('modal-world-chat');
        if (!modal) return;
        chatObserver = new windowRef.MutationObserver(mutations => {
            const state = getState();
            if (!state?.worldMemory) return;
            mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
                if (node?.nodeType !== 1) return;
                if (node.matches?.('img.portrait-image, img.participant-portrait, img.chat-candidate-portrait')) decorateChatPortrait(node, state);
                node.querySelectorAll?.('img.portrait-image, img.participant-portrait, img.chat-candidate-portrait').forEach(img => decorateChatPortrait(img, state));
            }));
        });
        // Solo childList: cambiare src/classi dei ritratti non può riattivare l'observer.
        chatObserver.observe(modal, { childList: true, subtree: true });
    }

    function install(documentRef, windowRef) {
        if (!documentRef || !windowRef) return false;
        installStyles(documentRef);
        compactToolbar(documentRef);
        scanChatPortraits(documentRef, getState());
        observeChat(documentRef, windowRef);
        if (!documentRef.__chatExperienceV2Clicks) {
            documentRef.__chatExperienceV2Clicks = true;
            documentRef.addEventListener('click', event => {
                if (!event.target?.closest?.('#btn-world-chat, #btn-top-world, #btn-invite-world-chat, #btn-new-world-chat, .chat-thread')) return;
                windowRef.setTimeout(() => scanChatPortraits(documentRef, getState()), 0);
            }, true);
        }
        documentRef.body?.classList.add('chat-experience-v2-ready');
        root.__cronacheChatExperienceV2Version = PATCH_VERSION;
        return true;
    }

    function scheduleInstall() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        const attempt = () => install(document, window);
        [0, 100, 350, 900, 1800, 3500].forEach(delay => window.setTimeout(attempt, delay));
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attempt, { once: true });
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        STYLE_ID,
        clean,
        keyOf,
        cssText,
        speakerRecord,
        staticFallback,
        imageLabel,
        isLikelyHuman,
        decorateChatPortrait,
        scanChatPortraits,
        install
    };
});