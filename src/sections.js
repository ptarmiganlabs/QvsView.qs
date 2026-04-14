/**
 * Script section parser.
 *
 * Detects `///$tab SectionName` markers in Qlik load scripts and splits
 * the script into named sections. These markers are used by the Data
 * Load Editor in Qlik Sense to separate script into tabs.
 *
 * @module sections
 */

/**
 * @typedef {object} ScriptSection
 * @property {string} name - Section/tab name from the `///$tab` marker.
 * @property {number} startLine - 0-based line index where the section begins (the `///$tab` line).
 * @property {number} endLine - 0-based line index of the last line in this section (inclusive).
 * @property {string} content - The script text for this section (excluding the `///$tab` line itself).
 */

/** Regex matching `///$tab SectionName` lines (case-insensitive, leading whitespace OK). */
const TAB_MARKER = /^\s*\/\/\/\$tab\s+(.+)$/i;

/**
 * Parse a script into sections based on `///$tab` markers.
 *
 * If the script contains no `///$tab` markers, a single "Main" section
 * covering the entire script is returned.
 *
 * @param {string} script - The full script text.
 *
 * @returns {ScriptSection[]} Array of sections in order.
 */
export function parseSections(script) {
    const lines = script.split('\n');
    /** @type {{ name: string, startLine: number }[]} */
    const markers = [];

    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(TAB_MARKER);
        if (match) {
            markers.push({ name: match[1].trim(), startLine: i });
        }
    }

    // No tab markers — return the whole script as a single section
    if (markers.length === 0) {
        return [
            {
                name: 'Main',
                startLine: 0,
                endLine: lines.length - 1,
                content: script,
            },
        ];
    }

    /** @type {ScriptSection[]} */
    const sections = [];

    // If script has content before the first ///$tab marker, capture it
    if (markers[0].startLine > 0) {
        sections.push({
            name: '(Before tabs)',
            startLine: 0,
            endLine: markers[0].startLine - 1,
            content: lines.slice(0, markers[0].startLine).join('\n'),
        });
    }

    for (let i = 0; i < markers.length; i++) {
        const start = markers[i].startLine;
        const end = i < markers.length - 1 ? markers[i + 1].startLine - 1 : lines.length - 1;
        // Content excludes the ///$tab line itself
        const contentLines = lines.slice(start + 1, end + 1);

        sections.push({
            name: markers[i].name,
            startLine: start,
            endLine: end,
            content: contentLines.join('\n'),
        });
    }

    return sections;
}

/**
 * Check whether a line is a `///$tab` marker.
 *
 * @param {string} line - A single line of script text.
 *
 * @returns {boolean} True if the line is a tab marker.
 */
export function isTabMarker(line) {
    return TAB_MARKER.test(line);
}
