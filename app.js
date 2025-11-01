// --- 0. Dexie.js Setup (Lokale DB) ---
const db = new Dexie("IDSSE_M_Database");

// Definiere das "Schema" unserer Datenbank
// Wir haben eine Tabelle (Collection) 'profiles'
// '++id' = Auto-inkrementierende ID (unser Primärschlüssel)
// 'name' = Ein Feld, nach dem wir suchen könnten
db.version(2).stores({
    profiles: '++id, name',
    templates: '++id, name'
});

console.log("Lokale Dexie-Datenbank initialisiert.");

// --- 0. Setup ---
let currentLayer = null;

// UI-Elemente
const saveButton = document.getElementById('saveButton');
const profileNameInput = document.getElementById('profileName');
const profileList = document.getElementById('profileList');

// NEUE & UMBENANNTE UI-Elemente
const manualWarningMonitor = document.getElementById('manualWarningMonitor'); // <-- UMBENANNT
const autoWarnDashboard = document.getElementById('autoWarnDashboard');
const runAutoCheckButton = document.getElementById('runAutoCheckButton');

// NEU: Import/Export UI
const exportButton = document.getElementById('exportButton');
const importButton = document.getElementById('importButton');
const importFile = document.getElementById('importFile');

// NEU: Template UI
const templateNameInput = document.getElementById('templateName');
const saveTemplateButton = document.getElementById('saveTemplateButton');
const templateSelect = document.getElementById('templateSelect');

// --- 1. Karten-Initialisierung ---

// Initialisiert die Karte und zentriert sie (hier auf Berlin)
const map = L.map('map').setView([52.52, 13.405], 13);

// Fügt eine Hintergrundkarte hinzu (OpenStreetMap)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// --- 2. Geoman-Steuerung ---

// Fügt die Geoman-Steuerelemente zur Karte hinzu
map.pm.addControls({
    position: 'topleft',
    drawPolyline: true,
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

// Stellt die Sprache der Toolbar auf Deutsch ein
map.pm.setLang('de');

// --- 3. GeoJSON-Daten abfangen  ---

// Dieser Event-Listener wird jedes Mal ausgelöst, wenn
// ein neues Shape (Linie, Polygon etc.) fertig gezeichnet wurde.
map.on('pm:create', (e) => {
    // e.layer ist das Leaflet-Objekt, das gerade erstellt wurde
    const layer = e.layer;

    // Altes "currentLayer" entfernen, falls vorhanden
    if (currentLayer) {
        currentLayer.remove();
    }

    // Neues Layer merken
    currentLayer = layer;

    // Wir wandeln dieses Leaflet-Layer direkt in GeoJSON um
    const geojsonData = layer.toGeoJSON();

    // Jetzt kannst du damit machen, was du willst.
    // Wir geben es hier einfach in der Konsole aus:
    console.log("Shape gezeichnet. Bereit zum Speichern.");
    profileNameInput.value = ''; // Input leeren
    saveButton.disabled = false; // Button aktivieren
    profileNameInput.focus(); // Direkt ins Namensfeld springen

    // Bonus: Wenn du auch Änderungen (Edit) abfangen willst:
    layer.on('pm:edit', (editEvent) => {
        console.log("Shape wurde bearbeitet (GeoJSON):", editEvent.target.toGeoJSON());
    });

    // Bonus: Wenn du das Löschen abfangen willst:
    layer.on('pm:remove', (removeEvent) => {
        console.log("Shape wurde gelöscht:", removeEvent.target);
        // Hinweis: Das gelöschte Objekt ist hier `removeEvent.target`
    });
});

// Optional: Globales Event, falls du auch das Löschen per
// globalem "Löschen"-Button abfangen willst.
map.on('pm:remove', (e) => {
    console.log("Globales Lösch-Event:", e.layer);
});

// --- 4. Speicher-Logik (NEU: Firestore) ---
saveButton.addEventListener('click', () => {
    const name = profileNameInput.value;

    if (!name) {
        alert("Bitte einen Profil-Namen eingeben.");
        return;
    }
    if (!currentLayer) {
        alert("Bitte zuerst eine Fläche auf der Karte zeichnen.");
        return;
    }

    // 1. Profil-Objekt erstellen (fast wie vorher)
    const newProfile = {
        name: name,
        geojsonString: JSON.stringify(currentLayer.toGeoJSON()), // <-- KORRIGIERT
        rules: {
            maxWind: parseFloat(document.getElementById('maxWind').value) || null,
            minTemp: parseFloat(document.getElementById('minTemp').value),
            minVis: parseFloat(document.getElementById('minVis').value) || null,
            minCloud: parseFloat(document.getElementById('minCloud').value) || null,
            maxPrecipProb: parseFloat(document.getElementById('maxPrecipProb').value) || null
        }
    };

    // 2. In die lokale Datenbank schreiben (asynchron)
    db.profiles.add(newProfile)
        .then(() => {
            console.log("Profil in Dexie gespeichert.");

            // 3. Aufräumen (wie vorher)
            currentLayer.pm.disable();
            currentLayer = null;
            profileNameInput.value = '';
            saveButton.disabled = true;

            // WICHTIG: Wir müssen die Liste jetzt manuell neu laden
            loadAndDisplayProfiles();
        })
        .catch((error) => {
            console.error("Fehler beim Speichern in Dexie: ", error);
            alert("Fehler beim Speichern. Siehe Konsole.");
        });
});

// --- 5. UI-Liste (NEU: Dexie Lokal) ---

async function loadAndDisplayProfiles() {

    // Hole ALLE Profile als Array aus der DB
    const allProfiles = await db.profiles.toArray();

    profileList.innerHTML = ''; // Liste leeren

    allProfiles.forEach((profile) => {
        // 'profile' hat jetzt die 'id', die Dexie vergeben hat

        const li = document.createElement('li');
        li.textContent = `${profile.name}`;

        // Button zum Generieren der Punkte
        const testButton = document.createElement('button');
        testButton.textContent = 'Daten abrufen & prüfen';
        testButton.style.marginLeft = '10px';

        testButton.addEventListener('click', () => {
            // Wir parsen das GeoJSON, wie wir es gelernt haben
            const profileDataForCheck = {
                id: profile.id, // Die Dexie-ID
                name: profile.name,
                geojson: JSON.parse(profile.geojsonString), // String -> Objekt
                rules: profile.rules
            };

            generateSamplePoints(profileDataForCheck);
        });

        li.appendChild(testButton);

        // --- NEUER TEIL ---
        // Button 2: "Löschen"
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Löschen';
        deleteButton.style.marginLeft = '5px';
        deleteButton.style.color = 'red'; // Deutlich machen

        deleteButton.addEventListener('click', async () => {
            // Sicherheit geht vor
            const confirmed = confirm(`Soll das Profil "${profile.name}" wirklich gelöscht werden?`);

            if (confirmed) {
                try {
                    // 1. Aus der Datenbank löschen
                    await db.profiles.delete(profile.id);
                    console.log(`Profil ${profile.id} gelöscht.`);

                    // 2. UI-Listen aktualisieren
                    await loadAndDisplayProfiles(); // Baut die untere Liste neu
                    await runAndUpdateDashboard(); // Baut die obere Alarm-Liste neu

                } catch (err) {
                    console.error("Fehler beim Löschen:", err);
                    alert("Konnte Profil nicht löschen.");
                }
            }
        });
        li.appendChild(deleteButton);

        profileList.appendChild(li);
    });
}

// Die Funktion direkt beim Start der App einmal aufrufen
loadAndDisplayProfiles();

// Die Funktion direkt beim Start der App einmal aufrufen
loadAndDisplayProfiles();

// --- 6. "Engine"-Simulation: Sampling-Punkte ---

// Globale Variable für die angezeigten Punkte, damit wir sie löschen können
let samplePointsLayer = L.layerGroup().addTo(map);

let warningMarkersLayer = L.layerGroup().addTo(map);

/**
 * Wird vom "Prüfen"-Button aufgerufen.
 * Kümmert sich jetzt nur noch um die ANZEIGE (Punkte/Monitor/Karte).
 * Die eigentliche Logik holt sie sich von 'fetchAndCheckProfile'.
 */
async function generateSamplePoints(profile) {
    // 1. Alte Layer leeren (wie bisher)
    samplePointsLayer.clearLayers();
    warningMarkersLayer.clearLayers();

    // 2. Visuelles Feedback: Zoomen & Sampling-Punkte zeichnen
    // (Wir müssen die Turf-Logik hier leider DUPLIZIEREN,
    // nur um die Punkte zeichnen zu können.)
    try {
        const geojson = profile.geojson;
        const bbox = turf.bbox(geojson);
        const cellSide = 10;
        const options = { units: 'kilometers' };
        const pointGrid = turf.pointGrid(bbox, cellSide, options);
        const pointsInside = turf.pointsWithinPolygon(pointGrid, geojson);

        pointsInside.features.forEach(pointFeature => {
            const coords = pointFeature.geometry.coordinates;
            const latLng = [coords[1], coords[0]];
            L.circleMarker(latLng, {
                radius: 4,
                color: 'gray', // Grau, da sie nur "Samples" sind
                fillOpacity: 0.5
            }).addTo(samplePointsLayer);
        });
        map.fitBounds(L.geoJSON(geojson).getBounds());

    } catch (e) {
        console.error("Turf.js Fehler beim Zeichnen:", e);
    }

    // 3. ECHTE DATEN holen & ANZEIGEN
    // Wir rufen die neue Engine-Funktion auf
    console.log(`Starte Prüfung für: ${profile.name}`);
    manualWarningMonitor.innerHTML = `<h4>Prüfbericht für: ${profile.name}</h4><p>Lade Daten...</p>`; // <-- KORRIGIERT

    const summary = await fetchAndCheckProfile(profile);

    // 4. Ergebnisse anzeigen (wie bisher)
    displayWarnings(profile, summary);
    visualizeWarnings(summary);

    console.log(`Prüfung für ${profile.name} abgeschlossen.`);
}

// --- 7. "Engine"-Logik: Schwellenwerte prüfen (Version 2.0: Aggregierend) ---
/**
 * Prüft BBox-Raster-Daten gegen Regeln und Polygon.
 * (Version 6.0: Hybrid-Ansatz)
 */
function checkThresholds(profile, data, geojson) {
    const rules = profile.rules;
    
    // 1. Initialisiere das Summary-Objekt (wie in V5)
    const summary = getEmptySummary();
    const statusParams = ['wind', 'temp', 'vis', 'cloud', 'precip', 'wind900'];
    const timeStamps = data.hourly.time.map(t => new Date(t).getHours());
    timeStamps.forEach(hour => {
        statusParams.forEach(param => {
            if (summary[param]) summary[param].hourlyStatus[hour] = 'ok';
        });
    });

    // 2. Helfer-Funktionen (wie in V5)
    const getWorseStatus = (s1, s2) => {
        if (s1 === 'alarm' || s2 === 'alarm') return 'alarm';
        if (s1 === 'warn' || s2 === 'warn') return 'warn';
        return 'ok';
    };

    // 3. DIE NEUE KERN-LOGIK: Raster filtern & parsen
    
    const gridLats = data.latitude;
    const gridLons = data.longitude;
    const numHours = timeStamps.length; // z.B. 24
    
    const h_wind = data.hourly.windgusts_10m;
    const h_temp = data.hourly.temperature_2m;
    const h_vis = data.hourly.visibility;
    const h_cloud = data.hourly.cloud_base;
    const h_precip = data.hourly.precipitation_probability;
    
    let validPointsFound = 0;

    // Iteriere durch JEDEN PUNKT im API-Raster
    for (let i = 0; i < gridLats.length; i++) {
        const pointLat = gridLats[i];
        const pointLon = gridLons[i];

        // 4. DER HYBRID-FILTER: Ist der Punkt im Polygon?
        const point = turf.point([pointLon, pointLat]);
        const isInside = turf.booleanPointInPolygon(point, geojson);

        if (!isInside) {
            continue; // Punkt ignorieren (z.B. der Berg neben dem Tal)
        }
        
        validPointsFound++; // Wir haben einen relevanten Punkt gefunden

        // 5. Daten für DIESEN EINEN PUNKT parsen
        // Iteriere durch die Stunden (0-23)
        for (let h = 0; h < numHours; h++) {
            const hour = timeStamps[h]; // z.B. 14
            // Daten-Index in der "flachen" API-Antwort berechnen
            const dataIndex = (i * numHours) + h; 
            let currentStatus;

            // --- Regel 1: Wind ---
            if (rules.maxWind) {
                const wind = h_wind[dataIndex];
                if (wind > rules.maxWind) {
                    currentStatus = 'alarm';
                    if (wind > summary.wind.max) summary.wind.max = wind;
                    summary.wind.triggered = true;
                } else if (wind > rules.maxWind * 0.9) { 
                    currentStatus = 'warn';
                } else {
                    currentStatus = 'ok';
                }
                summary.wind.hourlyStatus[hour] = getWorseStatus(summary.wind.hourlyStatus[hour], currentStatus);
            }

            // --- Regel 2: Temperatur ---
            if (rules.minTemp !== null) {
                const temp = h_temp[dataIndex];
                if (temp < rules.minTemp) {
                    currentStatus = 'alarm';
                    if (temp < summary.temp.min) summary.temp.min = temp;
                    summary.temp.triggered = true;
                } else if (temp < rules.minTemp + 2) { 
                    currentStatus = 'warn';
                } else {
                    currentStatus = 'ok';
                }
                summary.temp.hourlyStatus[hour] = getWorseStatus(summary.temp.hourlyStatus[hour], currentStatus);
            }
            
            // --- Regel 3: Sichtweite ---
            if (rules.minVis) {
                const vis = h_vis[dataIndex]; 
                if (vis < rules.minVis) {
                    currentStatus = 'alarm';
                    if (vis < summary.vis.min) summary.vis.min = vis;
                    summary.vis.triggered = true;
                } else if (vis < rules.minVis * 1.2) { 
                    currentStatus = 'warn';
                } else {
                    currentStatus = 'ok';
                }
                summary.vis.hourlyStatus[hour] = getWorseStatus(summary.vis.hourlyStatus[hour], currentStatus);
            }

            // --- Regel 4: Wolkenuntergrenze ---
            if (rules.minCloud) {
                const cloud = h_cloud[dataIndex];
                if (cloud !== null && cloud < rules.minCloud) { 
                    currentStatus = 'alarm';
                    if (cloud < summary.cloud.min) summary.cloud.min = cloud;
                    summary.cloud.triggered = true;
                } else if (cloud !== null && cloud < rules.minCloud * 1.2) { 
                    currentStatus = 'warn';
                } else {
                    currentStatus = 'ok';
                }
                summary.cloud.hourlyStatus[hour] = getWorseStatus(summary.cloud.hourlyStatus[hour], currentStatus);
            }

            // --- Regel 5: Niederschlag ---
            if (rules.maxPrecipProb !== null) {
                const precip = h_precip[dataIndex];
                if (precip > rules.maxPrecipProb) {
                    currentStatus = 'alarm';
                    if (precip > summary.precip.max) summary.precip.max = precip;
                    summary.precip.triggered = true;
                } else if (precip > rules.maxPrecipProb * 0.9) {
                    currentStatus = 'warn';
                } else {
                    currentStatus = 'ok';
                }
                summary.precip.hourlyStatus[hour] = getWorseStatus(summary.precip.hourlyStatus[hour], currentStatus);
            }
        }
    }
    
    if (validPointsFound === 0) {
        console.warn(`Keine API-Rasterpunkte für Profil "${profile.name}" gefunden. Ist das Polygon zu klein oder liegt es über dem Ozean?`);
        summary.error = "Keine Datenpunkte im Polygon gefunden.";
    }

    return summary; 
}

/**
 * Zeigt die *zusammengefassten* Warnungen im "Warn-Monitor" an.
 * (Version 3.0: Schreibt in 'manualWarningMonitor')
 */
function displayWarnings(profile, summary) {
    // SCHREIBT IN DEN UNTEREN, MANUELLEN MONITOR
    manualWarningMonitor.innerHTML = ''; // Monitor leeren

    // Robustheits-Check 1: API-Fehler (kein Summary)
    if (!summary) {
        manualWarningMonitor.innerHTML = `<div style="color: red; border: 1px solid red; padding: 5px; margin-bottom: 5px;">
                                        <strong>FEHLER</strong><br>${profile} 
                                   </div>`;
        return;
    }

    // Robustheits-Check 2: Profil-Fehler (kein Profil-Objekt)
    if (!profile || !profile.rules) {
        manualWarningMonitor.innerHTML = `<div style="color: red; border: 1px solid red; padding: 5px; margin-bottom: 5px;">
                                        <strong>SYSTEM-FEHLER</strong><br>Konnte Profil-Regeln nicht laden.
                                   </div>`;
        return;
    }

    // --- Ab hier ist es der Code vom letzten Mal ---
    let html = `<h4>Prüfbericht für: ${profile.name}</h4>`;
    let hasWarnings = false;
    const rules = profile.rules;

    // Wind-Bericht
    if (summary.wind.triggered) {
        hasWarnings = true;
        html += `<div style="color: red; border: 1px solid red; padding: 5px; margin-bottom: 5px;">
                    <strong>WIND-ALARM</strong><br>
                    Max. Böe: <strong>${summary.wind.max.toFixed(1)} km/h</strong> (Limit: ${rules.maxWind} km/h)<br> 
                 </div>`;
    } else {
        html += `<p style="color: green;">Wind: OK (Keine Überschreitung)</p>`;
    }

    // Temperatur-Bericht
    if (summary.temp.triggered) {
        hasWarnings = true;
        html += `<div style="color: blue; border: 1px solid blue; padding: 5px; margin-bottom: 5px;">
                    <strong>FROST-ALARM</strong><br>
                    Min. Temp: <strong>${summary.temp.min.toFixed(1)} °C</strong> (Limit: ${rules.minTemp} °C)<br>
                 </div>`;
    } else {
        html += `<p style="color: green;">Temperatur: OK (Keine Überschreitung)</p>`;
    }

    // NEU: Sichtweite
    if (summary.vis.triggered) {
        hasWarnings = true;
        html += `<div style="color: #8B4513; border: 1px solid #8B4513; padding: 5px; margin-bottom: 5px;">
                    <strong>SICHT-ALARM (IFR)</strong><br>
                    Min. Sicht: <strong>${summary.vis.min.toFixed(0)} m</strong> (Limit: ${rules.minVis} m)<br>
                 </div>`;
    } else if (rules.minVis) {
        html += `<p style="color: green;">Sichtweite: OK</VFR></p>`;
    }

    // NEU: Wolkenuntergrenze
    if (summary.cloud.triggered) {
        hasWarnings = true;
        html += `<div style="color: #555; border: 1px solid #555; padding: 5px; margin-bottom: 5px;">
                    <strong>WOLKEN-ALARM</strong><br>
                    Min. Untergrenze: <strong>${summary.cloud.min.toFixed(0)} m</strong> (Limit: ${rules.minCloud} m)<br>
                 </div>`;
    } else if (rules.minCloud) {
        html += `<p style="color: green;">Wolkenuntergrenze: OK</p>`;
    }

    // NEU: Niederschlag
    if (summary.precip.triggered) {
        hasWarnings = true;
        html += `<div style="color: #000080; border: 1px solid #000080; padding: 5px; margin-bottom: 5px;">
                    <strong>NIEDERSCHLAGS-ALARM</strong><br>
                    Max. Chance: <strong>${summary.precip.max.toFixed(0)}%</strong> (Limit: ${rules.maxPrecipProb}%)<br>
                 </div>`;
    } else if (rules.maxPrecipProb !== null) {
        html += `<p style="color: green;">Niederschlag: OK</p>`;
    }

    if (!hasWarnings) {
        html = `<h4>Prüfbericht für: ${profile.name}</h4><p style="color: green; font-weight: bold;">Alle Parameter im grünen Bereich.</p>`;
    }

// --- 3. NEU: Die Ampel-Matrix bauen ---
    
    // Helfer, um eine Tabellenzeile (TR) zu bauen
    const buildRow = (paramName, statusObject) => {
        let rowHtml = `<tr><td><strong>${paramName}</strong></td>`;
        // Sortiere die Stunden (0, 1, 2...)
        const hours = Object.keys(statusObject).sort((a, b) => a - b);
        hours.forEach(hour => {
            const status = statusObject[hour]; // 'ok', 'warn', oder 'alarm'
            rowHtml += `<td class="status-${status}"></td>`;
        });
        rowHtml += `</tr>`;
        return rowHtml;
    };
    
    // Header-Zeile (Stunden 0-23)
    let tableHtml = `<table class="ampel-table">
                        <thead>
                            <tr>
                                <th>Parameter</th>`;
    // Annahme: Wir haben immer 24 Stunden (0-23)
    const hours = Object.keys(summary.wind.hourlyStatus).sort((a, b) => a - b);
    hours.forEach(hour => {
        tableHtml += `<th>${hour}h</th>`;
    });
    tableHtml += `        </tr>
                        </thead>
                        <tbody>`;

    // Zeilen für jeden Parameter hinzufügen, *falls* eine Regel dafür existiert
    if (rules.maxWind) tableHtml += buildRow('Wind (Böe)', summary.wind.hourlyStatus);
    if (rules.minTemp !== null) tableHtml += buildRow('Temp (2m)', summary.temp.hourlyStatus);
    if (rules.minVis) tableHtml += buildRow('Sicht', summary.vis.hourlyStatus);
    if (rules.minCloud) tableHtml += buildRow('Wolken (UG)', summary.cloud.hourlyStatus);
    if (rules.maxPrecipProb !== null) tableHtml += buildRow('Niederschl.', summary.precip.hourlyStatus);
    // if (rules.maxWind900) tableHtml += buildRow('Wind (1km)', summary.wind900.hourlyStatus);

    tableHtml += `      </tbody>
                    </table>`;

    // Die Tabelle zum Restlichen HTML hinzufügen
    manualWarningMonitor.innerHTML = html + tableHtml;
}

// --- 8. Visualisierungs-Logik ---

/**
 * Zeichnet die Punkte, die Alarme ausgelöst haben, auf der Karte.
 */
function visualizeWarnings(summary) {
    // 1. Nur zur Sicherheit: Alte Warnungen löschen
    warningMarkersLayer.clearLayers();

    // 2. Wind-Warnungen visualisieren
    if (summary.wind.triggered) {
        summary.wind.affectedPoints.forEach(locationString => {
            // locationString ist "lat,lon"
            const coords = locationString.split(',');
            const latLng = [parseFloat(coords[0]), parseFloat(coords[1])];

            L.circleMarker(latLng, {
                radius: 6,
                color: 'red',
                fillColor: '#f03',
                fillOpacity: 0.7
            }).bindTooltip(`Wind-Alarm: ${summary.wind.max.toFixed(1)} km/h`)
                .addTo(warningMarkersLayer);
        });
    }

    // 3. Temperatur-Warnungen visualisieren
    if (summary.temp.triggered) {
        summary.temp.affectedPoints.forEach(locationString => {
            // locationString ist "lat,lon"
            const coords = locationString.split(',');
            const latLng = [parseFloat(coords[0]), parseFloat(coords[1])];

            L.circleMarker(latLng, {
                radius: 6,
                color: 'blue',
                fillColor: '#30f',
                fillOpacity: 0.7
            }).bindTooltip(`Frost-Alarm: ${summary.temp.min.toFixed(1)} °C`)
                .addTo(warningMarkersLayer);
        });
    }
}

// --- 9. KERN-ENGINE (Refactored) ---

/**
 * Holt Daten für EIN Profil (via Bounding Box), prüft die Regeln und GIBT DAS ERGEBNIS ZURÜCK.
 * (Version 2.0: Bounding-Box-Hybrid-Ansatz)
 */
async function fetchAndCheckProfile(profile) {
    
    // 1. Flächen-Rahmen (Bounding Box) mit Turf.js berechnen
    const geojson = profile.geojson; 
    let bbox;
    try {
        bbox = turf.bbox(geojson); // Gibt [minLon, minLat, maxLon, maxLat]
    } catch (e) {
        console.error("Turf.js BBox-Fehler:", e);
        return { error: "Turf.js BBox-Fehler", ...getEmptySummary() }; 
    }

    // BBox für OpenMeteo umwandeln (die wollen lat,lon,lat,lon)
    // [minLat, minLon, maxLat, maxLon]
    const bboxString = `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`;

    // 2. Open Meteo API-Aufruf (NEUE URL-STRUKTUR)
    // Wir fragen *alle* Parameter an, die wir können
    const hourlyParams = 'temperature_2m,windgusts_10m,visibility,cloud_base,precipitation_probability';
    
    // WICHTIG: KEINE 'latitude' & 'longitude' Parameter, nur 'bounding_box'
    // 'models=auto' wählt das beste Modell (z.B. ICON-D2 für DE) automatisch
    const apiUrl = `https://api.open-meteo.com/v1/forecast?bounding_box=${bboxString}&hourly=${hourlyParams}&models=auto&forecast_days=1`;

    console.log("Frage Bounding Box API an:", apiUrl);

    try {
        // 3. Daten abrufen
        const response = await fetch(apiUrl);
        if (!response.ok) {
            // Fängt den '429' Fehler ab
            throw new Error(`API-Fehler: ${response.statusText}`);
        }
        const data = await response.json();

        // 4. Daten prüfen (Diese Funktion müssen wir als NÄCHSTES umbauen)
        // WICHTIG: Wir übergeben 'data' (die GANZE Antwort) und das 'geojson'
        const summary = checkThresholds(profile, data, geojson); 

        // 5. ERGEBNIS ZURÜCKGEBEN
        return summary; 
        
    } catch (err) {
        console.error("Fehler beim Abrufen der BBox-Wetterdaten:", err);
        return { error: err.message, ...getEmptySummary() };
    }
}

/**
 * Hilfsfunktion: Erstellt ein leeres Summary-Objekt (für Fehlerfälle)
 */
function getEmptySummary() {
    return {
        wind: { triggered: false, max: 0, hourlyStatus: {} }, 
        temp: { triggered: false, min: 999, hourlyStatus: {} },
        vis: { triggered: false, min: 99999, hourlyStatus: {} },
        cloud: { triggered: false, min: 99999, hourlyStatus: {} },
        precip: { triggered: false, max: 0, hourlyStatus: {} }
    };
}

// --- 10. "Automatik-Light" Logik ---

/**
 * Kern-Funktion 1: Führt die Prüfung für ALLE Profile in der DB durch.
 * Gibt ein Array mit allen aktiven Alarmen zurück.
 */
async function runFullCheck() {
    console.log("Starte vollen Prüflauf...");

    // 1. Alle Profile aus der DB holen
    const allProfiles = await db.profiles.toArray();

    // 2. Alle Profile parallel abfragen
    // 'Promise.all' wartet, bis ALLE fetch-Aufrufe fertig sind.
    const profileChecks = allProfiles.map(async (profile) => {
        // Wir müssen das GeoJSON für die Engine parsen
        const profileData = {
            id: profile.id,
            name: profile.name,
            rules: profile.rules,
            geojson: JSON.parse(profile.geojsonString)
        };

        // Die "abgetrennte" Engine-Funktion aufrufen
        const summary = await fetchAndCheckProfile(profileData);

        // Wichtig: Profil und Ergebnis zusammen zurückgeben
        return { profile: profileData, summary: summary };
    });

    // Auf alle Ergebnisse warten
    const results = await Promise.all(profileChecks);

    // 3. Nur die Profile filtern, die einen Alarm haben
    const activeAlarms = results.filter(r =>
        (r.summary.wind && r.summary.wind.triggered) ||
        (r.summary.temp && r.summary.temp.triggered)
    );

    console.log(`Voll-Check beendet. ${activeAlarms.length} aktive Alarme gefunden.`);
    return activeAlarms; // z.B. [{profile: ..., summary: ...}, ...]
}

/**
 * Kern-Funktion 2: Zeigt die Ergebnisse des Voll-Checks im Auto-Dashboard an.
 * (Version 2.0: Inkl. VFR)
 */
function displayAutoWarnings(alarmResults) {
    autoWarnDashboard.innerHTML = '';

    if (alarmResults.length === 0) {
        autoWarnDashboard.innerHTML = `<p style="color: green; padding: 10px;">${new Date().toLocaleTimeString('de-DE')}: Alle Profile OK.</p>`;
        return;
    }

    let html = `<h4><span style="color: red;">${alarmResults.length} ALARM(E)</span> - Stand: ${new Date().toLocaleTimeString('de-DE')}</h4>`;

    alarmResults.forEach(result => {
        const p = result.profile;
        const s = result.summary;

        // Klickbares DIV (wie bisher)
        html += `<div class="alarm-item" data-profile-id="${p.id}" style="border-bottom: 1px solid #ccc; padding: 5px; margin-bottom: 5px; cursor: pointer;">
                    <strong>Profil: ${p.name}</strong><br>`;

        if (s.wind && s.wind.triggered) {
            html += `<span style="color: red;">&#9658; Wind: ${s.wind.max.toFixed(1)} km/h</span><br>`;
        }
        if (s.temp && s.temp.triggered) {
            html += `<span style="color: blue;">&#9658; Temp: ${s.temp.min.toFixed(1)} °C</span><br>`;
        }
        // NEU
        if (s.vis && s.vis.triggered) {
            html += `<span style="color: #8B4513;">&#9658; Sicht: ${s.vis.min.toFixed(0)} m</span><br>`;
        }
        if (s.cloud && s.cloud.triggered) {
            html += `<span style="color: #555;">&#9658; Wolken: ${s.cloud.min.toFixed(0)} m</span><br>`;
        }
        if (s.precip && s.precip.triggered) {
            html += `<span style="color: #000080;">&#9658; Niederschl.: ${s.precip.max.toFixed(0)}%</span><br>`;
        }
        html += `</div>`;
    });

    autoWarnDashboard.innerHTML = html;
}

/**
 * Kern-Funktion 3: Wrapper, der den Check auslöst und die Anzeige aktualisiert.
 */
async function runAndUpdateDashboard() {
    autoWarnDashboard.innerHTML = `<p>Prüfe ${await db.profiles.count()} Profile...</p>`;
    const alarms = await runFullCheck();
    displayAutoWarnings(alarms);
}

// --- 11. Start-Trigger ---

// Manuell-Button
runAutoCheckButton.addEventListener('click', runAndUpdateDashboard);

// Timer (z.B. alle 15 Minuten = 900.000 Millisekunden)
// Setzen wir für den Test auf 1 Minute (60.000 ms), später erhöhen.
const AUTO_CHECK_INTERVAL = 60000; // 1 Minute
setInterval(runAndUpdateDashboard, AUTO_CHECK_INTERVAL);

// Beim allerersten Laden der Seite sofort ausführen
runAndUpdateDashboard();

// --- 12. Interaktions-Logik ---

/**
 * Hört auf Klicks im "Auto-Monitor"-Dashboard.
 * Löst bei Klick auf ein Alarm-Item die manuelle Detail-Prüfung aus.
 */
autoWarnDashboard.addEventListener('click', async (e) => {
    // Finde das geklickte Alarm-Item (oder ein Elternelement davon)
    const alarmItem = e.target.closest('.alarm-item');

    if (alarmItem) {
        // 1. Hol die ID aus dem 'data-profile-id' Attribut
        const profileId = parseInt(alarmItem.dataset.profileId);
        if (!profileId) return;

        console.log(`Manuelle Prüfung für Profil-ID ${profileId} angefordert...`);

        // 2. Hol das komplette Profil-Objekt aus der lokalen Datenbank
        const profile = await db.profiles.get(profileId);
        if (!profile) {
            console.error("Profil für Klick nicht in DB gefunden:", profileId);
            return;
        }

        // 3. Bereite das Profil-Objekt für die Engine vor (GeoJSON parsen)
        const profileDataForCheck = {
            id: profile.id,
            name: profile.name,
            geojson: JSON.parse(profile.geojsonString), // WICHTIG: String -> Objekt
            rules: profile.rules
        };

        // 4. Rufe die Detail-Analyse-Funktion auf
        // (Genau dieselbe Funktion, die der "Prüfen"-Button nutzt)
        await generateSamplePoints(profileDataForCheck);
    }
});

// --- 13. Import/Export Logik ---

/**
 * Exportiert alle Profile aus der Dexie-DB in eine JSON-Datei.
 */
async function exportProfiles() {
    console.log("Starte Export...");
    try {
        const allProfiles = await db.profiles.toArray();
        if (allProfiles.length === 0) {
            alert("Keine Profile zum Exportieren vorhanden.");
            return;
        }

        // Wir wollen die von Dexie generierte 'id' nicht mitspeichern,
        // damit es beim Re-Import keine Konflikte gibt.
        const exportData = allProfiles.map(({ id, ...rest }) => rest);

        // In einen formatierten JSON-String umwandeln
        const dataStr = JSON.stringify(exportData, null, 2);
        // Eine "Blob"-Datei im Speicher erstellen
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        // Einen unsichtbaren Download-Link erstellen und klicken
        const a = document.createElement('a');
        a.href = url;
        a.download = `idsse_m_profile_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();

        // Aufräumen
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log("Export erfolgreich.");
    } catch (err) {
        console.error("Export fehlgeschlagen:", err);
        alert("Export fehlgeschlagen. Siehe Konsole.");
    }
}

/**
 * Löst den Import-Dialog aus.
 */
function triggerImport() {
    // Klickt das versteckte <input type="file">
    importFile.click();
}

/**
 * Verarbeitet die ausgewählte Import-Datei.
 */
async function importProfileData(event) {
    const file = event.target.files[0];
    if (!file) {
        console.log("Import abgebrochen.");
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const text = e.target.result;
            const importedProfiles = JSON.parse(text);

            if (!Array.isArray(importedProfiles)) {
                throw new Error("Import-Datei ist keine gültige Profi-Liste (Array).");
            }

            // Kurze Validierung, ob die Objekte sinnvoll aussehen
            const validProfiles = importedProfiles.filter(p => p.name && p.geojsonString && p.rules);
            const invalidCount = importedProfiles.length - validProfiles.length;

            if (validProfiles.length === 0) {
                throw new Error("Keine gültigen Profile (mit name, geojsonString, rules) in der Datei gefunden.");
            }

            // Dexie-Zauber: Alle Profile auf einmal hinzufügen
            await db.profiles.bulkAdd(validProfiles);

            alert(`Import erfolgreich!\n- ${validProfiles.length} Profile importiert.\n- ${invalidCount} ungültige Einträge übersprungen.`);

            // UI komplett neu laden
            await loadAndDisplayProfiles();
            await runAndUpdateDashboard();

        } catch (err) {
            console.error("Import fehlgeschlagen:", err);
            alert(`Import fehlgeschlagen: ${err.message}`);
        } finally {
            // Input-Feld zurücksetzen, falls man dieselbe Datei nochmal laden will
            event.target.value = null;
        }
    };
    reader.readAsText(file);
}

// Die Event-Listener für die neuen Knöpfe
exportButton.addEventListener('click', exportProfiles);
importButton.addEventListener('click', triggerImport);
importFile.addEventListener('change', importProfileData);

    // --- 14. Vorlagen-Logik ---

    /**
     * Speichert die *aktuell* in den Input-Feldern stehenden Regeln
     * als neue Vorlage in der 'templates'-DB.
     */
    async function saveCurrentRulesAsTemplate() {
        const name = templateNameInput.value;
        if (!name) {
            alert("Bitte einen Namen für die Vorlage eingeben.");
            return;
        }

        // 1. Regeln aus den UI-Feldern auslesen
        const rules = {
            maxWind: parseFloat(document.getElementById('maxWind').value) || null,
            minTemp: parseFloat(document.getElementById('minTemp').value),
            minVis: parseFloat(document.getElementById('minVis').value) || null,
            minCloud: parseFloat(document.getElementById('minCloud').value) || null,
            maxPrecipProb: parseFloat(document.getElementById('maxPrecipProb').value) || null
        };

        // 2. Das Vorlagen-Objekt erstellen
        const newTemplate = {
            name: name,
            rules: rules
        };

        try {
            // 3. In die 'templates'-Tabelle speichern
            await db.templates.add(newTemplate);
            alert(`Vorlage "${name}" gespeichert!`);
            templateNameInput.value = '';
            
            // 4. Dropdown-Liste aktualisieren
            await loadTemplatesToSelect();
        } catch (err) {
            console.error("Fehler beim Speichern der Vorlage:", err);
            alert("Fehler beim Speichern der Vorlage.");
        }
    }

    /**
     * Lädt alle gespeicherten Vorlagen aus der DB
     * und füllt das <select>-Dropdown-Menü damit.
     */
    async function loadTemplatesToSelect() {
        templateSelect.innerHTML = '<option value="">-- Vorlage wählen --</option>'; // Zurücksetzen
        
        try {
            const allTemplates = await db.templates.toArray();
            allTemplates.forEach(template => {
                const option = document.createElement('option');
                option.value = template.id; // Wir speichern die ID
                option.textContent = template.name;
                templateSelect.appendChild(option);
            });
        } catch (err) {
            console.error("Fehler beim Laden der Vorlagen:", err);
        }
    }

    /**
     * Füllt die Regel-Input-Felder mit den Werten
     * der ausgewählten Vorlage.
     */
    async function applyTemplateToInputs() {
        const templateId = parseInt(templateSelect.value);
        if (!templateId) {
            // Wenn "-- Vorlage wählen --" ausgewählt wird, Felder leeren (optional)
            // document.getElementById('maxWind').value = ''; 
            // ... (usw. für alle Felder)
            return; 
        }

        try {
            // 1. Vorlage aus der DB holen
            const template = await db.templates.get(templateId);
            if (!template) return;

            const rules = template.rules;

            // 2. Alle Input-Felder befüllen
            document.getElementById('maxWind').value = rules.maxWind || '';
            document.getElementById('minTemp').value = rules.minTemp !== null ? rules.minTemp : '';
            document.getElementById('minVis').value = rules.minVis || '';
            document.getElementById('minCloud').value = rules.minCloud || '';
            document.getElementById('maxPrecipProb').value = rules.maxPrecipProb !== null ? rules.maxPrecipProb : '';
            
            // 3. (Optional) Den Vorlagen-Namen in das Speicher-Feld kopieren
            templateNameInput.value = template.name; 

        } catch (err) {
            console.error("Fehler beim Anwenden der Vorlage:", err);
        }
    }

    // --- 15. Event-Listener für Vorlagen ---
    saveTemplateButton.addEventListener('click', saveCurrentRulesAsTemplate);
    templateSelect.addEventListener('change', applyTemplateToInputs);
    
    // Vorlagen-Dropdown beim Start der App einmalig füllen
    loadTemplatesToSelect();

    // --- 16. Akkordeon-Logik ---

const accordions = document.querySelectorAll('.accordion-header');

accordions.forEach(acc => {
    acc.addEventListener('click', function() {
        // Dieser Header wurde geklickt
        this.classList.toggle('active');
        const panel = this.nextElementSibling; // Das Panel direkt danach

        if (panel.style.maxHeight) {
            // Panel ist offen -> schließen
            panel.style.maxHeight = null;
        } else {
            // Panel ist zu -> öffnen
            // Wir brauchen die 'scrollHeight', um die Höhe dynamisch zu setzen
            panel.style.maxHeight = panel.scrollHeight + "px";
        } 
        
        // --- Optional: Alle anderen Panels schließen ---
        accordions.forEach(otherAcc => {
            if (otherAcc !== this) { // 'this' ist der geklickte Button
                otherAcc.classList.remove('active');
                otherAcc.nextElementSibling.style.maxHeight = null;
            }
        });
    });
});