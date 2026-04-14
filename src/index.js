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

import { useElement, useLayout, useEffect } from '@nebula.js/stardust';
import ext from './ext/index.js';
import data from './data.js';
import definition from './object-properties.js';
import { renderViewer, renderPlaceholder } from './ui/viewer.js';
import logger, { PACKAGE_VERSION, BUILD_DATE } from './util/logger.js';
import './style.css';

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
            const element = useElement();

            useEffect(() => {
                logger.info(`QvsView.qs v${PACKAGE_VERSION} (${BUILD_DATE})`);
            }, []);

            useEffect(() => {
                if (!layout) return;

                // Extract script text from hypercube
                const script = extractScript(layout);

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
            }, [layout, element]);
        },
    };
}

/**
 * Extract script text from the hypercube in layout.
 *
 * Each row in the hypercube represents one value from the script field.
 * Rows are joined with newlines to form the complete script.
 *
 * @param {object} layout - Qlik Sense layout object.
 *
 * @returns {string|null} The combined script text, or null if no data.
 */
function extractScript(layout) {
    const hc = layout?.qHyperCube;
    if (!hc) return null;

    const pages = hc.qDataPages;
    if (!pages || pages.length === 0) return null;

    const lines = [];
    for (const page of pages) {
        const matrix = page.qMatrix;
        if (!matrix) continue;
        for (const row of matrix) {
            if (row.length > 0 && row[0]?.qText != null) {
                lines.push(row[0].qText);
            }
        }
    }

    if (lines.length === 0) return null;

    // If the field contains the full script in a single value,
    // return it directly. If it's multiple rows, join them.
    return lines.join('\n');
}
