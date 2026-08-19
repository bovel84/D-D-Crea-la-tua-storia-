(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheCharacterLineage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const SCHEMA_VERSION = 1;
    const PROMPT_MARKER = 'CASATA_PROTAGONISTA_COGNOME';

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 240) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f\[\]]/g, ' ')
        .replace(/\s+/g, ' ').trim().slice(0, max);
    const keyOf = value => clean(value, 400).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function isSameName(left, right) {
        const a = keyOf(left);
        const b = keyOf(right);
        if (!a || !b) return false;
        if (a === b) return true;
        const aa = a.split('-').filter(Boolean);
        const bb = b.split('-').filter(Boolean);
        if (aa.length !== 1 && bb.length !== 1) return false;
        const short = aa.length === 1 ? aa[0] : bb[0];
        const long = aa.length === 1 ? bb : aa;
        return short.length >= 3 && long.includes(short);
    }

    function words(value) {
        return clean(value, 160).split(/\s+/).filter(Boolean);
    }

    function extractSurname(fullName) {
        const parts = words(fullName);
        if (parts.length < 2) return '';
        const particles = /^(?:da|de|de'|dei|degli|della|delle|del|di|du|des|van|von|of|la|le)$/i;
        let start = parts.length - 1;
        while (start > 0 && particles.test(parts[start - 1])) start--;
        return clean(parts.slice(start).join(' '), 100);
    }

    function surnameFromHouseName(value) {
        let name = clean(value, 140);
        if (!name) return '';
        name = name.replace(/^(?:la\s+)?(?:casata|casa|famiglia|dinastia|house|clan)\s+(?:di\s+)?/i, '').trim();
        name = name.replace(/^(?:dei|degli|delle)\s+/i, '').trim();
        return clean(name, 100);
    }

    function normalizeLineage(source, confidence = 'explicit') {
        const input = source && typeof source === 'object' ? source : {};
        const house = clean(input.house || input.casata || input.dynasty || input.family || input.familyName, 140);
        const surname = clean(input.surname || input.cognome || input.formalSurname || surnameFromHouseName(house), 100);
        if (!surname) return null;
        return {
            schemaVersion: SCHEMA_VERSION,
            house: house || surname,
            surname,
            confidence: clean(input.confidence || confidence, 30) || confidence,
            source: clean(input.source || 'lineage', 60)
        };
    }

    function parseBootstrapLineage(response) {
        const match = String(response || '').match(/\[MONDO_SETUP:\s*([^\]]+)\]/i);
        if (!match) return null;
        const parts = match[1].split('|').map(item => clean(item, 280));
        if (parts.length < 6) return null;
        const house = parts[4];
        const surname = parts[5];
        if (!house || !surname || /^(?:nessuna?|none|vuoto|-)$/.test(keyOf(house)) || /^(?:nessuna?|none|vuoto|-)$/.test(keyOf(surname))) return null;
        return normalizeLineage({ house, surname, source: 'world-bootstrap' }, 'explicit');
    }

    function familyLineage(state) {
        const memory = state?.worldMemory || {};
        const relatives = [
            ...asArray(memory.family),
            ...asArray(memory?.world?.actors).filter(actor => /padre|madre|fratell|sorell|figli|cugin|zio|zia|parente|consorte|moglie|marito|family|familiare/i.test(`${actor?.role || ''} ${actor?.relationship || ''}`))
        ].filter(item => item?.name);
        const surnames = new Map();
        relatives.forEach(item => {
            const surname = extractSurname(item.name);
            if (!surname) return;
            const key = keyOf(surname);
            const row = surnames.get(key) || { surname, count: 0 };
            row.count++;
            surnames.set(key, row);
        });
        const best = [...surnames.values()].sort((a, b) => b.count - a.count)[0];
        if (!best || best.count < 1) return null;
        return normalizeLineage({ house: best.surname, surname: best.surname, source: 'known-family' }, best.count >= 2 ? 'strong' : 'family');
    }

    function factionLineage(state) {
        const character = state?.character;
        const memory = state?.worldMemory || {};
        if (!character?.name) return null;
        const factions = [...asArray(memory?.world?.factions), ...asArray(memory.factions)];
        const relations = asArray(memory?.world?.relations);
        const explicitHouse = clean(character.house || character.casata || character.dynasty || character.familyName, 140);
        let candidate = explicitHouse
            ? factions.find(item => keyOf(item?.name) === keyOf(explicitHouse))
            : null;
        if (!candidate) {
            const linkedNames = new Set();
            relations.forEach(relation => {
                const text = `${relation?.type || ''} ${relation?.description || ''}`;
                if (!/membro|appartien|famigli|casata|dinastia|erede|figli|discendent/i.test(text)) return;
                if (isSameName(relation?.from, character.name)) linkedNames.add(keyOf(relation?.to));
                if (isSameName(relation?.to, character.name)) linkedNames.add(keyOf(relation?.from));
            });
            candidate = factions.find(item => linkedNames.has(keyOf(item?.name)) && /casata|famiglia|dinastia|house|clan|patrizi/i.test(`${item?.type || ''} ${item?.description || ''}`));
        }
        if (!candidate) return null;
        return normalizeLineage({ house: candidate.name, surname: surnameFromHouseName(candidate.name), source: 'world-faction' }, 'strong');
    }

    function storyLineage(state) {
        const story = state?.currentStory || {};
        const explicit = normalizeLineage({
            house: story.protagonistHouse || story.house || story.casata || story.dynasty,
            surname: story.protagonistSurname || story.surname || story.cognome,
            source: 'story'
        }, 'explicit');
        if (explicit) return explicit;
        return null;
    }

    function detectLineage(state = getState()) {
        if (!state?.character) return null;
        const character = state.character;
        const explicit = normalizeLineage({
            house: character.house || character.casata || character.dynasty || character.familyName,
            surname: character.surname || character.cognome,
            source: 'character'
        }, 'explicit');
        if (explicit) return explicit;
        const worldStored = normalizeLineage(state?.worldMemory?.world?.protagonistLineage || state?.worldMemory?.characterLineage, 'explicit');
        if (worldStored) return worldStored;
        return storyLineage(state) || familyLineage(state) || factionLineage(state);
    }

    function preservePortraitSeed(state, oldName, newName) {
        const photos = root.CronachePortraitPhotos;
        if (!photos || !state?.worldMemory?.portraitPhotos?.entries || !state?.character) return;
        const oldEntity = { ...state.character, name: oldName };
        const newEntity = { ...state.character, name: newName };
        const oldKey = photos.identityKey?.(oldEntity, state);
        const newKey = photos.identityKey?.(newEntity, state);
        if (!oldKey || !newKey || oldKey === newKey) return;
        const registry = photos.ensureRegistry?.(state);
        const previous = registry?.entries?.[oldKey];
        if (!previous || registry.entries[newKey]) return;
        const profile = photos.buildPhotoProfile?.(newEntity, state);
        if (!profile) return;
        registry.entries[newKey] = {
            ...previous,
            key: newKey,
            name: newName,
            profile,
            url: photos.buildPhotoUrl?.(profile, state, { seed: previous.seed, reroll: previous.reroll || 0 }) || previous.url
        };
    }

    function migrateProtagonistReferences(state, oldName, newName) {
        const memory = state?.worldMemory;
        if (!memory || !oldName || !newName) return 0;
        const oldKey = keyOf(oldName);
        let changed = 0;
        asArray(memory.chats).forEach(thread => {
            if (Array.isArray(thread.participants)) {
                thread.participants = thread.participants.map(name => {
                    const key = keyOf(name);
                    if (key === oldKey || /^(protagonista|giocatore|player)$/.test(key)) {
                        changed++;
                        return newName;
                    }
                    return name;
                });
            }
            asArray(thread.messages).forEach(message => {
                const protagonistMessage = message?.source === 'player' || message?.speakerType === 'protagonista';
                if (!protagonistMessage) return;
                if (keyOf(message.speaker) !== keyOf(newName)) {
                    message.speaker = newName;
                    changed++;
                }
            });
            asArray(thread.agreements).forEach(agreement => {
                if (!Array.isArray(agreement.parties)) return;
                agreement.parties = agreement.parties.map(name => keyOf(name) === oldKey ? newName : name);
            });
        });
        return changed;
    }

    function applyLineage(state = getState(), lineage = detectLineage(state)) {
        if (!state?.character || !lineage?.surname) return false;
        const character = state.character;
        const currentName = clean(character.name, 140);
        if (!currentName) return false;
        const currentSurname = extractSurname(currentName);
        character.house = lineage.house || character.house || lineage.surname;
        character.casata = character.house;
        character.surname = lineage.surname;
        character.cognome = lineage.surname;
        character.givenName = clean(character.givenName || words(currentName)[0], 80);
        if (state.worldMemory) {
            state.worldMemory.characterLineage = { ...lineage, appliedAtTurn: Math.max(0, Number(state.worldMemory.turnCount) || 0) };
            if (state.worldMemory.world) state.worldMemory.world.protagonistLineage = { ...lineage };
        }
        if (currentSurname) return false; // Un nome completo inserito dal giocatore non viene sovrascritto.
        const fullName = clean(`${currentName} ${lineage.surname}`, 140);
        if (!fullName || fullName === currentName) return false;
        preservePortraitSeed(state, currentName, fullName);
        character.name = fullName;
        migrateProtagonistReferences(state, currentName, fullName);
        try {
            root.dispatchEvent?.(new CustomEvent('cronache:character-lineage-updated', { detail: { oldName: currentName, newName: fullName, lineage } }));
        } catch (_error) { }
        return true;
    }

    function augmentBootstrapPrompt(base) {
        const text = String(base || '');
        if (!text || text.includes(PROMPT_MARKER)) return text;
        return `${text}\n\n${PROMPT_MARKER}: Se la premessa stabilisce che il protagonista appartiene a una casata, famiglia o dinastia, il suo cognome deve derivare da quella casata. Non inventare una casata solo per aggiungere un cognome. Estendi il tag MONDO_SETUP con due campi finali opzionali: [MONDO_SETUP: nome_mondo|premessa|conflitto_centrale|posta_in_gioco|casata_protagonista_o_vuoto|cognome_formale_del_protagonista_o_vuoto]. Se la casata non è definita usa vuoto in entrambi i campi. Il cognome deve rispettare la forma storica/culturale corretta (es. particelle come de', di, von solo quando pertinenti).`;
    }

    function patchWorldBootstrap() {
        const bootstrap = root.CronacheWorldBootstrap;
        if (!bootstrap) return false;
        let patched = false;
        const originalPrompt = bootstrap.buildBootstrapPrompt;
        if (typeof originalPrompt === 'function' && !originalPrompt.__lineageWrapped) {
            const wrappedPrompt = function characterLineagePrompt(context) {
                return augmentBootstrapPrompt(originalPrompt.call(this, context));
            };
            wrappedPrompt.__lineageWrapped = true;
            wrappedPrompt.__lineageOriginal = originalPrompt;
            bootstrap.buildBootstrapPrompt = wrappedPrompt;
            patched = true;
        }
        const originalIngest = bootstrap.ingestResponse;
        if (typeof originalIngest === 'function' && !originalIngest.__lineageWrapped) {
            const wrappedIngest = function characterLineageIngest(response, currentWorld, context) {
                const result = originalIngest.call(this, response, currentWorld, context);
                const parsed = parseBootstrapLineage(response);
                if (parsed && result?.world) result.world.protagonistLineage = parsed;
                const state = getState();
                if (state?.character && result?.world) {
                    applyLineage({ ...state, worldMemory: { ...(state.worldMemory || {}), world: result.world } }, parsed || null);
                }
                return result;
            };
            wrappedIngest.__lineageWrapped = true;
            wrappedIngest.__lineageOriginal = originalIngest;
            bootstrap.ingestResponse = wrappedIngest;
            patched = true;
        }
        const originalProject = bootstrap.projectToMemory;
        if (typeof originalProject === 'function' && !originalProject.__lineageWrapped) {
            const wrappedProject = function characterLineageProject(world, memory, context) {
                const result = originalProject.call(this, world, memory, context);
                const state = getState();
                if (state?.character) applyLineage(state);
                return result;
            };
            wrappedProject.__lineageWrapped = true;
            wrappedProject.__lineageOriginal = originalProject;
            bootstrap.projectToMemory = wrappedProject;
            patched = true;
        }
        return patched;
    }

    function install(documentRef, windowRef) {
        patchWorldBootstrap();
        const state = getState();
        if (state?.character) applyLineage(state);
        if (documentRef && !documentRef.__characterLineageInstalled) {
            documentRef.__characterLineageInstalled = true;
            documentRef.addEventListener('click', event => {
                if (!event.target?.closest?.('#btn-top-character, #btn-advance-world, #btn-simulate-timeline, #btn-world-chat')) return;
                applyLineage(getState());
            }, true);
        }
        if (windowRef) windowRef.__cronacheCharacterLineageVersion = PATCH_VERSION;
        return true;
    }

    function scheduleInstall() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        const attempt = () => install(document, window);
        [0, 80, 250, 700, 1600, 3200].forEach(delay => window.setTimeout(attempt, delay));
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attempt, { once: true });
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        SCHEMA_VERSION,
        clean,
        keyOf,
        isSameName,
        extractSurname,
        surnameFromHouseName,
        normalizeLineage,
        parseBootstrapLineage,
        familyLineage,
        factionLineage,
        storyLineage,
        detectLineage,
        migrateProtagonistReferences,
        applyLineage,
        augmentBootstrapPrompt,
        patchWorldBootstrap,
        install
    };
});