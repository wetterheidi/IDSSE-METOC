// main.js - Der Dirigent

import { AUTO_CHECK_INTERVAL } from './config.js';
import * as db from './db.js';
import * as weather_LIVE from './weather.js';
import * as weather_MOCK from './weather_mock.js';
import * as map from './map.js';
import * as ui from './ui.js';
import * as timeSlider from './timeSlider.js';
import * as charts from './charts.js'; // <-- NEU
import { METRICS_CONFIG } from './metricsConfig.js';

// --- Globaler App-Zustand ---
// (So wenig wie möglich. 'currentLayer' ist der wichtigste.)
let currentLayer = null;
let currentManualProfile = null; // NEU: Merkt sich, welches Profil im Footer geladen ist
let currentManualSummary = null; // NEU: Merkt sich das *Ergebnis* der letzten Prüfung
let currentSliderHour = 0;       // NEU: Merkt sich die Stunde (0-23)
let currentWeatherModel = null;  // NEU: Merkt sich { apiName, runTimeISO }
export let manualOverrides = {};
// NEU: Speichert, welche Graphen-Layer sichtbar sind.
// Wir initialisieren es mit *allen* Metrik-Schlüsseln.
export let visibleChartMetrics = new Set(Object.values(METRICS_CONFIG).map(m => m.summaryKey));
// NEU: Getter-Funktion, damit map.js den Zustand lesen kann.
export const getVisibleChartMetrics = () => visibleChartMetrics;

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

/**
 * HANDLER: Wird von timeSlider.js aufgerufen, wenn der Slider bewegt wird.
 */
function handleSliderChange(hour) {
    console.log(`Main.js: Slider-Stunde geändert auf ${hour}`);
    currentSliderHour = hour;

    // --- NEU: Karte neu zeichnen, wenn der Slider bewegt wird ---
    // (Zeichnet nur was, wenn ein 'currentManualSummary' geladen ist)
    map.visualizeWarnings(currentManualProfile, currentManualSummary, currentSliderHour);
}

/**
 * HANDLER: Wird von timeSlider.js aufgerufen, wenn das Modell geändert wird.
 */
async function handleModelChange(apiName, runTimeISO) {
    console.log(`Main.js: Modell geändert auf ${apiName} (Lauf: ${runTimeISO})`);
    currentWeatherModel = { apiName, runTimeISO };

    if (currentManualProfile) {
        console.log(`[Modell-Wechsel] Führe manuelle Prüfung für "${currentManualProfile.name}" mit neuem Modell aus.`);

        // Wir rufen dieselbe Funktion auf, die auch der "Laden & Prüfen"-Button nutzt.
        // 'await' stellt sicher, dass alles der Reihe nach passiert.
        await handleManualCheck(currentManualProfile);
    }

    await runAndUpdateDashboard();
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
 * (Version 3.0: Sequenziell UND holt gridPoints für Tiling)
 */
async function runAndUpdateDashboard() {
    ui.setDashboardMessage(`<p>Prüfe ${await db.getProfileCount()} Profile...</p>`);

    const profiles = await db.getProfiles();
    const results = [];

    // Wir rufen die "Live"-Version von getGridPoints, da der Demo-Schalter
    // erst *innerhalb* von fetchAndCheckProfile greift.
    const gridPointGetter = (getWeatherModule() === weather_MOCK)
        ? weather_MOCK.getGridPoints
        : weather_LIVE.getGridPoints;

    for (const profile of profiles) {

        const profileData = {
            id: profile.id,
            name: profile.name,
            rules: profile.rules,
            geojson: JSON.parse(profile.geojsonString)
        };

        // KUGELSICHERER CHECK: Hat das Profil eine Form?
        if (!profileData.geojson) {
            console.warn(`Profil "${profileData.name}" wird übersprungen (keine Geometrie).`);
            continue;
        }

        const { gridPoints, error } = await getWeatherModule().getGridPoints(profileData.geojson);
        if (error) {
            results.push({ profile: profileData, summary: weather_LIVE.getEmptySummary() });
            continue;
        }

        const activeMetrics = getActiveMetrics(profileData.rules);

        const summary = await getWeatherModule().fetchAndCheckProfile(profileData, currentWeatherModel, gridPoints, activeMetrics, currentWeatherModel); // <-- currentWeatherModel zweimal übergeben
        results.push({ profile: profileData, summary: summary });
    }

    const activeAlarms = results.filter(r => r.summary.combined && r.summary.combined.triggered);

    ui.displayAutoWarnings(activeAlarms);
}

/**
 * Wird aufgerufen, wenn ein Profil manuell geprüft werden soll.
 * (Version 3.0: KORRIGIERT für Tiling-Engine)
 */
async function handleManualCheck(profileData) {

    // --- DEBUG 1 ---
    console.log("--- DEBUG [main.js]: handleManualCheck GESTARTET ---");
    console.log("Profil:", profileData.name);

    // KUGELSICHERER CHECK: Hat das Profil eine Form?
    if (!profileData.geojson) {
        alert("Fehler: Dieses Profil hat keine gezeichnete Form. Bitte löschen und neu anlegen.");
        ui.setManualMonitorMessage(`<p>Fehler: Profil "${profileData.name}" hat keine Geometrie.</p>`);
        return;
    }

    await clearAllManualOverrides();

    // 1. Lade die Regeln des angeklickten Profils in die Sidebar-Inputs
    ui.applyRulesToInputs(profileData.rules, profileData.name);

    // 2. Öffne das Sidebar-Panel, damit der Nutzer die Regeln sieht
    ui.openProfileEditorAccordion();

    ui.activateManualMonitorTab();

    ui.setManualMonitorMessage(`<h4>Prüfbericht für: ${profileData.name}</h4><p>Lade Daten...</p>`);
    map.clearMapLayers();

    map.drawProfileBoundary(profileData.geojson);

    // --- DEBUG 2 ---
    console.log("--- DEBUG [main.js]: Rufe getGridPoints auf...");

    // 1. Punkte "offline" berechnen (Demo-Modus-kompatibel)
    const { gridPoints, error } = await getWeatherModule().getGridPoints(profileData.geojson);

    // --- DEBUG 3 ---
    console.log("--- DEBUG [main.js]: getGridPoints BEENDET.");
    console.log("GridPoints gefunden:", gridPoints ? gridPoints.features.length : 'null');
    console.log("Error:", error);

    if (error) {
        ui.setManualMonitorMessage(`<p>Fehler beim Berechnen der Punkte: ${error}</p>`);
        return;
    }

    // 2. Graue Punkte zeichnen
    map.drawSamplePoints(gridPoints, profileData.geojson);
    map.zoomToGeoJSON(profileData.geojson);

    // --- DEBUG 4 ---
    console.log("--- DEBUG [main.js]: Rufe fetchAndCheckProfile auf...");

    // 3. Engine aufrufen (MIT den Punkten)
    // Finde HIER heraus, welche Metriken für DIESES Profil aktiv sind
    const activeMetrics = getActiveMetrics(profileData.rules);

    // 3. Engine aufrufen (MIT den Punkten UND den gefilterten Metriken)
    const summary = await getWeatherModule().fetchAndCheckProfile(profileData, currentWeatherModel, gridPoints, activeMetrics);

    // --- DEBUG 5 ---
    console.log("%c[main.js] Summary-Objekt VOR Übergabe an UI:", "color: blue; font-weight: bold;", summary);
    console.log("--- DEBUG [main.js]: fetchAndCheckProfile BEENDET.");
    console.log("Summary-Ergebnis:", summary);


    // 4. Ergebnisse speichern & anzeigen
    currentManualProfile = profileData;
    currentManualSummary = summary;

    // --- NEU: Setze die Graphen-Sichtbarkeit zurück ---
    // (Stellt sicher, dass beim Laden eines neuen Profils alle Layer sichtbar sind)
    visibleChartMetrics = new Set(Object.values(METRICS_CONFIG).map(m => m.summaryKey));

    ui.displayManualWarning(profileData, summary); // <-- Aktualisiert die Matrix
    charts.updateWeatherChart(profileData, summary); // <-- HIER IST DIE REPARATUR
    map.visualizeWarnings(currentManualProfile, currentManualSummary, currentSliderHour);
}

/**
 * Wird aufgerufen, wenn auf der Karte ein Shape gezeichnet wird.
 * (NEU: async, um den Land/See-Check durchzuführen)
 */
async function handleMapCreate(layer) {
    if (currentLayer) {
        currentLayer.remove();
    }
    currentLayer = layer;

    // --- NEU: Land/See-Check ---
    console.log("[Land/See-Check] Starte Prüfung für neues Gebiet...");
    const geojson = layer.toGeoJSON();
    
    // (Diese Funktion ruft weather.js oder weather_mock.js auf)
    const { isMaritime, error } = await getWeatherModule().performLandSeaCheck(geojson);
    
    if (error) {
        console.error("Land/See-Check fehlgeschlagen:", error);
    } else if (isMaritime) {
        console.log("%c[Land/See-Check] ERGEBNIS: Maritimes Gebiet (See) erkannt.", "color: blue; font-weight: bold;");
    } else {
        console.log("[Land/See-Check] ERGEBNIS: Reines Land-Gebiet erkannt.");
    }
    // --- ENDE NEU ---

    // --- NEUER UI-WORKFLOW ---
    // 1. Baue die Regeleingabe-Liste basierend auf dem Ergebnis (isMaritime) auf.
    ui.generateDynamicRuleInputs(isMaritime); 
    
    // 2. Mache den Container "Schritt 3: Regeln definieren" sichtbar.
    // (Wir holen uns den Container, den ui.js in der letzten Antwort versteckt hat)
    const rulesContainer = document.getElementById('rules-workflow-container');
    if (rulesContainer) {
        rulesContainer.style.display = 'block';
    }

    // 3. UI freischalten (wie bisher)
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

    // --- NEU: Prüfen auf doppelten Namen ---
    // (Wir rufen die neue Funktion aus db.js auf)
    const existingProfile = await db.findProfileByName(profileData.name);

    if (existingProfile) {
        // Wenn ein Profil gefunden wurde, zeige Fehler und brich ab.
        alert(`Fehler: Ein Profil mit dem Namen "${profileData.name}" existiert bereits. Bitte wählen Sie einen anderen Namen.`);
        return; // Stoppt die Funktion hier.
    }

    // Das GeoJSON-Objekt zwischenspeichern, bevor wir 'currentLayer' löschen
    const geojson = currentLayer.toGeoJSON();

    const profile = {
        name: profileData.name,
        rules: profileData.rules,
        geojsonString: JSON.stringify(geojson)
    };

    await db.saveProfile(profile);
    // 'profile' hat jetzt eine 'id' von der Datenbank

    // Aufräumen (wie bisher)
    currentLayer.pm.disable();
    currentLayer = null;
    ui.resetProfileInputs();

    // UI aktualisieren (wie bisher)
    await updateProfileList();

    // --- NEU: Profil sofort laden und prüfen ---
    // Wir bauen das Objekt, das handleManualCheck erwartet:
    const newProfileData = {
        id: profile.id, // Die neue ID aus der DB
        name: profile.name,
        rules: profile.rules,
        geojson: geojson // Das geparste GeoJSON-Objekt
    };

    // Rufen wir die Funktion auf, die auch "Laden & Prüfen" nutzt
    await handleManualCheck(newProfileData);
    // --- ENDE NEU ---
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

/**
 * NEU: Aktualisiert den manuellen Status für eine Regel und Stunde.
 * Wird von ui.js aufgerufen.
 * @param {string} ruleKey - z.B. 'vis', 'wind', 'cloud'
 * @param {string} hour - z.B. '07'
 * @param {string|null} newStatus - 'ok', 'warn', 'alarm', oder null (für 'zurück zum Automatischen')
 */
export async function updateManualOverride(ruleKey, hour, newStatus) {
    if (!manualOverrides[ruleKey]) {
        manualOverrides[ruleKey] = {};
    }

    if (newStatus === null) {
        delete manualOverrides[ruleKey][hour];
    } else {
        manualOverrides[ruleKey][hour] = newStatus;
    }

    await db.setAppState('manualOverrides', manualOverrides);

    // 2. UI neu rendern, falls gerade ein Profil geladen ist
    if (currentManualProfile && currentManualSummary) {
        ui.displayManualWarning(currentManualProfile, currentManualSummary);
        charts.updateWeatherChart(currentManualProfile, currentManualSummary);
        map.visualizeWarnings(currentManualProfile, currentManualSummary, currentSliderHour);        // NEU: Auto-Check Dashboard neu laden, da sich der Status eines Profils geändert haben könnte
        runAndUpdateDashboard();
    }
}

/**
 * NEU: Helfer-Funktion zum Löschen UND Speichern des gelöschten Zustands.
 */
async function clearAllManualOverrides() {
    // Nur löschen und speichern, wenn es tatsächlich Overrides gibt
    if (Object.keys(manualOverrides).length > 0) {
        console.log("Setze alle manuellen Overrides zurück...");
        manualOverrides = {};
        await db.setAppState('manualOverrides', manualOverrides);
    }
}

export const getManualOverrides = () => manualOverrides;

/**
 * Wird von charts.js aufgerufen, wenn sich die Sichtbarkeit der Legende ändert.
 * Aktualisiert den globalen Zustand und zeichnet die Karte neu.
 */
export function handleChartVisibilityUpdate(chart) {
    // 1. Set leeren
    visibleChartMetrics.clear();

    // 2. Set mit den sichtbaren Metriken neu füllen
    chart.data.datasets.forEach((dataset, index) => {
        if (chart.isDatasetVisible(index)) {
            // (Wir holen den summaryKey, den wir in Schritt 2 in das Dataset einfügen)
            if (dataset.summaryKey) {
                visibleChartMetrics.add(dataset.summaryKey);
            }
        }
    });

    // 3. Karte neu zeichnen
    // (Nutzt die globalen Variablen für Profil, Summary und Stunde)
    map.visualizeWarnings(currentManualProfile, currentManualSummary, currentSliderHour);
}

/**
 * NEU: Filtert die METRICS_CONFIG, um nur Metriken zurückzugeben,
 * die im Profil (rules) aktiv sind (Alarm oder Warnung gesetzt).
 */
function getActiveMetrics(rules) {
    return Object.values(METRICS_CONFIG).filter(metric => {
        if (metric.checkType === 'min' || metric.checkType === 'max') {
            // Bisherige Logik für Min/Max
            const hasAlarm = rules[metric.ruleName + '_alarm'] !== null && rules[metric.ruleName + '_alarm'] !== undefined;
            const hasWarn = rules[metric.ruleName + '_warn'] !== null && rules[metric.ruleName + '_warn'] !== undefined;
            return hasAlarm || hasWarn;
        }
        else if (metric.checkType === 'code_match') {
            // KORREKTUR: Prüfe die _alarm und _warn Arrays, die von ui.js gespeichert werden
            const hasAlarm = rules[metric.ruleName + '_alarm'] !== null &&
                rules[metric.ruleName + '_alarm'] !== undefined &&
                rules[metric.ruleName + '_alarm'].length > 0;
            const hasWarn = rules[metric.ruleName + '_warn'] !== null &&
                rules[metric.ruleName + '_warn'] !== undefined &&
                rules[metric.ruleName + '_warn'].length > 0;
            return hasAlarm || hasWarn;
        }
        return false; // Fallback für unbekannte Typen
    });
}

export const getCurrentManualSummary = () => currentManualSummary;


// --- ANWENDUNG STARTEN ---
document.addEventListener('DOMContentLoaded', async () => {
    // 0. Zustand laden
    const loadedOverrides = await db.getAppState('manualOverrides');
    if (loadedOverrides) {
        manualOverrides = loadedOverrides;
        console.log("Manuelle Overrides geladen.");
    }

    // 1. Karte initialisieren
    const leafletMap = map.initMap();
    map.initGeoman(leafletMap);

    ui.initResizeHandle();

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