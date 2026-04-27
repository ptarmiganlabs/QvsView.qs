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
            // Full script for the currently active source, fetched via a
            // secondary session hypercube whose measure uses set analysis
            // to ignore selections in the script-text field (Dim 2).
            // null when no single source is active or the fetch is pending.
            const [overrideScript, setOverrideScript] = useState(null);

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

            // Discover the three configured field names from layout. Used as
            // primitive deps for the override-fetch effect below so that the
            // session hypercube is recreated only when field names change,
            // not on every selection-driven layout update.
            const dimInfo = layout?.qHyperCube?.qDimensionInfo;
            const rowField = dimInfo?.[0]?.qGroupFieldDefs?.[0] || null;
            const textField = dimInfo?.[1]?.qGroupFieldDefs?.[0] || null;
            const sourceField = dimInfo?.[2]?.qGroupFieldDefs?.[0] || null;
            const activeSourceId = activeIds && activeIds.length === 1 ? activeIds[0] : null;

            // Fetch the FULL script for the currently active source via a
            // secondary session hypercube whose measure uses set analysis to
            // ignore selections in the script-text field (Dim 2). This is what
            // gives the user the "single-source = full script even with a
            // Dim-2 selection" behaviour. All other selections are honored
            // naturally because they still apply to the session hypercube.
            useEffect(() => {
                if (!app || !rowField || !textField || !sourceField || !activeSourceId) {
                    setOverrideScript(null);
                    return undefined;
                }

                let cancelled = false;
                let sessionModel = null;
                let changedHandler = null;

                const def = {
                    qInfo: { qType: 'qvs-script-override' },
                    qHyperCubeDef: {
                        qDimensions: [
                            {
                                qDef: {
                                    qFieldDefs: [`[${sourceField}]`],
                                    qSortCriterias: [{ qSortByAscii: 1 }],
                                },
                            },
                        ],
                        qMeasures: [
                            {
                                qDef: {
                                    qDef: `=Concat({<[${textField}]=>} [${textField}], Chr(10), [${rowField}])`,
                                },
                            },
                        ],
                        qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 2, qHeight: 1000 }],
                    },
                };

                /**
                 * Find the active source row in the session hypercube layout
                 * and update overrideScript with its measure value.
                 *
                 * @param {object} l - Session-object layout.
                 */
                const handleLayout = (l) => {
                    if (cancelled) return;
                    const matrix = l?.qHyperCube?.qDataPages?.[0]?.qMatrix || [];
                    const row = matrix.find((r) => r[0]?.qText === activeSourceId);
                    setOverrideScript(row?.[1]?.qText ?? '');
                };

                app.createSessionObject(def)
                    .then(async (m) => {
                        if (cancelled) {
                            app.destroySessionObject(m.id).catch(() => {
                                /* ignore */
                            });
                            return;
                        }
                        sessionModel = m;
                        try {
                            const l = await m.getLayout();
                            handleLayout(l);
                        } catch (e) {
                            logger.warn('Override session getLayout failed:', e);
                        }
                        /**
                         * Re-read the session-object layout when the engine
                         * notifies us of a change (e.g. selections changed in
                         * a non-ignored field, or initial pages arrived).
                         */
                        changedHandler = async () => {
                            try {
                                const ll = await m.getLayout();
                                handleLayout(ll);
                            } catch (e) {
                                logger.warn('Override session changed-layout failed:', e);
                            }
                        };
                        m.on('changed', changedHandler);
                    })
                    .catch((err) => {
                        logger.warn('Failed to create override session hypercube:', err);
                        if (!cancelled) setOverrideScript(null);
                    });

                return () => {
                    cancelled = true;
                    if (sessionModel) {
                        if (changedHandler && typeof sessionModel.removeListener === 'function') {
                            try {
                                sessionModel.removeListener('changed', changedHandler);
                            } catch {
                                /* ignore */
                            }
                        }
                        app.destroySessionObject(sessionModel.id).catch(() => {
                            /* ignore */
                        });
                    }
                };
            }, [app, rowField, textField, sourceField, activeSourceId]);

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

                // When a single source is active, prefer the override script
                // returned by the secondary set-analysis hypercube (which ignores
                // selections in the script-text field). Fall back to the
                // selection-aware rawRows for the brief moment before the
                // override fetch resolves, and for the no-source-selected case.
                let script;
                if (activeIds && activeIds.length === 1 && overrideScript !== null) {
                    script = overrideScript;
                } else if (activeIds && activeIds.length === 1) {
                    script = rawRows
                        .filter((r) => r.id === activeIds[0])
                        .map((r) => r.text)
                        .join('\n');
                } else {
                    script = rawRows.map((r) => r.text).join('\n');
                }
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
                    showCollapseButtons: toolbarOpts.showCollapseButtons === true,
                    showAiAnalysis: aiEnabled,
                    aiConfig: aiEnabled ? aiOpts : null,
                    onAiAnalyze: aiEnabled ? (info) => handleAiAnalyze(info, aiOpts) : null,
                });
            }, [layout, element, rawRows, activeIds, overrideScript, bnfReady]);
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
