/**
 * Default object properties for QvsView.qs.
 *
 * Defines the initial property state when the extension is first
 * dropped onto a sheet. Includes the hypercube definition and
 * viewer display settings.
 *
 * The hypercube always has three dimensions:
 *   0. RowNo()         — auto-injected; ensures duplicate/empty lines are preserved
 *   1. Script text     — user-supplied field (one line per row)
 *   2. Script source   — user-supplied field (e.g. FileName)
 */
export default {
    showTitles: true,
    title: 'Script Viewer',
    subtitle: '',
    footnote: '',
    qHyperCubeDef: {
        qDimensions: [
            {
                qDef: {
                    qFieldDefs: ['=RowNo()'],
                    qFieldLabels: [''],
                    qSortCriterias: [{ qSortByNumeric: 1, qSortByAscii: 0 }],
                },
                qNullSuppression: false,
            },
        ],
        qMeasures: [],
        // 3 columns × 3333 rows = 9999 cells (Qlik limit: 10 000 cells per page)
        qInitialDataFetch: [{ qWidth: 3, qHeight: 3333 }],
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
