/**
 * AI Analysis settings section for the property panel.
 * Controls AI provider configuration, API key handling, analysis scope,
 * prompt template selection, and custom system prompt override.
 */

/** @type {Array<{value: string, label: string}>} */
let ollamaModels = [];

/** @type {string} */
let ollamaModelsEndpoint = '';

/** @type {Promise<void> | null} */
let ollamaFetchPromise = null;

/** @type {boolean} */
let ollamaFetchDone = false;

/** @type {object|null} Captured property panel handler from options() */
let ollamaHandler = null;

/**
 * Trigger a property panel re-render by saving a timestamp through the engine.
 * Uses handler.app.getObject() + obj.setProperties() so Qlik detects the change
 * and re-renders the panel (including dropdown options).
 *
 * @param {object} [properties] - Extension properties (for qInfo.qId fallback).
 */
function triggerPanelReRender(properties) {
    const handler = ollamaHandler;
    if (!handler?.app) return;
    const qId = handler.properties?.qInfo?.qId || properties?.qInfo?.qId;
    if (!qId) return;
    handler.app
        .getObject(qId)
        .then((obj) =>
            obj.getProperties().then((props) => {
                if (!props.ai) props.ai = {};
                if (!props.ai.ollama) props.ai.ollama = {};
                props.ai.ollama._ts = String(Date.now());
                return obj.setProperties(props);
            })
        )
        .catch(() => {
            /* handler or engine unavailable — silent */
        });
}

/**
 * Fetch available models from an Ollama endpoint.
 * Updates the module-level ollamaModels array when complete.
 * Automatically triggers a property panel re-render after fetch completes.
 *
 * @param {string} endpoint - Ollama API base URL.
 *
 * @returns {Array<{value: string, label: string}>} Current model list.
 */
function getOllamaModels(endpoint) {
    // Return cached if same endpoint and already fetched
    if (ollamaModelsEndpoint === endpoint && ollamaFetchDone) {
        return ollamaModels;
    }

    // Kick off fetch if not already in-flight
    if (!ollamaFetchPromise) {
        ollamaModelsEndpoint = endpoint;
        const url = endpoint.replace(/\/+$/, '');
        const fetchUrl = url.startsWith('http://')
            ? url.replace(/\/\/localhost([:/])/, '//127.0.0.1$1')
            : url;

        ollamaFetchPromise = fetch(`${fetchUrl}/api/tags`)
            .then((r) => r.json())
            .then((data) => {
                ollamaModels = (data.models || [])
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((m) => ({ value: m.name, label: m.name }));
                ollamaFetchDone = true;
            })
            .catch(() => {
                /* Ollama unreachable — keep existing list */
                ollamaFetchDone = true;
            })
            .finally(() => {
                ollamaFetchPromise = null;
                // Auto-trigger re-render so dropdown picks up new models
                if (ollamaModels.length > 0) {
                    triggerPanelReRender();
                }
            });
    }

    return ollamaModels;
}

/**
 * Force-refresh the Ollama model list by clearing state and re-fetching.
 *
 * @param {string} endpoint - Ollama API base URL.
 */
function refreshOllamaModels(endpoint) {
    ollamaModels = [];
    ollamaModelsEndpoint = '';
    ollamaFetchPromise = null;
    ollamaFetchDone = false;
    getOllamaModels(endpoint);
}

/**
 * Build the AI Analysis property panel section.
 *
 * @returns {object} Property panel section definition.
 */
export function aiSection() {
    return {
        type: 'items',
        label: 'AI Analysis',
        items: {
            aiEnabled: {
                ref: 'ai.enabled',
                type: 'boolean',
                label: 'Enable AI analysis',
                defaultValue: false,
                component: 'switch',
                options: [
                    { value: true, label: 'On' },
                    { value: false, label: 'Off' },
                ],
            },

            // ── Provider selection ──
            aiProvider: {
                ref: 'ai.provider',
                type: 'string',
                label: 'AI provider',
                defaultValue: 'ollama',
                component: 'dropdown',
                options: [
                    { value: 'ollama', label: 'Ollama (local)' },
                    { value: 'openai', label: 'OpenAI' },
                    { value: 'anthropic', label: 'Anthropic' },
                ],
                /**
                 * Determine visibility based on current properties.
                 *
                 * @param {object} properties - Extension properties.
                 *
                 * @returns {boolean} Whether the item is visible.
                 */
                show(properties) {
                    return properties.ai?.enabled === true;
                },
            },

            // ── Quote cycle time ──
            aiQuoteCycle: {
                ref: 'ai.quoteCycleSeconds',
                type: 'integer',
                label: 'Loading quote cycle (seconds)',
                defaultValue: 5,
                min: 3,
                max: 10,
                /**
                 * Determine visibility based on current properties.
                 *
                 * @param {object} properties - Extension properties.
                 *
                 * @returns {boolean} Whether the item is visible.
                 */
                show(properties) {
                    return properties.ai?.enabled === true;
                },
            },

            // ── Prompt template ──
            aiTemplate: {
                ref: 'ai.promptTemplate',
                type: 'string',
                label: 'Prompt template',
                defaultValue: 'general',
                component: 'dropdown',
                options: [
                    { value: 'general', label: 'General analysis' },
                    { value: 'security', label: 'Security audit' },
                    { value: 'performance', label: 'Performance review' },
                    { value: 'documentation', label: 'Documentation' },
                ],
                /**
                 * Determine visibility based on current properties.
                 *
                 * @param {object} properties - Extension properties.
                 *
                 * @returns {boolean} Whether the item is visible.
                 */
                show(properties) {
                    return properties.ai?.enabled === true;
                },
            },

            // ── Ollama settings ──
            ollamaHeader: {
                type: 'string',
                component: 'text',
                label: 'Ollama Settings',
                /**
                 * Determine visibility based on current properties.
                 * Also eagerly prefetches Ollama models so the dropdown is populated.
                 *
                 * @param {object} properties - Extension properties.
                 *
                 * @returns {boolean} Whether the item is visible.
                 */
                show(properties) {
                    const visible =
                        properties.ai?.enabled === true && properties.ai?.provider === 'ollama';
                    if (visible) {
                        // Eagerly kick off model fetch so dropdown is ready
                        const endpoint =
                            properties.ai?.ollama?.endpoint || 'http://127.0.0.1:11434';
                        getOllamaModels(endpoint);
                    }
                    return visible;
                },
            },
            ollamaEndpoint: {
                ref: 'ai.ollama.endpoint',
                type: 'string',
                label: 'Endpoint URL',
                defaultValue: 'http://127.0.0.1:11434',
                expression: 'optional',
                /**
                 * Determine visibility based on current properties.
                 *
                 * @param {object} properties - Extension properties.
                 *
                 * @returns {boolean} Whether the item is visible.
                 */
                show(properties) {
                    return properties.ai?.enabled === true && properties.ai?.provider === 'ollama';
                },
            },
            ollamaModel: {
                ref: 'ai.ollama.model',
                type: 'string',
                label: 'Model',
                defaultValue: 'llama3.1',
                component: 'dropdown',
                /**
                 * Return available Ollama models as dropdown options.
                 * Fetches from the configured endpoint and caches results.
                 * Captures handler on first call to enable engine-based re-render.
                 *
                 * @param {object} data - Extension properties.
                 * @param {object} [handler] - Property panel handler (Qlik runtime).
                 *
                 * @returns {Array<{value: string, label: string}>} Model options.
                 */
                options(data, handler) {
                    // Capture handler for re-render triggering
                    if (handler) ollamaHandler = handler;
                    const props = handler?.properties || data;
                    const endpoint = props.ai?.ollama?.endpoint || 'http://127.0.0.1:11434';
                    const models = getOllamaModels(endpoint);
                    const current = props.ai?.ollama?.model || 'llama3.1';

                    // Ensure the current/default value is always in the list
                    if (models.length > 0) {
                        if (!models.some((m) => m.value === current)) {
                            return [
                                { value: current, label: `${current} (not installed)` },
                                ...models,
                            ];
                        }
                        return models;
                    }

                    // No models fetched yet — show current value as placeholder
                    return [{ value: current, label: current }];
                },
                /**
                 * Determine visibility based on current properties.
                 *
                 * @param {object} properties - Extension properties.
                 *
                 * @returns {boolean} Whether the item is visible.
                 */
                show(properties) {
                    return properties.ai?.enabled === true && properties.ai?.provider === 'ollama';
                },
            },
            ollamaRefresh: {
                label: '🔄 Refresh model list',
                component: 'button',
                /**
                 * Refresh the Ollama model list when clicked.
                 * Clears cache and re-fetches; the fetch completion automatically
                 * triggers a property panel re-render via engine setProperties.
                 *
                 * @param {object} properties - Extension properties.
                 */
                action(properties) {
                    const endpoint = properties.ai?.ollama?.endpoint || 'http://127.0.0.1:11434';
                    refreshOllamaModels(endpoint);
                },
                /**
                 * Determine visibility based on current properties.
                 *
                 * @param {object} properties - Extension properties.
                 *
                 * @returns {boolean} Whether the item is visible.
                 */
                show(properties) {
                    return properties.ai?.enabled === true && properties.ai?.provider === 'ollama';
                },
            },

            // ── OpenAI settings ──
            openaiHeader: {
                type: 'string',
                component: 'text',
                label: 'OpenAI Settings',
                /**
                 * Determine visibility based on current properties.
                 *
                 * @param {object} properties - Extension properties.
                 *
                 * @returns {boolean} Whether the item is visible.
                 */
                show(properties) {
                    return properties.ai?.enabled === true && properties.ai?.provider === 'openai';
                },
            },
            openaiEndpoint: {
                ref: 'ai.openai.endpoint',
                type: 'string',
                label: 'Endpoint URL',
                defaultValue: 'https://api.openai.com/v1',
                expression: 'optional',
                /**
                 * Determine visibility based on current properties.
                 *
                 * @param {object} properties - Extension properties.
                 *
                 * @returns {boolean} Whether the item is visible.
                 */
                show(properties) {
                    return properties.ai?.enabled === true && properties.ai?.provider === 'openai';
                },
            },
            openaiModel: {
                ref: 'ai.openai.model',
                type: 'string',
                label: 'Model',
                defaultValue: 'gpt-4o',
                expression: 'optional',
                /**
                 * Determine visibility based on current properties.
                 *
                 * @param {object} properties - Extension properties.
                 *
                 * @returns {boolean} Whether the item is visible.
                 */
                show(properties) {
                    return properties.ai?.enabled === true && properties.ai?.provider === 'openai';
                },
            },
            openaiKeyMode: {
                ref: 'ai.openai.keyMode',
                type: 'string',
                label: 'API key handling',
                defaultValue: 'prompt',
                component: 'dropdown',
                options: [
                    { value: 'prompt', label: 'Prompt at runtime' },
                    { value: 'stored', label: 'Store in properties' },
                ],
                /**
                 * Determine visibility based on current properties.
                 *
                 * @param {object} properties - Extension properties.
                 *
                 * @returns {boolean} Whether the item is visible.
                 */
                show(properties) {
                    return properties.ai?.enabled === true && properties.ai?.provider === 'openai';
                },
            },
            openaiApiKey: {
                ref: 'ai.openai.apiKey',
                type: 'string',
                label: 'API key',
                defaultValue: '',
                /**
                 * Determine visibility based on current properties.
                 *
                 * @param {object} properties - Extension properties.
                 *
                 * @returns {boolean} Whether the item is visible.
                 */
                show(properties) {
                    return (
                        properties.ai?.enabled === true &&
                        properties.ai?.provider === 'openai' &&
                        properties.ai?.openai?.keyMode === 'stored'
                    );
                },
            },

            // ── Anthropic settings ──
            anthropicHeader: {
                type: 'string',
                component: 'text',
                label: 'Anthropic Settings',
                /**
                 * Determine visibility based on current properties.
                 *
                 * @param {object} properties - Extension properties.
                 *
                 * @returns {boolean} Whether the item is visible.
                 */
                show(properties) {
                    return (
                        properties.ai?.enabled === true && properties.ai?.provider === 'anthropic'
                    );
                },
            },
            anthropicEndpoint: {
                ref: 'ai.anthropic.endpoint',
                type: 'string',
                label: 'Endpoint URL',
                defaultValue: 'https://api.anthropic.com/v1',
                expression: 'optional',
                /**
                 * Determine visibility based on current properties.
                 *
                 * @param {object} properties - Extension properties.
                 *
                 * @returns {boolean} Whether the item is visible.
                 */
                show(properties) {
                    return (
                        properties.ai?.enabled === true && properties.ai?.provider === 'anthropic'
                    );
                },
            },
            anthropicModel: {
                ref: 'ai.anthropic.model',
                type: 'string',
                label: 'Model',
                defaultValue: 'claude-sonnet-4-20250514',
                expression: 'optional',
                /**
                 * Determine visibility based on current properties.
                 *
                 * @param {object} properties - Extension properties.
                 *
                 * @returns {boolean} Whether the item is visible.
                 */
                show(properties) {
                    return (
                        properties.ai?.enabled === true && properties.ai?.provider === 'anthropic'
                    );
                },
            },
            anthropicKeyMode: {
                ref: 'ai.anthropic.keyMode',
                type: 'string',
                label: 'API key handling',
                defaultValue: 'prompt',
                component: 'dropdown',
                options: [
                    { value: 'prompt', label: 'Prompt at runtime' },
                    { value: 'stored', label: 'Store in properties' },
                ],
                /**
                 * Determine visibility based on current properties.
                 *
                 * @param {object} properties - Extension properties.
                 *
                 * @returns {boolean} Whether the item is visible.
                 */
                show(properties) {
                    return (
                        properties.ai?.enabled === true && properties.ai?.provider === 'anthropic'
                    );
                },
            },
            anthropicApiKey: {
                ref: 'ai.anthropic.apiKey',
                type: 'string',
                label: 'API key',
                defaultValue: '',
                /**
                 * Determine visibility based on current properties.
                 *
                 * @param {object} properties - Extension properties.
                 *
                 * @returns {boolean} Whether the item is visible.
                 */
                show(properties) {
                    return (
                        properties.ai?.enabled === true &&
                        properties.ai?.provider === 'anthropic' &&
                        properties.ai?.anthropic?.keyMode === 'stored'
                    );
                },
            },

            // ── Custom system prompt ──
            customPrompt: {
                ref: 'ai.systemPrompt',
                type: 'string',
                label: 'Custom system prompt (optional)',
                defaultValue: '',
                expression: 'optional',
                /**
                 * Determine visibility based on current properties.
                 *
                 * @param {object} properties - Extension properties.
                 *
                 * @returns {boolean} Whether the item is visible.
                 */
                show(properties) {
                    return properties.ai?.enabled === true;
                },
            },
        },
    };
}
