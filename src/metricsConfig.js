// src/metricsConfig.js
// (Version 1.1: Erweitert um Chart-Optionen)

import * as formatter from './formatter.js';
import { WARN_FACTORS } from './config.js';

export const METRICS_CONFIG = {

    'wind': {
        // --- API & Daten ---
        apiName: 'wind_gusts_10m',
        ruleName: 'maxWind',
        summaryKey: 'wind',
        checkType: 'max',
        warnFactorKey: 'wind',
        // --- UI & Anzeige ---
        uiInputId: 'maxWind',
        uiUnitId: 'unit-maxWind',
        displayName: 'Windböe',
        formatter: formatter.formatSpeed,
        chartColor: '#dc3545', // Rot
        // --- NEU: Chart-Infos ---
        chartOptions: {
            axisId: 'yWind',
            axisPosition: 'left',
            axisLabel: 'Wind',
            type: 'line' // Linien-Diagramm
        }
    },

    'temp': {
        apiName: 'temperature_2m',
        ruleName: 'minTemp',
        summaryKey: 'temp',
        checkType: 'min',
        warnFactorKey: 'temp',
        uiInputId: 'minTemp',
        uiUnitId: 'unit-minTemp',
        displayName: 'Temperatur',
        formatter: formatter.formatTemp,
        chartColor: '#007bff', // Blau
        chartOptions: {
            axisId: 'yTemp',
            axisPosition: 'left',
            axisLabel: 'Temp.',
            type: 'line'
        }
    },

    'vis': {
        apiName: 'visibility',
        ruleName: 'minVis',
        summaryKey: 'vis',
        checkType: 'min',
        warnFactorKey: 'vis',
        uiInputId: 'minVis',
        uiUnitId: 'unit-minVis',
        displayName: 'Sichtweite',
        formatter: formatter.formatAltitude,
        chartColor: '#8B4513', // Braun
        chartOptions: {
            axisId: 'yAltitude',
            axisPosition: 'right',
            axisLabel: 'Sicht',
            type: 'line'
        }
    },

    'cloud': {
        apiName: 'cloud_cover_low',
        ruleName: 'maxCloudCover',
        summaryKey: 'cloud',
        checkType: 'max',
        warnFactorKey: 'cloud',
        uiInputId: 'maxCloudCover',
        uiUnitId: 'unit-maxCloudCover',
        displayName: 'Wolken (Tief)',
        formatter: formatter.formatPercent,
        chartColor: '#6c757d', // Grau
        chartOptions: {
            axisId: 'yPercent', // Teilt sich die Achse mit 'precip'
            axisPosition: 'right',
            axisLabel: 'Wolken/Niederschl.',
            type: 'line', // Als Fläche (fill: true)
            fill: true
        }
    },

    'precip': {
        // --- API & Daten ---
        apiName: 'precipitation',           // <-- 1. API-Name geändert
        ruleName: 'maxPrecip',              // <-- 2. Regel-Name geändert
        summaryKey: 'precip',
        checkType: 'max',
        warnFactorKey: 'precip',            // (Der 0.9 Faktor funktioniert auch für mm)

        // --- UI & Anzeige ---
        uiInputId: 'maxPrecip',             // <-- 3. ID für <input> geändert
        uiUnitId: 'unit-maxPrecip',         // <-- 4. ID für <span> geändert
        displayName: 'Niederschlagsmenge',  // <-- 5. Neuer Anzeigename
        formatter: formatter.formatPrecipMM,  // <-- 6. Neuer Formatter (mm statt %)
        chartColor: '#000080',

        // --- Chart-Infos ---
        chartOptions: {
            axisId: 'yPrecipMM',            // <-- 7. Eigene Y-Achse (nicht mehr 'yPercent')
            axisPosition: 'right',
            axisLabel: 'Niederschlag (mm)', // <-- 8. Neuer Achsen-Titel
            type: 'bar'
        }
    }
};

/**
 * Hilfsfunktion: Gibt alle API-Parameter als String zurück
 * (Unverändert)
 */
export const getApiParams = () => {
    const apiNames = new Set(Object.values(METRICS_CONFIG).map(m => m.apiName));
    return Array.from(apiNames).join(',');
};

/**
 * Hilfsfunktion: Gibt die Gelb-Warnfaktoren für eine Metrik zurück.
 * (Unverändert)
 */
export const getWarnFactor = (metric, warnFactors = WARN_FACTORS) => {
    const factor = warnFactors[metric.warnFactorKey];
    if (!factor) {
        console.warn(`Kein WARN_FACTOR für ${metric.warnFactorKey} gefunden.`);
        return (metric.checkType === 'max') ? 0.9 : 1.1;
    }
    return factor;
}