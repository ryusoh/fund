## 2026-03-18 - Fix insecure temp directory usage for yfinance cache

**Vulnerability:** Predictable, globally writable temporary directories (e.g., `/tmp/yf-cache` or `/tmp/yf-cache-<uid>`) were used for `yfinance` caching. This exposes the application to symlink attacks, privilege escalation, and local Denial of Service (CWE-377 / CWE-379).
**Learning:** Hardcoding `/tmp` paths was initially done to avoid permission errors in CI environments, but using predictable paths opens up security vulnerabilities. Furthermore, `os.getuid()` is not available on Windows, breaking cross-platform compatibility. Lastly, while `tempfile.mkdtemp` creates secure random directories, it requires explicit cleanup logic (unlike `TemporaryDirectory`) to prevent inode exhaustion, especially at the module level where contexts can't be easily managed.
**Prevention:** Instead of hardcoded paths, use `tempfile.mkdtemp` to generate unique, secure directories. To prevent resource leaks when used at the module level, register an `atexit` handler with `shutil.rmtree(path, ignore_errors=True)` to ensure cleanup on normal program termination.
## 2025-01-20 - Sentinel Routine System Maintenance

**Issue:** Empty `catch {}` blocks were silently suppressing exceptions in `js/loader/vendorLoader.js`.

**Action:** Added context logging via `console.warn` to provide visibility into fallback failures.

**Verification:** Linter checks pass and errors will now appear in console if vendor loading fails.
