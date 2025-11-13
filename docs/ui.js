// ui.js (Version 2.0 - Config-Driven)
import * as db from './db.js';
import * as formatter from './formatter.js';
import { formatAltitude_M, formatAltitude_FT, formatWaveHeight, formatSigWx, formatOktas, oktasToPercent, percentToOktas } from './formatter.js';
import { UNITS, CONVERSIONS } from './config.js';
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
export function generateDynamicRuleInputs(isMaritime) {
    const container = document.getElementById('dynamic-rules-container');
    if (!container) {
        console.error("Kritischer Fehler: Container 'dynamic-rules-container' in index.html nicht gefunden!");
        return;
    }

    const unitModeAviation = document.querySelector('input[name="unitMode"][value="aviation"]');
    const mode = (unitModeAviation && unitModeAviation.checked) ? 'aviation' : 'metric';
    const unitConfig = UNITS[mode]; // Holt das { speed: 'kt', altitude: 'ft' } Objekt

    let html = '';
    for (const metric of Object.values(METRICS_CONFIG)) {

        // Wenn der Parameter 'marine_hourly' ist, aber die Area NICHT maritim, überspringe ihn.
        if (metric.paramType === 'marine_hourly' && !isMaritime) {
            continue;
        }

        // Wenn der Parameter 'maritimeOnly' ist, aber die Area NICHT maritim, überspringe ihn.
        if (metric.maritimeOnly === true && !isMaritime) {
            continue;
        }

        // Hole den Standard-Label-Text (z.B. km/h oder %)
        if (metric.checkType === 'min' || metric.checkType === 'max') {
            let initialUnit = 'N/A'; // Sicherer Fallback

            // NEU: Dynamische Zuweisung basierend auf dem Formatter
            if (metric.formatter === formatter.formatSpeed) {
                initialUnit = unitConfig.speed;
            }
            // --- KORREKTUR: Vergleiche mit den direkten Importen ---
            else if (metric.formatter === formatAltitude_FT) {
                initialUnit = unitConfig.altitude; // m oder ft
            }
            else if (metric.formatter === formatAltitude_M) {
                initialUnit = UNITS.metric.altitude; // Immer 'm'
            }
            else if (metric.formatter === formatWaveHeight) {
                initialUnit = unitConfig.altitude; // m oder ft
            }
            // --- ENDE KORREKTUR ---
            else if (metric.formatter === formatter.formatTemp) {
                initialUnit = unitConfig.temp;
            } else if (metric.formatter === formatter.formatPercent) {
                initialUnit = '%';
            } else if (metric.formatter === formatter.formatPrecipMM) {
                initialUnit = 'mm';
            }

            // Erzeuge das HTML für diese Regel
            html += `
            <div class="rule-input-group">
                <label>${metric.displayName}:</label>
                <div class="rule-input-fields">
                    <input type="number" id="${metric.ruleName}_alarm" placeholder="Alarmschwelle" style="padding: 5px; border: 2px solid var(--color-danger);">
                    <input type="number" id="${metric.ruleName}_warn" placeholder="Warnschwelle" style="padding: 5px; border: 2px solid var(--color-warning);">
                    <span id="${metric.uiUnitId}">${initialUnit}</span>
                </div>
            </div>
        `;
        }
        else if (metric.checkType === 'code_match') {
            // --- NEUE Logik für Code-Auswahl (Dropdown) ---

            // Baue die <option> Liste aus der Config
            let optionsHtml = '';
            if (metric.options) {
                for (const [code, taf] of Object.entries(metric.options)) {
                    // Wir ignorieren 'NSW', da es keinen Alarm auslösen soll
                    if (taf !== 'NSW') {
                        optionsHtml += `<option value="${code}">${taf} (${code})</option>`;
                    }
                }
            }

            html += `
                <div class="rule-input-group">
                    <label>${metric.displayName}:</label>
                    <div class="rule-input-fields">
                        <select multiple id="${metric.ruleName}_alarm" size="6" style="padding: 5px; border: 2px solid var(--color-danger);">
                            <option value="" disabled>-- ALARM --</option>
                            ${optionsHtml}
                        </select>
                        <select multiple id="${metric.ruleName}_warn" size="6" style="padding: 5px; border: 2px solid var(--color-warning);">
                            <option value="" disabled>-- WARNUNG --</option>
                            ${optionsHtml}
                        </select>
                        <span id="${metric.uiUnitId}">(WMO)</span>
                    </div>
                    <small style="font-size: 0.8em; color: #6c757d;">(Mehrfachauswahl mit Strg/Cmd + Klick)</small>
                </div>
            `;
        }
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

    uiElements.deleteTemplateButton = document.getElementById('deleteTemplateButton');
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

    uiElements.daySelect = document.getElementById('daySelect');

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

            // --- ENDE VALIDIERUNG ---

            if (!name) {
                alert("Bitte einen Namen für die Vorlage eingeben.");
                return;
            }
            handlers.onSaveTemplate(name, rules); // 3. Erst jetzt speichern
        });
    }

    // 1. Neuen Lade-Button finden (innerhalb initUI, ca. Zeile 136)
    uiElements.loadTemplateButton = document.getElementById('loadTemplateButton');

    // 2. Event-Listener (ca. Zeile 276)

    // Vorlage anwenden (NEUE Logik: per Button-Klick)
    if (uiElements.loadTemplateButton) {
        uiElements.loadTemplateButton.addEventListener('click', () => {
            const templateId = parseInt(uiElements.templateSelect.value, 10);
            if (!templateId) {
                alert("Bitte wählen Sie zuerst eine Vorlage aus der Liste aus.");
                return;
            }
            handlers.onTemplateSelect(templateId); // Löst handleTemplateSelect in main.js aus
        });
    }
    if (uiElements.deleteTemplateButton) {
        uiElements.deleteTemplateButton.addEventListener('click', handlers.onDeleteTemplate);
    }

    // Backup
    if (uiElements.exportButton) uiElements.exportButton.addEventListener('click', handlers.onExport);
    if (uiElements.importButton) uiElements.importButton.addEventListener('click', () => uiElements.importFile.click());
    if (uiElements.importFile) uiElements.importFile.addEventListener('change', (e) => handleFileImport(e, handlers.onImport));

    // Footer-Tabs
    const showAutoTab = document.getElementById('showAutoTab'); // <-- NEU
    const autoContent = uiElements.autoWarnDashboard;           // <-- NEU
    const showMatrixTab = document.getElementById('showMatrixTab');
    const showGraphTab = document.getElementById('showGraphTab');
    const matrixContent = document.getElementById('manualWarningMonitor');
    const graphContent = document.getElementById('graphContainer');
    if (showMatrixTab && showGraphTab && matrixContent && graphContent) {
        showAutoTab.addEventListener('click', () => {
            autoContent.classList.add('active');
            matrixContent.classList.remove('active');
            graphContent.classList.remove('active');

            showAutoTab.classList.add('active');
            showMatrixTab.classList.remove('active');
            showGraphTab.classList.remove('active');
        });
        showMatrixTab.addEventListener('click', () => {
            autoContent.classList.remove('active');
            matrixContent.classList.add('active');
            graphContent.classList.remove('active');

            showAutoTab.classList.remove('active');
            showMatrixTab.classList.add('active');
            showGraphTab.classList.remove('active');
        });
        showGraphTab.addEventListener('click', () => {
            autoContent.classList.remove('active');
            matrixContent.classList.remove('active');
            graphContent.classList.add('active');

            showAutoTab.classList.remove('active');
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
    if (!monitor) return;
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

            let isRuleActive = false;
            if (metric.checkType === 'min' || metric.checkType === 'max') {
                isRuleActive = (r[ruleName + '_alarm'] !== null && r[ruleName + '_alarm'] !== undefined) ||
                    (r[ruleName + '_warn'] !== null && r[ruleName + '_warn'] !== undefined);
            } else if (metric.checkType === 'code_match') {
                // KORREKTUR: Verwende 'r' statt 'rules'
                const hasAlarm = r[metric.ruleName + '_alarm'] !== null &&
                    r[metric.ruleName + '_alarm'] !== undefined &&
                    r[metric.ruleName + '_alarm'].length > 0;
                const hasWarn = r[metric.ruleName + '_warn'] !== null &&
                    r[metric.ruleName + '_warn'] !== undefined &&
                    r[metric.ruleName + '_warn'].length > 0;
                isRuleActive = hasAlarm || hasWarn;
            }

            // Prüfen, ob die Regel im Profil (r) aktiv ist UND ob ein Summary (s) dafür existiert
            if (isRuleActive && s[summaryKey]) {
                const blendedStatus = createBlendedStatus(s, summaryKey);
                // Prüfen, ob für diese Metrik ein Alarm/Warnung vorliegt
                const hours = Object.keys(blendedStatus).sort((a, b) => parseInt(a) - parseInt(b));

                // --- 1. BLOCK: ALARME (rot) ---
                const alarmHours = hours.filter(h => blendedStatus[h] === 'alarm');
                if (alarmHours.length > 0) {
                    // Finde den "schlimmsten" Wert (z.B. höchsten Code) NUR aus den Alarm-Stunden
                    let worstValue = (metric.checkType === 'min') ? Infinity : -Infinity;
                    alarmHours.forEach(h_str => {
                        const h_idx = parseInt(h_str, 10); // Stunde als Index für hourlyData
                        if (h_idx >= s[summaryKey].hourlyData.length) return; // Sicherheitscheck
                        const val = s[summaryKey].hourlyData[h_idx];

                        if (val === null || val === undefined) return;

                        if (metric.checkType === 'min') {
                            if (val < worstValue) worstValue = val;
                        } else { // max oder code_match
                            if (val > worstValue) worstValue = val;
                        }
                    });

                    const { value, unit } = metric.formatter(worstValue, p);
                    const range = getAlarmTimeRange(blendedStatus, 'alarm'); // <-- Neuer Aufruf

                    // Nutze die harte Alarmfarbe (rot)
                    html += `<span style="color: #dc3545;">&#9658; ${metric.displayName} (ALARM: ${value}${unit}): ${range}</span><br>`;
                }

                // --- 2. BLOCK: WARNUNGEN (gelb) ---
                const warnHours = hours.filter(h => blendedStatus[h] === 'warn');
                if (warnHours.length > 0) {
                    let worstValue = (metric.checkType === 'min') ? Infinity : -Infinity;
                    warnHours.forEach(h_str => {
                        const h_idx = parseInt(h_str, 10);
                        if (h_idx >= s[summaryKey].hourlyData.length) return;

                        // --- HIER IST DIE KORREKTUR ---
                        const val = s[summaryKey].hourlyData[h_idx];
                        // --- ENDE KORREKTUR ---

                        if (val === null || val === undefined) return;

                        if (metric.checkType === 'min') {
                            if (val < worstValue) worstValue = val;
                        } else { // max oder code_match
                            if (val > worstValue) worstValue = val;
                        }
                    });

                    const { value, unit } = metric.formatter(worstValue, p);
                    const range = getAlarmTimeRange(blendedStatus, 'warn');

                    html += `<span style="color: #ffc107;">&#9658; ${metric.displayName} (Warnung: ${value}${unit}): ${range}</span><br>`;
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
    // Passe den Text an die neue Schritt-Zählung an
    uiElements.mapStatusText.innerHTML = '⚠️ Bitte zuerst eine Area auf der Karte definieren.';
    uiElements.saveButton.disabled = true;

    // --- NEU: Verstecke den Regel-Container ---
    const rulesContainer = document.getElementById('rules-workflow-container');
    if (rulesContainer) {
        rulesContainer.style.display = 'none';
    }
};

/**
 * Zeigt das Ergebnis einer *manuellen* Prüfung (inkl. Ampel-Tabelle).
 * NEU: Dynamisch basierend auf METRICS_CONFIG
 */
export const displayManualWarning = (profile, summary) => {
    const monitor = uiElements.manualWarningMonitor;
    monitor.innerHTML = '';

    console.log("%c[ui.js] displayManualWarning GESTARTET", "color: blue; font-weight: bold;", { profile, summary });

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

    const activeMetrics = Object.values(METRICS_CONFIG).filter(m =>
        (rules[m.ruleName + '_alarm'] !== null && rules[m.ruleName + '_alarm'] !== undefined) ||
        (rules[m.ruleName + '_warn'] !== null && rules[m.ruleName + '_warn'] !== undefined) ||
        // (Sicherstellen, dass sigWx auch hier geprüft wird)
        (m.checkType === 'code_match' &&
            ((rules[m.ruleName + '_alarm'] !== null && rules[m.ruleName + '_alarm'] !== undefined && rules[m.ruleName + '_alarm'].length > 0) ||
                (rules[m.ruleName + '_warn'] !== null && rules[m.ruleName + '_warn'] !== undefined && rules[m.ruleName + '_warn'].length > 0))
        )
    );

    console.log("[ui.js] Gefilterte 'activeMetrics':", activeMetrics);

    if (activeMetrics.length === 0) {
        console.warn("[ui.js] ABBRUCH: 'activeMetrics' ist leer. Es sind keine Regeln aktiv.");

        return; // Nichts zu tun, wenn keine Regeln aktiv sind
    }
    const firstMetricKey = activeMetrics[0].summaryKey;
    console.log("[ui.js] 'firstMetricKey' (für Stunden-Header):", firstMetricKey);
    console.log("[ui.js] Abfrage-Objekt für Stunden:", summary[firstMetricKey]?.hourlyStatus);
    const hours = (summary[firstMetricKey] && summary[firstMetricKey].hourlyStatus)
        ? Object.keys(summary[firstMetricKey].hourlyStatus).sort((a, b) => parseInt(a) - parseInt(b))
        : [];
    console.log("[ui.js] Berechnetes 'hours'-Array:", hours);

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
        for (const metric of Object.values(METRICS_CONFIG)) { // ALT: activeMetrics
            const ruleName = metric.ruleName;

            let isRuleActive = false;
            if (metric.checkType === 'min' || metric.checkType === 'max') {
                isRuleActive = (rules[ruleName + '_alarm'] !== null && rules[ruleName + '_alarm'] !== undefined) ||
                    (rules[ruleName + '_warn'] !== null && rules[ruleName + '_warn'] !== undefined);
            }
            // DIESER BLOCK IST ENTSCHEIDEND:
            else if (metric.checkType === 'code_match') {
                // KORREKTUR: Prüfe die _alarm und _warn Arrays
                const hasAlarm = rules[ruleName + '_alarm'] !== null &&
                    rules[ruleName + '_alarm'] !== undefined &&
                    rules[ruleName + '_alarm'].length > 0;
                const hasWarn = rules[ruleName + '_warn'] !== null &&
                    rules[ruleName + '_warn'] !== undefined &&
                    rules[ruleName + '_warn'].length > 0;
                isRuleActive = hasAlarm || hasWarn;
            }

            // Zeile nur bauen, wenn Regel im Profil aktiv ist
            if (isRuleActive) {
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

        // "Laden & Prüfen"-Button
        const testButton = document.createElement('button');
        testButton.textContent = 'Laden & Prüfen';
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

        if (metric.checkType === 'min' || metric.checkType === 'max') {

            // 0. Finde die ZWEI neuen Input-Felder
            const elem_alarm = document.getElementById(metric.ruleName + '_alarm');
            const elem_warn = document.getElementById(metric.ruleName + '_warn');

            // 1. Lese den gespeicherten *metrischen* Wert (z.B. 22.2 km/h)
            const value_alarm = rules[metric.ruleName + '_alarm'];
            const value_warn = rules[metric.ruleName + '_warn'];

            // 2. Konvertiere ihn zurück in den "Display"-Wert (z.B. 12 kt)
            // (Das 'rules'-Objekt enthält den 'unitMode')
            const display_alarm = fromMetric(value_alarm, metric, rules.unitMode);
            const display_warn = fromMetric(value_warn, metric, rules.unitMode);

            // 3. Zeige den "Display"-Wert an
            if (elem_alarm) {
                elem_alarm.value = (display_alarm !== null && display_alarm !== undefined) ? display_alarm : '';
            }
            if (elem_warn) {
                elem_warn.value = (display_warn !== null && display_warn !== undefined) ? display_warn : '';
            }
        }
        else if (metric.checkType === 'code_match') {
            // --- NEUE Logik (Setzt ZWEI Dropdowns) ---
            const selectElement_alarm = document.getElementById(metric.ruleName + '_alarm');
            const selectElement_warn = document.getElementById(metric.ruleName + '_warn');
            const savedValues_alarm = rules[metric.ruleName + '_alarm']; // z.B. ['48']
            const savedValues_warn = rules[metric.ruleName + '_warn'];  // z.B. ['45']

            // Helper-Funktion zum Setzen der Auswahl
            const setSelection = (element, values) => {
                if (element && values) {
                    Array.from(element.options).forEach(option => {
                        option.selected = values.includes(option.value);
                    });
                } else if (element) {
                    element.selectedIndex = -1;
                }
            };

            setSelection(selectElement_alarm, savedValues_alarm);
            setSelection(selectElement_warn, savedValues_warn);
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

export const setDashboardMessage = (html) => {
    if (uiElements.autoWarnDashboard) {
        uiElements.autoWarnDashboard.innerHTML = html;
    }
};
export const setManualMonitorMessage = (html) => {
    if (uiElements.manualWarningMonitor) {
        uiElements.manualWarningMonitor.innerHTML = html;
    }
};

export const enableSaveButton = () => {
    uiElements.mapStatusContainer.style.borderColor = 'var(--color-success)';
    uiElements.mapStatusContainer.style.backgroundColor = '#d4edda';
    // Passe den Text an die neue Schritt-Zählung an
    uiElements.mapStatusText.innerHTML = '✅ **Schritt 1 abgeschlossen:** Area ist bereit.';
    uiElements.saveButton.disabled = false;
};

export const resetProfileInputs = () => {
    uiElements.profileNameInput.value = '';

    // --- KORREKTUR ---
    // Lösche die dynamischen _alarm und _warn Input-Felder
    for (const metric of Object.values(METRICS_CONFIG)) {
        if (metric.checkType === 'min' || metric.checkType === 'max') {

            const elem_alarm = document.getElementById(metric.ruleName + '_alarm');
            const elem_warn = document.getElementById(metric.ruleName + '_warn');
            if (elem_alarm) elem_alarm.value = '';
            if (elem_warn) elem_warn.value = '';
        }
        else if (metric.checkType === 'code_match') {
            // --- NEUE Logik (Reset ZWEI Dropdowns) ---
            const selectElement_alarm = document.getElementById(metric.ruleName + '_alarm');
            const selectElement_warn = document.getElementById(metric.ruleName + '_warn');
            if (selectElement_alarm) selectElement_alarm.selectedIndex = -1;
            if (selectElement_warn) selectElement_warn.selectedIndex = -1;
        }
    }
    initMapStatusPlaceholder();
};

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
        if (metric.checkType === 'min' || metric.checkType === 'max') {

            // Finde die ZWEI neuen Input-Felder
            const elem_alarm = document.getElementById(metric.ruleName + '_alarm');
            const elem_warn = document.getElementById(metric.ruleName + '_warn');

            // Lese die Rohwerte (oder leer, falls nicht gefunden)
            const rawVal_alarm = elem_alarm ? elem_alarm.value : "";
            const rawVal_warn = elem_warn ? elem_warn.value : "";

            // Verarbeite die Werte: "" wird null, Text wird Zahl
            // (Wir nutzen parseFloat, damit auch 0 als Wert gespeichert wird)

            const parsed_alarm = parseFloat(rawVal_alarm);
            const parsed_warn = parseFloat(rawVal_warn);

            // Konvertiere beide Werte zuerst (WICHTIG für den Vergleich)
            const metric_alarm = isNaN(parsed_alarm) ? null : toMetric(parsed_alarm, metric, unitMode);
            const metric_warn = isNaN(parsed_warn) ? null : toMetric(parsed_warn, metric, unitMode);

            rules[metric.ruleName + '_alarm'] = metric_alarm;
            rules[metric.ruleName + '_warn'] = metric_warn;

            // --- NEU: DYNAMISCHE CHECK-TYP ERKENNUNG ---
            let dynamicCheckType = null;
            if (metric_alarm !== null && metric_warn !== null) {
                // Der Nutzer hat BEIDE Schwellen gesetzt
                if (metric_alarm > metric_warn) {
                    dynamicCheckType = 'max'; // Hitzewarnung / Starkwind
                } else if (metric_alarm < metric_warn) {
                    dynamicCheckType = 'min'; // Kältewarnung / "Glassy Sea"
                }
            }
            // (Wenn nur ein Wert gesetzt ist oder sie gleich sind, 
            // verwenden wir den 'dynamicCheckType = null')

            // Speichere den erkannten Typ (oder null) im Profil
            rules[metric.ruleName + '_checkType'] = dynamicCheckType;
        }
        else if (metric.checkType === 'code_match') {
            // --- NEUE Logik (Liest ZWEI Dropdowns) ---
            const selectElement_alarm = document.getElementById(metric.ruleName + '_alarm');
            const selectElement_warn = document.getElementById(metric.ruleName + '_warn');

            if (selectElement_alarm) {
                const selectedValues_alarm = Array.from(selectElement_alarm.selectedOptions)
                    .map(option => option.value)
                    .filter(value => value); // Entfernt leere "disabled" Werte
                rules[metric.ruleName + '_alarm'] = selectedValues_alarm.length > 0 ? selectedValues_alarm : null;
            }
            if (selectElement_warn) {
                const selectedValues_warn = Array.from(selectElement_warn.selectedOptions)
                    .map(option => option.value)
                    .filter(value => value); // Entfernt leere "disabled" Werte
                rules[metric.ruleName + '_warn'] = selectedValues_warn.length > 0 ? selectedValues_warn : null;
            }
        }
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
 * Sperrt oder entsperrt alle "Laden & Prüfen"-Knöpfe.
 * (Unverändert)
 */
function setProfileButtonsDisabled(disabled) {
    const buttons = document.querySelectorAll('.check-profile-button');
    buttons.forEach(button => {
        button.disabled = disabled;
        button.textContent = disabled ? 'Prüfe...' : 'Laden & Prüfen';
    });
}

/**
 * Aktualisiert die Labels (km/h, kt, m, ft) neben den Input-Feldern.
 * NEU: Dynamisch, liest den Formatter-Typ aus der Config.
 */
function updateRuleInputLabels() {
    const mode = uiElements.unitModeAviation.checked ? 'aviation' : 'metric';
    const unitConfig = UNITS[mode]; // { speed: 'kt', altitude: 'ft', temp: '°C' }

    for (const metric of Object.values(METRICS_CONFIG)) {
        const span = document.getElementById(metric.uiUnitId);
        if (!span) continue;

        let unit = 'N/A'; // Fallback

        // Leite die Einheit aus der zugewiesenen Formatierungsfunktion ab
        if (metric.formatter === formatter.formatSpeed) {
            unit = unitConfig.speed; // km/h oder kt
        }
        // --- KORREKTUR: Vergleiche mit den direkten Importen ---
        else if (metric.formatter === formatAltitude_FT) {
            unit = unitConfig.altitude; // m oder ft (für CloudBase)
        }
        else if (metric.formatter === formatAltitude_M) {
            unit = UNITS.metric.altitude; // Bleibt immer 'm' (für Vis, Snow)
        }
        else if (metric.formatter === formatWaveHeight) {
            unit = unitConfig.altitude; // m oder ft (für Wellen)
        }
        else if (metric.formatter === formatSigWx) {
            unit = '(WMO)'; // Bleibt immer (WMO)
        }
        else if (metric.formatter === formatOktas) {
            unit = 'Achtel';
        }
        // --- ENDE KORREKTUR ---
        else if (metric.formatter === formatter.formatTemp) {
            unit = unitConfig.temp; // °C
        } else if (metric.formatter === formatter.formatPercent) {
            unit = '%'; // %
        } else if (metric.formatter === formatter.formatPrecipMM) {
            unit = 'mm'; // mm
        }

        span.textContent = unit;
    }
}


/**
 * Berechnet die konsolidierte Zeitspanne, in der ein Alarm aktiv ist.
 * (Unverändert)
 */
function getAlarmTimeRange(hourlyStatus, specificStatus) { // <-- 1. Parameter hinzugefügt
    if (!hourlyStatus) return 'N/A';
    const hours = Object.keys(hourlyStatus).sort((a, b) => parseInt(a) - parseInt(b)).map(h => parseInt(h));
    // 2. Filter auf den spezifischen Status angepasst:
    const alarmHours = hours.filter(h => hourlyStatus[h] === specificStatus);
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
    const activeMetrics = Object.values(METRICS_CONFIG).filter(m =>
        (rules[m.ruleName + '_alarm'] !== null && rules[m.ruleName + '_alarm'] !== undefined) ||
        (rules[m.ruleName + '_warn'] !== null && rules[m.ruleName + '_warn'] !== undefined)
    );

    if (activeMetrics.length === 0) {
        return combinedStatus; // (bleibt leer, was korrekt ist)
    }
    const firstMetricKey = activeMetrics[0].summaryKey;

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
                (rules[ruleName + '_warn'] !== null && rules[ruleName + '_warn'] !== undefined)) && summary[summaryKey]) {
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
    if (!uiElements.accordions || uiElements.accordions.length < 2) return;

    const editorHeader = uiElements.accordions[0]; if (editorHeader) {
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

/**
 * NEU: Erzwingt die Aktivierung des "Detail-Prüfung" (Matrix)-Tabs.
 * Wird von main.js aufgerufen, wenn 'handleManualCheck' startet.
 */
export const activateManualMonitorTab = () => {
    // Finde die Elemente (nur die, die wir brauchen)
    const showAutoTab = document.getElementById('showAutoTab');
    const autoContent = document.getElementById('autoWarnDashboard');
    const showMatrixTab = document.getElementById('showMatrixTab');
    const matrixContent = document.getElementById('manualWarningMonitor');
    const showGraphTab = document.getElementById('showGraphTab');
    const graphContent = document.getElementById('graphContainer'); // <-- DIESE ZEILE HINZUFÜGEN

    // Inhalte umschalten
    if (autoContent) autoContent.classList.remove('active');
    if (matrixContent) matrixContent.classList.add('active');
    if (graphContent) graphContent.classList.remove('active'); // <-- DIESE ZEILE HINZUFÜGEN

    // Tabs umschalten
    if (showAutoTab) showAutoTab.classList.remove('active');
    if (showMatrixTab) showMatrixTab.classList.add('active');
    if (showGraphTab) showGraphTab.classList.remove('active');
};

/**
 * Konvertiert einen "Display"-Wert (z.B. 12 kt) in den "Engine"-Wert (z.B. 22.2 km/h)
 * (Wird VOR dem Speichern genutzt)
 */
function toMetric(displayValue, metricConfig, unitMode) {
    if (displayValue === null || isNaN(displayValue) || unitMode === 'metric') {
        return displayValue; // Ist schon metrisch oder null
    }

    // (Aviation Mode)
    if (metricConfig.formatter === formatter.formatSpeed) {
        // Von kt -> km/h
        return displayValue / CONVERSIONS.KMH_TO_KTS;
    }
    if (metricConfig.formatter === formatOktas) {
        // Konvertiere Achtel (z.B. 4) in Prozent (z.B. 50)
        return oktasToPercent(displayValue);
    }

    // --- KORREKTUR HIER ---
    // ALT: if (metricConfig.formatter === formatter.formatAltitude) {
    // NEU: Wir prüfen auf die ECHTEN importierten Formatierer
    if (metricConfig.formatter === formatAltitude_FT ||
        metricConfig.formatter === formatWaveHeight) {
        // Von ft -> m
        return displayValue / CONVERSIONS.METER_TO_FEET;
    }
    // --- ENDE KORREKTUR ---

    return displayValue; // (z.B. Temp, Percent)
}

/**
 * Konvertiert einen "Engine"-Wert (z.B. 22.2 km/h) in den "Display"-Wert (z.B. 12 kt)
 * (Wird VOR dem Anzeigen genutzt)
 */
function fromMetric(metricValue, metricConfig, unitMode) {
    if (metricValue === null || isNaN(metricValue) || unitMode === 'metric') {
        return metricValue; // Ist schon metrisch oder null
    }

    // (Aviation Mode)
    if (metricConfig.formatter === formatter.formatSpeed) {
        // Von km/h -> kt (und runden, wie der Formatter es tun würde)
        const val = metricValue * CONVERSIONS.KMH_TO_KTS;
        return Math.round(val);
    }
    if (metricConfig.formatter === formatOktas) {
        // Konvertiere Prozent (z.B. 50) in Achtel (z.B. 4)
        return percentToOktas(metricValue);
    }

    // NEU: Fall 1: Wolkenuntergrenze (m -> ft, runden auf 100)
    // (nutzt formatAltitude_FT)
    if (metricConfig.formatter === formatAltitude_FT) {
        const val = metricValue * CONVERSIONS.METER_TO_FEET;
        // Rundet auf die nächsten 100ft, wie es der Formatter tut
        return Math.round(val / 100) * 100;
    }

    // NEU: Fall 2: Wellenhöhe (m -> ft, runden auf 0.1)
    // (nutzt formatWaveHeight)
    if (metricConfig.formatter === formatWaveHeight) {
        const val = metricValue * CONVERSIONS.METER_TO_FEET;
        // Rundet auf eine Dezimalstelle (der formatter.js macht toFixed(1))
        return Math.round(val * 10) / 10;
    }
    // --- ENDE KORREKTUR ---

    return metricValue; // (z.B. Temp, Percent)
}

export const clearTemplateNameInput = () => {
    if (uiElements.templateNameInput) {
        uiElements.templateNameInput.value = '';
    }
};

/**
 * NEU: Löst den Download einer JSON-Datei für den Export aus.
 * (Behebt den Absturz in main.js)
 */
export const triggerExportDownload = (dataToExport, suggestedFileName) => {
    try {
        // 1. Daten in einen "schön lesbaren" JSON-String umwandeln
        const jsonString = JSON.stringify(dataToExport, null, 2);

        // 2. Einen "Blob" (quasi eine Datei im Speicher) erstellen
        const blob = new Blob([jsonString], { type: 'application/json' });

        // 3. Temporären Link im Browser erstellen
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        a.href = url;
        a.download = suggestedFileName || 'idsse-m-profile-export.json';

        // 4. Download auslösen (simulierter Klick)
        document.body.appendChild(a); // Link muss im DOM sein
        a.click();

        // 5. Aufräumen
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (err) {
        console.error("Fehler beim Erstellen des Export-Downloads:", err);
        alert("Fehler beim Erstellen der Export-Datei.");
    }
};