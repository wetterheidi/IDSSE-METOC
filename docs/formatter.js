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
export function formatAltitude_FT(value_m, profile) {
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
 * Formatiert einen Höhenwert (Engine liefert Meter), BLEIBT ABER METRISCH.
 * (Für Sichtweite, Schneehöhe)
 */
export function formatAltitude_M(value_m, profile) {
    const mode = getUnitMode(profile);
    // NEU: Holt die Einheit, aber ignoriert Aviation-Umrechnung
    const unit = UNITS.metric.altitude; // <-- Bleibt immer 'm'

    if (value_m === null || !isFinite(value_m)) {
        return { value: 'N/A', unit: unit };
    }

    // Keine Umrechnung, nur Runden auf ganze Meter
    return { value: value_m.toFixed(0), unit: unit };
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

/**
 * NEU: Formatiert Wellenhöhe (Engine liefert Meter) mit Präzision.
 */
export function formatWaveHeight(value_m, profile) {
    const mode = getUnitMode(profile);
    // Holt die korrekte Einheit (m oder ft)
    const unit = (mode === 'aviation') ? UNITS.aviation.altitude : UNITS.metric.altitude;

    if (value_m === null || !isFinite(value_m)) {
        return { value: 'N/A', unit: unit };
    }
    
    let value = value_m;
    if (mode === 'aviation') {
        // Aviation-Modus: m -> ft, 1 Dezimalstelle (z.B. 5.8 ft)
        value = value_m * CONVERSIONS.METER_TO_FEET;
        return { value: value.toFixed(1), unit: unit };
    }
    
    // Metric-Modus: m, 1 Dezimalstelle (z.B. 1.8 m)
    return { value: value.toFixed(1), unit: unit };
}

// --- NEU: WMO Code-Definitionen ---
export const WMO_TAF_MAP = {
    0: 'NSW', // No Significant Weather
    1: 'NSW', // (Leicht bewölkt)
    2: 'NSW', // (Teilweise bewölkt)
    3: 'NSW', // (Stark bewölkt)
    45: 'FG',  // Nebel
    48: 'FZFG',// Gefrierender Nebel
    51: '-DZ', // Leichter Sprühregen
    53: 'DZ',  // Mäßiger Sprühregen
    55: '+DZ', // Starker Sprühregen
    56: '-FZDZ',// Leichter gefrierender Sprühregen
    57: 'FZDZ',// Mäßiger/Starker gefrierender Sprühregen
    61: '-RA', // Leichter Regen
    63: 'RA',  // Mäßiger Regen
    65: '+RA', // Starker Regen
    66: '-FZRA',// Leichter gefrierender Regen
    67: 'FZRA',// Mäßiger/Starker gefrierender Regen
    71: '-SN', // Leichter Schneefall
    73: 'SN',  // Mäßiger Schneefall
    75: '+SN', // Starker Schneefall
    77: 'SG',  // Griesel
    80: '-SHRA',// Leichte Regenschauer
    81: 'SHRA',// Mäßige Regenschauer
    82: '+SHRA',// Starke Regenschauer
    83: '-SHRASN',// Leichte Regen-/Schneeschauer
    85: '-SHSN',// Leichte Schneeschauer
    86: 'SHSN',// Mäßige/Starke Schneeschauer
    95: 'TS',  // Gewitter
    96: 'TSGR',// Gewitter mit Hagel
    99: '+TSGR'// Starkes Gewitter mit Hagel
};

/**
 * NEU: Formatiert einen WMO-Code in einen TAF-String.
 */
export function formatSigWx(value_code, profile) {
    const codeNum = parseInt(value_code, 10);
    if (isNaN(codeNum)) {
        return { value: 'N/A', unit: '' };
    }
    const tafCode = WMO_TAF_MAP[codeNum] || 'N/A';
    return { value: tafCode, unit: ` (${codeNum})` };
}