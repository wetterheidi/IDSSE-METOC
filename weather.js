// weather.js
import { WARN_FACTORS } from './config.js';

/**
 * Holt Daten für EIN Profil (via Bounding Box), prüft die Regeln und GIBT DAS ERGEBNIS ZURÜCK.
 */
export async function fetchAndCheckProfile(profile, modelInfo) {

    const geojson = profile.geojson;
    let bbox;
    try {
        bbox = turf.bbox(geojson); // [minLon, minLat, maxLon, maxLat]
    } catch (e) {
        console.error("Turf.js BBox-Fehler:", e);
        return { error: "Turf.js BBox-Fehler", ...getEmptySummary() };
    }

    const bboxString = `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`; // lat,lon,lat,lon
    const hourlyParams = 'temperature_2m,windgusts_10m,visibility,cloud_base,precipitation_probability';
    let apiUrl = `https://api.open-meteo.com/v1/forecast?bounding_box=${bboxString}&hourly=${hourlyParams}&forecast_days=1`;

    // Füge Modell-Parameter hinzu, WENN sie definiert sind
    if (modelInfo && modelInfo.apiName && modelInfo.runTimeISO) {
        // Hinweis: Der Parameter für die Laufzeit ist 'forecast_run'
        // (Das habe ich aus deinem DZMaster-Code gelernt)
        apiUrl += `&models=${modelInfo.apiName}&forecast_run=${modelInfo.runTimeISO}`;
    } else {
        // Fallback auf "auto", wenn kein Modell gewählt ist
        apiUrl += `&models=auto`;
    }
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`API-Fehler: ${response.statusText}`);
        }
        const data = await response.json();

        // WICHTIG: Wir übergeben 'data' (die GANZE Antwort) und das 'geojson'
        const summary = checkThresholds(profile, data, geojson);
        return summary;

    } catch (err) {
        console.error("Fehler beim Abrufen der BBox-Wetterdaten:", err);
        return { error: err.message, ...getEmptySummary() };
    }
}

/**
 * Prüft BBox-Raster-Daten gegen Regeln und Polygon.
 */
export function checkThresholds(profile, data, geojson) {
    const rules = profile.rules;
    const summary = getEmptySummary();
    const statusParams = ['wind', 'temp', 'vis', 'cloud', 'precip'];

    // API kann manchmal 'hourly' nicht liefern
    if (!data.hourly || !data.hourly.time) {
        summary.error = "Keine 'hourly' Daten in API-Antwort gefunden.";
        return summary;
    }

    const timeStamps = data.hourly.time.map(t => new Date(t).getHours());
    timeStamps.forEach(hour => {
        statusParams.forEach(param => {
            if (summary[param]) summary[param].hourlyStatus[hour] = 'ok';
        });
    });

    const gridLats = data.latitude;
    const gridLons = data.longitude;
    const numHours = timeStamps.length;

    const h_wind = data.hourly.windgusts_10m;
    const h_temp = data.hourly.temperature_2m;
    const h_vis = data.hourly.visibility;
    const h_cloud = data.hourly.cloud_base;
    const h_precip = data.hourly.precipitation_probability;

    let validPointsFound = 0;

    for (let i = 0; i < gridLats.length; i++) {
        const pointLat = gridLats[i];
        const pointLon = gridLons[i];
        const point = turf.point([pointLon, pointLat]);
        const isInside = turf.booleanPointInPolygon(point, geojson);

        if (!isInside) continue;

        const locationId = `${pointLat.toFixed(2)},${pointLon.toFixed(2)}`; // Format "lat,lon"

        validPointsFound++;

        for (let h = 0; h < numHours; h++) {
            const hour = timeStamps[h];
            const dataIndex = (i * numHours) + h;
            let currentStatus;

            // Wind
            if (rules.maxWind) {
                const wind = h_wind[dataIndex];
                if (wind > rules.maxWind) {
                    currentStatus = 'alarm';
                    if (wind > summary.wind.max) summary.wind.max = wind;
                    summary.wind.triggered = true;
                    summary.wind.affectedPoints.add(locationId);
                } else if (wind > rules.maxWind * WARN_FACTORS.wind) {
                    currentStatus = 'warn';
                } else {
                    currentStatus = 'ok';
                }
                summary.wind.hourlyStatus[hour] = getWorseStatus(summary.wind.hourlyStatus[hour], currentStatus);
            }
            // Temp
            if (rules.minTemp !== null) {
                const temp = h_temp[dataIndex];
                if (temp < rules.minTemp) {
                    currentStatus = 'alarm';
                    if (temp < summary.temp.min) summary.temp.min = temp;
                    summary.temp.triggered = true;
                    summary.temp.affectedPoints.add(locationId);
                } else if (temp < rules.minTemp + WARN_FACTORS.temp) {
                    currentStatus = 'warn';
                } else {
                    currentStatus = 'ok';
                }
                summary.temp.hourlyStatus[hour] = getWorseStatus(summary.temp.hourlyStatus[hour], currentStatus);
            }
            // Sicht
            if (rules.minVis) {
                const vis = h_vis[dataIndex];
                if (vis < rules.minVis) {
                    currentStatus = 'alarm';
                    if (vis < summary.vis.min) summary.vis.min = vis;
                    summary.vis.triggered = true;
                    summary.vis.affectedPoints.add(locationId);
                } else if (vis < rules.minVis * WARN_FACTORS.vis) {
                    currentStatus = 'warn';
                } else {
                    currentStatus = 'ok';
                }
                summary.vis.hourlyStatus[hour] = getWorseStatus(summary.vis.hourlyStatus[hour], currentStatus);
            }
            // Wolken
            if (rules.minCloud) {
                const cloud = h_cloud[dataIndex];
                if (cloud !== null && cloud < rules.minCloud) {
                    currentStatus = 'alarm';
                    if (cloud < summary.cloud.min) summary.cloud.min = cloud;
                    summary.cloud.triggered = true;
                    summary.cloud.affectedPoints.add(locationId);
                } else if (cloud !== null && cloud < rules.minCloud * WARN_FACTORS.cloud) {
                    currentStatus = 'warn';
                } else {
                    currentStatus = 'ok';
                }
                summary.cloud.hourlyStatus[hour] = getWorseStatus(summary.cloud.hourlyStatus[hour], currentStatus);
            }
            // Niederschlag
            if (rules.maxPrecipProb !== null) {
                const precip = h_precip[dataIndex];
                if (precip > rules.maxPrecipProb) {
                    currentStatus = 'alarm';
                    if (precip > summary.precip.max) summary.precip.max = precip;
                    summary.precip.triggered = true;
                    summary.precip.affectedPoints.add(locationId);
                } else if (precip > rules.maxPrecipProb * WARN_FACTORS.precip) {
                    currentStatus = 'warn';
                } else {
                    currentStatus = 'ok';
                }
                summary.precip.hourlyStatus[hour] = getWorseStatus(summary.precip.hourlyStatus[hour], currentStatus);
            }
        }
    }

    if (validPointsFound === 0) {
        summary.error = "Keine Datenpunkte im Polygon gefunden.";
    }

    const getWorseStatus = (s1, s2) => { // (Wir brauchen den Helfer hier nochmal)
        if (s1 === 'alarm' || s2 === 'alarm') return 'alarm';
        if (s1 === 'warn' || s2 === 'warn') return 'warn';
        return 'ok';
    };

    timeStamps.forEach(hour => {
        let combinedStatus = 'ok'; // Starte unschuldig

        // Gehe alle Parameter durch
        if (rules.maxWind) combinedStatus = getWorseStatus(combinedStatus, summary.wind.hourlyStatus[hour]);
        if (rules.minTemp !== null) combinedStatus = getWorseStatus(combinedStatus, summary.temp.hourlyStatus[hour]);
        if (rules.minVis) combinedStatus = getWorseStatus(combinedStatus, summary.vis.hourlyStatus[hour]);
        if (rules.minCloud) combinedStatus = getWorseStatus(combinedStatus, summary.cloud.hourlyStatus[hour]);
        if (rules.maxPrecipProb !== null) combinedStatus = getWorseStatus(combinedStatus, summary.precip.hourlyStatus[hour]);

        summary.combined.hourlyStatus[hour] = combinedStatus;
        if (combinedStatus !== 'ok') {
            summary.combined.triggered = true;
        }
    });

    return summary;
}

/**
 * Holt nur die Raster-Punkte für die Anzeige.
 * (Dupliziert den API-Call, aber sauberer als 'fetchAndCheckProfile' damit zu belasten)
 */
export async function getGridPoints(geojson) {
    let bbox;
    try {
        bbox = turf.bbox(geojson); // [minLon, minLat, maxLon, maxLat]
    } catch (e) {
        return { error: "Turf.js BBox-Fehler" };
    }
    const bboxString = `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`;
    const minimalHourlyParam = 'temperature_2m';
    const apiUrl = `https://api.open-meteo.com/v1/forecast?bounding_box=${bboxString}&hourly=${minimalHourlyParam}&forecast_days=1`;
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`API-Fehler: ${response.statusText}`);
        const data = await response.json();

        const points = [];
        for (let i = 0; i < data.latitude.length; i++) {
            points.push([data.longitude[i], data.latitude[i]]); // [Lon, Lat]
        }
        return { gridPoints: turf.featureCollection(points.map(p => turf.point(p))) };
    } catch (err) {
        return { error: err.message };
    }
}


/**
 * Erstellt ein leeres Summary-Objekt (für Fehlerfälle oder Initialisierung)
 */
export function getEmptySummary() {
    return {
        wind: { triggered: false, max: 0, hourlyStatus: {}, affectedPoints: new Set() },
        temp: { triggered: false, min: 999, hourlyStatus: {}, affectedPoints: new Set() },
        vis: { triggered: false, min: 99999, hourlyStatus: {}, affectedPoints: new Set() },
        cloud: { triggered: false, min: 99999, hourlyStatus: {}, affectedPoints: new Set() },
        precip: { triggered: false, max: 0, hourlyStatus: {}, affectedPoints: new Set() },
        combined: { triggered: false, hourlyStatus: {} },
        error: null
    };
}