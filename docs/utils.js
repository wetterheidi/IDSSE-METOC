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
 * Führt eine lineare Interpolation durch.
 * @param {number[]} x - Array mit zwei X-Werten (z.B. [Höhe1, Höhe2])
 * @param {number[]} y - Array mit zwei Y-Werten (z.B. [Temp1, Temp2])
 * @param {number} x_target - Der X-Wert, für den der Y-Wert gefunden werden soll
 * @returns {number} Der interpolierte Y-Wert
 */
export function linearInterpolate(x, y, x_target) {
    const [x0, x1] = x;
    const [y0, y1] = y;
    return y0 + (y1 - y0) * (x_target - x0) / (x1 - x0);
}

/**
 * Berechnet den Taupunkt aus Temperatur und Relativer Feuchte.
 * @param {number} temp_c - Temperatur in Celsius
 * @param {number} rh_perc - Relative Feuchte in %
 * @returns {number} Taupunkt in Celsius
 */
export function calculateDewpoint(temp_c, rh_perc) {
    if (temp_c === null || rh_perc === null) return null;
    const a = 17.625;
    const b = 243.04;
    const alpha = Math.log(rh_perc / 100) + (a * temp_c) / (b + temp_c);
    return (b * alpha) / (a - alpha);
}

/**
 * Berechnet die Windrichtung aus U/V-Komponenten.
 * @param {number} u - U-Komponente
 * @param {number} v - V-Komponente
 * @returns {number} Windrichtung in Grad (meteorologisch)
 */
export function windDirection(u, v) {
    if (u === null || v === null) return null;
    return (270 - Math.atan2(v, u) * (180 / Math.PI)) % 360;
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
 * Interpoliert den Druck für eine gegebene Höhe (vereinfacht).
 * Geht davon aus, dass 'levels' (hPa) und 'heights' (Meter) sortiert sind.
 */
export function interpolatePressure(targetHeight, levels, heights) {
    for (let i = 0; i < heights.length - 1; i++) {
        if (targetHeight >= heights[i] && targetHeight <= heights[i+1]) {
            return linearInterpolate([heights[i], heights[i+1]], [levels[i], levels[i+1]], targetHeight);
        }
    }
    // Fallback: Wenn außerhalb des Bereichs, gib den nächsten Wert zurück
    return targetHeight < heights[0] ? levels[0] : levels[levels.length - 1];
}

/**
 * Interpoliert die U/V-Windkomponenten für eine gegebene Höhe.
 */
export function interpolateWindAtAltitude(targetHeight, levels, heights, uComps, vComps) {
    let u = null, v = null;
    for (let i = 0; i < heights.length - 1; i++) {
        if (targetHeight >= heights[i] && targetHeight <= heights[i+1]) {
            u = linearInterpolate([heights[i], heights[i+1]], [uComps[i], uComps[i+1]], targetHeight);
            v = linearInterpolate([heights[i], heights[i+1]], [vComps[i], vComps[i+1]], targetHeight);
            break;
        }
    }
    if (u === null) { // Fallback
        u = targetHeight < heights[0] ? uComps[0] : uComps[uComps.length - 1];
        v = targetHeight < heights[0] ? vComps[0] : vComps[vComps.length - 1];
    }
    return { u, v };
}