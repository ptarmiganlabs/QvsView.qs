import { readFile, writeFile, readdir, copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { TOKEN_NAMES } = require('./build-tokens.cjs');

/** Where `nebula build` writes the bundles. */
const DIST_DIR = 'dist';

/** Where `nebula sense` writes the extension folder. */
const EXT_DIR = 'qvsview-qs-ext';

/** Bundle metadata injected into the .qext file. */
const BUNDLE_METADATA = {
    id: 'dot-qs-library',
    name: '.qs Library',
    description:
        'Extensions from Ptarmigan Labs that enhance the user experience with help capabilities, onboarding tours and more.',
};

/**
 * List every `.js` file under a directory, recursively.
 *
 * @param {string} dir - Directory to read.
 *
 * @returns {Promise<string[]>} Paths of the `.js` files, each starting with `dir`; none when the
 *     directory does not exist.
 */
async function listScripts(dir) {
    let files;
    try {
        files = await readdir(dir, { recursive: true });
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
    return files.filter((file) => file.endsWith('.js')).map((file) => join(dir, file));
}

/**
 * Fail if a build token is left in any `.js` file the build produced.
 *
 * nebula replaces the tokens while it bundles, from `replacementStrings` in nebula.config.cjs, so a
 * token left here means that replacement stopped working: most likely a `nebula build` run without
 * `--config nebula.config.cjs`, or a `replacementStrings` that nebula no longer reads. This replaces
 * nothing, so that such a break stops the build the first time instead of being patched over.
 *
 * It reads every `.js` file in `dist/` and in the extension folder. `nebula sense` does not rebuild
 * the bundle: it copies it into the extension folder and writes a one-line AMD stub beside it, with
 * no token in it. It also fails when `dist/` holds no bundle, or the extension folder no `.js` file,
 * so a check that found nothing to read never passes as one that found nothing wrong.
 *
 * @returns {Promise<void>} Resolves when every `.js` file is free of build tokens.
 */
async function assertNoTokensRemain() {
    const bundles = await listScripts(DIST_DIR);
    if (bundles.length === 0) {
        throw new Error(`No bundle in ${DIST_DIR}/ — did "nebula build" run?`);
    }
    const extScripts = await listScripts(EXT_DIR);
    if (extScripts.length === 0) {
        throw new Error(`No .js file in ${EXT_DIR}/ — did "nebula sense" run?`);
    }

    const scripts = [...bundles, ...extScripts];
    const offenders = [];
    for (const filePath of scripts) {
        const content = await readFile(filePath, 'utf-8');
        for (const token of TOKEN_NAMES) {
            if (content.includes(token)) offenders.push(`${filePath}: ${token}`);
        }
    }
    if (offenders.length > 0) {
        throw new Error(
            'Build tokens left in the output. nebula replaces them from replacementStrings in ' +
                'nebula.config.cjs; did "nebula build" run with --config nebula.config.cjs?' +
                `\n  ${offenders.join('\n  ')}`
        );
    }
    console.log(`Post-build: No build tokens left in ${scripts.length} .js file(s)`);
}

/**
 * Post-build step, run after `nebula build` and `nebula sense`.
 *
 * It copies Mermaid into the extension folder for the air-gapped variant (`BUILD_VARIANT=full`) and
 * removes it otherwise, fails the build if a build token is left in a `.js` file (see
 * {@link assertNoTokensRemain}), and injects the bundle metadata into the .qext manifest. It
 * replaces no token: nebula has done that while it bundled.
 *
 * @returns {Promise<void>} Resolves when every step has run.
 */
async function main() {
    const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
    const buildType = process.env.BUILD_TYPE || 'development';
    const buildVariant = process.env.BUILD_VARIANT || 'light';

    console.log(
        `Post-build: BUILD_TYPE=${buildType}, BUILD_VARIANT=${buildVariant}, VERSION=${pkg.version}`
    );

    // Copy mermaid.min.js into the extension folder for the air-gapped variant
    if (buildVariant === 'full') {
        const mermaidSrc = join('node_modules', 'mermaid', 'dist', 'mermaid.min.js');
        const mermaidDst = join(EXT_DIR, 'mermaid.min.js');
        try {
            await copyFile(mermaidSrc, mermaidDst);
            console.log(`Post-build: Copied mermaid.min.js to ${mermaidDst}`);
        } catch (err) {
            console.error(`Error copying mermaid.min.js: ${err.message}`);
            process.exit(1);
        }
    } else {
        // Clean up mermaid.min.js from a previous air-gapped build
        const mermaidDst = join(EXT_DIR, 'mermaid.min.js');
        try {
            await rm(mermaidDst, { force: true });
        } catch {
            // Ignore — file may not exist
        }
    }

    // Check the extension folder as it ships, Mermaid included or removed
    await assertNoTokensRemain();

    // Inject bundle metadata into the .qext manifest
    const qextPath = join(EXT_DIR, 'qvsview-qs.qext');
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
    console.error('Post-build script failed:', err.message);
    process.exit(1);
});
