(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheCharacterLineage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 2;
    const SCHEMA_VERSION = 2;
    const PROMPT_MARKER = 'CASATA_PROTAGONISTA_COGNOME';
    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 240) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const keyOf = value => clean(value, 400).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function isSameName(left, right) {
        const a = keyOf(left), b = keyOf(right);
        if (!a || !b) return false;
        if (a === b) return true;
        const aa = a.split('-').filter(Boolean), bb = b.split('-').filter(Boolean);
        if (aa.length !== 1 && bb.length !== 1) return false;
        const short = aa.length === 1 ? aa[0] : bb[0];
        const long = aa.length === 1 ? bb : aa;
        return short.length >= 3 && long.includes(short);
    }

    function words(value) { return clean(value, 180).split(/\s+/).filter(Boolean); }

    function extractSurname(fullName) {
        const parts = words(fullName);
        if (parts.length < 2) return '';
        const particle = /^(?:da|de|de'|dei|degli|della|delle|del|di|du|des|van|von|of|la|le)$/i;
        let start = parts.length - 1;
        while (start > 0 && particle.test(parts[start - 1])) start--;
        return clean(parts.slice(start).join(' '), 100);
    }

    function surnameFromHouseName(value) {
        let name = clean(value, 160);
        if (!name) return '';
        name = name.replace(/^(?:la\s+)?(?:casata|casa|famiglia|dinastia|house|clan)\s+(?:di\s+)?/i, '').trim();
        name = name.replace(/^(?:dei|degli|delle|del|della|di)\s+/i, '').trim();
        return clean(name, 100);
    }

    function normalizeLineage(source, confidence = 'explicit') {
        const input = source && typeof source === 'object' ? source : {};
        const house = clean(input.house || input.casata || input.dynasty || input.family || input.familyName, 160);
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
        const [house, surname] = [parts[4], parts[5]];
        if (!house || !surname || /^(?:nessuna?|none|vuoto|-)$/.test(keyOf(house)) || /^(?:nessuna?|none|vuoto|-)$/.test(keyOf(surname))) return null;
        return normalizeLineage({ house, surname, source: 'world-bootstrap' }, 'generated');
    }

    function storyCorpus(state) {
        const story = state?.currentStory || {};
        return [story.title, story.name, story.desc, story.description, story.premise, story.intro, story.opening,
            story.scenario, story.protagonist, story.protagonistDescription, story.setting, story.notes]
            .map(value => clean(value, 1200)).filter(Boolean).join(' | ');
    }

    function textualStoryLineage(state) {
        const corpus = storyCorpus(state);
        if (!corpus) return null;
        const patterns = [
            /(?:appartien\w*|membro|erede|figli\w*|discendent\w*)\s+(?:alla|della|di una|della famiglia|della casata)?\s*(?:casata|casa|famiglia|dinastia)\s+(?:(dei|degli|delle|del|della|di)\s+)?([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,}(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,})?)/i,
            /(?:casata|casa|famiglia|dinastia)\s+(?:(dei|degli|delle|del|della|di)\s+)?([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,}(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,})?)/i
        ];
        for (const pattern of patterns) {
            const match = corpus.match(pattern);
            if (!match?.[2]) continue;
            const surname = surnameFromHouseName(match[2]);
            if (!surname) continue;
            const article = clean(match[1], 16);
            const house = `Casata ${article ? `${article} ` : ''}${surname}`.replace(/\s+/g, ' ').trim();
            return normalizeLineage({ house, surname, source: 'story-text' }, 'story');
        }
        return null;
    }

    function familyLineage(state) {
        const memory = state?.worldMemory || {};
        const relatives = [
            ...asArray(memory.family),
            ...asArray(memory?.world?.actors).filter(actor => /padre|madre|fratell|sorell|figli|cugin|zio|zia|parente|consorte|moglie|marito|family|familiare/i.test(`${actor?.role || ''} ${actor?.relationship || ''}`))
        ].filter(item => item?.name);
        const counts = new Map();
        relatives.forEach(item => {
            const surname = extractSurname(item.name);
            if (!surname) return;
            const key = keyOf(surname);
            const row = counts.get(key) || { surname, count: 0 };
            row.count++;
            counts.set(key, row);
        });
        const best = [...counts.values()].sort((a, b) => b.count - a.count)[0];
        return best ? normalizeLineage({ house: `Famiglia ${best.surname}`, surname: best.surname, source: 'known-family' }, best.count >= 2 ? 'strong' : 'family') : null;
    }

    function factionLineage(state) {
        const character = state?.character, memory = state?.worldMemory || {};
        if (!character?.name) return null;
        const factions = [...asArray(memory?.world?.factions), ...asArray(memory.factions)];
        const relations = asArray(memory?.world?.relations);
        const explicitHouse = clean(character.house || character.casata || character.dynasty || character.familyName, 160);
        let candidate = explicitHouse ? factions.find(item => keyOf(item?.name) === keyOf(explicitHouse)) : null;
        if (!candidate) {
            const linked = new Set();
            relations.forEach(relation => {
                const text = `${relation?.type || ''} ${relation?.description || ''}`;
                if (!/membro|appartien|famigli|casata|dinastia|erede|figli|discendent/i.test(text)) return;
                if (isSameName(relation?.from, character.name)) linked.add(keyOf(relation?.to));
                if (isSameName(relation?.to, character.name)) linked.add(keyOf(relation?.from));
            });
            candidate = factions.find(item => linked.has(keyOf(item?.name)) && /casata|famiglia|dinastia|house|clan|patrizi/i.test(`${item?.type || ''} ${item?.description || ''}`));
        }
        return candidate ? normalizeLineage({ house: candidate.name, surname: surnameFromHouseName(candidate.name), source: 'world-faction' }, 'strong') : null;
    }

    function storyLineage(state) {
        const story = state?.currentStory || {};
        return normalizeLineage({
            house: story.protagonistHouse || story.house || story.casata || story.dynasty,
            surname: story.protagonistSurname || story.surname || story.cognome,
            source: 'story'
        }, 'story') || textualStoryLineage(state);
    }

    function storedAutoLineage(state) {
        return normalizeLineage(state?.worldMemory?.characterLineage || state?.worldMemory?.world?.protagonistLineage, 'generated');
    }

    function detectLineage(state = getState()) {
        if (!state?.character) return null;
        const fromStory = storyLineage(state);
        if (fromStory) return fromStory;
        const character = state.character;
        const current = normalizeLineage({
            house: character.house || character.casata || character.dynasty || character.familyName,
            surname: character.surname || character.cognome,
            source: 'character'
        }, 'explicit');
        const stored = storedAutoLineage(state);
        const currentLooksAuto = Boolean(current && stored && keyOf(current.surname) === keyOf(stored.surname) && !/player|manual/.test(keyOf(stored.source)));
        if (current && !currentLooksAuto) return current;
        return stored || familyLineage(state) || factionLineage(state);
    }

    function preservePortraitSeed(state, oldName, newName) {
        if (!state?.worldMemory?.portraitPhotos?.entries || !state?.character) return;
        const registryRaw = state.worldMemory.portraitPhotos;
        const oldFallbackKey = `protagonist-${keyOf(oldName)}`;
        const newFallbackKey = `protagonist-${keyOf(newName)}`;
        const photos = root.CronachePortraitPhotos;
        if (!photos) {
            const previous = registryRaw.entries[oldFallbackKey] || Object.values(registryRaw.entries).find(entry => keyOf(entry?.name) === keyOf(oldName));
            if (previous && !registryRaw.entries[newFallbackKey]) {
                registryRaw.entries[newFallbackKey] = { ...previous, key: newFallbackKey, name: newName };
            }
            return;
        }
        const oldEntity = { ...state.character, name: oldName };
        const newEntity = { ...state.character, name: newName };
        const oldKey = photos.identityKey?.(oldEntity, state), newKey = photos.identityKey?.(newEntity, state);
        if (!oldKey || !newKey || oldKey === newKey) return;
        const registry = photos.ensureRegistry?.(state);
        const previous = registry?.entries?.[oldKey] || registryRaw.entries[oldFallbackKey];
        if (!previous || registry.entries[newKey]) return;
        const profile = photos.buildPhotoProfile?.(newEntity, state);
        registry.entries[newKey] = {
            ...previous, key: newKey, name: newName, profile: profile || previous.profile,
            url: profile ? (photos.buildPhotoUrl?.(profile, state, { seed: previous.seed, reroll: previous.reroll || 0 }) || previous.url) : previous.url
        };
    }

    function migrateProtagonistReferences(state, oldName, newName) {
        const memory = state?.worldMemory;
        if (!memory || !oldName || !newName) return 0;
        const oldKey = keyOf(oldName);
        let changed = 0;
        asArray(memory.chats).forEach(thread => {
            if (Array.isArray(thread.participants)) thread.participants = thread.participants.map(name => {
                const key = keyOf(name);
                if (key === oldKey || /^(protagonista|giocatore|player)$/.test(key)) { changed++; return newName; }
                return name;
            });
            asArray(thread.messages).forEach(message => {
                if (message?.source !== 'player' && message?.speakerType !== 'protagonista') return;
                if (keyOf(message.speaker) !== keyOf(newName)) { message.speaker = newName; changed++; }
            });
            asArray(thread.agreements).forEach(agreement => {
                if (Array.isArray(agreement.parties)) agreement.parties = agreement.parties.map(name => keyOf(name) === oldKey ? newName : name);
            });
        });
        return changed;
    }

    function applyLineage(state = getState(), lineage = detectLineage(state)) {
        if (!state?.character || !lineage?.surname) return false;
        const character = state.character;
        const currentName = clean(character.name, 160);
        if (!currentName) return false;
        const currentSurname = extractSurname(currentName);
        const previous = storedAutoLineage(state);
        const managed = Boolean(currentSurname && previous && keyOf(currentSurname) === keyOf(previous.surname) && !/player|manual/.test(keyOf(previous.source)));
        const givenName = clean(character.givenName || words(currentName)[0], 80);
        if (currentSurname && !managed) { character.givenName = givenName; return false; }
        const fullName = clean(`${givenName || currentName} ${lineage.surname}`, 160);
        character.house = lineage.house || lineage.surname;
        character.casata = character.house;
        character.surname = lineage.surname;
        character.cognome = lineage.surname;
        character.givenName = givenName || words(fullName)[0];
        preservePortraitSeed(state, currentName, fullName);
        if (state.worldMemory) {
            state.worldMemory.characterLineage = { ...lineage, managed: true, appliedAtTurn: Math.max(0, Number(state.worldMemory.turnCount) || 0) };
            if (state.worldMemory.world) state.worldMemory.world.protagonistLineage = { ...lineage, managed: true };
        }
        if (!fullName || fullName === currentName) return false;
        character.name = fullName;
        migrateProtagonistReferences(state, currentName, fullName);
        try { root.dispatchEvent?.(new CustomEvent('cronache:character-lineage-updated', { detail: { oldName: currentName, newName: fullName, lineage } })); } catch (_error) { }
        return true;
    }

    function augmentBootstrapPrompt(base) {
        const text = String(base || '');
        if (!text || text.includes(PROMPT_MARKER)) return text;
        return `${text}\n\n${PROMPT_MARKER}: La casata del protagonista è un dato della STORIA e del PERSONAGGIO, non della notorietà degli NPC. Se la premessa o la descrizione del protagonista nominano una casata/famiglia/dinastia, usa ESATTAMENTE quella. Non inventare una casata e non assegnare automaticamente Medici, Sforza, Borgia o altre famiglie famose solo perché compaiono nel mondo. Estendi il tag MONDO_SETUP con due campi finali opzionali: [MONDO_SETUP: nome_mondo|premessa|conflitto_centrale|posta_in_gioco|casata_protagonista_o_vuoto|cognome_formale_del_protagonista_o_vuoto]. Se la casata non è definita usa vuoto in entrambi i campi. Il cognome deve rispettare la forma storica/culturale della casata.`;
    }

    function patchWorldBootstrap() {
        const bootstrap = root.CronacheWorldBootstrap;
        if (!bootstrap) return false;
        let patched = false;
        const originalPrompt = bootstrap.buildBootstrapPrompt;
        if (typeof originalPrompt === 'function' && !originalPrompt.__lineageWrappedV2) {
            const wrapped = function (context) { return augmentBootstrapPrompt(originalPrompt.call(this, context)); };
            wrapped.__lineageWrappedV2 = true; wrapped.__lineageOriginal = originalPrompt; bootstrap.buildBootstrapPrompt = wrapped; patched = true;
        }
        const originalIngest = bootstrap.ingestResponse;
        if (typeof originalIngest === 'function' && !originalIngest.__lineageWrappedV2) {
            const wrapped = function (response, currentWorld, context) {
                const result = originalIngest.call(this, response, currentWorld, context);
                const state = getState();
                const chosen = (state && storyLineage(state)) || parseBootstrapLineage(response);
                if (chosen && result?.world) result.world.protagonistLineage = chosen;
                if (state?.character && chosen) applyLineage(state, chosen);
                return result;
            };
            wrapped.__lineageWrappedV2 = true; wrapped.__lineageOriginal = originalIngest; bootstrap.ingestResponse = wrapped; patched = true;
        }
        const originalProject = bootstrap.projectToMemory;
        if (typeof originalProject === 'function' && !originalProject.__lineageWrappedV2) {
            const wrapped = function (world, memory, context) {
                const result = originalProject.call(this, world, memory, context);
                const state = getState();
                if (state?.character) applyLineage(state);
                return result;
            };
            wrapped.__lineageWrappedV2 = true; wrapped.__lineageOriginal = originalProject; bootstrap.projectToMemory = wrapped; patched = true;
        }
        return patched;
    }

    function install(documentRef, windowRef) {
        patchWorldBootstrap();
        const state = getState();
        if (state?.character) applyLineage(state);
        if (documentRef && !documentRef.__characterLineageInstalledV2) {
            documentRef.__characterLineageInstalledV2 = true;
            documentRef.addEventListener('click', event => {
                if (event.target?.closest?.('#btn-top-character,#btn-advance-world,#btn-simulate-timeline,#btn-world-chat')) applyLineage(getState());
            }, true);
        }
        if (windowRef) windowRef.__cronacheCharacterLineageVersion = PATCH_VERSION;
        return true;
    }

    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
        const attempt = () => install(document, window);
        [0,80,250,700,1600,3200].forEach(delay => window.setTimeout(attempt, delay));
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attempt, { once:true });
    }

    return { PATCH_VERSION, SCHEMA_VERSION, clean, keyOf, isSameName, extractSurname, surnameFromHouseName, normalizeLineage, parseBootstrapLineage, storyCorpus, textualStoryLineage, familyLineage, factionLineage, storyLineage, detectLineage, storedAutoLineage, migrateProtagonistReferences, applyLineage, augmentBootstrapPrompt, patchWorldBootstrap, install };
});