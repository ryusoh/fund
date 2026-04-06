## 2025-03-28 - [CRITICAL] Fix Resource Leak in Temporary Directories

**Vulnerability:** A temporary directory was being created via `tempfile.mkdtemp` in `scripts/generate_pe_data.py` to prevent symlink attacks, but it was not explicitly cleaned up after execution.
**Learning:** Hardcoding `/tmp` paths was initially done to avoid permission errors in CI environments, but using predictable paths opens up security vulnerabilities. Furthermore, `os.getuid()` is not available on Windows, breaking cross-platform compatibility. Lastly, while `tempfile.mkdtemp` creates secure random directories, it requires explicit cleanup logic (unlike `TemporaryDirectory`) to prevent inode exhaustion, especially at the module level where contexts can't be easily managed. This was observed to be missing in certain scripts.
**Prevention:** Instead of hardcoded paths, use `tempfile.mkdtemp` to generate unique, secure directories. To prevent resource leaks when used at the module level, register an `atexit` handler with `shutil.rmtree(path, ignore_errors=True)` to ensure cleanup on normal program termination.

- **Issue:** Codebase contained unaddressed silent failures via empty catch blocks in `js/ui/service_worker_register.js` and `worker/src/index.js`.
- **Action:** Added `console.warn` and `console.error` to handle exceptions properly and provide visibility for service worker update check errors and worker fetch failures.

## 2025-04-18 - [CRITICAL] Prevent Leakage of URL-Encoded API Keys in Exception Logs

**Vulnerability:** When handling exceptions from `requests` (e.g., `Timeout`, `ConnectionError`) in Python, the exception string (`str(e)`) often includes the requested URL. When API keys are passed via URL query strings (like with ScraperAPI) and constructed using `urllib.parse.urlencode`, the API key may be URL-encoded if it contains special characters. Simply calling `.replace(api_key, "***")` on the exception string fails to scrub the URL-encoded version of the key, resulting in plaintext credential leaks in CI logs.
**Learning:** `replace(api_key, "***")` is insufficient for query string credentials. The exception handlers did not account for URL-encoded credentials present in the raw exception stack trace or error message strings.
**Prevention:** Always scrub the URL-encoded version of the API key as well, using `urllib.parse.quote(api_key)`:

```python
import urllib.parse
error_msg = error_msg.replace(urllib.parse.quote(api_key), "***")
```

## 2024-04-05 - Centralized Security Secrets Scrubbing Utility

**Vulnerability:** Duplicate manual scrubbing of API keys and secrets within error exception blocks across multiple python scripts (`fetch_etf_country_allocations.py`, `thesis_update_gemini.py`, `update_vt_sectors.py`, `update_fund_data.py`, `generate_pe_data.py`, `update_vt_hhi.py`). The duplicate logic made it prone to human errors and incomplete masking (e.g. failing to replace `quote_plus` URL variations).
**Learning:** Hardcoded manual replacement logic for secrets is brittle. Having scattered implementations leads to drift, technical debt, and inevitably leaked tokens when new URL-encoded types are introduced or missed.
**Prevention:** Created a centralized utility function (`scripts/utils/security_utils.py:scrub_secrets`) that robustly strips standard, URL-quoted (`urllib.parse.quote`), and plus-quoted (`urllib.parse.quote_plus`) API secrets from error logs. Future scripts must import and use this utility rather than writing inline text replacements.
