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

       // --- KORREKTUR: DOM-Elemente hier suchen, NACHDEM die Seite geladen ist ---
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
    uiElements.demoModeCheckbox = document.getElementById('demoModeCheckbox'); // <-- Wird jetzt gefunden!
    
    // NEU: Einheiten-Umschalter
    uiElements.unitModeMetric = document.querySelector('input[name="unitMode"][value="metric"]');
    uiElements.unitModeAviation = document.querySelector('input[name="unitMode"][value="aviation"]');
    // --- ENDE KORREKTUR ---

    // Akkordeon
    uiElements.accordions.forEach(acc => {
        acc.addEventListener('click', function () {
            const panel = this.nextElementSibling; // Das Panel

            // Ist dieses Panel schon offen?
            const isOpen = panel.classList.contains('open');

            // 1. Alle Panels und Header schließen/deaktivieren
            accordions.forEach(otherAcc => {
                otherAcc.classList.remove('active');
                otherAcc.nextElementSibling.classList.remove('open');
            });

            // 2. Nur das geklickte Panel öffnen (WENN es vorher zu war)
            if (!isOpen) {
                this.classList.add('active');
                panel.classList.add('open');
            }
            // (Wenn es offen war, wurde es durch Schritt 1 bereits geschlossen)
        });
    });

    // Auto-Check
    uiElements.runAutoCheckButton.addEventListener('click', handlers.onRunAutoCheck);

    // Klick auf Alarm im Auto-Dashboard
    uiElements.autoWarnDashboard.addEventListener('click', async (e) => {
        const alarmItem = e.target.closest('.alarm-item');
        if (alarmItem) {
            const profileId = parseInt(alarmItem.dataset.profileId);
            if (!profileId) return;

            const profile = await db.getProfile(profileId);
            if (!profile) return;

            // Aufbereiten für den Handler
            const profileData = {
                id: profile.id,
                name: profile.name,
                rules: profile.rules,
                geojson: JSON.parse(profile.geojsonString)
            };
            handlers.onDashboardClick(profileData);
        }
    });

    // Profil speichern
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

    // Vorlage speichern
    uiElements.saveTemplateButton.addEventListener('click', () => {
        const name = uiElements.templateNameInput.value;
        const rules = getRulesFromInputs();
        if (!name) {
            alert("Bitte einen Namen für die Vorlage eingeben.");
            return;
        }
        handlers.onSaveTemplate(name, rules);
    });

    // Vorlage anwenden
    uiElements.templateSelect.addEventListener('change', () => {
        const templateId = parseInt(uiElements.templateSelect.value);
        if (!templateId) return;
        handlers.onTemplateSelect(templateId);
    });

    // Backup
    uiElements.exportButton.addEventListener('click', handlers.onExport);
    uiElements.importButton.addEventListener('click', () => uiElements.importFile.click());
    uiElements.importFile.addEventListener('change', (e) => handleFileImport(e, handlers.onImport));
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
        }        if (s.error) html += `<span style="color: magenta;">&#9658; FEHLER: ${s.error}</span><br>`;
        html += `</div>`;
    });
    monitor.innerHTML = html;
};

/**
 * Zeigt das Ergebnis einer *manuellen* Prüfung (inkl. Ampel-Tabelle).
 * (Version 2.3: Robuster Render-Pfad)
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

    // --- 2. Text-Zusammenfassung ---
    let html = `<h4>Prüfbericht für: ${profile.name}</h4>`;
    let hasWarnings = false;
    const rules = profile.rules;

    // (Dieser ganze Block ist super, den lassen wir 1:1 wie er war)
    if (summary.error) {
        html += `<div style="color: magenta; ..."><strong>SYSTEM-FEHLER</strong><br>${summary.error}</div>`;
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
    } // Die "else if" wurde gelöscht

    // Temperatur
    if (summary.temp && summary.temp.triggered) {
        hasWarnings = true;
        html += `<div style="color: blue; border: 1px solid red; padding: 5px; margin-bottom: 5px;">
                    <strong>TEMPERATUR-ALARM</strong><br>
                    Min. Temp: <strong>${value} ${unit}</strong> (Limit: ${limit} ${limitUnit})
                 </div>`;
    } // Die "else if" wurde gelöscht

    // Sichtweite
    if (summary.vis && summary.vis.triggered) {
        hasWarnings = true;
        html += `<div style="color: #8B4513; border: 1px solid red; padding: 5px; margin-bottom: 5px;">
                    <strong>SICHT-ALARM</strong><br>
                    Min. Sicht: <strong>${value} ${unit}</strong> (Limit: ${limit} ${limitUnit})
                 </div>`;
    } // Die "else if" wurde gelöscht

    // Wolkenuntergrenze
    if (summary.cloud && summary.cloud.triggered) {
        hasWarnings = true;
        html += `<div style="color: #555; border: 1px solid red; padding: 5px; margin-bottom: 5px;">
                    <strong>WOLKEN-ALARM</strong><br>
                    Min. Untergrenze: <strong>${value} ${unit}</strong> (Limit: ${limit} ${limitUnit})
                 </div>`;
    } // Die "else if" wurde gelöscht

    // Niederschlag
    if (summary.precip && summary.precip.triggered) {
        hasWarnings = true;
        html += `<div style="color: #000080; border: 1px solid red; padding: 5px; margin-bottom: 5px;">
                    <strong>NIEDERSCHLAGS-ALARM</strong><br>
                    Max. Chance: <strong>${value}${unit}</strong> (Limit: ${limit}${limitUnit})
                 </div>`;
    } // Die "else if" wurde gelöscht

    // --- 3. "Alle OK"-Text ---
    // (Dieser Block bleibt unverändert und funktioniert jetzt korrekt)
    if (!hasWarnings && Object.keys(rules).length > 0) {
        html = `<h4>Prüfbericht für: ${profile.name}</h4><p style="color: green; ...">Alle Parameter im grünen Bereich.</p>`;
    }

    // --- 4. Ampel-Matrix (Der ROBUSTE Ansatz) ---

    let tableHtml = ""; // Starte mit einer leeren Tabelle

    const buildRow = (paramName, statusObject, hoursArray, cssClass = '') => {
        // 'cssClass' ist neu, mit '' als Standard
        let rowHtml = `<tr class="${cssClass}"><td><strong>${paramName.replace(/\*\*/g, '')}</strong></td>`; // .replace entfernt die **

        hoursArray.forEach(hour => {
            const status = statusObject[hour] || 'ok';
            rowHtml += `<td class="status-${status}"></td>`;
        });
        rowHtml += `</tr>`;
        return rowHtml;
    };

    // Hol die Stunden (WENN sie existieren)
    const hours = (summary.wind && summary.wind.hourlyStatus)
        ? Object.keys(summary.wind.hourlyStatus).sort((a, b) => parseInt(a) - parseInt(b))
        : [];

    // Baue die Tabelle NUR, WENN wir Stunden haben
    if (hours.length > 0) {
        tableHtml = `<table class="ampel-table"><thead><tr><th>Parameter</th>`;
        hours.forEach(hour => tableHtml += `<th>${hour}h</th>`);
        tableHtml += `</tr></thead><tbody>`;

        // Fügt die "Gesamt"-Zeile als erste Zeile in den Body ein
        tableHtml += buildRow('**Gesamt-Status**', summary.combined.hourlyStatus, hours, 'summary-row');

        if (rules.maxWind) tableHtml += buildRow('Wind (Böe)', summary.wind.hourlyStatus, hours);
        if (rules.minTemp !== null) tableHtml += buildRow('Temp (2m)', summary.temp.hourlyStatus, hours);
        if (rules.minVis) tableHtml += buildRow('Sicht', summary.vis.hourlyStatus, hours);
        if (rules.minCloud) tableHtml += buildRow('Wolken (UG)', summary.cloud.hourlyStatus, hours);
        if (rules.maxPrecipProb !== null) tableHtml += buildRow('Niederschl.', summary.precip.hourlyStatus, hours);

        tableHtml += `</tbody></table>`;
    }

    // --- 5. Alles rendern (Der KORRIGIERTE Teil) ---
    // Setze IMMER den Text, und füge die (eventuell leere) Tabelle hinzu.
    monitor.innerHTML = html + tableHtml;
};

/**
 * Baut die Profil-Liste in der Sidebar auf.
 */
export const displayProfileList = (profiles, handlers) => {
    uiElements.profileList.innerHTML = '';
    profiles.forEach(profile => {
        const li = document.createElement('li');
        li.textContent = `${profile.name}`;

        // Prüfen-Button
        const testButton = document.createElement('button');
        testButton.textContent = 'Prüfen & Laden';
        testButton.style.marginLeft = '10px';
        testButton.onclick = () => {
            const profileData = {
                id: profile.id,
                name: profile.name,
                rules: profile.rules,
                geojson: JSON.parse(profile.geojsonString)
            };
            handlers.onCheck(profileData);
        };
        li.appendChild(testButton);

        // Löschen-Button
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