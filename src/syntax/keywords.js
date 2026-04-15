/**
 * Qlik script keywords extracted from the official BNF grammar
 * (GetBaseBNF qBnfType="S").
 *
 * Static lists are pre-extracted at build time (see scripts/extract-bnf-keywords.mjs)
 * and can optionally be refreshed at runtime via the Engine API.
 *
 * These are used by the regex-based syntax highlighter.
 */

import {
    STATEMENT_KEYWORDS,
    CONTROL_KEYWORDS,
    FUNCTIONS,
    AGGR_FUNCTIONS,
    DEPRECATED_NAMES,
} from './bnf-static-data.js';

/**
 * Sub-keywords used in statement/control contexts that are not in the BNF
 * as explicit statement or control markers, but are important for highlighting.
 *
 * @type {Set<string>}
 */
export const SUB_KEYWORDS = new Set([
    'As',
    'Autogenerate',
    'Crosstable',
    'Distinct',
    'Each',
    'Else',
    'Every',
    'Exists',
    'Field',
    'Fields',
    'From',
    'Group',
    'By',
    'Having',
    'In',
    'Inline',
    'Into',
    'Is',
    'Like',
    'Not',
    'On',
    'Or',
    'And',
    'Order',
    'Resident',
    'Table',
    'Tables',
    'To',
    'Using',
    'Where',
    'With',
]);

/**
 * All keywords combined (for case-insensitive lookup).
 * Built from BNF-parsed statement + control keywords plus sub-keywords.
 *
 * @type {Set<string>}
 */
/** Static keyword set (lowercase) built from pre-extracted BNF data. */
const staticKeywords = new Set([
    ...STATEMENT_KEYWORDS.map((k) => k.toLowerCase()),
    ...CONTROL_KEYWORDS.map((k) => k.toLowerCase()),
    ...Array.from(SUB_KEYWORDS).map((k) => k.toLowerCase()),
]);

/** Static function set (lowercase). */
const staticFunctions = new Set([
    ...FUNCTIONS.map((f) => f.toLowerCase()),
    ...AGGR_FUNCTIONS.map((f) => f.toLowerCase()),
]);

/** Static deprecated set (lowercase). */
const staticDeprecated = new Set(DEPRECATED_NAMES.map((d) => d.toLowerCase()));

export let ALL_KEYWORDS = new Set(staticKeywords);

/**
 * All function names in lowercase for case-insensitive matching.
 * Built from BNF-parsed function + aggregation function lists.
 *
 * @type {Set<string>}
 */
export let ALL_FUNCTIONS = new Set(staticFunctions);

/**
 * Deprecated function/keyword names in lowercase.
 *
 * @type {Set<string>}
 */
export let DEPRECATED = new Set(staticDeprecated);

/**
 * Replace the keyword and function sets with runtime BNF data.
 *
 * Called when the runtime BNF loader successfully fetches fresh data
 * from the Qlik Engine API.
 *
 * @param {import('./bnf-parser.js').BnfKeywordSets} runtimeSets - Parsed runtime BNF data.
 *
 * @returns {void}
 */
export function applyRuntimeBnf(runtimeSets) {
    ALL_KEYWORDS = new Set([
        ...runtimeSets.allKeywords,
        ...Array.from(SUB_KEYWORDS).map((k) => k.toLowerCase()),
    ]);
    ALL_FUNCTIONS = runtimeSets.allFunctions;
    DEPRECATED = runtimeSets.deprecatedLower;
}

/**
 * Reset keyword and function sets to the static BNF data.
 *
 * @returns {void}
 */
export function resetToStaticBnf() {
    ALL_KEYWORDS = new Set(staticKeywords);
    ALL_FUNCTIONS = new Set(staticFunctions);
    DEPRECATED = new Set(staticDeprecated);
}
