/**
 * About section for the property panel.
 *
 * Displays version and build information.
 *
 * @returns {object} Property panel section definition.
 */
export function aboutSection() {
    return {
        type: 'items',
        label: 'About',
        items: {
            aboutText: {
                component: 'text',
                label: `QvsView.qs — Qlik Script Viewer\nVersion: __PACKAGE_VERSION__\nBuild: __BUILD_DATE__`,
            },
        },
    };
}
