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
    // 1. Fallback, falls noch keine API-Daten da sind
    if (!currentRunTimeISO || currentRunTimeISO === 'latest') {
        dom.selectedTime.textContent = `Ausgewählte Zeit: ${hour.toString().padStart(2, '0')}:00`;
        return;
    }

    // 2. Die Startzeit (Stunde 0) als Date-Objekt holen
    const startDate = new Date(currentRunTimeISO);

    // 3. Die Stunde hinzufügen (UTC-basiert)
    const selectedDate = new Date(startDate.getTime());
    selectedDate.setUTCHours(selectedDate.getUTCHours() + hour);

    // 4. Formatierung
    const dateStr = formatDate(selectedDate);
    const timeStr = formatTime(selectedDate);

    // NEU: Anzeige von Datum und Zeit mit "Z" für UTC
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
    
    // Formatierung der Laufzeit
    let runTimeDisplay;
    if (runKey === 'latest') {
        // Informativer Text für dynamische/seamless Modelle
        runTimeDisplay = 'Neuester Stand (dynamisch)'; 
    } else {
        // Verwendet die Formatierungsfunktion YYYY-MM-DD HH:MMZ
        runTimeDisplay = formatIsoToRunTime(runKey);
    }
    
    // Info-Popup Text aktualisieren, um der gewünschten Struktur zu entsprechen: "Run: [Wert]"
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
    // Die Metadaten-URL von Open-Meteo basiert auf der ID (z.B. dwd_icon)
    const metaUrl = `https://api.open-meteo.com/v1/model-meta/${modelMetaId}.json`;
    
    try {
        const metaResponse = await fetch(metaUrl);
        if (!metaResponse.ok) {
            // Fängt 404 oder andere Fehler ab.
            throw new Error(`Status ${metaResponse.status}`);
        }
        const metaData = await metaResponse.json();
        
        // Zeitstempel ist in Sekunden (UNIX Epoch)
        const runDate = new Date(metaData.last_run_initialisation_time * 1000);
        
        // WICHTIG: Rückgabe als ISO-String für das Date-Objekt in main.js
        return runDate.toISOString(); 
        
    } catch (e) {
        // Fallback, wenn der Abruf fehlschlägt (Netzwerkfehler, etc.)
        console.warn(`[timeSlider] Konnte letzte Laufzeit für ${selectedApiName} nicht abrufen:`, e.message);
        return 'latest';
    }
}

/**
 * NEU: Formatiert einen ISO-Zeitstempel in das gewünschte Laufzeit-Format.
 * @param {string} isoString - Der ISO-Zeitstempel.
 * @returns {string} Das Format YYYY-MM-DD HH:MMZ (z.B. 2025-11-01 12:00Z).
 */
function formatIsoToRunTime(isoString) {
    if (!isoString) return 'N/A';
    
    const date = new Date(isoString);
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