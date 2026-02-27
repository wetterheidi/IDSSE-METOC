// docs/utils.js
// Sammlung von meteorologischen und mathematischen Hilfsfunktionen

// -----------------------------------------------------------
// 1. IMPORTS & KONSTANTEN
// -----------------------------------------------------------
import { METRICS_CONFIG } from './metricsConfig.js';

/**
 * Standard-Druckstufen (zur Referenz, auch wenn nicht alle Modelle sie haben)
 */
export const STANDARD_PRESSURE_LEVELS = [
    1000, 975, 950, 925, 900, 875, 850, 825, 800, 
    775, 750, 725, 700, 650, 600, 550, 500, 475, 
    450, 425, 400, 375, 350, 325, 300, 275, 250, 200
];


// -----------------------------------------------------------
// 2. MATHEMATISCHE & ALLGEMEINE HELFER (Wind, Druck, Interpolation)
// -----------------------------------------------------------

/**
 * Führt eine lineare Interpolation für einen gegebenen Wert durch.
 * ROBUSTE VERSION: Diese Funktion kann sowohl mit aufsteigenden (z.B. Höhe)
 * als auch mit absteigenden (z.B. Druck) Vektoren umgehen.
 *
 * @param {number[]} xVector - Der Vektor der Stützstellen (Höhen oder Drücke).
 * @param {number[]} yVector - Der Vektor der zu interpolierenden Werte (Temps, etc.).
 * @param {number} xValue - Der Wert, für den ein y-Wert gefunden werden soll.
 * @returns {number|null} Der interpolierte y-Wert oder null bei Fehler/Extrapolation.
 */
export function linearInterpolate(xVector, yVector, xValue) {
    if (!xVector?.length || !yVector?.length || xVector.length !== yVector.length) {
        return null;
    }

    const n = xVector.length;
    if (n < 2) return null; // Brauchen mindestens zwei Punkte

    // Prüfe die Sortierrichtung (aufsteigend oder absteigend)
    const isAscending = xVector[1] > xVector[0];

    // 1. Prüfe auf Extrapolation (außerhalb der Grenzen)
    if (isAscending) {
        if (xValue < xVector[0] || xValue > xVector[n - 1]) {
            return null; // Keine Extrapolation
        }
    } else {
        if (xValue > xVector[0] || xValue < xVector[n - 1]) {
            return null; // Keine Extrapolation
        }
    }

    // 2. Finde das korrekte Segment
    try {
        if (isAscending) {
            // Behandle aufsteigende Vektoren (z.B. Höhe)
            for (let i = 1; i < n; i++) {
                if (xValue <= xVector[i]) {
                    // xValue liegt zwischen [i-1] und [i]
                    const [x0, x1] = [xVector[i - 1], xVector[i]];
                    const [y0, y1] = [yVector[i - 1], yVector[i]];
                    return y0 + (y1 - y0) * (xValue - x0) / (x1 - x0);
                }
            }
        } else { // Absteigend
            // Behandle absteigende Vektoren (z.B. Druck)
            for (let i = 1; i < n; i++) {
                if (xValue >= xVector[i]) {
                    // xValue liegt zwischen [i-1] und [i]
                    const [x0, x1] = [xVector[i - 1], xVector[i]];
                    const [y0, y1] = [yVector[i - 1], yVector[i]];
                    return y0 + (y1 - y0) * (xValue - x0) / (x1 - x0);
                }
            }
        }
    } catch (error) {
        return null; // Fehler bei der Berechnung (z.B. Division durch 0)
    }

    // Fallback, wenn xValue exakt dem letzten Punkt entspricht (bei aufsteigend)
    if (isAscending && xValue === xVector[n - 1]) return yVector[n - 1];
    // Fallback, wenn xValue exakt dem letzten Punkt entspricht (bei absteigend)
    if (!isAscending && xValue === xVector[n - 1]) return yVector[n - 1];

    return null; // Sollte nicht erreicht werden
}

/**
 * Berechnet den Taupunkt anhand von Temperatur und relativer Luftfeuchtigkeit.
 * @param {number} temp - Die Temperatur in Grad Celsius.
 * @param {number} rh - Die relative Luftfeuchtigkeit in Prozent (z.B. 75).
 * @returns {number|null} Der berechnete Taupunkt in Grad Celsius.
 */
export function calculateDewpoint(temp, rh) {
    const aLiquid = 17.27;
    const bLiquid = 237.7;
    const aIce = 21.87;
    const bIce = 265.5;

    let alpha, dewpoint;
    if (temp >= 0) {
        alpha = (aLiquid * temp) / (bLiquid + temp) + Math.log(rh / 100);
        dewpoint = (bLiquid * alpha) / (aLiquid - alpha);
    } else {
        alpha = (aIce * temp) / (bIce + temp) + Math.log(rh / 100);
        dewpoint = (bIce * alpha) / (aIce - alpha);
    }
    return isNaN(dewpoint) ? null : dewpoint; // Return number or null if invalid
}

/**
 * Berechnet die Windrichtung aus U/V-Komponenten.
 * @param {number} u - U-Komponente
 * @param {number} v - V-Komponente
 * @returns {number} Windrichtung in Grad (meteorologisch)
 */
export function windDirection(u, v) {
    if (u === null || v === null) return null;
    let dir = Math.atan2(-u, -v) * 180 / Math.PI;
    return (dir + 360) % 360;
}

/**
 * Berechnet die Windgeschwindigkeit aus U/V-Komponenten.
 * @param {number} u - U-Komponente
 * @param {number} v - V-Komponente
 * @returns {number} Windgeschwindigkeit
 */
export function windSpeed(u, v) {
    if (u === null || v === null) return null;
    return Math.sqrt(u * u + v * v);
}

/**
 * Interpoliert den Luftdruck für eine gegebene Höhe basierend auf bekannten Druckleveln.
 * (Deine erprobte Version)
 * @param {number} height - Die Zielhöhe in Metern.
 * @param {number[]} pressureLevels - Array der bekannten Druckstufen in hPa.
 * @param {number[]} heights - Array der zugehörigen Höhen in Metern.
 * @returns {number|string} Der interpolierte Druck in hPa oder 'N/A'.
 */
export function interpolatePressure(height, pressureLevels, heights) {
    if (!pressureLevels || !heights || pressureLevels.length !== heights.length || pressureLevels.length < 2) {
        return null;
    }

    // Assume pressures and heights are already paired correctly (heights ascending, pressures descending)
    if (height < heights[0] || height > heights[heights.length - 1]) {
        return null; // No extrapolation
    }

    // Logarithmische Interpolation: Druck nimmt exponentiell mit der Hoehe ab.
    // p(z) = exp( log(p0) + (log(p1) - log(p0)) * (z - z0) / (z1 - z0) )
    for (let i = 0; i < heights.length - 1; i++) {
        if (height >= heights[i] && height <= heights[i + 1]) {
            const h0 = heights[i], h1 = heights[i + 1];
            const p0 = pressureLevels[i], p1 = pressureLevels[i + 1];
            if (p0 <= 0 || p1 <= 0) return null; // Sicherheitscheck fuer log()
            const fraction = (height - h0) / (h1 - h0);
            return Math.exp(Math.log(p0) + (Math.log(p1) - Math.log(p0)) * fraction);
        }
    }
    return null;
};

export function interpolateWindAtAltitude(z, pressureLevels, heights, uComponents, vComponents) {
    if (pressureLevels.length != heights.length || pressureLevels.length != uComponents.length || pressureLevels.length != vComponents.length) {
        return { u: null, v: null };
    }

    // Annahme: pressureLevels ist absteigend (1000, 950...).
    // Annahme: heights ist aufsteigend (500, 1000...).
    
    const log_pressureLevels = pressureLevels.map(p => Math.log(p));
    // Erstelle eine aufsteigende Version von log(P) für die H-vs-log(P)-Interpolation
    const log_pressureLevels_reversed = [...log_pressureLevels].reverse();

    // Schritt 1: Finde p(z) durch Interpolation von Höhe (aufsteigend) gegen log(P) (aufsteigend)
    const log_p_z = linearInterpolate(heights, log_pressureLevels_reversed, z);
    
    if (log_p_z === null) {
        return { u: null, v: null };
    }
    const p_z = Math.exp(log_p_z);

    // Schritt 2: Interpoliere u und v bei p(z) mittels log(p) (absteigend)
    const u_z = linearInterpolate(log_pressureLevels, uComponents, Math.log(p_z));
    const v_z = linearInterpolate(log_pressureLevels, vComponents, Math.log(p_z));
    
    if (u_z === null || v_z === null) {
        return { u: null, v: null };
    }

    // KORREKTUR: Der Tippfehler ist hier behoben.
    return { u: u_z, v: v_z };
}

// -----------------------------------------------------------
// 3. WOLKENSCHICHT LOGIK
// -----------------------------------------------------------

/**
 * Analysiert die Roh-Wetterdaten, um für jeden Zeitpunkt dynamische
 * Feuchtigkeitsschwellenwerte für die Wolkenerkennung zu bestimmen.
 * @param {object} weatherData - Das 'hourly' Objekt aus der API-Antwort.
 * @returns {object[]} Ein Array von Schwellenwert-Objekten für jeden Zeitpunkt.
 */
export function analyzeCloudLayers(weatherData) {
    if (!weatherData || !weatherData.time || weatherData.time.length === 0) {
        return [];
    }

    // Ermittle die tatsächlich vorhandenen Druckstufen aus den API-Daten.
    // Das macht die Funktion robust gegenüber Modellen mit unterschiedlichen Levels
    // (z.B. ECMWF hat keine 950/925/900 hPa, ICON-D2 hat sie alle).
    const availablePressureLevels = Object.keys(weatherData)
        .map(key => { const m = key.match(/^geopotential_height_(\d+)hPa$/); return m ? parseInt(m[1]) : null; })
        .filter(Boolean)
        .sort((a, b) => b - a); // Absteigend sortieren (1000 -> 200)

    const thresholds = [];

    for (let i = 0; i < weatherData.time.length; i++) {
        const groundTemp = weatherData.temperature_2m?.[i];
        let stockwerke = { low: [], mid: [], high: [] };

        // 1. Druckstufen den Stockwerken zuordnen – nur mit tatsächlich vorhandenen Levels
        for (const p of availablePressureLevels) {
            const temp = weatherData[`temperature_${p}hPa`]?.[i];
            const height = weatherData[`geopotential_height_${p}hPa`]?.[i];

            if (temp == null || height == null) continue;

            if (groundTemp != null && groundTemp <= 0) { // Sonderfall Kaltluft
                if (height <= 2000) stockwerke.low.push(p);
                else if (temp > -30) stockwerke.mid.push(p);
                else stockwerke.high.push(p);
            } else { // Normalfall
                if (temp > 0) stockwerke.low.push(p);
                else if (temp > -30) stockwerke.mid.push(p);
                else stockwerke.high.push(p);
            }
        }

        // 2. maxCC und RH-Schwelle pro Stockwerk berechnen.
        // Fallback: Wenn für ein Stockwerk keine Levels vorhanden sind (z.B. Modell
        // ohne hohe Druckstufen), nutzen wir einen moderaten Wert statt 95%,
        // damit die Wolkenerkennung nicht komplett ausfällt.
        const getThreshold = (pLevels, defaultHigh, defaultLow) => {
            if (pLevels.length === 0) return 80; // Moderater Fallback (vorher: 95 = zu konservativ)
            const maxCC = Math.max(...pLevels.map(p => weatherData[`cloud_cover_${p}hPa`]?.[i] ?? 0));
            return maxCC > 50 ? defaultHigh : defaultLow;
        };

        thresholds.push({
            low: getThreshold(stockwerke.low, 90, 75),
            mid: getThreshold(stockwerke.mid, 85, 70),
            high: 65 // Fester Wert für hohe Wolken (Cirrus etc.)
        });
    }

    console.log(`[analyzeCloudLayers] Schwellenwerte berechnet. Gefundene Druckstufen: ${availablePressureLevels.join(', ')}`);
    return thresholds;
}

/**
 * Interpoliert die Roh-Wetterdaten für einen bestimmten Zeitpunkt, um eine detaillierte,
 * höhenabhängige Wettertabelle zu erstellen.
 * HINWEIS (ToDo): Diese Funktion ist stark vom globalen `AppState` abhängig. Zukünftig
 * könnte sie so umgestaltet werden, dass sie alle benötigten Daten als Parameter erhält.
 * @param {number} sliderIndex - Der Index des Zeitschiebereglers.
 * @returns {object[]} Ein Array von Objekten mit den Wetterdaten für jede Höhenstufe.
 */
export function interpolateWeatherData(weatherData, sliderIndex, interpStep, baseHeight, heightUnit, currentThresholds) {
    if (!weatherData || !weatherData.time || sliderIndex >= weatherData.time.length) {
        console.warn('No weather data provided or index out of bounds for interpolation');
        return [];
    }

    const allPressureLevels = STANDARD_PRESSURE_LEVELS;

    // Filtere Drucklevel nur, wenn ALLE benötigten Daten für diesen Level vorhanden sind.
    const validPressureLevels = allPressureLevels.filter(hPa => {
        const height = weatherData[`geopotential_height_${hPa}hPa`]?.[sliderIndex];
        // temp und rh werden für die Validierung nicht mehr benötigt
        const speed = weatherData[`wind_speed_${hPa}hPa`]?.[sliderIndex];
        const dir = weatherData[`wind_direction_${hPa}hPa`]?.[sliderIndex];

        // Es werden nur noch die für die Sprungberechnung kritischen Werte geprüft.
        return [height, speed, dir].every(val => val != null);
    });

    const ccPressureLevels = allPressureLevels.filter(hPa => {
        const height = weatherData[`geopotential_height_${hPa}hPa`]?.[sliderIndex];
        const cc = weatherData[`cloud_cover_${hPa}hPa`]?.[sliderIndex];
        return height != null && cc != null;
    });

    console.log(`[interpolateWeatherData] DEBUG: Gefilterte Wolken-Levels (ccPressureLevels):`, ccPressureLevels);

    const ccHeightData = ccPressureLevels.map(hPa => weatherData[`geopotential_height_${hPa}hPa`][sliderIndex]);
    const ccValueData = ccPressureLevels.map(hPa => weatherData[`cloud_cover_${hPa}hPa`][sliderIndex]);

    console.log(`[interpolateWeatherData] DEBUG: Zugehörige Höhen (ccHeightData):`, ccHeightData);
    console.log(`[interpolateWeatherData] DEBUG: Zugehörige Wolkenwerte (ccValueData):`, ccValueData);

    if (validPressureLevels.length < 2) {
        console.warn('Insufficient valid pressure level data for interpolation:', validPressureLevels);
        return [];
    }

    // Sammle die Daten der validen Drucklevel
    let heightData = validPressureLevels.map(hPa => weatherData[`geopotential_height_${hPa}hPa`][sliderIndex]);
    let tempData = validPressureLevels.map(hPa => weatherData[`temperature_${hPa}hPa`][sliderIndex]);
    let rhData = validPressureLevels.map(hPa => weatherData[`relative_humidity_${hPa}hPa`][sliderIndex]);
    let ccData = validPressureLevels.map(hPa => weatherData[`cloud_cover_${hPa}hPa`]?.[sliderIndex]);
    let spdData = validPressureLevels.map(hPa => weatherData[`wind_speed_${hPa}hPa`][sliderIndex]);
    let dirData = validPressureLevels.map(hPa => weatherData[`wind_direction_${hPa}hPa`][sliderIndex]);

    // Füge Bodendaten hinzu, um die Interpolation nach unten hin zu verbessern
    const surfacePressure = weatherData.surface_pressure[sliderIndex];
    if (surfacePressure === null || surfacePressure === undefined) {
        console.warn('Surface pressure missing');
        return [];
    }

    let uComponents = spdData.map((spd, i) => -spd * Math.sin(dirData[i] * Math.PI / 180));
    let vComponents = spdData.map((spd, i) => -spd * Math.cos(dirData[i] * Math.PI / 180));
    const lowestPressureLevel = Math.max(...validPressureLevels);
    const hLowest = weatherData[`geopotential_height_${lowestPressureLevel}hPa`][sliderIndex];
    if (surfacePressure > lowestPressureLevel && Number.isFinite(hLowest)) {
        const stepsBetween = Math.floor((hLowest - baseHeight) / interpStep);

        const uSurface = -weatherData.wind_speed_10m[sliderIndex] * Math.sin(weatherData.wind_direction_10m[sliderIndex] * Math.PI / 180);
        const vSurface = -weatherData.wind_speed_10m[sliderIndex] * Math.cos(weatherData.wind_direction_10m[sliderIndex] * Math.PI / 180);
        const uLowest = uComponents[validPressureLevels.indexOf(lowestPressureLevel)];
        const vLowest = vComponents[validPressureLevels.indexOf(lowestPressureLevel)];

        for (let i = stepsBetween - 1; i >= 1; i--) {
            const h = baseHeight + i * interpStep;
            if (h >= hLowest) continue;
            const fraction = (h - baseHeight) / (hLowest - baseHeight);
            const logPSurface = Math.log(surfacePressure);
            const logPLowest = Math.log(lowestPressureLevel);
            const logP = logPSurface + fraction * (logPLowest - logPSurface);
            const p = Math.exp(logP);

            const logHeight = Math.log(h - baseHeight + 1);
            const logH0 = Math.log(1);
            const logH1 = Math.log(hLowest - baseHeight);
            const u = linearInterpolate([logH0, logH1], [uSurface, uLowest], logHeight);
            const v = linearInterpolate([logH0, logH1], [vSurface, vLowest], logHeight);
            const spd = windSpeed(u, v);
            const dir = windDirection(u, v);

            heightData.unshift(h);
            validPressureLevels.unshift(p);
            tempData.unshift(linearInterpolate([baseHeight, hLowest], [weatherData.temperature_2m[sliderIndex], weatherData[`temperature_${lowestPressureLevel}hPa`][sliderIndex]], h));
            rhData.unshift(linearInterpolate([baseHeight, hLowest], [weatherData.relative_humidity_2m[sliderIndex], weatherData[`relative_humidity_${lowestPressureLevel}hPa`][sliderIndex]], h));
            spdData.unshift(spd);
            dirData.unshift(dir);
            uComponents.unshift(u);
            vComponents.unshift(v);
        }

        heightData.unshift(baseHeight);
        validPressureLevels.unshift(surfacePressure);
        tempData.unshift(weatherData.temperature_2m[sliderIndex]);
        rhData.unshift(weatherData.relative_humidity_2m[sliderIndex]);
        spdData.unshift(weatherData.wind_speed_10m[sliderIndex]);
        dirData.unshift(weatherData.wind_direction_10m[sliderIndex]);
        uComponents.unshift(uSurface);
        vComponents.unshift(vSurface);
    }

    const minPressureIndex = validPressureLevels.indexOf(Math.min(...validPressureLevels));
    const maxHeightASL = heightData[minPressureIndex];
    const maxHeightAGL = maxHeightASL - baseHeight;
    if (maxHeightAGL <= 0 || isNaN(maxHeightAGL)) {
        console.warn('Invalid max height at lowest pressure level:', { maxHeightASL, baseHeight, minPressure: validPressureLevels[minPressureIndex] });
        return [];
    }

    const maxHeightInUnit = heightUnit === 'ft' ? maxHeightAGL * 3.28084 : maxHeightAGL;
    const steps = Math.floor(maxHeightInUnit / interpStep);
    const heightsInUnit = Array.from({ length: steps + 1 }, (_, i) => i * interpStep);

    const interpolatedData = [];
    heightsInUnit.forEach(height => {
        const heightAGLInMeters = heightUnit === 'ft' ? height / 3.28084 : height;
        const heightASLInMeters = baseHeight + heightAGLInMeters;

        let dataPoint;

        // Wolkenbedeckung: Stufen-Interpolation (kein linearer Uebergang).
        //
        // Physikalische Begruendung: Eine Wolkenuntergrenze ist scharf, kein Gradient.
        // Lineare Interpolation zwischen einem wolkenfreien und einem bewoelkten Niveau
        // wuerde eine kuenstliche Untergrenze erzeugen die tiefer als die echte liegt.
        //
        // Stattdessen: Fuer jeden Hoehenpunkt gilt der Wert des naechsttieferen
        // Druckniveaus (= "was war die Bedeckung unmittelbar darunter?").
        // Erst ab dem Niveau selbst gilt dessen Wert.
        //
        // Beispiel: ccHeightData = [111m, 800m, 1500m], ccValueData = [0%, 0%, 100%]
        //   Hoehe  900m -> naechsttieferes Niveau: 800m (0%)  -> cc = 0%
        //   Hoehe 1500m -> genau auf dem Niveau:  1500m (100%) -> cc = 100%
        //   Hoehe 1600m -> naechsttieferes Niveau: 1500m (100%) -> cc = 100%
        let cc = 0;
        if (ccHeightData.length > 0) {
            if (heightASLInMeters < ccHeightData[0]) {
                // Unterhalb des tiefsten CC-Niveaus: 0% (kein Messwert vorhanden).
                // Wir interpolieren NICHT nach unten, da wir nicht wissen ob es
                // unterhalb des tiefsten Niveaus Bewoelkung gibt.
                // Ausnahme: Der Bodenpunkt (AGL=0) wird separat mit cloud_cover befuellt.
                cc = 0;
            } else if (heightASLInMeters >= ccHeightData[ccHeightData.length - 1]) {
                // Oberhalb des hoechsten CC-Niveaus: Wert des hoechsten Niveaus
                cc = ccValueData[ccHeightData.length - 1];
            } else {
                // Dazwischen: Wert des naechsttieferen Niveaus (Stufe von unten)
                for (let ci = ccHeightData.length - 2; ci >= 0; ci--) {
                    if (heightASLInMeters >= ccHeightData[ci]) {
                        cc = ccValueData[ci];
                        break;
                    }
                }
            }
            cc = Math.max(0, Math.min(100, cc)); // Auf 0-100% klemmen
        }

        if (heightAGLInMeters === 0) {
            const surfaceCloudCover = weatherData['cloud_cover']?.[sliderIndex] ?? 0; // Fallback auf 0

            dataPoint = {
                height: heightASLInMeters,
                pressure: surfacePressure,
                temp: weatherData.temperature_2m[sliderIndex],
                rh: weatherData.relative_humidity_2m[sliderIndex],
                cc: surfaceCloudCover,
                spd: weatherData.wind_speed_10m[sliderIndex],
                dir: weatherData.wind_direction_10m[sliderIndex],
                dew: calculateDewpoint(weatherData.temperature_2m[sliderIndex], weatherData.relative_humidity_2m[sliderIndex])
            };
        } else {
            const pressure = interpolatePressure(heightASLInMeters, validPressureLevels, heightData);
            const windComponents = interpolateWindAtAltitude(heightASLInMeters, validPressureLevels, heightData, uComponents, vComponents);
            const spd = windSpeed(windComponents.u, windComponents.v);
            const dir = windDirection(windComponents.u, windComponents.v);
            const temp = linearInterpolate(heightData, tempData, heightASLInMeters);
            const rh = linearInterpolate(heightData, rhData, heightASLInMeters);
            const dew = calculateDewpoint(temp, rh);

            dataPoint = {
                height: heightASLInMeters,
                pressure: Number.isFinite(pressure) ? Number(pressure.toFixed(1)) : 'N/A',
                temp: Number.isFinite(temp) ? Number(temp.toFixed(1)) : 'N/A',
                rh: Number.isFinite(rh) ? Number(rh.toFixed(0)) : 'N/A',
                cc: Number.isFinite(cc) ? Number(cc.toFixed(0)) : 'N/A',
                spd: Number.isFinite(spd) ? Number(spd.toFixed(1)) : 'N/A',
                dir: Number.isFinite(dir) ? Number(dir.toFixed(0)) : 'N/A',
                dew: Number.isFinite(dew) ? Number(dew.toFixed(1)) : 'N/A'
            };
        }

        if (Number.isFinite(dataPoint.temp) && Number.isFinite(dataPoint.rh)) {
            const temp = dataPoint.temp;
            const rh = dataPoint.rh;
            const groundTemp = weatherData.temperature_2m[sliderIndex];

            // 1. Stockwerk-abhängigen RH-Schwellenwert bestimmen
            let rhThreshold;
            if (groundTemp <= 0) { // Sonderfall Kaltluft
                if (heightAGLInMeters <= 2000) {
                    rhThreshold = currentThresholds.low;
                } else if (temp > -30) {
                    rhThreshold = currentThresholds.mid;
                } else {
                    rhThreshold = currentThresholds.high;
                }
            } else { // Normalfall
                if (temp > 0) {
                    rhThreshold = currentThresholds.low;
                } else if (temp > -30) {
                    rhThreshold = currentThresholds.mid;
                } else {
                    rhThreshold = currentThresholds.high;
                }
            }

            // 2. RH-basierten CC-Schätzwert berechnen (stetige lineare Skalierung).
            //
            // Physikalische Grundlage: Unterhalb der Schwelle ist die Luft zu trocken
            // für stabile Kondensation. An der Schwelle beginnt Wolkenbildung möglich
            // zu werden, bei 100% rh ist vollständige Bedeckung physikalisch zwingend.
            //
            // Die Formel: cc_rh = (rh - threshold) / (100 - threshold) * 100
            // ergibt eine stetige Funktion von 0% (an der Schwelle) bis 100% (bei rh=100%).
            //
            // Die stockwerkabhängige Schwelle berücksichtigt implizit die Eissättigung:
            //   - Unteres Stockwerk (Wasser): threshold 75–90% (strenger)
            //   - Mittleres Stockwerk (Mischphase): threshold 70–85%
            //   - Hohes Stockwerk (Eis): threshold 65% (Eis kondensiert früher)
            const cc_rh = rh < rhThreshold
                ? 0
                : Math.max(0, (rh - rhThreshold) / (100 - rhThreshold) * 100);

            // 3. Finales CC: Maximum aus API-Wert und RH-Schätzwert.
            //
            // Wo die API gute Daten hat, dominiert sie unverändert.
            // Wo die API schweigt (cc=0) oder systematisch unterschätzt
            // (bekanntes Problem bei ICON für tiefe Stratus), springt
            // der RH-Schätzwert ein. Kein harter Sprung, keine Überschreibung.
            const cc_api = Number.isFinite(dataPoint.cc) ? dataPoint.cc : 0;
            dataPoint.cc     = Math.min(100, Math.max(cc_api, cc_rh));
            dataPoint.cc_api = cc_api;   // Original-API-Wert (für Debugging)
            dataPoint.cc_rh  = Number(cc_rh.toFixed(1)); // RH-Schätzwert (für Debugging)
        }

        dataPoint.displayHeight = height;
        interpolatedData.push(dataPoint);
    });

    // ── ccLevels fuer findCloudLayers ──────────────────────────────────────────
    // Baue das Niveau-Array das findCloudLayers direkt benoetigt.
    // Fuer jedes CC-Druckniveau: AGL-Hoehe, cc_api, rh (interpoliert am Niveau),
    // und den stockwerkabhaengigen RH-Schwellenwert.
    //
    // RH wird hier linear interpoliert (das ist korrekt – RH ist ein stetiger
    // Feldwert). Nur CC wird nicht interpoliert (Stufenlogik in findCloudLayers).
    const ccLevels = ccPressureLevels.map((hPa, i) => {
        const height_asl = ccHeightData[i];
        const height_agl = height_asl - baseHeight;
        const cc_api     = ccValueData[i];

        // RH am Druckniveau (direkt aus API, kein Umweg ueber 50m-Raster)
        const rh_at_level = weatherData[`relative_humidity_${hPa}hPa`]?.[sliderIndex] ?? null;
        const temp_at_level = weatherData[`temperature_${hPa}hPa`]?.[sliderIndex] ?? null;
        const groundTemp = weatherData.temperature_2m[sliderIndex];

        // Stockwerk-abhaengigen RH-Schwellenwert bestimmen (identische Logik wie bisher)
        let rhThreshold = currentThresholds.low; // Fallback
        if (groundTemp != null && groundTemp <= 0) {
            if (height_agl <= 2000)          rhThreshold = currentThresholds.low;
            else if (temp_at_level > -30)    rhThreshold = currentThresholds.mid;
            else                             rhThreshold = currentThresholds.high;
        } else {
            if (temp_at_level > 0)           rhThreshold = currentThresholds.low;
            else if (temp_at_level > -30)    rhThreshold = currentThresholds.mid;
            else                             rhThreshold = currentThresholds.high;
        }

        return {
            hPa,
            height_agl_m: height_agl,
            height_asl_m: height_asl,
            cc_api,
            rh:           rh_at_level,
            rhThreshold
        };
    });

    // ccLevels als Property am Array mitgeben (fuer calculateDerivedValue)
    interpolatedData.ccLevels = ccLevels;

    console.log(`[DEBUG] interpolateWeatherData finished. baseHeight: ${baseHeight}, Returning ${interpolatedData.length} data points. ccLevels:`, ccLevels);
    return interpolatedData;
}

/**
 * Findet signifikante Wolkenschichten aus den Druckniveau-Daten.
 *
 * Methode: "Stufe von oben" auf Niveau-Ebene
 * ─────────────────────────────────────────
 * Jedes Druckniveau repraesentiert eine Atmosphaerenschicht, keine Punktmessung.
 * Der CC-Wert bei 850hPa gilt fuer die Schicht zwischen ~925hPa und ~700hPa.
 * Die Untergrenze dieser Schicht liegt am unteren Rand, d.h. bei der Hoehe
 * des naechsttieferen Niveaus.
 *
 * Beispiel: ccLevels = [{h:111,cc:0}, {h:800,cc:0}, {h:1500,cc:100}, {h:3000,cc:100}]
 *   Schicht 111–800m:  cc=0%   -> SKC
 *   Schicht 800–1500m: cc=100% -> OVC, Untergrenze: 800m AGL
 *   Schicht >1500m:    cc=100% -> OVC (bereits gemeldet)
 *
 * RH-Korrektur ebenfalls auf Niveau-Ebene:
 *   cc_final = max(cc_api, cc_rh) fuer jedes Niveau separat,
 *   bevor die Schicht-Logik angewendet wird.
 *
 * @param {object[]} ccLevels - Array von Niveau-Objekten (aufsteigend nach Hoehe):
 *   { height_agl_m, cc_api, rh, rhThreshold }
 * @param {number} baseHeight_m - Gelaendehoehe MSL (fuer AGL-Berechnung)
 * @returns {Array<{cover, base, isCeiling}>}
 */
export function findCloudLayers(ccLevels, baseHeight_m = 0) {
    if (!ccLevels || ccLevels.length === 0) return [];

    const getMetarCategory = (cc) => {
        if (cc <= 5)  return null;   // SKC
        if (cc <= 25) return 'FEW';  // 1-2 Achtel
        if (cc <= 50) return 'SCT';  // 3-4 Achtel
        if (cc <= 87) return 'BKN';  // 5-7 Achtel (Ceiling)
        return 'OVC';                // 8 Achtel (Ceiling)
    };

    // RH-Korrektur auf Niveau-Ebene anwenden
    const levels = ccLevels.map(lvl => {
        const cc_rh = (Number.isFinite(lvl.rh) && Number.isFinite(lvl.rhThreshold) && lvl.rh >= lvl.rhThreshold)
            ? Math.max(0, (lvl.rh - lvl.rhThreshold) / (100 - lvl.rhThreshold) * 100)
            : 0;
        const cc_api = Number.isFinite(lvl.cc_api) ? lvl.cc_api : 0;
        const cc_final = Math.min(100, Math.max(cc_api, cc_rh));
        return { ...lvl, cc_final, cc_rh };
    });

    // Schicht-Logik: "Stufe von oben"
    // Fuer jedes Niveau i gilt: Der CC-Wert von Niveau i bestimmt die Schicht
    // zwischen Niveau i-1 (unterer Rand) und Niveau i (oberer Rand).
    // Die gemeldete Untergrenze ist die Hoehe des unteren Randes (Niveau i-1),
    // bzw. 0m AGL fuer das tiefste Niveau (keine Information darunter).
    const reportedLayers = [];
    const categoryOrder = { 'FEW': 1, 'SCT': 2, 'BKN': 3, 'OVC': 4 };
    let lastCategory = null;

    for (let i = 0; i < levels.length; i++) {
        const lvl = levels[i];
        const cat = getMetarCategory(lvl.cc_final);

        if (!cat) {
            // Wolkenfreies Niveau – naechste Schicht kann wieder von vorne beginnen
            lastCategory = null;
            continue;
        }

        if (reportedLayers.length >= 3) break;

        // Nur melden wenn Kategorie hoeher als zuletzt gemeldete
        const isNew = !lastCategory || categoryOrder[cat] > categoryOrder[lastCategory];
        if (!isNew) continue;

        // Untergrenze = Hoehe des naechsttieferen Niveaus (unterer Rand der Schicht).
        // Sonderfall: kein tieferes Niveau vorhanden (z.B. ECMWF ohne 1000/925hPa).
        // Dann gilt die Hoehe des Niveaus selbst als Untergrenze – wir wissen nicht
        // wie tief die Wolke reicht, melden aber den sichersten bekannten Wert.
        // 0m AGL waere hier irreführend (suggeriert Bodennebel).
        const lowerHeight_agl = i > 0 ? levels[i - 1].height_agl_m : levels[i].height_agl_m;

        console.log(
            `%c[findCloudLayers] Schicht: ${cat} | Untergrenze: ${lowerHeight_agl}m AGL` +
            ` | Niveau-Hoehe: ${lvl.height_agl_m}m AGL` +
            ` | cc_api=${lvl.cc_api}% cc_rh=${lvl.cc_rh ? lvl.cc_rh.toFixed(1) : 0}% cc_final=${lvl.cc_final.toFixed(0)}%`,
            'color: #1abc9c; font-weight: bold;'
        );

        reportedLayers.push({
            cover:     cat,
            base:      lowerHeight_agl,
            isCeiling: (cat === 'BKN' || cat === 'OVC')
        });
        lastCategory = cat;
    }

    return reportedLayers;
}

// -----------------------------------------------------------
// 4. STATUS LOGIK (Zentralisiert)
// -----------------------------------------------------------

/**
 * Hilfsfunktion zum Finden des schlechtesten Status
 * (Angepasst: 'ok' gewinnt über 'no-data')
 */
export function getWorseStatus(s1, s2) {
    if (s1 === 'alarm' || s2 === 'alarm') return 'alarm';
    if (s1 === 'warn' || s2 === 'warn') return 'warn';
    if (s1 === 'ok' || s2 === 'ok') return 'ok';
    return 'no-data';
}

/**
 * Gibt den geblendeten Status für eine einzelne Regel und Stunde zurück.
 * NEU: Erfordert die getManualOverrides-Funktion.
 */
export function getBlendedStatus(summary, summaryKey, hour, getManualOverrides) { 
    const overrides = getManualOverrides();
    const autoStatus = (summary[summaryKey] && summary[summaryKey].hourlyStatus[hour]) || 'no-data'; 
    const manual = overrides[summaryKey] ? overrides[summaryKey][hour] : null;
    return manual || autoStatus;
}

/**
 * Berechnet den finalen, kombinierten Status (Auto + Overrides) für jede Stunde.
 * NEU: Erfordert die getManualOverrides-Funktion.
 */
export function getBlendedCombinedStatus(profile, summary, getManualOverrides) {
    const rules = profile.rules;
    const combinedStatus = {};

    const logicMode = rules.logicMode || 'OR';

    const activeMetrics = Object.values(METRICS_CONFIG).filter(m =>
        (rules[m.ruleName + '_alarm'] !== null && rules[m.ruleName + '_alarm'] !== undefined) ||
        (rules[m.ruleName + '_warn'] !== null && rules[m.ruleName + '_warn'] !== undefined)
    );

    if (activeMetrics.length === 0) {
        return combinedStatus;
    }
    const firstMetricKey = activeMetrics[0].summaryKey;

    const hours = (summary[firstMetricKey] && summary[firstMetricKey].hourlyStatus)
        ? Object.keys(summary[firstMetricKey].hourlyStatus).sort((a, b) => parseInt(a) - parseInt(b))
        : [];

    hours.forEach(hour => {
        let activeRuleStati = [];

        for (const metric of Object.values(METRICS_CONFIG)) {
            const ruleName = metric.ruleName;
            const summaryKey = metric.summaryKey;

            if (((rules[ruleName + '_alarm'] !== null && rules[ruleName + '_alarm'] !== undefined) ||
                (rules[ruleName + '_warn'] !== null && rules[ruleName + '_warn'] !== undefined)) && summary[summaryKey]) {
                // HIER IST DIE WICHTIGE ÄNDERUNG: Übergabe der getManualOverrides-Funktion
                const blendedRuleStatus = getBlendedStatus(summary, summaryKey, hour, getManualOverrides);
                activeRuleStati.push(blendedRuleStatus);
            }
        }

        // 1b. Prüfe die manuelle Zeile (customRow), falls aktiviert
        if (rules.customRow && rules.customRow.enabled) {
            const customRowKey = "customRow";
            const overrides = getManualOverrides();

            const manualStatus = (overrides[customRowKey] ? overrides[customRowKey][hour] : null);
            const blendedCustomRowStatus = manualStatus || 'no-data';

            activeRuleStati.push(blendedCustomRowStatus);
        }

        // 2. Wende die "UND" / "ODER" Logik an
        let combinedStatusForHour = 'no-data';

        if (activeRuleStati.length === 0) {
            combinedStatusForHour = 'no-data';
        } else if (logicMode === 'AND') {
            if (activeRuleStati.some(s => s === 'ok')) {
                combinedStatusForHour = 'ok';
            } else if (activeRuleStati.every(s => s === 'alarm' || s === 'warn')) {
                combinedStatusForHour = activeRuleStati.some(s => s === 'alarm') ? 'alarm' : 'warn';
            } else {
                combinedStatusForHour = 'no-data';
            }
        } else { // OR
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