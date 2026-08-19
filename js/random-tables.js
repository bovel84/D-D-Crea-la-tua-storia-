(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheTables = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const STORAGE_KEY = 'cronache_random_tables';
    const SCHEMA_VERSION = 1;

    /* ==================== STORAGE ==================== */

    function load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return {};
            var data = JSON.parse(raw);
            if (data && typeof data === 'object') return data;
            return {};
        } catch (_) { return {}; }
    }

    function save(tables) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(tables));
        } catch (_) { /* quota */ }
    }

    /* ==================== UTILS ==================== */

    function uid() {
        return 'rt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function cleanText(v, max) {
        var t = String(v == null ? '' : v).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        return Number.isFinite(max) && t.length > max ? t.slice(0, max - 1) + '…' : t;
    }

    function rollDie(sides) {
        return 1 + Math.floor(Math.random() * sides);
    }

    /* ==================== TABLE CRUD ==================== */

    /**
     * Crea una tabella random.
     * @param {Object} opts
     * @param {string} opts.name - Nome della tabella
     * @param {string} [opts.description] - Descrizione
     * @param {string} [opts.die] - Dado da tirare (es. 'd100', 'd20'). Auto-detect se omesso.
     * @param {Array} opts.entries - Entry della tabella
     *   Ogni entry: { range: [min, max], text: 'risultato', weight: 1, subtable: 'tableName', category: 'cat' }
     * @param {string} [opts.category] - Categoria default
     * @returns {Object} La tabella creata
     */
    function createTable(opts) {
        var tables = load();
        var id = uid();
        var name = cleanText(opts.name, 80);

        // Auto-detect die size
        var die = opts.die;
        if (!die) {
            var maxRange = 0;
            (opts.entries || []).forEach(function (e) {
                if (e.range) maxRange = Math.max(maxRange, e.range[1] || e.range[0] || 0);
            });
            if (maxRange <= 6) die = 'd6';
            else if (maxRange <= 20) die = 'd20';
            else die = 'd100';
        }

        var table = {
            id: id,
            schemaVersion: SCHEMA_VERSION,
            name: name,
            description: cleanText(opts.description, 240),
            die: die,
            entries: (opts.entries || []).map(function (e) {
                return {
                    range: e.range || null,
                    text: cleanText(e.text, 300),
                    weight: e.weight || 1,
                    subtable: cleanText(e.subtable, 80) || null,
                    category: cleanText(e.category, 40) || opts.category || null
                };
            }),
            category: cleanText(opts.category, 40) || null,
            createdAt: Date.now()
        };

        tables[id] = table;
        save(tables);
        return table;
    }

    /**
     * Crea rapidamente una tabella da un array di stringhe.
     * Ogni stringa diventa un'entry con range automatico.
     * @param {string} name
     * @param {Array} items - Array di stringhe
     * @param {string} [die] - Dado (auto-detect se omesso)
     */
    function createSimpleTable(name, items, die) {
        var entries = (items || []).map(function (text, i) {
            return { range: [i + 1, i + 1], text: text };
        });
        return createTable({ name: name, entries: entries, die: die });
    }

    function getTable(id) {
        var tables = load();
        return tables[id] || null;
    }

    function getTableByName(name) {
        var tables = load();
        var clean = cleanText(name, 80).toLowerCase();
        return Object.values(tables).find(function (t) {
            return t.name.toLowerCase() === clean;
        }) || null;
    }

    function listTables(filter) {
        var tables = load();
        var arr = Object.values(tables);
        if (filter && filter.category) {
            arr = arr.filter(function (t) { return t.category === filter.category; });
        }
        return arr.sort(function (a, b) { return a.createdAt - b.createdAt; });
    }

    function deleteTable(id) {
        var tables = load();
        if (!tables[id]) return false;
        delete tables[id];
        save(tables);
        return true;
    }

    function addEntry(tableId, entry) {
        var tables = load();
        var t = tables[tableId];
        if (!t) return { success: false, error: 'Tabella non trovata' };
        t.entries.push({
            range: entry.range || null,
            text: cleanText(entry.text, 300),
            weight: entry.weight || 1,
            subtable: cleanText(entry.subtable, 80) || null,
            category: cleanText(entry.category, 40) || null
        });
        save(tables);
        return { success: true, table: t };
    }

    /* ==================== ROLLING ==================== */

    /**
     * Tira un dado sulla tabella e restituisce il risultato.
     * Supporta range matching e weighted random fallback.
     * Se il risultato ha un subtable, tira anche quello (ricorsivo, max 3 livelli).
     * @param {string} tableId
     * @param {number} [depth=0] - Profondità ricorsione subtable
     * @returns {Object} { roll, matchedEntry, subtableResult }
     */
    function rollTable(tableId, depth) {
        depth = depth || 0;
        if (depth > 3) return { error: 'Profondità subtable eccessiva (max 3)' };

        var t = getTable(tableId);
        if (!t) return { error: 'Tabella non trovata: ' + tableId };

        // Parsa die
        var m = String(t.die).match(/d(\d+)/i);
        var sides = m ? parseInt(m[1], 10) : 100;
        var roll = rollDie(sides);

        // Match per range
        var matched = t.entries.find(function (e) {
            if (!e.range) return false;
            return roll >= e.range[0] && roll <= (e.range[1] || e.range[0]);
        });

        // Fallback: weighted random se nessun range match
        if (!matched) {
            var weighted = t.entries.filter(function (e) { return !e.range; });
            if (weighted.length) {
                var totalWeight = weighted.reduce(function (s, e) { return s + (e.weight || 1); }, 0);
                var pick = Math.random() * totalWeight;
                for (var i = 0; i < weighted.length; i++) {
                    pick -= (weighted[i].weight || 1);
                    if (pick <= 0) { matched = weighted[i]; break; }
                }
                if (!matched) matched = weighted[weighted.length - 1];
            }
        }

        // Ultimate fallback
        if (!matched && t.entries.length) {
            matched = t.entries[Math.floor(Math.random() * t.entries.length)];
        }

        if (!matched) return { roll: roll, error: 'Nessuna entry nella tabella' };

        var result = {
            tableId: tableId,
            tableName: t.name,
            roll: roll,
            matchedEntry: matched
        };

        // Subtable recursion
        if (matched.subtable && depth < 3) {
            var sub = getTableByName(matched.subtable);
            if (sub) {
                result.subtableResult = rollTable(sub.id, depth + 1);
            }
        }

        return result;
    }

    /**
     * Tira su una tabella per nome.
     */
    function rollByName(name) {
        var t = getTableByName(name);
        if (!t) return { error: 'Tabella non trovata: ' + name };
        return rollTable(t.id);
    }

    /* ==================== BUILT-IN TABLES ==================== */

    /**
     * Inizializza un set di tabelle predefinite utili per il Game Director.
     * Non sovrascrive tabelle esistenti con lo stesso nome.
     */
    function initBuiltins() {
        var existing = load();
        var names = new Set(Object.values(existing).map(function (t) { return t.name.toLowerCase(); }));

        var builtins = [
            {
                name: 'Eventi Città',
                die: 'd100',
                entries: [
                    { range: [1, 10], text: 'Una fiera di mercato attira visitatori da tutta la regione.', category: 'sociale' },
                    { range: [11, 20], text: 'Un nobile locale viene trovato morto in circostanze sospette.', category: 'crimine' },
                    { range: [21, 30], text: 'Una compagnia di mercenari arriva in città cercando lavoro.', category: 'militare' },
                    { range: [31, 40], text: 'Scoppia un incendio nel quartiere commerciale.', category: 'pericolo' },
                    { range: [41, 50], text: 'Un mercante forestiero offre merci rare a prezzi strani.', category: 'economia' },
                    { range: [51, 60], text: 'Si diffondono voci di un culto segreto nei sotterranei.', category: 'mistero' },
                    { range: [61, 70], text: 'Un festival religioso riunisce la comunità nella piazza.', category: 'sociale' },
                    { range: [71, 80], text: 'Banditi attaccano le carovane sulle strade vicine.', category: 'pericolo' },
                    { range: [81, 90], text: 'Un ambasciatore straniero arriva per negoziati diplomatici.', category: 'politica' },
                    { range: [91, 100], text: 'Un evento magico anomalo illumina il cielo notturno.', category: 'magia' }
                ]
            },
            {
                name: 'Incontri Selvaggi',
                die: 'd20',
                entries: [
                    { range: [1, 5], text: 'Un branco di lupi affamati blocca il sentiero.' },
                    { range: [6, 10], text: 'Una carovana di mercanti chiede scorta per il prossimo tratto.' },
                    { range: [11, 14], text: 'Un viandante solitario offre informazioni in cambio di cibo.' },
                    { range: [15, 17], text: 'Banditi tendono un\'imboscata al bivio.' },
                    { range: [18, 19], text: 'Una creatura magica osserva da lontano, poi scompare.' },
                    { range: [20, 20], text: 'Un antico altare semi-nascosto pulsa di energia arcana.' }
                ]
            },
            {
                name: 'Segreti PNG',
                die: 'd20',
                entries: [
                    { range: [1, 4], text: 'Il PNG nasconde un debito di gioco con usurai locali.' },
                    { range: [5, 8], text: 'Il PNG è in realtà una spia di una fazione rivale.' },
                    { range: [9, 12], text: 'Il PNG possiede un oggetto rubato senza saperlo.' },
                    { range: [13, 15], text: 'Il PNG ha un figlio segreto da una relazione precedente.' },
                    { range: [16, 18], text: 'Il PNG conosce l\'ubicazione di un tesoro dimenticato.' },
                    { range: [19, 20], text: 'Il PNG è vittima di un geas/maledizione che non può rivelare.' }
                ]
            },
            {
                name: 'Eventi Regno',
                die: 'd100',
                entries: [
                    { range: [1, 15], text: 'Un raccolto eccezionale arricchisce i granai del regno.', category: 'economia' },
                    { range: [16, 30], text: 'Una malattia inizia a diffondersi tra il bestiame.', category: 'crisi' },
                    { range: [31, 45], text: 'Una fazione nobiliare fa pressione per una legge sfavorevole.', category: 'politica' },
                    { range: [46, 60], text: 'Una miniera importante viene scoperta nelle terre di confine.', category: 'economia' },
                    { range: [61, 75], text: 'Tensioni di confine con un regno vicino richiedono attenzione.', category: 'militare' },
                    { range: [76, 85], text: 'Un festival nazionale migliora il morale della popolazione.', category: 'sociale' },
                    { range: [86, 95], text: 'Corruzione scoperta tra i funzionari della corte.', category: 'politica' },
                    { range: [96, 100], text: 'Un presagio magico allarma i sacerdoti del tempio principale.', category: 'magia' }
                ]
            }
        ];

        builtins.forEach(function (b) {
            if (!names.has(b.name.toLowerCase())) {
                createTable(b);
            }
        });

        return { success: true, message: 'Tabelle predefinite inizializzate' };
    }

    /* ==================== EXPORTS ==================== */

    return {
        SCHEMA_VERSION: SCHEMA_VERSION,
        STORAGE_KEY: STORAGE_KEY,
        createTable: createTable,
        createSimpleTable: createSimpleTable,
        getTable: getTable,
        getTableByName: getTableByName,
        listTables: listTables,
        deleteTable: deleteTable,
        addEntry: addEntry,
        rollTable: rollTable,
        rollByName: rollByName,
        initBuiltins: initBuiltins
    };
});