describe('scroll_control.js', () => {
  let preventDefaultSpy;
  let scrollToSpy;
  let originalPageYOffset;
  let originalDocumentElementScrollTop;

  beforeAll(() => {
    // Store original properties to restore them after tests
    originalPageYOffset = window.pageYOffset;
    originalDocumentElementScrollTop = document.documentElement.scrollTop;
  });

  beforeEach(() => {
    // Reset DOM and spies before each test
    document.body.innerHTML = '';
    preventDefaultSpy = jest.spyOn(Event.prototype, 'preventDefault');
    scrollToSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => {}); // Mock scrollTo

    // Reset scroll positions for each test
    Object.defineProperty(window, 'pageYOffset', { writable: true, value: 0 });
    Object.defineProperty(document.documentElement, 'scrollTop', { writable: true, value: 0 });

    // Re-import the module to re-run its IIFE and attach event listeners
    jest.resetModules();
    require('../ui/scroll_control.js');
  });

  afterEach(() => {
    // Restore spies and mocks
    preventDefaultSpy.mockRestore();
    scrollToSpy.mockRestore();

    // Restore original properties
    Object.defineProperty(window, 'pageYOffset', { writable: true, value: originalPageYOffset });
    Object.defineProperty(document.documentElement, 'scrollTop', { writable: true, value: originalDocumentElementScrollTop });

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  // Test for scroll event listener (desktop/mouse scroll)
  describe('scroll event listener', () => {
    it('should call window.scrollTo(0,0) when scrolling up at the very top', () => {
      // Simulate initial scroll position
      Object.defineProperty(window, 'pageYOffset', { writable: true, value: 100 });
      Object.defineProperty(document.documentElement, 'scrollTop', { writable: true, value: 100 });
      window.dispatchEvent(new Event('scroll')); // Update lastScrollTop

      // Simulate scrolling up to the top
      Object.defineProperty(window, 'pageYOffset', { writable: true, value: 0 });
      Object.defineProperty(document.documentElement, 'scrollTop', { writable: true, value: 0 });
      window.dispatchEvent(new Event('scroll'));

      expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
    });

    it('should not call window.scrollTo(0,0) when scrolling down', () => {
      // Simulate initial scroll position
      Object.defineProperty(window, 'pageYOffset', { writable: true, value: 0 });
      Object.defineProperty(document.documentElement, 'scrollTop', { writable: true, value: 0 });
      window.dispatchEvent(new Event('scroll')); // Update lastScrollTop

      // Simulate scrolling down
      Object.defineProperty(window, 'pageYOffset', { writable: true, value: 100 });
      Object.defineProperty(document.documentElement, 'scrollTop', { writable: true, value: 100 });
      window.dispatchEvent(new Event('scroll'));

      expect(scrollToSpy).not.toHaveBeenCalled();
    });

    it('should not call window.scrollTo(0,0) when scrolling up but not at the very top', () => {
      // Simulate initial scroll position
      Object.defineProperty(window, 'pageYOffset', { writable: true, value: 100 });
      Object.defineProperty(document.documentElement, 'scrollTop', { writable: true, value: 100 });
      window.dispatchEvent(new Event('scroll')); // Update lastScrollTop

      // Simulate scrolling up but not to the top
      Object.defineProperty(window, 'pageYOffset', { writable: true, value: 50 });
      Object.defineProperty(document.documentElement, 'scrollTop', { writable: true, value: 50 });
      window.dispatchEvent(new Event('scroll'));

      expect(scrollToSpy).not.toHaveBeenCalled();
    });
  });

  // Test for touch event listeners (mobile/touch scroll)
  describe('touch event listeners', () => {
    it('should prevent default touchmove when trying to scroll page up', () => {
      // Simulate touchstart
      document.dispatchEvent(new TouchEvent('touchstart', {
        touches: [{ clientY: 100 }],
        bubbles: true,
        cancelable: true,
      }));

      preventDefaultSpy.mockClear();

      // Simulate touchmove trying to scroll up (finger moves from 100 to 50)
      document.dispatchEvent(new TouchEvent('touchmove', {
        touches: [{ clientY: 50 }],
        bubbles: true,
        cancelable: true,
      }));

      expect(preventDefaultSpy).toHaveBeenCalledTimes(4);
    });

    it('should not prevent default touchmove when trying to scroll page down', () => {
      // Simulate touchstart
      document.dispatchEvent(new TouchEvent('touchstart', {
        touches: [{ clientY: 50 }],
        bubbles: true,
        cancelable: true,
      }));

      // Simulate touchmove trying to scroll down (finger moves from 50 to 100)
      document.dispatchEvent(new TouchEvent('touchmove', {
        touches: [{ clientY: 100 }],
        bubbles: true,
        cancelable: true,
      }));

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('should not prevent default touchmove when deltaY is zero', () => {
      // Simulate touchstart
      document.dispatchEvent(new TouchEvent('touchstart', {
        touches: [{ clientY: 50 }],
        bubbles: true,
        cancelable: true,
      }));

      // Simulate touchmove with no change in Y
      document.dispatchEvent(new TouchEvent('touchmove', {
        touches: [{ clientY: 50 }],
        bubbles: true,
        cancelable: true,
      }));

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
  });
});