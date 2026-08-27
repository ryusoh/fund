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
        // Radial divider lines between slices (off unless dividerWidth > 0)
        const dividerWidth = pluginOptions.dividerWidth ?? 0;
        const dividerColor = pluginOptions.dividerColor || arcBorderColor;

        for (let i = 0; i < meta.data.length; i++) {
            const arcElement = meta.data[i];
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

            // Draw the radial divider at the slice's leading edge; the seam at
            // endAngle is covered by the next slice's startAngle (and the last
            // slice's endAngle coincides with the first slice's startAngle).
            if (dividerWidth > 0) {
                ctx.strokeStyle = dividerColor;
                ctx.lineWidth = dividerWidth;
                ctx.beginPath();
                ctx.moveTo(
                    x + innerRadius * Math.cos(startAngle),
                    y + innerRadius * Math.sin(startAngle)
                );
                ctx.lineTo(
                    x + outerRadius * Math.cos(startAngle),
                    y + outerRadius * Math.sin(startAngle)
                );
                ctx.stroke();
            }

            ctx.restore();
        }
    },
};
