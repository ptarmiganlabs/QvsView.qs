/**
 * Hypercube data target definition for QvsView.qs.
 *
 * Defines up to two dimension targets:
 *   1. (required) The field containing script text — one row per line.
 *   2. (optional) A field identifying the script source (e.g. FileName).
 *      When multiple distinct values exist, a warning is shown.
 */
export default {
    targets: [
        {
            path: '/qHyperCubeDef',
            dimensions: {
                min: 1,
                max: 2,
                /**
                 * Description labels for the dimension picker.
                 *
                 * @param {object} _properties - Object properties.
                 * @param {number} index - Dimension index (0-based).
                 *
                 * @returns {string} The label text.
                 */
                description(_properties, index) {
                    return index === 0
                        ? 'Field containing script text'
                        : 'Field identifying the script source (optional)';
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
