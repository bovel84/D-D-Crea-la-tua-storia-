(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheTimeMontageV8 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const SCHEMA_VERSION = 1;
    const PATCH_VERSION = 1;
    const MAX_HISTORY = 50;
    const DAY = 1440;

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 800) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const keyOf = value => clean(value, 700).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function hashText(value) {
        let hash = 2166136261;
        const text = String(value || '');
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function ensureState(state = getState()) {
        if (!state?.worldMemory) return { schemaVersion: SCHEMA_VERSION, history: [], pending: null };
        const memory = state.worldMemory;
        if (!memory.timeMontageV8 || typeof memory.timeMontageV8 !== 'object' || Array.isArray(memory.timeMontageV8)) {
            memory.timeMontageV8 = { schemaVersion: SCHEMA_VERSION, history: [], pending: null };
        }
        const registry = memory.timeMontageV8;
        registry.schemaVersion = SCHEMA_VERSION;
        if (!Array.isArray(registry.history)) registry.history = [];
        return registry;
    }

    function passageMinutes(passage) {
        if (!passage) return 0;
        const direct = number(passage.elapsed, 0);
        if (direct > 0) return Math.round(direct);
        const parser = root.CronacheTimeEnergy?.parseTimeExpression;
        if (typeof parser === 'function') return Math.max(0, Math.round(parser(passage.description || passage.duration || '')));
        return 0;
    }

    function durationLabel(minutes) {
        const total = Math.max(0, Math.round(number(minutes, 0)));
        const days = Math.floor(total / DAY);
        if (days >= 365) return `${Math.floor(days / 365)} anno/i`;
        if (days >= 30) return `${Math.floor(days / 30)} mese/i`;
        if (days >= 7) return `${Math.floor(days / 7)} settimana/e`;
        if (days >= 1) return `${days} giorno/i`;
        const hours = Math.max(1, Math.round(total / 60));
        return `${hours} ora/e`;
    }

    function protagonistBeat(state) {
        const character = state?.character || {};
        const role = clean(character.presentationRole || character.currentRole || character.role || character.profession || character.archetype, 100);
        const location = clean(state?.currentLocation || state?.worldMemory?.world?.startLocation, 100);
        if (!role && !location) return '';
        return `La vita ordinaria di ${clean(character.name || 'protagonista', 100)} continua${role ? ` nel ruolo di ${role}` : ''}${location ? ` a ${location}` : ''}, senza trasformare automaticamente routine, pasti o sonno in micromanagement.`;
    }

    function businessBeats(state) {
        const businesses = asArray(state?.worldMemory?.management?.businesses).filter(item => item && item.status !== 'closed' && item.active !== false);
        return businesses.slice(0, 2).map(business => {
            const name = clean(business.name || business.propertyName, 110);
            const cash = number(business.cash, null);
            const satisfaction = number(business.customerSatisfaction ?? business.satisfaction, null);
            const details = [];
            if (cash != null) details.push(`cassa ${Math.round(cash)}`);
            if (satisfaction != null) details.push(`soddisfazione ${Math.round(satisfaction)}/100`);
            return `${name || 'L’attività'} resta operativa durante il periodo${details.length ? ` (${details.join(', ')})` : ''}; mostra lavoro ordinario coerente senza inventare incassi, clienti o contratti non registrati.`;
        });
    }

    function familyBeats(state) {
        const family = asArray(state?.worldMemory?.family).filter(item => item?.name && item?.status !== 'dead').slice(0, 2);
        const needs = state?.worldMemory?.life?.familyNeeds || state?.life?.familyNeeds || {};
        return family.map(member => {
            const key = keyOf(member.name);
            const need = Object.values(needs).find(item => keyOf(item?.name) === key);
            if (need?.need) return `${clean(member.name, 100)} resta parte della quotidianità; esigenza già nota: ${clean(need.need, 180)}${number(need.urgency, 0) >= 70 ? ' (urgente)' : ''}.`;
            return `${clean(member.name, 100)} può comparire nel montaggio solo attraverso normali interazioni compatibili con il rapporto già stabilito.`;
        });
    }

    function activePressureBeats(state) {
        const events = asArray(state?.worldMemory?.events).filter(event => /active|developing|apert|in-corso/.test(keyOf(event?.status))).slice(-4);
        return events.slice(-2).map(event => `${clean(event.title || event.summary, 140)} resta una pressione aperta: il montaggio può mostrarne segnali quotidiani, ma non risolverla senza un evento esplicito.`);
    }

    function kingdomBeat(state) {
        const kingdom = state?.worldMemory?.kingdom || {};
        if (!kingdom.active) return '';
        const details = [];
        if (Number.isFinite(Number(kingdom.people?.approval))) details.push(`approvazione ${Math.round(number(kingdom.people.approval))}/100`);
        if (Number.isFinite(Number(kingdom.stability))) details.push(`stabilità ${Math.round(number(kingdom.stability))}/100`);
        if (Number.isFinite(Number(kingdom.treasury))) details.push(`tesoro ${Math.round(number(kingdom.treasury))}`);
        return `${clean(kingdom.name || 'Il regno', 110)} continua la propria amministrazione ordinaria${details.length ? ` (${details.join(', ')})` : ''}; non trasformare ogni giorno in un nuovo evento politico.`;
    }

    function questBeat(state) {
        const quests = asArray(state?.worldMemory?.quests).filter(quest => !/completed|failed|resolved|closed/.test(keyOf(quest?.status))).slice(0, 3);
        if (!quests.length) return '';
        return `Obiettivi ancora aperti durante il periodo: ${quests.map(quest => clean(quest.name || quest.title, 100)).filter(Boolean).join(', ')}. Il tempo può far aumentare pressione o scadenze, ma nessun obiettivo è completato solo dal montaggio.`;
    }

    function buildMontage(state = getState(), passage) {
        if (!state?.worldMemory) return null;
        const minutes = passageMinutes(passage);
        if (minutes < DAY) return null;
        const requested = minutes >= 30 * DAY ? 5 : minutes >= 7 * DAY ? 4 : 3;
        const candidates = [
            protagonistBeat(state),
            ...businessBeats(state),
            kingdomBeat(state),
            ...familyBeats(state),
            questBeat(state),
            ...activePressureBeats(state)
        ].filter(Boolean);
        const beats = candidates.slice(0, requested);
        if (!beats.length) return null;
        const turn = Math.max(0, Math.round(number(state.worldMemory.turnCount, 0)));
        const item = {
            schemaVersion: SCHEMA_VERSION,
            id: `montage-${turn}-${hashText(`${minutes}|${beats.join('|')}`)}`,
            turn,
            minutes,
            duration: durationLabel(minutes),
            startDate: clean(passage?.startDate, 100),
            endDate: clean(passage?.endDate, 100),
            beats,
            status: 'planned'
        };
        ensureState(state).pending = item;
        return item;
    }

    function buildSummary(montage) {
        if (!montage) return '';
        return `Periodo: ${montage.duration}. Continuità quotidiana da rispettare: ${montage.beats.join(' ')}`;
    }

    function buildDirective(montage) {
        if (!montage) return '';
        return `🎞️ MONTAGGIO TEMPORALE V8 — ${montage.duration}\n` +
            `${montage.beats.map((beat, index) => `${index + 1}. ${beat}`).join('\n')}\n` +
            `REGOLE: narra in modo compatto 2-5 momenti quotidiani rappresentativi prima del primo evento importante. ` +
            `Questi momenti fanno percepire lavoro, famiglia, routine e clima sociale, ma NON possono creare dal nulla denaro, ferite, nuovi NPC, contratti, guerre o completamenti di quest. ` +
            `I cambiamenti persistenti richiedono i normali tag di stato/evento. Non reintrodurre fame o sonno come barra gestionale.`;
    }

    function commitMontage(state = getState(), events = []) {
        if (!state?.worldMemory) return null;
        const registry = ensureState(state);
        const pending = registry.pending;
        if (!pending) return null;
        const committed = {
            ...pending,
            status: 'committed',
            firstImportantEvent: clean(asArray(events)[0]?.title || asArray(events)[0]?.summary, 160)
        };
        registry.history.push(committed);
        registry.history = registry.history.slice(-MAX_HISTORY);
        registry.pending = null;
        return committed;
    }

    function installEventWrapper() {
        const Manager = root.CronacheEvents?.EventManager;
        if (!Manager?.prototype) return false;
        let patched = false;
        const originalBuild = Manager.prototype.buildPrompt;
        if (typeof originalBuild === 'function' && !originalBuild.__phase8MontageWrapped) {
            const wrappedBuild = function phase8MontageBuild(context) {
                const state = getState();
                const passage = context?.timePassage || state?.pendingTimePassage || null;
                const montage = buildMontage(state, passage);
                const enriched = montage && context?.timePassage
                    ? { ...context, timePassage: { ...context.timePassage, summary: buildSummary(montage) } }
                    : context;
                const base = originalBuild.call(this, enriched);
                return montage ? `${base}\n\n${buildDirective(montage)}` : base;
            };
            wrappedBuild.__phase8MontageWrapped = true;
            wrappedBuild.__phase8MontageOriginal = originalBuild;
            Manager.prototype.buildPrompt = wrappedBuild;
            patched = true;
        }
        const originalRecord = Manager.prototype.record;
        if (typeof originalRecord === 'function' && !originalRecord.__phase8MontageWrapped) {
            const wrappedRecord = function phase8MontageRecord(events, incoming, context) {
                const result = originalRecord.apply(this, arguments);
                try { if (result?.added?.length) commitMontage(getState(), result.added); } catch (_error) { }
                return result;
            };
            wrappedRecord.__phase8MontageWrapped = true;
            wrappedRecord.__phase8MontageOriginal = originalRecord;
            Manager.prototype.record = wrappedRecord;
            patched = true;
        }
        return patched;
    }

    function stateFromContext(context) {
        const live = getState();
        if (live?.worldMemory === context?.memory) return live;
        if (!context?.memory) return live;
        return { ...(live || {}), character: context.character || live?.character, currentStory: context.story || live?.currentStory, time: context.time || live?.time, currentLocation: context.currentLocation || live?.currentLocation, worldMemory: context.memory };
    }

    function installDirectorWrapper() {
        const Director = root.CronacheDirector?.GameDirector;
        const originalPlan = Director?.prototype?.planTurn;
        if (typeof originalPlan !== 'function' || originalPlan.__phase8MontageWrapped) return false;
        const wrapped = function phase8MontagePlan(action, context) {
            const plan = originalPlan.apply(this, arguments);
            const state = stateFromContext(context || {});
            const montage = buildMontage(state, state?.pendingTimePassage);
            if (!montage) return plan;
            return { ...plan, timeMontage: montage, prompt: `${plan?.prompt || ''}\n\n${buildDirective(montage)}` };
        };
        wrapped.__phase8MontageWrapped = true;
        wrapped.__phase8MontageOriginal = originalPlan;
        Director.prototype.planTurn = wrapped;
        return true;
    }

    function install() {
        if (root.__cronacheTimeMontageV8Patch >= PATCH_VERSION) return true;
        root.__cronacheTimeMontageV8Patch = PATCH_VERSION;
        installEventWrapper();
        installDirectorWrapper();
        if (typeof root.setTimeout === 'function') {
            root.setTimeout(() => { installEventWrapper(); installDirectorWrapper(); }, 0);
            root.setTimeout(() => { installEventWrapper(); installDirectorWrapper(); }, 900);
        }
        return true;
    }

    const api = { SCHEMA_VERSION, PATCH_VERSION, ensureState, passageMinutes, durationLabel, buildMontage, buildSummary, buildDirective, commitMontage, install };
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
        else install();
    }
    return api;
});
