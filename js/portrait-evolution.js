(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronachePortraitEvolution = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const SCHEMA_VERSION = 1;
    const STYLE_ID = 'cronache-portrait-evolution-style';
    const DOSSIER_SECTION_ID = 'npc-dossier-evolution';
    const MAX_PEOPLE = 100;
    const MAX_EVENTS_SCAN = 90;

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 800) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ').trim().slice(0, max);
    const keyOf = value => clean(value, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const number = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

    let domObserver = null;
    let patchTimer = null;

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function photoApi() {
        return root.CronachePortraitPhotos || null;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function sameName(left, right) {
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

    function currentYear(state = getState()) {
        const direct = number(state?.time?.year, null);
        if (direct != null) return Math.trunc(direct);
        const start = number(state?.currentStory?.startTime?.year, null);
        if (start != null) return Math.trunc(start);
        const context = clean(state?.worldMemory?.world?.historicalContext?.date, 120);
        const match = context.match(/\b(-?\d{3,4})\b/);
        return match ? Number(match[1]) : null;
    }

    function yearFromText(value) {
        const text = clean(value, 160);
        const match = text.match(/\b(1\d{3}|20\d{2}|[5-9]\d{2})\b/);
        return match ? Number(match[1]) : null;
    }

    function eventText(event) {
        return clean([
            event?.title, event?.summary, event?.consequence, event?.cause,
            event?.politicalShift, event?.stakes
        ].filter(Boolean).join(' '), 3400);
    }

    function eventMentionsEntity(event, entity) {
        const name = clean(entity?.name, 120);
        if (!name || !event) return false;
        if (asArray(event.actors).some(actor => sameName(actor, name))) return true;
        const corpus = keyOf(eventText(event));
        const whole = keyOf(name);
        if (whole && corpus.includes(whole)) return true;
        const tokens = whole.split('-').filter(token => token.length >= 4);
        return tokens.length >= 2 && tokens.filter(token => corpus.includes(token)).length >= 2;
    }

    function matchingEvents(entity, state = getState()) {
        return asArray(state?.worldMemory?.events)
            .slice(-MAX_EVENTS_SCAN)
            .filter(event => eventMentionsEntity(event, entity));
    }

    function inferFirstSeenYear(entity, state = getState()) {
        const explicit = number(entity?.firstSeenYear ?? entity?.createdAtYear ?? entity?.metYear, null);
        if (explicit != null) return Math.trunc(explicit);
        const datedEvents = matchingEvents(entity, state)
            .map(event => yearFromText(event?.occurredAt || event?.date || event?.moment))
            .filter(value => value != null);
        if (datedEvents.length) return Math.min(...datedEvents);
        const storyStart = number(state?.currentStory?.startTime?.year, null);
        const createdTurn = number(entity?.createdAtTurn ?? entity?.metAt, null);
        if (storyStart != null && (createdTurn == null || createdTurn <= 1 || entity?.worldSeed)) return Math.trunc(storyStart);
        return currentYear(state);
    }

    function ensureRegistry(state = getState()) {
        if (!state?.worldMemory) return { schemaVersion: SCHEMA_VERSION, people: {} };
        const memory = state.worldMemory;
        if (!memory.portraitEvolution || typeof memory.portraitEvolution !== 'object' || Array.isArray(memory.portraitEvolution)) {
            memory.portraitEvolution = { schemaVersion: SCHEMA_VERSION, people: {} };
        }
        const registry = memory.portraitEvolution;
        registry.schemaVersion = SCHEMA_VERSION;
        if (!registry.people || typeof registry.people !== 'object' || Array.isArray(registry.people)) registry.people = {};
        return registry;
    }

    function identityKey(entity, state = getState()) {
        return photoApi()?.identityKey?.(entity, state) || `npc-${keyOf(entity?.name) || 'personaggio'}`;
    }

    function ensureEvolutionEntry(entity, state = getState()) {
        if (!entity || !state?.worldMemory) return null;
        const api = photoApi();
        if (api?.isPersonEntity && !api.isPersonEntity(entity, state)) return null;
        const registry = ensureRegistry(state);
        const key = identityKey(entity, state);
        let entry = registry.people[key];
        if (!entry || Number(entry.schemaVersion) !== SCHEMA_VERSION) {
            entry = registry.people[key] = {
                schemaVersion: SCHEMA_VERSION,
                key,
                name: clean(entity.name, 120),
                firstSeenYear: inferFirstSeenYear(entity, state),
                baseRole: clean(entity.role || entity.historicalRole || entity.archetype, 120),
                baseFaction: clean(entity.faction || entity.organization, 120),
                baseAge: number(entity.age ?? entity.eta, null),
                lastSignature: '',
                lastUpdatedTurn: Math.max(0, number(state.worldMemory.turnCount, 0))
            };
        }
        entry.lastUpdatedTurn = Math.max(0, number(state.worldMemory.turnCount, 0));
        const entries = Object.values(registry.people);
        if (entries.length > MAX_PEOPLE) {
            entries.sort((a, b) => number(b.lastUpdatedTurn, 0) - number(a.lastUpdatedTurn, 0));
            const keep = new Set(entries.slice(0, MAX_PEOPLE).map(item => item.key));
            Object.keys(registry.people).forEach(itemKey => { if (!keep.has(itemKey)) delete registry.people[itemKey]; });
        }
        return entry;
    }

    function injuryDescriptor(text) {
        const corpus = keyOf(text);
        if (/amput|perde-un-occhio|perde-l-occhio|mutil|sfregiat/.test(corpus)) return { key: 'major', label: 'Segno permanente', prompt: 'a clearly visible but non-graphic permanent injury consistent with prior events; preserve the same face and identity' };
        if (/ustion|bruciat|cicatric|scar/.test(corpus)) return { key: 'scar', label: 'Cicatrice', prompt: 'a healed visible scar consistent with prior events, subtle and non-graphic; preserve the same core facial geometry' };
        if (/frattur|zopp|bendagg|fasciat|ferit|wound|colpit|accoltell|freccia/.test(corpus)) return { key: 'wounded', label: 'Ferita recente', prompt: 'a recent non-graphic injury with historically plausible bandaging or signs of recovery, face unobstructed' };
        return null;
    }

    function classifyKnownEvent(text) {
        const corpus = keyOf(text);
        return {
            injury: injuryDescriptor(text),
            healed: /guarit|healed|ristabilit|convalescenz-termin|ripres-dalla-ferit/.test(corpus),
            ill: /malat|febbr|epidemi|avvelen|intossicat|pallid|debilitat/.test(corpus),
            recovered: /guarit-dalla-malatt|ristabilit|recover|ripres-completamente/.test(corpus),
            imprisoned: /arrest|imprigion|carcer|prigion|detenut|catturat/.test(corpus),
            released: /liberat|rilasciat|evas|graziat|scarcerat/.test(corpus),
            richer: /arricch|fortuna|prosper|grande-utile|eredita|ricchezz|successo-economico/.test(corpus),
            poorer: /bancarott|rovina|falliment|confisca|perde-la-fortuna|povert|dissesto/.test(corpus)
        };
    }

    function deriveEvolution(entity, state = getState(), entry = ensureEvolutionEntry(entity, state)) {
        if (!entity || !entry) return null;
        const events = matchingEvents(entity, state);
        let injury = null;
        let illness = false;
        let imprisoned = false;
        let wealth = '';
        events.forEach(event => {
            const flags = classifyKnownEvent(eventText(event));
            if (flags.injury) injury = flags.injury;
            if (flags.healed && injury?.key === 'wounded') injury = null;
            if (flags.ill) illness = true;
            if (flags.recovered) illness = false;
            if (flags.imprisoned) imprisoned = true;
            if (flags.released) imprisoned = false;
            if (flags.richer) wealth = 'richer';
            if (flags.poorer) wealth = 'poorer';
        });

        const year = currentYear(state);
        const elapsedYears = year != null && entry.firstSeenYear != null ? Math.max(0, year - entry.firstSeenYear) : 0;
        let agePrompt = '';
        let ageLabel = '';
        if (elapsedYears >= 20) {
            agePrompt = `visibly aged by about ${elapsedYears} years since first appearance, with natural age progression while unmistakably remaining the same person`;
            ageLabel = `+${elapsedYears} anni`;
        } else if (elapsedYears >= 10) {
            agePrompt = `noticeably older by about ${elapsedYears} years, same person and same core facial structure`;
            ageLabel = `+${elapsedYears} anni`;
        } else if (elapsedYears >= 4) {
            agePrompt = `subtly older by about ${elapsedYears} years, same recognizable face`;
            ageLabel = `+${elapsedYears} anni`;
        }

        const currentRole = clean(entity.role || entity.historicalRole || entity.archetype, 120);
        const currentFaction = clean(entity.faction || entity.organization, 120);
        const roleChanged = Boolean(currentRole && entry.baseRole && keyOf(currentRole) !== keyOf(entry.baseRole));
        const factionChanged = Boolean(currentFaction && entry.baseFaction && keyOf(currentFaction) !== keyOf(entry.baseFaction));
        const status = keyOf(entity.status);
        const deceased = /dead|morto|deceased/.test(status);

        const prompts = [];
        const labels = [];
        if (agePrompt) { prompts.push(agePrompt); labels.push(ageLabel); }
        if (injury) { prompts.push(injury.prompt); labels.push(injury.label); }
        if (illness) { prompts.push('currently looks tired and mildly unwell in a non-graphic realistic way, without changing identity'); labels.push('Affaticato'); }
        if (imprisoned) { prompts.push('current grooming and clothing subtly reflect recent captivity or detention, historically plausible and non-graphic'); labels.push('Prigionia recente'); }
        if (wealth === 'richer') { prompts.push('clothing and grooming subtly reflect improved means and status, still authentic to period and role, never glamorous'); labels.push('Più benestante'); }
        if (wealth === 'poorer') { prompts.push('clothing shows modest wear and reduced means consistent with recent financial hardship, without caricature'); labels.push('Difficoltà economiche'); }
        if (roleChanged) { prompts.push(`current clothing, insignia and grooming accurately reflect the new role: ${currentRole}; preserve the same person underneath the office`); labels.push(`Nuovo ruolo: ${currentRole}`); }
        if (factionChanged) { prompts.push(`subtle current affiliation cues may reflect ${currentFaction} only where culturally appropriate; do not cover the face`); labels.push(`Nuova appartenenza: ${currentFaction}`); }
        if (deceased) { prompts.push('use the final known living appearance as a solemn remembered portrait; never depict a corpse or graphic death'); labels.push('Deceduto'); }

        const currentAge = entry.baseAge != null && elapsedYears > 0 ? Math.max(1, Math.round(entry.baseAge + elapsedYears)) : null;
        const signature = JSON.stringify({ elapsedYears: agePrompt ? elapsedYears : 0, injury: injury?.key || '', illness, imprisoned, wealth, currentRole: roleChanged ? currentRole : '', currentFaction: factionChanged ? currentFaction : '', deceased });
        return {
            key: entry.key,
            name: clean(entity.name, 120),
            year,
            elapsedYears,
            currentAge,
            prompts,
            labels,
            meaningful: prompts.length > 0,
            signature,
            roleChanged,
            factionChanged,
            injury: injury?.key || '',
            wealth,
            deceased
        };
    }

    function buildEvolvedProfile(entity, state = getState()) {
        const api = photoApi();
        if (!api?.buildPhotoProfile) return null;
        const entry = ensureEvolutionEntry(entity, state);
        const evolution = deriveEvolution(entity, state, entry);
        const base = api.buildPhotoProfile(entity, state);
        if (!base || !evolution) return null;
        const appearance = [base.appearance, ...evolution.prompts].filter(Boolean).join('; ');
        return {
            ...base,
            appearance: clean(appearance, 1100),
            age: evolution.currentAge != null ? `about ${evolution.currentAge} years old` : base.age,
            role: clean(entity.role || entity.historicalRole || base.role, 120) || base.role,
            faction: clean(entity.faction || entity.organization || base.faction, 140),
            evolution
        };
    }

    function buildEvolvedPhoto(entity, state = getState()) {
        const api = photoApi();
        if (!api?.ensurePhotoEntry || !api?.buildPhotoUrl) return null;
        const baseEntry = api.ensurePhotoEntry(entity, state);
        const profile = buildEvolvedProfile(entity, state);
        if (!baseEntry || !profile?.evolution) return null;
        const seed = number(baseEntry.seed, null);
        const url = profile.evolution.meaningful
            ? api.buildPhotoUrl(profile, state, { seed, reroll: baseEntry.reroll || 0 })
            : baseEntry.url;
        return {
            url,
            seed,
            reroll: baseEntry.reroll || 0,
            evolution: profile.evolution,
            profile,
            renderToken: `${profile.evolution.signature}|${seed}|${baseEntry.reroll || 0}`
        };
    }

    function labelFromImage(img, state = getState()) {
        const alt = clean(img?.getAttribute?.('alt'), 180);
        const title = clean(img?.getAttribute?.('title'), 180);
        const label = alt.replace(/^ritratto\s+di\s+/i, '').replace(/^portrait\s+of\s+/i, '').trim() || title.replace(/^apri scheda di\s+/i, '').trim();
        if (label && !/illustrazione|scena|mappa/i.test(label)) return label;
        if (img?.closest?.('#char-portrait, #topbar-protagonist-portrait, #story-intro-portrait')) return clean(state?.character?.name, 120);
        return '';
    }

    function decorateImage(img, state = getState()) {
        if (!img || !state?.worldMemory || !img.classList?.contains('portrait-image')) return false;
        if (img.classList.contains('portrait-choice-image') || img.closest?.('.portrait-choice')) return false;
        const label = labelFromImage(img, state);
        const entity = photoApi()?.findEntity?.(label, state) || (sameName(label, state?.character?.name) ? state.character : null);
        if (!entity) return false;
        const evolved = buildEvolvedPhoto(entity, state);
        if (!evolved?.url) return false;
        if (img.dataset.portraitEvolutionToken === evolved.renderToken) return false;
        img.dataset.portraitEvolutionToken = evolved.renderToken;
        img.dataset.portraitEvolutionLabels = evolved.evolution.labels.join(' · ');
        img.dataset.portraitPhotoUrl = evolved.url;
        if (img.dataset.portraitPhotoLoaded === '1' && img.src !== evolved.url) img.src = evolved.url;
        return true;
    }

    function scanPortraits(documentRef, state = getState()) {
        if (!documentRef || !state?.worldMemory) return 0;
        let count = 0;
        documentRef.querySelectorAll('img.portrait-image').forEach(img => {
            if (decorateImage(img, state)) count++;
        });
        return count;
    }

    function augmentDossier(documentRef, state = getState()) {
        const body = documentRef?.getElementById('npc-dossier-body');
        if (!body || body.querySelector(`#${DOSSIER_SECTION_ID}`)) return false;
        const name = clean(body.querySelector('.npc-dossier-name')?.textContent, 120);
        const entity = photoApi()?.findEntity?.(name, state);
        if (!entity) return false;
        const evolution = deriveEvolution(entity, state);
        if (!evolution?.meaningful) return false;
        const section = documentRef.createElement('section');
        section.id = DOSSIER_SECTION_ID;
        section.className = 'npc-dossier-section npc-dossier-evolution';
        const chips = evolution.labels.map(label => `<span class="portrait-evolution-chip">${escapeHtml(label)}</span>`).join('');
        section.innerHTML = `<h4>⏳ Aspetto attuale</h4><div class="portrait-evolution-chips">${chips}</div><p>I cambiamenti visibili derivano dal tempo e dagli eventi già avvenuti. Il volto di base resta quello dello stesso personaggio.</p>`;
        const memories = [...body.querySelectorAll('.npc-dossier-section')].find(node => /ricordi del rapporto/i.test(node.textContent || ''));
        if (memories) body.insertBefore(section, memories);
        else body.appendChild(section);
        return true;
    }

    function syncEvolutionRegistry(state = getState()) {
        const people = photoApi()?.collectEntities?.(state) || [];
        people.forEach(entity => {
            const entry = ensureEvolutionEntry(entity, state);
            const evolution = deriveEvolution(entity, state, entry);
            if (entry && evolution) entry.lastSignature = evolution.signature;
        });
        return people.length;
    }

    function installStyles(documentRef) {
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
        const style = documentRef.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .portrait-evolution-chips { display:flex; flex-wrap:wrap; gap:6px; margin:2px 0 7px; }
            .portrait-evolution-chip { display:inline-flex; align-items:center; min-height:24px; padding:4px 8px; border-radius:999px; color:#65491f; background:rgba(185,137,36,.12); border:1px solid rgba(139,105,20,.16); font:700 .66rem Arial,sans-serif; }
            .npc-dossier-evolution p { margin:0; }
            img.portrait-image[data-portrait-evolution-labels]:not([data-portrait-evolution-labels='']) { outline-offset:-1px; }
            @media (prefers-reduced-motion: reduce) { img.portrait-image { transition:none !important; } }
        `;
        documentRef.head.appendChild(style);
    }

    function refreshUi(documentRef, windowRef) {
        const state = getState();
        if (!state?.worldMemory) return;
        syncEvolutionRegistry(state);
        scanPortraits(documentRef, state);
        augmentDossier(documentRef, state);
        windowRef?.setTimeout?.(() => scanPortraits(documentRef, state), 80);
    }

    function patchEventManager(documentRef, windowRef) {
        const Manager = root.CronacheEvents?.EventManager;
        const original = Manager?.prototype?.record;
        if (typeof original !== 'function' || original.__portraitEvolutionWrapped) return Boolean(original?.__portraitEvolutionWrapped);
        const wrapped = function portraitEvolutionRecord(events, incoming, context) {
            const result = original.call(this, events, incoming, context);
            if (result?.added?.length) windowRef?.setTimeout?.(() => refreshUi(documentRef, windowRef), 0);
            return result;
        };
        wrapped.__portraitEvolutionWrapped = true;
        wrapped.__portraitEvolutionOriginal = original;
        Manager.prototype.record = wrapped;
        return true;
    }

    function installUiEvents(documentRef, windowRef) {
        if (!documentRef || documentRef.__portraitEvolutionUiInstalled) return;
        documentRef.__portraitEvolutionUiInstalled = true;
        documentRef.addEventListener('click', event => {
            const trigger = event.target?.closest?.('[data-npc-dossier-reroll], #btn-reroll-character-photo, #btn-advance-world, #btn-simulate-timeline, #btn-send');
            if (!trigger) return;
            windowRef.setTimeout(() => refreshUi(documentRef, windowRef), 0);
            if (/advance-world|simulate-timeline|btn-send/.test(trigger.id || '')) windowRef.setTimeout(() => refreshUi(documentRef, windowRef), 900);
        }, false);
    }

    function observeDom(documentRef, windowRef) {
        if (domObserver || typeof windowRef?.MutationObserver !== 'function' || !documentRef?.body) return;
        domObserver = new windowRef.MutationObserver(mutations => {
            const state = getState();
            if (!state?.worldMemory) return;
            let needsDossier = false;
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node?.nodeType !== 1) return;
                    if (node.matches?.('img.portrait-image')) decorateImage(node, state);
                    node.querySelectorAll?.('img.portrait-image').forEach(img => decorateImage(img, state));
                    if (node.id === 'npc-dossier-body' || node.closest?.('#npc-dossier-body') || node.querySelector?.('#npc-dossier-body, .npc-dossier-name')) needsDossier = true;
                });
            });
            if (needsDossier) windowRef.setTimeout(() => augmentDossier(documentRef, state), 0);
        });
        domObserver.observe(documentRef.body, { childList: true, subtree: true });
    }

    function install(documentRef, windowRef) {
        if (!documentRef || !windowRef) return false;
        installStyles(documentRef);
        installUiEvents(documentRef, windowRef);
        observeDom(documentRef, windowRef);
        patchEventManager(documentRef, windowRef);
        refreshUi(documentRef, windowRef);
        documentRef.body?.classList.add('portrait-evolution-ready');
        root.__cronachePortraitEvolutionVersion = PATCH_VERSION;
        return true;
    }

    function scheduleInstall() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        const attempt = () => install(document, window);
        [0, 140, 450, 1000, 2200, 4500].forEach(delay => window.setTimeout(attempt, delay));
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attempt, { once: true });
        if (!patchTimer) patchTimer = window.setTimeout(attempt, 7000);
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        SCHEMA_VERSION,
        clean,
        keyOf,
        sameName,
        currentYear,
        yearFromText,
        eventMentionsEntity,
        matchingEvents,
        inferFirstSeenYear,
        ensureRegistry,
        ensureEvolutionEntry,
        injuryDescriptor,
        classifyKnownEvent,
        deriveEvolution,
        buildEvolvedProfile,
        buildEvolvedPhoto,
        syncEvolutionRegistry,
        install
    };
});