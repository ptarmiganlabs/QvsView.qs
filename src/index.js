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
import { renderViewer, renderPlaceholder, renderWarning } from './ui/viewer.js';
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

                load().then(setRawRows);

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

                if (!rawRows || rawRows.length === 0) {
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
    const template = aiOpts.promptTemplate || 'general';
    const customPrompt = aiOpts.systemPrompt || '';
    const systemPrompt = getSystemPrompt(template, customPrompt || undefined);

    const quoteCycle = aiOpts.quoteCycleSeconds || 5;

    const modal = showAiModal({
        container: document.body,
        quoteCycleSeconds: quoteCycle,
        sectionCount,
        activeSectionName,
        /**
         * Run the AI analysis, checking cache first.
         *
         * @param {object} opts - Analysis options.
         * @param {boolean} opts.bypassCache - Whether to skip the cache.
         * @param {string} opts.scope - 'section' or 'full'.
         *
         * @returns {Promise<{content: string, model: string, provider: string}>} Analysis result.
         */
        onAnalyze: async ({ bypassCache, scope }) => {
            const scriptText = scope === 'section' ? sectionScript : fullScript;

            // Check cache first (unless bypass requested)
            if (!bypassCache) {
                const cached = getCachedResult(scriptText, aiOpts);
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

            const result = await analyzeScript(aiOpts, scriptText, {
                systemPrompt,
                apiKey,
                bypassCache,
            });

            // Cache the result
            setCachedResult(scriptText, aiOpts, result);

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
            true,
            false
        );

        // Find the table that contains our script field
        let tableName = null;
        let fieldIndex = 0;
        let totalRows = 0;

        for (const table of tables || []) {
            const idx = (table.qFields || []).findIndex((f) => f.qName === fieldName);
            if (idx >= 0) {
                tableName = table.qName;
                fieldIndex = idx;
                totalRows = table.qNoOfRows;
                break;
            }
        }

        if (!tableName || totalRows === 0) {
            logger.debug(`GetTableData: field "${fieldName}" not found in any table`);
            return null;
        }

        // Find the identifier field index in the same table (if configured)
        let idFieldIndex = -1;
        if (idFieldName) {
            for (const table of tables || []) {
                if (table.qName === tableName) {
                    idFieldIndex = (table.qFields || []).findIndex((f) => f.qName === idFieldName);
                    break;
                }
            }
            if (idFieldIndex < 0) {
                logger.debug(
                    `GetTableData: identifier field "${idFieldName}" not in table "${tableName}"`
                );
            }
        }

        // Fetch all rows — GetTableData preserves duplicates and order
        const rows = await app.getTableData(0, totalRows, true, tableName);

        const result = (rows || []).map((row) => {
            const values = row.qValue || [];
            return {
                text: values[fieldIndex]?.qText ?? '',
                id: idFieldIndex >= 0 ? (values[idFieldIndex]?.qText ?? null) : null,
            };
        });

        logger.info(`GetTableData: ${result.length} rows from "${tableName}.${fieldName}"`);
        return result.length > 0 ? result : null;
    } catch (err) {
        logger.warn('GetTableData failed:', err);
        return null;
    }
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
 * First tries the pre-fetched qDataPages in the layout. If those are empty
 * (which happens when qWidth × qHeight exceeds the 10 000 cell limit, e.g.
 * on existing objects with qHeight: 10000 and qWidth: 2 = 20 000), falls
 * back to an explicit getHyperCubeData call to fetch a small page.
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

    // Try qDataPages first (fast, no engine round-trip)
    const idSet = new Set();
    for (const page of hc.qDataPages || []) {
        for (const row of page.qMatrix || []) {
            if (row.length > 1) {
                const id = row[1]?.qText;
                if (id != null && id !== '') {
                    idSet.add(id);
                }
            }
        }
    }

    if (idSet.size > 0) {
        return [...idSet];
    }

    // qDataPages empty — fetch a small page from the engine directly.
    // We only need enough rows to capture all distinct identifier values.
    // Typical script files: 2–10 sources, so a few hundred rows suffices.
    const totalRows = hc.qSize?.qcy || 0;
    if (totalRows === 0) return [];

    const colCount = hc.qSize?.qcx || 1;
    if (colCount < 2) return null;

    try {
        // getHyperCubeData has a 10 000-cell limit (qWidth × qHeight)
        const maxRows = Math.floor(PAGE_SIZE / colCount);
        const height = Math.min(totalRows, maxRows);
        const dataPages = await model.getHyperCubeData('/qHyperCubeDef', [
            { qTop: 0, qLeft: 0, qWidth: colCount, qHeight: height },
        ]);
        if (dataPages && dataPages.length > 0) {
            for (const row of dataPages[0].qMatrix || []) {
                if (row.length > 1) {
                    const id = row[1]?.qText;
                    if (id != null && id !== '') {
                        idSet.add(id);
                    }
                }
            }
        }
    } catch (err) {
        logger.warn('fetchActiveIdentifiers: getHyperCubeData failed:', err);
    }

    return [...idSet];
}
