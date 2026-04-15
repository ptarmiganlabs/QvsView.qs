/**
 * Fold range detector for Qlik load scripts.
 *
 * Walks tokenized lines to identify foldable regions such as multi-line
 * LOAD/SELECT statements, SUB/END SUB, IF/END IF, FOR/NEXT, DO/LOOP,
 * SWITCH/END SWITCH, block comments, and //region markers.
 *
 * @module fold-detector
 */

/**
 * @typedef {object} FoldRange
 * @property {number} startLine - 0-based line index where the fold begins.
 * @property {number} endLine - 0-based line index where the fold ends (inclusive).
 * @property {string} kind - Fold kind (e.g., 'load', 'sub', 'if', 'for', 'comment', 'region').
 * @property {string} label - Short label for the collapsed placeholder.
 */

/**
 * Detect foldable ranges in tokenized Qlik script lines.
 *
 * @param {import('./highlighter.js').Token[][]} tokenizedLines - Token arrays per line.
 *
 * @returns {FoldRange[]} Array of fold ranges, sorted by startLine.
 */
export function detectFoldRanges(tokenizedLines) {
    /** @type {FoldRange[]} */
    const ranges = [];

    /** @type {{ kind: string, startLine: number, label: string }[]} */
    const stack = [];

    /**
     * Track whether we're inside a multi-line LOAD or SELECT statement.
     * These end at the next unquoted semicolon.
     *
     * @type {{ kind: string, startLine: number, label: string } | null}
     */
    let pendingStatement = null;

    /**
     * Track multi-line block comments across lines.
     *
     * @type {{ startLine: number } | null}
     */
    let blockCommentStart = null;

    for (let lineIdx = 0; lineIdx < tokenizedLines.length; lineIdx++) {
        const tokens = tokenizedLines[lineIdx];

        // ── Check for //region and //endregion markers ──
        const lineText = tokens.map((t) => t.text).join('');
        const regionMatch = lineText.match(/^\s*\/\/\s*region\b\s*(.*)/i);
        const endRegionMatch = lineText.match(/^\s*\/\/\s*endregion\b/i);

        if (regionMatch) {
            stack.push({
                kind: 'region',
                startLine: lineIdx,
                label: regionMatch[1].trim() || 'region',
            });
            continue;
        }

        if (endRegionMatch) {
            const open = findLastOnStack(stack, 'region');
            if (open && lineIdx > open.startLine) {
                ranges.push({
                    startLine: open.startLine,
                    endLine: lineIdx,
                    kind: 'region',
                    label: open.label,
                });
            }
            continue;
        }

        // ── Walk tokens on this line ──
        for (let t = 0; t < tokens.length; t++) {
            const token = tokens[t];
            const type = token.type;
            const text = token.text;
            const lower = text.toLowerCase();

            // ── Block comments ──
            if (type === 'comment') {
                if (text.startsWith('/*') && !text.includes('*/')) {
                    // Block comment starts and does not close on this line
                    if (blockCommentStart === null) {
                        blockCommentStart = { startLine: lineIdx };
                    }
                } else if (text.includes('*/') && blockCommentStart !== null) {
                    // Block comment closes
                    if (lineIdx > blockCommentStart.startLine) {
                        ranges.push({
                            startLine: blockCommentStart.startLine,
                            endLine: lineIdx,
                            kind: 'comment',
                            label: '/* ... */',
                        });
                    }
                    blockCommentStart = null;
                } else if (
                    text.startsWith('/*') &&
                    text.endsWith('*/') &&
                    blockCommentStart === null
                ) {
                    // Single-line block comment — not foldable, skip
                }
            }

            // Only process keyword tokens for structural folds
            if (type !== 'keyword') continue;

            // ── Statement-ending semicolons are operators, handle separately ──

            // ── Structural keywords ──
            if (lower === 'sub') {
                const label = peekNextIdentifier(tokens, t);
                stack.push({ kind: 'sub', startLine: lineIdx, label: label || 'Sub' });
            } else if (lower === 'end') {
                // "end sub", "end if", "end switch" — peek next keyword
                const nextKw = peekNextKeyword(tokens, t);
                if (nextKw === 'sub') {
                    const open = findLastOnStack(stack, 'sub');
                    if (open && lineIdx > open.startLine) {
                        ranges.push({
                            startLine: open.startLine,
                            endLine: lineIdx,
                            kind: 'sub',
                            label: `Sub ${open.label}`,
                        });
                    }
                } else if (nextKw === 'if') {
                    const open = findLastOnStack(stack, 'if');
                    if (open && lineIdx > open.startLine) {
                        ranges.push({
                            startLine: open.startLine,
                            endLine: lineIdx,
                            kind: 'if',
                            label: 'If ... End If',
                        });
                    }
                } else if (nextKw === 'switch') {
                    const open = findLastOnStack(stack, 'switch');
                    if (open && lineIdx > open.startLine) {
                        ranges.push({
                            startLine: open.startLine,
                            endLine: lineIdx,
                            kind: 'switch',
                            label: 'Switch ... End Switch',
                        });
                    }
                }
            } else if (lower === 'if' && isControlIf(tokens, t)) {
                stack.push({ kind: 'if', startLine: lineIdx, label: 'If' });
            } else if (lower === 'for') {
                stack.push({ kind: 'for', startLine: lineIdx, label: 'For' });
            } else if (lower === 'next') {
                const open = findLastOnStack(stack, 'for');
                if (open && lineIdx > open.startLine) {
                    ranges.push({
                        startLine: open.startLine,
                        endLine: lineIdx,
                        kind: 'for',
                        label: 'For ... Next',
                    });
                }
            } else if (lower === 'do') {
                stack.push({ kind: 'do', startLine: lineIdx, label: 'Do' });
            } else if (lower === 'loop') {
                const open = findLastOnStack(stack, 'do');
                if (open && lineIdx > open.startLine) {
                    ranges.push({
                        startLine: open.startLine,
                        endLine: lineIdx,
                        kind: 'do',
                        label: 'Do ... Loop',
                    });
                }
            } else if (lower === 'switch') {
                stack.push({ kind: 'switch', startLine: lineIdx, label: 'Switch' });
            } else if ((lower === 'load' || lower === 'select') && pendingStatement === null) {
                // Start tracking a LOAD/SELECT statement (ends at ;)
                pendingStatement = {
                    kind: lower,
                    startLine: lineIdx,
                    label: lower === 'load' ? 'LOAD ...' : 'SELECT ...',
                };
            }
        }

        // ── Check for semicolons ending LOAD/SELECT statements ──
        if (pendingStatement) {
            for (const token of tokens) {
                if (token.type === 'operator' && token.text === ';') {
                    if (lineIdx > pendingStatement.startLine) {
                        ranges.push({
                            startLine: pendingStatement.startLine,
                            endLine: lineIdx,
                            kind: pendingStatement.kind,
                            label: pendingStatement.label,
                        });
                    }
                    pendingStatement = null;
                    break;
                }
            }
        }
    }

    // Close any unclosed block comment at end of file
    if (blockCommentStart !== null) {
        const endLine = tokenizedLines.length - 1;
        if (endLine > blockCommentStart.startLine) {
            ranges.push({
                startLine: blockCommentStart.startLine,
                endLine,
                kind: 'comment',
                label: '/* ... */',
            });
        }
    }

    // Sort by startLine, then by endLine descending (outer ranges first)
    ranges.sort((a, b) => a.startLine - b.startLine || b.endLine - a.endLine);

    return ranges;
}

/**
 * Find and remove the last entry of a given kind from the stack.
 *
 * @param {{ kind: string, startLine: number, label: string }[]} stack - Open construct stack.
 * @param {string} kind - The kind to search for.
 *
 * @returns {{ kind: string, startLine: number, label: string } | null} Removed entry, or null.
 */
function findLastOnStack(stack, kind) {
    for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].kind === kind) {
            return stack.splice(i, 1)[0];
        }
    }
    return null;
}

/**
 * Peek at the next non-whitespace token after position t to get an identifier.
 *
 * @param {import('./highlighter.js').Token[]} tokens - Tokens on the current line.
 * @param {number} t - Current token index.
 *
 * @returns {string|null} The next identifier text, or null.
 */
function peekNextIdentifier(tokens, t) {
    for (let i = t + 1; i < tokens.length; i++) {
        const text = tokens[i].text.trim();
        if (text) return text;
    }
    return null;
}

/**
 * Peek at the next keyword token after position t.
 *
 * @param {import('./highlighter.js').Token[]} tokens - Tokens on the current line.
 * @param {number} t - Current token index.
 *
 * @returns {string|null} The lowercase text of the next keyword, or null.
 */
function peekNextKeyword(tokens, t) {
    for (let i = t + 1; i < tokens.length; i++) {
        const text = tokens[i].text.trim();
        if (!text) continue;
        if (tokens[i].type === 'keyword') return text.toLowerCase();
        return null; // non-empty non-keyword means no match
    }
    return null;
}

/**
 * Determine if an 'if' keyword is a control-flow IF (multi-line block)
 * rather than an inline if() function or single-line IF ... THEN ... END IF.
 *
 * Heuristic: a control-flow IF has THEN as the last keyword on its line
 * (possibly followed by whitespace/comment) WITHOUT an END IF on the same line.
 *
 * @param {import('./highlighter.js').Token[]} tokens - Tokens on the current line.
 * @param {number} t - Index of the 'if' token.
 *
 * @returns {boolean} True if this is a control-flow IF block.
 */
function isControlIf(tokens, t) {
    let hasThen = false;
    let hasEndIf = false;

    for (let i = t + 1; i < tokens.length; i++) {
        const lower = tokens[i].text.trim().toLowerCase();
        if (tokens[i].type === 'keyword') {
            if (lower === 'then') hasThen = true;
            if (lower === 'end') {
                // Check if next keyword is 'if'
                const nextKw = peekNextKeyword(tokens, i);
                if (nextKw === 'if') hasEndIf = true;
            }
        }
    }

    // It's a control IF if it has THEN but not END IF on the same line
    return hasThen && !hasEndIf;
}

/**
 * Build a lookup map from line number to fold ranges starting on that line.
 *
 * @param {FoldRange[]} ranges - Detected fold ranges.
 *
 * @returns {Map<number, FoldRange>} Map keyed by startLine.
 */
export function buildFoldMap(ranges) {
    const map = new Map();
    for (const range of ranges) {
        // If multiple ranges start on the same line, keep the outermost (largest span)
        const existing = map.get(range.startLine);
        if (!existing || range.endLine - range.startLine > existing.endLine - existing.startLine) {
            map.set(range.startLine, range);
        }
    }
    return map;
}
