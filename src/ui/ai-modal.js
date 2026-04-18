/**
 * AI Analysis modal dialog.
 *
 * Vanilla DOM modal with backdrop, ARIA attributes, focus trap, and
 * loading/success/error states. Renders Markdown results with Mermaid diagrams.
 * Features cycling humorous loading messages and an optional Snake mini-game.
 */

import { renderMarkdown } from '../ai/markdown-renderer.js';
import { initMermaidDiagrams } from '../ai/mermaid-init.js';

const CSS_PREFIX = 'qvs';

/** Human-readable labels and icons for each prompt template key. */
const TEMPLATE_LABELS = {
    general: { label: 'General analysis', icon: '📊' },
    security: { label: 'Security audit', icon: '🔒' },
    performance: { label: 'Performance review', icon: '⚡' },
    documentation: { label: 'Documentation', icon: '📝' },
};

/**
 * Remove trailing conversational filler that LLMs often append
 * (e.g. "Let me know if…", "Feel free to…", "Happy to help…").
 *
 * @param {string} text - Raw markdown from the LLM.
 *
 * @returns {string} Cleaned markdown.
 */
function stripTrailingFluff(text) {
    const lines = text.trimEnd().split('\n');
    // Walk backwards, removing empty lines and lines that match fluff patterns
    const fluff =
        /^\s*(let me know|feel free|happy to|hope this|if you('d| would) like|don't hesitate|i can also|shall i|would you like|i('m| am) here|I'd be happy)/i;
    while (lines.length > 0) {
        const last = lines[lines.length - 1].trim();
        if (last === '') {
            lines.pop();
            continue;
        }
        if (fluff.test(last)) {
            lines.pop();
            continue;
        }
        break;
    }
    return lines.join('\n');
}

// ── Funny loading messages ──
const LOADING_MESSAGES = [
    // Rocket launch sequence
    { icon: '🚀', text: 'T-minus 10… igniting AI thrusters…' },
    { icon: '🔥', text: 'Main engines firing. Hold on tight.' },
    { icon: '🛸', text: 'Entering orbit around your data model…' },
    { icon: '📡', text: 'Establishing link with the analysis mothership…' },
    { icon: '🌕', text: 'Achieving stable orbit. Scanning payload…' },
    // Yoda
    { icon: '💚', text: 'Patience you must have, young analyst.' },
    { icon: '💚', text: 'Strong with the script, this one is.' },
    { icon: '💚', text: 'Analyze or analyze not. There is no try.' },
    { icon: '💚', text: 'Much to learn, your data model still has.' },
    { icon: '💚', text: 'Clouded by JOINs, the future is.' },
    // Pirate
    { icon: '🏴‍☠️', text: "Arrr! Navigatin' through yer data seas…" },
    { icon: '🏴‍☠️', text: "Swabbin' the data deck, cap'n!" },
    { icon: '🦜', text: 'Polly wants a scatter plot!' },
    { icon: '🏴‍☠️', text: 'X marks the spot where the QVD be buried!' },
    { icon: '🏴‍☠️', text: 'Hoisting the Jolly LOAD-er!' },
    // Mission control
    { icon: '👨‍🚀', text: 'Houston, we have… a lot of LOAD statements.' },
    { icon: '🛰️', text: 'Deploying satellite analysis array…' },
    { icon: '🌍', text: 'Re-entering the atmosphere of your QVDs…' },
    { icon: '📟', text: 'Telemetry nominal. Data looks good, Flight.' },
    { icon: '🧑‍🚀', text: 'Copy that, we have visual on the data model.' },
    // Chef
    { icon: '👨‍🍳', text: 'Marinating the data transformations…' },
    { icon: '🍝', text: 'Your script is al dente. Almost there.' },
    { icon: '🔪', text: 'Dicing up those resident loads…' },
    { icon: '🧂', text: 'Adding a pinch of optimization…' },
    { icon: '🍰', text: 'Baking a layered data model from scratch…' },
    // Dramatic / Pop culture
    { icon: '🎬', text: 'In a codebase far, far away…' },
    { icon: '⚔️', text: 'The script strikes back!' },
    { icon: '🤖', text: 'Beep boop. Processing human data rituals.' },
    { icon: '🧙', text: 'A wizard is never late. Nor is this analysis.' },
    { icon: '🦸', text: 'With great data comes great responsibility.' },
    // Detective / Mystery
    { icon: '🕵️', text: 'Interrogating suspicious WHERE clauses…' },
    { icon: '🔍', text: 'Following the trail of orphaned keys…' },
    { icon: '🕵️', text: 'The case of the missing LEFT JOIN…' },
    { icon: '🔎', text: 'Dusting for fingerprints on the data model…' },
    { icon: '🕵️', text: 'Elementary, my dear data engineer.' },
    // Misc fun
    { icon: '🎲', text: 'Rolling for critical analysis…' },
    { icon: '🧪', text: 'Brewing a fresh batch of insights…' },
    { icon: '🐉', text: 'Taming the data dragon…' },
    { icon: '🎸', text: 'Shredding through your script like a solo…' },
    { icon: '🏋️', text: 'Heavy-lifting those nested loads…' },
];

/**
 * Show the AI analysis modal.
 *
 * @param {object} opts - Modal options.
 * @param {HTMLElement} opts.container - Parent element to attach the modal to.
 * @param {(opts: {bypassCache: boolean, scope: string, promptTemplate?: string}) => Promise<{content: string, model: string, provider: string}>} opts.onAnalyze - Async function that performs the analysis.
 * @param {(() => void)} [opts.onClose] - Callback when the modal is closed.
 * @param {number} [opts.quoteCycleSeconds] - Seconds between loading quote changes (3–10).
 * @param {number} opts.sectionCount - Number of script sections/tabs.
 * @param {string} opts.activeSectionName - Name of the currently active section/tab.
 * @param {string} [opts.promptTemplateMode] - 'properties' (default) or 'runtime'.
 * @param {string} [opts.fixedPromptTemplate] - Template key when mode is 'properties'.
 *
 * @returns {{ close: () => void, showLoading: () => void, showError: (msg: string) => void, showResult: (content: string, meta: object) => Promise<void>, promptApiKey: (provider: string) => Promise<string|null>, runAnalysis: (bypassCache?: boolean) => Promise<void> }} Controller object.
 */
export function showAiModal({
    container,
    onAnalyze,
    onClose,
    quoteCycleSeconds = 5,
    sectionCount = 1,
    activeSectionName = 'Main',
    promptTemplateMode = 'properties',
    fixedPromptTemplate = 'general',
}) {
    const cycleMs = Math.max(3, Math.min(10, quoteCycleSeconds)) * 1000;
    // ── Backdrop + Dialog ──
    const backdrop = document.createElement('div');
    backdrop.className = `${CSS_PREFIX}-ai-backdrop`;

    const dialog = document.createElement('div');
    dialog.className = `${CSS_PREFIX}-ai-dialog`;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'AI Analysis');
    dialog.setAttribute('tabindex', '-1');

    // ── Header ──
    const header = document.createElement('div');
    header.className = `${CSS_PREFIX}-ai-header`;
    header.innerHTML = `
        <span class="${CSS_PREFIX}-ai-title">🤖 AI Analysis</span>
        <button class="${CSS_PREFIX}-ai-close" aria-label="Close" title="Close">&times;</button>
    `;

    // ── Body ──
    const body = document.createElement('div');
    body.className = `${CSS_PREFIX}-ai-body`;

    // ── Footer ──
    const footer = document.createElement('div');
    footer.className = `${CSS_PREFIX}-ai-footer`;
    footer.style.display = 'none';
    footer.innerHTML = `
        <button class="${CSS_PREFIX}-ai-btn ${CSS_PREFIX}-ai-btn-copy" title="Copy to clipboard">📋 Copy</button>
        <button class="${CSS_PREFIX}-ai-btn ${CSS_PREFIX}-ai-btn-download" title="Download as Markdown">💾 Download</button>
        <button class="${CSS_PREFIX}-ai-btn ${CSS_PREFIX}-ai-btn-reanalyze" title="Re-analyze (bypass cache)">🔄 Re-analyze</button>
    `;

    dialog.appendChild(header);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    backdrop.appendChild(dialog);
    container.appendChild(backdrop);

    // ── State ──
    let rawContent = '';
    let lastMeta = null;
    let lastElapsed = '';
    let analysisStartTime = 0;
    let loadingTimers = { message: null, elapsed: null };
    let snakeCleanup = null;

    // ── Close handler ──
    /** Remove the modal from the DOM and clean up all listeners and timers. */
    function close() {
        document.removeEventListener('keydown', handleKeydown);
        backdrop.removeEventListener('click', handleBackdropClick);
        clearLoadingTimers();
        if (snakeCleanup) snakeCleanup();
        backdrop.remove();
        if (onClose) onClose();
    }

    /**
     * Close the modal when clicking outside the dialog.
     *
     * @param {MouseEvent} e - Click event.
     */
    function handleBackdropClick(e) {
        if (e.target === backdrop) close();
    }

    header.querySelector(`.${CSS_PREFIX}-ai-close`).addEventListener('click', close);
    backdrop.addEventListener('click', handleBackdropClick);

    // ── Keyboard: Escape to close, focus trap ──
    /**
     * Handle keyboard events for the modal.
     *
     * @param {KeyboardEvent} e - Keyboard event.
     */
    function handleKeydown(e) {
        if (e.key === 'Escape') {
            close();
            return;
        }
        // Simple focus trap
        if (e.key === 'Tab') {
            const focusable = dialog.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
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
    document.addEventListener('keydown', handleKeydown);

    // ── Loading state ──
    /** Clear all loading interval timers. */
    function clearLoadingTimers() {
        if (loadingTimers.message) clearInterval(loadingTimers.message);
        if (loadingTimers.elapsed) clearInterval(loadingTimers.elapsed);
        loadingTimers = { message: null, elapsed: null };
    }

    /**
     * Format elapsed seconds as human-readable string.
     *
     * @param {number} secs - Elapsed seconds.
     *
     * @returns {string} Formatted time.
     */
    function formatElapsed(secs) {
        if (secs < 60) return `${secs}s`;
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}m ${s}s`;
    }

    /**
     * Display the loading state with cycling messages, elapsed timer, and Snake game button.
     *
     * @param {string} [templateKey] - Active prompt template key to display as a badge.
     */
    function showLoading(templateKey) {
        clearLoadingTimers();
        if (snakeCleanup) {
            snakeCleanup();
            snakeCleanup = null;
        }
        analysisStartTime = Date.now();

        // Pick a random starting message
        let msgIndex = Math.floor(Math.random() * LOADING_MESSAGES.length);
        const first = LOADING_MESSAGES[msgIndex];

        // Template badge HTML
        const tmpl = templateKey && TEMPLATE_LABELS[templateKey];
        const badgeHTML = tmpl
            ? `<p class="${CSS_PREFIX}-ai-template-badge">${tmpl.icon} ${escapeHtml(tmpl.label)}</p>`
            : '';

        body.innerHTML = `
            <div class="${CSS_PREFIX}-ai-loading">
                <div class="${CSS_PREFIX}-ai-spinner"></div>
                ${badgeHTML}
                <p class="${CSS_PREFIX}-ai-loading-msg">${first.icon} ${first.text}</p>
                <p class="${CSS_PREFIX}-ai-loading-elapsed">0s</p>
                <button class="${CSS_PREFIX}-ai-btn ${CSS_PREFIX}-ai-snake-btn">🐍 Play Snake while you wait?</button>
                <div class="${CSS_PREFIX}-ai-snake-area"></div>
            </div>
        `;
        footer.style.display = 'none';

        const msgEl = body.querySelector(`.${CSS_PREFIX}-ai-loading-msg`);
        const elapsedEl = body.querySelector(`.${CSS_PREFIX}-ai-loading-elapsed`);
        const snakeBtn = body.querySelector(`.${CSS_PREFIX}-ai-snake-btn`);
        const snakeArea = body.querySelector(`.${CSS_PREFIX}-ai-snake-area`);

        // Cycle messages every 7 seconds with fade
        loadingTimers.message = setInterval(() => {
            msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length;
            const m = LOADING_MESSAGES[msgIndex];
            msgEl.classList.add(`${CSS_PREFIX}-ai-fade-out`);
            let swapped = false;
            /** Swap text content after fade-out completes (one-shot). */
            const swap = () => {
                if (swapped) return;
                swapped = true;
                msgEl.removeEventListener('transitionend', swap);
                msgEl.textContent = `${m.icon} ${m.text}`;
                // Force reflow so the browser registers opacity:0 before removing class
                void msgEl.offsetWidth;
                msgEl.classList.remove(`${CSS_PREFIX}-ai-fade-out`);
            };
            msgEl.addEventListener('transitionend', swap, { once: true });
            // Fallback in case transitionend doesn't fire
            setTimeout(swap, 400);
        }, cycleMs);

        // Update elapsed timer every second
        loadingTimers.elapsed = setInterval(() => {
            const secs = Math.floor((Date.now() - analysisStartTime) / 1000);
            elapsedEl.textContent = formatElapsed(secs);
        }, 1000);

        // Snake game button
        snakeBtn.addEventListener('click', () => {
            snakeBtn.style.display = 'none';
            snakeCleanup = startSnakeGame(snakeArea);
        });
    }

    // ── Error state ──
    /**
     * Display an error message in the modal body.
     *
     * @param {string} message - Error message to display.
     */
    function showError(message) {
        clearLoadingTimers();
        if (snakeCleanup) {
            snakeCleanup();
            snakeCleanup = null;
        }
        const escaped = escapeHtml(message).replace(/\n/g, '<br>');
        body.innerHTML = `
            <div class="${CSS_PREFIX}-ai-error">
                <span class="${CSS_PREFIX}-ai-error-icon">⚠️</span>
                <p>${escaped}</p>
            </div>
        `;
        footer.style.display = 'none';
    }

    // ── Success state ──
    /**
     * Render the analysis result in the modal body.
     *
     * @param {string} content - Markdown content from the AI provider.
     * @param {{ model: string, provider: string, templateKey?: string }} meta - Provider metadata.
     */
    async function showResult(content, meta) {
        clearLoadingTimers();
        if (snakeCleanup) {
            snakeCleanup();
            snakeCleanup = null;
        }

        rawContent = stripTrailingFluff(content);
        lastMeta = meta;
        const elapsedSecs = Math.floor((Date.now() - analysisStartTime) / 1000);
        lastElapsed = formatElapsed(elapsedSecs);
        const html = renderMarkdown(rawContent);
        const metaParts = [];
        if (meta) {
            const tmpl = meta.templateKey && TEMPLATE_LABELS[meta.templateKey];
            if (tmpl) {
                metaParts.push(`${tmpl.icon} ${escapeHtml(tmpl.label)}`);
            }
            metaParts.push(`Model: ${escapeHtml(meta.model)}`);
            metaParts.push(`Provider: ${escapeHtml(meta.provider)}`);
        }
        metaParts.push(`⏱️ ${lastElapsed}`);

        body.innerHTML = `
            <div class="${CSS_PREFIX}-ai-result">${html}</div>
            <div class="${CSS_PREFIX}-ai-disclaimer">⚠️ AI-generated analysis may contain inaccuracies. Review all findings carefully before acting on them.</div>
            <div class="${CSS_PREFIX}-ai-meta">${metaParts.join(' · ')}</div>
        `;
        footer.style.display = 'flex';

        // Render Mermaid diagrams
        const resultEl = body.querySelector(`.${CSS_PREFIX}-ai-result`);
        if (resultEl) {
            await initMermaidDiagrams(resultEl);
        }
    }

    // ── Footer actions ──
    footer.querySelector(`.${CSS_PREFIX}-ai-btn-copy`).addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(rawContent);
            const btn = footer.querySelector(`.${CSS_PREFIX}-ai-btn-copy`);
            const orig = btn.textContent;
            btn.textContent = '✅ Copied!';
            setTimeout(() => {
                btn.textContent = orig;
            }, 1500);
        } catch {
            // Clipboard API may be unavailable
        }
    });

    footer.querySelector(`.${CSS_PREFIX}-ai-btn-download`).addEventListener('click', () => {
        // Build metadata header for the downloaded file
        const metaLines = ['---'];
        if (lastMeta?.model) metaLines.push(`model: ${lastMeta.model}`);
        if (lastMeta?.provider) metaLines.push(`provider: ${lastMeta.provider}`);
        if (lastElapsed) metaLines.push(`analysis_time: ${lastElapsed}`);
        metaLines.push(`date: ${new Date().toISOString()}`);
        metaLines.push('---\n');
        const download = metaLines.join('\n') + rawContent;

        const blob = new Blob([download], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ai-analysis.md';
        a.click();
        URL.revokeObjectURL(url);
    });

    footer.querySelector(`.${CSS_PREFIX}-ai-btn-reanalyze`).addEventListener('click', () => {
        runAnalysis(true);
    });

    // ── Scope picker (shown when multiple tabs exist) ──

    /** @type {string} Last chosen scope — remembered across re-analyze clicks */
    let lastScope = sectionCount > 1 ? '' : 'full';

    /**
     * Show an inline scope picker for multi-tab scripts.
     *
     * @returns {Promise<string|null>} 'section' | 'full', or null if cancelled.
     */
    function promptScope() {
        return new Promise((resolve) => {
            const safeName = escapeHtml(activeSectionName);
            body.innerHTML = `
                <div class="${CSS_PREFIX}-ai-scope-prompt">
                    <p class="${CSS_PREFIX}-ai-scope-title">What would you like to analyze?</p>
                    <div class="${CSS_PREFIX}-ai-scope-options">
                        <button class="${CSS_PREFIX}-ai-scope-btn" data-scope="section">
                            <span class="${CSS_PREFIX}-ai-scope-icon">📄</span>
                            <span class="${CSS_PREFIX}-ai-scope-label">Current section</span>
                            <span class="${CSS_PREFIX}-ai-scope-desc">${safeName}</span>
                        </button>
                        <button class="${CSS_PREFIX}-ai-scope-btn" data-scope="full">
                            <span class="${CSS_PREFIX}-ai-scope-icon">📋</span>
                            <span class="${CSS_PREFIX}-ai-scope-label">Full script</span>
                            <span class="${CSS_PREFIX}-ai-scope-desc">All ${sectionCount} sections</span>
                        </button>
                    </div>
                </div>
            `;
            footer.style.display = 'none';

            body.querySelectorAll(`.${CSS_PREFIX}-ai-scope-btn`).forEach((btn) => {
                btn.addEventListener('click', () => {
                    resolve(btn.dataset.scope);
                });
            });
        });
    }

    // ── Template picker (shown at runtime when promptTemplateMode === 'runtime') ──

    /** @type {string} Last chosen runtime template — remembered across re-analyze clicks */
    let lastTemplate = '';

    /**
     * Show an inline prompt template picker.
     *
     * @returns {Promise<string|null>} Template key, or null if cancelled.
     */
    function promptTemplateChoice() {
        return new Promise((resolve) => {
            body.innerHTML = `
                <div class="${CSS_PREFIX}-ai-scope-prompt">
                    <p class="${CSS_PREFIX}-ai-scope-title">Choose analysis type</p>
                    <div class="${CSS_PREFIX}-ai-scope-options ${CSS_PREFIX}-ai-template-grid">
                        <button class="${CSS_PREFIX}-ai-scope-btn" data-template="general">
                            <span class="${CSS_PREFIX}-ai-scope-icon">📊</span>
                            <span class="${CSS_PREFIX}-ai-scope-label">General analysis</span>
                            <span class="${CSS_PREFIX}-ai-scope-desc">Overview, flow, data model & improvements</span>
                        </button>
                        <button class="${CSS_PREFIX}-ai-scope-btn" data-template="security">
                            <span class="${CSS_PREFIX}-ai-scope-icon">🔒</span>
                            <span class="${CSS_PREFIX}-ai-scope-label">Security audit</span>
                            <span class="${CSS_PREFIX}-ai-scope-desc">Vulnerabilities, risks & remediation</span>
                        </button>
                        <button class="${CSS_PREFIX}-ai-scope-btn" data-template="performance">
                            <span class="${CSS_PREFIX}-ai-scope-icon">⚡</span>
                            <span class="${CSS_PREFIX}-ai-scope-label">Performance review</span>
                            <span class="${CSS_PREFIX}-ai-scope-desc">Bottlenecks & optimization opportunities</span>
                        </button>
                        <button class="${CSS_PREFIX}-ai-scope-btn" data-template="documentation">
                            <span class="${CSS_PREFIX}-ai-scope-icon">📝</span>
                            <span class="${CSS_PREFIX}-ai-scope-label">Documentation</span>
                            <span class="${CSS_PREFIX}-ai-scope-desc">Generate comprehensive script docs</span>
                        </button>
                    </div>
                </div>
            `;
            footer.style.display = 'none';

            body.querySelectorAll(`.${CSS_PREFIX}-ai-scope-btn`).forEach((btn) => {
                btn.addEventListener('click', () => {
                    resolve(btn.dataset.template);
                });
            });
        });
    }

    // ── Run analysis ──
    /**
     * Execute the analysis and render results.
     * Prompts for scope if there are multiple script tabs.
     * Prompts for template if promptTemplateMode is 'runtime'.
     *
     * @param {boolean} [bypassCache] - Whether to bypass the cache.
     */
    async function runAnalysis(bypassCache = false) {
        // Determine scope — prompt if multi-tab and no previous choice (or re-analyze)
        let scope = lastScope;
        if (sectionCount > 1 && (bypassCache || !scope)) {
            scope = await promptScope();
            if (!scope) return; // dialog was closed before choosing
            lastScope = scope;
        }
        if (!scope) scope = 'full';

        // Determine template — prompt if runtime mode and (re-analyze or no previous choice)
        let template = lastTemplate;
        if (promptTemplateMode === 'runtime' && (bypassCache || !template)) {
            template = await promptTemplateChoice();
            if (!template) return; // dialog was closed before choosing
            lastTemplate = template;
        }

        // Effective template key for display (runtime pick or fixed from properties)
        const effectiveTemplate = template || fixedPromptTemplate;

        showLoading(effectiveTemplate);
        try {
            const result = await onAnalyze({
                bypassCache,
                scope,
                promptTemplate: template || undefined,
            });
            await showResult(result.content, {
                model: result.model,
                provider: result.provider,
                templateKey: effectiveTemplate,
            });
        } catch (err) {
            showError(err.message || 'Analysis failed');
        }
    }

    // ── API key prompt (inline in modal body) ──
    /**
     * Show an inline API key prompt inside the modal body.
     *
     * @param {string} provider - Provider name ('openai' or 'anthropic').
     *
     * @returns {Promise<string|null>} The entered key, or null if cancelled.
     */
    function promptApiKey(provider) {
        return new Promise((resolve) => {
            body.innerHTML = `
                <div class="${CSS_PREFIX}-ai-key-prompt">
                    <p>Enter your <strong>${escapeHtml(provider)}</strong> API key:</p>
                    <input type="password" class="${CSS_PREFIX}-ai-key-input" placeholder="sk-…" autocomplete="off" />
                    <div class="${CSS_PREFIX}-ai-key-actions">
                        <button class="${CSS_PREFIX}-ai-btn ${CSS_PREFIX}-ai-key-ok">Continue</button>
                        <button class="${CSS_PREFIX}-ai-btn ${CSS_PREFIX}-ai-key-cancel">Cancel</button>
                    </div>
                    <p class="${CSS_PREFIX}-ai-key-note">Key is cached in sessionStorage for this browser session only.</p>
                </div>
            `;
            footer.style.display = 'none';

            const input = body.querySelector(`.${CSS_PREFIX}-ai-key-input`);
            const okBtn = body.querySelector(`.${CSS_PREFIX}-ai-key-ok`);
            const cancelBtn = body.querySelector(`.${CSS_PREFIX}-ai-key-cancel`);

            input.focus();

            okBtn.addEventListener('click', () => {
                const key = input.value.trim();
                resolve(key || null);
            });
            cancelBtn.addEventListener('click', () => resolve(null));
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const key = input.value.trim();
                    resolve(key || null);
                }
            });
        });
    }

    // Start analysis immediately
    runAnalysis();

    // Focus the close button for keyboard accessibility
    const closeBtn = header.querySelector(`.${CSS_PREFIX}-ai-close`);
    if (closeBtn) {
        closeBtn.focus();
    } else {
        dialog.focus();
    }

    return { close, showLoading, showError, showResult, promptApiKey, runAnalysis };
}

/**
 * Start a Snake mini-game inside the given container element.
 *
 * @param {HTMLElement} container - The DOM element to render the game into.
 *
 * @returns {() => void} Cleanup function to stop the game loop.
 */
function startSnakeGame(container) {
    const CELL = 12;
    const COLS = 24;
    const ROWS = 18;
    const W = COLS * CELL;
    const H = ROWS * CELL;
    const TICK_MS = 180;

    container.innerHTML = `
        <div class="${CSS_PREFIX}-ai-snake-wrapper">
            <canvas class="${CSS_PREFIX}-ai-snake-canvas" width="${W}" height="${H}" tabindex="0"></canvas>
            <div class="${CSS_PREFIX}-ai-snake-hud">
                <span class="${CSS_PREFIX}-ai-snake-score">Score: 0</span>
                <span class="${CSS_PREFIX}-ai-snake-hint">Arrow keys or WASD to move</span>
            </div>
        </div>
    `;

    const canvas = container.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = container.querySelector(`.${CSS_PREFIX}-ai-snake-score`);

    let snake = [{ x: 12, y: 9 }];
    let dir = { x: 1, y: 0 };
    let nextDir = { x: 1, y: 0 };
    let food = spawnFood();
    let score = 0;
    let gameOver = false;
    let tickId = null;

    /**
     * Spawn food at a random position not occupied by the snake.
     *
     * @returns {{ x: number, y: number }} Food position.
     */
    function spawnFood() {
        let pos;
        const occupied = new Set(snake.map((s) => `${s.x},${s.y}`));
        do {
            pos = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
        } while (occupied.has(`${pos.x},${pos.y}`));
        return pos;
    }

    /** Draw the game board, snake, and food. */
    function draw() {
        // Background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, W, H);

        // Grid lines (subtle)
        ctx.strokeStyle = '#16213e';
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= W; x += CELL) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }
        for (let y = 0; y <= H; y += CELL) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }

        // Food
        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath();
        ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL / 2 - 1, 0, Math.PI * 2);
        ctx.fill();

        // Snake
        snake.forEach((seg, i) => {
            ctx.fillStyle = i === 0 ? '#4ecca3' : '#36b890';
            ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2);
            if (i === 0) {
                // Eyes
                ctx.fillStyle = '#1a1a2e';
                const ex = seg.x * CELL + CELL / 2;
                const ey = seg.y * CELL + CELL / 2;
                ctx.beginPath();
                ctx.arc(ex - 2, ey - 2, 1.5, 0, Math.PI * 2);
                ctx.arc(ex + 2, ey - 2, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        // Game over overlay
        if (gameOver) {
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Game Over!', W / 2, H / 2 - 10);
            ctx.font = '12px sans-serif';
            ctx.fillText(`Score: ${score}  —  Press any key to restart`, W / 2, H / 2 + 14);
        }
    }

    /** Advance the game by one tick. */
    function tick() {
        if (gameOver) return;

        dir = nextDir;
        const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

        // Wall collision
        if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
            gameOver = true;
            draw();
            return;
        }
        // Self collision
        if (snake.some((s) => s.x === head.x && s.y === head.y)) {
            gameOver = true;
            draw();
            return;
        }

        snake.unshift(head);

        // Eat food
        if (head.x === food.x && head.y === food.y) {
            score += 10;
            scoreEl.textContent = `Score: ${score}`;
            food = spawnFood();
        } else {
            snake.pop();
        }

        draw();
    }

    /**
     * Handle keyboard input for the snake game.
     *
     * @param {KeyboardEvent} e - The keyboard event.
     */
    function handleKey(e) {
        if (gameOver) {
            // Restart on any key
            snake = [{ x: 12, y: 9 }];
            dir = { x: 1, y: 0 };
            nextDir = { x: 1, y: 0 };
            food = spawnFood();
            score = 0;
            gameOver = false;
            scoreEl.textContent = 'Score: 0';
            draw();
            return;
        }

        const key = e.key.toLowerCase();
        // Prevent reversing into self
        if ((key === 'arrowup' || key === 'w') && dir.y !== 1) nextDir = { x: 0, y: -1 };
        else if ((key === 'arrowdown' || key === 's') && dir.y !== -1) nextDir = { x: 0, y: 1 };
        else if ((key === 'arrowleft' || key === 'a') && dir.x !== 1) nextDir = { x: -1, y: 0 };
        else if ((key === 'arrowright' || key === 'd') && dir.x !== -1) nextDir = { x: 1, y: 0 };

        // Prevent arrow keys from scrolling the modal
        if (e.key.startsWith('Arrow')) e.preventDefault();
    }

    canvas.addEventListener('keydown', handleKey);
    canvas.focus();

    draw();
    tickId = setInterval(tick, TICK_MS);

    // Return cleanup function
    return () => {
        if (tickId) clearInterval(tickId);
        canvas.removeEventListener('keydown', handleKey);
    };
}

/**
 * Escape HTML special characters.
 *
 * @param {string} str - Raw string.
 *
 * @returns {string} Escaped string.
 */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
