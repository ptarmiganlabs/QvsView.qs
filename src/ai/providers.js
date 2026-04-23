/**
 * AI provider abstraction layer.
 *
 * Dispatches script analysis requests to the configured AI provider
 * (Ollama, OpenAI, or Anthropic). Each provider has its own request
 * format and response parsing.
 *
 * The API is designed for future streaming support — the function
 * signature can be extended to return a ReadableStream instead of
 * a resolved object.
 */

import { getSystemPrompt } from './system-prompt.js';
import logger from '../util/logger.js';

/**
 * Analyze a Qlik script using the configured AI provider.
 *
 * @param {object} config - The full ai config from layout (layout.ai).
 * @param {string} script - The script text to analyze.
 * @param {object} [options] - Additional options.
 * @param {string} [options.apiKey] - API key (from stored config or runtime prompt).
 *
 * @returns {Promise<{content: string, model: string, provider: string}>}
 *   Analysis result with raw markdown content.
 */
export async function analyzeScript(config, script, options = {}) {
    const provider = config.provider || 'ollama';
    const template = config.promptTemplate || 'general';
    const systemPrompt = getSystemPrompt(template, config.systemPrompt);
    const userMessage = `Analyze this Qlik Sense load script:\n\n\`\`\`\n${script}\n\`\`\``;

    logger.info(`AI analysis: provider=${provider}, template=${template}`);

    switch (provider) {
        case 'ollama':
            return callOllama(config.ollama || {}, systemPrompt, userMessage);
        case 'openai':
            return callOpenAI(config.openai || {}, systemPrompt, userMessage, options.apiKey);
        case 'anthropic':
            return callAnthropic(config.anthropic || {}, systemPrompt, userMessage, options.apiKey);
        default:
            throw new Error(`Unknown AI provider: ${provider}`);
    }
}

/**
 * Estimate the token count for a script.
 * Rough approximation: ~4 characters per token for English text.
 *
 * @param {string} text - Text to estimate tokens for.
 *
 * @returns {number} Estimated token count.
 */
export function estimateTokens(text) {
    return Math.ceil((text || '').length / 4);
}

/**
 * Send a simple "Hello, who are you?" test prompt to the configured AI provider.
 * Used to verify connectivity and basic configuration from the property panel.
 *
 * @param {object} config - The full ai config from properties (properties.ai).
 * @param {object} [options] - Additional options.
 * @param {string} [options.apiKey] - API key (for OpenAI / Anthropic).
 *
 * @returns {Promise<{content: string, model: string, provider: string}>}
 *   The provider's response.
 */
export async function testConnection(config, options = {}) {
    const provider = config.provider || 'ollama';
    const systemPrompt = 'You are a helpful AI assistant.';
    const userMessage = 'Hello! Who are you? Please respond with a brief introduction.';

    logger.info(`AI connection test: provider=${provider}`);

    switch (provider) {
        case 'ollama':
            return callOllama(config.ollama || {}, systemPrompt, userMessage);
        case 'openai':
            return callOpenAI(config.openai || {}, systemPrompt, userMessage, options.apiKey);
        case 'anthropic':
            return callAnthropic(config.anthropic || {}, systemPrompt, userMessage, options.apiKey);
        default:
            throw new Error(`Unknown AI provider: ${provider}`);
    }
}

/**
 * Call Ollama's generate API.
 *
 * @param {object} cfg - Ollama config (endpoint, model).
 * @param {string} system - System prompt.
 * @param {string} prompt - User prompt with script.
 *
 * @returns {Promise<{content: string, model: string, provider: string}>} Analysis result.
 */
async function callOllama(cfg, system, prompt) {
    const rawEndpoint = (cfg.endpoint || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    // macOS resolves "localhost" to IPv6 (::1) but Ollama only listens on IPv4.
    // Only rewrite for plain HTTP — HTTPS endpoints are proxies that may bind to IPv6.
    const endpoint = rawEndpoint.startsWith('http://')
        ? rawEndpoint.replace(/\/\/localhost([:/])/, '//127.0.0.1$1')
        : rawEndpoint;
    const model = cfg.model || 'llama3.1';
    const url = `${endpoint}/api/generate`;

    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                prompt,
                system,
                stream: false,
            }),
        });
    } catch (err) {
        throw new Error(ollamaNetworkHint(endpoint, err), { cause: err });
    }

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Ollama error (${response.status}): ${text || response.statusText}`);
    }

    const data = await response.json();
    return {
        content: data.response || '',
        model: data.model || model,
        provider: 'ollama',
    };
}

/**
 * Build a user-friendly error message for Ollama network failures.
 *
 * @param {string} endpoint - The Ollama endpoint URL.
 * @param {Error} err - The original fetch error.
 *
 * @returns {string} Descriptive error message with remediation steps.
 */
function ollamaNetworkHint(endpoint, err) {
    const isHttpToHttps = endpoint.startsWith('http://') && window.location.protocol === 'https:';
    const usesLocalhost = /\/\/localhost[:/]/i.test(endpoint);
    const lines = [`Could not reach Ollama at ${endpoint}.`];
    if (usesLocalhost) {
        lines.push(
            'Tip: try using http://127.0.0.1:11434 instead of localhost — ' +
                'macOS resolves localhost to IPv6 (::1) but Ollama only listens on IPv4.'
        );
    }
    if (isHttpToHttps) {
        lines.push(
            'Your browser may block HTTP requests from an HTTPS page (mixed content / CORS). ' +
                'Fix: set the OLLAMA_ORIGINS environment variable, e.g.: ' +
                `OLLAMA_ORIGINS="${window.location.origin}" ollama serve`
        );
    }
    if (!usesLocalhost && !isHttpToHttps) {
        lines.push('Ensure Ollama is running and the endpoint is correct.');
    }
    lines.push(`(${err.message})`);
    return lines.join('\n');
}

/**
 * Call OpenAI's chat completions API.
 *
 * @param {object} cfg - OpenAI config (endpoint, model).
 * @param {string} system - System prompt.
 * @param {string} userMessage - User prompt with script.
 * @param {string} [apiKey] - API key.
 *
 * @returns {Promise<{content: string, model: string, provider: string}>} Analysis result.
 */
async function callOpenAI(cfg, system, userMessage, apiKey) {
    const endpoint = (cfg.endpoint || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const model = cfg.model || 'gpt-4o';

    if (!apiKey) {
        throw new Error(
            'OpenAI API key required. Configure in property panel or enter at runtime.'
        );
    }

    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
    };

    let response;
    try {
        response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: userMessage },
                ],
                stream: false,
            }),
        });
    } catch (err) {
        throw new Error(
            `Could not reach OpenAI at ${endpoint}. Check your network connection. (${err.message})`,
            { cause: err }
        );
    }

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`OpenAI error (${response.status}): ${text || response.statusText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    return {
        content: choice?.message?.content || '',
        model: data.model || model,
        provider: 'openai',
    };
}

/**
 * Call Anthropic's messages API.
 *
 * @param {object} cfg - Anthropic config (endpoint, model).
 * @param {string} system - System prompt.
 * @param {string} userMessage - User prompt with script.
 * @param {string} [apiKey] - API key.
 *
 * @returns {Promise<{content: string, model: string, provider: string}>} Analysis result.
 */
async function callAnthropic(cfg, system, userMessage, apiKey) {
    const endpoint = (cfg.endpoint || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    const model = cfg.model || 'claude-sonnet-4-20250514';

    if (!apiKey) {
        throw new Error(
            'Anthropic API key required. Configure in property panel or enter at runtime.'
        );
    }

    const headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Required for direct browser fetch — Anthropic rejects preflight without this
        'anthropic-dangerous-direct-browser-access': 'true',
    };

    let response;
    try {
        response = await fetch(`${endpoint}/messages`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model,
                max_tokens: 8192,
                system,
                messages: [{ role: 'user', content: userMessage }],
            }),
        });
    } catch (err) {
        throw new Error(
            `Could not reach Anthropic at ${endpoint}. Check your network connection. (${err.message})`,
            { cause: err }
        );
    }

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Anthropic error (${response.status}): ${text || response.statusText}`);
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    return {
        content: textBlock?.text || '',
        model: data.model || model,
        provider: 'anthropic',
    };
}
