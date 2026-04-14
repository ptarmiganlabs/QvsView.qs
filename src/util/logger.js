/**
 * Logger utility with build-type awareness.
 * Production builds suppress debug output.
 */

/** @type {string} */
export const BUILD_TYPE = __BUILD_TYPE__;

/** @type {string} */
export const PACKAGE_VERSION = __PACKAGE_VERSION__;

/** @type {string} */
export const BUILD_DATE = __BUILD_DATE__;

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
