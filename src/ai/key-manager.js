/**
 * API key manager for AI providers.
 *
 * Handles two key modes:
 * - 'stored': Key is saved in the Qlik object properties (convenient but visible).
 * - 'prompt': Key is requested from the user at runtime and cached in sessionStorage.
 *
 * Future: Support reading keys from Qlik variables.
 */

const STORAGE_PREFIX = 'qvsview-ai-key-';

/**
 * Retrieve the API key for a provider.
 *
 * For 'stored' mode, returns the key from the config object.
 * For 'prompt' mode, checks sessionStorage first, then resolves to null
 * if no cached key exists (caller should show the key prompt dialog).
 *
 * @param {string} provider - Provider name ('openai' or 'anthropic').
 * @param {object} config - The full ai config from layout.
 *
 * @returns {string|null} The API key, or null if unavailable (needs prompt).
 */
export function getApiKey(provider, config) {
    const providerConfig = config[provider];
    if (!providerConfig) return null;

    const keyMode = providerConfig.keyMode || 'prompt';

    if (keyMode === 'stored') {
        return providerConfig.apiKey || null;
    }

    // 'prompt' mode — check sessionStorage cache
    try {
        return sessionStorage.getItem(`${STORAGE_PREFIX}${provider}`) || null;
    } catch {
        return null;
    }
}

/**
 * Cache an API key in sessionStorage for the current browser session.
 *
 * @param {string} provider - Provider name ('openai' or 'anthropic').
 * @param {string} key - The API key to cache.
 *
 * @returns {void}
 */
export function cacheApiKey(provider, key) {
    try {
        sessionStorage.setItem(`${STORAGE_PREFIX}${provider}`, key);
    } catch {
        // sessionStorage may be unavailable in some environments
    }
}

/**
 * Clear a cached API key from sessionStorage.
 *
 * @param {string} provider - Provider name ('openai' or 'anthropic').
 *
 * @returns {void}
 */
export function clearApiKey(provider) {
    try {
        sessionStorage.removeItem(`${STORAGE_PREFIX}${provider}`);
    } catch {
        // Ignore errors
    }
}
