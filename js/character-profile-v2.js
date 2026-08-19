(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheCharacterProfileV2 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 2;
    const STYLE_ID = 'cronache-character-profile-v2-style';
    const IDENTITY_ID = 'character-world-identity';

    const clean = (value, max = 240) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const keyOf = value => clean(value, 400).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const asArray = value => Array.isArray(value) ? value : [];

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function yearOf(state) {
        const year = Number(state?.time?.year ?? state?.currentStory?.startTime?.year);
        return Number.isFinite(year) ? year : null;
    }

    function storyText(state) {
        const story = state?.currentStory || {};
        return [story.title, story.name, story.desc, story.description, story.premise, story.setting, story.intro, story.opening]
            .map(value => clean(value, 1000)).filter(Boolean).join(' ');
    }

    function detectPresentationContext(state = getState()) {
        const story = state?.currentStory || {};
        const year = yearOf(state);
        const corpus = `${storyText(state)} ${clean(state?.worldMemory?.world?.historicalContext?.region, 240)}`.toLowerCase();
        let genre = clean(story.genre || state?.character?.genre || 'fantasy', 60).toLowerCase();
        let era = 'modern';

        if (Number.isFinite(year)) {
            if (year < 500) era = 'ancient';
            else if (year < 1450) era = 'medieval';
            else if (year < 1750) era = 'renaissance';
            else if (year < 1910) era = 'industrial';
            else era = 'modern';
        } else if (/rinasc|medici|quattrocent|cinquecent/.test(corpus)) era = 'renaissance';
        else if (/medioev|medieval|feudal/.test(corpus)) era = 'medieval';
        else if (/romano|antica roma|grec|antich/.test(corpus)) era = 'ancient';
        else if (/ottocent|vittorian|industrial/.test(corpus)) era = 'industrial';

        const historical = era !== 'modern' || /storico|rinasc|medioev|medici|firenze|venezia|roma antica/.test(corpus);
        if (historical) genre = 'historical';
        return { genre, era, year, historical, corpus };
    }

    function protagonistActor(state) {
        const name = keyOf(state?.character?.name);
        const given = keyOf(state?.character?.givenName);
        if (!name && !given) return null;
        return asArray(state?.worldMemory?.world?.actors).find(actor => {
            const actorName = keyOf(actor?.name);
            return actorName && (actorName === name || actorName === given);
        }) || null;
    }

    function businessHint(state) {
        const memory = state?.worldMemory || {};
        const businesses = asArray(memory?.management?.businesses).length
            ? asArray(memory.management.businesses)
            : asArray(memory.businesses);
        return businesses.find(item => item?.active !== false) || null;
    }

    function contextualRole(state = getState(), context = detectPresentationContext(state)) {
        const character = state?.character || {};
        const actor = protagonistActor(state);
        const direct = clean(character.currentRole || character.profession || character.title || character.worldRole || actor?.role || actor?.historicalRole, 120);
        if (direct && !/^(ceo|startupper|founder|manager)$/i.test(direct)) return direct;

        const archetype = keyOf(character.archetype || direct);
        const business = businessHint(state);
        const sector = keyOf(business?.specialization || business?.type || business?.name || business?.description);
        const corpus = `${context.corpus} ${sector}`;

        if (context.historical) {
            if (/banca|bank|credito|prestiti|finanz|cambio|moneylender|banco/.test(corpus) || /ceo|founder|analyst|controller/.test(archetype)) return 'Banchiere';
            if (/seller|merchant|mercant/.test(archetype)) return 'Mercante';
            if (/fixer|network|intermed/.test(archetype)) return 'Intermediario';
            if (/diplomat|envoy/.test(archetype)) return 'Diplomatico';
            if (/warrior|condott|soldier/.test(archetype)) return 'Condottiero';
            return context.era === 'renaissance' ? 'Membro della vita civile fiorentina' : 'Personaggio storico';
        }

        const labels = {
            ceo: 'CEO', founder: 'Fondatore', analyst: 'Analista', controller: 'Controller', seller: 'Venditore',
            fixer: 'Intermediario', manager: 'Manager', coder: 'Sviluppatore', investigator: 'Investigatore',
            striker: 'Attaccante', playmaker: 'Regista', defender: 'Difensore', goalkeeper: 'Portiere'
        };
        return labels[archetype] || clean(character.archetype, 100) || 'Protagonista';
    }

    function contextualBackground(state = getState(), context = detectPresentationContext(state)) {
        const origin = keyOf(state?.character?.origin);
        if (context.historical) {
            const historical = {
                startup: 'Casa mercantile', family-business: 'Casa mercantile', merchant-house: 'Casa mercantile',
                consultant: 'Professione di fiducia', heir: 'Erede di casata', minor-nobility: 'Piccola nobiltà',
                workshop: 'Bottega', university: 'Università', traveler: 'Viaggiatore', guild: 'Corporazione',
                court: 'Corte', monastery: 'Istruzione religiosa', peasant: 'Ceto rurale'
            };
            return historical[origin] || clean(state?.character?.origin, 100) || (context.era === 'renaissance' ? 'Società rinascimentale' : 'Società storica');
        }
        return clean(state?.character?.origin, 100) || 'Origine personale';
    }

    function eraLabel(context) {
        return { ancient: 'Età antica', medieval: 'Medioevo', renaissance: 'Rinascimento', industrial: 'Età industriale', modern: 'Età moderna' }[context.era] || 'Epoca';
    }

    function houseLabel(state) {
        const character = state?.character || {};
        const lineage = state?.worldMemory?.characterLineage || state?.worldMemory?.world?.protagonistLineage || {};
        return clean(character.house || character.casata || lineage.house || '', 140);
    }

    function profileModel(state = getState()) {
        if (!state?.character) return null;
        const context = detectPresentationContext(state);
        const role = contextualRole(state, context);
        const background = contextualBackground(state, context);
        const house = houseLabel(state);
        const place = clean(state.currentLocation || state?.worldMemory?.world?.startLocation || state?.currentStory?.setting, 120);
        const year = context.year;
        return {
            context,
            name: clean(state.character.name, 140),
            house,
            role,
            background,
            place,
            period: [eraLabel(context), year].filter(value => value !== null && value !== '').join(' · '),
            level: Math.max(1, Number(state.character.level) || 1),
            theme: context.historical ? context.era : keyOf(context.genre || 'modern')
        };
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function cssText() {
        return `
            #modal-character .modal {
                width:min(680px, calc(100vw - 18px)); max-height:min(94dvh, 920px);
                overflow:hidden; border-radius:24px; border:1px solid rgba(161,111,25,.38);
                box-shadow:0 28px 80px rgba(30,16,8,.42);
            }
            #modal-character .modal-header {
                min-height:64px; padding:14px 18px; color:#f5dc8a;
                background:linear-gradient(135deg,#2b160d,#170b07 74%); border-bottom:1px solid rgba(224,184,72,.45);
            }
            #modal-character .modal-body { padding:16px; background:linear-gradient(180deg,#f8e9bd,#f2dda7); }
            #modal-character .char-header {
                position:relative; margin:0 0 14px; padding:18px 14px 15px; border-radius:20px;
                border:1px solid rgba(154,107,25,.18); background:rgba(255,251,235,.48);
                box-shadow:0 9px 24px rgba(76,46,18,.06);
            }
            #modal-character .char-header::before {
                content:''; position:absolute; inset:0; pointer-events:none; border-radius:20px;
                background:radial-gradient(circle at 50% -10%, rgba(198,150,47,.18), transparent 48%);
            }
            #modal-character #char-portrait {
                width:156px !important; height:156px !important; margin:0 auto 12px !important;
                border-radius:32px !important; border:2px solid rgba(123,79,25,.42) !important;
                box-shadow:0 14px 30px rgba(48,29,14,.17) !important;
            }
            #modal-character #char-name { position:relative; font-size:clamp(1.55rem,6vw,2rem); line-height:1.08; letter-spacing:.035em; }
            #modal-character #char-class { position:relative; margin-top:5px; color:#725b43; font-size:.92rem; font-style:normal; }
            #${IDENTITY_ID} {
                position:relative; display:flex; flex-wrap:wrap; justify-content:center; gap:7px; margin-top:11px;
            }
            #${IDENTITY_ID} .profile-chip {
                display:inline-flex; align-items:center; min-height:30px; padding:5px 9px; border-radius:999px;
                color:#5b4328; background:rgba(255,255,255,.6); border:1px solid rgba(112,77,31,.13);
                font:700 .7rem system-ui,sans-serif;
            }
            #modal-character .profile-world-card {
                display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:0 0 14px;
                padding:12px; border-radius:16px; background:rgba(255,251,237,.55); border:1px solid rgba(133,92,30,.13);
            }
            #modal-character .profile-world-item { min-width:0; padding:8px 9px; border-radius:11px; background:rgba(255,255,255,.42); }
            #modal-character .profile-world-item small { display:block; color:#856b4f; font:700 .62rem system-ui,sans-serif; text-transform:uppercase; letter-spacing:.05em; }
            #modal-character .profile-world-item strong { display:block; margin-top:3px; color:#39251a; font-size:.86rem; overflow:hidden; text-overflow:ellipsis; }
            #modal-character .equipment-section { margin-bottom:14px; padding:12px; border-radius:16px; background:rgba(255,250,231,.45); }
            #modal-character .equipment-section h4 { margin-bottom:9px; font-size:.9rem; }
            #modal-character.profile-equipment-empty .equip-slot { min-height:72px; padding:8px 5px; opacity:.82; }
            #modal-character.profile-equipment-empty .equip-slot-icon { font-size:1.35rem; }
            #modal-character.profile-equipment-empty .equip-slot-label { font-size:.66rem; }
            #modal-character .char-stats, #modal-character .stats-section { margin-top:12px; }
            #modal-character[data-profile-theme='renaissance'] .profile-world-card,
            #modal-character[data-profile-theme='medieval'] .profile-world-card { border-left:4px solid rgba(142,96,20,.58); }
            #modal-character[data-profile-theme='business'] .profile-world-card { border-left:4px solid #496c84; }
            #modal-character[data-profile-theme='crime'] .profile-world-card { border-left:4px solid #7b2020; }
            @media (max-width:620px) {
                #modal-character { align-items:flex-end; }
                #modal-character .modal { width:100%; max-width:none; max-height:calc(100dvh - 16px); margin:0; border-radius:24px 24px 0 0; }
                #modal-character .modal-body { padding:13px 12px calc(18px + env(safe-area-inset-bottom)); }
                #modal-character #char-portrait { width:148px !important; height:148px !important; border-radius:30px !important; }
                #modal-character .char-header { padding:15px 10px 13px; }
                #modal-character .profile-world-card { grid-template-columns:1fr 1fr; padding:10px; }
            }
        `;
    }

    function installStyles(documentRef) {
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
        const style = documentRef.createElement('style');
        style.id = STYLE_ID;
        style.textContent = cssText();
        documentRef.head.appendChild(style);
    }

    function updatePresentationIdentity(state, model) {
        if (!state?.character || !model) return;
        const character = state.character;
        character.presentationRole = model.role;
        character.presentationBackground = model.background;
        if (model.context.historical && (!clean(character.role) || /^(ceo|startupper|founder|manager)$/i.test(clean(character.role)))) {
            character.role = model.role;
        }
        if (model.house && !clean(character.faction)) character.faction = model.house;
    }

    function refreshPortraitProfile(state, model, documentRef) {
        const photos = root.CronachePortraitPhotos;
        if (!photos || !state?.worldMemory || !state?.character || !model) return false;
        const registry = photos.ensureRegistry?.(state);
        const profile = photos.buildPhotoProfile?.(state.character, state);
        if (!registry || !profile) return false;
        profile.role = model.role || profile.role;
        profile.faction = model.house || profile.faction;
        profile.archetype = model.background || profile.archetype;
        const entry = registry.entries?.[profile.key] || photos.ensurePhotoEntry?.(state.character, state);
        if (!entry) return false;
        const oldRole = clean(entry.profile?.role || entry.profile?.archetype, 120);
        const incompatible = model.context.historical && /ceo|startup|startupper|founder|manager/i.test(oldRole);
        entry.profile = profile;
        entry.url = photos.buildPhotoUrl?.(profile, state, { seed: entry.seed, reroll: entry.reroll || 0 }) || entry.url;
        if (!incompatible || !documentRef) return true;
        documentRef.querySelectorAll('#char-portrait img.portrait-image, #topbar-protagonist-portrait img.portrait-image, #story-intro-portrait img.portrait-image, .chat-message.player img.portrait-image').forEach(img => {
            img.dataset.portraitPhotoUrl = entry.url;
            if (img.classList.contains('portrait-photo')) img.src = entry.url;
        });
        return true;
    }

    function equipmentIsEmpty(documentRef) {
        const slots = Array.from(documentRef?.querySelectorAll?.('#modal-character .equip-slot') || []);
        if (!slots.length) return false;
        return slots.every(slot => /vuoto|empty/i.test(clean(slot.textContent, 120)));
    }

    function render(documentRef, state = getState()) {
        const modal = documentRef?.getElementById?.('modal-character');
        if (!modal || !state?.character) return false;
        root.CronacheCharacterLineage?.applyLineage?.(state);
        const model = profileModel(state);
        if (!model) return false;
        updatePresentationIdentity(state, model);

        modal.dataset.profileTheme = model.theme;
        const name = documentRef.getElementById('char-name');
        const cls = documentRef.getElementById('char-class');
        if (name) name.textContent = model.name;
        if (cls) cls.textContent = `${model.background} · ${model.role} · Lv. ${model.level}`;

        let identity = documentRef.getElementById(IDENTITY_ID);
        if (!identity && cls) {
            identity = documentRef.createElement('div');
            identity.id = IDENTITY_ID;
            cls.insertAdjacentElement('afterend', identity);
        }
        if (identity) {
            const chips = [
                model.house ? `🏛 ${model.house}` : '',
                model.place ? `📍 ${model.place}` : '',
                model.period ? `📜 ${model.period}` : ''
            ].filter(Boolean);
            identity.innerHTML = chips.map(value => `<span class="profile-chip">${escapeHtml(value)}</span>`).join('');
        }

        const body = modal.querySelector('.modal-body');
        let worldCard = body?.querySelector('.profile-world-card');
        const equipment = body?.querySelector('.equipment-section');
        if (!worldCard && body) {
            worldCard = documentRef.createElement('div');
            worldCard.className = 'profile-world-card';
            if (equipment) equipment.insertAdjacentElement('beforebegin', worldCard);
            else body.prepend(worldCard);
        }
        if (worldCard) {
            const rows = [
                ['Ruolo nel mondo', model.role],
                ['Origine sociale', model.background],
                ['Casata / famiglia', model.house || 'Nessuna casata nota'],
                ['Epoca e luogo', [model.period, model.place].filter(Boolean).join(' · ') || 'Contesto corrente']
            ];
            worldCard.innerHTML = rows.map(([label, value]) => `<div class="profile-world-item"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`).join('');
        }

        const equipmentTitle = equipment?.querySelector('h4');
        if (equipmentTitle) equipmentTitle.textContent = model.context.historical ? '🗝️ Dotazione personale' : '🎒 Equipaggiamento';
        modal.classList.toggle('profile-equipment-empty', equipmentIsEmpty(documentRef));
        refreshPortraitProfile(state, model, documentRef);
        return true;
    }

    function install(documentRef, windowRef) {
        if (!documentRef || !windowRef) return false;
        installStyles(documentRef);
        if (!documentRef.__characterProfileV2Installed) {
            documentRef.__characterProfileV2Installed = true;
            documentRef.addEventListener('click', event => {
                if (!event.target?.closest?.('#btn-top-character, #btn-character')) return;
                windowRef.setTimeout(() => render(documentRef, getState()), 0);
            }, true);
            windowRef.addEventListener?.('cronache:character-lineage-updated', () => windowRef.setTimeout(() => render(documentRef, getState()), 0));
        }
        if (documentRef.getElementById('modal-character')?.classList.contains('active')) render(documentRef, getState());
        windowRef.__cronacheCharacterProfileV2Version = PATCH_VERSION;
        return true;
    }

    function scheduleInstall() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        const attempt = () => install(document, window);
        [0, 120, 450, 1100, 2600].forEach(delay => window.setTimeout(attempt, delay));
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attempt, { once: true });
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        STYLE_ID,
        IDENTITY_ID,
        clean,
        keyOf,
        detectPresentationContext,
        contextualRole,
        contextualBackground,
        eraLabel,
        houseLabel,
        profileModel,
        cssText,
        updatePresentationIdentity,
        refreshPortraitProfile,
        equipmentIsEmpty,
        render,
        install
    };
});