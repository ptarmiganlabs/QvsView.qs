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

/** Delay (ms) before closing the dropdown on blur — allows click events on options to fire. */
const DROPDOWN_BLUR_DELAY_MS = 150;

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
 * @param {number[]|null} [matchCounts] - Optional per-tab match counts for search indicators.
 *
 * @returns {string} HTML string for the tab bar.
 */
function buildTabBar(sections, activeIndex, matchCounts = null) {
    const tabs = sections
        .map((s, i) => {
            const count = matchCounts ? matchCounts[i] : 0;
            const indicator =
                count > 0 ? ` <span class="${CSS_PREFIX}-tab-match-count">${count}</span>` : '';
            return `<button class="${CSS_PREFIX}-tab${i === activeIndex ? ` ${CSS_PREFIX}-tab-active` : ''}" data-section-index="${i}">${escapeHTML(s.name)}${indicator}</button>`;
        })
        .join('');

    return `<div class="${CSS_PREFIX}-tab-bar">${tabs}</div>`;
}

/**
 * Build a live DOM element for the tab bar, ready to insert into the document.
 *
 * @param {import('../sections.js').ScriptSection[]} sections - All script sections.
 * @param {number} activeIndex - Index of the active section.
 * @param {number[]|null} matchCounts - Per-tab match counts (null = no indicators).
 *
 * @returns {Element} The tab-bar `<div>` DOM element.
 */
function createTabBarElement(sections, activeIndex, matchCounts) {
    const tmp = document.createElement('div');
    // Safe: buildTabBar escapes all user-supplied text (section names) via escapeHTML.
    tmp.innerHTML = buildTabBar(sections, activeIndex, matchCounts);
    return tmp.firstElementChild;
}

/**
 * Attach click handlers to all tab buttons inside the element.
 *
 * Reads the current search query from `element.dataset` at click-time so the
 * handler is always in sync even if called after a tab-bar replacement.
 *
 * @param {HTMLElement} element - The extension's root DOM element.
 * @param {number} activeIndex - Index of the currently displayed section.
 * @param {object} opts - Current render options passed to renderSection.
 *   Expected properties: sections, activeIndex, lineNumbers, wrapLines,
 *   fontSize, showCopyButton, showFontSizeDropdown, showSearch, showAiAnalysis.
 * @param {import('../sections.js').ScriptSection[]} sections - All script sections.
 *
 * @returns {void}
 */
function attachTabClickHandlers(element, activeIndex, opts, sections) {
    element.querySelectorAll(`.${CSS_PREFIX}-tab`).forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.dataset.sectionIndex, 10);
            if (idx === activeIndex) return;

            // If search is active, preserve the global match index by jumping to
            // the first match in the clicked section (or the overall first match).
            const query = element.dataset.qvsSearchQuery || '';
            if (query) {
                // Recompute global matches at click-time (query may have changed since render)
                const allMatches = findAllMatches(sections, query);
                const firstInSection = allMatches.findIndex((m) => m.sectionIndex === idx);
                element.dataset.qvsSearchMatch = String(firstInSection >= 0 ? firstInSection : 0);
            } else {
                element.dataset.qvsSearchMatch = '0';
            }
            element.dataset.qvsFoldState = '';
            renderSection(element, { ...opts, activeIndex: idx });
        });
    });
}

/**
 * Find all search matches across all sections in order.
 *
 * Returns a flat array where matches in section 0 come first, followed by
 * section 1, and so on. This enables global prev/next navigation across tabs.
 *
 * @param {import('../sections.js').ScriptSection[]} sections - All script sections.
 * @param {string} query - Search string (case-insensitive).
 *
 * @returns {{ sectionIndex: number, start: number, end: number }[]} All matches across sections.
 */
function findAllMatches(sections, query) {
    if (!query) return [];
    const all = [];
    for (let i = 0; i < sections.length; i++) {
        const offsets = findMatchOffsets(sections[i].content, query);
        for (const m of offsets) {
            all.push({ sectionIndex: i, start: m.start, end: m.end });
        }
    }
    return all;
}

/**
 * Build the toolbar HTML (optional search bar + font size dropdown + copy button + AI analyze).
 *
 * @param {object} toolbarOpts - Toolbar display options.
 * @param {boolean} toolbarOpts.showCopyButton - Whether to show the copy button.
 * @param {boolean} toolbarOpts.showFontSizeDropdown - Whether to show the font size dropdown.
 * @param {number} toolbarOpts.fontSize - Current font size value.
 * @param {string} [toolbarOpts.searchHTML] - Pre-built search bar HTML to include.
 * @param {boolean} [toolbarOpts.showAiAnalysis] - Whether to show the AI Analyze button.
 *
 * @returns {string} HTML string for the toolbar.
 */
function buildToolbar(toolbarOpts) {
    const {
        showCopyButton = true,
        showFontSizeDropdown = false,
        fontSize = 13,
        searchHTML = '',
        showAiAnalysis = false,
    } = toolbarOpts;

    const sizes = [10, 11, 12, 13, 14, 16, 18, 20];
    const fontSizeHTML = showFontSizeDropdown
        ? `<select class="${CSS_PREFIX}-fontsize-select" title="Font size">${sizes.map((s) => `<option value="${s}"${s === fontSize ? ' selected' : ''}>${s}px</option>`).join('')}</select>`
        : '';

    const copyHTML = showCopyButton
        ? `<button class="${CSS_PREFIX}-copy-btn" title="Copy to clipboard">&#128203; Copy</button>`
        : '';

    const aiHTML = showAiAnalysis
        ? `<button class="${CSS_PREFIX}-ai-analyze-btn" title="AI Script Analysis">🤖 Analyze</button>`
        : '';

    return `<div class="${CSS_PREFIX}-toolbar">
        ${searchHTML}
        ${fontSizeHTML}
        ${copyHTML}
        ${aiHTML}
    </div>`;
}

/**
 * Build HTML for the selector bar — a 2nd toolbar row containing the
 * script source searchable dropdown.
 *
 * @param {string[]} values - Available values to display in the dropdown.
 * @param {string|null} selectedValue - Currently selected value, or null.
 *
 * @returns {string} HTML string for the selector bar row.
 */
function buildSelectorBar(values, selectedValue) {
    return `<div class="${CSS_PREFIX}-selector-bar">
        <span class="${CSS_PREFIX}-selector-label">Script source:</span>
        ${buildAppSelectorHTML(values, selectedValue)}
    </div>`;
}

/**
 * Build HTML for the searchable script source dropdown.
 *
 * @param {string[]} values - Available values to choose from.
 * @param {string|null} selectedValue - Currently selected value, or null.
 *
 * @returns {string} HTML string for the dropdown widget.
 */
function buildAppSelectorHTML(values, selectedValue) {
    const displayText = selectedValue || '';
    const placeholder = selectedValue ? '' : 'Select script source\u2026';
    const clearBtnStyle = selectedValue ? '' : ' style="display:none"';

    const optionItems = values
        .map(
            (v) =>
                // escapeAttr for the data-value attribute context; escapeHTML for text content
                `<div class="${CSS_PREFIX}-appselector-option${v === selectedValue ? ` ${CSS_PREFIX}-appselector-option-selected` : ''}" data-value="${escapeAttr(v)}">${escapeHTML(v)}</div>`
        )
        .join('');

    return `<div class="${CSS_PREFIX}-appselector">
        <div class="${CSS_PREFIX}-appselector-input-wrap">
            <input class="${CSS_PREFIX}-appselector-input" type="text"
                   placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(displayText)}"
                   spellcheck="false" autocomplete="off"
                   title="Script source selection" />
            <button class="${CSS_PREFIX}-appselector-clear" title="Clear selection"${clearBtnStyle}>&#10005;</button>
        </div>
        <div class="${CSS_PREFIX}-appselector-dropdown" style="display:none">
            ${optionItems}
        </div>
    </div>`;
}

/**
 * Escape an HTML attribute value for safe embedding.
 *
 * @param {string} text - Raw text to escape.
 *
 * @returns {string} Escaped text safe for HTML attributes.
 */
function escapeAttr(text) {
    return (text || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Attach event listeners for the script source selection dropdown.
 *
 * Handles text-input filtering, option click selection, clear button,
 * keyboard navigation (Enter / Escape), and outside-click dismissal.
 *
 * @param {HTMLElement} element - The extension's root DOM element.
 * @param {object} opts - Current render options.
 *
 * @returns {void}
 */
function attachAppSelectorListeners(element, opts) {
    const wrapper = element.querySelector(`.${CSS_PREFIX}-appselector`);
    if (!wrapper) return;

    const input = wrapper.querySelector(`.${CSS_PREFIX}-appselector-input`);
    const dropdown = wrapper.querySelector(`.${CSS_PREFIX}-appselector-dropdown`);
    const clearBtn = wrapper.querySelector(`.${CSS_PREFIX}-appselector-clear`);
    if (!input || !dropdown) return;

    const allOptions = dropdown.querySelectorAll(`.${CSS_PREFIX}-appselector-option`);

    /**
     * Show/hide dropdown options based on the current filter text.
     *
     * @param {string} filter - Filter text (case-insensitive).
     */
    function filterOptions(filter) {
        const lowerFilter = filter.toLowerCase();
        let anyVisible = false;
        allOptions.forEach((opt) => {
            const text = opt.dataset.value || '';
            const match = !lowerFilter || text.toLowerCase().includes(lowerFilter);
            opt.style.display = match ? '' : 'none';
            if (match) anyVisible = true;
        });
        dropdown.style.display = anyVisible ? '' : 'none';
    }

    // Show matching options on focus; `filterOptions()` also controls dropdown visibility.
    input.addEventListener('focus', () => {
        filterOptions(input.value);
    });

    // Real-time filtering as the user types
    input.addEventListener('input', () => {
        filterOptions(input.value);
        if (clearBtn) {
            // Keep ✕ visible if a selection is active so users can clear it even after
            // manually erasing the input text (otherwise the field selection would be
            // stuck with no in-widget way to cancel it).
            clearBtn.style.display = input.value || opts.selectedApp ? '' : 'none';
        }
    });

    // Keyboard: Enter selects first visible option, Escape closes
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            dropdown.style.display = 'none';
            input.blur();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            // allOptions is a static NodeList (querySelectorAll); search it via Array helpers
            const firstVisible = Array.prototype.find.call(
                allOptions,
                (opt) => opt.style.display !== 'none'
            );
            if (firstVisible) {
                const value = firstVisible.dataset.value;
                input.value = value;
                dropdown.style.display = 'none';
                if (typeof opts.onAppSelect === 'function') {
                    opts.onAppSelect(value);
                }
            }
        }
    });

    // Option click handler
    allOptions.forEach((opt) => {
        opt.addEventListener('click', () => {
            const value = opt.dataset.value;
            input.value = value;
            dropdown.style.display = 'none';
            if (typeof opts.onAppSelect === 'function') {
                opts.onAppSelect(value);
            }
        });
    });

    // Clear button
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            input.value = '';
            clearBtn.style.display = 'none';
            dropdown.style.display = 'none';
            if (typeof opts.onAppSelect === 'function') {
                opts.onAppSelect(null);
            }
        });
    }

    // Close dropdown when focus leaves the widget
    wrapper.addEventListener('focusout', () => {
        setTimeout(() => {
            if (!wrapper.contains(document.activeElement)) {
                dropdown.style.display = 'none';
            }
        }, DROPDOWN_BLUR_DELAY_MS);
    });

    // Also close on mousedown outside (for non-focusable area clicks)
    /**
     * Close the dropdown when clicking outside the selector widget.
     *
     * @param {MouseEvent} evt - The mousedown event.
     */
    const onOutsideClick = (evt) => {
        if (!wrapper.contains(evt.target)) {
            dropdown.style.display = 'none';
        }
    };
    document.addEventListener('mousedown', onOutsideClick);

    // Remove the document listener when the wrapper is detached (innerHTML replaced on re-render).
    // Observe the stable root element so subtree replacement is detected even when the entire
    // selector bar is removed without mutating its own childList.
    const observer = new MutationObserver(() => {
        if (!document.contains(wrapper)) {
            document.removeEventListener('mousedown', onOutsideClick);
            observer.disconnect();
        }
    });
    observer.observe(element, { childList: true, subtree: true });
}

/**
 * Render the script viewer into the given DOM element.
 *
 * Supports section tabs (split on `///$tab` markers), a copy-to-clipboard
 * button, optional line numbers, word wrap, and an optional script source
 * selection dropdown shown as a 2nd toolbar row.
 *
 * @param {HTMLElement} element - The extension's root DOM element.
 * @param {object} options - Rendering options.
 * @param {string} options.script - The full script text to display.
 * @param {boolean} [options.showLineNumbers] - Whether to show line numbers.
 * @param {boolean} [options.wordWrap] - Whether to wrap long lines.
 * @param {number} [options.fontSize] - Font size in pixels.
 * @param {boolean} [options.enableFolding] - Whether code folding is enabled.
 * @param {boolean} [options.showCopyButton] - Whether to show the copy button.
 * @param {boolean} [options.showFontSizeDropdown] - Whether to show the font size dropdown.
 * @param {boolean} [options.showSearch] - Whether the search bar is always visible.
 * @param {boolean} [options.showAppSelector] - Whether to show the script source selector bar.
 * @param {string[]} [options.selectorValues] - Available values for the selector dropdown.
 * @param {string|null} [options.selectedApp] - Currently selected value, or null.
 * @param {((value: string|null) => void)|null} [options.onAppSelect] - Callback when a value is selected or cleared.
 * @param {boolean} [options.showAiAnalysis] - Whether to show the AI Analyze button.
 * @param {object|null} [options.aiConfig] - AI configuration.
 * @param {((info: object) => void)|null} [options.onAiAnalyze] - Callback for AI Analyze button.
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
        showSearch = false,
        showAppSelector = false,
        selectorValues = [],
        selectedApp = null,
        onAppSelect = null,
        showAiAnalysis = false,
        aiConfig = null,
        onAiAnalyze = null,
    } = options;

    const sections = parseSections(script);

    // Preserve active tab across re-renders if possible
    const prevIndex = parseInt(element.dataset.qvsActiveSection || '0', 10);
    const activeIndex = prevIndex < sections.length ? prevIndex : 0;

    // When showSearch is enabled via property panel, auto-open the search bar
    if (showSearch) {
        element.dataset.qvsSearchOpen = '1';
    }

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
        showSearch,
        showAppSelector,
        selectorValues,
        selectedApp,
        onAppSelect,
        showAiAnalysis,
        aiConfig,
        onAiAnalyze,
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
 * @param {boolean} [opts.showAppSelector] - Whether to show the script source selector bar.
 * @param {string[]} [opts.selectorValues] - Available values for the selector dropdown.
 * @param {string|null} [opts.selectedApp] - Currently selected value, or null.
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
        showSearch,
        showAppSelector = false,
        selectorValues = [],
        selectedApp = null,
        showAiAnalysis,
        aiConfig,
    } = opts;

    const section = sections[activeIndex];
    const sectionScript = section.content;

    const tokenizedLines = tokenize(sectionScript);
    const codeHTML = renderTokensToHTML(tokenizedLines, CSS_PREFIX);
    const lineCount = tokenizedLines.length;
    const lineOffset = 0; // each section starts line-numbering at 1

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
    // Compute global matches once — shared by tab bar indicators, count display, and navigation.
    const searchQuery = element.dataset.qvsSearchQuery || '';
    const searchActive = element.dataset.qvsSearchOpen === '1';
    const globalMatches = searchActive && searchQuery ? findAllMatches(sections, searchQuery) : [];
    const totalMatches = globalMatches.length;

    let matches = []; // section-local matches for highlighting
    let sectionLocalActive = -1; // section-local index of the active match (-1 = none)
    let globalActiveIndex = 0;
    let matchCountsPerTab = null; // per-tab match counts for tab indicator badges

    if (searchActive && searchQuery) {
        const rawMatch = parseInt(element.dataset.qvsSearchMatch || '0', 10);
        globalActiveIndex = totalMatches > 0 ? rawMatch % totalMatches : 0;
        element.dataset.qvsSearchMatch = String(globalActiveIndex);

        // Build per-tab match counts for tab bar indicators
        matchCountsPerTab = new Array(sections.length).fill(0);
        for (const m of globalMatches) {
            matchCountsPerTab[m.sectionIndex]++;
        }

        // Get section-local matches and compute which one is active
        matches = findMatchOffsets(sectionScript, searchQuery);

        if (matches.length > 0) {
            // Count how many global matches come before this section (reuse globalMatches)
            const priorCount = globalMatches.filter((m) => m.sectionIndex < activeIndex).length;

            // Active match is in this section when the global active is within our range
            if (totalMatches > 0 && globalMatches[globalActiveIndex].sectionIndex === activeIndex) {
                sectionLocalActive = globalActiveIndex - priorCount;
            }

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
                sectionLocalActive
            );
        }
    }

    // ── Save scroll position before re-render ──
    const prevViewer = element.querySelector(`.${CSS_PREFIX}-viewer`);
    const savedScrollTop = prevViewer ? prevViewer.scrollTop : 0;

    element.dataset.qvsActiveSection = String(activeIndex);

    const searchHTML = searchActive
        ? buildSearchBar(searchQuery, globalActiveIndex, totalMatches, showSearch)
        : '';

    element.innerHTML = `
        <div class="${CSS_PREFIX}-container" tabindex="0">
            <div class="${CSS_PREFIX}-header">
                <div class="${CSS_PREFIX}-header-row">
                    ${buildTabBar(sections, activeIndex, matchCountsPerTab)}
                    ${buildToolbar({ showCopyButton, showFontSizeDropdown, fontSize, searchHTML, showAiAnalysis })}
                </div>
                ${showAppSelector ? buildSelectorBar(selectorValues, selectedApp) : ''}
            </div>
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
    if (searchActive && matches.length > 0 && sectionLocalActive >= 0) {
        if (viewer) scrollToMatch(viewer, sectionLocalActive);
    }

    // ── Attach event listeners ──

    // Tab click handler
    attachTabClickHandlers(element, activeIndex, opts, sections);

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

    // AI Analyze button handler
    const aiBtn = element.querySelector(`.${CSS_PREFIX}-ai-analyze-btn`);
    if (aiBtn && aiConfig) {
        aiBtn.addEventListener('click', () => {
            if (typeof opts.onAiAnalyze === 'function') {
                opts.onAiAnalyze({
                    sectionScript,
                    fullScript,
                    sectionCount: opts.sections.length,
                    activeSectionName: section.name,
                    containerEl: element,
                });
            }
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

    // App selector event listeners
    if (showAppSelector) {
        attachAppSelectorListeners(element, opts);
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
        // Focus the input.  Place the caret at the end of any pre-filled text so
        // that a programmatic focus after a tab-switch does not select-all the
        // query (which would cause the next keystroke to erase it).
        searchInput.focus();
        const inputLen = searchInput.value.length;
        searchInput.setSelectionRange(inputLen, inputLen);

        // Live search on input — update highlights without replacing search bar
        let debounceTimer = null;
        const clearBtn2 = element.querySelector(`.${CSS_PREFIX}-search-clear`);
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            if (clearBtn2) {
                clearBtn2.style.display = searchInput.value ? '' : 'none';
            }
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

        // Clear button inside input
        const clearBtn = element.querySelector(`.${CSS_PREFIX}-search-clear`);
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                searchInput.value = '';
                element.dataset.qvsSearchQuery = '';
                element.dataset.qvsSearchMatch = '0';
                clearBtn.style.display = 'none';
                updateCodeHighlights(element, opts);
                searchInput.focus();
            });
        }

        // Close button
        const closeBtn = element.querySelector(`.${CSS_PREFIX}-search-close`);
        if (closeBtn) closeBtn.addEventListener('click', () => closeSearch(element, opts));
    }
}

/**
 * Update code highlights and match count without replacing the search bar DOM.
 *
 * This avoids destroying the search input (and losing cursor position / focus)
 * when the user types in the search field. When the first match is on a
 * different tab, a full re-render is triggered to switch to that tab.
 *
 * @param {HTMLElement} element - The extension's root DOM element.
 * @param {object} opts - Current render options.
 *
 * @returns {void}
 */
function updateCodeHighlights(element, opts) {
    const { sections, fontSize, activeIndex } = opts;
    const query = element.dataset.qvsSearchQuery || '';

    // Compute global matches across all sections
    const globalMatches = findAllMatches(sections, query);
    element.dataset.qvsSearchMatch = '0';
    const totalMatches = globalMatches.length;

    // If the first match is on a different tab, do a full re-render to switch tabs
    if (totalMatches > 0 && globalMatches[0].sectionIndex !== activeIndex) {
        element.dataset.qvsFoldState = '';
        renderSection(element, { ...opts, activeIndex: globalMatches[0].sectionIndex });
        return;
    }

    const section = sections[activeIndex];
    const sectionScript = section.content;

    const tokenizedLines = tokenize(sectionScript);
    let codeHTML = renderTokensToHTML(tokenizedLines, CSS_PREFIX);

    const sectionMatches = query ? findMatchOffsets(sectionScript, query) : [];

    if (sectionMatches.length > 0) {
        codeHTML = highlightMatches(codeHTML, sectionScript, sectionMatches, 0);
    }

    // Update only the code element
    const codeEl = element.querySelector(`.${CSS_PREFIX}-code`);
    if (codeEl) {
        codeEl.innerHTML = `<code>${codeHTML}</code>`;
        codeEl.style.fontSize = `${fontSize}px`;
    }

    // Update match count text (global count across all tabs)
    const countEl = element.querySelector(`.${CSS_PREFIX}-search-count`);
    if (countEl) {
        countEl.textContent = query ? `${totalMatches > 0 ? 1 : 0} of ${totalMatches}` : '';
    }

    // Update prev/next button state
    const prevBtn = element.querySelector(`.${CSS_PREFIX}-search-prev`);
    const nextBtn = element.querySelector(`.${CSS_PREFIX}-search-next`);
    if (prevBtn) prevBtn.disabled = totalMatches <= 0;
    if (nextBtn) nextBtn.disabled = totalMatches <= 0;

    // Update tab bar — rebuild per-tab match counts and replace tab bar HTML in-place
    const tabBar = element.querySelector(`.${CSS_PREFIX}-tab-bar`);
    if (tabBar) {
        const matchCountsPerTab = new Array(opts.sections.length).fill(0);
        for (const m of globalMatches) {
            matchCountsPerTab[m.sectionIndex]++;
        }
        const newTabBar = createTabBarElement(opts.sections, activeIndex, matchCountsPerTab);
        tabBar.parentElement.replaceChild(newTabBar, tabBar);
        // Re-attach tab click handlers on the freshly replaced tab bar
        attachTabClickHandlers(element, activeIndex, opts, opts.sections);
    }

    // Scroll to first match
    if (sectionMatches.length > 0) {
        const viewer = element.querySelector(`.${CSS_PREFIX}-viewer`);
        if (viewer) scrollToMatch(viewer, 0);
    }
}

/**
 * Navigate to the next or previous search match across all sections.
 *
 * Switches the active tab when the target match is in a different section.
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

    const globalMatches = findAllMatches(opts.sections, query);
    if (globalMatches.length === 0) return;

    const current = parseInt(element.dataset.qvsSearchMatch || '0', 10);
    const next = (current + direction + globalMatches.length) % globalMatches.length;
    element.dataset.qvsSearchMatch = String(next);

    const targetSection = globalMatches[next].sectionIndex;
    if (targetSection !== opts.activeIndex) {
        // Switch to the section containing the next match
        element.dataset.qvsFoldState = '';
        renderSection(element, { ...opts, activeIndex: targetSection });
    } else {
        renderSection(element, opts);
    }
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
    // If showSearch is on via property panel, keep the bar visible but clear the query
    if (opts.showSearch) {
        element.dataset.qvsSearchQuery = '';
        element.dataset.qvsSearchMatch = '0';
        renderSection(element, opts);
        const input = element.querySelector(`.${CSS_PREFIX}-search-input`);
        if (input) input.focus();
        return;
    }
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
export function renderPlaceholder(element, message = 'Add both dimensions to view scripts') {
    element.innerHTML = `
        <div class="${CSS_PREFIX}-placeholder">
            <div class="${CSS_PREFIX}-placeholder-icon">&#60;/&#62;</div>
            <div class="${CSS_PREFIX}-placeholder-text">${message}</div>
        </div>
    `;
}

/**
 * Render a loading state while script data is being fetched from the engine.
 *
 * Visually distinct from the placeholder (pulsing opacity) so the user knows
 * data is in-flight rather than the extension being unconfigured.
 *
 * @param {HTMLElement} element - The extension's root DOM element.
 *
 * @returns {void}
 */
export function renderLoading(element) {
    element.innerHTML = `
        <div class="${CSS_PREFIX}-placeholder ${CSS_PREFIX}-loading">
            <div class="${CSS_PREFIX}-placeholder-icon">&#60;/&#62;</div>
            <div class="${CSS_PREFIX}-placeholder-text">Loading script\u2026</div>
        </div>
    `;
}

/**
 * Render a warning when multiple script sources are detected.
 *
 * Shows an amber-tinted warning with the list of detected sources so the
 * user knows they need to filter to a single script before viewing.
 *
 * @param {HTMLElement} element - The extension's root DOM element.
 * @param {string} message - Warning message to display.
 * @param {string[]} identifiers - List of distinct source identifiers.
 *
 * @returns {void}
 */
export function renderWarning(element, message, identifiers) {
    const ids = identifiers || [];
    const MAX_SHOWN = 5;
    const shown = ids.slice(0, MAX_SHOWN);
    const remaining = ids.length - shown.length;

    const listItems = shown.map((id) => `<li>${escapeHTML(id)}</li>`).join('');
    const moreText =
        remaining > 0
            ? `<li class="${CSS_PREFIX}-warning-more">…and ${remaining} more script${remaining === 1 ? '' : 's'} selected</li>`
            : '';

    element.innerHTML = `
        <div class="${CSS_PREFIX}-warning">
            <div class="${CSS_PREFIX}-warning-icon">&#9888;</div>
            <div class="${CSS_PREFIX}-warning-text">${escapeHTML(message)}</div>
            <ul class="${CSS_PREFIX}-warning-list">${listItems}${moreText}</ul>
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
