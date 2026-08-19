/*!
 * session-timeline.js — CronacheTimeline
 * Modulo UMD per "Cronache del Destino" — tracciamento timeline sessione D&D.
 *
 * Funzionalità:
 *  - Traccia eventi significativi per turno (turn events)
 *  - Auto-summary compresso ogni N turni (default 10)
 *  - Mantieni chapter summaries (riassunti di capitoli della storia)
 *  - Persistenza localStorage
 *  - summary() per prompt LLM (capitoli + eventi recenti)
 *
 * Namespace: CronacheTimeline
 * Storage key: cronache_session_timeline
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CronacheTimeline = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // ── Costanti ────────────────────────────────────────────────
    var STORAGE_KEY = 'cronache_session_timeline';
    var DEFAULT_SUMMARY_THRESHOLD = 10;
    var MAX_TURN_EVENTS = 200;
    var MAX_CHAPTERS = 50;

    // ── Stato interno ───────────────────────────────────────────
    var _turnEvents = [];      // array di { turn, timestamp, event }
    var _chapters = [];        // array di { chapterNumber, startTurn, endTurn, summary }
    var _summaryThreshold = DEFAULT_SUMMARY_THRESHOLD;

    // ── Utility interne ─────────────────────────────────────────

    /**
     * Ridimensiona _turnEvents se supera il cap.
     * Rimuove gli eventi più vecchi mantenendo i più recenti.
     */
    function _enforceCap() {
        if (_turnEvents.length > MAX_TURN_EVENTS) {
            _turnEvents.splice(0, _turnEvents.length - MAX_TURN_EVENTS);
        }
    }

    /**
     * Ridimensiona _chapters se supera il cap.
     * Rimuove i capitoli più vecchi.
     */
    function _enforceChaptersCap() {
        if (_chapters.length > MAX_CHAPTERS) {
            _chapters.splice(0, _chapters.length - MAX_CHAPTERS);
        }
    }

    /**
     * Verifica disponibilità localStorage.
     * @returns {boolean}
     */
    function _storageAvailable() {
        try {
            var t = '__cronache_test__';
            if (typeof localStorage === 'undefined') return false;
            localStorage.setItem(t, '1');
            localStorage.removeItem(t);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Genera un timestamp ISO-like leggibile (gioco).
     * @returns {string}
     */
    function _gameTimestamp() {
        var d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0') + 'T' +
            String(d.getHours()).padStart(2, '0') + ':' +
            String(d.getMinutes()).padStart(2, '0') + ':' +
            String(d.getSeconds()).padStart(2, '0');
    }

    // ── API Pubblica ────────────────────────────────────────────

    /**
     * Aggiunge un evento significativo al turno corrente.
     * @param {number} turn — numero del turno
     * @param {string} event — descrizione dell'evento
     */
    function addTurnEvent(turn, event) {
        if (typeof turn !== 'number' || turn < 0) return;
        if (typeof event !== 'string' || event.trim().length === 0) return;

        _turnEvents.push({
            turn: turn,
            timestamp: _gameTimestamp(),
            event: event.trim()
        });
        _enforceCap();
        _persist();
    }

    /**
     * Verifica se è il momento di generare un auto-summary.
     * Se turnCount % threshold === 0 (e > 0), marca per summary
     * e genera il capitolo.
     * @param {number} turnCount — contatore turni corrente
     * @returns {boolean} true se è stato generato un summary, false altrimenti
     */
    function checkAutoSummary(turnCount) {
        if (typeof turnCount !== 'number' || turnCount <= 0) return false;
        if (turnCount % _summaryThreshold !== 0) return false;

        // Calcola range turni per questo capitolo
        var startTurn = turnCount - _summaryThreshold + 1;
        var endTurn = turnCount;

        // Estrai eventi nel range
        var eventsInRange = _turnEvents.filter(function (e) {
            return e.turn >= startTurn && e.turn <= endTurn;
        });

        if (eventsInRange.length === 0) {
            // Nessun evento nel range — crea un capitolo placeholder
            var placeholder = 'Capitolo ' + (_chapters.length + 1) +
                ': Nessun evento registrato nei turni ' + startTurn + '-' + endTurn + '.';
            _chapters.push({
                chapterNumber: _chapters.length + 1,
                startTurn: startTurn,
                endTurn: endTurn,
                summary: placeholder
            });
        } else {
            var summary = generateSummary(eventsInRange);
            _chapters.push({
                chapterNumber: _chapters.length + 1,
                startTurn: startTurn,
                endTurn: endTurn,
                summary: summary
            });
        }

        _enforceChaptersCap();
        _persist();
        return true;
    }

    /**
     * Comprime una lista di eventi in un riassunto testuale.
     * @param {Array} events — array di oggetti { turn, timestamp, event }
     * @returns {string} riassunto compresso
     */
    function generateSummary(events) {
        if (!Array.isArray(events) || events.length === 0) return '';

        var lines = [];
        var currentTurn = -1;
        var turnEvents = [];

        // Raggruppa eventi per turno
        for (var i = 0; i < events.length; i++) {
            var ev = events[i];
            if (ev.turn !== currentTurn) {
                if (turnEvents.length > 0) {
                    lines.push('Turno ' + currentTurn + ': ' + turnEvents.join('; ') + '.');
                }
                currentTurn = ev.turn;
                turnEvents = [];
            }
            turnEvents.push(ev.event);
        }
        // Flush ultimo gruppo
        if (turnEvents.length > 0) {
            lines.push('Turno ' + currentTurn + ': ' + turnEvents.join('; ') + '.');
        }

        return lines.join(' ');
    }

    /**
     * Ritorna tutti i riassunti dei capitoli.
     * @returns {Array} copia dell'array chapters
     */
    function getChapterSummaries() {
        return _chapters.slice();
    }

    /**
     * Ritorna gli eventi recenti non ancora sommati in un capitolo.
     * @param {number} limit — numero massimo di eventi da ritornare (default 20)
     * @returns {Array} array di eventi recenti
     */
    function getRecentEvents(limit) {
        if (typeof limit !== 'number' || limit <= 0) limit = 20;

        // Determina l'ultimo turno coperto da un capitolo
        var lastChapterEndTurn = _chapters.length > 0
            ? _chapters[_chapters.length - 1].endTurn
            : 0;

        // Eventi successivi all'ultimo capitolo
        var recent = _turnEvents.filter(function (e) {
            return e.turn > lastChapterEndTurn;
        });

        // Se troppi, prendi gli ultimi `limit`
        if (recent.length > limit) {
            recent = recent.slice(recent.length - limit);
        }

        return recent;
    }

    /**
     * Genera un riepilogo testuale completo per prompt LLM.
     * Include capitoli (riassunti) + eventi recenti non ancora sommati.
     * @returns {string} riepilogo testuale
     */
    function summary() {
        var parts = [];

        // Sezione capitoli
        if (_chapters.length > 0) {
            parts.push('## Cronache della Storia');
            for (var i = 0; i < _chapters.length; i++) {
                var ch = _chapters[i];
                parts.push('[Capitolo ' + ch.chapterNumber + ' — Turni ' +
                    ch.startTurn + '-' + ch.endTurn + '] ' + ch.summary);
            }
        }

        // Sezione eventi recenti
        var recent = getRecentEvents(20);
        if (recent.length > 0) {
            if (parts.length > 0) parts.push('');
            parts.push('## Eventi Recenti (non ancora riassunti)');
            for (var j = 0; j < recent.length; j++) {
                var r = recent[j];
                parts.push('(Turno ' + r.turn + ') ' + r.event);
            }
        }

        if (parts.length === 0) {
            return 'Nessuna cronologia disponibile. La storia sta per iniziare.';
        }

        return parts.join('\n');
    }

    /**
     * Reset completo dello stato.
     */
    function clear() {
        _turnEvents = [];
        _chapters = [];
        _summaryThreshold = DEFAULT_SUMMARY_THRESHOLD;
        _persist();
    }

    /**
     * Salva lo stato in localStorage.
     * @returns {boolean} true se salvato, false altrimenti
     */
    function save() {
        return _persist();
    }

    /**
     * Carica lo stato da localStorage.
     * @returns {boolean} true se caricato, false altrimenti
     */
    function load() {
        if (!_storageAvailable()) return false;
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            var data = JSON.parse(raw);
            if (data && typeof data === 'object') {
                _turnEvents = Array.isArray(data.turnEvents) ? data.turnEvents : [];
                _chapters = Array.isArray(data.chapters) ? data.chapters : [];
                _summaryThreshold = typeof data.summaryThreshold === 'number'
                    ? data.summaryThreshold : DEFAULT_SUMMARY_THRESHOLD;
                _enforceCap();
                _enforceChaptersCap();
                return true;
            }
        } catch (e) {
            // Silenzioso in production
        }
        return false;
    }

    /**
     * Persistenza interna (privata).
     * @returns {boolean}
     */
    function _persist() {
        if (!_storageAvailable()) return false;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                turnEvents: _turnEvents,
                chapters: _chapters,
                summaryThreshold: _summaryThreshold
            }));
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Imposta la soglia di auto-summary.
     * @param {number} threshold — ogni quanti turni generare un summary
     */
    function setSummaryThreshold(threshold) {
        if (typeof threshold === 'number' && threshold > 0) {
            _summaryThreshold = threshold;
            _persist();
        }
    }

    /**
     * Ritorna la soglia di auto-summary corrente.
     * @returns {number}
     */
    function getSummaryThreshold() {
        return _summaryThreshold;
    }

    /**
     * Ritorna statistiche rapide sulla timeline.
     * @returns {Object} { totalEvents, totalChapters, threshold }
     */
    function stats() {
        return {
            totalEvents: _turnEvents.length,
            totalChapters: _chapters.length,
            threshold: _summaryThreshold
        };
    }

    // ── Esposizione API ─────────────────────────────────────────
    return {
        // Costanti esposte
        STORAGE_KEY: STORAGE_KEY,
        DEFAULT_SUMMARY_THRESHOLD: DEFAULT_SUMMARY_THRESHOLD,
        MAX_TURN_EVENTS: MAX_TURN_EVENTS,
        MAX_CHAPTERS: MAX_CHAPTERS,

        // Metodi pubblici
        addTurnEvent: addTurnEvent,
        checkAutoSummary: checkAutoSummary,
        generateSummary: generateSummary,
        getChapterSummaries: getChapterSummaries,
        getRecentEvents: getRecentEvents,
        summary: summary,
        clear: clear,
        save: save,
        load: load,
        setSummaryThreshold: setSummaryThreshold,
        getSummaryThreshold: getSummaryThreshold,
        stats: stats
    };
});