// docs/formatter.js

// -----------------------------------------------------------
// 1. IMPORTS & INTERNE HELFER
// -----------------------------------------------------------
import { CONVERSIONS, UNITS } from './config.js'; //

/**
 * Holt den "unitMode" aus einem Profil, mit Fallback auf 'metric'.
 */
function getUnitMode(profile) {
    return (profile && profile.rules && profile.rules.unitMode) ? profile.rules.unitMode : 'metric'; //
}


// -----------------------------------------------------------
// 2. FORMATTER FUNKTIONEN (Geschwindigkeit & Temperatur)
// -----------------------------------------------------------

/**
 * Formatiert einen Geschwindigkeitswert (Engine liefert km/h).
 */
export function formatSpeed(value_kmh, profile) {
    const mode = getUnitMode(profile); //
    const unit = (mode === 'aviation') ? UNITS.aviation.speed : UNITS.metric.speed; //

    if (value_kmh === null || !isFinite(value_kmh)) { //
        return { value: 'N/A', unit: unit }; //
    }
    
    let value = value_kmh; //
    if (mode === 'aviation') { //
        value = value_kmh * CONVERSIONS.KMH_TO_KTS; //
    }
    return { value: value.toFixed(0), unit: unit }; //
}

/**
 * Formatiert Temperatur (Engine liefert °C).
 */
export function formatTemp(value_c, profile) {
    const mode = getUnitMode(profile); //
    const unit = UNITS[mode].temp; // Temperatur-Einheit ist in beiden Modi '°C'

    if (value_c === null || !isFinite(value_c)) { //
        return { value: 'N/A', unit: unit }; //
    }
    
    return { value: value_c.toFixed(1), unit: unit }; //
}


// -----------------------------------------------------------
// 3. FORMATTER FUNKTIONEN (Höhe, Sicht & Wellen)
// -----------------------------------------------------------

/**
 * Formatiert einen Höhen/Sicht-Wert (Engine liefert Meter) in Fuß (ft).
 */
export function formatAltitude_FT(value_m, profile) {
    const mode = getUnitMode(profile); //
    const unit = (mode === 'aviation') ? UNITS.aviation.altitude : UNITS.metric.altitude; //

    if (value_m === null || !isFinite(value_m)) { //
        return { value: 'N/A', unit: unit }; //
    }
    
    let value = value_m; //
    if (mode === 'aviation') { //
        value = value_m * CONVERSIONS.METER_TO_FEET; //
        // Runden auf die nächsten 100 Fuß (Standard in der Luftfahrt)
        value = Math.round(value / 100) * 100; //
    }
    return { value: value.toFixed(0), unit: unit }; //
}

/**
 * Formatiert einen Höhenwert (Engine liefert Meter), BLEIBT ABER METRISCH.
 * (Für Sichtweite, Schneehöhe)
 */
export function formatAltitude_M(value_m, profile) {
    const unit = UNITS.metric.altitude; // Bleibt immer 'm'

    if (value_m === null || !isFinite(value_m)) { //
        return { value: 'N/A', unit: unit }; //
    }

    // Keine Umrechnung, nur Runden auf ganze Meter
    return { value: value_m.toFixed(0), unit: unit }; //
}

/**
 * Formatiert Wellenhöhe (Engine liefert Meter) mit Präzision.
 */
export function formatWaveHeight(value_m, profile) {
    const mode = getUnitMode(profile); //
    const unit = (mode === 'aviation') ? UNITS.aviation.altitude : UNITS.metric.altitude; // Holt die korrekte Einheit (m oder ft)

    if (value_m === null || !isFinite(value_m)) { //
        return { value: 'N/A', unit: unit }; //
    }
    
    let value = value_m; //
    if (mode === 'aviation') { //
        // Aviation-Modus: m -> ft, 1 Dezimalstelle (z.B. 5.8 ft)
        value = value_m * CONVERSIONS.METER_TO_FEET; //
        return { value: value.toFixed(1), unit: unit }; //
    }
    
    // Metric-Modus: m, 1 Dezimalstelle (z.B. 1.8 m)
    return { value: value.toFixed(1), unit: unit }; //
}


// -----------------------------------------------------------
// 4. FORMATTER FUNKTIONEN (Prozent & Niederschlag)
// -----------------------------------------------------------

/**
 * Formatiert %-Werte (Niederschlagswahrscheinlichkeit, Wolken).
 */
export function formatPercent(value_perc, profile) {
    if (value_perc === null || !isFinite(value_perc)) { //
        return { value: 'N/A', unit: '%' }; //
    }
     return { value: value_perc.toFixed(0), unit: '%' }; //
}

/**
 * Formatiert mm-Werte (Niederschlagsmenge).
 */
export function formatPrecipMM(value_mm, profile) {
    if (value_mm === null || !isFinite(value_mm)) { //
        return { value: 'N/A', unit: 'mm' }; //
    }
    // Zeigt eine Dezimalstelle an (z.B. 0.5 mm)
    return { value: value_mm.toFixed(1), unit: 'mm' }; //
}


// -----------------------------------------------------------
// 5. WOLKEN (Achtel) HELFER & FORMATTER
// -----------------------------------------------------------

/**
 * Konvertiert einen Prozentwert (0-100) in Achtel (0-8).
 */
export function percentToOktas(value_perc) {
    if (value_perc === null || !isFinite(value_perc)) { //
        return null; //
    }
    // 100% / 8 = 12.5% pro Achtel
    return Math.round(value_perc / 12.5); //
}

/**
 * Konvertiert einen Achtel-Wert (0-8) zurück in Prozent (0-100).
 */
export function oktasToPercent(value_oktas) {
    if (value_oktas === null || !isFinite(value_oktas)) { //
        return null; //
    }
    return value_oktas * 12.5; //
}

/**
 * Formatter-Funktion für die Graphen und Tabellen (Achtel-Anzeige).
 */
export function formatOktas(value_perc, profile) {
    const value_oktas = percentToOktas(value_perc); //

    if (value_oktas === null) { //
        return { value: 'N/A', unit: 'Achtel' }; //
    }
    return { value: value_oktas.toFixed(0), unit: 'Achtel' }; //
}


// -----------------------------------------------------------
// 6. WMO CODE KONSTANTEN & FORMATTER
// -----------------------------------------------------------

// WMO Code-Definitionen für TAF/METAR-Ausgabe
export const WMO_TAF_MAP = {
    0: 'NSW', 
    1: 'NSW', 
    2: 'NSW', 
    3: 'NSW', 
    45: 'FG',  
    48: 'FZFG',
    51: '-DZ', 
    53: 'DZ',  
    55: '+DZ', 
    56: '-FZDZ',
    57: 'FZDZ',
    61: '-RA', 
    63: 'RA',  
    65: '+RA', 
    66: '-FZRA',
    67: 'FZRA',
    71: '-SN', 
    73: 'SN',  
    75: '+SN', 
    77: 'SG',  
    80: '-SHRA',
    81: 'SHRA',
    82: '+SHRA',
    83: '-SHRASN',
    85: '-SHSN',
    86: 'SHSN',
    95: 'TS',  
    96: 'TSGR',
    99: '+TSGR'
}; //

/**
 * Formatiert einen WMO-Code in einen TAF-String.
 */
export function formatSigWx(value_code, profile) {
    const codeNum = parseInt(value_code, 10); //
    if (isNaN(codeNum)) { //
        return { value: 'N/A', unit: '' }; //
    }
    const tafCode = WMO_TAF_MAP[codeNum] || 'N/A'; //
    return { value: tafCode, unit: ` (${codeNum})` }; //
}


// -----------------------------------------------------------
// 7. KONVERTIERUNGS HELFER (Speichern & Laden)
// -----------------------------------------------------------

/**
 * Konvertiert einen "Display"-Wert (z.B. 12 kt) in den "Engine"-Wert (z.B. 22.2 km/h).
 * (Wird VOR dem Speichern genutzt)
 */
export function toMetric(displayValue, metricConfig, unitMode) {
    if (displayValue === null || isNaN(displayValue) || unitMode === 'metric') { //
        return displayValue; // Ist schon metrisch oder null
    }

    // (Aviation Mode)
    if (metricConfig.formatter === formatSpeed) { //
        return displayValue / CONVERSIONS.KMH_TO_KTS; // Von kt -> km/h
    }
    if (metricConfig.formatter === formatOktas) { //
        return oktasToPercent(displayValue); // Konvertiere Achtel (z.B. 4) in Prozent (z.B. 50)
    }

    if (metricConfig.formatter === formatAltitude_FT || 
        metricConfig.formatter === formatWaveHeight) 
    { //
        return displayValue / CONVERSIONS.METER_TO_FEET; // Von ft -> m
    }

    return displayValue; // (z.B. Temp, Percent)
}

/**
 * Konvertiert einen "Engine"-Wert (z.B. 22.2 km/h) in den "Display"-Wert (z.B. 12 kt).
 * (Wird VOR dem Anzeigen genutzt)
 */
export function fromMetric(metricValue, metricConfig, unitMode) {
    if (metricValue === null || isNaN(metricValue) || unitMode === 'metric') { //
        return metricValue; // Ist schon metrisch oder null
    }

    // (Aviation Mode)
    if (metricConfig.formatter === formatSpeed) { //
        const val = metricValue * CONVERSIONS.KMH_TO_KTS; // Von km/h -> kt
        return Math.round(val); //
    }
    if (metricConfig.formatter === formatOktas) { //
        return percentToOktas(metricValue); // Konvertiere Prozent (z.B. 50) in Achtel (z.B. 4)
    }

    // Fall 1: Wolkenuntergrenze (m -> ft, runden auf 100)
    if (metricConfig.formatter === formatAltitude_FT) { //
        const val = metricValue * CONVERSIONS.METER_TO_FEET; //
        return Math.round(val / 100) * 100; // Rundet auf die nächsten 100ft
    }
    
    // Fall 2: Wellenhöhe (m -> ft, runden auf 0.1)
    if (metricConfig.formatter === formatWaveHeight) { //
        const val = metricValue * CONVERSIONS.METER_TO_FEET; //
        return Math.round(val * 10) / 10; // Rundet auf eine Dezimalstelle
    }

    return metricValue; // (z.B. Temp, Percent)
}