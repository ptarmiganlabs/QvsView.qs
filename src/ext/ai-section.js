/**
 * AI Analysis settings section for the property panel.
 * Controls AI provider configuration, API key handling, analysis scope,
 * prompt template selection, and custom system prompt override.
 */

import { showAiTestModal } from '../ui/ai-test-modal.js';

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

/** @type {Array<{value: string, label: string}>} */
let openaiModels = [];

/** @type {string} */
let openaiModelsEndpoint = '';

/** @type {string} */
let openaiModelsKey = '';

/** @type {Promise<void> | null} */
let openaiFetchPromise = null;

/** @type {boolean} */
let openaiFetchDone = false;

/** @type {object|null} Captured property panel handler from options() */
let openaiHandler = null;

/**
 * Force the OpenAI portion of the property panel to re-render by updating
 * a timestamp property.
 *
 * This is used after asynchronous model fetch completion so dropdown options
 * reflect the latest state, including an empty result set.
 *
 * @returns {void}
 */
function triggerOpenAIModelsRerender() {
    const handler = openaiHandler;
    if (handler?.app) {
        const qId = handler.properties?.qInfo?.qId;
        if (qId) {
            handler.app
                .getObject(qId)
                .then((obj) =>
                    obj.getProperties().then((props) => {
                        if (!props.ai) props.ai = {};
                        if (!props.ai.openai) props.ai.openai = {};
                        props.ai.openai._ts = String(Date.now());
                        return obj.setProperties(props);
                    })
                )
                .catch(() => {});
        }
    }
}

/** @type {Array<{value: string, label: string}>} */
let anthropicModels = [];

/** @type {string} */
let anthropicModelsEndpoint = '';

/** @type {string} */
let anthropicModelsKey = '';

/** @type {Promise<void> | null} */
let anthropicFetchPromise = null;

/** @type {boolean} */
let anthropicFetchDone = false;

/** @type {object|null} Captured property panel handler from options() */
let anthropicHandler = null;

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
 * Fetch available models from the OpenAI /v1/models endpoint.
 * Updates the module-level openaiModels array when complete.
 * Automatically triggers a property panel re-render after fetch completes.
 *
 * @param {string} endpoint - OpenAI API base URL.
 * @param {string} [apiKey] - OpenAI API key.
 *
 * @returns {Array<{value: string, label: string}>} Current model list.
 */
function getOpenAIModels(endpoint, apiKey) {
    const normalizedApiKey = apiKey || '';
    const configChanged = openaiModelsEndpoint !== endpoint || openaiModelsKey !== normalizedApiKey;

    if (
        openaiModelsEndpoint === endpoint &&
        openaiModelsKey === normalizedApiKey &&
        openaiFetchDone
    ) {
        return openaiModels;
    }

    if (configChanged && !openaiFetchPromise) {
        openaiModels = [];
        openaiModelsEndpoint = '';
        openaiModelsKey = '';
        openaiFetchDone = false;
    }

    if (!apiKey) return openaiModels;

    if (!openaiFetchPromise) {
        openaiModelsEndpoint = endpoint;
        openaiModelsKey = normalizedApiKey;
        const url = endpoint.replace(/\/+$/, '');

        openaiFetchPromise = fetch(`${url}/models`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        })
            .then((r) =>
                r.text().then((body) => {
                    if (!r.ok) {
                        throw new Error(
                            `OpenAI models request failed with status ${r.status}${
                                body ? `: ${body}` : ''
                            }`
                        );
                    }

                    return body ? JSON.parse(body) : {};
                })
            )
            .then((data) => {
                if (!Array.isArray(data.data)) {
                    throw new Error('OpenAI models response did not contain a valid data array');
                }

                openaiModels = data.data
                    .sort((a, b) => a.id.localeCompare(b.id))
                    .map((m) => ({ value: m.id, label: m.id }));
                openaiFetchDone = true;
            })
            .catch(() => {
                openaiModels = [];
                openaiFetchDone = true;
            })
            .finally(() => {
                openaiFetchPromise = null;
                triggerOpenAIModelsRerender();
            });
    }

    return openaiModels;
}

/**
 * Force-refresh the OpenAI model list by clearing state and re-fetching.
 *
 * @param {string} endpoint - OpenAI API base URL.
 * @param {string} [apiKey] - OpenAI API key.
 */
function refreshOpenAIModels(endpoint, apiKey) {
    openaiModels = [];
    openaiModelsEndpoint = '';
    openaiModelsKey = '';
    openaiFetchPromise = null;
    openaiFetchDone = false;
    getOpenAIModels(endpoint, apiKey);
}

/** Anthropic headers required for direct browser fetch. */
const ANTHROPIC_BROWSER_HEADERS = {
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
};

/**
 * Fetch available models from the Anthropic /v1/models endpoint.
 * Updates the module-level anthropicModels array when complete.
 * Automatically triggers a property panel re-render after fetch completes.
 *
 * @param {string} endpoint - Anthropic API base URL.
 * @param {string} [apiKey] - Anthropic API key.
 *
 * @returns {Array<{value: string, label: string}>} Current model list.
 */
function getAnthropicModels(endpoint, apiKey) {
    // Return cached if same endpoint + key and already fetched
    if (
        anthropicModelsEndpoint === endpoint &&
        anthropicModelsKey === (apiKey || '') &&
        anthropicFetchDone
    ) {
        return anthropicModels;
    }

    // Need a key to call the models endpoint
    if (!apiKey) return anthropicModels;

    // Kick off fetch if not already in-flight
    if (!anthropicFetchPromise) {
        anthropicModelsEndpoint = endpoint;
        anthropicModelsKey = apiKey;
        const url = endpoint.replace(/\/+$/, '');

        anthropicFetchPromise = fetch(`${url}/models`, {
            method: 'GET',
            headers: {
                'x-api-key': apiKey,
                ...ANTHROPIC_BROWSER_HEADERS,
            },
        })
            .then((r) => r.json())
            .then((data) => {
                anthropicModels = (data.data || [])
                    .sort((a, b) => a.id.localeCompare(b.id))
                    .map((m) => ({ value: m.id, label: m.display_name || m.id }));
                anthropicFetchDone = true;
            })
            .catch(() => {
                /* API unreachable or key invalid — keep existing list */
                anthropicFetchDone = true;
            })
            .finally(() => {
                anthropicFetchPromise = null;
                if (anthropicModels.length > 0) {
                    const handler = anthropicHandler;
                    if (handler?.app) {
                        const qId = handler.properties?.qInfo?.qId;
                        if (qId) {
                            handler.app
                                .getObject(qId)
                                .then((obj) =>
                                    obj.getProperties().then((props) => {
                                        if (!props.ai) props.ai = {};
                                        if (!props.ai.anthropic) props.ai.anthropic = {};
                                        props.ai.anthropic._ts = String(Date.now());
                                        return obj.setProperties(props);
                                    })
                                )
                                .catch(() => {});
                        }
                    }
                }
            });
    }

    return anthropicModels;
}

/**
 * Force-refresh the Anthropic model list by clearing state and re-fetching.
 *
 * @param {string} endpoint - Anthropic API base URL.
 * @param {string} [apiKey] - Anthropic API key.
 */
function refreshAnthropicModels(endpoint, apiKey) {
    anthropicModels = [];
    anthropicModelsEndpoint = '';
    anthropicModelsKey = '';
    anthropicFetchPromise = null;
    anthropicFetchDone = false;
    getAnthropicModels(endpoint, apiKey);
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

            // ── Prompt template mode toggle ──
            aiPromptTemplateMode: {
                ref: 'ai.promptTemplateMode',
                type: 'string',
                label: 'Prompt template selection',
                defaultValue: 'properties',
                component: 'dropdown',
                options: [
                    { value: 'properties', label: 'Set in properties' },
                    { value: 'runtime', label: 'Choose at runtime' },
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
                 * Only shown when prompt template mode is 'properties'.
                 *
                 * @param {object} properties - Extension properties.
                 *
                 * @returns {boolean} Whether the item is visible.
                 */
                show(properties) {
                    return (
                        properties.ai?.enabled === true &&
                        properties.ai?.promptTemplateMode !== 'runtime'
                    );
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
                label: 'Available models',
                defaultValue: 'llama3.1',
                component: 'dropdown',
                description:
                    'Select a detected model to populate the Model field below, or type a custom model name there.',
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
            ollamaModelInput: {
                ref: 'ai.ollama.model',
                type: 'string',
                label: 'Model override',
                defaultValue: 'llama3.1',
                description:
                    'Enter any compatible model name. This field shares the same value as Available models above.',
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
            ollamaTest: {
                label: '🧪 Test connection',
                component: 'button',
                /**
                 * Open the AI connection test modal for the Ollama provider.
                 *
                 * @param {object} properties - Extension properties.
                 */
                action(properties) {
                    showAiTestModal({ properties });
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
                label: 'Available models',
                defaultValue: 'gpt-4o',
                component: 'dropdown',
                description:
                    'Select a detected model to populate the Model field below, or type a custom model name there.',
                /**
                 * Return available OpenAI models as dropdown options.
                 * Fetches from /v1/models using the configured API key.
                 * Falls back to a placeholder when key is unavailable.
                 *
                 * @param {object} data - Extension properties.
                 * @param {object} [handler] - Property panel handler (Qlik runtime).
                 *
                 * @returns {Array<{value: string, label: string}>} Model options.
                 */
                options(data, handler) {
                    if (handler) openaiHandler = handler;
                    const props = handler?.properties || data;
                    const endpoint = props.ai?.openai?.endpoint || 'https://api.openai.com/v1';
                    const keyMode = props.ai?.openai?.keyMode || 'prompt';
                    const current = props.ai?.openai?.model || 'gpt-4o';

                    let apiKey = null;
                    if (keyMode === 'stored') {
                        apiKey = props.ai?.openai?.apiKey || null;
                    } else {
                        try {
                            apiKey = sessionStorage.getItem('qvsview-ai-key-openai') || null;
                        } catch {
                            /* sessionStorage unavailable */
                        }
                    }

                    if (!apiKey) {
                        openaiModels = [];
                        openaiModelsEndpoint = '';
                        openaiModelsKey = '';
                        openaiFetchPromise = null;
                        openaiFetchDone = false;
                        return [{ value: current, label: current }];
                    }

                    const models = getOpenAIModels(endpoint, apiKey);

                    if (models.length > 0) {
                        if (!models.some((m) => m.value === current)) {
                            return [{ value: current, label: current }, ...models];
                        }
                        return models;
                    }

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
                    return properties.ai?.enabled === true && properties.ai?.provider === 'openai';
                },
            },
            openaiModelInput: {
                ref: 'ai.openai.model',
                type: 'string',
                label: 'Model override',
                defaultValue: 'gpt-4o',
                description:
                    'Enter any compatible model name. This field shares the same value as Available models above.',
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
            openaiRefresh: {
                label: '🔄 Refresh model list',
                component: 'button',
                /**
                 * Refresh the OpenAI model list when clicked.
                 * Clears cache and re-fetches from /v1/models.
                 *
                 * @param {object} properties - Extension properties.
                 */
                action(properties) {
                    const endpoint = properties.ai?.openai?.endpoint || 'https://api.openai.com/v1';
                    const keyMode = properties.ai?.openai?.keyMode || 'prompt';
                    let apiKey = null;
                    if (keyMode === 'stored') {
                        apiKey = properties.ai?.openai?.apiKey || null;
                    } else {
                        try {
                            apiKey = sessionStorage.getItem('qvsview-ai-key-openai') || null;
                        } catch {
                            /* sessionStorage unavailable */
                        }
                    }
                    refreshOpenAIModels(endpoint, apiKey);
                },
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
            openaiTest: {
                label: '🧪 Test connection',
                component: 'button',
                /**
                 * Open the AI connection test modal for the OpenAI provider.
                 *
                 * @param {object} properties - Extension properties.
                 */
                action(properties) {
                    showAiTestModal({ properties });
                },
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
                label: 'Available models',
                defaultValue: 'claude-sonnet-4-20250514',
                component: 'dropdown',
                description:
                    'Select a detected model to populate the Model field below, or type a custom model name there.',
                /**
                 * Return available Anthropic models as dropdown options.
                 * Fetches from /v1/models using the configured API key.
                 * Falls back to a placeholder when key is unavailable.
                 *
                 * @param {object} data - Extension properties.
                 * @param {object} [handler] - Property panel handler (Qlik runtime).
                 *
                 * @returns {Array<{value: string, label: string}>} Model options.
                 */
                options(data, handler) {
                    if (handler) anthropicHandler = handler;
                    const props = handler?.properties || data;
                    const endpoint =
                        props.ai?.anthropic?.endpoint || 'https://api.anthropic.com/v1';
                    const keyMode = props.ai?.anthropic?.keyMode || 'prompt';
                    const current = props.ai?.anthropic?.model || 'claude-sonnet-4-20250514';

                    // Resolve key: stored in properties or cached in sessionStorage
                    let apiKey = null;
                    if (keyMode === 'stored') {
                        apiKey = props.ai?.anthropic?.apiKey || null;
                    } else {
                        try {
                            apiKey = sessionStorage.getItem('qvsview-ai-key-anthropic') || null;
                        } catch {
                            /* sessionStorage unavailable */
                        }
                    }

                    if (!apiKey) {
                        anthropicModels = [];
                        anthropicModelsEndpoint = '';
                        anthropicModelsKey = '';
                        anthropicFetchPromise = null;
                        anthropicFetchDone = false;

                        // No key available — show current value as placeholder
                        return [{ value: current, label: current }];
                    }
                    const models = getAnthropicModels(endpoint, apiKey);

                    if (models.length > 0) {
                        if (!models.some((m) => m.value === current)) {
                            return [{ value: current, label: current }, ...models];
                        }
                        return models;
                    }

                    // No models yet — show current value as placeholder
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
                    return (
                        properties.ai?.enabled === true && properties.ai?.provider === 'anthropic'
                    );
                },
            },
            anthropicModelInput: {
                ref: 'ai.anthropic.model',
                type: 'string',
                label: 'Model override',
                defaultValue: 'claude-sonnet-4-20250514',
                description:
                    'Enter any compatible model name. This field shares the same value as Available models above.',
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
            anthropicRefresh: {
                label: '🔄 Refresh model list',
                component: 'button',
                /**
                 * Refresh the Anthropic model list when clicked.
                 * Clears cache and re-fetches from /v1/models.
                 *
                 * @param {object} properties - Extension properties.
                 */
                action(properties) {
                    const endpoint =
                        properties.ai?.anthropic?.endpoint || 'https://api.anthropic.com/v1';
                    const keyMode = properties.ai?.anthropic?.keyMode || 'prompt';
                    let apiKey = null;
                    if (keyMode === 'stored') {
                        apiKey = properties.ai?.anthropic?.apiKey || null;
                    } else {
                        try {
                            apiKey = sessionStorage.getItem('qvsview-ai-key-anthropic') || null;
                        } catch {
                            /* sessionStorage unavailable */
                        }
                    }
                    refreshAnthropicModels(endpoint, apiKey);
                },
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
            anthropicTest: {
                label: '🧪 Test connection',
                component: 'button',
                /**
                 * Open the AI connection test modal for the Anthropic provider.
                 *
                 * @param {object} properties - Extension properties.
                 */
                action(properties) {
                    showAiTestModal({ properties });
                },
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
