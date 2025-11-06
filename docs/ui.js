// ui.js (Version 2.0 - Config-Driven)
import * as db from './db.js';
import * as formatter from './formatter.js';
import { UNITS } from './config.js';
import { updateManualOverride, getManualOverrides } from './main.js';
// NEU: Importiere das "Gehirn"
import { METRICS_CONFIG } from './metricsConfig.js';

export const uiElements = {};

const STATUS_CYCLE = ['ok', 'warn', 'alarm', null];

// --- 1. NEU: Dynamische UI-Generierung ---

/**
 * Erstellt die HTML-Eingabefelder für die Regeln dynamisch
 * basierend auf der METRICS_CONFIG.
 */
function generateDynamicRuleInputs() {
    const container = document.getElementById('dynamic-rules-container');
    if (!container) {
        console.error("Kritischer Fehler: Container 'dynamic-rules-container' in index.html nicht gefunden!");
        return;
    }

    let html = '';
    for (const metric of Object.values(METRICS_CONFIG)) {
        // Hole den Standard-Label-Text (z.B. km/h oder %)
        let initialUnit = 'N/A'; // Sicherer Fallback

        // NEU: Dynamische Zuweisung basierend auf dem Formatter
        if (metric.formatter === formatter.formatSpeed) {
            initialUnit = UNITS.metric.speed;
        } else if (metric.formatter === formatter.formatAltitude) {
            initialUnit = UNITS.metric.altitude;
        } else if (metric.formatter === formatter.formatTemp) {
            initialUnit = UNITS.metric.temp;
        } else if (metric.formatter === formatter.formatPercent) {
            initialUnit = '%';
        } else if (metric.formatter === formatter.formatPrecipMM) {
            initialUnit = 'mm'; // <-- DIE FEHLENDE PRÜFUNG
        }

        // Erzeuge das HTML für diese Regel
        html += `
            <div class="rule-input-group">
                <label>${metric.displayName}:</label>
                <div class="rule-input-fields">
                    <input type="number" id="${metric.ruleName}_alarm" placeholder="Rot (z.B. < 50)">
                    <input type="number" id="${metric.ruleName}_warn" placeholder="Gelb (z.B. < 200)">
                    <span id="${metric.uiUnitId}">${initialUnit}</span>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}


// --- 2. Initialisierungs-Funktion ---

/**
 * Hängt alle Event-Listener an die UI-Elemente.
 * 'handlers' ist ein Objekt mit Callback-Funktionen von main.js
 */
export const initUI = (handlers) => {

    // --- SCHRITT 1: DOM-Elemente finden (reduziert) ---
    uiElements.autoWarnDashboard = document.getElementById('autoWarnDashboard');
    uiElements.manualWarningMonitor = document.getElementById('manualWarningMonitor');
    uiElements.profileList = document.getElementById('profileList');
    uiElements.profileNameInput = document.getElementById('profileName');
    uiElements.saveButton = document.getElementById('saveButton');

    uiElements.mapStatusContainer = document.getElementById('mapStatusContainer');
    uiElements.mapStatusText = document.getElementById('mapStatusText');

    // NEU: Regel-Inputs dynamisch generieren
    generateDynamicRuleInputs();

    // Die alten uiElements.ruleInputs und uiElements.unitSpans werden NICHT MEHR benötigt,
    // da die Funktionen (z.B. getRulesFromInputs) jetzt dynamisch auf das DOM zugreifen.

    uiElements.templateNameInput = document.getElementById('templateName');
    uiElements.saveTemplateButton = document.getElementById('saveTemplateButton');
    uiElements.templateSelect = document.getElementById('templateSelect');
    uiElements.exportButton = document.getElementById('exportButton');
    uiElements.importButton = document.getElementById('importButton');
    uiElements.importFile = document.getElementById('importFile');
    uiElements.runAutoCheckButton = document.getElementById('runAutoCheckButton');
    uiElements.accordions = document.querySelectorAll('.accordion-header');
    uiElements.demoModeCheckbox = document.getElementById('demoModeCheckbox');
    uiElements.unitModeMetric = document.querySelector('input[name="unitMode"][value="metric"]');
    uiElements.unitModeAviation = document.querySelector('input[name="unitMode"][value="aviation"]');

    // --- SCHRITT 2: Event-Listener anhängen (Großteils unverändert) ---

    // Akkordeon
    if (uiElements.accordions) {
        uiElements.accordions.forEach(acc => {
            acc.addEventListener('click', function () {
                const panel = this.nextElementSibling;
                const isOpen = panel.classList.contains('open');
                uiElements.accordions.forEach(otherAcc => {
                    otherAcc.classList.remove('active');
                    otherAcc.nextElementSibling.classList.remove('open');
                });
                if (!isOpen) {
                    this.classList.add('active');
                    panel.classList.add('open');
                }
            });
        });
    }

    // Einheiten-Modus
    const unitModeChangeHandler = () => {
        updateRuleInputLabels();
    };
    if (uiElements.unitModeMetric) {
        uiElements.unitModeMetric.addEventListener('change', unitModeChangeHandler);
    }
    if (uiElements.unitModeAviation) {
        uiElements.unitModeAviation.addEventListener('change', unitModeChangeHandler);
    }
    // (Labels werden beim Start bereits durch generateDynamicRuleInputs() korrekt gesetzt)

    // Auto-Check
    if (uiElements.runAutoCheckButton) {
        uiElements.runAutoCheckButton.addEventListener('click', handlers.onRunAutoCheck);
    }
    // Demo-Schalter
    if (uiElements.demoModeCheckbox) {
        uiElements.demoModeCheckbox.addEventListener('change', handlers.onRunAutoCheck);
    }

    // Klick auf Alarm im Auto-Dashboard
    if (uiElements.autoWarnDashboard) {
        uiElements.autoWarnDashboard.addEventListener('click', async (e) => {
            const alarmItem = e.target.closest('.alarm-item');
            if (alarmItem) {
                const profileId = parseInt(alarmItem.dataset.profileId);
                if (!profileId) return;
                const profile = await db.getProfile(profileId);
                if (!profile) return;
                const profileData = {
                    id: profile.id,
                    name: profile.name,
                    rules: profile.rules,
                    geojson: JSON.parse(profile.geojsonString)
                };
                handlers.onDashboardClick(profileData);
            }
        });
    }

    // Profil speichern
    if (uiElements.saveButton) {
        uiElements.saveButton.addEventListener('click', () => {
            
            // 1. Regeln zuerst auslesen
            const rules = getRulesFromInputs();

            // 2. --- NEUE VALIDIERUNG ---
            const validationError = validateRules(rules);
            if (validationError) {
                alert(validationError); // Zeige den Logikfehler
                return; // Stoppe das Speichern
            }
            // --- ENDE VALIDIERUNG ---

            // 3. Erst jetzt das Profil-Objekt bauen
            const profileData = {
                name: uiElements.profileNameInput.value,
                rules: rules // Die bereits validierten Regeln
            };
            
            if (!profileData.name) {
                alert("Bitte einen Profil-Namen eingeben.");
                return;
            }
            
            // 4. Handler aufrufen
            handlers.onSaveProfile(profileData);
        });
    }

    // Vorlage speichern
    if (uiElements.saveTemplateButton) {
        uiElements.saveTemplateButton.addEventListener('click', () => {
            const name = uiElements.templateNameInput.value;
            const rules = getRulesFromInputs(); // 1. Regeln lesen

            // --- HIER VALIDIERUNG HINZUFÜGEN ---
            const validationError = validateRules(rules);
            if (validationError) {
                alert(validationError); // Zeige den Logikfehler
                return; // Stoppe das Speichern
            }
            // --- ENDE VALIDIERUNG ---

            if (!name) {
                alert("Bitte einen Namen für die Vorlage eingeben.");
                return;
            }
            handlers.onSaveTemplate(name, rules); // 3. Erst jetzt speichern
        });
    }

    // Vorlage anwenden
    if (uiElements.templateSelect) {
        uiElements.templateSelect.addEventListener('change', () => {
            const templateId = parseInt(uiElements.templateSelect.value);
            if (!templateId) return;
            handlers.onTemplateSelect(templateId);
        });
    }

    // Backup
    if (uiElements.exportButton) uiElements.exportButton.addEventListener('click', handlers.onExport);
    if (uiElements.importButton) uiElements.importButton.addEventListener('click', () => uiElements.importFile.click());
    if (uiElements.importFile) uiElements.importFile.addEventListener('change', (e) => handleFileImport(e, handlers.onImport));

    // Footer-Tabs
    const showMatrixTab = document.getElementById('showMatrixTab');
    const showGraphTab = document.getElementById('showGraphTab');
    const matrixContent = document.getElementById('manualWarningMonitor');
    const graphContent = document.getElementById('graphContainer');
    if (showMatrixTab && showGraphTab && matrixContent && graphContent) {
        showMatrixTab.addEventListener('click', () => {
            matrixContent.classList.add('active');
            graphContent.classList.remove('active');
            showMatrixTab.classList.add('active');
            showGraphTab.classList.remove('active');
        });
        showGraphTab.addEventListener('click', () => {
            matrixContent.classList.remove('active');
            graphContent.classList.add('active');
            showMatrixTab.classList.remove('active');
            showGraphTab.classList.add('active');
        });
    }

    initMapStatusPlaceholder();
};


// --- 3. UI-Update-Funktionen (von main.js aufgerufen) ---

// Footer-Resize-Logik (Unverändert)
export function initResizeHandle() {
    const handle = document.getElementById('footer-resize-handle');
    const pageContainer = document.querySelector('.page-container');
    const minFooterHeight = 100;
    const maxFooterHeightFactor = 0.7;
    if (!handle || !pageContainer) return;
    let isResizing = false;
    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        handle.style.borderTopColor = 'red';
        pageContainer.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const viewportHeight = window.innerHeight;
        const mouseY = e.clientY;
        let newFooterHeight = viewportHeight - mouseY;
        const maxFooterHeight = viewportHeight * maxFooterHeightFactor;
        if (newFooterHeight < minFooterHeight) newFooterHeight = minFooterHeight;
        else if (newFooterHeight > maxFooterHeight) newFooterHeight = maxFooterHeight;
        pageContainer.style.setProperty('--footer-height', `${newFooterHeight}px`);
        window.dispatchEvent(new Event('resize'));
    });
    document.addEventListener('mouseup', () => {
        isResizing = false;
        handle.style.borderTopColor = 'var(--color-primary)';
        pageContainer.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
    });
}

/**
 * Zeigt die Alarme im oberen "Auto-Monitor" an.
 * NEU: Dynamisch basierend auf METRICS_CONFIG
 */
export const displayAutoWarnings = (alarmResults) => {
    const monitor = uiElements.autoWarnDashboard;
    monitor.innerHTML = '';

    if (alarmResults.length === 0) {
        monitor.innerHTML = `<p style="color: green; padding: 10px;">${new Date().toLocaleTimeString('de-DE')}: Alle Profile OK.</p>`;
        return;
    }

    let html = `<h4><span style="color: red;">${alarmResults.length} ALARM(E)</span> - Stand: ${new Date().toLocaleTimeString('de-DE')}</h4>`;
    alarmResults.forEach(result => {
        const p = result.profile;
        const s = result.summary;
        const r = p.rules;

        html += `<div class="alarm-item" data-profile-id="${p.id}" style="border-bottom: 1px solid #ccc; padding: 5px; margin-bottom: 5px; cursor: pointer;">
                    <strong>Profil: ${p.name}</strong><br>`;

        // --- NEUE DYNAMISCHE SCHLEIFE ---
        for (const metric of Object.values(METRICS_CONFIG)) {
            const ruleName = metric.ruleName;
            const summaryKey = metric.summaryKey;

            // Prüfen, ob die Regel im Profil (r) aktiv ist UND ob ein Summary (s) dafür existiert
            if (((r[ruleName + '_alarm'] !== null && r[ruleName + '_alarm'] !== undefined) ||
                (r[ruleName + '_warn'] !== null && r[ruleName + '_warn'] !== undefined)) && s[summaryKey]) {
                const blendedStatus = createBlendedStatus(s, summaryKey);
                // Prüfen, ob für diese Metrik ein Alarm/Warnung vorliegt
                if (Object.values(blendedStatus).some(status => status !== 'ok' && status !== 'no-data')) {

                    // Verwende den Formatter aus der Config
                    const { value, unit } = metric.formatter(s[summaryKey].value, p);
                    const { value: limit } = metric.formatter(r[ruleName], p);
                    const range = getAlarmTimeRange(blendedStatus);

                    html += `<span style="color: ${metric.chartColor};">&#9658; ${metric.displayName} (Limit: ${limit}${unit}): ${range}</span><br>`;
                }
            }
        }
        // --- ENDE DYNAMISCHE SCHLEIFE ---

        if (s.error) html += `<span style="color: magenta;">&#9658; FEHLER: ${s.error}</span><br>`;
        html += `</div>`;
    });
    monitor.innerHTML = html;
};

/**
 * Initialisiert den Karten-Status-Platzhalter.
 * (Unverändert)
 */
export const initMapStatusPlaceholder = () => {
    uiElements.mapStatusContainer.style.borderColor = 'var(--border-color-strong)';
    uiElements.mapStatusContainer.style.backgroundColor = 'transparent';
    uiElements.mapStatusText.innerHTML = '⚠️ **3. Area zeichnen:** Bitte zuerst eine Area auf der Karte definieren.';
    uiElements.saveButton.disabled = true;
};

/**
 * Zeigt das Ergebnis einer *manuellen* Prüfung (inkl. Ampel-Tabelle).
 * NEU: Dynamisch basierend auf METRICS_CONFIG
 */
export const displayManualWarning = (profile, summary) => {
    const monitor = uiElements.manualWarningMonitor;
    monitor.innerHTML = '';

    if (!summary || !profile || !profile.rules) {
        monitor.innerHTML = `<p>Fehler beim Laden der Daten.</p>`;
        return;
    }

    let html = `<strong>Prüfbericht für: ${profile.name}</strong>`;
    const rules = profile.rules;

    if (summary.error) {
        html += `<div style="color: magenta; border: 1px solid magenta; padding: 5px; margin-bottom: 5px;"><strong>SYSTEM-FEHLER</strong><br>${summary.error}</div>`;
    }

    // --- Ampel-Matrix ---
    let tableHtml = "";
    const blendedCombinedStatus = getBlendedCombinedStatus(profile, summary);

    // Finde einen Referenz-Stunden-Key (z.B. von 'wind')
    const firstMetricKey = Object.values(METRICS_CONFIG)[0].summaryKey;
    const hours = (summary[firstMetricKey] && summary[firstMetricKey].hourlyStatus)
        ? Object.keys(summary[firstMetricKey].hourlyStatus).sort((a, b) => parseInt(a) - parseInt(b))
        : [];

    if (hours.length > 0) {
        tableHtml = `<table class="ampel-table" id="trafficLightMatrix"><thead><tr><th>Parameter</th>`;
        hours.forEach(hour => tableHtml += `<th>${hour}h</th>`);
        tableHtml += `</tr></thead><tbody>`;

        // Kombi-Zeile
        if (summary.combined) {
            tableHtml += buildRow('**Gesamt-Status**', blendedCombinedStatus, hours, 'combined', true);
        }

        // --- NEUE DYNAMISCHE SCHLEIFE ---
        // Einzel-Parameter (nutzt die globale, override-fähige buildRow)
        for (const metric of Object.values(METRICS_CONFIG)) {
            const ruleName = metric.ruleName;
            // Zeile nur bauen, wenn Regel im Profil aktiv ist
            if ((rules[ruleName + '_alarm'] !== null && rules[ruleName + '_alarm'] !== undefined) ||
                (rules[ruleName + '_warn'] !== null && rules[ruleName + '_warn'] !== undefined)) {
                tableHtml += buildRow(metric.displayName, summary[metric.summaryKey].hourlyStatus, hours, metric.summaryKey);
            }
        }
        // --- ENDE DYNAMISCHE SCHLEIFE ---

        tableHtml += `</tbody></table>`;
    }

    monitor.innerHTML = html + tableHtml;
    addManualOverrideListener();
};

/**
 * Baut die Profil-Liste in der Sidebar auf.
 * (NEU: Umgebaut auf Flexbox-Layout mit Icon-Button)
 */
export const displayProfileList = (profiles, handlers) => {
    uiElements.profileList.innerHTML = '';
    profiles.forEach(profile => {
        const li = document.createElement('li');

        // NEU: Span für den Namen, damit Flexbox funktioniert
        const profileNameSpan = document.createElement('span');
        profileNameSpan.textContent = profile.name;
        profileNameSpan.className = 'profile-list-name';
        li.appendChild(profileNameSpan);

        // NEU: Container für die Buttons, um sie rechts zu gruppieren
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'profile-button-container';

        // "Prüfen & Laden"-Button
        const testButton = document.createElement('button');
        testButton.textContent = 'Prüfen & Laden';
        testButton.className = 'check-profile-button';

        // ALT: testButton.style.marginLeft = '10px'; (Wird jetzt von CSS gehandhabt)

        testButton.onclick = async () => {
            setProfileButtonsDisabled(true);
            const profileData = {
                id: profile.id,
                name: profile.name,
                rules: profile.rules,
                geojson: JSON.parse(profile.geojsonString)
            };
            await handlers.onCheck(profileData);
            setProfileButtonsDisabled(false);
        };
        buttonContainer.appendChild(testButton); // NEU: Zum Container hinzugefügt

        // "Löschen"-Button (als Icon)
        const deleteButton = document.createElement('button');

        // ALT: deleteButton.textContent = 'Löschen';
        deleteButton.innerHTML = '&#128465;'; // NEU: Unicode Papierkorb-Symbol

        // ALT: deleteButton.style.marginLeft = '5px';
        // ALT: deleteButton.style.color = 'red';
        deleteButton.className = 'delete-profile-button'; // NEU: Styling über CSS

        deleteButton.title = `Profil '${profile.name}' löschen`; // NEU: Tooltip

        deleteButton.onclick = () => {
            handlers.onDelete(profile);
        };
        buttonContainer.appendChild(deleteButton); // NEU: Zum Container hinzugefügt

        // NEU: Den Button-Container zur li hinzufügen
        li.appendChild(buttonContainer);

        uiElements.profileList.appendChild(li);
    });
};

/**
 * Füllt das Dropdown-Menü mit Vorlagen.
 * (Unverändert)
 */
export const displayTemplateList = (templates) => {
    const select = uiElements.templateSelect;
    select.innerHTML = '<option value="">-- Vorlage wählen --</option>';
    templates.forEach(template => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.name;
        select.appendChild(option);
    });
};

/**
 * NEU: Füllt die Eingabefelder (Regeln, Name, Modus)
 * basierend auf einem übergebenen Regel-Objekt.
 * (Angepasst für Dual-Threshold: _alarm / _warn)
 */
export const applyRulesToInputs = (rules, profileName) => {
    if (!rules) return;

    // 1. Setze die Input-Werte dynamisch
    for (const metric of Object.values(METRICS_CONFIG)) {

        // Finde die ZWEI neuen Input-Felder
        const elem_alarm = document.getElementById(metric.ruleName + '_alarm');
        const elem_warn = document.getElementById(metric.ruleName + '_warn');

        // Lese die Werte aus dem Profil
        const value_alarm = rules[metric.ruleName + '_alarm'];
        const value_warn = rules[metric.ruleName + '_warn'];

        // Setze den Wert (oder leer, wenn null/undefined)
        if (elem_alarm) {
            elem_alarm.value = (value_alarm !== null && value_alarm !== undefined) ? value_alarm : '';
        }
        if (elem_warn) {
            elem_warn.value = (value_warn !== null && value_warn !== undefined) ? value_warn : '';
        }
    }

    // 2. Setze den Einheiten-Radio-Button
    if (rules.unitMode === 'aviation') {
        uiElements.unitModeAviation.checked = true;
    } else {
        uiElements.unitModeMetric.checked = true;
    }

    // 3. Setze den Logik-Modus Radio-Button
    const logicModeRadio = document.querySelector(`input[name="logicMode"][value="${rules.logicMode || 'OR'}"]`);
    if (logicModeRadio) {
        logicModeRadio.checked = true;
    }

    // 4. Setze den Profil-Namen (wenn übergeben)
    if (uiElements.profileNameInput && profileName) {
        uiElements.profileNameInput.value = profileName;
    }

    // 5. Labels (m/ft, etc.) aktualisieren
    updateRuleInputLabels();
};


/**
 * Füllt die Input-Felder basierend auf einer Vorlage.
 * (Angepasst: Nutzt jetzt die neue Helfer-Funktion)
 */
export const applyTemplateToInputs = (template) => {
    if (!template) return;

    // 1. Lade die Regeln (setzt *nicht* den Profil-Namen)
    applyRulesToInputs(template.rules, null);

    // 2. Setze den *Vorlagen*-Namen
    uiElements.templateNameInput.value = template.name;
};

// --- 4. Interne Hilfsfunktionen ---

export const setDashboardMessage = (html) => { uiElements.autoWarnDashboard.innerHTML = html; };
export const setManualMonitorMessage = (html) => { uiElements.manualWarningMonitor.innerHTML = html; };

export const enableSaveButton = () => {
    uiElements.mapStatusContainer.style.borderColor = 'var(--color-success)';
    uiElements.mapStatusContainer.style.backgroundColor = '#d4edda';
    uiElements.mapStatusText.innerHTML = '✅ **3. Area gezeichnet:** Shape ist bereit zum Speichern.';
    uiElements.saveButton.disabled = false;
};

export const resetProfileInputs = () => {
    uiElements.profileNameInput.value = '';
    
    // --- KORREKTUR ---
    // Lösche die dynamischen _alarm und _warn Input-Felder
    for (const metric of Object.values(METRICS_CONFIG)) {
        const elem_alarm = document.getElementById(metric.ruleName + '_alarm');
        const elem_warn = document.getElementById(metric.ruleName + '_warn');
        if (elem_alarm) elem_alarm.value = '';
        if (elem_warn) elem_warn.value = '';
    }
    initMapStatusPlaceholder();
};

/**
 * NEU: Validiert die logische Konsistenz der Alarm- und Warn-Regeln.
 * @param {object} rules - Das Regel-Objekt von getRulesFromInputs
 * @returns {string | null} - Eine Fehlermeldung oder null, wenn alles OK ist.
 */
function validateRules(rules) {
    for (const metric of Object.values(METRICS_CONFIG)) {
        const alarm_val = rules[metric.ruleName + '_alarm'];
        const warn_val = rules[metric.ruleName + '_warn'];

        // Nur prüfen, wenn BEIDE Werte gesetzt wurden
        if (alarm_val !== null && warn_val !== null) {
            
            if (metric.checkType === 'min') {
                // "MIN"-Check (Sicht, Temp): Alarm-Limit muss *kleiner* sein als Warn-Limit
                // z.B. FEHLER: Rot (50) >= Gelb (200) -> Falsch
                if (alarm_val >= warn_val) {
                    return `Logikfehler bei "${metric.displayName}": Das Rote Limit (${alarm_val}) muss *kleiner* sein als das Gelbe Limit (${warn_val}).`;
                }
            } else { // 'max'
                // "MAX"-Check (Wind, Wolken): Alarm-Limit muss *größer* sein als Warn-Limit
                // z.B. FEHLER: Rot (50) <= Gelb (40) -> Falsch
                if (alarm_val <= warn_val) {
                    return `Logikfehler bei "${metric.displayName}": Das Rote Limit (${alarm_val}) muss *größer* sein als das Gelbe Limit (${warn_val}).`;
                }
            }
        }
    }
    return null; // Alles OK
}

/**
 * Liest die aktuellen Werte aus den Regel-Feldern.
 * NEU: Liest _alarm und _warn Felder.
 */
const getRulesFromInputs = () => {
    const unitMode = uiElements.unitModeAviation.checked ? 'aviation' : 'metric';
    const logicModeRadio = document.querySelector('input[name="logicMode"]:checked');
    const logicMode = logicModeRadio ? logicModeRadio.value : 'OR';
    const rules = { unitMode: unitMode, logicMode: logicMode };

    for (const metric of Object.values(METRICS_CONFIG)) {

        // Finde die ZWEI neuen Input-Felder
        const elem_alarm = document.getElementById(metric.ruleName + '_alarm');
        const elem_warn = document.getElementById(metric.ruleName + '_warn');

        // Lese die Rohwerte (oder leer, falls nicht gefunden)
        const rawVal_alarm = elem_alarm ? elem_alarm.value : "";
        const rawVal_warn = elem_warn ? elem_warn.value : "";

        // Verarbeite die Werte: "" wird null, Text wird Zahl
        // (Wir nutzen parseFloat, damit auch 0 als Wert gespeichert wird)

        const parsed_alarm = parseFloat(rawVal_alarm);
        rules[metric.ruleName + '_alarm'] = isNaN(parsed_alarm) ? null : parsed_alarm;

        const parsed_warn = parseFloat(rawVal_warn);
        rules[metric.ruleName + '_warn'] = isNaN(parsed_warn) ? null : parsed_warn;
    }
    return rules;
};


/**
 * Verarbeitet die Import-Datei.
 * (Unverändert)
 */
const handleFileImport = (event, onImportCallback) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const importedProfiles = JSON.parse(e.target.result);
            if (!Array.isArray(importedProfiles)) throw new Error("Datei ist kein Array.");
            const validProfiles = importedProfiles.filter(p => p.name && p.geojsonString && p.rules);
            const invalidCount = importedProfiles.length - validProfiles.length;
            if (validProfiles.length === 0) throw new Error("Keine gültigen Profile gefunden.");
            const result = await onImportCallback(validProfiles);
            if (result.success) {
                alert(`Import erfolgreich!\n- ${result.count} Profile importiert.\n- ${invalidCount} ungültige Einträge übersprungen.`);
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            alert(`Import fehlgeschlagen: ${err.message}`);
        } finally {
            event.target.value = null;
        }
    };
    reader.readAsText(file);
};

/**
 * Sperrt oder entsperrt alle "Prüfen & Laden"-Knöpfe.
 * (Unverändert)
 */
function setProfileButtonsDisabled(disabled) {
    const buttons = document.querySelectorAll('.check-profile-button');
    buttons.forEach(button => {
        button.disabled = disabled;
        button.textContent = disabled ? 'Prüfe...' : 'Prüfen & Laden';
    });
}

/**
 * Aktualisiert die Labels (km/h, kts, m, ft) neben den Input-Feldern.
 * NEU: Dynamisch, liest den Formatter-Typ aus der Config.
 */
function updateRuleInputLabels() {
    const mode = uiElements.unitModeAviation.checked ? 'aviation' : 'metric';
    const unitConfig = UNITS[mode]; // { speed: 'kts', altitude: 'ft', temp: '°C' }

    for (const metric of Object.values(METRICS_CONFIG)) {
        const span = document.getElementById(metric.uiUnitId);
        if (!span) continue;

        let unit = 'N/A'; // Fallback

        // Leite die Einheit aus der zugewiesenen Formatierungsfunktion ab
        if (metric.formatter === formatter.formatSpeed) {
            unit = unitConfig.speed;
        } else if (metric.formatter === formatter.formatAltitude) {
            unit = unitConfig.altitude;
        } else if (metric.formatter === formatter.formatTemp) {
            unit = unitConfig.temp;
        } else if (metric.formatter === formatter.formatPercent) {
            unit = '%';
        } else if (metric.formatter === formatter.formatPrecipMM) {
            // (Vorbereitung für den finalen Umbau)
            unit = 'mm';
        }

        span.textContent = unit;
    }
}


/**
 * Berechnet die konsolidierte Zeitspanne, in der ein Alarm aktiv ist.
 * (Unverändert)
 */
function getAlarmTimeRange(hourlyStatus) {
    if (!hourlyStatus) return 'N/A';
    const hours = Object.keys(hourlyStatus).sort((a, b) => parseInt(a) - parseInt(b)).map(h => parseInt(h));
    const alarmHours = hours.filter(h => hourlyStatus[h] === 'alarm');
    if (alarmHours.length === 0) return 'N/A';
    let resultRanges = [];
    let startHour = null;
    let endHour = null;
    for (let i = 0; i < alarmHours.length; i++) {
        const currentHour = alarmHours[i];
        if (startHour === null) {
            startHour = currentHour;
            endHour = currentHour;
        } else if (currentHour === endHour + 1) {
            endHour = currentHour;
        } else {
            if (startHour === endHour) resultRanges.push(`${startHour}Z`);
            else resultRanges.push(`${startHour}Z - ${endHour}Z`);
            startHour = currentHour;
            endHour = currentHour;
        }
    }
    if (startHour !== null) {
        if (startHour === endHour) resultRanges.push(`${startHour}Z`);
        else resultRanges.push(`${startHour}Z - ${endHour}Z`);
    }
    return resultRanges.join(', ');
}

/**
 * Baut eine einzelne Tabellen-Zelle mit Overrides und Klick-Handler.
 * (Unverändert)
 */
function buildCell(finalStatus, autoStatus, ruleKey, hour, isCombinedRow) {
    let statusClass = `status-${finalStatus}`;
    let tooltip = '';
    const isClickable = !isCombinedRow;
    if (finalStatus === 'no-data') {
        statusClass = 'status-no-data';
        tooltip = 'Keine Daten vom Wettermodell verfügbar. Klick zum Setzen einer manuellen Warnung.';
    } else {
        const overrides = getManualOverrides();
        const isOverridden = overrides[ruleKey] && overrides[ruleKey][hour];
        tooltip = isOverridden
            ? `Manuell: ${finalStatus.toUpperCase()} (Klick zum Ändern/Reset)`
            : `Automatisch: ${finalStatus.toUpperCase()} (Klick zum Ändern)`;
    }
    const dataAttributes = `data-rule-key="${ruleKey}" data-hour="${hour}"`;
    return `<td class="${statusClass} ${isClickable ? 'manual-override-cell' : ''}" ${dataAttributes} title="${tooltip}"></td>`;
}

/**
 * Baut eine komplette Tabellen-Zeile mit Blending-Logik.
 * (Unverändert)
 */
const buildRow = (paramName, statusObject, hours, ruleKey, isCombinedRow = false) => {
    let rowHtml = `<tr class="${isCombinedRow ? 'summary-row' : ''}"><td><strong>${paramName.replace(/\*\*/g, '')}</strong></td>`;
    const manualOverrides = getManualOverrides()[ruleKey] || {};
    hours.forEach(hour => {
        const autoStatus = statusObject[hour];
        let finalStatus;
        if (isCombinedRow) {
            finalStatus = autoStatus;
        } else {
            finalStatus = manualOverrides[hour] || autoStatus;
        }
        finalStatus = finalStatus || 'no-data';
        rowHtml += buildCell(finalStatus, autoStatus, ruleKey, hour, isCombinedRow);
    });
    rowHtml += `</tr>`;
    return rowHtml;
};

/**
 * Registriert den Klick-Handler für die Ampel-Matrix.
 * (Unverändert)
 */
function addManualOverrideListener() {
    const matrix = document.getElementById('manualWarningMonitor');
    if (!matrix) return;
    matrix.removeEventListener('click', handleManualOverrideClick);
    matrix.addEventListener('click', handleManualOverrideClick);
}

/**
 * Der eigentliche Klick-Handler für die Ampel-Zellen.
 * (Unverändert)
 */
function handleManualOverrideClick(event) {
    const target = event.target.closest('.manual-override-cell');
    if (!target) return;
    const ruleKey = target.dataset.ruleKey; // <-- WICHTIG: Nutzt jetzt summaryKey (z.B. 'precip')
    const hour = target.dataset.hour;
    if (!ruleKey || !hour) return;
    const overrides = getManualOverrides();
    const currentOverrideStatus = overrides[ruleKey] ? overrides[ruleKey][hour] : null;
    let currentIndex = STATUS_CYCLE.indexOf(currentOverrideStatus);
    let nextIndex = (currentIndex + 1) % STATUS_CYCLE.length;
    const nextStatus = STATUS_CYCLE[nextIndex];
    updateManualOverride(ruleKey, hour, nextStatus);
}


// --- Blending-Logik (Unverändert, aber nutzt jetzt summaryKey) ---

/**
 * Erstellt den geblendeten hourlyStatus für die Zeitbereich-Funktion (displayAutoWarnings).
 */
function createBlendedStatus(summary, summaryKey) { // <-- Nimmt jetzt summaryKey
    const blended = {};
    const autoStatus = (summary[summaryKey] && summary[summaryKey].hourlyStatus) || {};
    const overrides = getManualOverrides()[summaryKey] || {};
    const hours = Object.keys(autoStatus).sort((a, b) => parseInt(a) - parseInt(b));
    hours.forEach(hour => {
        const auto = autoStatus[hour] || 'no-data';
        const manual = overrides[hour];
        blended[hour] = manual || auto;
    });
    return blended;
}

/**
 * Hilfsfunktion zum Finden des schlechtesten Status
 */
function getWorseStatus(s1, s2) {
    if (s1 === 'alarm' || s2 === 'alarm') return 'alarm';
    if (s1 === 'warn' || s2 === 'warn') return 'warn';
    // NEUE REGEL: 'ok' gewinnt über 'no-data'
    if (s1 === 'ok' || s2 === 'ok') return 'ok';
    return 'no-data';
}

/**
 * Gibt den geblendeten Status für eine einzelne Regel und Stunde zurück.
 */
function getBlendedStatus(summary, summaryKey, hour) { // <-- Nimmt jetzt summaryKey
    const overrides = getManualOverrides();
    const autoStatus = (summary[summaryKey] && summary[summaryKey].hourlyStatus[hour]) || 'no-data'; // <-- Default 'no-data'
    const manual = overrides[summaryKey] ? overrides[summaryKey][hour] : null;
    return manual || autoStatus;
}

/**
 * Berechnet den finalen, kombinierten Status (Auto + Overrides) für jede Stunde.
 * NEU: Berücksichtigt den "AND" / "OR" Logik-Modus aus dem Profil.
 */
function getBlendedCombinedStatus(profile, summary) {
    const rules = profile.rules;
    const combinedStatus = {};

    // NEU: Logik-Modus aus dem Profil holen, Standard ist 'OR'
    const logicMode = rules.logicMode || 'OR';

    // Finde einen Referenz-Stunden-Key
    const firstMetricKey = Object.values(METRICS_CONFIG)[0].summaryKey;
    const hours = (summary[firstMetricKey] && summary[firstMetricKey].hourlyStatus)
        ? Object.keys(summary[firstMetricKey].hourlyStatus).sort((a, b) => parseInt(a) - parseInt(b))
        : [];

    hours.forEach(hour => {
        let combinedStatusForHour = 'no-data';
        let activeRuleStati = []; // Speichert den geblendeten Status aller *aktiven* Regeln

        // 1. Sammle den *geblendeten* Status aller Regeln, die für dieses Profil aktiv sind
        for (const metric of Object.values(METRICS_CONFIG)) {
            const ruleName = metric.ruleName;
            const summaryKey = metric.summaryKey;

            // Prüfen, ob die Regel im Profil aktiv ist (Limit nicht null/undefined)
            if (((rules[ruleName + '_alarm'] !== null && rules[ruleName + '_alarm'] !== undefined) ||
                 (rules[ruleName + '_warn'] !== null && rules[ruleName + '_warn'] !== undefined)) && summary[summaryKey])
            {
                // HIER IST DER UNTERSCHIED: Wir holen den geblendeten Status
                const blendedRuleStatus = getBlendedStatus(summary, summaryKey, hour);
                activeRuleStati.push(blendedRuleStatus);
            }
        }

        // 2. Wende die "UND" / "ODER" Logik an
        if (activeRuleStati.length === 0) {
            // Keine Regeln aktiv
            combinedStatusForHour = 'no-data';

        } else if (logicMode === 'AND') {
            // --- "UND"-Logik ---
            // Alarm, wenn ALLE 'alarm' oder 'warn' sind
            // OK, wenn auch nur EINE 'ok' ist

            if (activeRuleStati.some(s => s === 'ok')) {
                combinedStatusForHour = 'ok';
            } else if (activeRuleStati.every(s => s === 'alarm' || s === 'warn')) {
                // Alle sind ausgelöst
                combinedStatusForHour = activeRuleStati.some(s => s === 'alarm') ? 'alarm' : 'warn';
            } else {
                // Mix aus 'no-data', 'warn', 'alarm', aber nicht alle sind ausgelöst
                combinedStatusForHour = 'no-data';
            }

        } else {
            // --- "ODER"-Logik (wie bisher) ---
            let orStatus = 'no-data';
            activeRuleStati.forEach(status => {
                orStatus = getWorseStatus(orStatus, status);
            });
            combinedStatusForHour = orStatus;
        }

        combinedStatus[hour] = combinedStatusForHour;
    });

    return combinedStatus;
}

/**
 * NEU: Exportierte Funktion, um das "Profil erstellen"-Panel
 * per Code zu öffnen.
 */
export const openProfileEditorAccordion = () => {
    // Finde den richtigen Header (Annahme: Es ist der 2. Header, Index 1)
    // 0 = 🚨 Automatischer Alarm-Monitor
    // 1 = ✍️ Profil erstellen / Regeln definieren
    if (!uiElements.accordions || uiElements.accordions.length < 2) return;

    const editorHeader = uiElements.accordions[1];
    if (editorHeader) {
        const panel = editorHeader.nextElementSibling;
        const isOpen = panel.classList.contains('open');

        if (!isOpen) {
            // Alle anderen schließen
            uiElements.accordions.forEach(otherAcc => {
                otherAcc.classList.remove('active');
                otherAcc.nextElementSibling.classList.remove('open');
            });
            // Dieses öffnen
            editorHeader.classList.add('active');
            panel.classList.add('open');
        }
    }
};