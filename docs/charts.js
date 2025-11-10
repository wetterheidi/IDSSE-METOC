// charts.js (Version 2.0 - Config-Driven)
import { getManualOverrides, handleChartVisibilityUpdate } from './main.js';
// NEU: Importiere das "Gehirn"
import { METRICS_CONFIG } from './metricsConfig.js';
import * as formatter from './formatter.js';

let weatherChart = null; // Globale Chart-Instanz

/**
 * NEU: Wandelt Hex-Farbcode in RGBA um.
 */
function hexToRgba(hex, alpha) {
    if (!hex) return `rgba(0,0,0,${alpha})`; // Fallback
    let r = 0, g = 0, b = 0;
    // 3-stelliger Hex
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    }
    // 6-stelliger Hex
    else if (hex.length === 7) {
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
    }
    return `rgba(${r},${g},${b},${alpha || 0.1})`;
}

function clearChart() {
    if (weatherChart) {
        weatherChart.destroy();
        weatherChart = null;
    }
}

/**
 * Hilfsfunktion zum Finden des schlechtesten Status
 * (Angepasst: 'ok' gewinnt über 'no-data')
 */
function getWorseStatus(s1, s2) {
    if (s1 === 'alarm' || s2 === 'alarm') return 'alarm';
    if (s1 === 'warn' || s2 === 'warn') return 'warn';
    if (s1 === 'ok' || s2 === 'ok') return 'ok';
    return 'no-data';
}

/**
 * Hilfsfunktion zum Blenden des Status (Modell + Override)
 * (Unverändert, nutzt summaryKey)
 */
function getBlendedStatus(summary, summaryKey, hour) {
    const overrides = getManualOverrides();
    const hourString = hour.toString();
    const autoStatus = (summary[summaryKey] && summary[summaryKey].hourlyStatus[hourString]) || 'no-data';
    const manualStatus = overrides[summaryKey] ? overrides[summaryKey][hourString] : null;

    return manualStatus || autoStatus;
}

/**
 * Zeichnet oder aktualisiert den 24h-Wettergraphen mit ECHTEN Daten.
 * NEU: Komplett dynamisch basierend auf METRICS_CONFIG.
 */
export function updateWeatherChart(profile, summary) {
    clearChart(); // Alten Graphen löschen

    const ctx = document.getElementById('weatherChartCanvas').getContext('2d');

    if (!profile || !profile.rules) {
        return; // Nichts zu zeichnen, wenn das Profil oder die Regeln fehlen
    }
    const rules = profile.rules;

    // Finde einen Referenz-Key (z.B. 'wind'), um die Stunden-Arrays zu prüfen
    const activeMetrics = Object.values(METRICS_CONFIG).filter(metric => {
        const ruleName = metric.ruleName; // Helfer-Variable
        if (metric.checkType === 'min' || metric.checkType === 'max') {
            const hasAlarm = rules[ruleName + '_alarm'] !== null && rules[ruleName + '_alarm'] !== undefined;
            const hasWarn = rules[ruleName + '_warn'] !== null && rules[ruleName + '_warn'] !== undefined;
            return hasAlarm || hasWarn;
        }
        else if (metric.checkType === 'code_match') {
            // DIESER TEIL IST ENTSCHEIDEND:
            const hasAlarm = rules[ruleName + '_alarm'] !== null &&
                rules[ruleName + '_alarm'] !== undefined &&
                rules[ruleName + '_alarm'].length > 0;
            const hasWarn = rules[ruleName + '_warn'] !== null &&
                rules[ruleName + '_warn'] !== undefined &&
                rules[ruleName + '_warn'].length > 0;
            return hasAlarm || hasWarn;
        }
        return false;
    });

    if (activeMetrics.length === 0) {
        return; // Keine Regeln aktiv, nichts zu zeichnen
    }
    const firstMetricKey = activeMetrics[0].summaryKey;
    if (!summary || !profile || !summary[firstMetricKey].hourlyData || summary[firstMetricKey].hourlyData.length === 0) {
        return; // Nichts zu zeichnen
    }

    const hours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

    // --- 1. Datensätze und Achsen dynamisch erstellen ---
    const datasets = [];
    const scales = {
        x: {
            title: { display: true, text: 'Uhrzeit (UTC)' }
        }
    };
    const annotationLimits = [];

    // Helfer für Limit-Linien
    const createLimitLine = (value, color, yAxisID) => ({
        type: 'line',
        yMin: value,
        yMax: value,
        yScaleID: yAxisID,
        borderColor: color,
        borderWidth: 2,
        borderDash: [5, 5],
        label: {
            content: `Limit (${value})`,
            enabled: true,
            position: 'end'
        }
    });

    // --- 2. DYNAMISCHE SCHLEIFE: Metriken hinzufügen ---
    let axisGridCounter = 0; // Zähler, damit nur die erste Achse ein Gitter zeichnet

    for (const metric of Object.values(METRICS_CONFIG)) {
        const ruleName = metric.ruleName;
        const summaryKey = metric.summaryKey;
        const opts = metric.chartOptions;

        let isRuleActive = false;
        if (metric.checkType === 'min' || metric.checkType === 'max') {
            isRuleActive = (rules[ruleName + '_alarm'] !== null && rules[ruleName + '_alarm'] !== undefined) ||
                (rules[ruleName + '_warn'] !== null && rules[ruleName + '_warn'] !== undefined);
        } else if (metric.checkType === 'code_match') {
            const hasAlarm = rules[ruleName + '_alarm'] !== null &&
                rules[ruleName + '_alarm'] !== undefined &&
                rules[ruleName + '_alarm'].length > 0;
            const hasWarn = rules[ruleName + '_warn'] !== null &&
                rules[ruleName + '_warn'] !== undefined &&
                rules[ruleName + '_warn'].length > 0;
            isRuleActive = hasAlarm || hasWarn;
        }

        // Nur fortfahren, wenn die Regel im Profil aktiv ist
        if (!isRuleActive) {
            continue;
        }

        let data;
        let unit;
        const pointStyles = []; // Array für unsere Symbole

        if (summaryKey === 'sigWx') {
            // Für sigWx: Daten sind die Roh-Codes, aber an y=90 positioniert
            data = summary[summaryKey].hourlyData.map((code, index) => {
                if (code === null || code === 0 || code === undefined) { // 0 ist 'NSW'
                    pointStyles[index] = false; // Kein Symbol
                    return null; // Kein Datenpunkt
                }

                // Erstelle das Bild-Objekt
                const img = new Image(20, 20); // Größe festlegen (z.B. 20x20)

                const codeString = code.toString().padStart(2, '0');

                // WICHTIG: Passen Sie diesen Pfad an, falls Ihre Bilder woanders liegen
                img.src = `img/WeatherSymbol_WMO_PresentWeather_ww_${codeString}.png`;

                pointStyles[index] = img; // Speichere das Bild-Objekt

                // Positioniere auf der 0-100 Skala (wie zuvor)
                return { x: index, y: 90 };
            });

            unit = 'WMO'; // Einheit für die Legende

        } else {
            // Normaler Pfad für alle anderen Metriken
            const formattedData = summary[summaryKey].hourlyData.map(val => metric.formatter(val, profile));
            // 'N/A' zu 'null' konvertieren, um Abstürze zu verhindern
            data = formattedData.map(fd => (fd.value === 'N/A') ? null : fd.value);
            unit = formattedData.length > 0 ? formattedData[0].unit : '';
        }

        const label = `${metric.displayName} (${unit})`;

        // A. Datensatz erstellen
        // (Der 'if (summaryKey !== 'sigWx')' Filter ist entfernt)
        datasets.push({
            label: label,
            data: data,
            borderColor: metric.chartColor,
            backgroundColor: hexToRgba(metric.chartColor, 0.1),
            fill: (summaryKey === 'sigWx') ? false : (opts.fill || false), // sigWx nicht füllen
            yAxisID: opts.axisId,
            type: opts.type,
            summaryKey: summaryKey,

            // --- HIER KOMMT DIE MAGIE FÜR 'sigWx' ---
            pointStyle: (summaryKey === 'sigWx') ? pointStyles : 'circle',
            radius: (summaryKey === 'sigWx') ? 10 : 3, // Radius für Hover/Klick
            showLine: (summaryKey === 'sigWx') ? false : true // Keine Linie für sigWx
        });

        // B. Achse (Scale) erstellen
        // (Dieser Code ist von der letzten Iteration, er ist korrekt)
        if (!scales[opts.axisId]) {
            scales[opts.axisId] = {
                type: 'linear',
                display: (opts.axisId === 'ySigWx') ? false : true, // sigWx-Achse ausblenden
                position: opts.axisPosition,
                title: { display: true, text: `${opts.axisLabel} (${unit})` },
                grid: {
                    drawOnChartArea: (opts.axisPosition === 'left' || axisGridCounter === 0)
                }
            };

            if (opts.axisId === 'yPercent') {
                scales[opts.axisId].min = 0;
                scales[opts.axisId].max = 100;
            }

            // WICHTIG: Skala für sigWx-Achse (von letzter Iteration)
            if (opts.axisId === 'ySigWx') {
                scales[opts.axisId].min = 0;
                scales[opts.axisId].max = 100;
            }

            axisGridCounter++;
        }

        // C. Limit-Linie(n) (Annotation) erstellen (NEUE LOGIK)

        // 1. Lese die ZWEI Limits aus dem Profil
        if (metric.checkType === 'min' || metric.checkType === 'max') {
            // 1. Lese die ZWEI Limits aus dem Profil
            const limitValue_alarm = rules[metric.ruleName + '_alarm'];
            const limitValue_warn = rules[metric.ruleName + '_warn'];

            // 2. Erstelle die ROTE Alarm-Linie (wenn vorhanden)
            if (limitValue_alarm !== null && limitValue_alarm !== undefined) {
                // Formatiere den Wert (z.B. von Meter in Fuß)
                const { value: formattedVal } = metric.formatter(limitValue_alarm, profile);

                // Erstelle die rote Linie
                annotationLimits.push(createLimitLine(
                    formattedVal,
                    '#dc3545', // Alarm-Rot
                    opts.axisId
                ));
            }

            // 3. Erstelle die GELBE Warn-Linie (wenn vorhanden)
            if (limitValue_warn !== null && limitValue_warn !== undefined) {
                // Formatiere den Wert
                const { value: formattedVal } = metric.formatter(limitValue_warn, profile);

                // Erstelle die gelbe Linie
                annotationLimits.push(createLimitLine(
                    formattedVal,
                    '#ffc107', // Warn-Gelb
                    opts.axisId
                ));
            }
        } // <-- ENDE des neuen if-Blocks
    }
    // --- ENDE DYNAMISCHE SCHLEIFE ---

    // --- 3. Override-Blending für Hintergrund-Bänder ---
    const combinedBlendedStatus = Array.from({ length: 24 }, (_, h) => {
        const hour = h.toString();
        let combinedStatus = 'no-data';

        // DYNAMISCHE SCHLEIFE:
        for (const metric of Object.values(METRICS_CONFIG)) {
            // Berücksichtige nur, wenn Regel aktiv
            if (rules[metric.ruleName] !== null && rules[metric.ruleName] !== undefined) {
                combinedStatus = getWorseStatus(combinedStatus, getBlendedStatus(summary, metric.summaryKey, hour));
            }
        }
        return combinedStatus;
    });

    // Alarm-Bänder erstellen (unverändert in der Logik)
    const alarmBands = combinedBlendedStatus.map((status, index) => {
        if (status === 'alarm' || status === 'warn') {
            return {
                type: 'box',
                xMin: index,
                xMax: index + 1,
                backgroundColor: status === 'alarm' ? 'rgba(220, 53, 69, 0.1)' : 'rgba(255, 193, 7, 0.1)',
                borderColor: 'transparent',
                borderWidth: 0,
                yScaleID: Object.values(METRICS_CONFIG)[0].chartOptions.axisId, // Binde an die erste Y-Achse
            };
        }
        return null;
    }).filter(a => a !== null);

    const finalAnnotations = annotationLimits.concat(alarmBands);

    console.log("%c[charts.js DEBUG 2] FINALE DATEN VOR DEM ZEICHNEN:", "color: blue; font-weight: bold;", {
        labels: hours,
        datasets: datasets
    });

    // 4. Chart.js-Konfiguration
    weatherChart = new Chart(ctx, {
        type: 'line', // Standard-Typ (wird pro Dataset überschrieben)
        data: {
            labels: hours,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: scales, // Unsere dynamisch erstellten Achsen
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false
                },
                legend: {
                    position: 'bottom',
                    onClick: (e, legendItem, legend) => {
                        // 1. Führe das Standard-Verhalten aus (blendet den Graphen aus)
                        Chart.defaults.plugins.legend.onClick(e, legendItem, legend);

                        // 2. Rufe unseren neuen Handler in main.js auf, um die Karte zu aktualisieren
                        handleChartVisibilityUpdate(legend.chart);
                    }
                },
                annotation: {
                    annotations: finalAnnotations
                }
            },
            interaction: {
                mode: 'index',
                intersect: false,
            }
        }
    });
}