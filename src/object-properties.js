/**
 * Default object properties for QvsView.qs.
 *
 * Defines the initial property state when the extension is first
 * dropped onto a sheet. Includes the hypercube definition and
 * viewer display settings.
 *
 * The user adds two dimensions (script text + script source).
 * A RowNo() dimension is automatically injected at index 0 by the component
 * at runtime to prevent the engine from deduplicating identical script lines.
 */
export default {
    showTitles: true,
    title: 'Script Viewer',
    subtitle: '',
    footnote: '',
    qHyperCubeDef: {
        qDimensions: [],
        qMeasures: [],
        // qWidth: 3 anticipates the injected RowNo() column; Qlik returns fewer
        // columns gracefully when only 2 user dims are present.
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
