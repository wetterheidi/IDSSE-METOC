// docs/metricsConfig.js
// (Version 1.1: Erweitert um Chart-Optionen)

// -----------------------------------------------------------
// 1. IMPORTS
// -----------------------------------------------------------

import { WEATHER_MODELS } from './config.js';
import * as formatter from './formatter.js';
import { WMO_TAF_MAP, formatAltitude_FT, formatAltitude_M, formatOktas, formatSigWx, formatWaveHeight } from './formatter.js';


// -----------------------------------------------------------
// 2. ZENTRALE METRIK-KONFIGURATION
// -----------------------------------------------------------

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
        formatter: formatAltitude_M,
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

        // --- ÄNDERUNG 1: Neuer Formatter ---
        formatter: formatOktas, // ALT: formatter.formatPercent

        chartColor: '#6c757d', // Grau

        // --- ÄNDERUNG 2: Eigene Achse für Achtel ---
        chartOptions: {
            axisId: 'yOktas', // ALT: 'yPercent'. Wichtig, damit sie nicht mehr 0-100 skaliert
            axisPosition: 'right',
            axisLabel: 'Wolken (Achtel)', // ALT: 'Wolken/Niederschl.'
            type: 'line',
            fill: true
            // min: 0, max: 8 (Das setzen wir in charts.js)
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
        formatter: formatAltitude_M,  // WICHTIG: Wiederverwendung des m/ft-Formatters
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
        displayName: 'Windchill Temp.',      // Name für UI-Label
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

    'apparentTemp': {
        // --- API & Daten ---
        apiName: 'apparent_temperature', // Der direkte API-Parameter
        paramType: 'hourly',             // Einfacher stündlicher Wert
        ruleName: 'apparentTemp',        // Neuer, eindeutiger Regel-Name
        summaryKey: 'apparentTemp',      // Neuer, eindeutiger Summary-Schlüssel
        checkType: 'min',                // Standard (kann in der UI geändert werden)
        
        // --- UI & Anzeige ---
        uiUnitId: 'unit-apparentTemp',
        displayName: 'Gefühlte Temp. (Hitze/Kälte)', // Neuer Name
        formatter: formatter.formatTemp,   // Nutzt denselben Temperatur-Formatter
        chartColor: '#E91E63', // Ein kräftiges Pink zur Unterscheidung
        
        // --- Chart-Infos ---
        chartOptions: {
            axisId: 'yTemp',                 // Nutzt dieselbe Y-Achse
            axisPosition: 'left',
            axisLabel: 'Temp.',
            type: 'line'
        }
    },

    'cloudBase': {
        // 1. Die Basis-Variablen, die wir brauchen
        apiName: [
            // 1. Parameter für Druckstufen
            'relative_humidity',
            'geopotential_height',
            'temperature',              // Benötigt von analyzeCloudLayers
            'cloud_cover',              // Benötigt von interpolateWeatherData
            'wind_speed',               // Benötigt von interpolateWeatherData
            'wind_direction',           // Benötigt von interpolateWeatherData

            // 2. Oberflächen-Parameter (Abhängigkeiten)
            'surface_pressure',         // Benötigt von interpolateWeatherData
            'wind_speed_10m',           // Benötigt von interpolateWeatherData
            'wind_direction_10m',       // Benötigt von interpolateWeatherData
            'temperature_2m',           // Benötigt von analyzeCloudLayers
            'relative_humidity_2m'      // Benötigt von interpolateWeatherData
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
        formatter: formatAltitude_FT,
        chartColor: '#1abc9c',
        chartOptions: {
            axisId: 'yCloudBase',
            axisPosition: 'right',
            axisLabel: 'Wolkenbasis',
            type: 'line'
        }
    },

    'cloudCeiling': {
        // Ceiling: niedrigste BKN (5-7 Achtel) oder OVC (8 Achtel) Schicht.
        // Relevant für IFR-Beurteilung. Unabhängige Grenzwerte von cloudBase.
        apiName: [
            // Druckstufen-Parameter (identisch zu cloudBase – werden ohnehin gemeinsam abgefragt)
            'relative_humidity',
            'geopotential_height',
            'temperature',
            'cloud_cover',
            'wind_speed',
            'wind_direction',
            // Oberflächen-Parameter
            'surface_pressure',
            'wind_speed_10m',
            'wind_direction_10m',
            'temperature_2m',
            'relative_humidity_2m'
        ],

        pressureLevels: [
            1000, 975, 950, 925, 900, 875, 850, 825, 800,
            775, 750, 725, 700, 650, 600, 550, 500, 475, 450,
            425, 400, 375, 350, 325, 300, 275, 250, 200
        ],

        paramType: 'derived_pressure',
        ruleName: 'minCloudCeiling',
        summaryKey: 'cloudCeiling',
        checkType: 'min',

        // --- UI & Anzeige ---
        uiUnitId: 'unit-minCloudCeiling',
        displayName: 'Ceiling (BKN/OVC)',
        formatter: formatAltitude_FT,  // Gleicher Formatter wie cloudBase (m oder ft)
        chartColor: '#e67e22',         // Orange – unterscheidbar von cloudBase (Türkis)
        chartOptions: {
            axisId: 'yCloudBase',      // Gleiche Y-Achse wie cloudBase (beide in Höhe)
            axisPosition: 'right',
            axisLabel: 'Wolkenbasis',
            type: 'line'
        }
    },

    'sigWx': {
        // --- API & Daten ---
        apiName: 'weather_code',
        ruleName: 'sigWx',
        paramType: 'hourly',
        summaryKey: 'sigWx',
        // --- NEUER CHECK-TYP ---
        checkType: 'code_match',    // Weder 'min' noch 'max'

        // --- UI & Anzeige ---
        uiUnitId: 'unit-sigWx',     // (Wird für das <select> nicht benötigt, aber der Vollständigkeit halber)
        displayName: 'Signifikantes Wetter',
        formatter: formatter.formatSigWx,
        chartColor: '#9932CC', // Dunkles Violett

        // --- NEU: Optionen für das Dropdown ---
        options: WMO_TAF_MAP,

        chartOptions: {
            axisId: 'ySigWx', // Eigene (unsichtbare) Y-Achse
            axisPosition: 'right',
            axisLabel: 'SigWx',
            type: 'scatter' // Wir tun so, als wären es Punkte
        }
    },
    'waveHeight': {
        // --- API & Daten ---
        apiName: 'wave_height',
        ruleName: 'maxWaveHeight',
        paramType: 'marine_hourly', // <-- NEUER TYP, um es von 'hourly' zu unterscheiden
        summaryKey: 'waveHeight',
        checkType: 'max',
        apiModel: 'ecmwf_wam025', // <-- Dein Wunschmodell

        // --- UI & Anzeige ---
        uiUnitId: 'unit-maxWaveHeight',
        displayName: 'Wellenhöhe (See)',
        formatter: formatWaveHeight, // NEUER m/ft Formatter mit Präzision
        chartColor: '#20c997', // Ein Türkis/Teal

        chartOptions: {
            axisId: 'yWave', // Eigene Achse
            axisPosition: 'right',
            axisLabel: 'Wellenhöhe',
            type: 'line',
            fill: true
        }
    },


    'seaSurfaceTemp': {
        // --- API & Daten ---
        apiName: 'soil_temperature_0cm', // Wie von dir identifiziert
        ruleName: 'seaTemp',             // Für die Regeln (seaTemp_alarm, seaTemp_warn)
        paramType: 'hourly',             // Kommt von der Standard 'forecast' API
        summaryKey: 'seaTemp',           // Interner Schlüssel für das Summary-Objekt
        checkType: 'min',                // Standard-Prüftyp (kann durch UI überschrieben werden)

        // --- DIE NEUE STEUERUNGS-EIGENSCHAFT ---
        maritimeOnly: true,              // Zeigt an: 1. UI nur bei Seegebiet 2. Engine filtert Landpunkte
        forecastModel: 'icon_seamless',  // Erzwingt dieses Modell für diesen Parameter

        // --- UI & Anzeige ---
        uiUnitId: 'unit-seaTemp',
        displayName: 'Wassertemperatur',
        formatter: formatter.formatTemp, // Wir nutzen denselben Formatter wie für Luft
        chartColor: '#0047AB', // Ein tiefes Blau (Kobaltblau)

        // --- Chart-Infos ---
        chartOptions: {
            axisId: 'yTemp',                 // Nutzt dieselbe Y-Achse wie die Lufttemperatur
            axisPosition: 'left',
            axisLabel: 'Temp.',
            type: 'line'
        }
    },
};

// -----------------------------------------------------------
// 3. EXPORTIERTE LOGIK & HELPER FUNKTIONEN
// -----------------------------------------------------------


/**
 * Gibt alle API-Parameter als String-Objekt zurück.
 */
export const getApiParams = (metrics, modelInfo) => {
    // Tausche die 'groups'-Struktur gegen ein aufgeteiltes Objekt aus
    const params = {
        forecast: { hourly: new Set(), daily: new Set(), pressure: new Set(), models: new Set(), forcedModel: new Map() },
        marine: { hourly: new Set(), models: new Set() }
    };

    // Parameter einer Metrik mit erzwungenem Modell (metric.forecastModel, z.B.
    // seaSurfaceTemp -> immer icon_seamless) gehen NICHT in die gemeinsame
    // forecast.hourly-Menge, sondern in einen eigenen Eimer je Modell. Grund:
    // Open-Meteo haengt bei MEHREREN Modellen in einem Request (models=a,b) an
    // JEDES Feld ein Modell-Suffix an (z.B. soil_temperature_0cm_icon_seamless)
    // -- der unsuffixierte Zugriff in weather.js (hourly[apiName]) faende dann
    // nichts mehr, sobald das Profil ein ANDERES Hauptmodell nutzt als das
    // erzwungene. Ein eigener Single-Model-Request pro erzwungenem Modell
    // (siehe weather.js _fetchRawData) vermeidet die Suffixierung komplett.
    const addForced = (model, name) => {
        if (!params.forecast.forcedModel.has(model)) params.forecast.forcedModel.set(model, new Set());
        params.forecast.forcedModel.get(model).add(name);
    };

    // 1. Bestimme die erlaubten Levels für das aktuelle Modell (unverändert)
    let allowedLevels = null;
    if (modelInfo && modelInfo.apiName !== 'auto') {
        const modelMetaId = WEATHER_MODELS.API_MAP[modelInfo.apiName];
        const modelProps = modelMetaId ? WEATHER_MODELS.MODEL_PROPERTIES[modelMetaId] : null;
        if (modelProps && modelProps.pressureLevels) {
            allowedLevels = new Set(modelProps.pressureLevels);
        }
    }

    // Setze das Haupt-Forecast-Modell
    params.forecast.models.add(modelInfo ? modelInfo.apiName : 'auto');

    for (const metric of metrics) {
        const apiNames = Array.isArray(metric.apiName) ? metric.apiName : [metric.apiName];

        for (const name of apiNames) {

            // --- NEUE AUFTEILUNGS-LOGIK ---

            if (metric.paramType === 'marine_hourly') {
                // Dies ist ein MARINER Parameter
                params.marine.hourly.add(name);
                if (metric.apiModel) {
                    params.marine.models.add(metric.apiModel); // Füge das spezifische Marine-Modell hinzu
                }

            } else if (metric.paramType === 'derived_pressure') {
                // Dies ist ein FORECAST-Parameter (Druckstufen)
                if (name.includes('_2m') || name.includes('_10m') || name.includes('surface_')) {
                    if (metric.forecastModel) addForced(metric.forecastModel, name);
                    else params.forecast.hourly.add(name);
                } else {
                    const requestedLevels = metric.pressureLevels || [];
                    const validLevels = (modelInfo && modelInfo.apiName !== 'auto' && allowedLevels)
                        ? requestedLevels.filter(lvl => allowedLevels.has(lvl))
                        : requestedLevels;
                    validLevels.forEach(level => {
                        const paramName = `${name}_${level}hPa`;
                        if (metric.forecastModel) addForced(metric.forecastModel, paramName);
                        else params.forecast.hourly.add(paramName);
                    });
                }
            } else {
                // Dies ist ein Standard-FORECAST-Parameter (hourly, daily, derived)
                if (metric.forecastModel) {
                    addForced(metric.forecastModel, name);
                    if (name === 'weather_code') addForced(metric.forecastModel, 'temperature_2m');
                } else {
                    const group = (metric.paramType === 'daily') ? params.forecast.daily : params.forecast.hourly;
                    group.add(name);
                    if (name === 'weather_code') {
                        params.forecast.hourly.add('temperature_2m');
                    }
                }
            }
        }
    }

    // Konvertiere Sets in Strings
    const forcedModel = {};
    for (const [model, names] of params.forecast.forcedModel) {
        forcedModel[model] = Array.from(names);
    }

    return {
        forecast: {
            hourly: Array.from(params.forecast.hourly).join(','),
            daily: Array.from(params.forecast.daily).join(','),
            pressure: '', // (Bleibt leer, da in 'hourly' integriert)
            models: Array.from(params.forecast.models).join(','), // (z.B. 'icon_seamless')
            forcedModel // { modelName: [paramName, ...] } -- eigener Request pro Modell, siehe addForced()
        },
        marine: {
            hourly: Array.from(params.marine.hourly).join(','), // (z.B. 'wave_height')
            models: Array.from(params.marine.models).join(',') // (z.B. 'ecmwf_wam025')
        }
    };
};

/**
 * Holt alle relevanten Regelwerte (Alarm, Warn, CheckType) für eine Metrik.
 */
export const getMetricRules = (metric, rules) => {
    if (!rules || !metric) return {};
    
    const ruleName = metric.ruleName;
    const checkType = rules[ruleName + '_checkType'] || metric.checkType;

    // Spezielle Handhabung für Min/Max (Wert) vs. Code-Match (Array)
    let alarmValue, warnValue;

    if (metric.checkType === 'code_match') {
        // Code-Match liefert ein Array von Strings (darf auch null sein)
        alarmValue = rules[ruleName + '_alarm'] || null;
        warnValue = rules[ruleName + '_warn'] || null;
    } else {
        // Min/Max liefert einen numerischen Wert
        alarmValue = (rules[ruleName + '_alarm'] !== null && rules[ruleName + '_alarm'] !== undefined) ? rules[ruleName + '_alarm'] : null;
        warnValue = (rules[ruleName + '_warn'] !== null && rules[ruleName + '_warn'] !== undefined) ? rules[ruleName + '_warn'] : null;
    }

    return {
        alarm: alarmValue,
        warn: warnValue,
        checkType: checkType
    };
};

/**
 * Zentrale Prüfung, ob eine Metrik im Profil aktiv ist.
 */
export const isMetricActive = (metric, rules) => {
    if (!rules) return false;

    const ruleName = metric.ruleName;
    
    // 1. Min/Max Checks
    if (metric.checkType === 'min' || metric.checkType === 'max') {
        const hasAlarm = rules[ruleName + '_alarm'] !== null && rules[ruleName + '_alarm'] !== undefined;
        const hasWarn = rules[ruleName + '_warn'] !== null && rules[ruleName + '_warn'] !== undefined;
        return hasAlarm || hasWarn;
    }
    
    // 2. Code Match Checks (SigWx)
    if (metric.checkType === 'code_match') {
        const hasAlarm = rules[ruleName + '_alarm'] && rules[ruleName + '_alarm'].length > 0;
        const hasWarn = rules[ruleName + '_warn'] && rules[ruleName + '_warn'].length > 0;
        return hasAlarm || hasWarn;
    }

    return false;
};