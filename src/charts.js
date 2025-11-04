// charts.js (Version 2.0 - Config-Driven)
import { getManualOverrides } from './main.js';
// NEU: Importiere das "Gehirn"
import { METRICS_CONFIG } from './metricsConfig.js';

let weatherChart = null; // Globale Chart-Instanz

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
    
    // Finde einen Referenz-Key (z.B. 'wind'), um die Stunden-Arrays zu prüfen
    const firstMetricKey = Object.values(METRICS_CONFIG)[0].summaryKey;
    if (!summary || !profile || !summary[firstMetricKey].hourlyData || summary[firstMetricKey].hourlyData.length === 0) {
        return; // Nichts zu zeichnen
    }

    const rules = profile.rules;
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
        if (rules[ruleName] === null || rules[ruleName] === undefined) {
            continue;
        }

        // Formatter anwenden, um Daten und Einheiten zu erhalten
        const formattedData = summary[summaryKey].hourlyData.map(val => metric.formatter(val, profile));
        const data = formattedData.map(fd => fd.value);
        const unit = formattedData.length > 0 ? formattedData[0].unit : '';
        const label = `${metric.displayName} (${unit})`;

        // A. Datensatz erstellen
        datasets.push({
            label: label,
            data: data,
            borderColor: metric.chartColor,
            backgroundColor: metric.chartColor.replace(')', ', 0.1)').replace('#', 'rgba('), // Mache Farbe transparent
            fill: opts.fill || false,
            yAxisID: opts.axisId,
            type: opts.type // 'line' or 'bar'
        });

        // B. Achse (Scale) erstellen (nur, wenn sie noch nicht existiert)
        if (!scales[opts.axisId]) {
            scales[opts.axisId] = {
                type: 'linear',
                display: true,
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

            axisGridCounter++;
        }

        // C. Limit-Linie (Annotation) erstellen
        const { value: limitValue } = metric.formatter(rules[ruleName], profile);
        annotationLimits.push(createLimitLine(limitValue, metric.chartColor, opts.axisId));
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
                    position: 'bottom'
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