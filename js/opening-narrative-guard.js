(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheOpeningNarrativeGuard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const OPENING_STAGE_INDEX = 7;
    const OPENING_STAGE_LABEL = 'Apro la prima scena';
    const OPENING_STAGE_STATUS = 'Trasformo prologo e mondo appena creato nella prima scena...';

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 2000) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);

    function getGameState() {
        try {
            if (typeof G !== 'undefined') return G;
        } catch (_error) { }
        return root.G || null;
    }

    function hasNarration(state = getGameState()) {
        return asArray(state?.storyLog).some(entry =>
            entry?.type === 'narrator' && clean(entry?.text, 20000).length >= 20
        );
    }

    function worldBrief(state = getGameState()) {
        const world = state?.worldMemory?.world || {};
        const locations = asArray(world.locations).slice(0, 12)
            .map(item => `${clean(item?.name, 90)}${item?.region ? ` (${clean(item.region, 70)})` : ''}`)
            .filter(Boolean);
        const factions = asArray(world.factions).slice(0, 8)
            .map(item => `${clean(item?.name, 100)}${item?.goal ? ` — ${clean(item.goal, 150)}` : ''}`)
            .filter(Boolean);
        const actors = asArray(world.actors).slice(0, 12)
            .map(item => `${clean(item?.name, 100)} · ${clean(item?.role, 90)} · ${clean(item?.location, 90)}${item?.goal ? ` · obiettivo: ${clean(item.goal, 140)}` : ''}`)
            .filter(Boolean);
        const forces = asArray(world.forces).slice(0, 6)
            .map(item => `${clean(item?.name, 110)}${item?.objective ? ` — ${clean(item.objective, 170)}` : ''}`)
            .filter(Boolean);
        return {
            name: clean(world.name, 120),
            startLocation: clean(world.startLocation || state?.currentLocation, 120),
            premise: clean(world.premise, 500),
            centralConflict: clean(world.centralConflict, 420),
            stakes: clean(world.stakes, 320),
            locations,
            factions,
            actors,
            forces
        };
    }

    function dateLabel(story = {}, state = {}) {
        const time = story.startTime || state.time || {};
        const parts = [time.day, time.month, time.year].filter(value => value != null && value !== '');
        const clock = time.hour != null
            ? `${String(time.hour).padStart(2, '0')}:${String(time.minute || 0).padStart(2, '0')}`
            : '';
        return `${parts.join('/')}${clock ? ` ${clock}` : ''}`.trim();
    }

    function buildFocusedOpeningPrompt(state = getGameState()) {
        const story = state?.currentStory || {};
        const character = state?.character || {};
        const world = worldBrief(state);
        const properties = asArray(story.starterProperties).slice(0, 8)
            .map(item => `${clean(item?.name, 100)}${item?.type ? ` (${clean(item.type, 70)})` : ''}`)
            .filter(Boolean);
        return [
            'SCRIVI ESCLUSIVAMENTE LA PRIMA SCENA NARRATIVA VISIBILE AL GIOCATORE.',
            'Questa è una chiamata di recupero dopo che il world-building è già terminato: NON rigenerare il mondo.',
            'NON restituire JSON, tag tra parentesi quadre, metadati, note di lavoro, analisi, elenchi tecnici o istruzioni.',
            '',
            'CANONE DELLA STORIA:',
            `Titolo: ${clean(story.title, 140) || 'campagna senza titolo'}`,
            `Genere: ${clean(story.genre, 80) || 'narrativo'}`,
            `Ambientazione: ${clean(story.setting, 220) || world.name || 'non specificata'}`,
            `Data iniziale: ${dateLabel(story, state) || 'coerente con il canone'}`,
            `Premessa: ${clean(story.desc, 1400)}`,
            `Prologo: ${clean(story.prologue, 2200)}`,
            `Tono: ${clean(story.personality, 700)}`,
            `Profondità/regole: ${clean(story.depth, 900)}`,
            properties.length ? `Proprietà iniziali: ${properties.join(', ')}` : '',
            '',
            'MONDO GIÀ COSTRUITO — USALO, NON SOSTITUIRLO:',
            `Luogo iniziale: ${world.startLocation || 'quello indicato dal prologo'}`,
            world.premise ? `Premessa del mondo: ${world.premise}` : '',
            world.centralConflict ? `Conflitto centrale: ${world.centralConflict}` : '',
            world.stakes ? `Posta in gioco: ${world.stakes}` : '',
            world.locations.length ? `Luoghi pertinenti: ${world.locations.join('; ')}` : '',
            world.factions.length ? `Fazioni/poteri pertinenti: ${world.factions.join('; ')}` : '',
            world.actors.length ? `NPC già esistenti: ${world.actors.join('; ')}` : '',
            world.forces.length ? `Forze già in movimento: ${world.forces.join('; ')}` : '',
            '',
            `PROTAGONISTA: ${clean(character.name, 100) || 'il protagonista'}.`,
            `Disponibilità personale iniziale: ${Number.isFinite(Number(character.gold)) ? Number(character.gold) : 'coerente con la scheda'} ${clean(character.currency?.short, 40) || 'unità monetarie'}.`,
            '',
            'REQUISITI DELLA SCENA:',
            '- 4-7 paragrafi di prosa immersiva, concreta e immediatamente giocabile; circa 350-700 parole.',
            '- Inizia nel luogo e nel momento esatti del prologo. Rispetta rigorosamente epoca, tecnologia, istituzioni, moneta e geografia già fissate.',
            '- Mostra dettagli materiali e sociali specifici. Se esiste un’attività o proprietà, falla percepire nella scena senza trasformare il testo in un inventario.',
            '- Introduci soltanto gli NPC realmente utili alla scena iniziale, scegliendoli tra quelli già creati quando possibile.',
            '- Fai emergere almeno una pressione o opportunità già attiva nel mondo, ma NON risolverla.',
            '- Non decidere per il protagonista, non riassumere la campagna, non proporre un menu di azioni.',
            '- Termina con una situazione immediata aperta che invita naturalmente il giocatore ad agire.',
            '- Restituisci SOLO la prosa finale.'
        ].filter(Boolean).join('\n');
    }

    function sanitizeNarrative(response) {
        let text = String(response || '').trim();
        if (!text) return '';
        text = text
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/\[ANALISI\][\s\S]*?\[\/ANALISI\]/gi, '')
            .replace(/```(?:json|javascript|js)?\s*[\s\S]*?```/gi, match => {
                const inner = match.replace(/^```[^\n]*\n?/, '').replace(/```$/, '').trim();
                return /^[\[{]/.test(inner) ? '' : inner;
            })
            .replace(/\[[A-ZÀ-ÖØ-Ý0-9_]{2,}\s*:[^\]]*\]/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        if (/^\s*[\[{][\s\S]*[\]}]\s*$/.test(text)) {
            try {
                JSON.parse(text);
                return '';
            } catch (_error) { }
        }
        return text.length >= 40 ? text : '';
    }

    function addNarration(state, text, source) {
        const narrative = clean(text, 16000);
        if (!state || narrative.length < 20 || hasNarration(state)) return false;
        if (typeof root.addStoryEntry === 'function') {
            root.addStoryEntry(narrative, 'narrator');
        } else {
            state.storyLog = asArray(state.storyLog);
            state.storyLog.push({ text: narrative, type: 'narrator' });
        }
        state.history = asArray(state.history);
        if (!state.history.some(entry => entry?.role === 'assistant' && clean(entry?.content, 16000) === narrative)) {
            state.history.push({ role: 'assistant', content: narrative });
        }
        state.worldMemory = state.worldMemory && typeof state.worldMemory === 'object' ? state.worldMemory : {};
        state.worldMemory.openingNarrative = {
            status: 'ready',
            source: source || 'opening-guard',
            createdAt: new Date().toISOString()
        };
        try { if (typeof root.autoSave === 'function') root.autoSave(); } catch (_error) { }
        return true;
    }

    function markPipelineOpening(state, status, source) {
        if (!state) return;
        state.worldMemory = state.worldMemory && typeof state.worldMemory === 'object' ? state.worldMemory : {};
        const pipeline = state.worldMemory.worldGenerationPipeline || {};
        state.worldMemory.worldGenerationPipeline = {
            ...pipeline,
            version: Math.max(1, Number(pipeline.version) || 1),
            status,
            stage: OPENING_STAGE_INDEX,
            stageLabel: OPENING_STAGE_LABEL,
            completedStages: status === 'ready' ? 8 : Math.max(7, Number(pipeline.completedStages) || 0),
            openingSource: source || pipeline.openingSource || '',
            updatedAt: new Date().toISOString()
        };
    }

    function configureOpeningUi(status = OPENING_STAGE_STATUS) {
        if (typeof document === 'undefined') return;
        const host = document.querySelector('.story-intro-progress');
        if (host && !host.querySelector(`[data-intro-stage="${OPENING_STAGE_INDEX}"]`)) {
            const step = document.createElement('div');
            step.className = 'story-intro-step';
            step.dataset.introStage = String(OPENING_STAGE_INDEX);
            step.innerHTML = '<i>✦</i><span>Apro la prima scena</span>';
            host.appendChild(step);
        }
        document.querySelectorAll('.story-intro-step').forEach((step, index) => {
            step.classList.toggle('active', index === OPENING_STAGE_INDEX);
            step.classList.toggle('done', index < OPENING_STAGE_INDEX);
        });
        const statusNode = document.getElementById('story-intro-status');
        if (statusNode) statusNode.textContent = status;
    }

    async function ensureOpeningNarrative(state = getGameState()) {
        if (!state?.currentStory) return { ok: false, source: 'no-story' };
        if (hasNarration(state)) {
            markPipelineOpening(state, 'ready', 'primary-start');
            return { ok: true, source: 'primary-start' };
        }

        markPipelineOpening(state, 'opening', 'focused-retry');
        configureOpeningUi();
        let retryError = null;
        try {
            if (typeof root.requestConfiguredAI !== 'function') throw new Error('requestConfiguredAI non disponibile');
            const response = await root.requestConfiguredAI([
                {
                    role: 'system',
                    content: 'Sei il Game Master della prima scena. Produci soltanto prosa narrativa finale. Nessun JSON, nessun tag strutturato, nessuna analisi.'
                },
                { role: 'user', content: buildFocusedOpeningPrompt(state) }
            ], {
                task: 'start',
                maxTokens: 2200,
                timeoutMs: 90000,
                temperature: 0.62,
                maxAttempts: 2
            });
            const narrative = sanitizeNarrative(response);
            if (narrative) addNarration(state, narrative, 'focused-opening-llm');
        } catch (error) {
            retryError = error;
            console.warn('[OpeningNarrative] Retry dedicato fallito:', error);
        }

        if (!hasNarration(state)) {
            const story = state.currentStory || {};
            const fallback = clean(story.prologue, 12000)
                || `La storia comincia in ${clean(story.setting, 220) || 'questo mondo'}. ${clean(story.desc, 1400)}`;
            if (fallback) addNarration(state, fallback, 'prologue-fallback');
        }

        const ok = hasNarration(state);
        const source = state.worldMemory?.openingNarrative?.source || (ok ? 'fallback' : 'missing');
        markPipelineOpening(state, ok ? 'ready' : 'opening-failed', source);
        return { ok, source, error: retryError };
    }

    function install() {
        if (!root || root.__cronacheOpeningNarrativeGuardVersion >= PATCH_VERSION) return true;
        const originalGenerateAI = typeof root.generateAI === 'function' ? root.generateAI : null;
        const originalFinishIntro = typeof root.finishStoryIntro === 'function' ? root.finishStoryIntro : null;
        if (!originalGenerateAI || !originalFinishIntro) return false;

        root.__cronacheOpeningNarrativeOriginalFinish = originalFinishIntro;
        root.finishStoryIntro = function guardedFinishStoryIntro(failed = false) {
            if (root.__cronacheOpeningNarrativePending) {
                root.__cronacheOpeningNarrativeDeferredFailure = Boolean(root.__cronacheOpeningNarrativeDeferredFailure || failed);
                return;
            }
            return originalFinishIntro.apply(this, arguments);
        };

        root.generateAI = async function guardedGenerateAI(action, isStart = false, options = {}) {
            if (!isStart) return originalGenerateAI.apply(this, arguments);
            const state = getGameState();
            root.__cronacheOpeningNarrativePending = true;
            root.__cronacheOpeningNarrativeDeferredFailure = false;
            configureOpeningUi();
            markPipelineOpening(state, 'opening', 'primary-start');
            let result;
            try {
                result = await originalGenerateAI.apply(this, arguments);
                await ensureOpeningNarrative(state);
                return result;
            } finally {
                const current = getGameState();
                const hasOpening = hasNarration(current);
                root.__cronacheOpeningNarrativePending = false;
                const failed = !hasOpening;
                try {
                    originalFinishIntro.call(this, failed);
                } catch (finishError) {
                    console.warn('[OpeningNarrative] Chiusura intro fallita:', finishError);
                }
                root.__cronacheOpeningNarrativeDeferredFailure = false;
            }
        };

        root.__cronacheOpeningNarrativeGuardVersion = PATCH_VERSION;
        return true;
    }

    function scheduleInstall() {
        if (install()) return;
        [0, 80, 250, 700, 1500, 3000, 5000].forEach(delay => setTimeout(install, delay));
        if (typeof document !== 'undefined' && document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', install, { once: true });
        }
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        OPENING_STAGE_INDEX,
        OPENING_STAGE_LABEL,
        hasNarration,
        worldBrief,
        buildFocusedOpeningPrompt,
        sanitizeNarrative,
        ensureOpeningNarrative,
        install
    };
});
