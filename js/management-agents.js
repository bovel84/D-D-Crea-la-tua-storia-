(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheManagementAgents = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const SCHEMA_VERSION = 1;
    const PATCH_VERSION = 1;
    const MAX_AGENTS = 80;
    const MAX_MEMORIES = 16;
    const MAX_WORLD_MIRRORS = 28;
    const STYLE_ID = 'cronache-management-agents-style';
    const PANEL_ID = 'management-agents-panel';

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 500) => String(value == null ? '' : value)
        .replace(/\s+/g, ' ').trim().slice(0, max);
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, number(value, min)));
    const keyOf = value => clean(value, 300).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    let hubObserver = null;
    let patchTimer = null;

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

    function ensureRegistry(state = getState()) {
        if (!state?.worldMemory) return { schemaVersion: SCHEMA_VERSION, agents: [], processedEvents: [], lastSyncTurn: -1 };
        const memory = state.worldMemory;
        if (!memory.managementAgents || typeof memory.managementAgents !== 'object') {
            memory.managementAgents = { schemaVersion: SCHEMA_VERSION, agents: [], processedEvents: [], lastSyncTurn: -1 };
        }
        const registry = memory.managementAgents;
        registry.schemaVersion = SCHEMA_VERSION;
        if (!Array.isArray(registry.agents)) registry.agents = [];
        if (!Array.isArray(registry.processedEvents)) registry.processedEvents = [];
        if (!Number.isFinite(Number(registry.lastSyncTurn))) registry.lastSyncTurn = -1;
        return registry;
    }

    function roleGoal(role, source = {}) {
        const explicit = clean(source.publicGoal || source.goal || source.goals || source.agenda || source.desires, 260);
        if (explicit) return explicit;
        return {
            customer: 'ottenere valore, qualità e affidabilità senza pagare più del necessario',
            supplier: 'mantenere ordini prevedibili, pagamenti puntuali e margini sostenibili',
            employee: 'proteggere reddito, stabilità del lavoro e possibilità di crescita',
            competitor: 'difendere quota di mercato, clienti e accesso alle risorse migliori',
            contractor: 'far rispettare i termini economici e ridurre il rischio della controparte',
            faction: 'aumentare influenza politica e ottenere decisioni favorevoli ai propri sostenitori',
            council: 'orientare le decisioni del governo secondo il proprio mandato e interesse',
            diplomatic: 'proteggere gli interessi della propria parte e migliorare la posizione negoziale'
        }[role] || 'proteggere i propri interessi nel rapporto con il protagonista';
    }

    function rolePrivateGoal(role, source = {}) {
        const explicit = clean(source.privateGoal || source.hiddenGoal, 240);
        if (explicit) return explicit;
        return {
            customer: 'evitare di diventare dipendente da un solo venditore',
            supplier: 'aumentare il potere contrattuale senza perdere il cliente',
            employee: 'migliorare condizioni e sicurezza personale',
            competitor: 'approfittare delle debolezze del rivale prima che si riprenda',
            contractor: 'scaricare sulla controparte i rischi non coperti dal contratto',
            faction: 'convertire consenso e crisi in potere negoziale concreto',
            council: 'rafforzare la propria posizione nel processo decisionale',
            diplomatic: 'ottenere concessioni senza esporsi a costi sproporzionati'
        }[role] || 'conservare margine di manovra';
    }

    function baselineTrust(role, source = {}) {
        if (role === 'customer') return clamp((number(source.loyalty, 45) + number(source.satisfaction, 60)) / 2);
        if (role === 'supplier') return clamp(35 + number(source.reliability, 70) * 0.35 + number(source.discount, 0) * 0.25);
        if (role === 'employee') return clamp(number(source.morale, 55));
        if (role === 'competitor') return 25;
        if (role === 'faction') return clamp(number(source.loyalty, 45) - number(source.hostility, 20) * 0.35 + 20);
        if (role === 'council') return clamp(number(source.loyalty, 50));
        if (role === 'diplomatic') return clamp(number(source.relation, source.trust ?? 45));
        return clamp(number(source.trust, 50));
    }

    function sourceInfluence(role, source = {}) {
        if (role === 'customer') return clamp(15 + Math.min(55, number(source.lifetimeValue) / 100));
        if (role === 'supplier') return clamp(25 + number(source.reliability, 70) * 0.45);
        if (role === 'employee') return clamp(15 + number(source.skill, 50) * 0.45);
        if (role === 'competitor') return clamp(number(source.influence, source.marketShare ?? 60));
        if (role === 'contractor') return clamp(25 + Math.min(60, number(source.amount) / 250));
        return clamp(number(source.influence, 50));
    }

    function sourceLeverage(role, source = {}) {
        if (role === 'customer') return `fedeltà ${Math.round(number(source.loyalty, 40))}%, valore storico ${Math.round(number(source.lifetimeValue))}`;
        if (role === 'supplier') return `affidabilità ${Math.round(number(source.reliability, 70))}%, consegna ${Math.max(0, Math.round(number(source.leadTurns, 1)))} turni`;
        if (role === 'employee') return `competenza ${Math.round(number(source.skill, 50))}%, morale ${Math.round(number(source.morale, 55))}%`;
        if (role === 'competitor') return clean(source.leverage || source.resources || 'clientela concorrente, prezzi e capacità di risposta', 220);
        if (role === 'contractor') return `contratto ${clean(source.title || source.kind || 'commerciale', 90)}, valore ${Math.round(number(source.amount))}`;
        if (role === 'faction') return `influenza ${Math.round(number(source.influence, 50))}%, ostilità ${Math.round(number(source.hostility, 20))}%`;
        if (role === 'council') return clean(source.resources || source.leverage || `ruolo istituzionale e influenza ${Math.round(number(source.influence, 45))}%`, 220);
        if (role === 'diplomatic') return clean(source.resources || source.leverage || 'accesso diplomatico, commercio e relazioni esterne', 220);
        return clean(source.resources || source.leverage || 'relazioni e informazioni disponibili', 220);
    }

    function sourceUrgency(role, source = {}) {
        if (role === 'customer') return clamp(35 + Math.max(0, 50 - number(source.satisfaction, 60)) * 0.7);
        if (role === 'supplier') return clamp(35 + Math.max(0, 55 - number(source.reliability, 70)) * 0.5);
        if (role === 'employee') return clamp(35 + Math.max(0, 55 - number(source.morale, 55)) * 0.8);
        if (role === 'competitor') return clamp(number(source.urgency, 58));
        if (role === 'contractor') return clamp(source.status === 'active' ? 55 : 25);
        if (role === 'faction') return clamp(30 + number(source.hostility, 20) * 0.55 + Math.max(0, 45 - number(source.loyalty, 50)) * 0.45);
        if (role === 'council') return clamp(number(source.urgency, 45));
        if (role === 'diplomatic') return clamp(number(source.tension, source.urgency ?? 45));
        return 40;
    }

    function collectSources(state = getState()) {
        const memory = state?.worldMemory || {};
        const rows = [];
        const employees = asArray(memory.employees);
        asArray(memory?.management?.businesses).forEach(business => {
            if (!business || business.status === 'closed') return;
            const subjectId = clean(business.id || business.name, 120);
            const subjectName = clean(business.name || business.propertyName, 120);
            asArray(business.customers).forEach(source => {
                if (source?.name) rows.push({ domain: 'business', role: 'customer', subjectId, subjectName, source, active: true });
            });
            asArray(business.suppliers).forEach(source => {
                if (source?.name) rows.push({ domain: 'business', role: 'supplier', subjectId, subjectName, source, active: source.status !== 'inactive' });
            });
            employees.filter(source => source?.name && source?.status !== 'fired' && keyOf(source.property) === keyOf(business.propertyName))
                .forEach(source => rows.push({ domain: 'business', role: 'employee', subjectId, subjectName, source, active: true }));
            asArray(business.competitors).forEach(source => {
                const normalized = typeof source === 'string' ? { name: source } : source;
                if (normalized?.name) rows.push({ domain: 'business', role: 'competitor', subjectId, subjectName, source: normalized, active: normalized.status !== 'closed' });
            });
            asArray(business.contracts).forEach(source => {
                if (!source?.counterpartyName) return;
                const counterpartyType = keyOf(source.counterpartyType || source.kind);
                const role = /competitor|concorrent|rival/.test(counterpartyType) ? 'competitor' : 'contractor';
                rows.push({
                    domain: 'business', role, subjectId, subjectName,
                    source: { ...source, name: source.counterpartyName },
                    active: source.status === 'active' || source.status === 'draft'
                });
            });
        });

        const kingdom = memory.kingdom || {};
        if (kingdom.active) {
            const subjectId = clean(kingdom.name || 'kingdom', 120);
            const subjectName = clean(kingdom.name || 'Regno', 120);
            asArray(kingdom.factions).forEach(source => {
                if (source?.name) rows.push({ domain: 'kingdom', role: 'faction', subjectId, subjectName, source, active: source.status !== 'resolved' });
            });
            asArray(kingdom.council).forEach(source => {
                const normalized = typeof source === 'string' ? { name: source } : source;
                if (normalized?.name) rows.push({ domain: 'kingdom', role: 'council', subjectId, subjectName, source: normalized, active: normalized.status !== 'removed' });
            });
            asArray(kingdom.diplomacy).forEach(source => {
                const normalized = typeof source === 'string' ? { name: source } : source;
                const name = normalized?.name || normalized?.counterpart || normalized?.kingdom || normalized?.target;
                if (name) rows.push({ domain: 'kingdom', role: 'diplomatic', subjectId, subjectName, source: { ...normalized, name }, active: normalized.status !== 'closed' });
            });
        }

        const deduped = new Map();
        rows.forEach(row => {
            const stableKey = `${row.domain}|${row.subjectId}|${keyOf(row.source?.name)}`;
            const existing = deduped.get(stableKey);
            if (!existing || (existing.role === 'contractor' && row.role !== 'contractor')) deduped.set(stableKey, row);
        });
        return [...deduped.values()];
    }

    function defaultStrategy(role, disposition) {
        const strategies = {
            customer: {
                hostile: 'ridurre acquisti, reclamare e cercare alternative', wary: 'comprare solo con garanzie e confrontare offerte', pragmatic: 'restare se prezzo e servizio sono competitivi', aligned: 'consolidare il rapporto e aumentare la fedeltà'
            },
            supplier: {
                hostile: 'ridurre credito, irrigidire condizioni e privilegiare altri clienti', wary: 'chiedere anticipo o garanzie prima di esporsi', pragmatic: 'negoziare volumi e pagamenti vantaggiosi per entrambe le parti', aligned: 'offrire priorità, affidabilità e condizioni migliori'
            },
            employee: {
                hostile: 'ridurre collaborazione, contestare le condizioni o preparare l’uscita', wary: 'proteggersi e chiedere impegni verificabili', pragmatic: 'collaborare in cambio di stabilità e riconoscimento', aligned: 'investire competenza e reputazione nel successo dell’attività'
            },
            competitor: {
                hostile: 'attaccare quote di mercato, prezzi, forniture o reputazione del rivale', wary: 'osservare le debolezze e reagire senza esporsi troppo', pragmatic: 'competere selettivamente e cooperare solo dove conviene', aligned: 'mantenere una tregua opportunistica finché crea valore'
            },
            contractor: {
                hostile: 'applicare rigidamente clausole, penali e scadenze', wary: 'rinegoziare garanzie prima di proseguire', pragmatic: 'far rispettare il contratto preservando la relazione', aligned: 'estendere l’accordo se entrambe le parti adempiono'
            },
            faction: {
                hostile: 'mobilitare sostenitori, bloccare decisioni e aumentare il costo politico del governo', wary: 'negoziare concessioni prima di concedere appoggio', pragmatic: 'scambiare sostegno con risultati per la propria base', aligned: 'difendere il governo finché mantiene gli impegni'
            },
            council: {
                hostile: 'ostacolare la linea di governo nelle sedi istituzionali', wary: 'pretendere garanzie e controlli prima di votare', pragmatic: 'costruire maggioranze su provvedimenti concreti', aligned: 'facilitare l’attuazione delle decisioni condivise'
            },
            diplomatic: {
                hostile: 'aumentare pressione, condizioni e contromisure esterne', wary: 'limitare l’esposizione e chiedere reciprocità', pragmatic: 'negoziare scambi e concessioni verificabili', aligned: 'ampliare cooperazione e coordinamento'
            }
        };
        return strategies[role]?.[disposition] || 'agire in modo coerente con interessi, memoria e leve disponibili';
    }

    function evolveAgent(agent, turn) {
        const deltaTurns = Math.max(0, number(turn) - number(agent.lastEvolutionTurn, turn));
        if (deltaTurns > 0) {
            const decay = Math.pow(0.97, Math.min(20, deltaTurns));
            agent.grievance = clamp(number(agent.grievance) * decay);
            agent.opportunity = clamp(number(agent.opportunity) * decay);
            agent.lastEvolutionTurn = turn;
        }
        const relationshipScore = clamp(number(agent.trust, 50) - number(agent.grievance) * 0.45 + number(agent.opportunity) * 0.25);
        agent.disposition = relationshipScore < 30 ? 'hostile' : relationshipScore < 50 ? 'wary' : relationshipScore < 72 ? 'pragmatic' : 'aligned';
        agent.strategy = defaultStrategy(agent.role, agent.disposition);
        agent.priority = clamp(number(agent.urgency, 40) + number(agent.grievance) * 0.35 + number(agent.opportunity) * 0.12 + Math.min(18, Math.max(0, number(turn) - number(agent.lastMoveTurn, turn)) * 2));
        return agent;
    }

    function upsertSource(registry, row, turn) {
        const name = clean(row.source?.name, 120);
        if (!name) return null;
        const stableKey = `${row.domain}|${row.subjectId}|${keyOf(name)}`;
        let agent = registry.agents.find(item => item.stableKey === stableKey);
        const baseline = baselineTrust(row.role, row.source);
        if (!agent) {
            agent = {
                id: `management-agent-${hashText(stableKey)}`,
                stableKey,
                name,
                domain: row.domain,
                role: row.role,
                subjectId: row.subjectId,
                subjectName: row.subjectName,
                status: row.active ? 'active' : 'dormant',
                trust: baseline,
                grievance: 0,
                opportunity: 0,
                influence: sourceInfluence(row.role, row.source),
                urgency: sourceUrgency(row.role, row.source),
                publicGoal: roleGoal(row.role, row.source),
                privateGoal: rolePrivateGoal(row.role, row.source),
                leverage: sourceLeverage(row.role, row.source),
                personality: clean(row.source.personality || row.source.traits || '', 180),
                constraints: clean(row.source.constraints || row.source.limits || '', 220),
                strategy: '', disposition: 'pragmatic', priority: 40,
                memories: [], firstSeenTurn: turn, lastSeenTurn: turn,
                lastMoveTurn: Math.max(0, number(row.source.lastMoveTurn, turn)),
                lastInteractionTurn: 0, lastEvolutionTurn: turn,
                sourceSnapshot: {}
            };
            registry.agents.push(agent);
        } else {
            const firstSyncThisTurn = number(agent.lastSeenTurn, -1) < turn;
            agent.name = name;
            if (agent.role === 'contractor' || row.role !== 'contractor') agent.role = row.role || agent.role;
            agent.subjectName = row.subjectName || agent.subjectName;
            agent.status = row.active ? 'active' : 'dormant';
            if (firstSyncThisTurn) agent.trust = clamp(number(agent.trust, baseline) * 0.9 + baseline * 0.1);
            agent.influence = sourceInfluence(agent.role, row.source);
            agent.urgency = sourceUrgency(agent.role, row.source);
            agent.publicGoal = roleGoal(agent.role, row.source) || agent.publicGoal;
            agent.privateGoal = rolePrivateGoal(agent.role, row.source) || agent.privateGoal;
            agent.leverage = sourceLeverage(agent.role, row.source) || agent.leverage;
            agent.personality = clean(row.source.personality || row.source.traits || agent.personality, 180);
            agent.constraints = clean(row.source.constraints || row.source.limits || agent.constraints, 220);
            agent.lastSeenTurn = turn;
        }
        agent.sourceSnapshot = {
            satisfaction: number(row.source.satisfaction, row.source.customerSatisfaction), loyalty: number(row.source.loyalty),
            reliability: number(row.source.reliability), morale: number(row.source.morale), skill: number(row.source.skill),
            influence: number(row.source.influence), hostility: number(row.source.hostility), amount: number(row.source.amount),
            status: clean(row.source.status, 40)
        };
        return evolveAgent(agent, turn);
    }

    function syncWorldActors(state, agents) {
        const world = state?.worldMemory?.world;
        if (!world || typeof world !== 'object') return;
        const existing = asArray(world.actors);
        const preserved = existing.filter(actor => actor?.source !== 'management-agent');
        const known = new Set(preserved.map(actor => keyOf(actor?.name)).filter(Boolean));
        const mirrors = agents.filter(agent => agent.status === 'active')
            .sort((a, b) => number(b.priority) - number(a.priority))
            .filter(agent => {
                const key = keyOf(agent.name);
                if (!key || known.has(key)) return false;
                known.add(key);
                return true;
            }).slice(0, MAX_WORLD_MIRRORS).map(agent => ({
                id: agent.id, name: agent.name,
                kind: agent.role === 'faction' ? 'faction' : agent.role === 'council' ? 'group' : 'npc',
                role: agent.role, goal: agent.publicGoal, publicGoal: agent.publicGoal,
                privateGoal: agent.privateGoal, strategy: agent.strategy, resources: agent.leverage,
                leverage: agent.leverage, personality: agent.personality, constraints: agent.constraints,
                influence: Math.round(number(agent.influence)), status: 'active',
                lastMoveTurn: Math.round(number(agent.lastMoveTurn)), source: 'management-agent'
            }));
        world.actors = [...preserved, ...mirrors].slice(-120);
    }

    function syncAgents(state = getState()) {
        if (!state?.worldMemory) return [];
        const registry = ensureRegistry(state);
        const turn = Math.max(0, Math.round(number(state.worldMemory.turnCount)));
        const rows = collectSources(state);
        const seen = new Set();
        rows.forEach(row => {
            const agent = upsertSource(registry, row, turn);
            if (agent) seen.add(agent.stableKey);
        });
        registry.agents.forEach(agent => {
            if (!seen.has(agent.stableKey) && number(agent.lastSeenTurn) < turn) agent.status = 'dormant';
            evolveAgent(agent, turn);
        });
        registry.agents = registry.agents
            .sort((a, b) => number(b.lastSeenTurn) - number(a.lastSeenTurn) || number(b.priority) - number(a.priority))
            .slice(0, MAX_AGENTS);
        registry.lastSyncTurn = turn;
        syncWorldActors(state, registry.agents);
        return registry.agents;
    }

    function memoryValence(text) {
        const value = keyOf(text);
        if (/licenzi|penal|ritard|insolven|rifiut|protest|perdit|aument-tass|aument-prezz|tagl|repression|tradiment|rottura|violazion/.test(value)) return -2;
        if (/reclam|scontent|tension|carenz|scars|minacc|debito|crisi|fallit/.test(value)) return -1;
        if (/premi|aument-stipend|aiut|sussid|formaz|pagament-puntual|sconto|accord|success|utile|opportunit|investiment/.test(value)) return 1;
        if (/promozion|forte-crescita|alleanz|ademp|fiducia|bonus/.test(value)) return 2;
        return 0;
    }

    function remember(agent, kind, text, turn, valence = 0, metadata = {}) {
        if (!agent || !clean(text, 30)) return false;
        const memoryText = clean(text, 420);
        const fingerprint = hashText(`${kind}|${memoryText}`);
        if (asArray(agent.memories).some(item => item.fingerprint === fingerprint)) return false;
        agent.memories = asArray(agent.memories);
        agent.memories.push({ fingerprint, kind: clean(kind, 30), text: memoryText, turn: Math.max(0, number(turn)), valence: Math.max(-2, Math.min(2, number(valence))), ...metadata });
        agent.memories = agent.memories.slice(-MAX_MEMORIES);
        agent.trust = clamp(number(agent.trust, 50) + valence * 3.5);
        if (valence < 0) agent.grievance = clamp(number(agent.grievance) + Math.abs(valence) * 9);
        if (valence > 0) agent.opportunity = clamp(number(agent.opportunity) + valence * 7);
        if (kind === 'decision' || kind === 'chat-player') agent.lastInteractionTurn = Math.max(number(agent.lastInteractionTurn), number(turn));
        if (kind === 'event' || kind === 'chat-agent') agent.lastMoveTurn = Math.max(number(agent.lastMoveTurn), number(turn));
        evolveAgent(agent, turn);
        return true;
    }

    function agentsMatchingText(agents, text) {
        const corpus = keyOf(text);
        return agents.filter(agent => {
            const name = keyOf(agent.name);
            return name && (corpus.includes(name) || name.split('-').filter(token => token.length >= 4).some(token => corpus.includes(token)));
        });
    }

    function decisionDomain(text) {
        const value = keyOf(text);
        if (/gestione-regno|tass|impost|consiglio|censiment|reclut|popolo|fazione|territor|servizio-pubblico|sussid/.test(value)) return 'kingdom';
        if (/gestione-attivit|prezz|fornitor|client|marketing|magazzin|scort|assum|licenzi|prodotto|ordine|impresa|negozio|azienda/.test(value)) return 'business';
        return '';
    }

    function recordDecision(state = getState(), text, turn = state?.worldMemory?.turnCount || 0) {
        const agents = syncAgents(state);
        if (!agents.length || !clean(text, 20)) return [];
        let targets = agentsMatchingText(agents, text);
        const domain = decisionDomain(text);
        if (!targets.length && domain) targets = agents.filter(agent => agent.domain === domain && agent.status === 'active')
            .sort((a, b) => number(b.priority) - number(a.priority)).slice(0, 5);
        const valence = memoryValence(text);
        return targets.slice(0, 6).filter(agent => remember(agent, 'decision', `Decisione del protagonista: ${clean(text, 330)}`, turn, valence)).map(agent => agent.id);
    }

    function recordEvents(state = getState(), events = []) {
        const agents = syncAgents(state);
        if (!agents.length) return [];
        const registry = ensureRegistry(state);
        const touched = [];
        asArray(events).forEach(event => {
            const eventId = clean(event?.id || event?.fingerprint, 160) || hashText(`${event?.title}|${event?.summary}`);
            if (registry.processedEvents.includes(eventId)) return;
            const corpus = `${event?.title || ''} ${event?.summary || ''} ${event?.consequence || ''} ${asArray(event?.actors).join(' ')}`;
            const actorKeys = new Set(asArray(event?.actors).map(keyOf));
            let targets = agents.filter(agent => actorKeys.has(keyOf(agent.name)));
            if (!targets.length && /^management-autonomy-/.test(event?.source || '')) targets = agentsMatchingText(agents, corpus);
            const valence = memoryValence(corpus);
            targets.slice(0, 6).forEach(agent => {
                if (remember(agent, 'event', `${clean(event?.title, 110)}: ${clean(event?.summary || event?.consequence, 300)}`, event?.turn ?? state?.worldMemory?.turnCount, valence, { eventId })) touched.push(agent.id);
            });
            registry.processedEvents.push(eventId);
        });
        registry.processedEvents = registry.processedEvents.slice(-160);
        return touched;
    }

    function recordChatMessages(state = getState(), messages = [], context = {}) {
        const agents = syncAgents(state);
        if (!agents.length) return [];
        const protagonistName = clean(context.protagonistName || state?.character?.name || 'protagonista', 100);
        const touched = [];
        asArray(messages).forEach(message => {
            const turn = message?.turn ?? state?.worldMemory?.turnCount ?? 0;
            const speaker = agents.find(agent => keyOf(agent.name) === keyOf(message?.speaker));
            if (speaker) {
                if (remember(speaker, 'chat-agent', `Hai dichiarato: ${clean(message.text, 340)}`, turn, 0, { threadId: clean(message.threadId, 160) })) touched.push(speaker.id);
                return;
            }
            const fromPlayer = message?.source === 'player' || keyOf(message?.speaker) === keyOf(protagonistName) || message?.speakerType === 'protagonista';
            if (!fromPlayer) return;
            const targets = agentsMatchingText(agents, `${message?.target || ''} ${message?.text || ''}`);
            const valence = memoryValence(message?.text || '');
            targets.slice(0, 4).forEach(agent => {
                if (remember(agent, 'chat-player', `Il protagonista ti ha detto: ${clean(message.text, 340)}`, turn, valence, { threadId: clean(message.threadId, 160) })) touched.push(agent.id);
            });
        });
        return touched;
    }

    function agentPriority(agent, turn) {
        evolveAgent(agent, turn);
        return number(agent.priority) + number(agent.influence) * 0.15;
    }

    function findAgentByName(state = getState(), name) {
        return syncAgents(state).find(agent => keyOf(agent.name) === keyOf(name)) || null;
    }

    function selectAgentForSeed(seed, state = getState()) {
        if (!/^management-autonomy-/.test(seed?.source || '')) return null;
        const agents = syncAgents(state).filter(agent => agent.status === 'active');
        const turn = state?.worldMemory?.turnCount || 0;
        const domain = /kingdom/.test(seed.source) ? 'kingdom' : /business/.test(seed.source) ? 'business' : '';
        const actorKeys = new Set(asArray(seed.actors).map(keyOf));
        let candidates = agents.filter(agent => actorKeys.has(keyOf(agent.name)));
        if (!candidates.length && domain === 'business') candidates = agents.filter(agent => agent.domain === 'business' && (!seed.sourceId || keyOf(agent.subjectId) === keyOf(seed.sourceId)));
        if (!candidates.length && domain) candidates = agents.filter(agent => agent.domain === domain);
        return candidates.sort((a, b) => agentPriority(b, turn) - agentPriority(a, turn))[0] || null;
    }

    function latestMemories(agent, limit = 3) {
        return asArray(agent?.memories).slice(-Math.max(1, limit)).map(memory => clean(memory.text, 180));
    }

    function enrichSeedInput(seed, state = getState()) {
        const agent = selectAgentForSeed(seed, state);
        if (!agent) return seed;
        const memories = latestMemories(agent, 2).join(' / ') || 'nessuna interazione recente registrata';
        const agentContext = `${agent.name} (${agent.role}) è un agente persistente: obiettivo ${clean(agent.publicGoal, 150)}; strategia ${clean(agent.strategy, 170)}; leva ${clean(agent.leverage, 140)}; rapporto ${agent.disposition}, fiducia ${Math.round(number(agent.trust))}/100. Ricorda: ${clean(memories, 220)}.`;
        return {
            ...seed,
            actors: [agent.name, ...asArray(seed.actors).filter(name => keyOf(name) !== keyOf(agent.name))].slice(0, 8),
            cause: clean(`${clean(seed.cause, 430)} ${agentContext} Fagli compiere una mossa coerente con memoria e interesse; non resettare atteggiamento o obiettivi.`, 900),
            interactionMode: seed.interactionMode || 'either'
        };
    }

    function buildAgentContext(state = getState(), options = {}) {
        const turn = state?.worldMemory?.turnCount || 0;
        let agents = syncAgents(state).filter(agent => agent.status === 'active');
        if (options.domain) agents = agents.filter(agent => agent.domain === options.domain);
        if (options.subjectId) agents = agents.filter(agent => keyOf(agent.subjectId) === keyOf(options.subjectId));
        if (asArray(options.names).length) {
            const names = new Set(options.names.map(keyOf));
            agents = agents.filter(agent => names.has(keyOf(agent.name)));
        }
        agents = agents.sort((a, b) => agentPriority(b, turn) - agentPriority(a, turn)).slice(0, Math.max(1, Math.min(12, number(options.limit, 8))));
        if (!agents.length) return '';
        return agents.map(agent => {
            const memories = latestMemories(agent, 3);
            return `- ${agent.name} [${agent.role}, ${agent.disposition}, fiducia ${Math.round(number(agent.trust))}/100, influenza ${Math.round(number(agent.influence))}/100]: obiettivo pubblico ${clean(agent.publicGoal, 220)}; obiettivo privato ${clean(agent.privateGoal, 180)}; strategia attuale ${clean(agent.strategy, 240)}; leva ${clean(agent.leverage, 180)}; memoria ${memories.length ? memories.join(' / ') : 'nessun fatto recente'}.`;
        }).join('\n');
    }

    function agentProfile(agent) {
        if (!agent) return null;
        const memories = latestMemories(agent, 3);
        return {
            name: agent.name, role: agent.role, publicGoal: agent.publicGoal, privateGoal: agent.privateGoal,
            strategy: agent.strategy, resources: agent.leverage, personality: agent.personality,
            constraints: clean(`${agent.constraints || ''}${agent.constraints ? '; ' : ''}Ricorda le interazioni precedenti e non cambiare posizione senza una causa. Memorie recenti: ${memories.join(' / ') || 'nessuna'}`, 900),
            influence: Math.round(number(agent.influence)), status: agent.status
        };
    }

    function patchTimelineSimulator() {
        const timeline = root.CronacheTimelineSimulator;
        const original = timeline?.normalizeEventSeed;
        if (typeof original !== 'function' || original.__managementAgentsWrapped) return Boolean(original?.__managementAgentsWrapped);
        const wrapped = function managementAgentSeed(source, index, context) {
            const state = getState();
            return original.call(this, /^management-autonomy-/.test(source?.source || '') ? enrichSeedInput(source, state) : source, index, context);
        };
        wrapped.__managementAgentsWrapped = true;
        wrapped.__managementAgentsOriginal = original;
        timeline.normalizeEventSeed = wrapped;
        return true;
    }

    function patchEventManager() {
        const Manager = root.CronacheEvents?.EventManager;
        const original = Manager?.prototype?.record;
        if (typeof original !== 'function' || original.__managementAgentsWrapped) return Boolean(original?.__managementAgentsWrapped);
        const wrapped = function managementAgentEventRecord(events, incoming, context) {
            const result = original.call(this, events, incoming, context);
            try { if (result?.added?.length) recordEvents(getState(), result.added); } catch (error) { console.warn('[ManagementAgents] evento non memorizzato:', error); }
            return result;
        };
        wrapped.__managementAgentsWrapped = true;
        wrapped.__managementAgentsOriginal = original;
        Manager.prototype.record = wrapped;
        return true;
    }

    function patchNarrativeContexts() {
        let patched = false;
        const Business = root.CronacheBusiness?.BusinessManager;
        const businessOriginal = Business?.prototype?.buildNarrativeContext;
        if (typeof businessOriginal === 'function' && !businessOriginal.__managementAgentsWrapped) {
            const wrappedBusiness = function managementAgentBusinessContext(state, employees, turn, currency) {
                const base = businessOriginal.call(this, state, employees, turn, currency);
                const extra = buildAgentContext(getState(), { domain: 'business', limit: 10 });
                return extra ? `${base || ''}\n🤝 AGENTI ECONOMICI PERSISTENTI — non resettare obiettivi, fiducia o memoria:\n${extra}\n` : base;
            };
            wrappedBusiness.__managementAgentsWrapped = true;
            wrappedBusiness.__managementAgentsOriginal = businessOriginal;
            Business.prototype.buildNarrativeContext = wrappedBusiness;
            patched = true;
        }
        const Kingdom = root.CronacheKingdom?.KingdomManager;
        const kingdomOriginal = Kingdom?.prototype?.buildNarrativeContext;
        if (typeof kingdomOriginal === 'function' && !kingdomOriginal.__managementAgentsWrapped) {
            const wrappedKingdom = function managementAgentKingdomContext(input, turn, currency) {
                const base = kingdomOriginal.call(this, input, turn, currency);
                const extra = buildAgentContext(getState(), { domain: 'kingdom', limit: 10 });
                return extra ? `${base || ''}\n🤝 ATTORI POLITICI PERSISTENTI — fai evolvere posizione e strategia dalla memoria:\n${extra}\n` : base;
            };
            wrappedKingdom.__managementAgentsWrapped = true;
            wrappedKingdom.__managementAgentsOriginal = kingdomOriginal;
            Kingdom.prototype.buildNarrativeContext = wrappedKingdom;
            patched = true;
        }
        return patched;
    }

    function patchTimelineChat() {
        const chat = root.CronacheTimelineChat;
        if (!chat) return false;
        const promptOriginal = chat.buildChatPrompt;
        if (typeof promptOriginal === 'function' && !promptOriginal.__managementAgentsWrapped) {
            const wrappedPrompt = function managementAgentChatPrompt(thread, playerMessage, context = {}) {
                const state = getState();
                syncAgents(state);
                let speaker = clean(context.nextSpeaker, 100);
                if (!speaker && typeof chat.chooseNextSpeaker === 'function') speaker = chat.chooseNextSpeaker(thread, playerMessage, context);
                const agent = findAgentByName(state, speaker);
                if (!agent) return promptOriginal.call(this, thread, playerMessage, context);
                const extraContext = buildAgentContext(state, { names: [agent.name], limit: 1 });
                return promptOriginal.call(this, thread, playerMessage, {
                    ...context,
                    actorContext: clean(`${context.actorContext || ''}\n${extraContext}`, 6000),
                    speakerProfile: { ...agentProfile(agent), ...(context.speakerProfile || {}) }
                });
            };
            wrappedPrompt.__managementAgentsWrapped = true;
            wrappedPrompt.__managementAgentsOriginal = promptOriginal;
            chat.buildChatPrompt = wrappedPrompt;
        }
        const recordOriginal = chat.recordMessages;
        if (typeof recordOriginal === 'function' && !recordOriginal.__managementAgentsWrapped) {
            const wrappedRecord = function managementAgentChatRecord(chats, incomingMessages, context = {}) {
                const result = recordOriginal.call(this, chats, incomingMessages, context);
                try { if (result?.added?.length) recordChatMessages(getState(), result.added, context); } catch (error) { console.warn('[ManagementAgents] chat non memorizzata:', error); }
                return result;
            };
            wrappedRecord.__managementAgentsWrapped = true;
            wrappedRecord.__managementAgentsOriginal = recordOriginal;
            chat.recordMessages = wrappedRecord;
        }
        return true;
    }

    function patchParallelDecision() {
        const original = root.addParallelDecision;
        if (typeof original !== 'function' || original.__managementAgentsWrapped) return Boolean(original?.__managementAgentsWrapped);
        const wrapped = function managementAgentDecision(text) {
            const state = getState();
            const before = asArray(state?.worldMemory?.pendingParallelDecisions).length;
            const result = original.apply(this, arguments);
            const after = asArray(state?.worldMemory?.pendingParallelDecisions).length;
            if (after > before) {
                try { recordDecision(state, text, state?.worldMemory?.turnCount || 0); } catch (error) { console.warn('[ManagementAgents] decisione non memorizzata:', error); }
            }
            return result;
        };
        wrapped.__managementAgentsWrapped = true;
        wrapped.__managementAgentsOriginal = original;
        root.addParallelDecision = wrapped;
        return true;
    }

    function installStyles(documentRef) {
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
        const style = documentRef.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #management-agents-panel { margin-top: 12px; padding: 12px; border: 1px solid rgba(87,62,31,.18); border-radius: 13px; background: rgba(255,253,245,.72); }
            #management-agents-panel .management-agents-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:9px; }
            #management-agents-panel h4 { margin:0; color:#372319; font-family:'Cinzel',serif; font-size:.88rem; }
            #management-agents-panel .management-agents-count { padding:3px 8px; border-radius:999px; color:#5a3a20; background:rgba(139,105,20,.11); font:700 .66rem Arial,sans-serif; }
            #management-agents-panel .management-agent-list { display:grid; gap:7px; }
            #management-agents-panel .management-agent-card { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:6px 10px; padding:9px 10px; border-radius:10px; border:1px solid rgba(92,64,48,.13); background:rgba(255,255,255,.62); }
            #management-agents-panel .management-agent-card strong { color:#2c1810; font-size:.87rem; }
            #management-agents-panel .management-agent-card small { display:block; margin-top:2px; color:#6a5540; font-size:.73rem; line-height:1.3; }
            #management-agents-panel .management-agent-chip { align-self:start; padding:3px 7px; border-radius:999px; font:700 .61rem Arial,sans-serif; text-transform:uppercase; }
            #management-agents-panel .management-agent-chip.hostile { color:#7a171c; background:rgba(156,34,40,.12); }
            #management-agents-panel .management-agent-chip.wary { color:#7a5311; background:rgba(193,137,29,.14); }
            #management-agents-panel .management-agent-chip.pragmatic { color:#244f72; background:rgba(46,107,150,.12); }
            #management-agents-panel .management-agent-chip.aligned { color:#23613e; background:rgba(46,139,87,.12); }
            @media (max-width:640px) { #management-agents-panel { padding:10px; } #management-agents-panel .management-agent-card { grid-template-columns:minmax(0,1fr); } #management-agents-panel .management-agent-chip { width:max-content; } }
        `;
        documentRef.head.appendChild(style);
    }

    function roleLabel(role) {
        return { customer: 'cliente', supplier: 'fornitore', employee: 'dipendente', competitor: 'concorrente', contractor: 'controparte', faction: 'fazione', council: 'consigliere', diplomatic: 'controparte estera' }[role] || role;
    }

    function renderAgentPanel(documentRef) {
        const body = documentRef?.getElementById('management-hub-body');
        if (!body || documentRef.getElementById(PANEL_ID)) return false;
        const state = getState();
        const turn = state?.worldMemory?.turnCount || 0;
        const active = syncAgents(state).filter(agent => agent.status === 'active')
            .sort((a, b) => agentPriority(b, turn) - agentPriority(a, turn));
        const section = documentRef.createElement('section');
        section.id = PANEL_ID;
        const cards = active.slice(0, 6).map(agent => {
            const memory = latestMemories(agent, 1)[0] || 'Nessuna interazione recente.';
            return `<article class="management-agent-card"><div><strong>${escapeHtml(agent.name)}</strong><small>${escapeHtml(roleLabel(agent.role))} · fiducia ${Math.round(number(agent.trust))}% · ${escapeHtml(clean(agent.publicGoal, 120))}</small><small>Strategia: ${escapeHtml(clean(agent.strategy, 150))}</small><small>Ricorda: ${escapeHtml(clean(memory, 150))}</small></div><span class="management-agent-chip ${escapeHtml(agent.disposition)}">${escapeHtml(agent.disposition)}</span></article>`;
        }).join('');
        section.innerHTML = `<div class="management-agents-head"><h4>🤝 Persone e poteri persistenti</h4><span class="management-agents-count">${active.length} attivi</span></div><div class="management-agent-list">${cards || '<p class="management-hub-intro">Clienti, fornitori, dipendenti, concorrenti e fazioni compariranno qui quando entrano davvero nella storia.</p>'}</div>`;
        body.appendChild(section);
        return true;
    }

    function observeHub(documentRef, windowRef) {
        if (hubObserver || typeof windowRef.MutationObserver !== 'function') return;
        const body = documentRef.getElementById('management-hub-body');
        if (!body) return;
        hubObserver = new windowRef.MutationObserver(() => {
            if (!documentRef.getElementById(PANEL_ID)) windowRef.setTimeout(() => renderAgentPanel(documentRef), 0);
        });
        hubObserver.observe(body, { childList: true });
    }

    function installUiEvents(documentRef, windowRef) {
        if (documentRef.__managementAgentsUiInstalled) return;
        documentRef.__managementAgentsUiInstalled = true;
        documentRef.addEventListener('click', event => {
            if (!event.target?.closest?.('#btn-management-hub, #btn-advance-world, #btn-simulate-timeline')) return;
            try { syncAgents(getState()); } catch (_error) { }
            windowRef.setTimeout(() => renderAgentPanel(documentRef), 0);
        }, true);
    }

    function install(documentRef, windowRef) {
        const state = getState();
        if (state?.worldMemory) syncAgents(state);
        const patched = [patchTimelineSimulator(), patchEventManager(), patchNarrativeContexts(), patchTimelineChat(), patchParallelDecision()].some(Boolean);
        if (documentRef && windowRef) {
            installStyles(documentRef);
            observeHub(documentRef, windowRef);
            installUiEvents(documentRef, windowRef);
            renderAgentPanel(documentRef);
            documentRef.body?.classList.add('management-agents-ready');
        }
        root.__cronacheManagementAgentsVersion = PATCH_VERSION;
        return patched || Boolean(state?.worldMemory);
    }

    function scheduleInstall() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        const attempt = () => install(document, window);
        [0, 80, 250, 700, 1500, 3000, 5000].forEach(delay => window.setTimeout(attempt, delay));
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attempt, { once: true });
        if (!patchTimer) patchTimer = window.setTimeout(attempt, 6500);
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        SCHEMA_VERSION, PATCH_VERSION, MAX_AGENTS, MAX_MEMORIES,
        ensureRegistry, collectSources, syncAgents, remember, recordDecision, recordEvents, recordChatMessages,
        memoryValence, findAgentByName, selectAgentForSeed, enrichSeedInput, buildAgentContext, agentProfile,
        agentPriority, latestMemories, evolveAgent, install
    };
});