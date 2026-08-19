(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheCombat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const STORAGE_KEY = 'cronache_combat_state';
    const SCHEMA_VERSION = 1;

    /* ==================== CONSTANTS ==================== */

    var HP_STATUS = {
        healthy:    { label: 'Salvo',       icon: '💚', minPct: 1.00 },
        wounded:    { label: 'Ferito',      icon: '💛', minPct: 0.50 },
        bloodied:   { label: 'Malconcio',   icon: '🧡', minPct: 0.25 },
        critical:   { label: 'Critico',     icon: '❤️', minPct: 0.01 },
        unconscious:{ label: 'Esanime',     icon: '💀', minPct: 0.00 }
    };

    // Cantrip scaling: livello → dadi extra
    var CANTRIP_TIERS = [
        { minLevel: 1,  dice: 1 },
        { minLevel: 5,  dice: 2 },
        { minLevel: 11, dice: 3 },
        { minLevel: 17, dice: 4 }
    ];

    // Spell slots per full caster (semplificato 5e)
    var FULL_CASTER_SLOTS = {
        1: [2,0,0,0,0,0,0,0,0],
        2: [3,0,0,0,0,0,0,0,0],
        3: [4,2,0,0,0,0,0,0,0],
        4: [4,3,0,0,0,0,0,0,0],
        5: [4,3,2,0,0,0,0,0,0],
        6: [4,3,3,0,0,0,0,0,0],
        7: [4,3,3,1,0,0,0,0,0],
        8: [4,3,3,2,0,0,0,0,0],
        9: [4,3,3,3,0,0,0,0,0],
        10:[4,3,3,3,1,0,0,0,0],
        11:[4,3,3,3,2,0,0,0,0],
        12:[4,3,3,3,2,1,0,0,0],
        13:[4,3,3,3,2,1,1,0,0],
        14:[4,3,3,3,2,1,1,0,0],
        15:[4,3,3,3,2,1,1,1,0],
        16:[4,3,3,3,2,1,1,1,0],
        17:[4,3,3,3,2,1,1,1,1],
        18:[4,3,3,3,3,1,1,1,1],
        19:[4,3,3,3,3,2,1,1,1],
        20:[4,3,3,3,3,2,2,1,1]
    };

    /* ==================== STORAGE ==================== */

    function load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            var data = JSON.parse(raw);
            if (data && data.schemaVersion) return data;
            return null;
        } catch (_) { return null; }
    }

    function save(state) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (_) { /* quota */ }
    }

    function clearState() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    }

    /* ==================== UTILS ==================== */

    function uid() {
        return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function cleanText(v, max) {
        var t = String(v == null ? '' : v).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        return Number.isFinite(max) && t.length > max ? t.slice(0, max - 1) + '…' : t;
    }

    function rollDie(sides) {
        return 1 + Math.floor(Math.random() * sides);
    }

    function rollDice(count, sides, mod) {
        var total = mod || 0;
        for (var i = 0; i < count; i++) total += rollDie(sides);
        return total;
    }

    function rollD20(mod) {
        return rollDie(20) + (mod || 0);
    }

    function parseDice(notation) {
        // "2d6+3" → { count: 2, sides: 6, mod: 3 }
        var m = String(notation || '').match(/(\d+)d(\d+)(?:([+-])(\d+))?/i);
        if (!m) return { count: 1, sides: 4, mod: 0 };
        return {
            count: parseInt(m[1], 10) || 1,
            sides: parseInt(m[2], 10) || 4,
            mod: m[3] ? parseInt(m[3] + m[4], 10) : 0
        };
    }

    function rollFromString(notation) {
        var d = parseDice(notation);
        return rollDice(d.count, d.sides, d.mod);
    }

    /* ==================== HP STATUS ==================== */

    function hpStatusTag(currentHp, maxHp) {
        if (currentHp <= 0) return HP_STATUS.unconscious;
        var pct = currentHp / maxHp;
        if (pct >= HP_STATUS.healthy.minPct) return HP_STATUS.healthy;
        if (pct >= HP_STATUS.wounded.minPct) return HP_STATUS.wounded;
        if (pct >= HP_STATUS.bloodied.minPct) return HP_STATUS.bloodied;
        return HP_STATUS.critical;
    }

    function formatHpStatus(currentHp, maxHp) {
        var s = hpStatusTag(currentHp, maxHp);
        return s.icon + ' ' + s.label + ' (' + currentHp + '/' + maxHp + ' HP)';
    }

    /* ==================== COMBAT STATE ==================== */

    function createDefaultState() {
        return {
            schemaVersion: SCHEMA_VERSION,
            id: uid(),
            round: 0,
            turnIndex: 0,
            participants: [],
            log: [],
            isActive: false
        };
    }

    function getState() {
        var s = load();
        return s || createDefaultState();
    }

    /* ==================== PARTICIPANTS ==================== */

    /**
     * Aggiunge un combattente al registry.
     * @param {Object} opts
     * @param {string} opts.name - Nome del combattente
     * @param {number} opts.maxHp - HP massimi
     * @param {number} [opts.currentHp] - HP attuali (default = maxHp)
     * @param {number} [opts.ac] - Armor Class
     * @param {number} [opts.initiativeMod] - Modifier initiative
     * @param {number} [opts.initiative] - Initiative già tirata (auto-roll se omessa)
     * @param {string} [opts.side] - 'player' | 'enemy' | 'ally'
     * @param {string} [opts.type] - 'humanoid' | 'beast' | 'undead' | etc.
     * @param {Object} [opts.stats] - { str, dex, con, int, wis, cha }
     * @param {number} [opts.casterLevel] - Livello incantatore (0 = non caster)
     * @param {string} [opts.casterType] - 'full' | 'half' | 'warlock' | 'none'
     * @param {Array} [opts.spellsKnown] - Spell conosciute
     * @param {Array} [opts.resistances] - Danni resistenti
     * @param {Array} [opts.immunities] - Danni immuni
     * @param {Array} [opts.vulnerabilities] - Danni vulnerabili
     * @param {number} [opts.tempHp] - Temporary HP iniziali
     * @param {number} [opts.speed] - Speed in ft
     * @param {string} [opts.conditions] - Condizioni iniziali
     * @returns {Object} Il partecipante creato
     */
    function addParticipant(opts) {
        var state = getState();
        var name = cleanText(opts.name, 60);
        var maxHp = Math.max(1, parseInt(opts.maxHp, 10) || 1);
        var initMod = parseInt(opts.initiativeMod, 10) || 0;
        var initiative = opts.initiative != null
            ? parseInt(opts.initiative, 10)
            : rollDie(20) + initMod;

        // Spell slots
        var spellSlots = null;
        var casterLevel = parseInt(opts.casterLevel, 10) || 0;
        var casterType = opts.casterType || 'none';
        if (casterLevel > 0 && casterType !== 'none' && casterType !== 'warlock') {
            var levelIdx = Math.min(casterLevel, 20);
            var baseSlots = FULL_CASTER_SLOTS[levelIdx] || FULL_CASTER_SLOTS[20];
            if (casterType === 'half') {
                spellSlots = baseSlots.map(function (s, i) {
                    return i < 5 ? Math.max(0, Math.ceil(s / 2)) : 0;
                });
            } else {
                spellSlots = baseSlots.slice();
            }
        }

        var p = {
            id: uid(),
            name: name,
            side: opts.side || 'enemy',
            type: opts.type || 'humanoid',
            maxHp: maxHp,
            currentHp: opts.currentHp != null ? parseInt(opts.currentHp, 10) : maxHp,
            tempHp: parseInt(opts.tempHp, 10) || 0,
            ac: parseInt(opts.ac, 10) || 10,
            initiative: initiative,
            initiativeMod: initMod,
            speed: parseInt(opts.speed, 10) || 30,
            stats: opts.stats || {},
            casterLevel: casterLevel,
            casterType: casterType,
            spellSlots: spellSlots,
            spellsKnown: opts.spellsKnown || [],
            resistances: opts.resistances || [],
            immunities: opts.immunities || [],
            vulnerabilities: opts.vulnerabilities || [],
            conditions: opts.conditions || '',
            deathSaves: { successes: 0, failures: 0 },
            isConcentrating: false,
            concentrationSpell: null,
            isActive: true,
            hpStatus: hpStatusTag(opts.currentHp != null ? parseInt(opts.currentHp, 10) : maxHp, maxHp).label
        };

        state.participants.push(p);
        sortParticipants(state);
        save(state);
        return p;
    }

    function removeParticipant(id) {
        var state = getState();
        var idx = state.participants.findIndex(function (p) { return p.id === id; });
        if (idx === -1) return false;
        state.participants.splice(idx, 1);
        sortParticipants(state);
        save(state);
        return true;
    }

    function getParticipant(id) {
        var state = getState();
        return state.participants.find(function (p) { return p.id === id; }) || null;
    }

    function getParticipantByName(name) {
        var state = getState();
        var clean = cleanText(name, 60).toLowerCase();
        return state.participants.find(function (p) {
            return p.name.toLowerCase() === clean;
        }) || null;
    }

    function sortParticipants(state) {
        state.participants.sort(function (a, b) {
            if (b.initiative !== a.initiative) return b.initiative - a.initiative;
            // Tiebreaker: dex mod, poi nome
            var aDex = (a.stats && a.stats.dex) || 10;
            var bDex = (b.stats && b.stats.dex) || 10;
            if (bDex !== aDex) return bDex - aDex;
            return a.name.localeCompare(b.name);
        });
    }

    /* ==================== HP & DAMAGE ==================== */

    /**
     * Applica danno o guarigione a un partecipante.
     * @param {string} targetId - ID del bersaglio
     * @param {number} delta - Positivo = danno, negativo = guarigione
     * @param {string} [damageType] - 'slashing', 'fire', 'healing', etc.
     * @returns {Object} Risultato con HP aggiornati, status, death saves
     */
    function applyHpChange(targetId, delta, damageType) {
        var state = getState();
        var p = state.participants.find(function (x) { return x.id === targetId; });
        if (!p) return { success: false, error: 'Partecipante non trovato: ' + targetId };

        var isHealing = delta < 0 || damageType === 'healing';
        var actualDelta = delta;
        var damageAbsorbedByTemp = 0;

        if (!isHealing && damageType) {
            // Resistenze/immunità/vulnerabilità
            var dt = damageType.toLowerCase();
            if (p.immunities.some(function (t) { return t.toLowerCase() === dt; })) {
                actualDelta = 0;
            } else if (p.resistances.some(function (t) { return t.toLowerCase() === dt; })) {
                actualDelta = Math.ceil(actualDelta / 2);
            } else if (p.vulnerabilities.some(function (t) { return t.toLowerCase() === dt; })) {
                actualDelta = actualDelta * 2;
            }
        }

        if (isHealing) {
            // Guarigione: non supera maxHp
            var heal = -actualDelta;
            p.currentHp = Math.min(p.maxHp, p.currentHp + heal);
            // Guarigione ripristina da unconscious
            if (p.currentHp > 0) {
                p.deathSaves = { successes: 0, failures: 0 };
            }
        } else if (actualDelta > 0) {
            // Danno: prima temp HP
            if (p.tempHp > 0) {
                damageAbsorbedByTemp = Math.min(p.tempHp, actualDelta);
                p.tempHp -= damageAbsorbedByTemp;
                actualDelta -= damageAbsorbedByTemp;
            }
            if (actualDelta > 0) {
                p.currentHp -= actualDelta;
                if (p.currentHp < 0) p.currentHp = 0;
            }
            // Concentrazione interrotta se danno subito
            if (p.isConcentrating && actualDelta > 0) {
                // Non rimuoviamo automaticamente — il chiamante deve fare il save
                // ma lo segnaliamo
            }
        }

        // HP Status
        p.hpStatus = hpStatusTag(p.currentHp, p.maxHp).label;

        // Death saves se a 0 HP
        var deathSaveResult = null;
        if (p.currentHp === 0 && !isHealing) {
            if (actualDelta >= p.maxHp) {
                // Danno massiccio → morte istantanea
                p.isActive = false;
                deathSaveResult = { instantDeath: true };
            } else {
                deathSaveResult = { needsDeathSave: true, deathSaves: p.deathSaves };
            }
        }

        // Log
        var logEntry = {
            round: state.round,
            target: p.name,
            delta: delta,
            damageType: damageType || (isHealing ? 'healing' : 'untyped'),
            absorbedByTemp: damageAbsorbedByTemp,
            resultHp: p.currentHp,
            resultTempHp: p.tempHp,
            hpStatus: p.hpStatus
        };
        state.log.push(logEntry);
        if (state.log.length > 200) state.log = state.log.slice(-200);

        save(state);
        return {
            success: true,
            participant: p,
            damageDealt: isHealing ? 0 : (damageAbsorbedByTemp + Math.max(0, delta - damageAbsorbedByTemp)),
            healingDone: isHealing ? heal : 0,
            absorbedByTempHp: damageAbsorbedByTemp,
            hpStatus: p.hpStatus,
            hpStatusFormatted: formatHpStatus(p.currentHp, p.maxHp),
            deathSave: deathSaveResult
        };
    }

    /**
     * Applica temporary HP a un partecipante.
     * I temp HP non si accumulano: il valore più alto vince.
     */
    function applyTempHp(targetId, amount) {
        var state = getState();
        var p = state.participants.find(function (x) { return x.id === targetId; });
        if (!p) return { success: false, error: 'Partecipante non trovato' };
        var old = p.tempHp;
        p.tempHp = Math.max(p.tempHp, amount);
        save(state);
        return {
            success: true,
            participant: p,
            oldTempHp: old,
            newTempHp: p.tempHp,
            replaced: amount > old
        };
    }

    /* ==================== DEATH SAVES ==================== */

    function rollDeathSave(targetId) {
        var state = getState();
        var p = state.participants.find(function (x) { return x.id === targetId; });
        if (!p) return { success: false, error: 'Partecipante non trovato' };
        if (p.currentHp > 0) return { success: false, error: p.name + ' non è a 0 HP' };

        var roll = rollDie(20);
        var result = 'neutral';
        var mod = 0;

        // Modificatori da effetti attivi
        if (typeof globalThis.CronacheStatus === 'object') {
            var mods = globalThis.CronacheStatus.getEffectiveModifiers(p.name);
            mod = mods.modifiers.death_save || mods.modifiers.all_saves || 0;
        }

        if (roll === 20) {
            // Critical: ripristina 1 HP
            p.currentHp = 1;
            p.deathSaves = { successes: 0, failures: 0 };
            p.hpStatus = hpStatusTag(1, p.maxHp).label;
            result = 'critical_success';
        } else if (roll === 1) {
            p.deathSaves.failures += 2;
            result = 'critical_failure';
        } else if (roll + mod >= 10) {
            p.deathSaves.successes += 1;
            result = 'success';
        } else {
            p.deathSaves.failures += 1;
            result = 'failure';
        }

        var outcome = 'ongoing';
        if (p.deathSaves.successes >= 3) {
            p.currentHp = 1; // Stable
            p.hpStatus = hpStatusTag(1, p.maxHp).label;
            outcome = 'stabilized';
        } else if (p.deathSaves.failures >= 3) {
            p.isActive = false;
            outcome = 'dead';
        }

        save(state);
        return {
            success: true,
            roll: roll,
            modifier: mod,
            result: result,
            outcome: outcome,
            deathSaves: p.deathSaves,
            participant: p
        };
    }

    /* ==================== SPELL SLOTS ==================== */

    function expendSpellSlot(targetId, slotLevel) {
        var state = getState();
        var p = state.participants.find(function (x) { return x.id === targetId; });
        if (!p) return { success: false, error: 'Partecipante non trovato' };
        if (!p.spellSlots) return { success: false, error: p.name + ' non è un incantatore' };

        var idx = slotLevel - 1;
        if (idx < 0 || idx >= p.spellSlots.length) return { success: false, error: 'Livello slot non valido: ' + slotLevel };
        if (p.spellSlots[idx] <= 0) {
            var available = {};
            p.spellSlots.forEach(function (n, i) { if (n > 0) available[i + 1] = n; });
            return {
                success: false,
                error: 'Nessuno slot di livello ' + slotLevel + ' disponibile',
                availableSlots: available
            };
        }

        p.spellSlots[idx]--;
        save(state);
        return {
            success: true,
            participant: p,
            usedSlot: slotLevel,
            remainingSlots: p.spellSlots.map(function (n, i) { return { level: i + 1, remaining: n }; })
        };
    }

    function restoreSpellSlots(targetId) {
        var state = getState();
        var p = state.participants.find(function (x) { return x.id === targetId; });
        if (!p) return { success: false, error: 'Partecipante non trovato' };
        if (!p.spellSlots) return { success: false, error: p.name + ' non è un incantatore' };

        var levelIdx = Math.min(p.casterLevel, 20);
        var baseSlots = FULL_CASTER_SLOTS[levelIdx] || FULL_CASTER_SLOTS[20];
        if (p.casterType === 'half') {
            p.spellSlots = baseSlots.map(function (s, i) {
                return i < 5 ? Math.max(0, Math.ceil(s / 2)) : 0;
            });
        } else {
            p.spellSlots = baseSlots.slice();
        }
        save(state);
        return { success: true, participant: p, spellSlots: p.spellSlots };
    }

    /* ==================== CANTRIP SCALING ==================== */

    function cantripDiceCount(casterLevel) {
        var dice = 1;
        CANTRIP_TIERS.forEach(function (t) {
            if (casterLevel >= t.minLevel) dice = t.dice;
        });
        return dice;
    }

    /* ==================== COMBAT FLOW ==================== */

    function startCombat() {
        var state = getState();
        state.isActive = true;
        state.round = 1;
        state.turnIndex = 0;
        save(state);
        return state;
    }

    function nextTurn() {
        var state = getState();
        if (!state.isActive) return { success: false, error: 'Nessun combattimento attivo' };
        var active = state.participants.filter(function (p) { return p.isActive; });
        if (!active.length) return { success: false, error: 'Nessun partecipante attivo' };

        state.turnIndex++;
        if (state.turnIndex >= active.length) {
            state.turnIndex = 0;
            state.round++;
            // Tick duration effetti status alla fine del round
            if (typeof globalThis.CronacheStatus === 'object') {
                globalThis.CronacheStatus.tickDurations(1);
            }
        }
        save(state);

        var current = active[state.turnIndex];
        return {
            success: true,
            round: state.round,
            turnIndex: state.turnIndex,
            currentCombatant: current,
            initiativeOrder: active.map(function (p) {
                return { id: p.id, name: p.name, initiative: p.initiative, side: p.side };
            })
        };
    }

    function endCombat() {
        var state = getState();
        state.isActive = false;
        state.round = 0;
        state.turnIndex = 0;
        save(state);
        return { success: true };
    }

    function getCurrentCombatant() {
        var state = getState();
        if (!state.isActive) return null;
        var active = state.participants.filter(function (p) { return p.isActive; });
        return active[state.turnIndex] || null;
    }

    /* ==================== INITIATIVE ORDER ==================== */

    function getInitiativeOrder() {
        var state = getState();
        return state.participants
            .filter(function (p) { return p.isActive; })
            .map(function (p, i) {
                return {
                    position: i + 1,
                    id: p.id,
                    name: p.name,
                    initiative: p.initiative,
                    side: p.side,
                    hp: p.currentHp + '/' + p.maxHp,
                    hpStatus: p.hpStatus,
                    ac: p.ac,
                    isCurrent: state.isActive && i === state.turnIndex
                };
            });
    }

    /* ==================== MULTI-TARGET RESOLUTION ==================== */

    /**
     * Risolve un attacco multi-target (AoE).
     * @param {Array} targets - Array di target IDs
     * @param {Object} spellData - { damageDice, damageType, saveDC, saveType, halfOnSave }
     * @returns {Object} Risultato per ogni target
     */
    function resolveMultiTarget(targets, spellData) {
        var results = [];
        var saveType = spellData.saveType || 'dex';
        var saveDC = spellData.saveDC || 13;
        var halfOnSave = spellData.halfOnSave !== false;

        targets.forEach(function (targetId) {
            var p = getParticipant(targetId);
            if (!p) {
                results.push({ targetId: targetId, error: 'Non trovato' });
                return;
            }

            // Save bonus
            var saveMod = 0;
            if (p.stats && p.stats[saveType]) {
                saveMod = Math.floor((p.stats[saveType] - 10) / 2);
            }
            // Status effect modifiers
            if (typeof globalThis.CronacheStatus === 'object') {
                var mods = globalThis.CronacheStatus.getEffectiveModifiers(p.name);
                saveMod += mods.modifiers[saveType + '_save'] || mods.modifiers.all_saves || 0;
            }

            var saveRoll = rollDie(20) + saveMod;
            var saved = saveRoll >= saveDC;
            var damage = rollFromString(spellData.damageDice);
            var effectiveDamage = saved && halfOnSave ? Math.floor(damage / 2) : damage;

            var hpResult = applyHpChange(targetId, effectiveDamage, spellData.damageType);

            results.push({
                targetId: targetId,
                name: p.name,
                saveRoll: saveRoll,
                saveType: saveType,
                saveDC: saveDC,
                saved: saved,
                damage: effectiveDamage,
                halfDamage: saved && halfOnSave,
                hpResult: hpResult
            });
        });

        return { results: results, spellData: spellData };
    }

    /**
     * Risolve un attacco singolo (attack roll vs AC).
     * @param {string} attackerId
     * @param {string} targetId
     * @param {Object} opts - { attackBonus, damageDice, damageType, advantage, disadvantage }
     */
    function resolveAttack(attackerId, targetId, opts) {
        var attacker = getParticipant(attackerId);
        var target = getParticipant(targetId);
        if (!attacker || !target) return { success: false, error: 'Combattente non trovati' };

        var bonus = opts.attackBonus || 0;
        // Status effect modifiers
        if (typeof globalThis.CronacheStatus === 'object') {
            var atkMods = globalThis.CronacheStatus.getEffectiveModifiers(attacker.name);
            bonus += atkMods.modifiers.attack || atkMods.modifiers.all_attacks || 0;
        }

        var roll1 = rollDie(20);
        var roll2 = rollDie(20);
        var roll;
        if (opts.advantage) roll = Math.max(roll1, roll2);
        else if (opts.disadvantage) roll = Math.min(roll1, roll2);
        else roll = roll1;

        var isCrit = (roll === 20);
        var isFumble = (roll === 1);
        var total = roll + bonus;
        var hits = !isFumble && (isCrit || total >= target.ac);

        var damageResult = null;
        if (hits) {
            var baseDamage = rollFromString(opts.damageDice);
            var damage = isCrit ? baseDamage * 2 : baseDamage;
            damageResult = applyHpChange(targetId, damage, opts.damageType);
        }

        return {
            success: true,
            attacker: attacker.name,
            target: target.name,
            roll: roll,
            roll1: (opts.advantage || opts.disadvantage) ? roll1 : null,
            roll2: (opts.advantage || opts.disadvantage) ? roll2 : null,
            attackBonus: bonus,
            total: total,
            targetAC: target.ac,
            hit: hits,
            crit: isCrit,
            fumble: isFumble,
            damage: damageResult
        };
    }

    /* ==================== CONCENTRATION ==================== */

    function startConcentration(targetId, spellName) {
        var state = getState();
        var p = state.participants.find(function (x) { return x.id === targetId; });
        if (!p) return { success: false, error: 'Partecipante non trovato' };
        // Interrompi concentrazione precedente
        p.isConcentrating = true;
        p.concentrationSpell = cleanText(spellName, 60);
        save(state);
        return { success: true, participant: p };
    }

    function breakConcentration(targetId) {
        var state = getState();
        var p = state.participants.find(function (x) { return x.id === targetId; });
        if (!p) return { success: false, error: 'Partecipante non trovato' };
        var spell = p.concentrationSpell;
        p.isConcentrating = false;
        p.concentrationSpell = null;
        save(state);
        return { success: true, brokenSpell: spell };
    }

    /**
     * Constitution save per mantenere concentrazione dopo danno.
     * @param {string} targetId
     * @param {number} damage - Danno subito
     */
    function concentrationSave(targetId, damage) {
        var state = getState();
        var p = state.participants.find(function (x) { return x.id === targetId; });
        if (!p || !p.isConcentrating) return { success: false, error: 'Non in concentrazione' };

        var conMod = 0;
        if (p.stats && p.stats.con) {
            conMod = Math.floor((p.stats.con - 10) / 2);
        }
        var dc = Math.max(10, Math.floor(damage / 2));
        var roll = rollDie(20) + conMod;
        var maintained = roll >= dc;

        if (!maintained) {
            p.isConcentrating = false;
            p.concentrationSpell = null;
        }
        save(state);
        return {
            success: true,
            roll: roll,
            conMod: conMod,
            dc: dc,
            maintained: maintained,
            brokenSpell: maintained ? null : p.concentrationSpell
        };
    }

    /* ==================== LONG REST ==================== */

    function longRest(targetId) {
        var state = getState();
        var p = state.participants.find(function (x) { return x.id === targetId; });
        if (!p) return { success: false, error: 'Partecipante non trovato' };

        p.currentHp = p.maxHp;
        p.tempHp = 0;
        p.deathSaves = { successes: 0, failures: 0 };
        p.hpStatus = hpStatusTag(p.maxHp, p.maxHp).label;
        if (p.spellSlots) restoreSpellSlots(targetId);
        // Rimuovi tutti gli effetti di stato
        if (typeof globalThis.CronacheStatus === 'object') {
            globalThis.CronacheStatus.clearEffects(p.name);
        }
        save(state);
        return { success: true, participant: p };
    }

    /* ==================== SUMMARY ==================== */

    /**
     * Genera un riepilogo testuale del combattimento per il prompt LLM.
     */
    function combatSummary() {
        var state = getState();
        if (!state.isActive) return 'Nessun combattimento attivo.';

        var order = getInitiativeOrder();
        var lines = ['ROUND ' + state.round + ' — Turn ' + (state.turnIndex + 1) + '/' + order.length];
        order.forEach(function (entry) {
            var marker = entry.isCurrent ? '▶ ' : '  ';
            lines.push(marker + entry.name + ' (Init ' + entry.initiative + ', ' + entry.side + ') — HP: ' + entry.hp + ' ' + entry.hpStatus + ', AC ' + entry.ac);
        });

        // Effetti di stato attivi
        if (typeof globalThis.CronacheStatus === 'object') {
            var hasEffects = false;
            state.participants.forEach(function (p) {
                var desc = globalThis.CronacheStatus.describeActiveEffects(p.name);
                if (desc !== 'Nessun effetto attivo.') {
                    if (!hasEffects) { lines.push(''); lines.push('EFFETTI ATTIVI:'); hasEffects = true; }
                    lines.push('  ' + p.name + ': ' + desc);
                }
            });
        }

        return lines.join('\n');
    }

    /**
     * Riepilogo dettagliato di un singolo partecipante.
     */
    function participantSummary(id) {
        var p = getParticipant(id);
        if (!p) return 'Partecipante non trovato.';

        var lines = [
            p.name + ' (' + p.side + ', ' + p.type + ')',
            'HP: ' + formatHpStatus(p.currentHp, p.maxHp),
            'AC: ' + p.ac,
            'Initiative: ' + p.initiative + ' (mod ' + p.initiativeMod + ')',
            'Speed: ' + p.speed + ' ft'
        ];

        if (p.tempHp > 0) lines.push('Temp HP: ' + p.tempHp);
        if (p.casterLevel > 0) {
            lines.push('Caster: livello ' + p.casterLevel + ' (' + p.casterType + ')');
            if (p.spellSlots) {
                var slots = p.spellSlots.map(function (n, i) {
                    return n > 0 ? 'L' + (i + 1) + ':' + n : null;
                }).filter(Boolean);
                if (slots.length) lines.push('Slots: ' + slots.join(', '));
            }
            if (p.spellsKnown && p.spellsKnown.length) {
                lines.push('Spells: ' + p.spellsKnown.join(', '));
            }
        }
        if (p.resistances.length) lines.push('Resistenze: ' + p.resistances.join(', '));
        if (p.immunities.length) lines.push('Immunità: ' + p.immunities.join(', '));
        if (p.vulnerabilities.length) lines.push('Vulnerabilità: ' + p.vulnerabilities.join(', '));
        if (p.isConcentrating) lines.push('Concentrazione: ' + p.concentrationSpell);
        if (p.currentHp === 0) {
            lines.push('Death Saves: ✓' + p.deathSaves.successes + ' ✗' + p.deathSaves.failures);
        }

        // Status effects
        if (typeof globalThis.CronacheStatus === 'object') {
            var eff = globalThis.CronacheStatus.describeActiveEffects(p.name);
            if (eff !== 'Nessun effetto attivo.') lines.push('Effetti: ' + eff);
        }

        return lines.join('\n');
    }

    /* ==================== EXPORTS ==================== */

    return {
        SCHEMA_VERSION: SCHEMA_VERSION,
        STORAGE_KEY: STORAGE_KEY,
        HP_STATUS: HP_STATUS,
        CANTRIP_TIERS: CANTRIP_TIERS,
        FULL_CASTER_SLOTS: FULL_CASTER_SLOTS,
        // Utils
        rollDie: rollDie,
        rollDice: rollDice,
        rollD20: rollD20,
        parseDice: parseDice,
        rollFromString: rollFromString,
        hpStatusTag: hpStatusTag,
        formatHpStatus: formatHpStatus,
        cantripDiceCount: cantripDiceCount,
        // State
        getState: getState,
        startCombat: startCombat,
        endCombat: endCombat,
        clearState: clearState,
        // Participants
        addParticipant: addParticipant,
        removeParticipant: removeParticipant,
        getParticipant: getParticipant,
        getParticipantByName: getParticipantByName,
        getInitiativeOrder: getInitiativeOrder,
        getCurrentCombatant: getCurrentCombatant,
        // HP
        applyHpChange: applyHpChange,
        applyTempHp: applyTempHp,
        // Death saves
        rollDeathSave: rollDeathSave,
        // Spell slots
        expendSpellSlot: expendSpellSlot,
        restoreSpellSlots: restoreSpellSlots,
        // Combat flow
        nextTurn: nextTurn,
        // Resolution
        resolveAttack: resolveAttack,
        resolveMultiTarget: resolveMultiTarget,
        // Concentration
        startConcentration: startConcentration,
        breakConcentration: breakConcentration,
        concentrationSave: concentrationSave,
        // Rest
        longRest: longRest,
        // Summary
        combatSummary: combatSummary,
        participantSummary: participantSummary
    };
});