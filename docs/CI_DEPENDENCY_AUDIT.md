# CI Dependency Audit - March 2026

## Issues Found and Fixed

### 🔴 Critical Issues (Fixed)

#### 1. Missing `--yes` flags on `npx` commands

**Problem:** CI was failing because `npx` couldn't find executables in the CI environment.

**Fixed in:**

- `Makefile` - All `npx` commands now use `--yes`
- `.pre-commit-config.yaml` - All `npx` hooks now use `--yes`

**Commands updated:**

- `npx prettier` → `npx --yes prettier`
- `npx eslint` → `npx --yes eslint`
- `npx stylelint` → `npx --yes stylelint`
- `npx markdownlint` → `npx --yes markdownlint`
- `npx jest` → `npx --yes jest`

#### 2. `wrangler` command not installed

**Problem:** The `deploy-worker` target ran `wrangler deploy` but wrangler was not in package.json.

**Fixed in:**

- `package.json` - Added `wrangler: ^4.0.0` to devDependencies
- `Makefile` - Changed to `npx --yes wrangler deploy` for safety

---

### 🟡 Cleanup Items (Fixed)

#### 3. Unused `pip-audit` dependency

**Problem:** `pip-audit` was installed but never used in any target.

**Fixed in:**

- `requirements-dev.txt` - Removed `pip-audit`
- `Makefile` - Added note in `sec` target about manual pip-audit usage

#### 4. Undocumented `twrr-refresh` dependencies

**Problem:** The `twrr-refresh` target runs 12 Python scripts without documenting requirements.

**Fixed in:**

- `Makefile` - Added comments noting required packages and API keys

---

## Verified Dependencies

### Python Dependencies (requirements-dev.txt)

All Python tools are properly installed via `pip install -r requirements-dev.txt`:

- ✅ pytest, pytest-mock, pytest-cov
- ✅ ruff, black, mypy, bandit
- ✅ pre-commit, argcomplete
- ✅ types-pytz, types-requests

### Node.js Dependencies (package.json)

All Node.js tools are properly installed via `npm ci`:

- ✅ eslint, prettier, stylelint
- ✅ jest, babel-jest
- ✅ husky, lint-staged
- ✅ wrangler (newly added)

### Auto-installed via npx --yes

These tools are auto-installed on-demand (no local installation needed):

- ✅ prettier (fallback)
- ✅ eslint (fallback)
- ✅ stylelint (fallback)
- ✅ markdownlint
- ✅ jest (fallback)
- ✅ wrangler

### System Tools

These are assumed to be available on the system:

- ✅ python3, make, bash, git, chmod

---

## CI Workflow Verification

The CI workflow (`.github/workflows/ci.yml`) now:

1. ✅ Installs Python dependencies
2. ✅ Installs Node.js dependencies
3. ✅ Runs `make precommit-fix` as single source of truth
4. ✅ All npx commands have `--yes` flag
5. ✅ No duplicated tool calls

---

## Test Coverage

### CI Parity Tests (tests/python/test_ci_parity.py)

10 automated tests verify:

- ✅ Makefile has `precommit-fix` target
- ✅ CI calls `make precommit-fix`
- ✅ CI doesn't duplicate: ruff, pytest, eslint, stylelint, prettier, black, mypy, bandit

### All Tests Pass

- ✅ 218 Python tests pass
- ✅ 1224 JavaScript tests pass

---

## How to Maintain

### Adding New Checks

1. Add the check to `make precommit-fix` in Makefile
2. Add any new dependencies to package.json or requirements-dev.txt
3. Run `make ci-parity` to verify
4. CI will automatically pick up the change

### Before Pushing

```bash
# Run full precommit suite
make precommit-fix

# Or just verify parity
make ci-parity
```

### Troubleshooting CI Failures

If CI fails with "command not found":

1. Check if the tool is in package.json or requirements-dev.txt
2. Add `--yes` flag to npx commands
3. Run `make ci-parity` locally to catch issues
