/**
 * Viewer toolbar settings section for the property panel.
 *
 * Controls visibility of toolbar items: copy button, font size dropdown,
 * search bar, and collapse all / expand all buttons.
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
            showCollapseButtons: {
                ref: 'toolbar.showCollapseButtons',
                type: 'boolean',
                label: 'Collapse all / Expand all buttons',
                defaultValue: false,
                component: 'switch',
                options: [
                    { value: true, label: 'On' },
                    { value: false, label: 'Off' },
                ],
            },
        },
    };
}
