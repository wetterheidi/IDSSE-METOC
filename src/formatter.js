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
    // NEU: Holt Einheit aus UNITS basierend auf dem Modus
    const unit = (mode === 'aviation') ? UNITS.aviation.speed : UNITS.metric.speed;

    if (value_kmh === null || !isFinite(value_kmh)) {
        return { value: 'N/A', unit: unit };
    }
    
    let value = value_kmh;
    if (mode === 'aviation') {
        value = value_kmh * CONVERSIONS.KMH_TO_KTS;
    }
    return { value: value.toFixed(0), unit: unit };
}

/**
 * Formatiert einen Höhen/Sicht-Wert (Engine liefert Meter).
 */
export function formatAltitude(value_m, profile) {
    const mode = getUnitMode(profile);
    const unit = (mode === 'aviation') ? UNITS.aviation.altitude : UNITS.metric.altitude;

    if (value_m === null || !isFinite(value_m)) {
        return { value: 'N/A', unit: unit };
    }
    
    let value = value_m;
    if (mode === 'aviation') {
        value = value_m * CONVERSIONS.METER_TO_FEET;
        // Runden auf die nächsten 100 Fuß (Standard in der Luftfahrt)
        value = Math.round(value / 100) * 100; 
    }
    return { value: value.toFixed(0), unit: unit };
}

/**
 * Formatiert Temperatur (Engine liefert °C).
 */
export function formatTemp(value_c, profile) {
    const mode = getUnitMode(profile);
    // Temperatur-Einheit ist in beiden Modi '°C'
    const unit = UNITS[mode].temp;

    if (value_c === null || !isFinite(value_c)) {
        return { value: 'N/A', unit: unit };
    }
    
    return { value: value_c.toFixed(1), unit: unit };
}

/**
 * Formatiert %-Werte (Niederschlagswahrscheinlichkeit, Wolken)
 */
export function formatPercent(value_perc, profile) {
    if (value_perc === null || !isFinite(value_perc)) {
        return { value: 'N/A', unit: '%' };
    }
     return { value: value_perc.toFixed(0), unit: '%' };
}

/**
 * NEU: Formatiert mm-Werte (Niederschlagsmenge)
 * (Wir fügen dies jetzt hinzu, damit es für den finalen Umbau bereit ist)
 */
export function formatPrecipMM(value_mm, profile) {
    if (value_mm === null || !isFinite(value_mm)) {
        return { value: 'N/A', unit: 'mm' };
    }
    // Zeigt eine Dezimalstelle an (z.B. 0.5 mm)
    return { value: value_mm.toFixed(1), unit: 'mm' };
}