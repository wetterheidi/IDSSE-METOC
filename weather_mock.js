// weather_mock.js - Der "Fälscher" (Version 3.0, korrigiert)

// Wir importieren die echte 'getEmptySummary'-Funktion, damit wir
// die Struktur nicht doppelt pflegen müssen.
import { getEmptySummary } from './weather.js';

/**
 * Erstellt ein leeres Summary-Objekt (genau wie das Original).
 */
export { getEmptySummary }; // Einfacher Export der importierten Funktion

/**
 * Gibt SOFORT ein gefälschtes, alarmierendes Wetter-Summary zurück.
 * Simuliert einen API-Aufruf, der 0 Sekunden dauert.
 */
export async function fetchAndCheckProfile(profile, modelInfo) {
    console.warn(`%cDEMO-MODUS: Gefälschte Daten für "${profile.name}" geladen.`, "color: magenta; font-weight: bold;");
    
    const summary = getEmptySummary(); // Holt die NEUE Struktur
    const statusParams = ['wind', 'temp', 'vis', 'cloud', 'precip'];
    const rules = profile.rules; 
    
    // Fallback, falls 'rules' nicht existiert
    if (!rules) {
        console.error("Mock-Fehler: Profil hat keine 'rules'.");
        return summary; // Leeres Summary zurückgeben
    }

    // 2. Alle 24 Stunden initialisieren (WICHTIG!)
    for (let h = 0; h < 24; h++) {
        statusParams.forEach(param => {
            if (summary[param]) summary[param].hourlyStatus[h] = 'ok';
        });
        summary.combined.hourlyStatus[h] = 'ok'; // Auch die Kombi-Zeile
    }

       // 2. NEU: Realistische "Fake"-Zeitreihen erstellen
    summary.wind.hourlyData =   [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 95, 90, 85, 96, 80, 70, 60, 50, 40, 30, 25, 20, 15]; // Peak um 15 Uhr
    summary.temp.hourlyData =   [ 5,  4,  3,  2,  1,  0, -1, -1,  0,  2,  4,  6,  8, 10, 10,  9,  8,  7,  6,  5,  4,  3,  2,  1]; // Frost am Morgen
    summary.vis.hourlyData =    [9999, 9000, 8000, 7000, 6000, 5000, 4000, 3000, 2000, 1500, 3000, 5000, 8000, 9999, 9999, 9999, 9999, 9999, 9999, 9999, 9999, 9999, 9999, 9999]; // Nebel am Vormittag
    summary.cloud.hourlyData =  [9999, 9999, 8000, 7000, 6000, 5000, 4000, 3000, 2000, 1000, 600, 400, 300, 400, 600, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9999]; // Tiefe Wolken zur Mittagszeit
    summary.precip.hourlyData = [ 0,  0,  0,  0,  0,  5, 10, 15, 20, 25, 30, 35, 40, 40, 35, 30, 25, 20, 10,  5,  0,  0,  0,  0]; // Regen am Mittag

    // 3. Alarme setzen (wie in Schritt 70)
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
            } else if (wind > rules.maxWind * 0.9) {
                summary.wind.hourlyStatus[h] = 'warn';
            }
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
            } else if (vis < rules.minVis * 1.2) {
                summary.vis.hourlyStatus[h] = 'warn';
            }
        }
        // ... (Dieselbe Logik für Temp, Cloud, Precip hier einfügen) ...
        // ... (Ich kürze ab, aber du müsstest die Logik hier 1:1 aus checkThresholds kopieren) ...

        // Kombi-Zeile
        if (rules.maxWind) combinedStatus = getWorseStatus(combinedStatus, summary.wind.hourlyStatus[h]);
        if (rules.minVis) combinedStatus = getWorseStatus(combinedStatus, summary.vis.hourlyStatus[h]);
        // ... (usw. für alle Parameter) ...
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