/**
 * @file timeline-bridge.js
 * @description Bridge di integrazione che collega il TimelineEngine con i
 * moduli esistenti del progetto: event-manager, timeline-simulator,
 * strategic-advisor e game-director.
 *
 * Flusso connesso:
 *   Strategic Advisor → azioni → TimelineManager.addAction()
 *   Timeline Simulator → seed → TimelineManager.addEvent() (pending)
 *   LLM narra → Event Manager parsa [EVENTO] → TimelineManager.addEvent() (processed)
 *   Game Director → [MONDO]/[PRESSIONE] → TimelineManager (event/action)
 *   EventBus → propaga a tutti i moduli interessati
 *   worldState → letto da Strategic Advisor per analisi contestualizzata
 *
 * @module CronacheTimelineBridge
 */

(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheTimelineBridge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────
    // Mappature tra formati moduli esistenti e TimelineEngine
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Mappa il tipo di un evento dell'event-manager verso un tipo valido
     * per il TimelineEngine. Se il tipo non è riconosciuto, usa 'mondo'.
     * @param {string} type - Tipo dall'event-manager.
     * @returns {string} Tipo valido per TimelineEngine.
     */
    function mapEventType(type) {
        const VALID = [
            'conflitto', 'scoperta', 'relazione', 'decisione', 'missione',
            'economia', 'politica', 'pericolo', 'viaggio', 'personale', 'mondo',
            'ambientale'
        ];
        const key = String(type || '').toLowerCase().trim();
        return VALID.includes(key) ? key : 'mondo';
    }

    /**
     * Mappa una categoria/azione strategica verso un tipo valido per
     * TimelineAction. Usa keyword matching sul comando/categoria.
     * @param {string} text - Testo da analizzare (categoria, comando, ecc.).
     * @returns {string} Tipo di azione valido.
     */
    function mapActionType(text) {
        const key = String(text || '').toLowerCase();
        if (/diploma|negozi|convoc|allean|trattat|ambasc/.test(key)) return 'diplomazia';
        if (/milit|attac|difend|marcia|assed|legion|soldat|truppe|esercito|frontiera|guerra|combatt/.test(key)) return 'militare';
        if (/commer|mercat|finanz|invest|prestit|banca|tassa/.test(key)) return 'economia';
        if (/spion|infiltr|informaz|segret/.test(key)) return 'spionaggio';
        if (/viagg|spostam|rotta|navig/.test(key)) return 'viaggio';
        if (/festa|banchett|cerimon|matrimon/.test(key)) return 'sociale';
        if (/stud|ricerc|scopri|archivi/.test(key)) return 'research';
        if (/costruz|edific|fortif|strada|pont/.test(key)) return 'costruzione';
        if (/relig|templ|sacrad|ritual/.test(key)) return 'religione';
        return 'personale';
    }

    /**
     * Converte un evento dell'event-manager (formato cronaca) in un oggetto
     * compatibile con TimelineManager.addEvent().
     *
     * @param {Object} emEvent - Evento normalizzato da event-manager.
     * @param {Object} [context] - Contesto opzionale (turn, ecc.).
     * @returns {Object} Oggetto per TimelineManager.addEvent().
     */
    function fromEventManagerEvent(emEvent, context) {
        context = context || {};
        const turn = Number(emEvent.turn ?? context.turn ?? 0);
        const timestamp = turn * 1000 + (context.tickOffset || 0);
        const actorId = (Array.isArray(emEvent.actors) && emEvent.actors[0]) || emEvent.source || 'system';
        return {
            id: emEvent.id || undefined,
            timestamp,
            actorId,
            type: mapEventType(emEvent.type),
            title: emEvent.title || 'Evento senza titolo',
            description: emEvent.summary || '',
            importance: emEvent.importance || 'normal',
            status: 'processed', // Gli eventi narrati sono già accaduti
            payload: {
                location: emEvent.location || '',
                actors: emEvent.actors || [],
                consequence: emEvent.consequence || '',
                cause: emEvent.cause || '',
                historicalAnchor: emEvent.historicalAnchor || '',
                politicalShift: emEvent.politicalShift || '',
                stakes: emEvent.stakes || '',
                conversationGoal: emEvent.conversationGoal || '',
                conversationMode: emEvent.conversationMode || 'none',
                interactionMode: emEvent.interactionMode || 'none',
                occurredAt: emEvent.occurredAt || '',
                choice: emEvent.choice || '',
                turn,
                source: emEvent.source || 'llm',
                fingerprint: emEvent.fingerprint || '',
                narrativeStatus: emEvent.status || 'resolved'
            },
            metadata: { sourceModule: 'event-manager', originalEvent: emEvent }
        };
    }

    /**
     * Converte un evento del TimelineManager nel formato dell'event-manager,
     * così da poterlo reinserire nella cronaca e nei prompt.
     *
     * @param {TimelineEvent} tlEvent - Evento dal TimelineManager.
     * @returns {Object} Oggetto compatibile con event-manager.normalizeEvent().
     */
    function toEventManagerEvent(tlEvent) {
        const p = tlEvent.payload || {};
        return {
            id: tlEvent.id,
            type: tlEvent.type,
            title: tlEvent.title,
            summary: tlEvent.description,
            location: p.location || '',
            actors: p.actors || [],
            consequence: p.consequence || '',
            cause: p.cause || '',
            historicalAnchor: p.historicalAnchor || '',
            politicalShift: p.politicalShift || '',
            stakes: p.stakes || '',
            conversationGoal: p.conversationGoal || '',
            conversationMode: p.conversationMode || 'none',
            interactionMode: p.interactionMode || 'none',
            occurredAt: p.occurredAt || '',
            choice: p.choice || '',
            importance: tlEvent.importance,
            status: p.narrativeStatus || 'resolved',
            turn: p.turn || 0,
            source: p.source || 'timeline-engine',
            fingerprint: p.fingerprint || ''
        };
    }

    /**
     * Converte una scelta strategica (da strategic-advisor.toTimelineChoices)
     * in un oggetto compatibile con TimelineManager.addAction().
     *
     * @param {Object} choice - Scelta da strategic-advisor.
     * @param {Object} [context] - Contesto (turn, ecc.).
     * @returns {Object} Oggetto per TimelineManager.addAction().
     */
    function fromStrategicChoice(choice, context) {
        context = context || {};
        const turn = Number(choice.turn ?? context.turn ?? 0);
        return {
            id: choice.id || undefined,
            timestamp: turn * 1000,
            actorId: (Array.isArray(choice.actors) && choice.actors[0]) || 'player',
            type: mapActionType(`${choice.category || ''} ${choice.command || ''} ${choice.topic || ''}`),
            title: choice.actionTitle || choice.topic || 'Azione strategica',
            description: choice.command || choice.summary || '',
            payload: {
                issueId: choice.issueId || '',
                issueTitle: choice.issueTitle || '',
                category: choice.category || '',
                urgency: choice.urgency || 0,
                objective: choice.objective || '',
                expectedOutcome: choice.expectedOutcome || '',
                cost: choice.cost || '',
                duration: choice.duration || '',
                risk: choice.risk || '',
                tradeoff: choice.tradeoff || '',
                actors: choice.actors || [],
                source: choice.source || 'strategic-advisor',
                turn
            },
            targetActorIds: choice.actors || [],
            consequences: []
        };
    }

    /**
     * Converte un event seed del timeline-simulator in un oggetto
     * compatibile con TimelineManager.addEvent().
     *
     * @param {Object} seed - Event seed da timeline-simulator.
     * @param {Object} [context] - Contesto (turn, ecc.).
     * @returns {Object} Oggetto per TimelineManager.addEvent().
     */
    function fromTimelineSeed(seed, context) {
        context = context || {};
        const turn = Number(seed.createdAtTurn ?? context.turn ?? 0);
        const delayMinutes = Number(seed.notBeforeMinutes || 0);
        const timestamp = turn * 1000 + delayMinutes * 60000;
        const actorId = (Array.isArray(seed.actors) && seed.actors[0]) || seed.source || 'world';
        return {
            id: seed.id || undefined,
            timestamp,
            actorId,
            type: mapEventType(seed.kind?.replace(/_action|_reply|_initiative/g, '') || 'mondo'),
            title: seed.title || 'Evento in coda',
            description: seed.cause || '',
            importance: seed.priority >= 80 ? 'critical' : seed.priority >= 60 ? 'high' : 'normal',
            status: 'pending',
            payload: {
                kind: seed.kind,
                actors: seed.actors || [],
                topic: seed.topic || '',
                sourceId: seed.sourceId || '',
                source: seed.source || 'timeline-simulator',
                causalLane: seed.causalLane || 'world',
                causalRootId: seed.causalRootId || '',
                parentSeedId: seed.parentSeedId || '',
                parentEventId: seed.parentEventId || '',
                batchId: seed.batchId || '',
                interactionMode: seed.interactionMode || 'none',
                originTurn: seed.originTurn || turn,
                sequence: seed.sequence || 0,
                turn,
                choice: seed.choice || null
            },
            parentId: seed.parentEventId || null,
            metadata: { sourceModule: 'timeline-simulator', originalSeed: seed }
        };
    }

    /**
     * Converte un world move del game-director in un evento per TimelineManager.
     *
     * @param {Object} move - World move da game-director.
     * @param {Object} [context] - Contesto (turn, ecc.).
     * @returns {Object} Oggetto per TimelineManager.addEvent().
     */
    function fromWorldMove(move, context) {
        context = context || {};
        const turn = Number(move.turn ?? context.turn ?? 0);
        return {
            id: move.id || undefined,
            timestamp: turn * 1000,
            actorId: move.actor || 'world',
            type: mapEventType(move.type || 'mondo'),
            title: move.title || move.summary || 'Mossa del mondo',
            description: move.description || move.summary || '',
            importance: move.urgency >= 70 ? 'high' : 'normal',
            status: 'pending',
            payload: {
                actor: move.actor || '',
                objective: move.objective || '',
                urgency: move.urgency || 0,
                location: move.location || '',
                source: 'game-director',
                turn
            },
            metadata: { sourceModule: 'game-director', originalMove: move }
        };
    }

    /**
     * Converte una pressione del game-director in una conseguenza applicabile
     * allo worldState del TimelineManager.
     *
     * @param {Object} pressure - Pressione da game-director.
     * @returns {Object} Consequence object.
     */
    function fromPressure(pressure) {
        return {
            id: pressure.id || undefined,
            type: 'status_change',
            targetId: pressure.actor || 'world',
            changes: {
                stateChanges: {
                    [`pressure_${pressure.actor || 'world'}`]: pressure.level || 0,
                    [`pressure_${pressure.subject || 'generic'}`]: pressure.level || 0
                }
            },
            delayMs: 0,
            applied: false
        };
    }

    // ─────────────────────────────────────────────────────────────────────
    // TimelineCoordinator — orchestrazione completa
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Coordinatore che collega TimelineEngine con tutti i moduli del progetto.
     * Funge da Facade: ogni modulo parla con il coordinatore, il coordinatore
     * parla con il TimelineManager, e l'EventBus propaga i cambiamenti.
     *
     * @class TimelineCoordinator
     *
     * @param {Object} modules - Moduli esistenti del progetto.
     * @param {Object} modules.eventManager - API di event-manager.js.
     * @param {Object} modules.timelineSimulator - API di timeline-simulator.js.
     * @param {Object} modules.strategicAdvisor - API di strategic-advisor.js.
     * @param {Object} modules.gameDirector - API di game-director.js.
     * @param {Object} [options] - Opzioni.
     * @param {Object} [options.worldState] - Stato iniziale del mondo.
     * @param {number} [options.maxEvents=200] - Limite eventi timeline.
     */
    class TimelineCoordinator {
        constructor(modules, options = {}) {
            if (!modules || typeof modules !== 'object') {
                throw new Error('TimelineCoordinator richiede un oggetto modules');
            }
            this.eventManager = modules.eventManager || null;
            this.timelineSimulator = modules.timelineSimulator || null;
            this.strategicAdvisor = modules.strategicAdvisor || null;
            this.gameDirector = modules.gameDirector || null;

            // Crea il TimelineManager con EventBus e Logger integrati
            const TimelineManager = requireSafe('./timeline-engine.js').TimelineManager;
            this.manager = new TimelineManager({
                maxEvents: options.maxEvents || 200
            });

            if (options.worldState) {
                this.manager.setWorldState(options.worldState);
            }

            /** @type {number} Turno corrente. */
            this.turn = 0;
            /** @type {Object|null} Ultima analisi strategica. */
            this.lastAnalysis = null;
            /** @type {Object[]} Ultima batch di seed. */
            this.lastSeeds = [];

            // Sottoscrive l'EventBus per propagare automaticamente
            this._wireEventBus();
        }

        // ── Inizializzazione ─────────────────────────────────────────

        /**
         * Inizializza lo stato del mondo da un mondo bootstrap.
         * @param {Object} world - Mondo da world-bootstrap.migrateWorld().
         * @param {Object} [memory] - Memoria da event-manager.
         */
        initFromWorld(world, memory) {
            this.manager.setWorldState({
                centralConflict: world.centralConflict || '',
                stakes: world.stakes || '',
                historicalContext: world.historicalContext || {},
                locations: world.locations || [],
                actors: world.actors || [],
                factions: world.factions || [],
                relations: world.relations || [],
                forces: world.forces || []
            });

            // Importa eventi esistenti dalla memoria nell'event-manager
            if (memory && Array.isArray(memory.events)) {
                for (const emEvent of memory.events) {
                    const tlData = fromEventManagerEvent(emEvent, { turn: 0 });
                    try {
                        this.manager.addEvent(tlData);
                    } catch (e) {
                        // Eventi già processati possono fallire l'anti-paradosso;
                        // li inseriamo direttamente come processed
                        const ev = this.manager.constructor.name;
                        // Bypass: inserisci con advanceTo
                        this.manager.advanceTo(tlData.timestamp);
                        this.manager.addEvent(tlData);
                    }
                }
            }

            this.manager.bus.emit('coordinator:initialized', {
                world: this.manager.getWorldState(),
                eventCount: this.manager.getEvents().length
            });
        }

        // ── Ciclo strategico ──────────────────────────────────────────

        /**
         * Fase 1: Genera analisi strategica e azioni eseguibili.
         * Usa strategic-advisor per analizzare il mondo e produrre issues+actions,
         * poi le registra come Actions nel TimelineManager.
         *
         * @param {Object} memory - Memoria corrente del gioco.
         * @param {Object} context - Contesto (protagonist, world, ecc.).
         * @returns {Object} { analysis, actions, choices }
         */
        runStrategicAnalysis(memory, context) {
            if (!this.strategicAdvisor) {
                return { analysis: null, actions: [], choices: [] };
            }

            // Genera o recupera l'analisi
            const prompt = this.strategicAdvisor.buildPrompt({
                memory,
                world: context.world || this.manager.getWorldState(),
                protagonist: context.protagonist || memory?.protagonist || {}
            });
            const analysis = this.strategicAdvisor.buildFallback({
                memory,
                world: context.world || this.manager.getWorldState()
            });
            this.lastAnalysis = analysis;

            // Converte le azioni in choices per la timeline
            const queue = this.strategicAdvisor.normalizeQueue(memory?.pendingStrategicActions || []);
            const choices = this.strategicAdvisor.toTimelineChoices(queue);

            // Registra ogni scelta come Action nel TimelineManager
            const actions = [];
            for (const choice of choices) {
                try {
                    const actionData = fromStrategicChoice(choice, { turn: this.turn });
                    const action = this.manager.addAction(actionData);
                    actions.push(action);
                } catch (e) {
                    // Salta azioni duplicate o non valide
                }
            }

            this.manager.bus.emit('coordinator:strategic-analysis', {
                analysis,
                actionCount: actions.length
            });

            return { analysis, actions, choices };
        }

        /**
         * Fase 2: Il giocatore seleziona azioni strategiche.
         * Processa le azioni selezionate nel TimelineManager.
         *
         * @param {string[]} selectedActionIds - ID delle azioni selezionate.
         * @returns {Object[]} Azioni processate.
         */
        processSelectedActions(selectedActionIds) {
            const processed = [];
            const allActions = this.manager.getActions();

            // Marca come cancelled le azioni non selezionate
            for (const action of allActions) {
                if (action.status === 'pending' && !selectedActionIds.includes(action.id)) {
                    action.status = 'cancelled';
                }
            }

            // Processa le azioni selezionate in ordine
            for (const id of selectedActionIds) {
                const action = this.manager.getAction(id);
                if (!action || action.status !== 'pending') continue;

                // Genera conseguenze dall'azione (l'evento figlio verrà creato
                // quando il LLM narrerà il risultato)
                if (action.consequences.length === 0 && action.payload.expectedOutcome) {
                    action.consequences.push({
                        type: 'status_change',
                        targetId: action.payload.issueId || 'world',
                        changes: {
                            stateChanges: {
                                [`action_${action.id}_result`]: action.payload.expectedOutcome
                            }
                        },
                        delayMs: 0,
                        applied: false
                    });
                }
            }

            // Processa tutte le azioni pendenti (che ora sono solo quelle selezionate)
            let result;
            while ((result = this.manager.processNextAction()) !== null) {
                processed.push(result);
            }

            this.manager.bus.emit('coordinator:actions-processed', {
                count: processed.length,
                ids: processed.map(a => a.id)
            });

            return processed;
        }

        // ── Ciclo timeline ───────────────────────────────────────────

        /**
         * Fase 3: Crea event seeds dalle scelte e dal mondo.
         * Usa timeline-simulator per generare i seed, poi li registra
         * come Events (pending) nel TimelineManager.
         *
         * @param {Object[]} choices - Scelte selezionate (da strategic-advisor).
         * @param {Object} world - Mondo corrente.
         * @param {Object} [context] - Contesto aggiuntivo.
         * @returns {Object[]} Seed creati e registrati.
         */
        createEventSeeds(choices, world, context = {}) {
            if (!this.timelineSimulator) {
                return [];
            }

            const seeds = this.timelineSimulator.createEventSeeds(
                choices,
                world,
                { turn: this.turn, ...context }
            );
            this.lastSeeds = seeds;

            // Registra ogni seed come Event pending nel TimelineManager
            const registered = [];
            for (const seed of seeds) {
                try {
                    const eventData = fromTimelineSeed(seed, { turn: this.turn });
                    const event = this.manager.addEvent(eventData);
                    registered.push(event);
                } catch (e) {
                    // Salta seed non validi o duplicati
                }
            }

            this.manager.bus.emit('coordinator:seeds-created', {
                count: registered.length
            });

            return registered;
        }

        /**
         * Fase 4: Seleziona il prossimo evento da processare.
         * Usa la logica del timeline-simulator per scegliere il seed più
         * urgente, ma opera sul TimelineManager.
         *
         * @returns {Object|null} Il seed selezionato o null.
         */
        selectNextEvent() {
            const pending = this.manager.getPendingEvents();
            if (pending.length === 0) return null;

            // Se abbiamo il timeline-simulator, usiamo la sua logica
            if (this.timelineSimulator) {
                // Converti gli eventi pending del TimelineManager in seed per il simulator
                const seeds = pending.map(e => e.metadata?.originalSeed).filter(Boolean);
                if (seeds.length > 0) {
                    const selected = this.timelineSimulator.selectNextEventSeed(seeds);
                    if (selected) {
                        // Trova l'evento corrispondente nel TimelineManager
                        const event = this.manager.getEvent(selected.id);
                        if (event) return event;
                    }
                }
            }

            // Fallback: processa il primo pending in ordine cronologico
            return pending[0] || null;
        }

        /**
         * Fase 5: Processa il prossimo evento e restituisce il contesto
         * per la generazione narrativa del LLM.
         *
         * @param {Object} [context] - Contesto aggiuntivo (world, memory, ecc.).
         * @returns {Object|null} { event, prompt } o null se non ci sono eventi.
         */
        processNextEventForNarrative(context = {}) {
            const event = this.selectNextEvent();
            if (!event) return null;

            // Processa l'evento nel TimelineManager
            this.manager.processNext();

            // Costruisce il prompt per il LLM usando event-manager
            let prompt = '';
            if (this.eventManager) {
                prompt = this.eventManager.buildPrompt({
                    recentEvents: this._recentEventsForPrompt(),
                    recentChoices: context.recentChoices || [],
                    activeQuests: context.activeQuests || [],
                    location: context.location || '',
                    timePassage: context.timePassage || null,
                    turn: this.turn
                });
            }

            // Aggiunge il contesto del seed al prompt
            const seedInfo = event.metadata?.originalSeed;
            if (seedInfo) {
                prompt += `\n\n🎯 EVENTO DA NARRARE: ${seedInfo.title}\n` +
                    `Causa: ${seedInfo.cause}\n` +
                    `Attori: ${(seedInfo.actors || []).join(', ')}\n` +
                    `Lane: ${seedInfo.causalLane}`;
            }

            this.manager.bus.emit('coordinator:event-for-narrative', {
                eventId: event.id,
                title: event.title
            });

            return { event, prompt };
        }

        /**
         * Fase 6: Registra la risposta narrativa del LLM.
         * Parsa i tag [EVENTO] con event-manager e li aggiunge al TimelineManager
         * come eventi processati.
         *
         * @param {string} llmResponse - Risposta testuale del LLM.
         * @param {Object} [context] - Contesto (turn, location, ecc.).
         * @returns {Object} { events, worldMoves, pressures }
         */
        recordNarrativeResponse(llmResponse, context = {}) {
            const ctx = { turn: this.turn, ...context };
            const result = { events: [], worldMoves: [], pressures: [] };

            // Event Manager: parsa [EVENTO] tags
            if (this.eventManager) {
                const parsed = this.eventManager.parseNarrativeTags(llmResponse, ctx);
                for (const emEvent of parsed) {
                    try {
                        const tlData = fromEventManagerEvent(emEvent, ctx);
                        // Gli eventi narrati sono già accaduti → processed
                        tlData.status = 'processed';
                        this.manager.addEvent(tlData);
                        result.events.push(emEvent);
                    } catch (e) {
                        // Se fallisce per anti-paradosso, prova con timestamp avanzato
                        try {
                            const tlData = fromEventManagerEvent(emEvent, ctx);
                            tlData.timestamp = this.manager.getCurrentTick() + 1;
                            tlData.status = 'processed';
                            this.manager.advanceTo(tlData.timestamp);
                            this.manager.addEvent(tlData);
                            result.events.push(emEvent);
                        } catch (e2) {
                            // Salta eventi non registrabili
                        }
                    }
                }
            }

            // Game Director: estrae [MONDO] e [PRESSIONE]
            if (this.gameDirector) {
                const tags = this.gameDirector.extractTags(llmResponse, ctx);
                for (const move of tags.worldMoves || []) {
                    try {
                        const eventData = fromWorldMove(move, ctx);
                        this.manager.addEvent(eventData);
                        result.worldMoves.push(move);
                    } catch (e) {
                        // Salta
                    }
                }
                for (const pressure of tags.pressures || []) {
                    const conseq = fromPressure(pressure);
                    this.manager.bus.emit('consequence:applied', conseq, {
                        source: 'game-director',
                        pressure
                    });
                    result.pressures.push(pressure);
                }
            }

            this.manager.bus.emit('coordinator:narrative-recorded', {
                events: result.events.length,
                worldMoves: result.worldMoves.length,
                pressures: result.pressures.length
            });

            return result;
        }

        /**
         * Fase 7: Avanza il turno.
         * Avanza il tick logico, pulisce le azioni processate e prepara
         * il ciclo successivo.
         *
         * @param {number} [elapsedMinutes=0] - Minuti trascorsi nel turno.
         * @returns {Object} Stato del coordinator dopo l'avanzamento.
         */
        advanceTurn(elapsedMinutes = 0) {
            this.turn += 1;
            const newTick = this.turn * 1000;

            try {
                this.manager.advanceTo(newTick);
            } catch (e) {
                // Se il tick è già avanzato oltre, va bene
            }

            // Se abbiamo il timeline-simulator, avanza la coda
            if (this.timelineSimulator && this.lastSeeds.length > 0) {
                const consumed = this.manager.getProcessedEvents()
                    .filter(e => e.metadata?.sourceModule === 'timeline-simulator')
                    .map(e => e.id);
                const lastConsumed = consumed[consumed.length - 1];
                if (lastConsumed) {
                    this.lastSeeds = this.timelineSimulator.advanceEventQueue(
                        this.lastSeeds,
                        lastConsumed,
                        elapsedMinutes
                    );
                }
            }

            const state = {
                turn: this.turn,
                tick: this.manager.getCurrentTick(),
                pendingEvents: this.manager.getPendingEvents().length,
                processedEvents: this.manager.getProcessedEvents().length,
                totalActions: this.manager.getActions().length,
                worldState: this.manager.getWorldState()
            };

            this.manager.bus.emit('coordinator:turn-advanced', state);
            return state;
        }

        // ── Sincronizzazione con memoria ─────────────────────────────

        /**
         * Esporta gli eventi del TimelineManager nel formato event-manager,
         * pronto per essere salvato in memory.events.
         *
         * @returns {Object[]} Array di eventi in formato event-manager.
         */
        exportEventsForMemory() {
            return this.manager.getEvents().map(e => toEventManagerEvent(e));
        }

        /**
         * Sincronizza il worldState del TimelineManager con la memoria.
         * @param {Object} memory - Memoria del gioco da aggiornare.
         * @returns {Object} Memoria aggiornata.
         */
        syncToMemory(memory) {
            if (!memory || typeof memory !== 'object') return memory;
            memory.events = this.exportEventsForMemory();
            memory.timelineEngineState = this.manager.serialize();
            memory.lastTimelineEngineTurn = this.turn;
            return memory;
        }

        /**
         * Ripristina lo stato del coordinator da memoria serializzata.
         * @param {Object} memory - Memoria contenente timelineEngineState.
         */
        restoreFromMemory(memory) {
            if (!memory || typeof memory !== 'object') return;
            if (memory.timelineEngineState) {
                try {
                    this.manager.deserialize(memory.timelineEngineState);
                    this.turn = memory.lastTimelineEngineTurn || 0;
                } catch (e) {
                    // Stato non recuperabile, continua con timeline vuota
                }
            } else if (Array.isArray(memory.events)) {
                // Retrocompatibilità: importa eventi esistenti
                for (const emEvent of memory.events) {
                    try {
                        const tlData = fromEventManagerEvent(emEvent, { turn: 0 });
                        tlData.status = 'processed';
                        this.manager.advanceTo(tlData.timestamp);
                        this.manager.addEvent(tlData);
                    } catch (e) {
                        // Salta
                    }
                }
            }
        }

        // ── Accesso diretto ──────────────────────────────────────────

        /**
         * @returns {EventBus} Il bus degli eventi del TimelineManager.
         */
        get bus() { return this.manager.bus; }

        /**
         * @returns {Object} Stato del mondo corrente.
         */
        getWorldState() { return this.manager.getWorldState(); }

        /**
         * @returns {Object} Manager sottostante (per uso avanzato).
         */
        getManager() { return this.manager; }

        /**
         * Resetta il coordinator.
         */
        reset() {
            this.manager.reset();
            this.turn = 0;
            this.lastAnalysis = null;
            this.lastSeeds = [];
        }

        // ── Interni ──────────────────────────────────────────────────

        /**
         * Sottoscrive l'EventBus per propagare automaticamente i cambiamenti.
         * @private
         */
        _wireEventBus() {
            // Quando un evento viene processato, aggiorna lo worldState
            this.manager.bus.on('event:processed', (event) => {
                // Le stateChanges nel payload sono già applicate dal TimelineManager
                // Qui possiamo aggiungere logica cross-modulo
            });

            // Quando un'azione viene processata, genera seeds se possibile
            this.manager.bus.on('action:processed', (action) => {
                if (this.timelineSimulator && action.payload) {
                    // L'azione processata può generare un event seed
                    // attraverso il timeline-simulator
                }
            });
        }

        /**
         * Restituisce gli eventi recenti per il prompt dell'event-manager.
         * @returns {Object[]} Eventi in formato event-manager.
         * @private
         */
        _recentEventsForPrompt() {
            return this.manager.getProcessedEvents()
                .slice(-5)
                .map(e => toEventManagerEvent(e));
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Helper per require sicuro
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Require sicuro: prova a caricare un modulo, ritorna null se fallisce.
     * @param {string} modulePath
     * @returns {Object|null}
     * @private
     */
    function requireSafe(modulePath) {
        try {
            // Risolve relativo alla directory di questo file
            const resolved = require('path').resolve(__dirname, modulePath);
            return require(resolved);
        } catch (e) {
            try {
                return require(modulePath);
            } catch (e2) {
                return null;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // API pubblica
    // ─────────────────────────────────────────────────────────────────────

    return {
        // Classi
        TimelineCoordinator,
        // Adapter
        fromEventManagerEvent,
        toEventManagerEvent,
        fromStrategicChoice,
        fromTimelineSeed,
        fromWorldMove,
        fromPressure,
        // Mapper
        mapEventType,
        mapActionType
    };
});