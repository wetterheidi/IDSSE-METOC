import { WEATHER_MODELS, API_URLS } from './config.js';

// --- 1. Interne Helfer (portiert aus DZMaster/core/utils.js) ---

/**
 * Wandelt einen ISO-String (oder Date-Objekt) in "HH:MM" um.
 */
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * NEU: Wandelt einen ISO-String (oder Date-Objekt) in "TT.MM." um.
 */
function formatDate(timestamp) {
    const date = new Date(timestamp);
    const day = date.getUTCDate().toString().padStart(2, '0');
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${year}-${month}-${day} `;
}

/**
 * Berechnet die letzten 4 Modell-Laufzeiten (00, 06, 12, 18 UTC)
 */
function calculateModelRunTimes() {
    const now = new Date();
    const currentHour = now.getUTCHours();
    let latestRunHour;

    // Finde die letzte abgeschlossene 6-Stunden-Laufzeit
    // (Mit 3-4 Stunden Puffer für den Lauf)
    if (currentHour >= 22) latestRunHour = 18;
    else if (currentHour >= 16) latestRunHour = 12;
    else if (currentHour >= 10) latestRunHour = 6;
    else if (currentHour >= 4) latestRunHour = 0;
    else {
        // Wir sind vor 4 Uhr UTC, der 00-Lauf ist noch nicht fertig
        // Nimm den 18-Uhr-Lauf vom Vortag
        latestRunHour = 18;
        now.setUTCDate(now.getUTCDate() - 1); // Gehe einen Tag zurück
    }

    const runTimes = [];
    for (let i = 0; i < 4; i++) {
        const runHour = (latestRunHour - (i * 6) + 24) % 24; // Gehe in 6h-Schritten zurück
        const runDate = new Date(now);
        if (latestRunHour - (i * 6) < 0) {
            runDate.setUTCDate(runDate.getUTCDate() - 1); // Vortag
        }
        runDate.setUTCHours(runHour, 0, 0, 0);

        runTimes.push({
            iso: runDate.toISOString(),
            label: `${formatTime(runDate)}Z`
        });
    }
    return runTimes;
}


// --- 2. Interne DOM-Elemente (spezifisch für den Slider) ---
// Wir suchen diese Elemente erst, wenn init() aufgerufen wird.
let dom = {};
let currentRunTimeISO = null;
let lastModelRun = "N/A (No data)";

// --- 3. Interne Display-Logik (portiert aus DZMaster/displayManager.js) ---

/**
 * Aktualisiert die "03h", "06h" Labels unter dem Slider.
 */
function updateSliderLabels(maxHours) {
    dom.sliderLabels.innerHTML = '';
    const numLabels = Math.floor(maxHours / 3); // Alle 3 Stunden ein Label
    for (let i = 0; i <= numLabels; i++) {
        const hour = i * 3;
        const percent = (hour / maxHours) * 100;

        const label = document.createElement('span');
        label.className = 'slider-label';
        label.style.left = `${percent}%`;
        label.textContent = `${hour.toString().padStart(2, '0')}h`;
        dom.sliderLabels.appendChild(label);
    }
    dom.timeSlider.max = maxHours;
}

/**
 * Aktualisiert die Zeitanzeige (z.B. "14:00")
 */
function updateSelectedTime(hour) {

    let startDate;

    // 1. Hole den ISO-String (z.B. '2025-11-02T09:00:00.000Z') oder 'latest'.
    const referenceISO = currentRunTimeISO;

    // --- NEUE KERN-LOGIK: Der Forecast startet immer bei 00:00Z ---
    if (referenceISO && referenceISO !== 'latest') {
        // Bei einem festen Modell-Lauf (z.B. 09:00Z): 
        // Wir nehmen das Datum des Laufs, da der 24h-Forecast (00Z-23Z) in der API
        // immer auf diesen Tag referenziert. Die Zeit des Laufs (09:00Z) wird ignoriert.
        const runDate = new Date(referenceISO);

        // Erstellt ein neues Date-Objekt mit dem Datum des Laufs, aber Zeit 00:00:00.000 UTC
        startDate = new Date(Date.UTC(
            runDate.getUTCFullYear(),
            runDate.getUTCMonth(),
            runDate.getUTCDate(),
            0, 0, 0 // <-- WICHTIG: Setze auf 00Z (Index 0)
        ));

    } else {
        // Fallback für den Initialzustand oder 'auto' / 'latest'.
        // Der sicherste Startpunkt für den Forecast ist heute 00:00Z.
        startDate = new Date();
        startDate.setUTCHours(0, 0, 0, 0);
    }

    // 2. Die Stunde hinzufügen (UTC-basiert)
    // Wir klonen das Datum und addieren die Stunden.
    const selectedDate = new Date(startDate.getTime());
    selectedDate.setUTCHours(selectedDate.getUTCHours() + hour);

    // 3. Formatierung
    const dateStr = formatDate(selectedDate); // YYYY-MM-DD
    const timeStr = formatTime(selectedDate); // HH:MM

    // Anzeige von Datum und Zeit mit "Z" für UTC
    dom.selectedTime.textContent = `Ausgewählte Zeit: ${dateStr} ${timeStr}Z`;
}

/**
 * Füllt das Modell-Dropdown-Menü
 */
function updateModelSelect(models) {
    dom.modelSelect.innerHTML = ''; // Leeren

    // FÜGE ZUERST die Option für die "Auto"-Modelle hinzu (Wird nicht standardmäßig gewählt)
    const autoOption = document.createElement('option');
    autoOption.value = 'auto|latest';
    autoOption.textContent = '-- Automatische Auswahl (Open-Meteo) --';
    dom.modelSelect.appendChild(autoOption);

    let firstModelSet = false; // NEU: Flag, um das erste *verfügbare* Modell zu markieren

    // Füge die verfügbaren Modelle hinzu
    models.forEach(model => {
        const displayLabel = WEATHER_MODELS.DISPLAY_MAP[model.apiName] || model.apiName;
        const option = document.createElement('option');

        option.value = `${model.apiName}|latest`;
        option.textContent = displayLabel;

        // NEU: Wähle das erste Modell, das wir von der API als verfügbar erhalten, als Standard.
        // Die Modelle sind in config.js vorsortiert (icon_seamless ist das erste).
        if (!firstModelSet) {
            option.selected = true;
            firstModelSet = true;
        }

        dom.modelSelect.appendChild(option);
    });

    // Falls die Prüfung komplett fehlschlägt, wähle Auto (das wäre aber schon drin)
    if (!firstModelSet && models.length > 0) {
        // Falls icon_seamless nicht verfügbar wäre, wählen wir das erste in der Liste.
        // Das ist der Sicherheits-Fallback. 
        dom.modelSelect.querySelector('option[value="' + models[0].apiName + '|latest"]').selected = true;
    }
}

/**
 * NEU: Befüllt das Dropdown-Menü für die Tagauswahl.
 */
function populateDaySelector(maxDays = 7) {
    if (!dom.daySelect) return; // (wird in initTimeSlider hinzugefügt)

    dom.daySelect.innerHTML = ''; // Leeren
    const today = new Date();

    for (let i = 0; i < maxDays; i++) {
        const date = new Date(today);
        date.setUTCDate(date.getUTCDate() + i); // Datum um 'i' Tage erhöhen

        let dayName;
        if (i === 0) dayName = 'Heute';
        else if (i === 1) dayName = 'Morgen';
        else dayName = date.toLocaleDateString('de-DE', { weekday: 'short' });

        const dateString = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

        const option = document.createElement('option');
        option.value = i; // Wichtig: Der Wert ist der Offset (0, 1, 2...)
        option.textContent = `${dayName} (${dateString})`;
        dom.daySelect.appendChild(option);
    }
}

/**
 * NEU: Setzt den Slider-Wert extern
 */
export function setSliderHour(hour) {
    if (!dom.timeSlider) return;
    dom.timeSlider.value = hour;
    updateSelectedTime(hour);
    updateSliderHighlight(hour);
}

/**
 * Aktualisiert das Highlight-Band unter dem Slider
 */
function updateSliderHighlight(value) {
    const max = parseInt(dom.timeSlider.max, 10);
    const percent = (value / max) * 100;
    dom.sliderTrackHighlight.style.width = `${percent}%`;
}

/**
 * Aktualisiert die Modell-Info im Popup.
 * Entspricht der gewünschten Struktur: "Run: [Datum/Zeit]"
 */
function updateModelInfoDisplay(apiName, runKey) {

    let runTimeDisplay;

    // 1. Logge den erhaltenen Schlüssel zur Fehlerbehebung
    console.log(`[updateModelInfoDisplay] Erhaltener runKey: ${runKey}`);

    // 2. Prüfe auf den Fall, dass fetchLastRunTime keine spezifische Zeit liefern konnte.
    if (runKey === 'latest') {
        // Dieser Fall tritt bei 'auto' oder API-Fehler in fetchLastRunTime auf.
        runTimeDisplay = 'Laufzeit nicht abrufbar (Kein fester Run)';
    } else {
        // 3. WERT sollte ein ISO-String sein. Wir versuchen, ihn zu formatieren.
        runTimeDisplay = formatIsoToRunTime(runKey);
    }

    // Info-Popup Text aktualisieren
    dom.modelInfoPopup.innerHTML = `<strong>Run:</strong> ${runTimeDisplay}`;
}

// --- 4. Interne Modell-Logik (portiert aus DZMaster/weatherManager.js) ---

/**
 * Prüft bei Open Meteo, welche Modelle für die BBox verfügbar sind.
 */
async function checkAvailableModels(lat, lng) {
    console.log("[timeSlider] Prüfe verfügbare Modelle...");

    const modelList = WEATHER_MODELS.LIST;
    let availableModels = [];

    // Wir prüfen nur, ob die API uns die Daten für eine Koordinate gibt.
    for (const apiName of modelList) {
        try {
            // Nur eine leichte Testanfrage (temp 2m)
            const url = `${API_URLS.FORECAST}?latitude=${lat}&longitude=${lng}&hourly=temperature_2m&models=${apiName}&forecast_days=1`;
            const response = await fetch(url);

            if (response.ok) {
                const data = await response.json();
                // Prüfe, ob die API tatsächlich Daten zurückgibt
                if (data.hourly && data.hourly.temperature_2m && data.hourly.temperature_2m.some(t => t !== null)) {
                    availableModels.push({
                        apiName: apiName,
                        name: WEATHER_MODELS.DISPLAY_MAP[apiName] || apiName
                    });
                }
            } else if (response.status === 429) {
                console.warn(`[timeSlider] API-Limit beim Prüfen von Modell '${apiName}' erreicht.`);
            } else {
                console.warn(`[timeSlider] Modell '${apiName}' ist nicht verfügbar (Status: ${response.status})`);
            }
        } catch (e) {
            console.error(`[timeSlider] Netzwerkfehler bei Modellprüfung '${apiName}':`, e);
        }
    }

    return availableModels;
}

/**
 * Holt die letzte Laufzeit des Modells ab.
 * Nutzt die API_MAP zur Bestimmung der Metadaten-ID.
 */
async function fetchLastRunTime(selectedApiName) {
    // 1. Sonderfall: Wenn 'auto' gewählt ist, gibt es keine feste Laufzeit-Info.
    if (selectedApiName === 'auto') {
        return 'latest';
    }

    // 2. Die Open-Meteo ID aus der API_MAP holen
    const modelMetaId = WEATHER_MODELS.API_MAP[selectedApiName];
    if (!modelMetaId) {
        console.warn(`[timeSlider] Keine API_MAP-ID für ${selectedApiName} gefunden.`);
        return 'latest';
    }

    // 3. Metadaten-URL erstellen
    // KORREKTUR: Verwende das robuste Format aus dem anderen Projekt
    const metaUrl = `https://api.open-meteo.com/data/${modelMetaId}/static/meta.json`;

    try {
        const metaResponse = await fetch(metaUrl);
        if (!metaResponse.ok) {
            // Loggt den Statuscode (z.B. 404) zur besseren Diagnose
            throw new Error(`Status ${metaResponse.status}`);
        }
        const metaData = await metaResponse.json();

        // Zeitstempel ist in Sekunden (UNIX Epoch)
        const runDate = new Date(metaData.last_run_initialisation_time * 1000);

        // WICHTIG: Rückgabe als ISO-String
        return runDate.toISOString();

    } catch (e) {
        // Fallback, wenn der Abruf fehlschlägt
        console.warn(`[timeSlider] Konnte letzte Laufzeit für ${selectedApiName} nicht abrufen: ${e.message}`);
        return 'latest';
    }
}

/**
 * Formatiert einen ISO-Zeitstempel in das gewünschte Laufzeit-Format.
 * @param {string} isoString - Der ISO-Zeitstempel.
 * @returns {string} Das Format YYYY-MM-DD HH:MMZ (z.B. 2025-11-01 12:00Z) oder einen Fehlerstring.
 */
function formatIsoToRunTime(isoString) {
    if (!isoString || typeof isoString !== 'string') return 'FEHLER: Ungültige Daten';

    const date = new Date(isoString);

    // KORREKTUR: Prüft auf ungültige Datumsobjekte (new Date(bad string) liefert 'Invalid Date')
    if (isNaN(date.getTime())) {
        console.error(`[formatIsoToRunTime] Konnte Datum nicht parsen. Erhalten: ${isoString}`);
        // Gibt den Originalwert zurück, damit der Benutzer sehen kann, was schiefgelaufen ist.
        return `FEHLER (NaN): ${isoString}`;
    }

    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}Z`;
}

// --- 5. Die Haupt-Initialisierungs-Funktion (unser "Herz") ---

/**
 * Initialisiert den Time-Slider und alle seine Events.
 * 'callbacks' ist ein Objekt von Funktionen, die main.js bereitstellt.
 * callbacks = { onSliderChange, onModelChange, onAutoupdateChange }
 */
export async function initTimeSlider(callbacks) {

    // 1. DOM-Elemente finden 
    dom.sliderContainer = document.getElementById('slider-container');
    dom.selectedTime = document.getElementById('selectedTime');
    dom.autoupdateCheckbox = document.getElementById('autoupdateCheckbox');
    dom.timeSlider = document.getElementById('timeSlider');
    dom.sliderTrackHighlight = document.getElementById('slider-track-highlight');
    dom.sliderLabels = document.getElementById('slider-labels');
    dom.modelSelect = document.getElementById('modelSelect');
    dom.modelInfoButton = document.getElementById('modelInfoButton');
    dom.modelInfoPopup = document.getElementById('modelInfoPopup');
    dom.daySelect = document.getElementById('daySelect');

    // 2. Interne Event-Listener

    // Slider-Bewegung & Change
    dom.timeSlider.addEventListener('input', (e) => {
        const hour = parseInt(e.target.value, 10);
        updateSelectedTime(hour);
        updateSliderHighlight(hour);
    });
    dom.timeSlider.addEventListener('change', (e) => {
        const hour = parseInt(e.target.value, 10);
        if (callbacks.onSliderChange) {
            callbacks.onSliderChange(hour);
        }
    });

    // Modell-Auswahl
    dom.modelSelect.addEventListener('change', async (e) => {
        const [apiName] = e.target.value.split('|'); // RunKey ist hier 'latest'

        // 1. Letzte Laufzeit abrufen
        const runTimeISO = await fetchLastRunTime(apiName);

        // 2. Zustand speichern
        currentRunTimeISO = runTimeISO;

        // 3. UI aktualisieren
        updateModelInfoDisplay(apiName, runTimeISO);
        updateSelectedTime(parseInt(dom.timeSlider.value, 10));

        // 4. Callback auslösen (runTimeISO ist entweder ISO-String oder 'latest')
        if (callbacks.onModelChange) {
            callbacks.onModelChange(apiName, runTimeISO);
        }
    });

    if (dom.daySelect) { // (Sicherheitscheck)
        dom.daySelect.addEventListener('change', (e) => {
            console.log("[DEBUG 1] Tag-Auswahl geklickt! Wert:", e.target.value);
            if (callbacks.onDayChange) {
                callbacks.onDayChange(e); // Ruft handleDayChange in main.js auf
            }
        });
    }

    // Autoupdate
    dom.autoupdateCheckbox.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        if (callbacks.onAutoupdateChange) {
            callbacks.onAutoupdateChange(isEnabled);
        }
    });

    // Info-Button (einfache Version)
    dom.modelInfoButton.addEventListener('click', (e) => {
        // Toggle the popup display
        if (dom.modelInfoPopup.style.display === 'block') {
            dom.modelInfoPopup.style.display = 'none';
        } else {
            // Zeige das Popup
            dom.modelInfoPopup.style.display = 'block';
        }
        e.stopPropagation(); // Verhindert, dass der Klick nach oben wandert
    });

    // Klick außerhalb des Popups schließt es
    document.addEventListener('click', () => {
        if (dom.modelInfoPopup) dom.modelInfoPopup.style.display = 'none';
    });


    // 3. Slider initial befüllen

    // Starte die Modellprüfung für eine Standardkoordinate (Berlin)
    const lat = 52.5;
    const lng = 13.4;

    // UI-Meldung setzen
    dom.modelSelect.innerHTML = '<option value="">-- Modelle werden geladen --</option>';

    const models = await checkAvailableModels(lat, lng);

    // Dropdown befüllen
    updateModelSelect(models);

    populateDaySelector(7); // <-- NEU: Tagauswahl befüllen

    // Setze die Standard-Werte für das erste Element/Auto
    const [initialApiName] = dom.modelSelect.value.split('|');
    const runTimeISO = await fetchLastRunTime(initialApiName);
    currentRunTimeISO = runTimeISO; // Initialer Wert

    // Setze den Slider (Annahme: 24h, da fetchAndCheckProfile nur 24h holt)
    const maxHours = 23;
    dom.timeSlider.max = maxHours;
    dom.timeSlider.value = 0;
    dom.timeSlider.disabled = false;
    updateSliderLabels(maxHours);
    updateSelectedTime(0);
    updateSliderHighlight(0);

    // 4. Callbacks auslösen

    // Initiales Update der Modell-Anzeige
    updateModelInfoDisplay(initialApiName, runTimeISO);

    if (callbacks.onModelChange) {
        callbacks.onModelChange(initialApiName, runTimeISO);
    }
    if (callbacks.onSliderChange) {
        callbacks.onSliderChange(0);
    }
}