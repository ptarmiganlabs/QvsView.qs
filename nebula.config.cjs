const replace = require('@rollup/plugin-replace');
const pkg = require('./package.json');
const { buildDateString } = require('./scripts/build-date.cjs');

const BUILD_DATE = buildDateString();
const BUILD_VARIANT = process.env.BUILD_VARIANT || 'light';

module.exports = {
    build: {
        replacement: {
            __BUILD_TYPE__: JSON.stringify(process.env.BUILD_TYPE || 'development'),
            __PACKAGE_VERSION__: JSON.stringify(pkg.version),
            __BUILD_DATE__: JSON.stringify(BUILD_DATE),
            __BUILD_VARIANT__: JSON.stringify(BUILD_VARIANT),
        },
        rollup(config) {
            config.plugins.push(
                replace({
                    preventAssignment: true,
                    values: {
                        __BUILD_TYPE__: JSON.stringify(process.env.BUILD_TYPE || 'development'),
                        __PACKAGE_VERSION__: JSON.stringify(pkg.version),
                        __BUILD_DATE__: JSON.stringify(BUILD_DATE),
                        __BUILD_VARIANT__: JSON.stringify(BUILD_VARIANT),
                    },
                })
            );

            return config;
        },
    },
};
