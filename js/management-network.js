(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheManagementNetwork = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const SCHEMA_VERSION = 1;
    const PATCH_VERSION = 1;
    const MAX_RELATIONS = 120;
    const MAX_RELATION_MEMORIES = 12;
    const MAX_NETWORK_SEEDS_PER_TURN = 1;
    const MAX_TOTAL_MANAGEMENT_SEEDS_PER_TURN = 2;
    const STYLE_ID = 'cronache-management-network-style';
    const PANEL_ID = 'management-network-panel';

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 600) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, number(value, min)));
    const keyOf = value => clean(value, 300).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    let hubObserver = null;

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function hashText(value) {
        const text = String(value || '');
        let hash = 2166136261;
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function ensureNetwork(state = getState()) {
        if (!state?.worldMemory) {
            return { schemaVersion: SCHEMA_VERSION, relations: [], processedEvents: [], processedChats: [], lastInjectionTurn: -1, lastSyncTurn: -1 };
        }
        const memory = state.worldMemory;
        if (!memory.managementNetwork || typeof memory.managementNetwork !== 'object') {
            memory.managementNetwork = {
                schemaVersion: SCHEMA_VERSION,
                relations: [],
                processedEvents: [],
                processedChats: [],
                lastInjectionTurn: -1,
                lastSyncTurn: -1
            };
        }
        const network = memory.managementNetwork;
        network.schemaVersion = SCHEMA_VERSION;
        if (!Array.isArray(network.relations)) network.relations = [];
        if (!Array.isArray(network.processedEvents)) network.processedEvents = [];
        if (!Array.isArray(network.processedChats)) network.processedChats = [];
        if (!Number.isFinite(Number(network.lastInjectionTurn))) network.lastInjectionTurn = -1;
        if (!Number.isFinite(Number(network.lastSyncTurn))) network.lastSyncTurn = -1;
        return network;
    }

    function agentApi() {
        return root.CronacheManagementAgents || null;
    }

    function syncAgents(state = getState()) {
        const api = agentApi();
        return api?.syncAgents ? api.syncAgents(state) : asArray(state?.worldMemory?.managementAgents?.agents);
    }

    function relationKey(left, right) {
        const ids = [clean(left?.id || left?.name, 160), clean(right?.id || right?.name, 160)].filter(Boolean).sort();
        return ids.length === 2 ? ids.join('|') : '';
    }

    function relationType(left, right) {
        const roles = [left?.role, right?.role].map(keyOf).sort();
        if (roles.includes('competitor')) return 'competizione';
        if (roles.includes('diplomatic')) return 'diplomazia';
        if (roles.every(role => role === 'faction')) return 'politica';
        if (roles.includes('faction') || roles.includes('council')) return 'coalizione';
        if (roles.every(role => role === 'employee')) return 'lavoro';
        if (roles.includes('supplier')) return 'filiera';
        if (roles.includes('contractor')) return 'contratto';
        if (roles.includes('customer')) return 'mercato';
        return left?.domain === 'kingdom' || right?.domain === 'kingdom' ? 'politica' : 'commerciale';
    }

    function baselineAffinity(left, right) {
        const averageTrust = (number(left?.trust, 50) + number(right?.trust, 50)) / 2;
        let affinity = Math.round((averageTrust - 50) * 0.7);
        if (left?.role === 'competitor' || right?.role === 'competitor') affinity -= 18;
        if (left?.role === 'faction' && right?.role === 'faction') affinity -= 5;
        if (left?.disposition === 'aligned' && right?.disposition === 'aligned') affinity += 12;
        if (left?.disposition === 'hostile' || right?.disposition === 'hostile') affinity -= 14;
        return Math.max(-70, Math.min(70, affinity));
    }

    function baselineTension(left, right, affinity) {
        let tension = 24 + Math.max(0, -affinity) * 0.65;
        if (left?.role === 'competitor' || right?.role === 'competitor') tension += 20;
        if (left?.disposition === 'hostile') tension += 12;
        if (right?.disposition === 'hostile') tension += 12;
        return clamp(Math.round(tension));
    }

    function baselineCooperation(left, right, affinity) {
        let cooperation = 34 + Math.max(0, affinity) * 0.7;
        if (left?.role === 'supplier' || right?.role === 'supplier') cooperation += 8;
        if (left?.role === 'employee' && right?.role === 'employee') cooperation += 7;
        if (left?.role === 'competitor' || right?.role === 'competitor') cooperation -= 18;
        return clamp(Math.round(cooperation));
    }

    function normalizeRelation(raw) {
        if (!raw) return null;
        const leftId = clean(raw.leftId, 160);
        const rightId = clean(raw.rightId, 160);
        if (!leftId || !rightId || leftId === rightId) return null;
        return {
            id: clean(raw.id, 180) || `relation-${hashText([leftId, rightId].sort().join('|'))}`,
            relationKey: clean(raw.relationKey, 360) || [leftId, rightId].sort().join('|'),
            leftId,
            leftName: clean(raw.leftName, 120),
            leftRole: clean(raw.leftRole, 40),
            rightId,
            rightName: clean(raw.rightName, 120),
            rightRole: clean(raw.rightRole, 40),
            domain: clean(raw.domain, 40),
            subjectId: clean(raw.subjectId, 140),
            type: clean(raw.type || 'relazione', 40),
            affinity: Math.max(-100, Math.min(100, number(raw.affinity))),
            tension: clamp(raw.tension, 0, 100),
            cooperation: clamp(raw.cooperation, 0, 100),
            status: clean(raw.status || 'active', 30),
            lastUpdatedTurn: Math.max(0, number(raw.lastUpdatedTurn)),
            lastEventTurn: Math.max(-1, number(raw.lastEventTurn, -1)),
            lastInteractionTurn: Math.max(-1, number(raw.lastInteractionTurn, -1)),
            memories: asArray(raw.memories).slice(-MAX_RELATION_MEMORIES),
            source: clean(raw.source || 'management-network', 40)
        };
    }

    function upsertRelation(network, left, right, turn = 0, source = 'sync') {
        if (!left || !right || left.id === right.id) return null;
        const pairKey = relationKey(left, right);
        if (!pairKey) return null;
        let relation = network.relations.find(item => item.relationKey === pairKey);
        if (!relation) {
            const affinity = baselineAffinity(left, right);
            relation = normalizeRelation({
                relationKey: pairKey,
                leftId: left.id,
                leftName: left.name,
                leftRole: left.role,
                rightId: right.id,
                rightName: right.name,
                rightRole: right.role,
                domain: left.domain === right.domain ? left.domain : 'cross',
                subjectId: left.subjectId && left.subjectId === right.subjectId ? left.subjectId : '',
                type: relationType(left, right),
                affinity,
                tension: baselineTension(left, right, affinity),
                cooperation: baselineCooperation(left, right, affinity),
                lastUpdatedTurn: turn,
                source
            });
            if (relation) network.relations.push(relation);
        } else {
            relation.leftName = relation.leftName || left.name;
            relation.rightName = relation.rightName || right.name;
            relation.leftRole = relation.leftRole || left.role;
            relation.rightRole = relation.rightRole || right.role;
            relation.lastUpdatedTurn = Math.max(number(relation.lastUpdatedTurn), number(turn));
            relation.status = left.status === 'dormant' && right.status === 'dormant' ? 'dormant' : 'active';
        }
        return relation;
    }

    function bootstrapPairs(agents) {
        const pairs = [];
        const grouped = new Map();
        agents.filter(agent => agent?.status === 'active').forEach(agent => {
            const key = `${agent.domain}|${agent.subjectId}`;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(agent);
        });
        grouped.forEach(group => {
            const ranked = group.slice().sort((a, b) => number(b.priority) - number(a.priority)).slice(0, 10);
            for (let i = 0; i < ranked.length; i++) {
                for (let j = i + 1; j < ranked.length; j++) {
                    const a = ranked[i];
                    const b = ranked[j];
                    const roles = [a.role, b.role];
                    const useful = a.domain === 'kingdom'
                        ? roles.some(role => ['faction', 'council', 'diplomatic'].includes(role))
                        : roles.includes('competitor') || roles.includes('contractor') ||
                            (roles.includes('supplier') && roles.includes('customer')) ||
                            (roles[0] === 'employee' && roles[1] === 'employee');
                    if (useful) pairs.push([a, b]);
                }
            }
        });
        return pairs.slice(0, 60);
    }

    function syncNetwork(state = getState()) {
        if (!state?.worldMemory) return [];
        const network = ensureNetwork(state);
        const turn = Math.max(0, number(state.worldMemory.turnCount));
        const agents = syncAgents(state);
        bootstrapPairs(agents).forEach(([left, right]) => upsertRelation(network, left, right, turn, 'bootstrap'));
        const activeIds = new Set(agents.filter(agent => agent.status === 'active').map(agent => agent.id));
        network.relations = network.relations.map(normalizeRelation).filter(Boolean).map(relation => ({
            ...relation,
            status: activeIds.has(relation.leftId) || activeIds.has(relation.rightId) ? 'active' : 'dormant'
        })).sort((a, b) => relationPriority(b) - relationPriority(a)).slice(0, MAX_RELATIONS);
        network.lastSyncTurn = turn;
        return network.relations;
    }

    function relationMemory(relation, kind, text, turn, delta = {}) {
        if (!relation || !clean(text, 30)) return false;
        const normalized = clean(text, 420);
        const fingerprint = hashText(`${kind}|${normalized}`);
        relation.memories = asArray(relation.memories);
        if (relation.memories.some(item => item.fingerprint === fingerprint)) return false;
        relation.memories.push({ fingerprint, kind: clean(kind, 30), text: normalized, turn: Math.max(0, number(turn)) });
        relation.memories = relation.memories.slice(-MAX_RELATION_MEMORIES);
        relation.affinity = Math.max(-100, Math.min(100, number(relation.affinity) + number(delta.affinity)));
        relation.tension = clamp(number(relation.tension) + number(delta.tension));
        relation.cooperation = clamp(number(relation.cooperation) + number(delta.cooperation));
        relation.lastUpdatedTurn = Math.max(number(relation.lastUpdatedTurn), number(turn));
        if (kind === 'event') relation.lastEventTurn = Math.max(number(relation.lastEventTurn, -1), number(turn));
        if (kind === 'chat') relation.lastInteractionTurn = Math.max(number(relation.lastInteractionTurn, -1), number(turn));
        return true;
    }

    function signalDelta(text) {
        const value = keyOf(text);
        if (/alleanz|coalizion|accord|collabor|cooper|aiut|sostegn|concession|intesa|ademp|pagament-puntual|success/.test(value)) {
            return { affinity: 10, tension: -10, cooperation: 14 };
        }
        if (/tradiment|rottura|minacc|scontro|attacc|sabot|scioper|boicott|rifiut|penal|insolven|protest|denunc|ostil/.test(value)) {
            return { affinity: -12, tension: 17, cooperation: -12 };
        }
        if (/compet|pression|contesa|carenz|ritard|reclam|negozi|ultimatum/.test(value)) {
            return { affinity: -4, tension: 8, cooperation: -3 };
        }
        return { affinity: 1, tension: -1, cooperation: 2 };
    }

    function agentsNamed(agents, names) {
        const wanted = new Set(asArray(names).map(keyOf).filter(Boolean));
        return agents.filter(agent => wanted.has(keyOf(agent.name)));
    }

    function agentsMentioned(agents, text) {
        const corpus = keyOf(text);
        return agents.filter(agent => {
            const name = keyOf(agent.name);
            return name && (corpus.includes(name) || name.split('-').filter(token => token.length >= 4).some(token => corpus.includes(token)));
        });
    }

    function recordEvents(state = getState(), events = []) {
        if (!state?.worldMemory) return [];
        const network = ensureNetwork(state);
        const agents = syncAgents(state);
        const touched = [];
        asArray(events).forEach(event => {
            const eventId = clean(event?.id || event?.fingerprint, 180) || hashText(`${event?.title}|${event?.summary}`);
            if (network.processedEvents.includes(eventId)) return;
            const text = `${event?.title || ''} ${event?.summary || ''} ${event?.consequence || ''}`;
            let participants = agentsNamed(agents, event?.actors);
            if (participants.length < 2) participants = agentsMentioned(agents, text).slice(0, 4);
            participants = participants.slice(0, 4);
            const delta = signalDelta(text);
            for (let i = 0; i < participants.length; i++) {
                for (let j = i + 1; j < participants.length; j++) {
                    const relation = upsertRelation(network, participants[i], participants[j], event?.turn ?? state.worldMemory.turnCount, 'event');
                    if (relation && relationMemory(relation, 'event', `${clean(event?.title, 120)}: ${clean(event?.summary || event?.consequence, 300)}`, event?.turn ?? state.worldMemory.turnCount, delta)) touched.push(relation.id);
                }
            }
            network.processedEvents.push(eventId);
        });
        network.processedEvents = network.processedEvents.slice(-180);
        syncNetwork(state);
        return touched;
    }

    function recordChatMessages(state = getState(), messages = []) {
        if (!state?.worldMemory) return [];
        const network = ensureNetwork(state);
        const agents = syncAgents(state);
        const touched = [];
        asArray(messages).forEach(message => {
            const chatId = clean(message?.id || message?.fingerprint, 180) || hashText(`${message?.threadId}|${message?.speaker}|${message?.text}`);
            if (network.processedChats.includes(chatId)) return;
            const speaker = agents.find(agent => keyOf(agent.name) === keyOf(message?.speaker));
            const target = agents.find(agent => keyOf(agent.name) === keyOf(message?.target));
            if (speaker && target && speaker.id !== target.id) {
                const relation = upsertRelation(network, speaker, target, message?.turn ?? state.worldMemory.turnCount, 'chat');
                const delta = signalDelta(message?.text || '');
                if (relation && relationMemory(relation, 'chat', `${speaker.name} → ${target.name}: ${clean(message?.text, 300)}`, message?.turn ?? state.worldMemory.turnCount, delta)) touched.push(relation.id);
            }
            network.processedChats.push(chatId);
        });
        network.processedChats = network.processedChats.slice(-220);
        syncNetwork(state);
        return touched;
    }

    function relationPriority(relation) {
        const conflict = number(relation?.tension) * 1.15 + Math.max(0, -number(relation?.affinity)) * 0.45;
        const alliance = number(relation?.cooperation) * 0.9 + Math.max(0, number(relation?.affinity)) * 0.35;
        return Math.max(conflict, alliance);
    }

    function relationStateLabel(relation) {
        if (number(relation.tension) >= 72 || number(relation.affinity) <= -55) return 'conflitto';
        if (number(relation.cooperation) >= 72 && number(relation.affinity) >= 30) return 'alleanza';
        if (number(relation.tension) >= 52) return 'tensione';
        if (number(relation.cooperation) >= 58) return 'cooperazione';
        return 'equilibrio';
    }

    function buildRelationContext(state = getState(), options = {}) {
        const agents = syncAgents(state);
        let relations = syncNetwork(state).filter(relation => relation.status === 'active');
        if (options.domain) relations = relations.filter(relation => relation.domain === options.domain);
        if (options.subjectId) relations = relations.filter(relation => keyOf(relation.subjectId) === keyOf(options.subjectId));
        if (asArray(options.names).length) {
            const names = new Set(options.names.map(keyOf));
            relations = relations.filter(relation => names.has(keyOf(relation.leftName)) || names.has(keyOf(relation.rightName)));
        }
        const agentById = new Map(agents.map(agent => [agent.id, agent]));
        relations = relations.sort((a, b) => relationPriority(b) - relationPriority(a)).slice(0, Math.max(1, Math.min(10, number(options.limit, 6))));
        if (!relations.length) return '';
        return relations.map(relation => {
            const left = agentById.get(relation.leftId);
            const right = agentById.get(relation.rightId);
            const memory = asArray(relation.memories).slice(-2).map(item => clean(item.text, 150)).join(' / ');
            return `- ${relation.leftName} ↔ ${relation.rightName} [${relation.type}, ${relationStateLabel(relation)}]: affinità ${Math.round(number(relation.affinity))}, tensione ${Math.round(number(relation.tension))}/100, cooperazione ${Math.round(number(relation.cooperation))}/100. ${left?.publicGoal ? `${relation.leftName} vuole ${clean(left.publicGoal, 120)}. ` : ''}${right?.publicGoal ? `${relation.rightName} vuole ${clean(right.publicGoal, 120)}. ` : ''}${memory ? `Ultimi fatti: ${memory}.` : ''}`;
        }).join('\n');
    }

    function networkCandidate(state = getState()) {
        const turn = Math.max(0, number(state?.worldMemory?.turnCount));
        const relations = syncNetwork(state).filter(relation => relation.status === 'active' && turn - number(relation.lastEventTurn, -99) >= 3);
        const candidate = relations.map(relation => ({ relation, score: relationPriority(relation), state: relationStateLabel(relation) }))
            .filter(item => item.score >= 68 && ['conflitto', 'alleanza', 'tensione', 'cooperazione'].includes(item.state))
            .sort((a, b) => b.score - a.score)[0];
        if (!candidate) return null;
        const relation = candidate.relation;
        const negative = candidate.state === 'conflitto' || candidate.state === 'tensione';
        const memory = asArray(relation.memories).slice(-2).map(item => clean(item.text, 170)).join(' / ') || 'nessun episodio recente registrato';
        return {
            score: Math.min(96, Math.max(60, Math.round(candidate.score))),
            title: negative
                ? `${relation.leftName} e ${relation.rightName}: interessi in collisione`
                : `${relation.leftName} e ${relation.rightName}: convergenza di interessi`,
            actors: [relation.leftName, relation.rightName],
            sourceId: relation.id,
            relationId: relation.id,
            cause: negative
                ? `${relation.leftName} e ${relation.rightName} hanno una relazione ${relation.type} con tensione ${Math.round(number(relation.tension))}/100 e affinità ${Math.round(number(relation.affinity))}. Ultimi fatti: ${memory}. Fai compiere a uno o entrambi una mossa concreta e autonoma coerente con i loro obiettivi: accordo con terzi, pressione, boicottaggio, concorrenza, richiesta, sciopero, coalizione o rottura solo se sostenuti dal contesto. Non risolvere la tensione gratuitamente.`
                : `${relation.leftName} e ${relation.rightName} hanno cooperazione ${Math.round(number(relation.cooperation))}/100 e affinità ${Math.round(number(relation.affinity))}. Ultimi fatti: ${memory}. Fai emergere una mossa congiunta concreta coerente con i loro interessi: accordo, fornitura preferenziale, sostegno, coalizione, passaparola o coordinamento. La cooperazione deve avere benefici, costi e un effetto osservabile sul mondo.`
        };
    }

    function countManagementSeedsThisTurn(state, timelineApi) {
        const turn = Math.max(0, number(state?.worldMemory?.turnCount));
        return timelineApi.normalizeEventQueue(state?.worldMemory?.pendingTimelineEvents, { turn }).filter(seed =>
            number(seed.createdAtTurn) === turn && /^management-(?:autonomy|network)/.test(seed.source || '')
        ).length;
    }

    function candidateToSeed(candidate, state = getState(), timelineApi = root.CronacheTimelineSimulator) {
        if (!candidate || !timelineApi?.normalizeEventSeed) return null;
        const turn = Math.max(0, number(state?.worldMemory?.turnCount));
        const score = Math.min(96, Math.max(60, number(candidate.score, 70)));
        return timelineApi.normalizeEventSeed({
            id: `management-network-${hashText(`${candidate.relationId}|${turn}`)}`,
            kind: 'world_initiative',
            title: candidate.title,
            cause: candidate.cause,
            actors: candidate.actors,
            priority: score,
            notBeforeMinutes: score >= 88 ? 180 : score >= 76 ? 720 : 1440,
            interactionMode: 'either',
            sourceId: candidate.sourceId,
            source: 'management-network',
            batchId: `management-network-${turn}`,
            createdAtTurn: turn,
            originTurn: turn,
            causalLane: 'world'
        }, 0, { turn, batchId: `management-network-${turn}` });
    }

    function enqueueNetworkSeed(state = getState(), timelineApi = root.CronacheTimelineSimulator) {
        if (!state?.worldMemory || !timelineApi?.normalizeEventQueue || !timelineApi?.scheduleEventSeeds) return [];
        const network = ensureNetwork(state);
        const turn = Math.max(0, number(state.worldMemory.turnCount));
        if (number(network.lastInjectionTurn, -1) === turn) return [];
        network.lastInjectionTurn = turn;
        if (countManagementSeedsThisTurn(state, timelineApi) >= MAX_TOTAL_MANAGEMENT_SEEDS_PER_TURN) return [];
        const candidate = networkCandidate(state);
        if (!candidate) return [];
        const seed = candidateToSeed(candidate, state, timelineApi);
        if (!seed) return [];
        const current = timelineApi.normalizeEventQueue(state.worldMemory.pendingTimelineEvents, { turn });
        state.worldMemory.pendingTimelineEvents = timelineApi.scheduleEventSeeds(current, [seed], { turn, batchId: seed.batchId });
        const relation = network.relations.find(item => item.id === candidate.relationId);
        if (relation) relation.lastEventTurn = turn;
        return [seed].slice(0, MAX_NETWORK_SEEDS_PER_TURN);
    }

    function patchEventManager() {
        const Manager = root.CronacheEvents?.EventManager;
        const original = Manager?.prototype?.record;
        if (typeof original !== 'function' || original.__managementNetworkWrapped) return Boolean(original?.__managementNetworkWrapped);
        const wrapped = function managementNetworkEventRecord(events, incoming, context) {
            const result = original.call(this, events, incoming, context);
            try { if (result?.added?.length) recordEvents(getState(), result.added); } catch (error) { console.warn('[ManagementNetwork] evento non collegato:', error); }
            return result;
        };
        wrapped.__managementNetworkWrapped = true;
        wrapped.__managementNetworkOriginal = original;
        Manager.prototype.record = wrapped;
        return true;
    }

    function patchTimelineChat() {
        const chat = root.CronacheTimelineChat;
        if (!chat) return false;
        const promptOriginal = chat.buildChatPrompt;
        if (typeof promptOriginal === 'function' && !promptOriginal.__managementNetworkWrapped) {
            const wrappedPrompt = function managementNetworkChatPrompt(thread, playerMessage, context = {}) {
                const names = asArray(thread?.participants);
                const relationContext = buildRelationContext(getState(), { names, limit: 5 });
                return promptOriginal.call(this, thread, playerMessage, relationContext ? {
                    ...context,
                    actorContext: clean(`${context.actorContext || ''}\nRELAZIONI TRA LE PARTI — rispettale e falle evolvere solo per cause concrete:\n${relationContext}`, 6000)
                } : context);
            };
            wrappedPrompt.__managementNetworkWrapped = true;
            wrappedPrompt.__managementNetworkOriginal = promptOriginal;
            chat.buildChatPrompt = wrappedPrompt;
        }
        const recordOriginal = chat.recordMessages;
        if (typeof recordOriginal === 'function' && !recordOriginal.__managementNetworkWrapped) {
            const wrappedRecord = function managementNetworkChatRecord(chats, incomingMessages, context = {}) {
                const result = recordOriginal.call(this, chats, incomingMessages, context);
                try { if (result?.added?.length) recordChatMessages(getState(), result.added); } catch (error) { console.warn('[ManagementNetwork] chat non collegata:', error); }
                return result;
            };
            wrappedRecord.__managementNetworkWrapped = true;
            wrappedRecord.__managementNetworkOriginal = recordOriginal;
            chat.recordMessages = wrappedRecord;
        }
        return true;
    }

    function patchNarrativeContexts() {
        let patched = false;
        const Business = root.CronacheBusiness?.BusinessManager;
        const businessOriginal = Business?.prototype?.buildNarrativeContext;
        if (typeof businessOriginal === 'function' && !businessOriginal.__managementNetworkWrapped) {
            const wrappedBusiness = function managementNetworkBusinessContext(state, employees, turn, currency) {
                const base = businessOriginal.call(this, state, employees, turn, currency);
                const extra = buildRelationContext(getState(), { domain: 'business', limit: 7 });
                return extra ? `${base || ''}\n🔗 RETE ECONOMICA — clienti, fornitori, dipendenti e concorrenti si influenzano anche tra loro:\n${extra}\n` : base;
            };
            wrappedBusiness.__managementNetworkWrapped = true;
            wrappedBusiness.__managementNetworkOriginal = businessOriginal;
            Business.prototype.buildNarrativeContext = wrappedBusiness;
            patched = true;
        }
        const Kingdom = root.CronacheKingdom?.KingdomManager;
        const kingdomOriginal = Kingdom?.prototype?.buildNarrativeContext;
        if (typeof kingdomOriginal === 'function' && !kingdomOriginal.__managementNetworkWrapped) {
            const wrappedKingdom = function managementNetworkKingdomContext(input, turn, currency) {
                const base = kingdomOriginal.call(this, input, turn, currency);
                const extra = buildRelationContext(getState(), { domain: 'kingdom', limit: 7 });
                return extra ? `${base || ''}\n🔗 RETE POLITICA — fazioni, consiglieri e potenze possono coalizzarsi o ostacolarsi tra loro:\n${extra}\n` : base;
            };
            wrappedKingdom.__managementNetworkWrapped = true;
            wrappedKingdom.__managementNetworkOriginal = kingdomOriginal;
            Kingdom.prototype.buildNarrativeContext = wrappedKingdom;
            patched = true;
        }
        return patched;
    }

    function installStyles(documentRef) {
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
        const style = documentRef.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #management-network-panel { margin-top:10px; padding:12px; border:1px solid rgba(87,62,31,.18); border-radius:13px; background:rgba(250,248,239,.78); }
            #management-network-panel .management-network-head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:9px; }
            #management-network-panel h4 { margin:0; color:#372319; font-family:'Cinzel',serif; font-size:.88rem; }
            #management-network-panel .management-network-count { padding:3px 8px; border-radius:999px; background:rgba(91,70,155,.1); color:#493d78; font:700 .66rem Arial,sans-serif; }
            #management-network-panel .management-relation-list { display:grid; gap:7px; }
            #management-network-panel .management-relation-card { padding:9px 10px; border:1px solid rgba(92,64,48,.13); border-radius:10px; background:rgba(255,255,255,.62); }
            #management-network-panel .management-relation-top { display:flex; align-items:center; justify-content:space-between; gap:8px; }
            #management-network-panel .management-relation-top strong { color:#2c1810; font-size:.84rem; }
            #management-network-panel .management-relation-chip { padding:3px 7px; border-radius:999px; font:700 .6rem Arial,sans-serif; text-transform:uppercase; }
            #management-network-panel .management-relation-chip.conflitto { color:#7a171c; background:rgba(156,34,40,.12); }
            #management-network-panel .management-relation-chip.tensione { color:#7a5311; background:rgba(193,137,29,.14); }
            #management-network-panel .management-relation-chip.cooperazione { color:#245473; background:rgba(46,107,150,.12); }
            #management-network-panel .management-relation-chip.alleanza { color:#23613e; background:rgba(46,139,87,.12); }
            #management-network-panel .management-relation-chip.equilibrio { color:#66513e; background:rgba(92,64,48,.09); }
            #management-network-panel small { display:block; margin-top:4px; color:#6a5540; font-size:.72rem; line-height:1.3; }
            @media (max-width:640px) { #management-network-panel { padding:10px; } #management-network-panel .management-relation-top { align-items:flex-start; } }
        `;
        documentRef.head.appendChild(style);
    }

    function renderNetworkPanel(documentRef) {
        const body = documentRef?.getElementById('management-hub-body');
        if (!body || documentRef.getElementById(PANEL_ID)) return false;
        const relations = syncNetwork(getState()).filter(item => item.status === 'active')
            .sort((a, b) => relationPriority(b) - relationPriority(a));
        const section = documentRef.createElement('section');
        section.id = PANEL_ID;
        const cards = relations.slice(0, 6).map(relation => {
            const label = relationStateLabel(relation);
            const memory = asArray(relation.memories).slice(-1)[0]?.text || 'Rapporto ancora senza un episodio diretto registrato.';
            return `<article class="management-relation-card"><div class="management-relation-top"><strong>${escapeHtml(relation.leftName)} ↔ ${escapeHtml(relation.rightName)}</strong><span class="management-relation-chip ${escapeHtml(label)}">${escapeHtml(label)}</span></div><small>${escapeHtml(relation.type)} · affinità ${Math.round(number(relation.affinity))} · tensione ${Math.round(number(relation.tension))}% · cooperazione ${Math.round(number(relation.cooperation))}%</small><small>${escapeHtml(clean(memory, 180))}</small></article>`;
        }).join('');
        section.innerHTML = `<div class="management-network-head"><h4>🔗 Relazioni tra agenti</h4><span class="management-network-count">${relations.length} legami</span></div><div class="management-relation-list">${cards || '<p class="management-hub-intro">Le relazioni nasceranno quando persone, imprese e fazioni interagiranno tra loro.</p>'}</div>`;
        body.appendChild(section);
        return true;
    }

    function observeHub(documentRef, windowRef) {
        if (hubObserver || typeof windowRef.MutationObserver !== 'function') return;
        const body = documentRef.getElementById('management-hub-body');
        if (!body) return;
        hubObserver = new windowRef.MutationObserver(() => {
            if (!documentRef.getElementById(PANEL_ID)) windowRef.setTimeout(() => renderNetworkPanel(documentRef), 0);
        });
        hubObserver.observe(body, { childList: true });
    }

    function installUiEvents(documentRef, windowRef) {
        if (documentRef.__managementNetworkUiInstalled) return;
        documentRef.__managementNetworkUiInstalled = true;
        documentRef.addEventListener('click', event => {
            const advance = event.target?.closest?.('#btn-advance-world, #btn-simulate-timeline');
            if (advance) {
                const state = getState();
                if (state && !state.isProcessing) {
                    try {
                        const seeds = enqueueNetworkSeed(state);
                        if (seeds.length) root.renderTimeline?.();
                    } catch (error) { console.warn('[ManagementNetwork] iniziativa di rete non accodata:', error); }
                }
            }
            if (event.target?.closest?.('#btn-management-hub')) {
                try { syncNetwork(getState()); } catch (_error) { }
                windowRef.setTimeout(() => renderNetworkPanel(documentRef), 0);
            }
        }, true);
    }

    function install(documentRef, windowRef) {
        const state = getState();
        if (state?.worldMemory) syncNetwork(state);
        const patched = [patchEventManager(), patchTimelineChat(), patchNarrativeContexts()].some(Boolean);
        if (documentRef && windowRef) {
            installStyles(documentRef);
            observeHub(documentRef, windowRef);
            installUiEvents(documentRef, windowRef);
            renderNetworkPanel(documentRef);
            documentRef.body?.classList.add('management-network-ready');
        }
        root.__cronacheManagementNetworkVersion = PATCH_VERSION;
        return patched || Boolean(state?.worldMemory);
    }

    function scheduleInstall() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        const attempt = () => install(document, window);
        [0, 100, 350, 900, 1800, 3500, 5500].forEach(delay => window.setTimeout(attempt, delay));
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attempt, { once: true });
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        SCHEMA_VERSION, PATCH_VERSION, MAX_RELATIONS, MAX_RELATION_MEMORIES,
        ensureNetwork, syncNetwork, upsertRelation, relationMemory, signalDelta, recordEvents, recordChatMessages,
        relationPriority, relationStateLabel, buildRelationContext, networkCandidate, candidateToSeed,
        countManagementSeedsThisTurn, enqueueNetworkSeed, install
    };
});