import { CalendarRenderer } from '../../../../js/pages/calendar/renderers/CalendarRenderer.js';

describe('CalendarRenderer', () => {
    let renderer;

    beforeEach(() => {
        renderer = new CalendarRenderer();
    });

    it('should throw an error when paint is called', () => {
        expect(() => renderer.paint({})).toThrow('CalendarRenderer.paint() not implemented');
    });

    it('should throw an error when next is called', () => {
        expect(() => renderer.next(1)).toThrow('CalendarRenderer.next() not implemented');
    });

    it('should throw an error when previous is called', () => {
        expect(() => renderer.previous(1)).toThrow('CalendarRenderer.previous() not implemented');
    });

    it('should throw an error when jumpTo is called', () => {
        expect(() => renderer.jumpTo(new Date(), false)).toThrow(
            'CalendarRenderer.jumpTo() not implemented'
        );
    });

    it('should throw an error when on is called', () => {
        expect(() => renderer.on('event', () => {})).toThrow(
            'CalendarRenderer.on() not implemented'
        );
    });

    it('should throw an error when renderState is called', () => {
        expect(() => renderer.renderState({})).toThrow(
            'CalendarRenderer.renderState() not implemented'
        );
    });

    it('should throw an error when destroy is called', () => {
        expect(() => renderer.destroy()).toThrow('CalendarRenderer.destroy() not implemented');
    });
});
