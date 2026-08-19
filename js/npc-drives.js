/**
 * npc-drives.js — NPC Drives & Pressure per "Cronache del Destino"
 * Priorità 6: NPC Drives & Pressure
 *
 * Ogni NPC ha drives (desideri/obiettivi personali) con priorità 1-10
 * e pressure (tensione accumulata 0-100) che spinge all'azione.
 *
 * Namespace: CronacheDrives
 * Storage key: cronache_npc_drives
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CronacheDrives = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var STORAGE_KEY = 'cronache_npc_drives';
    var MAX_NPCS = 100;
    var MAX_DRIVES_PER_NPC = 10;
    var PRESSURE_MIN = 0;
    var PRESSURE_MAX = 100;
    var TICK_BASE = 2;
    var TICK_FRUSTRATED = 5;
    var TICK_SATISFIED = -10;
    var HIGH_PRESSURE_THRESHOLD = 70;

    // Internal state: map of npcName -> { drives: [], pressure: number, frustratedCount: number }
    var npcs = {};

    // ---- Persistence ----

    function save() {
        try {
            var data = { npcs: npcs };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            return false;
        }
    }

    function load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            var data = JSON.parse(raw);
            if (data && data.npcs) {
                npcs = data.npcs;
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    // ---- Helpers ----

    function clampPressure(value) {
        if (value < PRESSURE_MIN) return PRESSURE_MIN;
        if (value > PRESSURE_MAX) return PRESSURE_MAX;
        return value;
    }

    function genDriveId() {
        return 'd_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
    }

    function npcExists(name) {
        return Object.prototype.hasOwnProperty.call(npcs, name);
    }

    function findDriveIndex(driveList, driveId) {
        for (var i = 0; i < driveList.length; i++) {
            if (driveList[i].id === driveId) return i;
        }
        return -1;
    }

    function validateName(name) {
        return typeof name === 'string' && name.trim().length > 0;
    }

    function validatePriority(priority) {
        return typeof priority === 'number' && priority >= 1 && priority <= 10;
    }

    // ---- Public API ----

    /**
     * Registra un NPC con i suoi drives iniziali.
     * @param {string} name - Nome dell'NPC
     * @param {Array} drives - Array di { drive: string, priority: number }
     * @returns {boolean} true se registrato, false altrimenti
     */
    function addNPC(name, drives) {
        if (!validateName(name)) return false;
        if (Object.keys(npcs).length >= MAX_NPCS && !npcExists(name)) return false;

        var entry = { drives: [], pressure: PRESSURE_MIN, frustratedCount: 0 };

        if (Array.isArray(drives)) {
            for (var i = 0; i < drives.length && entry.drives.length < MAX_DRIVES_PER_NPC; i++) {
                var d = drives[i];
                if (d && typeof d.drive === 'string' && validatePriority(d.priority)) {
                    entry.drives.push({
                        id: genDriveId(),
                        drive: d.drive,
                        priority: d.priority,
                        status: 'active' // active | satisfied | frustrated
                    });
                }
            }
        }

        npcs[name.trim()] = entry;
        save();
        return true;
    }

    /**
     * Aggiunge un drive a un NPC esistente.
     * @param {string} npcName - Nome dell'NPC
     * @param {string} drive - Descrizione del drive
     * @param {number} priority - Priorità 1-10
     * @returns {string|null} ID del drive creato, o null
     */
    function addDrive(npcName, drive, priority) {
        if (!validateName(npcName) || !npcExists(npcName.trim())) return null;
        if (typeof drive !== 'string' || drive.trim().length === 0) return null;
        if (!validatePriority(priority)) return null;

        var npc = npcs[npcName.trim()];
        if (npc.drives.length >= MAX_DRIVES_PER_NPC) return null;

        var id = genDriveId();
        npc.drives.push({
            id: id,
            drive: drive.trim(),
            priority: priority,
            status: 'active'
        });
        save();
        return id;
    }

    /**
     * Rimuove un drive da un NPC.
     * @param {string} npcName - Nome dell'NPC
     * @param {string} driveId - ID del drive
     * @returns {boolean} true se rimosso, false altrimenti
     */
    function removeDrive(npcName, driveId) {
        if (!validateName(npcName) || !npcExists(npcName.trim())) return false;
        var npc = npcs[npcName.trim()];
        var idx = findDriveIndex(npc.drives, driveId);
        if (idx === -1) return false;
        npc.drives.splice(idx, 1);
        save();
        return true;
    }

    /**
     * Aumenta o diminuisce il pressure di un NPC.
     * @param {string} npcName - Nome dell'NPC
     * @param {number} amount - Quantità (positiva o negativa)
     * @returns {number|null} Nuovo pressure level, o null
     */
    function tickPressure(npcName, amount) {
        if (!validateName(npcName) || !npcExists(npcName.trim())) return null;
        if (typeof amount !== 'number') return null;
        var npc = npcs[npcName.trim()];
        npc.pressure = clampPressure(npc.pressure + amount);
        save();
        return npc.pressure;
    }

    /**
     * Tick automatico di pressure per tutti gli NPC.
     * Pressure sale gradualmente: +2 base, +5 extra per ogni drive frustrato.
     */
    function tickAll() {
        var results = {};
        for (var name in npcs) {
            if (!npcExists(name)) continue;
            var npc = npcs[name];
            var increment = TICK_BASE;
            var frustratedCount = 0;

            for (var i = 0; i < npc.drives.length; i++) {
                if (npc.drives[i].status === 'frustrated') {
                    frustratedCount++;
                }
            }

            increment += frustratedCount * TICK_FRUSTRATED;
            npc.pressure = clampPressure(npc.pressure + increment);
            results[name] = npc.pressure;
        }
        save();
        return results;
    }

    /**
     * Ritorna pressure level e drives attivi per un NPC.
     * @param {string} npcName - Nome dell'NPC
     * @returns {object|null} { pressure, drives } o null
     */
    function getNPCPressure(npcName) {
        if (!validateName(npcName) || !npcExists(npcName.trim())) return null;
        var npc = npcs[npcName.trim()];
        var activeDrives = npc.drives.filter(function (d) {
            return d.status === 'active';
        });
        return {
            pressure: npc.pressure,
            drives: activeDrives.map(function (d) {
                return { id: d.id, drive: d.drive, priority: d.priority, status: d.status };
            })
        };
    }

    /**
     * Ritorna gli NPC con pressure > 70 (pronti per azione drastica).
     * @returns {Array} Array di { name, pressure, drives }
     */
    function getHighPressureNPCs() {
        var result = [];
        for (var name in npcs) {
            if (!npcExists(name)) continue;
            var npc = npcs[name];
            if (npc.pressure > HIGH_PRESSURE_THRESHOLD) {
                var activeDrives = npc.drives.filter(function (d) {
                    return d.status === 'active';
                });
                result.push({
                    name: name,
                    pressure: npc.pressure,
                    drives: activeDrives.map(function (d) {
                        return { id: d.id, drive: d.drive, priority: d.priority };
                    })
                });
            }
        }
        result.sort(function (a, b) {
            return b.pressure - a.pressure;
        });
        return result;
    }

    /**
     * Marca un drive come soddisfatto (riduce pressure di 10).
     * @param {string} npcName - Nome dell'NPC
     * @param {string} driveId - ID del drive
     * @returns {boolean} true se marcato, false altrimenti
     */
    function resolveDrive(npcName, driveId) {
        if (!validateName(npcName) || !npcExists(npcName.trim())) return false;
        var npc = npcs[npcName.trim()];
        var idx = findDriveIndex(npc.drives, driveId);
        if (idx === -1) return false;
        if (npc.drives[idx].status === 'satisfied') return false;

        npc.drives[idx].status = 'satisfied';
        npc.pressure = clampPressure(npc.pressure + TICK_SATISFIED);
        save();
        return true;
    }

    /**
     * Marca un drive come frustrato (aumenta pressure di 5).
     * @param {string} npcName - Nome dell'NPC
     * @param {string} driveId - ID del drive
     * @returns {boolean} true se marcato, false altrimenti
     */
    function frustrateDrive(npcName, driveId) {
        if (!validateName(npcName) || !npcExists(npcName.trim())) return false;
        var npc = npcs[npcName.trim()];
        var idx = findDriveIndex(npc.drives, driveId);
        if (idx === -1) return false;
        if (npc.drives[idx].status === 'frustrated') return false;

        npc.drives[idx].status = 'frustrated';
        npc.pressure = clampPressure(npc.pressure + TICK_FRUSTRATED);
        save();
        return true;
    }

    /**
     * Riepilogo testuale per prompt LLM: NPC con pressure alta + drives attivi.
     * @returns {string} Riepilogo formattato
     */
    function summary() {
        var lines = [];
        var highCount = 0;
        var anyActive = false;

        for (var name in npcs) {
            if (!npcExists(name)) continue;
            var npc = npcs[name];
            var activeDrives = npc.drives.filter(function (d) {
                return d.status === 'active';
            });
            var frustratedDrives = npc.drives.filter(function (d) {
                return d.status === 'frustrated';
            });

            if (activeDrives.length === 0 && frustratedDrives.length === 0) continue;
            anyActive = true;

            var parts = [];
            parts.push(name + ' [Pressure: ' + npc.pressure + '/100]');

            if (activeDrives.length > 0) {
                var driveStrs = activeDrives.map(function (d) {
                    return d.drive + ' (prio:' + d.priority + ')';
                });
                parts.push('Drives: ' + driveStrs.join(', '));
            }

            if (frustratedDrives.length > 0) {
                var frustStrs = frustratedDrives.map(function (d) {
                    return d.drive + ' (prio:' + d.priority + ')';
                });
                parts.push('Frustrati: ' + frustStrs.join(', '));
            }

            lines.push(parts.join(' | '));

            if (npc.pressure > HIGH_PRESSURE_THRESHOLD) {
                highCount++;
            }
        }

        if (!anyActive) {
            return 'Nessun NPC con drives attivi.';
        }

        var header = '=== NPC DRIVES & PRESSURE ===\n';
        if (highCount > 0) {
            header += 'ATTENZIONE: ' + highCount + ' NPC con pressure > 70 (azione drastica imminente).\n';
        }
        return header + lines.join('\n');
    }

    /**
     * Riepilogo per un singolo NPC.
     * @param {string} npcName - Nome dell'NPC
     * @returns {string} Riepilogo formattato, o stringa vuota
     */
    function summaryForNPC(npcName) {
        if (!validateName(npcName) || !npcExists(npcName.trim())) return '';
        var npc = npcs[npcName.trim()];
        var name = npcName.trim();

        var lines = [];
        lines.push('=== ' + name + ' ===');
        lines.push('Pressure: ' + npc.pressure + '/100');

        if (npc.pressure > HIGH_PRESSURE_THRESHOLD) {
            lines.push('AVVISO: Pressure alta — NPC pronto per azione drastica.');
        }

        var active = npc.drives.filter(function (d) { return d.status === 'active'; });
        var satisfied = npc.drives.filter(function (d) { return d.status === 'satisfied'; });
        var frustrated = npc.drives.filter(function (d) { return d.status === 'frustrated'; });

        if (active.length > 0) {
            lines.push('Drives attivi:');
            active.forEach(function (d) {
                lines.push('  - [' + d.id + '] ' + d.drive + ' (priorità ' + d.priority + ')');
            });
        }

        if (frustrated.length > 0) {
            lines.push('Drives frustrati:');
            frustrated.forEach(function (d) {
                lines.push('  - [' + d.id + '] ' + d.drive + ' (priorità ' + d.priority + ')');
            });
        }

        if (satisfied.length > 0) {
            lines.push('Drives soddisfatti:');
            satisfied.forEach(function (d) {
                lines.push('  - [' + d.id + '] ' + d.drive + ' (priorità ' + d.priority + ')');
            });
        }

        if (npc.drives.length === 0) {
            lines.push('Nessun drive registrato.');
        }

        return lines.join('\n');
    }

    /**
     * Reset completo: svuota tutti gli NPC e rimuove il salvataggio.
     */
    function clear() {
        npcs = {};
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            /* noop */
        }
    }

    /**
     * Carica i dati salvati da localStorage.
     * @returns {boolean} true se caricato, false altrimenti
     */
    function init() {
        return load();
    }

    // ---- Esposizione API ----

    return {
        // Costanti
        MAX_NPCS: MAX_NPCS,
        MAX_DRIVES_PER_NPC: MAX_DRIVES_PER_NPC,
        HIGH_PRESSURE_THRESHOLD: HIGH_PRESSURE_THRESHOLD,

        // Persistenza
        init: init,
        save: save,
        load: load,
        clear: clear,

        // Gestione NPC e Drives
        addNPC: addNPC,
        addDrive: addDrive,
        removeDrive: removeDrive,

        // Pressure
        tickPressure: tickPressure,
        tickAll: tickAll,
        getNPCPressure: getNPCPressure,
        getHighPressureNPCs: getHighPressureNPCs,

        // Risoluzione drives
        resolveDrive: resolveDrive,
        frustrateDrive: frustrateDrive,

        // Riepiloghi
        summary: summary,
        summaryForNPC: summaryForNPC
    };
});