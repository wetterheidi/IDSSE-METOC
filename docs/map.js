// map.js (Version 2.0 - Config-Driven)
import { getManualOverrides, getVisibleChartMetrics } from './main.js';
// NEU: Importiere das "Gehirn"
import { METRICS_CONFIG } from './metricsConfig.js';

// Modul-interne Variablen für die Karten-Objekte
let map;
let warningAreasLayer;
let samplePointsLayer;
let profileBoundaryLayer;

/**
 * Initialisiert die Leaflet-Karte und die Layer-Gruppen.
 * (Unverändert)
 */
export const initMap = () => {
    map = L.map('map').setView([52.52, 13.405], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        minZoom: 3,
    }).addTo(map);
    warningAreasLayer = L.layerGroup().addTo(map);
    samplePointsLayer = L.layerGroup().addTo(map);
    profileBoundaryLayer = L.layerGroup().addTo(map);
    return map;
};

/**
 * Initialisiert Leaflet-Geoman.
 * (Unverändert)
 */
export const initGeoman = (leafletMap) => {
    leafletMap.pm.addControls({
        position: 'topleft',
        drawPolyline: false,
        drawPolygon: true,
        drawRectangle: true,
        drawCircle: true,
        drawMarker: false,
        drawCircleMarker: false,
        drawText: false,
        editMode: true,
        dragMode: true,
        cutPolygon: false,
        removalMode: true,
        rotateMode: false,
        lassoMode: true
    });
    leafletMap.pm.setLang('de');
};

/**
 * Setzt den Event-Listener für 'pm:create'
 * (Unverändert)
 */
export const onMapCreate = (callback) => {
    map.on('pm:create', (e) => {
        callback(e.layer);
    });
};

/**
 * Zeichnet die Alarm-Punkte für EINE BESTIMMTE STUNDE.
 * NEU: Komplett dynamisch basierend auf METRICS_CONFIG.
 * NEU: Signatur geändert -> benötigt jetzt 'profile'.
 */
export const visualizeWarnings = (profile, summary, hour) => {
    warningAreasLayer.clearLayers();

    // Wenn kein Summary oder Profil da ist, tu nichts.
    if (!profile || !summary) return;

    const hourInt = parseInt(hour, 10);
    const hourString = hourInt.toString();

    // Finde einen Referenz-Key (z.B. 'wind'), um die Stunden-Arrays zu prüfen
    const firstMetricKey = Object.values(METRICS_CONFIG)[0].summaryKey;
    if (!summary[firstMetricKey] || !summary[firstMetricKey].hourlyStatus) return;
    const hours = Object.keys(summary[firstMetricKey].hourlyStatus).sort((a, b) => parseInt(a) - parseInt(b));

    // --- Helfer: getAlarmLocations (Angepasst) ---
    // (Findet Alarm-Standorte, auch für manuelle Overrides ohne autom. Alarm)
    const getAlarmLocations = (summaryKey, currentHourString, autoAlarms) => {
        const blendedStatus = getBlendedStatus(summary, summaryKey, currentHourString);

        if (autoAlarms && autoAlarms.size > 0) {
            return autoAlarms;
        }

        if (blendedStatus === 'alarm' || blendedStatus === 'warn') {
            const reversedHours = hours.slice(0, hours.indexOf(currentHourString)).reverse();
            for (const h of reversedHours) {
                const prevAlarms = summary[summaryKey].hourlyAlarms[h];
                if (prevAlarms && prevAlarms.size > 0) {
                    return prevAlarms;
                }
            }
        }
        return null;
    };

    // --- Helfer: getPointFeatures (Unverändert) ---
    const getPointFeatures = (alarmSet) => {
        const points = [];
        if (!alarmSet) return turf.featureCollection(points);
        alarmSet.forEach(locationString => {
            const coords = locationString.split(','); // "lat,lon"
            points.push(turf.point([parseFloat(coords[1]), parseFloat(coords[0])])); // Turf: [lon, lat]
        });
        return turf.featureCollection(points);
    };

    // --- Helfer: drawWarningArea (Unverändert) ---
    const drawWarningArea = (pointFeatures, color, tooltipText) => {
        if (pointFeatures.features.length < 3) {
            if (pointFeatures.features.length >= 1) {
                pointFeatures.features.forEach(feature => {
                    const coords = feature.geometry.coordinates; // [lon, lat]
                    L.circleMarker([coords[1], coords[0]], { // Leaflet: [lat, lon]
                        radius: 8, color: color, fillColor: color, fillOpacity: 0.8
                    }).bindTooltip(tooltipText).addTo(warningAreasLayer);
                });
            }
            return;
        }
        try {
            const hull = turf.convex(pointFeatures);
            if (hull) {
                L.geoJSON(hull, {
                    style: { color: color, weight: 2, opacity: 0.8, fillColor: color, fillOpacity: 0.2 }
                }).bindTooltip(tooltipText, { sticky: true }).addTo(warningAreasLayer);
            }
        } catch (e) {
            console.error("Turf.js Fehler beim Erstellen der konvexen Hülle:", e);
        }
    };

    const visibleMetrics = getVisibleChartMetrics();

    // --- DYNAMISCHE SCHLEIFE statt 5 harter Blöcke ---
    for (const metric of Object.values(METRICS_CONFIG)) {
        const { summaryKey, ruleName, displayName, chartColor, formatter } = metric;

        // Überspringe das Zeichnen, wenn die Metrik im Graphen ausgeblendet ist
        if (!visibleMetrics.has(summaryKey)) {
            continue;
        }

        // Überspringen, wenn die Regel im Profil nicht aktiv ist
        if ((profile.rules[ruleName + '_alarm'] === null || profile.rules[ruleName + '_alarm'] === undefined) &&
            (profile.rules[ruleName + '_warn'] === null || profile.rules[ruleName + '_warn'] === undefined)) {
            continue;
        }

        // Finde die Alarme für diese Metrik
        const alarms = getAlarmLocations(summaryKey, hourString, summary[summaryKey].hourlyAlarms[hourString]);

        if (alarms && alarms.size > 0) {
            const blendedStatus = getBlendedStatus(summary, summaryKey, hourString);

            // NEU: Nutze den Formatter aus der Config für den Tooltip
            // .value ist der aggregierte Min/Max-Wert aus weather.js
            const { value, unit } = formatter(summary[summaryKey].value, profile);

            const tooltip = `${displayName} (${hourString}h): ${blendedStatus.toUpperCase()} (Wert: ${value} ${unit})`;
            drawWarningArea(getPointFeatures(alarms), chartColor, tooltip);
        }
    }
    // --- ENDE DYNAMISCHE SCHLEIFE ---
};

/**
 * Zeichnet die Sampling-Punkte (grau)
 * (Unverändert)
 */
export const drawSamplePoints = (gridPoints, geojson) => {
    samplePointsLayer.clearLayers();
    if (!gridPoints || !gridPoints.features) {
        console.warn("drawSamplePoints: 'gridPoints' ist ungültig, nichts zu zeichnen.");
        return;
    }
    gridPoints.features.forEach(pointFeature => {
        if (!pointFeature || !pointFeature.geometry || !pointFeature.geometry.coordinates) return;
        const coords = pointFeature.geometry.coordinates;
        const latLng = [coords[1], coords[0]]; // Leaflet braucht [Lat, Lon]
        L.circleMarker(latLng, {
            radius: 4,
            color: 'gray',
            fillOpacity: 0.5
        }).addTo(samplePointsLayer);
    });
};

/**
 * Leert alle temporären Karten-Layer
 * (Unverändert)
 */
export const clearMapLayers = () => {
    warningAreasLayer.clearLayers();
    samplePointsLayer.clearLayers();
    profileBoundaryLayer.clearLayers();
};

/**
 * NEU: Zeichnet den blauen Umriss des geladenen Profils
 */
export const drawProfileBoundary = (geojson) => {
    if (!geojson) return;

    const style = {
        color: '#007bff', // Ein klares Blau
        weight: 3,
        opacity: 0.9,
        fill: false, // Wichtig: Keine Füllung
        dashArray: '5, 5' // Gestrichelt
    };

    L.geoJSON(geojson, { style: style })
        .bindTooltip("Aktives Profil-Gebiet")
        .addTo(profileBoundaryLayer);
};

/**
 * Zoomt die Karte auf ein GeoJSON-Objekt
 * (Unverändert)
 */
export const zoomToGeoJSON = (geojson) => {
    try {
        map.fitBounds(L.geoJSON(geojson).getBounds());
    } catch (e) {
        console.error("Fehler beim Zoomen auf GeoJSON:", e, geojson);
    }
};

/**
 * Hilfsfunktion zum Blenden des Status (Modell + Override)
 * (Unverändert, nutzt summaryKey)
 */
function getBlendedStatus(summary, summaryKey, hour) {
    const overrides = getManualOverrides();
    const hourString = hour.toString();
    const autoStatus = summary[summaryKey] ? summary[summaryKey].hourlyStatus[hourString] : 'no-data';
    const manualStatus = overrides[summaryKey] ? overrides[summaryKey][hourString] : null;

    return manualStatus || autoStatus || 'no-data';
}

// HINWEIS: Die alte Hilfsfunktion `getDisplayValue` wird entfernt, 
// da wir jetzt die zentralen `formatter` aus der Config nutzen.