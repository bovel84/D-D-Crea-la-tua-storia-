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

    return {
        MINUTES_PER_HOUR,
        MINUTES_PER_DAY,
        MINUTES_PER_WEEK,
        MINUTES_PER_MONTH,
        normalizeMinutes,
        parseTimeExpression,
        consumeMetabolism
    };
});
