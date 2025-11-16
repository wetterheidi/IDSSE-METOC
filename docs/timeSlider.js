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
let currentDayOffset = 0;
let lastModelRun = "N/A (No data)";
let registeredCallbacks = {};

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
        startDate.setUTCDate(startDate.getUTCDate() + currentDayOffset); // <-- NEU

    } else {
        // Fallback für den Initialzustand oder 'auto' / 'latest'.
        // Der sicherste Startpunkt für den Forecast ist heute 00:00Z.
        startDate = new Date();
        startDate.setUTCHours(0, 0, 0, 0);
        startDate.setUTCDate(startDate.getUTCDate() + currentDayOffset); // <-- NEU
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
 * NEU: Versucht, 'preferredModelApiName' beizubehalten
 */
function updateModelSelect(models, preferredModelApiName = null) {
    dom.modelSelect.innerHTML = ''; // Leeren

    // 1. "Auto" Option hinzufügen
    const autoOption = document.createElement('option');
    autoOption.value = 'auto|latest';
    autoOption.textContent = '-- Automatische Auswahl (Open-Meteo) --';
    dom.modelSelect.appendChild(autoOption);

    let preferredModelFound = false;
    let iconSeamlessAvailable = false; // <-- NEU: Merker für unseren besten Fallback

    // 2. Verfügbare Modelle hinzufügen
    models.forEach(model => {
        const displayLabel = WEATHER_MODELS.DISPLAY_MAP[model.apiName] || model.apiName;
        const option = document.createElement('option');
        option.value = `${model.apiName}|latest`;
        option.textContent = displayLabel;

        // Prüfe, ob dies unser bevorzugtes globales Modell ist
        if (model.apiName === 'icon_seamless') {
            iconSeamlessAvailable = true;
        }

        // Prüfen, ob dies das bevorzugte Modell ist
        if (model.apiName === preferredModelApiName) {
            option.selected = true;
            preferredModelFound = true;
            console.log(`[timeSlider] Bevorzugtes Modell (${preferredModelApiName}) gefunden und wiederhergestellt.`);
        }
        dom.modelSelect.appendChild(option);
    });

    // 3. Fallback: Wenn das bevorzugte Modell nicht gefunden wurde
    if (!preferredModelFound) {
        console.log(`[timeSlider] Bevorzugtes Modell (${preferredModelApiName}) nicht gefunden.`);
        
        // --- KORRIGIERTER FALLBACK ---
        // Unser bester Fallback ist 'icon_seamless', da es Druckstufen unterstützt
        if (iconSeamlessAvailable) {
            dom.modelSelect.querySelector('option[value="icon_seamless|latest"]').selected = true;
            console.log(`[timeSlider] Fallback auf 'icon_seamless' (global).`);
        } 
        // Wenn selbst das nicht da ist, versuchen wir das 'auto'
        else if (preferredModelApiName === 'auto') {
             autoOption.selected = true;
             console.log(`[timeSlider] Fallback auf 'auto'.`);
        } 
        // Wenn alles fehlschlägt, nimm das erste in der Liste (z.B. HRRR in den USA)
        else {
            const firstAvailableModel = dom.modelSelect.querySelector('option:nth-child(2)');
            if (firstAvailableModel) {
                firstAvailableModel.selected = true;
                console.log(`[timeSlider] Fallback auf erstes verfügbares Modell: ${firstAvailableModel.value}`);
            } else {
                autoOption.selected = true; // Letzter Ausweg
            }
        }
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
 * NEU: Setzt den Tages-Offset extern (von main.js)
 */
export function setForecastDay(dayOffset) {
    currentDayOffset = dayOffset;
    // (Wir aktualisieren die UI hier nicht, 
    // das passiert gleich durch setSliderHour(0))
}

/**
 * NEU: Setzt das Dropdown-Menü für den Tag visuell zurück.
 */
export function resetDaySelector() {
    if (dom.daySelect) {
        dom.daySelect.value = "0"; // Setzt auf "Heute"
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

    // Speichere die Callbacks, damit unsere neue Funktion sie nutzen kann
    registeredCallbacks = callbacks;

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

        // --- NEU: TAGES-DROPDOWN DYNAMISCH ANPASSEN ---

        // 1. Finde maxDays (dieselbe Logik wie in main.js "Smart Reset")
        let maxDays = 7; // Standard (für 'auto')
        if (apiName !== 'auto') {
            const modelProps = WEATHER_MODELS.MODEL_PROPERTIES[apiName];
            if (modelProps && modelProps.maxDays) {
                maxDays = modelProps.maxDays;
            } else {
                console.warn(`[timeSlider] 'maxDays' für "${apiName}" nicht gefunden, nutze 7.`);
            }
        }

        // 2. Baue das Day-Dropdown mit der korrekten Anzahl an Tagen neu auf
        populateDaySelector(maxDays);

        // --- ENDE NEU ---

        // 3. Letzte Laufzeit abrufen
        const runTimeISO = await fetchLastRunTime(apiName);

        // 4. Zustand speichern
        currentRunTimeISO = runTimeISO;

        // 5. UI aktualisieren
        updateModelInfoDisplay(apiName, runTimeISO);
        updateSelectedTime(parseInt(dom.timeSlider.value, 10));

        // 6. Callback auslösen (ruft handleModelChange in main.js auf)
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

    populateDaySelector(7); // Tagauswahl befüllen
    const maxHours = 23;
    dom.timeSlider.max = maxHours;
    dom.timeSlider.value = 0;
    dom.timeSlider.disabled = false;
    updateSliderLabels(maxHours);
    updateSelectedTime(0);
    updateSliderHighlight(0);

    // 4. Callbacks auslösen (nur den, der übrig geblieben ist)
    if (callbacks.onSliderChange) {
        callbacks.onSliderChange(0);
    }
}

/**
 * NEU: Prüft verfügbare Modelle für einen Standort und baut das Dropdown neu auf.
 * Löst den onModelChange-Callback aus, wenn die Liste aktualisiert wurde.
 */
export async function updateAvailableModelsForArea(lat, lng) {
    if (!dom.modelSelect) return; 
    console.log(`[timeSlider] Aktualisiere Modelle für Standort: ${lat}, ${lng}`);

    // --- KORREKTUR: Aktuell ausgewähltes Modell merken ---
    // (Wir holen das Modell, das der User gerade geklickt hat ODER das bereits geladen war)
    const preferredModelApiName = dom.modelSelect.value ? dom.modelSelect.value.split('|')[0] : 'auto';
    console.log(`[timeSlider] Bevorzugtes Modell ist: ${preferredModelApiName}`);
    // --- ENDE KORREKTUR ---

    // 1. UI-Meldung setzen
    dom.modelSelect.innerHTML = '<option value="">-- Modelle werden geladen --</option>';

    // 2. Modelle prüfen (interne Funktion)
    const models = await checkAvailableModels(lat, lng);

    // 3. Dropdown befüllen (mit Übergabe des bevorzugten Modells)
    updateModelSelect(models, preferredModelApiName); // <-- Geänderter Aufruf

    // 4. Setze die Standard-Werte (basierend auf der *neuen* Auswahl)
    const [selectedApiName] = dom.modelSelect.value.split('|');
    const runTimeISO = await fetchLastRunTime(selectedApiName);
    currentRunTimeISO = runTimeISO; // Zustand aktualisieren

    // 5. Initiales Update der Modell-Anzeige
    updateModelInfoDisplay(selectedApiName, runTimeISO);

    // (Der onModelChange Callback bleibt entfernt, das war korrekt so)
}

/**
 * Gibt das aktuell im Dropdown ausgewählte Modell 
 * und die zugehörige Laufzeit zurück.
 */
export function getCurrentModelInfo() {
    // dom.modelSelect ist global in diesem Modul verfügbar
    const [apiName] = dom.modelSelect.value.split('|');
    
    // currentRunTimeISO ist ebenfalls global in diesem Modul
    return {
        apiName: apiName || 'auto', // Fallback auf 'auto'
        runTimeISO: currentRunTimeISO || 'latest'
    };
}
