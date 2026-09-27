/**
 * cloudBaseTests.js – Testsuite fuer die Wolkenuntergrenze-Berechnung
 *
 * Einbindung in index.html (direkt vor </body>):
 *   <script type="module" src="cloudBaseTests.js"></script>
 *
 * Aufruf in der Browser-Konsole:
 *   runCloudBaseTests()
 */

import { buildPressureColumn } from './utils.js';
import { lowestCloudBase, cloudCeiling, cloudLayers } from './clouds.js';

// ─────────────────────────────────────────────────────────────────────────────
// HILFSFUNKTIONEN
// ─────────────────────────────────────────────────────────────────────────────

function buildHourly(opts) {
    const {
        groundTemp_C = 10,
        groundRh = 70,
        surfacePressure = 1013,
        levels = []
    } = opts;

    const hourly = {
        time:                 ['2026-01-01T00:00'],
        temperature_2m:       [groundTemp_C],
        relative_humidity_2m: [groundRh],
        surface_pressure:     [surfacePressure],
        wind_speed_10m:       [5],
        wind_direction_10m:   [270],
        cloud_cover:          [0]
    };

    for (const lvl of levels) {
        const p = lvl.hPa;
        hourly[`geopotential_height_${p}hPa`] = [lvl.height_m];
        hourly[`temperature_${p}hPa`]         = [lvl.temp_C];
        hourly[`relative_humidity_${p}hPa`]   = [lvl.rh ?? 50];
        hourly[`cloud_cover_${p}hPa`]         = [lvl.cc ?? 0];
        hourly[`wind_speed_${p}hPa`]          = [lvl.wspd ?? 10];
        hourly[`wind_direction_${p}hPa`]      = [lvl.wdir ?? 270];
    }
    return hourly;
}

// Dieselbe Pipeline wie weather.js calculateDerivedValue (cloudBase/cloudCeiling):
// Säule aus Druckflächen über Grund (buildPressureColumn) -> clouds.js (meteokit).
function runPipeline(hourly, baseHeight_m = 0, model) {
    const col = buildPressureColumn(hourly, 0, baseHeight_m, model);
    if (!col) return { cloudBase_m: null, cloudCeiling_m: null, layers: [] };
    const cloudBase_m    = lowestCloudBase(col, 0) ?? 99999;
    const cloudCeiling_m = cloudCeiling(col, 0)?.baseM ?? 99999;
    const layers = cloudLayers(col, 0).map(l => ({ cover: l.cover, base: l.baseM }));
    return { cloudBase_m, cloudCeiling_m, layers };
}

function toFt(m) {
    if (m == null || m >= 99999) return 'SKC/CAVOK';
    return Math.round(m * 3.28084 / 100) * 100 + ' ft';
}

function withinTolerance(actual, expected, toleranceM = 150) {
    if (expected >= 99999 && actual >= 99999) return true;
    if (expected >= 99999 || actual >= 99999) return false;
    return Math.abs(actual - expected) <= toleranceM;
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTFAELLE
// ─────────────────────────────────────────────────────────────────────────────

// Erwartungswerte aus der meteokit-Formel (clouds.js cloudFraction/criticalRH,
// Modell ohne eigene RH_CRIT_Z_REF -> 950 m) von Hand hergeleitet und
// unabhaengig nachgerechnet. cc wird von der Pipeline bewusst nicht benutzt.
const TEST_CASES = [

    {
        name: 'T01 - SKC: Keine Wolken im Profil',
        description: 'RH ueberall weit unter RH_krit. Erwartet: SKC, kein Ceiling.',
        expected: { cloudBase_m: 99999, cloudCeiling_m: 99999, topLayer: null },
        toleranceM: 30,
        setup: () => buildHourly({
            groundTemp_C: 15, groundRh: 40, surfacePressure: 1013,
            levels: [
                { hPa: 1000, height_m:   111, temp_C:  14, rh:   40, cc: 0 },
                { hPa:  925, height_m:   800, temp_C:   9, rh:   35, cc: 0 },
                { hPa:  850, height_m:  1500, temp_C:   4, rh:   30, cc: 0 },
                { hPa:  700, height_m:  3000, temp_C:  -5, rh:   25, cc: 0 },
                { hPa:  500, height_m:  5600, temp_C: -20, rh:   20, cc: 0 },
            ]
        })
    },

    {
        name: 'T02 - OVC: Gesaettigte Schicht ab 850 hPa (1500 m)',
        description: 'RH 100% bei 850/700 hPa, darunter trocken (925 hPa: 70% < RH_krit 85%). ' +
                     'CF kreuzt linear zwischen 800 m (0) und 1500 m (1): FEW bei 870 m, BKN bei 1150 m.',
        expected: { cloudBase_m: 870, cloudCeiling_m: 1150, topLayer: 'OVC' },
        toleranceM: 30,
        setup: () => buildHourly({
            groundTemp_C: 12, groundRh: 65, surfacePressure: 1013,
            levels: [
                { hPa: 1000, height_m:   111, temp_C:  11, rh:   65, cc: 0 },
                { hPa:  925, height_m:   800, temp_C:   8, rh:   70, cc: 0 },
                { hPa:  850, height_m:  1500, temp_C:   4, rh:  100, cc: 0 },
                { hPa:  700, height_m:  3000, temp_C:  -5, rh:  100, cc: 0 },
                { hPa:  500, height_m:  5600, temp_C: -20, rh:   40, cc: 0 },
            ]
        })
    },

    {
        name: 'T03 - FEW: Leichte Bewoelkung, kein Ceiling',
        description: '850 hPa RH 89% bei RH_krit 83% -> CF 0.196 (FEW). Erwartet: Basis ~1158 m, kein Ceiling.',
        expected: { cloudBase_m: 1158, cloudCeiling_m: 99999, topLayer: 'FEW' },
        toleranceM: 30,
        setup: () => buildHourly({
            groundTemp_C: 12, groundRh: 60, surfacePressure: 1013,
            levels: [
                { hPa: 1000, height_m:   111, temp_C:  11, rh:   60, cc: 0 },
                { hPa:  925, height_m:   800, temp_C:   8, rh:   62, cc: 0 },
                { hPa:  850, height_m:  1500, temp_C:   4, rh:   89, cc: 0 },
                { hPa:  700, height_m:  3000, temp_C:  -5, rh:   50, cc: 0 },
                { hPa:  500, height_m:  5600, temp_C: -20, rh:   20, cc: 0 },
            ]
        })
    },

    {
        name: 'T04 - SCT/BKN: Zwei Schichten, cloudBase tiefer als Ceiling',
        description: 'SCT bei 925 hPa (RH 93.7%, CF 0.35), BKN bei 700 hPa (RH 98.6%, CF 0.70). ' +
                     'Erwartet: Basis ~307 m (SCT), Ceiling ~2573 m (BKN).',
        expected: { cloudBase_m: 307, cloudCeiling_m: 2573, topLayer: 'SCT' },
        toleranceM: 30,
        setup: () => buildHourly({
            groundTemp_C: 15, groundRh: 68, surfacePressure: 1013,
            levels: [
                { hPa: 1000, height_m:   111, temp_C:  14, rh:   68, cc: 0 },
                { hPa:  925, height_m:   800, temp_C:   9, rh: 93.7, cc: 0 },
                { hPa:  850, height_m:  1500, temp_C:   5, rh:   75, cc: 0 },
                { hPa:  700, height_m:  3000, temp_C:  -4, rh: 98.6, cc: 0 },
                { hPa:  500, height_m:  5600, temp_C: -18, rh:   30, cc: 0 },
            ]
        })
    },

    {
        name: 'T05 - Feuchte bestimmt die Wolke, nicht cloud_cover_hPa',
        description: 'cc=0 auf allen Flaechen (Open-Meteo-cloud_cover_hPa wird bewusst ignoriert), ' +
                     'aber RH 97% bei 850 hPa -> CF 0.58 (BKN). Erwartet: Basis ~921 m, Ceiling ~1404 m.',
        expected: { cloudBase_m: 921, cloudCeiling_m: 1404, topLayer: 'BKN' },
        toleranceM: 30,
        setup: () => buildHourly({
            groundTemp_C: 10, groundRh: 68, surfacePressure: 1013,
            levels: [
                { hPa: 1000, height_m:   111, temp_C:   9, rh:   65, cc: 0 },
                { hPa:  925, height_m:   800, temp_C:   6, rh:   68, cc: 0 },
                { hPa:  850, height_m:  1500, temp_C:   3, rh:   97, cc: 0 },
                { hPa:  700, height_m:  3000, temp_C:  -6, rh:   55, cc: 0 },
                { hPa:  500, height_m:  5600, temp_C: -20, rh:   20, cc: 0 },
            ]
        })
    },

    {
        name: 'T06 - Feuchte Grenzschicht ohne Wolke (Hamburg-Fall)',
        description: 'RH 81-84% in der Grenzschicht lag frueher ueber der festen 75%-Schwelle -> FEW bei ~170 m ' +
                     '(Fehlalarm). Mit RH_krit 94-85% in dieser Hoehe: keine Wolke. Erwartet: SKC.',
        expected: { cloudBase_m: 99999, cloudCeiling_m: 99999, topLayer: null },
        toleranceM: 30,
        setup: () => buildHourly({
            groundTemp_C: 13, groundRh: 78, surfacePressure: 1021,
            levels: [
                { hPa: 1000, height_m:   171, temp_C:  12, rh:   81, cc: 0 },
                { hPa:  975, height_m:   385, temp_C:  11, rh:   83, cc: 0 },
                { hPa:  925, height_m:   800, temp_C:   8, rh:   84, cc: 0 },
                { hPa:  850, height_m:  1500, temp_C:   4, rh:   82, cc: 0 },
                { hPa:  700, height_m:  3000, temp_C:  -5, rh:   50, cc: 0 },
                { hPa:  500, height_m:  5600, temp_C: -20, rh:   20, cc: 0 },
            ]
        })
    },

    {
        name: 'T07 - Hochnebel/Stratus: tiefe Basis < 300 m',
        description: 'Gesaettigt ab 975 hPa (330 m), darunter RH 93% (< RH_krit 94.5%). ' +
                     'Erwartet: Basis ~133 m, Ceiling ~221 m, OVC.',
        expected: { cloudBase_m: 133, cloudCeiling_m: 221, topLayer: 'OVC' },
        toleranceM: 30,
        setup: () => buildHourly({
            groundTemp_C: 5, groundRh: 90, surfacePressure: 1013,
            levels: [
                { hPa: 1000, height_m:   111, temp_C:   5, rh:   93, cc: 0 },
                { hPa:  975, height_m:   330, temp_C:   4, rh:  100, cc: 0 },
                { hPa:  950, height_m:   550, temp_C:   4, rh:  100, cc: 0 },
                { hPa:  925, height_m:   800, temp_C:   4, rh:   70, cc: 0 },
                { hPa:  850, height_m:  1500, temp_C:   2, rh:   60, cc: 0 },
                { hPa:  700, height_m:  3000, temp_C:  -6, rh:   40, cc: 0 },
            ]
        })
    },

    {
        name: 'T08 - Kaltluft: eis-referenzierte Schwelle',
        description: '850 hPa bei -6 Grad: RH_krit 85.3% (Eisanteil 17%) statt 83%. RH 99% -> CF 0.74 (BKN). ' +
                     'Erwartet: Basis ~895 m, Ceiling ~1274 m.',
        expected: { cloudBase_m: 895, cloudCeiling_m: 1274, topLayer: 'BKN' },
        toleranceM: 30,
        setup: () => buildHourly({
            groundTemp_C: -2, groundRh: 85, surfacePressure: 1013,
            levels: [
                { hPa: 1000, height_m:   111, temp_C:  -2, rh:   85, cc: 0 },
                { hPa:  925, height_m:   800, temp_C:  -4, rh:   80, cc: 0 },
                { hPa:  850, height_m:  1500, temp_C:  -6, rh:   99, cc: 0 },
                { hPa:  700, height_m:  3000, temp_C: -12, rh:   70, cc: 0 },
                { hPa:  500, height_m:  5600, temp_C: -30, rh:   30, cc: 0 },
            ]
        })
    },

    {
        name: 'T09 - Gelaendehoehe 1000 m, 925 hPa unter Grund',
        description: 'Hoehen MSL, Gelaende 1000 m, Bodendruck 900 hPa (925 hPa liegt unter Grund und wird ignoriert). ' +
                     'BKN bei 700 hPa (1500 m AGL). Erwartet: Basis ~720 m AGL, Ceiling ~1199 m AGL.',
        expected: { cloudBase_m: 720, cloudCeiling_m: 1199, topLayer: 'BKN' },
        toleranceM: 30,
        baseHeight_m: 1000,
        setup: () => buildHourly({
            groundTemp_C: 8, groundRh: 72, surfacePressure: 900,
            levels: [
                { hPa:  925, height_m:  1100, temp_C:   8, rh:   72, cc: 0 },
                { hPa:  850, height_m:  1600, temp_C:   5, rh:   70, cc: 0 },
                { hPa:  700, height_m:  2500, temp_C:  -2, rh:   99, cc: 0 },
                { hPa:  600, height_m:  4200, temp_C: -10, rh:   55, cc: 0 },
                { hPa:  500, height_m:  5600, temp_C: -20, rh:   25, cc: 0 },
            ]
        })
    },

    {
        name: 'T10 - Grenzfall knapp unter BKN: SCT, kein Ceiling',
        description: 'RH 95.5% bei 850 hPa -> CF 0.486 (< 0.5). Erwartet: Basis ~944 m, kein Ceiling.',
        expected: { cloudBase_m: 944, cloudCeiling_m: 99999, topLayer: 'SCT' },
        toleranceM: 30,
        setup: () => buildHourly({
            groundTemp_C: 12, groundRh: 65, surfacePressure: 1013,
            levels: [
                { hPa: 1000, height_m:   111, temp_C:  11, rh:   65, cc: 0 },
                { hPa:  925, height_m:   800, temp_C:   8, rh:   68, cc: 0 },
                { hPa:  850, height_m:  1500, temp_C:   4, rh: 95.5, cc: 0 },
                { hPa:  700, height_m:  3000, temp_C:  -5, rh:   55, cc: 0 },
                { hPa:  500, height_m:  5600, temp_C: -20, rh:   20, cc: 0 },
            ]
        })
    },

    {
        name: 'T11 - Grenzfall knapp ueber BKN: Ceiling',
        description: 'RH 96% bei 850 hPa -> CF 0.515 (>= 0.5). Erwartet: Basis ~936 m, Ceiling ~1480 m.',
        expected: { cloudBase_m: 936, cloudCeiling_m: 1480, topLayer: 'BKN' },
        toleranceM: 30,
        setup: () => buildHourly({
            groundTemp_C: 12, groundRh: 60, surfacePressure: 1013,
            levels: [
                { hPa: 1000, height_m:   111, temp_C:  11, rh:   60, cc: 0 },
                { hPa:  925, height_m:   800, temp_C:   8, rh:   62, cc: 0 },
                { hPa:  850, height_m:  1500, temp_C:   4, rh:   96, cc: 0 },
                { hPa:  700, height_m:  3000, temp_C:  -5, rh:   45, cc: 0 },
                { hPa:  500, height_m:  5600, temp_C: -20, rh:   20, cc: 0 },
            ]
        })
    },

    {
        name: 'T12 - Wenige Druckstufen (nur 850/700/500/300)',
        description: 'Zwischen 2 m und 1500 m keine Flaeche: CF wird linear interpoliert, die Basis landet ' +
                     'konservativ tief (~200 m) statt auf der Flaeche selbst. Erwartet: Basis ~200 m, Ceiling ~991 m.',
        expected: { cloudBase_m: 200, cloudCeiling_m: 991, topLayer: 'BKN' },
        toleranceM: 30,
        setup: () => buildHourly({
            groundTemp_C: 10, groundRh: 72, surfacePressure: 1013,
            levels: [
                { hPa:  850, height_m:  1500, temp_C:   4, rh:   99, cc: 0 },
                { hPa:  700, height_m:  3000, temp_C:  -5, rh:   60, cc: 0 },
                { hPa:  500, height_m:  5600, temp_C: -20, rh:   25, cc: 0 },
                { hPa:  300, height_m:  9200, temp_C: -42, rh:   15, cc: 0 },
            ]
        })
    },

    {
        name: 'T13 - Druckflaechen unter Grund (Muenchen, Bodendruck 962 hPa)',
        description: 'Open-Meteo liefert 1000/975 hPa auch unter Grund, extrapoliert mit ' +
                     'bodennaher Feuchte (RH 80%). Diese Flaechen duerfen nicht als Wolke ' +
                     'zaehlen (vorher: FEW bei -325 m AGL). Darueber trocken. ' +
                     'Erwartet: SKC, kein Ceiling.',
        expected: { cloudBase_m: 99999, cloudCeiling_m: 99999, topLayer: null },
        toleranceM: 30,
        baseHeight_m: 524,
        setup: () => buildHourly({
            groundTemp_C: 12, groundRh: 70, surfacePressure: 962,
            levels: [
                { hPa: 1000, height_m:   199, temp_C:  14, rh:   80, cc: 0 },
                { hPa:  975, height_m:   412, temp_C:  13, rh:   80, cc: 0 },
                { hPa:  950, height_m:   630, temp_C:  11, rh:   58, cc: 0 },
                { hPa:  850, height_m:  1500, temp_C:   4, rh:   40, cc: 0 },
                { hPa:  700, height_m:  3000, temp_C:  -5, rh:   30, cc: 0 },
                { hPa:  500, height_m:  5600, temp_C: -20, rh:   20, cc: 0 },
            ]
        })
    },

    {
        name: 'T14 - Bodennebel ist keine Wolkenbasis (wie meteokit)',
        description: 'Gesaettigt vom Boden bis 111 m, darueber trocken: bodenberuehrende Schicht (< 30 m) ' +
                     'gilt als Nebel und wird uebersprungen (Sicht-Metrik zustaendig). Erwartet: SKC.',
        expected: { cloudBase_m: 99999, cloudCeiling_m: 99999, topLayer: null },
        toleranceM: 30,
        setup: () => buildHourly({
            groundTemp_C: 3, groundRh: 100, surfacePressure: 1013,
            levels: [
                { hPa: 1000, height_m:   111, temp_C:   3, rh:  100, cc: 0 },
                { hPa:  925, height_m:   800, temp_C:   2, rh:   60, cc: 0 },
                { hPa:  850, height_m:  1500, temp_C:   0, rh:   50, cc: 0 },
                { hPa:  700, height_m:  3000, temp_C:  -8, rh:   40, cc: 0 },
            ]
        })
    },

];


// ─────────────────────────────────────────────────────────────────────────────
// TEST-RUNNER
// ─────────────────────────────────────────────────────────────────────────────

function runCloudBaseTests() {
    console.clear();
    console.log('%c=== IDSSE-M Wolkenuntergrenze Testsuite ===',
        'font-size:1.3em; font-weight:bold; color:#1abc9c;');
    console.log(TEST_CASES.length + ' Tests werden ausgefuehrt...');
    console.log('');

    const results = [];
    let passed = 0;
    let failed = 0;

    for (const tc of TEST_CASES) {
        const hourly     = tc.setup();
        const baseH      = tc.baseHeight_m ?? 0;
        const toleranceM = tc.toleranceM   ?? 150;

        let actual;
        try {
            actual = runPipeline(hourly, baseH, tc.model);
        } catch (e) {
            actual = { cloudBase_m: null, cloudCeiling_m: null, layers: [] };
            console.error('[' + tc.name + '] Ausnahme:', e);
        }

        const baseOk  = withinTolerance(actual.cloudBase_m,    tc.expected.cloudBase_m,    toleranceM);
        const ceilOk  = withinTolerance(actual.cloudCeiling_m, tc.expected.cloudCeiling_m, toleranceM);
        const topLayer = actual.layers.length > 0 ? actual.layers[0].cover : null;
        const layerOk  = tc.expected.topLayer === null
            ? topLayer === null
            : topLayer === tc.expected.topLayer;

        const ok = baseOk && ceilOk && layerOk;
        if (ok) passed++; else failed++;

        results.push({
            'Test':           tc.name,
            'Status':         ok ? 'PASS' : 'FAIL',
            'Base erw.':      toFt(tc.expected.cloudBase_m),
            'Base ist':       toFt(actual.cloudBase_m),
            'Ceil. erw.':     toFt(tc.expected.cloudCeiling_m),
            'Ceil. ist':      toFt(actual.cloudCeiling_m),
            'Layer erw.':     tc.expected.topLayer ?? 'SKC',
            'Layer ist':      topLayer ?? 'SKC',
            'Base OK':        baseOk  ? 'OK' : 'FAIL',
            'Ceil. OK':       ceilOk  ? 'OK' : 'FAIL',
            'Layer OK':       layerOk ? 'OK' : 'FAIL',
        });

        if (!ok) {
            console.groupCollapsed('%c[FAIL] ' + tc.name, 'color:red; font-weight:bold;');
            console.log('Beschreibung:', tc.description);
            console.log('Erwartet:', tc.expected);
            console.log('Erhalten:', {
                cloudBase_m:    actual.cloudBase_m,
                cloudCeiling_m: actual.cloudCeiling_m,
                layers:         actual.layers
            });
            console.groupEnd();
        }
    }

    console.log('');
    console.log('%cErgebnisse:', 'font-weight:bold; font-size:1.1em;');
    console.table(results);

    const color = failed === 0 ? '#27ae60' : '#e74c3c';
    const msg   = failed === 0
        ? passed + '/' + TEST_CASES.length + ' Tests bestanden - alle OK!'
        : passed + '/' + TEST_CASES.length + ' bestanden, ' + failed + ' fehlgeschlagen';
    console.log('%c' + msg, 'font-size:1.2em; font-weight:bold; color:' + color + ';');

    return { passed, failed, total: TEST_CASES.length };
}

// Funktion global verfuegbar machen (Aufruf aus der Konsole)
window.runCloudBaseTests = runCloudBaseTests;
console.log('%cTestsuite geladen. Aufruf: runCloudBaseTests()',
    'color:#1abc9c; font-weight:bold;');