// map.js (Version 2.0 - Config-Driven)
import { getManualOverrides, getVisibleChartMetrics } from './main.js';
// NEU: Importiere das "Gehirn"
import { METRICS_CONFIG, isMetricActive } from './metricsConfig.js'; // <-- isMetricActive dazu
import { forward } from 'https://cdn.jsdelivr.net/npm/mgrs@latest/mgrs.min.js';

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
    map = L.map('map').setView([48.711, 8.78], 8);
    L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.opentopomap.org/copyright">OpenStreetMap</a> contributors',
        minZoom: 3,
    }).addTo(map);

    L.control.scale({
        metric: true,    // Zeigt metrische Einheiten (m, km)
        imperial: false  // Zeigt imperiale Einheiten (ft, mi) - setzen wir auf false
    }).addTo(map);

    // 1. Erstelle ein neues Leaflet Control
    const CoordsControl = L.Control.extend({
        options: {
            position: 'bottomright' // Position (z.B. unten rechts)
        },

        onAdd: function (map) {
            // Erstelle ein div-Element für die Anzeige
            this._container = L.DomUtil.create('div', 'leaflet-control-coords');
            // WICHTIG: Mehr Platz, da wir zwei Zeilen brauchen
            this._container.style.lineHeight = '1.4';
            this.update(null, null); // Starttext setzen
            return this._container;
        },

        // update-Methode zum Aktualisieren des Texts
        update: function (latlng, mgrsString) { // <-- Akzeptiert jetzt MGRS
            if (latlng && mgrsString) {
                const lat = latlng.lat.toFixed(5);
                const lng = latlng.lng.toFixed(5);
                // Zeigt MGRS in der ersten Zeile und Lat/Lng in der zweiten
                this._container.innerHTML = `MGRS: <strong>${mgrsString}</strong><br>Lat: ${lat} | Lng: ${lng}`;
            } else {
                // Starttext (zweizeilig)
                this._container.innerHTML = 'MGRS: --<br>Lat/Lng: --';
            }
        }
    });

    // 2. Erstelle eine Instanz des Controls und füge es zur Karte hinzu
    const coordsControl = new CoordsControl();
    map.addControl(coordsControl);

    // 3. Füge die Event-Listener zur Karte hinzu
    map.on('mousemove', (e) => {
        // --- HIER IST DIE KONVERTIERUNG ---
        try {
            // Die mgrs.js-Bibliothek erwartet [lng, lat]
            const coords = [e.latlng.lng, e.latlng.lat];

            // Konvertiere in MGRS (Präzision 5 = 1m)
            // 'window.mgrs' kommt von der mgrs.min.js, die wir in index.html geladen haben
            const mgrsString = forward(coords, 5);

            // Rufe die update-Methode mit beiden Werten auf
            coordsControl.update(e.latlng, mgrsString);

        } catch (err) {
            // Falls die Konvertierung fehlschlägt (z.B. Pol-Region)
            coordsControl.update(e.latlng, "Ungültig");
        }
    });

    map.on('mouseout', () => {
        // Leert die Anzeige, wenn die Maus die Karte verlässt
        coordsControl.update(null);
    });

    // Automatisches Update des MGRS-Gitters
    map.on('zoomend moveend', () => {
        updateMGRSGrid();
    });

    // Initial einmal zeichnen
    updateMGRSGrid();

    warningAreasLayer = L.layerGroup().addTo(map);
    samplePointsLayer = L.layerGroup().addTo(map);
    profileBoundaryLayer = L.layerGroup().addTo(map);
    initMGRSGrid();

    return map;
};

// --- MGRS GITTER – KORRIGIERTE VERSION (nach initMap!) ---
let mgrsGridLayer = null; // Wird erst in initMap() erzeugt!

/**
 * Initialisiert das MGRS-Gitter – muss NACH map = L.map(...) aufgerufen werden!
 */
export function initMGRSGrid() {
    // Jetzt ist map garantiert definiert!
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

    console.log(`[MGRS] Update bei Zoom ${zoom}, ${levels.length} Level(s)`);
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

    // 1. Meter → Grad
    const deg = metersToDegrees(level.size, centerLat);
    const gridSizeLat = deg.lat;
    const gridSizeLng = deg.lng;

    // 2. Gitter ausrichten
    const startLat = Math.floor(sw.lat / gridSizeLat) * gridSizeLat;
    const startLng = Math.floor(sw.lng / gridSizeLng) * gridSizeLng;
    const endLat = Math.ceil(ne.lat / gridSizeLat) * gridSizeLat;
    const endLng = Math.ceil(ne.lng / gridSizeLng) * gridSizeLng;

    // 3. Präzision für MGRS-Label wählen
    let precision = 0;
    if (level.size === 100) precision = 5;      // 100m → 1m genau
    else if (level.size === 1000) precision = 4; // 1km → 10m genau
    else if (level.size === 10000) precision = 3; // 10km → 100m genau
    else if (level.size === 100000) precision = 1; // 100km → 1km genau

    // 4. Vertikale Linien + Label (rechts)
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
                } catch (e) { }
            }
        }
    }

    // 5. Horizontale Linien + Label (oben)
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
            } catch (e) { }
        }
    }
}

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
 * KORRIGIERT (Step 19): Prüft den Status (Matrix) VOR den Punkten (Karte).
 */
export const visualizeWarnings = (profile, summary, hour) => {
    warningAreasLayer.clearLayers();

    // Wenn kein Summary oder Profil da ist, tu nichts.
    if (!profile || !summary) return;

    const rules = profile.rules;

    const hourInt = parseInt(hour, 10);
    const hourString = hourInt.toString();

    // Finde einen Referenz-Key (z.B. 'wind'), um die Stunden-Arrays zu prüfen
    const firstMetricKey = Object.values(METRICS_CONFIG)[0].summaryKey;
    if (!summary[firstMetricKey] || !summary[firstMetricKey].hourlyStatus) return;

    // ['0', '1', '2'...]
    const hours = Object.keys(summary[firstMetricKey].hourlyStatus).sort((a, b) => parseInt(a) - parseInt(b));

    // --- Helfer 1: drawWarningArea (Angepasst für 'style' Objekt) ---
    // (Dieser Helfer ist von unserem letzten Schritt, er ist korrekt)
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
    // --- Ende Helfer 1 ---

    // --- Helfer 2: getPointFeatures (Unverändert) ---
    const getPointFeatures = (alarmSet) => {
        const points = [];
        if (!alarmSet) return turf.featureCollection(points);
        alarmSet.forEach(locationString => {
            const coords = locationString.split(','); // "lat,lon"
            points.push(turf.point([parseFloat(coords[1]), parseFloat(coords[0])])); // Turf: [lon, lat]
        });
        return turf.featureCollection(points);
    };
    // --- Ende Helfer 2 ---

    // --- Helfer 3: getFallbackLocations (Angepasst) ---
    // (Findet Alarm-Standorte, NUR für Fallbacks wie manuelle Overrides)
    const getFallbackLocations = (summaryKey, currentHourString) => {
        // Sucht in *vorherigen* Stunden nach Punkten
        const reversedHours = hours.slice(0, hours.indexOf(currentHourString)).reverse();
        for (const h of reversedHours) {
            const prevAlarms = summary[summaryKey].hourlyAlarms[h];
            if (prevAlarms && prevAlarms.size > 0) {
                return prevAlarms; // Punkte aus vorheriger Stunde gefunden
            }
        }
        return null; // Keine Fallback-Punkte gefunden
    };
    // --- Ende Helfer 3 ---

    const visibleMetrics = getVisibleChartMetrics();

    // --- DYNAMISCHE SCHLEIFE (NEUE KORRIGIERTE LOGIK) ---
    for (const metric of Object.values(METRICS_CONFIG)) {
        const { summaryKey, ruleName, displayName, chartColor, formatter } = metric;

        // 1. Überspringen, wenn Metrik im Graphen ausgeblendet ist
        if (!visibleMetrics.has(summaryKey)) {
            continue;
        }

        // 2. Überspringen, wenn die Regel im Profil (rules) nicht aktiv ist
        if (!isMetricActive(metric, rules)) {
            continue;
        }

        // 3. Status (Ampel) zuerst prüfen
        const blendedStatus = getBlendedStatus(summary, summaryKey, hourString);

        // Wenn Status OK oder N/A, nichts zeichnen
        if (blendedStatus === 'ok' || blendedStatus === 'no-data') {
            continue;
        }

        // 4. Status ist 'warn' or 'alarm'. Finde die Punkte.
        let alarmPoints = summary[summaryKey].hourlyAlarms[hourString];

        // 5. Fallback: Wenn für diese Stunde keine Punkte da sind (z.B. Manual Override oder Sync-Problem)
        if (!alarmPoints || alarmPoints.size === 0) {
            alarmPoints = getFallbackLocations(summaryKey, hourString);
        }

        // 6. Wenn wir (jetzt) Punkte haben, zeichne sie
        if (alarmPoints && alarmPoints.size > 0) {

            // 7. Definiere die Stile (basierend auf dem Matrix-Status)
            let style = {
                color: chartColor, // Metrik-Farbe (z.B. Rot für Wind)
                weight: 2,
                opacity: 0.8,
                fillColor: chartColor,
                fillOpacity: 0.2,     // <-- Leichte Füllung (WARN)
                dashArray: '5, 5'     // <-- Gestrichelt (WARN)
            };

            if (blendedStatus === 'alarm') {
                style.weight = 3;       // <-- Dicker (ALARM)
                style.fillOpacity = 0.4; // <-- Dunkler (ALARM)
                style.dashArray = null; // <-- Solide (ALARM)
            }

            // (Tooltip-Logik bleibt gleich)
            const { value, unit } = formatter(summary[summaryKey].value, profile);
            const tooltip = `${displayName} (${hourString}h): ${blendedStatus.toUpperCase()} (Wert: ${value} ${unit})`;

            drawWarningArea(getPointFeatures(alarmPoints), style, tooltip);

        } else {
            // Debug-Log: Matrix sagt 'warn', aber wir finden keine Punkte
            console.warn(`[map.js] Matrix-Status ist '${blendedStatus}' für ${summaryKey} @ ${hourString}h, aber es wurden keine Alarmpunkte (weder aktuell noch Fallback) gefunden.`);
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

setTimeout(() => {
    console.log("MGRS-Gitter Debug-Check:");
    console.log("  map existiert:", !!map);
    console.log("  mgrsGridLayer existiert:", !!mgrsGridLayer);
    console.log("  mgrsGridLayer ist auf Karte:", map.hasLayer(mgrsGridLayer));
    console.log("  Anzahl Layer im mgrsGridLayer:", mgrsGridLayer.getLayers().length);
    console.log("  Aktueller Zoom:", map.getZoom());
    console.log("  Sichtbare Bounds:", map.getBounds().toBBoxString());
    console.log("  forward() funktioniert:", forward([8.78, 48.711], 3));
}, 3000); // 3 Sekunden nach Laden