// docs/config.js
// -----------------------------------------------------------
// 1. ANWENDUNG & DATENBANK KONSTANTEN
// -----------------------------------------------------------
export const AUTO_CHECK_INTERVAL = 6000000; // 100 Minute (zum Testen)

export const DB_VERSION = 3;
export const DB_NAME = "IDSSE_M_Database";
export const STORES = {
    profiles: '++id, name',
    templates: '++id, name',
    weatherCache: 'id'
};

// -----------------------------------------------------------
// 2. KONVERTIERUNGEN & EINHEITEN
// -----------------------------------------------------------
export const CONVERSIONS = {
    KMH_TO_KTS: 0.539957,
    METER_TO_FEET: 3.28084
};

// Einheiten-Labels
export const UNITS = {
    metric: {
        speed: 'km/h',
        altitude: 'm',
        temp: '°C'
    },
    aviation: {
        speed: 'kt',
        altitude: 'ft',
        temp: '°C' // (Wir bleiben bei °C, °F ist zu viel Aufwand)
    }
};

// -----------------------------------------------------------
// 3. WETTERMODELL KONSTANTEN & METADATEN
// -----------------------------------------------------------

export const WEATHER_MODELS = {
    // Liste der Modelle, die auf Verfügbarkeit geprüft werden sollen (Open-Meteo API Name).
    // BRANCH feature/michael-datasource: bewusst auf die beiden Modelle mit
    // VOLLER Michael-Abdeckung eingeschränkt (Oberfläche + native Cloud-Level,
    // siehe MICHAEL_LEVEL_CLOUD_MODELS unten). timeSlider.js `checkAvailableModels()`
    // testet jedes Listen-Element mit einem eigenen Request gegen die
    // OEFFENTLICHE API -- bei allen 13 Modellen 13 Public-Requests pro
    // Testfeld-Definition, unabhaengig vom letztlich gewaehlten Modell. Das
    // war der Haupttreiber der anhaltenden 429er. Die restlichen Modelle
    // bleiben in DISPLAY_MAP/API_MAP/MODEL_PROPERTIES unten vollstaendig
    // erhalten (nur diese Liste ist branch-spezifisch verkuerzt) -- ein
    // Merge zurueck zu main gibt die volle Liste ohne Konflikt wieder frei.
    LIST: [
        'icon_eu',
        'icon_d2',
        // icon_global: kein Bbox-Eintrag in MODEL_PROPERTIES (globale Abdeckung) --
        // timeSlider.js checkAvailableModels() prueft es deshalb nicht geometrisch,
        // sondern per meta.json ueber die Host-Kette (siehe MODEL_API_BASES). Fuer
        // Gebiete ausserhalb von EU/D2 (Nutzer-Vorgabe: "dringend erforderlich").
        'icon_global',
    ],
    // Mappings für die Anzeige
    DISPLAY_MAP: {
        'icon_seamless': 'ICON-Seamless (Global)',
        'icon_global': 'ICON-Global',
        'icon_d2': 'ICON-D2 (Regional D2)',
        'icon_eu': 'ICON-EU (Regional EU)',
        'ecmwf_ifs025': 'ECMWF',
        'ecmwf_aifs025_single': 'ECMWF AIFS 0.25° Single',
        'gfs_seamless': 'GFS (Global Seamless)',
        'gfs_global': 'GFS (Global)',
        'gfs_hrrr': 'GFS-HRRR',
        'gfs_graphcast025': 'GFS Graphcast 0.25°',
        'arome_france': 'Arome France 0.025°',
        'gem_hrdps_continental': 'GEM HRDPS Continental',
        'gem_regional': 'GEM Regional'
    },
    API_MAP: {
        'icon_seamless': 'dwd_icon',
        'icon_global': 'dwd_icon',
        'icon_eu': 'dwd_icon_eu',
        'icon_d2': 'dwd_icon_d2',
        'ecmwf_ifs025': 'ecmwf_ifs025',
        'ecmwf_aifs025_single': 'ecmwf_aifs025_single',
        'gfs_seamless': 'ncep_gfs013',
        'gfs_global': 'ncep_gfs025',
        'gfs_hrrr': 'ncep_hrrr_conus',
        'arome_france': 'meteofrance_arome_france0025',
        'gfs_graphcast025': 'ncep_gfs_graphcast025',
        'gem_hrdps_continental': 'cmc_gem_hrdps',
        'gem_regional': 'cmc_gem_rdps'
    },
    // Definiert die Fähigkeiten (z.B. Druckstufen) pro Modell-ID
    MODEL_PROPERTIES: {
        // DWD-Modelle (ICON)
        'icon_seamless': {
            pressureLevels: [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200],
            maxDays: 7,
            resolutionKm: 7
        },
        'icon_global': {
            pressureLevels: [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200],
            maxDays: 7,
            resolutionKm: 11
        },
        'icon_eu': {
            pressureLevels: [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200],
            maxDays: 5,
            resolutionKm: 7,
            // Bbox aus meteokit/src/config.js (dieselbe DWD-ICON-EU-Domain) --
            // ermoeglicht checkAvailableModels() eine reine Geometrie-Pruefung
            // statt eines Live-Requests gegen public (siehe timeSlider.js).
            bbox: { latMin: 29.5, latMax: 70.5, lonMin: -23.5, lonMax: 62.5 }
        },
        'icon_d2': {
            pressureLevels: [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200],
            maxDays: 2,
            resolutionKm: 2.2,
            bbox: { latMin: 43.18, latMax: 58.08, lonMin: -3.94, lonMax: 20.34 }
        },

        // ECMWF-Modelle
        'ecmwf_ifs025': {
            pressureLevels: [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200],
            maxDays: 7,
            resolutionKm: 25
        },
        'ecmwf_aifs025_single': {
            pressureLevels: [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200],
            maxDays: 7,
            resolutionKm: 28
        },

        // NCEP-Modelle (GFS)
        'gfs_seamless': {
            pressureLevels: [1000, 975, 950, 925, 900, 875, 850, 825, 800, 775, 750, 725, 700, 675, 650, 625, 600, 575, 550, 525, 500, 475, 450, 425, 400, 375, 350, 325, 300, 275, 250],
            maxDays: 7,
            resolutionKm: 25
        },
        'gfs_global': {
            pressureLevels: [1000, 975, 950, 925, 900, 875, 850, 825, 800, 775, 750, 725, 700, 675, 650, 625, 600, 575, 550, 525, 500, 475, 450, 425, 400, 375, 350, 325, 300, 275, 250],
            maxDays: 7,
            resolutionKm: 25
        },
        'gfs_hrrr': {
            pressureLevels: [1000, 975, 950, 925, 900, 875, 850, 825, 800, 775, 750, 725, 700, 675, 650, 625, 600, 575, 550, 525, 500, 475, 450, 425, 400, 375, 350, 325, 300, 275, 250],
            maxDays: 2,
            resolutionKm: 3
        },
        'gfs_graphcast025': {
            pressureLevels: [1000, 975, 950, 925, 900, 875, 850, 825, 800, 775, 750, 725, 700, 675, 650, 625, 600, 575, 550, 525, 500, 475, 450, 425, 400, 375, 350, 325, 300, 275, 250],
            maxDays: 7,
            resolutionKm: 25
        },

        // (Andere Modelle - wir weisen ihnen Standard-Level zu, bis wir es besser wissen)
        'arome_france': {
            pressureLevels: [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200],
            maxDays: 2,
            resolutionKm: 2.5
        },
        'gem_hrdps_continental': {
            pressureLevels: [1015, 1000, 985, 970, 950, 925, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 250, 200],
            maxDays: 2,
            resolutionKm: 15
        },
        'gem_regional': {
            pressureLevels: [1015, 1000, 985, 970, 950, 925, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 250, 200],
            maxDays: 3,
            resolutionKm: 2.5
        }
    }
};

// -----------------------------------------------------------
// 4. API ENDPUNKTE
// -----------------------------------------------------------
export const API_URLS = {
    FORECAST: "https://api.open-meteo.com/v1/forecast",
    MARINE: "https://marine-api.open-meteo.com/v1/marine",
    // ELEVATION entfernt: performLandSeaCheck() in weather.js prüft seit
    // diesem Branch lokal gegen landPolygons.js (kein API-Aufruf mehr nötig).
};

// -----------------------------------------------------------
// 4b. RATENLIMITFREIE ICON-INSTANZEN (Host-Ketten mit Fallback)
// -----------------------------------------------------------
// Namen wie in meteokit/src/config.js. Alle Instanzen sind identisch
// aufgebaut (/v1/forecast, /v1/elevation, /data/<dataset>/static/meta.json),
// nur die Basis-URL unterscheidet sich. Abrufe laufen über apifetch.js
// (fetchJsonWithFallback): bevorzugter Host zuerst, bei Netzwerkfehler,
// HTTP ≠ 2xx, kaputtem JSON oder unbrauchbarer Antwort (z. B. HTTP 200 mit
// lauter null) der nächste; ein ausgefallener Host rückt je Endpunkt und
// Modell für 5 min ans Ende.
//
// Seit 2026-09 bevorzugt: neuer Server mit ICON-D2, ICON-EU und ICON Global.
// Stichprobe 2026-09-27: für ICON-D2 Boden- und Modelllevel-Felder wertgleich
// mit open-meteo.mah.priv.at (gleicher Lauf); ICON Global dort ggf. einen
// Lauf hinter api.open-meteo.com.
export const API_BASE = "https://open-meteo.wetterheidi.de";
// Bisherige Instanzen (Michael), jetzt Fallback. open-meteo.mah.priv.at
// antwortet ohne Referer-Header mit 403 (Browser senden ihn, curl nicht).
export const LEGACY_API_BASE = "https://open-meteo.mah.priv.at";
// ICON Global lief seit 2026-08 auf einem eigenen Temp-Server (auf
// LEGACY_API_BASE ist die dwd_icon-Ingestion kaputt). Stichprobe 2026-09-27:
// liefert für dwd_icon nur noch null (meta.json: Lauf vom 16.09.) -- bleibt
// als Fallback, die Null-Prüfung in weather.js überspringt ihn dann.
export const LEGACY_API_BASE_ICON_GLOBAL = "https://open-meteo-temp.mah.priv.at";
// Öffentliche, gemeterte Instanz -- letzter Fallback (Abrufe dorthin laufen
// durch die RequestQueue in weather.js).
export const SURFACE_API_BASE = "https://api.open-meteo.com";

// Host-Kette je Modell, bevorzugter Host zuerst. Nur Modelle mit Eintrag
// werden über die ratenlimitfreien Instanzen geroutet.
export const MODEL_API_BASES = {
    icon_d2: [API_BASE, LEGACY_API_BASE, SURFACE_API_BASE],
    icon_eu: [API_BASE, LEGACY_API_BASE, SURFACE_API_BASE],
    icon_global: [API_BASE, LEGACY_API_BASE_ICON_GLOBAL, SURFACE_API_BASE],
    icon_seamless: [API_BASE, LEGACY_API_BASE_ICON_GLOBAL, SURFACE_API_BASE],
};

// Modelllevel-Variablen (cloud_cover_level{N}, height_agl_level{N}) gibt es
// auf der öffentlichen Instanz nicht -- dort ohne SURFACE_API_BASE.
export const modelLevelApiBases = (apiName) =>
    (MODEL_API_BASES[apiName] || []).filter(b => b !== SURFACE_API_BASE);

// DEM90-Geländehöhe (/v1/elevation), nur für den Orographie-Hinweis (Δ
// Modell- vs. Geländehöhe) -- die Bodenwerte bleiben auf Modellhöhe. Wie
// meteokit elevationApiBases(). Antwortet ein Host mit {"elevation":[nan]}
// (kein gültiges JSON), geht es zum nächsten.
export const ELEVATION_API_BASES = [API_BASE, LEGACY_API_BASE, SURFACE_API_BASE];

// Ab dieser Differenz zwischen DEM-Geländehöhe und Modell-Orographie gilt das
// lokale Gelände als vom Modellgitter nicht aufgelöst -- grobe Faustregel,
// derselbe Wert wie droneforecast TERRAIN_MISMATCH_WARN_M.
export const TERRAIN_MISMATCH_WARN_M = 100;

// Modelle, bei denen Michael native Modell-Level-Wolkendaten
// (cloud_cover_level{N}, height_agl_level{N}) tatsächlich führt -- bei
// icon_global/icon_seamless kommt cloud_cover_level{N} auch auf der
// dedizierten Instanz durchgehend null zurück, dort bleibt cloudBase/
// cloudCeiling auf dem alten Druckstufen-Pfad (siehe weather.js).
export const MICHAEL_LEVEL_CLOUD_MODELS = new Set(["icon_d2", "icon_eu"]);

// Level-Anzahl je Modell (für die Cap-Sondierung, wie droneforecast/
// cloudoverlay.js ensureBand()). Nur für die oben gelisteten Modelle nötig.
export const MICHAEL_MODEL_LEVELS = { icon_d2: 65, icon_eu: 74 };

// Höhen-Cap für die Wolken-Level-Sondierung (m AGL) -- wie meteokit
// CLOUD_OVERLAY_CAP_M, deckt auch Cirren ab.
export const MICHAEL_CLOUD_CAP_M = 12000;

// Whitelist: NUR diese Oberflächen-Parameter sind auf Michael bestätigt real
// befüllt (curl-Stichprobe; 2026-09-27 auch auf API_BASE bestätigt, dort
// ebenfalls null: precipitation_probability, soil_temperature_0cm,
// snow_depth). Alles andere (snow_depth, soil_temperature_0cm,
// precipitation_probability, alle *_hPa-Druckstufenparameter) geht immer an
// die öffentliche API -- bewusst als Whitelist (fail-closed), nicht als
// Blacklist: ein künftiger, hier nicht gelisteter Parameter landet damit
// automatisch auf dem sicheren (öffentlichen) Pfad statt still auf Michael
// null zurückzubekommen.
export const MICHAEL_SURFACE_WHITELIST = new Set([
    "temperature_2m", "wind_gusts_10m", "wind_speed_10m", "wind_direction_10m",
    "cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high",
    "visibility", "apparent_temperature", "precipitation", "weather_code",
    "relative_humidity_2m", "dew_point_2m", "freezing_level_height", "cape", "snowfall",
]);

// -----------------------------------------------------------
// 5. HELPER FUNKTIONEN
// -----------------------------------------------------------

/**
 * Gibt die Auflösung für ein Modell zurück (mit sicherem Fallback auf 10km).
 * @param {string} apiName - Name des Modells
 * @returns {number} Auflösung in km
 */
export const getModelResolution = (apiName) => {
    if (apiName === 'auto') return 10;
    const props = WEATHER_MODELS.MODEL_PROPERTIES[apiName];
    return (props && props.resolutionKm) ? props.resolutionKm : 10;
};

/**
 * Gibt die max. Vorhersagetage zurück (mit sicherem Fallback auf 7).
 * @param {string} apiName - Name des Modells
 * @returns {number} Maximale Vorhersagetage
 */
export const getModelMaxDays = (apiName) => {
    if (apiName === 'auto') return 7;
    const props = WEATHER_MODELS.MODEL_PROPERTIES[apiName];
    return (props && props.maxDays) ? props.maxDays : 7;
};