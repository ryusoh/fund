## 2026-03-18 - Fix insecure temp directory usage for yfinance cache

**Vulnerability:** Predictable, globally writable temporary directories (e.g., `/tmp/yf-cache` or `/tmp/yf-cache-<uid>`) were used for `yfinance` caching. This exposes the application to symlink attacks, privilege escalation, and local Denial of Service (CWE-377 / CWE-379).
**Learning:** Hardcoding `/tmp` paths was initially done to avoid permission errors in CI environments, but using predictable paths opens up security vulnerabilities. Furthermore, `os.getuid()` is not available on Windows, breaking cross-platform compatibility. Lastly, while `tempfile.mkdtemp` creates secure random directories, it requires explicit cleanup logic (unlike `TemporaryDirectory`) to prevent inode exhaustion, especially at the module level where contexts can't be easily managed.
**Prevention:** Instead of hardcoded paths, use `tempfile.mkdtemp` to generate unique, secure directories. To prevent resource leaks when used at the module level, register an `atexit` handler with `shutil.rmtree(path, ignore_errors=True)` to ensure cleanup on normal program termination.

## 2025-01-20 - Sentinel Routine System Maintenance

**Issue:** Empty `catch {}` blocks were silently suppressing exceptions in `js/loader/vendorLoader.js`.

**Action:** Added context logging via `console.warn` to provide visibility into fallback failures.

**Verification:** Linter checks pass and errors will now appear in console if vendor loading fails.

## 2026-03-20 - API Key Leak in Exception Logging

**Vulnerability:** In multiple scripts (`fetch_etf_country_allocations.py`, `update_vt_sectors.py`, `update_vt_hhi.py`, and `generate_pe_data.py`), an API key (`scraper_api_key`) was appended to the URL query parameters. If the `requests` library encountered a failure (e.g., 401 Unauthorized or Timeout) and `raise_for_status()` threw an `HTTPError`, the default string representation of the exception `e` included the complete URL. Printing this exception directly to the console leaked the secret API key into plaintext CI logs.
**Learning:** Developers often instinctively use `print(f"Error: {e}")` to log standard exceptions. However, network libraries like `requests` aggressively include full request context (like the URL) in exception messages for debugging purposes. This creates a severe credential leak vector when API keys are passed via URL query parameters rather than HTTP headers.
**Prevention:** When making HTTP requests with credentials in the URL, either switch to passing credentials via HTTP Headers (if the API supports it), or proactively catch and scrub the exception string before logging (e.g., `str(e).replace(api_key, "***")`) to ensure the secret is masked.
