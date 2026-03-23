## 2024-05-30 - Testing Asynchronous Imports and Global Properties in Jest

**Learning:** When using dynamic imports (\`import(...)\`) in Jest tests, the returned promise must be either \`await\`ed or explicitly returned from the test block. Failing to do so causes floating promises, where Jest finishes synchronous execution prematurely and results in false-positive test passes. Additionally, when mocking global \`window\` properties like \`window.innerWidth\` in Jest/JSDOM tests, use \`Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: X });\` instead of direct assignment, as direct assignment either fails silently or throws an error depending on strict mode.

**Action:** Always use \`await\` or \`return\` when dealing with dynamic imports inside test cases. Use \`Object.defineProperty\` for mocking global browser objects.

## 2024-05-31 - Testing Global DOM Event Listeners

**Learning:** When testing global DOM event listeners in Jest, if `document.dispatchEvent` is mocked globally (e.g., in a `beforeEach` block with `jest.spyOn(document, 'dispatchEvent')`), custom events dispatched manually (e.g., `document.dispatchEvent(new CustomEvent(...))`) will be intercepted and the actual listener callbacks will not fire. This prevents testing internal event handler logic.
**Action:** Use `document.dispatchEvent.mockRestore()` within the specific test blocks where the actual execution of the global event listener logic needs to be verified.

## 2024-11-13 - Handling Async Microtasks with Fake Timers

**Learning:** When testing asynchronous `Promise` chains (like `fetch().then().finally()`) that are tightly coupled with macroscopic timer functions (like `setTimeout` or `requestIdleCallback`) inside an IIFE, using standard `jest.useFakeTimers()` can cause test hangs or timeouts if `jest.advanceTimersByTime` is called before microtasks resolve. The microtask queue (Promises) must be explicitly awaited using `await jest.advanceTimersByTimeAsync(ms)` or `await Promise.resolve()` inside a loop to ensure callbacks are executed properly without deadlocking the Jest environment.
**Action:** Do not use custom synchronous `Promise` mock implementations. Instead, use `await jest.advanceTimersByTimeAsync()` to properly progress both fake timers and the microtask queue simultaneously.
