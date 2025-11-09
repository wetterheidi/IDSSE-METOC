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