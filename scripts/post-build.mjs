import { readFile, writeFile, readdir, copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildDateString } = require('./build-date.cjs');

/** Bundle metadata injected into the .qext file. */
const BUNDLE_METADATA = {
    id: 'dot-qs-library',
    name: '.qs Library',
    description:
        'Extensions from Ptarmigan Labs that enhance the user experience with help capabilities, onboarding tours and more.',
};

/**
 * Post-build script that replaces build-time tokens in output files
 * and injects bundle metadata into the .qext manifest.
 *
 * @returns {Promise<void>} Resolves when all tokens are replaced.
 */
async function main() {
    const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
    const buildType = process.env.BUILD_TYPE || 'development';
    const buildVariant = process.env.BUILD_VARIANT || 'light';
    const version = pkg.version;
    const buildDate = buildDateString();

    console.log(
        `Post-build: Using BUILD_TYPE=${buildType}, BUILD_VARIANT=${buildVariant}, VERSION=${version}, BUILD_DATE=${buildDate}`
    );

    const targetDirs = ['dist', 'qvsview-qs-ext'];

    for (const dir of targetDirs) {
        try {
            const files = await readdir(dir, { recursive: true });

            for (const file of files) {
                if (file.endsWith('.js')) {
                    const filePath = join(dir, file);
                    let content = await readFile(filePath, 'utf-8');

                    const newContent = content
                        .replace(/__BUILD_TYPE__/g, JSON.stringify(buildType))
                        .replace(/__PACKAGE_VERSION__/g, JSON.stringify(version))
                        .replace(/__BUILD_DATE__/g, JSON.stringify(buildDate))
                        .replace(/__BUILD_VARIANT__/g, JSON.stringify(buildVariant));

                    if (content !== newContent) {
                        await writeFile(filePath, newContent);
                        console.log(`Post-build: Replaced tokens in ${filePath}`);
                    }
                }
            }
        } catch (err) {
            if (err.code !== 'ENOENT') {
                console.error(`Error processing directory ${dir}:`, err);
            }
        }
    }

    // Copy mermaid.min.js into the extension folder for the air-gapped variant
    if (buildVariant === 'full') {
        const mermaidSrc = join('node_modules', 'mermaid', 'dist', 'mermaid.min.js');
        const mermaidDst = join('qvsview-qs-ext', 'mermaid.min.js');
        try {
            await copyFile(mermaidSrc, mermaidDst);
            console.log(`Post-build: Copied mermaid.min.js to ${mermaidDst}`);
        } catch (err) {
            console.error(`Error copying mermaid.min.js: ${err.message}`);
            process.exit(1);
        }
    } else {
        // Clean up mermaid.min.js from a previous air-gapped build
        const mermaidDst = join('qvsview-qs-ext', 'mermaid.min.js');
        try {
            await rm(mermaidDst, { force: true });
        } catch {
            // Ignore — file may not exist
        }
    }

    // Inject bundle metadata into the .qext manifest
    const qextPath = join('qvsview-qs-ext', 'qvsview-qs.qext');
    try {
        const qext = JSON.parse(await readFile(qextPath, 'utf-8'));
        qext.bundle = BUNDLE_METADATA;
        await writeFile(qextPath, JSON.stringify(qext, null, 2) + '\n');
        console.log(`Post-build: Injected bundle metadata into ${qextPath}`);
    } catch (err) {
        console.error(`Error injecting bundle into ${qextPath}:`, err);
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('Post-build script failed:', err);
    process.exit(1);
});
