module.exports = [
    {
        ignores: [
            'node_modules/**',
            'coverage/**',
            'assets/**',
            'js/sketch.js',
            'js/vendor/**',
            '.ci-configs/**',
            'venv/**',
            'dist/**',
            '**/*.min.js',
            '.mypy_cache/**',
            '.pytest_cache/**',
            '.ruff_cache/**',
        ],
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                // Browser globals
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                fetch: 'readonly',
                requestAnimationFrame: 'readonly',
                cancelAnimationFrame: 'readonly',
                Image: 'readonly',
                CustomEvent: 'readonly',
                Event: 'readonly',
                Element: 'readonly',
                MouseEvent: 'readonly',
                TouchEvent: 'readonly',
                process: 'readonly',

                // App-provided globals from CDN
                Chart: 'readonly',
                ChartDataLabels: 'readonly',
            },
        },
        rules: {
            // Possible Problems
            'no-undef': 'error',
            'no-unused-vars': ['warn', { args: 'after-used', ignoreRestSiblings: true }],
            'no-unreachable': 'error',
            'no-constant-binary-expression': 'error',

            // Suggestions
            eqeqeq: ['warn', 'always', { null: 'ignore' }],
            'no-var': 'warn',
            'prefer-const': ['warn', { destructuring: 'all' }],
            'no-useless-return': 'warn',
            'no-extra-boolean-cast': 'warn',
            'no-multi-assign': 'warn',
            'no-lonely-if': 'warn',
            'no-else-return': 'warn',
            curly: ['error', 'all'],

            // Style
            'no-trailing-spaces': 'warn',
            'eol-last': ['warn', 'always'],
            semi: ['warn', 'always'],
            quotes: ['warn', 'single', { avoidEscape: true }],
            indent: ['error', 4, { SwitchCase: 1 }],
            'keyword-spacing': ['warn', { before: true, after: true }],
            'space-before-blocks': ['warn', 'always'],
            'comma-spacing': ['warn', { before: false, after: true }],
            'object-curly-spacing': ['warn', 'always'],
            'arrow-spacing': ['warn', { before: true, after: true }],
            'no-multi-spaces': ['warn'],
            'brace-style': ['warn', '1tbs', { allowSingleLine: true }],
            'no-multiple-empty-lines': ['warn', { max: 1, maxEOF: 1 }],

            // Project specific
            'no-console': 'warn',
        },
    },
    {
        files: ['sw.js'],
        languageOptions: {
            globals: {
                self: 'readonly',
                caches: 'readonly',
                clients: 'readonly',
                Cache: 'readonly',
                CacheStorage: 'readonly',
                Request: 'readonly',
                Response: 'readonly',
                URL: 'readonly',
                location: 'readonly',
            },
        },
    },
    {
        files: ['tests/js/**/*.js'],
        languageOptions: {
            globals: {
                require: 'readonly',
                module: 'readonly',
                global: 'readonly',
                jest: 'readonly',
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                window: 'readonly',
                document: 'readonly',
            },
        },
        rules: {
            'no-console': 'off',
        },
    },
    {
        files: ['scripts/**/*.js', 'babel.config.js', 'tests/js/__mocks__/**/*.js'],
        languageOptions: {
            sourceType: 'commonjs',
            globals: {
                require: 'readonly',
                module: 'readonly',
                __dirname: 'readonly',
                process: 'readonly',
                exports: 'readonly',
            },
        },
        rules: {
            'no-console': 'off',
        },
    },
];
