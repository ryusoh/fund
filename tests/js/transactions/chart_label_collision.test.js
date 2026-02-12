import { nudgeLabelPosition } from '../../../js/transactions/chart/core';

describe('nudgeLabelPosition', () => {
    test('handles ping-pong collision (A and B displace C back and forth)', () => {
        // Scenario: Two labels already exist, causing a trap for the third.
        // A is at 90.
        // B is at 80.
        // C wants to be at 90.

        const existingBounds = [
            { y: 90, height: 10, left: 0, right: 100 }, // A
            { y: 80, height: 10, left: 0, right: 100 }, // B
        ];

        const textY = 90;
        const textHeight = 10;
        const bgPadding = 0;
        const padding = { top: 0, left: 0 };
        const naturalY = 90;

        // We use a constrained plot height to force candidates to be evaluated carefully
        const constrainedPlotHeight = 95;

        const result = nudgeLabelPosition(
            textY,
            textHeight,
            bgPadding,
            existingBounds,
            padding,
            constrainedPlotHeight,
            naturalY
        );

        expect(result).toBe(68); // Should find the first valid spot above B
    });

    test('handles tri-collision (A, B, C all at 90)', () => {
        // Scenario: A at 90. B at 90 (moves to 68). C at 90.
        // Existing bounds: Finalized positions of A and B
        const existingBounds = [
            { y: 90, height: 10, left: 0, right: 100 }, // A
            { y: 68, height: 10, left: 0, right: 100 }, // B
        ];

        const textY = 90;
        const textHeight = 10;
        const bgPadding = 0;
        const padding = { top: 0, left: 0 };
        const plotHeight = 100;
        const naturalY = 90;

        const result = nudgeLabelPosition(
            textY,
            textHeight,
            bgPadding,
            existingBounds,
            padding,
            plotHeight,
            naturalY
        );

        // Should avoid 90 and 68.
        // Candidates above 68: 68 - 5 - 2 - 5 = 56?
        // Wait: boundTop(63) - 2 - 5 = 56.
        // 56 overlaps?
        // 56 bottom = 61. B top = 63. No overlap.
        // So 56 should be the spot.

        expect(result).toBe(80);
    });

    test('handles tri-collision at Top Edge (A, B, C at 10)', () => {
        // A at 10. B at 10 (moves to 22). C at 10.
        // A-Above -> OOB. A-Below -> 22.
        // B moves to 22.
        // C at 10.
        // Candidates: 10 (Overlap A).
        // A-Above (-2) -> Clamped(5) -> Overlap A. Rejected.
        // A-Below (22) -> Overlap B. Rejected.
        // B-Above (10) -> Overlap A. Rejected.
        // B-Below (34) -> OK.

        const existingBounds = [
            { y: 10, height: 10, left: 0, right: 100 }, // A
            { y: 22, height: 10, left: 0, right: 100 }, // B
        ];

        const textY = 10;
        const textHeight = 10;
        const bgPadding = 0;
        const padding = { top: 0, left: 0 };
        const plotHeight = 100;
        const naturalY = 10;

        const result = nudgeLabelPosition(
            textY,
            textHeight,
            bgPadding,
            existingBounds,
            padding,
            plotHeight,
            naturalY
        );

        // Should be 34.
        expect(result).toBe(34);
    });

    test('handles NaN input gracefully (returns input)', () => {
        const result = nudgeLabelPosition(NaN, 10, 0, [], { top: 0 }, 100);
        expect(Number.isNaN(result)).toBe(true);
    });

    test('ignores invalid existing bounds (NaN y or height)', () => {
        const existingBounds = [
            { y: NaN, height: 10 },
            { y: 50, height: NaN },
            { y: 50, height: 10, left: 0, right: 100 }, // Valid bound at 50
        ];

        // Try placing at 50 (collision with valid bound).
        // Should move.
        // Candidates from 50: 50 (Overlap), 38, 62.
        const result = nudgeLabelPosition(50, 10, 0, existingBounds, { top: 0 }, 100);

        expect(result).not.toBe(50);
        // Should find valid spot. 38 or 62.
        expect([38, 62]).toContain(result);
    });
});
