// weather.js (Version 2.0 - Config-Driven)
import { getCache, setCache } from './db.js'; // Importiere Cache-Helfer
// Importiere das NEUE "Gehirn"
import { METRICS_CONFIG, getApiParams, getWarnFactor } from './metricsConfig.js';

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

export async function fetchAndCheckProfile(profile, modelInfo, gridPoints) {

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
    const { hourly, daily } = getApiParams(Object.values(METRICS_CONFIG));

    console.log(`Starte Tiling-Fetch: ${gridPoints.features.length} Punkte...`);
    console.log(`Hourly-Params: ${hourly}`);
    console.log(`Daily-Params: ${daily}`);

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
    const finalSummary = checkThresholds_Sampling(profile, allApiResponses);

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
function checkThresholds_Sampling(profile, locationsData) {
    const rules = profile.rules;
    const summary = getEmptySummary();
    const metrics = Object.values(METRICS_CONFIG); // Alle Metriken, die wir prüfen

    if (!locationsData || locationsData.length === 0 || !locationsData[0] || !locationsData[0].hourly || !locationsData[0].hourly.time) {
        console.error("API-Antwort ist ungültig, 'hourly.time' fehlt.", locationsData);
        return Object.assign(getEmptySummary(), { error: "Ungültige API-Antwort." });
    }

    // 1. Stunden-Header initialisieren
    const timeStamps = locationsData[0].hourly.time.map(t => new Date(t).getUTCHours());

    timeStamps.forEach((hour, h) => {
        metrics.forEach(metric => {
            const key = metric.summaryKey;

            // 'temp' (min) ist die einzige Regel, die ohne Daten 'ok' ist.
            // Alle 'max'-Regeln (wind, cloud, precip) und 'min'-Regeln (vis) sind 'no-data'.
            const initialStatus = 'no-data';

            summary[key].hourlyStatus[hour] = initialStatus;
            summary[key].hourlyAlarms[hour] = new Set();

            // hourlyData (für den Graphen) initialisieren
            // 'min'-Checks (temp, vis) suchen den kleinsten Wert (+Infinity)
            // 'max'-Checks (wind, cloud, precip) suchen den größten Wert (-Infinity)
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
        hourly.time.forEach((time, h) => {
            if (h >= timeStamps.length) return;
            const hour = timeStamps[h];

            // --- NEUE DYNAMISCHE SCHLEIFE ---
            // Iteriere durch alle konfigurierten Metriken
            metrics.forEach(metric => {
                const ruleName = metric.ruleName;
                const limit = rules[ruleName];

                // Springe zur nächsten Metrik, wenn diese Regel im Profil nicht gesetzt ist
                // (Prüfung auf null/undefined, außer bei 'minTemp' und 'maxPrecipProb', wo 0 ein gültiger Wert sein könnte)
                if (limit === null || limit === undefined) {
                    if (ruleName !== 'minTemp' && ruleName !== 'maxPrecipProb') {
                        return;
                    }
                }

                const apiName = metric.apiName;
                const summaryKey = metric.summaryKey;

                // --- NEUE LOGIK: Woher kommt der Wert? ---
                let value = null;

                if (metric.paramType === 'hourly') {
                    // VERHALTEN WIE BISHER
                    const hasData = hourly[apiName] !== undefined && hourly[apiName] !== null;
                    value = hasData ? hourly[apiName][h] : null;

                } else if (metric.paramType === 'daily') {
                    // NEUES VERHALTEN: Nimm den vorgeladenen Tageswert
                    value = dailyValueCache[summaryKey];
                    // Dieser EINE Wert (z.B. 10°C Max-Temp) wird jetzt für
                    // die Stunde 'h' verwendet und mit dem Limit verglichen.
                }

                // Graph-Aggregation (Aggregiere nur gültige Zahlen)
                if (value !== null && isFinite(value)) {
                    if (metric.checkType === 'min') {
                        if (value < summary[summaryKey].hourlyData[h]) summary[summaryKey].hourlyData[h] = value;
                    } else { // 'max'
                        if (value > summary[summaryKey].hourlyData[h]) summary[summaryKey].hourlyData[h] = value;
                    }
                }

                // --- Regel-Check ---
                let currentStatus = 'no-data'; // Standard-Annahme

                // 1. Prüfen, ob wir überhaupt einen gültigen, numerischen Wert haben.
                //    (value !== null) UND (isFinite(value))
                //    isFinite() fängt null, undefined, Infinity, etc. ab.
                if (value !== null && isFinite(value)) {

                    // Wir haben eine echte Zahl, jetzt die Regeln prüfen:
                    const warnFactor = getWarnFactor(metric);

                    if (metric.checkType === 'min') {
                        // MIN-Check (z.B. Temperatur, Sicht)
                        if (value < limit) {
                            currentStatus = 'alarm';
                            summary[summaryKey].triggered = true;
                            if (value < summary[summaryKey].value) summary[summaryKey].value = value;
                            summary[summaryKey].hourlyAlarms[hour].add(locationId);
                        } else if (metric.ruleName === 'minTemp' && value < (limit + warnFactor)) { // temp: limit + 2
                            currentStatus = 'warn';
                        } else if (metric.ruleName === 'minVis' && value < (limit * warnFactor)) { // vis: limit * 1.2
                            currentStatus = 'warn';
                        } else {
                            currentStatus = 'ok';
                        }
                    } else {
                        // MAX-Check (z.B. Wind, Wolken, Niederschlag)
                        if (value > limit) {
                            currentStatus = 'alarm';
                            summary[summaryKey].triggered = true;
                            if (value > summary[summaryKey].value) summary[summaryKey].value = value;
                            summary[summaryKey].hourlyAlarms[hour].add(locationId);
                        } else if (value > (limit * warnFactor)) { // z.B. limit * 0.9
                            currentStatus = 'warn';
                        } else {
                            currentStatus = 'ok';
                        }
                    }

                } else {
                    // Der Wert ist 'null' oder ungültig (z.B. Infinity)

                    // Sonderfall: 'minTemp' ist 'ok', wenn keine Daten da sind (konservativ)
                    if (ruleName === 'minTemp') {
                        currentStatus = 'ok';
                    } else {
                        // Alle anderen Parameter sind 'no-data'
                        currentStatus = 'no-data';
                    }
                }

                // Schlechtesten Status für diese Stunde setzen
                summary[summaryKey].hourlyStatus[hour] = getWorseStatus(summary[summaryKey].hourlyStatus[hour], currentStatus);
            });
            // --- ENDE DYNAMISCHE SCHLEIFE ---
        });
    });

    // --- Kombi-Zeile berechnen (Vollständig) ---
    timeStamps.forEach((hour, h) => {
        let combinedStatus = 'no-data';

        metrics.forEach(metric => {
            const ruleName = metric.ruleName;
            const limit = rules[ruleName];

            // Berücksichtige nur, wenn die Regel im Profil aktiv ist
            if (limit !== null && limit !== undefined) {
                combinedStatus = getWorseStatus(combinedStatus, summary[metric.summaryKey].hourlyStatus[hour]);
            }
            // Sonderfall: minTemp (wo 0 gültig ist)
            else if (ruleName === 'minTemp' && limit !== null) {
                combinedStatus = getWorseStatus(combinedStatus, summary[metric.summaryKey].hourlyStatus[hour]);
            }
            // Sonderfall: maxPrecipProb (wo 0 gültig ist)
            else if (ruleName === 'maxPrecipProb' && limit !== null) {
                combinedStatus = getWorseStatus(combinedStatus, summary[metric.summaryKey].hourlyStatus[hour]);
            }
        });

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