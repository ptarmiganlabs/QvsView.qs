/**
 * Runtime BNF loader for fetching fresh BNF data from the Qlik Engine API.
 *
 * Calls GetBaseBNF via the enigma global connection, falling back to
 * bundled static data if the API is unavailable (e.g., on Qlik Cloud
 * or in nebula dev server).
 *
 * Enabled via the property panel toggle: viewer.useRuntimeBnf.
 *
 * @module bnf-loader
 */

import { parseBnfDefs } from './bnf-parser.js';
import logger from '../util/logger.js';

/** @type {import('./bnf-parser.js').BnfKeywordSets | null} */
let cachedResult = null;

/**
 * Fetch BNF definitions from the Qlik Engine API and parse them into keyword sets.
 *
 * Uses the enigma global object accessible via the classic extension API:
 * `require(['qlik']).currApp().global.session.__enigmaGlobal.getBaseBNF()`.
 *
 * Results are cached after the first successful call.
 *
 * @returns {Promise<import('./bnf-parser.js').BnfKeywordSets | null>} Parsed keyword sets, or null if unavailable.
 */
export async function fetchRuntimeBnf() {
    if (cachedResult) return cachedResult;

    try {
        const qlikApi = await loadQlikApi();
        if (!qlikApi) return null;

        const app = qlikApi.currApp();
        if (!app?.global?.session?.__enigmaGlobal) {
            logger.warn('BNF loader: enigma global not available');
            return null;
        }

        const enigmaGlobal = app.global.session.__enigmaGlobal;
        if (typeof enigmaGlobal.getBaseBNF !== 'function') {
            logger.warn('BNF loader: getBaseBNF method not found');
            return null;
        }

        const resp = await enigmaGlobal.getBaseBNF({ qBnfType: 'S' });
        if (!resp?.qBnfDefs || !Array.isArray(resp.qBnfDefs)) {
            logger.warn('BNF loader: unexpected response format');
            return null;
        }

        logger.info(`BNF loader: fetched ${resp.qBnfDefs.length} definitions from engine`);
        cachedResult = parseBnfDefs(resp.qBnfDefs);
        return cachedResult;
    } catch (err) {
        logger.warn('BNF loader: fetch failed, will use static data', err);
        return null;
    }
}

/**
 * Clear the cached BNF result (e.g., when toggling runtime BNF off).
 *
 * @returns {void}
 */
export function clearBnfCache() {
    cachedResult = null;
}

/**
 * Load the classic Qlik extension API via AMD require.
 *
 * @returns {Promise<object|null>} The qlik API object, or null if unavailable.
 */
function loadQlikApi() {
    return new Promise((resolve) => {
        if (typeof require !== 'function') {
            resolve(null);
            return;
        }
        try {
            require(['qlik'], (qlik) => resolve(qlik || null), () => resolve(null));
        } catch {
            resolve(null);
        }
    });
}
