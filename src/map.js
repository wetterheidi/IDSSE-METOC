// map.js

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
    warningAreasLayer.clearLayers(); // Alte Flächen löschen

    // Wenn kein Summary da ist (z.B. vor der ersten Prüfung), tu nichts.
    if (!summary) return;

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
            // Wenn es nur 1 oder 2 Punkte sind, zeichnen wir einen Kreis (Fallback)
            if (pointFeatures.features.length >= 1) {
                 pointFeatures.features.forEach(feature => {
                    const coords = feature.geometry.coordinates; // [lon, lat]
                    L.circleMarker([coords[1], coords[0]], { 
                        radius: 8, // Etwas größerer Punkt
                        color: color,
                        fillColor: color,
                        fillOpacity: 0.8 
                    }).bindTooltip(tooltipText).addTo(warningAreasLayer);
                 });
            }
            return; // Keine Fläche möglich
        }

        try {
            // 1. Konvexe Hülle (Die kleinste konvexe Fläche, die alle Punkte umschließt)
            const hull = turf.convex(pointFeatures);

            if (hull) {
                // 2. Zeichne das GeoJSON-Polygon mit Stil
                L.geoJSON(hull, {
                    style: {
                        color: color,
                        weight: 2,
                        opacity: 0.8,
                        fillColor: color,
                        fillOpacity: 0.2
                    }
                }).bindTooltip(tooltipText, {sticky: true}).addTo(warningAreasLayer);
            }
        } catch(e) {
            console.error("Turf.js Fehler beim Erstellen der konvexen Hülle:", e);
             // Fallback: Wenn convex fehlschlägt, zeichne Punkte als Marker
            if (pointFeatures.features.length >= 1) {
                 pointFeatures.features.forEach(feature => {
                    const coords = feature.geometry.coordinates; // [lon, lat]
                    L.circleMarker([coords[1], coords[0]], { 
                        radius: 8,
                        color: color,
                        fillColor: color,
                        fillOpacity: 0.8 
                    }).bindTooltip(`FEHLER: Nur Punkte (${tooltipText})`).addTo(warningAreasLayer);
                 });
            }
        }
    };
    
    // Wind (Rot)
    const windAlarms = summary.wind.hourlyAlarms[hour];
    const windPoints = getPointFeatures(windAlarms);
    if (windAlarms && windAlarms.size > 0) {
        const tooltip = `Wind (${hour}h): ${summary.wind.max.toFixed(1)} km/h`;
        drawWarningArea(windPoints, '#dc3545', tooltip); // Rot
    }
    
    // Temp (Blau)
    const tempAlarms = summary.temp.hourlyAlarms[hour];
    const tempPoints = getPointFeatures(tempAlarms);
    if (tempAlarms && tempAlarms.size > 0) {
        const tooltip = `Temp (${hour}h): ${summary.temp.min.toFixed(1)} °C`;
        drawWarningArea(tempPoints, '#007bff', tooltip); // Blau
    }
    
    // Sicht (Orange/Braun)
    const visAlarms = summary.vis.hourlyAlarms[hour];
    const visPoints = getPointFeatures(visAlarms);
    if (visAlarms && visAlarms.size > 0) {
        const tooltip = `Sicht (${hour}h): ${summary.vis.min.toFixed(0)} m`;
        drawWarningArea(visPoints, '#ffc107', tooltip); // Orange (Warnfarbe)
    }

    // Wolken (Grau)
    const cloudAlarms = summary.cloud.hourlyAlarms[hour];
    const cloudPoints = getPointFeatures(cloudAlarms);
    if (cloudAlarms && cloudAlarms.size > 0) {
        const tooltip = `Wolken (${hour}h): ${summary.cloud.min.toFixed(0)} m`;
        drawWarningArea(cloudPoints, '#6c757d', tooltip); // Grau
    }

    // Niederschlag (Dunkelblau)
    const precipAlarms = summary.precip.hourlyAlarms[hour];
    const precipPoints = getPointFeatures(precipAlarms);
    if (precipAlarms && precipAlarms.size > 0) {
        const tooltip = `Niederschlag (${hour}h): ${summary.precip.max.toFixed(0)}%`;
        drawWarningArea(precipPoints, '#000080', tooltip); // Dunkelblau
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
    } catch(e) {
        console.error("Fehler beim Zoomen auf GeoJSON:", e, geojson);
    }
};