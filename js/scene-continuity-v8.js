(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheSceneContinuityV8 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const MAX_ACTORS = 3;
    const MIN_NARRATIVE_LENGTH = 140;

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 1800) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const keyOf = value => clean(value, 1800).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function imagesEnabled() {
        try {
            if (typeof root.sceneImagesEnabled === 'function') return root.sceneImagesEnabled();
            return localStorage.getItem('cdd-scene-images') !== 'off';
        } catch (_error) { return true; }
    }

    function actorPool(state = getState()) {
        const memory = state?.worldMemory || {};
        const rows = [state?.character, ...asArray(memory?.world?.actors), ...asArray(memory.npcs), ...asArray(memory.family), ...asArray(memory.employees)].filter(Boolean);
        const seen = new Set();
        return rows.filter(entity => {
            const name = keyOf(entity?.name);
            if (!name || seen.has(name)) return false;
            if (root.CronachePortraitPhotos?.isPersonEntity && !root.CronachePortraitPhotos.isPersonEntity(entity, state)) return false;
            seen.add(name);
            return true;
        });
    }

    function nameMentioned(entity, narrative) {
        const text = keyOf(narrative);
        const full = keyOf(entity?.name);
        if (!full || !text) return false;
        if (text.includes(full)) return true;
        const tokens = full.split('-').filter(token => token.length >= 4);
        return tokens.length >= 2 && tokens.filter(token => text.includes(token)).length >= 2;
    }

    function selectActors(narrative, state = getState()) {
        const pool = actorPool(state);
        const protagonistKey = keyOf(state?.character?.name);
        const mentioned = pool.filter(entity => nameMentioned(entity, narrative));
        const local = pool.filter(entity => keyOf(entity?.location) && keyOf(entity.location) === keyOf(state?.currentLocation));
        const chosen = [];
        const add = entity => {
            if (!entity || chosen.some(item => keyOf(item.name) === keyOf(entity.name))) return;
            chosen.push(entity);
        };
        mentioned.forEach(add);
        if (protagonistKey && !chosen.some(item => keyOf(item.name) === protagonistKey)) add(state.character);
        local.forEach(add);
        return chosen.slice(0, MAX_ACTORS);
    }

    function emotionalCue(narrative, entity) {
        const text = keyOf(narrative);
        const name = keyOf(entity?.name);
        const near = name && text.includes(name) ? text.slice(Math.max(0, text.indexOf(name) - 180), text.indexOf(name) + name.length + 240) : text;
        if (/furios|rabbia|ira|infuri|grida|minaccia|ostile/.test(near)) return 'tense or angry expression appropriate to the scene';
        if (/paura|terroriz|spavent|panico|teme|timore/.test(near)) return 'visibly worried or fearful expression appropriate to the scene';
        if (/stanc|esaust|affatic|sfinito|insonne/.test(near)) return 'tired expression and posture, without changing identity';
        if (/sorride|felice|gioia|soddisfatt|sollevat/.test(near)) return 'subtle relieved or pleased expression appropriate to the scene';
        if (/sospett|diffid|calcola|fredd|prudente|teso/.test(near)) return 'guarded, calculating expression appropriate to the scene';
        return 'natural expression matching the current scene';
    }

    function profileFor(entity, state = getState()) {
        try {
            const evolved = root.CronachePortraitEvolution?.buildEvolvedProfile?.(entity, state);
            if (evolved) return evolved;
        } catch (_error) { }
        try { return root.CronachePortraitPhotos?.buildPhotoProfile?.(entity, state) || null; } catch (_error) { return null; }
    }

    function actorDescriptor(entity, narrative, state = getState()) {
        const profile = profileFor(entity, state) || {};
        const gender = profile.gender === 'male' ? 'man' : profile.gender === 'female' ? 'woman' : 'person';
        const parts = [
            clean(profile.name || entity?.name, 120),
            gender,
            clean(profile.age, 80),
            clean(profile.role || entity?.role, 120),
            profile.faction ? `affiliation ${clean(profile.faction, 120)}` : '',
            profile.appearance ? `fixed appearance: ${clean(profile.appearance, 420)}` : '',
            emotionalCue(narrative, entity),
            'same recurring person as previous portraits and scenes; preserve gender, age range, facial structure, hair, complexion and distinctive features'
        ].filter(Boolean);
        return parts.join(', ');
    }

    function buildContinuityPrompt(narrative, state = getState()) {
        const visuals = root.CronacheStoryVisuals;
        const story = state?.currentStory || {};
        const location = clean(state?.currentLocation || state?.worldMemory?.world?.startLocation, 120);
        const year = state?.time?.year || story?.startTime?.year || '';
        const actors = selectActors(narrative, state).map(entity => actorDescriptor(entity, narrative, state));
        const base = typeof visuals?.buildNarrativePrompt === 'function'
            ? visuals.buildNarrativePrompt(narrative, state)
            : `cinematic story illustration, ${clean(narrative, 900)}`;
        return [
            base,
            year ? `continuity year ${year}` : '',
            location ? `continuity location ${location}` : '',
            actors.length ? `CHARACTER CONTINUITY REFERENCES: ${actors.join(' ; ')}` : '',
            actors.length ? 'do not swap a recurring character for a different gender, age, ethnicity, hairstyle or face archetype; no duplicate versions of the same named person' : '',
            'expressions and posture may change with the moment, but identity must remain recognizable',
            'historical clothing and rank may evolve only when established by the game state'
        ].filter(Boolean).join(', ');
    }

    function createFigure(url, alt) {
        if (!url || typeof document === 'undefined') return null;
        const figure = document.createElement('figure');
        figure.className = 'story-scene-visual loading';
        figure.dataset.sceneContinuityV8 = '1';
        const img = document.createElement('img');
        img.src = url;
        img.alt = clean(alt, 180) || 'Scena della storia';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.onload = () => { figure.classList.remove('loading'); figure.classList.add('loaded'); };
        img.onerror = () => figure.remove();
        figure.appendChild(img);
        return figure;
    }

    function attach(entry, narrative, state = getState(), replaceExisting = false) {
        if (!entry || !imagesEnabled()) return false;
        const text = clean(narrative, 8000);
        if (text.length < MIN_NARRATIVE_LENGTH) return false;
        const existing = entry.querySelector('.story-scene-visual');
        if (existing && !replaceExisting) return false;
        if (existing) existing.remove();
        const visuals = root.CronacheStoryVisuals;
        if (typeof visuals?.buildFreeFluxUrl !== 'function') return false;
        const prompt = buildContinuityPrompt(text, state);
        const turn = Number(state?.worldMemory?.turnCount || 0);
        const seed = typeof visuals.hashNumber === 'function'
            ? visuals.hashNumber(`${state?.currentStory?.title || ''}|${turn}|${text}|continuity-v8`)
            : Date.now();
        const url = visuals.buildFreeFluxUrl(prompt, { width: visuals.STORY_WIDTH || 1152, height: visuals.STORY_HEIGHT || 648, seed });
        const figure = createFigure(url, `Scena a ${clean(state?.currentLocation, 100)}`);
        if (!figure) return false;
        entry.prepend(figure);
        return true;
    }

    function installStoryWrapper() {
        const current = root.addStoryEntry;
        if (typeof current !== 'function' || current.__phase8SceneContinuityWrapped) return false;
        const base = current.__storyVisualsWrapped && typeof current.__storyVisualsOriginal === 'function'
            ? current.__storyVisualsOriginal : current;
        const wrapped = function phase8SceneContinuityEntry(text, type, log = true) {
            const result = base.apply(this, arguments);
            if (type === 'narrator' && log !== false && imagesEnabled()) {
                const state = getState();
                if (typeof root.setTimeout === 'function') root.setTimeout(() => {
                    const entries = document.querySelectorAll('#story-scroll .story-entry.narrator');
                    const entry = entries[entries.length - 1];
                    attach(entry, text, state);
                }, 0);
            }
            return result;
        };
        wrapped.__phase8SceneContinuityWrapped = true;
        wrapped.__phase8SceneContinuityOriginal = current;
        root.addStoryEntry = wrapped;
        return true;
    }

    function installEventImageWrapper() {
        const current = root.buildSceneImageUrl;
        if (typeof current !== 'function' || current.__phase8SceneContinuityWrapped) return false;
        const wrapped = function phase8SceneImageUrl(prompt) {
            const state = getState();
            const actors = selectActors(prompt, state).map(entity => actorDescriptor(entity, prompt, state));
            const enriched = actors.length
                ? `${clean(prompt, 1800)}, recurring character continuity: ${actors.join(' ; ')}, preserve the same identities and genders`
                : prompt;
            return current.call(this, enriched);
        };
        wrapped.__phase8SceneContinuityWrapped = true;
        wrapped.__phase8SceneContinuityOriginal = current;
        root.buildSceneImageUrl = wrapped;
        return true;
    }

    function upgradeLatestNarrative() {
        if (typeof document === 'undefined') return false;
        const entries = document.querySelectorAll('#story-scroll .story-entry.narrator');
        const entry = entries[entries.length - 1];
        if (!entry) return false;
        const existing = entry.querySelector('.story-scene-visual');
        if (existing?.dataset?.sceneContinuityV8 === '1') return false;
        return attach(entry, clean(entry.innerText || entry.textContent, 8000), getState(), Boolean(existing));
    }

    function install() {
        if (root.__cronacheSceneContinuityV8Patch >= PATCH_VERSION) return true;
        root.__cronacheSceneContinuityV8Patch = PATCH_VERSION;
        installStoryWrapper();
        installEventImageWrapper();
        if (typeof root.setTimeout === 'function') {
            root.setTimeout(() => { installStoryWrapper(); installEventImageWrapper(); upgradeLatestNarrative(); }, 0);
            root.setTimeout(() => { installStoryWrapper(); installEventImageWrapper(); }, 900);
        }
        return true;
    }

    const api = { PATCH_VERSION, actorPool, selectActors, profileFor, actorDescriptor, buildContinuityPrompt, attach, install };
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
        else install();
    }
    return api;
});
