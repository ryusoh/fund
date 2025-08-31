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
});
