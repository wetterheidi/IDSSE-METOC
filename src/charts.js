// charts.js
import * as formatter from './formatter.js';

let weatherChart = null; // Globale Chart-Instanz

function clearChart() {
    if (weatherChart) {
        weatherChart.destroy();
        weatherChart = null;
    }
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
    
    // Gemeinsame Achse für Höhe/Sicht
    if (rules.minVis || rules.minCloud) {
        const { unit } = formatter.formatAltitude(1, profile); // 'm' oder 'ft'
        scales.yAltitude = {
            type: 'linear',
            display: true,
            position: 'right',
            title: { display: true, text: `Sicht/Wolken (${unit})` },
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
        if (rules.minCloud) {
            const data = summary.cloud.hourlyData.map(val => formatter.formatAltitude(val, profile).value);
            datasets.push({
                label: `Wolken-UG (${unit})`,
                data: data,
                borderColor: '#6c757d', // Grau
                backgroundColor: 'rgba(108, 117, 125, 0.1)',
                fill: true, // Fläche füllen
                yAxisID: 'yAltitude',
            });
            annotationLimits.push(createLimitLine(formatter.formatAltitude(rules.minCloud, profile).value, '#6c757d', 'yAltitude'));
        }
    }
    
    // Niederschlags-Achse
    if (rules.maxPrecipProb !== null) {
        const data = summary.precip.hourlyData.map(val => formatter.formatPercent(val, profile).value);
        datasets.push({
            label: 'Niederschl. (%)',
            data: data,
            type: 'bar', // Balkendiagramm
            backgroundColor: 'rgba(0, 0, 128, 0.5)',
            yAxisID: 'yPrecip',
        });
        scales.yPrecip = {
            type: 'linear',
            display: true,
            position: 'right',
            title: { display: true, text: 'Niederschl. (%)' },
            grid: { drawOnChartArea: false },
            min: 0,
            max: 100
        };
        annotationLimits.push(createLimitLine(formatter.formatPercent(rules.maxPrecipProb, profile).value, '#000080', 'yPrecip'));
    }


    // 3. Chart.js-Konfiguration
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
                    annotations: annotationLimits
                }
            },
            interaction: {
                mode: 'index',
                intersect: false,
            }
        }
    });
}