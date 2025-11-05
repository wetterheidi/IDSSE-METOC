// weather_mock.js - Der "Fälscher" (Version 5.0: "Config-Driven")

import { getEmptySummary } from './weather.js'; // Holt die "Master"-Struktur (die jetzt dynamisch ist)
import { METRICS_CONFIG, getWarnFactor } from './metricsConfig.js'; // Holt das NEUE "Gehirn"

export { getEmptySummary }; // Exportiert die Master-Struktur

/**
 * Simuliert das Holen von Grid-Punkten.
 * (Unverändert)
 */
export async function getGridPoints(geojson) {
    console.warn("%cDEMO-MODUS: Gefälschte Grid-Punkte.", "color: magenta;");
    const points = geojson.geometry.coordinates[0].map(p => turf.point(p));
    return Promise.resolve({ gridPoints: turf.featureCollection(points) });
}

/**
 * Gibt SOFORT ein gefälschtes, alarmierendes Wetter-Summary zurück.
 * NEU: Generiert Daten und Alarme dynamisch basierend auf METRICS_CONFIG.
 */
export async function fetchAndCheckProfile(profile, modelInfo) {
    console.warn(`%cDEMO-MODUS: Gefälschte Daten für "${profile.name}" geladen.`, "color: magenta; font-weight: bold;");
    
    const summary = getEmptySummary(); 
    const rules = profile.rules; 
    if (!rules) { 
        console.error("Mock-Fehler: Profil hat keine 'rules'.");
        return summary;
    }

    const metrics = Object.values(METRICS_CONFIG); // Alle konfigurierten Metriken

    // 1. Alle 24 Stunden initialisieren (dynamisch)
    for (let h = 0; h < 24; h++) {
        metrics.forEach(metric => {
            const key = metric.summaryKey;
            summary[key].hourlyStatus[h] = 'ok';
        });
        summary.combined.hourlyStatus[h] = 'ok';
    }

    // 2. Realistische "Fake"-Zeitreihen für den Graphen erstellen
    // Wir erstellen Basis-Arrays und wenden sie auf die Metriken an
    const fakeDataTemplates = {
        // Peak am Nachmittag (für Wind, Niederschlag, Wolken)
        peakAfternoon: [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 95, 90, 85, 90, 80, 70, 60, 50, 40, 30, 25, 20, 15],
        // Minimum am Morgen (für Temperatur)
        lowMorning: [ 5,  4,  3,  2,  1,  0, -1, -1,  0,  2,  4,  6,  8, 10, 10,  9,  8,  7,  6,  5,  4,  3,  2,  1],
        // Minimum am Vormittag (für Sicht)
        lowForenoon: [9999, 9000, 8000, 7000, 6000, 5000, 4000, 3000, 2000, 1500, 1000, 1500, 5000, 8000, 9999, 9999, 9999, 9999, 9999, 9999, 9999, 9999, 9999, 9999]
    };
    
    // Fake-Daten dynamisch zuweisen
    metrics.forEach(metric => {
        const key = metric.summaryKey;
        const ruleName = metric.ruleName;
        const limit = rules[ruleName];
        
        if (metric.checkType === 'min') {
            if (key === 'temp') {
                summary.temp.hourlyData = [...fakeDataTemplates.lowMorning];
                // Alarm auslösen, falls Regel gesetzt
                if (limit !== null) summary.temp.hourlyData[6] = limit - 1; 
            } else if (key === 'vis') {
                summary.vis.hourlyData = [...fakeDataTemplates.lowForenoon];
                if (limit) summary.vis.hourlyData[10] = limit - 500;
            }
        } else { // 'max'
             summary[key].hourlyData = [...fakeDataTemplates.peakAfternoon];
             if (limit) summary[key].hourlyData[14] = limit + 10; // Alarm um 14h
        }
    });


    // 3. Alarme & Status basierend auf den Fake-Daten und ECHTEN Regeln setzen
    const [lon, lat] = profile.geojson.geometry.coordinates[0][0];
    const fakeLocationId = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const getWorseStatus = (s1, s2) => (s1 === 'alarm' || s2 === 'alarm') ? 'alarm' : (s1 === 'warn' || s2 === 'warn') ? 'warn' : 'ok';
    
    for (let h = 0; h < 24; h++) {
        let combinedStatus = 'ok';
        
        // --- DYNAMISCHE SCHLEIFE statt hard-coding ---
        metrics.forEach(metric => {
            const ruleName = metric.ruleName;
            const limit = rules[ruleName];
            const summaryKey = metric.summaryKey;
            
            // Regel im Profil nicht aktiv? -> Überspringen
            if (limit === null || limit === undefined) {
                 if (ruleName !== 'minTemp' && ruleName !== 'maxPrecipProb') { // Sonderfälle, wo 0 ein Limit sein kann
                    return; 
                 }
            }

            const value = summary[summaryKey].hourlyData[h];
            if (value === null || value === undefined) return;

            const warnFactor = getWarnFactor(metric);
            let currentStatus = 'ok';

            if (metric.checkType === 'min') {
                // MIN-Check (temp, vis)
                if (value < limit) {
                    currentStatus = 'alarm';
                    summary[summaryKey].triggered = true;
                    if (value < summary[summaryKey].value) summary[summaryKey].value = value;
                    if (!summary[summaryKey].hourlyAlarms[h]) summary[summaryKey].hourlyAlarms[h] = new Set();
                    summary[summaryKey].hourlyAlarms[h].add(fakeLocationId);
                } else if (ruleName === 'minTemp' && value < (limit + warnFactor)) {
                    currentStatus = 'warn';
                } else if (ruleName === 'minVis' && value < (limit * warnFactor)) {
                    currentStatus = 'warn';
                }
            } else {
                // MAX-Check (wind, cloud, precip)
                if (value > limit) {
                    currentStatus = 'alarm';
                    summary[summaryKey].triggered = true;
                    if (value > summary[summaryKey].value) summary[summaryKey].value = value;
                    if (!summary[summaryKey].hourlyAlarms[h]) summary[summaryKey].hourlyAlarms[h] = new Set();
                    summary[summaryKey].hourlyAlarms[h].add(fakeLocationId);
                } else if (value > (limit * warnFactor)) {
                    currentStatus = 'warn';
                }
            }
            
            summary[summaryKey].hourlyStatus[h] = currentStatus;
            combinedStatus = getWorseStatus(combinedStatus, currentStatus);
        });
        // --- ENDE DYNAMISCHE SCHLEIFE ---

        // Kombi-Zeile
        summary.combined.hourlyStatus[h] = combinedStatus;
        if (combinedStatus !== 'ok') summary.combined.triggered = true;
    }
    
    // Abwärtskompatibilität für .min / .max
     Object.values(METRICS_CONFIG).forEach(metric => {
        if (metric.checkType === 'min') {
            summary[metric.summaryKey].min = summary[metric.summaryKey].value;
        } else {
            summary[metric.summaryKey].max = summary[metric.summaryKey].value;
        }
    });

    return Promise.resolve(summary);
}