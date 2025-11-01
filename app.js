// --- 0. Dexie.js Setup (Lokale DB) ---
const db = new Dexie("IDSSE_M_Database");

// Definiere das "Schema" unserer Datenbank
// Wir haben eine Tabelle (Collection) 'profiles'
// '++id' = Auto-inkrementierende ID (unser Primärschlüssel)
// 'name' = Ein Feld, nach dem wir suchen könnten
db.version(1).stores({
  profiles: '++id, name' 
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
            minTemp: parseFloat(document.getElementById('minTemp').value)
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
 * Prüft Daten gegen Regeln und GIBT EINE ZUSAMMENFASSUNG zurück.
 */
function checkThresholds(profile, openMeteoData) {
    const rules = profile.rules;
    const numPoints = openMeteoData.length; // Wie viele Punkte prüfen wir?

    // Das ist unser neues "Berichts-Objekt"
    const summary = {
        wind: { triggered: false, max: 0, criticalHours: new Set(), affectedPoints: new Set() },
        temp: { triggered: false, min: 999, criticalHours: new Set(), affectedPoints: new Set() }
        // 'new Set()' ist ein Trick, um Duplikate (z.B. die Stunde '14:00') zu vermeiden
    };

    // Iteriere durch jeden Standort (Punkt)
    openMeteoData.forEach(locationData => {
        const locationId = `${locationData.latitude.toFixed(2)},${locationData.longitude.toFixed(2)}`;
        const hourly = locationData.hourly;

        // Iteriere durch jede Stunde
        hourly.time.forEach((time, index) => {
            const hour = new Date(time).toLocaleString('de-DE');

            // Regel 1: Windböen
            if (rules.maxWind) {
                const wind = hourly.windgusts_10m[index];
                if (wind > rules.maxWind) {
                    summary.wind.triggered = true;
                    if (wind > summary.wind.max) summary.wind.max = wind;
                    summary.wind.criticalHours.add(hour);
                    summary.wind.affectedPoints.add(locationId);
                }
            }

            // Regel 2: Temperatur
            if (rules.minTemp !== null) {
                const temp = hourly.temperature_2m[index];
                if (temp < rules.minTemp) {
                    summary.temp.triggered = true;
                    if (temp < summary.temp.min) summary.temp.min = temp;
                    summary.temp.criticalHours.add(hour);
                    summary.temp.affectedPoints.add(locationId);
                }
            }
        });
    });

    // Berechne Prozent-Abdeckung
    summary.wind.coveragePercent = (summary.wind.affectedPoints.size / numPoints) * 100;
    summary.temp.coveragePercent = (summary.temp.affectedPoints.size / numPoints) * 100;

    return summary; // Das "Zusammenfassungs-Objekt" zurückgeben
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
                    Flächenabdeckung: ${summary.wind.coveragePercent.toFixed(0)}% der Punkte betroffen.<br>
                    Kritische Zeiträume: ${[...summary.wind.criticalHours].slice(0, 5).join(', ')} ...
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
                    Flächenabdeckung: ${summary.temp.coveragePercent.toFixed(0)}% der Punkte betroffen.<br>
                    Kritische Zeiträume: ${[...summary.temp.criticalHours].slice(0, 5).join(', ')} ...
                 </div>`;
    } else {
        html += `<p style="color: green;">Temperatur: OK (Keine Überschreitung)</p>`;
    }

    if (!hasWarnings) {
        html = `<h4>Prüfbericht für: ${profile.name}</h4><p style="color: green; font-weight: bold;">Alle Parameter im grünen Bereich.</p>`;
    }

    manualWarningMonitor.innerHTML = html;
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
 * Holt Daten für EIN Profil, prüft die Regeln und GIBT DAS ERGEBNIS ZURÜCK.
 * Diese Funktion berührt NICHT die Benutzeroberfläche (Karte/Monitor).
 * Sie ist 'async', weil sie 'fetch' enthält.
 */
async function fetchAndCheckProfile(profile) {
    
    // 1. Flächen abtasten (Sampling) - (Code aus 'generateSamplePoints' kopiert)
    const geojson = profile.geojson; 
    let pointsInside;
    
    try {
        const bbox = turf.bbox(geojson);
        const cellSide = 10; // km
        const options = { units: 'kilometers' };
        const pointGrid = turf.pointGrid(bbox, cellSide, options);
        pointsInside = turf.pointsWithinPolygon(pointGrid, geojson);

    } catch (e) {
        console.error("Turf.js Fehler:", e);
        // Im Fehlerfall ein leeres Summary zurückgeben
        return { error: "Turf.js Fehler", wind: {}, temp: {} }; 
    }

    if (!pointsInside || pointsInside.features.length === 0) {
        console.log("Keine Sampling-Punkte für Profil:", profile.name);
        return { error: "Keine Punkte in Fläche", wind: {}, temp: {} };
    }

    // 2. Open Meteo API-Aufruf (Code aus 'generateSamplePoints' kopiert)
    const lats = pointsInside.features.map(p => p.geometry.coordinates[1].toFixed(2)).join(',');
    const lons = pointsInside.features.map(p => p.geometry.coordinates[0].toFixed(2)).join(',');
    const hourlyParams = 'temperature_2m,windgusts_10m';
    const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=${hourlyParams}&forecast_days=1`;

    try {
        // 3. Daten abrufen
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`API-Fehler: ${response.statusText}`);
        }
        const data = await response.json();
        
        // 4. Daten prüfen (Code aus 'generateSamplePoints' kopiert)
        const dataArray = Array.isArray(data) ? data : [data];
        const summary = checkThresholds(profile, dataArray); // Ruft unsere bestehende Funktion auf

        // 5. ERGEBNIS ZURÜCKGEBEN
        return summary; 
        
    } catch (err) {
        console.error("Fehler beim Abrufen der Wetterdaten:", err);
        return { error: err.message, wind: {}, temp: {} };
    }
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
 */
function displayAutoWarnings(alarmResults) {
    autoWarnDashboard.innerHTML = ''; // Dashboard leeren
    
    if (alarmResults.length === 0) {
        autoWarnDashboard.innerHTML = `<p style="color: green; padding: 10px;">${new Date().toLocaleTimeString('de-DE')}: Alle Profile OK.</p>`;
        return;
    }
    
    let html = `<h4><span style="color: red;">${alarmResults.length} ALARM(E)</span> - Stand: ${new Date().toLocaleTimeString('de-DE')}</h4>`;
    
    alarmResults.forEach(result => {
        const p = result.profile;
        const s = result.summary;
        
        html += `<div style="border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-bottom: 5px;">
                    <strong>Profil: ${p.name}</strong><br>`;
        
        if (s.wind && s.wind.triggered) {
            html += `<span style="color: red;">&#9658; Wind: ${s.wind.max.toFixed(1)} km/h</span><br>`;
        }
        if (s.temp && s.temp.triggered) {
            html += `<span style="color: blue;">&#9658; Temp: ${s.temp.min.toFixed(1)} °C</span><br>`;
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