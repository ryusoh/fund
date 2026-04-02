/**
 * CSP (Content Security Policy) regression tests.
 *
 * Ensures that no JS source file ships patterns that require 'unsafe-eval',
 * which is intentionally excluded from our CSP script-src directive.
 *
 * Offending patterns:
 *   - eval(...)
 *   - new Function(...)  /  Function(...)  when used as a string-to-code converter
 *   - setTimeout / setInterval with a string argument (rare in source, common in legacy)
 */

import fs from 'fs';
import path from 'path';

/**
 * Recursively collect all .js files under `dir`, skipping `node_modules`.
 */
function collectJsFiles(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.git') {
                continue;
            }
            results.push(...collectJsFiles(full));
        } else if (entry.name.endsWith('.js')) {
            results.push(full);
        }
    }
    return results;
}

// ---------------------------------------------------------------------------
// Patterns that trigger CSP 'unsafe-eval' violations.
//
// Each entry is { regex, label }.
// We match against the file content *after* stripping single-line comments
// so that legitimate `// eval(...)` comments don't false-positive.
// ---------------------------------------------------------------------------
const UNSAFE_EVAL_PATTERNS = [
    {
        // eval("...") or eval('...')  or  eval(variable)
        // Negative look-behind avoids matching ".isEval(", "noeval(", etc.
        regex: /(?<![.\w])eval\s*\(/,
        label: 'eval()',
    },
    {
        // Function('return this')  or  new Function("...", "...")
        // The capital-F Function used as a constructor/call with string args.
        // We anchor on a quote or backtick right after the opening paren to
        // catch string-to-code usage while allowing `Function.prototype`, etc.
        regex: /(?<!\w)Function\s*\(\s*[`'"]/,
        label: 'Function() string-to-code constructor',
    },
];

// Directories and files to scan (relative to project root).
const SCAN_ROOTS = ['js'];

// Files or directories to skip (e.g. test helpers that legitimately use vm).
const SKIP_PATTERNS = [/node_modules/, /\.test\.js$/, /tests\//];

describe('CSP unsafe-eval regression', () => {
    const root = path.resolve('.');
    const files = SCAN_ROOTS.flatMap((rel) => collectJsFiles(path.join(root, rel)));

    // Sanity check: we should find a reasonable number of JS files.
    if (files.length === 0) {
        throw new Error('CSP test found 0 JS files — check SCAN_ROOTS');
    }

    test.each(files.map((f) => [path.relative(root, f), f]))(
        '%s must not contain unsafe-eval patterns',
        (_relPath, absPath) => {
            if (SKIP_PATTERNS.some((p) => p.test(absPath))) {
                return;
            }

            const content = fs.readFileSync(absPath, 'utf8');

            // Remove lines that are purely single-line comments.
            // We intentionally do NOT strip inline `//` from code lines because
            // that regex also matches `//` inside strings (e.g., URLs like
            // "http://..."), which in minified single-line files would erase
            // all code after the first URL — hiding the patterns we need to catch.
            const stripped = content.replace(/^\s*\/\/.*$/gm, '');

            for (const { regex, label } of UNSAFE_EVAL_PATTERNS) {
                const found = regex.test(stripped);
                // Include the pattern label in the assertion for clear failure messages
                expect({ pattern: label, found }).toEqual({ pattern: label, found: false });
            }
        }
    );
});

describe('CSP meta tag consistency', () => {
    const root = path.resolve('.');
    const htmlFiles = [
        'index.html',
        'terminal/index.html',
        'position/index.html',
        'calendar/index.html',
        'analysis/index.html',
    ]
        .map((f) => path.join(root, f))
        .filter((f) => fs.existsSync(f));

    test.each(htmlFiles.map((f) => [path.relative(root, f), f]))(
        '%s must have a CSP that excludes unsafe-eval from script-src',
        (_relPath, absPath) => {
            const content = fs.readFileSync(absPath, 'utf8');

            // Must contain a CSP meta tag
            expect(content).toMatch(/http-equiv=["']Content-Security-Policy["']/i);

            // Must contain a script-src directive
            const cspMatch = content.match(/content="([^"]*script-src[^"]*)"/i);
            expect(cspMatch).not.toBeNull();

            // script-src must NOT include 'unsafe-eval'
            const cspContent = cspMatch[1];
            expect(cspContent).not.toMatch(/script-src[^;]*'unsafe-eval'/);
        }
    );
});
