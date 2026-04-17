/**
 * Mermaid diagram initialization.
 *
 * After Markdown is rendered into the DOM, call `initMermaidDiagrams()` to find
 * all `<pre class="mermaid">` elements and render them as SVG diagrams.
 *
 * Loads mermaid from CDN at runtime (keeps the extension bundle small).
 * Pinned to an exact version to prevent unexpected breaking changes and
 * supply-chain risk from unpinned version tags.
 */

/** @constant {string} Exact Mermaid version loaded from CDN. */
const MERMAID_VERSION = '11.14.0';

let mermaidReady = false;
let mermaidApi = null;

/**
 * Sanitize Mermaid source code to fix common LLM-generated syntax issues.
 *
 * Mermaid interprets parentheses as node shapes (rounded rectangles),
 * angle brackets as rhombus/hexagon shapes, and other special characters
 * as syntax. When an LLM includes function calls like `Chr()`, `Rand()`,
 * or expressions with `+` inside node labels, Mermaid's parser breaks.
 *
 * This function:
 * 1. Strips `<br/>` / `<br>` HTML tags (replaced with spaces)
 * 2. Fixes unquoted node labels that contain parentheses by wrapping them in `["..."]`
 * 3. Replaces bare parentheses in already-quoted labels with unicode equivalents
 *
 * @param {string} src - Raw Mermaid diagram source.
 *
 * @returns {string} Sanitized Mermaid source.
 */
function sanitizeMermaidSource(src) {
    let code = src.replace(/<br\s*\/?>/gi, ' ');

    // Process line by line for graph/flowchart diagrams
    if (/^\s*(graph|flowchart)\b/m.test(code)) {
        code = code
            .split('\n')
            .map((line) => {
                // Skip directive/keyword lines
                if (/^\s*(graph|flowchart|subgraph|end|style|classDef|click)\b/.test(line))
                    return line;
                // Skip lines that are purely comments
                if (/^\s*%%/.test(line)) return line;

                // Replace () inside ["..."] and ("...") quoted labels with
                // unicode full-width parens to avoid Mermaid parser confusion
                return line.replace(
                    /(\["|(?:\("))(.*?)("[\])])/g,
                    (_match, open, content, close) =>
                        open + content.replace(/\(/g, '\uff08').replace(/\)/g, '\uff09') + close
                );
            })
            .join('\n');
    }

    return code;
}

/**
 * Load mermaid via CDN by injecting a script tag.
 *
 * The version is pinned to {@link MERMAID_VERSION} to prevent unexpected
 * breaking changes and supply-chain risk from a floating version tag.
 *
 * @returns {Promise<object|null>} The mermaid API object, or null if unavailable.
 */
function loadMermaidFromCdn() {
    return new Promise((resolve) => {
        // Already loaded globally?
        if (typeof window !== 'undefined' && window.mermaid) {
            resolve(window.mermaid);
            return;
        }

        const script = document.createElement('script');
        script.src = `https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.min.js`;
        /** Resolve with the global mermaid object once loaded. */
        script.onload = () => {
            resolve(typeof window !== 'undefined' && window.mermaid ? window.mermaid : null);
        };
        /**
         * Resolve null if CDN load fails (e.g. CSP policy or no internet access).
         *
         * @returns {void}
         */
        script.onerror = () => resolve(null);
        document.head.appendChild(script);
    });
}

/**
 * Get the mermaid API, loading from CDN if needed.
 *
 * @returns {Promise<object|null>} The mermaid API, or null if unavailable.
 */
async function getMermaid() {
    if (mermaidApi) return mermaidApi;
    mermaidApi = await loadMermaidFromCdn();
    return mermaidApi;
}

/**
 * Initialize and render all Mermaid diagrams inside a container element.
 *
 * Finds all `<pre class="mermaid">` elements within the container and converts
 * their text content to SVG diagrams.
 *
 * @param {HTMLElement} container - The DOM element containing rendered Markdown HTML.
 *
 * @returns {Promise<void>}
 */
export async function initMermaidDiagrams(container) {
    if (!container) return;

    const mermaidEls = container.querySelectorAll('pre.mermaid');
    if (mermaidEls.length === 0) return;

    const mermaidApi = await getMermaid();
    if (!mermaidApi) {
        // CDN load failed (e.g. CSP policy or no internet). Show a visible
        // notice on each diagram element so the user knows diagrams are unavailable.
        mermaidEls.forEach((el) => {
            const raw = el.dataset.graph
                ? decodeURIComponent(el.dataset.graph)
                : el.textContent || '';
            el.classList.add('mermaid-unavailable');
            el.textContent = `[Diagram unavailable — Mermaid (v${MERMAID_VERSION}) could not be loaded from CDN. Raw source:\n${raw}]`;
        });
        return;
    }

    if (!mermaidReady) {
        mermaidApi.initialize({
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'antiscript',
            fontFamily: 'sans-serif',
        });
        mermaidReady = true;
    }

    for (let i = 0; i < mermaidEls.length; i++) {
        const el = mermaidEls[i];
        // Prefer data-graph attribute (URI-encoded raw source, bypasses DOMPurify)
        const raw = el.dataset.graph ? decodeURIComponent(el.dataset.graph) : el.textContent || '';
        const code = sanitizeMermaidSource(raw);
        const id = `qvs-mermaid-${Date.now()}-${i}`;

        try {
            const { svg } = await mermaidApi.render(id, code);
            el.innerHTML = svg;
            el.classList.add('mermaid-rendered');
        } catch {
            // Show raw source on failure so user can debug
            el.classList.add('mermaid-error');
            el.textContent = `Diagram error:\n${raw}`;
        }
    }
}
