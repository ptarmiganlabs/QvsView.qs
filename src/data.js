/**
 * Hypercube data target definition for QvsView.qs.
 *
 * The user configures up to three dimensions in this order:
 *   1. Row number    — field holding the per-row load-order number (e.g. a field
 *                      populated with RecNo() or RowNo() during the data load).
 *                      Sorting by this dimension numerically ascending preserves
 *                      the original script line order.
 *   2. Script text   — field where each row is one line of Qlik script.
 *   3. Script source — field identifying the script (e.g. FileName, AppID).
 *                      Used for multi-source filtering (optional).
 *
 * min: 2  — row number + script text are the minimum required dims.
 * max: 3  — script source is optional.
 */

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
                 * Column layout is always:
                 *   index 0 — Row number
                 *   index 1 — Script text
                 *   index 2 — Script source (optional)
                 *
                 * @param {object} _properties - Object properties (unused).
                 * @param {number} index - Dimension index (0-based) in qDimensions.
                 *
                 * @returns {string} The label text.
                 */
                description(_properties, index) {
                    if (index === 0)
                        return 'Dim 1 · Row number — field holding the load-order row number (e.g. a field set to RecNo() during load)';
                    if (index === 1)
                        return 'Dim 2 · Script text — field where each row is one line of Qlik script (e.g. "Script_Data")';
                    if (index === 2)
                        return 'Dim 3 · Script source — field identifying the script file or app (e.g. "FileName", "AppID")';
                    return '';
                },
                /**
                 * Called when a dimension is added by the user.
                 * Applies numeric-ascending sort to the row number dimension so
                 * the engine returns lines in load order by default.
                 *
                 * @param {object} dimension - The NxDimension being added.
                 * @param {object} _properties - Object properties (unused).
                 * @param {number} index - Dimension index (0-based) in qDimensions.
                 */
                added(dimension, _properties, index) {
                    if (index === 0) {
                        // Row number field must be numeric for correct sort order.
                        // Fields created with RecNo() or RowNo() during the load script
                        // satisfy this requirement automatically.
                        dimension.qDef.qSortCriterias = [
                            {
                                qSortByNumeric: 1,
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
