// weather.js (Version 2.0 - Config-Driven)
import { getCache, setCache } from './db.js'; // Importiere Cache-Helfer
// Importiere das NEUE "Gehirn"
import { METRICS_CONFIG, getApiParams } from './metricsConfig.js';
import { WEATHER_MODELS } from './config.js';

/**
 * Berechnet abgeleitete Metriken.
 * @param {string} summaryKey - Der Schlüssel der Metrik (z.B. 'windchill')
 * @param {object} hourly - Das Open-Meteo 'hourly'-Objekt für EINEN Punkt
 * @param {int} h - Der Index der Stunde (0-23)
 * @returns {number | null} - Der berechnete Wert oder null
 */
function calculateDerivedValue(metric, hourly, h) { // <-- Akzeptiert 'metric'
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

            case 'cloudBase':
                // ALT: const metricConfig = METRICS_CONFIG[summaryKey]; // <-- FEHLER
                // NEU: Wir haben die Config bereits als 'metric'
                if (!metric.pressureLevels) {
                    console.error("Config für cloudBase/pressureLevels fehlt!");
                    return null;
                }

                const cc = hourly['cloud_cover'] ? hourly['cloud_cover'][h] : null;
                // (Wir ignorieren 'cc' für den Test)

                let verticalProfile = [];

                // ALT: for (const level of metricConfig.pressureLevels) {
                // NEU:
                for (const level of metric.pressureLevels) {
                    const rh_key = `relative_humidity_${level}hPa`;
                    const h_key = `geopotential_height_${level}hPa`;

                    if (hourly[rh_key] && hourly[h_key]) {
                        const rh = hourly[rh_key][h];
                        const height = hourly[h_key][h];

                        if (rh !== null && height !== null) {
                            verticalProfile.push({ level: level, rh: rh, height: height });
                        }
                    }
                }

                if (verticalProfile.length < 1) {
                    console.warn(`[Test CloudBase] Konnte keine gültigen Druckstufen-Daten für Stunde ${h} finden.`);
                    return null;
                }

                verticalProfile.sort((a, b) => b.level - a.level); // 1000hPa zuerst

                const testValue = verticalProfile[0].height;

                if (h === 0) { // Logge nur einmal pro Prüfung
                    console.log(`[Test CloudBase] Rohdaten (Stunde 0): ${verticalProfile[0].level}hPa -> ${testValue}m`);
                }

                return testValue;

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

    if (!locationsData || locationsData.length === 0 || !locationsData[0] || !locationsData[0].hourly || !locationsData[0].hourly.time) {
        console.error("API-Antwort ist ungültig, 'hourly.time' fehlt.", locationsData);
        return Object.assign(getEmptySummary(), { error: "Ungültige API-Antwort." });
    }

    // 1. Stunden-Header initialisieren
    const timeStamps = locationsData[0].hourly.time.map(t => new Date(t).getUTCHours());

    timeStamps.slice(0, 24).forEach((hour, h) => {
        metrics.forEach(metric => {
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
                    value = calculateDerivedValue(metric, hourly, h); // Übergebe die *gesamte* Metrik-Config
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

                    if (currentStatus === 'alarm') {
                        summary[summaryKey].triggered = true;
                        summary[summaryKey].hourlyAlarms[hour].add(locationId);
                    }

                } else {
                    if (ruleName === 'minTemp') {
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

