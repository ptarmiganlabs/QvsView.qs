import js from '@eslint/js';
import globals from 'globals';
import jsdoc from 'eslint-plugin-jsdoc';
import prettierConfig from 'eslint-config-prettier';

export default [
    {
        ignores: ['dist/**', 'node_modules/**', 'qvsview-qs-ext/**', '*.zip'],
    },

    js.configs.recommended,
    jsdoc.configs['flat/recommended'],

    {
        plugins: { jsdoc },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                __BUILD_TYPE__: 'readonly',
                __PACKAGE_VERSION__: 'readonly',
                __BUILD_DATE__: 'readonly',
                define: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            'no-console': 'off',
            'no-plusplus': 'off',
            'no-shadow': 'off',
            'no-use-before-define': 'off',
            'consistent-return': 'off',
            'no-param-reassign': 'off',

            // JSDoc enforcement
            'jsdoc/tag-lines': ['error', 'any', { startLines: 1 }],
            'jsdoc/require-jsdoc': [
                'error',
                {
                    require: {
                        FunctionDeclaration: true,
                        MethodDefinition: true,
                        ClassDeclaration: true,
                        ArrowFunctionExpression: true,
                        FunctionExpression: true,
                    },
                },
            ],
            'jsdoc/require-description': 'error',
            'jsdoc/require-param': 'error',
            'jsdoc/require-param-description': 'error',
            'jsdoc/require-param-name': 'error',
            'jsdoc/require-param-type': 'error',
            'jsdoc/require-returns': 'error',
            'jsdoc/require-returns-description': 'error',
            'jsdoc/require-returns-type': 'error',
        },
    },

    prettierConfig,
];
