// config.js
export const AUTO_CHECK_INTERVAL = 6000000; // 100 Minute (zum Testen)

// "Gelb"-Schwellen
export const WARN_FACTORS = {
    wind: 0.9,      // Gelb bei 90% des Limits
    temp: 2,        // Gelb 2°C *über* dem Min-Limit
    vis: 1.2,       // Gelb 20% *über* dem Min-Limit
    cloud: 1.2,     // Gelb 20% *über* dem Min-Limit
    precip: 0.9     // Gelb bei 90% des Max-Limits
};

export const DB_VERSION = 2;
export const DB_NAME = "IDSSE_M_Database";
export const STORES = {
    profiles: '++id, name',
    templates: '++id, name'
};