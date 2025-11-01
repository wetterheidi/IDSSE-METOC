// charts.js
import * as formatter from './formatter.js';

let weatherChart = null; // Globale Variable, um die Chart-Instanz zu halten

/**
 * Zerstört die alte Chart-Instanz, falls vorhanden.
 */
function clearChart() {
    if (weatherChart) {
        weatherChart.destroy();
        weatherChart = null;
    }
}

/**
 * Zeichnet oder aktualisiert den 24h-Wettergraphen.
 */
export function updateWeatherChart(profile, summary) {
    clearChart(); // Alten Graphen löschen

    const ctx = document.getElementById('weatherChartCanvas').getContext('2d');
    if (!summary || !profile || !summary.wind.hourlyStatus) {
        return; // Nichts zu zeichnen
    }

    const rules = profile.rules;
    const unitMode = profile.rules.unitMode || 'metric';

    // 1. Daten vorbereiten (Stunden-Labels und Daten-Punkte)
    const hours = Object.keys(summary.wind.hourlyStatus).sort((a, b) => parseInt(a) - parseInt(b));
    const labels = hours.map(h => `${h.toString().padStart(2, '0')}:00`);
    
    // Wir brauchen die *tatsächlichen* Werte, nicht nur 'ok/warn/alarm'.
    // HINWEIS: Das 'summary'-Objekt hat diese (noch) nicht.
    // FÜR DIESEN PROTOTYP faken wir die Daten basierend auf dem Alarm-Status.
    // TODO: 'checkThresholds' muss die echten stündlichen Max/Min-Werte liefern.
    const windData = hours.map(h => {
        if (summary.wind.hourlyStatus[h] === 'alarm') return rules.maxWind + 10;
        if (summary.wind.hourlyStatus[h] === 'warn') return rules.maxWind * 0.95;
        return rules.maxWind / 2; // Fake-Basiswert
    });

    // 2. Formatierer für die Achsen-Beschriftung (Tooltip)
    const { unit: speedUnit } = formatter.formatSpeed(1, profile);
    
    // 3. Chart.js-Konfiguration
    weatherChart = new Chart(ctx, {
        type: 'line', // Linien-Diagramm
        data: {
            labels: labels, // X-Achse (Stunden)
            datasets: [
                {
                    label: `Windböe (${speedUnit})`,
                    data: windData, // Y-Werte
                    borderColor: 'red',
                    backgroundColor: 'rgba(255, 0, 0, 0.1)',
                    fill: true,
                    yAxisID: 'yWind', // Verknüpfung mit der Y-Achse
                },
                // HIER KÖNNTEN MEHR DATENSÄTZE HINZU (z.B. Sicht)
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                yWind: { // Die Y-Achse für Wind
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: `Windböe (${speedUnit})`
                    },
                    // Rote Limit-Linie zeichnen
                    afterDraw: (chart) => {
                        if (rules.maxWind) {
                            const y = chart.scales.yWind.getPixelForValue(rules.maxWind);
                            const ctx = chart.ctx;
                            ctx.save();
                            ctx.strokeStyle = 'red';
                            ctx.lineWidth = 2;
                            ctx.setLineDash([5, 5]);
                            ctx.beginPath();
                            ctx.moveTo(chart.chartArea.left, y);
                            ctx.lineTo(chart.chartArea.right, y);
                            ctx.stroke();
                            ctx.restore();
                        }
                    }
                },
                // HIER KÖNNTE EINE ZWEITE Y-ACHSE HINZU (z.B. für Sicht)
            },
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            }
        }
    });
}