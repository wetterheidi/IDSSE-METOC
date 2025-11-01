// map.js

// Modul-interne Variablen für die Karten-Objekte
let map;
let warningMarkersLayer;
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
    warningMarkersLayer = L.layerGroup().addTo(map);
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
        removalMode: true
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
    warningMarkersLayer.clearLayers();

    // Wenn kein Summary da ist (z.B. vor der ersten Prüfung), tu nichts.
    if (!summary) return;

    // Helfer (unverändert)
    const drawMarkers = (pointSet, color, fillOpacity, tooltip) => {
        pointSet.forEach(locationString => {
            const coords = locationString.split(',');
            const latLng = [parseFloat(coords[0]), parseFloat(coords[1])];
            L.circleMarker(latLng, {
                radius: 6,
                color: color,
                fillColor: color,
                fillOpacity: fillOpacity || 0.7
            }).bindTooltip(tooltip)
              .addTo(warningMarkersLayer);
        });
    };
    
    // --- NEUE LOGIK ---
    // Wir holen die Alarm-Sets für die EINE Stunde, die der Slider anzeigt.

    // Wind
    const windAlarms = summary.wind.hourlyAlarms[hour];
    if (windAlarms && windAlarms.size > 0) {
        drawMarkers(windAlarms, 'red', 0.7, `Wind (${hour}h): ${summary.wind.max.toFixed(1)} km/h`);
    }
    // Temp
    const tempAlarms = summary.temp.hourlyAlarms[hour];
    if (tempAlarms && tempAlarms.size > 0) {
        drawMarkers(tempAlarms, 'blue', 0.7, `Temp (${hour}h): ${summary.temp.min.toFixed(1)} °C`);
    }
    // Sicht
    const visAlarms = summary.vis.hourlyAlarms[hour];
    if (visAlarms && visAlarms.size > 0) {
        drawMarkers(visAlarms, '#8B4513', 0.7, `Sicht (${hour}h): ${summary.vis.min.toFixed(0)} m`);
    }
    // Wolken
    const cloudAlarms = summary.cloud.hourlyAlarms[hour];
    if (cloudAlarms && cloudAlarms.size > 0) {
        drawMarkers(cloudAlarms, '#555', 0.7, `Wolken (${hour}h): ${summary.cloud.min.toFixed(0)} m`);
    }
    // Niederschlag
    const precipAlarms = summary.precip.hourlyAlarms[hour];
    if (precipAlarms && precipAlarms.size > 0) {
        drawMarkers(precipAlarms, '#000080', 0.7, `Niederschlag (${hour}h): ${summary.precip.max.toFixed(0)}%`);
    }
};

/**
 * Zeichnet die Sampling-Punkte (grau)
 */
export const drawSamplePoints = (gridPoints, geojson) => {
    samplePointsLayer.clearLayers();
    
    // Filtere die Punkte, die *innerhalb* des Polygons liegen
    const pointsInside = turf.pointsWithinPolygon(gridPoints, geojson);
    
    pointsInside.features.forEach(pointFeature => {
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
    warningMarkersLayer.clearLayers();
    samplePointsLayer.clearLayers();
};

/**
 * Zoomt die Karte auf ein GeoJSON-Objekt
 */
export const zoomToGeoJSON = (geojson) => {
    try {
        map.fitBounds(L.geoJSON(geojson).getBounds());
    } catch(e) {
        console.error("Fehler beim Zoomen auf GeoJSON:", e, geojson);
    }
};