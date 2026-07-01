'use strict';

/**
 * Valenzetti θ-coefficient variants for calibration experiments.
 * 6-factor weights: [base_strength, attack_power, defensive_stability, match_context, human_factor, temporal_dynamics]
 */

const variants = {
    // Default (baseline)
    default: {
        name: 'default',
        theta: [0.12, 0.18, 0.16, 0.06, 0.08, 0.07],
        description: 'Default calibration',
    },
    // Conservative: больше вес на defense и context, меньше на attack
    conservative: {
        name: 'conservative',
        theta: [0.10, 0.15, 0.18, 0.05, 0.07, 0.05],
        description: 'Больше вес на defense (0.18) и context (0.05), снижены attack/temporal',
    },
    // Aggressive: больше вес на attack и base strength
    aggressive: {
        name: 'aggressive',
        theta: [0.15, 0.25, 0.10, 0.08, 0.10, 0.10],
        description: 'Больше вес на attack (0.25) и base strength (0.15), снижен defense',
    },
    // Temporal: акцент на динамику формы
    temporal: {
        name: 'temporal',
        theta: [0.08, 0.12, 0.12, 0.04, 0.06, 0.15],
        description: 'Больше вес на temporal dynamics (0.15), снижены остальные',
    },
};

module.exports = { variants };