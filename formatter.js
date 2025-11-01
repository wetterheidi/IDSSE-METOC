// formatter.js
import { CONVERSIONS, UNITS } from './config.js';

/**
 * Holt den "unitMode" aus einem Profil, mit Fallback auf 'metric'.
 */
function getUnitMode(profile) {
    return (profile && profile.rules && profile.rules.unitMode) ? profile.rules.unitMode : 'metric';
}

/**
 * Formatiert einen Geschwindigkeitswert (Engine liefert km/h).
 */
export function formatSpeed(value_kmh, profile) {
    const mode = getUnitMode(profile);
    const unit = UNITS[mode].speed;
    let value = value_kmh;

    if (mode === 'aviation') {
        value = value_kmh * CONVERSIONS.KMH_TO_KTS;
    }
    
    return { value: value.toFixed(0), unit: unit }; // Runden auf 0 Nachkommastellen
}

/**
 * Formatiert einen Höhen/Sicht-Wert (Engine liefert Meter).
 */
export function formatAltitude(value_m, profile) {
    const mode = getUnitMode(profile);
    const unit = UNITS[mode].altitude;
    let value = value_m;

    if (mode === 'aviation') {
        value = value_m * CONVERSIONS.METER_TO_FEET;
        // Piloten runden oft auf die nächsten 100 Fuß
        value = Math.round(value / 100) * 100; 
    }
    
    return { value: value.toFixed(0), unit: unit };
}

/**
 * Formatiert Temperatur (Engine liefert °C).
 */
export function formatTemp(value_c, profile) {
    const mode = getUnitMode(profile);
    const unit = UNITS[mode].temp;
    // (Hier käme die °F Umrechnung hin, falls wir sie wollen)
    return { value: value_c.toFixed(1), unit: unit };
}

/**
 * Formatiert %-Werte (Niederschlag)
 */
export function formatPercent(value_perc, profile) {
     return { value: value_perc.toFixed(0), unit: '%' };
}