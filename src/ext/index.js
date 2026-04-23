/**
 * Extension property panel definition for QvsView.qs.
 *
 * Defines the property panel shown in edit mode with
 * viewer settings and about information.
 *
 * The dimension picker (script field) is provided automatically
 * by the nebula.js data target defined in data.js.
 *
 * @param {object} _galaxy - Nebula galaxy object.
 *
 * @returns {object} Property panel definition.
 */

import { viewerSection } from './viewer-section.js';
import { toolbarSection } from './toolbar-section.js';
import { aiSection } from './ai-section.js';
import { aboutSection } from './about-section.js';

/**
 * Property panel entry point.
 *
 * @param {object} _galaxy - Nebula galaxy object.
 *
 * @returns {object} Property panel definition with support flags and sections.
 */
export default function ext(_galaxy) {
    return {
        support: {
            snapshot: false,
            export: false,
            exportData: false,
            sharing: false,
            viewData: false,
        },
        definition: {
            type: 'items',
            component: 'accordion',
            items: {
                data: {
                    uses: 'data',
                    items: {
                        dimensionsHint: {
                            component: 'text',
                            label:
                                'Add all 3 dimensions (required) in order:\n\n' +
                                '1 · Row number — a field holding the load-order row number ' +
                                '(e.g. a field populated with RecNo() or RowNo() during the data load script).\n\n' +
                                '2 · Script text — the field where each row contains one line of Qlik script ' +
                                '(e.g. "Script_Data").\n\n' +
                                '3 · Script source — a field that uniquely identifies the script file or app ' +
                                '(e.g. "FileName", "AppID"). Used for multi-source filtering.',
                        },
                    },
                },
                sorting: {
                    uses: 'sorting',
                },
                viewerSection: viewerSection(),
                toolbarSection: toolbarSection(),
                aiSection: aiSection(),
                appearance: {
                    uses: 'settings',
                },
                aboutSection: aboutSection(),
            },
        },
    };
}
