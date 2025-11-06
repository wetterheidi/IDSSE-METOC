// src/metricsConfig.js
// (Version 1.1: Erweitert um Chart-Optionen)

import * as formatter from './formatter.js';
import { WEATHER_MODELS } from './config.js';

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

'cloudBase': {        
        // 1. Die Basis-Variablen, die wir brauchen
        apiName: [ 
            'cloud_cover', 
            'relative_humidity', 
            'geopotential_height'
        ],
        
        // 2. Die Druckstufen, die wir *anfragen* wollen
        //    (Wir fragen einfach alle an, die API liefert, was sie hat)
        pressureLevels: [ 
            1000, 975, 950, 925, 900, 875, 850, 825, 800, 
            775, 750, 725, 700, 650, 600, 550, 500, 475, 450,
            425, 400, 375, 350, 325, 300, 275, 250, 200
        ],

        paramType: 'derived_pressure', // <-- KORREKTER TYP
        ruleName: 'minCloudBase', 
        summaryKey: 'cloudBase',  
        checkType: 'min',         

        // --- UI & Anzeige ---
        uiUnitId: 'unit-minCloudBase',
        displayName: 'Wolkenuntergrenze',
        formatter: formatter.formatAltitude,
        chartColor: '#1abc9c',
        chartOptions: {
            axisId: 'yAltitude',
            axisPosition: 'right',
            axisLabel: 'Sicht/Wolkenbasis',
            type: 'line'
        }
    }

};

/**
 * Hilfsfunktion: Gibt alle API-Parameter als String zurück
 * (FINALE VERSION, die 'hourly_per_level' nutzt)
 */
export const getApiParams = (metrics, modelInfo) => {
    const groups = {
        hourly: new Set(),
        daily: new Set(),
        pressure: new Set() // (Wird nicht mehr an die URL übergeben, aber intern genutzt)
    };
    
    // 1. Bestimme die erlaubten Levels für das aktuelle Modell
    let allowedLevels = null;
    if (modelInfo && modelInfo.apiName !== 'auto') {
        const modelMetaId = WEATHER_MODELS.API_MAP[modelInfo.apiName];
        const modelProps = modelMetaId ? WEATHER_MODELS.MODEL_PROPERTIES[modelMetaId] : null;
        if (modelProps) {
            allowedLevels = new Set(modelProps.pressureLevels);
        }
    }

    for (const metric of metrics) {
        const apiNames = Array.isArray(metric.apiName) ? metric.apiName : [metric.apiName];

        for (const name of apiNames) {
            
            if (metric.paramType === 'hourly') {
                groups.hourly.add(name);
            } 
            else if (metric.paramType === 'daily') {
                groups.daily.add(name);
            } 
            else if (metric.paramType === 'derived') {
                groups.hourly.add(name);
            } 
            else if (metric.paramType === 'derived_pressure') {
                
                // (z.B. 'cloud_cover' - ist speziell, da es kein Druckstufen-Parameter ist)
                if (name === 'cloud_cover') {
                    groups.hourly.add(name);
                    continue; // Gehe zum nächsten apiName (z.B. 'relative_humidity')
                }

                // (z.B. 'relative_humidity')
                const requestedLevels = metric.pressureLevels || [];

                requestedLevels.forEach(level => {
                    // Füge das Level *nur* hinzu, wenn wir im "auto"-Modus sind
                    // ODER wenn das Modell dieses Level explizit erlaubt
                    if (!allowedLevels || allowedLevels.has(level)) {
                        // Baue den String, den die API will (z.B. "relative_humidity_900hPa")
                        groups.hourly.add(`${name}_${level}hPa`);
                    }
                });
            }
        }
    }

    return {
        hourly: Array.from(groups.hourly).join(','), // Enthält jetzt "param_900hPa" etc.
        daily: Array.from(groups.daily).join(','),
        pressure: '' // WICHTIG: Immer leer zurückgeben!
    };
};