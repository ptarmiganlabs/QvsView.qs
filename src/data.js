/**
 * Hypercube data target definition for QvsView.qs.
 *
 * Defines a single dimension target — the field containing script text.
 * Each row in the hypercube represents one line (or chunk) of script.
 */
export default {
    targets: [
        {
            path: '/qHyperCubeDef',
            dimensions: {
                min: 1,
                max: 1,
                /**
                 * Description label for the dimension picker.
                 *
                 * @returns {string} The label text.
                 */
                description() {
                    return 'Field containing script text';
                },
                /**
                 * Called when a dimension is added by the user.
                 * Forces sort by load order so script lines stay in their
                 * original sequence instead of being sorted alphabetically.
                 *
                 * @param {object} dimension - The NxDimension being added.
                 */
                added(dimension) {
                    dimension.qDef.qSortCriterias = [
                        {
                            qSortByLoadOrder: 1,
                            qSortByAscii: 0,
                        },
                    ];
                },
            },
            measures: {
                min: 0,
                max: 0,
            },
        },
    ],
};
