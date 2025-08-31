module.exports = {
    plugins: ['@stylistic/stylelint-plugin'],
    rules: {
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
        'selector-max-id': 2,
        '@stylistic/declaration-block-trailing-semicolon': 'always',
        '@stylistic/string-quotes': 'single',
        '@stylistic/number-leading-zero': 'always',
        'color-hex-length': 'short',
    },
};

