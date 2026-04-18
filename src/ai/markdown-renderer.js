/**
 * Lightweight Markdown-to-HTML converter with DOMPurify sanitization.
 *
 * Converts a subset of Markdown to HTML:
 * - Headings (h1–h6)
 * - Bold, italic, inline code
 * - Code blocks (fenced with ```)
 * - Unordered and ordered lists
 * - Blockquotes
 * - Tables (pipe-delimited with header separator)
 * - Links
 * - Horizontal rules
 * - Paragraphs
 *
 * Mermaid code blocks (```mermaid) are converted to `<pre class="mermaid">` for
 * post-render initialization by mermaid-init.js.
 */

import DOMPurify from 'dompurify';

/**
 * Convert a Markdown string to sanitized HTML.
 *
 * @param {string} md - Raw Markdown text.
 *
 * @returns {string} Sanitized HTML string.
 */
export function renderMarkdown(md) {
    if (!md) return '';

    const html = convertMarkdown(md);

    return DOMPurify.sanitize(html, {
        ADD_TAGS: ['pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
        ADD_ATTR: ['class', 'data-graph'],
    });
}

/**
 * Internal Markdown-to-HTML conversion.
 *
 * Processes lines sequentially, handling fenced code blocks as a special state.
 *
 * @param {string} md - Raw Markdown text.
 *
 * @returns {string} Unsanitized HTML string.
 */
function convertMarkdown(md) {
    const lines = md.split('\n');
    const out = [];

    let inCodeBlock = false;
    let codeLang = '';
    let codeLines = [];

    let inList = false;
    let listType = '';

    let inTable = false;
    let tableHeaderDone = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // ── Fenced code blocks ──
        if (line.trimStart().startsWith('```')) {
            if (!inCodeBlock) {
                closeList();
                inCodeBlock = true;
                codeLang = line.trimStart().slice(3).trim();
                codeLines = [];
            } else {
                // Auto-detect Mermaid even without explicit ```mermaid fence
                const effectiveLang = codeLang || detectMermaid(codeLines);
                if (effectiveLang === 'mermaid') {
                    // Store raw source as URI-encoded data attribute to bypass DOMPurify
                    const encoded = encodeURIComponent(codeLines.join('\n'));
                    out.push(`<pre class="mermaid" data-graph="${encoded}"></pre>`);
                } else {
                    const langAttr = effectiveLang
                        ? ` data-lang="${escapeHtml(effectiveLang)}"`
                        : '';
                    out.push(
                        `<pre><code${langAttr}>${escapeHtml(codeLines.join('\n'))}</code></pre>`
                    );
                }
                inCodeBlock = false;
                codeLang = '';
                codeLines = [];
            }
            continue;
        }

        if (inCodeBlock) {
            codeLines.push(line);
            continue;
        }

        // ── Blank line ──
        if (line.trim() === '') {
            closeTable();
            // Don't close list on blank lines — only close on heading/rule/other block content
            if (!inList) {
                out.push('');
            }
            continue;
        }

        // ── Headings ──
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            closeList();
            const level = headingMatch[1].length;
            out.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
            continue;
        }

        // ── Horizontal rule ──
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
            closeList();
            out.push('<hr>');
            continue;
        }

        // ── Blockquote ──
        if (line.trimStart().startsWith('> ')) {
            closeList();
            out.push(`<blockquote>${inlineFormat(line.replace(/^>\s?/, ''))}</blockquote>`);
            continue;
        }

        // ── Ordered list ── (check before unordered to handle nested bullets in OL)
        const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
        if (olMatch) {
            if (!inList || listType !== 'ol') {
                closeList();
                inList = true;
                listType = 'ol';
                out.push('<ol>');
            }
            out.push(`<li>${inlineFormat(olMatch[2])}</li>`);
            continue;
        }

        // ── Unordered list (or nested bullet inside OL) ──
        const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
        if (ulMatch) {
            if (inList && listType === 'ol') {
                // Nested bullet inside an ordered list item — append to last <li>
                appendToLastLi(inlineFormat(ulMatch[2]));
                continue;
            }
            if (!inList || listType !== 'ul') {
                closeList();
                inList = true;
                listType = 'ul';
                out.push('<ul>');
            }
            out.push(`<li>${inlineFormat(ulMatch[2])}</li>`);
            continue;
        }

        // ── Indented continuation inside a list ──
        if (inList && line.match(/^\s{2,}/)) {
            appendToLastLi(inlineFormat(line.trim()));
            continue;
        }

        // ── Table rows ──
        if (isTableRow(line)) {
            if (inTable) {
                // Separator line (e.g. |---|---|) — skip, header already emitted
                if (isTableSeparator(line)) {
                    continue;
                }
                // Body row
                out.push(buildTableRow(line, 'td'));
                continue;
            }
            // Potential table start — peek ahead for separator line
            if (i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
                closeList();
                closeTable();
                inTable = true;
                tableHeaderDone = false;
                out.push('<table>');
                out.push('<thead>');
                out.push(buildTableRow(line, 'th'));
                out.push('</thead>');
                out.push('<tbody>');
                tableHeaderDone = true;
                continue;
            }
        }

        // Close table if we hit a non-table line
        closeTable();

        // ── Paragraph ──
        closeList();
        out.push(`<p>${inlineFormat(line)}</p>`);
    }

    // Close any open blocks
    closeList();
    closeTable();
    if (inCodeBlock) {
        out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    }

    return out.join('\n');

    /** Close an open list if any. */
    function closeList() {
        if (inList) {
            out.push(listType === 'ul' ? '</ul>' : '</ol>');
            inList = false;
            listType = '';
        }
    }

    /**
     * Append content to the last list item in the output.
     *
     * @param {string} html - Formatted HTML to append.
     */
    function appendToLastLi(html) {
        for (let j = out.length - 1; j >= 0; j--) {
            if (out[j].includes('</li>')) {
                out[j] = out[j].replace(/<\/li>$/, `<br>${html}</li>`);
                return;
            }
        }
        out.push(`<p>${html}</p>`);
    }

    /** Close an open table if any. */
    function closeTable() {
        if (inTable) {
            if (tableHeaderDone) {
                out.push('</tbody>');
            }
            out.push('</table>');
            inTable = false;
            tableHeaderDone = false;
        }
    }
}

/**
 * Apply inline Markdown formatting.
 *
 * @param {string} text - Line text to format.
 *
 * @returns {string} HTML with inline formatting applied.
 */
function inlineFormat(text) {
    let s = escapeHtml(text);
    // Inline code (must come before bold/italic to avoid conflicts)
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold + italic
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    // Bold
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
}

/**
 * Check if a line looks like a Markdown table row (contains at least one pipe).
 *
 * @param {string} line - Raw line text.
 *
 * @returns {boolean} True if the line is a pipe-delimited row.
 */
function isTableRow(line) {
    const trimmed = line.trim();
    return trimmed.includes('|');
}

/**
 * Check if a line is a table header/body separator (e.g. `|---|---|`).
 *
 * @param {string} line - Raw line text.
 *
 * @returns {boolean} True if the line is a separator row.
 */
function isTableSeparator(line) {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return /^[\s|:-]+$/.test(trimmed) && trimmed.includes('-');
}

/**
 * Parse a pipe-delimited table row into an HTML `<tr>`.
 *
 * @param {string} line - Raw table row text.
 * @param {string} cellTag - 'th' for header cells, 'td' for body cells.
 *
 * @returns {string} HTML string for the table row.
 */
function buildTableRow(line, cellTag) {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    const cells = trimmed.split('|').map((c) => c.trim());
    const cellsHtml = cells.map((c) => `<${cellTag}>${inlineFormat(c)}</${cellTag}>`).join('');
    return `<tr>${cellsHtml}</tr>`;
}

/**
 * Escape HTML special characters.
 *
 * @param {string} str - Raw string.
 *
 * @returns {string} HTML-escaped string.
 */
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Mermaid diagram type keywords that appear at the start of a code block. */
const MERMAID_KEYWORDS =
    /^\s*(graph\s|flowchart\s|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|journey|mindmap|timeline|quadrantChart|sankey)/;

/**
 * Detect if a code block contains Mermaid diagram syntax.
 * Used when the LLM omits the `mermaid` language tag on the fence.
 *
 * @param {string[]} lines - Lines inside the code block.
 *
 * @returns {string} 'mermaid' if detected, empty string otherwise.
 */
function detectMermaid(lines) {
    const firstNonEmpty = lines.find((l) => l.trim().length > 0);
    return firstNonEmpty && MERMAID_KEYWORDS.test(firstNonEmpty) ? 'mermaid' : '';
}
