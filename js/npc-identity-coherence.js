(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheNpcIdentityCoherence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const PROMPT_MARKER = 'NPC_IDENTITY_GENDER_V1';
    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 320) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const keyOf = value => clean(value, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const MALE_NAMES = new Set([
        'lorenzo','andrea','cosimo','piero','giuliano','giovanni','francesco','tommaso','marco','matteo','mattia','luca','niccolo','nicola','filippo','alessandro','antonio','stefano','paolo','pietro','carlo','federico','guglielmo','leonardo','domenico','bernardo','jacopo','salvatore','vincenzo','michele','roberto','riccardo','enrico','edoardo','davide','daniele','simone','massimo','claudio','fabio','giorgio','sergio','umberto','alfonso','ferdinando','cesare','ottaviano','loris','hans','johann','friedrich','wilhelm','henry','william','john','james','george','charles','edward','thomas','robert','richard','michael','david','peter','paul','arthur','louis','jean','pierre','francois','jacques','philippe','carlos','juan','miguel','diego','pedro','fernando','jose','manuel'
    ]);
    const FEMALE_NAMES = new Set([
        'clarice','lucrezia','caterina','isabella','maria','bianca','contessina','maddalena','alessandra','beatrice','eleonora','francesca','anna','lucia','giulia','sofia','elena','paola','claudia','laura','chiara','silvia','valentina','vittoria','margherita','matilde','teresa','agnese','ginevra','costanza','camilla','elisabetta','carolina','rosa','emma','sara','alice','charlotte','elizabeth','mary','anne','catherine','margaret','victoria','jane','susan','emily','sophie','louise','marie','jeanne','madeleine','isabelle','carmen','lucia','ana','sofia','elena','teresa','ines','beatriz','catalina'
    ]);
    const CANONICAL_GENDER = new Map([
        ['lorenzo-de-medici', 'male'],
        ['lorenzo-de-medici-il-magnifico', 'male'],
        ['giuliano-de-medici', 'male'],
        ['cosimo-de-medici', 'male'],
        ['piero-de-medici', 'male'],
        ['clarice-orsini', 'female'],
        ['lucrezia-donati', 'female']
    ]);

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function normalizeGender(value) {
        const gender = keyOf(value);
        if (/^(female|femmina|donna|woman|f|she|she-her|lei)$/.test(gender)) return 'female';
        if (/^(male|maschio|uomo|man|m|he|he-him|lui)$/.test(gender)) return 'male';
        return 'any';
    }

    function genderFromName(name) {
        const full = keyOf(name);
        if (!full) return 'any';
        if (CANONICAL_GENDER.has(full)) return CANONICAL_GENDER.get(full);
        const tokens = full.split('-').filter(Boolean);
        const title = tokens[0] || '';
        if (/^(madonna|donna|signora|lady|queen|regina|principessa|duchessa|contessa|marchesa)$/.test(title)) return 'female';
        if (/^(messer|ser|signor|signore|lord|king|re|principe|duca|conte|marchese)$/.test(title)) return 'male';
        const first = tokens.find(token => !/^(messer|ser|madonna|donna|signor|signore|signora|lord|lady)$/.test(token)) || tokens[0];
        if (MALE_NAMES.has(first)) return 'male';
        if (FEMALE_NAMES.has(first)) return 'female';
        return 'any';
    }

    function genderFromText(entity) {
        const input = entity && typeof entity === 'object' ? entity : {};
        const strong = keyOf([
            input.role, input.historicalRole, input.title, input.relationship,
            input.familyRole, input.pronouns, input.sex
        ].filter(Boolean).join(' '));
        const weak = keyOf([input.description, input.appearance, input.visualDescription].filter(Boolean).join(' '));
        const femaleStrong = /(?:^|-)(duchessa|signora|donna|regina|principessa|madre|sorella|figlia|moglie|contessa|marchesa|badessa|monaca|suora|imperatrice|vedova|gentildonna|nobildonna|artigiana|banchiera|mercantessa|ancella|dama)(?:-|$)/;
        const maleStrong = /(?:^|-)(duca|signore|uomo|re|principe|padre|fratello|figlio|marito|conte|marchese|monaco|frate|imperatore|vedovo|gentiluomo|nobiluomo|artigiano|banchiere|mercante|condottiero|servo|cavaliere)(?:-|$)/;
        if (femaleStrong.test(strong)) return 'female';
        if (maleStrong.test(strong)) return 'male';
        const femaleWeak = /(?:^|-)(nata|sposata|vedova|figlia|madre|sorella|donna|gentildonna|nobildonna)(?:-|$)/;
        const maleWeak = /(?:^|-)(nato|sposato|vedovo|figlio|padre|fratello|uomo|gentiluomo|nobiluomo)(?:-|$)/;
        if (femaleWeak.test(weak) && !maleWeak.test(weak)) return 'female';
        if (maleWeak.test(weak) && !femaleWeak.test(weak)) return 'male';
        return 'any';
    }

    function inferGender(entity, state = getState()) {
        const input = entity && typeof entity === 'object' ? entity : { name: entity };
        const canonical = CANONICAL_GENDER.get(keyOf(input.name));
        if (canonical) return canonical;
        const declared = normalizeGender(input.gender || input.sex || input.pronouns);
        const fromText = genderFromText(input);
        const fromName = genderFromName(input.name);
        if (declared !== 'any') {
            if (fromText !== 'any' && fromText === fromName && declared !== fromText) return fromText;
            return declared;
        }
        if (fromText !== 'any') return fromText;
        if (fromName !== 'any') return fromName;
        if (state?.character && keyOf(input.name) === keyOf(state.character.name)) {
            const selected = normalizeGender(state.selectedGender || state.character.gender);
            if (selected !== 'any') return selected;
        }
        return 'any';
    }

    function objectValues(value) {
        if (!value || typeof value !== 'object') return [];
        return Array.isArray(value) ? value : Object.values(value);
    }

    function entityCollections(state = getState()) {
        const memory = state?.worldMemory || {};
        const businesses = asArray(memory?.management?.businesses).length ? asArray(memory.management.businesses) : asArray(memory.businesses);
        const rows = [
            ...asArray(memory?.world?.actors),
            ...asArray(memory.npcs),
            ...asArray(memory.family),
            ...asArray(memory.employees),
            ...objectValues(memory?.managementAgents?.agents),
            ...asArray(memory?.kingdom?.council)
        ];
        businesses.forEach(business => {
            rows.push(...asArray(business?.customers), ...asArray(business?.suppliers), ...asArray(business?.competitors));
        });
        return rows.filter(item => item && typeof item === 'object' && clean(item.name, 140));
    }

    function knownGenderMap(state = getState()) {
        const result = new Map();
        entityCollections(state).forEach(entity => {
            const key = keyOf(entity.name);
            if (!key) return;
            const gender = inferGender(entity, state);
            if (gender === 'any') return;
            const current = result.get(key);
            const explicit = normalizeGender(entity.gender || entity.sex || entity.pronouns) !== 'any';
            if (!current || explicit || CANONICAL_GENDER.has(key)) result.set(key, { gender, explicit });
        });
        return result;
    }

    function setGender(entity, gender, source = 'identity-coherence') {
        if (!entity || gender === 'any') return false;
        const current = normalizeGender(entity.gender);
        const canonical = CANONICAL_GENDER.get(keyOf(entity.name));
        if (current === gender && entity.genderSource) return false;
        if (current !== 'any' && current !== gender && !canonical) return false;
        entity.gender = gender;
        entity.genderSource = canonical ? 'canonical-name' : source;
        return true;
    }

    function stabilizeNpcGenders(state = getState()) {
        if (!state?.worldMemory) return 0;
        const entities = entityCollections(state);
        const map = knownGenderMap(state);
        let changed = 0;
        entities.forEach(entity => {
            const key = keyOf(entity.name);
            const gender = map.get(key)?.gender || inferGender(entity, state);
            if (setGender(entity, gender, 'inferred')) changed++;
        });
        asArray(state.worldMemory?.chats).forEach(thread => {
            asArray(thread?.messages).forEach(message => {
                const speaker = clean(message?.speaker, 140);
                if (!speaker) return;
                const gender = map.get(keyOf(speaker))?.gender || inferGender({
                    name: speaker,
                    gender: message.gender,
                    role: message.role || message.speakerRole,
                    description: message.description
                }, state);
                if (gender !== 'any' && normalizeGender(message.gender) !== gender) {
                    message.gender = gender;
                    changed++;
                }
            });
        });
        return changed;
    }

    function parseActorGenders(response) {
        const rows = [];
        const regex = /\[PERSONAGGIO_SETUP:\s*([^\]]+)\]/gi;
        let match;
        while ((match = regex.exec(String(response || '')))) {
            const parts = match[1].split('|').map(value => clean(value, 420));
            if (!parts[0]) continue;
            const gender = normalizeGender(parts[19]);
            rows.push({ name: parts[0], gender });
        }
        return rows;
    }

    function augmentBootstrapPrompt(base) {
        let text = String(base || '');
        if (!text || text.includes(PROMPT_MARKER)) return text;
        const oldTag = '[PERSONAGGIO_SETUP: nome|carica_o_ruolo|fazione_o_vuoto|descrizione|personalità|obiettivo_generale|strategia|risorse|influenza_0_100|relazione_col_protagonista|active|luogo|obiettivo_pubblico|obiettivo_privato|leva_concreta|vincoli|conoscenze|agenda|ruolo_storico]';
        const newTag = '[PERSONAGGIO_SETUP: nome|carica_o_ruolo|fazione_o_vuoto|descrizione|personalità|obiettivo_generale|strategia|risorse|influenza_0_100|relazione_col_protagonista|active|luogo|obiettivo_pubblico|obiettivo_privato|leva_concreta|vincoli|conoscenze|agenda|ruolo_storico|genere_male_female]';
        if (text.includes(oldTag)) text = text.replace(oldTag, newTag);
        return `${text}\n${PROMPT_MARKER}: Per OGNI PERSONAGGIO_SETUP compila il campo finale genere_male_female con male o female coerente con identità, nome, ruolo e canone. Per personaggi storici noti rispetta il sesso storico; non lasciare il campo vuoto e non dedurlo dall'immagine.`;
    }

    function applyParsedActorGenders(world, rows, context = {}) {
        if (!world || !Array.isArray(world.actors)) return 0;
        const byName = new Map(rows.filter(row => row.gender !== 'any').map(row => [keyOf(row.name), row.gender]));
        let changed = 0;
        world.actors.forEach(actor => {
            const explicit = byName.get(keyOf(actor.name));
            const gender = explicit || inferGender(actor, { currentStory: context.story, time: context.time });
            if (gender !== 'any' && normalizeGender(actor.gender) !== gender) {
                actor.gender = gender;
                actor.genderSource = explicit ? 'world-bootstrap' : 'inferred';
                changed++;
            }
        });
        return changed;
    }

    function propagateWorldGendersToMemory(world, memory) {
        if (!world?.actors || !memory) return 0;
        const actors = new Map(asArray(world.actors).map(actor => [keyOf(actor.name), actor]));
        let changed = 0;
        asArray(memory.npcs).forEach(npc => {
            const actor = actors.get(keyOf(npc?.name));
            const gender = normalizeGender(actor?.gender);
            if (gender !== 'any' && normalizeGender(npc.gender) !== gender) {
                npc.gender = gender;
                npc.genderSource = actor.genderSource || 'world-bootstrap';
                changed++;
            }
        });
        return changed;
    }

    function patchWorldBootstrap() {
        const bootstrap = root.CronacheWorldBootstrap;
        if (!bootstrap) return false;
        let patched = false;
        const originalPrompt = bootstrap.buildBootstrapPrompt;
        if (typeof originalPrompt === 'function' && !originalPrompt.__npcIdentityGenderWrapped) {
            const wrapped = function (context) { return augmentBootstrapPrompt(originalPrompt.call(this, context)); };
            wrapped.__npcIdentityGenderWrapped = true;
            wrapped.__npcIdentityGenderOriginal = originalPrompt;
            bootstrap.buildBootstrapPrompt = wrapped;
            patched = true;
        }
        const originalIngest = bootstrap.ingestResponse;
        if (typeof originalIngest === 'function' && !originalIngest.__npcIdentityGenderWrapped) {
            const wrapped = function (response, currentWorld, context) {
                const result = originalIngest.call(this, response, currentWorld, context);
                applyParsedActorGenders(result?.world, parseActorGenders(response), context || {});
                return result;
            };
            wrapped.__npcIdentityGenderWrapped = true;
            wrapped.__npcIdentityGenderOriginal = originalIngest;
            bootstrap.ingestResponse = wrapped;
            patched = true;
        }
        const originalProject = bootstrap.projectToMemory;
        if (typeof originalProject === 'function' && !originalProject.__npcIdentityGenderWrapped) {
            const wrapped = function (world, memory, context) {
                const result = originalProject.call(this, world, memory, context);
                propagateWorldGendersToMemory(world, result);
                return result;
            };
            wrapped.__npcIdentityGenderWrapped = true;
            wrapped.__npcIdentityGenderOriginal = originalProject;
            bootstrap.projectToMemory = wrapped;
            patched = true;
        }
        return patched;
    }

    function repairPortraitEntries(state = getState(), documentRef) {
        const photos = root.CronachePortraitPhotos;
        if (!photos || !state?.worldMemory) return 0;
        const registry = photos.ensureRegistry?.(state);
        if (!registry?.entries) return 0;
        let changed = 0;
        entityCollections(state).forEach(entity => {
            const expected = inferGender(entity, state);
            if (expected === 'any') return;
            const profile = photos.buildPhotoProfile?.(entity, state);
            const key = photos.identityKey?.(entity, state) || profile?.key;
            const entry = key ? registry.entries[key] : null;
            if (!entry || !profile) return;
            const oldGender = normalizeGender(entry.profile?.gender);
            if (oldGender === expected && normalizeGender(profile.gender) === expected) return;
            profile.gender = expected;
            entry.profile = { ...(entry.profile || {}), ...profile, gender: expected };
            entry.url = photos.buildPhotoUrl?.(entry.profile, state, { seed: entry.seed, reroll: entry.reroll || 0 }) || entry.url;
            entry.identityRepair = `gender:${expected}`;
            entry.lastUsedTurn = Math.max(Number(entry.lastUsedTurn) || 0, Number(state.worldMemory.turnCount) || 0);
            if (documentRef && entry.url) {
                documentRef.querySelectorAll('img.portrait-image').forEach(img => {
                    const imageKey = img.dataset?.portraitPhotoKey;
                    const label = clean(img.getAttribute?.('alt'), 160).replace(/^ritratto\s+di\s+/i, '').trim();
                    if (imageKey !== key && keyOf(label) !== keyOf(entity.name)) return;
                    img.dataset.portraitPhotoKey = key;
                    img.dataset.portraitPhotoUrl = entry.url;
                    img.dataset.portraitPhotoLoaded = '1';
                    img.dataset.portraitPhotoFallbackApplied = '0';
                    img.classList.add('portrait-photo');
                    if (img.src !== entry.url) img.src = entry.url;
                });
            }
            changed++;
        });
        return changed;
    }

    function synchronize(state = getState(), documentRef) {
        const changedGenders = stabilizeNpcGenders(state);
        const repairedPortraits = repairPortraitEntries(state, documentRef);
        return { changedGenders, repairedPortraits };
    }

    function install(documentRef, windowRef) {
        patchWorldBootstrap();
        synchronize(getState(), documentRef);
        if (documentRef && !documentRef.__npcIdentityCoherenceInstalled) {
            documentRef.__npcIdentityCoherenceInstalled = true;
            documentRef.addEventListener('click', event => {
                if (!event.target?.closest?.('#btn-world-chat,#btn-top-npc,#btn-npc-registry,#btn-advance-world,#btn-simulate-timeline,.chat-thread,[data-npc-name],[data-participant]')) return;
                synchronize(getState(), documentRef);
            }, true);
        }
        if (windowRef) windowRef.__cronacheNpcIdentityCoherenceVersion = PATCH_VERSION;
        return true;
    }

    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
        const attempt = () => install(document, window);
        [0,120,500,1400,3200].forEach(delay => window.setTimeout(attempt, delay));
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attempt, { once: true });
    }

    return {
        PATCH_VERSION,
        PROMPT_MARKER,
        normalizeGender,
        genderFromName,
        genderFromText,
        inferGender,
        entityCollections,
        knownGenderMap,
        stabilizeNpcGenders,
        parseActorGenders,
        augmentBootstrapPrompt,
        applyParsedActorGenders,
        propagateWorldGendersToMemory,
        patchWorldBootstrap,
        repairPortraitEntries,
        synchronize,
        install
    };
});