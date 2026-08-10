(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CronacheTimeEnergy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const MINUTES_PER_HOUR = 60;
    const MINUTES_PER_DAY = 1440;
    const MINUTES_PER_WEEK = 10080;
    const MINUTES_PER_MONTH = 43200;

    function normalizeMinutes(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return 0;
        return Math.max(0, Math.floor(parsed));
    }

    function parseTimeExpression(value) {
        const raw = String(value == null ? '' : value).trim().toLowerCase();
        if (!raw) return 0;
        if (/^\+?\d+$/.test(raw)) return normalizeMinutes(raw.replace('+', ''));

        const units = [
            { pattern: /(?<!\w)(\d+)\s*(?:mese|mesi|months?|mo)(?!\w)/g, multiplier: MINUTES_PER_MONTH },
            { pattern: /(?<!\w)(\d+)\s*(?:settimane?|weeks?|w)(?!\w)/g, multiplier: MINUTES_PER_WEEK },
            { pattern: /(?<!\w)(\d+)\s*(?:giorno|giorni|days?|d)(?!\w)/g, multiplier: MINUTES_PER_DAY },
            { pattern: /(?<!\w)(\d+)\s*(?:ore?|hours?|hrs?|hr|h)(?!\w)/g, multiplier: MINUTES_PER_HOUR },
            { pattern: /(?<!\w)(\d+)\s*(?:minuti?|mins?|min|m)(?!\w)/g, multiplier: 1 }
        ];
        let total = 0;
        units.forEach(({ pattern, multiplier }) => {
            let match;
            while ((match = pattern.exec(raw)) !== null) total += Number(match[1]) * multiplier;
        });
        return normalizeMinutes(total);
    }

    function consumeMetabolism(character, minutes, resting) {
        const elapsed = normalizeMinutes(minutes);
        const carry = { ...(character?._metabolismCarry || {}) };
        const staminaRate = resting ? 0 : 4;
        const hungerRate = resting ? 1.5 : 3;
        carry.stamina = Number(carry.stamina || 0) + (elapsed / MINUTES_PER_HOUR) * staminaRate;
        carry.hunger = Number(carry.hunger || 0) + (elapsed / MINUTES_PER_HOUR) * hungerRate;
        const staminaLoss = Math.floor(carry.stamina);
        const hungerLoss = Math.floor(carry.hunger);
        carry.stamina -= staminaLoss;
        carry.hunger -= hungerLoss;
        return { elapsed, carry, staminaLoss, hungerLoss };
    }

    function readPool(character, key) {
        const pool = character?.[key] || {};
        const max = Math.max(1, Number(pool.max) || 100);
        return { cur: Math.max(0, Number(pool.cur) || 0), max };
    }

    // Nei salti di almeno un giorno il gioco presume la normale vita quotidiana:
    // il protagonista dorme e mangia invece di restare sveglio e a digiuno per settimane.
    function simulateDailyRoutine(character, minutes) {
        const elapsed = normalizeMinutes(minutes);
        if (elapsed < MINUTES_PER_DAY || !character) return null;
        const days = elapsed / MINUTES_PER_DAY;
        const fullDays = Math.max(1, Math.floor(days));
        const stamina = readPool(character, 'stamina');
        const hunger = readPool(character, 'hunger');
        const health = readPool(character, 'health');
        const targetStamina = Math.round(stamina.max * 0.72);
        const targetHunger = Math.round(hunger.max * 0.68);
        const healed = Math.min(health.max - health.cur, Math.max(1, Math.floor(days * 1.5)));
        return {
            elapsed,
            days,
            nights: fullDays,
            meals: Math.max(3, Math.round(days * 3)),
            stamina: Math.min(stamina.max, Math.max(stamina.cur, targetStamina)),
            hunger: Math.min(hunger.max, Math.max(hunger.cur, targetHunger)),
            health: Math.min(health.max, health.cur + healed),
            healed
        };
    }

    function describePassage(minutes) {
        const elapsed = normalizeMinutes(minutes);
        const days = Math.floor(elapsed / MINUTES_PER_DAY);
        const hours = Math.floor((elapsed % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
        const mins = elapsed % MINUTES_PER_HOUR;
        const parts = [];
        if (days) parts.push(`${days} giorno${days === 1 ? '' : 'i'}`);
        if (hours) parts.push(`${hours} ora${hours === 1 ? '' : 'e'}`);
        if (mins && !days) parts.push(`${mins} minut${mins === 1 ? 'o' : 'i'}`);
        return parts.join(' e ') || '0 minuti';
    }

    return {
        MINUTES_PER_HOUR,
        MINUTES_PER_DAY,
        MINUTES_PER_WEEK,
        MINUTES_PER_MONTH,
        normalizeMinutes,
        parseTimeExpression,
        consumeMetabolism,
        simulateDailyRoutine,
        describePassage
    };
});
