/**
 * Build-time script: Extract keyword/function/deprecated lists from the raw BNF JSON.
 *
 * Reads bnf/getBaseBNF_result.json, parses it using the same bnf-parser.js logic,
 * and writes a compact JS module (src/syntax/bnf-static-data.js) containing only
 * the extracted name arrays (~5KB vs ~557KB raw JSON).
 *
 * Run after updating the BNF JSON:
 *   node scripts/extract-bnf-keywords.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { parseBnfDefs } from '../src/syntax/bnf-parser.js';

const bnfPath = new URL('../bnf/getBaseBNF_result.json', import.meta.url);
const bnfData = JSON.parse(readFileSync(bnfPath, 'utf-8'));
const sets = parseBnfDefs(bnfData.result.qBnfDefs);

/**
 * Convert a Set to a sorted JSON array string.
 *
 * @param {Set<string>} set - The set to convert.
 *
 * @returns {string} JSON array string.
 */
const sortedArray = (set) => JSON.stringify([...set].sort());

const output = `// Auto-generated from bnf/getBaseBNF_result.json — do not edit manually.
// Re-generate: node scripts/extract-bnf-keywords.mjs

export const STATEMENT_KEYWORDS = ${sortedArray(sets.statementKeywords)};

export const CONTROL_KEYWORDS = ${sortedArray(sets.controlKeywords)};

export const FUNCTIONS = ${sortedArray(sets.functions)};

export const AGGR_FUNCTIONS = ${sortedArray(sets.aggrFunctions)};

export const DEPRECATED_NAMES = ${sortedArray(sets.deprecated)};
`;

const outPath = new URL('../src/syntax/bnf-static-data.js', import.meta.url);
writeFileSync(outPath, output, 'utf-8');

const stats = {
    statementKeywords: sets.statementKeywords.size,
    controlKeywords: sets.controlKeywords.size,
    functions: sets.functions.size,
    aggrFunctions: sets.aggrFunctions.size,
    deprecated: sets.deprecated.size,
};
console.log('Extracted BNF keyword data:', stats);
console.log('Written to: src/syntax/bnf-static-data.js');
