import fs from 'fs';

const filePath = 'tests/js/transactions/terminal/handlers/misc_more.test.js';
let content = fs.readFileSync(filePath, 'utf-8');

const tests = `
    test('handlePercentageCommand hidden chart', async () => {
        document.body.innerHTML = '<div id="runningAmountSection" class="is-hidden"></div>';
        transactionState.activeChart = 'sectors';
        const ctx = { appendMessage: jest.fn(), chartManager: { update: jest.fn() } };
        await handlePercentageCommand([], ctx);
        expect(ctx.appendMessage).toHaveBeenCalledWith('Sector allocation chart must be active. Use \`plot sectors\` first.');

        transactionState.activeChart = 'marketcap';
        await handlePercentageCommand([], ctx);
        expect(ctx.appendMessage).toHaveBeenCalledWith('Market cap chart must be active. Use \`plot marketcap\` first.');

        transactionState.activeChart = 'composition';
        await handlePercentageCommand([], ctx);
        expect(ctx.appendMessage).toHaveBeenCalledWith('Composition chart must be active. Use \`plot composition\` first.');
    });

    test('handlePercentageCommand already showing percentages', async () => {
        document.body.innerHTML = '<div id="runningAmountSection"></div>';
        const ctx = { appendMessage: jest.fn(), chartManager: { update: jest.fn() } };

        transactionState.activeChart = 'sectors';
        await handlePercentageCommand([], ctx);
        expect(ctx.appendMessage).toHaveBeenCalledWith('Sector allocation chart is already showing percentages.');

        transactionState.activeChart = 'marketcap';
        await handlePercentageCommand([], ctx);
        expect(ctx.appendMessage).toHaveBeenCalledWith('Market cap chart is already showing percentages.');

        transactionState.activeChart = 'composition';
        await handlePercentageCommand([], ctx);
        expect(ctx.appendMessage).toHaveBeenCalledWith('Composition chart is already showing percentages.');
    });
`;

content = content.replace("test('handlePercentageCommand switches valid charts from Abs'", tests + "\n    test('handlePercentageCommand switches valid charts from Abs'");

fs.writeFileSync(filePath, content);
