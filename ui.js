// ui.js
import * as db from './db.js'; // Wird für Callbacks benötigt

// --- 1. UI-Elemente holen ---
// (Wir exportieren sie, falls main.js sie braucht)
export const uiElements = {
    // Monitore
    autoWarnDashboard: document.getElementById('autoWarnDashboard'),
    manualWarningMonitor: document.getElementById('manualWarningMonitor'),

    // Profil-Liste
    profileList: document.getElementById('profileList'),

    // Profil-Inputs
    profileNameInput: document.getElementById('profileName'),
    saveButton: document.getElementById('saveButton'),
    ruleInputs: {
        maxWind: document.getElementById('maxWind'),
        minTemp: document.getElementById('minTemp'),
        minVis: document.getElementById('minVis'),
        minCloud: document.getElementById('minCloud'),
        maxPrecipProb: document.getElementById('maxPrecipProb')
    },

    // Vorlagen-Inputs
    templateNameInput: document.getElementById('templateName'),
    saveTemplateButton: document.getElementById('saveTemplateButton'),
    templateSelect: document.getElementById('templateSelect'),

    // Backup-Buttons
    exportButton: document.getElementById('exportButton'),
    importButton: document.getElementById('importButton'),
    importFile: document.getElementById('importFile'),

    // Auto-Check
    runAutoCheckButton: document.getElementById('runAutoCheckButton'),

    // Akkordeon
    accordions: document.querySelectorAll('.accordion-header')
};


// --- 2. Initialisierungs-Funktion ---

/**
 * Hängt alle Event-Listener an die UI-Elemente.
 * 'handlers' ist ein Objekt mit Callback-Funktionen von main.js
 */
export const initUI = (handlers) => {

    // Akkordeon
    const accordions = document.querySelectorAll('.accordion-header');

    accordions.forEach(acc => {
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
        html += `<div class="alarm-item" data-profile-id="${p.id}" style="border-bottom: 1px solid #ccc; padding: 5px; margin-bottom: 5px; cursor: pointer;">
                    <strong>Profil: ${p.name}</strong><br>`;
        if (s.wind && s.wind.triggered) html += `<span style="color: red;">&#9658; Wind: ${s.wind.max.toFixed(1)} km/h</span><br>`;
        if (s.temp && s.temp.triggered) html += `<span style="color: blue;">&#9658; Temp: ${s.temp.min.toFixed(1)} °C</span><br>`;
        if (s.vis && s.vis.triggered) html += `<span style="color: #8B4513;">&#9658; Sicht: ${s.vis.min.toFixed(0)} m</span><br>`;
        if (s.cloud && s.cloud.triggered) html += `<span style="color: #555;">&#9658; Wolken: ${s.cloud.min.toFixed(0)} m</span><br>`;
        if (s.precip && s.precip.triggered) html += `<span style="color: #000080;">&#9658; Niederschl.: ${s.precip.max.toFixed(0)}%</span><br>`;
        if (s.error) html += `<span style="color: magenta;">&#9658; FEHLER: ${s.error}</span><br>`;
        html += `</div>`;
    });
    monitor.innerHTML = html;
};

/**
 * Zeigt das Ergebnis einer *manuellen* Prüfung (inkl. Ampel-Tabelle).
 */
export const displayManualWarning = (profile, summary) => {
    const monitor = uiElements.manualWarningMonitor;
    monitor.innerHTML = '';

    if (!summary || !profile || !profile.rules) {
        monitor.innerHTML = `<p>Fehler beim Laden der Daten.</p>`;
        if (!summary) monitor.innerHTML = `<p>${profile}</p>`;
        return;
    }

    let html = `<h4>Prüfbericht für: ${profile.name}</h4>`;
    let hasWarnings = false;
    const rules = profile.rules;

    // Text-Zusammenfassung
    if (summary.error) {
        html += `<div style="color: magenta; ..."><strong>SYSTEM-FEHLER</strong><br>${summary.error}</div>`;
        hasWarnings = true;
    }
    // (Hier die Text-Zusammenfassungen für wind, temp etc. einfügen)
    // ...

    if (!hasWarnings && Object.keys(rules).length > 0) {
        html = `<h4>Prüfbericht für: ${profile.name}</h4><p style="color: green; font-weight: bold;">Alle Parameter im grünen Bereich.</p>`;
    }

    // Ampel-Matrix
    const buildRow = (paramName, statusObject) => {
        let rowHtml = `<tr><td><strong>${paramName}</strong></td>`;
        const hours = Object.keys(statusObject).sort((a, b) => a - b);
        hours.forEach(hour => {
            const status = statusObject[hour];
            rowHtml += `<td class="status-${status}"></td>`;
        });
        rowHtml += `</tr>`;
        return rowHtml;
    };

    let tableHtml = `<table class="ampel-table"><thead><tr><th>Parameter</th>`;
    const hours = Object.keys(summary.wind.hourlyStatus).sort((a, b) => a - b);
    hours.forEach(hour => tableHtml += `<th>${hour}h</th>`);
    tableHtml += `</tr></thead><tbody>`;

    if (rules.maxWind) tableHtml += buildRow('Wind (Böe)', summary.wind.hourlyStatus);
    if (rules.minTemp !== null) tableHtml += buildRow('Temp (2m)', summary.temp.hourlyStatus);
    if (rules.minVis) tableHtml += buildRow('Sicht', summary.vis.hourlyStatus);
    if (rules.minCloud) tableHtml += buildRow('Wolken (UG)', summary.cloud.hourlyStatus);
    if (rules.maxPrecipProb !== null) tableHtml += buildRow('Niederschl.', summary.precip.hourlyStatus);

    tableHtml += `</tbody></table>`;
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
    return {
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