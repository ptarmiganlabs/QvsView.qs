/**
 * Mermaid diagram initialization.
 *
 * After Markdown is rendered into the DOM, call `initMermaidDiagrams()` to find
 * all `<pre class="mermaid">` elements and render them as SVG diagrams.
 *
 * Two build variants control how Mermaid is loaded:
 * - `light` (CDN variant) — loads mermaid from jsDelivr at runtime. Keeps the
 *   extension bundle small (~40 KB) but requires internet access for diagrams.
 * - `full` (air-gapped variant) — loads mermaid.min.js from the extension folder.
 *   Larger bundle (~3 MB) but works in air-gapped environments.
 *
 * The active variant is set at build time via the `__BUILD_VARIANT__` token.
 *
 * Pinned to an exact version to prevent unexpected breaking changes and
 * supply-chain risk from unpinned version tags.
 */

/** @constant {string} Exact Mermaid version used by this build. */
const MERMAID_VERSION = '11.14.0';

/**
 * Build variant injected at compile time by Rollup.
 * `'light'` = CDN, `'full'` = bundled air-gapped.
 *
 * @constant {string}
 */
const BUILD_VARIANT = __BUILD_VARIANT__;

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

    // Sanitize erDiagram blocks: attribute names cannot contain dots or hyphens.
    // LLMs commonly produce field names like "events.venue.country_GeoInfo" from
    // Qlik data models. Replace dots/hyphens with underscores in attribute lines.
    if (/^\s*erDiagram\b/m.test(code)) {
        code = sanitizeErDiagram(code);
    }

    return code;
}

/**
 * Sanitize erDiagram attribute names that contain characters invalid in Mermaid.
 *
 * Mermaid erDiagram attribute names must be simple identifiers — dots, hyphens,
 * and other special characters cause parse errors. This replaces them with
 * underscores. Entity names with dots are also sanitized. Relationship lines
 * and other structural syntax are left untouched.
 *
 * @param {string} code - Raw erDiagram Mermaid source.
 *
 * @returns {string} Sanitized erDiagram source.
 */
function sanitizeErDiagram(code) {
    // Track entity name replacements so relationship lines stay consistent
    const entityRenames = new Map();

    return code
        .split('\n')
        .map((line) => {
            // Skip the erDiagram keyword line
            if (/^\s*erDiagram\b/.test(line)) return line;
            // Skip comments
            if (/^\s*%%/.test(line)) return line;
            // Skip empty lines and closing braces
            if (/^\s*$/.test(line) || /^\s*}\s*$/.test(line)) return line;

            // Entity opening: "  entityName {"
            const entityMatch = line.match(/^(\s*)([\w.|-]+)(\s*\{)\s*$/);
            if (entityMatch) {
                const [, indent, name, brace] = entityMatch;
                const safe = name.replace(/[.|-]+/g, '_');
                if (safe !== name) entityRenames.set(name, safe);
                return `${indent}${safe}${brace}`;
            }

            // Attribute line: "    type name" or "    type name PK/FK"
            // Must not match relationship lines (which contain ||, --, {, })
            const attrMatch = line.match(/^(\s+)([\w.|-]+)(\s+)([\w.|-]+)(.*?)$/);
            if (attrMatch && !/[|{}]/.test(line)) {
                const [, indent, type, space, attrName, rest] = attrMatch;
                const safeType = type.replace(/[.|-]+/g, '_');
                const safeName = attrName.replace(/[.|-]+/g, '_');
                return `${indent}${safeType}${space}${safeName}${rest}`;
            }

            // Relationship line: "  entity1 ||--o{ entity2 : "label""
            // Replace any entity names that were renamed above, using word boundaries
            // to avoid rewriting substrings inside longer identifiers.
            let result = line;
            for (const [original, safe] of entityRenames) {
                result = result.replace(
                    new RegExp(
                        `(?<![\\w])${original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`,
                        'g'
                    ),
                    safe
                );
            }
            return result;
        })
        .join('\n');
}

/**
 * Detect the base URL of this extension inside Qlik Sense.
 *
 * Searches the DOM for the extension's own `<script>` tag and derives the
 * directory path from its `src` attribute, so that the air-gapped variant
 * can load `mermaid.min.js` from the same folder.
 *
 * @returns {string} Base URL ending with `/`, e.g. `/extensions/qvsview-qs/`.
 */
function getExtensionBaseUrl() {
    const scripts = document.querySelectorAll('script[src]');
    for (const s of scripts) {
        if (s.src.includes('qvsview-qs')) {
            // Strip the filename, keep the directory
            return s.src.replace(/[^/]*$/, '');
        }
    }
    // Fallback for client-managed Qlik Sense default path
    return '/extensions/qvsview-qs/';
}

/**
 * Load mermaid from a local file bundled inside the extension folder.
 *
 * Used by the air-gapped build variant so diagrams render without internet.
 *
 * @returns {Promise<object|null>} The mermaid API object, or null if unavailable.
 */
function loadMermaidFromLocal() {
    return new Promise((resolve) => {
        if (typeof window !== 'undefined' && window.mermaid) {
            resolve(window.mermaid);
            return;
        }

        const baseUrl = getExtensionBaseUrl();
        const script = document.createElement('script');
        script.src = `${baseUrl}mermaid.min.js`;

        /** Resolve with the global mermaid object once loaded. */
        script.onload = () => {
            resolve(typeof window !== 'undefined' && window.mermaid ? window.mermaid : null);
        };

        /**
         * Resolve null if local load fails.
         *
         * @returns {void}
         */
        script.onerror = () => resolve(null);
        document.head.appendChild(script);
    });
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
 * Get the mermaid API, loading it if needed.
 *
 * The loading strategy depends on the build variant:
 * - `'full'` — loads from the extension folder (air-gapped).
 * - `'light'` (default) — loads from jsDelivr CDN.
 *
 * @returns {Promise<object|null>} The mermaid API, or null if unavailable.
 */
async function getMermaid() {
    if (mermaidApi) return mermaidApi;
    mermaidApi =
        BUILD_VARIANT === 'full' ? await loadMermaidFromLocal() : await loadMermaidFromCdn();
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
        const source =
            BUILD_VARIANT === 'full' ? 'the extension folder' : `CDN (v${MERMAID_VERSION})`;
        mermaidEls.forEach((el) => {
            const raw = el.dataset.graph
                ? decodeURIComponent(el.dataset.graph)
                : el.textContent || '';
            el.classList.add('mermaid-unavailable');
            el.textContent = `[Diagram unavailable — Mermaid could not be loaded from ${source}. Raw source:\n${raw}]`;
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
