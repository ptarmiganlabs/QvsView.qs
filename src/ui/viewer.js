/**
 * Read-only code viewer renderer.
 *
 * Takes script text, tokenizes it, and renders a scrollable code view
 * with optional line numbers and syntax highlighting.
 */

import { tokenize, renderTokensToHTML } from '../syntax/highlighter.js';
import { buildTokenCSS } from '../syntax/tokens.js';

const CSS_PREFIX = 'qvs';

/** @type {boolean} */
let cssInjected = false;

/**
 * Inject the viewer CSS into the document head (once).
 *
 * @returns {void}
 */
function injectCSS() {
    if (cssInjected) return;
    cssInjected = true;

    const style = document.createElement('style');
    style.id = 'qvsview-syntax-tokens';
    style.textContent = buildTokenCSS(CSS_PREFIX);
    document.head.appendChild(style);
}

/**
 * Render the script viewer into the given DOM element.
 *
 * @param {HTMLElement} element - The extension's root DOM element.
 * @param {object} options - Rendering options.
 * @param {string} options.script - The full script text to display.
 * @param {boolean} [options.showLineNumbers] - Whether to show line numbers.
 * @param {boolean} [options.wordWrap] - Whether to wrap long lines.
 * @param {number} [options.fontSize] - Font size in pixels.
 *
 * @returns {void}
 */
export function renderViewer(element, options) {
    injectCSS();

    const { script, showLineNumbers = true, wordWrap = false, fontSize = 13 } = options;

    const tokenizedLines = tokenize(script);
    const codeHTML = renderTokensToHTML(tokenizedLines, CSS_PREFIX);
    const lineCount = tokenizedLines.length;

    const wrapClass = wordWrap ? `${CSS_PREFIX}-wrap` : '';

    // Build line numbers gutter
    let gutterHTML = '';
    if (showLineNumbers) {
        const numbers = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
        gutterHTML = `<pre class="${CSS_PREFIX}-gutter" style="font-size:${fontSize}px">${numbers}</pre>`;
    }

    element.innerHTML = `
        <div class="${CSS_PREFIX}-viewer ${wrapClass}">
            ${gutterHTML}
            <pre class="${CSS_PREFIX}-code" style="font-size:${fontSize}px"><code>${codeHTML}</code></pre>
        </div>
    `;
}

/**
 * Render a placeholder when no data is available (no dimension selected).
 *
 * @param {HTMLElement} element - The extension's root DOM element.
 * @param {string} [message] - Placeholder message.
 *
 * @returns {void}
 */
export function renderPlaceholder(element, message = 'Add a dimension containing script text') {
    element.innerHTML = `
        <div class="${CSS_PREFIX}-placeholder">
            <div class="${CSS_PREFIX}-placeholder-icon">&#60;/&#62;</div>
            <div class="${CSS_PREFIX}-placeholder-text">${message}</div>
        </div>
    `;
}
