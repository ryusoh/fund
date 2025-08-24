import { initFooterToggle } from '../ui/footerToggle.js';

describe('initFooterToggle', () => {
  let totalValueElement;
  let pnlElement;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="total-portfolio-value-in-table"></div>
      <div class="total-pnl"></div>
    `;
    totalValueElement = document.getElementById('total-portfolio-value-in-table');
    pnlElement = document.querySelector('.total-pnl');
    jest.clearAllMocks();
  });

  // Test case 1: Both elements exist and event listeners are set up
  it('should set up click listeners and toggle display when both elements exist', () => {
    initFooterToggle();

    // Initial state (default display is usually block or inline-block)
    expect(totalValueElement.style.display).toBe('');
    expect(pnlElement.style.display).toBe('');

    // Simulate click on totalValueElement
    totalValueElement.click();
    expect(totalValueElement.style.display).toBe('none');
    expect(pnlElement.style.display).toBe('inline');

    // Simulate click on pnlElement
    pnlElement.click();
    expect(pnlElement.style.display).toBe('none');
    expect(totalValueElement.style.display).toBe('inline');
  });

  // Test case 2: totalValueElement does not exist
  it('should not set up listeners if totalValueElement does not exist', () => {
    document.body.innerHTML = `
      <div class="total-pnl"></div>
    `;
    totalValueElement = document.getElementById('total-portfolio-value-in-table'); // This will be null
    pnlElement = document.querySelector('.total-pnl');

    // Spy on addEventListener to ensure it's not called
    const addEventListenerSpy = jest.spyOn(Element.prototype, 'addEventListener');

    initFooterToggle();

    expect(addEventListenerSpy).not.toHaveBeenCalled();

    addEventListenerSpy.mockRestore(); // Clean up the spy
  });

  // Test case 3: pnlElement does not exist
  it('should not set up listeners if pnlElement does not exist', () => {
    document.body.innerHTML = `
      <div id="total-portfolio-value-in-table"></div>
    `;
    totalValueElement = document.getElementById('total-portfolio-value-in-table');
    pnlElement = document.querySelector('.total-pnl'); // This will be null

    const addEventListenerSpy = jest.spyOn(Element.prototype, 'addEventListener');

    initFooterToggle();

    expect(addEventListenerSpy).not.toHaveBeenCalled();

    addEventListenerSpy.mockRestore();
  });

  // Test case 4: Neither element exists
  it('should not set up listeners if neither element exists', () => {
    document.body.innerHTML = ``; // Empty body
    totalValueElement = document.getElementById('total-portfolio-value-in-table'); // Null
    pnlElement = document.querySelector('.total-pnl'); // Null

    const addEventListenerSpy = jest.spyOn(Element.prototype, 'addEventListener');

    initFooterToggle();

    expect(addEventListenerSpy).not.toHaveBeenCalled();

    addEventListenerSpy.mockRestore();
  });
});