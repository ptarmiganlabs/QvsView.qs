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
    useState,
    onContextMenu,
} from '@nebula.js/stardust';
import ext from './ext/index.js';
import data from './data.js';
import definition from './object-properties.js';
import { renderViewer, renderPlaceholder } from './ui/viewer.js';
import { applyRuntimeBnf, resetToStaticBnf } from './syntax/keywords.js';
import { fetchRuntimeBnf, clearBnfCache } from './syntax/bnf-loader.js';
import logger, { PACKAGE_VERSION, BUILD_DATE } from './util/logger.js';
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
            const [script, setScript] = useState(null);
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

            // Fetch all hypercube data (with pagination for large scripts)
            useEffect(() => {
                if (!layout || !model) return;
                fetchAllRows(layout, model).then(setScript);
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

            // Render when script or layout changes
            useEffect(() => {
                if (!layout) return;

                if (!script) {
                    renderPlaceholder(element);
                    return;
                }

                const viewerOpts = layout.viewer || {};

                renderViewer(element, {
                    script,
                    showLineNumbers: viewerOpts.showLineNumbers !== false,
                    wordWrap: viewerOpts.wordWrap === true,
                    fontSize: viewerOpts.fontSize || 13,
                });
            }, [layout, element, script, bnfReady]);
        },
    };
}

/**
 * Fetch all rows from the hypercube, paginating if necessary.
 *
 * The initial data fetch (from qInitialDataFetch) is included in the layout.
 * If the total row count exceeds what was fetched, additional pages are
 * requested via GetHyperCubeData.
 *
 * @param {object} layout - Qlik Sense layout object.
 * @param {object} model - Qlik engine model (GenericObject).
 *
 * @returns {Promise<string|null>} The combined script text, or null if no data.
 */
async function fetchAllRows(layout, model) {
    const hc = layout?.qHyperCube;
    if (!hc) return null;

    const totalRows = hc.qSize?.qcy || 0;
    if (totalRows === 0) return null;

    // Collect rows from initial data pages
    const lines = [];
    const pages = hc.qDataPages;
    if (pages) {
        for (const page of pages) {
            if (page.qMatrix) {
                for (const row of page.qMatrix) {
                    if (row.length > 0) {
                        lines.push(row[0]?.qText ?? '');
                    }
                }
            }
        }
    }

    // If we already have all rows, we're done
    if (lines.length >= totalRows) {
        return lines.length > 0 ? lines.join('\n') : null;
    }

    // Fetch remaining pages
    let fetched = lines.length;
    while (fetched < totalRows) {
        const height = Math.min(PAGE_SIZE, totalRows - fetched);
        try {
            const dataPages = await model.getHyperCubeData('/qHyperCubeDef', [
                { qTop: fetched, qLeft: 0, qWidth: 1, qHeight: height },
            ]);
            if (!dataPages || dataPages.length === 0) break;
            const matrix = dataPages[0].qMatrix;
            if (!matrix || matrix.length === 0) break;
            for (const row of matrix) {
                if (row.length > 0) {
                    lines.push(row[0]?.qText ?? '');
                }
            }
            fetched = lines.length;
        } catch (err) {
            logger.warn('Pagination fetch failed, using partial data:', err);
            break;
        }
    }

    return lines.length > 0 ? lines.join('\n') : null;
}
