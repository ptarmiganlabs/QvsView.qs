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

            // Fetch raw row data — prefer GetTableData (preserves empty/duplicate rows)
            useEffect(() => {
                if (!layout || !model) return;

                // Reset immediately so the render effect never sees a stale rawRows/activeIds
                // combination (e.g. new activeIds arriving before new rawRows would otherwise
                // produce an empty filteredRows and trigger the wrong placeholder).
                setRawRows(null);
                setActiveIds(null);

                /**
                 * Load raw row data, preferring GetTableData over hypercube.
                 * Returns per-row objects with text and optional identifier.
                 *
                 * @returns {Promise<Array<{text: string, id: string|null}>|null>}
                 *   Array of row objects, or null if no data.
                 */
                const load = async () => {
                    // Try GetTableData first (preserves row order and duplicates)
                    if (app) {
                        const result = await fetchViaTableData(app, layout);
                        if (result) return result;
                    }
                    // Fall back to hypercube (deduplicates, but works everywhere)
                    return fetchAllRows(layout, model);
                };

                load()
                    .then(setRawRows)
                    .catch((err) => {
                        logger.warn('Data fetch failed:', err);
                        setRawRows(null);
                    });

                // Also fetch active identifiers from the hypercube
                if (layout.qHyperCube?.qDimensionInfo?.[1]) {
                    fetchActiveIdentifiers(layout, model).then(setActiveIds);
                } else {
                    setActiveIds(null);
                }
            }, [layout, model, app]);

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

                // Both dimensions must be configured before rendering
                const dimCount = layout.qHyperCube?.qDimensionInfo?.length ?? 0;
                if (dimCount < 2) {
                    renderPlaceholder(element, 'Add both dimensions to view scripts');
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

                renderViewer(element, {
                    script,
                    showLineNumbers: viewerOpts.showLineNumbers !== false,
                    wordWrap: viewerOpts.wordWrap === true,
                    fontSize: viewerOpts.fontSize || 13,
                    enableFolding: viewerOpts.enableFolding !== false,
                    showCopyButton: toolbarOpts.showCopyButton !== false,
                    showFontSizeDropdown: toolbarOpts.showFontSizeDropdown === true,
                    showSearch: toolbarOpts.showSearch === true,
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
 * Fetch script rows using GetTableData (preserves duplicate/empty rows).
 *
 * Unlike the hypercube, GetTableData returns raw table data from the data
 * model without deduplication, so identical or empty text lines are preserved.
 *
 * Note: GetTableData is NOT selection-aware — it always returns the full
 * table contents regardless of user selections. The caller must use the
 * hypercube (via getActiveIdentifiers) to determine which identifiers are
 * currently in scope and filter the rows accordingly.
 *
 * Important: GetTablesAndKeys reports fields in an order (key fields first)
 * that does NOT match the column order returned by GetTableData (load order).
 * Column mapping is resolved by probing sample values from the hypercube
 * against GetTableData columns.
 *
 * @param {object} app - Qlik Doc API (from useApp hook).
 * @param {object} layout - Qlik Sense layout object.
 *
 * @returns {Promise<Array<{text: string, id: string|null}>|null>}
 *   Array of per-row objects (text + optional identifier), or null on failure.
 */
async function fetchViaTableData(app, layout) {
    const hc = layout?.qHyperCube;
    if (!hc) return null;

    const dimInfo = hc.qDimensionInfo?.[0];
    if (!dimInfo) return null;

    // Extract the field name from the dimension definition
    let fieldName = dimInfo.qGroupFieldDefs?.[0] || dimInfo.qFallbackTitle;
    if (!fieldName) return null;

    // Strip expression prefix and brackets: "=[Line]" -> "Line"
    fieldName = fieldName.replace(/^=/, '').replace(/^\[|\]$/g, '');

    // Check for optional second dimension (identifier)
    const idDimInfo = hc.qDimensionInfo?.[1];
    let idFieldName = null;
    if (idDimInfo) {
        idFieldName = idDimInfo.qGroupFieldDefs?.[0] || idDimInfo.qFallbackTitle;
        if (idFieldName) {
            idFieldName = idFieldName.replace(/^=/, '').replace(/^\[|\]$/g, '');
        }
    }

    try {
        // Get table/field mapping from the data model
        const { qtr: tables } = await app.getTablesAndKeys(
            { qcx: 0, qcy: 0 },
            { qcx: 0, qcy: 0 },
            0,
            false,
            false
        );

        // Find the table that contains our script field
        let tableName = null;
        let totalRows = 0;

        for (const table of tables || []) {
            const found = (table.qFields || []).some((f) => f.qName === fieldName);
            if (found) {
                tableName = table.qName;
                totalRows = table.qNoOfRows;
                break;
            }
        }

        if (!tableName || totalRows === 0) {
            logger.debug(`GetTableData: field "${fieldName}" not found in any table`);
            return null;
        }

        // Verify the identifier field is in the same table (if configured)
        if (idFieldName) {
            const targetTable = (tables || []).find((t) => t.qName === tableName);
            const idInTable = (targetTable?.qFields || []).some((f) => f.qName === idFieldName);
            if (!idInTable) {
                logger.debug(
                    `GetTableData: identifier field "${idFieldName}" not in table "${tableName}"`
                );
                idFieldName = null;
            }
        }

        // Fetch all rows — GetTableData preserves duplicates and order
        const rows = await app.getTableData(0, totalRows, false, tableName);
        if (!rows || rows.length === 0) return null;

        const colCount = rows[0]?.qValue?.length || 0;
        if (colCount === 0) return null;

        // Resolve actual column indices by probing values against the hypercube.
        // GetTablesAndKeys field order does NOT match GetTableData column order
        // (the former sorts key fields first; the latter uses load order).
        const fieldIndex = resolveColumnIndex(hc, 0, rows, colCount);
        let idFieldIndex = -1;
        if (idFieldName && hc.qDimensionInfo?.[1]) {
            idFieldIndex = resolveColumnIndex(hc, 1, rows, colCount);
        }

        // Guard: text and id columns must not collide
        if (idFieldIndex >= 0 && idFieldIndex === fieldIndex) {
            logger.warn('GetTableData: column collision — text and id resolved to same column');
            idFieldIndex = -1;
        }

        const result = rows.map((row) => {
            const values = row.qValue || [];
            return {
                text: fieldIndex < values.length ? (values[fieldIndex]?.qText ?? '') : '',
                id:
                    idFieldIndex >= 0 && idFieldIndex < values.length
                        ? (values[idFieldIndex]?.qText ?? null)
                        : null,
            };
        });

        logger.info(
            `GetTableData: ${result.length} rows from "${tableName}.${fieldName}" (col ${fieldIndex})`
        );
        return result.length > 0 ? result : null;
    } catch (err) {
        logger.warn('GetTableData failed:', err);
        return null;
    }
}

/**
 * Determine the correct GetTableData column index for a hypercube dimension.
 *
 * GetTablesAndKeys reports fields in an order that does not match
 * GetTableData column order. This function probes sample values from the
 * hypercube's pre-fetched qDataPages and matches them against GetTableData
 * columns to find the correct mapping.
 *
 * @param {object} hc - The qHyperCube from the layout.
 * @param {number} dimIndex - Dimension index in the hypercube (0-based).
 * @param {Array} sampleRows - A few rows from GetTableData.
 * @param {number} colCount - Number of columns in GetTableData rows.
 *
 * @returns {number} The resolved column index in GetTableData.
 */
function resolveColumnIndex(hc, dimIndex, sampleRows, colCount) {
    // Collect known values for this dimension from the hypercube's pre-fetched pages
    const knownValues = new Set();
    for (const page of hc.qDataPages || []) {
        for (const row of page.qMatrix || []) {
            if (row.length > dimIndex) {
                const val = row[dimIndex]?.qText;
                if (val != null && val !== '' && val !== '-') {
                    knownValues.add(val);
                }
            }
            if (knownValues.size >= 50) break;
        }
        if (knownValues.size >= 50) break;
    }

    if (knownValues.size === 0) return dimIndex;

    // Score each GetTableData column by counting matches against known values.
    // Check up to 20 sample rows to reduce false positives.
    const maxProbe = Math.min(sampleRows.length, 20);
    const scores = new Array(colCount).fill(0);

    for (let r = 0; r < maxProbe; r++) {
        const values = sampleRows[r]?.qValue || [];
        for (let c = 0; c < colCount; c++) {
            if (knownValues.has(values[c]?.qText)) {
                scores[c]++;
            }
        }
    }

    // The column with the highest score is the best match
    let bestCol = dimIndex < colCount ? dimIndex : 0;
    let bestScore = -1;
    for (let c = 0; c < colCount; c++) {
        if (scores[c] > bestScore) {
            bestScore = scores[c];
            bestCol = c;
        }
    }

    if (bestScore === 0) {
        // No matches found — fall back to the dimension index as-is
        logger.debug(`resolveColumnIndex: no matches for dim ${dimIndex}, using fallback`);
        return dimIndex < colCount ? dimIndex : 0;
    }

    return bestCol;
}

/**
 * Fetch all rows from the hypercube, paginating if necessary.
 *
 * Fallback method when GetTableData is unavailable. Note: the hypercube
 * deduplicates dimension values, so identical/empty lines may be collapsed.
 * However, it IS selection-aware — only rows matching active selections
 * are included.
 *
 * @param {object} layout - Qlik Sense layout object.
 * @param {object} model - Qlik engine model (GenericObject).
 *
 * @returns {Promise<Array<{text: string, id: string|null}>|null>}
 *   Array of per-row objects (text + optional identifier), or null if no data.
 */
async function fetchAllRows(layout, model) {
    const hc = layout?.qHyperCube;
    if (!hc) return null;

    const totalRows = hc.qSize?.qcy || 0;
    if (totalRows === 0) return null;

    const colCount = hc.qSize?.qcx || 1;
    const hasIdentifier = colCount >= 2;

    // Collect rows from initial data pages
    const result = [];
    const pages = hc.qDataPages;
    if (pages) {
        for (const page of pages) {
            if (page.qMatrix) {
                for (const row of page.qMatrix) {
                    if (row.length > 0) {
                        result.push({
                            text: row[0]?.qText ?? '',
                            id: hasIdentifier && row.length > 1 ? (row[1]?.qText ?? null) : null,
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
                if (row.length > 0) {
                    result.push({
                        text: row[0]?.qText ?? '',
                        id: hasIdentifier && row.length > 1 ? (row[1]?.qText ?? null) : null,
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
 *   in scope, or null when no second dimension is configured.
 */
async function fetchActiveIdentifiers(layout, model) {
    const hc = layout?.qHyperCube;
    if (!hc?.qDimensionInfo?.[1]) return null;

    const totalRows = hc.qSize?.qcy || 0;
    if (totalRows === 0) return [];

    const colCount = hc.qSize?.qcx || 1;
    if (colCount < 2) return null;

    // ── Step 1: scan pre-fetched qDataPages (no engine round-trip) ──
    const idSet = new Set();
    let rowsSeen = 0;
    for (const page of hc.qDataPages || []) {
        for (const row of page.qMatrix || []) {
            if (row.length > 1) {
                const id = row[1]?.qText;
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
                    if (row.length > 1) {
                        const id = row[1]?.qText;
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
