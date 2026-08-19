// weather.js (Version 3.0 - Strukturiert und Modular)

// -----------------------------------------------------------
// 1. IMPORTS
// -----------------------------------------------------------
import { getCache, setCache } from './db.js';
import { METRICS_CONFIG, getApiParams, getMetricRules } from './metricsConfig.js';
import {
    WEATHER_MODELS, API_URLS, getModelMaxDays,
    MICHAEL_HOSTS, MICHAEL_LEVEL_CLOUD_MODELS, MICHAEL_MODEL_LEVELS,
    MICHAEL_CLOUD_CAP_M, MICHAEL_SURFACE_WHITELIST,
} from './config.js';
import { cloudCeiling, lowestCloudBase } from './clouds.js';
import { LAND_POLYGONS } from './landPolygons.js';
import {
    analyzeCloudLayers,
    calculateDewpoint,
    findCloudLayers,
    interpolateWeatherData,
    interpolateWindAtAltitude,
    windDirection,
    windSpeed,
} from './utils.js';
import { showToast } from './ui.js';

// Verhindert Toast-Spam bei mehreren gleichzeitig fehlschlagenden Profilen
let _lastApiErrorToastTime = 0;
function showApiErrorToast(message, type = 'error') {
    const now = Date.now();
    if (now - _lastApiErrorToastTime > 10000) {
        _lastApiErrorToastTime = now;
        showToast(message, type, 6000);
    }
}

// -----------------------------------------------------------
// 2. GLOBALE REQUEST-QUEUE (Rate Limiter)
// -----------------------------------------------------------

/**
 * Zentraler Rate-Limiter für ALLE Open-Meteo API-Calls.
 * Stellt sicher, dass nie mehr als MAX_CONCURRENT Requests gleichzeitig
 * laufen und zwischen jedem Request MIN_DELAY_MS gewartet wird.
 * So werden 429-Fehler bei vielen Profilen zuverlässig verhindert.
 */
const RequestQueue = (() => {
    const MAX_CONCURRENT = 2;   // Maximal 2 parallele Requests
    const MIN_DELAY_MS   = 400; // Mindest-Pause zwischen Requests (= max ~2.5 req/s)

    let active   = 0;
    let lastSent = 0;
    const queue  = [];

    function tryNext() {
        if (queue.length === 0 || active >= MAX_CONCURRENT) return;

        const now         = Date.now();
        const sinceLastMs = now - lastSent;
        const waitMs      = Math.max(0, MIN_DELAY_MS - sinceLastMs);

        setTimeout(() => {
            if (active >= MAX_CONCURRENT) { tryNext(); return; }

            const { url, resolve, reject, retries } = queue.shift();
            active++;
            lastSent = Date.now();

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            fetch(url, { signal: controller.signal })
                .then(async res => {
                    clearTimeout(timeoutId);
                    if (res.status === 429 && retries > 0) {
                        const backoffMs = Math.pow(2, 3 - retries) * 1500; // 1.5s, 3s, 6s
                        console.warn(`[Queue] 429 – Retry in ${backoffMs}ms (${retries} versuche übrig)`);
                        await new Promise(r => setTimeout(r, backoffMs));
                        queue.unshift({ url, resolve, reject, retries: retries - 1 });
                        active--;
                        tryNext();
                        return;
                    }
                    active--;
                    tryNext();
                    resolve(res);
                })
                .catch(err => {
                    clearTimeout(timeoutId);
                    active--;
                    tryNext();
                    if (err.name === 'AbortError') {
                        reject(new Error('Open-Meteo API antwortet nicht (Timeout nach 15s). Bitte später erneut versuchen.'));
                    } else {
                        reject(err);
                    }
                });
        }, waitMs);
    }

    return {
        /**
         * Führt einen fetch()-Aufruf über die Queue durch.
         * Ersetze alle fetch()-Aufrufe in dieser Datei damit.
         * @param {string} url
         * @param {number} retries - Wiederholungsversuche bei 429
         * @returns {Promise<Response>}
         */
        fetch(url, retries = 3) {
            return new Promise((resolve, reject) => {
                queue.push({ url, resolve, reject, retries });
                tryNext();
            });
        },

        /** Debugging: Aktueller Status der Queue */
        status() {
            return { queued: queue.length, active };
        }
    };
})();


// -----------------------------------------------------------
// 2b. MICHAELS INSTANZ: DIREKTER FETCH (kein Rate-Limiting noetig)
// -----------------------------------------------------------

/**
 * Einfacher fetch() mit Timeout, OHNE die RequestQueue -- Michaels Instanz ist
 * ratenlimitfrei, die Drosselung/Concurrency-Begrenzung der RequestQueue ist
 * ausschliesslich fuer die oeffentliche API noetig (siehe config.js
 * MICHAEL_HOSTS-Kommentar). So bleibt die (fuer public ohnehin knappe)
 * RequestQueue-Kapazitaet ungeschmaelert.
 */
async function fetchDirect(url, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Teilt eine Liste angefragter hourly-Parameter danach auf, ob sie auf
 * Michaels Instanz bestaetigt real befuellt sind (MICHAEL_SURFACE_WHITELIST,
 * fail-closed: alles Unbekannte -> public).
 */
function splitHourlyParams(paramNames, whitelist) {
    const michael = [];
    const publicOnly = [];
    for (const name of paramNames) {
        (whitelist.has(name) ? michael : publicOnly).push(name);
    }
    return { michael, publicOnly };
}

// Modul-Level-Cache: das sondierte Level-Band aendert sich pro Modell kaum
// (Levelhoehen sind primaer eine Funktion des Modellgitters, nicht der
// Wetterlage) -- eine Sondierung pro Modell und Sitzung reicht, spart eine
// zusaetzliche Anfrage bei jedem Profil-Check.
let _cloudBandCache = { modelApiName: null, band: null };

/**
 * Sondiert einmal je Modell (an EINEM Punkt) die AGL-Hoehe aller Modell-Level
 * und schneidet das Band bei MICHAEL_CLOUD_CAP_M ab -- exaktes Vorgehen wie
 * droneforecast/src/cloudoverlay.js `ensureBand()`. Gibt bei Fehlern `null`
 * zurueck (Aufrufer faellt dann auf den alten Druckstufen-Pfad zurueck, statt
 * cloudBase/cloudCeiling ohne Daten dastehen zu lassen).
 * @returns {Promise<{levels: number[]} | null>}
 */
async function ensureCloudBand(modelApiName, sampleCoord) {
    if (_cloudBandCache.modelApiName === modelApiName && _cloudBandCache.band) {
        return _cloudBandCache.band;
    }
    const nLevels = MICHAEL_MODEL_LEVELS[modelApiName];
    if (!nLevels) return null;

    const probeLevels = [];
    for (let l = nLevels; l >= 1; l--) probeLevels.push(l);
    const vars = probeLevels.map(l => `height_agl_level${l}`).join(',');
    const url = `${MICHAEL_HOSTS[modelApiName]}/v1/forecast?latitude=${sampleCoord.lat.toFixed(4)}&longitude=${sampleCoord.lon.toFixed(4)}&hourly=${vars}&models=${modelApiName}&forecast_days=1`;

    try {
        const res = await fetchDirect(url);
        if (!res.ok) throw new Error(`Sondierung fehlgeschlagen: ${res.statusText}`);
        const data = await res.json();
        const hourly = (Array.isArray(data) ? data[0] : data)?.hourly;
        if (!hourly) throw new Error('Sondierung: keine hourly-Daten erhalten.');

        const levels = [];
        for (const l of probeLevels) {
            const arr = hourly[`height_agl_level${l}`] || [];
            const heightVal = arr.find(v => v != null);
            levels.push(l);
            if (heightVal != null && heightVal >= MICHAEL_CLOUD_CAP_M) break;
        }
        const band = { levels };
        _cloudBandCache = { modelApiName, band };
        return band;
    } catch (e) {
        console.warn(`[weather.js] Cloud-Level-Sondierung fuer ${modelApiName} fehlgeschlagen (${e.message}) -- falle auf Druckstufen-Pfad zurueck.`);
        return null;
    }
}

/**
 * Wandelt die Rohantwort eines Level-Cloud-Requests (hourly-Objekt mit
 * cloud_cover_level{N}/height_agl_level{N}) in die von clouds.js erwartete
 * schlanke `col`-Form um. band.levels[0] ist per Konvention das unterste
 * sondierte Level (siehe ensureCloudBand), passt exakt zu clouds.js'
 * Annahme aufsteigender Hoehe bei aufsteigendem Level-Index.
 */
function buildLevelCloud(hourlyRaw, band) {
    const h = [], clc = [];
    for (const lvl of band.levels) {
        h.push(hourlyRaw[`height_agl_level${lvl}`] || []);
        clc.push(hourlyRaw[`cloud_cover_level${lvl}`] || []);
    }
    return { h, clc, nLevels: band.levels.length };
}

// -----------------------------------------------------------
// 3. INTERNE HELFER: DATENVERARBEITUNG
// -----------------------------------------------------------

/**
 * Teilt ein Array in kleinere Stapel (Chunks) auf.
 * (Unverändert)
 */
function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

// -----------------------------------------------------------
// 3. INTERNE HELFER: ANALYSE & ABGELEITETE METRIKEN
// -----------------------------------------------------------

/**
 * Berechnet abgeleitete Metriken.
 * @param {string} summaryKey - Der Schlüssel der Metrik (z.B. 'windchill')
 * @param {object} hourly - Das Open-Meteo 'hourly'-Objekt für EINEN Punkt
 * @param {int} h - Der Index der Stunde (0-23)
 * @returns {number | null} - Der berechnete Wert oder null
 */
/**
 * Gibt ein vollständiges, formatiertes Vertikalprofil für einen Sampling-Punkt
 * und eine Stunde in der Browser-Konsole aus.
 *
 * Zweck: Verifizierung der Wolkenuntergrenze gegen METAR-Beobachtungen
 * und andere NWP-Tools. Alle Höhen in Fuß AGL (METAR-Standard).
 *
 * Aufruf: Wird von calculateDerivedValue() für cloudBase/cloudCeiling ausgelöst.
 *
 * @param {object} locationInfo  - { lat, lon, elevation_m }
 * @param {string} timeISO       - ISO-Zeitstempel des Vorhersagestundepunkts
 * @param {object[]} profile     - Interpolierte Datenpunkte (50-m-Raster)
 * @param {object[]} layers      - Gefundene Wolkenschichten
 * @param {object} thresholds    - Aktive RH-Schwellen { low, mid, high }
 */
function logCloudProfile(locationInfo, timeISO, profile, layers, thresholds) {
    const FT = 3.28084;

    // --- Kopfzeile ---
    const lat  = locationInfo.lat  != null ? locationInfo.lat.toFixed(4)  : '?';
    const lon  = locationInfo.lon  != null ? locationInfo.lon.toFixed(4)  : '?';
    const elev = locationInfo.elevation_m != null
        ? `${locationInfo.elevation_m}m / ${Math.round(locationInfo.elevation_m * FT)}ft`
        : '?';
    const model = locationInfo.modelName || 'unbekannt';
    const label = `☁ Wolkenprofil | ${model} | ${timeISO} UTC | ${lat}°N ${lon}°E | Gelände: ${elev}`;

    console.groupCollapsed(`%c${label}`, 'color: #1abc9c; font-weight: bold;');

    // --- RH-Schwellen ---
    console.log(
        `%cRH-Schwellen (aktuell): Tief=${thresholds.low}%  Mittel=${thresholds.mid}%  Hoch=65%`,
        'color: #888; font-style: italic;'
    );

    // --- Vollständiges Profil als Tabelle ---
    // Nur Punkte mit cc > 0 oder rh >= 60% sind typischerweise relevant,
    // aber wir zeigen ALLE Punkte für lückenlose Verifikation.
    const tableData = profile
        .filter(p => p.displayHeight !== undefined)
        .map(p => {
            const heightFt = Math.round(p.displayHeight * FT / 100) * 100; // gerundet auf 100ft
            const cc     = Number.isFinite(p.cc)     ? Math.round(p.cc)     : null;
            const ccApi  = Number.isFinite(p.cc_api) ? Math.round(p.cc_api) : null;
            const ccRh   = Number.isFinite(p.cc_rh)  ? Number(p.cc_rh.toFixed(1)) : null;
            const rh     = Number.isFinite(p.rh)     ? Math.round(p.rh)     : null;
            const temp   = Number.isFinite(p.temp)   ? Number(p.temp.toFixed(1)) : null;
            const dew    = Number.isFinite(p.dew)    ? Number(p.dew.toFixed(1))  : null;
            const spread = (temp != null && dew != null) ? Number((temp - dew).toFixed(1)) : null;
            const pres   = Number.isFinite(p.pressure) ? Math.round(p.pressure) : null;

            // METAR-Kategorie aus finalem CC bestimmen
            let metar = 'SKC';
            if (cc > 87) metar = 'OVC';
            else if (cc > 50) metar = 'BKN ⚠';
            else if (cc > 25) metar = 'SCT';
            else if (cc > 5)  metar = 'FEW';

            return {
                'Höhe (ft AGL)': heightFt,
                'Druck (hPa)':   pres,
                'Temp (°C)':     temp,
                'Td (°C)':       dew,
                'T-Td (K)':      spread,
                'rh (%)':        rh,
                'CC final (%)':  cc,
                'CC API (%)':    ccApi,
                'CC RH (%)':     ccRh,
                'METAR':         metar
            };
        });

    console.table(tableData);

    // --- Erkannte Schichten (Zusammenfassung) ---
    if (layers.length === 0) {
        console.log('%c-> Ergebnis: SKC (keine Wolken erkannt)', 'color: green; font-weight: bold;');
    } else {
        const layerStr = layers.map(l => {
            const baseFt = Math.round(l.base * FT / 100) * 100;
            const ceiling = l.isCeiling ? ' <- CEILING' : '';
            return `${l.cover} ${String(baseFt).padStart(6)}ft AGL${ceiling}`;
        }).join('\n  ');
        console.log(
            `%c-> Erkannte Schichten:\n  ${layerStr}`,
            'color: #e67e22; font-weight: bold;'
        );

        // Explizite Ceiling-Zusammenfassung für schnellen METAR-Vergleich
        const ceilingLayer = layers.find(l => l.isCeiling);
        if (ceilingLayer) {
            const ceilFt = Math.round(ceilingLayer.base * FT / 100) * 100;
            // METAR-Format: BKN025 = BKN 2500ft -> dreistellig in Hundert Fuß
            const metarCode = `${ceilingLayer.cover}${String(Math.round(ceilFt / 100)).padStart(3, '0')}`;
            console.log(
                `%c-> Ceiling (METAR-Format): ${metarCode}  (${ceilFt} ft AGL)`,
                'color: #e74c3c; font-weight: bold; font-size: 1.1em;'
            );
        } else {
            const baseFt = Math.round(layers[0].base * FT / 100) * 100;
            console.log(
                `%c-> Kein Ceiling. Tiefste Wolke: ${layers[0].cover} ${baseFt}ft AGL`,
                'color: #27ae60; font-weight: bold;'
            );
        }
    }

    console.groupEnd();
}


function calculateDerivedValue(metric, hourly, h, elevation, locationInfo, levelCloud) {
    const summaryKey = metric.summaryKey; // Holen wir uns aus dem Objekt
    try {
        switch (summaryKey) {
            case 'windchill':
                const temp = hourly['temperature_2m'][h];
                const wind_kmh = hourly['wind_speed_10m'][h];
                if (temp === null || wind_kmh === null) return null;
                if (temp > 10 || wind_kmh < 4.8) {
                    return temp;
                }
                const v_pow = Math.pow(wind_kmh, 0.16);
                const chill = 13.12 + 0.6215 * temp - 11.37 * v_pow + 0.3965 * temp * v_pow;
                return chill;
            case 'cloudBase':
            case 'cloudCeiling': {
                // Neuer Pfad: native Modell-Level-Wolkendaten von Michaels Instanz
                // (nur icon_d2/icon_eu, siehe config.js MICHAEL_LEVEL_CLOUD_MODELS).
                // clc ist ICONs eigene Bedeckungsdiagnose je Modell-Level -- direkter
                // und praeziser als die RH-Heuristik auf Druckstufen unten, siehe
                // clouds.js Kopfkommentar. Faellt levelCloud aus (Sondierung
                // fehlgeschlagen, anderes Modell), greift unveraendert der alte Pfad.
                if (levelCloud) {
                    const col = { h: levelCloud.h, clc: levelCloud.clc, nLevels: levelCloud.nLevels };
                    const result = summaryKey === 'cloudBase'
                        ? lowestCloudBase(col, h)
                        : (cloudCeiling(col, h)?.baseM ?? null);
                    // Gleiche Konvention wie der alte Pfad: keine Schicht gefunden
                    // (SKC) UND fehlende Daten münden beide in 99999m (kein Alarm).
                    return result == null ? 99999 : result;
                }

                // Alter Pfad: Druckstufen-Interpolation + RH-Korrektur.
                // Gemeinsame Interpolationslogik für cloudBase UND cloudCeiling.
                // Der Unterschied liegt nur in der Layer-Filterung am Ende.
                // cloudBase  → niedrigste Wolke ab FEW  (alle Layer)
                // cloudCeiling → niedrigste BKN/OVC     (nur Ceiling-Layer)

                // 1. Schwellenwerte analysieren
                const cloudThresholds = analyzeCloudLayers(hourly);
                if (!cloudThresholds || !cloudThresholds[h]) {
                    console.warn(`[${summaryKey}] Schwellenwert-Analyse für Stunde ${h} fehlgeschlagen.`);
                    return null;
                }
                const currentThresholds = cloudThresholds[h];

                // 2. Basis-Daten
                const baseHeight_m = elevation || 0;
                const interpStep = 50;

                // 3. Interpolieren (50-m-Raster, mit RH-Korrektur)
                const interpolatedData = interpolateWeatherData(
                    hourly, h, interpStep, baseHeight_m, 'm', currentThresholds
                );

                // 4. Alle Wolkenschichten finden (FEW, SCT, BKN, OVC)
                // findCloudLayers arbeitet jetzt direkt auf den Druckniveaus (ccLevels),
                // nicht auf dem interpolierten 50m-Raster. Das verhindert Artefakte
                // durch Interpolation zwischen wolkenfreien und bewoelkten Niveaus.
                const allLayers = findCloudLayers(interpolatedData.ccLevels, baseHeight_m);

                // 5. Ergebnis je nach Metrik
                let result;
                if (summaryKey === 'cloudBase') {
                    result = allLayers.length > 0 ? allLayers[0].base : 99999;
                } else {
                    const ceilingLayers = allLayers.filter(l => l.isCeiling);
                    result = ceilingLayers.length > 0 ? ceilingLayers[0].base : 99999;
                }

                // 6. Profil-Log: wird von cloudBase ausgeloest.
                //    Falls cloudBase nicht aktiv ist (kein Grenzwert gesetzt),
                //    uebernimmt cloudCeiling den Log - so gibt es immer genau einen
                //    Log pro Punkt/Stunde, unabhaengig davon welche Metrik aktiv ist.
                const logByBase    = (summaryKey === 'cloudBase');
                const logByCeiling = (summaryKey === 'cloudCeiling') &&
                                     !(locationInfo && locationInfo.cloudBaseActive);
                if (logByBase || logByCeiling) {
                    const timeISO = hourly.time?.[h] ?? `Index ${h}`;
                    const loc = locationInfo || {};
                    logCloudProfile(loc, timeISO, interpolatedData, allLayers, currentThresholds);
                }

                return result;
            }
            default:
                return null;
        }
    } catch (e) {
        console.error(`Fehler bei Berechnung von '${summaryKey}':`, e);
        return null;
    }
}

/**
 * KORRIGIERTE FUNKTION: Nutzt nun findCloudLayers und kümmert sich nur noch um die Formatierung.
 */
function getCloudLayersForMetar(interpolatedData, heightUnit) {
    const layers = Utils.findCloudLayers(interpolatedData);

    if (layers.length === 0) {
        return 'SKC'; // Sky Clear
    }

    return layers.map(layer => {
        const heightInMeters = layer.base;
        let formattedHeight;
        let displayUnit;

        if (heightUnit === 'ft') {
            formattedHeight = Math.round(Utils.convertHeight(heightInMeters, 'ft') / 100) * 100;
            displayUnit = 'ft';
        } else {
            formattedHeight = Math.round(heightInMeters / 50) * 50;
            displayUnit = 'm';
        }
        return `${layer.cover} ${formattedHeight}${displayUnit}`;
    }).join(', ');
}

// -----------------------------------------------------------
// 4. EXPORTIERTE HELFER: SETUP
// -----------------------------------------------------------

/**
 * Erstellt ein leeres Summary-Objekt (Feature-komplett)
 * NEU: Wird dynamisch aus METRICS_CONFIG generiert.
 */
export function getEmptySummary() {
    const summary = {
        combined: { triggered: false, hourlyStatus: {} },
        error: null
    };

    // Iteriere über die Config und erstelle für jeden Eintrag ein leeres Objekt
    for (const metric of Object.values(METRICS_CONFIG)) {
        const key = metric.summaryKey;
        if (!summary[key]) {
            summary[key] = {
                triggered: false,
                // 'max' (wind, cloud, precip) startet bei 0 (oder -Infinity)
                // 'min' (temp, vis) startet bei 999 (oder +Infinity)
                value: (metric.checkType === 'min') ? Infinity : -Infinity,
                hourlyStatus: {},
                hourlyAlarms: {},
                hourlyData: []
            };
            // Korrigiere die Startwerte für die Anzeige (damit nicht "Infinity" angezeigt wird)
            if (metric.checkType === 'min') {
                if (key === 'temp') summary[key].value = 999;
                if (key === 'vis') summary[key].value = 99999;
            } else if (metric.checkType === 'code_match') {
                // NEU: Startwert für SigWx (0 = 'NSW')
                summary[key].value = 0;
            } else {
                summary[key].value = 0;
            }
        }
    }

    // Überschreibe 'value' mit 'min'/'max' für Abwärtskompatibilität (falls ui.js/map.js es noch nutzt)
    // HINWEIS: Wir sollten später auf .value umstellen.
    Object.values(METRICS_CONFIG).forEach(metric => {
        if (metric.checkType === 'min') {
            summary[metric.summaryKey].min = summary[metric.summaryKey].value;
        } else {
            summary[metric.summaryKey].max = summary[metric.summaryKey].value;
        }
    });

    return summary;
}

/**
 * Berechnet die Sampling-Punkte (graue Punkte) für ein GeoJSON.
 * NEU: Mit variabler Auflösung und Sicherheitsventil (Max 200 Punkte).
 */
export function getGridPoints(geojson, resolutionKm) {
    // KUGELSICHERER CHECK
    if (!geojson || !geojson.geometry) {
        return { error: "Ungültiges GeoJSON (vielleicht null)." };
    }

    try {
        const bbox = turf.bbox(geojson); // [minLon, minLat, maxLon, maxLat]
        const MAX_POINTS = 200; // Unser Sicherheitsventil

        // 1. Startwert für Rastergröße (in km)
        // Nutze übergebene Auflösung oder Standard 10km
        let cellSide = resolutionKm || 10;

        let gridPoints = null;
        let attempts = 0;

        // 2. Schleife: Raster vergrößern, bis wir unter dem Limit sind
        while (true) {
            const options = { units: 'kilometers' };

            // Erstelle Raster
            const pointGrid = turf.pointGrid(bbox, cellSide, options);

            // Filtere Punkte innerhalb des Polygons
            const pointsInside = turf.pointsWithinPolygon(pointGrid, geojson);

            const count = pointsInside.features.length;

            // Check: Haben wir wenige genug Punkte? (Oder Notbremse nach 10 Versuchen)
            if (count <= MAX_POINTS || attempts > 10) {
                gridPoints = pointsInside;
                if (attempts > 0) {
                    console.warn(`[getGridPoints] Sicherheitsventil aktiv! Auflösung von ${resolutionKm}km auf ${cellSide.toFixed(1)}km reduziert, um ${count} Punkte zu erhalten.`);
                } else {
                    console.log(`[getGridPoints] Raster berechnet: ${cellSide}km Auflösung -> ${count} Punkte.`);
                }
                break;
            }

            // Falls zu viele Punkte: Raster vergrößern (z.B. * 1.5) und nochmal versuchen
            cellSide = cellSide * 1.5;
            attempts++;
        }

        return { gridPoints: gridPoints };

    } catch (e) {
        console.error("Turf.js Fehler in getGridPoints:", e);
        return { error: "Turf.js Fehler" };
    }
}

/**
 * Prüft die "flache" Array-Antwort des Sampling-Ansatzes.
 * NEU: Komplett dynamisch basierend auf METRICS_CONFIG.
 */
function checkThresholds_Sampling(profile, locationsData, activeMetrics, forecastDay, modelInfo) {
    const rules = profile.rules;
    const summary = getEmptySummary();
    const hourOffset = (forecastDay || 0) * 24;

    const metrics = activeMetrics || Object.values(METRICS_CONFIG);

    if (!locationsData || locationsData.length === 0) {
        return Object.assign(getEmptySummary(), { error: "Keine API-Daten empfangen." });
    }

    console.log(`[DEBUG 4] Engine empfängt. forecastDay: ${forecastDay}, Berechneter Offset: ${hourOffset}`);

    const firstValidEntry = locationsData.find(loc => loc && loc.hourly && loc.hourly.time);

    if (!firstValidEntry || !firstValidEntry.hourly || !firstValidEntry.hourly.time || firstValidEntry.hourly.time.length < (hourOffset + 24)) {
        console.error(`[weather.js] API-Daten für Tag ${forecastDay} nicht verfügbar. (Offset: ${hourOffset}, Benötigt: ${hourOffset + 24}, Verfügbar: ${firstValidEntry?.hourly?.time?.length})`);
        return Object.assign(getEmptySummary(), { error: `Prognosedaten für Tag ${forecastDay + 1} nicht verfügbar.` });
    }

    const timeStamps = firstValidEntry.hourly.time.map(t => new Date(t + 'Z').getUTCHours());

    // Schritt 1: Initialisiere alle hourlyStatus-Objekte (wichtig für die UI-Stunden-Header)
    timeStamps.slice(0, 24).forEach((hour, h) => {
        const hourString = hour.toString(); // <-- NEU: Key als String
        Object.values(METRICS_CONFIG).forEach(metric => {
            const key = metric.summaryKey;
            summary[key].hourlyStatus[hour] = 'no-data'; // Platzhalter
            summary[key].hourlyAlarms[hour] = new Set();

            // Setze Startwert für Graph-Aggregation
            if (metric.checkType === 'min') {
                summary[key].hourlyData[h] = Infinity;
            } else if (metric.checkType === 'code_match') {
                summary[key].hourlyData[h] = 0; // Startwert 0 für Wetter-Codes (NSW)
            } else {
                summary[key].hourlyData[h] = -Infinity; // Startwert für Max-Checks (Wind, etc.)
            }
        });
        summary.combined.hourlyStatus[hour] = 'no-data';
    });

    const getWorseStatus = (s1, s2) => {
        if (s1 === 'alarm' || s2 === 'alarm') return 'alarm';
        if (s1 === 'warn' || s2 === 'warn') return 'warn';
        if (s1 === 'ok' || s2 === 'ok') return 'ok';
        return 'no-data';
    };

    // Schritt 2: Aggregiere die Graph-Daten (Finde den "schlimmsten" Wert für jede Stunde)
    locationsData.forEach(locationData => {
        if (!locationData || locationData.latitude === null) {
            return; // Überspringe fehlerhafte Datenpunkte
        }

        const hourly = locationData.hourly;
        const daily = locationData.daily;
        const elevation = locationData.elevation;

        const dailyValueCache = {};
        if (daily) {
            for (const metric of metrics.filter(m => m.paramType === 'daily')) {
                if (daily[metric.apiName] && daily[metric.apiName].length > 0) {
                    dailyValueCache[metric.summaryKey] = daily[metric.apiName][0];
                } else {
                    dailyValueCache[metric.summaryKey] = null;
                }
            }
        }

        for (let h = 0; h < 24; h++) {
            const dataIndex = h + hourOffset; // <-- NEU: Echter API-Index

            metrics.forEach(metric => {
                const summaryKey = metric.summaryKey;
                let value = null;

                // 1. WERT ZUWEISEN
                // 1. WERT ZUWEISEN
                if (metric.paramType === 'hourly' || metric.paramType === 'marine_hourly') {
                    const apiName = metric.apiName;
                    const hasData = hourly[apiName] !== undefined && hourly[apiName] !== null;
                    value = hasData ? hourly[apiName][dataIndex] : null;

                } else if (metric.paramType === 'daily') {
                    value = dailyValueCache[summaryKey];

                } else if (metric.paramType === 'derived') {
                    value = calculateDerivedValue(metric, hourly, dataIndex, null, null, null);
                } else if (metric.paramType === 'derived_pressure') {
                    const locInfo = {
                        lat: locationData.latitude,
                        lon: locationData.longitude,
                        elevation_m: elevation,
                        // Log wird von cloudBase ausgeloest - falls cloudBase nicht aktiv ist,
                        // uebernimmt cloudCeiling den Log (verhindert Doppelausgabe).
                        cloudBaseActive: metrics.some(m => m.summaryKey === 'cloudBase'),
                        // Modellname fuer den Profil-Log
                        modelName: modelInfo
                            ? (WEATHER_MODELS.DISPLAY_MAP[modelInfo.apiName] || modelInfo.apiName)
                            : 'unbekannt'
                    };
                    value = calculateDerivedValue(metric, hourly, dataIndex, elevation, locInfo, locationData.levelCloud);
                }

                // Prüft, ob diese Metrik 'maritimeOnly' ist UND ob der aktuelle Punkt 'land' ist.
                if (metric.maritimeOnly === true && locationData.elevation !== 0) {
                    // Dies ist die SST-Metrik, aber der Punkt ist Land (elevation != 0).
                    // Wir setzen den Wert auf 'null', damit er weder Alarme
                    // noch die Graph-Aggregation (Min/Max) beeinflusst.
                    value = null;
                }

                // --- NEU (1B): ALARM-PUNKTE SAMMELN (per-location check) ---
                if (value !== null && isFinite(value)) {
                    
                    // --- KORREKTUR: Regeln zentral holen ---
                    const { alarm: limit_alarm, warn: limit_warn, checkType } = getMetricRules(metric, rules);
                    // --- ENDE KORREKTUR ---
                    
                    const ruleName = metric.ruleName;
                    const locationString = `${locationData.latitude},${locationData.longitude}`;

                    let locationStatus = 'ok';

                    if (checkType === 'min') {
                        if (limit_alarm !== null && value < limit_alarm) locationStatus = 'alarm';
                        else if (limit_warn !== null && value < limit_warn) locationStatus = 'warn';

                    } else if (checkType === 'max') {
                        if (limit_alarm !== null && value > limit_alarm) locationStatus = 'alarm';
                        else if (limit_warn !== null && value > limit_warn) locationStatus = 'warn';

                    } else if (metric.checkType === 'code_match') {
                        // Nutzt die Arrays, die von getMetricRules geliefert wurden
                        const forbiddenCodes_alarm = limit_alarm; 
                        const forbiddenCodes_warn = limit_warn;
                        const valueStr = value.toString();
                        
                        if ((!forbiddenCodes_alarm || forbiddenCodes_alarm.length === 0) &&
                            (!forbiddenCodes_warn || forbiddenCodes_warn.length === 0)) {
                            locationStatus = 'no-data';
                        } else {
                            if (forbiddenCodes_alarm && forbiddenCodes_alarm.includes(valueStr)) {
                                locationStatus = 'alarm';
                            } else if (forbiddenCodes_warn && forbiddenCodes_warn.includes(valueStr)) {
                                locationStatus = 'warn';
                            }
                        }
                    }

                    // Wenn dieser Punkt ausgelöst hat, speichere den Ort
                    if (locationStatus === 'alarm' || locationStatus === 'warn') {
                        const hourString = timeStamps[h].toString(); 

                        if (!summary[summaryKey].hourlyAlarms[hourString]) {
                            summary[summaryKey].hourlyAlarms[hourString] = new Set();
                        }
                        summary[summaryKey].hourlyAlarms[hourString].add(locationString);
                    }
                }

                // 2. GRAPH-AGGREGATION (Maximalwert finden)
                if (value !== null && isFinite(value)) {
                    if (metric.checkType === 'min') {
                        if (value < summary[summaryKey].hourlyData[h]) summary[summaryKey].hourlyData[h] = value;
                    } else { // 'max' ODER 'code_match'
                        if (value > summary[summaryKey].hourlyData[h]) summary[summaryKey].hourlyData[h] = value;
                    }
                }

                // HINWEIS: Der fehlerhafte REGEL-CHECK-Block (der hier war) ist ENTFERNT.
            });
        }
    });

    // Schritt 3: Status (Ampel/Autowarn) aus den (jetzt korrekten) Graph-Daten ableiten
    timeStamps.slice(0, 24).forEach((hour, h) => {
        metrics.forEach(metric => { // Iteriere nur über aktive Metriken
            const summaryKey = metric.summaryKey;

            // 1. Hole den korrekten Max-Wert (z.B. 95) aus den Graph-Daten
            const value = summary[summaryKey].hourlyData[h];

            if (value === null || !isFinite(value) || value === -Infinity || value === Infinity) {
                summary[summaryKey].hourlyStatus[hour] = 'no-data';
                return;
            }

            let currentStatus = 'ok'; // Standard
            const ruleName = metric.ruleName;

            // 2. Status für Ampel ermitteln
            if (metric.checkType === 'min' || metric.checkType === 'max') {
                const limit_alarm = rules[ruleName + '_alarm'];
                const limit_warn = rules[ruleName + '_warn'];

                // --- NEU: DYNAMISCHEN CHECK-TYP LESEN ---
                // 1. Nimm den dynamischen Typ aus dem Profil (z.B. 'min')
                // 2. Wenn nicht vorhanden (null), nimm den statischen Typ aus der Config (z.B. 'max')
                const checkType = rules[metric.ruleName + '_checkType'] || metric.checkType;

                if (limit_alarm === null && limit_warn === null) {
                    currentStatus = 'no-data';
                } else if (checkType === 'min') { // <-- Nutzt die DYNAMISCHE Variable
                    if (limit_alarm !== null && value < limit_alarm) currentStatus = 'alarm';
                    else if (limit_warn !== null && value < limit_warn) currentStatus = 'warn';
                } else { // max (oder alles andere)
                    if (limit_alarm !== null && value > limit_alarm) currentStatus = 'alarm';
                    else if (limit_warn !== null && value > limit_warn) currentStatus = 'warn';
                }
            }
            else if (metric.checkType === 'code_match') {
                const forbiddenCodes_alarm = rules[ruleName + '_alarm'];
                const forbiddenCodes_warn = rules[ruleName + '_warn'];
                const valueStr = value.toString();

                if ((!forbiddenCodes_alarm || forbiddenCodes_alarm.length === 0) &&
                    (!forbiddenCodes_warn || forbiddenCodes_warn.length === 0)) {
                    currentStatus = 'no-data';
                } else {
                    if (forbiddenCodes_alarm && forbiddenCodes_alarm.includes(valueStr)) {
                        currentStatus = 'alarm';
                    } else if (forbiddenCodes_warn && forbiddenCodes_warn.includes(valueStr)) {
                        currentStatus = 'warn';
                    }
                }
            }

            // 3. Status in Ampel setzen
            const hourString = hour.toString(); // <-- NEU: Key als String
            summary[summaryKey].hourlyStatus[hourString] = currentStatus;

            // 4. Header-Wert (für Auto-Warn) und Trigger (für Filter) setzen
            if (currentStatus === 'alarm' || currentStatus === 'warn') {
                summary[summaryKey].triggered = true;

                // Aktualisiere den 'schlimmsten' Wert (für den "Alarm: 95" Text)
                if (metric.checkType === 'min') {
                    if (value < summary[summaryKey].value) summary[summaryKey].value = value;
                } else { // max oder code_match
                    if (value > summary[summaryKey].value) summary[summaryKey].value = value;
                }
            }
        });
    });

    // Schritt 4: Kombi-Zeile (wie bisher, nutzt jetzt korrekten Status)
    timeStamps.slice(0, 24).forEach((hour, h) => {
        const logicMode = rules.logicMode || 'OR';
        let combinedStatus = 'no-data';
        let activeRuleStati = [];

        metrics.forEach(metric => {
            const ruleName = metric.ruleName;
            if ((rules[ruleName + '_alarm'] !== null && rules[ruleName + '_alarm'] !== undefined) ||
                (rules[ruleName + '_warn'] !== null && rules[ruleName + '_warn'] !== undefined) ||
                (rules[ruleName + '_alarm'] && rules[ruleName + '_alarm'].length > 0) || // Für code_match
                (rules[ruleName + '_warn'] && rules[ruleName + '_warn'].length > 0)) { // Für code_match
                activeRuleStati.push(summary[metric.summaryKey].hourlyStatus[hour]);
            }
        });

        if (activeRuleStati.length === 0) {
            combinedStatus = 'no-data';
        } else if (logicMode === 'AND') {
            if (activeRuleStati.some(s => s === 'ok')) {
                combinedStatus = 'ok';
            } else if (activeRuleStati.every(s => s === 'alarm' || s === 'warn')) {
                combinedStatus = activeRuleStati.some(s => s === 'alarm') ? 'alarm' : 'warn';
            } else {
                combinedStatus = 'no-data';
            }
        } else { // OR
            let orStatus = 'no-data';
            activeRuleStati.forEach(status => {
                orStatus = getWorseStatus(orStatus, status);
            });
            combinedStatus = orStatus;
        }

        const hourString = hour.toString(); // <-- NEU: Key als String
        summary.combined.hourlyStatus[hourString] = combinedStatus;
        if (combinedStatus !== 'ok' && combinedStatus !== 'no-data') summary.combined.triggered = true;
    });

    // Abwärtskompatibilität (bleibt)
    Object.values(METRICS_CONFIG).forEach(metric => {
        if (metric.checkType === 'min') {
            summary[metric.summaryKey].min = summary[metric.summaryKey].value;
        } else {
            summary[metric.summaryKey].max = summary[metric.summaryKey].value;
        }
    });

    return summary;
}

// -----------------------------------------------------------
// 5. INTERNE KERNLOGIK: API-FETCH & SCHWELLENWERTPRÜFUNG
// -----------------------------------------------------------

/**
 * Privater Helfer: Holt Rohdaten von der Open-Meteo API für eine deduplizierte
 * Liste von Koordinaten. Schlüssel im Ergebnis entsprechen den *angefragten*
 * Koordinaten (nicht den von der API zurückgegebenen), um Rounding-Probleme zu vermeiden.
 *
 * @param {Array<{lat: number, lon: number}>} allCoords - Koordinaten (dedupliziert)
 * @param {object} apiParams  - Ergebnis von getApiParams()
 * @param {boolean} hasForecastParams
 * @param {boolean} hasMarineParams
 * @param {object|null} modelInfo
 * @param {number} forecastDays
 * @returns {Promise<Map<string, object>>} Map von "lat,lon" -> locationData
 * @throws {Error} mit benutzerfreundlicher Nachricht bei API-Fehler
 */
async function _fetchRawData(allCoords, apiParams, hasForecastParams, hasMarineParams, modelInfo, forecastDays) {
    const CHUNK_SIZE = 50;
    const coordChunks = chunkArray(allCoords, CHUNK_SIZE);
    const rawDataMap = new Map();

    // ── Routing-Entscheidung (einmalig, nicht pro Chunk) ───────────────────
    // Michael nur fuer explizit gelistete ICON-Modelle. KORREKTUR (siehe
    // Bugfix-Notiz unten): urspruenglich stand hier zusaetzlich eine Pruefung
    // auf modelInfo.runTimeISO === 'latest' -- das war ein Fehlschluss.
    // timeSlider.js `fetchLastRunTime()` loest bei JEDER Modellwahl einen
    // konkreten ISO-Zeitstempel des jeweils aktuellsten Laufs auf (fuer den
    // public forecast_run-Parameter, damit alle Chunks eines Profil-Checks
    // konsistent denselben Lauf sehen) -- die App hat KEINE UI, einen
    // aelteren/gepinnten Lauf auszuwaehlen. Der literale String 'latest'
    // kommt nur beim Modell 'auto' oder bei einem meta.json-Fehler vor. Die
    // alte Bedingung war damit praktisch immer falsch und hat JEDEN Request
    // auf public zurueckfallen lassen, unabhaengig vom Modell.
    // Michaels Instanz bekommt ohnehin nie einen forecast_run-Parameter
    // (siehe michaelSurface/michaelClouds-URLs unten) -- sie liefert immer
    // ihren eigenen aktuellsten eingelesenen Lauf.
    const michaelApiName = modelInfo ? modelInfo.apiName : null;
    const useMichael = hasForecastParams && !!michaelApiName && !!MICHAEL_HOSTS[michaelApiName];

    const allHourlyParams = apiParams.forecast.hourly ? apiParams.forecast.hourly.split(',').filter(Boolean) : [];
    let michaelHourly = [];
    let publicOnlyHourly = allHourlyParams;
    if (useMichael) {
        const split = splitHourlyParams(allHourlyParams, MICHAEL_SURFACE_WHITELIST);
        michaelHourly = split.michael;
        publicOnlyHourly = split.publicOnly;
    }

    // Cloud-Level-Band: nur sondieren, wenn cloudBase/cloudCeiling ueberhaupt
    // aktiv ist (erkennbar an *_hPa-Parametern in publicOnlyHourly) UND das
    // Modell native Level-Wolkendaten fuehrt. Schlaegt die Sondierung fehl,
    // bleiben die *_hPa-Parameter in publicOnlyHourly -- der alte
    // Druckstufen-Pfad greift dann unveraendert ueber public.
    const hasCloudPressureParams = publicOnlyHourly.some(p => p.endsWith('hPa'));
    let cloudBand = null;
    if (useMichael && hasCloudPressureParams && MICHAEL_LEVEL_CLOUD_MODELS.has(michaelApiName) && allCoords.length > 0) {
        cloudBand = await ensureCloudBand(michaelApiName, allCoords[0]);
        if (cloudBand) {
            // *_hPa-Parameter UND ihre Oberflaechen-Abhaengigkeit surface_pressure
            // (siehe metricsConfig.js cloudBase/cloudCeiling apiName-Liste) werden
            // beide nur vom ALTEN Druckstufen-Pfad gebraucht -- beim neuen
            // Level-Pfad (col = {h, clc, nLevels}) unbenutzt. surface_pressure
            // matcht die MICHAEL_SURFACE_WHITELIST nicht und wuerde sonst pro
            // Chunk einen eigenen (kleinen, aber unnoetigen) Public-Request
            // ausloesen.
            publicOnlyHourly = publicOnlyHourly.filter(p => !p.endsWith('hPa') && p !== 'surface_pressure');
        }
    }

    for (const chunk of coordChunks) {
        const lats = chunk.map(c => c.lat.toFixed(4)).join(',');
        const lons = chunk.map(c => c.lon.toFixed(4)).join(',');
        // Schlüssel nach Anfrage-Reihenfolge – nicht nach API-Rückgabe (verhindert Rounding-Mismatch)
        const keys = chunk.map(c => `${c.lat.toFixed(4)},${c.lon.toFixed(4)}`);

        const jobs = {};

        if (useMichael && michaelHourly.length > 0) {
            const url = `${MICHAEL_HOSTS[michaelApiName]}/v1/forecast?latitude=${lats}&longitude=${lons}&forecast_days=${forecastDays}&hourly=${michaelHourly.join(',')}&models=${michaelApiName}`;
            jobs.michaelSurface = fetchDirect(url);
        }

        if (hasForecastParams && (!useMichael || publicOnlyHourly.length > 0 || apiParams.forecast.daily.length > 0)) {
            let forecastUrl = `${API_URLS.FORECAST}?latitude=${lats}&longitude=${lons}&forecast_days=${forecastDays}`;
            const hourlyForPublic = useMichael ? publicOnlyHourly.join(',') : apiParams.forecast.hourly;
            if (hourlyForPublic.length > 0) forecastUrl += `&hourly=${hourlyForPublic}`;
            if (apiParams.forecast.daily.length > 0) forecastUrl += `&daily=${apiParams.forecast.daily}`;
            // 'models=auto' ist bei der oeffentlichen API KEIN gueltiger Wert
            // (Fehler: "Cannot initialize MultiDomains from invalid String
            // value auto") -- das Weglassen des Parameters bewirkt dasselbe
            // (automatische Modellwahl). Vorbestehender Bug, unabhaengig von
            // der Michael-Anbindung -- getApiParams() setzt 'auto' immer,
            // wenn kein Modell explizit gewaehlt ist.
            if (apiParams.forecast.models !== 'auto') {
                forecastUrl += `&models=${apiParams.forecast.models}`;
            }
            if (modelInfo && modelInfo.apiName !== 'auto' && modelInfo.runTimeISO) {
                forecastUrl += `&forecast_run=${modelInfo.runTimeISO}`;
            }
            jobs.publicSurface = RequestQueue.fetch(forecastUrl);
        }

        if (hasMarineParams) {
            let marineUrl = `${API_URLS.MARINE}?latitude=${lats}&longitude=${lons}&forecast_days=${forecastDays}`;
            marineUrl += `&hourly=${apiParams.marine.hourly}`;
            marineUrl += `&models=${apiParams.marine.models}`;
            jobs.marine = RequestQueue.fetch(marineUrl);
        }

        if (cloudBand) {
            const vars = cloudBand.levels.flatMap(l => [`cloud_cover_level${l}`, `height_agl_level${l}`]).join(',');
            const url = `${MICHAEL_HOSTS[michaelApiName]}/v1/forecast?latitude=${lats}&longitude=${lons}&forecast_days=${forecastDays}&hourly=${vars}&models=${michaelApiName}`;
            jobs.michaelClouds = fetchDirect(url);
        }

        let mergedLocationsData;
        try {
            const jobNames = Object.keys(jobs);
            const responses = await Promise.all(jobNames.map(name => jobs[name]));

            for (const response of responses) {
                if (!response.ok) {
                    throw new Error(`API-Fehler bei Chunk: ${response.statusText}`);
                }
            }

            const allData = await Promise.all(responses.map(res => res.json()));
            const byName = {};
            jobNames.forEach((name, i) => { byName[name] = allData[i]; });

            const asArray = (json) => (json == null ? [] : (Array.isArray(json) ? json : [json]));
            const michaelSurfaceData = asArray(byName.michaelSurface);
            const publicSurfaceData = asArray(byName.publicSurface);
            const marineData = asArray(byName.marine);
            const michaelCloudsData = asArray(byName.michaelClouds);

            // Basis-Array liefert latitude/longitude/elevation -- bevorzugt
            // Michael-Oberflächendaten, sonst public, sonst marine (falls nur
            // Marine-Parameter aktiv sind, wie im alten Code).
            const baseData = michaelSurfaceData.length ? michaelSurfaceData
                : publicSurfaceData.length ? publicSurfaceData
                    : marineData;

            mergedLocationsData = baseData.map((entry, i) => {
                if (!entry) return entry;
                const merged = { ...entry, hourly: { ...(entry.hourly || {}) } };
                if (baseData !== michaelSurfaceData && michaelSurfaceData[i]?.hourly) {
                    merged.hourly = { ...merged.hourly, ...michaelSurfaceData[i].hourly };
                }
                if (baseData !== publicSurfaceData && publicSurfaceData[i]?.hourly) {
                    merged.hourly = { ...merged.hourly, ...publicSurfaceData[i].hourly };
                }
                if (baseData !== marineData && marineData[i]?.hourly) {
                    merged.hourly = { ...merged.hourly, ...marineData[i].hourly };
                }
                if (michaelCloudsData[i]?.hourly && cloudBand) {
                    merged.levelCloud = buildLevelCloud(michaelCloudsData[i].hourly, cloudBand);
                }
                return merged;
            });

            if (mergedLocationsData[0] && mergedLocationsData[0].error) {
                throw new Error(`Open-Meteo API-Fehler: ${mergedLocationsData[0].reason}`);
            }

        } catch (err) {
            console.error("Fehler beim Abrufen eines Tiling-Stapels:", err);
            showApiErrorToast('Wetterdaten konnten nicht geladen werden.');
            const userMessage = (err.name === 'AbortError' || err.message.includes('Timeout'))
                ? 'API-Timeout: Server antwortet nicht.'
                : (err.name === 'TypeError' || err.message.toLowerCase().includes('fetch'))
                    ? 'Keine Verbindung zum Server. Internetverbindung prüfen.'
                    : err.message;
            throw new Error(userMessage);
        }

        // Ergebnisse nach Anfrage-Reihenfolge speichern
        for (let i = 0; i < chunk.length; i++) {
            if (mergedLocationsData[i]) {
                rawDataMap.set(keys[i], mergedLocationsData[i]);
            }
        }
    }

    return rawDataMap;
}

export async function fetchAndCheckProfile(profile, modelInfo, gridPoints, activeMetrics, forecastDay) {
    // 1. Cache-Schlüssel
    // WICHTIG: runTimeISO wird NICHT in den Key aufgenommen, da sie sich alle 6h ändert
    // und den Cache damit nutzlos machen würde. Der Timestamp im Cache-Eintrag
    // reicht aus, um veraltete Daten zu erkennen.
    const modelApiName = modelInfo ? modelInfo.apiName : 'auto';
    const cacheKey = `${profile.id}_${modelApiName}_day${forecastDay || 0}`;

    // 2. Cache-Prüfung
    try {
        const cachedData = await getCache(cacheKey);
        const THIRTY_MINUTES = 30 * 60 * 1000;
        if (cachedData && (Date.now() - cachedData.timestamp < THIRTY_MINUTES)) {
            console.log(`%cDATEN AUS CACHE GELADEN: ${cacheKey}`, "color: green; font-weight: bold;");
            return cachedData.summary;
        }
    } catch (e) {
        console.warn("Cache-Lesefehler:", e);
    }

    // 3. Cache "kalt" (Unverändert)
    console.warn(`%cCACHE KALT. FÜHRE LIVE-FETCH AUS: ${cacheKey}`, "color: orange;");

    if (!gridPoints || !gridPoints.features || gridPoints.features.length === 0) {
        return { error: "Keine Sampling-Punkte zum Abfragen.", ...getEmptySummary() };
    }

    // 4. API-Parameter holen
    const metricsForParams = activeMetrics || Object.values(METRICS_CONFIG);
    const apiParams = getApiParams(metricsForParams, modelInfo);
    const hasForecastParams = apiParams.forecast.hourly.length > 0 || apiParams.forecast.daily.length > 0;
    const hasMarineParams = apiParams.marine.hourly.length > 0;

    // 5. forecastDays berechnen
    let forecastDays = getModelMaxDays(modelApiName);
    if (modelApiName !== 'auto' && WEATHER_MODELS.MODEL_PROPERTIES[modelApiName]) {
        forecastDays = WEATHER_MODELS.MODEL_PROPERTIES[modelApiName].maxDays || 7;
    } else if (modelApiName !== 'auto') {
        console.warn(`[weather.js] Modell ${modelApiName} nicht in MODEL_PROPERTIES gefunden. Nutze Standard ${forecastDays} Tage.`);
    }
    console.log(`[weather.js] Angeforderte Prognosetage für ${modelApiName}: ${forecastDays}`);

    // 6. Koordinaten extrahieren und Rohdaten gebündelt abrufen
    const coords = gridPoints.features.map(p => ({
        lat: p.geometry.coordinates[1],
        lon: p.geometry.coordinates[0]
    }));
    console.log(`Starte Tiling-Fetch: ${coords.length} Punkte...`);

    let rawDataMap;
    try {
        rawDataMap = await _fetchRawData(coords, apiParams, hasForecastParams, hasMarineParams, modelInfo, forecastDays);
    } catch (err) {
        return Object.assign(getEmptySummary(), { error: err.message });
    }

    const allApiResponses = coords
        .map(c => rawDataMap.get(`${c.lat.toFixed(4)},${c.lon.toFixed(4)}`))
        .filter(Boolean);

    // 7. Daten auswerten
    console.log(`Tiling-Fetch beendet. ${allApiResponses.length} Punkte geladen.`);
    const finalSummary = checkThresholds_Sampling(profile, allApiResponses, activeMetrics, forecastDay, modelInfo);
    // 7. Cache speichern (Unverändert)
    try {
        await setCache(cacheKey, finalSummary);
    } catch (e) {
        console.warn("Cache-Schreibfehler:", e);
    }

    // 8. Fertig (Unverändert)
    return finalSummary;
}

/**
 * Holt Wetterdaten für mehrere Profile in einem gebündelten API-Aufruf.
 * Koordinaten werden über alle Profile dedupliziert; Metriken werden vereinigt.
 * So wird die Open-Meteo API bei vielen Profilen deutlich weniger belastet.
 *
 * @param {Array<{profile: object, gridPoints: object, activeMetrics: Array}>} profileEntries
 * @param {object|null} modelInfo  - { apiName, runTimeISO }
 * @param {number} forecastDay
 * @returns {Promise<Map<number, object>>} Map von profileId -> summary
 */
export async function batchFetchProfiles(profileEntries, modelInfo, forecastDay) {
    const modelApiName = modelInfo ? modelInfo.apiName : 'auto';
    const THIRTY_MINUTES = 30 * 60 * 1000;
    const resultMap = new Map();

    // 1. Cache-Prüfung: gecachte Profile sofort auflösen
    const uncachedEntries = [];
    for (const entry of profileEntries) {
        const cacheKey = `${entry.profile.id}_${modelApiName}_day${forecastDay || 0}`;
        try {
            const cachedData = await getCache(cacheKey);
            if (cachedData && (Date.now() - cachedData.timestamp < THIRTY_MINUTES)) {
                console.log(`%cDATEN AUS CACHE GELADEN: ${cacheKey}`, "color: green; font-weight: bold;");
                resultMap.set(entry.profile.id, cachedData.summary);
                continue;
            }
        } catch (e) {
            console.warn("Cache-Lesefehler:", e);
        }
        uncachedEntries.push(entry);
    }

    if (uncachedEntries.length === 0) return resultMap;

    // 2. Einzigartige Koordinaten über alle ungecachten Profile sammeln
    const coordSet = new Map(); // "lat,lon" -> { lat, lon }
    for (const entry of uncachedEntries) {
        for (const feature of (entry.gridPoints?.features || [])) {
            const lat = feature.geometry.coordinates[1];
            const lon = feature.geometry.coordinates[0];
            const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
            if (!coordSet.has(key)) coordSet.set(key, { lat, lon });
        }
    }
    const allUniqueCoords = Array.from(coordSet.values());
    const totalPoints = uncachedEntries.reduce((s, e) => s + (e.gridPoints?.features?.length || 0), 0);
    console.log(`[batchFetchProfiles] ${uncachedEntries.length} Profile ohne Cache – ${allUniqueCoords.length} einzigartige Koordinaten (von ${totalPoints} gesamt).`);

    // 3. Vereinigung aller aktiven Metriken
    const seenMetrics = new Set();
    const unionMetrics = [];
    for (const entry of uncachedEntries) {
        for (const metric of (entry.activeMetrics || Object.values(METRICS_CONFIG))) {
            if (!seenMetrics.has(metric.summaryKey)) {
                seenMetrics.add(metric.summaryKey);
                unionMetrics.push(metric);
            }
        }
    }

    // 4. API-Parameter und forecastDays
    const apiParams = getApiParams(unionMetrics, modelInfo);
    const hasForecastParams = apiParams.forecast.hourly.length > 0 || apiParams.forecast.daily.length > 0;
    const hasMarineParams = apiParams.marine.hourly.length > 0;

    let forecastDays = getModelMaxDays(modelApiName);
    if (modelApiName !== 'auto' && WEATHER_MODELS.MODEL_PROPERTIES[modelApiName]) {
        forecastDays = WEATHER_MODELS.MODEL_PROPERTIES[modelApiName].maxDays || 7;
    } else if (modelApiName !== 'auto') {
        console.warn(`[batchFetchProfiles] Modell ${modelApiName} nicht in MODEL_PROPERTIES gefunden. Nutze Standard ${forecastDays} Tage.`);
    }

    // 5. Einmaliger API-Aufruf für alle einzigartigen Koordinaten
    let rawDataMap;
    try {
        rawDataMap = await _fetchRawData(allUniqueCoords, apiParams, hasForecastParams, hasMarineParams, modelInfo, forecastDays);
    } catch (err) {
        console.error("[batchFetchProfiles] Fetch fehlgeschlagen:", err.message);
        for (const entry of uncachedEntries) {
            resultMap.set(entry.profile.id, Object.assign(getEmptySummary(), { error: err.message }));
        }
        return resultMap;
    }

    // 6. Pro Profil: passende Datenpunkte filtern und Summary berechnen
    for (const entry of uncachedEntries) {
        const { profile, gridPoints, activeMetrics } = entry;

        const profileLocationsData = (gridPoints?.features || [])
            .map(f => {
                const lat = f.geometry.coordinates[1];
                const lon = f.geometry.coordinates[0];
                return rawDataMap.get(`${lat.toFixed(4)},${lon.toFixed(4)}`);
            })
            .filter(Boolean);

        if (profileLocationsData.length === 0) {
            resultMap.set(profile.id, Object.assign(getEmptySummary(), { error: "Keine API-Daten für dieses Profil." }));
            continue;
        }

        console.log(`[batchFetchProfiles] Summary für "${profile.name}" (${profileLocationsData.length} Punkte).`);
        const finalSummary = checkThresholds_Sampling(profile, profileLocationsData, activeMetrics, forecastDay, modelInfo);

        const cacheKey = `${profile.id}_${modelApiName}_day${forecastDay || 0}`;
        try { await setCache(cacheKey, finalSummary); } catch (e) { console.warn("Cache-Schreibfehler:", e); }

        resultMap.set(profile.id, finalSummary);
    }

    return resultMap;
}

/**
 * Prüft, ob ein einzelner Punkt (turf Point-Feature) innerhalb irgendeines
 * der vereinfachten Landflaechen-Polygone liegt (LAND_POLYGONS, siehe
 * landPolygons.js).
 */
function isPointOverLand(pointFeature) {
    for (const landFeature of LAND_POLYGONS.features) {
        if (turf.booleanPointInPolygon(pointFeature, landFeature)) return true;
    }
    return false;
}

/**
 * Prüft Land/See-Punkte rein geometrisch (lokale Küstenlinien-Polygone,
 * siehe landPolygons.js), OHNE API-Aufruf.
 *
 * Vorher: ein Open-Meteo-Elevation-API-Request pro gezeichnetem Prüfgebiet
 * (Höhe 0 an irgendeinem Sampling-Punkt -> als "See" gewertet). Das war der
 * letzte verbliebene, nicht auf Michael umleitbare public-Aufruf im
 * Zeichnen-Flow (Michaels /v1/elevation liefert nachweislich nur 'nan') und
 * trug zu den 429ern bei. Eine reine Ja/Nein-Frage ("liegt irgendein Punkt
 * des Gebiets im Wasser?") braucht aber gar keine echte Höhenauflösung --
 * turf.booleanPointInPolygon gegen eine (fuer Europa/Nordatlantik
 * zugeschnittene) Natural-Earth-Küstenlinie ist dafür präzise genug, läuft
 * synchron und komplett ohne Netzwerk.
 */
export async function performLandSeaCheck(geojson) {

    // 1. Grid-Punkte holen
    const { gridPoints, error } = getGridPoints(geojson);
    if (error) {
        return { error };
    }
    if (!gridPoints || gridPoints.features.length === 0) {
        return { error: "Keine Grid-Punkte im gezeichneten Gebiet gefunden." };
    }

    // 2. Wir testen einen Stapel von Punkten (max 50, wie zuvor)
    const pointsToTest = gridPoints.features.slice(0, 50);

    try {
        const isMaritime = pointsToTest.some(p => !isPointOverLand(p));
        return { isMaritime };
    } catch (err) {
        console.error("Fehler bei performLandSeaCheck:", err);
        showToast('Land/See-Pruefung fehlgeschlagen.', 'warning');
        return { error: err.message };
    }
}