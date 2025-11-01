// main.js - Der Dirigent

import { AUTO_CHECK_INTERVAL } from './config.js';
import * as db from './db.js';
import * as weather_LIVE from './weather.js';
import * as weather_MOCK from './weather_mock.js';
import * as map from './map.js';
import * as ui from './ui.js';

// --- Globaler App-Zustand ---
// (So wenig wie möglich. 'currentLayer' ist der wichtigste.)
let currentLayer = null;

/**
 * Die Weiche: Entscheidet, ob wir die echte API oder den Fake benutzen.
 * (Version 2.0: "Kugelsicher" - fragt das DOM direkt ab)
 */
function getWeatherModule() {
    // Wir fragen das Element DIREKT im DOM ab, statt uns auf das ui-Modul zu verlassen.
    // Das ist robuster gegen Timing-Fehler.
    const checkbox = document.getElementById('demoModeCheckbox');
    
    // WICHTIG: Prüfen, ob das Element existiert UND ob es .checked ist
    if (checkbox && checkbox.checked) {
        return weather_MOCK;
    }
    
    // Standard-Verhalten
    return weather_LIVE;
}

// --- KERN-WORKFLOWS (Die "Orchestrator"-Funktionen) ---

/**
 * Führt den automatischen Voll-Check aus und aktualisiert das Dashboard.
 * (Version 2.0: Sequenziell, um API-Limits (429) zu vermeiden)
 */
async function runAndUpdateDashboard() {
    ui.setDashboardMessage(`<p>Prüfe ${await db.getProfileCount()} Profile...</p>`);
    
    const profiles = await db.getProfiles();
    const results = []; // Hier sammeln wir die Ergebnisse

    // --- NEU: Sequenzielle Schleife statt Promise.all ---
    // Wir nutzen 'for...of', weil es 'await' in der Schleife erlaubt.
    for (const profile of profiles) {
        // 1. Profil aufbereiten (wie vorher)
        const profileData = {
            id: profile.id,
            name: profile.name,
            rules: profile.rules,
            geojson: JSON.parse(profile.geojsonString)
        };
        
        // 2. WARTEN, bis dieser eine Aufruf fertig ist
        const summary = await getWeatherModule().fetchAndCheckProfile(profileData);
        
        // 3. Ergebnis sammeln
        results.push({ profile: profileData, summary: summary });
        
        // (Optional: Eine kleine künstliche Pause, um ganz sicher zu gehen)
        // await new Promise(resolve => setTimeout(resolve, 200)); // 200ms Pause
    }
    // --- Ende der neuen Schleife ---

    // Filtern und anzeigen (wie vorher)
    const activeAlarms = results.filter(r => 
        (r.summary.wind && r.summary.wind.triggered) || 
        (r.summary.temp && r.summary.temp.triggered) ||
        (r.summary.vis && r.summary.vis.triggered) ||
        (r.summary.cloud && r.summary.cloud.triggered) ||
        (r.summary.precip && r.summary.precip.triggered)
    );
    
    ui.displayAutoWarnings(activeAlarms);
}

/**
 * Wird aufgerufen, wenn ein Profil manuell geprüft werden soll.
 */
async function handleManualCheck(profileData) {
    ui.setManualMonitorMessage(`<h4>Prüfbericht für: ${profileData.name}</h4><p>Lade Daten...</p>`);
    map.clearMapLayers();
    
    // Sampling-Punkte von BBox-Antwort holen (neuer Plan)
    const { gridPoints, error } = await getWeatherModule().getGridPoints(profileData.geojson);
    if (error) {
        ui.setManualMonitorMessage(`<p>Fehler beim Holen der Grid-Punkte: ${error}</p>`);
        return;
    }
    
    map.drawSamplePoints(gridPoints, profileData.geojson);
    map.zoomToGeoJSON(profileData.geojson);

    // Engine aufrufen
    const summary = await getWeatherModule().fetchAndCheckProfile(profileData);
    
    // Ergebnisse anzeigen
    ui.displayManualWarning(profileData, summary); 
    map.visualizeWarnings(summary); // Visualisierung braucht noch die 'summary'
}

/**
 * Wird aufgerufen, wenn auf der Karte ein Shape gezeichnet wird.
 */
function handleMapCreate(layer) {
    if (currentLayer) {
        currentLayer.remove();
    }
    currentLayer = layer;
    ui.enableSaveButton();
}

/**
 * Wird aufgerufen, wenn der "Speichern"-Knopf geklickt wird.
 */
async function handleSaveProfile(profileData) {
    if (!currentLayer) {
        alert("Bitte zuerst eine Fläche auf der Karte zeichnen.");
        return;
    }
    
    const profile = {
        name: profileData.name,
        rules: profileData.rules,
        geojsonString: JSON.stringify(currentLayer.toGeoJSON())
    };

    await db.saveProfile(profile);
    
    // Aufräumen
    currentLayer.pm.disable();
    currentLayer = null;
    ui.resetProfileInputs();
    
    // UI aktualisieren
    await updateProfileList();
}

/**
 * Lädt Profile aus der DB und zeigt sie in der Liste an.
 */
async function updateProfileList() {
    const profiles = await db.getProfiles();
    // Die UI-Funktion braucht die "Callback"-Handler
    ui.displayProfileList(profiles, {
        onCheck: handleManualCheck,
        onDelete: handleDeleteProfile
    });
}

/**
 * Löscht ein Profil und aktualisiert alles.
 */
async function handleDeleteProfile(profile) {
    const confirmed = confirm(`Soll das Profil "${profile.name}" wirklich gelöscht werden?`);
    if (confirmed) {
        await db.deleteProfile(profile.id);
        await updateProfileList(); // Untere Liste neu
        await runAndUpdateDashboard(); // Obere Liste neu
    }
}

/**
 * Speichert die aktuellen Regeln als Vorlage.
 */
async function handleSaveTemplate(name, rules) {
    await db.saveTemplate({ name, rules });
    await updateTemplateList();
}

/**
 * Lädt Vorlagen aus der DB und zeigt sie im Dropdown an.
 */
async function updateTemplateList() {
    const templates = await db.getTemplates();
    ui.displayTemplateList(templates);
}

/**
 * Wendet eine Vorlage auf die Input-Felder an.
 */
async function handleTemplateSelect(templateId) {
    const template = await db.getTemplate(templateId);
    ui.applyTemplateToInputs(template);
}

/**
 * Startet den Daten-Export.
 */
async function handleExport() {
    const profiles = await db.getProfilesForExport();
    if (profiles.length === 0) {
        alert("Keine Profile zum Exportieren vorhanden.");
        return;
    }
    ui.triggerExportDownload(profiles);
}

/**
 * Verarbeitet importierte Daten.
 */
async function handleImport(profiles) {
    try {
        await db.bulkAddProfiles(profiles);
        await updateProfileList();
        await runAndUpdateDashboard();
        return { success: true, count: profiles.length };
    } catch (err) {
        return { success: false, error: err.message };
    }
}


// --- ANWENDUNG STARTEN ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Karte initialisieren
    const leafletMap = map.initMap();
    map.initGeoman(leafletMap);
    
    // 2. UI initialisieren und mit Handlern "füttern"
    ui.initUI({
        onMapCreate: handleMapCreate,
        onSaveProfile: handleSaveProfile,
        onSaveTemplate: handleSaveTemplate,
        onTemplateSelect: handleTemplateSelect,
        onRunAutoCheck: runAndUpdateDashboard,
        onDashboardClick: handleManualCheck,
        onExport: handleExport,
        onImport: handleImport
    });
    
    // HIER IST DIE FEHLENDE VERDRAHTUNG:
    map.onMapCreate(handleMapCreate);

    // 3. App-Daten laden
    updateProfileList();
    updateTemplateList();

    // 4. "Automatik-Light" starten
    runAndUpdateDashboard();
    setInterval(runAndUpdateDashboard, AUTO_CHECK_INTERVAL);
});