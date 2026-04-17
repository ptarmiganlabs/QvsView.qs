import { PACKAGE_VERSION, BUILD_DATE, BUILD_VARIANT } from '../util/logger';

/**
 * About section for the property panel.
 *
 * Displays version, build, and variant information.
 *
 * @returns {object} Property panel section definition.
 */
export function aboutSection() {
    return {
        type: 'items',
        label: 'About',
        items: {
            headerText: {
                component: 'text',
                label: `QvsView.qs v${PACKAGE_VERSION}`,
            },
            buildDate: {
                component: 'text',
                label: `Built ${BUILD_DATE}`,
            },
            variant: {
                component: 'text',
                label: `Variant: ${BUILD_VARIANT === 'full' ? 'Air-gapped (full)' : 'CDN (light)'}`,
            },
            description: {
                component: 'text',
                label: 'Read-only Qlik script viewer with syntax highlighting. Brought to you by Ptarmigan Labs.',
            },
            linkGithub: {
                component: 'link',
                label: 'Documentation & Source Code',
                url: 'https://github.com/ptarmiganlabs/QvsView.qs',
            },
            linkIssues: {
                component: 'link',
                label: 'Report a Bug / Request a Feature',
                url: 'https://github.com/ptarmiganlabs/QvsView.qs/issues/new/choose',
            },
            linkPtarmigan: {
                component: 'link',
                label: 'Ptarmigan Labs',
                url: 'https://ptarmiganlabs.com',
            },
        },
    };
}
