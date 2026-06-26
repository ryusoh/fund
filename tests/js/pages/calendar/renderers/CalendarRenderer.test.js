import { CalendarRenderer } from '../../../../../js/pages/calendar/renderers/CalendarRenderer.js';

describe('CalendarRenderer', () => {
    let renderer;

    beforeEach(() => {
        renderer = new CalendarRenderer();
    });

    test('paint throws not implemented error', () => {
        expect(() => renderer.paint({})).toThrow('CalendarRenderer.paint() not implemented');
    });

    test('next throws not implemented error', () => {
        expect(() => renderer.next(1)).toThrow('CalendarRenderer.next() not implemented');
    });

    test('previous throws not implemented error', () => {
        expect(() => renderer.previous(1)).toThrow('CalendarRenderer.previous() not implemented');
    });

    test('jumpTo throws not implemented error', () => {
        expect(() => renderer.jumpTo(new Date(), true)).toThrow('CalendarRenderer.jumpTo() not implemented');
    });

    test('on throws not implemented error', () => {
        expect(() => renderer.on('event', () => {})).toThrow('CalendarRenderer.on() not implemented');
    });

    test('renderState throws not implemented error', () => {
        expect(() => renderer.renderState({})).toThrow('CalendarRenderer.renderState() not implemented');
    });

    test('destroy throws not implemented error', () => {
        expect(() => renderer.destroy()).toThrow('CalendarRenderer.destroy() not implemented');
    });
});
