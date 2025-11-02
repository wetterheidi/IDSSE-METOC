// ui.js
import * as db from './db.js'; // Wird für Callbacks benötigt
import * as formatter from './formatter.js'; // <-- NEU
import { UNITS } from './config.js';

export const uiElements = {};

// --- 2. Initialisierungs-Funktion ---

/**
 * Hängt alle Event-Listener an die UI-Elemente.
 * 'handlers' ist ein Objekt mit Callback-Funktionen von main.js
 */
export const initUI = (handlers) => {

    // --- SCHRITT 1: ERST alle DOM-Elemente finden ---
    uiElements.autoWarnDashboard = document.getElementById('autoWarnDashboard');
    uiElements.manualWarningMonitor = document.getElementById('manualWarningMonitor');
    uiElements.profileList = document.getElementById('profileList');
    uiElements.profileNameInput = document.getElementById('profileName');
    uiElements.saveButton = document.getElementById('saveButton');

    uiElements.mapStatusContainer = document.getElementById('mapStatusContainer');
    uiElements.mapStatusText = document.getElementById('mapStatusText');

    uiElements.ruleInputs = {
        maxWind: document.getElementById('maxWind'),
        minTemp: document.getElementById('minTemp'),
        minVis: document.getElementById('minVis'),
        minCloud: document.getElementById('minCloud'),
        maxPrecipProb: document.getElementById('maxPrecipProb')
    };
    uiElements.templateNameInput = document.getElementById('templateName');
    uiElements.saveTemplateButton = document.getElementById('saveTemplateButton');
    uiElements.templateSelect = document.getElementById('templateSelect');
    uiElements.exportButton = document.getElementById('exportButton');
    uiElements.importButton = document.getElementById('importButton');
    uiElements.importFile = document.getElementById('importFile');
    uiElements.runAutoCheckButton = document.getElementById('runAutoCheckButton');
    uiElements.accordions = document.querySelectorAll('.accordion-header');
    uiElements.demoModeCheckbox = document.getElementById('demoModeCheckbox'); // Gefunden!
    uiElements.unitModeMetric = document.querySelector('input[name="unitMode"][value="metric"]');
    uiElements.unitModeAviation = document.querySelector('input[name="unitMode"][value="aviation"]');
    uiElements.unitSpans = {
        maxWind: document.getElementById('unit-maxWind'),
        minTemp: document.getElementById('unit-minTemp'),
        minVis: document.getElementById('unit-minVis'),
        minCloud: document.getElementById('unit-minCloud'),
        maxPrecipProb: document.getElementById('unit-maxPrecipProb'),
    };

    // --- SCHRITT 2: DANN alle Event-Listener anhängen ---

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

    // NEU: Einheiten-Modus
    const unitModeChangeHandler = () => {
        // Die Labels sofort nach der Änderung aktualisieren
        updateRuleInputLabels();
    };

    if (uiElements.unitModeMetric) {
        uiElements.unitModeMetric.addEventListener('change', unitModeChangeHandler);
    }
    if (uiElements.unitModeAviation) {
        uiElements.unitModeAviation.addEventListener('change', unitModeChangeHandler);
    }

    // Beim Start die Labels einmal korrekt setzen (Standard ist "metric")
    updateRuleInputLabels();

    // Auto-Check
    if (uiElements.runAutoCheckButton) {
        uiElements.runAutoCheckButton.addEventListener('click', handlers.onRunAutoCheck);
    } else {
        console.error("UI-Element 'runAutoCheckButton' nicht gefunden!");
    }

    // Demo-Schalter
    if (uiElements.demoModeCheckbox) {
        uiElements.demoModeCheckbox.addEventListener('change', () => {
            console.log("Demo-Modus umgeschaltet. Lade Dashboard neu...");
            handlers.onRunAutoCheck();
        });
    } else {
        console.error("UI-Element 'demoModeCheckbox' nicht gefunden!");
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
    } else {
        console.error("UI-Element 'autoWarnDashboard' nicht gefunden!");
    }

    // Profil speichern (Hier war wahrscheinlich der Fehler)
    if (uiElements.saveButton) {
        uiElements.saveButton.addEventListener('click', () => {
            const profileData = {
                name: uiElements.profileNameInput.value,
                rules: getRulesFromInputs()
            };
            if (!profileData.name) {
                alert("Bitte einen Profil-Namen eingeben.");
                return;
            }
            handlers.onSaveProfile(profileData);
        });
    } else {
        console.error("UI-Element 'saveButton' nicht gefunden!"); // Das wird dir sagen, ob ich recht habe
    }

    // Vorlage speichern
    if (uiElements.saveTemplateButton) {
        uiElements.saveTemplateButton.addEventListener('click', () => {
            const name = uiElements.templateNameInput.value;
            const rules = getRulesFromInputs();
            if (!name) {
                alert("Bitte einen Namen für die Vorlage eingeben.");
                return;
            }
            handlers.onSaveTemplate(name, rules);
        });
    } else {
        console.error("UI-Element 'saveTemplateButton' nicht gefunden!");
    }

    // Vorlage anwenden
    if (uiElements.templateSelect) {
        uiElements.templateSelect.addEventListener('change', () => {
            const templateId = parseInt(uiElements.templateSelect.value);
            if (!templateId) return;
            handlers.onTemplateSelect(templateId);
        });
    } else {
        console.error("UI-Element 'templateSelect' nicht gefunden!");
    }

    // Backup
    if (uiElements.exportButton) {
        uiElements.exportButton.addEventListener('click', handlers.onExport);
    }
    if (uiElements.importButton) {
        uiElements.importButton.addEventListener('click', () => uiElements.importFile.click());
    }
    if (uiElements.importFile) {
        uiElements.importFile.addEventListener('change', (e) => handleFileImport(e, handlers.onImport));
    }

    // --- NEU: Tab-Umschalt-Logik für den Footer ---
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

// --- NEU: Footer-Resize-Logik ---
export function initResizeHandle() { // WICHTIG: Exportieren
    const handle = document.getElementById('footer-resize-handle');
    const pageContainer = document.querySelector('.page-container');
    const minFooterHeight = 100;
    const maxFooterHeightFactor = 0.7;

    if (!handle || !pageContainer) {
        console.error("Resize-Handle oder Page-Container nicht gefunden. Resize-Funktion deaktiviert.");
        return;
    }

    let isResizing = false;

    // 1. Drag-Start
    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        handle.style.borderTopColor = 'red';
        pageContainer.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    // 2. Drag-Bewegung
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const viewportHeight = window.innerHeight;
        const mouseY = e.clientY;

        let newFooterHeight = viewportHeight - mouseY;

        const maxFooterHeight = viewportHeight * maxFooterHeightFactor;

        if (newFooterHeight < minFooterHeight) {
            newFooterHeight = minFooterHeight;
        } else if (newFooterHeight > maxFooterHeight) {
            newFooterHeight = maxFooterHeight;
        }

        // CSS Variable setzen
        pageContainer.style.setProperty('--footer-height', `${newFooterHeight}px`);

        // Chart.js muss manuell benachrichtigt werden
        window.dispatchEvent(new Event('resize'));
    });

    // 3. Drag-Ende
    document.addEventListener('mouseup', () => {
        isResizing = false;
        handle.style.borderTopColor = 'var(--color-primary)';
        pageContainer.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
    });
}

/**
 * Zeigt die Alarme im oberen "Auto-Monitor" an.
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
        const r = p.rules; // Abkürzung für Regeln

        html += `<div class="alarm-item" data-profile-id="${p.id}" style="border-bottom: 1px solid #ccc; padding: 5px; margin-bottom: 5px; cursor: pointer;">
                    <strong>Profil: ${p.name}</strong><br>`;

        // --- NEUE ANZEIGE MIT ZEITSPANNE (DAUER) ---
        if (s.wind && s.wind.triggered) {
            const { value, unit } = formatter.formatSpeed(s.wind.max, p);
            const { value: limit } = formatter.formatSpeed(r.maxWind, p);
            const range = getAlarmTimeRange(s.wind.hourlyStatus); // <-- Jetzt die Zeitspanne
            html += `<span style="color: red;">&#9658; Wind (Limit: ${limit}${unit}):  ${range}</span><br>`;
        }
        if (s.temp && s.temp.triggered) {
            const { value, unit } = formatter.formatTemp(s.temp.min, p);
            const { value: limit } = formatter.formatTemp(r.minTemp, p);
            const range = getAlarmTimeRange(s.temp.hourlyStatus);
            html += `<span style="color: blue;">&#9658; Temp (Limit: ${limit}${unit}): ${range}</span><br>`;
        }
        if (s.vis && s.vis.triggered) {
            const { value, unit } = formatter.formatAltitude(s.vis.min, p);
            const { value: limit } = formatter.formatAltitude(r.minVis, p);
            const range = getAlarmTimeRange(s.vis.hourlyStatus);
            html += `<span style="color: #8B4513;">&#9658; Sicht (Limit: ${limit}${unit}):  ${range}</span><br>`;
        }
        if (s.cloud && s.cloud.triggered) {
            const { value, unit } = formatter.formatAltitude(s.cloud.min, p);
            const { value: limit } = formatter.formatAltitude(r.minCloud, p);
            const range = getAlarmTimeRange(s.cloud.hourlyStatus);
            html += `<span style="color: #555;">&#9658; Wolken (Limit: ${limit}${unit}):  ${range}</span><br>`;
        }
        if (s.precip && s.precip.triggered) {
            const { value, unit } = formatter.formatPercent(s.precip.max, p);
            const { value: limit } = formatter.formatPercent(r.maxPrecipProb, p);
            const range = getAlarmTimeRange(s.precip.hourlyStatus);
            html += `<span style="color: #000080;">&#9658; Niederschl. (Limit: ${limit}${unit}):  ${range}</span><br>`;
        }
        
        if (s.error) html += `<span style="color: magenta;">&#9658; FEHLER: ${s.error}</span><br>`;
        html += `</div>`;
    });
    monitor.innerHTML = html;
};

/**
 * NEU: Initialisiert den Karten-Status-Platzhalter.
 */
export const initMapStatusPlaceholder = () => {
    // Setzt den Standard-Zustand beim Laden oder Reset
    uiElements.mapStatusContainer.style.borderColor = 'var(--border-color-strong)';
    uiElements.mapStatusContainer.style.backgroundColor = 'transparent';
    uiElements.mapStatusText.innerHTML = '⚠️ **3. Area zeichnen:** Bitte zuerst eine Area auf der Karte definieren.';
    uiElements.saveButton.disabled = true;
};

/**
 * Zeigt das Ergebnis einer *manuellen* Prüfung (inkl. Ampel-Tabelle).
 * (Version 3.0: "Master-Update" mit allen Fixes)
 */
export const displayManualWarning = (profile, summary) => {
    const monitor = uiElements.manualWarningMonitor;
    monitor.innerHTML = '';

    // --- 1. Robustheits-Checks ---
    if (!summary || !profile || !profile.rules) {
        monitor.innerHTML = `<p>Fehler beim Laden der Daten.</p>`;
        if (!summary) monitor.innerHTML = `<p>${profile}</p>`;
        return;
    }

    let html = `<srong>Prüfbericht für: ${profile.name}<strong>`;
    let hasWarnings = false;
    const rules = profile.rules;

    // --- 2. Text-Zusammenfassung (Aufgeräumt & mit Einheiten) ---

    if (summary.error) {
        html += `<div style="color: magenta; border: 1px solid magenta; padding: 5px; margin-bottom: 5px;"><strong>SYSTEM-FEHLER</strong><br>${summary.error}</div>`;
        hasWarnings = true;
    }

    // Wind
    if (summary.wind && summary.wind.triggered) {
        hasWarnings = true;
        const { value, unit } = formatter.formatSpeed(summary.wind.max, profile);
        const { value: limit, unit: limitUnit } = formatter.formatSpeed(rules.maxWind, profile);
        console.log(`WIND-ALARM: Max. Böe: ${value} ${unit} (Limit: ${limit} ${limitUnit})`);
    }

    // Temperatur
    if (summary.temp && summary.temp.triggered) {
        hasWarnings = true;
        const { value, unit } = formatter.formatTemp(summary.temp.min, profile);
        const { value: limit, unit: limitUnit } = formatter.formatTemp(rules.minTemp, profile);
        console.log(`FROST-ALARM: Min. Temp:${value} ${unit} (Limit: ${limit} ${limitUnit})`);
    }

    // Sichtweite
    if (summary.vis && summary.vis.triggered) {
        hasWarnings = true;
        const { value, unit } = formatter.formatAltitude(summary.vis.min, profile);
        const { value: limit, unit: limitUnit } = formatter.formatAltitude(rules.minVis, profile);
        console.log(`SICHT-ALARM: Min. Sicht: ${value} ${unit} (Limit: ${limit} ${limitUnit})`);
    }

    // Wolkenuntergrenze
    if (summary.cloud && summary.cloud.triggered) {
        hasWarnings = true;
        const { value, unit } = formatter.formatAltitude(summary.cloud.min, profile);
        const { value: limit, unit: limitUnit } = formatter.formatAltitude(rules.minCloud, profile);
        console.log(`WOLKEN-ALARM: Min. UG: ${value} ${unit} (Limit: ${limit} ${limitUnit})`);
    }

    // Niederschlag
    if (summary.precip && summary.precip.triggered) {
        hasWarnings = true;
        const { value, unit } = formatter.formatPercent(summary.precip.max, profile);
        const { value: limit, unit: limitUnit } = formatter.formatPercent(rules.maxPrecipProb, profile);
        console.log(`NIEDERSCHLAGS-ALARM: Max. Chance: ${value}${unit} (Limit: ${limit}${limitUnit})`);
    }

    // --- 3. "Alle OK"-Text ---
    if (!hasWarnings && Object.keys(rules).length > 0) {
        html = `<h4>Prüfbericht für: ${profile.name}</h4><p style="color: green; font-weight: bold;">Alle Parameter im grünen Bereich.</p>`;
    }

    // --- 4. Ampel-Matrix ---

    let tableHtml = ""; // Starte mit einer leeren Tabelle

    const buildRow = (paramName, statusObject, hoursArray, cssClass = '') => {
        let rowHtml = `<tr class="${cssClass}"><td><strong>${paramName.replace(/\*\*/g, '')}</strong></td>`;
        hoursArray.forEach(hour => {
            const status = statusObject[hour] || 'ok';
            rowHtml += `<td class="status-${status}"></td>`;
        });
        rowHtml += `</tr>`;
        return rowHtml;
    };

    const hours = (summary.wind && summary.wind.hourlyStatus)
        ? Object.keys(summary.wind.hourlyStatus).sort((a, b) => parseInt(a) - parseInt(b))
        : [];

    if (hours.length > 0) {
        tableHtml = `<table class="ampel-table"><thead><tr><th>Parameter</th>`;
        hours.forEach(hour => tableHtml += `<th>${hour}h</th>`);
        tableHtml += `</tr></thead><tbody>`;

        // Kombi-Zeile
        if (summary.combined) {
            tableHtml += buildRow('**Gesamt-Status**', summary.combined.hourlyStatus, hours, 'summary-row');
        }

        // Einzel-Parameter
        if (rules.maxWind) tableHtml += buildRow('Wind (Böe)', summary.wind.hourlyStatus, hours);
        if (rules.minTemp !== null) tableHtml += buildRow('Temp (2m)', summary.temp.hourlyStatus, hours);
        if (rules.minVis) tableHtml += buildRow('Sicht', summary.vis.hourlyStatus, hours);
        if (rules.minCloud) tableHtml += buildRow('Wolken (UG)', summary.cloud.hourlyStatus, hours);
        if (rules.maxPrecipProb !== null) tableHtml += buildRow('Niederschl.', summary.precip.hourlyStatus, hours);

        tableHtml += `</tbody></table>`;
    }

    // --- 5. Alles rendern ---
    monitor.innerHTML = html + tableHtml;
};

/**
 * Baut die Profil-Liste in der Sidebar auf.
 * (Version 2.0: Mit Spam-Bremse)
 */
export const displayProfileList = (profiles, handlers) => {
    uiElements.profileList.innerHTML = '';
    profiles.forEach(profile => {
        const li = document.createElement('li');
        li.textContent = `${profile.name}`;

        // Prüfen-Button
        const testButton = document.createElement('button');
        testButton.textContent = 'Prüfen & Laden';
        testButton.className = 'check-profile-button'; // <-- NEU: CSS-Klasse
        testButton.style.marginLeft = '10px';

        // NEU: 'async' und 'await' Logik
        testButton.onclick = async () => {
            // 1. Alle Knöpfe sperren
            setProfileButtonsDisabled(true);

            const profileData = {
                id: profile.id,
                name: profile.name,
                rules: profile.rules,
                geojson: JSON.parse(profile.geojsonString)
            };

            // 2. WARTEN, bis die Prüfung (inkl. API-Call) fertig ist
            await handlers.onCheck(profileData);

            // 3. Alle Knöpfe wieder freigeben
            setProfileButtonsDisabled(false);
        };
        li.appendChild(testButton);

        // Löschen-Button (unverändert)
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Löschen';
        deleteButton.style.marginLeft = '5px';
        deleteButton.style.color = 'red';
        deleteButton.onclick = () => {
            handlers.onDelete(profile);
        };
        li.appendChild(deleteButton);

        uiElements.profileList.appendChild(li);
    });
};

/**
 * Füllt das Dropdown-Menü mit Vorlagen.
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
 * Füllt die Input-Felder basierend auf einer Vorlage.
 */
export const applyTemplateToInputs = (template) => {
    if (!template) return;
    const rules = template.rules;
    uiElements.ruleInputs.maxWind.value = rules.maxWind || '';
    uiElements.ruleInputs.minTemp.value = rules.minTemp !== null ? rules.minTemp : '';
    uiElements.ruleInputs.minVis.value = rules.minVis || '';
    uiElements.ruleInputs.minCloud.value = rules.minCloud || '';
    uiElements.ruleInputs.maxPrecipProb.value = rules.maxPrecipProb !== null ? rules.maxPrecipProb : '';
    uiElements.templateNameInput.value = template.name;

    // NEU: Setze den Radio-Button basierend auf der Vorlage
    if (rules.unitMode === 'aviation') {
        uiElements.unitModeAviation.checked = true;
    } else {
        uiElements.unitModeMetric.checked = true;
    }

    // WICHTIG: Nach dem Setzen des Radio-Buttons die Labels aktualisieren
    updateRuleInputLabels();
};

// --- 4. Interne Hilfsfunktionen ---

export const setDashboardMessage = (html) => { uiElements.autoWarnDashboard.innerHTML = html; };
export const setManualMonitorMessage = (html) => { uiElements.manualWarningMonitor.innerHTML = html; };

export const enableSaveButton = () => {
    uiElements.mapStatusContainer.style.borderColor = 'var(--color-success)';
    uiElements.mapStatusContainer.style.backgroundColor = '#d4edda'; // Helles Grün
    uiElements.mapStatusText.innerHTML = '✅ **3. Area gezeichnet:** Shape ist bereit zum Speichern.';
    uiElements.saveButton.disabled = false;
};

export const resetProfileInputs = () => {
    uiElements.profileNameInput.value = '';
    // Wichtig: Beim Reset muss der Karten-Status auch zurückgesetzt werden.
    initMapStatusPlaceholder();
};

/**
 * Liest die aktuellen Werte aus den Regel-Feldern.
 */
const getRulesFromInputs = () => {
    // NEU: Finde den aktiven Modus
    const unitMode = uiElements.unitModeAviation.checked ? 'aviation' : 'metric';

    return {
        unitMode: unitMode, // <-- DAS IST NEU
        maxWind: parseFloat(uiElements.ruleInputs.maxWind.value) || null,
        minTemp: parseFloat(uiElements.ruleInputs.minTemp.value),
        minVis: parseFloat(uiElements.ruleInputs.minVis.value) || null,
        minCloud: parseFloat(uiElements.ruleInputs.minCloud.value) || null,
        maxPrecipProb: parseFloat(uiElements.ruleInputs.maxPrecipProb.value) || null
    };
};

/**
 * Verarbeitet die Import-Datei.
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
            event.target.value = null; // Input zurücksetzen
        }
    };
    reader.readAsText(file);
};

/**
 * Sperrt oder entsperrt alle "Prüfen & Laden"-Knöpfe in der Profil-Liste.
 */
function setProfileButtonsDisabled(disabled) {
    const buttons = document.querySelectorAll('.check-profile-button'); // Wir brauchen diese Klasse
    buttons.forEach(button => {
        button.disabled = disabled;
        button.textContent = disabled ? 'Prüfe...' : 'Prüfen & Laden';
    });
}

/**
 * NEU: Aktualisiert die Labels (km/h, kts, m, ft) neben den Input-Feldern.
 */
function updateRuleInputLabels() {
    // 1. Aktuellen Modus bestimmen
    const mode = uiElements.unitModeAviation.checked ? 'aviation' : 'metric';
    const unitConfig = UNITS[mode];

    // 2. Labels im DOM aktualisieren
    if (uiElements.unitSpans.maxWind) {
        uiElements.unitSpans.maxWind.textContent = unitConfig.speed;
    }
    if (uiElements.unitSpans.minTemp) {
        uiElements.unitSpans.minTemp.textContent = unitConfig.temp;
    }
    if (uiElements.unitSpans.minVis) {
        uiElements.unitSpans.minVis.textContent = unitConfig.altitude;
    }
    if (uiElements.unitSpans.minCloud) {
        uiElements.unitSpans.minCloud.textContent = unitConfig.altitude;
    }
    // Niederschlag ist immer Prozent
    if (uiElements.unitSpans.maxPrecipProb) {
        uiElements.unitSpans.maxPrecipProb.textContent = '%';
    }
}

/**
 * NEU: Berechnet die konsolidierte Zeitspanne, in der ein Alarm aktiv ist.
 * Die Funktion findet zusammenhängende Blöcke mit dem Status 'alarm'.
 * @param {Object<string, 'ok'|'warn'|'alarm'>} hourlyStatus - Status für jede Stunde (0-23).
 * @returns {string} Eine Zeichenkette der Form "07Z - 12Z" oder "05Z, 14Z - 16Z".
 */
function getAlarmTimeRange(hourlyStatus) {
    if (!hourlyStatus) return 'N/A';

    const hours = Object.keys(hourlyStatus)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map(h => parseInt(h));

    const alarmHours = hours.filter(h => hourlyStatus[h] === 'alarm');

    if (alarmHours.length === 0) {
        return 'N/A';
    }

    let resultRanges = [];
    let startHour = null;
    let endHour = null;

    for (let i = 0; i < alarmHours.length; i++) {
        const currentHour = alarmHours[i];

        if (startHour === null) {
            // Starte einen neuen Block
            startHour = currentHour;
            endHour = currentHour;
        } else if (currentHour === endHour + 1) {
            // Block fortsetzen
            endHour = currentHour;
        } else {
            // Block beenden und speichern, neuen Block starten
            if (startHour === endHour) {
                resultRanges.push(`${startHour}Z`);
            } else {
                resultRanges.push(`${startHour}Z - ${endHour}Z`);
            }
            startHour = currentHour;
            endHour = currentHour;
        }
    }

    // Speichere den letzten Block
    if (startHour !== null) {
        if (startHour === endHour) {
            resultRanges.push(`${startHour}Z`);
        } else {
            resultRanges.push(`${startHour}Z - ${endHour}Z`);
        }
    }

    return resultRanges.join(', ');
}