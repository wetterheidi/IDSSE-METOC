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
    
    // 1. Hol dir ein leeres Objekt (mit der NEUEN Struktur: hourlyAlarms etc.)
    const summary = getEmptySummary();
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

    // 3. Alarme setzen (wie in Schritt 70)
    const [lon, lat] = profile.geojson.geometry.coordinates[0][0];
    const fakeLocationId = `${lat.toFixed(2)},${lon.toFixed(2)}`;

    // Wind-Alarm
    summary.wind.triggered = true;
    summary.wind.max = 95.5;
    summary.wind.hourlyStatus[15] = 'alarm';
    summary.wind.hourlyStatus[16] = 'warn';
    summary.wind.hourlyAlarms[15] = new Set([fakeLocationId]); // Alarm um 15 Uhr

    // Sicht-Alarm
    summary.vis.triggered = true;
    summary.vis.min = 3000;
    summary.vis.hourlyStatus[10] = 'alarm';
    summary.vis.hourlyStatus[11] = 'warn';
    summary.vis.hourlyAlarms[10] = new Set([fakeLocationId]); // Alarm um 10 Uhr

    // 4. KORRIGIERT: Kombi-Zeile für den Mock berechnen
    const getWorseStatus = (s1, s2) => {
        if (s1 === 'alarm' || s2 === 'alarm') return 'alarm';
        if (s1 === 'warn' || s2 === 'warn') return 'warn';
        return 'ok';
    };

    // Die Schleife, die den Fehler verursacht hat
    for (let h = 0; h < 24; h++) {
        // HIER IST DIE KORREKTE PLATZIERUNG:
        let combinedStatus = 'ok'; // Definiert INNENHALB der Schleife
        
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