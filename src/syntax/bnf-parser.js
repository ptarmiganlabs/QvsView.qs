/**
 * BNF parser utility for extracting keyword, function, and statement lists
 * from Qlik Engine API GetBaseBNF data.
 *
 * Parses either the bundled static JSON (bnf/getBaseBNF_result.json) or
 * runtime data fetched via the Engine API.
 *
 * @module bnf-parser
 */

/**
 * @typedef {object} BnfEntry
 * @property {number[]} qBnf - Child indices in the BNF tree.
 * @property {number} qNbr - Entry index number.
 * @property {number} qPNbr - Parent entry index.
 * @property {string} qName - Rule or literal name.
 * @property {string} [qStr] - Literal text (for terminal symbols).
 * @property {string} qFG - Function group identifier.
 * @property {boolean} [qScriptStatement] - True if this is a script statement.
 * @property {boolean} [qControlStatement] - True if this is a control statement.
 * @property {boolean} [qQvFunc] - True if this is a Qlik function.
 * @property {boolean} [qAggrFunc] - True if this is an aggregation function.
 * @property {boolean} [qBnfLiteral] - True if this is a terminal literal.
 * @property {boolean} [qDepr] - True if this entry is deprecated.
 */

/**
 * @typedef {object} BnfKeywordSets
 * @property {Set<string>} statementKeywords - Script statement keywords (e.g., Load, Set, Let).
 * @property {Set<string>} controlKeywords - Control flow keywords (e.g., If, For, Sub).
 * @property {Set<string>} functions - Built-in function names (e.g., Avg, Date, Left).
 * @property {Set<string>} aggrFunctions - Aggregation function names (e.g., Sum, Count, Max).
 * @property {Set<string>} deprecated - Deprecated function/keyword names.
 * @property {Set<string>} allKeywords - Combined set of all keywords (lowercase).
 * @property {Set<string>} allFunctions - Combined set of all functions (lowercase).
 * @property {Set<string>} deprecatedLower - Deprecated names in lowercase.
 */

/**
 * Parse BNF definitions into categorized keyword and function sets.
 *
 * Extracts statement keywords, control keywords, functions, aggregation functions,
 * and deprecated entries from the raw BNF tree returned by GetBaseBNF.
 *
 * @param {BnfEntry[]} qBnfDefs - Array of BNF definitions from GetBaseBNF result.
 *
 * @returns {BnfKeywordSets} Categorized keyword and function sets.
 */
export function parseBnfDefs(qBnfDefs) {
    const nbrMap = new Map(qBnfDefs.map((d) => [d.qNbr, d]));

    /**
     * Check if a string starts with an alphabetic character.
     *
     * @param {string} s - String to test.
     *
     * @returns {boolean} True if the string starts with a letter.
     */
    const isWord = (s) => /^[a-zA-Z]/.test(s);

    // Statement keywords: entries marked qScriptStatement + qBnfLiteral with a text value
    const statementKeywords = new Set(
        qBnfDefs
            .filter((d) => d.qScriptStatement && d.qBnfLiteral && d.qStr && isWord(d.qStr))
            .map((d) => d.qStr)
    );

    // Control keywords: entries marked qControlStatement + qBnfLiteral with a text value
    const controlKeywords = new Set(
        qBnfDefs
            .filter((d) => d.qControlStatement && d.qBnfLiteral && d.qStr && isWord(d.qStr))
            .map((d) => d.qStr)
    );

    // Functions: named rules ending in _Func → first alphabetic literal child is the name
    const functions = new Set();
    const funcRules = qBnfDefs.filter((d) => d.qQvFunc && d.qName.endsWith('_Func'));
    for (const rule of funcRules) {
        for (const childNbr of rule.qBnf || []) {
            const child = nbrMap.get(childNbr);
            if (child && child.qBnfLiteral && child.qStr && isWord(child.qStr)) {
                functions.add(child.qStr);
                break;
            }
        }
    }
    // Also pick up function literals directly marked qQvFunc
    for (const d of qBnfDefs) {
        if (d.qQvFunc && d.qBnfLiteral && d.qStr && isWord(d.qStr)) {
            functions.add(d.qStr);
        }
    }

    // Aggregation functions: same approach for qAggrFunc
    const aggrFunctions = new Set();
    const aggrRules = qBnfDefs.filter((d) => d.qAggrFunc && d.qName.endsWith('_Func'));
    for (const rule of aggrRules) {
        for (const childNbr of rule.qBnf || []) {
            const child = nbrMap.get(childNbr);
            if (child && child.qBnfLiteral && child.qStr && isWord(child.qStr)) {
                aggrFunctions.add(child.qStr);
                break;
            }
        }
    }

    // Deprecated: entries with qDepr flag
    const deprecated = new Set();
    for (const d of qBnfDefs) {
        if (!d.qDepr) continue;
        if (d.qStr && isWord(d.qStr)) deprecated.add(d.qStr);
        else if (d.qName && isWord(d.qName)) deprecated.add(d.qName);
    }

    // Build combined lowercase sets for case-insensitive matching
    const allKeywords = new Set([
        ...Array.from(statementKeywords).map((k) => k.toLowerCase()),
        ...Array.from(controlKeywords).map((k) => k.toLowerCase()),
    ]);

    const allFunctions = new Set([
        ...Array.from(functions).map((f) => f.toLowerCase()),
        ...Array.from(aggrFunctions).map((f) => f.toLowerCase()),
    ]);

    const deprecatedLower = new Set(Array.from(deprecated).map((d) => d.toLowerCase()));

    return {
        statementKeywords,
        controlKeywords,
        functions,
        aggrFunctions,
        deprecated,
        allKeywords,
        allFunctions,
        deprecatedLower,
    };
}
