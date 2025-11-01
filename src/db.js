// db.js
import { DB_NAME, DB_VERSION, STORES } from './config.js';

// 1. Datenbank initialisieren und exportieren
export const db = new Dexie(DB_NAME);

// NEU: Version 3 mit dem weatherCache
db.version(3).stores({
  profiles: '++id, name',
  templates: '++id, name',
  weatherCache: 'id' // 'id' wird unser Cache-Schlüssel (z.B. "profilID_modell_laufzeit")
});

console.log("Lokale Dexie-Datenbank initialisiert (Version " + db.verno + ").");

// --- PROFIL-FUNKTIONEN ---

export const getProfiles = () => db.profiles.toArray();
export const getProfileCount = () => db.profiles.count();
export const getProfile = (id) => db.profiles.get(id);
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


// --- VORLAGEN-FUNKTIONEN ---

export const getTemplates = () => db.templates.toArray();
export const getTemplate = (id) => db.templates.get(id);
export const saveTemplate = (template) => db.templates.add(template);

export const getCache = (key) => {
    try {
        return db.weatherCache.get(key);
    } catch (e) {
        console.error("Cache-Lesefehler:", e);
        return null;
    }
};
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