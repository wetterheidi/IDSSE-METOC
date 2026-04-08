// docs/main.js - Der Dirigent (Strukturiert)

// -----------------------------------------------------------
// 1. IMPORTS
// -----------------------------------------------------------

// A. Kernmodule (Datenquelle)
import * as db from './db.js';
import * as weather_LIVE from './weather.js';
import * as weather_MOCK from './weather_mock.js';

// B. Konfiguration & Metriken
import { WEATHER_MODELS, AUTO_CHECK_INTERVAL, getModelResolution, getModelMaxDays } from './config.js';
import { METRICS_CONFIG, isMetricActive } from './metricsConfig.js';
import { getBlendedCombinedStatus } from './utils.js';

// C. UI & Display Module
import * as map from './map.js';
import * as ui from './ui.js';
import * as timeSlider from './timeSlider.js';
import * as charts from './charts.js';


// -----------------------------------------------------------
// 2. GLOBALER APP-ZUSTAND (State)
// -----------------------------------------------------------

let currentLayer = null;
let currentManualProfile = null; // Aktuell geladenes Profil (für die manuelle Prüfung)
let currentManualSummary = null; // Ergebnis der letzten manuellen Prüfung
let currentSliderHour = 0;       // Aktuell gewählte Stunde (0-23)
let currentWeatherModel = null;  // Aktuell gewähltes Modell { apiName, runTimeISO }
let currentForecastDay = 0;      // Aktuell gewählter Prognosetag (0=Heute, 1=Morgen, etc.)

export let manualOverrides = {};
export let visibleChartMetrics = new Set(Object.values(METRICS_CONFIG).map(m => m.summaryKey));

// Guard: verhindert, dass runAndUpdateDashboard() parallel mehrfach läuft.
// (Passiert z.B. wenn updateManualOverride() es aufruft während es noch läuft)
let dashboardRunning = false;

// Getter-Funktionen
export const getVisibleChartMetrics = () => visibleChartMetrics;
export const getManualOverrides = () => manualOverrides;
export const getCurrentManualSummary = () => currentManualSummary;

// -----------------------------------------------------------
// 3. INTERNE HELFER (Utilities)
// -----------------------------------------------------------

let debounceTimer;
function debounce(func, delay) {
    return function (...args) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

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
 * Filtert die METRICS_CONFIG für aktive Regeln.
 * (NEU: Nutzt die zentrale Logik)
 */
function getActiveMetrics(rules) {
    return Object.values(METRICS_CONFIG).filter(metric => isMetricActive(metric, rules));
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

// -----------------------------------------------------------
// 4. HANDLER FUNKTIONEN (Callbacks)
// -----------------------------------------------------------

// --- Slider & Time Handlers ---

/**
 * HANDLER: Wird von timeSlider.js aufgerufen, wenn der Slider bewegt wird.
 */
function handleSliderChange(hour) {
    console.log(`Main.js: Slider-Stunde geändert auf ${hour}`);
    currentSliderHour = hour;

    map.visualizeWarnings(currentManualProfile, currentManualSummary, currentSliderHour);

    // Chart-Zeitlinie mitziehen wenn ein Profil geladen ist
    if (currentManualProfile && currentManualSummary) {
        charts.updateWeatherChart(
            currentManualProfile,
            currentManualSummary,
            (p, s) => getBlendedCombinedStatus(p, s, getManualOverrides),
            getManualOverrides,
            currentSliderHour
        );
    }
}

/**
 * HANDLER: Wird von timeSlider.js aufgerufen, wenn das Modell geändert wird.
 */
async function handleModelChange(apiName, runTimeISO) {
    console.log(`Main.js: Modell geändert auf ${apiName} (Lauf: ${runTimeISO})`);
    currentWeatherModel = { apiName, runTimeISO };

    // --- (Smart-Reset Block) ---
    let maxDays = 7;
    if (apiName !== 'auto') {
        const modelProps = WEATHER_MODELS.MODEL_PROPERTIES[apiName];
        if (modelProps && modelProps.maxDays) {
            maxDays = modelProps.maxDays;
        } else {
            console.warn(`[main.js] 'maxDays' für Modell "${apiName}" nicht in config.js gefunden. Nutze Standard (7 Tage).`);
        }
    }
    if (currentForecastDay >= maxDays) {
        const resetToDay = 0;
        ui.showToast(`Modell liefert nur ${maxDays} Tage Prognose – zurückgesetzt auf Heute.`, 'warning');
        currentForecastDay = resetToDay;
        timeSlider.resetDaySelector();
        timeSlider.setForecastDay(resetToDay);
        currentSliderHour = 0;
        timeSlider.setSliderHour(0);
    }
    // --- ENDE SMART-RESET ---

    // --- KORREKTUR: Logik-Trennung ---
    // Beeinflusse NUR das manuelle Profil
    if (currentManualProfile) {
        console.log(`[Modell-Wechsel] Führe manuelle Prüfung für "${currentManualProfile.name}" mit neuem Modell aus.`);
        await handleManualCheck(currentManualProfile);
    }

    // (Der Aufruf von runAndUpdateDashboard() wird hier entfernt,
    // da er nichts mit der UI-Modellauswahl zu tun hat)
}

/**
 * HANDLER: Wird aufgerufen, wenn Autoupdate geklickt wird.
 * (Logik kann später hier ergänzt werden)
 */
function handleAutoupdateChange(isEnabled) {
    console.log(`Main.js: Autoupdate ist jetzt ${isEnabled ? 'AN' : 'AUS'}`);
}

/**
 * HANDLER: Wird aufgerufen, wenn der Prognosetag geändert wird.
 */
async function handleDayChange(e) {

    console.log("[DEBUG 2] handleDayChange aufgerufen.");

    currentForecastDay = parseInt(e.target.value, 10);
    console.log(`Main.js: Prognosetag geändert auf ${currentForecastDay}`);

    timeSlider.setForecastDay(currentForecastDay);
    currentSliderHour = 0;
    timeSlider.setSliderHour(0);

    // --- KORREKTUR: Rufe beide Systeme sicher auf ---

    // 1. Manuelles Profil neu laden (nutzt das UI-Modell 'currentWeatherModel')
    if (currentManualProfile) {
        await handleManualCheck(currentManualProfile);
    }

    // 2. Dashboard neu laden (nutzt jetzt sein eigenes, festes 'icon_seamless')
    await runAndUpdateDashboard();
}

const debouncedHandleDayChange = debounce(handleDayChange, 500); // 500ms Verzögerung

// --- Map & Profile Handlers ---

/**
 * Wird aufgerufen, wenn auf der Karte ein Shape gezeichnet wird.
 * (NEU: async, um den Land/See-Check durchzuführen)
 */
async function handleMapCreate(layer) {
    if (currentLayer) {
        currentLayer.remove();
    }
    currentLayer = layer;

    // Wir rufen die eben exportierte Funktion aus ui.js auf
    const currentRules = ui.getRulesFromInputs();

    // 0. Aktualisiere die Modell-Liste basierend auf der neuen Area
    console.log("[Modell-Check] Starte Prüfung für neues Gebiet...");
    const geojson = layer.toGeoJSON();
    try {
        const coords = geojson.geometry.coordinates[0][0];
        const lng = coords[0];
        const lat = coords[1];
        await timeSlider.updateAvailableModelsForArea(lat, lng);
    } catch (e) {
        console.error("Fehler beim Aktualisieren der Modell-Liste:", e);
        ui.showToast(e.message || 'Open-Meteo API nicht erreichbar.', 'error', 6000);
    }

    // --- NEU: Land/See-Check ---
    console.log("[Land/See-Check] Starte Prüfung für neues Gebiet...");

    // (Diese Funktion ruft weather.js oder weather_mock.js auf)
    const { isMaritime, error } = await getWeatherModule().performLandSeaCheck(geojson);

    if (error) {
        console.error("Land/See-Check fehlgeschlagen:", error);
    } else if (isMaritime) {
        console.log("%c[Land/See-Check] ERGEBNIS: Maritimes Gebiet (See) erkannt.", "color: blue; font-weight: bold;");
    } else {
        console.log("[Land/See-Check] ERGEBNIS: Reines Land-Gebiet erkannt.");
    }
    // 1. Baue die Regeleingabe-Liste basierend auf dem Ergebnis (isMaritime).
    // (Dieser Aufruf löscht die Werte in der UI)
    ui.generateDynamicRuleInputs(isMaritime);

    // 2. Mache den Container "Schritt 3: Regeln definieren" sichtbar.
    const rulesContainer = document.getElementById('rules-workflow-container');
    if (rulesContainer) {
        rulesContainer.classList.remove('hidden');
    }

    // 3. UI freischalten (wie bisher)
    ui.enableSaveButton();

    // 4. KORREKTUR SCHRITT 2: Wende die gesicherten Regeln wieder an ---
    // Wir übergeben 'null' für den Namen, damit das Profil-Namensfeld nicht beeinflusst wird.
    ui.applyRulesToInputs(currentRules, null);
}

/**
 * Wird aufgerufen, wenn der "Speichern"-Knopf geklickt wird.
 */
async function handleSaveProfile(profileData) {
    if (!currentLayer) {
        ui.showToast('Bitte zuerst eine Fläche auf der Karte zeichnen.', 'warning');
        return;
    }

    // --- NEU: Prüfen auf doppelten Namen ---
    // (Wir rufen die neue Funktion aus db.js auf)
    const existingProfile = await db.findProfileByName(profileData.name);

    if (existingProfile) {
        // Wenn ein Profil gefunden wurde, zeige Fehler und brich ab.
        ui.showToast(`Profil "${profileData.name}" existiert bereits. Bitte anderen Namen wählen.`, 'error');
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
    ui.showToast(`Profil "${profile.name}" gespeichert.`, 'success');

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

// --- Chart & Override Handlers ---

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

        // KORREKTUR: Übergabe der benötigten Funktionen an charts.js
        charts.updateWeatherChart(
            currentManualProfile,
            currentManualSummary,
            (p, s) => getBlendedCombinedStatus(p, s, getManualOverrides),
            getManualOverrides,
            currentSliderHour
        );

        map.visualizeWarnings(currentManualProfile, currentManualSummary, currentSliderHour);
        // Kein runAndUpdateDashboard() hier: manuelle Overrides beeinflussen nur die Anzeige,
        // nicht die rohen Wetterdaten. Das Dashboard wird beim nächsten Auto-Check aktualisiert.
    }
}

/**
 * NEU: Lokaler Handler für den Legenden-Klick im Chart
 */
function handleLegendClick(chart) {
    // 1. Set leeren
    visibleChartMetrics.clear();

    // 2. Set mit den sichtbaren Metriken neu füllen
    chart.data.datasets.forEach((dataset, index) => {
        if (chart.isDatasetVisible(index)) {
            if (dataset.summaryKey) {
                visibleChartMetrics.add(dataset.summaryKey);
            }
        }
    });

    // 3. Karte neu zeichnen
    map.visualizeWarnings(currentManualProfile, currentManualSummary, currentSliderHour);
}

// -----------------------------------------------------------
// 5. KERN-WORKFLOWS (Orchestration)
// -----------------------------------------------------------

/**
 * Führt den automatischen Voll-Check aus und aktualisiert das Dashboard.
 * (Version 3.2: Vollständig korrigiert)
 */
async function runAndUpdateDashboard() {
    if (dashboardRunning) {
        console.warn('[Dashboard] Läuft bereits – überspringe doppelten Aufruf.');
        return;
    }
    dashboardRunning = true;
    const profileCount = await db.getProfileCount();
    ui.setDashboardMessage(`<p>Prüfe ${profileCount} Profile... <span id="dashboardProgress"></span></p>`);

    // --- LÖSUNG: Feste Modell-Konfiguration für das Dashboard ---
    // (Stellt sicher, dass der Auto-Monitor immer 'icon_seamless' verwendet)
    const dashboardModelInfo = {
        apiName: 'icon_seamless',
        runTimeISO: 'latest'
    };

    const dashboardResolution = getModelResolution('icon_seamless');
    const profiles = await db.getProfiles();
    const results = [];

    // Wir rufen die "Live"-Version von getGridPoints, da der Demo-Schalter
    // erst *innerhalb* von fetchAndCheckProfile greift.
    const gridPointGetter = (getWeatherModule() === weather_MOCK)
        ? weather_MOCK.getGridPoints
        : weather_LIVE.getGridPoints;

    // Erster Durchlauf: Grid-Punkte für alle Profile berechnen
    const profileEntries = [];
    for (let pi = 0; pi < profiles.length; pi++) {
        const profile = profiles[pi];
        const progressEl = document.getElementById('dashboardProgress');
        if (progressEl) progressEl.textContent = `(${pi + 1}/${profiles.length})`;

        const profileData = {
            id: profile.id,
            name: profile.name,
            rules: profile.rules,
            geojson: JSON.parse(profile.geojsonString)
        };

        if (!profileData.geojson) {
            console.warn(`Profil "${profileData.name}" wird übersprungen (keine Geometrie).`);
            results.push({ profile: profileData, summary: weather_LIVE.getEmptySummary() });
            continue;
        }

        const { gridPoints, error } = await gridPointGetter(profileData.geojson, dashboardResolution);
        if (error) {
            results.push({ profile: profileData, summary: weather_LIVE.getEmptySummary() });
            continue;
        }

        const activeMetrics = getActiveMetrics(profileData.rules);
        profileEntries.push({ profile: profileData, gridPoints, activeMetrics });
    }

    // Gebündelter API-Aufruf: alle gültigen Profile in einer Anfrage
    if (profileEntries.length > 0) {
        const progressEl = document.getElementById('dashboardProgress');
        if (progressEl) progressEl.textContent = '– Lade Wetterdaten...';

        const summaryMap = await getWeatherModule().batchFetchProfiles(
            profileEntries,
            dashboardModelInfo,
            currentForecastDay
        );
        for (const entry of profileEntries) {
            const summary = summaryMap.get(entry.profile.id) || weather_LIVE.getEmptySummary();
            results.push({ profile: entry.profile, summary });
        }
    }

    try {
        const timestamp = new Date().toLocaleTimeString('de-DE');
        const errorResults = results.filter(r => r.summary.error);

        if (errorResults.length > 0 && errorResults.length === results.length) {
            // Alle Profile konnten nicht abgerufen werden → klare Fehlermeldung statt "Alle OK"
            ui.setDashboardMessage(
                `<p class="dashboard-error">⚠ Open-Meteo API nicht erreichbar – Wetterdaten konnten nicht geladen werden.</p>` +
                `<p class="monitor-timestamp">Stand: ${timestamp}</p>`
            );
            ui.showToast('Open-Meteo API nicht erreichbar. Bitte später erneut versuchen.', 'error', 8000);
        } else {
            if (errorResults.length > 0) {
                // Einige Profile fehlgeschlagen, andere OK → Warnung im Toast
                ui.showToast(`${errorResults.length} von ${results.length} Profile konnten nicht abgerufen werden.`, 'warning', 6000);
            }
            const activeAlarms = results.filter(r => r.summary.combined && r.summary.combined.triggered);
            ui.displayAutoWarnings(activeAlarms, getManualOverrides);
        }
    } finally {
        // Immer zurücksetzen, auch wenn ein Fehler auftritt
        dashboardRunning = false;
    }
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
        ui.showToast('Dieses Profil hat keine Geometrie. Bitte löschen und neu anlegen.', 'error');
        ui.setManualMonitorMessage(`<p>Fehler: Profil "${profileData.name}" hat keine Geometrie.</p>`);
        return;
    }

    // 1. Aktualisiere die Modell-Liste (wie bisher)
    try {
        const coords = profileData.geojson.geometry.coordinates[0][0];
        const lng = coords[0];
        const lat = coords[1];
        await timeSlider.updateAvailableModelsForArea(lat, lng);

        // Hole das Modell, das der User (oder der Auto-Fallback) gewählt hat
        currentWeatherModel = timeSlider.getCurrentModelInfo();
        console.log(`[handleManualCheck] Verwende Modell: ${currentWeatherModel.apiName}`);

    } catch (e) {
        console.error("Fehler beim Aktualisieren der Modell-Liste:", e);
        ui.showToast(e.message || 'Open-Meteo API nicht erreichbar.', 'error', 6000);
        // Fallback, falls Update fehlschlägt
        currentWeatherModel = { apiName: 'auto', runTimeISO: 'latest' };
    }

    await clearAllManualOverrides();

    // --- NEUER, VOLLSTÄNDIGER UI-AUFBAU ---

    // 1. Führe den Land/See-Check für das geladene Profil aus
    console.log("[handleManualCheck] Führe Land/See-Check für geladenes Profil aus...");
    const { isMaritime, error: landSeaError } = await getWeatherModule().performLandSeaCheck(profileData.geojson);

    if (landSeaError) {
        console.error("Land/See-Check in handleManualCheck fehlgeschlagen:", landSeaError);
    }

    // 2. Baue die Regeleingabe-Felder (z.B. mit/ohne Wellenhöhe)
    ui.generateDynamicRuleInputs(isMaritime);

    // 3. Fülle die (jetzt existierenden) Felder mit den Profil-Regeln
    ui.applyRulesToInputs(profileData.rules, profileData.name);

    // 4. Öffne das Akkordeon-Panel
    ui.openProfileEditorAccordion();

    // 5. Mache den (sonst versteckten) Regel-Container sichtbar
    const rulesContainer = document.getElementById('rules-workflow-container');
    if (rulesContainer) {
        rulesContainer.classList.remove('hidden');
    }

    ui.activateManualMonitorTab();

    ui.setManualMonitorMessage(`<h4>Prüfbericht für: ${profileData.name.replace(/[<>&"']/g, '')}</h4><p>Lade Wetterdaten vom Server...</p>`);
    map.clearMapLayers();

    map.drawProfileBoundary(profileData.geojson);

    // --- NEU: Auflösung ermitteln & Punkte berechnen ---

    // 2a. Ermittle die Auflösung aus der Config
    const resolutionKm = getModelResolution(currentWeatherModel.apiName);

    // KORREKTUR: Die Konsole muss jetzt currentWeatherModel.apiName verwenden
    console.log(`[handleManualCheck] Berechne Punkte für ${currentWeatherModel.apiName} mit Wunsch-Auflösung ${resolutionKm}km...`);

    // 2b. Rufe getGridPoints MIT der Auflösung auf
    const { gridPoints, error } = await getWeatherModule().getGridPoints(profileData.geojson, resolutionKm);
    // --- ENDE NEU ---


    if (error) {
        ui.setManualMonitorMessage(`<p>Fehler beim Berechnen der Punkte: ${error}</p>`);
        return;
    }

    // 3. Punkte zeichnen & Engine aufrufen (wie bisher)
    map.drawSamplePoints(gridPoints, profileData.geojson);
    map.zoomToGeoJSON(profileData.geojson);

    const activeMetrics = getActiveMetrics(profileData.rules);

    const summary = await getWeatherModule().fetchAndCheckProfile(
        profileData,
        currentWeatherModel,
        gridPoints,
        activeMetrics,
        currentForecastDay
    );
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
    charts.updateWeatherChart(
        profileData,
        summary,
        (p, s) => getBlendedCombinedStatus(p, s, getManualOverrides),
        getManualOverrides,
        currentSliderHour
    );
    map.visualizeWarnings(currentManualProfile, currentManualSummary, currentSliderHour);
}

// --- Datenbank und Listen Manager ---

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
 * Lädt Vorlagen aus der DB und zeigt sie im Dropdown an.
 */
async function updateTemplateList() {
    const templates = await db.getTemplates();
    ui.displayTemplateList(templates);
}

/**
 * Speichert die aktuellen Regeln als Vorlage.
 * (NEU: Prüft auf Duplikate und gibt Bestätigung)
 */
async function handleSaveTemplate(name, rules) {
    // 1. Prüfen, ob der Name leer ist (bereits in ui.js, aber sicher ist sicher)
    if (!name || name.trim() === '') {
        ui.showToast('Bitte einen Namen für die Vorlage eingeben.', 'warning');
        return;
    }

    const existingTemplate = await db.findTemplateByName(name);
    if (existingTemplate) {
        ui.showToast(`Vorlage "${name}" existiert bereits. Bitte anderen Namen wählen.`, 'error');
        return;
    }

    await db.saveTemplate({ name, rules });
    await updateTemplateList();
    ui.showToast(`Vorlage "${name}" gespeichert.`, 'success');
    ui.clearTemplateNameInput();
}

/**
 * Löscht eine Vorlage und aktualisiert die Liste.
 */
async function handleDeleteTemplate() {
    // 1. Finde die ausgewählte ID aus dem Dropdown
    const templateIdStr = ui.uiElements.templateSelect.value;
    if (!templateIdStr) {
        ui.showToast('Bitte zuerst eine Vorlage aus der Liste wählen.', 'warning');
        return;
    }
    const templateId = parseInt(templateIdStr, 10);

    const template = await db.getTemplate(templateId);
    if (!template) {
        ui.showToast('Vorlage nicht gefunden.', 'error');
        return;
    }

    const confirmed = confirm(`Soll die Vorlage "${template.name}" wirklich gelöscht werden?`);

    // 3. Löschen und UI aktualisieren
    if (confirmed) {
        await db.deleteTemplate(templateId);
        await updateTemplateList();
        console.log(`Vorlage "${template.name}" gelöscht.`);
    }
}

/**
 * Wendet eine Vorlage auf die Input-Felder an.
 */
async function handleTemplateSelect(templateId) {
    const template = await db.getTemplate(templateId);
    if (!template) {
        ui.showToast('Vorlage konnte nicht geladen werden.', 'error');
        return;
    }

    // 1. NEU: Baue die UI-Felder.
    ui.generateDynamicRuleInputs(true);

    // 2. Öffne das Akkordeon-Panel (Profil erstellen)
    ui.openProfileEditorAccordion();

    // 3. NEU: Mache den (sonst versteckten) Regel-Container sichtbar
    const rulesContainer = document.getElementById('rules-workflow-container');
    if (rulesContainer) {
        rulesContainer.classList.remove('hidden');
    }

    // 4. KORREKTUR: Rufe die 'applyTemplateToInputs'-Funktion auf
    ui.applyTemplateToInputs(template);

    ui.showToast(`Vorlage "${template.name}" geladen.`, 'success');
}

/**
 * Startet den Daten-Export.
 */
async function handleExport() {
    const profiles = await db.getProfilesForExport();
    if (profiles.length === 0) {
        ui.showToast('Keine Profile zum Exportieren vorhanden.', 'warning');
        return;
    }

    // NEU: Dynamischen Dateinamen generieren
    const timestamp = new Date().toISOString().split('T')[0]; // z.B. "2025-11-12"
    ui.triggerExportDownload(profiles, `idsse-m-export-${timestamp}.json`);
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

// -----------------------------------------------------------
// 6. ANWENDUNG STARTEN (Initialization)
// -----------------------------------------------------------

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
    map.onMapCreate(handleMapCreate);

    // 2. UI initialisieren und mit Handlern "füttern"
    ui.initUI({
        onMapCreate: handleMapCreate,
        onSaveProfile: handleSaveProfile,
        onSaveTemplate: handleSaveTemplate,
        onTemplateSelect: handleTemplateSelect,
        onDeleteTemplate: handleDeleteTemplate,
        onRunAutoCheck: runAndUpdateDashboard,
        onDashboardClick: handleManualCheck,
        onExport: handleExport,
        onImport: handleImport
    });

    // 3. Time-Slider & Chart Callbacks initialisieren
    try {
        await timeSlider.initTimeSlider({
            onSliderChange: handleSliderChange,
            onModelChange: handleModelChange,
            onAutoupdateChange: handleAutoupdateChange,
            onDayChange: debouncedHandleDayChange
        });
        currentWeatherModel = timeSlider.getCurrentModelInfo();
        console.log(`[main.js] Initiales Modell geladen: ${currentWeatherModel.apiName}`);
        console.log("Time-Slider erfolgreich initialisiert.");
    } catch (err) {
        console.error("FEHLER bei Initialisierung des Time-Sliders:", err);
    }


    // 3. Callbacks für Charts injizieren
    charts.setLegendClickCallback(handleLegendClick);
    charts.setGetManualOverrides(getManualOverrides);

    // 4. App-Daten laden
    updateProfileList();
    updateTemplateList();

    // 5. "Automatik-Light" starten
    runAndUpdateDashboard();
    setInterval(runAndUpdateDashboard, AUTO_CHECK_INTERVAL);
});