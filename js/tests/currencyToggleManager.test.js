import { initCurrencyToggle } from '../ui/currencyToggleManager.js';

describe('initCurrencyToggle', () => {
  let toggleContainer;
  let usdButton;
  let jpyButton;
  let krwButton;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="currencyToggleContainer">
        <button class="currency-toggle" data-currency="USD">USD</button>
        <button class="currency-toggle" data-currency="JPY">JPY</button>
        <button class="currency-toggle" data-currency="KRW">KRW</button>
        <button id="other-button">Other</button>
      </div>
    `;
    // Reset modules to ensure top-level code in currencyToggleManager.js runs again
    jest.resetModules();
    // Re-import the module to re-run its top-level code and attach event listeners
    require('../ui/currencyToggleManager.js');

    toggleContainer = document.getElementById('currencyToggleContainer');
    usdButton = toggleContainer.querySelector('[data-currency="USD"]');
    jpyButton = toggleContainer.querySelector('[data-currency="JPY"]');
    krwButton = toggleContainer.querySelector('[data-currency="KRW"]');

    jest.clearAllMocks();
    jest.spyOn(document, 'dispatchEvent');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Test case 1: Early return if toggleContainer is not found
  it('should return early if toggleContainer is not found', () => {
    document.body.innerHTML = ''; // Clear the body
    initCurrencyToggle();
    expect(document.dispatchEvent).not.toHaveBeenCalled();
  });

  // Test case 2: Early return if no currency buttons are found
  it('should return early if no currency buttons are found', () => {
    document.body.innerHTML = '<div id="currencyToggleContainer"></div>';
    initCurrencyToggle();
    expect(document.dispatchEvent).not.toHaveBeenCalled();
  });

  // Test case 3: Initialization with an active button
  it("should initialize with the active button's currency", () => {
    usdButton.classList.add('active');
    initCurrencyToggle();
    // Verify that the internal selectedCurrency is USD (cannot directly assert, but can infer via subsequent clicks)
    // Let's click JPY and see if it dispatches an event
    jpyButton.click();
    expect(document.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(document.dispatchEvent).toHaveBeenCalledWith(new CustomEvent('currencyChangedGlobal', { detail: { currency: 'JPY' } }));
  });

  // Test case 4: Initialization without an active button (defaults to USD)
  it('should default to USD if no active button is found', () => {
    initCurrencyToggle();
    // Click JPY and expect an event
    jpyButton.click();
    expect(document.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(document.dispatchEvent).toHaveBeenCalledWith(new CustomEvent('currencyChangedGlobal', { detail: { currency: 'JPY' } }));
  });

  // Test case 5: Clicking a new currency button
  it('should change currency and dispatch event on button click', () => {
    initCurrencyToggle(); // Default to USD

    jpyButton.click();

    expect(jpyButton.classList.contains('active')).toBe(true);
    expect(usdButton.classList.contains('active')).toBe(false);
    expect(document.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(document.dispatchEvent).toHaveBeenCalledWith(new CustomEvent('currencyChangedGlobal', { detail: { currency: 'JPY' } }));

    krwButton.click();

    expect(krwButton.classList.contains('active')).toBe(true);
    expect(jpyButton.classList.contains('active')).toBe(false);
    expect(document.dispatchEvent).toHaveBeenCalledTimes(2);
    expect(document.dispatchEvent).toHaveBeenCalledWith(new CustomEvent('currencyChangedGlobal', { detail: { currency: 'KRW' } }));
  });

  // Test case 6: Clicking the already active currency button
  it('should not dispatch event if the same currency button is clicked', () => {
    usdButton.classList.add('active');
    initCurrencyToggle();
    document.dispatchEvent.mockClear(); // Clear initial dispatch if any

    usdButton.click();

    expect(usdButton.classList.contains('active')).toBe(true);
    expect(document.dispatchEvent).not.toHaveBeenCalled();
  });

  // Test case 7: Clicking the same button twice
  it('should not remove active class if the same button is clicked twice', () => {
    initCurrencyToggle();
    usdButton.click();
    expect(usdButton.classList.contains('active')).toBe(false);
    jpyButton.click();
    expect(jpyButton.classList.contains('active')).toBe(true);
    expect(usdButton.classList.contains('active')).toBe(false);
    jpyButton.click();
    expect(jpyButton.classList.contains('active')).toBe(true);
    expect(usdButton.classList.contains('active')).toBe(false);
  });
});

describe('initCurrencyToggle – inner element click path', () => {
  let toggleContainer;
  let usdButton;
  let jpyButton;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="currencyToggleContainer">
        <button class="currency-toggle" data-currency="USD"><span id="usd-inner">USD</span></button>
        <button class="currency-toggle" data-currency="JPY"><span id="jpy-inner">JPY</span></button>
      </div>
    `;
    jest.resetModules();
    const { initCurrencyToggle: initCurrencyToggleLocal } = require('../ui/currencyToggleManager.js');
    toggleContainer = document.getElementById('currencyToggleContainer');
    usdButton = toggleContainer.querySelector('[data-currency="USD"]');
    jpyButton = toggleContainer.querySelector('[data-currency="JPY"]');
    jest.clearAllMocks();
    jest.spyOn(document, 'dispatchEvent');
    initCurrencyToggleLocal();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads dataset.currency when clicking a child element via closest()', () => {
    const innerSpan = document.getElementById('jpy-inner');
    // Click the inner span, not the button, to force the `closest('.currency-toggle')` path
    innerSpan.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(document.dispatchEvent).toHaveBeenCalledWith(new CustomEvent('currencyChangedGlobal', { detail: { currency: 'JPY' } }));
    // Click inner of the same (already active) to hit "same currency" path; still reads dataset on line 25
    document.dispatchEvent.mockClear();
    innerSpan.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.dispatchEvent).not.toHaveBeenCalled();
  });
});

describe('initCurrencyToggle – branch 25 coverage (same currency first, then change)', () => {
  let toggleContainer;
  let usdButton;
  let jpyButton;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="currencyToggleContainer">
        <button class="currency-toggle" data-currency="USD"><span id="usd-inner">USD</span></button>
        <button class="currency-toggle" data-currency="JPY"><span id="jpy-inner">JPY</span></button>
        <button id="other-button">Other</button>
      </div>
    `;
    jest.resetModules();
    const { initCurrencyToggle: initCurrencyToggleLocal } = require('../ui/currencyToggleManager.js');
    toggleContainer = document.getElementById('currencyToggleContainer');
    usdButton = toggleContainer.querySelector('[data-currency="USD"]');
    jpyButton = toggleContainer.querySelector('[data-currency="JPY"]');
    jest.clearAllMocks();
    jest.spyOn(document, 'dispatchEvent');
    initCurrencyToggleLocal();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('covers false branch of line 25 when clicking currently selected default USD first, then true branch when switching to JPY', () => {
    const usdInner = document.getElementById('usd-inner');
    const jpyInner = document.getElementById('jpy-inner');

    // First click: USD (same as default selectedCurrency 'USD') -> line 25 condition is FALSE
    usdInner.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.dispatchEvent).not.toHaveBeenCalled();

    // Second click: JPY (different from selectedCurrency 'USD') -> line 25 condition is TRUE
    jpyInner.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(document.dispatchEvent).toHaveBeenCalledWith(new CustomEvent('currencyChangedGlobal', { detail: { currency: 'JPY' } }));
  });

  it('covers false branch of line 25 when clicking non-currency-toggle element', () => {
    const otherButton = document.getElementById('other-button');
    
    // Click on element that is not a .currency-toggle -> clickedButton will be null -> line 25 condition is FALSE
    otherButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.dispatchEvent).not.toHaveBeenCalled();
  });
});