import { customArcBordersPlugin } from '@plugins/customArcBordersPlugin.js';

describe('customArcBordersPlugin', () => {
    it('should have the correct ID', () => {
        expect(customArcBordersPlugin.id).toBe('customArcBorders');
    });

    it('should use default styles if no options are provided', () => {
        const mockChart = {
            config: { type: 'doughnut' },
            isDatasetVisible: jest.fn(() => true),
            ctx: {
                save: jest.fn(),
                restore: jest.fn(),
                beginPath: jest.fn(),
                arc: jest.fn(),
                stroke: jest.fn(),
                lineWidth: 0,
                strokeStyle: '',
            },
        };
        const mockArgs = {
            meta: {
                data: [
                    {
                        getProps: jest.fn(() => ({
                            x: 100,
                            y: 100,
                            startAngle: 0,
                            endAngle: Math.PI,
                            outerRadius: 50,
                            innerRadius: 25,
                        })),
                    },
                ],
            },
            index: 0,
        };

        customArcBordersPlugin.afterDatasetDraw(mockChart, mockArgs, {});

        expect(mockChart.ctx.lineWidth).toBe(2.5); // default width
        expect(mockChart.ctx.strokeStyle).toBe('rgba(20, 20, 20, 0.6)'); // default color
    });

    it('should use styles from options when provided', () => {
        const mockChart = {
            config: { type: 'doughnut' },
            isDatasetVisible: jest.fn(() => true),
            ctx: {
                save: jest.fn(),
                restore: jest.fn(),
                beginPath: jest.fn(),
                arc: jest.fn(),
                stroke: jest.fn(),
                lineWidth: 0,
                strokeStyle: '',
            },
        };
        const mockArgs = {
            meta: {
                data: [
                    {
                        getProps: jest.fn(() => ({
                            x: 100,
                            y: 100,
                            startAngle: 0,
                            endAngle: Math.PI,
                            outerRadius: 50,
                            innerRadius: 25,
                        })),
                    },
                ],
            },
            index: 0,
        };
        const options = { width: 5, color: 'red' };

        customArcBordersPlugin.afterDatasetDraw(mockChart, mockArgs, options);

        expect(mockChart.ctx.lineWidth).toBe(5);
        expect(mockChart.ctx.strokeStyle).toBe('red');
    });

    it('should return early for non-doughnut charts', () => {
        const mockChart = {
            config: { type: 'bar' }, // not doughnut
            isDatasetVisible: jest.fn(() => true),
            ctx: {
                save: jest.fn(),
                restore: jest.fn(),
                beginPath: jest.fn(),
                arc: jest.fn(),
                stroke: jest.fn(),
            },
        };
        const mockArgs = {
            meta: { data: [{ getProps: jest.fn() }] },
            index: 0,
        };

        customArcBordersPlugin.afterDatasetDraw(mockChart, mockArgs, {});

        expect(mockChart.ctx.save).not.toHaveBeenCalled();
        expect(mockChart.ctx.arc).not.toHaveBeenCalled();
    });

    it('should return early when dataset is not visible', () => {
        const mockChart = {
            config: { type: 'doughnut' },
            isDatasetVisible: jest.fn(() => false), // not visible
            ctx: {
                save: jest.fn(),
                restore: jest.fn(),
                beginPath: jest.fn(),
                arc: jest.fn(),
                stroke: jest.fn(),
            },
        };
        const mockArgs = {
            meta: { data: [{ getProps: jest.fn() }] },
            index: 0,
        };

        customArcBordersPlugin.afterDatasetDraw(mockChart, mockArgs, {});

        expect(mockChart.ctx.save).not.toHaveBeenCalled();
        expect(mockChart.ctx.arc).not.toHaveBeenCalled();
    });

    it('should draw a radial divider line at each slice seam when divider options are provided', () => {
        const mockChart = {
            config: { type: 'doughnut' },
            isDatasetVisible: jest.fn(() => true),
            ctx: {
                save: jest.fn(),
                restore: jest.fn(),
                beginPath: jest.fn(),
                arc: jest.fn(),
                moveTo: jest.fn(),
                lineTo: jest.fn(),
                stroke: jest.fn(),
                lineWidth: 0,
                strokeStyle: '',
            },
        };
        const slice = (startAngle, endAngle) => ({
            getProps: jest.fn(() => ({
                x: 100,
                y: 100,
                startAngle,
                endAngle,
                outerRadius: 50,
                innerRadius: 25,
            })),
        });
        const mockArgs = {
            meta: { data: [slice(0, Math.PI / 2), slice(Math.PI / 2, Math.PI)] },
            index: 0,
        };
        const options = {
            width: 0,
            color: 'transparent',
            dividerWidth: 1,
            dividerColor: 'rgba(120, 120, 128, 0.8)',
        };

        customArcBordersPlugin.afterDatasetDraw(mockChart, mockArgs, options);

        // One seam per slice: from innerRadius to outerRadius at the slice's startAngle
        expect(mockChart.ctx.moveTo).toHaveBeenCalledTimes(2);
        expect(mockChart.ctx.lineTo).toHaveBeenCalledTimes(2);

        // Seam of slice 0 at angle 0: (125, 100) -> (150, 100)
        expect(mockChart.ctx.moveTo.mock.calls[0][0]).toBeCloseTo(125);
        expect(mockChart.ctx.moveTo.mock.calls[0][1]).toBeCloseTo(100);
        expect(mockChart.ctx.lineTo.mock.calls[0][0]).toBeCloseTo(150);
        expect(mockChart.ctx.lineTo.mock.calls[0][1]).toBeCloseTo(100);

        // Seam of slice 1 at angle PI/2: (100, 125) -> (100, 150)
        expect(mockChart.ctx.moveTo.mock.calls[1][0]).toBeCloseTo(100);
        expect(mockChart.ctx.moveTo.mock.calls[1][1]).toBeCloseTo(125);
        expect(mockChart.ctx.lineTo.mock.calls[1][0]).toBeCloseTo(100);
        expect(mockChart.ctx.lineTo.mock.calls[1][1]).toBeCloseTo(150);

        expect(mockChart.ctx.lineWidth).toBe(1);
        expect(mockChart.ctx.strokeStyle).toBe('rgba(120, 120, 128, 0.8)');
    });

    it('should skip divider lines when dividerWidth is 0', () => {
        const mockChart = {
            config: { type: 'doughnut' },
            isDatasetVisible: jest.fn(() => true),
            ctx: {
                save: jest.fn(),
                restore: jest.fn(),
                beginPath: jest.fn(),
                arc: jest.fn(),
                moveTo: jest.fn(),
                lineTo: jest.fn(),
                stroke: jest.fn(),
                lineWidth: 0,
                strokeStyle: '',
            },
        };
        const mockArgs = {
            meta: {
                data: [
                    {
                        getProps: jest.fn(() => ({
                            x: 100,
                            y: 100,
                            startAngle: 0,
                            endAngle: Math.PI,
                            outerRadius: 50,
                            innerRadius: 25,
                        })),
                    },
                ],
            },
            index: 0,
        };

        customArcBordersPlugin.afterDatasetDraw(mockChart, mockArgs, { dividerWidth: 0 });

        expect(mockChart.ctx.moveTo).not.toHaveBeenCalled();
        expect(mockChart.ctx.lineTo).not.toHaveBeenCalled();
    });
});
