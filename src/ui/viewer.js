/**
 * Read-only code viewer renderer.
 *
 * Takes script text, tokenizes it, and renders a scrollable code view
 * with optional line numbers, syntax highlighting, section tabs, and
 * a copy-to-clipboard button.
 */

import { tokenize, renderTokensToHTML } from '../syntax/highlighter.js';
import { buildTokenCSS } from '../syntax/tokens.js';
import { parseSections } from '../sections.js';
import { buildSearchBar, findMatchOffsets, highlightMatches, scrollToMatch } from './search.js';
import { detectFoldRanges, buildFoldMap } from '../syntax/fold-detector.js';

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
 * Build the tab bar HTML for script sections.
 *
 * @param {import('../sections.js').ScriptSection[]} sections - Parsed script sections.
 * @param {number} activeIndex - Index of the currently active section.
 *
 * @returns {string} HTML string for the tab bar.
 */
function buildTabBar(sections, activeIndex) {
    const tabs = sections
        .map(
            (s, i) =>
                `<button class="${CSS_PREFIX}-tab${i === activeIndex ? ` ${CSS_PREFIX}-tab-active` : ''}" data-section-index="${i}">${escapeHTML(s.name)}</button>`
        )
        .join('');

    return `<div class="${CSS_PREFIX}-tab-bar">${tabs}</div>`;
}

/**
 * Detect the platform modifier key label.
 *
 * @returns {string} "Cmd" on Mac, "Ctrl" otherwise.
 */
function modKey() {
    return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
        ? 'Cmd'
        : 'Ctrl';
}

/**
 * Build the toolbar HTML (copy button + search hint + optional font size dropdown).
 *
 * @param {object} toolbarOpts - Toolbar display options.
 * @param {boolean} toolbarOpts.showCopyButton - Whether to show the copy button.
 * @param {boolean} toolbarOpts.showFontSizeDropdown - Whether to show the font size dropdown.
 * @param {number} toolbarOpts.fontSize - Current font size value.
 *
 * @returns {string} HTML string for the toolbar.
 */
function buildToolbar(toolbarOpts) {
    const { showCopyButton = true, showFontSizeDropdown = false, fontSize = 13 } = toolbarOpts;

    const sizes = [10, 11, 12, 13, 14, 16, 18, 20];
    const fontSizeHTML = showFontSizeDropdown
        ? `<select class="${CSS_PREFIX}-fontsize-select" title="Font size">${sizes.map((s) => `<option value="${s}"${s === fontSize ? ' selected' : ''}>${s}px</option>`).join('')}</select>`
        : '';

    const copyHTML = showCopyButton
        ? `<button class="${CSS_PREFIX}-copy-btn" title="Copy to clipboard">&#128203; Copy</button>`
        : '';

    return `<div class="${CSS_PREFIX}-toolbar">
        ${fontSizeHTML}
        <span class="${CSS_PREFIX}-search-hint" title="Open search">${modKey()}+F</span>
        ${copyHTML}
    </div>`;
}

/**
 * Render the script viewer into the given DOM element.
 *
 * Supports section tabs (split on `///$tab` markers), a copy-to-clipboard
 * button, optional line numbers, and word wrap.
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

    const {
        script,
        showLineNumbers = true,
        wordWrap = false,
        fontSize = 13,
        enableFolding = true,
        showCopyButton = true,
        showFontSizeDropdown = false,
    } = options;

    const sections = parseSections(script);

    // Preserve active tab across re-renders if possible
    const prevIndex = parseInt(element.dataset.qvsActiveSection || '0', 10);
    const activeIndex = prevIndex < sections.length ? prevIndex : 0;

    renderSection(element, {
        sections,
        activeIndex,
        showLineNumbers,
        wordWrap,
        fontSize,
        fullScript: script,
        enableFolding,
        showCopyButton,
        showFontSizeDropdown,
    });
}

/**
 * Render a specific section with its tab bar, toolbar, and code.
 *
 * @param {HTMLElement} element - The extension's root DOM element.
 * @param {object} opts - Render options.
 * @param {import('../sections.js').ScriptSection[]} opts.sections - All parsed sections.
 * @param {number} opts.activeIndex - Index of section to display.
 * @param {boolean} opts.showLineNumbers - Show line number gutter.
 * @param {boolean} opts.wordWrap - Wrap long lines.
 * @param {number} opts.fontSize - Font size in pixels.
 * @param {string} opts.fullScript - The complete script text (for "copy all").
 * @param {boolean} opts.enableFolding - Whether code folding is enabled.
 * @param {boolean} opts.showCopyButton - Whether to show the copy button.
 * @param {boolean} opts.showFontSizeDropdown - Whether to show the font size dropdown.
 *
 * @returns {void}
 */
function renderSection(element, opts) {
    const {
        sections,
        activeIndex,
        showLineNumbers,
        wordWrap,
        fontSize,
        fullScript,
        enableFolding,
        showCopyButton,
        showFontSizeDropdown,
    } = opts;

    const section = sections[activeIndex];
    const sectionScript = section.content;

    const tokenizedLines = tokenize(sectionScript);
    const codeHTML = renderTokensToHTML(tokenizedLines, CSS_PREFIX);
    const lineCount = tokenizedLines.length;
    const lineOffset = section.startLine + (sections.length > 1 ? 1 : 0); // offset for ///$tab line

    const wrapClass = wordWrap ? `${CSS_PREFIX}-wrap` : '';

    // ── Fold detection ──
    let foldMap = new Map();
    if (enableFolding) {
        const ranges = detectFoldRanges(tokenizedLines);
        foldMap = buildFoldMap(ranges);
    }

    // Restore fold state from element dataset
    const foldState = parseFoldState(element.dataset.qvsFoldState);

    // Determine which lines are hidden (inside a collapsed fold)
    const hiddenLines = new Set();
    if (enableFolding) {
        for (const [startLine, range] of foldMap) {
            if (foldState.has(startLine)) {
                for (let i = startLine + 1; i <= range.endLine; i++) {
                    hiddenLines.add(i);
                }
            }
        }
    }

    // ── Build per-line gutter ──
    let gutterHTML = '';
    if (showLineNumbers) {
        const gutterLines = [];
        for (let i = 0; i < lineCount; i++) {
            const hidden = hiddenLines.has(i) ? ` ${CSS_PREFIX}-gutter-line-hidden` : '';
            gutterLines.push(
                `<div class="${CSS_PREFIX}-gutter-line${hidden}">${lineOffset + i + 1}</div>`
            );
            // Insert spacer to match fold placeholder in code area
            if (enableFolding && foldState.has(i) && foldMap.has(i)) {
                gutterLines.push(`<div class="${CSS_PREFIX}-fold-placeholder-spacer"></div>`);
            }
        }
        gutterHTML = `<div class="${CSS_PREFIX}-gutter" style="font-size:${fontSize}px">${gutterLines.join('')}</div>`;
    }

    // ── Build fold gutter ──
    let foldGutterHTML = '';
    if (enableFolding) {
        const foldLines = [];
        for (let i = 0; i < lineCount; i++) {
            const hidden = hiddenLines.has(i) ? ` ${CSS_PREFIX}-fold-line-hidden` : '';
            const range = foldMap.get(i);
            if (range) {
                const collapsed = foldState.has(i);
                const icon = collapsed ? '\u25B6' : '\u25BC';
                const count = range.endLine - range.startLine;
                const title = collapsed ? `Expand (${count} lines)` : `Collapse (${count} lines)`;
                foldLines.push(
                    `<div class="${CSS_PREFIX}-fold-line${hidden}" data-fold-start="${i}" title="${title}"><span class="${CSS_PREFIX}-fold-icon">${icon}</span></div>`
                );
            } else {
                foldLines.push(`<div class="${CSS_PREFIX}-fold-line${hidden}">&nbsp;</div>`);
            }
            // Insert spacer to match fold placeholder in code area
            if (foldState.has(i) && foldMap.has(i)) {
                foldLines.push(`<div class="${CSS_PREFIX}-fold-placeholder-spacer"></div>`);
            }
        }
        foldGutterHTML = `<div class="${CSS_PREFIX}-fold-gutter" style="font-size:${fontSize}px">${foldLines.join('')}</div>`;
    }

    // ── Apply hidden state and fold placeholders to code HTML ──
    let finalCodeHTML = codeHTML;
    if (enableFolding && hiddenLines.size > 0) {
        finalCodeHTML = injectFoldPlaceholders(codeHTML, foldMap, foldState, hiddenLines);
    }

    // ── Search highlight injection ──
    const searchQuery = element.dataset.qvsSearchQuery || '';
    const searchActive = element.dataset.qvsSearchOpen === '1';
    let matches = [];
    let activeMatchIndex = 0;

    if (searchActive && searchQuery) {
        matches = findMatchOffsets(sectionScript, searchQuery);
        const prevMatch = parseInt(element.dataset.qvsSearchMatch || '0', 10);
        activeMatchIndex = matches.length > 0 ? prevMatch % matches.length : 0;
        element.dataset.qvsSearchMatch = String(activeMatchIndex);

        if (matches.length > 0) {
            // Auto-expand collapsed regions containing matches
            if (enableFolding) {
                autoExpandForMatches(matches, sectionScript, foldMap, foldState, hiddenLines);
                saveFoldState(element, foldState);
                // Re-render if we expanded anything
                if (hiddenLines.size === 0) {
                    finalCodeHTML = codeHTML;
                }
            }
            finalCodeHTML = highlightMatches(
                finalCodeHTML,
                sectionScript,
                matches,
                activeMatchIndex
            );
        }
    }

    // ── Save scroll position before re-render ──
    const prevViewer = element.querySelector(`.${CSS_PREFIX}-viewer`);
    const savedScrollTop = prevViewer ? prevViewer.scrollTop : 0;

    element.dataset.qvsActiveSection = String(activeIndex);

    element.innerHTML = `
        <div class="${CSS_PREFIX}-container" tabindex="0">
            <div class="${CSS_PREFIX}-header">
                ${buildTabBar(sections, activeIndex)}
                ${buildToolbar({ showCopyButton, showFontSizeDropdown, fontSize })}
            </div>
            ${searchActive ? buildSearchBar(searchQuery, activeMatchIndex, matches.length) : ''}
            <div class="${CSS_PREFIX}-viewer ${wrapClass}">
              <div class="${CSS_PREFIX}-viewer-inner">
                ${gutterHTML}
                ${foldGutterHTML}
                <pre class="${CSS_PREFIX}-code" style="font-size:${fontSize}px"><code>${finalCodeHTML}</code></pre>
              </div>
            </div>
        </div>
    `;

    // ── Restore scroll position ──
    const viewer = element.querySelector(`.${CSS_PREFIX}-viewer`);
    if (viewer && savedScrollTop) {
        viewer.scrollTop = savedScrollTop;
    }

    // Scroll to active match after render
    if (searchActive && matches.length > 0) {
        if (viewer) scrollToMatch(viewer, activeMatchIndex);
    }

    // ── Attach event listeners ──

    // Tab click handler
    element.querySelectorAll(`.${CSS_PREFIX}-tab`).forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.dataset.sectionIndex, 10);
            if (idx === activeIndex) return;
            // Reset match index and fold state when switching tabs
            element.dataset.qvsSearchMatch = '0';
            element.dataset.qvsFoldState = '';
            renderSection(element, { ...opts, activeIndex: idx });
        });
    });

    // Fold gutter click handler (event delegation)
    if (enableFolding) {
        const foldGutter = element.querySelector(`.${CSS_PREFIX}-fold-gutter`);
        if (foldGutter) {
            foldGutter.addEventListener('click', (e) => {
                const foldLine = e.target.closest(`[data-fold-start]`);
                if (!foldLine) return;

                const startLine = parseInt(foldLine.dataset.foldStart, 10);
                if (Number.isNaN(startLine)) return;

                // Toggle fold state
                if (foldState.has(startLine)) {
                    foldState.delete(startLine);
                } else {
                    foldState.add(startLine);
                }
                saveFoldState(element, foldState);
                renderSection(element, opts);
            });
        }

        // Fold placeholder click handler (expand on click)
        element.querySelectorAll(`.${CSS_PREFIX}-fold-placeholder`).forEach((ph) => {
            ph.addEventListener('click', () => {
                const startLine = parseInt(ph.dataset.foldStart, 10);
                if (Number.isNaN(startLine)) return;
                foldState.delete(startLine);
                saveFoldState(element, foldState);
                renderSection(element, opts);
            });
        });
    }

    // Copy button handler
    const copyBtn = element.querySelector(`.${CSS_PREFIX}-copy-btn`);
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(fullScript).then(
                () => {
                    copyBtn.textContent = '\u2713 Copied!';
                    setTimeout(() => {
                        copyBtn.innerHTML = '&#128203; Copy';
                    }, 2000);
                },
                () => {
                    copyBtn.textContent = 'Failed';
                }
            );
        });
    }

    // Font size dropdown handler
    const fontSizeSelect = element.querySelector(`.${CSS_PREFIX}-fontsize-select`);
    if (fontSizeSelect) {
        fontSizeSelect.addEventListener('change', () => {
            const newSize = parseInt(fontSizeSelect.value, 10);
            if (!Number.isNaN(newSize)) {
                renderSection(element, { ...opts, fontSize: newSize });
            }
        });
    }

    // ── Search event listeners ──
    const container = element.querySelector(`.${CSS_PREFIX}-container`);

    // Keyboard shortcuts on the container
    if (container) {
        container.addEventListener('keydown', (e) => {
            // Ctrl/Cmd+C — copy selected text directly to clipboard.
            // Qlik's framework prevents the default copy-event chain, so we
            // intercept at keydown and use the Clipboard API instead.
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                const sel = window.getSelection();
                const text = sel ? sel.toString() : '';
                if (text) {
                    e.preventDefault();
                    e.stopPropagation();
                    navigator.clipboard.writeText(text);
                }
            }

            // Ctrl/Cmd+F to open search
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                e.stopPropagation();
                element.dataset.qvsSearchOpen = '1';
                renderSection(element, opts);
                const input = element.querySelector(`.${CSS_PREFIX}-search-input`);
                if (input) {
                    input.focus();
                    input.select();
                }
            }
        });
    }

    // Search input and button handlers (only when search bar is visible)
    const searchInput = element.querySelector(`.${CSS_PREFIX}-search-input`);
    if (searchInput) {
        // Focus the input on initial open
        searchInput.focus();

        // Live search on input — update highlights without replacing search bar
        let debounceTimer = null;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const query = searchInput.value;
                element.dataset.qvsSearchQuery = query;
                element.dataset.qvsSearchMatch = '0';
                updateCodeHighlights(element, opts);
            }, 80);
        });

        // Enter = next, Shift+Enter = prev, Escape = close
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const dir = e.shiftKey ? -1 : 1;
                navigateMatch(element, opts, dir);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeSearch(element, opts);
            }
        });

        // Prev / Next buttons
        const prevBtn = element.querySelector(`.${CSS_PREFIX}-search-prev`);
        const nextBtn = element.querySelector(`.${CSS_PREFIX}-search-next`);
        if (prevBtn) prevBtn.addEventListener('click', () => navigateMatch(element, opts, -1));
        if (nextBtn) nextBtn.addEventListener('click', () => navigateMatch(element, opts, 1));

        // Close button
        const closeBtn = element.querySelector(`.${CSS_PREFIX}-search-close`);
        if (closeBtn) closeBtn.addEventListener('click', () => closeSearch(element, opts));
    }
}

/**
 * Update code highlights and match count without replacing the search bar DOM.
 *
 * This avoids destroying the search input (and losing cursor position / focus)
 * when the user types in the search field.
 *
 * @param {HTMLElement} element - The extension's root DOM element.
 * @param {object} opts - Current render options.
 *
 * @returns {void}
 */
function updateCodeHighlights(element, opts) {
    const { sections, activeIndex, fontSize } = opts;
    const section = sections[activeIndex];
    const sectionScript = section.content;
    const query = element.dataset.qvsSearchQuery || '';

    const tokenizedLines = tokenize(sectionScript);
    let codeHTML = renderTokensToHTML(tokenizedLines, CSS_PREFIX);

    let matches = [];
    const activeMatchIndex = 0;

    if (query) {
        matches = findMatchOffsets(sectionScript, query);
        element.dataset.qvsSearchMatch = '0';

        if (matches.length > 0) {
            codeHTML = highlightMatches(codeHTML, sectionScript, matches, activeMatchIndex);
        }
    }

    // Update only the code element
    const codeEl = element.querySelector(`.${CSS_PREFIX}-code`);
    if (codeEl) {
        codeEl.innerHTML = `<code>${codeHTML}</code>`;
        codeEl.style.fontSize = `${fontSize}px`;
    }

    // Update match count text
    const countEl = element.querySelector(`.${CSS_PREFIX}-search-count`);
    if (countEl) {
        countEl.textContent = query ? `${matches.length > 0 ? 1 : 0} of ${matches.length}` : '';
    }

    // Update prev/next button state
    const prevBtn = element.querySelector(`.${CSS_PREFIX}-search-prev`);
    const nextBtn = element.querySelector(`.${CSS_PREFIX}-search-next`);
    if (prevBtn) prevBtn.disabled = matches.length <= 0;
    if (nextBtn) nextBtn.disabled = matches.length <= 0;

    // Scroll to first match
    if (matches.length > 0) {
        const viewer = element.querySelector(`.${CSS_PREFIX}-viewer`);
        if (viewer) scrollToMatch(viewer, 0);
    }
}

/**
 * Navigate to the next or previous search match.
 *
 * @param {HTMLElement} element - The extension's root DOM element.
 * @param {object} opts - Current render options (passed to renderSection).
 * @param {number} direction - +1 for next, -1 for previous.
 *
 * @returns {void}
 */
function navigateMatch(element, opts, direction) {
    const query = element.dataset.qvsSearchQuery || '';
    if (!query) return;

    const section = opts.sections[opts.activeIndex];
    const total = findMatchOffsets(section.content, query).length;
    if (total === 0) return;

    const current = parseInt(element.dataset.qvsSearchMatch || '0', 10);
    const next = (current + direction + total) % total;
    element.dataset.qvsSearchMatch = String(next);
    renderSection(element, opts);
}

/**
 * Close the search bar and clear highlights.
 *
 * @param {HTMLElement} element - The extension's root DOM element.
 * @param {object} opts - Current render options (passed to renderSection).
 *
 * @returns {void}
 */
function closeSearch(element, opts) {
    element.dataset.qvsSearchOpen = '0';
    element.dataset.qvsSearchQuery = '';
    element.dataset.qvsSearchMatch = '0';
    renderSection(element, opts);

    // Return focus to the container for future keyboard shortcuts
    const container = element.querySelector(`.${CSS_PREFIX}-container`);
    if (container) container.focus();
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

/**
 * Escape HTML special characters for safe rendering.
 *
 * @param {string} text - Raw text to escape.
 *
 * @returns {string} HTML-escaped text.
 */
function escapeHTML(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Fold state helpers ──

/**
 * Parse fold state from a dataset string into a Set of collapsed startLine numbers.
 *
 * @param {string} [raw] - Comma-separated startLine numbers, or empty/undefined.
 *
 * @returns {Set<number>} Set of collapsed startLine indices.
 */
function parseFoldState(raw) {
    if (!raw) return new Set();
    return new Set(
        raw
            .split(',')
            .map(Number)
            .filter((n) => !Number.isNaN(n))
    );
}

/**
 * Save fold state to element dataset as a comma-separated string.
 *
 * @param {HTMLElement} element - The extension's root DOM element.
 * @param {Set<number>} foldState - Set of collapsed startLine indices.
 *
 * @returns {void}
 */
function saveFoldState(element, foldState) {
    element.dataset.qvsFoldState = Array.from(foldState).join(',');
}

/**
 * Process per-line code HTML to hide collapsed lines and inject fold placeholders.
 *
 * Walks the per-line `<div>` elements and adds a hidden class to lines inside
 * collapsed ranges, then inserts a clickable placeholder after the fold start line.
 *
 * @param {string} codeHTML - Per-line div HTML from renderTokensToHTML.
 * @param {Map<number, import('../syntax/fold-detector.js').FoldRange>} foldMap - Fold ranges by startLine.
 * @param {Set<number>} foldState - Set of collapsed startLine indices.
 * @param {Set<number>} hiddenLines - Set of hidden line indices.
 *
 * @returns {string} Modified HTML with hidden lines and placeholders.
 */
function injectFoldPlaceholders(codeHTML, foldMap, foldState, hiddenLines) {
    // Collect all per-line div start positions first, then slice between them.
    const lineRegex = new RegExp(`<div class="${CSS_PREFIX}-line"(?: [^>]*)?>`, 'g');
    const starts = [];
    let m;
    while ((m = lineRegex.exec(codeHTML)) !== null) {
        starts.push(m.index);
    }
    if (starts.length === 0) return codeHTML;

    const parts = [];
    for (let i = 0; i < starts.length; i++) {
        const divEnd = i + 1 < starts.length ? starts[i + 1] : codeHTML.length;
        const lineHTML = codeHTML.substring(starts[i], divEnd);

        if (hiddenLines.has(i)) {
            // Add hidden class to this line's div
            parts.push(
                lineHTML.replace(
                    `${CSS_PREFIX}-line`,
                    `${CSS_PREFIX}-line ${CSS_PREFIX}-line-hidden`
                )
            );
        } else {
            parts.push(lineHTML);
        }

        // After a fold start line, insert the placeholder
        if (foldState.has(i) && foldMap.has(i)) {
            const range = foldMap.get(i);
            const count = range.endLine - range.startLine;
            parts.push(
                `<div class="${CSS_PREFIX}-fold-placeholder" data-fold-start="${i}">` +
                    `<span class="${CSS_PREFIX}-fold-placeholder-text">\u2026 ${count} lines collapsed (${escapeHTML(range.label)})</span>` +
                    `</div>`
            );
        }
    }

    return parts.join('');
}

/**
 * Auto-expand collapsed folds that contain search matches.
 *
 * @param {{ start: number, end: number }[]} matches - Match offsets in plain text.
 * @param {string} sectionScript - Plain text of the section.
 * @param {Map<number, import('../syntax/fold-detector.js').FoldRange>} foldMap - Fold ranges by startLine.
 * @param {Set<number>} foldState - Mutable set of collapsed startLine indices.
 * @param {Set<number>} hiddenLines - Mutable set of hidden line indices.
 *
 * @returns {void}
 */
function autoExpandForMatches(matches, sectionScript, foldMap, foldState, hiddenLines) {
    // Determine which lines contain matches
    const lines = sectionScript.split('\n');
    let charOffset = 0;
    const lineStarts = [];
    for (let i = 0; i < lines.length; i++) {
        lineStarts.push(charOffset);
        charOffset += lines[i].length + 1; // +1 for \n
    }

    const matchLines = new Set();
    for (const m of matches) {
        // Find which line this match starts on
        for (let i = lineStarts.length - 1; i >= 0; i--) {
            if (m.start >= lineStarts[i]) {
                matchLines.add(i);
                break;
            }
        }
    }

    // Expand folds containing match lines
    for (const [startLine, range] of foldMap) {
        if (!foldState.has(startLine)) continue;

        for (let i = startLine + 1; i <= range.endLine; i++) {
            if (matchLines.has(i)) {
                foldState.delete(startLine);
                // Remove hidden lines for this range
                for (let j = startLine + 1; j <= range.endLine; j++) {
                    hiddenLines.delete(j);
                }
                break;
            }
        }
    }
}
