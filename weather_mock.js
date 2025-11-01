// weather_mock.js

// ... (deine 'getEmptySummary' Funktion ist hier oben) ...
import { getEmptySummary as realGetEmptySummary } from './weather.js';
export function getEmptySummary() {
    return realGetEmptySummary();
}

/**
 * Gibt SOFORT ein gefälschtes, alarmierendes Wetter-Summary zurück.
 * (Version 2.0: "Erwachsen" - initialisiert alle 24 Stunden)
 */
export async function fetchAndCheckProfile(profile) {
    console.warn(`%cDEMO-MODUS: Gefälschte Daten für "${profile.name}" geladen.`, "color: magenta; font-weight: bold;");
    
    const summary = getEmptySummary();
    const statusParams = ['wind', 'temp', 'vis', 'cloud', 'precip'];
    const rules = profile.rules; // Wir brauchen die Regeln

    // 1. Alle 24 Stunden initialisieren
    for (let h = 0; h < 24; h++) {
        statusParams.forEach(param => {
            if (summary[param]) summary[param].hourlyStatus[h] = 'ok';
        });
        summary.combined.hourlyStatus[h] = 'ok'; // Auch die Kombi-Zeile
    }

    // 2. Alarme setzen
    summary.wind.triggered = true;
    summary.wind.max = 95.5;
    summary.wind.hourlyStatus[14] = 'warn';
    summary.wind.hourlyStatus[15] = 'alarm';
    summary.wind.hourlyStatus[16] = 'warn';
    const [lon, lat] = profile.geojson.geometry.coordinates[0][0];
    summary.wind.affectedPoints.add(`${lat.toFixed(2)},${lon.toFixed(2)}`);

    summary.vis.triggered = true;
    summary.vis.min = 3000;
    summary.vis.hourlyStatus[10] = 'alarm';
    summary.vis.hourlyStatus[11] = 'warn';

    // 3. NEU: Kombi-Zeile für den Mock berechnen
    const getWorseStatus = (s1, s2) => {
        if (s1 === 'alarm' || s2 === 'alarm') return 'alarm';
        if (s1 === 'warn' || s2 === 'warn') return 'warn';
        return 'ok';
    };

    for (let h = 0; h < 24; h++) {
        let combinedStatus = 'ok';
        if (rules.maxWind) combinedStatus = getWorseStatus(combinedStatus, summary.wind.hourlyStatus[h]);
        if (rules.minTemp !== null) combinedStatus = getWorseStatus(combinedStatus, summary.temp.hourlyStatus[h]);
        if (rules.minVis) combinedStatus = getWorseStatus(combinedStatus, summary.vis.hourlyStatus[h]);
        if (rules.minCloud) combinedStatus = getWorseStatus(combinedStatus, summary.cloud.hourlyStatus[h]);
        if (rules.maxPrecipProb !== null) combinedStatus = getWorseStatus(combinedStatus, summary.precip.hourlyStatus[h]);
        
        summary.combined.hourlyStatus[h] = combinedStatus;
        if (combinedStatus !== 'ok') summary.combined.triggered = true;
    }

    return Promise.resolve(summary);
}

/**
 * Simuliert das Holen von Grid-Punkten.
 */
export async function getGridPoints(geojson) {
    console.warn("%cDEMO-MODUS: Gefälschte Grid-Punkte.", "color: magenta;");
    const points = geojson.geometry.coordinates[0].map(p => turf.point(p));
    return Promise.resolve({ gridPoints: turf.featureCollection(points) });
}