// weather_mock.js - Der "Fälscher" (Version 5.0: "Config-Driven")

import { getEmptySummary } from './weather.js'; // Holt die "Master"-Struktur (die jetzt dynamisch ist)
import { METRICS_CONFIG } from './metricsConfig.js'; // Holt das NEUE "Gehirn"

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
        lowMorning: [5, 4, 3, 2, 1, 0, -1, -1, 0, 2, 4, 6, 8, 10, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
        // Minimum am Vormittag (für Sicht)
        lowForenoon: [9999, 9000, 8000, 7000, 6000, 5000, 4000, 3000, 2000, 1500, 1000, 1500, 5000, 8000, 9999, 9999, 9999, 9999, 9999, 9999, 9999, 9999, 9999, 9999]
    };

    // Fake-Daten dynamisch zuweisen
    metrics.forEach(metric => {
        const key = metric.summaryKey;
        const ruleName = metric.ruleName;

        // --- KORREKTUR ---
        // ALT: const limit = rules[ruleName];
        // NEU: Nimm den Alarm-Wert als Referenz für den Mock
        const limit = rules[ruleName + '_alarm'];
        // --- ENDE KORREKTUR ---

        if (metric.checkType === 'min') {
            if (key === 'temp') {
                summary.temp.hourlyData = [...fakeDataTemplates.lowMorning];
                // Alarm auslösen, falls Regel gesetzt
                if (limit !== null && limit !== undefined) summary.temp.hourlyData[6] = limit - 1;
            } else if (key === 'vis') {
                summary.vis.hourlyData = [...fakeDataTemplates.lowForenoon];
                if (limit !== null && limit !== undefined) summary.vis.hourlyData[10] = limit - 500;
            }
        } else { // 'max'
            summary[key].hourlyData = [...fakeDataTemplates.peakAfternoon];
            if (limit !== null && limit !== undefined) summary[key].hourlyData[14] = limit + 10; // Alarm um 14h
        }

        if (metric.checkType === 'code_match') {
            const key = metric.summaryKey;
            // Erzeuge eine Basis-Reihe (alles 0 = NSW)
            summary[key].hourlyData = new Array(24).fill(0);

            // Löse einen Alarm aus (z.B. Nebel um 10h)
            const alarmCode = 45; // 'FG'
            summary[key].hourlyData[10] = alarmCode;

            // Löse einen zweiten Alarm aus (z.B. Schnee um 14h)
            const alarmCode2 = 73; // 'SN'
            summary[key].hourlyData[14] = alarmCode2;
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

            // NEU: Lese die ZWEI Limits
            const limit_alarm = rules[ruleName + '_alarm'];
            const limit_warn = rules[ruleName + '_warn'];

            const summaryKey = metric.summaryKey;

            // Regel im Profil nicht aktiv? (Prüfe, ob BEIDE Limits null/undefined sind)
            if ((limit_alarm === null || limit_alarm === undefined) &&
                (limit_warn === null || limit_warn === undefined)) {
                return; // Überspringen
            }

            const value = summary[summaryKey].hourlyData[h];
            if (value === null || value === undefined) return;

            // ALT: const warnFactor = getWarnFactor(metric); (ENTFERNT)
            let currentStatus = 'ok'; // Standard-Annahme (im Mock, anders als in weather.js)

            if (metric.checkType === 'min') {
                // MIN-Check (temp, vis)
                // Alarm-Regel hat Vorrang
                if (limit_alarm !== null && value < limit_alarm) {
                    currentStatus = 'alarm';
                }
                // Nur wenn kein Alarm, prüfe Warn
                else if (limit_warn !== null && value < limit_warn) {
                    currentStatus = 'warn';
                }
            } else if (metric.checkType === 'max') {
                // MAX-Check (wind, cloud, precip)
                // Alarm-Regel hat Vorrang
                if (limit_alarm !== null && value > limit_alarm) {
                    currentStatus = 'alarm';
                }
                // Nur wenn kein Alarm, prüfe Warn
                else if (limit_warn !== null && value > limit_warn) {
                    currentStatus = 'warn';
                }
            } else if (metric.checkType === 'code_match') {
                // --- KORRIGIERTE Mock-Prüf-Logik ---
                const forbiddenCodes_alarm = rules[metric.ruleName + '_alarm'];
                const forbiddenCodes_warn = rules[metric.ruleName + '_warn'];

                // Prüfen, ob überhaupt Regeln gesetzt sind
                if ((!forbiddenCodes_alarm || forbiddenCodes_alarm.length === 0) &&
                    (!forbiddenCodes_warn || forbiddenCodes_warn.length === 0)) {
                    currentStatus = 'no-data'; // Keine Regeln definiert
                } else {
                    const valueStr = value.toString();

                    // WICHTIG: Alarm (rot) hat Vorrang
                    if (forbiddenCodes_alarm && forbiddenCodes_alarm.includes(valueStr)) {
                        currentStatus = 'alarm';
                    }
                    // Nur wenn kein Alarm, prüfe Warnung (gelb)
                    else if (forbiddenCodes_warn && forbiddenCodes_warn.includes(valueStr)) {
                        currentStatus = 'warn';
                    }
                    // Code ist nicht in den Listen, also OK
                    else {
                        currentStatus = 'ok';
                    }
                }
            }

            // Setze Trigger-Status (nur bei Alarm)
            if (currentStatus === 'alarm') {
                summary[summaryKey].triggered = true;
                if (metric.checkType === 'min' && value < summary[summaryKey].value) summary[summaryKey].value = value;
                if (metric.checkType === 'max' && value > summary[summaryKey].value) summary[summaryKey].value = value;
                if (metric.checkType === 'code_match' && value > summary[summaryKey].value) {
                    summary[summaryKey].value = value;
                }
                if (!summary[summaryKey].hourlyAlarms[h]) summary[TsummaryKey].hourlyAlarms[h] = new Set();
                summary[summaryKey].hourlyAlarms[h].add(fakeLocationId);
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

// NEU: Mock für den Land/See-Check
export async function performLandSeaCheck(geojson) {
    console.warn("%cDEMO-MODUS: Land/See-Check -> 'isMaritime: true' (Seegebiet simuliert)", "color: magenta;");
    // Wir simulieren standardmäßig ein Seegebiet, um die zukünftige Logik zu testen
    return Promise.resolve({ isMaritime: true });
}