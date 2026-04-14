/**
 * Token type definitions and CSS color mapping for Qlik script syntax highlighting.
 *
 * Colors are extracted from the Qlik Sense Data Load Editor (CodeMirror 5 + sense-script mode).
 */

/** @type {Record<string, {color: string, fontWeight: string, fontStyle: string}>} */
export const TOKEN_STYLES = {
    keyword: { color: '#6A8FDE', fontWeight: 'bold', fontStyle: 'normal' },
    function: { color: '#6A8FDE', fontWeight: 'bold', fontStyle: 'normal' },
    variable: { color: '#CC99CC', fontWeight: 'bold', fontStyle: 'normal' },
    string: { color: '#44751D', fontWeight: 'normal', fontStyle: 'normal' },
    comment: { color: '#808080', fontWeight: 'normal', fontStyle: 'italic' },
    operator: { color: '#000000', fontWeight: 'normal', fontStyle: 'normal' },
    number: { color: '#000000', fontWeight: 'normal', fontStyle: 'normal' },
    normal: { color: '#000000', fontWeight: 'normal', fontStyle: 'normal' },
};

/**
 * Build a CSS stylesheet string for all token types.
 *
 * @param {string} prefix - CSS class prefix (e.g., 'qvs').
 *
 * @returns {string} CSS rules for syntax token spans.
 */
export function buildTokenCSS(prefix) {
    return Object.entries(TOKEN_STYLES)
        .map(
            ([type, style]) =>
                `.${prefix}-token-${type} { color: ${style.color}; font-weight: ${style.fontWeight}; font-style: ${style.fontStyle}; }`
        )
        .join('\n');
}
