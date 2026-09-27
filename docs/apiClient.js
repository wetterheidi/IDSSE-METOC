// docs/apiClient.js
// -----------------------------------------------------------
// Zentrale Abruf-Schicht für alle Open-Meteo-Requests:
//  - RequestQueue: Drosselung für die öffentliche (gemeterte) Instanz.
//  - fetchModelJson: Host-Fallback (apifetch.js aus meteokit) über die
//    Host-Ketten aus config.js; Anfragen an SURFACE_API_BASE laufen dabei
//    automatisch durch die RequestQueue, alle anderen direkt.
//  - Quellenanzeige: welcher Host hat je Datenart zuletzt geliefert.
// -----------------------------------------------------------
import { fetchJsonWithFallback, getApiSources, onApiSourceChange } from './apifetch.js';
import { SURFACE_API_BASE } from './config.js';

export { getApiSources, onApiSourceChange };

/**
 * Zentraler Rate-Limiter für ALLE Open-Meteo API-Calls.
 * Stellt sicher, dass nie mehr als MAX_CONCURRENT Requests gleichzeitig
 * laufen und zwischen jedem Request MIN_DELAY_MS gewartet wird.
 * So werden 429-Fehler bei vielen Profilen zuverlässig verhindert.
 */
export const RequestQueue = (() => {
    const MAX_CONCURRENT = 2;   // Maximal 2 parallele Requests
    const MIN_DELAY_MS   = 400; // Mindest-Pause zwischen Requests (= max ~2.5 req/s)

    let active   = 0;
    let lastSent = 0;
    const queue  = [];

    function tryNext() {
        if (queue.length === 0 || active >= MAX_CONCURRENT) return;

        const now         = Date.now();
        const sinceLastMs = now - lastSent;
        const waitMs      = Math.max(0, MIN_DELAY_MS - sinceLastMs);

        setTimeout(() => {
            if (active >= MAX_CONCURRENT) { tryNext(); return; }

            const { url, resolve, reject, retries } = queue.shift();
            active++;
            lastSent = Date.now();

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            fetch(url, { signal: controller.signal })
                .then(async res => {
                    clearTimeout(timeoutId);
                    if (res.status === 429 && retries > 0) {
                        const backoffMs = Math.pow(2, 3 - retries) * 1500; // 1.5s, 3s, 6s
                        console.warn(`[Queue] 429 – Retry in ${backoffMs}ms (${retries} versuche übrig)`);
                        await new Promise(r => setTimeout(r, backoffMs));
                        queue.unshift({ url, resolve, reject, retries: retries - 1 });
                        active--;
                        tryNext();
                        return;
                    }
                    active--;
                    tryNext();
                    resolve(res);
                })
                .catch(err => {
                    clearTimeout(timeoutId);
                    active--;
                    tryNext();
                    if (err.name === 'AbortError') {
                        reject(new Error('Open-Meteo API antwortet nicht (Timeout nach 15s). Bitte später erneut versuchen.'));
                    } else {
                        reject(err);
                    }
                });
        }, waitMs);
    }

    return {
        /**
         * Führt einen fetch()-Aufruf über die Queue durch.
         * Ersetze alle fetch()-Aufrufe in dieser Datei damit.
         * @param {string} url
         * @param {number} retries - Wiederholungsversuche bei 429
         * @returns {Promise<Response>}
         */
        fetch(url, retries = 3) {
            return new Promise((resolve, reject) => {
                queue.push({ url, resolve, reject, retries });
                tryNext();
            });
        },

        /** Debugging: Aktueller Status der Queue */
        status() {
            return { queued: queue.length, active };
        }
    };
})();
/**
 * fetch() mit Timeout, OHNE RequestQueue -- für die ratenlimitfreien
 * Instanzen. Ein Timeout wird bewusst als normaler Error (nicht AbortError)
 * geworfen: apifetch.js leitet AbortErrors nie auf den nächsten Host um
 * (reserviert für Abbrüche durch den Nutzer), ein hängender Host soll aber
 * sehr wohl zum Fallback führen.
 */
export async function fetchDirect(url, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { signal: controller.signal });
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error(`Timeout nach ${timeoutMs / 1000}s: ${hostLabel(url)}`);
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
}


/**
 * JSON über eine Host-Kette abrufen (bevorzugter Host zuerst).
 * @param {string[]} bases        Host-Kette, z. B. MODEL_API_BASES.icon_d2
 * @param {string} pathAndQuery   z. B. "/v1/forecast?latitude=…"
 * @param {object} opts           { sourceKey, validate } -- siehe apifetch.js;
 *                                timeoutMs je Host (nicht für SURFACE_API_BASE,
 *                                dort gilt der Timeout der RequestQueue)
 * @returns {Promise<{data: any, base: string}>}
 */
export function fetchModelJson(bases, pathAndQuery, { sourceKey, validate, timeoutMs = 15000 } = {}) {
    const fetchImpl = (url) => (url.startsWith(SURFACE_API_BASE) ? RequestQueue.fetch(url) : fetchDirect(url, timeoutMs));
    return fetchJsonWithFallback(bases, pathAndQuery, { fetchImpl, sourceKey, validate, withBase: true });
}

/**
 * JSON direkt von der öffentlichen Instanz (über die RequestQueue), ohne
 * Fallback -- für Felder, die nur dort existieren (Druckflächen, marine, …).
 */
export async function fetchPublicJson(url) {
    const res = await RequestQueue.fetch(url);
    if (!res.ok) throw new Error(`API-Fehler: ${res.status} ${res.statusText}`);
    return res.json();
}

/** Kurzer Hostname für Anzeige/Logs. */
export function hostLabel(base) {
    try { return new URL(base).host; } catch { return String(base); }
}
