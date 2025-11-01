// weather_mock.js - Der "Fälscher" (Version 4.0: "Feature-Komplett")

import { getEmptySummary } from './weather.js'; // Holt die "Master"-Struktur
import { WARN_FACTORS } from './config.js'; // Holt die "Gelb"-Schwellen

export { getEmptySummary }; // Exportiert die Master-Struktur

/**
 * Simuliert das Holen von Grid-Punkten.
 */
export async function getGridPoints(geojson) {
    console.warn("%cDEMO-MODUS: Gefälschte Grid-Punkte.", "color: magenta;");
    const points = geojson.geometry.coordinates[0].map(p => turf.point(p));
    return Promise.resolve({ gridPoints: turf.featureCollection(points) });
}

/**
 * Gibt SOFORT ein gefälschtes, alarmierendes Wetter-Summary zurück.
 * Fälscht jetzt auch die 24h-Datenreihen für den Graphen.
 */
export async function fetchAndCheckProfile(profile, modelInfo) {
    console.warn(`%cDEMO-MODUS: Gefälschte Daten für "${profile.name}" geladen.`, "color: magenta; font-weight: bold;");
    
    const summary = getEmptySummary(); 
    const statusParams = ['wind', 'temp', 'vis', 'cloud', 'precip'];
    const rules = profile.rules; 
    if (!rules) { 
        console.error("Mock-Fehler: Profil hat keine 'rules'.");
        return summary;
    }

    // 1. Alle 24 Stunden initialisieren
    for (let h = 0; h < 24; h++) {
        statusParams.forEach(param => {
            if (summary[param]) summary[param].hourlyStatus[h] = 'ok';
        });
        summary.combined.hourlyStatus[h] = 'ok';
    }

    // 2. Realistische "Fake"-Zeitreihen für den Graphen erstellen
    summary.wind.hourlyData =   [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 95, 90, 85, (rules.maxWind || 60) + 10, 80, 70, 60, 50, 40, 30, 25, 20, 15]; // Peak um 15 Uhr
    summary.temp.hourlyData =   [ 5,  4,  3,  2,  1,  0, (rules.minTemp || 0) - 1, -1,  0,  2,  4,  6,  8, 10, 10,  9,  8,  7,  6,  5,  4,  3,  2,  1]; // Frost am Morgen
    summary.vis.hourlyData =    [9999, 9000, 8000, 7000, 6000, 5000, 4000, 3000, 2000, 1500, (rules.minVis || 5000) - 500, 5000, 8000, 9999, 9999, 9999, 9999, 9999, 9999, 9999, 9999, 9999, 9999, 9999]; // Nebel am Vormittag
    summary.cloud.hourlyData =  [9999, 9999, 8000, 7000, 6000, 5000, 4000, 3000, 2000, 1000, 600, 400, (rules.minCloud || 500) - 50, 400, 600, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9999]; // Tiefe Wolken zur Mittagszeit
    summary.precip.hourlyData = [ 0,  0,  0,  0,  0,  5, 10, 15, 20, 25, 30, 35, (rules.maxPrecipProb || 30) + 10, 40, 35, 30, 25, 20, 10,  5,  0,  0,  0,  0]; // Regen am Mittag

    // 3. Alarme & Status basierend auf den Fake-Daten und ECHTEN Regeln setzen
    const [lon, lat] = profile.geojson.geometry.coordinates[0][0];
    const fakeLocationId = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const getWorseStatus = (s1, s2) => (s1 === 'alarm' || s2 === 'alarm') ? 'alarm' : (s1 === 'warn' || s2 === 'warn') ? 'warn' : 'ok';
    
    for (let h = 0; h < 24; h++) {
        let combinedStatus = 'ok';
        
        // Wind
        if (rules.maxWind) {
            const wind = summary.wind.hourlyData[h];
            if (wind > rules.maxWind) {
                summary.wind.hourlyStatus[h] = 'alarm';
                summary.wind.triggered = true;
                if (wind > summary.wind.max) summary.wind.max = wind;
                if (!summary.wind.hourlyAlarms[h]) summary.wind.hourlyAlarms[h] = new Set();
                summary.wind.hourlyAlarms[h].add(fakeLocationId);
            } else if (wind > rules.maxWind * WARN_FACTORS.wind) {
                summary.wind.hourlyStatus[h] = 'warn';
            }
            if (rules.maxWind) combinedStatus = getWorseStatus(combinedStatus, summary.wind.hourlyStatus[h]);
        }
        
        // Temperatur
        if (rules.minTemp !== null) {
            const temp = summary.temp.hourlyData[h];
            if (temp < rules.minTemp) {
                summary.temp.hourlyStatus[h] = 'alarm';
                summary.temp.triggered = true;
                if (temp < summary.temp.min) summary.temp.min = temp;
                if (!summary.temp.hourlyAlarms[h]) summary.temp.hourlyAlarms[h] = new Set();
                summary.temp.hourlyAlarms[h].add(fakeLocationId);
            } else if (temp < rules.minTemp + WARN_FACTORS.temp) {
                summary.temp.hourlyStatus[h] = 'warn';
            }
            if (rules.minTemp !== null) combinedStatus = getWorseStatus(combinedStatus, summary.temp.hourlyStatus[h]);
        }

        // Sicht
        if (rules.minVis) {
            const vis = summary.vis.hourlyData[h];
            if (vis < rules.minVis) {
                summary.vis.hourlyStatus[h] = 'alarm';
                summary.vis.triggered = true;
                if (vis < summary.vis.min) summary.vis.min = vis;
                if (!summary.vis.hourlyAlarms[h]) summary.vis.hourlyAlarms[h] = new Set();
                summary.vis.hourlyAlarms[h].add(fakeLocationId);
            } else if (vis < rules.minVis * WARN_FACTORS.vis) {
                summary.vis.hourlyStatus[h] = 'warn';
            }
            if (rules.minVis) combinedStatus = getWorseStatus(combinedStatus, summary.vis.hourlyStatus[h]);
        }
        
        // Wolken
        if (rules.minCloud) {
            const cloud = summary.cloud.hourlyData[h];
            if (cloud !== null && cloud < rules.minCloud) {
                summary.cloud.hourlyStatus[h] = 'alarm';
                summary.cloud.triggered = true;
                if (cloud < summary.cloud.min) summary.cloud.min = cloud;
                if (!summary.cloud.hourlyAlarms[h]) summary.cloud.hourlyAlarms[h] = new Set();
                summary.cloud.hourlyAlarms[h].add(fakeLocationId);
            } else if (cloud !== null && cloud < rules.minCloud * WARN_FACTORS.cloud) {
                summary.cloud.hourlyStatus[h] = 'warn';
            }
            if (rules.minCloud) combinedStatus = getWorseStatus(combinedStatus, summary.cloud.hourlyStatus[h]);
        }
        
        // Niederschlag
        if (rules.maxPrecipProb !== null) {
            const precip = summary.precip.hourlyData[h];
            if (precip > rules.maxPrecipProb) {
                summary.precip.hourlyStatus[h] = 'alarm';
                summary.precip.triggered = true;
                if (precip > summary.precip.max) summary.precip.max = precip;
                if (!summary.precip.hourlyAlarms[h]) summary.precip.hourlyAlarms[h] = new Set();
                summary.precip.hourlyAlarms[h].add(fakeLocationId);
            } else if (precip > rules.maxPrecipProb * WARN_FACTORS.precip) {
                summary.precip.hourlyStatus[h] = 'warn';
            }
            if (rules.maxPrecipProb !== null) combinedStatus = getWorseStatus(combinedStatus, summary.precip.hourlyStatus[h]);
        }

        // Kombi-Zeile
        summary.combined.hourlyStatus[h] = combinedStatus;
        if (combinedStatus !== 'ok') summary.combined.triggered = true;
    }
    
    return Promise.resolve(summary);
}