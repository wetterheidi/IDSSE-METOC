// src/metricsConfig.js
// (Version 1.1: Erweitert um Chart-Optionen)

import * as formatter from './formatter.js';

export const METRICS_CONFIG = {

    'wind': {
        // --- API & Daten ---
        apiName: 'wind_gusts_10m',
        ruleName: 'maxWind',
        paramType: 'hourly',
        summaryKey: 'wind',
        checkType: 'max',
        // --- UI & Anzeige ---
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

    'wind_speed': {
        // --- API & Daten ---
        apiName: 'wind_speed_10m',      // Der API-Name, den Sie angefragt haben
        ruleName: 'maxWindSpeed',       // Der Schlüssel für die Regeln (in DB/Profil)
        paramType: 'hourly',
        summaryKey: 'windSpeed',        // Der Schlüssel für das Summary-Objekt
        checkType: 'max',               // Wir prüfen auf ein Maximum

        // --- UI & Anzeige ---
        uiUnitId: 'unit-maxWindSpeed',  // ID für das <span> (Einheit)
        displayName: 'Wind (Mittel)',   // Name für UI-Label
        formatter: formatter.formatSpeed, // Wir nutzen denselben Formatter wie für Böen
        chartColor: '#E67E22', // Ein dunkles Orange, um es von Rot zu unterscheiden

        // --- Chart-Infos ---
        chartOptions: {
            axisId: 'yWind',            // Nutzt dieselbe Y-Achse wie die Böen
            axisPosition: 'left',
            axisLabel: 'Wind',
            type: 'line'
        }
    },

    'temp': {
        apiName: 'temperature_2m',
        ruleName: 'minTemp',
        paramType: 'hourly',
        summaryKey: 'temp',
        checkType: 'min',
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
        paramType: 'hourly',
        summaryKey: 'vis',
        checkType: 'min',
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
        paramType: 'hourly',
        summaryKey: 'cloud',
        checkType: 'max',
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
        paramType: 'hourly',
        summaryKey: 'precip',
        checkType: 'max',

        // --- UI & Anzeige ---
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
    },

    'snow': {
        // --- API & Daten ---
        apiName: 'snow_depth',              // API-Name
        ruleName: 'maxSnowDepth',           // Regel-Name (für DB)
        paramType: 'hourly',
        summaryKey: 'snow',                 // Interner Schlüssel
        checkType: 'max',                   // Wir prüfen auf eine maximale Höhe

        // --- UI & Anzeige ---
        uiUnitId: 'unit-maxSnowDepth',      // ID für das <span> (Einheit)
        displayName: 'Schneehöhe',          // Name für UI-Label
        formatter: formatter.formatAltitude,  // WICHTIG: Wiederverwendung des m/ft-Formatters
        chartColor: '#17a2b8', // Info-Blau / Cyan

        // --- Chart-Infos ---
        chartOptions: {
            axisId: 'ySnow',                // Eigene Y-Achse
            axisPosition: 'right',
            axisLabel: 'Schneehöhe',
            type: 'line',
            fill: true // Als Flächendiagramm (wie Wolken)
        }
    },
    'windchill': {
        // --- API & Daten ---
        apiName: ['temperature_2m', 'wind_speed_10m'], // <-- Array der Abhängigkeiten
        paramType: 'derived',               // <-- NEUER TYP
        ruleName: 'minWindchill',           // Regel-Name (für DB)
        summaryKey: 'windchill',            // Interner Schlüssel
        checkType: 'min',                   // Wir prüfen auf eine minimale Temp.

        // --- UI & Anzeige ---
        uiUnitId: 'unit-minWindchill',      // ID für das <span> (Einheit)
        displayName: 'Gefühlte Temp.',      // Name für UI-Label
        formatter: formatter.formatTemp,    // Nutzt den normalen Temperatur-Formatter
        chartColor: '#9b59b6', // Ein Violett

        // --- Chart-Infos ---
        chartOptions: {
            axisId: 'yTemp',                // Nutzt dieselbe Y-Achse wie Temp.
            axisPosition: 'left',
            axisLabel: 'Temp.',
            type: 'line'
        }
    },

};

/**
 * Hilfsfunktion: Gibt alle API-Parameter als String zurück
 * (Unverändert)
 */
export const getApiParams = (metrics) => {
    const groups = {
        hourly: new Set(),
        daily: new Set(),
    };

    for (const metric of metrics) {

        if (metric.paramType === 'hourly') {
            groups.hourly.add(metric.apiName);

        } else if (metric.paramType === 'daily') {
            groups.daily.add(metric.apiName);

        } else if (metric.paramType === 'derived') {
            // NEU: Füge alle Abhängigkeiten zur 'hourly'-Liste hinzu
            if (Array.isArray(metric.apiName)) {
                metric.apiName.forEach(dep => groups.hourly.add(dep));
            }
        }
    }

    return {
        hourly: Array.from(groups.hourly).join(','),
        daily: Array.from(groups.daily).join(',')
    };
};