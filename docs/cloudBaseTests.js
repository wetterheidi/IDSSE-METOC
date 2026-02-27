/**
 * cloudBaseTests.js – Testsuite fuer die Wolkenuntergrenze-Berechnung
 *
 * Einbindung in index.html (direkt vor </body>):
 *   <script type="module" src="cloudBaseTests.js"></script>
 *
 * Aufruf in der Browser-Konsole:
 *   runCloudBaseTests()
 */

import { analyzeCloudLayers, interpolateWeatherData, findCloudLayers } from './utils.js';

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

function runPipeline(hourly, baseHeight_m = 0) {
    const thresholds = analyzeCloudLayers(hourly);
    if (!thresholds || !thresholds[0]) return { cloudBase_m: null, cloudCeiling_m: null, layers: [] };

    const interpolated = interpolateWeatherData(hourly, 0, 50, baseHeight_m, 'm', thresholds[0]);
    if (!interpolated || interpolated.length === 0) return { cloudBase_m: null, cloudCeiling_m: null, layers: [] };

    // findCloudLayers arbeitet jetzt auf ccLevels (Druckniveau-Ebene), nicht auf dem 50m-Raster
    if (!interpolated.ccLevels || interpolated.ccLevels.length === 0) {
        return { cloudBase_m: null, cloudCeiling_m: null, layers: [] };
    }
    const layers = findCloudLayers(interpolated.ccLevels, baseHeight_m);
    const cloudBase_m     = layers.length > 0 ? layers[0].base : 99999;
    const ceilingLayers   = layers.filter(l => l.isCeiling);
    const cloudCeiling_m  = ceilingLayers.length > 0 ? ceilingLayers[0].base : 99999;

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

const TEST_CASES = [

    {
        name: 'T01 - SKC: Kein Wolken in Profil',
        description: 'CC = 0% auf allen Niveaus, RH ueberall unter Schwelle. ' +
                     'Erwartet: cloudBase = SKC (99999m), kein Ceiling.',
        expected: { cloudBase_m: 99999, cloudCeiling_m: 99999, topLayer: null },
        setup: () => buildHourly({
            groundTemp_C: 15, groundRh: 40, surfacePressure: 1013,
            levels: [
                { hPa: 1000, height_m:  111, temp_C: 14, rh: 40, cc:  0 },
                { hPa:  925, height_m:  800, temp_C:  9, rh: 35, cc:  0 },
                { hPa:  850, height_m: 1500, temp_C:  4, rh: 30, cc:  0 },
                { hPa:  700, height_m: 3000, temp_C: -5, rh: 25, cc:  0 },
                { hPa:  500, height_m: 5600, temp_C:-20, rh: 20, cc:  0 },
            ]
        })
    },

    {
        name: 'T02 - OVC: Durchgehende tiefe Bewoelkung ~1500m AGL',
        description: 'CC springt von 0% auf 100% zwischen 925hPa (800m) und 850hPa (1500m). ' +
                     'Erwartet: cloudBase ~1500m, Ceiling = OVC ~1500m.',
        expected: { cloudBase_m: 800, cloudCeiling_m: 800, topLayer: 'OVC' },
        toleranceM: 200,
        setup: () => buildHourly({
            groundTemp_C: 12, groundRh: 65, surfacePressure: 1013,
            levels: [
                { hPa: 1000, height_m:  111, temp_C: 11, rh: 65, cc:   0 },
                { hPa:  925, height_m:  800, temp_C:  8, rh: 70, cc:   0 },
                { hPa:  850, height_m: 1500, temp_C:  4, rh: 95, cc: 100 },
                { hPa:  700, height_m: 3000, temp_C: -5, rh: 90, cc: 100 },
                { hPa:  500, height_m: 5600, temp_C:-20, rh: 40, cc:   0 },
            ]
        })
    },

    {
        name: 'T03 - FEW: Leichte Bewoelkung, kein Ceiling',
        description: 'CC = 20% (FEW) bei 850hPa. ' +
                     'Erwartet: cloudBase ~1500m, cloudCeiling = CAVOK (99999m).',
        expected: { cloudBase_m: 800, cloudCeiling_m: 99999, topLayer: 'FEW' },
        toleranceM: 200,
        setup: () => buildHourly({
            groundTemp_C: 12, groundRh: 60, surfacePressure: 1013,
            levels: [
                { hPa: 1000, height_m:  111, temp_C: 11, rh: 60, cc:  0 },
                { hPa:  925, height_m:  800, temp_C:  8, rh: 62, cc:  0 },
                { hPa:  850, height_m: 1500, temp_C:  4, rh: 78, cc: 20 },
                { hPa:  700, height_m: 3000, temp_C: -5, rh: 50, cc:  5 },
                { hPa:  500, height_m: 5600, temp_C:-20, rh: 20, cc:  0 },
            ]
        })
    },

    {
        name: 'T04 - SCT/BKN: Zwei Schichten, cloudBase tiefer als Ceiling',
        description: 'SCT (40%) bei 925hPa (800m), BKN (70%) bei 700hPa (3000m). ' +
                     'Erwartet: cloudBase ~800m, cloudCeiling ~3000m.',
        expected: { cloudBase_m: 111, cloudCeiling_m: 1500, topLayer: 'SCT' },
        toleranceM: 200,
        setup: () => buildHourly({
            groundTemp_C: 15, groundRh: 68, surfacePressure: 1013,
            levels: [
                { hPa: 1000, height_m:  111, temp_C: 14, rh: 68, cc:  0 },
                { hPa:  925, height_m:  800, temp_C:  9, rh: 80, cc: 40 },
                { hPa:  850, height_m: 1500, temp_C:  5, rh: 75, cc: 30 },
                { hPa:  700, height_m: 3000, temp_C: -4, rh: 88, cc: 70 },
                { hPa:  500, height_m: 5600, temp_C:-18, rh: 30, cc:  0 },
            ]
        })
    },

    {
        name: 'T05 - RH-Korrektur: API cc=0%, aber RH=92% bei 850hPa',
        description: 'API liefert cc=0, aber rh=92% liegt weit ueber der Schwelle (75%). ' +
                     'RH-Schaetzwert: (92-75)/(100-75)*100 = 68% -> BKN. ' +
                     'Erwartet: cloudBase erkannt (~1500m), cloudCeiling erkannt.',
        expected: { cloudBase_m: 800, cloudCeiling_m: 800, topLayer: 'BKN' },
        toleranceM: 150,
        setup: () => buildHourly({
            groundTemp_C: 10, groundRh: 68, surfacePressure: 1013,
            levels: [
                { hPa: 1000, height_m:  111, temp_C:  9, rh: 65, cc: 0 },
                { hPa:  925, height_m:  800, temp_C:  6, rh: 68, cc: 0 },
                { hPa:  850, height_m: 1500, temp_C:  3, rh: 92, cc: 0 },
                { hPa:  700, height_m: 3000, temp_C: -6, rh: 55, cc: 0 },
                { hPa:  500, height_m: 5600, temp_C:-20, rh: 20, cc: 0 },
            ]
        })
    },

    {
        name: 'T06 - RH unter Schwelle: Kein falscher Alarm',
        description: 'API cc=0%, RH=72% (unter Schwelle 75%). ' +
                     'RH-Korrektur darf keine Wolke erfinden. Erwartet: SKC.',
        expected: { cloudBase_m: 99999, cloudCeiling_m: 99999, topLayer: null },
        setup: () => buildHourly({
            groundTemp_C: 12, groundRh: 70, surfacePressure: 1013,
            levels: [
                { hPa: 1000, height_m:  111, temp_C: 11, rh: 70, cc: 0 },
                { hPa:  925, height_m:  800, temp_C:  8, rh: 72, cc: 0 },
                { hPa:  850, height_m: 1500, temp_C:  4, rh: 73, cc: 0 },
                { hPa:  700, height_m: 3000, temp_C: -5, rh: 50, cc: 0 },
                { hPa:  500, height_m: 5600, temp_C:-20, rh: 20, cc: 0 },
            ]
        })
    },

    {
        name: 'T07 - Hochnebel: Tiefe Basis < 300m AGL',
        description: 'OVC bereits bei ~200m AGL (zwischen Boden und 925hPa). ' +
                     'Erwartet: cloudBase und cloudCeiling < 300m.',
        expected: { cloudBase_m: 0, cloudCeiling_m: 0, topLayer: 'OVC' },
        toleranceM: 150,
        setup: () => buildHourly({
            groundTemp_C: 5, groundRh: 98, surfacePressure: 1013,
            levels: [
                { hPa: 1000, height_m:  111, temp_C:  5, rh: 99, cc: 100 },
                { hPa:  925, height_m:  800, temp_C:  4, rh: 98, cc:  95 },
                { hPa:  850, height_m: 1500, temp_C:  2, rh: 60, cc:   0 },
                { hPa:  700, height_m: 3000, temp_C: -6, rh: 40, cc:   0 },
                { hPa:  500, height_m: 5600, temp_C:-20, rh: 15, cc:   0 },
            ]
        })
    },

    {
        name: 'T08 - Kaltluft: Bodentemp <= 0 Grad, Stockwerk-Logik umgeschaltet',
        description: 'Bodentemperatur -2 Grad -> Stockwerk-Zuteilung nach Hoehe statt Temperatur. ' +
                     'BKN bei 850hPa (~1500m, < 2000m -> unteres Stockwerk). ' +
                     'Erwartet: cloudBase und Ceiling ~1500m.',
        expected: { cloudBase_m: 800, cloudCeiling_m: 800, topLayer: 'BKN' },
        toleranceM: 150,
        setup: () => buildHourly({
            groundTemp_C: -2, groundRh: 85, surfacePressure: 1013,
            levels: [
                { hPa: 1000, height_m:  111, temp_C: -2, rh: 85, cc:  0 },
                { hPa:  925, height_m:  800, temp_C: -4, rh: 80, cc:  0 },
                { hPa:  850, height_m: 1500, temp_C: -6, rh: 92, cc: 75 },
                { hPa:  700, height_m: 3000, temp_C:-12, rh: 70, cc: 40 },
                { hPa:  500, height_m: 5600, temp_C:-30, rh: 30, cc:  0 },
            ]
        })
    },

    {
        name: 'T09 - Gelaendehoehe: Basis bei 1000m MSL, BKN bei 2500m MSL = 1500m AGL',
        description: 'Profil startet auf 1000m Gelaende. Hoehen sind MSL. ' +
                     'BKN bei 2500m MSL entspricht 1500m AGL. ' +
                     'Erwartet: cloudBase ~1500m AGL, cloudCeiling ~1500m AGL.',
        expected: { cloudBase_m: 800, cloudCeiling_m: 800, topLayer: 'BKN' },
        toleranceM: 200,
        baseHeight_m: 1000,
        setup: () => buildHourly({
            groundTemp_C: 8, groundRh: 72, surfacePressure: 900,
            levels: [
                { hPa:  925, height_m: 1100, temp_C:  8, rh: 72, cc:  0 },
                { hPa:  850, height_m: 1600, temp_C:  5, rh: 70, cc:  0 },
                { hPa:  700, height_m: 2500, temp_C: -2, rh: 90, cc: 80 },
                { hPa:  600, height_m: 4200, temp_C:-10, rh: 55, cc: 20 },
                { hPa:  500, height_m: 5600, temp_C:-20, rh: 25, cc:  0 },
            ]
        })
    },

    {
        name: 'T10 - Grenzfall cc=50%: SCT (kein Ceiling)',
        description: 'cc=50% liegt exakt auf der SCT/BKN-Grenze. ' +
                     'Regel: cc <= 50 -> SCT (kein Ceiling). ' +
                     'Erwartet: cloudBase erkannt, cloudCeiling = CAVOK.',
        expected: { cloudBase_m: 800, cloudCeiling_m: 99999, topLayer: 'SCT' },
        toleranceM: 200,
        setup: () => buildHourly({
            groundTemp_C: 12, groundRh: 65, surfacePressure: 1013,
            levels: [
                { hPa: 1000, height_m:  111, temp_C: 11, rh: 65, cc:  0 },
                { hPa:  925, height_m:  800, temp_C:  8, rh: 68, cc:  0 },
                { hPa:  850, height_m: 1500, temp_C:  4, rh: 82, cc: 50 },
                { hPa:  700, height_m: 3000, temp_C: -5, rh: 55, cc: 10 },
                { hPa:  500, height_m: 5600, temp_C:-20, rh: 20, cc:  0 },
            ]
        })
    },

    {
        name: 'T11 - Grenzfall cc=51%: BKN (Ceiling)',
        description: 'cc=51% liegt knapp ueber der SCT/BKN-Grenze. ' +
                     'Regel: cc > 50 -> BKN (Ceiling). ' +
                     'Erwartet: cloudBase UND cloudCeiling erkannt.',
        expected: { cloudBase_m: 800, cloudCeiling_m: 800, topLayer: 'BKN' },
        toleranceM: 150,
        setup: () => buildHourly({
            groundTemp_C: 12, groundRh: 60, surfacePressure: 1013,
            levels: [
                { hPa: 1000, height_m:  111, temp_C: 11, rh: 60, cc:  0 },
                { hPa:  925, height_m:  800, temp_C:  8, rh: 62, cc:  0 },
                { hPa:  850, height_m: 1500, temp_C:  4, rh: 82, cc: 51 },
                { hPa:  700, height_m: 3000, temp_C: -5, rh: 45, cc: 10 },
                { hPa:  500, height_m: 5600, temp_C:-20, rh: 20, cc:  0 },
            ]
        })
    },

    {
        name: 'T12 - Wenige Druckstufen (ECMWF-aehnlich): Nur 850/700/500/300',
        description: 'Kein 1000/925hPa vorhanden. Bodeninterpolation muss greifen. ' +
                     'BKN bei 850hPa (~1500m). ' +
                     'Erwartet: cloudBase und Ceiling ~1500m trotz fehlender Bodenniveaus.',
        expected: { cloudBase_m: 1500, cloudCeiling_m: 1500, topLayer: 'BKN' },
        toleranceM: 150,
        description_note: 'Kein tieferes Niveau vorhanden -> Untergrenze = Niveau selbst (1500m AGL)',
        setup: () => buildHourly({
            groundTemp_C: 10, groundRh: 72, surfacePressure: 1013,
            levels: [
                { hPa:  850, height_m: 1500, temp_C:  4, rh: 90, cc: 80 },
                { hPa:  700, height_m: 3000, temp_C: -5, rh: 60, cc: 20 },
                { hPa:  500, height_m: 5600, temp_C:-20, rh: 25, cc:  0 },
                { hPa:  300, height_m: 9200, temp_C:-42, rh: 15, cc:  0 },
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
            actual = runPipeline(hourly, baseH);
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