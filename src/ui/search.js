/**
 * In-viewer search module.
 *
 * Provides a search bar overlay, case-insensitive text matching,
 * highlight injection into syntax-colored HTML, and match navigation.
 */

const CSS_PREFIX = 'qvs';

/**
 * Build the search bar HTML.
 *
 * @param {string} [query] - Current search query (pre-filled).
 * @param {number} [current] - Current match index (0-based).
 * @param {number} [total] - Total match count.
 * @param {boolean} [persistent] - Whether the bar is always visible (hides close button).
 *
 * @returns {string} HTML string for the search bar row.
 */
export function buildSearchBar(query = '', current = 0, total = 0, persistent = false) {
    const countText = query ? `${total > 0 ? current + 1 : 0} of ${total}` : '';
    const closeHTML = persistent
        ? ''
        : `<button class="${CSS_PREFIX}-search-close" title="Close (Escape)">&#10005;</button>`;

    return `<div class="${CSS_PREFIX}-search-bar">
        <span class="${CSS_PREFIX}-search-input-wrap">
            <input class="${CSS_PREFIX}-search-input" type="text" placeholder="Find\u2026"
                   value="${escapeAttr(query)}" spellcheck="false" autocomplete="off" />
            <button class="${CSS_PREFIX}-search-clear" title="Clear"${query ? '' : ' style="display:none"'}>&#10005;</button>
        </span>
        <span class="${CSS_PREFIX}-search-count">${countText}</span>
        <button class="${CSS_PREFIX}-search-prev" title="Previous match (Shift+Enter)"${total <= 0 ? ' disabled' : ''}>&#9650;</button>
        <button class="${CSS_PREFIX}-search-next" title="Next match (Enter)"${total <= 0 ? ' disabled' : ''}>&#9660;</button>
        ${closeHTML}
    </div>`;
}

/**
 * Find all case-insensitive match positions in plain text.
 *
 * @param {string} text - Plain text to search within.
 * @param {string} query - Search string (case-insensitive).
 *
 * @returns {{ start: number, end: number }[]} Array of character offsets.
 */
export function findMatchOffsets(text, query) {
    if (!query) return [];

    const matches = [];
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    let pos = 0;

    while (pos <= lower.length - q.length) {
        const idx = lower.indexOf(q, pos);
        if (idx === -1) break;
        matches.push({ start: idx, end: idx + q.length });
        pos = idx + 1;
    }

    return matches;
}

/**
 * Inject highlight marks into tokenized HTML.
 *
 * Splits existing `<span>` token elements at match boundaries so that
 * syntax coloring is preserved within highlighted regions.
 *
 * @param {string} html - Tokenized HTML from renderTokensToHTML().
 * @param {string} plainText - The corresponding plain text (lines joined with \n).
 * @param {{ start: number, end: number }[]} matches - Match offsets in plainText.
 * @param {number} activeIndex - Index of the currently active match (0-based).
 *
 * @returns {string} HTML with `<mark>` elements injected around matches.
 */
export function highlightMatches(html, plainText, matches, activeIndex) {
    if (!matches.length) return html;

    // Map plain-text char offsets to an array of highlight commands
    // Walk HTML and plain text in parallel, injecting <mark> open/close
    const result = [];
    let plainIdx = 0;
    let matchPtr = 0; // next match to open
    let inMark = false;
    let i = 0;

    while (i < html.length) {
        // Check if we need to open/close a mark at this plain text position
        while (!inMark && matchPtr < matches.length && plainIdx === matches[matchPtr].start) {
            const cls =
                matchPtr === activeIndex
                    ? `${CSS_PREFIX}-match ${CSS_PREFIX}-match-active`
                    : `${CSS_PREFIX}-match`;
            result.push(`<mark class="${cls}" data-match-index="${matchPtr}">`);
            inMark = true;
        }

        if (inMark && matchPtr < matches.length && plainIdx === matches[matchPtr].end) {
            result.push('</mark>');
            inMark = false;
            matchPtr++;
            continue; // re-check for adjacent matches at same position
        }

        // Handle HTML tags — pass through without advancing plain text index
        if (html[i] === '<') {
            const tagEnd = html.indexOf('>', i);
            if (tagEnd !== -1) {
                // If we're inside a mark and hit a closing/opening span, we need
                // to close the mark before the tag and re-open after
                const tag = html.substring(i, tagEnd + 1);
                if (inMark && (tag.startsWith('</') || tag.startsWith('<span'))) {
                    result.push('</mark>');
                    result.push(tag);
                    const cls =
                        matchPtr < matches.length && matchPtr === activeIndex
                            ? `${CSS_PREFIX}-match ${CSS_PREFIX}-match-active`
                            : `${CSS_PREFIX}-match`;
                    result.push(`<mark class="${cls}" data-match-index="${matchPtr}">`);
                } else {
                    result.push(tag);
                }
                i = tagEnd + 1;
                continue;
            }
        }

        // Handle HTML entities — count as one plain text character
        if (html[i] === '&') {
            const semiIdx = html.indexOf(';', i);
            if (semiIdx !== -1 && semiIdx - i < 10) {
                result.push(html.substring(i, semiIdx + 1));
                plainIdx++;
                i = semiIdx + 1;
                continue;
            }
        }

        // Regular character
        result.push(html[i]);
        plainIdx++;
        i++;
    }

    // Close any unclosed mark
    if (inMark) {
        result.push('</mark>');
    }

    return result.join('');
}

/**
 * Scroll the viewer to make the active match visible.
 *
 * When a match starts exactly at a line boundary the injector may produce
 * an empty boundary `<mark>` element (no text content) just before the
 * actual line div.  We skip those and scroll to the first mark element
 * that actually contains text.
 *
 * @param {HTMLElement} container - The `.qvs-viewer` scroll container.
 * @param {number} matchIndex - Index of the match to scroll to.
 *
 * @returns {void}
 */
export function scrollToMatch(container, matchIndex) {
    const marks = container.querySelectorAll(`mark[data-match-index="${matchIndex}"]`);
    if (!marks.length) return;

    // Prefer the first mark that has visible text content; fall back to the first one.
    const mark = Array.from(marks).find((m) => m.textContent !== '') ?? marks[0];

    mark.scrollIntoView({ block: 'center', inline: 'nearest' });
}

/**
 * Escape a string for use in an HTML attribute value.
 *
 * @param {string} str - Raw string.
 *
 * @returns {string} Attribute-safe string.
 */
function escapeAttr(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
