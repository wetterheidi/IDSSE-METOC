// docs/map.js (Version 3.0 - Strukturiert und funktionsgleich)

// -----------------------------------------------------------
// 1. IMPORTS
// -----------------------------------------------------------
import { getManualOverrides, getVisibleChartMetrics } from './main.js';
import { METRICS_CONFIG, isMetricActive } from './metricsConfig.js'; 
import { getBlendedStatus } from './utils.js'; 
import { forward } from 'https://cdn.jsdelivr.net/npm/mgrs@latest/mgrs.min.js';


// -----------------------------------------------------------
// 2. MODUL-ZUSTAND
// -----------------------------------------------------------
let map;
let warningAreasLayer;
let samplePointsLayer;
let profileBoundaryLayer;
let mgrsGridLayer = null; // MGRS Gitter Layer


// -----------------------------------------------------------
// 3. LEAFLET/GEOMAN HELFER
// -----------------------------------------------------------

/**
 * Initialisiert Leaflet-Geoman.
 */
export const initGeoman = (leafletMap) => {
    leafletMap.pm.addControls({
        position: 'topleft',
        drawPolyline: false,
        drawPolygon: true,
        drawRectangle: true,
        drawCircle: false,
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
 */
export const onMapCreate = (callback) => {
    map.on('pm:create', (e) => {
        callback(e.layer);
    });
};


// -----------------------------------------------------------
// 4. MGRS GITTER LOGIK (Wiederhergestellt)
// -----------------------------------------------------------

/**
 * Initialisiert das MGRS-Gitter – muss NACH map = L.map(...) aufgerufen werden!
 */
export function initMGRSGrid() {
    mgrsGridLayer = L.layerGroup().addTo(map);

    // Automatisches Update bei Zoom/Pan
    map.on('zoomend moveend', updateMGRSGrid);

    // Erstes Zeichnen
    updateMGRSGrid();
}

/**
 * Aktualisiert das MGRS-Gitter
 */
export function updateMGRSGrid() {
    if (!mgrsGridLayer) return;
    mgrsGridLayer.clearLayers();

    const bounds = map.getBounds();
    const zoom = map.getZoom();

    if (zoom < 8) return;

    const levels = [];
    if (zoom >= 16) levels.push({ size: 100, color: '#ffff00', weight: 1, dash: null });
    if (zoom >= 14) levels.push({ size: 1000, color: '#00ff00', weight: 1.5, dash: null });
    if (zoom >= 12) levels.push({ size: 10000, color: '#0000ff', weight: 2, dash: null });
    if (zoom >= 8) levels.push({ size: 100000, color: '#ff0000', weight: 2, dash: '10, 10' });

    levels.forEach(level => drawMGRSGridLevel(bounds, level));
}

function metersToDegrees(meters, latitude = 0) {
    const earthRadius = 6371000; // Meter
    const degPerMeterLat = 180 / (Math.PI * earthRadius);
    const degPerMeterLng = 180 / (Math.PI * earthRadius * Math.cos(latitude * Math.PI / 180));
    return {
        lat: meters * degPerMeterLat,
        lng: meters * degPerMeterLng
    };
}

function drawMGRSGridLevel(bounds, level) {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const centerLat = (sw.lat + ne.lat) / 2;

    const deg = metersToDegrees(level.size, centerLat);
    const gridSizeLat = deg.lat;
    const gridSizeLng = deg.lng;

    const startLat = Math.floor(sw.lat / gridSizeLat) * gridSizeLat;
    const startLng = Math.floor(sw.lng / gridSizeLng) * gridSizeLng;
    const endLat = Math.ceil(ne.lat / gridSizeLat) * gridSizeLat;
    const endLng = Math.ceil(ne.lng / gridSizeLng) * gridSizeLng;

    let precision = 0;
    if (level.size === 100) precision = 5;      
    else if (level.size === 1000) precision = 4; 
    else if (level.size === 10000) precision = 3; 
    else if (level.size === 100000) precision = 1; 

    // Vertikale Linien + Label (rechts)
    for (let lng = startLng; lng <= endLng + gridSizeLng; lng += gridSizeLng) {
        if (lng < sw.lng - gridSizeLng || lng > ne.lng + gridSizeLng) continue;

        const line = L.polyline([[startLat, lng], [endLat, lng]], {
            color: level.color,
            weight: level.weight,
            opacity: 0.85,
            dashArray: level.dash || null
        }).addTo(mgrsGridLayer);

        // Label in der Mitte der Linie (rechts)
        if (level.size >= 1000) {
            const cellLat = startLat + gridSizeLat / 2;
            const cellLng = startLng + gridSizeLng / 2;
            if (cellLat >= sw.lat && cellLat <= ne.lat && cellLng >= sw.lng && cellLng <= ne.lng) {
                try {
                    const mgrs = forward([cellLng, cellLat], precision);
                    const label = mgrs.split(' ').slice(-2).join(' ');
                    L.marker([cellLat, cellLng], {
                        icon: L.divIcon({
                            className: 'mgrs-label',
                            html: `<div style="background:${level.color};color:white;padding:2px 6px;font-size:11px;border-radius:3px;font-weight:bold;">${label}</div>`,
                            iconSize: [60, 20]
                        })
                    }).addTo(mgrsGridLayer);
                } catch (e) { /* silent fail */ }
            }
        }
    }

    // Horizontale Linien + Label (oben)
    for (let lat = startLat; lat <= endLat + gridSizeLat; lat += gridSizeLat) {
        if (lat < sw.lat - gridSizeLat || lat > ne.lat + gridSizeLat) continue;

        const line = L.polyline([[lat, startLng], [lat, endLng]], {
            color: level.color,
            weight: level.weight,
            opacity: 0.85,
            dashArray: level.dash || null
        }).addTo(mgrsGridLayer);

        // Label in der Mitte der Linie (oben)
        const midLng = (startLng + endLng) / 2;
        if (midLng >= sw.lng && midLng <= ne.lng) {
            try {
                const mgrs = forward([midLng, lat], precision);
                const parts = mgrs.split(' ');
                const label = parts.slice(-2).join(' ');

                line.bindTooltip(label, {
                    permanent: true,
                    direction: 'top',
                    className: 'mgrs-label',
                    offset: [0, -8],
                    opacity: 0.9
                });
            } catch (e) { /* silent fail */ }
        }
    }
}


// -----------------------------------------------------------
// 5. HAUPT-EXPORT FUNKTIONEN (Karte & Visualisierung)
// -----------------------------------------------------------

/**
 * Initialisiert die Leaflet-Karte und die Layer-Gruppen.
 */
export const initMap = () => {
    map = L.map('map').setView([48.711, 8.78], 8);
    L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href=\"https://www.opentopomap.org/copyright\">OpenStreetMap</a> contributors',
        minZoom: 3,
    }).addTo(map);

    L.control.scale({
        metric: true,    
        imperial: false  
    }).addTo(map);

    // 1. Koordinaten-Kontrolle (Wiederhergestellt)
    const CoordsControl = L.Control.extend({
        options: {
            position: 'bottomright'
        },
        onAdd: function (map) {
            this._container = L.DomUtil.create('div', 'leaflet-control-coords');
            this.update(null, null); 
            return this._container;
        },
        update: function (latlng, mgrsString) { 
            if (latlng && mgrsString) {
                const lat = latlng.lat.toFixed(5);
                const lng = latlng.lng.toFixed(5);
                this._container.innerHTML = `MGRS: <strong>${mgrsString}</strong><br>Lat: ${lat} | Lng: ${lng}`;
            } else {
                this._container.innerHTML = 'MGRS: --<br>Lat/Lng: --';
            }
        }
    });
    const coordsControl = new CoordsControl();
    map.addControl(coordsControl);
    map.on('mousemove', (e) => {
        try {
            const coords = [e.latlng.lng, e.latlng.lat];
            const mgrsString = forward(coords, 5);
            coordsControl.update(e.latlng, mgrsString);
        } catch (err) {
            coordsControl.update(e.latlng, "Ungültig");
        }
    });
    map.on('mouseout', () => { coordsControl.update(null); });

    // Layer-Gruppen initialisieren
    warningAreasLayer = L.layerGroup().addTo(map);
    samplePointsLayer = L.layerGroup().addTo(map);
    profileBoundaryLayer = L.layerGroup().addTo(map);
    
    // MGRS Gitter Initialisierung (Aufruf des neuen Helpers)
    initMGRSGrid();
    
    return map;
};


/**
 * Zeichnet die Alarm-Punkte für EINE BESTIMMTE STUNDE (Wiederhergestellt - Polygon-Logik).
 * @param {object} profile - Das aktuell geladene Profil.
 * @param {object} summary - Die Wetter-Zusammenfassung.
 * @param {number} hour - Die aktuell gewählte Stunde (0-23).
 */
export const visualizeWarnings = (profile, summary, hour) => {
    warningAreasLayer.clearLayers();

    if (!profile || !summary) return;

    const rules = profile.rules;

    const hourInt = parseInt(hour, 10);
    const hourString = hourInt.toString();

    // Finde einen Referenz-Key (z.B. 'wind'), um die Stunden-Arrays zu prüfen
    const firstMetricKey = Object.values(METRICS_CONFIG)[0].summaryKey;
    if (!summary[firstMetricKey] || !summary[firstMetricKey].hourlyStatus) return;

    const hours = Object.keys(summary[firstMetricKey].hourlyStatus).sort((a, b) => parseInt(a) - parseInt(b));

    // --- Helfer 1: drawWarningArea (Polygon/Hüll-Logik) ---
    const drawWarningArea = (pointFeatures, style, tooltipText) => {
        if (pointFeatures.features.length < 3) {
            if (pointFeatures.features.length >= 1) {
                pointFeatures.features.forEach(feature => {
                    const coords = feature.geometry.coordinates; // [lon, lat]
                    L.circleMarker([coords[1], coords[0]], { // Leaflet: [lat, lon]
                        radius: 8,
                        color: style.color,
                        fillColor: style.fillColor,
                        fillOpacity: (style.fillOpacity || 0.2) + 0.4,
                        weight: style.weight,
                        dashArray: style.dashArray
                    }).bindTooltip(tooltipText).addTo(warningAreasLayer);
                });
            }
            return;
        }
        try {
            const hull = turf.convex(pointFeatures);
            if (hull) {
                L.geoJSON(hull, {
                    style: style
                }).bindTooltip(tooltipText, { sticky: true }).addTo(warningAreasLayer);
            }
        } catch (e) {
            console.error("Turf.js Fehler beim Erstellen der konvexen Hülle:", e);
        }
    };
    // --- Helfer 2: getPointFeatures ---
    const getPointFeatures = (alarmSet) => {
        const points = [];
        if (!alarmSet) return turf.featureCollection(points);
        alarmSet.forEach(locationString => {
            const coords = locationString.split(','); // "lat,lon"
            points.push(turf.point([parseFloat(coords[1]), parseFloat(coords[0])])); // Turf: [lon, lat]
        });
        return turf.featureCollection(points);
    };
    // --- Helfer 3: getFallbackLocations ---
    const getFallbackLocations = (summaryKey, currentHourString) => {
        const reversedHours = hours.slice(0, hours.indexOf(currentHourString)).reverse();
        for (const h of reversedHours) {
            const prevAlarms = summary[summaryKey].hourlyAlarms[h];
            if (prevAlarms && prevAlarms.size > 0) {
                return prevAlarms; 
            }
        }
        return null; 
    };

    const visibleMetrics = getVisibleChartMetrics();

    // --- DYNAMISCHE SCHLEIFE ---
    for (const metric of Object.values(METRICS_CONFIG)) {
        const { summaryKey, ruleName, displayName, chartColor, formatter } = metric;

        if (!visibleMetrics.has(summaryKey)) continue;
        if (!isMetricActive(metric, rules)) continue;

        // Status (Ampel) prüfen: Nutzung der zentralisierten Logik aus utils.js
        const blendedStatus = getBlendedStatus(summary, summaryKey, hourString, getManualOverrides);

        if (blendedStatus === 'ok' || blendedStatus === 'no-data') continue;

        let alarmPoints = summary[summaryKey].hourlyAlarms[hourString];

        // Fallback: Wenn für diese Stunde keine Punkte da sind
        if (!alarmPoints || alarmPoints.size === 0) {
            alarmPoints = getFallbackLocations(summaryKey, hourString);
        }

        if (alarmPoints && alarmPoints.size > 0) {

            let style = {
                color: chartColor, 
                weight: 2,
                opacity: 0.8,
                fillColor: chartColor,
                fillOpacity: 0.2,     
                dashArray: '5, 5'     
            };

            if (blendedStatus === 'alarm') {
                style.weight = 3;       
                style.fillOpacity = 0.4; 
                style.dashArray = null; 
            }

            const { value, unit } = formatter(summary[summaryKey].value, profile);
            const tooltip = `${displayName} (${hourString}h): ${blendedStatus.toUpperCase()} (Wert: ${value} ${unit})`;

            drawWarningArea(getPointFeatures(alarmPoints), style, tooltip);
        }
    }
};

/**
 * Zeichnet die Sampling-Punkte (grau).
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
        const latLng = [coords[1], coords[0]]; 
        L.circleMarker(latLng, {
            radius: 4,
            color: 'gray',
            fillOpacity: 0.5
        }).addTo(samplePointsLayer);
    });
};

/**
 * Löscht alle temporären Karten-Layer (Wiederhergestellt).
 */
export const clearMapLayers = () => {
    warningAreasLayer.clearLayers();
    samplePointsLayer.clearLayers();
    profileBoundaryLayer.clearLayers();
};

/**
 * Zeichnet den blauen Umriss des geladenen Profils (Wiederhergestellt).
 */
export const drawProfileBoundary = (geojson) => {
    if (!geojson) return;

    const style = {
        color: '#007bff', 
        weight: 3,
        opacity: 0.9,
        fill: false, 
        dashArray: '5, 5' 
    };

    L.geoJSON(geojson, { style: style })
        .bindTooltip("Aktives Profil-Gebiet")
        .addTo(profileBoundaryLayer);
};

/**
 * Zoomt die Karte auf ein GeoJSON-Objekt (Wiederhergestellt).
 */
export const zoomToGeoJSON = (geojson) => {
    try {
        map.fitBounds(L.geoJSON(geojson).getBounds());
    } catch (e) {
        console.error("Fehler beim Zoomen auf GeoJSON:", e, geojson);
    }
};

// --- DEBUG TIMEOUT (Behalten) ---
setTimeout(() => {
    console.log("[map.js] MGRS-Gitter Debug-Check: Initiale Ausführung sollte erfolgt sein.");
}, 3000);