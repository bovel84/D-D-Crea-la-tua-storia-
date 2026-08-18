(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheStoryVisuals = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const MODEL = 'flux';
    const FREE_IMAGE_BASE = 'https://image.pollinations.ai/prompt/';
    const STORY_WIDTH = 1152;
    const STORY_HEIGHT = 648;
    const EVENT_WIDTH = 1024;
    const EVENT_HEIGHT = 576;
    const MIN_NARRATIVE_LENGTH = 140;

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 1600) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);

    function hashNumber(value) {
        let hash = 2166136261;
        const text = String(value || '');
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function getGameState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function imagesEnabled() {
        try {
            if (typeof root.sceneImagesEnabled === 'function') return root.sceneImagesEnabled();
            return localStorage.getItem('cdd-scene-images') !== 'off';
        } catch (_error) {
            return true;
        }
    }

    function buildFreeFluxUrl(prompt, options = {}) {
        const text = clean(prompt, 2200);
        if (!text) return '';
        const requestedWidth = Math.max(256, Number(options.width) || STORY_WIDTH);
        const requestedHeight = Math.max(256, Number(options.height) || STORY_HEIGHT);
        const wide = requestedWidth / requestedHeight >= 1.35;
        const width = Math.max(wide ? 1024 : 768, Math.min(1536, requestedWidth));
        const height = Math.max(wide ? 576 : 768, Math.min(1536, requestedHeight));
        const seed = Number.isFinite(Number(options.seed)) ? Number(options.seed) : hashNumber(text);
        const encoded = encodeURIComponent(text);
        return `${FREE_IMAGE_BASE}${encoded}?model=${MODEL}&width=${width}&height=${height}&seed=${seed}&safe=true&nologo=true`;
    }

    function locationActors(state, location) {
        const world = state?.worldMemory?.world || {};
        const normalizedLocation = clean(location, 120).toLowerCase();
        const local = asArray(world.actors).filter(actor =>
            normalizedLocation && clean(actor?.location, 120).toLowerCase() === normalizedLocation
        );
        const pool = local.length ? local : asArray(world.actors);
        return pool.slice(0, 4).map(actor => {
            const name = clean(actor?.name, 80);
            const role = clean(actor?.role, 90);
            return [name, role].filter(Boolean).join(', ');
        }).filter(Boolean);
    }

    function buildNarrativePrompt(text, state = getGameState()) {
        const story = state?.currentStory || {};
        const world = state?.worldMemory?.world || {};
        const location = clean(state?.currentLocation || world.startLocation, 120);
        const actors = locationActors(state, location);
        const year = story?.startTime?.year || state?.time?.year || '';
        return [
            'cinematic story illustration',
            'very clear image, crisp sharp focus, high visual clarity, natural contrast, rich realistic colors',
            'opaque image, no transparency, no washed-out colors, no haze, no fog unless explicitly required by the scene',
            'no text, no captions, no UI, no logo, no watermark',
            clean(story.title, 140) ? `story ${clean(story.title, 140)}` : '',
            clean(story.genre, 70) ? `genre ${clean(story.genre, 70)}` : '',
            clean(story.setting, 180) ? `setting ${clean(story.setting, 180)}` : '',
            year ? `year ${year}, historically accurate material culture` : '',
            location ? `location ${location}` : '',
            actors.length ? `established characters ${actors.join('; ')}` : '',
            `depict this exact playable moment: ${clean(text, 900)}`,
            'single coherent moment, believable architecture, clothing, objects and social environment for the stated place and era',
            'strong readable foreground subject, detailed environment, cinematic depth, 16:9 composition'
        ].filter(Boolean).join(', ');
    }

    function strengthenExistingPrompt(prompt) {
        return [
            clean(prompt, 1500),
            'crisp sharp focus, high visual clarity, strong natural contrast, rich realistic colors',
            'opaque image, no transparency, no faded overlay, no washed-out colors, no haze',
            'clear foreground and readable environment, cinematic 16:9 composition',
            'no text, no captions, no watermark'
        ].filter(Boolean).join(', ');
    }

    function installStyles() {
        if (typeof document === 'undefined' || document.getElementById('cronache-story-visuals-style')) return;
        const style = document.createElement('style');
        style.id = 'cronache-story-visuals-style';
        style.textContent = `
            .event-screen-hero { overflow: hidden; }
            .event-screen-scene-img {
                opacity: .94 !important;
                filter: saturate(1.08) contrast(1.07) brightness(1.03) !important;
                object-position: center center !important;
            }
            .event-screen-hero::after {
                content: '';
                position: absolute;
                inset: 0;
                z-index: 0;
                pointer-events: none;
                background: linear-gradient(180deg, rgba(13,8,18,.01) 0%, rgba(13,8,18,.06) 48%, rgba(13,8,18,.68) 100%);
            }
            .event-screen-hero > *:not(.event-screen-scene-img) { z-index: 2 !important; }
            .story-entry.narrator { overflow: hidden; }
            .story-scene-visual {
                margin: 0 0 16px;
                border-radius: 13px;
                overflow: hidden;
                position: relative;
                background: #1a100b;
                border: 1px solid rgba(139,105,20,.58);
                box-shadow: 0 10px 26px rgba(43,24,16,.20);
                aspect-ratio: 16 / 9;
            }
            .story-scene-visual img {
                position: relative;
                z-index: 1;
                display: block;
                width: 100%;
                height: 100%;
                object-fit: cover;
                opacity: 1 !important;
                filter: saturate(1.07) contrast(1.06) brightness(1.03);
            }
            .story-scene-visual.loading img { opacity: 0 !important; }
            .story-scene-visual::before {
                content: 'Creo l’immagine della scena…';
                position: absolute;
                inset: 0;
                z-index: 0;
                display: grid;
                place-items: center;
                padding: 16px;
                color: #ead79a;
                text-align: center;
                font-family: 'Cinzel', serif;
                font-size: .78rem;
                letter-spacing: .035em;
                background: radial-gradient(circle at center, #3a2317, #160d09);
            }
            .story-scene-visual.loaded::before { display: none; }
            .story-scene-visual figcaption {
                position: absolute;
                z-index: 2;
                left: 9px;
                bottom: 8px;
                padding: 4px 8px;
                border-radius: 999px;
                color: rgba(255,255,255,.94);
                background: rgba(0,0,0,.52);
                font-size: .68rem;
                line-height: 1.15;
                backdrop-filter: blur(3px);
            }
            @media (max-width: 640px) {
                .story-scene-visual { margin-bottom: 13px; border-radius: 10px; }
            }
        `;
        document.head.appendChild(style);
    }

    let providerCooldownUntil = 0;

    function createFigure(url, alt) {
        if (!url || typeof document === 'undefined') return null;
        const figure = document.createElement('figure');
        figure.className = 'story-scene-visual loading';
        figure.dataset.pollinationsFlux = 'free';
        const img = document.createElement('img');
        img.src = url;
        img.alt = clean(alt, 180) || 'Illustrazione della scena';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.onload = () => {
            figure.classList.remove('loading');
            figure.classList.add('loaded');
            providerCooldownUntil = 0;
        };
        img.onerror = () => {
            providerCooldownUntil = Date.now() + 60000;
            figure.remove();
            console.warn('[StoryVisuals] Pollinations FLUX non disponibile per questa scena.');
        };
        const caption = document.createElement('figcaption');
        caption.textContent = 'FLUX · Pollinations.ai';
        figure.append(img, caption);
        return figure;
    }

    function attachNarrativeImage(entry, text, state = getGameState()) {
        if (!entry || !imagesEnabled() || entry.querySelector('.story-scene-visual')) return false;
        const narrative = clean(text, 8000);
        if (narrative.length < MIN_NARRATIVE_LENGTH || Date.now() < providerCooldownUntil) return false;
        const turn = Number(state?.worldMemory?.turnCount || 0);
        const prompt = buildNarrativePrompt(narrative, state);
        const seed = hashNumber(`${state?.currentStory?.title || ''}|${turn}|${narrative}`);
        const url = buildFreeFluxUrl(prompt, { width: STORY_WIDTH, height: STORY_HEIGHT, seed });
        const figure = createFigure(url, `Scena narrativa: ${clean(state?.currentLocation, 90)}`);
        if (!figure) return false;
        entry.prepend(figure);
        return true;
    }

    function attachLatestNarrative() {
        if (typeof document === 'undefined' || !imagesEnabled()) return false;
        const entries = Array.from(document.querySelectorAll('#story-scroll .story-entry.narrator'));
        const entry = entries[entries.length - 1];
        if (!entry || entry.querySelector('.story-scene-visual')) return false;
        const text = clean(entry.innerText || entry.textContent, 8000);
        return attachNarrativeImage(entry, text);
    }

    function patchStoryEntries() {
        const original = typeof root.addStoryEntry === 'function' ? root.addStoryEntry : null;
        if (!original || original.__storyVisualsWrapped) return Boolean(original);
        const wrapped = function storyVisualAddEntry(text, type, log = true) {
            const result = original.apply(this, arguments);
            if (type === 'narrator' && log !== false && imagesEnabled()) {
                setTimeout(() => {
                    if (typeof document === 'undefined') return;
                    const entries = document.querySelectorAll('#story-scroll .story-entry.narrator');
                    const entry = entries[entries.length - 1];
                    attachNarrativeImage(entry, text);
                }, 0);
            }
            return result;
        };
        wrapped.__storyVisualsWrapped = true;
        wrapped.__storyVisualsOriginal = original;
        root.addStoryEntry = wrapped;
        return true;
    }

    function patchImageBuilders() {
        let patched = false;
        if (typeof root.buildSceneImageUrl === 'function' && !root.buildSceneImageUrl.__storyVisualsWrapped) {
            const original = root.buildSceneImageUrl;
            const wrapped = function freeFluxSceneUrl(prompt) {
                const strengthened = strengthenExistingPrompt(prompt);
                return buildFreeFluxUrl(strengthened, { width: EVENT_WIDTH, height: EVENT_HEIGHT, seed: hashNumber(strengthened) });
            };
            wrapped.__storyVisualsWrapped = true;
            wrapped.__storyVisualsOriginal = original;
            root.buildSceneImageUrl = wrapped;
            patched = true;
        }
        if (typeof root.buildMapImageUrl === 'function' && !root.buildMapImageUrl.__storyVisualsWrapped) {
            const original = root.buildMapImageUrl;
            const wrapped = function freeFluxMapUrl(prompt) {
                const strengthened = strengthenExistingPrompt(prompt);
                return buildFreeFluxUrl(strengthened, { width: 1152, height: 704, seed: hashNumber(strengthened) });
            };
            wrapped.__storyVisualsWrapped = true;
            wrapped.__storyVisualsOriginal = original;
            root.buildMapImageUrl = wrapped;
            patched = true;
        }
        return patched;
    }

    function install() {
        if (!root || root.__cronacheStoryVisualsVersion >= PATCH_VERSION) return true;
        installStyles();
        const entriesReady = patchStoryEntries();
        patchImageBuilders();
        if (!entriesReady) return false;
        root.__cronacheStoryVisualsVersion = PATCH_VERSION;
        setTimeout(attachLatestNarrative, 80);
        return true;
    }

    function scheduleInstall() {
        if (install()) return;
        [0, 80, 250, 700, 1500, 3000, 5000].forEach(delay => setTimeout(() => {
            installStyles();
            patchImageBuilders();
            install();
        }, delay));
        if (typeof document !== 'undefined' && document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                installStyles();
                install();
            }, { once: true });
        }
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        MODEL,
        FREE_IMAGE_BASE,
        STORY_WIDTH,
        STORY_HEIGHT,
        EVENT_WIDTH,
        EVENT_HEIGHT,
        hashNumber,
        buildFreeFluxUrl,
        buildNarrativePrompt,
        strengthenExistingPrompt,
        attachNarrativeImage,
        attachLatestNarrative,
        install
    };
});
