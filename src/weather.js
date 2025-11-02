// weather.js
import { WARN_FACTORS } from './config.js';
import { getCache, setCache } from './db.js'; // Importiere Cache-Helfer

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
 * Erstellt ein leeres Summary-Objekt (Feature-komplett)
 */
export function getEmptySummary() {
    return {
        wind: { triggered: false, max: 0, hourlyStatus: {}, hourlyAlarms: {}, hourlyData: [] },
        temp: { triggered: false, min: 999, hourlyStatus: {}, hourlyAlarms: {}, hourlyData: [] },
        vis: { triggered: false, min: 99999, hourlyStatus: {}, hourlyAlarms: {}, hourlyData: [] },
        cloud: { triggered: false, min: 99999, hourlyStatus: {}, hourlyAlarms: {}, hourlyData: [] },
        precip: { triggered: false, max: 0, hourlyStatus: {}, hourlyAlarms: {}, hourlyData: [] },
        combined: { triggered: false, hourlyStatus: {} },
        error: null
    };
}

/**
 * Berechnet die Sampling-Punkte (graue Punkte) für ein GeoJSON.
 * Macht KEINEN API-Anruf.
 */
export function getGridPoints(geojson) {
    // KUGELSICHERER CHECK (behebt den 'type'/'geometry' TypeError)
    if (!geojson || !geojson.geometry) {
        return { error: "Ungültiges GeoJSON (vielleicht null)." };
    }
    try {
        const bbox = turf.bbox(geojson); // [minLon, minLat, maxLon, maxLat]
        // TODO: Später die 'cellSide' dynamisch an das Modell (z.B. ICON-D2) anpassen
        const cellSide = 10; // km
        const options = { units: 'kilometers' };
        const pointGrid = turf.pointGrid(bbox, cellSide, options);
        // WICHTIG: Wir geben ALLE Punkte im Raster zurück, NICHT die gefilterten.
        // Das Filtern (pointsWithinPolygon) ist langsam und redundant,
        // da 'checkThresholds_Sampling' das sowieso pro Punkt prüft.
        // ABER: Dein 'map.js' braucht das... wir ändern 'map.js'

        // Kompromiss: Wir benutzen die 'pointsInside' Logik von `weather_mock`
        const pointsInside = turf.pointsWithinPolygon(pointGrid, geojson);

        return { gridPoints: pointsInside }; // Gibt die GeoJSON-Punkte zurück

    } catch (e) {
        console.error("Turf.js Fehler in getGridPoints:", e);
        return { error: "Turf.js Fehler" };
    }
}

// --- 2. Die "Kachel-Engine" (Tiling + Caching) ---

export async function fetchAndCheckProfile(profile, modelInfo, gridPoints) {

    // 1. Eindeutigen Cache-Schlüssel erstellen
    const modelApiName = modelInfo ? modelInfo.apiName : 'auto';
    const modelRunISO = modelInfo ? modelInfo.runTimeISO : 'latest';
    const cacheKey = `${profile.id}_${modelApiName}_${modelRunISO}`;

    // 2. Im Cache nachsehen
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

    // 3. Cache "kalt" -> Tiling-Logik (Kacheln)
    console.warn(`%cCACHE KALT. FÜHRE LIVE-FETCH AUS: ${cacheKey}`, "color: orange;");

    if (!gridPoints || !gridPoints.features || gridPoints.features.length === 0) {
        return { error: "Keine Sampling-Punkte zum Abfragen.", ...getEmptySummary() };
    }

    // 4. Punkte in 50er-Stapel "zerhacken" (löst das URL-Längen-Problem)
    const CHUNK_SIZE = 50;
    const pointChunks = chunkArray(gridPoints.features, CHUNK_SIZE);

    let allApiResponses = [];
    const hourlyParams = 'temperature_2m,windgusts_10m,visibility,cloud_base,precipitation_probability';

    console.log(`Starte Tiling-Fetch: ${gridPoints.features.length} Punkte in ${pointChunks.length} Stapeln à ${CHUNK_SIZE}.`);

    // 5. Sequenzielle Schleife (löst das Rate-Limit-Problem)
    for (const chunk of pointChunks) {
        const lats = chunk.map(p => p.geometry.coordinates[1].toFixed(4)).join(',');
        const lons = chunk.map(p => p.geometry.coordinates[0].toFixed(4)).join(',');

        let apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=${hourlyParams}&forecast_days=1`;

        if (modelInfo && modelInfo.apiName) {
            
            // Füge immer das Modell hinzu (z.B. &models=auto oder &models=icon_d2)
            apiUrl += `&models=${modelInfo.apiName}`;

            // Füge forecast_run NUR hinzu, wenn es KEIN 'auto'-Modell ist.
            // Die Tiling-API bricht bei models=auto&forecast_run=... ab.
            if (modelInfo.apiName !== 'auto' && modelInfo.runTimeISO) {
                 apiUrl += `&forecast_run=${modelInfo.runTimeISO}`;
            }

        } else {
            // Fallback auf den alten 'auto'-Modus, falls modelInfo fehlt
            apiUrl += `&models=auto`;
        }

        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                // Behebt den 400 Bad Request, indem es die URL loggt
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

    // 6. Daten zusammennähen
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
 * (Vollständige Master-Version)
 */
function checkThresholds_Sampling(profile, locationsData) {
    const rules = profile.rules;
    const summary = getEmptySummary();
    const statusParams = ['wind', 'temp', 'vis', 'cloud', 'precip'];

    if (!locationsData || locationsData.length === 0 || !locationsData[0] || !locationsData[0].hourly || !locationsData[0].hourly.time) {
        console.error("API-Antwort ist ungültig, 'hourly.time' fehlt.", locationsData);
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
        // KUGELSICHERER CHECK (ERWEITERT):
        if (!locationData || !locationData.hourly || locationData.latitude === null || locationData.longitude === null) {
            return; // Überspringe diesen fehlerhaften Datenpunkt
        }

        const hourly = locationData.hourly;
        const locationId = `${locationData.latitude.toFixed(2)},${locationData.longitude.toFixed(2)}`;
        
        // Iteriere durch die Stunden (0-23)
        hourly.time.forEach((time, h) => {
            if (h >= timeStamps.length) return; // Sicherheitscheck
            const hour = timeStamps[h];
            let currentStatus;

            const wind = hourly.windgusts_10m[h];
            const temp = hourly.temperature_2m[h];
            const vis = hourly.visibility[h];
            const cloud = hourly.cloud_base[h];
            const precip = hourly.precipitation_probability[h];

            if (wind !== null && wind > summary.wind.hourlyData[h]) summary.wind.hourlyData[h] = wind;
            if (temp !== null && temp < summary.temp.hourlyData[h]) summary.temp.hourlyData[h] = temp;
            if (vis !== null && vis < summary.vis.hourlyData[h]) summary.vis.hourlyData[h] = vis;
            if (cloud !== null && cloud < summary.cloud.hourlyData[h]) summary.cloud.hourlyData[h] = cloud;
            if (precip !== null && precip > summary.precip.hourlyData[h]) summary.precip.hourlyData[h] = precip;

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
    timeStamps.forEach((hour, h) => {
        let combinedStatus = 'ok';
        if (rules.maxWind) combinedStatus = getWorseStatus(combinedStatus, summary.wind.hourlyStatus[h]);
        if (rules.minTemp !== null) combinedStatus = getWorseStatus(combinedStatus, summary.temp.hourlyStatus[h]);
        if (rules.minVis) combinedStatus = getWorseStatus(combinedStatus, summary.vis.hourlyStatus[h]);
        if (rules.minCloud) combinedStatus = getWorseStatus(combinedStatus, summary.cloud.hourlyStatus[h]);
        if (rules.maxPrecipProb !== null) combinedStatus = getWorseStatus(combinedStatus, summary.precip.hourlyStatus[h]);

        summary.combined.hourlyStatus[h] = combinedStatus;
        if (combinedStatus !== 'ok') summary.combined.triggered = true;
    });

    return summary;
}
