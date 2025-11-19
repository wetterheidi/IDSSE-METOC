// charts.js (Version 2.0 - Config-Driven)
// -----------------------------------------------------------
// 1. IMPORTS
// -----------------------------------------------------------

import { METRICS_CONFIG, isMetricActive } from './metricsConfig.js';
import * as formatter from './formatter.js';

// -----------------------------------------------------------
// 2. MODUL-ZUSTAND (ZUR AUFLÖSUNG ZIRKULÄRER ABHÄNGIGKEITEN)
// -----------------------------------------------------------
let weatherChart = null; // Globale Chart-Instanz
let legendClickCallback = () => { };
let getManualOverridesFunc = () => ({});

// -----------------------------------------------------------
// 3. EXPORTIERTE SETTER (Dependency Injection)
// -----------------------------------------------------------

/**
 * Registriert die Funktion aus main.js, um die manuellen Overrides zu laden.
 */
export function setGetManualOverrides(func) {
    getManualOverridesFunc = func;
}

/**
 * Registriert den Callback aus main.js, der bei Klick auf die Legende ausgelöst wird.
 */
export function setLegendClickCallback(callback) {
    legendClickCallback = callback;
}

// -----------------------------------------------------------
// 4. INTERNE HILFSFUNKTIONEN
// -----------------------------------------------------------

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

/**
 * Helfer: Löscht die Chart-Instanz.
 */
function clearChart() {
    if (weatherChart) {
        weatherChart.destroy();
        weatherChart = null;
    }
}

/**
 * Helfer: Erzeugt ein Chart.js Annotation-Objekt für eine Limit-Linie.
 */
const createLimitLine = (value, yAxisID, borderColor, borderWidth, borderDash, labelContent, summaryKey) => ({
    type: 'line',
    yMin: value,
    yMax: value,
    yScaleID: yAxisID,
    borderColor: borderColor,   
    borderWidth: borderWidth, 
    borderDash: borderDash,   
    label: {
        content: labelContent,  
        enabled: true,
        position: 'end',
        font: {
            weight: 'bold'
        },
        color: borderColor
    },
    summaryKey: summaryKey
});

// -----------------------------------------------------------
// 5. HAUPTEXPORT: CHART AKTUALISIEREN
// -----------------------------------------------------------

/**
 * Zeichnet oder aktualisiert den 24h-Wettergraphen mit ECHTEN Daten.
 * @param {object} profile - Das aktuelle Profil.
 * @param {object} summary - Die Wetter-Zusammenfassung (Summary).
 * @param {function} getBlendedCombinedStatusFunc - Funktion zur Abfrage des Gesamtstatus (injiziert).
 */
export function updateWeatherChart(profile, summary, getBlendedCombinedStatusFunc) {
    clearChart(); // Alten Graphen löschen

    const ctx = document.getElementById('weatherChartCanvas').getContext('2d');

    if (!profile || !profile.rules) {
        return; 
    }
    const rules = profile.rules;

    const activeMetrics = Object.values(METRICS_CONFIG).filter(metric => isMetricActive(metric, rules));

    if (activeMetrics.length === 0) {
        return; 
    }
    const firstMetricKey = activeMetrics[0].summaryKey;
    if (!summary || !profile || !summary[firstMetricKey].hourlyData || summary[firstMetricKey].hourlyData.length === 0) {
        return; 
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
        if (!isMetricActive(metric, rules)) {
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
                    return {
                        x: index,
                        y: null, // <--- Der entscheidende Punkt
                        code: 0
                    };
                }

                // Erstelle das Bild-Objekt
                const img = new Image(20, 20);
                const codeString = code.toString().padStart(2, '0');
                img.src = `../img/WeatherSymbol_WMO_PresentWeather_ww_${codeString}.png`;

                pointStyles[index] = img; // Speichere das Bild-Objekt

                return {
                    x: index,
                    y: 90,
                    code: code
                };
            });
            unit = 'WMO';
        } else {
            // Normaler Pfad für alle anderen Metriken
            const rawData = summary[summaryKey].hourlyData;
            let processedData;

            // --- PRÜFUNG FÜR WOLKENUNTERGRENZE ---
            if (summaryKey === 'cloudBase') {
                // Wandle 99999 (unser SKC-Wert) in 'null' um
                processedData = rawData.map(val => (val >= 99999) ? null : val);
            } else {
                processedData = rawData;
            }

            // Formatiere die bereinigten Daten
            const formattedData = processedData.map(val => metric.formatter(val, profile));

            data = formattedData.map(fd => (fd.value === 'N/A') ? null : fd.value);

            // Einheit sicher bestimmen (selbst wenn der erste Wert 'null' ist)
            unit = (metric.formatter(null, profile)).unit;
        }

        const label = `${metric.displayName} (${unit})`;

        // A. Datensatz erstellen
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

            if (opts.axisId === 'yOktas') { 
                scales[opts.axisId].min = 0;
                scales[opts.axisId].max = 8; // Skala 0-8
            }

            // Skala für sigWx-Achse
            if (opts.axisId === 'ySigWx') {
                scales[opts.axisId].min = 0;
                scales[opts.axisId].max = 100;
            }

            axisGridCounter++;
        }

        // C. Limit-Linie(n) (Annotation) erstellen
        if (metric.checkType === 'min' || metric.checkType === 'max') {
            const limitValue_alarm = rules[metric.ruleName + '_alarm'];
            const limitValue_warn = rules[metric.ruleName + '_warn'];

            const paramColor = metric.chartColor;

            // 2. Erstelle die ALARM-Linie (Solide, 3px)
            if (limitValue_alarm !== null && limitValue_alarm !== undefined) {
                const { value: formattedVal } = metric.formatter(limitValue_alarm, profile);

                annotationLimits.push(createLimitLine(
                    formattedVal,                 
                    opts.axisId,                  
                    paramColor,                   
                    3,                            
                    [],                           
                    `Alarm (${formattedVal})`,     
                    metric.summaryKey
                ));
            }

            // 3. Erstelle die WARN-Linie (Gestrichelt, 2px)
            if (limitValue_warn !== null && limitValue_warn !== undefined) {
                const { value: formattedVal } = metric.formatter(limitValue_warn, profile);

                annotationLimits.push(createLimitLine(
                    formattedVal,                 
                    opts.axisId,                  
                    paramColor,                   
                    2,                            
                    [6, 3],                       
                    `Warn (${formattedVal})`,      
                    metric.summaryKey
                ));
            }
        } 
    }
    // --- ENDE DYNAMISCHE SCHLEIFE ---

    // --- 3. Override-Blending für Hintergrund-Bänder ---
    const hourlyCombinedStatus = getBlendedCombinedStatusFunc(profile, summary);
    const combinedBlendedStatus = Object.values(hourlyCombinedStatus);

    // Alarm-Bänder erstellen
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
                    intersect: false,

                    // --- ANPASSUNG FÜR TOOLTIP-INHALT ---
                    callbacks: {
                        label: function (context) {
                            const datasetLabel = context.dataset.label || '';

                            // --- Spezialbehandlung für sigWx ---
                            if (context.dataset.summaryKey === 'sigWx') {
                                const dataPoint = context.raw;

                                if (dataPoint && dataPoint.code !== undefined) {
                                    const formatted = formatter.formatSigWx(dataPoint.code, profile);

                                    return `${datasetLabel}: ${formatted.value}${formatted.unit}`;
                                }
                                return `${datasetLabel}: N/A`; // Fallback
                            }

                            // --- Standard-Verhalten für alle anderen (Wind, Temp etc.) ---
                            return `${datasetLabel}: ${context.formattedValue}`;
                        }
                    }
                    // --- ENDE ANPASSUNG ---

                },
                legend: {
                    position: 'bottom',
                    onClick: (e, legendItem, legend) => {
                        // 1. Führe das Standard-Verhalten aus (blendet den Graphen aus)
                        Chart.defaults.plugins.legend.onClick(e, legendItem, legend);

                        // 2. Rufe unseren injizierten Handler in main.js auf, um die Karte zu aktualisieren
                        legendClickCallback(legend.chart); 

                        // --- 3. NEU: ANNOTATIONS-LINIEN SYNCHRONISIEREN ---
                        try {
                            const chart = legend.chart;
                            const clickedDatasetIndex = legendItem.datasetIndex;
                            const clickedDataset = chart.data.datasets[clickedDatasetIndex];

                            const summaryKey = clickedDataset.summaryKey;
                            if (!summaryKey) return; 

                            const isVisible = chart.isDatasetVisible(clickedDatasetIndex);

                            const annotations = chart.options.plugins.annotation.annotations;
                            let changed = false;

                            for (const key in annotations) {
                                const annotation = annotations[key];

                                // Suche Linien, die EXAKT denselben 'summaryKey' haben
                                if (annotation.type === 'line' && annotation.summaryKey === summaryKey) {
                                    annotation.display = isVisible; // Setze denselben Status
                                    changed = true;
                                }
                            }

                            // Wenn wir was geändert haben, Chart neu zeichnen
                            if (changed) {
                                chart.update();
                            }
                        } catch (err) {
                            console.error("Fehler beim Synchronisieren der Annotations-Sichtbarkeit:", err);
                        }
                        // --- ENDE NEUER CODE ---
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