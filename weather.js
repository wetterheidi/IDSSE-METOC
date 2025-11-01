// weather.js
import { WARN_FACTORS } from './config.js';
import { getCache, setCache } from './db.js';

/**
 * Teilt ein Array in kleinere Stapel (Chunks) auf.
 * @param {Array} array - Das Quell-Array
 * @param {number} size - Die maximale Größe eines Chunks
 * @returns {Array[]} Ein Array von Arrays (die Chunks)
 */
function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

/**
 * Erstellt ein leeres Summary-Objekt (für Fehlerfälle oder Initialisierung)
 */
export function getEmptySummary() {
    return {
        wind: { triggered: false, max: 0, hourlyStatus: {}, hourlyAlarms: new Set(), hourlyData: [] },
        temp: { triggered: false, min: 999, hourlyStatus: {}, hourlyAlarms: new Set(), hourlyData: [] },
        vis: { triggered: false, min: 99999, hourlyStatus: {}, hourlyAlarms: new Set(), hourlyData: [] },
        cloud: { triggered: false, min: 99999, hourlyStatus: {}, hourlyAlarms: new Set(), hourlyData: [] },
        precip: { triggered: false, max: 0, hourlyStatus: {}, hourlyAlarms: new Set(), hourlyData: [] },
        combined: { triggered: false, hourlyStatus: {} },
        error: null
    };
}

/**
 * Holt Daten via "Tiling" (Kacheln) und nutzt Caching.
 * (Version 5.0: "Kugelsicher")
 */
export async function fetchAndCheckProfile(profile, modelInfo, gridPoints) {
    
    // 1. Eindeutigen Cache-Schlüssel erstellen
    // (Wir nehmen an, modelInfo ist NIE null im Live-Modus)
    const cacheKey = `${profile.id}_${modelInfo.apiName}_${modelInfo.runTimeISO}`;

    // 2. Im Cache nachsehen
    try {
        const cachedData = await getCache(cacheKey);
        // Cache ist "frisch", wenn er jünger als 30 Minuten ist
        const THIRTY_MINUTES = 30 * 60 * 1000; 
        if (cachedData && (Date.now() - cachedData.timestamp < THIRTY_MINUTES)) {
            console.log(`%cDATEN AUS CACHE GELADEN: ${cacheKey}`, "color: green; font-weight: bold;");
            return cachedData.summary; // SOFORT FERTIG!
        }
    } catch (e) {
        console.warn("Cache-Lesefehler:", e);
    }

    // 3. Cache "kalt" -> Tiling-Logik (Kacheln)
    console.warn(`%cCACHE KALT. FÜHRE LIVE-FETCH AUS: ${cacheKey}`, "color: orange;");

    if (!gridPoints || !gridPoints.features || gridPoints.features.length === 0) {
        return { error: "Keine Sampling-Punkte zum Abfragen.", ...getEmptySummary() };
    }

    // 4. Punkte in 50er-Stapel "zerhacken"
    const CHUNK_SIZE = 50; 
    const pointChunks = chunkArray(gridPoints.features, CHUNK_SIZE);
    
    let allApiResponses = []; // Hier sammeln wir ALLE Antworten
    const hourlyParams = 'temperature_2m,windgusts_10m,visibility,cloud_base,precipitation_probability';

    console.log(`Starte Tiling-Fetch: ${gridPoints.features.length} Punkte in ${pointChunks.length} Stapeln à ${CHUNK_SIZE}.`);

    // 5. Sequenzielle Schleife (unsere "Spam-Bremse")
    for (const chunk of pointChunks) {
        const lats = chunk.map(p => p.geometry.coordinates[1].toFixed(2)).join(',');
        const lons = chunk.map(p => p.geometry.coordinates[0].toFixed(2)).join(',');
        
        let apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=${hourlyParams}&forecast_days=1`;
        
        if (modelInfo && modelInfo.apiName && modelInfo.runTimeISO) {
            apiUrl += `&models=${modelInfo.apiName}&forecast_run=${modelInfo.runTimeISO}`;
        } else {
            apiUrl += `&models=auto`;
        }

        try {
            // WARTEN auf diesen einen Stapel
            const response = await fetch(apiUrl);
            if (!response.ok) {
                // Wenn EIN Stapel fehlschlägt, bricht die ganze Prüfung ab
                throw new Error(`API-Fehler bei Chunk: ${response.statusText}`);
            }
            const data = await response.json();
            
            // OpenMeteo liefert ein Array, eines pro Standort
            const locationsData = Array.isArray(data) ? data : [data];
            // Füge die Ergebnisse dem Master-Array hinzu
            allApiResponses.push(...locationsData);
            
            // (Optionale kleine Pause, um die API zu schonen)
            // await new Promise(resolve => setTimeout(resolve, 100)); 

        } catch (err) {
            console.error("Fehler beim Abrufen eines Tiling-Stapels:", err);
            return Object.assign(getEmptySummary(), { error: err.message });
        }
    } // Ende der Tiling-Schleife

    // 6. Daten zusammennähen
    // Unsere 'checkThresholds_Sampling' (aus Schritt 80) ist perfekt,
    // sie erwartet genau dieses 'allApiResponses'-Format!
    console.log(`Tiling-Fetch beendet. Nähe ${allApiResponses.length} Punkte zusammen.`);
    const finalSummary = checkThresholds_Sampling(profile, allApiResponses);

    // 7. Ergebnis im Cache speichern
    try {
        await setCache(cacheKey, finalSummary);
    } catch (e) {
        console.warn("Cache-Schreibfehler:", e);
    }

    // 8. Fertig
    return finalSummary;
}

/**
 * Prüft die "flache" Array-Antwort des Sampling-Ansatzes.
 * (Version 2.0: Vollständig implementiert)
 */
function checkThresholds_Sampling(profile, data) {
    const rules = profile.rules;
    const summary = getEmptySummary();
    const statusParams = ['wind', 'temp', 'vis', 'cloud', 'precip'];
    
    const locationsData = Array.isArray(data) ? data : [data];

    if (!locationsData[0] || !locationsData[0].hourly || !locationsData[0].hourly.time) {
        console.error("API-Antwort ist ungültig, 'hourly.time' fehlt.", data);
        return Object.assign(getEmptySummary(), { error: "Ungültige API-Antwort." });
    }

    // 1. Stunden-Header initialisieren (0-23)
    const timeStamps = locationsData[0].hourly.time.map(t => new Date(t).getHours());
    timeStamps.forEach((hour, h) => {
        statusParams.forEach(param => {
            if (summary[param]) {
                 summary[param].hourlyStatus[h] = 'ok';
                 summary.wind.hourlyData[h] = -Infinity;
                 summary.temp.hourlyData[h] = +Infinity;
                 summary.vis.hourlyData[h] = +Infinity;
                 summary.cloud.hourlyData[h] = +Infinity;
                 summary.precip.hourlyData[h] = -Infinity;
            }
        });
        summary.combined.hourlyStatus[h] = 'ok';
    });

    const getWorseStatus = (s1, s2) => (s1 === 'alarm' || s2 === 'alarm') ? 'alarm' : (s1 === 'warn' || s2 === 'warn') ? 'warn' : 'ok';
    
    // 2. Durch alle Standorte (Punkte) iterieren
    locationsData.forEach(locationData => {
        const hourly = locationData.hourly;
        const locationId = `${locationData.latitude.toFixed(2)},${locationData.longitude.toFixed(2)}`;

        // Iteriere durch die Stunden (0-23)
        hourly.time.forEach((time, h) => { // 'h' ist der Index (0-23)
            const hour = timeStamps[h]; 
            let currentStatus;
            
            const wind = hourly.windgusts_10m[h];
            const temp = hourly.temperature_2m[h];
            const vis = hourly.visibility[h];
            const cloud = hourly.cloud_base[h];
            const precip = hourly.precipitation_probability[h];
            
            if (wind > summary.wind.hourlyData[h]) summary.wind.hourlyData[h] = wind;
            if (temp < summary.temp.hourlyData[h]) summary.temp.hourlyData[h] = temp;
            if (vis < summary.vis.hourlyData[h]) summary.vis.hourlyData[h] = vis;
            if (cloud !== null && cloud < summary.cloud.hourlyData[h]) summary.cloud.hourlyData[h] = cloud;
            if (precip > summary.precip.hourlyData[h]) summary.precip.hourlyData[h] = precip;

            // --- Regel-Checks (Vollständig) ---
            if (rules.maxWind) {
                if (wind > rules.maxWind) {
                    currentStatus = 'alarm';
                    summary.wind.triggered = true;
                    if (wind > summary.wind.max) summary.wind.max = wind;
                    if (!summary.wind.hourlyAlarms[hour]) summary.wind.hourlyAlarms[hour] = new Set();
                    summary.wind.hourlyAlarms[hour].add(locationId);
                } else if (wind > rules.maxWind * WARN_FACTORS.wind) {
                    currentStatus = 'warn';
                } else {
                    currentStatus = 'ok';
                }
                summary.wind.hourlyStatus[hour] = getWorseStatus(summary.wind.hourlyStatus[hour], currentStatus);
            }
            if (rules.minTemp !== null) {
                if (temp < rules.minTemp) {
                    currentStatus = 'alarm';
                    summary.temp.triggered = true;
                    if (temp < summary.temp.min) summary.temp.min = temp;
                    if (!summary.temp.hourlyAlarms[hour]) summary.temp.hourlyAlarms[hour] = new Set();
                    summary.temp.hourlyAlarms[hour].add(locationId);
                } else if (temp < rules.minTemp + WARN_FACTORS.temp) {
                    currentStatus = 'warn';
                } else {
                    currentStatus = 'ok';
                }
                summary.temp.hourlyStatus[hour] = getWorseStatus(summary.temp.hourlyStatus[hour], currentStatus);
            }
            if (rules.minVis) {
                if (vis < rules.minVis) {
                    currentStatus = 'alarm';
                    summary.vis.triggered = true;
                    if (vis < summary.vis.min) summary.vis.min = vis;
                    if (!summary.vis.hourlyAlarms[hour]) summary.vis.hourlyAlarms[hour] = new Set();
                    summary.vis.hourlyAlarms[hour].add(locationId);
                } else if (vis < rules.minVis * WARN_FACTORS.vis) {
                    currentStatus = 'warn';
                } else {
                    currentStatus = 'ok';
                }
                summary.vis.hourlyStatus[hour] = getWorseStatus(summary.vis.hourlyStatus[hour], currentStatus);
            }
            if (rules.minCloud) {
                if (cloud !== null && cloud < rules.minCloud) {
                    currentStatus = 'alarm';
                    summary.cloud.triggered = true;
                    if (cloud < summary.cloud.min) summary.cloud.min = cloud;
                    if (!summary.cloud.hourlyAlarms[hour]) summary.cloud.hourlyAlarms[hour] = new Set();
                    summary.cloud.hourlyAlarms[hour].add(locationId);
                } else if (cloud !== null && cloud < rules.minCloud * WARN_FACTORS.cloud) {
                    currentStatus = 'warn';
                } else {
                    currentStatus = 'ok';
                }
                summary.cloud.hourlyStatus[hour] = getWorseStatus(summary.cloud.hourlyStatus[hour], currentStatus);
            }
            if (rules.maxPrecipProb !== null) {
                if (precip > rules.maxPrecipProb) {
                    currentStatus = 'alarm';
                    summary.precip.triggered = true;
                    if (precip > summary.precip.max) summary.precip.max = precip;
                    if (!summary.precip.hourlyAlarms[hour]) summary.precip.hourlyAlarms[hour] = new Set();
                    summary.precip.hourlyAlarms[hour].add(locationId);
                } else if (precip > rules.maxPrecipProb * WARN_FACTORS.precip) {
                    currentStatus = 'warn';
                } else {
                    currentStatus = 'ok';
                }
                summary.precip.hourlyStatus[hour] = getWorseStatus(summary.precip.hourlyStatus[hour], currentStatus);
            }
        });
    });

    // --- Kombi-Zeile berechnen (Vollständig) ---
    timeStamps.forEach(hour => {
        let combinedStatus = 'ok'; 
        if (rules.maxWind) combinedStatus = getWorseStatus(combinedStatus, summary.wind.hourlyStatus[hour]);
        if (rules.minTemp !== null) combinedStatus = getWorseStatus(combinedStatus, summary.temp.hourlyStatus[hour]);
        if (rules.minVis) combinedStatus = getWorseStatus(combinedStatus, summary.vis.hourlyStatus[hour]);
        if (rules.minCloud) combinedStatus = getWorseStatus(combinedStatus, summary.cloud.hourlyStatus[hour]);
        if (rules.maxPrecipProb !== null) combinedStatus = getWorseStatus(combinedStatus, summary.precip.hourlyStatus[hour]);
        
        summary.combined.hourlyStatus[hour] = combinedStatus;
        if (combinedStatus !== 'ok') summary.combined.triggered = true;
    });

    return summary; 
}

/**
 * Berechnet die Sampling-Punkte (graue Punkte) für ein GeoJSON.
 * Macht KEINEN API-Anruf.
 */
export function getGridPoints(geojson) {
    try {
        const bbox = turf.bbox(geojson); // [minLon, minLat, maxLon, maxLat]
        // TODO: Später die 'cellSide' dynamisch an das Modell (z.B. ICON-D2) anpassen
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

