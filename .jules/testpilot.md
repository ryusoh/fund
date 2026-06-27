# Testpilot Journal

## 2025-02-27 - Testpilot: Mocking JSDOM Missing Globals

**Learning:** When testing files that initialize a `new Worker()` inside their script body before exporting (e.g., `const monteCarloWorker = new Worker(...)`), tests running in JSDOM will fail immediately upon import with `ReferenceError: Worker is not defined` if `Worker` isn't globally mocked first.

**Action:** Explicitly mock `global.Worker` (e.g., `global.Worker = class { postMessage() {} onmessage() {} };`) inside the `beforeEach` block of the test file *before* importing the module using `await import()`.
