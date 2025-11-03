// map.js
import { getManualOverrides } from './main.js'; // NEU: Importiere Overrides

// Modul-interne Variablen für die Karten-Objekte
let map;
let warningAreasLayer;
let samplePointsLayer;

/**
 * Initialisiert die Leaflet-Karte und die Layer-Gruppen.
 */
export const initMap = () => {
    map = L.map('map').setView([52.52, 13.405], 6); // Start-Zoom weiter raus
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Layer-Gruppen initialisieren
    warningAreasLayer = L.layerGroup().addTo(map); // NEU
    samplePointsLayer = L.layerGroup().addTo(map);

    return map; // Gibt die Instanz an main.js zurück
};

/**
 * Initialisiert Leaflet-Geoman.
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
        cutPolygon: true,
        removalMode: true,
        rotateMode: false,
        lassoMode: true
    });
    leafletMap.pm.setLang('de');
};

/**
 * Setzt den Event-Listener für 'pm:create'
 */
export const onMapCreate = (callback) => {
    map.on('pm:create', (e) => {
        callback(e.layer);
    });
};

/**
 * Zeichnet die Alarm-Punkte für EINE BESTIMMTE STUNDE.
 * (Version 3.0: "Stunden-bewusst")
 */
export const visualizeWarnings = (summary, hour) => {
    warningAreasLayer.clearLayers(); // Alte Flächen löschen

    // Wenn kein Summary da ist (z.B. vor der ersten Prüfung), tu nichts.
    if (!summary) return;

        const hourInt = parseInt(hour, 10);
    const hourString = hourInt.toString(); 

    // Stundenliste (0, 1, ..., 23)
    const hours = Object.keys(summary.wind.hourlyStatus).sort((a, b) => parseInt(a) - parseInt(b));

    // Helferfunktion, um die Alarm-Standorte zu finden (mit Fallback)
    const getAlarmLocations = (ruleKey, currentHourString, autoAlarms) => {
        const blendedStatus = getBlendedStatus(summary, ruleKey, currentHourString);
        
        // 1. Wenn der automatische Status alarm/warn ist, verwende die automatischen Standorte.
        if (autoAlarms && autoAlarms.size > 0) {
            return autoAlarms;
        }

        // 2. Wenn der manuelle Status alarm/warn ist, aber Auto NICHT (d.h. Override)
        if (blendedStatus === 'alarm' || blendedStatus === 'warn') {
            // Finde die Standorte des LETZTEN automatischen Alarms, um eine Fläche zu zeichnen.
            const reversedHours = hours.slice(0, hours.indexOf(currentHourString)).reverse();
            for (const h of reversedHours) {
                const prevAlarms = summary[ruleKey].hourlyAlarms[h];
                if (prevAlarms && prevAlarms.size > 0) {
                    console.log(`Map: Manuelle Warnung für ${ruleKey} (${currentHourString}h) nutzt Standorte von ${h}h.`);
                    return prevAlarms;
                }
            }
        }
        
        return null;
    };

    // Helfer, um GeoJSON-Punkte aus dem Set zu erstellen (Turf braucht [lon, lat])
    const getPointFeatures = (alarmSet) => {
        const points = [];
        if (!alarmSet) return turf.featureCollection(points);
        alarmSet.forEach(locationString => {
            const coords = locationString.split(','); // "lat,lon"
            // Turf braucht [lon, lat]
            points.push(turf.point([parseFloat(coords[1]), parseFloat(coords[0])]));
        });
        return turf.featureCollection(points);
    };

    // Helfer, um die Fläche zu zeichnen
    const drawWarningArea = (pointFeatures, color, tooltipText) => {
        if (pointFeatures.features.length < 3) {
            // Fallback: Zeichne Punkte als Marker
            if (pointFeatures.features.length >= 1) {
                pointFeatures.features.forEach(feature => {
                    const coords = feature.geometry.coordinates; // [lon, lat]
                    L.circleMarker([coords[1], coords[0]], {
                        radius: 8,
                        color: color,
                        fillColor: color,
                        fillOpacity: 0.8
                    }).bindTooltip(tooltipText).addTo(warningAreasLayer);
                });
            }
            return; // Keine Fläche möglich
        }

        try {
            const hull = turf.convex(pointFeatures);

            if (hull) {
                L.geoJSON(hull, {
                    style: {
                        color: color,
                        weight: 2,
                        opacity: 0.8,
                        fillColor: color,
                        fillOpacity: 0.2
                    }
                }).bindTooltip(tooltipText, { sticky: true }).addTo(warningAreasLayer);
            }
        } catch (e) {
            console.error("Turf.js Fehler beim Erstellen der konvexen Hülle:", e);
        }
    };

    // --- Wind (Rot) ---
    const windAlarms = getAlarmLocations('wind', hourString, summary.wind.hourlyAlarms[hourString]);
    if (windAlarms && windAlarms.size > 0) {
        const blendedStatus = getBlendedStatus(summary, 'wind', hourString);
        const tooltip = `Wind (${hourString}h): ${blendedStatus.toUpperCase()} (Max: ${summary.wind.max.toFixed(1)} km/h)`;
        drawWarningArea(getPointFeatures(windAlarms), '#dc3545', tooltip); 
    }
    
    // --- Temp (Blau) ---
    const tempAlarms = getAlarmLocations('temp', hourString, summary.temp.hourlyAlarms[hourString]);
    if (tempAlarms && tempAlarms.size > 0) {
        const blendedStatus = getBlendedStatus(summary, 'temp', hourString);
        const tooltip = `Temp (${hourString}h): ${blendedStatus.toUpperCase()} (Min: ${summary.temp.min.toFixed(1)} °C)`;
        drawWarningArea(getPointFeatures(tempAlarms), '#007bff', tooltip);
    }
    
    // --- Sicht (Orange/Braun) ---
    const visAlarms = getAlarmLocations('vis', hourString, summary.vis.hourlyAlarms[hourString]);
    if (visAlarms && visAlarms.size > 0) {
        const blendedStatus = getBlendedStatus(summary, 'vis', hourString);
        const tooltip = `Sicht (${hourString}h): ${blendedStatus.toUpperCase()} (Min: ${summary.vis.min.toFixed(0)} m)`;
        drawWarningArea(getPointFeatures(visAlarms), '#ffc107', tooltip); 
    }

    // --- Wolken (Grau) ---
    const cloudAlarms = getAlarmLocations('cloud', hourString, summary.cloud.hourlyAlarms[hourString]);
    if (cloudAlarms && cloudAlarms.size > 0) {
        const blendedStatus = getBlendedStatus(summary, 'cloud', hourString);
        const tooltip = `Wolken (${hourString}h): ${blendedStatus.toUpperCase()} (Max: ${summary.cloud.max.toFixed(0)} %)`;
        drawWarningArea(getPointFeatures(cloudAlarms), '#6c757d', tooltip); 
    }

    // --- Niederschlag (Dunkelblau) ---
    const precipAlarms = getAlarmLocations('precip', hourString, summary.precip.hourlyAlarms[hourString]);
    if (precipAlarms && precipAlarms.size > 0) {
        const blendedStatus = getBlendedStatus(summary, 'precip', hourString);
        const tooltip = `Niederschlag (${hourString}h): ${blendedStatus.toUpperCase()} (Max: ${summary.precip.max.toFixed(0)} %)`;
        drawWarningArea(getPointFeatures(precipAlarms), '#000080', tooltip); 
    }
};

/**
 * Zeichnet die Sampling-Punkte (grau)
 * (Version 2.0: Filtert nicht mehr selbst, zeichnet nur 'gridPoints')
 */
export const drawSamplePoints = (gridPoints, geojson) => {
    samplePointsLayer.clearLayers();

    // KUGELSICHERER CHECK:
    if (!gridPoints || !gridPoints.features) {
        console.warn("drawSamplePoints: 'gridPoints' ist ungültig, nichts zu zeichnen.");
        return;
    }

    // Wir filtern nicht mehr (das macht getGridPoints), wir zeichnen einfach
    gridPoints.features.forEach(pointFeature => {
        // KUGELSICHERER CHECK für GeoJSON-Punkt
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
 */
export const clearMapLayers = () => {
    warningAreasLayer.clearLayers();
    samplePointsLayer.clearLayers();
};

/**
 * Zoomt die Karte auf ein GeoJSON-Objekt
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
 */
function getBlendedStatus(summary, ruleKey, hour) {
    const overrides = getManualOverrides();
    // Der hour-Parameter von visualizeWarnings ist ein String (z.B. '7')
    const hourString = hour.toString();
    const autoStatus = summary[ruleKey] ? summary[ruleKey].hourlyStatus[hourString] : 'ok';
    const manualStatus = overrides[ruleKey] ? overrides[ruleKey][hourString] : null;

    return manualStatus || autoStatus;
}

