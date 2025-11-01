// ui.js
import * as db from './db.js'; // Wird für Callbacks benötigt
import * as formatter from './formatter.js'; // <-- NEU

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
    // --- ENDE Element-Suche ---


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
};


// --- 3. UI-Update-Funktionen (von main.js aufgerufen) ---

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

        html += `<div class="alarm-item" ...>
                    <strong>Profil: ${p.name}</strong><br>`;

        if (s.wind && s.wind.triggered) {
            const { value, unit } = formatter.formatSpeed(s.wind.max, p);
            html += `<span style="color: red;">&#9658; Wind: ${value} ${unit}</span><br>`;
        }
        if (s.temp && s.temp.triggered) {
            const { value, unit } = formatter.formatTemp(s.temp.min, p);
            html += `<span style="color: blue;">&#9658; Temp: ${value} ${unit}</span><br>`;
        }
        if (s.vis && s.vis.triggered) {
            const { value, unit } = formatter.formatAltitude(s.vis.min, p);
            html += `<span style="color: #8B4513;">&#9658; Sicht: ${value} ${unit}</span><br>`;
        }
        if (s.cloud && s.cloud.triggered) {
            const { value, unit } = formatter.formatAltitude(s.cloud.min, p);
            html += `<span style="color: #555;">&#9658; Wolken: ${value} ${unit}</span><br>`;
        }
        if (s.precip && s.precip.triggered) {
            const { value, unit } = formatter.formatPercent(s.precip.max, p);
            html += `<span style="color: #000080;">&#9658; Niederschl.: ${value}${unit}</span><br>`;
        } if (s.error) html += `<span style="color: magenta;">&#9658; FEHLER: ${s.error}</span><br>`;
        html += `</div>`;
    });
    monitor.innerHTML = html;
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

    let html = `<h4>Prüfbericht für: ${profile.name}</h4>`;
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
        html += `<div style="color: red; border: 1px solid red; padding: 5px; margin-bottom: 5px;">
                    <strong>WIND-ALARM</strong><br>
                    Max. Böe: <strong>${value} ${unit}</strong> (Limit: ${limit} ${limitUnit})
                 </div>`;
    }

    // Temperatur
    if (summary.temp && summary.temp.triggered) {
        hasWarnings = true;
        const { value, unit } = formatter.formatTemp(summary.temp.min, profile);
        const { value: limit, unit: limitUnit } = formatter.formatTemp(rules.minTemp, profile);
        html += `<div style="color: blue; border: 1px solid blue; padding: 5px; margin-bottom: 5px;">
                    <strong>FROST-ALARM</strong><br>
                    Min. Temp: <strong>${value} ${unit}</strong> (Limit: ${limit} ${limitUnit})
                 </div>`;
    }

    // Sichtweite
    if (summary.vis && summary.vis.triggered) {
        hasWarnings = true;
        const { value, unit } = formatter.formatAltitude(summary.vis.min, profile);
        const { value: limit, unit: limitUnit } = formatter.formatAltitude(rules.minVis, profile);
        html += `<div style="color: #8B4513; border: 1px solid #8B4513; padding: 5px; margin-bottom: 5px;">
                    <strong>SICHT-ALARM (IFR)</strong><br>
                    Min. Sicht: <strong>${value} ${unit}</strong> (Limit: ${limit} ${limitUnit})
                 </div>`;
    }

    // Wolkenuntergrenze
    if (summary.cloud && summary.cloud.triggered) {
        hasWarnings = true;
        const { value, unit } = formatter.formatAltitude(summary.cloud.min, profile);
        const { value: limit, unit: limitUnit } = formatter.formatAltitude(rules.minCloud, profile);
        html += `<div style="color: #555; border: 1px solid #555; padding: 5px; margin-bottom: 5px;">
                    <strong>WOLKEN-ALARM</strong><br>
                    Min. Untergrenze: <strong>${value} ${unit}</strong> (Limit: ${limit} ${limitUnit})
                 </div>`;
    }

    // Niederschlag
    if (summary.precip && summary.precip.triggered) {
        hasWarnings = true;
        const { value, unit } = formatter.formatPercent(summary.precip.max, profile);
        const { value: limit, unit: limitUnit } = formatter.formatPercent(rules.maxPrecipProb, profile);
        html += `<div style="color: #000080; border: 1px solid #000080; padding: 5px; margin-bottom: 5px;">
                    <strong>NIEDERSCHLAGS-ALARM</strong><br>
                    Max. Chance: <strong>${value}${unit}</strong> (Limit: ${limit}${limitUnit})
                 </div>`;
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
};


// --- 4. Interne Hilfsfunktionen ---

export const setDashboardMessage = (html) => { uiElements.autoWarnDashboard.innerHTML = html; };
export const setManualMonitorMessage = (html) => { uiElements.manualWarningMonitor.innerHTML = html; };
export const enableSaveButton = () => { uiElements.saveButton.disabled = false; };

export const resetProfileInputs = () => {
    uiElements.profileNameInput.value = '';
    uiElements.saveButton.disabled = true;
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