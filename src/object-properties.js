/**
 * Default object properties for QvsView.qs.
 *
 * Defines the initial property state when the extension is first
 * dropped onto a sheet. Includes the hypercube definition and
 * viewer display settings.
 */
export default {
    showTitles: true,
    title: 'Script Viewer',
    subtitle: '',
    footnote: '',
    qHyperCubeDef: {
        qDimensions: [],
        qMeasures: [],
        qInitialDataFetch: [{ qWidth: 2, qHeight: 5000 }],
        qSuppressZero: false,
        qSuppressMissing: false,
    },
    viewer: {
        showLineNumbers: true,
        wordWrap: false,
        fontSize: 13,
        enableFolding: true,
        useRuntimeBnf: false,
        multiAppWarningMessage:
            'Multiple scripts detected. Use a filter to select a single script source.',
    },
    toolbar: {
        showCopyButton: true,
        showFontSizeDropdown: false,
    },
};
