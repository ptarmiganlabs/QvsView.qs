/**
 * Default object properties for QvsView.qs.
 *
 * Defines the initial property state when the extension is first
 * dropped onto a sheet. Includes the hypercube definition and
 * viewer display settings.
 *
 * The user adds exactly three dimensions (all required):
 *   1. Row number  — load-order row number field (e.g. a field set to RecNo() or RowNo() during load)
 *   2. Script text — field where each row is one line of Qlik script
 *   3. Script source — field identifying the script file or app
 */
export default {
    showTitles: true,
    title: 'Script Viewer',
    subtitle: '',
    footnote: '',
    qHyperCubeDef: {
        qDimensions: [],
        qMeasures: [],
        qInitialDataFetch: [{ qWidth: 3, qHeight: 3333 }],
        // Dimension 0 (row number) is the primary sort key.
        // This ensures the engine returns script lines in load order
        // regardless of any default alphabetical sort on later dimensions.
        qInterColumnSortOrder: [0, 1, 2],
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
    ai: {
        enabled: false,
        provider: 'ollama',
        promptTemplateMode: 'properties',
        promptTemplate: 'general',
        systemPrompt: '',
        ollama: {
            endpoint: 'http://127.0.0.1:11434',
            model: 'llama3.1',
        },
        openai: {
            endpoint: 'https://api.openai.com/v1',
            model: 'gpt-4o',
            keyMode: 'prompt',
            apiKey: '',
        },
        anthropic: {
            endpoint: 'https://api.anthropic.com/v1',
            model: 'claude-sonnet-4-20250514',
            keyMode: 'prompt',
            apiKey: '',
        },
    },
};
