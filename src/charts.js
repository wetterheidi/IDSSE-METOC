// charts.js
import * as formatter from './formatter.js';
import { getManualOverrides } from './main.js'; // NEU: Importiere Overrides

let weatherChart = null; // Globale Chart-Instanz

function clearChart() {
    if (weatherChart) {
        weatherChart.destroy();
        weatherChart = null;
    }
}

/**
 * Hilfsfunktion zum Finden des schlechtesten Status
 */
function getWorseStatus(s1, s2) {
    if (s1 === 'alarm' || s2 === 'alarm') return 'alarm';
    if (s1 === 'warn' || s2 === 'warn') return 'warn';
    return 'ok';
}

/**
 * Hilfsfunktion zum Blenden des Status (Modell + Override)
 */
function getBlendedStatus(summary, ruleKey, hour) {
    const overrides = getManualOverrides();
    // Die Stunden sind '0', '1', ...
    const hourString = hour.toString();
    const autoStatus = summary[ruleKey] ? summary[ruleKey].hourlyStatus[hourString] : 'ok';
    const manualStatus = overrides[ruleKey] ? overrides[ruleKey][hourString] : null;
    
    // Manuell überschreibt Automatisch
    return manualStatus || autoStatus;
}

/**
 * Zeichnet oder aktualisiert den 24h-Wettergraphen mit ECHTEN Daten.
 */
export function updateWeatherChart(profile, summary) {
    clearChart(); // Alten Graphen löschen

    const ctx = document.getElementById('weatherChartCanvas').getContext('2d');
    if (!summary || !profile || !summary.wind.hourlyData || summary.wind.hourlyData.length === 0) {
        return; // Nichts zu zeichnen
    }

    const rules = profile.rules;
    const hours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`); // 00:00 - 23:00

    // --- 1. Datensätze und Achsen dynamisch erstellen ---
    const datasets = [];
    const scales = {
        x: { // Die X-Achse (Stunden)
            title: { display: true, text: 'Uhrzeit (UTC)' }
        }
    };
    
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
    // WICHTIG: Korrekte Deklaration an erster Stelle
    const annotationLimits = []; 


    // --- 2. Parameter hinzufügen (Wind, Sicht, etc.) ---

    if (rules.maxWind) {
        const { unit } = formatter.formatSpeed(1, profile); // 'kts' oder 'km/h'
        const data = summary.wind.hourlyData.map(val => formatter.formatSpeed(val, profile).value);
        
        datasets.push({
            label: `Böe (${unit})`,
            data: data,
            borderColor: '#dc3545', // Rot
            backgroundColor: 'rgba(220, 53, 69, 0.1)',
            fill: false,
            yAxisID: 'yWind',
        });
        scales.yWind = {
            type: 'linear',
            display: true,
            position: 'left',
            title: { display: true, text: `Wind (${unit})` }
        };
        annotationLimits.push(createLimitLine(formatter.formatSpeed(rules.maxWind, profile).value, '#dc3545', 'yWind'));
    }
    
    // Gemeinsame Achse für Höhe/Sicht - NUR FÜR SICHT
    if (rules.minVis) {
        const { unit } = formatter.formatAltitude(1, profile); // 'm' oder 'ft'
        scales.yAltitude = {
            type: 'linear',
            display: true,
            position: 'right',
            title: { display: true, text: `Sicht (${unit})` },
            grid: { drawOnChartArea: false }, // Nur eine Achse zeichnet Gitterlinien
        };
        
        if (rules.minVis) {
            const data = summary.vis.hourlyData.map(val => formatter.formatAltitude(val, profile).value);
            datasets.push({
                label: `Sicht (${unit})`,
                data: data,
                borderColor: '#8B4513', // Braun
                backgroundColor: 'rgba(139, 69, 19, 0.1)',
                fill: false,
                yAxisID: 'yAltitude',
            });
            annotationLimits.push(createLimitLine(formatter.formatAltitude(rules.minVis, profile).value, '#8B4513', 'yAltitude'));
        }
    }
    
    // Niederschlags- und Wolken-Achse (yPrecip)
    if (rules.maxPrecipProb !== null || rules.maxCloudCover !== null) {
        
        scales.yPrecip = {
            type: 'linear',
            display: true,
            position: 'right',
            title: { display: true, text: 'Niederschl./Wolken (%)' },
            grid: { drawOnChartArea: false },
            min: 0,
            max: 100
        };

        // Niederschlag
        if (rules.maxPrecipProb !== null) {
            const data = summary.precip.hourlyData.map(val => formatter.formatPercent(val, profile).value);
            datasets.push({
                label: 'Niederschl. (%)',
                data: data,
                type: 'bar', // Balkendiagramm
                backgroundColor: 'rgba(0, 0, 128, 0.5)',
                yAxisID: 'yPrecip',
            });
            annotationLimits.push(createLimitLine(formatter.formatPercent(rules.maxPrecipProb, profile).value, '#000080', 'yPrecip'));
        }

        // Wolkenbedeckung (NEU)
        if (rules.maxCloudCover !== null) {
            const data = summary.cloud.hourlyData.map(val => formatter.formatPercent(val, profile).value);
            datasets.push({
                label: 'Wolkenbedeck. (Tief %)', 
                data: data,
                type: 'line', 
                borderColor: '#6c757d',
                backgroundColor: 'rgba(108, 117, 125, 0.1)',
                fill: true,
                yAxisID: 'yPrecip',
            });
            annotationLimits.push(createLimitLine(formatter.formatPercent(rules.maxCloudCover, profile).value, '#6c757d', 'yPrecip'));
        }
    }

    // --- 3. Override-Blending für Hintergrund-Bänder ---
    const combinedBlendedStatus = Array.from({ length: 24 }, (_, h) => {
        const hour = h.toString();
        let combinedStatus = 'ok';
        
        // Wir verwenden den geblendeten Status für alle Regeln
        if (rules.maxWind) combinedStatus = getWorseStatus(combinedStatus, getBlendedStatus(summary, 'wind', hour));
        if (rules.minTemp !== null) combinedStatus = getWorseStatus(combinedStatus, getBlendedStatus(summary, 'temp', hour));
        if (rules.minVis) combinedStatus = getWorseStatus(combinedStatus, getBlendedStatus(summary, 'vis', hour));
        if (rules.maxCloudCover) combinedStatus = getWorseStatus(combinedStatus, getBlendedStatus(summary, 'cloud', hour));
        if (rules.maxPrecipProb !== null) combinedStatus = getWorseStatus(combinedStatus, getBlendedStatus(summary, 'precip', hour));
        
        return combinedStatus;
    });

    const alarmBands = combinedBlendedStatus.map((status, index) => {
        if (status === 'alarm' || status === 'warn') {
            return {
                type: 'box',
                xMin: index,
                xMax: index + 1,
                backgroundColor: status === 'alarm' ? 'rgba(220, 53, 69, 0.1)' : 'rgba(255, 193, 7, 0.1)',
                borderColor: 'transparent',
                borderWidth: 0,
                yScaleID: 'yWind', // Muss an eine Achse gebunden sein, um sichtbar zu sein
            };
        }
        return null;
    }).filter(a => a !== null);
    
    // Füge die Alarm-Bänder zu den Annotationen hinzu
    const finalAnnotations = annotationLimits.concat(alarmBands);

    // 4. Chart.js-Konfiguration
    weatherChart = new Chart(ctx, {
        type: 'line', // Standard-Typ
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
                    mode: 'index', // Zeigt alle Werte für eine Stunde
                    intersect: false
                },
                legend: {
                    position: 'bottom' // Legende unten
                },
                annotation: { // Plugin für die Limit-Linien
                    annotations: finalAnnotations // Nutze die kombinierten Annotationen
                }
            },
            interaction: {
                mode: 'index',
                intersect: false,
            }
        }
    });
}