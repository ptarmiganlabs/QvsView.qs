/**
 * Viewer toolbar settings section for the property panel.
 *
 * Controls visibility of toolbar items: copy button, font size dropdown,
 * search bar, and script file selection dropdown.
 *
 * @returns {object} Property panel section definition.
 */
export function toolbarSection() {
    return {
        type: 'items',
        label: 'Viewer Toolbar',
        items: {
            showCopyButton: {
                ref: 'toolbar.showCopyButton',
                type: 'boolean',
                label: 'Copy button',
                defaultValue: true,
                component: 'switch',
                options: [
                    { value: true, label: 'On' },
                    { value: false, label: 'Off' },
                ],
            },
            showFontSizeDropdown: {
                ref: 'toolbar.showFontSizeDropdown',
                type: 'boolean',
                label: 'Font size dropdown',
                defaultValue: false,
                component: 'switch',
                options: [
                    { value: true, label: 'On' },
                    { value: false, label: 'Off' },
                ],
            },
            showSearch: {
                ref: 'toolbar.showSearch',
                type: 'boolean',
                label: 'Search',
                defaultValue: false,
                component: 'switch',
                options: [
                    { value: true, label: 'On' },
                    { value: false, label: 'Off' },
                ],
            },
            showAppSelector: {
                ref: 'toolbar.showAppSelector',
                type: 'boolean',
                label: 'Script file selection',
                defaultValue: false,
                component: 'switch',
                options: [
                    { value: true, label: 'On' },
                    { value: false, label: 'Off' },
                ],
                description:
                    'Show a searchable dropdown in the toolbar that lists all values from the ' +
                    'third dimension (script file selection). Selecting a value applies a ' +
                    'selection in the data model. Requires the third dimension to be configured.',
            },
        },
    };
}
