(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheQuestManagerV7 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const SCHEMA_VERSION = 1;
    const PATCH_VERSION = 1;
    const MAX_QUESTS = 80;
    const MAX_PROCESSED_EVENTS = 80;
    const MAX_OBJECTIVES = 8;
    const MAX_STAGES = 8;

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 700) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const keyOf = value => clean(value, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function hashText(value) {
        let hash = 2166136261;
        const text = String(value || '');
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function normalizeStatus(value) {
        const status = keyOf(value);
        if (/completed|complete|complet|resolved|risolt|success/.test(status)) return 'completed';
        if (/failed|fallit|persa|lost|abandon|scadut/.test(status)) return 'failed';
        if (/paused|sospes/.test(status)) return 'paused';
        return 'active';
    }

    function normalizeObjective(source, index = 0) {
        const input = source && typeof source === 'object' ? source : { text: source };
        const text = clean(input.text || input.title || input.description || input.objective, 320);
        if (!text) return null;
        return {
            id: clean(input.id, 120) || `objective-${index + 1}-${hashText(text)}`,
            text,
            status: normalizeStatus(input.status) === 'completed' || input.completed === true ? 'completed' : 'active',
            optional: Boolean(input.optional),
            completedAtTurn: Number.isFinite(Number(input.completedAtTurn)) ? Math.max(0, Number(input.completedAtTurn)) : null,
            evidence: clean(input.evidence, 360)
        };
    }

    function normalizeStage(source, index = 0, fallbackDescription = '') {
        const input = source && typeof source === 'object' ? source : { title: source };
        const title = clean(input.title || input.name || `Fase ${index + 1}`, 120);
        let objectives = asArray(input.objectives).map(normalizeObjective).filter(Boolean).slice(0, MAX_OBJECTIVES);
        if (!objectives.length) {
            const objectiveText = clean(input.objective || input.description || (index === 0 ? fallbackDescription : ''), 320);
            if (objectiveText) objectives = [normalizeObjective({ text: objectiveText, status: input.status }, 0)].filter(Boolean);
        }
        const explicitStatus = normalizeStatus(input.status);
        const required = objectives.filter(item => !item.optional);
        const completeByObjectives = required.length > 0 && required.every(item => item.status === 'completed');
        return {
            id: clean(input.id, 120) || `stage-${index + 1}-${hashText(title)}`,
            title,
            description: clean(input.description, 420),
            status: explicitStatus === 'failed' ? 'failed' : explicitStatus === 'completed' || completeByObjectives ? 'completed' : 'active',
            objectives,
            completedAtTurn: Number.isFinite(Number(input.completedAtTurn)) ? Math.max(0, Number(input.completedAtTurn)) : null
        };
    }

    function normalizeQuest(source, index = 0, state = getState()) {
        const input = source && typeof source === 'object' ? source : { name: source };
        const name = clean(input.name || input.title, 140);
        if (!name) return null;
        const description = clean(input.description || input.summary || input.goal, 650);
        const status = normalizeStatus(input.status);
        let stages = asArray(input.stages).map((stage, stageIndex) => normalizeStage(stage, stageIndex, description)).filter(Boolean).slice(0, MAX_STAGES);
        if (!stages.length) {
            const legacyProgress = clean(input.progress, 320);
            const objectiveText = legacyProgress && !/^\d+\s*%$/.test(legacyProgress) ? legacyProgress : description;
            stages = [normalizeStage({
                title: 'Obiettivo',
                objective: objectiveText,
                status
            }, 0, description)].filter(Boolean);
        }
        if (status === 'completed') stages.forEach(stage => {
            stage.status = 'completed';
            stage.objectives.forEach(objective => { objective.status = 'completed'; });
        });
        const firstActive = stages.findIndex(stage => stage.status === 'active');
        const currentStage = Math.max(0, Math.min(stages.length - 1, Number.isFinite(Number(input.currentStage))
            ? Number(input.currentStage)
            : firstActive >= 0 ? firstActive : Math.max(0, stages.length - 1)));
        const turn = Math.max(0, number(state?.worldMemory?.turnCount));
        const createdAtTurn = Math.max(0, number(input.createdAtTurn ?? input.turn, turn));
        const deadlineTurn = Number.isFinite(Number(input.deadlineTurn)) ? Math.max(0, Number(input.deadlineTurn)) : null;
        const processedEventIds = asArray(input.processedEventIds).map(item => clean(item, 160)).filter(Boolean).slice(-MAX_PROCESSED_EVENTS);
        const quest = {
            ...input,
            questSchemaVersion: SCHEMA_VERSION,
            id: clean(input.id, 150) || `quest-${hashText(`${name}|${createdAtTurn}`)}`,
            name,
            title: name,
            description,
            status,
            stages,
            currentStage,
            deadlineTurn,
            deadline: clean(input.deadline, 140),
            reward: clean(input.reward || input.rewards, 360),
            failureConsequence: clean(input.failureConsequence || input.failure || input.consequence, 420),
            actors: asArray(input.actors).map(item => clean(typeof item === 'string' ? item : item?.name, 100)).filter(Boolean).slice(0, 10),
            createdAtTurn,
            updatedAtTurn: Math.max(createdAtTurn, number(input.updatedAtTurn, turn)),
            processedEventIds
        };
        quest.progress = progressLabel(quest);
        return quest;
    }

    function progressLabel(quest) {
        if (!quest) return '';
        if (quest.status === 'completed') return 'Completata';
        if (quest.status === 'failed') return 'Fallita';
        const stage = asArray(quest.stages)[quest.currentStage];
        if (!stage) return clean(quest.progress, 320);
        const objectives = asArray(stage.objectives);
        const done = objectives.filter(item => item.status === 'completed').length;
        const total = objectives.length;
        const current = objectives.find(item => item.status !== 'completed');
        if (current) return `${stage.title}: ${current.text}${total > 1 ? ` (${done}/${total})` : ''}`;
        return `${stage.title}${total ? ` (${done}/${total})` : ''}`;
    }

    function syncQuests(state = getState()) {
        if (!state?.worldMemory) return [];
        const memory = state.worldMemory;
        const source = asArray(memory.quests);
        const deduped = new Map();
        source.forEach((item, index) => {
            const quest = normalizeQuest(item, index, state);
            if (!quest) return;
            const key = keyOf(quest.id || quest.name);
            const existing = deduped.get(key);
            if (!existing || number(quest.updatedAtTurn) >= number(existing.updatedAtTurn)) deduped.set(key, quest);
        });
        memory.quests = [...deduped.values()].slice(-MAX_QUESTS);
        return memory.quests;
    }

    const STOP = new Set(['della','delle','degli','dello','alla','alle','agli','allo','come','quest','obiettivo','missione','trova','trovare','ottenere','raggiungere','deve','devi','con','per','una','uno','del','dal','nel','sul','che','gli','sono']);
    function tokens(value) {
        return keyOf(value).split('-').filter(token => token.length >= 4 && !STOP.has(token));
    }

    function eventText(event) {
        return clean([event?.title, event?.summary, event?.consequence, event?.cause, event?.choice, asArray(event?.actors).join(' ')].filter(Boolean).join(' '), 3000);
    }

    function eventId(event) {
        return clean(event?.id || event?.fingerprint, 160) || `event-${hashText(eventText(event))}`;
    }

    function overlapScore(left, right) {
        const leftTokens = [...new Set(tokens(left))];
        if (!leftTokens.length) return 0;
        const corpus = keyOf(right);
        return leftTokens.filter(token => corpus.includes(token)).length / leftTokens.length;
    }

    function isCompletionSignal(text) {
        return /complet|risolt|ottenut|trov|scopert|consegn|firmat|raggiunt|salvat|sconfitt|convint|liberat|recuperat|protett|conclus|accettat|apert|assunt|pagat|acquistat|vendut|costruit/.test(keyOf(text));
    }

    function isFailureSignal(text) {
        return /fallit|impossibil|distrutt|perdut|uccis|scadut|rifiut-definit|annullat|catturat|confiscat/.test(keyOf(text));
    }

    function markObjectiveComplete(objective, event, turn) {
        if (!objective || objective.status === 'completed') return false;
        objective.status = 'completed';
        objective.completedAtTurn = turn;
        objective.evidence = clean(`${event?.title || ''}: ${event?.summary || event?.consequence || ''}`, 360);
        return true;
    }

    function advanceQuestStages(quest, turn) {
        let changed = false;
        while (quest.status === 'active') {
            const stage = quest.stages[quest.currentStage];
            if (!stage) {
                quest.status = 'completed';
                changed = true;
                break;
            }
            const required = asArray(stage.objectives).filter(item => !item.optional);
            const complete = required.length > 0 && required.every(item => item.status === 'completed');
            if (!complete) break;
            if (stage.status !== 'completed') {
                stage.status = 'completed';
                stage.completedAtTurn = turn;
                changed = true;
            }
            if (quest.currentStage >= quest.stages.length - 1) {
                quest.status = 'completed';
                changed = true;
                break;
            }
            quest.currentStage += 1;
            changed = true;
        }
        if (changed) {
            quest.updatedAtTurn = turn;
            quest.progress = progressLabel(quest);
        }
        return changed;
    }

    function applyEventToQuest(quest, event, turn) {
        if (!quest || quest.status !== 'active' || !event) return false;
        const id = eventId(event);
        if (quest.processedEventIds.includes(id)) return false;
        quest.processedEventIds.push(id);
        quest.processedEventIds = quest.processedEventIds.slice(-MAX_PROCESSED_EVENTS);
        const text = eventText(event);
        const questMatch = overlapScore(`${quest.name} ${quest.description}`, text);
        let changed = false;
        if (questMatch >= 0.34 && isFailureSignal(text)) {
            quest.status = 'failed';
            quest.updatedAtTurn = turn;
            quest.progress = 'Fallita';
            return true;
        }
        if (questMatch >= 0.45 && isCompletionSignal(text) && /mission|quest|incaric|obiettivo|complet|conclus|risolt/.test(keyOf(text))) {
            quest.stages.forEach(stage => stage.objectives.forEach(objective => { if (markObjectiveComplete(objective, event, turn)) changed = true; }));
        } else {
            const stage = quest.stages[quest.currentStage];
            asArray(stage?.objectives).forEach(objective => {
                const score = overlapScore(objective.text, text);
                if (score >= 0.42 && isCompletionSignal(text) && markObjectiveComplete(objective, event, turn)) changed = true;
            });
        }
        if (advanceQuestStages(quest, turn)) changed = true;
        if (changed) {
            quest.updatedAtTurn = turn;
            quest.progress = progressLabel(quest);
        }
        return changed;
    }

    function processEvents(state = getState(), events = []) {
        if (!state?.worldMemory) return [];
        const quests = syncQuests(state);
        const turn = Math.max(0, number(state.worldMemory.turnCount));
        const changed = [];
        quests.forEach(quest => {
            if (quest.status !== 'active') return;
            for (const event of asArray(events)) {
                if (applyEventToQuest(quest, event, turn)) changed.push(quest.id);
                if (quest.status !== 'active') break;
            }
        });
        return [...new Set(changed)];
    }

    function processDeadlines(state = getState()) {
        if (!state?.worldMemory) return [];
        const quests = syncQuests(state);
        const turn = Math.max(0, number(state.worldMemory.turnCount));
        const failed = [];
        quests.forEach(quest => {
            if (quest.status !== 'active' || quest.deadlineTurn == null) return;
            if (turn <= quest.deadlineTurn) return;
            quest.status = 'failed';
            quest.updatedAtTurn = turn;
            quest.progress = 'Fallita: scadenza superata';
            failed.push(quest.id);
        });
        return failed;
    }

    function processTurn(state = getState()) {
        if (!state?.worldMemory) return [];
        syncQuests(state);
        const recentEvents = asArray(state.worldMemory.events).slice(-12);
        const changed = processEvents(state, recentEvents);
        const failed = processDeadlines(state);
        return [...new Set([...changed, ...failed])];
    }

    function buildQuestContext(state = getState()) {
        if (!state?.worldMemory) return '';
        const turn = Math.max(0, number(state.worldMemory.turnCount));
        const active = syncQuests(state).filter(quest => quest.status === 'active').slice(0, 5);
        if (!active.length) return '';
        const lines = active.map(quest => {
            const stage = quest.stages[quest.currentStage];
            const objective = asArray(stage?.objectives).find(item => item.status !== 'completed');
            const deadline = quest.deadlineTurn == null ? '' : `; scadenza tra ${Math.max(0, quest.deadlineTurn - turn)} turni`;
            return `- ${quest.name}: fase "${stage?.title || 'Obiettivo'}"; prossimo obiettivo: ${objective?.text || quest.description || 'da definire'}${deadline}. Stato autoritativo: ${quest.status}.`;
        });
        return `📋 QUEST MANAGER V7 — obiettivi persistenti e condizioni reali\n${lines.join('\n')}\n` +
            `Non dichiarare una quest completata o fallita senza un fatto di gioco che soddisfi le condizioni. Le quest ignorate possono scadere mentre il mondo avanza.`;
    }

    function patchEventManager() {
        const Manager = root.CronacheEvents?.EventManager;
        const original = Manager?.prototype?.record;
        if (typeof original !== 'function') return false;
        if (original.__phase7QuestWrapped) return true;
        const wrapped = function phase7QuestRecord(events, incoming, context) {
            const result = original.apply(this, arguments);
            try {
                const state = getState();
                if (result?.added?.length) processEvents(state, result.added);
                processDeadlines(state);
            } catch (error) {
                console.warn('[QuestManagerV7] aggiornamento quest ignorato:', error);
            }
            return result;
        };
        wrapped.__phase7QuestWrapped = true;
        wrapped.__phase7QuestOriginal = original;
        Manager.prototype.record = wrapped;
        return true;
    }

    function install() {
        if (root.__cronacheQuestManagerV7Patch >= PATCH_VERSION) return true;
        root.__cronacheQuestManagerV7Patch = PATCH_VERSION;
        try { processTurn(getState()); } catch (_error) { }
        patchEventManager();
        if (typeof root.setTimeout === 'function') {
            root.setTimeout(patchEventManager, 0);
            root.setTimeout(patchEventManager, 900);
        }
        return true;
    }

    const api = {
        SCHEMA_VERSION,
        PATCH_VERSION,
        normalizeStatus,
        normalizeObjective,
        normalizeStage,
        normalizeQuest,
        syncQuests,
        applyEventToQuest,
        processEvents,
        processDeadlines,
        processTurn,
        buildQuestContext,
        progressLabel,
        install
    };

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
        else install();
    }
    return api;
});
