/**
 * Regex-based syntax highlighter for Qlik load scripts.
 *
 * Produces an array of token objects per line, each with a type and text.
 * The tokenizer is stateful across lines to handle multi-line comments and strings.
 *
 * Token types: keyword, function, variable, string, comment, operator, number, normal, field, table, deprecated.
 */

import { ALL_KEYWORDS, ALL_FUNCTIONS, DEPRECATED } from './keywords.js';

/**
 * @typedef {object} Token
 * @property {string} type - Token type (keyword, function, string, comment, variable, operator, number, normal).
 * @property {string} text - The literal text of the token.
 */

/**
 * @typedef {object} TokenizerState
 * @property {boolean} inBlockComment - Currently inside a block comment.
 * @property {boolean} inRemComment - Currently inside a REM comment (extends to ;).
 */

/**
 * Create a fresh tokenizer state.
 *
 * @returns {TokenizerState} Initial state for the tokenizer.
 */
export function createState() {
    return {
        inBlockComment: false,
        inRemComment: false,
    };
}

/**
 * Tokenize a single line of Qlik script.
 *
 * @param {string} line - The source line to tokenize.
 * @param {TokenizerState} state - Mutable tokenizer state (updated in place).
 *
 * @returns {Token[]} Array of tokens for this line.
 */
export function tokenizeLine(line, state) {
    /** @type {Token[]} */
    const tokens = [];
    let pos = 0;

    /**
     * Tracks the lowercase form of the last keyword emitted on this line.
     * Used for context-aware heuristics: after 'as' → field, after 'set'/'let' → variable.
     *
     * @type {string|null}
     */
    let lastKeywordLower = null;

    /**
     * Push a token onto the result array.
     *
     * @param {string} type - Token type.
     * @param {string} text - Token text.
     *
     * @returns {void}
     */
    const push = (type, text) => {
        if (text) tokens.push({ type, text });
    };

    while (pos < line.length) {
        // ── Block comment continuation ──
        if (state.inBlockComment) {
            const end = line.indexOf('*/', pos);
            if (end === -1) {
                push('comment', line.slice(pos));
                pos = line.length;
            } else {
                push('comment', line.slice(pos, end + 2));
                pos = end + 2;
                state.inBlockComment = false;
            }
            continue;
        }

        // ── REM comment continuation (extends to ;) ──
        if (state.inRemComment) {
            const semi = line.indexOf(';', pos);
            if (semi === -1) {
                push('comment', line.slice(pos));
                pos = line.length;
            } else {
                push('comment', line.slice(pos, semi + 1));
                pos = semi + 1;
                state.inRemComment = false;
            }
            continue;
        }

        const ch = line[pos];

        // ── Whitespace ──
        if (/\s/.test(ch)) {
            let end = pos + 1;
            while (end < line.length && /\s/.test(line[end])) end++;
            push('normal', line.slice(pos, end));
            pos = end;
            continue;
        }

        // ── Line comment // ──
        if (ch === '/' && line[pos + 1] === '/') {
            push('comment', line.slice(pos));
            lastKeywordLower = null;
            pos = line.length;
            continue;
        }

        // ── Block comment start /* ──
        if (ch === '/' && line[pos + 1] === '*') {
            const end = line.indexOf('*/', pos + 2);
            if (end === -1) {
                push('comment', line.slice(pos));
                pos = line.length;
                state.inBlockComment = true;
            } else {
                push('comment', line.slice(pos, end + 2));
                pos = end + 2;
            }
            continue;
        }

        // ── Single-quoted string ──
        if (ch === "'") {
            let end = pos + 1;
            while (end < line.length && line[end] !== "'") end++;
            if (end < line.length) end++; // include closing quote
            push('string', line.slice(pos, end));
            lastKeywordLower = null;
            pos = end;
            continue;
        }

        // ── Double-quoted string ──
        if (ch === '"') {
            let end = pos + 1;
            while (end < line.length && line[end] !== '"') end++;
            if (end < line.length) end++;
            push('string', line.slice(pos, end));
            lastKeywordLower = null;
            pos = end;
            continue;
        }

        // ── Square-bracket quoted identifier [field name] ──
        if (ch === '[') {
            let end = pos + 1;
            while (end < line.length && line[end] !== ']') end++;
            if (end < line.length) end++;
            push('field', line.slice(pos, end));
            pos = end;
            continue;
        }

        // ── Dollar-sign variable $(varName) or $(=expr) ──
        if (ch === '$' && line[pos + 1] === '(') {
            let depth = 0;
            let end = pos;
            while (end < line.length) {
                if (line[end] === '(') depth++;
                else if (line[end] === ')') {
                    depth--;
                    if (depth === 0) {
                        end++;
                        break;
                    }
                }
                end++;
            }
            push('variable', line.slice(pos, end));
            pos = end;
            continue;
        }

        // ── Operators ──
        if (/[+\-*/=<>&|!;,(){}]/.test(ch)) {
            push('operator', ch);
            lastKeywordLower = null;
            pos++;
            continue;
        }

        // ── Numbers ──
        if (/\d/.test(ch)) {
            let end = pos + 1;
            while (end < line.length && /[\d.]/.test(line[end])) end++;
            push('number', line.slice(pos, end));
            lastKeywordLower = null;
            pos = end;
            continue;
        }

        // ── Word (identifier, keyword, or function) ──
        if (/[a-zA-Z_#]/.test(ch)) {
            let end = pos + 1;
            while (end < line.length && /[a-zA-Z0-9_#.]/.test(line[end])) end++;
            const word = line.slice(pos, end);
            const lower = word.toLowerCase();

            // REM comment (must be at statement start or after ;)
            if (lower === 'rem' && (pos === 0 || /[;\s]/.test(line[pos - 1] || ''))) {
                const semi = line.indexOf(';', end);
                if (semi === -1) {
                    push('comment', line.slice(pos));
                    pos = line.length;
                    state.inRemComment = true;
                } else {
                    push('comment', line.slice(pos, semi + 1));
                    pos = semi + 1;
                }
                continue;
            }

            // Check if followed by ( → function call
            let peekPos = end;
            while (peekPos < line.length && line[peekPos] === ' ') peekPos++;
            const isCall = peekPos < line.length && line[peekPos] === '(';

            // ── Context-aware heuristics ──

            // Table label: word immediately followed by : (but not URL schemes like http://)
            if (
                !isCall &&
                peekPos < line.length &&
                line[peekPos] === ':' &&
                !(line[peekPos + 1] === '/' && line[peekPos + 2] === '/') &&
                !ALL_KEYWORDS.has(lower) &&
                !ALL_FUNCTIONS.has(lower)
            ) {
                push('table', word);
                lastKeywordLower = null;
                pos = end;
                continue;
            }

            // After AS → next identifier is a field alias
            if (lastKeywordLower === 'as' && !isCall && !ALL_KEYWORDS.has(lower)) {
                push('field', word);
                lastKeywordLower = null;
                pos = end;
                continue;
            }

            // After SET/LET → next identifier is a variable name
            if (
                (lastKeywordLower === 'set' || lastKeywordLower === 'let') &&
                !isCall &&
                !ALL_KEYWORDS.has(lower)
            ) {
                push('variable', word);
                lastKeywordLower = null;
                pos = end;
                continue;
            }

            // ── Standard classification ──
            if (isCall && ALL_FUNCTIONS.has(lower)) {
                push(DEPRECATED.has(lower) ? 'deprecated' : 'function', word);
                lastKeywordLower = null;
            } else if (ALL_KEYWORDS.has(lower)) {
                push(DEPRECATED.has(lower) ? 'deprecated' : 'keyword', word);
                lastKeywordLower = lower;
            } else {
                push('normal', word);
                lastKeywordLower = null;
            }
            pos = end;
            continue;
        }

        // ── Anything else ──
        push('normal', ch);
        pos++;
    }

    return tokens;
}

/**
 * Tokenize a complete script (multi-line).
 *
 * @param {string} script - The full script text.
 *
 * @returns {Token[][]} Array of token arrays, one per line.
 */
export function tokenize(script) {
    const lines = script.split('\n');
    const state = createState();
    return lines.map((line) => tokenizeLine(line, state));
}

/**
 * Render tokenized lines as an HTML string with syntax highlighting.
 *
 * @param {Token[][]} tokenizedLines - Output from tokenize().
 * @param {string} prefix - CSS class prefix (e.g., 'qvs').
 *
 * @returns {string} HTML string with token spans.
 */
export function renderTokensToHTML(tokenizedLines, prefix) {
    return tokenizedLines
        .map(
            (tokens) =>
                tokens
                    .map((t) => {
                        const escaped = escapeHTML(t.text);
                        return `<span class="${prefix}-token-${t.type}">${escaped}</span>`;
                    })
                    .join('') || '&nbsp;'
        )
        .join('\n');
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
