// weather.js (Version 2.0 - Config-Driven)
import { getCache, setCache } from './db.js'; // Importiere Cache-Helfer
// Importiere das NEUE "Gehirn"
import { METRICS_CONFIG, getApiParams } from './metricsConfig.js';
import { WEATHER_MODELS } from './config.js';
import * as Utils from './utils.js'; // <-- NEU
import { STANDARD_PRESSURE_LEVELS } from './utils.js'; // <-- NEU

/**
 * Berechnet abgeleitete Metriken.
 * @param {string} summaryKey - Der Schlüssel der Metrik (z.B. 'windchill')
 * @param {object} hourly - Das Open-Meteo 'hourly'-Objekt für EINEN Punkt
 * @param {int} h - Der Index der Stunde (0-23)
 * @returns {number | null} - Der berechnete Wert oder null
 */
function calculateDerivedValue(metric, hourly, h, elevation) {
    const summaryKey = metric.summaryKey; // Holen wir uns aus dem Objekt
    try {
        switch (summaryKey) {
            case 'windchill':
                const temp = hourly['temperature_2m'][h];
                const wind_kmh = hourly['wind_speed_10m'][h];
                if (temp === null || wind_kmh === null) return null;
                if (temp > 10 || wind_kmh < 4.8) {
                    return temp;
                }
                const v_pow = Math.pow(wind_kmh, 0.16);
                const chill = 13.12 + 0.6215 * temp - 11.37 * v_pow + 0.3965 * temp * v_pow;
                return chill;
            case 'cloudBase': { // (in einen Block geklammert)

                // 1. Analysiere die Schwellenwerte für diesen Punkt
                const cloudThresholds = analyzeCloudLayers(hourly);
                if (!cloudThresholds || !cloudThresholds[h]) {
                    console.warn(`[CloudBase] Analyse der Schwellenwerte für Stunde ${h} fehlgeschlagen.`);
                    return null;
                }
                const currentThresholds = cloudThresholds[h];

                // 2. Hole Basis-Daten
                const baseHeight_m = elevation;
                if (baseHeight_m === null || baseHeight_m === undefined) {
                    console.warn(`[CloudBase] 'elevation' fehlt. Nutze 0m als Fallback.`);
                }

                const heightUnit = 'm';
                const interpStep = 50;

                // --- START DEBUG LOG (Stunde 0) ---
                if (h === 0) {
                    console.groupCollapsed(`[CloudBase DEBUG] Stunde 0 (BaseHeight: ${baseHeight_m}m)`);
                    console.log("1. Dynamische Schwellen (von analyzeCloudLayers):", currentThresholds);
                }
                // --- ENDE DEBUG LOG ---

                // 3. Interpolieren
                const interpolatedData = interpolateWeatherData(
                    hourly,
                    h,
                    interpStep,
                    baseHeight_m || 0, // (Nutze 0 als Fallback)
                    heightUnit,
                    currentThresholds
                );

                // --- START DEBUG LOG (Stunde 0) ---
                if (h === 0) {
                    console.log("2. Interpolierte Daten (von interpolateWeatherData):", interpolatedData);
                }
                // --- ENDE DEBUG LOG ---

                // 4. Wolkenschichten finden
                const layers = findCloudLayers(interpolatedData);

                // --- START DEBUG LOG (Stunde 0) ---
                if (h === 0) {
                    console.log("3. Gefundene Schichten (von findCloudLayers):", layers);
                }
                // --- ENDE DEBUG LOG ---

                // 5. Niedrigste Basis zurückgeben
                if (layers.length > 0) {
                    const base_in_meters = layers[0].base;
                    if (h === 0) {
                        console.log(`4. Ergebnis: Niedrigste Basis = ${base_in_meters}m`);
                        console.groupEnd(); // Schließt die Log-Gruppe
                    }
                    return base_in_meters;
                }

                // --- START DEBUG LOG (Stunde 0) ---
                if (h === 0) {
                    console.log("4. Ergebnis: Keine Schichten gefunden (SKC).");
                    console.groupEnd(); // Schließt die Log-Gruppe
                }
                // --- ENDE DEBUG LOG ---

                return null; // Keine Wolkenschicht gefunden (SKC)
            }
            default:
                return null;
        }
    } catch (e) {
        console.error(`Fehler bei Berechnung von '${summaryKey}':`, e);
        return null;
    }
}

/**
 * Teilt ein Array in kleinere Stapel (Chunks) auf.
 * (Unverändert)
 */
function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

/**
 * Erstellt ein leeres Summary-Objekt (Feature-komplett)
 * NEU: Wird dynamisch aus METRICS_CONFIG generiert.
 */
export function getEmptySummary() {
    const summary = {
        combined: { triggered: false, hourlyStatus: {} },
        error: null
    };

    // Iteriere über die Config und erstelle für jeden Eintrag ein leeres Objekt
    for (const metric of Object.values(METRICS_CONFIG)) {
        const key = metric.summaryKey;
        if (!summary[key]) {
            summary[key] = {
                triggered: false,
                // 'max' (wind, cloud, precip) startet bei 0 (oder -Infinity)
                // 'min' (temp, vis) startet bei 999 (oder +Infinity)
                value: (metric.checkType === 'min') ? Infinity : -Infinity,
                hourlyStatus: {},
                hourlyAlarms: {},
                hourlyData: []
            };
            // Korrigiere die Startwerte für die Anzeige (damit nicht "Infinity" angezeigt wird)
            if (metric.checkType === 'min') {
                if (key === 'temp') summary[key].value = 999;
                if (key === 'vis') summary[key].value = 99999;
            } else if (metric.checkType === 'code_match') {
                // NEU: Startwert für SigWx (0 = 'NSW')
                summary[key].value = 0;
            } else {
                summary[key].value = 0;
            }
        }
    }

    // Überschreibe 'value' mit 'min'/'max' für Abwärtskompatibilität (falls ui.js/map.js es noch nutzt)
    // HINWEIS: Wir sollten später auf .value umstellen.
    Object.values(METRICS_CONFIG).forEach(metric => {
        if (metric.checkType === 'min') {
            summary[metric.summaryKey].min = summary[metric.summaryKey].value;
        } else {
            summary[metric.summaryKey].max = summary[metric.summaryKey].value;
        }
    });

    return summary;
}


/**
 * Berechnet die Sampling-Punkte (graue Punkte) für ein GeoJSON.
 * (Unverändert)
 */
export function getGridPoints(geojson) {
    // KUGELSICHERER CHECK (behebt den 'type'/'geometry' TypeError)
    if (!geojson || !geojson.geometry) {
        return { error: "Ungültiges GeoJSON (vielleicht null)." };
    }
    try {
        const bbox = turf.bbox(geojson); // [minLon, minLat, maxLon, maxLat]
        const cellSide = 10; // km
        const options = { units: 'kilometers' };
        const pointGrid = turf.pointGrid(bbox, cellSide, options);

        const pointsInside = turf.pointsWithinPolygon(pointGrid, geojson);

        return { gridPoints: pointsInside }; // Gibt die GeoJSON-Punkte zurück

    } catch (e) {
        console.error("Turf.js Fehler in getGridPoints:", e);
        return { error: "Turf.js Fehler" };
    }
}

// --- 2. Die "Kachel-Engine" (Tiling + Caching) ---

export async function fetchAndCheckProfile(profile, modelInfo, gridPoints, activeMetrics) {
    // 1. Cache-Schlüssel (Unverändert)
    const modelApiName = modelInfo ? modelInfo.apiName : 'auto';
    const modelRunISO = modelInfo ? modelInfo.runTimeISO : 'latest';
    const cacheKey = `${profile.id}_${modelApiName}_${modelRunISO}`;

    // 2. Cache-Prüfung (Unverändert)
    try {
        const cachedData = await getCache(cacheKey);
        const THIRTY_MINUTES = 30 * 60 * 1000;
        if (cachedData && (Date.now() - cachedData.timestamp < THIRTY_MINUTES)) {
            console.log(`%cDATEN AUS CACHE GELADEN: ${cacheKey}`, "color: green; font-weight: bold;");
            return cachedData.summary;
        }
    } catch (e) {
        console.warn("Cache-Lesefehler:", e);
    }

    // 3. Cache "kalt" (Unverändert)
    console.warn(`%cCACHE KALT. FÜHRE LIVE-FETCH AUS: ${cacheKey}`, "color: orange;");

    if (!gridPoints || !gridPoints.features || gridPoints.features.length === 0) {
        return { error: "Keine Sampling-Punkte zum Abfragen.", ...getEmptySummary() };
    }

    // 4. Punkte stapeln (Unverändert)
    const CHUNK_SIZE = 50;
    const pointChunks = chunkArray(gridPoints.features, CHUNK_SIZE);
    let allApiResponses = [];

    // NEU: API-Parameter dynamisch UND gruppiert holen
    const metricsForParams = activeMetrics || Object.values(METRICS_CONFIG);
    const { hourly, daily, pressure } = getApiParams(metricsForParams, modelInfo);

    console.log(`Starte Tiling-Fetch: ${gridPoints.features.length} Punkte...`);
    console.log(`Hourly-Params: ${hourly}`);
    console.log(`Daily-Params: ${daily}`);
    console.log(`Pressure-Params: ${pressure}`); // <-- Neuer Log

    // 5. Sequenzielle Schleife (API-URL-Bau)
    for (const chunk of pointChunks) {
        const lats = chunk.map(p => p.geometry.coordinates[1].toFixed(4)).join(',');
        const lons = chunk.map(p => p.geometry.coordinates[0].toFixed(4)).join(',');

        let apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&forecast_days=2`; // <-- WICHTIG: Auf 2 Tage erhöhen!

        if (hourly.length > 0) {
            apiUrl += `&hourly=${hourly}`;
        }
        if (daily.length > 0) {
            apiUrl += `&daily=${daily}`;
        }

        // Modell-Logik (Unverändert)
        if (modelInfo && modelInfo.apiName) {
            apiUrl += `&models=${modelInfo.apiName}`;
            if (modelInfo.apiName !== 'auto' && modelInfo.runTimeISO) {
                apiUrl += `&forecast_run=${modelInfo.runTimeISO}`;
            }
        } else {
            apiUrl += `&models=auto`;
        }

        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                console.error("API-Fehler bei Chunk:", response.statusText, apiUrl);
                throw new Error(`API-Fehler bei Chunk: ${response.statusText}`);
            }
            const data = await response.json();

            const locationsData = Array.isArray(data) ? data : [data];

            if (locationsData[0] && locationsData[0].error) {
                console.error("Open-Meteo API-Fehler:", locationsData[0].reason, apiUrl);
                throw new Error(`Open-Meteo API-Fehler: ${locationsData[0].reason}`);
            }
            allApiResponses.push(...locationsData);

        } catch (err) {
            console.error("Fehler beim Abrufen eines Tiling-Stapels:", err);
            return Object.assign(getEmptySummary(), { error: err.message });
        }
    } // Ende der Tiling-Schleife

    // 6. Daten zusammennähen (Unverändert)
    console.log(`Tiling-Fetch beendet. Nähe ${allApiResponses.length} Punkte zusammen.`);
    console.log("%cRAW API DATA (Aggregated from Tiling):", "color: blue; font-weight: bold;", allApiResponses);
    const finalSummary = checkThresholds_Sampling(profile, allApiResponses, activeMetrics);

    // 7. Cache speichern (Unverändert)
    try {
        await setCache(cacheKey, finalSummary);
    } catch (e) {
        console.warn("Cache-Schreibfehler:", e);
    }

    // 8. Fertig (Unverändert)
    return finalSummary;
}

// --- Cloud Layer Funktionen ---
/**
 * Prüft die "flache" Array-Antwort des Sampling-Ansatzes.
 * NEU: Komplett dynamisch basierend auf METRICS_CONFIG.
 */
function checkThresholds_Sampling(profile, locationsData, activeMetrics) {
    const rules = profile.rules;
    const summary = getEmptySummary();
    const metrics = activeMetrics || Object.values(METRICS_CONFIG);

    // --- NEUES DEBUG (Ganz oben) ---
    console.log("--- DEBUG: checkThresholds_Sampling GESTARTET ---");
    console.log(`1. Profil: ${profile.name}`);
    console.log(`2. Anzahl Locations (API-Punkte): ${locationsData ? locationsData.length : 'null'}`);
    console.log(`3. Anzahl Metriken (aus Config): ${metrics ? metrics.length : 'null'}`);
    // --- ENDE NEUES DEBUG ---

    if (!locationsData || locationsData.length === 0) {
        return Object.assign(getEmptySummary(), { error: "Keine API-Daten empfangen." });
    }

    // Finde den ersten Eintrag, der gültige 'hourly.time' Daten hat
    const firstValidEntry = locationsData.find(loc => loc && loc.hourly && loc.hourly.time);

    if (!firstValidEntry) {
        // Wenn NIEMAND 'hourly.time' hat, DANN ist die Antwort ungültig.
        console.error("API-Antwort ist ungültig, 'hourly.time' fehlt in *allen* Einträgen.", locationsData);
        return Object.assign(getEmptySummary(), { error: "Ungültige API-Antwort (keine Zeitstempel)." });
    }
    
    // Benutze das 'time'-Array des ersten GÜLTIGEN Eintrags
    const timeStamps = firstValidEntry.hourly.time.map(t => new Date(t).getUTCHours());

    timeStamps.slice(0, 24).forEach((hour, h) => {
        Object.values(METRICS_CONFIG).forEach(metric => { 
            const key = metric.summaryKey;

            const initialStatus = 'no-data';

            summary[key].hourlyStatus[hour] = initialStatus;
            summary[key].hourlyAlarms[hour] = new Set(); // <-- HIER IST DIE INITIALISIERUNG

            summary[key].hourlyData[h] = (metric.checkType === 'min') ? Infinity : -Infinity;
        });
        summary.combined.hourlyStatus[hour] = 'no-data';
    });

    // Status-Aggregator-Funktion
    const getWorseStatus = (s1, s2) => {
        if (s1 === 'alarm' || s2 === 'alarm') return 'alarm';
        if (s1 === 'warn' || s2 === 'warn') return 'warn';
        if (s1 === 'ok' || s2 === 'ok') return 'ok';
        return 'no-data';
    };

    // 2. Durch alle Standorte (Punkte) iterieren
    locationsData.forEach(locationData => {
        if (!locationData || locationData.latitude === null) {
            return; // Überspringe fehlerhafte Datenpunkte
        }

        const hourly = locationData.hourly;
        const daily = locationData.daily; // <-- NEU
        const locationId = `${locationData.latitude.toFixed(2)},${locationData.longitude.toFixed(2)}`;
        const elevation = locationData.elevation;

        // --- NEU: Tages-Werte "vorladen" ---
        // Wir müssen den richtigen Tages-Index finden (0 = heute, 1 = morgen)
        // Wir nehmen an, dass die 'hourly'-Zeitstempel bestimmen, welchen Tag wir betrachten.
        // (Einfache Annahme für jetzt: Wir nehmen Index 0 für den ersten Tag)
        const dayIndex = 0; // (Diese Logik muss ggf. verfeinert werden, falls Modell-Läufe über Mitternacht gehen)

        const dailyValueCache = {};
        if (daily) {
            for (const metric of metrics.filter(m => m.paramType === 'daily')) {
                if (daily[metric.apiName] && daily[metric.apiName].length > dayIndex) {
                    dailyValueCache[metric.summaryKey] = daily[metric.apiName][dayIndex];
                } else {
                    dailyValueCache[metric.summaryKey] = null; // Kein Wert verfügbar
                }
            }
        }
        // ------------------------------------

        // Iteriere durch die Stunden (0-23)
        for (let h = 0; h < 24; h++) {
            if (h >= timeStamps.length) return;
            const time = hourly.time[h];
            const hour = timeStamps[h];

            // --- DEBUG (Vor der Schleife) ---
            if (h === 0 && locationData === locationsData[0]) { // Logge nur einmal
                console.log("4. Betrete jetzt die 'metrics.forEach'-Schleife...");
            }
            // --- ENDE DEBUG ---

            // --- NEUE DYNAMISCHE SCHLEIFE ---
            // Iteriere durch alle konfigurierten Metriken
            metrics.forEach(metric => {
                const ruleName = metric.ruleName;
                const summaryKey = metric.summaryKey;

                // --- 1. WERT ZUWEISEN (BASIEREND AUF TYP) ---
                let value = null;

                if (metric.paramType === 'hourly') {
                    const apiName = metric.apiName; // apiName ist ein String
                    const hasData = hourly[apiName] !== undefined && hourly[apiName] !== null;
                    value = hasData ? hourly[apiName][h] : null;

                } else if (metric.paramType === 'daily') {
                    value = dailyValueCache[summaryKey];

                } else if (metric.paramType === 'derived') {
                    // apiName ist ein Array (wird in der Funktion verwendet)
                    value = calculateDerivedValue(metric.summaryKey, hourly, h);
                } else if (metric.paramType === 'derived_pressure') {
                    value = calculateDerivedValue(metric, hourly, h, elevation);
                }
                // --- 2. GRAPH-AGGREGATION ---
                if (value !== null && isFinite(value)) {
                    if (metric.checkType === 'min') {
                        if (value < summary[summaryKey].hourlyData[h]) summary[summaryKey].hourlyData[h] = value;
                    } else { // 'max'
                        if (value > summary[summaryKey].hourlyData[h]) summary[summaryKey].hourlyData[h] = value;
                    }
                }

                // --- 3. REGEL-CHECK ---
                let currentStatus = 'no-data';

                if (value !== null && isFinite(value)) {
                    if (metric.checkType === 'min' || metric.checkType === 'max') {

                        const limit_alarm = rules[metric.ruleName + '_alarm'];
                        const limit_warn = rules[metric.ruleName + '_warn'];

                        if (limit_alarm !== null || limit_warn !== null) {
                            currentStatus = 'ok';
                        } else {
                            currentStatus = 'no-data'; // (Kein Limit = keine Prüfung)
                        }

                        if (metric.checkType === 'min') {
                            if (limit_alarm !== null && value < limit_alarm) {
                                currentStatus = 'alarm';
                            }
                            else if (limit_warn !== null && value < limit_warn) {
                                currentStatus = 'warn';
                            }
                        } else {
                            if (limit_alarm !== null && value > limit_alarm) {
                                currentStatus = 'alarm';
                            }
                            else if (limit_warn !== null && value > limit_warn) {
                                currentStatus = 'warn';
                            }
                        }

                        if (metric.checkType === 'min' && value < summary[summaryKey].value) summary[summaryKey].value = value;
                        if (metric.checkType === 'max' && value > summary[summaryKey].value) summary[summaryKey].value = value;
                    }
                    else if (metric.checkType === 'code_match') {
                        // --- NEUE Logik für Rot/Gelb-Prüfung ---
                        const forbiddenCodes_alarm = rules[metric.ruleName + '_alarm']; // z.B. ['48']
                        const forbiddenCodes_warn = rules[metric.ruleName + '_warn'];  // z.B. ['45']

                        // Prüfe, ob überhaupt Regeln gesetzt sind
                        if (forbiddenCodes_alarm || forbiddenCodes_warn) {
                            
                            const valueStr = value.toString();
                            
                            // WICHTIG: Alarm hat Vorrang
                            if (forbiddenCodes_alarm && forbiddenCodes_alarm.includes(valueStr)) {
                                currentStatus = 'alarm';
                            }
                            // Nur wenn kein Alarm, prüfe Warnung
                            else if (forbiddenCodes_warn && forbiddenCodes_warn.includes(valueStr)) {
                                currentStatus = 'warn';
                            }
                            // Code ist nicht in den Listen, also OK
                            else {
                                currentStatus = 'ok'; 
                            }
                            
                            // Speichere den Code-Wert, wenn er einen Alarm/Warnung auslöst
                            if (currentStatus !== 'ok' && value > summary[summaryKey].value) {
                                summary[summaryKey].value = value;
                            }
                            
                        } else {
                            currentStatus = 'no-data'; // Keine Codes zum Prüfen ausgewählt
                        }
                    }

                    if (currentStatus === 'alarm') {
                        summary[summaryKey].triggered = true;
                        summary[summaryKey].hourlyAlarms[hour].add(locationId);
                    }

                } else {
                    if (ruleName === 'minTemp' || ruleName === 'minCloudBase') {
                        currentStatus = 'ok';
                    } else {
                        currentStatus = 'no-data';
                    }
                }

                summary[summaryKey].hourlyStatus[hour] = getWorseStatus(summary[summaryKey].hourlyStatus[hour], currentStatus);

            });
            // --- ENDE DYNAMISCHE SCHLEIFE ---
        }
    });

    // --- Kombi-Zeile berechnen (Vollständig) ---
    timeStamps.slice(0, 24).forEach((hour, h) => {

        const logicMode = rules.logicMode || 'OR';
        let combinedStatus = 'no-data';
        let activeRuleStati = []; // Speichert den Status aller *aktiven* Regeln

        // 1. Sammle den Status aller Regeln, die für dieses Profil aktiv sind
        metrics.forEach(metric => {
            const ruleName = metric.ruleName;
            if ((rules[ruleName + '_alarm'] !== null && rules[ruleName + '_alarm'] !== undefined) ||
                (rules[ruleName + '_warn'] !== null && rules[ruleName + '_warn'] !== undefined)) {
                activeRuleStati.push(summary[metric.summaryKey].hourlyStatus[hour]);
            }
        });

        // 2. Wende die "UND" / "ODER" Logik an
        if (activeRuleStati.length === 0) {
            // Keine Regeln aktiv
            combinedStatus = 'no-data';

        } else if (logicMode === 'AND') {
            // --- "UND"-Logik ---
            if (activeRuleStati.some(s => s === 'ok')) {
                combinedStatus = 'ok';
            } else if (activeRuleStati.every(s => s === 'alarm' || s === 'warn')) {
                combinedStatus = activeRuleStati.some(s => s === 'alarm') ? 'alarm' : 'warn';
            } else {
                combinedStatus = 'no-data';
            }

        } else {
            // --- "ODER"-Logik (wie bisher) ---
            let orStatus = 'no-data';
            activeRuleStati.forEach(status => {
                orStatus = getWorseStatus(orStatus, status);
            });
            combinedStatus = orStatus;
        }

        summary.combined.hourlyStatus[hour] = combinedStatus;
        if (combinedStatus !== 'ok' && combinedStatus !== 'no-data') summary.combined.triggered = true;
    });

    // Abwärtskompatibilität für .min / .max
    Object.values(METRICS_CONFIG).forEach(metric => {
        if (metric.checkType === 'min') {
            summary[metric.summaryKey].min = summary[metric.summaryKey].value;
        } else {
            summary[metric.summaryKey].max = summary[metric.summaryKey].value;
        }
    });

    return summary;
}

/**
 * Analysiert die Roh-Wetterdaten, um für jeden Zeitpunkt dynamische
 * Feuchtigkeitsschwellenwerte für die Wolkenerkennung zu bestimmen.
 * @param {object} weatherData - Das 'hourly' Objekt aus der API-Antwort.
 * @returns {object[]} Ein Array von Schwellenwert-Objekten für jeden Zeitpunkt.
 */
export function analyzeCloudLayers(weatherData) {
    if (!weatherData || !weatherData.time || weatherData.time.length === 0) {
        return [];
    }

    const thresholds = [];
    const pressureLevels = [1000, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200];

    for (let i = 0; i < weatherData.time.length; i++) {
        const groundTemp = weatherData.temperature_2m[i];
        let stockwerke = { low: [], mid: [], high: [] };

        // 1. Druckstufen den Stockwerken zuordnen
        for (const p of pressureLevels) {
            const temp = weatherData[`temperature_${p}hPa`]?.[i];
            const height = weatherData[`geopotential_height_${p}hPa`]?.[i];

            if (temp === null || height === null || temp === undefined || height === undefined) continue;

            if (groundTemp <= 0) { // Sonderfall Kaltluft
                if (height <= 2000) stockwerke.low.push(p);
                else if (temp > -30) stockwerke.mid.push(p);
                else stockwerke.high.push(p);
            } else { // Normalfall
                if (temp > 0) stockwerke.low.push(p);
                else if (temp > -30) stockwerke.mid.push(p);
                else stockwerke.high.push(p);
            }
        }

        // 2. maxCC und RH-Schwelle pro Stockwerk berechnen
        const getThreshold = (pLevels, defaultHigh, defaultLow) => {
            if (pLevels.length === 0) return 95; // Konservativer Fallback
            const maxCC = Math.max(...pLevels.map(p => weatherData[`cloud_cover_${p}hPa`]?.[i] || 0));
            return maxCC > 50 ? defaultHigh : defaultLow;
        };

        thresholds.push({
            low: getThreshold(stockwerke.low, 90, 75),
            mid: getThreshold(stockwerke.mid, 85, 70),
            high: 65 // Fester Wert für hohe Wolken
        });
    }

    console.log('[WeatherManager] Cloud layer thresholds analyzed for all timesteps.');
    return thresholds;
}

/**
 * Interpoliert die Roh-Wetterdaten für einen bestimmten Zeitpunkt, um eine detaillierte,
 * höhenabhängige Wettertabelle zu erstellen.
 * HINWEIS (ToDo): Diese Funktion ist stark vom globalen `AppState` abhängig. Zukünftig
 * könnte sie so umgestaltet werden, dass sie alle benötigten Daten als Parameter erhält.
 * @param {number} sliderIndex - Der Index des Zeitschiebereglers.
 * @returns {object[]} Ein Array von Objekten mit den Wetterdaten für jede Höhenstufe.
 */
function interpolateWeatherData(weatherData, sliderIndex, interpStep, baseHeight, heightUnit, currentThresholds) {
    if (!weatherData || !weatherData.time || sliderIndex >= weatherData.time.length) {
        console.warn('No weather data provided or index out of bounds for interpolation');
        return [];
    }

    const allPressureLevels = STANDARD_PRESSURE_LEVELS;

    // Filtere Drucklevel nur, wenn ALLE benötigten Daten für diesen Level vorhanden sind.
    const validPressureLevels = allPressureLevels.filter(hPa => {
        const height = weatherData[`geopotential_height_${hPa}hPa`]?.[sliderIndex];
        // temp und rh werden für die Validierung nicht mehr benötigt
        const speed = weatherData[`wind_speed_${hPa}hPa`]?.[sliderIndex];
        const dir = weatherData[`wind_direction_${hPa}hPa`]?.[sliderIndex];

        // Es werden nur noch die für die Sprungberechnung kritischen Werte geprüft.
        return [height, speed, dir].every(val => val != null);
    });

    const ccPressureLevels = allPressureLevels.filter(hPa => {
        const height = weatherData[`geopotential_height_${hPa}hPa`]?.[sliderIndex];
        const cc = weatherData[`cloud_cover_${hPa}hPa`]?.[sliderIndex];
        return height != null && cc != null;
    });

    console.log(`[interpolateWeatherData] DEBUG: Gefilterte Wolken-Levels (ccPressureLevels):`, ccPressureLevels);

    const ccHeightData = ccPressureLevels.map(hPa => weatherData[`geopotential_height_${hPa}hPa`][sliderIndex]);
    const ccValueData = ccPressureLevels.map(hPa => weatherData[`cloud_cover_${hPa}hPa`][sliderIndex]);

    console.log(`[interpolateWeatherData] DEBUG: Zugehörige Höhen (ccHeightData):`, ccHeightData);
    console.log(`[interpolateWeatherData] DEBUG: Zugehörige Wolkenwerte (ccValueData):`, ccValueData);

    if (validPressureLevels.length < 2) {
        console.warn('Insufficient valid pressure level data for interpolation:', validPressureLevels);
        return [];
    }

    // Sammle die Daten der validen Drucklevel
    let heightData = validPressureLevels.map(hPa => weatherData[`geopotential_height_${hPa}hPa`][sliderIndex]);
    let tempData = validPressureLevels.map(hPa => weatherData[`temperature_${hPa}hPa`][sliderIndex]);
    let rhData = validPressureLevels.map(hPa => weatherData[`relative_humidity_${hPa}hPa`][sliderIndex]);
    let ccData = validPressureLevels.map(hPa => weatherData[`cloud_cover_${hPa}hPa`]?.[sliderIndex]);
    let spdData = validPressureLevels.map(hPa => weatherData[`wind_speed_${hPa}hPa`][sliderIndex]);
    let dirData = validPressureLevels.map(hPa => weatherData[`wind_direction_${hPa}hPa`][sliderIndex]);

    // Füge Bodendaten hinzu, um die Interpolation nach unten hin zu verbessern
    const surfacePressure = weatherData.surface_pressure[sliderIndex];
    if (surfacePressure === null || surfacePressure === undefined) {
        console.warn('Surface pressure missing');
        return [];
    }

    let uComponents = spdData.map((spd, i) => -spd * Math.sin(dirData[i] * Math.PI / 180));
    let vComponents = spdData.map((spd, i) => -spd * Math.cos(dirData[i] * Math.PI / 180));
    const lowestPressureLevel = Math.max(...validPressureLevels);
    const hLowest = weatherData[`geopotential_height_${lowestPressureLevel}hPa`][sliderIndex];
    if (surfacePressure > lowestPressureLevel && Number.isFinite(hLowest)) {
        const stepsBetween = Math.floor((hLowest - baseHeight) / interpStep);

        const uSurface = -weatherData.wind_speed_10m[sliderIndex] * Math.sin(weatherData.wind_direction_10m[sliderIndex] * Math.PI / 180);
        const vSurface = -weatherData.wind_speed_10m[sliderIndex] * Math.cos(weatherData.wind_direction_10m[sliderIndex] * Math.PI / 180);
        const uLowest = uComponents[validPressureLevels.indexOf(lowestPressureLevel)];
        const vLowest = vComponents[validPressureLevels.indexOf(lowestPressureLevel)];

        for (let i = stepsBetween - 1; i >= 1; i--) {
            const h = baseHeight + i * interpStep;
            if (h >= hLowest) continue;
            const fraction = (h - baseHeight) / (hLowest - baseHeight);
            const logPSurface = Math.log(surfacePressure);
            const logPLowest = Math.log(lowestPressureLevel);
            const logP = logPSurface + fraction * (logPLowest - logPSurface);
            const p = Math.exp(logP);

            const logHeight = Math.log(h - baseHeight + 1);
            const logH0 = Math.log(1);
            const logH1 = Math.log(hLowest - baseHeight);
            const u = Utils.linearInterpolate([logH0, logH1], [uSurface, uLowest], logHeight);
            const v = Utils.linearInterpolate([logH0, logH1], [vSurface, vLowest], logHeight);
            const spd = Utils.windSpeed(u, v);
            const dir = Utils.windDirection(u, v);

            heightData.unshift(h);
            validPressureLevels.unshift(p);
            tempData.unshift(Utils.linearInterpolate([baseHeight, hLowest], [weatherData.temperature_2m[sliderIndex], weatherData[`temperature_${lowestPressureLevel}hPa`][sliderIndex]], h));
            rhData.unshift(Utils.linearInterpolate([baseHeight, hLowest], [weatherData.relative_humidity_2m[sliderIndex], weatherData[`relative_humidity_${lowestPressureLevel}hPa`][sliderIndex]], h));
            spdData.unshift(spd);
            dirData.unshift(dir);
            uComponents.unshift(u);
            vComponents.unshift(v);
        }

        heightData.unshift(baseHeight);
        validPressureLevels.unshift(surfacePressure);
        tempData.unshift(weatherData.temperature_2m[sliderIndex]);
        rhData.unshift(weatherData.relative_humidity_2m[sliderIndex]);
        spdData.unshift(weatherData.wind_speed_10m[sliderIndex]);
        dirData.unshift(weatherData.wind_direction_10m[sliderIndex]);
        uComponents.unshift(uSurface);
        vComponents.unshift(vSurface);
    }

    const minPressureIndex = validPressureLevels.indexOf(Math.min(...validPressureLevels));
    const maxHeightASL = heightData[minPressureIndex];
    const maxHeightAGL = maxHeightASL - baseHeight;
    if (maxHeightAGL <= 0 || isNaN(maxHeightAGL)) {
        console.warn('Invalid max height at lowest pressure level:', { maxHeightASL, baseHeight, minPressure: validPressureLevels[minPressureIndex] });
        return [];
    }

    const maxHeightInUnit = heightUnit === 'ft' ? maxHeightAGL * 3.28084 : maxHeightAGL;
    const steps = Math.floor(maxHeightInUnit / interpStep);
    const heightsInUnit = Array.from({ length: steps + 1 }, (_, i) => i * interpStep);

    const interpolatedData = [];
    heightsInUnit.forEach(height => {
        const heightAGLInMeters = heightUnit === 'ft' ? height / 3.28084 : height;
        const heightASLInMeters = baseHeight + heightAGLInMeters;

        let dataPoint;

        let cc = 0; // Standardwert ist 0
        if (ccHeightData.length > 0) {
            // Finde den Index des nächstgelegenen realen Datenpunktes
            let closestPressureLevelIndex = 0;
            let minDistance = Infinity;

            ccHeightData.forEach((h, index) => {
                const distance = Math.abs(heightASLInMeters - h);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestPressureLevelIndex = index;
                }
            });
            cc = ccValueData[closestPressureLevelIndex]; // Weise den Wert zu
        }

        if (heightAGLInMeters === 0) {
            const surfaceCloudCover = weatherData['cloud_cover']?.[sliderIndex] ?? 0; // Fallback auf 0

            dataPoint = {
                height: heightASLInMeters,
                pressure: surfacePressure,
                temp: weatherData.temperature_2m[sliderIndex],
                rh: weatherData.relative_humidity_2m[sliderIndex],
                cc: surfaceCloudCover,
                spd: weatherData.wind_speed_10m[sliderIndex],
                dir: weatherData.wind_direction_10m[sliderIndex],
                dew: Utils.calculateDewpoint(weatherData.temperature_2m[sliderIndex], weatherData.relative_humidity_2m[sliderIndex])
            };
        } else {
            const pressure = Utils.interpolatePressure(heightASLInMeters, validPressureLevels, heightData);
            const windComponents = Utils.interpolateWindAtAltitude(heightASLInMeters, validPressureLevels, heightData, uComponents, vComponents);
            const spd = Utils.windSpeed(windComponents.u, windComponents.v);
            const dir = Utils.windDirection(windComponents.u, windComponents.v);
            const temp = Utils.linearInterpolate(heightData, tempData, heightASLInMeters);
            const rh = Utils.linearInterpolate(heightData, rhData, heightASLInMeters);
            const dew = Utils.calculateDewpoint(temp, rh);

            dataPoint = {
                height: heightASLInMeters,
                pressure: Number.isFinite(pressure) ? Number(pressure.toFixed(1)) : 'N/A',
                temp: Number.isFinite(temp) ? Number(temp.toFixed(1)) : 'N/A',
                rh: Number.isFinite(rh) ? Number(rh.toFixed(0)) : 'N/A',
                cc: Number.isFinite(cc) ? Number(cc.toFixed(0)) : 'N/A',
                spd: Number.isFinite(spd) ? Number(spd.toFixed(1)) : 'N/A',
                dir: Number.isFinite(dir) ? Number(dir.toFixed(0)) : 'N/A',
                dew: Number.isFinite(dew) ? Number(dew.toFixed(1)) : 'N/A'
            };
        }

        if (Number.isFinite(dataPoint.temp) && Number.isFinite(dataPoint.rh)) {
            const temp = dataPoint.temp;
            const rh = dataPoint.rh;
            let rhThreshold;

            const groundTemp = weatherData.temperature_2m[sliderIndex];

            // Bestimme das Stockwerk und den passenden Schwellenwert
            if (groundTemp <= 0) { // Sonderfall Kaltluft
                if (heightAGLInMeters <= 2000) {
                    rhThreshold = currentThresholds.low;
                } else if (temp > -30) {
                    rhThreshold = currentThresholds.mid;
                } else {
                    rhThreshold = currentThresholds.high;
                }
            } else { // Normalfall
                if (temp > 0) {
                    rhThreshold = currentThresholds.low;
                } else if (temp > -30) {
                    rhThreshold = currentThresholds.mid;
                } else {
                    rhThreshold = currentThresholds.high;
                }
            }
        }

        dataPoint.displayHeight = height;
        interpolatedData.push(dataPoint);
    });

    console.log(`[DEBUG] interpolateWeatherData finished. baseHeight: ${baseHeight}, Returning ${interpolatedData.length} data points. First point:`, interpolatedData[0]);
    return interpolatedData;
}

/**
     * NEUE FUNKTION: Findet signifikante Wolkenschichten und gibt sie als strukturiertes Array zurück.
     * @param {object[]} interpolatedData - Die interpolierten Wetterdaten.
     * @returns {Array<{cover: string, base: number}>} Ein Array von Wolkenschicht-Objekten.
     * @private
     */
function findCloudLayers(interpolatedData) {
    if (!interpolatedData || interpolatedData.length === 0) {
        return [];
    }

    const reportedLayers = [];
    let lastReportedCategory = null;
    const categoryOrder = { 'FEW': 1, 'SCT': 2, 'BKN': 3, 'OVC': 4 };

    const getMetarCategory = (cc) => {
        /* Alle Bedeckungsgrade
        if (cc <= 5) return null;
        if (cc <= 25) return 'FEW';
        if (cc <= 50) return 'SCT';
        if (cc <= 87) return 'BKN';
        return 'OVC';*/

        // Nur Ceiling: 
        if (cc <= 50) return null; // Ignoriert SKC, FEW und SCT
        if (cc <= 87) return 'BKN';
        return 'OVC';
    };

    // NEU: Überspringe den ersten Punkt (Index 0 = Bodenniveau)
    for (const point of interpolatedData.slice(1)) {

        const currentCategory = getMetarCategory(point.cc);

        // --- NEUES DEBUG-LOG ---
        if (point.cc > 5 && point.cc <= 50) { // Wir loggen Wolken, die wir jetzt ignorieren (FEW/SCT)
            //console.log(`[findCloudLayers] IGNORIERT: Höhe ${point.displayHeight}m, Bedeckung: ${point.cc}% (FEW/SCT)`);
        }
        // --- ENDE DEBUG-LOG ---

        if (!currentCategory || reportedLayers.length >= 3) {
            continue;
        }

        const isNewLayer = !lastReportedCategory || categoryOrder[currentCategory] > categoryOrder[lastReportedCategory];
        if (isNewLayer) {

            // --- NEUES DEBUG-LOG ---
            console.log(`%c[findCloudLayers] GEFUNDEN: Höhe ${point.displayHeight}m, Bedeckung: ${point.cc}% (${currentCategory})`, "color: green; font-weight: bold;");
            // --- ENDE DEBUG-LOG ---

            reportedLayers.push({
                cover: currentCategory,
                base: point.displayHeight // Höhe AGL in Metern
            });
            lastReportedCategory = currentCategory;
        }
    }
    return reportedLayers;
}

/**
 * KORRIGIERTE FUNKTION: Nutzt nun findCloudLayers und kümmert sich nur noch um die Formatierung.
 */
function getCloudLayersForMetar(interpolatedData, heightUnit) {
    const layers = Utils.findCloudLayers(interpolatedData);

    if (layers.length === 0) {
        return 'SKC'; // Sky Clear
    }

    return layers.map(layer => {
        const heightInMeters = layer.base;
        let formattedHeight;
        let displayUnit;

        if (heightUnit === 'ft') {
            formattedHeight = Math.round(Utils.convertHeight(heightInMeters, 'ft') / 100) * 100;
            displayUnit = 'ft';
        } else {
            formattedHeight = Math.round(heightInMeters / 50) * 50;
            displayUnit = 'm';
        }
        return `${layer.cover} ${formattedHeight}${displayUnit}`;
    }).join(', ');
}