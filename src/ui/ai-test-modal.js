/**
 * AI connection test modal.
 *
 * Lightweight modal that sends a "Hello, who are you?" prompt to the
 * configured AI provider and shows the response step-by-step, confirming
 * that the provider endpoint, model, and API key are all working.
 */

import { testConnection } from '../ai/providers.js';
import { getApiKey, cacheApiKey } from '../ai/key-manager.js';

const CSS_PREFIX = 'qvs';

/** Provider display names. */
const PROVIDER_LABELS = {
    ollama: 'Ollama',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
};

/**
 * Escape a string for safe HTML insertion.
 *
 * @param {string} str - Raw string.
 *
 * @returns {string} HTML-escaped string.
 */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Show the AI connection test modal.
 *
 * Creates a modal attached to the given container (defaults to document.body),
 * walks through the connection steps, and displays the LLM's response.
 * For providers that require an API key and none is available in sessionStorage,
 * an inline key prompt is shown before the test is run.
 *
 * @param {object} opts - Options.
 * @param {object} opts.properties - Extension properties object (contains `ai` config).
 * @param {HTMLElement} [opts.container] - DOM element to attach the modal to. Defaults to document.body.
 */
export function showAiTestModal({ properties, container = document.body }) {
    const aiConfig = properties.ai || {};
    const provider = aiConfig.provider || 'ollama';
    const providerLabel = PROVIDER_LABELS[provider] || provider;

    // ── Backdrop + Dialog ──
    const backdrop = document.createElement('div');
    backdrop.className = `${CSS_PREFIX}-ai-backdrop`;

    const dialog = document.createElement('div');
    dialog.className = `${CSS_PREFIX}-ai-dialog ${CSS_PREFIX}-ai-test-dialog`;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'AI Connection Test');
    dialog.setAttribute('tabindex', '-1');

    // ── Header ──
    const header = document.createElement('div');
    header.className = `${CSS_PREFIX}-ai-header`;
    header.innerHTML = `
        <span class="${CSS_PREFIX}-ai-title">🧪 AI Connection Test — ${escapeHtml(providerLabel)}</span>
        <button class="${CSS_PREFIX}-ai-close" aria-label="Close" title="Close">&times;</button>
    `;

    // ── Body ──
    const body = document.createElement('div');
    body.className = `${CSS_PREFIX}-ai-body`;

    // ── Footer ──
    const footer = document.createElement('div');
    footer.className = `${CSS_PREFIX}-ai-footer`;
    footer.innerHTML = `<button class="${CSS_PREFIX}-ai-btn ${CSS_PREFIX}-ai-test-close-btn">Close</button>`;
    footer.style.display = 'none';

    dialog.appendChild(header);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    backdrop.appendChild(dialog);
    container.appendChild(backdrop);

    // ── Close handler ──
    /** @type {AbortController|null} Controller for the in-flight test request. */
    let abortController = null;

    /** Remove the modal from the DOM, abort any in-flight request, and clean up listeners. */
    function close() {
        abortController?.abort();
        document.removeEventListener('keydown', handleKeydown);
        backdrop.removeEventListener('click', handleBackdropClick);
        backdrop.remove();
    }

    /**
     * Close when clicking the backdrop outside the dialog.
     *
     * @param {MouseEvent} e - Click event.
     */
    function handleBackdropClick(e) {
        if (e.target === backdrop) close();
    }

    /**
     * Handle keyboard events: Escape to close.
     *
     * @param {KeyboardEvent} e - Keyboard event.
     */
    function handleKeydown(e) {
        if (e.key === 'Escape') {
            close();
            return;
        }
        if (e.key === 'Tab') {
            const focusable = dialog.querySelectorAll(
                'button, input, [tabindex]:not([tabindex="-1"])'
            );
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }

    header.querySelector(`.${CSS_PREFIX}-ai-close`).addEventListener('click', close);
    backdrop.addEventListener('click', handleBackdropClick);
    document.addEventListener('keydown', handleKeydown);
    footer.querySelector(`.${CSS_PREFIX}-ai-test-close-btn`).addEventListener('click', close);

    // ── Step list helpers ──

    /**
     * Render the step list in the body.
     *
     * @param {Array<{label: string, status: 'pending'|'active'|'done'|'error'}>} steps - Steps to render.
     * @param {string} [responseHtml] - Optional HTML block shown below the step list.
     */
    function renderSteps(steps, responseHtml = '') {
        const stepIcons = { pending: '⬜', active: '⏳', done: '✅', error: '❌' };
        const stepsHtml = steps
            .map(
                (s) =>
                    `<li class="${CSS_PREFIX}-ai-test-step ${CSS_PREFIX}-ai-test-step-${s.status}">
                        <span class="${CSS_PREFIX}-ai-test-step-icon">${stepIcons[s.status]}</span>
                        <span class="${CSS_PREFIX}-ai-test-step-label">${escapeHtml(s.label)}</span>
                    </li>`
            )
            .join('');

        body.innerHTML = `
            <ul class="${CSS_PREFIX}-ai-test-steps">${stepsHtml}</ul>
            ${responseHtml}
        `;
    }

    // ── API key prompt ──
    /**
     * Show an inline API key input and resolve with the entered key (or null on cancel).
     *
     * @param {string} providerName - Display name of the provider.
     *
     * @returns {Promise<string|null>} Entered key or null if cancelled.
     */
    function promptApiKey(providerName) {
        return new Promise((resolve) => {
            const promptId = `${CSS_PREFIX}-ai-key-prompt-text`;
            const inputId = `${CSS_PREFIX}-ai-key-input`;
            const noteId = `${CSS_PREFIX}-ai-key-note`;

            body.innerHTML = `
                <div class="${CSS_PREFIX}-ai-key-prompt">
                    <p id="${promptId}">Enter your <strong>${escapeHtml(providerName)}</strong> API key to run the test:</p>
                    <label for="${inputId}">${escapeHtml(providerName)} API key</label>
                    <input
                        id="${inputId}"
                        type="password"
                        class="${CSS_PREFIX}-ai-key-input"
                        placeholder="sk-…"
                        autocomplete="off"
                        aria-describedby="${promptId} ${noteId}"
                    />
                    <div class="${CSS_PREFIX}-ai-key-actions">
                        <button class="${CSS_PREFIX}-ai-btn ${CSS_PREFIX}-ai-key-ok">Run Test</button>
                        <button class="${CSS_PREFIX}-ai-btn ${CSS_PREFIX}-ai-key-cancel">Cancel</button>
                    </div>
                    <p id="${noteId}" class="${CSS_PREFIX}-ai-key-note">Key is cached in sessionStorage for this browser session only.</p>
                </div>
            `;

            const input = body.querySelector(`#${CSS_PREFIX}-ai-key-input`);
            const okBtn = body.querySelector(`.${CSS_PREFIX}-ai-key-ok`);
            const cancelBtn = body.querySelector(`.${CSS_PREFIX}-ai-key-cancel`);

            input.focus();

            okBtn.addEventListener('click', () => resolve(input.value.trim() || null));
            cancelBtn.addEventListener('click', () => resolve(null));
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') resolve(input.value.trim() || null);
                if (e.key === 'Escape') resolve(null);
            });
        });
    }

    // ── Run the test ──
    /**
     * Execute the connection test: prompt for key if needed, send test prompt, show response.
     */
    async function runTest() {
        const needsKey = provider === 'openai' || provider === 'anthropic';
        let apiKey = null;

        if (needsKey) {
            apiKey = getApiKey(provider, aiConfig);

            if (!apiKey) {
                // Need to prompt for key before we can show steps
                apiKey = await promptApiKey(providerLabel);
                if (!apiKey) {
                    // User cancelled — close modal
                    close();
                    return;
                }
                cacheApiKey(provider, apiKey);
            }
        }

        const steps = [
            { label: `Connecting to ${providerLabel}…`, status: 'active' },
            { label: 'Sending test prompt: "Hello! Who are you?"', status: 'pending' },
            { label: 'Waiting for response…', status: 'pending' },
        ];
        renderSteps(steps);

        // Step 0 complete → Step 1 active
        steps[0].status = 'done';
        steps[1].status = 'active';
        renderSteps(steps);

        // Create an AbortController so closing the modal cancels the in-flight request
        abortController = new AbortController();

        let result;
        try {
            // Step 1 complete → Step 2 active
            steps[1].status = 'done';
            steps[2].status = 'active';
            renderSteps(steps);

            result = await testConnection(aiConfig, { apiKey, signal: abortController.signal });

            // If the modal was closed while waiting, do nothing
            if (!backdrop.isConnected) return;

            steps[2].status = 'done';
        } catch (err) {
            if (!backdrop.isConnected) return;

            steps[2].status = 'error';
            const escaped = escapeHtml(err.message || 'Connection failed').replace(/\n/g, '<br>');
            renderSteps(
                steps,
                `
                <div class="${CSS_PREFIX}-ai-error">
                    <span class="${CSS_PREFIX}-ai-error-icon">⚠️</span>
                    <p>${escaped}</p>
                </div>
            `
            );
            footer.style.display = 'flex';
            return;
        }

        // Show model info and response
        const modelInfo = result.model
            ? `<div class="${CSS_PREFIX}-ai-meta">Model: ${escapeHtml(result.model)} · Provider: ${escapeHtml(result.provider)}</div>`
            : '';
        const responseHtml = `
            ${modelInfo}
            <div class="${CSS_PREFIX}-ai-test-response">
                <p class="${CSS_PREFIX}-ai-test-response-label">Response:</p>
                <div class="${CSS_PREFIX}-ai-test-response-body">${escapeHtml(result.content)}</div>
            </div>
        `;
        renderSteps(steps, responseHtml);
        footer.style.display = 'flex';
    }

    // Focus close button for keyboard accessibility after attaching
    const closeBtn = header.querySelector(`.${CSS_PREFIX}-ai-close`);
    if (closeBtn) closeBtn.focus();

    // Start the test
    runTest();
}
