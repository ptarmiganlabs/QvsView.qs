/**
 * nebula.config.cjs says only what nebula reads, and nebula's own pipeline
 * replaces every build token.
 *
 * nebula reads the config file's `build` section as its command-line options,
 * and never reads a key it does not know, without a word: `replacement` and a
 * `rollup()` hook sat in the file unread until 2026-11-13, and Rollup replaced
 * no token. `scripts/post-build.mjs` patched them in afterwards, which is why
 * nobody noticed. So this reads the options as nebula does, the declared ones
 * from nebula's own `lib/init-config.js` and the few `lib/config.js` reads
 * besides, and it builds nebula's Rollup configuration from the file, to see the
 * replace plugin in it replace each token. Every list of the tokens' names
 * agrees with `TOKEN_NAMES` in `scripts/build-tokens.cjs`.
 *
 * It reads nebula's files rather than a copy of its option list, so a nebula
 * update that renames an option or moves the files fails here.
 *
 * The house rule is `rules/scaffolding/nebula-config.md` in
 * ptarmiganlabs/plabs-house-rules. Most of its siblings in the other extensions
 * run under vitest with a `@vitest-environment node` comment; this repository has no
 * test runner, so this one uses Node's own `node:test`, as filter-pane-header.qs
 * does.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import initConfig from '@nebula.js/cli-build/lib/init-config.js';
import nebulaRollupConfig from '@nebula.js/cli-build/lib/config.js';
import eslintConfig from '../eslint.config.js';

const require = createRequire(import.meta.url);
const nebulaConfig = require('../nebula.config.cjs');
const pkg = require('../package.json');
const { TOKEN_NAMES, buildTokens } = require('../scripts/build-tokens.cjs');

/** What `@nebula.js/cli-build`'s lib/config.js reads from the parsed options without declaring it. */
const READ_UNDECLARED = ['replacementStrings', 'reactNative', 'reactNativePath', 'cwd'];

const SORTED_NAMES = [...TOKEN_NAMES].sort();

/**
 * The options nebula's init-config declares, read by handing it a stand-in for yargs.
 *
 * @returns {string[]} Names of the declared options.
 */
function declaredOptions() {
    const declared = {};
    const yargs = {};

    /**
     * Stand-in for the yargs calls whose arguments nothing here needs.
     *
     * @returns {object} The stand-in, so that calls chain as they do on yargs.
     */
    const chain = () => yargs;

    /**
     * Stand-in for `yargs.options()`: keeps the options nebula declares.
     *
     * @param {object} named The options, by name.
     *
     * @returns {object} The stand-in, so that calls chain as they do on yargs.
     */
    const options = (named) => {
        Object.assign(declared, named);
        return yargs;
    };

    Object.assign(yargs, { parserConfiguration: chain, options, config: chain, middleware: chain });
    initConfig(yargs);
    return Object.keys(declared);
}

/**
 * What the replace plugin of nebula's own Rollup configuration makes of each token.
 *
 * @param {string[]} tokenNames Tokens to put through the plugin.
 *
 * @returns {string} The transformed source: one `export const vN = <token>;` line per token.
 */
function replaced(tokenNames) {
    const { input } = nebulaRollupConfig({
        mode: 'production',
        format: 'umd',
        argv: { ...nebulaConfig.build, sourcemap: false },
    });
    const replace = input.plugins.find((plugin) => plugin?.name === 'replace');
    assert.ok(replace, 'nebula runs no replace plugin');
    const source = tokenNames.map((name, i) => `export const v${i} = ${name};`).join('\n');
    // null when it replaced nothing, so the test then fails on each token, by name.
    return replace.transform(source, 'src/util/logger.js')?.code ?? source;
}

/**
 * The keys of an object that are build tokens by their shape, sorted.
 *
 * @param {object} [object] Object whose keys to read.
 *
 * @returns {string[]} Token-shaped keys.
 */
function tokensIn(object) {
    return Object.keys(object ?? {})
        .filter((key) => /^__[A-Z][A-Z0-9_]*__$/.test(key))
        .sort();
}

/**
 * Read a source file of this repository.
 *
 * @param {string} relativePath Path from the repository root.
 *
 * @returns {string} The file's text.
 */
function source(relativePath) {
    return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

describe('nebula.config.cjs', () => {
    it('holds only the section nebula build reads', () => {
        assert.deepEqual(Object.keys(nebulaConfig), ['build']);
    });

    it('sets only options that nebula reads', () => {
        const declared = declaredOptions();
        // A stand-in that read nothing would let every key through.
        for (const name of ['config', 'mode', 'sourcemap']) {
            assert.ok(declared.includes(name), `nebula declares no "${name}" option`);
        }
        const read = new Set([...declared, ...READ_UNDECLARED]);
        assert.deepEqual(
            Object.keys(nebulaConfig.build).filter((key) => !read.has(key)),
            [],
            'keys in build that nebula never reads'
        );
    });

    it("gets every build token replaced by the replace plugin of nebula's own Rollup configuration", () => {
        const strings = nebulaConfig.build.replacementStrings ?? {};
        const code = replaced(TOKEN_NAMES);
        for (const name of TOKEN_NAMES) {
            assert.ok(!code.includes(name), `${name} is left`);
        }
        TOKEN_NAMES.forEach((name, i) => {
            assert.ok(code.includes(`export const v${i} = ${strings[name]};`), name);
        });
    });

    it('is named by every script that runs nebula build or nebula serve', () => {
        // Without --config, nebula looks for nebula.config.js and, finding none, uses no options.
        const scripts = Object.entries(pkg.scripts).filter(([, command]) =>
            /\bnebula (build|serve)\b/.test(command)
        );
        const names = scripts.map(([name]) => name);
        for (const name of ['build', 'build:dist', 'start']) {
            assert.ok(names.includes(name), `npm run ${name} does not run nebula build or serve`);
        }
        for (const [name, command] of scripts) {
            assert.ok(command.includes('--config nebula.config.cjs'), `npm run ${name}`);
        }
    });
});

describe('the build tokens', () => {
    it('have the same names in every list of them', () => {
        assert.deepEqual(SORTED_NAMES, [
            '__BUILD_DATE__',
            '__BUILD_TYPE__',
            '__BUILD_VARIANT__',
            '__PACKAGE_VERSION__',
        ]);
        assert.deepEqual(
            Object.keys(nebulaConfig.build.replacementStrings ?? {}).sort(),
            SORTED_NAMES
        );
        const eslintGlobals = eslintConfig.flatMap((entry) =>
            tokensIn(entry.languageOptions?.globals)
        );
        assert.deepEqual(eslintGlobals.sort(), SORTED_NAMES);
    });

    it('become string literals of what the build knows', () => {
        const tokens = buildTokens({
            buildType: 'production',
            buildVariant: 'full',
            buildDate: '13 November 2026, 07:00',
        });
        const values = Object.fromEntries(
            Object.entries(tokens).map(([name, literal]) => [name, JSON.parse(literal)])
        );
        assert.deepEqual(values, {
            __BUILD_TYPE__: 'production',
            __PACKAGE_VERSION__: pkg.version,
            __BUILD_DATE__: '13 November 2026, 07:00',
            __BUILD_VARIANT__: 'full',
        });
    });

    it('are all read by src/util/logger.js, and the variant by src/ai/mermaid-init.js', () => {
        const logger = source('src/util/logger.js');
        for (const name of TOKEN_NAMES) assert.ok(logger.includes(`= ${name};`), name);
        assert.ok(source('src/ai/mermaid-init.js').includes('= __BUILD_VARIANT__;'));
    });
});
