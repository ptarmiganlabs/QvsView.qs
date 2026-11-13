// nebula reads this file's `build` section as its command-line options, and never reads a key it
// does not know: it gives no error and no warning. So this file can only set the options nebula
// has; it cannot add a Rollup plugin or change nebula's Rollup configuration in any other way. A
// key nebula does not read fails test/nebula-config.test.mjs, which also checks that nebula's own
// pipeline replaces every build token.
//
// Every `nebula build` and `nebula serve` script in package.json passes
// `--config nebula.config.cjs`: without it, nebula looks for `nebula.config.js` and, finding none,
// builds with no options at all.
const { buildTokens } = require('./scripts/build-tokens.cjs');

module.exports = {
    build: {
        // nebula hands these to the Rollup replace plugin that its build already runs, so each build
        // token in the source becomes its value before terser minifies (scripts/build-tokens.cjs).
        replacementStrings: buildTokens(),
    },
};
