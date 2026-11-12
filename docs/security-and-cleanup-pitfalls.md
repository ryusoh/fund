# Security, error-handling, and dead-code pitfalls

Repo-specific lessons carried over from the retired Sentinel and Janitor
personas (see `docs/jules-retirement-plan.md`). The personas themselves remain
in Git history at `034e6c55`.

## Attack surface

This is not a typical web app: no SQL, no auth or session layer, no user
accounts. Concentrate on:

- **Cloudflare worker (`worker/src/index.js`)** — CORS origin validation,
  security headers on every response and the `OPTIONS` preflight, outbound
  `fetch` timeouts (`AbortSignal.timeout`), and length/element limits on query
  params.
- **Python pipeline (`scripts/`)** — secret scrubbing in logs and exceptions,
  safe temp directories, no `except: pass`, no shell or path injection from
  external data.
- **Frontend (`js/`)** — unsafe DOM sinks (`innerHTML`), secure randomness in
  financial contexts, empty or silent `catch` blocks.

## Pitfalls

- **Worker CORS:** parse `Origin` with the `URL` constructor, match `hostname`
  exactly, and enforce `https:`. `endsWith('.example.com')` on the raw string is
  bypassable via `…example.com.evil.com`.
- **Scrubbing secrets from logs:** replace every encoding of the key — raw,
  `urllib.parse.quote`, and `quote_plus` in Python; raw, `encodeURIComponent`,
  and `+`-form-encoding in JS. Use `scripts/utils/security_utils.py:scrub_secrets`
  rather than inline replacements.
- **Temp directories:** `tempfile.mkdtemp` needs explicit cleanup (`atexit` +
  `shutil.rmtree(..., ignore_errors=True)`); prefer `TemporaryDirectory` when
  the scope allows.
- **Financial RNG:** use `crypto.getRandomValues()`; never fall back to
  `Math.random()` — throw and fail closed.
- **Header parity:** keep security headers consistent between the static site
  (`_headers`) and worker responses; the weaker surface is the weak link.

## Removing dead code

- Search with `git grep -n <target>` across **all** tracked files before
  deleting — including `.md`, `.sh`, `.yml`, `Makefile`, `.agents/`, `.js`,
  `.py`, `.css`, `.html`. A symbol, function, or script referenced by docs,
  skill workflows, shell scripts, or CI configs is not dead.
- Re-exported public API, worker entry points, CLI `main()`/`argparse` functions,
  and scripts referenced by skills or `bin/` wrappers are not dead just because
  tests or docs are the only in-repo caller.
- Never delete standalone scripts, CLI utilities, test fixtures, or gate helpers
  because they look unused.
- When deleting production code, delete its tests in the **same commit**: the
  bot-PR hygiene gate allows test shrinkage only alongside production deletions.
- Ignore `js/vendor/**` and other third-party code, and never touch generated
  `data/`.
