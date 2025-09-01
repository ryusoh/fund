module.exports = {
    plugins: ['@stylistic/stylelint-plugin'],
    rules: {
        // Possible errors
        'color-no-invalid-hex': true,
        'font-family-no-duplicate-names': true,
        'function-linear-gradient-no-nonstandard-direction': true,
        'string-no-newline': true,
        'unit-no-unknown': true,
        'property-no-unknown': true,
        'declaration-block-no-duplicate-properties': [
            true,
            { ignore: ['consecutive-duplicates-with-different-values'] },
        ],
        'block-no-empty': true,

        // Limitations
        'selector-max-id': 2,

        // Gradual stylistic re-enable (warnings by default in CI via script flags if desired)
        '@stylistic/declaration-block-trailing-semicolon': 'always',
        '@stylistic/string-quotes': 'single',
        '@stylistic/number-leading-zero': 'always',
        'color-hex-length': 'short',
    },
};

