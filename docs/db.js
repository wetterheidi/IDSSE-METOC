// docs/db.js

// -----------------------------------------------------------
// 1. IMPORTS
// -----------------------------------------------------------
import { DB_NAME, DB_VERSION, STORES } from './config.js';

// -----------------------------------------------------------
// 2. DATENBANK INITIALISIERUNG
// -----------------------------------------------------------

// 1. Datenbank initialisieren und exportieren
export const db = new Dexie(DB_NAME);

// NEU: Version 3 mit dem weatherCache
db.version(3).stores({
  profiles: '++id, name',
  templates: '++id, name',
  weatherCache: 'id' // 'id' wird unser Cache-Schlüssel (z.B. "profilID_modell_laufzeit")
});

console.log("Lokale Dexie-Datenbank initialisiert (Version " + db.verno + ").");

// -----------------------------------------------------------
// 3. PROFIL FUNKTIONEN
// (Getters, Finders, Mutators, Export)
// -----------------------------------------------------------

export const getProfiles = () => db.profiles.toArray();
export const getProfileCount = () => db.profiles.count();
export const getProfile = (id) => db.profiles.get(id);

/**
 * Sucht ein Profil anhand seines Namens (Groß/Kleinschreibung egal).
 */
export const findProfileByName = (name) => {
    if (!name) return null;
    // .where('name') nutzt den Index, .equalsIgnoreCase ist robust gegen Tippfehler
    return db.profiles.where('name').equalsIgnoreCase(name).first();
};

export const saveProfile = (profile) => db.profiles.add(profile);
export const deleteProfile = (id) => db.profiles.delete(id);
export const bulkAddProfiles = (profiles) => db.profiles.bulkAdd(profiles);

/**
 * Holt Profile und entfernt die 'id' für einen sauberen Export.
 */
export const getProfilesForExport = async () => {
    const allProfiles = await db.profiles.toArray();
    // 'id' entfernen
    return allProfiles.map(({ id, ...rest }) => rest); 
};


// -----------------------------------------------------------
// 4. VORLAGEN FUNKTIONEN
// (Getters, Finders, Mutators)
// -----------------------------------------------------------

export const getTemplates = () => db.templates.toArray();
export const getTemplate = (id) => db.templates.get(id);

export const findTemplateByName = (name) => {
    if (!name) return null;
    return db.templates.where('name').equalsIgnoreCase(name).first();
};

export const saveTemplate = (template) => db.templates.add(template);
export const deleteTemplate = (id) => db.templates.delete(id);

// -----------------------------------------------------------
// 5. CACHE & APP STATE FUNKTIONEN (Allgemeiner Speicher)
// -----------------------------------------------------------

// --- Cache (Wetterdaten) ---

export const setCache = (key, summary) => {
    try {
        return db.weatherCache.put({
            id: key,
            timestamp: Date.now(),
            summary: summary
        });
    } catch (e) {
        console.error("Cache-Schreibfehler:", e);
    }
};

export const getCache = (key) => {
    try {
        return db.weatherCache.get(key);
    } catch (e) {
        console.error("Cache-Lesefehler:", e);
        return null;
    }
};


// --- App State (z.B. manuelle Overrides) ---

/**
 * Speichert einen allgemeinen Zustandswert (z.B. manuelle Overrides).
 */
export const setAppState = (key, value) => {
    try {
        return db.weatherCache.put({
            id: key,
            data: value, // Speichere den eigentlichen Wert unter 'data'
            timestamp: Date.now()
        });
    } catch (e) {
        console.error("AppState-Schreibfehler:", e);
    }
};

/**
 * Lädt einen allgemeinen Zustandswert.
 */
export const getAppState = async (key) => {
    try {
        const entry = await db.weatherCache.get(key);
        return entry ? entry.data : null;
    } catch (e) {
        console.error("AppState-Lesefehler:", e);
        return null;
    }
};