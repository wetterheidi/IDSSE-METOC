// config.js
export const AUTO_CHECK_INTERVAL = 6000000; // 100 Minute (zum Testen)

// "Gelb"-Schwellen
export const WARN_FACTORS = {
    wind: 0.9,      // Gelb bei 90% des Limits
    temp: 2,        // Gelb 2°C *über* dem Min-Limit
    vis: 1.2,       // Gelb 20% *über* dem Min-Limit
    cloud: 0.9,     // Gelb bei 90% des Max-Limits 
    snow: 0.9       // Gelb bei 90% des Max-Limits
};

export const DB_VERSION = 3;
export const DB_NAME = "IDSSE_M_Database";
export const STORES = {
    profiles: '++id, name',
    templates: '++id, name',
    weatherCache: 'id'
};

export const CONVERSIONS = {
    KMH_TO_KTS: 0.539957,
    METER_TO_FEET: 3.28084
};

// NEU: Einheiten-Labels
export const UNITS = {
    metric: {
        speed: 'km/h',
        altitude: 'm',
        temp: '°C'
    },
    aviation: {
        speed: 'kts',
        altitude: 'ft',
        temp: '°C' // (Wir bleiben bei °C, °F ist zu viel Aufwand)
    }
};

// NEU: Wettermodell-Konstanten
export const WEATHER_MODELS = {
    // Liste der Modelle, die auf Verfügbarkeit geprüft werden sollen (Open-Meteo API Name)
    LIST: [
        'icon_seamless',
        'icon_global',
        'icon_eu',
        'icon_d2',
        'ecmwf_ifs',
        'ecmwf_aifs025_single',
        'gfs_seamless',
        'gfs_global',
        'gfs_hrrr',
        'gfs_graphcast025',
        'arome_france',
        'gem_hrdps_continental',
        'gem_regional'
    ],
    // Mappings für die Anzeige
    DISPLAY_MAP: {
        'icon_seamless': 'ICON-Seamless (Global)',
        'icon_global': 'ICON-Global',
        'icon_d2': 'ICON-D2 (Regional D2)',
        'icon_eu': 'ICON-EU (Regional EU)',
        'ecmwf_ifs': 'ECMWF IFS 9 km',
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
        'ecmwf_ifs': 'ecmwf_ifs',
        'ecmwf_aifs025_single': 'ecmwf_aifs025_single',
        'gfs_seamless': 'ncep_gfs013',
        'gfs_global': 'ncep_gfs025',
        'gfs_hrrr': 'ncep_hrrr_conus',
        'arome_france': 'meteofrance_arome_france0025',
        'gfs_graphcast025': 'ncep_gfs_graphcast025',
        'gem_hrdps_continental': 'cmc_gem_hrdps',
        'gem_regional': 'cmc_gem_rdps'
    }
};

// NEU: API URLs
export const API_URLS = {
    FORECAST: "https://api.open-meteo.com/v1/forecast"
};