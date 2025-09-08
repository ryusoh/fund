const rules = {
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
    'color-hex-length': 'short',
};

const config = { rules };

try {
    // Make plugin optional so repos without package.json still work
    /* eslint-disable-next-line */
    const stylistic = require('@stylistic/stylelint-plugin');
    config.plugins = [stylistic];
    Object.assign(config.rules, {
        '@stylistic/declaration-block-trailing-semicolon': 'always',
        '@stylistic/string-quotes': 'single',
        '@stylistic/number-leading-zero': 'always',
    });
} catch (_) {
    // plugin not available; proceed without stylistic rules
}

module.exports = config;
