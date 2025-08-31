export const customArcBordersPlugin = {
    id: 'customArcBorders',
    afterDatasetDraw(chart, args, pluginOptions) {
        // Only run for doughnut charts and if the dataset is visible
        if (chart.config.type !== 'doughnut' || !chart.isDatasetVisible(args.index)) {
            return;
        }

        const { ctx } = chart;
        const meta = args.meta; // Contains information about the dataset, including its elements

        // Get options from plugin configuration in chart options, with defaults
        const arcBorderWidth = pluginOptions.width !== undefined ? pluginOptions.width : 2.5; // Default to 2px
        const arcBorderColor = pluginOptions.color || 'rgba(20, 20, 20, 0.6)'; // Default color

        meta.data.forEach((arcElement) => {
            // Get the resolved properties of the arc segment
            const { x, y, startAngle, endAngle, outerRadius, innerRadius } = arcElement.getProps(
                ['x', 'y', 'startAngle', 'endAngle', 'outerRadius', 'innerRadius'],
                true // Use final values
            );

            ctx.save();
            ctx.strokeStyle = arcBorderColor;
            ctx.lineWidth = arcBorderWidth;

            // Draw outer arc border
            ctx.beginPath();
            ctx.arc(x, y, outerRadius, startAngle, endAngle);
            ctx.stroke();

            // Draw inner arc border
            ctx.beginPath();
            ctx.arc(x, y, innerRadius, startAngle, endAngle);
            ctx.stroke();

            ctx.restore();
        });
    },
};
