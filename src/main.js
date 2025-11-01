// main.js - Der Dirigent

import { AUTO_CHECK_INTERVAL } from './config.js';
import * as db from './db.js';
import * as weather_LIVE from './weather.js';
import * as weather_MOCK from './weather_mock.js';
import * as map from './map.js';
import * as ui from './ui.js';
import * as timeSlider from './timeSlider.js';
import * as charts from './charts.js'; // <-- NEU

// --- Globaler App-Zustand ---
// (So wenig wie möglich. 'currentLayer' ist der wichtigste.)
let currentLayer = null;
let currentManualProfile = null; // NEU: Merkt sich, welches Profil im Footer geladen ist
let currentManualSummary = null; // NEU: Merkt sich das *Ergebnis* der letzten Prüfung
let currentSliderHour = 0;       // NEU: Merkt sich die Stunde (0-23)
let currentWeatherModel = null;  // NEU: Merkt sich { apiName, runTimeISO }

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

// main.js

/**
 * HANDLER: Wird von timeSlider.js aufgerufen, wenn der Slider bewegt wird.
 */
function handleSliderChange(hour) {
    console.log(`Main.js: Slider-Stunde geändert auf ${hour}`);
    currentSliderHour = hour;

    // --- NEU: Karte neu zeichnen, wenn der Slider bewegt wird ---
    // (Zeichnet nur was, wenn ein 'currentManualSummary' geladen ist)
    map.visualizeWarnings(currentManualSummary, currentSliderHour);
}

/**
 * HANDLER: Wird von timeSlider.js aufgerufen, wenn das Modell geändert wird.
 */
function handleModelChange(apiName, runTimeISO) {
    console.log(`Main.js: Modell geändert auf ${apiName} (Lauf: ${runTimeISO})`);
    currentWeatherModel = { apiName, runTimeISO };

    // TODO (später): Alle Prüfungen neu auslösen, da sich die Datenquelle geändert hat
    // z.B.: runAndUpdateDashboard();
    // z.B.: if (currentManualProfile) handleManualCheck(currentManualProfile);
}

/**
 * HANDLER: Wird von timeSlider.js aufgerufen, wenn Autoupdate geklickt wird.
 */
function handleAutoupdateChange(isEnabled) {
    console.log(`Main.js: Autoupdate ist jetzt ${isEnabled ? 'AN' : 'AUS'}`);
    // (Logik hierfür später)
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

        // (Wir rufen die "Live"-Version auf, da dies der Live-Check ist)
        const { gridPoints, error } = weather_LIVE.getGridPoints(profileData.geojson);

        if (error) {
            results.push({ profile: profileData, summary: weather_LIVE.getEmptySummary() });
            continue; // Nächstes Profil
        }

        // 2. WARTEN, bis dieser eine Aufruf fertig ist
        const summary = await getWeatherModule().fetchAndCheckProfile(profileData, currentWeatherModel, gridPoints);
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

    // 1. Punkte "offline" berechnen (kein API-Call)
    const { gridPoints, error } = getWeatherModule().getGridPoints(profileData.geojson);

    if (error) {
        ui.setManualMonitorMessage(`<p>Fehler beim Berechnen der Punkte: ${error}</p>`);
        return;
    }

    // 2. Graue Punkte zeichnen
    map.drawSamplePoints(gridPoints, profileData.geojson);
    map.zoomToGeoJSON(profileData.geojson);

    // 3. Engine aufrufen (MIT den Punkten)
    const summary = await getWeatherModule().fetchAndCheckProfile(profileData, currentWeatherModel, gridPoints);

    // 4. Ergebnisse speichern & anzeigen
    currentManualProfile = profileData;
    currentManualSummary = summary;
    ui.displayManualWarning(profileData, summary);
    map.visualizeWarnings(currentManualSummary, currentSliderHour);
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
document.addEventListener('DOMContentLoaded', async () => {
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

    // --- NEU: Schritt 3: Time-Slider initialisieren ---
    // Wir übergeben unsere Handler als "Steckdosen"
    try {
        await timeSlider.initTimeSlider({
            onSliderChange: handleSliderChange,
            onModelChange: handleModelChange,
            onAutoupdateChange: handleAutoupdateChange
        });
        console.log("Time-Slider erfolgreich initialisiert.");
    } catch (err) {
        console.error("FEHLER bei Initialisierung des Time-Sliders:", err);
        // (z.B. wenn DOM-Elemente nicht gefunden wurden)
    }

    map.onMapCreate(handleMapCreate);

    // 4. App-Daten laden
    updateProfileList();
    updateTemplateList();

    // 5. "Automatik-Light" starten
    runAndUpdateDashboard();
    setInterval(runAndUpdateDashboard, AUTO_CHECK_INTERVAL);
});