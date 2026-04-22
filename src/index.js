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
    useRef,
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
            const element = useElement();

            /**
             * Raw row data from GetTableData. Contains per-row identifiers
             * when a second dimension is configured, enabling client-side
             * filtering based on hypercube selection state.
             */
            const [rawRows, setRawRows] = useState(null);
            const [activeIds, setActiveIds] = useState(null);
            const [bnfReady, setBnfReady] = useState(false);

            /**
             * Guard flag: prevents a second setProperties call being dispatched
             * while the first async injection round-trip is still in flight.
             */
            const rowNoInjecting = useRef(false);

            useEffect(() => {
                logger.info(`QvsView.qs v${PACKAGE_VERSION} (${BUILD_DATE})`);
            }, []);

            // Silently inject RowNo() at qDimensions[0] when it is not yet present.
            // This runs once the user has added at least one user dimension and
            // transparently migrates both new and legacy (pre-RowNo) objects.
            // The guard ref prevents a second call while the async round-trip is
            // in flight; the isRowNoDimension check prevents re-injection on the
            // updated layout that follows setProperties().
            useEffect(() => {
                if (!layout || !model) return;

                const hc = layout.qHyperCube;
                const dimCount = hc?.qDimensionInfo?.length ?? 0;

                // Nothing to inject until the user has added at least one dim
                if (dimCount < 1) return;

                // Already injected — reset the in-flight guard for future removals
                if (isRowNoDimension(hc)) {
                    rowNoInjecting.current = false;
                    return;
                }

                // Avoid a second dispatch while the first is still in flight
                if (rowNoInjecting.current) return;
                rowNoInjecting.current = true;

                model
                    .getProperties()
                    .then((props) => {
                        const dims = props.qHyperCubeDef?.qDimensions ?? [];
                        if (dims.length === 0) return;

                        // Re-check inside the async callback (race-condition guard)
                        if (dims[0]?.qDef?.qFieldDefs?.[0]?.includes('RowNo()')) return;

                        logger.info('Injecting RowNo() dimension at index 0');

                        // RowNo() evaluates to the physical (load-order) row number for
                        // each data row, so sorting by it numerically ascending preserves
                        // the original script line order.
                        // qInterColumnSortOrder [0, 1, …] keeps RowNo as the primary sort
                        // key; all user dims follow as tie-breakers.
                        const interColumnSortOrder = [
                            0,
                            ...Array.from({ length: dims.length }, (_, i) => i + 1),
                        ];

                        return model.setProperties({
                            ...props,
                            qHyperCubeDef: {
                                ...props.qHyperCubeDef,
                                qDimensions: [
                                    {
                                        qDef: {
                                            qFieldDefs: ['=RowNo()'],
                                            qFieldLabels: [''],
                                            qSortCriterias: [
                                                { qSortByNumeric: 1, qSortByAscii: 0 },
                                            ],
                                        },
                                        qNullSuppression: false,
                                    },
                                    ...dims,
                                ],
                                // RowNo numeric ascending = script line order
                                qInterColumnSortOrder: interColumnSortOrder,
                                // Widen the initial fetch to cover the new column
                                qInitialDataFetch: [{ qWidth: 3, qHeight: 3333 }],
                            },
                        });
                    })
                    .catch((err) => {
                        // Silently ignore — the object may be read-only (view mode)
                        logger.debug('RowNo injection skipped:', err);
                        rowNoInjecting.current = false;
                    });
            }, [layout, model]);

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

            // Fetch raw row data via the hypercube (RowNo() dimension prevents deduplication)
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

                // Also fetch active identifiers from the hypercube
                const idDimIndex = isRowNoDimension(layout.qHyperCube) ? 2 : 1;
                if (layout.qHyperCube?.qDimensionInfo?.[idDimIndex]) {
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

                // Both user dimensions must be configured before rendering.
                // RowNo() may or may not be injected yet; we only require the
                // two user-supplied dims (script text + script source).
                const dimCount = layout.qHyperCube?.qDimensionInfo?.length ?? 0;
                if (dimCount < 2) {
                    renderPlaceholder(
                        element,
                        'Add both script text and source dimensions to view scripts'
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

                // Debug: log script to console when exactly one source is active
                if (activeIds && activeIds.length === 1) {
                    const lines = filteredRows.map((r) => r.text);
                    logger.info(
                        `[QvsView debug] Source: "${activeIds[0]}" — ${lines.length} lines`
                    );
                    lines.forEach((line, i) => {
                        logger.info(
                            `[QvsView debug] ${String(i + 1).padStart(4, ' ')}: ${JSON.stringify(line)}`
                        );
                    });
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
 * Determine whether the first hypercube dimension is the auto-injected RowNo().
 *
 * When RowNo() is present, the column layout is:
 *   col 0 — RowNo()      (discard)
 *   col 1 — script text
 *   col 2 — identifier   (optional)
 *
 * When RowNo() is absent (legacy or pre-injection layout):
 *   col 0 — script text
 *   col 1 — identifier   (optional)
 *
 * @param {object|null|undefined} hc - The qHyperCube from the layout.
 *
 * @returns {boolean} True when RowNo() occupies column 0.
 */
function isRowNoDimension(hc) {
    if (!hc) return false;
    // qGroupFieldDefs is populated in NxDimensionInfo for expression-based dims
    const fieldDef = hc.qDimensionInfo?.[0]?.qGroupFieldDefs?.[0] ?? '';
    if (fieldDef.includes('RowNo()')) return true;
    // Fallback: if the engine uses the expression as the fallback title
    const title = hc.qDimensionInfo?.[0]?.qFallbackTitle ?? '';
    return title === 'RowNo()';
}

/**
 * Fetch all rows from the hypercube, paginating if necessary.
 *
 * Supports both column layouts transparently:
 *   New (RowNo injected)  — col 0 = RowNo, col 1 = text, col 2 = identifier
 *   Legacy (no RowNo)     — col 0 = text,  col 1 = identifier
 *
 * The hypercube is selection-aware — only rows matching active selections
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
    const newFormat = isRowNoDimension(hc);
    const textCol = newFormat ? 1 : 0;
    const idCol = newFormat ? 2 : 1;
    const hasIdentifier = newFormat ? colCount >= 3 : colCount >= 2;

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
 * Supports both column layouts:
 *   New (RowNo injected)  — identifier is at col 2 (qDimensionInfo[2])
 *   Legacy (no RowNo)     — identifier is at col 1 (qDimensionInfo[1])
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
 *   in scope, or null when no identifier dimension is configured.
 */
async function fetchActiveIdentifiers(layout, model) {
    const hc = layout?.qHyperCube;
    if (!hc) return null;

    const newFormat = isRowNoDimension(hc);
    const idCol = newFormat ? 2 : 1;

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
