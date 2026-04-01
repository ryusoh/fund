import fs from 'fs';
import path from 'path';

describe('Beta Chart Allocation Regression', () => {
    it('should NOT use slice() or temporary arrays in rolling calculation', () => {
        // Use a more robust way to find the file that works in both CJS and ESM environments under Jest
        const betaJsPath = path.resolve(process.cwd(), 'js/transactions/chart/renderers/beta.js');
        const content = fs.readFileSync(betaJsPath, 'utf8');

        // Check for the optimization block specifically
        const optimizationComment = 'Bolt: Optimize O(N * W) slice/array allocations';
        expect(content).toContain(optimizationComment);

        // Ensure no .slice(startIdx, endIdx) or similar is used inside the rolling loop
        // We look for the part between the window timeline loop
        const rollingLoopMatch = content.match(
            /for \(let i = windowSize - 1; i < marketReturns\.length; i\+\+\) \{([\s\S]*?)\}\n\n\s+return \{/
        );
        expect(rollingLoopMatch).toBeTruthy();

        const loopContent = rollingLoopMatch[1];

        // Should not contain .slice
        expect(loopContent).not.toContain('.slice(');

        // Should not contain temporary array allocations like [] that are pushed to
        // (except for betaData.push which is the result)
        const pushedArrays = loopContent.match(/(\w+)\.push\(/g) || [];
        const uniquePushedArrays = new Set(pushedArrays.map((p) => p.split('.')[0]));

        // Only betaData should be pushed to
        uniquePushedArrays.forEach((arr) => {
            expect(['betaData']).toContain(arr);
        });
    });
});
