/**
 * Viewer display settings section for the property panel.
 *
 * Controls line numbers, word wrap, font size, and runtime BNF fetching.
 *
 * @returns {object} Property panel section definition.
 */
export function viewerSection() {
    return {
        type: 'items',
        label: 'Viewer Settings',
        items: {
            showLineNumbers: {
                ref: 'viewer.showLineNumbers',
                type: 'boolean',
                label: 'Show line numbers',
                defaultValue: true,
                component: 'switch',
                options: [
                    { value: true, label: 'On' },
                    { value: false, label: 'Off' },
                ],
            },
            wordWrap: {
                ref: 'viewer.wordWrap',
                type: 'boolean',
                label: 'Word wrap',
                defaultValue: false,
                component: 'switch',
                options: [
                    { value: true, label: 'On' },
                    { value: false, label: 'Off' },
                ],
            },
            fontSize: {
                ref: 'viewer.fontSize',
                type: 'number',
                label: 'Font size (px)',
                defaultValue: 13,
                component: 'dropdown',
                options: [
                    { value: 10, label: '10' },
                    { value: 11, label: '11' },
                    { value: 12, label: '12' },
                    { value: 13, label: '13' },
                    { value: 14, label: '14' },
                    { value: 16, label: '16' },
                    { value: 18, label: '18' },
                    { value: 20, label: '20' },
                ],
            },
            enableFolding: {
                ref: 'viewer.enableFolding',
                type: 'boolean',
                label: 'Code folding',
                defaultValue: true,
                component: 'switch',
                options: [
                    { value: true, label: 'On' },
                    { value: false, label: 'Off' },
                ],
                description:
                    'Allow collapsing multi-line LOAD/SELECT statements, ' +
                    'SUB/END SUB, IF/END IF, FOR/NEXT, block comments, and other code blocks.',
            },
            useRuntimeBnf: {
                ref: 'viewer.useRuntimeBnf',
                type: 'boolean',
                label: 'Live keyword updates',
                defaultValue: false,
                component: 'switch',
                options: [
                    { value: true, label: 'On' },
                    { value: false, label: 'Off' },
                ],
                description:
                    'Fetch the latest keyword and function lists from the Qlik Engine at runtime. ' +
                    'Ensures highlighting stays current with your Qlik Sense version. ' +
                    'When off, uses the built-in keyword list bundled with the extension.',
            },
        },
    };
}
