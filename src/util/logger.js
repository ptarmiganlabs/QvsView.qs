/**
 * Logger utility with build-type awareness, and the build information the
 * extension shows.
 *
 * The four constants below read build tokens. nebula's Rollup replace plugin
 * puts each token's value in its place while it bundles, from
 * `replacementStrings` in nebula.config.cjs (scripts/build-tokens.cjs), so the
 * bundle holds string literals, not the tokens. Rollup and terser can then
 * fold what depends on them: `IS_PRODUCTION` is a constant, so `debug()` logs
 * nothing in a production build, and code that only the other build variant
 * uses (see src/ai/mermaid-init.js) is left out of the bundle.
 */

/** @type {string} */
export const BUILD_TYPE = __BUILD_TYPE__;

/** @type {string} */
export const PACKAGE_VERSION = __PACKAGE_VERSION__;

/** @type {string} */
export const BUILD_DATE = __BUILD_DATE__;

/** @type {string} */
export const BUILD_VARIANT = __BUILD_VARIANT__;

const IS_PRODUCTION = BUILD_TYPE === 'production';

const PREFIX = 'QvsView.qs';

/**
 * Logger instance with level-gated output.
 *
 * @type {object}
 */
const logger = {
    /**
     * Debug log (suppressed in production).
     *
     * @param {...string} args - Values to log.
     *
     * @returns {void}
     */
    debug: (...args) => {
        if (!IS_PRODUCTION) console.log(`${PREFIX} [DEBUG]:`, ...args);
    },

    /**
     * Informational log.
     *
     * @param {...string} args - Values to log.
     *
     * @returns {void}
     */
    info: (...args) => {
        console.log(`${PREFIX} [INFO]:`, ...args);
    },

    /**
     * Warning log.
     *
     * @param {...string} args - Values to log.
     *
     * @returns {void}
     */
    warn: (...args) => {
        console.warn(`${PREFIX} [WARN]:`, ...args);
    },

    /**
     * Error log.
     *
     * @param {...string} args - Values to log.
     *
     * @returns {void}
     */
    error: (...args) => {
        console.error(`${PREFIX} [ERROR]:`, ...args);
    },
};

export default logger;
