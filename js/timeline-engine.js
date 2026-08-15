/**
 * @file timeline-engine.js
 * @description Motore Timeline ispirato a Pax Historia.
 * Modello dati rigoroso per Eventi e Azioni, TimelineManager con ordinamento
 * cronologico deterministico, pattern Observer (EventBus) per propagare gli
 * effetti delle azioni sullo stato del mondo, e controlli anti-paradosso temporale.
 *
 * @module CronacheTimelineEngine
 */

(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheTimelineEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────
    // Costanti
    // ─────────────────────────────────────────────────────────────────────

    const TIMELINE_ENGINE_VERSION = 1;

    /** Tipi di evento consentiti. */
    const EVENT_TYPES = [
        'conflitto', 'scoperta', 'relazione', 'decisione', 'missione',
        'economia', 'politica', 'pericolo', 'viaggio', 'personale', 'mondo',
        'ambientale'
    ];

    /** Tipi di azione consentiti. */
    const ACTION_TYPES = [
        'diplomazia', 'militare', 'economia', 'spionaggio', 'viaggio',
        'sociale', 'research', 'costruzione', 'religione', 'personale'
    ];

    /** Stati di processamento di un evento. */
    const EVENT_STATUS = {
        PENDING: 'pending',
        PROCESSING: 'processing',
        PROCESSED: 'processed',
        CANCELLED: 'cancelled'
    };

    /** Livelli di importanza. */
    const IMPORTANCE_RANK = { normal: 0, high: 1, critical: 2 };

    /** Limite massimo eventi in timeline (configurabile via costruttore). */
    const DEFAULT_MAX_EVENTS = 200;

    // ─────────────────────────────────────────────────────────────────────
    // Errori tipizzati
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Errore base del motore Timeline.
     * @class TimelineError
     * @extends {Error}
     */
    class TimelineError extends Error {
        constructor(message, details) {
            super(message);
            this.name = 'TimelineError';
            this.details = details || {};
        }
    }

    /**
     * Errore sollevato quando si tenta di modificare un evento già processato
     * (paradosso temporale).
     * @class TemporalParadoxError
     * @extends {TimelineError}
     */
    class TemporalParadoxError extends TimelineError {
        constructor(message, details) {
            super(message, details);
            this.name = 'TemporalParadoxError';
        }
    }

    /**
     * Errore di validazione del payload o dei campi di un evento/azione.
     * @class ValidationError
     * @extends {TimelineError}
     */
    class ValidationError extends TimelineError {
        constructor(message, details) {
            super(message, details);
            this.name = 'ValidationError';
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Logger
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Logger configurabile. Di default stampa su console, ma può essere
     * sostituito con un logger custom iniettato nel TimelineManager.
     * @class TimelineLogger
     */
    class TimelineLogger {
        constructor() {
            this.entries = [];
        }

        log(level, message, context) {
            const entry = {
                timestamp: Date.now(),
                level,
                message,
                context: context || null
            };
            this.entries.push(entry);
            // Mantieni al massimo 500 voci
            if (this.entries.length > 500) {
                this.entries.shift();
            }
            // Solo error e warn vanno su console
            if (level === 'error' || level === 'warn') {
                // eslint-disable-next-line no-console
                console[level](`[TimelineEngine] ${message}`, context || '');
            }
        }

        info(message, context) { this.log('info', message, context); }
        warn(message, context) { this.log('warn', message, context); }
        error(message, context) { this.log('error', message, context); }

        getEntries() { return this.entries.slice(); }
        clear() { this.entries = []; }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Modello dati — Event
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Rappresenta un evento nella timeline.
     * @typedef {Object} TimelineEvent
     * @property {string} id - Identificatore univoco.
     * @property {number} timestamp - Tempo logico (ms o tick di gioco).
     * @property {number} sequence - Numero di sequenza per tie-breaking deterministico.
     * @property {string} actorId - ID dell'attore che ha generato l'evento.
     * @property {('conflitto'|'scoperta'|'relazione'|'decisione'|'missione'|'economia'|'politica'|'pericolo'|'viaggio'|'personale'|'mondo'|'ambientale')} type - Tipo di evento.
     * @property {('pending'|'processing'|'processed'|'cancelled')} status - Stato di processamento.
     * @property {('normal'|'high'|'critical')} importance - Livello di importanza.
     * @property {string} title - Titolo breve.
     * @property {string} description - Descrizione narrativa.
     * @property {Object} payload - Dati strutturati dell'evento.
     * @property {string[]} [consequenceIds] - ID degli eventi generati come conseguenza.
     * @property {string|null} [parentId] - ID dell'evento/azione genitore (se figlio).
     * @property {Object} [metadata] - Dati extra opzionali.
     * @property {number} createdAt - Timestamp di creazione (Date.now()).
     * @property {number} [processedAt] - Timestamp di processamento.
     */

    /**
     * Rappresenta un'azione del giocatore o di un PNG.
     * @typedef {Object} TimelineAction
     * @property {string} id - Identificatore univoco.
     * @property {number} timestamp - Tempo logico.
     * @property {number} sequence - Numero di sequenza per tie-breaking.
     * @property {string} actorId - ID dell'attore che compie l'azione.
     * @property {('diplomazia'|'militare'|'economia'|'spionaggio'|'viaggio'|'sociale'|'research'|'costruzione'|'religione'|'personale')} type - Tipo di azione.
     * @property {('pending'|'processing'|'processed'|'cancelled')} status - Stato di processamento.
     * @property {string} title - Titolo breve.
     * @property {string} description - Descrizione dell'azione.
     * @property {Object} payload - Dati strutturati dell'azione.
     * @property {Consequence[]} consequences - Conseguenze generate dall'azione.
     * @property {string[]} [targetActorIds] - ID degli attori coinvolti.
     * @property {string} [targetLocationId] - ID del luogo target.
     * @property {number} createdAt - Timestamp di creazione.
     * @property {number} [processedAt] - Timestamp di processamento.
     */

    /**
     * Rappresenta una conseguenza di un'azione.
     * @typedef {Object} Consequence
     * @property {string} id - Identificatore univoco.
     * @property {string} type - Tipo di conseguenza (es. 'status_change', 'event_trigger', 'relationship_shift').
     * @property {string} targetId - ID del bersaglio (attore, fazione, luogo, ecc.).
     * @property {Object} changes - Cambiamenti da applicare allo stato.
     * @property {number} delayMs - Ritardo temporale logico prima che si manifesti (ms o tick).
     * @property {boolean} applied - Se la conseguenza è già stata applicata.
     */

    // ─────────────────────────────────────────────────────────────────────
    // Factory e normalizzazione
    // ─────────────────────────────────────────────────────────────────────

    let _sequenceCounter = 0;

    /**
     * Genera un ID univoco.
     * @returns {string}
     */
    function generateId() {
        _sequenceCounter += 1;
        return `tl_${Date.now().toString(36)}_${_sequenceCounter.toString(36)}`;
    }

    /**
     * Valida che un valore sia un intero positivo.
     * @param {*} value
     * @param {string} fieldName
     * @throws {ValidationError}
     */
    function validatePositiveInt(value, fieldName) {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
            throw new ValidationError(
                `${fieldName} deve essere un intero positivo, ricevuto: ${typeof value} ${String(value)}`,
                { field: fieldName, value }
            );
        }
    }

    /**
     * Valida che un valore sia una stringa non vuota.
     * @param {*} value
     * @param {string} fieldName
     * @throws {ValidationError}
     */
    function validateNonEmptyString(value, fieldName) {
        if (typeof value !== 'string' || value.trim().length === 0) {
            throw new ValidationError(
                `${fieldName} deve essere una stringa non vuota, ricevuto: ${typeof value}`,
                { field: fieldName, value }
            );
        }
    }

    /**
     * Valida il tipo di evento.
     * @param {string} type
     * @throws {ValidationError}
     */
    function validateEventType(type) {
        if (!EVENT_TYPES.includes(type)) {
            throw new ValidationError(
                `Tipo di evento non valido: "${type}". Tipi consentiti: ${EVENT_TYPES.join(', ')}`,
                { field: 'type', value: type, allowed: EVENT_TYPES }
            );
        }
    }

    /**
     * Valida il tipo di azione.
     * @param {string} type
     * @throws {ValidationError}
     */
    function validateActionType(type) {
        if (!ACTION_TYPES.includes(type)) {
            throw new ValidationError(
                `Tipo di azione non valido: "${type}". Tipi consentiti: ${ACTION_TYPES.join(', ')}`,
                { field: 'type', value: type, allowed: ACTION_TYPES }
            );
        }
    }

    /**
     * Valida il livello di importanza.
     * @param {string} importance
     * @throws {ValidationError}
     */
    function validateImportance(importance) {
        if (!Object.prototype.hasOwnProperty.call(IMPORTANCE_RANK, importance)) {
            throw new ValidationError(
                `Importanza non valida: "${importance}". Valori consentiti: ${Object.keys(IMPORTANCE_RANK).join(', ')}`,
                { field: 'importance', value: importance }
            );
        }
    }

    /**
     * Valida il payload di un evento o azione.
     * @param {*} payload
     * @throws {ValidationError}
     */
    function validatePayload(payload) {
        if (payload == null) return; // payload opzionale
        if (typeof payload !== 'object' || Array.isArray(payload)) {
            throw new ValidationError(
                `Payload deve essere un oggetto, ricevuto: ${typeof payload}`,
                { field: 'payload', value: payload }
            );
        }
    }

    /**
     * Crea un evento normalizzato e validato.
     * @param {Object} raw - Dati grezzi dell'evento.
     * @param {Object} [context] - Contesto opzionale (sequence counter, ecc.).
     * @returns {TimelineEvent}
     * @throws {ValidationError}
     */
    function createEvent(raw, context) {
        if (!raw || typeof raw !== 'object') {
            throw new ValidationError('createEvent richiede un oggetto non nullo', { value: raw });
        }

        validateNonEmptyString(raw.actorId, 'actorId');
        validatePositiveInt(raw.timestamp, 'timestamp');
        validateEventType(raw.type);
        validateNonEmptyString(raw.title, 'title');
        validatePayload(raw.payload);

        const importance = raw.importance || 'normal';
        validateImportance(importance);

        const id = raw.id || generateId();
        const seq = typeof raw.sequence === 'number' ? raw.sequence : ++_sequenceCounter;

        return {
            id,
            timestamp: raw.timestamp,
            sequence: seq,
            actorId: raw.actorId,
            type: raw.type,
            status: raw.status || EVENT_STATUS.PENDING,
            importance,
            title: String(raw.title).slice(0, 200),
            description: String(raw.description || '').slice(0, 1000),
            payload: raw.payload || {},
            consequenceIds: Array.isArray(raw.consequenceIds) ? raw.consequenceIds.slice() : [],
            parentId: raw.parentId || null,
            metadata: raw.metadata || {},
            createdAt: raw.createdAt || Date.now(),
            processedAt: raw.processedAt || null
        };
    }

    /**
     * Crea un'azione normalizzata e validata.
     * @param {Object} raw - Dati grezzi dell'azione.
     * @returns {TimelineAction}
     * @throws {ValidationError}
     */
    function createAction(raw) {
        if (!raw || typeof raw !== 'object') {
            throw new ValidationError('createAction richiede un oggetto non nullo', { value: raw });
        }

        validateNonEmptyString(raw.actorId, 'actorId');
        validatePositiveInt(raw.timestamp, 'timestamp');
        validateActionType(raw.type);
        validateNonEmptyString(raw.title, 'title');
        validatePayload(raw.payload);

        const id = raw.id || generateId();
        const seq = typeof raw.sequence === 'number' ? raw.sequence : ++_sequenceCounter;

        return {
            id,
            timestamp: raw.timestamp,
            sequence: seq,
            actorId: raw.actorId,
            type: raw.type,
            status: raw.status || EVENT_STATUS.PENDING,
            title: String(raw.title).slice(0, 200),
            description: String(raw.description || '').slice(0, 1000),
            payload: raw.payload || {},
            consequences: Array.isArray(raw.consequences) ? raw.consequences.map(c => ({
                id: c.id || generateId(),
                type: c.type || 'status_change',
                targetId: c.targetId || '',
                changes: c.changes || {},
                delayMs: c.delayMs || 0,
                applied: false
            })) : [],
            targetActorIds: Array.isArray(raw.targetActorIds) ? raw.targetActorIds.slice() : [],
            targetLocationId: raw.targetLocationId || null,
            createdAt: raw.createdAt || Date.now(),
            processedAt: raw.processedAt || null
        };
    }

    // ─────────────────────────────────────────────────────────────────────
    // EventBus — Pattern Observer
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Bus degli eventi per propagare gli effetti delle azioni.
     * Implementa il pattern Observer: i subscriber si registrano a topic,
     * e quando un evento viene pubblicato, tutti i subscriber del topic
     * vengono notificati con il payload.
     *
     * @class EventBus
     */
    class EventBus {
        constructor() {
            /** @type {Map<string, Set<Function>>} */
            this._subscribers = new Map();
            /** @type {Array<Object>} */
            this._history = [];
        }

        /**
         * Sottoscrive un listener a un topic.
         * @param {string} topic - Nome del topic (es. 'event:processed', 'action:applied').
         * @param {Function} callback - Callback chiamata con (payload, meta).
         * @returns {Function} Funzione di unsubscribe.
         */
        on(topic, callback) {
            if (typeof topic !== 'string' || topic.length === 0) {
                throw new ValidationError('Topic deve essere una stringa non vuota', { topic });
            }
            if (typeof callback !== 'function') {
                throw new ValidationError('Callback deve essere una funzione', { topic });
            }
            if (!this._subscribers.has(topic)) {
                this._subscribers.set(topic, new Set());
            }
            this._subscribers.get(topic).add(callback);

            // Ritorna funzione di unsubscribe
            return () => this.off(topic, callback);
        }

        /**
         * Rimuove un listener da un topic.
         * @param {string} topic
         * @param {Function} callback
         */
        off(topic, callback) {
            const set = this._subscribers.get(topic);
            if (set) set.delete(callback);
        }

        /**
         * Pubblica un evento su un topic. Tutti i subscriber vengono notificati
         * in modo sincrono e deterministico (ordine di registrazione).
         * @param {string} topic
         * @param {Object} payload - Dati dell'evento.
         * @param {Object} [meta] - Metadati aggiuntivi.
         * @returns {number} Numero di subscriber notificati.
         */
        emit(topic, payload, meta) {
            const set = this._subscribers.get(topic);
            if (!set || set.size === 0) return 0;

            const context = { topic, timestamp: Date.now(), ...(meta || {}) };
            let notified = 0;
            for (const cb of set) {
                try {
                    cb(payload, context);
                    notified++;
                } catch (err) {
                    // Un subscriber in errore non blocca gli altri
                    this._history.push({
                        topic, error: err.message, timestamp: Date.now()
                    });
                }
            }

            this._history.push({ topic, payload: payload, timestamp: Date.now() });
            if (this._history.length > 200) this._history.shift();

            return notified;
        }

        /**
         * Pulisce tutti i subscriber.
         */
        clear() {
            this._subscribers.clear();
            this._history = [];
        }

        /**
         * Restituisce lo storico delle pubblicazioni.
         * @returns {Array<Object>}
         */
        getHistory() { return this._history.slice(); }

        /**
         * Conta i subscriber per un topic.
         * @param {string} topic
         * @returns {number}
         */
        subscriberCount(topic) {
            const set = this._subscribers.get(topic);
            return set ? set.size : 0;
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // TimelineManager
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Gestore della timeline. Mantiene eventi in ordine cronologico
     * deterministico, previene paradossi temporali (modifica di eventi
     * già processati), e propaga gli effetti via EventBus.
     *
     * @class TimelineManager
     */
    class TimelineManager {
        /**
         * @param {Object} [options]
         * @param {number} [options.maxEvents=200] - Massimo numero di eventi in timeline.
         * @param {EventBus} [options.bus] - EventBus custom (se non fornito, ne crea uno).
         * @param {TimelineLogger} [options.logger] - Logger custom.
         */
        constructor(options = {}) {
            this.maxEvents = options.maxEvents || DEFAULT_MAX_EVENTS;
            this.bus = options.bus || new EventBus();
            this.logger = options.logger || new TimelineLogger();

            /** @type {TimelineEvent[]} */
            this._events = [];
            /** @type {Map<string, TimelineEvent>} */
            this._index = new Map();
            /** @type {TimelineAction[]} */
            this._actions = [];
            /** @type {Map<string, TimelineAction>} */
            this._actionIndex = new Map();
            /** @type {Object} - Stato del mondo. */
            this.worldState = {};
            /** @type {number} - Timestamp logico corrente (avanza con il processamento). */
            this._currentTick = 0;
        }

        // ── Eventi ────────────────────────────────────────────────────

        /**
         * Aggiunge un evento alla timeline. L'evento viene inserito in ordine
         * cronologico (per timestamp, poi sequence come tie-breaker deterministico).
         *
         * @param {Object} rawEvent - Dati grezzi dell'evento.
         * @returns {TimelineEvent} L'evento creato e inserito.
         * @throws {ValidationError} Se i dati non sono validi.
         * @throws {TemporalParadoxError} Se il timestamp è nel passato rispetto
         *   a un evento già processato.
         */
        addEvent(rawEvent) {
            const event = createEvent(rawEvent);

            // Anti-paradosso: non inserire eventi con timestamp precedente
            // all'ultimo evento processato
            const lastProcessed = this._events
                .filter(e => e.status === EVENT_STATUS.PROCESSED)
                .reduce((max, e) => e.timestamp > max ? e.timestamp : max, 0);

            if (event.timestamp < lastProcessed) {
                this.logger.error('Paradosso temporale: evento con timestamp passato', {
                    eventTimestamp: event.timestamp,
                    lastProcessed
                });
                throw new TemporalParadoxError(
                    `Non si può inserire un evento a timestamp ${event.timestamp} ` +
                    `quando l'ultimo evento processato è a ${lastProcessed}`,
                    { eventTimestamp: event.timestamp, lastProcessed }
                );
            }

            // Anti-duplicato: stesso id → rifiuta
            if (this._index.has(event.id)) {
                throw new ValidationError(
                    `Evento duplicato: id "${event.id}" già presente nella timeline`,
                    { id: event.id }
                );
            }

            this._insertSorted(event);
            this._index.set(event.id, event);
            this._enforceLimit();

            this.logger.info('Evento aggiunto', { id: event.id, type: event.type, timestamp: event.timestamp });
            this.bus.emit('event:added', event, { source: 'TimelineManager' });

            return event;
        }

        /**
         * Rimuove un evento dalla timeline. Solo gli eventi PENDING possono
         * essere rimossi. Tentare di rimuovere un evento PROCESSED solleva
         * un TemporalParadoxError.
         *
         * @param {string} eventId - ID dell'evento da rimuovere.
         * @returns {boolean} True se rimosso con successo.
         * @throws {TemporalParadoxError} Se l'evento è già processato.
         * @throws {TimelineError} Se l'evento non esiste.
         */
        removeEvent(eventId) {
            const event = this._index.get(eventId);
            if (!event) {
                throw new TimelineError(
                    `Evento non trovato: "${eventId}"`,
                    { id: eventId }
                );
            }

            if (event.status === EVENT_STATUS.PROCESSED) {
                throw new TemporalParadoxError(
                    `Non si può rimuovere l'evento "${eventId}" perché già processato`,
                    { id: eventId, status: event.status }
                );
            }

            this._events = this._events.filter(e => e.id !== eventId);
            this._index.delete(eventId);
            this.logger.info('Evento rimosso', { id: eventId });
            this.bus.emit('event:removed', { id: eventId }, { source: 'TimelineManager' });
            return true;
        }

        /**
         * Processa il prossimo evento pendente in ordine cronologico.
         * L'evento passa da PENDING → PROCESSING → PROCESSED.
         * Gli effetti dell'evento vengono applicati al worldState e propagati via EventBus.
         *
         * @returns {TimelineEvent|null} L'evento processato, o null se non ci sono eventi pendenti.
         */
        processNext() {
            const next = this._events.find(e => e.status === EVENT_STATUS.PENDING);
            if (!next) return null;

            next.status = EVENT_STATUS.PROCESSING;
            this.logger.info('Processando evento', { id: next.id, timestamp: next.timestamp });

            // Applica gli effetti al worldState
            this._applyEventEffects(next);

            next.status = EVENT_STATUS.PROCESSED;
            next.processedAt = Date.now();
            this._currentTick = Math.max(this._currentTick, next.timestamp);

            this.logger.info('Evento processato', { id: next.id });
            this.bus.emit('event:processed', next, {
                source: 'TimelineManager',
                worldState: { ...this.worldState }
            });

            return next;
        }

        /**
         * Processa tutti gli eventi pendenti in ordine cronologico.
         * @returns {TimelineEvent[]} Array di eventi processati.
         */
        processAll() {
            const processed = [];
            let event;
            while ((event = this.processNext()) !== null) {
                processed.push(event);
            }
            return processed;
        }

        /**
         * Restituisce tutti gli eventi in ordine cronologico.
         * @returns {TimelineEvent[]}
         */
        getEvents() {
            return this._events.slice();
        }

        /**
         * Restituisce un evento per ID.
         * @param {string} id
         * @returns {TimelineEvent|undefined}
         */
        getEvent(id) {
            return this._index.get(id);
        }

        /**
         * Restituisce gli eventi pendenti (non ancora processati).
         * @returns {TimelineEvent[]}
         */
        getPendingEvents() {
            return this._events.filter(e => e.status === EVENT_STATUS.PENDING);
        }

        /**
         * Restituisce gli eventi già processati.
         * @returns {TimelineEvent[]}
         */
        getProcessedEvents() {
            return this._events.filter(e => e.status === EVENT_STATUS.PROCESSED);
        }

        // ── Azioni ─────────────────────────────────────────────────────

        /**
         * Aggiunge un'azione alla timeline. Le azioni sono eventi speciali
         * che generano conseguenze (EventBus) quando processate.
         *
         * @param {Object} rawAction - Dati grezzi dell'azione.
         * @returns {TimelineAction} L'azione creata e inserita.
         * @throws {ValidationError}
         */
        addAction(rawAction) {
            const action = createAction(rawAction);

            if (this._actionIndex.has(action.id)) {
                throw new ValidationError(
                    `Azione duplicata: id "${action.id}" già presente`,
                    { id: action.id }
                );
            }

            this._actions.push(action);
            this._actionIndex.set(action.id, action);

            // Mantieni le azioni ordinate per timestamp+sequence
            this._actions.sort((a, b) =>
                a.timestamp - b.timestamp || a.sequence - b.sequence
            );

            this.logger.info('Azione aggiunta', { id: action.id, type: action.type });
            this.bus.emit('action:added', action, { source: 'TimelineManager' });

            return action;
        }

        /**
         * Processa la prossima azione pendente in ordine cronologico.
         * Applica le conseguenze al worldState e genera eventi figlio
         * come conseguenze dell'azione.
         *
         * @returns {TimelineAction|null} L'azione processata, o null.
         */
        processNextAction() {
            const next = this._actions.find(a => a.status === EVENT_STATUS.PENDING);
            if (!next) return null;

            next.status = EVENT_STATUS.PROCESSING;
            this.logger.info('Processando azione', { id: next.id });

            // Applica le conseguenze
            const childEvents = [];
            for (const conseq of next.consequences) {
                if (conseq.applied) continue;
                this._applyConsequence(conseq);
                conseq.applied = true;

                // Se la conseguenza genera un evento figlio
                if (conseq.type === 'event_trigger' && conseq.changes.eventType) {
                    const childEvent = this.addEvent({
                        timestamp: next.timestamp + conseq.delayMs,
                        actorId: next.actorId,
                        type: conseq.changes.eventType,
                        title: conseq.changes.eventTitle || `Conseguenza di: ${next.title}`,
                        description: conseq.changes.eventDescription || '',
                        payload: conseq.changes,
                        parentId: next.id,
                        importance: conseq.changes.importance || 'normal'
                    });
                    childEvents.push(childEvent);
                    if (!next.consequenceIds) next.consequenceIds = [];
                    next.consequenceIds.push(childEvent.id);
                }
            }

            next.status = EVENT_STATUS.PROCESSED;
            next.processedAt = Date.now();

            this.logger.info('Azione processata', { id: next.id, childEvents: childEvents.length });
            this.bus.emit('action:processed', next, {
                source: 'TimelineManager',
                childEvents: childEvents.map(e => e.id),
                worldState: { ...this.worldState }
            });

            return next;
        }

        /**
         * Processa tutte le azioni pendenti in ordine cronologico.
         * @returns {TimelineAction[]}
         */
        processAllActions() {
            const processed = [];
            let action;
            while ((action = this.processNextAction()) !== null) {
                processed.push(action);
            }
            return processed;
        }

        /**
         * Restituisce tutte le azioni.
         * @returns {TimelineAction[]}
         */
        getActions() {
            return this._actions.slice();
        }

        /**
         * Restituisce un'azione per ID.
         * @param {string} id
         * @returns {TimelineAction|undefined}
         */
        getAction(id) {
            return this._actionIndex.get(id);
        }

        // ── Stato del mondo ───────────────────────────────────────────

        /**
         * Imposta lo stato del mondo.
         * @param {Object} state
         */
        setWorldState(state) {
            if (typeof state !== 'object' || state === null) {
                throw new ValidationError('worldState deve essere un oggetto', { value: state });
            }
            this.worldState = state;
        }

        /**
         * Restituisce una copia dello stato del mondo attuale.
         * @returns {Object}
         */
        getWorldState() {
            return { ...this.worldState };
        }

        /**
         * Avanza il tick logico al timestamp specificato.
         * @param {number} timestamp
         */
        advanceTo(timestamp) {
            validatePositiveInt(timestamp, 'timestamp');
            if (timestamp < this._currentTick) {
                throw new TemporalParadoxError(
                    `Non si può retrocedere la timeline: tick corrente ${this._currentTick}, richiesto ${timestamp}`,
                    { currentTick: this._currentTick, requested: timestamp }
                );
            }
            this._currentTick = timestamp;
        }

        /**
         * @returns {number} Tick logico corrente.
         */
        getCurrentTick() {
            return this._currentTick;
        }

        // ── Interni ────────────────────────────────────────────────────

        /**
         * Inserisce un evento mantenendo l'ordine cronologico (insertion sort
         * con ricerca binaria per il punto di inserimento).
         * @param {TimelineEvent} event
         * @private
         */
        _insertSorted(event) {
            // Ricerca binaria per trovare il punto di inserimento
            let lo = 0, hi = this._events.length;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                const cmp = this._compareEvents(this._events[mid], event);
                if (cmp <= 0) lo = mid + 1;
                else hi = mid;
            }
            this._events.splice(lo, 0, event);
        }

        /**
         * Confronta due eventi per ordinamento deterministico.
         * Prima per timestamp, poi per sequence (tie-breaker stabile).
         * @param {TimelineEvent} a
         * @param {TimelineEvent} b
         * @returns {number} -1, 0, o 1
         * @private
         */
        _compareEvents(a, b) {
            if (a.timestamp !== b.timestamp) {
                return a.timestamp - b.timestamp;
            }
            return a.sequence - b.sequence;
        }

        /**
         * Applica gli effetti di un evento al worldState.
         * @param {TimelineEvent} event
         * @private
         */
        _applyEventEffects(event) {
            const p = event.payload || {};
            // Applica modifiche allo stato se presenti nel payload
            if (p.stateChanges && typeof p.stateChanges === 'object') {
                for (const [key, value] of Object.entries(p.stateChanges)) {
                    if (typeof value === 'number' && typeof this.worldState[key] === 'number') {
                        this.worldState[key] += value;
                    } else {
                        this.worldState[key] = value;
                    }
                }
            }
        }

        /**
         * Applica una conseguenza al worldState.
         * @param {Consequence} conseq
         * @private
         */
        _applyConsequence(conseq) {
            const changes = conseq.changes || {};
            if (changes.stateChanges && typeof changes.stateChanges === 'object') {
                for (const [key, value] of Object.entries(changes.stateChanges)) {
                    if (typeof value === 'number' && typeof this.worldState[key] === 'number') {
                        this.worldState[key] += value;
                    } else {
                        this.worldState[key] = value;
                    }
                }
            }
            this.bus.emit('consequence:applied', conseq, {
                source: 'TimelineManager',
                targetId: conseq.targetId
            });
        }

        /**
         * Mantiene il numero di eventi sotto il limite massimo.
         * Rimuove gli eventi più vecchi (PENDING o CANCELLED, mai PROCESSED).
         * @private
         */
        _enforceLimit() {
            while (this._events.length > this.maxEvents) {
                // Trova il primo PENDING o CANCELLED (i più vecchi sono in cima)
                const idx = this._events.findIndex(
                    e => e.status === EVENT_STATUS.PENDING || e.status === EVENT_STATUS.CANCELLED
                );
                if (idx === -1) break; // Tutti processati, non rimuovere
                const removed = this._events.splice(idx, 1)[0];
                this._index.delete(removed.id);
                this.logger.warn('Evento rimosso per limite', { id: removed.id });
            }
        }

        // ── Serializzazione ────────────────────────────────────────────

        /**
         * Esporta lo stato completo della timeline.
         * @returns {Object}
         */
        serialize() {
            return {
                version: TIMELINE_ENGINE_VERSION,
                events: this._events.map(e => ({ ...e })),
                actions: this._actions.map(a => ({ ...a })),
                worldState: { ...this.worldState },
                currentTick: this._currentTick,
                maxEvents: this.maxEvents
            };
        }

        /**
         * Ripristina lo stato da un oggetto serializzato.
         * @param {Object} data
         * @throws {ValidationError}
         */
        deserialize(data) {
            if (!data || typeof data !== 'object') {
                throw new ValidationError('deserialize richiede un oggetto', { value: data });
            }
            this._events = [];
            this._index.clear();
            this._actions = [];
            this._actionIndex.clear();

            const events = Array.isArray(data.events) ? data.events : [];
            for (const raw of events) {
                const event = createEvent(raw);
                event.status = raw.status || EVENT_STATUS.PROCESSED;
                event.processedAt = raw.processedAt || null;
                this._events.push(event);
                this._index.set(event.id, event);
            }
            // Non serve riordinare: assume che serialize() produca già in ordine.
            // Ma per sicurezza, ordiniamo.
            this._events.sort((a, b) => this._compareEvents(a, b));

            const actions = Array.isArray(data.actions) ? data.actions : [];
            for (const raw of actions) {
                const action = createAction(raw);
                action.status = raw.status || EVENT_STATUS.PROCESSED;
                action.processedAt = raw.processedAt || null;
                this._actions.push(action);
                this._actionIndex.set(action.id, action);
            }
            this._actions.sort((a, b) =>
                a.timestamp - b.timestamp || a.sequence - b.sequence
            );

            this.worldState = data.worldState || {};
            this._currentTick = data.currentTick || 0;
            this.maxEvents = data.maxEvents || DEFAULT_MAX_EVENTS;
        }

        /**
         * Resetta la timeline a stato vuoto.
         */
        reset() {
            this._events = [];
            this._index.clear();
            this._actions = [];
            this._actionIndex.clear();
            this.worldState = {};
            this._currentTick = 0;
            this.bus.clear();
            this.logger.clear();
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // API pubblica
    // ─────────────────────────────────────────────────────────────────────

    return {
        // Costanti
        TIMELINE_ENGINE_VERSION,
        EVENT_TYPES,
        ACTION_TYPES,
        EVENT_STATUS,
        IMPORTANCE_RANK,
        DEFAULT_MAX_EVENTS,
        // Errori
        TimelineError,
        TemporalParadoxError,
        ValidationError,
        // Classi
        TimelineLogger,
        EventBus,
        TimelineManager,
        // Factory
        createEvent,
        createAction,
        generateId,
        // Validatori
        validatePositiveInt,
        validateNonEmptyString,
        validateEventType,
        validateActionType,
        validateImportance,
        validatePayload
    };
});