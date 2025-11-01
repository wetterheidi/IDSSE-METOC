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
 * Zeichnet die Alarm-Punkte (rot/blau/etc.)
 * (Version 2.0: Repariert nach BBox-Refactoring)
 */
export const visualizeWarnings = (summary) => {
    warningMarkersLayer.clearLayers();

    // Helfer, um Marker zu zeichnen
    const drawMarkers = (pointSet, color, fillOpacity, tooltip) => {
        pointSet.forEach(locationString => {
            // locationString ist "lat,lon"
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

    // 'affectedPoints' wird jetzt wieder von checkThresholds gefüllt
    if (summary.wind.triggered) drawMarkers(summary.wind.affectedPoints, 'red', 0.7, `Wind: ${summary.wind.max.toFixed(1)} km/h`);
    if (summary.temp.triggered) drawMarkers(summary.temp.affectedPoints, 'blue', 0.7, `Temp: ${summary.temp.min.toFixed(1)} °C`);
    if (summary.vis.triggered) drawMarkers(summary.vis.affectedPoints, '#8B4513', 0.7, `Sicht: ${summary.vis.min.toFixed(0)} m`);
    if (summary.cloud.triggered) drawMarkers(summary.cloud.affectedPoints, '#555', 0.7, `Wolken: ${summary.cloud.min.toFixed(0)} m`);
    if (summary.precip.triggered) drawMarkers(summary.precip.affectedPoints, '#000080', 0.7, `Niederschlag: ${summary.precip.max.toFixed(0)}%`);
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