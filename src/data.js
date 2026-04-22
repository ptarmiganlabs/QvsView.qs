/**
 * Hypercube data target definition for QvsView.qs.
 *
 * The hypercube always contains three dimensions:
 *   0. RowNo()   — pre-populated in object-properties.js; prevents the engine
 *                  from deduplicating identical/empty script lines.
 *   1. Script text  — user-supplied field (one row per script line).
 *   2. Script source — user-supplied field identifying the source (e.g. FileName).
 *
 * min/max of 3 ensures the property panel prompts for all three slots.
 * The user fills slots 1 and 2; slot 0 is already present.
 */
export default {
    targets: [
        {
            path: '/qHyperCubeDef',
            dimensions: {
                min: 3,
                max: 3,
                /**
                 * Description labels for the dimension picker.
                 *
                 * Index 0 is the auto-injected RowNo() dimension (no user label).
                 * Indices 1 and 2 are the user-configurable dimensions.
                 *
                 * @param {object} _properties - Object properties.
                 * @param {number} index - Dimension index (0-based) in qDimensions.
                 *
                 * @returns {string} The label text.
                 */
                description(_properties, index) {
                    if (index === 1) return 'Field containing script text';
                    if (index === 2) return 'Field identifying the script source';
                    return '';
                },
                /**
                 * Called when a dimension is added by the user.
                 * Forces sort by load order on dimension 1 (script text) so
                 * lines stay in their original sequence.
                 *
                 * @param {object} dimension - The NxDimension being added.
                 * @param {object} _properties - Object properties.
                 * @param {number} index - Dimension index (0-based) in qDimensions.
                 */
                added(dimension, _properties, index) {
                    if (index === 1) {
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
