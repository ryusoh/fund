/* global __dirname */
import fs from 'fs';
import path from 'path';

describe('CSS Layout Regression Tests', () => {
    // Define __dirname for JSDOM compatibility
    const layoutCssPath = path.resolve(__dirname, '../../../css/layout.css');
    let layoutCssContent;

    beforeAll(() => {
        try {
            layoutCssContent = fs.readFileSync(layoutCssPath, 'utf8');
        } catch (error) {
            console.error('Failed to read css/layout.css:', error);
            layoutCssContent = '';
        }
    });

    it('should exist and be readable', () => {
        expect(layoutCssContent).toBeTruthy();
        expect(layoutCssContent.length).toBeGreaterThan(0);
    });

    describe('Mobile Content Block', () => {
        it('should enforce display: block and width: 95% for .content-block on mobile', () => {
            const expectedRuleRegex =
                /\.content-block\s*\{[^}]*width:\s*95%;[^}]*display:\s*block;[^}]*max-width:\s*none;[^}]*\}/s;

            expect(layoutCssContent).toMatch(expectedRuleRegex);

            const match = layoutCssContent.match(expectedRuleRegex);
            if (match) {
                const index = match.index;
                const precedingText = layoutCssContent.substring(0, index);
                const lastMediaQuery = precedingText.lastIndexOf('@media (max-width: 768px)');

                expect(lastMediaQuery).toBeGreaterThan(-1);
            }
        });
    });
});
