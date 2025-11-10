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
    const activeMetrics = Object.values(METRICS_CONFIG).filter(m =>
        (rules[m.ruleName + '_alarm'] !== null && rules[m.ruleName + '_alarm'] !== undefined) ||
        (rules[m.ruleName + '_warn'] !== null && rules[m.ruleName + '_warn'] !== undefined)
    );

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

        // Nur fortfahren, wenn die Regel im Profil aktiv ist
        if ((rules[ruleName + '_alarm'] === null || rules[ruleName + '_alarm'] === undefined) &&
            (rules[ruleName + '_warn'] === null || rules[ruleName + '_warn'] === undefined)) {
            continue;
        }

        // Formatter anwenden, um Daten und Einheiten zu erhalten
        const formattedData = summary[summaryKey].hourlyData.map(val => metric.formatter(val, profile));
        const data = formattedData.map(fd => {
            return (fd.value === 'N/A') ? null : fd.value;
        });

        const unit = formattedData.length > 0 ? formattedData[0].unit : '';
        const label = `${metric.displayName} (${unit})`;

        console.log(`[charts.js DEBUG 1] Prüfe Metrik: '${metric.summaryKey}'`, {
            label: label,
            data: data // Zeigt uns, ob hier Text ('RA') oder Zahlen ('63') stehen
        });

        // A. Datensatz erstellen
        if (metric.summaryKey !== 'sigWx') {
            console.log("SIGWX Test:", metric.summaryKey);
            datasets.push({
                label: label,
                data: data,
                borderColor: metric.chartColor,
                backgroundColor: hexToRgba(metric.chartColor, 0.1),
                fill: opts.fill || false,
                yAxisID: opts.axisId,
                type: opts.type,
                summaryKey: metric.summaryKey
            });
        }

        // B. Achse (Scale) erstellen (nur, wenn sie noch nicht existiert)
        if (!scales[opts.axisId]) {
            scales[opts.axisId] = {
                type: 'linear',
                display: (opts.axisId === 'ySigWx') ? false : true,
                position: opts.axisPosition,
                title: { display: true, text: `${opts.axisLabel} (${unit})` },
                // Nur die erste Achse (oder Achsen auf der 'linken' Seite) zeichnet Gitterlinien
                grid: {
                    drawOnChartArea: (opts.axisPosition === 'left' || axisGridCounter === 0)
                }
            };

            // Sonderfall: Prozent-Achse (für Wolken/Niederschlag)
            if (opts.axisId === 'yPercent') {
                scales[opts.axisId].min = 0;
                scales[opts.axisId].max = 100;
            }

            if (opts.axisId === 'ySigWx') {
                scales[opts.axisId].min = 0;   // Setze den Boden
                scales[opts.axisId].max = 100; // Setze die Decke
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

    // --- NEU: sigWx-Labels als Annotationen hinzufügen ---
    if (summary.sigWx && summary.sigWx.hourlyData) {
        summary.sigWx.hourlyData.forEach((code, hour) => {
            // Nur zeichnen, wenn es nicht 'NSW' (Code 0) ist
            if (code > 0) {
                // Holen Sie den TAF-Code (z.B. 'FG', 'TS')
                const tafCode = (formatter.WMO_TAF_MAP[code] || `Code ${code}`);

                annotationLimits.push({
                    type: 'label',
                    xValue: hour, // Die Stunde (0-23)
                    yValue: 90,   // Vertikale Position (50% auf der unsichtbaren Achse)
                    yScaleID: 'ySigWx', // Binden an unsere unsichtbare Achse
                    backgroundColor: 'rgba(255, 255, 255, 0.7)',
                    borderColor: METRICS_CONFIG.sigWx.chartColor,
                    borderWidth: 1,
                    borderRadius: 4,
                    content: tafCode,
                    color: METRICS_CONFIG.sigWx.chartColor,
                    font: {
                        weight: 'bold'
                    }
                });
            }
        });
    }

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