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
            snapshot: true,
            export: true,
            sharing: false,
            viewData: false,
        },
        definition: {
            type: 'items',
            component: 'accordion',
            items: {
                data: {
                    uses: 'data',
                },
                viewerSection: viewerSection(),
                aboutSection: aboutSection(),
            },
        },
    };
}
