/**
 * Hypercube data target definition for QvsView.qs.
 *
 * Defines up to three dimension targets:
 *   1. (required) The field containing script text — one row per line.
 *   2. (optional) A field identifying the script source (e.g. FileName).
 *      When multiple distinct values exist, a warning is shown.
 *   3. (optional) A field for script file selection — distinct values are
 *      listed in a searchable dropdown in the viewer toolbar. When a user
 *      selects a value, a selection is made in the app's data model.
 */
export default {
    targets: [
        {
            path: '/qHyperCubeDef',
            dimensions: {
                min: 1,
                max: 3,
                /**
                 * Description labels for the dimension picker.
                 *
                 * @param {object} _properties - Object properties.
                 * @param {number} index - Dimension index (0-based).
                 *
                 * @returns {string} The label text.
                 */
                description(_properties, index) {
                    if (index === 0) return 'Field containing script text';
                    if (index === 1) return 'Field identifying the script source (optional)';
                    return 'Field for script file selection (optional)';
                },
                /**
                 * Called when a dimension is added by the user.
                 * Forces sort by load order on the first dimension so script
                 * lines stay in their original sequence.
                 *
                 * @param {object} dimension - The NxDimension being added.
                 * @param {object} _properties - Object properties.
                 * @param {number} index - Dimension index (0-based).
                 */
                added(dimension, _properties, index) {
                    if (index === 0) {
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
