/**
 * QvsView.qs — Supernova entry point.
 *
 * A read-only Qlik script viewer with syntax highlighting.
 * Script text is sourced from a hypercube dimension (field in the data model).
 *
 * @param {object} _galaxy - Nebula galaxy object.
 *
 * @returns {object} Supernova definition.
 */

import {
    useElement,
    useLayout,
    useEffect,
    useModel,
    useApp,
    useState,
    onContextMenu,
} from '@nebula.js/stardust';
import ext from './ext/index.js';
import data from './data.js';
import definition from './object-properties.js';
import { renderViewer, renderPlaceholder, renderLoading, renderWarning } from './ui/viewer.js';
import { applyRuntimeBnf, resetToStaticBnf } from './syntax/keywords.js';
import { fetchRuntimeBnf, clearBnfCache } from './syntax/bnf-loader.js';
import logger, { PACKAGE_VERSION, BUILD_DATE } from './util/logger.js';
import { analyzeScript } from './ai/providers.js';
import { getSystemPrompt } from './ai/system-prompt.js';
import { getApiKey, cacheApiKey } from './ai/key-manager.js';
import { getCachedResult, setCachedResult } from './ai/cache.js';
import { showAiModal } from './ui/ai-modal.js';
import './style.css';

/** Maximum rows per page request. Qlik limits to 10000. */
const PAGE_SIZE = 10000;

/**
 * Supernova component factory.
 *
 * @param {object} _galaxy - Nebula galaxy object.
 *
 * @returns {object} Supernova definition with qae, ext, and component.
 */
export default function supernova(_galaxy) {
    return {
        qae: {
            properties: definition,
            data,
        },
        ext: ext(_galaxy),

        /**
         * Main component logic.
         * Reads script text from the hypercube and renders a syntax-highlighted viewer.
         *
         * @returns {void}
         */
        component() {
            const layout = useLayout();
            const model = useModel();
            const app = useApp();
            const element = useElement();

            /**
             * Raw row data from GetTableData. Contains per-row identifiers
             * when a second dimension is configured, enabling client-side
             * filtering based on hypercube selection state.
             */
            const [rawRows, setRawRows] = useState(null);
            const [activeIds, setActiveIds] = useState(null);
            const [bnfReady, setBnfReady] = useState(false);

            useEffect(() => {
                logger.info(`QvsView.qs v${PACKAGE_VERSION} (${BUILD_DATE})`);
            }, []);

            // Handle runtime BNF loading based on property toggle
            useEffect(() => {
                if (!layout) return;
                const useRuntime = layout.viewer?.useRuntimeBnf === true;

                if (useRuntime) {
                    fetchRuntimeBnf().then((sets) => {
                        if (sets) {
                            applyRuntimeBnf(sets);
                            logger.info('Runtime BNF applied');
                        }
                        setBnfReady(true);
                    });
                } else {
                    clearBnfCache();
                    resetToStaticBnf();
                    setBnfReady(true);
                }
            }, [layout?.viewer?.useRuntimeBnf]);

            // Fetch raw row data via the hypercube (row number dimension prevents deduplication)
            useEffect(() => {
                if (!layout || !model) return;

                // Reset immediately so the render effect never sees a stale rawRows/activeIds
                // combination (e.g. new activeIds arriving before new rawRows would otherwise
                // produce an empty filteredRows and trigger the wrong placeholder).
                setRawRows(null);
                setActiveIds(null);

                fetchAllRows(layout, model)
                    .then(setRawRows)
                    .catch((err) => {
                        logger.warn('Data fetch failed:', err);
                        setRawRows(null);
                    });

                // Fetch active identifiers from the hypercube (script source is always at col 2)
                if (layout.qHyperCube?.qDimensionInfo?.[2]) {
                    fetchActiveIdentifiers(layout, model).then(setActiveIds);
                } else {
                    setActiveIds(null);
                }
            }, [layout, model]);

            // Add "Copy selected text" to the right-click context menu
            onContextMenu((menu) => {
                const sel = window.getSelection();
                const text = sel ? sel.toString() : '';
                if (text) {
                    menu.addItem({
                        translation: 'Copy selected text',
                        tid: 'copy-selection',
                        icon: 'copy',

                        /**
                         * Copy the selected text to the clipboard.
                         */
                        select() {
                            navigator.clipboard.writeText(text);
                        },
                    });
                }
            });

            // Render when data or layout changes
            useEffect(() => {
                if (!layout) return;

                // All three dimensions (row number + script text + script source) must be configured.
                const dimCount = layout.qHyperCube?.qDimensionInfo?.length ?? 0;
                if (dimCount < 3) {
                    renderPlaceholder(
                        element,
                        'Add all 3 dimensions (row number, script text, script source) to view scripts'
                    );
                    return;
                }

                // rawRows === undefined → data fetch still in-flight (show loading state)
                // rawRows === null or [] → fetch completed but returned nothing usable
                if (typeof rawRows === 'undefined') {
                    renderLoading(element);
                    return;
                }
                if (!Array.isArray(rawRows) || rawRows.length === 0) {
                    renderPlaceholder(element);
                    return;
                }

                // Multi-app warning: multiple distinct sources after selections
                if (activeIds && activeIds.length > 1) {
                    const viewerOpts = layout.viewer || {};
                    const message =
                        viewerOpts.multiAppWarningMessage ||
                        'Multiple scripts detected. Use a filter to select a single script source.';
                    renderWarning(element, message, activeIds);
                    return;
                }

                // Filter raw rows by the active identifier when second dim is present
                let filteredRows = rawRows;
                if (activeIds && activeIds.length === 1) {
                    filteredRows = rawRows.filter((r) => r.id === activeIds[0]);
                }

                const script = filteredRows.map((r) => r.text).join('\n');
                if (!script) {
                    renderPlaceholder(element);
                    return;
                }

                const viewerOpts = layout.viewer || {};
                const toolbarOpts = layout.toolbar || {};
                const aiOpts = layout.ai || {};
                const aiEnabled = aiOpts.enabled === true;

                // App selector: show when enabled AND Dim 3 is configured
                const showAppSelector = toolbarOpts.showAppSelector === true;

                // Derive distinct selector values from rawRows (Dim 3 = script source)
                const selectorValues = showAppSelector
                    ? [...new Set(rawRows.map((r) => r.id).filter(Boolean))].sort((a, b) =>
                          a.localeCompare(b)
                      )
                    : [];

                // Determine selected app: exactly one source active means a selection is set
                const selectedApp =
                    showAppSelector && activeIds && activeIds.length === 1 ? activeIds[0] : null;

                renderViewer(element, {
                    script,
                    showLineNumbers: viewerOpts.showLineNumbers !== false,
                    wordWrap: viewerOpts.wordWrap === true,
                    fontSize: viewerOpts.fontSize || 13,
                    enableFolding: viewerOpts.enableFolding !== false,
                    showCopyButton: toolbarOpts.showCopyButton !== false,
                    showFontSizeDropdown: toolbarOpts.showFontSizeDropdown === true,
                    showSearch: toolbarOpts.showSearch === true,
                    showAppSelector,
                    selectorValues,
                    selectedApp,
                    onAppSelect: showAppSelector
                        ? (value) => handleAppSelect(app, layout, value)
                        : null,
                    showAiAnalysis: aiEnabled,
                    aiConfig: aiEnabled ? aiOpts : null,
                    onAiAnalyze: aiEnabled ? (info) => handleAiAnalyze(info, aiOpts) : null,
                });
            }, [layout, element, rawRows, activeIds, bnfReady]);
        },
    };
}

/**
 * Handle the AI Analyze button click.
 *
 * Opens the AI modal, resolves API keys if needed, and runs the analysis.
 *
 * @param {object} info - Script info from the viewer.
 * @param {string} info.sectionScript - Active section script text.
 * @param {string} info.fullScript - Full concatenated script text.
 * @param {number} info.sectionCount - Number of script sections/tabs.
 * @param {string} info.activeSectionName - Name of the active section/tab.
 * @param {HTMLElement} info.containerEl - The container element.
 * @param {object} aiOpts - AI configuration from layout.ai.
 *
 * @returns {void}
 */
function handleAiAnalyze(info, aiOpts) {
    const { sectionScript, fullScript, sectionCount, activeSectionName } = info;
    const provider = aiOpts.provider || 'ollama';
    const customPrompt = aiOpts.systemPrompt || '';
    const isRuntimeTemplate = aiOpts.promptTemplateMode === 'runtime';
    const fixedTemplate = aiOpts.promptTemplate || 'general';

    // Pre-compute system prompt when template is fixed via properties
    const fixedSystemPrompt = isRuntimeTemplate
        ? null
        : getSystemPrompt(fixedTemplate, customPrompt || undefined);

    const quoteCycle = aiOpts.quoteCycleSeconds || 5;

    const modal = showAiModal({
        container: document.body,
        quoteCycleSeconds: quoteCycle,
        sectionCount,
        activeSectionName,
        promptTemplateMode: isRuntimeTemplate ? 'runtime' : 'properties',
        fixedPromptTemplate: fixedTemplate,
        /**
         * Run the AI analysis, checking cache first.
         *
         * @param {object} opts - Analysis options.
         * @param {boolean} opts.bypassCache - Whether to skip the cache.
         * @param {string} opts.scope - 'section' or 'full'.
         * @param {string} [opts.promptTemplate] - Template chosen at runtime (if runtime mode).
         *
         * @returns {Promise<{content: string, model: string, provider: string}>} Analysis result.
         */
        onAnalyze: async ({ bypassCache, scope, promptTemplate }) => {
            const scriptText = scope === 'section' ? sectionScript : fullScript;

            // Determine the effective template and system prompt
            const effectiveTemplate = isRuntimeTemplate
                ? promptTemplate || 'general'
                : fixedTemplate;
            const effectiveOpts = { ...aiOpts, promptTemplate: effectiveTemplate };
            const systemPrompt = isRuntimeTemplate
                ? getSystemPrompt(effectiveTemplate, customPrompt || undefined)
                : fixedSystemPrompt;

            // Check cache first (unless bypass requested)
            if (!bypassCache) {
                const cached = getCachedResult(scriptText, effectiveOpts);
                if (cached) return cached;
            }

            // Resolve API key for providers that need one
            let apiKey = null;
            if (provider !== 'ollama') {
                apiKey = getApiKey(provider, aiOpts);
                if (!apiKey) {
                    // Ask user for key via modal's inline prompt
                    apiKey = await modal.promptApiKey(provider);
                    if (!apiKey) {
                        throw new Error('API key is required. Analysis cancelled.');
                    }
                    cacheApiKey(provider, apiKey);
                }
            }

            const result = await analyzeScript(effectiveOpts, scriptText, {
                systemPrompt,
                apiKey,
                bypassCache,
            });

            // Cache the result
            setCachedResult(scriptText, effectiveOpts, result);

            return result;
        },
    });
}

/**
 * Fetch all rows from the hypercube, paginating if necessary.
 *
 * Column layout (fixed — all three dims required):
 *   col 0 — row number  (used for sorting; not extracted here)
 *   col 1 — script text
 *   col 2 — script source / identifier
 *
 * The hypercube is selection-aware — only rows matching active selections
 * are included.
 *
 * @param {object} layout - Qlik Sense layout object.
 * @param {object} model - Qlik engine model (GenericObject).
 *
 * @returns {Promise<Array<{text: string, id: string|null}>|null>}
 *   Array of per-row objects (text + identifier), or null if no data.
 */
async function fetchAllRows(layout, model) {
    const hc = layout?.qHyperCube;
    if (!hc) return null;

    const totalRows = hc.qSize?.qcy || 0;
    if (totalRows === 0) return null;

    const colCount = hc.qSize?.qcx || 1;

    // Fixed column positions: row number=0, text=1, source=2
    const textCol = 1;
    const idCol = 2;
    const hasIdentifier = colCount >= 3;

    // Collect rows from initial data pages
    const result = [];
    const pages = hc.qDataPages;
    if (pages) {
        for (const page of pages) {
            if (page.qMatrix) {
                for (const row of page.qMatrix) {
                    if (row.length > textCol) {
                        result.push({
                            text: row[textCol]?.qText ?? '',
                            id:
                                hasIdentifier && row.length > idCol
                                    ? (row[idCol]?.qText ?? null)
                                    : null,
                        });
                    }
                }
            }
        }
    }

    // If we already have all rows, we're done
    if (result.length >= totalRows) {
        return result.length > 0 ? result : null;
    }

    // Fetch remaining pages
    // getHyperCubeData has a 10 000-cell limit per call (qWidth × qHeight).
    const maxRowsPerPage = Math.floor(PAGE_SIZE / colCount);
    let fetched = result.length;
    while (fetched < totalRows) {
        const height = Math.min(maxRowsPerPage, totalRows - fetched);
        try {
            const dataPages = await model.getHyperCubeData('/qHyperCubeDef', [
                { qTop: fetched, qLeft: 0, qWidth: colCount, qHeight: height },
            ]);
            if (!dataPages || dataPages.length === 0) break;
            const matrix = dataPages[0].qMatrix;
            if (!matrix || matrix.length === 0) break;
            for (const row of matrix) {
                if (row.length > textCol) {
                    result.push({
                        text: row[textCol]?.qText ?? '',
                        id:
                            hasIdentifier && row.length > idCol
                                ? (row[idCol]?.qText ?? null)
                                : null,
                    });
                }
            }
            fetched = result.length;
        } catch (err) {
            logger.warn('Pagination fetch failed, using partial data:', err);
            break;
        }
    }

    return result.length > 0 ? result : null;
}

/**
 * Fetch the distinct identifier values currently visible in the hypercube.
 *
 * The hypercube is selection-aware — when the user selects a value in a
 * filter pane, only matching rows appear. This makes it the correct source
 * for determining which script sources are "active".
 *
 * Identifier (script source) is always at col 2 (qDimensionInfo[2]).
 * All three dimensions are required; this function returns null only if
 * the hypercube hasn't received its layout yet.
 *
 * Strategy:
 * 1. Scan the pre-fetched qDataPages (no engine round-trip). If >1 distinct
 *    identifier is found, return immediately. If qDataPages already cover all
 *    rows (rowsSeen >= qSize.qcy), return the set as-is.
 * 2. Otherwise page through getHyperCubeData in PAGE_SIZE-cell chunks,
 *    exiting as soon as >1 distinct identifier is confirmed or all rows are
 *    exhausted.
 *
 * @param {object} layout - Qlik Sense layout object.
 * @param {object} model - Qlik engine model (GenericObject).
 *
 * @returns {Promise<string[]|null>} Distinct identifier values currently
 *   in scope, or null when the hypercube is not yet available.
 */
async function fetchActiveIdentifiers(layout, model) {
    const hc = layout?.qHyperCube;
    if (!hc) return null;

    // Script source is always at col 2
    const idCol = 2;

    if (!hc.qDimensionInfo?.[idCol]) return null;

    const totalRows = hc.qSize?.qcy || 0;
    if (totalRows === 0) return [];

    const colCount = hc.qSize?.qcx || 1;
    if (colCount <= idCol) return null;

    // ── Step 1: scan pre-fetched qDataPages (no engine round-trip) ──
    const idSet = new Set();
    let rowsSeen = 0;
    for (const page of hc.qDataPages || []) {
        for (const row of page.qMatrix || []) {
            if (row.length > idCol) {
                const id = row[idCol]?.qText;
                if (id != null && id !== '') {
                    idSet.add(id);
                }
            }
            rowsSeen++;
        }
    }

    // Early exit: multiple sources already confirmed
    if (idSet.size > 1) {
        return [...idSet];
    }

    // qDataPages covered every row — no need for extra engine calls
    if (rowsSeen >= totalRows) {
        return [...idSet];
    }

    // ── Step 2: page through getHyperCubeData until >1 ID or all rows read ──
    // getHyperCubeData has a PAGE_SIZE-cell limit (qWidth × qHeight).
    const maxRowsPerPage = Math.floor(PAGE_SIZE / colCount);
    let top = 0;
    try {
        while (top < totalRows) {
            const height = Math.min(totalRows - top, maxRowsPerPage);
            const dataPages = await model.getHyperCubeData('/qHyperCubeDef', [
                { qTop: top, qLeft: 0, qWidth: colCount, qHeight: height },
            ]);
            for (const page of dataPages || []) {
                for (const row of page.qMatrix || []) {
                    if (row.length > idCol) {
                        const id = row[idCol]?.qText;
                        if (id != null && id !== '') {
                            idSet.add(id);
                        }
                    }
                }
            }
            // Early exit: multiple sources confirmed — no need to read more pages
            if (idSet.size > 1) {
                return [...idSet];
            }
            top += height;
        }
    } catch (err) {
        logger.warn('fetchActiveIdentifiers: getHyperCubeData failed:', err);
    }

    return [...idSet];
}

/**
 * Extract the script source field name from the 3rd hypercube dimension.
 *
 * Handles plain field names, bracket-quoted names (`[FieldName]`), and
 * expression prefixes (`=[FieldName]`).
 *
 * @param {object} layout - Qlik Sense layout object.
 *
 * @returns {string|null} The field name, or null if unavailable.
 */
function getSourceFieldName(layout) {
    const dimInfo = layout?.qHyperCube?.qDimensionInfo?.[2];
    if (!dimInfo) return null;

    // qGroupFieldDefs[0] is the canonical field name for simple (non-grouped) dimensions
    let fieldName = dimInfo.qGroupFieldDefs?.[0] || dimInfo.qFallbackTitle;
    if (!fieldName) return null;

    // Strip expression prefix and outer brackets: "=[FieldName]" → "FieldName"
    fieldName = fieldName.replace(/^=/, '').replace(/^\[|\]$/g, '');

    return fieldName || null;
}

/**
 * Handle a script source selection from the selector dropdown.
 *
 * Calls `field.selectValues()` to set a selection on the script source field,
 * or `field.clear()` to remove any selection when value is null.
 *
 * @param {object} app - Qlik Doc API (from useApp hook).
 * @param {object} layout - Qlik Sense layout object.
 * @param {string|null} value - The selected value text, or null to clear.
 *
 * @returns {Promise<void>}
 */
async function handleAppSelect(app, layout, value) {
    if (!app) return;

    const fieldName = getSourceFieldName(layout);
    if (!fieldName) {
        logger.warn('App selector: could not determine script source field name');
        return;
    }

    try {
        const field = await app.getField(fieldName);
        if (!field) return;

        if (value == null) {
            await field.clear();
            logger.info(`App selector: cleared selection on "${fieldName}"`);
        } else {
            await field.selectValues([{ qText: value, qIsNumeric: false }], false, false);
            logger.info(`App selector: selected "${value}" in "${fieldName}"`);
        }
    } catch (err) {
        logger.warn('App selector: selection failed:', err);
    }
}
