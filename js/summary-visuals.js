(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheSummaryVisuals = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 3;
    const STYLE_ID = 'cronache-summary-visuals-style';
    const SUMMARY_RE = /(?:il mondo ha prodotto questo cambiamento|situazione attuale:|esito del piano strategico:)/i;
    const attempted = new WeakSet();
    const STOP_WORDS = new Set([
        'alla', 'alle', 'anche', 'come', 'dalla', 'dalle', 'della', 'delle', 'degli', 'dello',
        'dopo', 'durante', 'essere', 'evento', 'eventi', 'mondo', 'nella', 'nelle', 'questo',
        'questa', 'situazione', 'sono', 'sulla', 'sulle', 'turno', 'prodotto', 'cambiamento'
    ]);
    let observer = null;

    function clean(value, max = 8000) {
        return String(value == null ? '' : value)
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, max);
    }

    function keyOf(value) {
        return clean(value, 5000)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function tokens(value) {
        return [...new Set(keyOf(value).split(' ').filter(token => token.length >= 4 && !STOP_WORDS.has(token)))];
    }

    function isSummaryText(value) {
        return SUMMARY_RE.test(clean(value, 12000));
    }

    function hasVisual(entry) {
        return Boolean(entry?.querySelector?.('.story-scene-visual, .story-scene-img'));
    }

    function getGameState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function meaningfulEvent(event) {
        return Boolean(event && clean(event.summary || event.description || event.fact, 40));
    }

    function eventScore(event, summaryText, index, total) {
        const summaryKey = keyOf(summaryText);
        const eventText = [event?.title, event?.summary, event?.consequence, event?.cause, event?.location]
            .filter(Boolean).join(' ');
        const eventTokens = tokens(eventText).slice(0, 28);
        const matched = eventTokens.filter(token => summaryKey.includes(token)).length;
        let score = matched * 2;

        const title = keyOf(event?.title);
        if (title && title.length >= 8 && summaryKey.includes(title)) score += 18;
        const location = keyOf(event?.location);
        if (location && summaryKey.includes(location)) score += 7;
        (Array.isArray(event?.actors) ? event.actors : []).forEach(actor => {
            const actorKey = keyOf(actor);
            if (actorKey && summaryKey.includes(actorKey)) score += 5;
        });
        if (clean(event?.scenePrompt, 20)) score += 8;
        if (/critical/i.test(event?.importance || '')) score += 3;
        else if (/high/i.test(event?.importance || '')) score += 2;

        // In caso di parità privilegia l'evento più recente del riassunto.
        score += total ? (index / total) * 2 : 0;
        return score;
    }

    function selectSummaryEvent(summaryText, state = getGameState()) {
        const events = (Array.isArray(state?.worldMemory?.events) ? state.worldMemory.events : [])
            .filter(meaningfulEvent)
            .slice(-12);
        if (!events.length) return null;
        const ranked = events.map((event, index) => ({
            event,
            score: eventScore(event, summaryText, index, events.length)
        })).sort((left, right) => right.score - left.score);
        return ranked[0]?.event || events[events.length - 1];
    }

    function actorDescriptor(name, state) {
        const target = keyOf(name);
        const world = state?.worldMemory?.world || {};
        const pools = [
            ...(Array.isArray(world.actors) ? world.actors : []),
            ...(Array.isArray(world.factions) ? world.factions : [])
        ];
        const actor = pools.find(item => keyOf(item?.name) === target) || null;
        if (!actor) return clean(name, 90);
        return [
            clean(actor.name || name, 90),
            clean(actor.role || actor.type, 90),
            clean(actor.faction, 90),
            clean(actor.appearance || actor.visualDescription || actor.look, 180)
        ].filter(Boolean).join(', ');
    }

    function protagonistDescriptor(state) {
        const character = state?.character || {};
        const name = clean(character.name, 90);
        if (!name) return '';
        return [
            name,
            clean(character.class || character.role || character.archetype, 90),
            clean(character.appearance || character.visualDescription || character.look, 180)
        ].filter(Boolean).join(', ');
    }

    function buildSummaryPrompt(summaryText, state = getGameState()) {
        const story = state?.currentStory || {};
        const world = state?.worldMemory?.world || {};
        const event = selectSummaryEvent(summaryText, state);
        const eventLocation = clean(event?.location || state?.currentLocation || world.startLocation, 140);
        const eventActors = (Array.isArray(event?.actors) ? event.actors : [])
            .map(name => actorDescriptor(name, state))
            .filter(Boolean)
            .slice(0, 5);
        const protagonist = protagonistDescriptor(state);
        const year = state?.time?.year || story?.startTime?.year || '';
        const date = clean(event?.occurredAt || '', 120);
        const genre = clean(story.genre, 80);
        const isFantasy = /fantasy|magia|magico|magical|stregon|draghi|dragon/i.test(`${genre} ${story.setting || ''}`);
        const visualAnchor = clean(event?.scenePrompt, 520);
        const eventFact = clean(event?.summary || event?.description || event?.fact, 720);
        const consequence = clean(event?.consequence, 360);

        return [
            'cinematic narrative illustration of ONE exact event, not a generic mood image and not a symbolic montage',
            visualAnchor ? `PRIMARY VISUAL ANCHOR — follow this scene literally and make it dominate the composition: ${visualAnchor}` : '',
            clean(story.title, 140) ? `STORY: ${clean(story.title, 140)}` : '',
            genre ? `GENRE: ${genre}` : '',
            clean(story.setting, 220) ? `CANONICAL SETTING: ${clean(story.setting, 220)}` : '',
            year ? `EXACT ERA: year ${year}; historically accurate architecture, vehicles, technology, clothes, furniture, documents and everyday objects` : '',
            date ? `EVENT DATE/TIME: ${date}` : '',
            eventLocation ? `EXACT LOCATION: ${eventLocation}; make the location visually recognizable and materially plausible` : '',
            clean(event?.title, 160) ? `EVENT TO DEPICT: ${clean(event.title, 160)}` : '',
            eventFact ? `VISIBLE ACTION: ${eventFact}` : `VISIBLE ACTION FROM SUMMARY: ${clean(summaryText, 720)}`,
            consequence ? `CONTEXT AFTER THE ACTION: ${consequence}` : '',
            eventActors.length ? `CHARACTERS IN THIS SCENE ONLY: ${eventActors.join('; ')}` : '',
            protagonist ? `PROTAGONIST CONTINUITY: ${protagonist}` : '',
            'show the concrete physical action described: who is doing what, to whom, with the relevant real objects, documents, phone, vehicle, room, institution or resources visible when mentioned',
            'preserve character roles, location, country, era and social context; do not replace named people with unrelated generic characters',
            isFantasy ? '' : 'NO fantasy elements, medieval armor, castles, magic, futuristic technology or unrelated historical periods unless explicitly present in the event',
            'avoid generic portraits, empty landscapes, random crowds, abstract symbolism, split screens, collages, infographics and decorative scenes unrelated to the event',
            'natural cinematic framing, readable foreground action, specific environmental details, realistic lighting, sharp focus, rich natural colors, 16:9 composition',
            'no text, no captions, no UI, no logo, no watermark'
        ].filter(Boolean).join(', ');
    }

    function installStyles(documentRef) {
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
        const style = documentRef.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #story-scroll .story-entry.narrator .story-scene-visual.summary-scene-visual {
                margin-bottom: 14px;
            }
            #story-scroll .story-entry.narrator .story-scene-visual.summary-scene-visual figcaption {
                display: none;
            }
            @media (max-width: 640px) {
                #story-scroll .story-entry.narrator .story-scene-visual.summary-scene-visual {
                    margin-bottom: 11px;
                }
            }
        `;
        documentRef.head.appendChild(style);
    }

    function scheduleRetry(entry, delay = 65000) {
        if (typeof window === 'undefined') return;
        window.setTimeout(() => {
            attempted.delete(entry);
            if (!hasVisual(entry) && entry?.isConnected) attachSummaryImage(entry);
        }, delay);
    }

    function createSummaryFigure(documentRef, url, event) {
        const figure = documentRef.createElement('figure');
        figure.className = 'story-scene-visual summary-scene-visual loading';
        figure.dataset.pollinationsFlux = 'free';
        if (event?.id) figure.dataset.summaryEventId = clean(event.id, 140);

        const img = documentRef.createElement('img');
        img.src = url;
        img.alt = clean(event?.title ? `Scena: ${event.title}` : 'Illustrazione contestualizzata del riassunto', 180);
        img.loading = 'lazy';
        img.decoding = 'async';
        img.onload = () => {
            figure.classList.remove('loading');
            figure.classList.add('loaded');
        };
        img.onerror = () => {
            figure.remove();
            scheduleRetry(figure.__summaryEntry || null);
            console.warn('[SummaryVisuals] Immagine contestuale non disponibile, nuovo tentativo pianificato.');
        };

        const caption = documentRef.createElement('figcaption');
        caption.textContent = 'Scena dell’evento';
        figure.append(img, caption);
        return figure;
    }

    function attachSummaryImage(entry, state = getGameState()) {
        if (!entry || attempted.has(entry) || hasVisual(entry)) return false;
        const text = clean(entry.innerText || entry.textContent, 12000);
        if (!isSummaryText(text)) return false;

        const visuals = root.CronacheStoryVisuals;
        if (!visuals || typeof visuals.buildFreeFluxUrl !== 'function' || typeof visuals.hashNumber !== 'function') return false;
        if (typeof document === 'undefined') return false;

        const event = selectSummaryEvent(text, state);
        const prompt = buildSummaryPrompt(text, state);
        if (!prompt) return false;

        attempted.add(entry);
        const seed = visuals.hashNumber([
            state?.currentStory?.title || '',
            event?.id || event?.title || '',
            event?.occurredAt || '',
            text
        ].join('|'));
        const url = visuals.buildFreeFluxUrl(prompt, { width: 1152, height: 648, seed });
        if (!url) {
            scheduleRetry(entry);
            return false;
        }

        const figure = createSummaryFigure(document, url, event);
        figure.__summaryEntry = entry;
        entry.prepend(figure);
        figure.setAttribute('aria-label', 'Illustrazione contestualizzata del riassunto degli eventi');
        return true;
    }

    function processNode(node) {
        if (!node || node.nodeType !== 1) return;
        const entries = [];
        if (node.matches?.('#story-scroll .story-entry.narrator, .story-entry.narrator')) entries.push(node);
        node.querySelectorAll?.('.story-entry.narrator').forEach(entry => entries.push(entry));
        entries.forEach(entry => window.setTimeout(() => attachSummaryImage(entry), 30));
    }

    function backfillLatest(documentRef) {
        const summaries = Array.from(documentRef.querySelectorAll('#story-scroll .story-entry.narrator'))
            .filter(entry => isSummaryText(entry.innerText || entry.textContent) && !hasVisual(entry));
        summaries.slice(-3).forEach((entry, index) => {
            window.setTimeout(() => attachSummaryImage(entry), 80 + index * 120);
        });
    }

    function install(documentRef, windowRef) {
        if (!documentRef || !windowRef) return false;
        installStyles(documentRef);
        const scroll = documentRef.getElementById('story-scroll');
        if (!scroll) return false;

        backfillLatest(documentRef);

        if (!observer) {
            observer = new windowRef.MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(processNode);
                });
            });
            observer.observe(scroll, { childList: true, subtree: true });
        }

        documentRef.body?.classList.add('summary-visuals-ready');
        root.__cronacheSummaryVisualsVersion = PATCH_VERSION;
        return true;
    }

    function scheduleInstall() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        const attempt = () => install(document, window);
        if (attempt()) return;
        [0, 80, 250, 700, 1500, 3000, 5000].forEach(delay => window.setTimeout(attempt, delay));
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', attempt, { once: true });
        }
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        STYLE_ID,
        isSummaryText,
        selectSummaryEvent,
        buildSummaryPrompt,
        attachSummaryImage,
        install
    };
});
