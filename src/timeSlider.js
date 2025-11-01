// timeSlider.js - (Transplantiert aus DZMaster)

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
    dom.selectedTime.textContent = `Ausgewählte Zeit: ${hour.toString().padStart(2, '0')}:00`;
}

/**
 * Füllt das Modell-Dropdown-Menü
 */
function updateModelSelect(models, runTimes) {
    dom.modelSelect.innerHTML = ''; // Leeren
    
    // Füge die verfügbaren Modelle hinzu
    models.forEach(model => {
        const optGroup = document.createElement('optgroup');
        optGroup.label = model.name;
        
        // Füge die Laufzeiten für dieses Modell hinzu
        runTimes.forEach(run => {
            const option = document.createElement('option');
            option.value = `${model.apiName}|${run.iso}`; // z.B. "icon_d2|2025-11-01T12:00:00.000Z"
            option.textContent = run.label;
            // Wähle den neuesten Lauf des ersten Modells als Standard
            if (model === models[0] && run === runTimes[0]) {
                option.selected = true;
            }
            optGroup.appendChild(option);
        });
        dom.modelSelect.appendChild(optGroup);
    });
}

/**
 * Aktualisiert das Highlight-Band unter dem Slider
 */
function updateSliderHighlight(value) {
    const max = parseInt(dom.timeSlider.max, 10);
    const percent = (value / max) * 100;
    dom.sliderTrackHighlight.style.width = `${percent}%`;
}


// --- 4. Interne Modell-Logik (portiert aus DZMaster/weatherManager.js) ---

/**
 * Prüft bei Open Meteo, welche Modelle für die BBox verfügbar sind.
 */
async function checkAvailableModels(bbox) {
    // (Diese Funktion ist vereinfacht, da wir noch keine BBox haben)
    // TODO: Diese Funktion später mit einer echten BBox füttern
    console.log("Prüfe verfügbare Modelle (simuliert)...");
    
    // Harte Annahme für jetzt (später per API-Call ersetzen)
    const availableModels = [
        { name: 'ICON-D2 (Auto)', apiName: 'icon_d2' },
        { name: 'ICON-EU (Auto)', apiName: 'icon_eu' },
        { name: 'GFS (Auto)', apiName: 'gfs' }
    ];
    // Du könntest hier einen echten fetch an
    // `https://api.open-meteo.com/v1/forecast?latitude=...&longitude=...&models=auto`
    // machen und `data.models` auswerten, aber für den Start reicht das.
    
    return availableModels;
}


// --- 5. Die Haupt-Initialisierungs-Funktion (unser "Herz") ---

/**
 * Initialisiert den Time-Slider und alle seine Events.
 * 'callbacks' ist ein Objekt von Funktionen, die main.js bereitstellt.
 * callbacks = { onSliderChange, onModelChange, onAutoupdateChange }
 */
export async function initTimeSlider(callbacks) {
    
    // 1. DOM-Elemente finden (jetzt, wo sie existieren)
    dom.sliderContainer = document.getElementById('slider-container');
    dom.selectedTime = document.getElementById('selectedTime');
    dom.autoupdateCheckbox = document.getElementById('autoupdateCheckbox');
    dom.timeSlider = document.getElementById('timeSlider');
    dom.sliderTrackHighlight = document.getElementById('slider-track-highlight');
    dom.sliderLabels = document.getElementById('slider-labels');
    dom.modelLabel = document.getElementById('modelLabel');
    dom.modelSelect = document.getElementById('modelSelect');
    dom.modelInfoButton = document.getElementById('modelInfoButton');
    dom.modelInfoPopup = document.getElementById('modelInfoPopup');
    
    // 2. Interne Event-Listener (portiert aus DZMaster/eventManager.js)
    
    // Slider-Bewegung
    dom.timeSlider.addEventListener('input', (e) => {
        const hour = parseInt(e.target.value, 10);
        updateSelectedTime(hour);
        updateSliderHighlight(hour);
    });
    // Slider losgelassen (löst Callback aus)
    dom.timeSlider.addEventListener('change', (e) => {
        const hour = parseInt(e.target.value, 10);
        // Rufe die "Steckdose" (Callback) von main.js auf
        if (callbacks.onSliderChange) {
            callbacks.onSliderChange(hour); 
        }
    });

    // Modell-Auswahl
    dom.modelSelect.addEventListener('change', (e) => {
        const [apiName, runTimeISO] = e.target.value.split('|');
        // Rufe die "Steckdose" (Callback) von main.js auf
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
    dom.modelInfoButton.addEventListener('click', () => {
        alert("Modell-Info: Zeigt die verfügbaren Wettermodelle und ihre Laufzeiten. (Später mit Popup)");
    });

    
    // 3. Slider initial befüllen
    
    // Finde verfügbare Modelle und Laufzeiten
    // (Wir übergeben eine Fake-BBox, da wir noch kein Profil haben)
    const fakeBBox = { lat: 52.5, lon: 13.4 }; 
    const models = await checkAvailableModels(fakeBBox);
    const runTimes = calculateModelRunTimes();

    // Befülle das Dropdown
    updateModelSelect(models, runTimes);

    // Setze den Slider (Annahme: 24h)
    const maxHours = 23; 
    dom.timeSlider.max = maxHours;
    dom.timeSlider.value = 0;
    dom.timeSlider.disabled = false;
    updateSliderLabels(maxHours);
    updateSelectedTime(0);
    updateSliderHighlight(0);

    // Signalisiere, dass die Initialisierung fertig ist und
    // übergebe die Standard-Werte an main.js
    if (callbacks.onModelChange) {
        const [apiName, runTimeISO] = dom.modelSelect.value.split('|');
        callbacks.onModelChange(apiName, runTimeISO);
    }
    if (callbacks.onSliderChange) {
        callbacks.onSliderChange(0);
    }
}