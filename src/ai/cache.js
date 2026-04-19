/**
 * Analysis result cache using sessionStorage.
 *
 * Caches AI analysis results keyed by a hash of the script + config,
 * with a configurable TTL (default 30 minutes).
 */

const CACHE_PREFIX = 'qvsview-ai-cache-';
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Generate a simple hash for a string (djb2).
 *
 * @param {string} str - Input string to hash.
 *
 * @returns {string} Hex hash string.
 */
function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    }
    return h.toString(16);
}

/**
 * Build a cache key from the script text and analysis configuration.
 *
 * @param {string} script - Script text being analyzed.
 * @param {object} config - AI configuration (provider, model, template, etc.).
 *
 * @returns {string} Cache key string.
 */
function buildKey(script, config) {
    const parts = [
        config.provider || '',
        config[config.provider]?.model || '',
        config.promptTemplate || '',
        config.systemPrompt || '',
        script,
    ].join('|');
    return `${CACHE_PREFIX}${hash(parts)}`;
}

/**
 * Retrieve a cached analysis result.
 *
 * @param {string} script - Script text that was analyzed.
 * @param {object} config - AI configuration used for the analysis.
 *
 * @returns {{ content: string, model: string, provider: string } | null}
 *   Cached result, or null if not found or expired.
 */
export function getCachedResult(script, config) {
    try {
        const key = buildKey(script, config);
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;

        const entry = JSON.parse(raw);
        if (Date.now() - entry.timestamp > DEFAULT_TTL_MS) {
            sessionStorage.removeItem(key);
            return null;
        }
        return entry.result;
    } catch {
        return null;
    }
}

/**
 * Store an analysis result in the cache.
 *
 * @param {string} script - Script text that was analyzed.
 * @param {object} config - AI configuration used for the analysis.
 * @param {{ content: string, model: string, provider: string }} result - Analysis result.
 *
 * @returns {void}
 */
export function setCachedResult(script, config, result) {
    try {
        const key = buildKey(script, config);
        sessionStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), result }));
    } catch {
        // sessionStorage full or unavailable — silently ignore
    }
}

/**
 * Clear all cached analysis results.
 *
 * @returns {void}
 */
export function clearCache() {
    try {
        const keys = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith(CACHE_PREFIX)) {
                keys.push(key);
            }
        }
        keys.forEach((k) => sessionStorage.removeItem(k));
    } catch {
        // Ignore errors
    }
}
