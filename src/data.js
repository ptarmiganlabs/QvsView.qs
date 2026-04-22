/**
 * Hypercube data target definition for QvsView.qs.
 *
 * The user configures exactly two dimensions:
 *   1. Script text   — field where each row is one line of Qlik script.
 *   2. Script source — field identifying the script (e.g. FileName, AppID).
 *
 * A third dimension, RowNo(), is automatically injected at index 0 by the
 * component at runtime. This prevents the Qlik engine from deduplicating
 * identical or empty script lines. It is fully transparent to the user.
 *
 * min: 2  — ensures the visualization is considered complete once both user
 *            dimensions are present (satisfies Qlik's "Incomplete visualization"
 *            check for legacy objects that have not yet received the RowNo dim).
 * max: 3  — allows the injected RowNo() to coexist alongside the two user dims.
 */

/**
 * Check whether the first qDimensions entry is the auto-injected RowNo() dim.
 * Used by both description() and added() to resolve the correct user-dim index.
 *
 * @param {object} properties - Object properties passed to the callbacks.
 *
 * @returns {boolean} True when RowNo() occupies qDimensions[0].
 */
function firstDimIsRowNo(properties) {
    const firstDef = properties.qHyperCubeDef?.qDimensions?.[0]?.qDef?.qFieldDefs?.[0] ?? '';
    return firstDef.includes('RowNo()');
}

export default {
    targets: [
        {
            path: '/qHyperCubeDef',
            dimensions: {
                min: 2,
                max: 3,
                /**
                 * Description labels shown in the property panel dimension picker.
                 *
                 * After RowNo() injection the user dims live at indices 1 and 2;
                 * before injection (or on legacy objects) they live at 0 and 1.
                 *
                 * @param {object} properties - Object properties.
                 * @param {number} index - Dimension index (0-based) in qDimensions.
                 *
                 * @returns {string} The label text.
                 */
                description(properties, index) {
                    const hasRowNo = firstDimIsRowNo(properties);
                    if (hasRowNo) {
                        // Post-injection layout: user dims are at indices 1 and 2
                        if (index === 1)
                            return 'Dim 1 · Script text — field where each row is one line of Qlik script (e.g. "Script_Data")';
                        if (index === 2)
                            return 'Dim 2 · Script source — field identifying the script file or app (e.g. "FileName", "AppID")';
                        return ''; // index 0 = RowNo(), not user-visible
                    }
                    // Pre-injection or legacy layout: user dims are at indices 0 and 1
                    if (index === 0)
                        return 'Dim 1 · Script text — field where each row is one line of Qlik script (e.g. "Script_Data")';
                    if (index === 1)
                        return 'Dim 2 · Script source — field identifying the script file or app (e.g. "FileName", "AppID")';
                    return '';
                },
                /**
                 * Called when a dimension is added by the user.
                 * Forces sort by load order on the script text dimension so lines
                 * stay in their original sequence.
                 *
                 * @param {object} dimension - The NxDimension being added.
                 * @param {object} properties - Object properties.
                 * @param {number} index - Dimension index (0-based) in qDimensions.
                 */
                added(dimension, properties, index) {
                    // Script text is at index 1 after injection, index 0 before
                    const textIndex = firstDimIsRowNo(properties) ? 1 : 0;
                    if (index === textIndex) {
                        dimension.qDef.qSortCriterias = [
                            {
                                qSortByLoadOrder: 1,
                                qSortByAscii: 0,
                            },
                        ];
                    }
                },
            },
            measures: {
                min: 0,
                max: 0,
            },
        },
    ],
};
