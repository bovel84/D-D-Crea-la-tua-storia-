(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronachePortraitPhotos = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const PHOTO_SCHEMA_VERSION = 1;
    const MODEL = 'flux';
    const PHOTO_BASE = 'https://image.pollinations.ai/prompt/';
    const PHOTO_WIDTH = 768;
    const PHOTO_HEIGHT = 768;
    const MAX_ENTRIES = 90;
    const STYLE_ID = 'cronache-portrait-photos-style';
    const REROLL_ID = 'btn-reroll-character-photo';

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 900) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ').trim().slice(0, max);
    const keyOf = value => clean(value, 400).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    let domObserver = null;
    let intersectionObserver = null;
    let installTimer = null;

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function hashNumber(value) {
        let hash = 2166136261;
        const text = String(value || '');
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function normalizeGender(value) {
        const gender = keyOf(value);
        if (/^(female|femmina|donna|she-her|lei)$/.test(gender)) return 'female';
        if (/^(male|maschio|uomo|he-him|lui)$/.test(gender)) return 'male';
        return 'any';
    }

    function portraitEngine() {
        return root.CronachePortraits || null;
    }

    function isProtagonist(entity, state = getState()) {
        if (!entity || !state?.character) return false;
        return entity === state.character || keyOf(entity.name) === keyOf(state.character.name);
    }

    function inferGenderFromPortrait(entity) {
        const selected = portraitEngine()?.getPortrait?.(entity?.portraitId);
        const genders = asArray(selected?.genders).filter(item => item === 'male' || item === 'female');
        return genders.length === 1 ? genders[0] : 'any';
    }

    function resolveGender(entity, state = getState()) {
        const input = entity && typeof entity === 'object' ? entity : {};
        const declared = normalizeGender(input.gender || input.sex || input.pronouns);
        if (declared !== 'any') return declared;
        if (isProtagonist(input, state)) {
            const selected = normalizeGender(state?.selectedGender);
            if (selected !== 'any') return selected;
        }
        try {
            const resolved = portraitEngine()?.resolveGender?.(input, {
                story: state?.currentStory,
                genre: state?.currentStory?.genre,
                setting: state?.currentStory?.setting,
                year: state?.time?.year,
                role: input.role || input.archetype,
                gender: input.gender
            });
            if (resolved === 'male' || resolved === 'female') return resolved;
        } catch (_error) { }
        return inferGenderFromPortrait(input);
    }

    function resolveEra(state = getState(), entity = {}) {
        try {
            const era = portraitEngine()?.resolveEra?.({
                story: state?.currentStory,
                genre: state?.currentStory?.genre || entity.genre,
                setting: state?.currentStory?.setting,
                year: state?.time?.year || state?.currentStory?.startTime?.year
            });
            if (era) return clean(era, 40);
        } catch (_error) { }
        const year = Number(state?.time?.year || state?.currentStory?.startTime?.year);
        if (Number.isFinite(year)) {
            if (year < 500) return 'ancient';
            if (year < 1450) return 'medieval';
            if (year < 1750) return 'renaissance';
            if (year < 1910) return 'industrial';
        }
        return 'modern';
    }

    function resolveRole(entity, state = getState()) {
        try {
            const role = portraitEngine()?.resolveRole?.(entity, {
                story: state?.currentStory,
                genre: state?.currentStory?.genre,
                role: entity?.role || entity?.archetype,
                archetype: entity?.archetype,
                origin: entity?.origin
            });
            if (role && role !== 'generic') return clean(role, 80);
        } catch (_error) { }
        return clean(entity?.role || entity?.historicalRole || entity?.archetype || 'personaggio', 100);
    }

    function ageDescriptor(entity) {
        const ageValue = Number(entity?.age ?? entity?.eta);
        if (Number.isFinite(ageValue) && ageValue > 0) {
            if (ageValue < 13) return `child, about ${Math.round(ageValue)} years old`;
            if (ageValue < 20) return `teenager, about ${Math.round(ageValue)} years old`;
            if (ageValue < 30) return `young adult, about ${Math.round(ageValue)} years old`;
            if (ageValue < 60) return `adult, about ${Math.round(ageValue)} years old`;
            return `older adult, about ${Math.round(ageValue)} years old`;
        }
        const corpus = keyOf([entity?.description, entity?.role, entity?.historicalRole, entity?.personality].filter(Boolean).join(' '));
        if (/bambin|child|fanciull/.test(corpus)) return 'child';
        if (/ragazz|teen|adolescent/.test(corpus)) return 'teenager';
        if (/giovan|young/.test(corpus)) return 'young adult';
        if (/anzian|elder|vecchi|old|canut/.test(corpus)) return 'older adult';
        return 'adult';
    }

    function isPersonEntity(entity, state = getState()) {
        if (!entity || typeof entity !== 'object' || !clean(entity.name, 100)) return false;
        if (isProtagonist(entity, state)) return true;
        const kind = keyOf(entity.kind || entity.type || entity.category);
        const role = keyOf(entity.role || entity.historicalRole);
        if (/faction|fazione|kingdom|regno|company|azienda|impresa|organization|organizzazione|guild|gilda|partito/.test(kind)) return false;
        if (/faction|fazione|organizzazione|azienda|impresa|regno/.test(role)) return false;
        return true;
    }

    function collectEntities(state = getState()) {
        if (!state) return [];
        const memory = state.worldMemory || {};
        const rows = [];
        if (state.character) rows.push(state.character);
        rows.push(...asArray(memory?.world?.actors));
        rows.push(...asArray(memory.npcs));
        rows.push(...asArray(memory.employees));
        rows.push(...asArray(memory.family));
        rows.push(...asArray(memory?.managementAgents?.agents));
        asArray(memory?.management?.businesses).forEach(business => {
            rows.push(...asArray(business?.customers));
            rows.push(...asArray(business?.suppliers));
            rows.push(...asArray(business?.competitors));
            asArray(business?.contracts).forEach(contract => {
                if (contract?.counterpartyName) rows.push({
                    name: contract.counterpartyName,
                    role: contract.counterpartyType || contract.kind,
                    description: contract.title || ''
                });
            });
        });
        rows.push(...asArray(memory?.kingdom?.council));
        return rows.filter(item => isPersonEntity(item, state));
    }

    function findEntity(name, state = getState()) {
        const wanted = keyOf(name);
        if (!wanted) return null;
        const entities = collectEntities(state);
        return entities.find(item => keyOf(item?.name) === wanted) ||
            entities.find(item => {
                const key = keyOf(item?.name);
                if (!key) return false;
                const shortTokens = wanted.split('-').filter(Boolean);
                const longTokens = key.split('-').filter(Boolean);
                return shortTokens.length === 1 && shortTokens[0].length >= 3 && longTokens.includes(shortTokens[0]);
            }) || null;
    }

    function identityKey(entity, state = getState()) {
        const name = clean(entity?.name || 'personaggio', 120);
        const protagonist = isProtagonist(entity, state) ? 'protagonist' : 'npc';
        return `${protagonist}-${keyOf(name) || hashNumber(name).toString(36)}`;
    }

    function visualAppearance(entity) {
        return clean(
            entity?.appearance || entity?.visualDescription || entity?.physicalDescription ||
            entity?.description || entity?.historicalRole || '',
            420
        );
    }

    function storyYear(state = getState()) {
        return clean(state?.time?.year || state?.currentStory?.startTime?.year || state?.worldMemory?.world?.historicalContext?.date, 80);
    }

    function buildPhotoProfile(entity, state = getState()) {
        const input = entity && typeof entity === 'object' ? entity : { name: entity };
        const story = state?.currentStory || {};
        const world = state?.worldMemory?.world || {};
        const gender = resolveGender(input, state);
        const role = resolveRole(input, state);
        const era = resolveEra(state, input);
        const location = clean(input.location || state?.currentLocation || world.startLocation, 130);
        return {
            key: identityKey(input, state),
            name: clean(input.name || 'Personaggio', 120),
            gender,
            role,
            age: ageDescriptor(input),
            era,
            year: storyYear(state),
            setting: clean(story.setting || world.setting || world.historicalContext?.region, 220),
            genre: clean(story.genre || input.genre, 80),
            location,
            faction: clean(input.faction || input.organization || '', 120),
            appearance: visualAppearance(input),
            archetype: clean(input.archetype || input.origin || '', 100),
            protagonist: isProtagonist(input, state)
        };
    }

    function photoStyle(profile) {
        if (profile.era === 'fantasy' || /fantasy|magia|magical/i.test(profile.genre || '')) {
            return 'photorealistic cinematic fantasy character portrait, grounded believable human features';
        }
        if (profile.era === 'modern') return 'realistic cinematic character portrait photography';
        return 'photorealistic cinematic historical character portrait, as if photographed on a prestige period drama set';
    }

    function buildPhotoPrompt(entityOrProfile, state = getState()) {
        const profile = entityOrProfile?.key && entityOrProfile?.era
            ? entityOrProfile
            : buildPhotoProfile(entityOrProfile, state);
        const genderText = profile.gender === 'female' ? 'woman' : profile.gender === 'male' ? 'man' : 'person';
        const identity = profile.protagonist ? 'main protagonist' : 'recurring NPC';
        const details = [
            photoStyle(profile),
            `${identity}, one single ${genderText}, ${profile.age}`,
            profile.role ? `role and social identity: ${profile.role}` : '',
            profile.appearance ? `established physical appearance and identity details: ${profile.appearance}` : '',
            profile.faction ? `belongs to: ${profile.faction}` : '',
            profile.archetype ? `background: ${profile.archetype}` : '',
            profile.year ? `exact period/year: ${profile.year}` : '',
            profile.setting ? `world and cultural setting: ${profile.setting}` : '',
            profile.location ? `current regional context: ${profile.location}` : '',
            'head-and-shoulders portrait, face clearly visible, eyes readable, natural expression appropriate to the role',
            'authentic clothing, hairstyle, grooming, jewelry and materials for the exact culture, social class and historical period',
            'do not use modern clothes, modern makeup, modern hairstyles or modern objects unless the setting is modern',
            'preserve a distinctive believable identity; not a generic stock model, not glamour photography, not a costume catalogue',
            'neutral or softly contextual background, shallow depth of field, flattering natural cinematic light, realistic skin texture',
            'no other people, no duplicate person, no full body, no face obstruction, no mask, no helmet covering the face',
            'no text, no captions, no logo, no watermark, square composition centered on the face'
        ].filter(Boolean);
        return clean(details.join(', '), 2100);
    }

    function buildPhotoUrl(entityOrProfile, state = getState(), options = {}) {
        const profile = entityOrProfile?.key && entityOrProfile?.era
            ? entityOrProfile
            : buildPhotoProfile(entityOrProfile, state);
        const prompt = buildPhotoPrompt(profile, state);
        const reroll = Math.max(0, Number(options.reroll) || 0);
        const seed = Number.isFinite(Number(options.seed))
            ? Number(options.seed)
            : hashNumber(`${profile.key}|${profile.name}|${profile.era}|${profile.role}|${reroll}`);
        return `${PHOTO_BASE}${encodeURIComponent(prompt)}?model=${MODEL}&width=${PHOTO_WIDTH}&height=${PHOTO_HEIGHT}&seed=${seed}&safe=true&nologo=true`;
    }

    function ensureRegistry(state = getState()) {
        if (!state?.worldMemory) return { schemaVersion: PHOTO_SCHEMA_VERSION, entries: {} };
        const memory = state.worldMemory;
        if (!memory.portraitPhotos || typeof memory.portraitPhotos !== 'object' || Array.isArray(memory.portraitPhotos)) {
            memory.portraitPhotos = { schemaVersion: PHOTO_SCHEMA_VERSION, entries: {} };
        }
        const registry = memory.portraitPhotos;
        registry.schemaVersion = PHOTO_SCHEMA_VERSION;
        if (!registry.entries || typeof registry.entries !== 'object' || Array.isArray(registry.entries)) registry.entries = {};
        return registry;
    }

    function pruneRegistry(registry) {
        const entries = Object.values(registry.entries || {});
        if (entries.length <= MAX_ENTRIES) return;
        entries.sort((a, b) => Number(b.lastUsedTurn || 0) - Number(a.lastUsedTurn || 0));
        const keep = new Set(entries.slice(0, MAX_ENTRIES).map(item => item.key));
        Object.keys(registry.entries).forEach(key => { if (!keep.has(key)) delete registry.entries[key]; });
    }

    function ensurePhotoEntry(entity, state = getState()) {
        if (!isPersonEntity(entity, state) || !state?.worldMemory) return null;
        const registry = ensureRegistry(state);
        const profile = buildPhotoProfile(entity, state);
        let entry = registry.entries[profile.key];
        if (!entry || Number(entry.schemaVersion) !== PHOTO_SCHEMA_VERSION) {
            const reroll = 0;
            const seed = hashNumber(`${profile.key}|${profile.name}|${profile.era}|${profile.role}|${reroll}`);
            entry = registry.entries[profile.key] = {
                schemaVersion: PHOTO_SCHEMA_VERSION,
                key: profile.key,
                name: profile.name,
                profile,
                reroll,
                seed,
                url: buildPhotoUrl(profile, state, { seed, reroll }),
                createdAtTurn: Math.max(0, Number(state.worldMemory.turnCount) || 0),
                lastUsedTurn: Math.max(0, Number(state.worldMemory.turnCount) || 0)
            };
            pruneRegistry(registry);
        } else {
            entry.lastUsedTurn = Math.max(0, Number(state.worldMemory.turnCount) || 0);
        }
        return entry;
    }

    function rerollPhoto(nameOrEntity, state = getState()) {
        const entity = typeof nameOrEntity === 'object' ? nameOrEntity : findEntity(nameOrEntity, state);
        if (!entity || !state?.worldMemory) return null;
        const registry = ensureRegistry(state);
        const profile = buildPhotoProfile(entity, state);
        const previous = registry.entries[profile.key];
        const reroll = Math.max(0, Number(previous?.reroll) || 0) + 1;
        const seed = hashNumber(`${profile.key}|${profile.name}|${profile.era}|${profile.role}|${reroll}`);
        const entry = registry.entries[profile.key] = {
            schemaVersion: PHOTO_SCHEMA_VERSION,
            key: profile.key,
            name: profile.name,
            profile,
            reroll,
            seed,
            url: buildPhotoUrl(profile, state, { seed, reroll }),
            createdAtTurn: Number(previous?.createdAtTurn ?? state.worldMemory.turnCount) || 0,
            lastUsedTurn: Math.max(0, Number(state.worldMemory.turnCount) || 0)
        };
        return entry;
    }

    function labelFromImage(img, state = getState()) {
        const alt = clean(img?.getAttribute?.('alt'), 180);
        const title = clean(img?.getAttribute?.('title'), 180);
        const candidate = alt.replace(/^ritratto\s+di\s+/i, '').replace(/^portrait\s+of\s+/i, '').trim() || title;
        if (candidate && !/illustrazione|scena|mappa/i.test(candidate)) return candidate;
        if (img?.closest?.('#char-portrait, #topbar-protagonist-portrait, #story-intro-portrait')) return clean(state?.character?.name, 120);
        return '';
    }

    function loadPhoto(img) {
        if (!img || img.dataset.portraitPhotoLoaded === '1') return;
        const url = img.dataset.portraitPhotoUrl;
        if (!url) return;
        img.dataset.portraitPhotoLoaded = '1';
        if (!img.dataset.portraitFallbackSrc) img.dataset.portraitFallbackSrc = img.currentSrc || img.src || '';
        img.src = url;
        img.classList.add('portrait-photo');
    }

    function ensureIntersectionObserver(windowRef) {
        if (intersectionObserver || typeof windowRef?.IntersectionObserver !== 'function') return intersectionObserver;
        intersectionObserver = new windowRef.IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                intersectionObserver.unobserve(entry.target);
                loadPhoto(entry.target);
            });
        }, { rootMargin: '220px 0px' });
        return intersectionObserver;
    }

    function decorateImage(img, state = getState(), windowRef = root) {
        if (!img || !state?.worldMemory || img.dataset.portraitPhotoDecorated === '1') return false;
        if (!img.classList?.contains('portrait-image')) return false;
        if (img.classList.contains('portrait-choice-image') || img.closest?.('.portrait-choice')) return false;
        const label = labelFromImage(img, state);
        const entity = findEntity(label, state) || (label && keyOf(label) === keyOf(state?.character?.name) ? state.character : null);
        if (!entity || !isPersonEntity(entity, state)) return false;
        const entry = ensurePhotoEntry(entity, state);
        if (!entry?.url) return false;
        img.dataset.portraitPhotoDecorated = '1';
        img.dataset.portraitPhotoKey = entry.key;
        img.dataset.portraitPhotoUrl = entry.url;
        img.dataset.portraitFallbackSrc = img.currentSrc || img.src || '';
        img.decoding = 'async';
        img.loading = img.closest?.('#topbar-protagonist-portrait, #char-portrait, #story-intro-portrait') ? 'eager' : 'lazy';
        const observer = ensureIntersectionObserver(windowRef);
        if (observer && img.loading !== 'eager') observer.observe(img);
        else loadPhoto(img);
        return true;
    }

    function scanPortraits(documentRef, state = getState(), windowRef = root) {
        if (!documentRef || !state?.worldMemory) return 0;
        let count = 0;
        documentRef.querySelectorAll('img.portrait-image').forEach(img => {
            if (decorateImage(img, state, windowRef)) count++;
        });
        return count;
    }

    function resetRenderedIdentity(key, documentRef, state, windowRef) {
        documentRef.querySelectorAll(`img.portrait-image[data-portrait-photo-key="${String(key).replace(/"/g, '')}"]`).forEach(img => {
            img.dataset.portraitPhotoDecorated = '0';
            img.dataset.portraitPhotoLoaded = '0';
            const label = labelFromImage(img, state);
            const entity = findEntity(label, state) || state?.character;
            const entry = entity ? ensurePhotoEntry(entity, state) : null;
            if (!entry) return;
            img.dataset.portraitPhotoUrl = entry.url;
            img.classList.remove('portrait-photo-ready', 'portrait-photo-failed');
            loadPhoto(img);
        });
        scanPortraits(documentRef, state, windowRef);
    }

    function ensureCharacterReroll(documentRef, windowRef) {
        if (!documentRef || documentRef.getElementById(REROLL_ID)) return false;
        const header = documentRef.querySelector('#modal-character .char-header, .char-header');
        if (!header) return false;
        const button = documentRef.createElement('button');
        button.type = 'button';
        button.id = REROLL_ID;
        button.className = 'portrait-photo-reroll';
        button.textContent = '↻ Nuovo ritratto';
        button.title = 'Rigenera la foto mantenendo identità, ruolo ed epoca';
        button.addEventListener('click', () => {
            const state = getState();
            if (!state?.character) return;
            const entry = rerollPhoto(state.character, state);
            if (!entry) return;
            resetRenderedIdentity(entry.key, documentRef, state, windowRef);
        });
        header.appendChild(button);
        return true;
    }

    function stabilizeCharacterGender(state = getState()) {
        const character = state?.character;
        if (!character || normalizeGender(character.gender) !== 'any') return false;
        const gender = resolveGender(character, state);
        if (gender === 'male' || gender === 'female') {
            character.gender = gender;
            return true;
        }
        return false;
    }

    function installStyles(documentRef) {
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
        const style = documentRef.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            img.portrait-image.portrait-photo {
                object-fit: cover !important;
                object-position: 50% 28% !important;
                image-rendering: auto;
                background: radial-gradient(circle at 50% 30%, #6e5740, #25170f);
                filter: saturate(1.02) contrast(1.025);
            }
            img.portrait-image.portrait-photo.portrait-photo-ready {
                animation: cronachePortraitPhotoIn .24s ease-out both;
            }
            #char-portrait img.portrait-photo,
            #story-intro-portrait img.portrait-photo {
                width: 100%; height: 100%; object-fit: cover !important; object-position: 50% 24% !important;
            }
            #topbar-protagonist-portrait img.portrait-photo,
            .chat-avatar img.portrait-photo,
            .participant-portrait.portrait-photo,
            .chat-candidate-portrait.portrait-photo,
            .portrait-stack-item.portrait-photo {
                object-position: 50% 25% !important;
            }
            .portrait-photo-reroll {
                margin-top: 8px; padding: 6px 10px; min-height: 34px;
                border: 1px solid rgba(107,70,29,.25); border-radius: 999px;
                color: #5d4328; background: rgba(255,253,246,.75);
                font: 700 .72rem Arial, sans-serif; cursor: pointer; touch-action: manipulation;
            }
            .portrait-photo-reroll:active { transform: scale(.98); }
            @keyframes cronachePortraitPhotoIn { from { opacity:.45; transform:scale(1.025); } to { opacity:1; transform:scale(1); } }
            @media (prefers-reduced-motion: reduce) { img.portrait-image.portrait-photo.portrait-photo-ready { animation: none; } }
        `;
        documentRef.head.appendChild(style);
    }

    function installErrorHandling(documentRef) {
        if (!documentRef || documentRef.__portraitPhotosErrorHandling) return;
        documentRef.__portraitPhotosErrorHandling = true;
        documentRef.addEventListener('load', event => {
            const img = event.target;
            if (!(img instanceof HTMLImageElement) || !img.classList.contains('portrait-photo')) return;
            img.classList.add('portrait-photo-ready');
            img.classList.remove('portrait-photo-failed');
        }, true);
        documentRef.addEventListener('error', event => {
            const img = event.target;
            if (!(img instanceof HTMLImageElement) || !img.classList.contains('portrait-photo')) return;
            if (img.dataset.portraitPhotoFallbackApplied === '1') return;
            img.dataset.portraitPhotoFallbackApplied = '1';
            img.classList.add('portrait-photo-failed');
            img.classList.remove('portrait-photo', 'portrait-photo-ready');
            const fallback = img.dataset.portraitFallbackSrc;
            if (fallback && fallback !== img.src) img.src = fallback;
        }, true);
    }

    function observeDom(documentRef, windowRef) {
        if (domObserver || typeof windowRef?.MutationObserver !== 'function') return;
        domObserver = new windowRef.MutationObserver(mutations => {
            const state = getState();
            if (!state?.worldMemory) return;
            let found = false;
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node?.nodeType !== 1) return;
                    if (node.matches?.('img.portrait-image')) {
                        decorateImage(node, state, windowRef);
                        found = true;
                    }
                    node.querySelectorAll?.('img.portrait-image').forEach(img => {
                        decorateImage(img, state, windowRef);
                        found = true;
                    });
                });
            });
            if (found) ensureCharacterReroll(documentRef, windowRef);
        });
        domObserver.observe(documentRef.body, { childList: true, subtree: true });
    }

    function install(documentRef, windowRef) {
        if (!documentRef || !windowRef) return false;
        installStyles(documentRef);
        installErrorHandling(documentRef);
        const state = getState();
        if (state?.worldMemory) {
            stabilizeCharacterGender(state);
            scanPortraits(documentRef, state, windowRef);
            ensureCharacterReroll(documentRef, windowRef);
        }
        observeDom(documentRef, windowRef);
        documentRef.body?.classList.add('portrait-photos-ready');
        root.__cronachePortraitPhotosVersion = PATCH_VERSION;
        return true;
    }

    function scheduleInstall() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        const attempt = () => install(document, window);
        [0, 120, 400, 900, 1800, 3500, 6500].forEach(delay => window.setTimeout(attempt, delay));
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attempt, { once: true });
        if (!installTimer) installTimer = window.setTimeout(attempt, 8000);
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        PHOTO_SCHEMA_VERSION,
        MODEL,
        PHOTO_BASE,
        PHOTO_WIDTH,
        PHOTO_HEIGHT,
        clean,
        keyOf,
        hashNumber,
        normalizeGender,
        resolveGender,
        resolveEra,
        resolveRole,
        ageDescriptor,
        isPersonEntity,
        collectEntities,
        findEntity,
        identityKey,
        buildPhotoProfile,
        buildPhotoPrompt,
        buildPhotoUrl,
        ensureRegistry,
        ensurePhotoEntry,
        rerollPhoto,
        stabilizeCharacterGender,
        install
    };
});
