// Sammlung von meteorologischen und mathematischen Hilfsfunktionen

/**
 * Standard-Druckstufen (zur Referenz, auch wenn nicht alle Modelle sie haben)
 */
export const STANDARD_PRESSURE_LEVELS = [
    1000, 975, 950, 925, 900, 875, 850, 825, 800, 
    775, 750, 725, 700, 650, 600, 550, 500, 475, 
    450, 425, 400, 375, 350, 325, 300, 275, 250, 200
];

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

    // Assume pressures and heights are already paired correctly (heights ascending, pressures ascending)
    if (height < heights[0] || height > heights[heights.length - 1]) {
        return null; // No extrapolation
    }

    for (let i = 0; i < heights.length - 1; i++) {
        if (height >= heights[i] && height <= heights[i + 1]) {
            const h0 = heights[i], h1 = heights[i + 1];
            const p0 = pressureLevels[i], p1 = pressureLevels[i + 1];
            return p0 + (p1 - p0) * (height - h0) / (h1 - h0);
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

    const thresholds = [];
    const pressureLevels = [1000, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200];

    for (let i = 0; i < weatherData.time.length; i++) {
        const groundTemp = weatherData.temperature_2m[i];
        let stockwerke = { low: [], mid: [], high: [] };

        // 1. Druckstufen den Stockwerken zuordnen
        for (const p of pressureLevels) {
            const temp = weatherData[`temperature_${p}hPa`]?.[i];
            const height = weatherData[`geopotential_height_${p}hPa`]?.[i];

            if (temp === null || height === null || temp === undefined || height === undefined) continue;

            if (groundTemp <= 0) { // Sonderfall Kaltluft
                if (height <= 2000) stockwerke.low.push(p);
                else if (temp > -30) stockwerke.mid.push(p);
                else stockwerke.high.push(p);
            } else { // Normalfall
                if (temp > 0) stockwerke.low.push(p);
                else if (temp > -30) stockwerke.mid.push(p);
                else stockwerke.high.push(p);
            }
        }

        // 2. maxCC und RH-Schwelle pro Stockwerk berechnen
        const getThreshold = (pLevels, defaultHigh, defaultLow) => {
            if (pLevels.length === 0) return 95; // Konservativer Fallback
            const maxCC = Math.max(...pLevels.map(p => weatherData[`cloud_cover_${p}hPa`]?.[i] || 0));
            return maxCC > 50 ? defaultHigh : defaultLow;
        };

        thresholds.push({
            low: getThreshold(stockwerke.low, 90, 75),
            mid: getThreshold(stockwerke.mid, 85, 70),
            high: 65 // Fester Wert für hohe Wolken
        });
    }

    console.log('[WeatherManager] Cloud layer thresholds analyzed for all timesteps.');
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

        let cc = 0; // Standardwert ist 0
        if (ccHeightData.length > 0) {
            // Finde den Index des nächstgelegenen realen Datenpunktes
            let closestPressureLevelIndex = 0;
            let minDistance = Infinity;

            ccHeightData.forEach((h, index) => {
                const distance = Math.abs(heightASLInMeters - h);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestPressureLevelIndex = index;
                }
            });
            cc = ccValueData[closestPressureLevelIndex]; // Weise den Wert zu
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
            let rhThreshold;

            const groundTemp = weatherData.temperature_2m[sliderIndex];

            // Bestimme das Stockwerk und den passenden Schwellenwert
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
        }

        dataPoint.displayHeight = height;
        interpolatedData.push(dataPoint);
    });

    console.log(`[DEBUG] interpolateWeatherData finished. baseHeight: ${baseHeight}, Returning ${interpolatedData.length} data points. First point:`, interpolatedData[0]);
    return interpolatedData;
}

/**
     * NEUE FUNKTION: Findet signifikante Wolkenschichten und gibt sie als strukturiertes Array zurück.
     * @param {object[]} interpolatedData - Die interpolierten Wetterdaten.
     * @returns {Array<{cover: string, base: number}>} Ein Array von Wolkenschicht-Objekten.
     * @private
     */
export function findCloudLayers(interpolatedData) {
    if (!interpolatedData || interpolatedData.length === 0) {
        return [];
    }

    const reportedLayers = [];
    let lastReportedCategory = null;
    const categoryOrder = { 'FEW': 1, 'SCT': 2, 'BKN': 3, 'OVC': 4 };

    const getMetarCategory = (cc) => {
        /* Alle Bedeckungsgrade
        if (cc <= 5) return null;
        if (cc <= 25) return 'FEW';
        if (cc <= 50) return 'SCT';
        if (cc <= 87) return 'BKN';
        return 'OVC';*/

        // Nur Ceiling: 
        if (cc <= 50) return null; // Ignoriert SKC, FEW und SCT
        if (cc <= 87) return 'BKN';
        return 'OVC';
    };

    // NEU: Überspringe den ersten Punkt (Index 0 = Bodenniveau)
    for (const point of interpolatedData.slice(1)) {

        const currentCategory = getMetarCategory(point.cc);

        // --- NEUES DEBUG-LOG ---
        if (point.cc > 5 && point.cc <= 50) { // Wir loggen Wolken, die wir jetzt ignorieren (FEW/SCT)
            //console.log(`[findCloudLayers] IGNORIERT: Höhe ${point.displayHeight}m, Bedeckung: ${point.cc}% (FEW/SCT)`);
        }
        // --- ENDE DEBUG-LOG ---

        if (!currentCategory || reportedLayers.length >= 3) {
            continue;
        }

        const isNewLayer = !lastReportedCategory || categoryOrder[currentCategory] > categoryOrder[lastReportedCategory];
        if (isNewLayer) {

            // --- NEUES DEBUG-LOG ---
            console.log(`%c[findCloudLayers] GEFUNDEN: Höhe ${point.displayHeight}m, Bedeckung: ${point.cc}% (${currentCategory})`, "color: green; font-weight: bold;");
            // --- ENDE DEBUG-LOG ---

            reportedLayers.push({
                cover: currentCategory,
                base: point.displayHeight // Höhe AGL in Metern
            });
            lastReportedCategory = currentCategory;
        }
    }
    return reportedLayers;
}