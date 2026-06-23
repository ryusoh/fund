VENV_PYTHON := venv/bin/python

# If a venv exists, use it; otherwise, fall back to system python3
ifeq ($(wildcard $(VENV_PYTHON)),)
	PY := python3
else
	PY := $(VENV_PYTHON)
endif
PIP := $(PY) -m pip

.PHONY: help install-dev hooks precommit precommit-fix perms check-perms lint fmt fmt-check lint-fix markdownlint-fix type sec test test-js verify js-lint js-test vendor-fetch vendor-verify vendor-clean verify-calendar-build serve screenshot fund fix check completion update-hooks twrr-refresh deploy-worker ci-parity _fmt-black _fmt-prettier _lintfix-eslint _lintfix-stylelint _lintfix-markdown _lintfix-ruff _pytest

PYTHON_BIN := $(PY)
TWRR_STEPS := scripts/twrr/step01_load_transactions.py \
		 scripts/twrr/step02_apply_splits.py \
		 scripts/twrr/step03_fetch_prices.py \
		 scripts/twrr/step04_compute_holdings.py \
	 scripts/data/fetch_ticker_metadata.py \
	 scripts/generate_composition_data.py \
	 scripts/generate_geography_data.py \
	 scripts/generate_marketcap_from_composition.py \
	 scripts/generate_pe_data.py \
	 scripts/generate_yield_data.py \
	 scripts/twrr/step05_cashflows.py \
	 scripts/twrr/step06_compute_twrr.py \
	 scripts/ratios/calculate_ratios.py \
	 scripts/twrr/step07_plot_twrr.py

PRETTIER_FILE_LIST := $(shell git ls-files '*.js' '*.jsx' '*.ts' '*.tsx' '*.css' '*.json' '*.md' '*.html' '*.yml' '*.yaml' 2>/dev/null | grep -v '^assets/' | grep -v '^js/vendor/' | grep -v '^data/' | while read -r file; do if [ -f "$$file" ]; then printf '%s ' "$$file"; fi; done)

help:
	@echo "Targets:"
	@echo "  install-dev   Install Python and Node dev deps"
	@echo "  hooks         Install pre-commit git hooks"
	@echo "  lint          Run ruff and JS/CSS linters"
	@echo "  lint-fix      Apply ESLint/Stylelint auto-fixes"
	@echo "  fmt           Run black and prettier (write)"
	@echo "  fmt-check     Run Prettier in check mode"
	@echo "  type          Run mypy type checking"
	@echo "  sec           Run bandit security checks"
	@echo "  test          Run Python and JS tests"
	@echo "  test-js       Scoped fast JS test, no coverage (FILE=path/to.test.js)"
	@echo "  verify        Lint, type, sec, and tests"
	@echo "  check         Run fmt-check + lint (quick CI parity)"
	@echo "  fix           Run fmt + lint-fix"
	@echo "  vendor-*      Manage vendor assets"
	@echo "  serve         Start dev server"
	@echo "  screenshot    Headless PNG of a page (URL=/terminal/) for visual checks"
	@echo "  fund          Show CLI help"
	@echo "  deploy-worker Deploy Cloudflare Worker"

install-dev:
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements-dev.txt
	npm ci

hooks:
	@# Install git hooks unless core.hooksPath is managed externally
	@if git config --get core.hooksPath >/dev/null 2>&1; then \
		echo "Note: core.hooksPath is set; skipping pre-commit hook installation."; \
	else \
		$(PY) -m pre_commit install; \
		$(PY) -m pre_commit install --hook-type post-commit; \
	fi

precommit: hooks fmt-check
	@# Run pre-commit only if a config exists
	@if [ -f .pre-commit-config.yaml ]; then \
		$(PY) -m pre_commit run --all-files --show-diff-on-failure --color never; \
	else \
		echo "No .pre-commit-config.yaml; skipping pre-commit."; \
	fi

# ⚠️ CI PARITY NOTE: This target is called by GitHub Actions CI (.github/workflows/ci.yml)
# Any new checks added here must work in CI (no local-only tools/paths)
# Parallelised: format → lint-fix → test → verify (each phase runs sub-tasks concurrently)
precommit-fix:
	@# Phase 1: Format (black + prettier touch different file types)
	@$(MAKE) -j2 _fmt-black _fmt-prettier
	@# Phase 2: Lint-fix (eslint, stylelint, markdownlint, ruff — all different file types)
	@$(MAKE) -j4 _lintfix-eslint _lintfix-stylelint _lintfix-markdown _lintfix-ruff
	@# Phase 3: Test (JS + Python in parallel)
	@# verify-calendar-build first: confirm cal-heatmap-src/*.ts still compiles
	@# (autonomous agents edit it; the shipped bundle is otherwise only mocked).
	@$(MAKE) verify-calendar-build
	@$(MAKE) -j2 js-test _pytest
	@# Phase 4: Final verification
	@$(MAKE) precommit; \
	STATUS=$$?; \
	git checkout data/transactions.csv 2>/dev/null || true; \
	exit $$STATUS

_fmt-black:
	$(PY) -m black .

_fmt-prettier:
	@if [ -n "$(strip $(PRETTIER_FILE_LIST))" ]; then \
		npx --yes prettier --write --log-level warn --ignore-path .prettierignore $(PRETTIER_FILE_LIST); \
	else \
		echo "No Prettier targets"; \
	fi

_lintfix-eslint:
	npx --yes eslint . --ext .js --fix || true

_lintfix-stylelint:
	npx --yes stylelint "**/*.css" --fix || true

_lintfix-markdown:
	npm exec -- markdownlint-cli2 --fix "**/*.md" "#**/node_modules/**" "#venv/**" "#.qwen/**" "#.claude/**"

_lintfix-ruff:
	$(PY) -m ruff check --fix scripts tests

_pytest:
	$(PY) -m pytest --cov=scripts --cov-report=term-missing

perms:
	chmod +x bin/fund bin/portfolio bin/holdings bin/update-all

lint: js-lint
	ruff check scripts tests
	npx --yes stylelint "**/*.css"
	npx --yes markdownlint "**/*.md" --ignore-path .gitignore

fmt:
	$(PY) -m black .
	@if [ -n "$(strip $(PRETTIER_FILE_LIST))" ]; then \
		npx --yes prettier --write --log-level warn --ignore-path .prettierignore $(PRETTIER_FILE_LIST); \
	else \
		echo "No Prettier targets"; \
	fi

fmt-check:
	@echo "Checking formatting..."
	@if [ -n "$(strip $(PRETTIER_FILE_LIST))" ]; then \
		npx --yes prettier --check --log-level warn --ignore-path .prettierignore $(PRETTIER_FILE_LIST); \
	else \
		echo "No Prettier targets"; \
	fi

type:
	$(PY) -m mypy
	@echo "JS type check (tsc --checkJs on whitelist; non-blocking — see docs/js-typing-strategy.md):"
	@npx tsc -p jsconfig.json || echo "⚠️  JS type check found issues (non-blocking for now)"

sec:
	bandit -r scripts -lll
	@echo "Note: For Python dependency security scanning, run: pip install pip-audit && pip-audit"

js-lint:
	npx --yes eslint . --ext .js

lint-fix:
	npx --yes eslint . --ext .js --fix || true
	@# Ensure stylistic plugin availability if needed
	npx --yes stylelint "**/*.css" --fix || true

markdownlint-fix:
	npm exec -- markdownlint-cli2 --fix "**/*.md" "#**/node_modules/**" "#venv/**" "#.qwen/**" "#.claude/**"

js-test:
	npm test

# Scoped, fast JS test for the tight edit→verify loop (skips coverage):
#   make test-js FILE=tests/js/ui/liquidGlassRefraction.test.js
test-js:
	npx --yes jest $(FILE)

test: js-test
	$(PY) -m pytest --cov=scripts --cov-report=term-missing

verify: lint type sec test

check: fmt-check lint

fix: fmt lint-fix

check-perms:
	@test -x bin/fund
	@test -x bin/portfolio
	@test -x bin/holdings
	@test -x bin/update-all

vendor-fetch:
	npm run vendor:fetch

vendor-verify:
	npm run vendor:verify

vendor-clean:
	npm run vendor:clean

serve:
	npm run dev

# Headless screenshot for visual verification (Chromium-only effects render).
# Writes a PNG under screenshots/ and prints its path. Needs `npx playwright
# install chromium` once (after `npm install`).
#   make screenshot URL=/terminal/
#   make screenshot URL=/terminal/ ARGS="--full --wait 1500"
screenshot:
	node scripts/screenshot.mjs $(URL) $(ARGS)

# Confirm js/ui/cal-heatmap-src/*.ts still compiles (esbuild bundle succeeds).
# Builds to a throwaway temp file so the committed bundle is never touched or
# diffed — source↔bundle drift (stale or intentional) is intentionally tolerated;
# the smoke test (tests/js/pages/calendar/calHeatmapSmoke.test.js) verifies the
# *committed* bundle still paints. Catches a broken .ts before anyone rebuilds.
verify-calendar-build:
	@echo "Verifying cal-heatmap-src compiles..."
	@CALHEATMAP_OUT="$$(mktemp -t calheatmap)" npm run --silent vendor:build-calendar >/dev/null

fund:
	$(PY) -m scripts.cli --help

completion:
	@echo 'To enable completion in current shell:'
	@echo '  eval "$$((command -v register-python-argcomplete >/dev/null 2>&1 && register-python-argcomplete fund) || python -m argcomplete.register-python-argcomplete fund)"'
	@echo 'Then `source ~/.zshrc` to reload your rc if needed.'

update-hooks:
	$(PY) -m pre_commit autoupdate --repo https://github.com/pre-commit/pre-commit-hooks

ci-parity:
	@echo "Checking CI parity..."
	$(PY) -m pytest tests/python/test_ci_parity.py -v

deploy-worker:
	@echo "Deploying Cloudflare Worker..."
	cd worker && npx --yes wrangler deploy

twrr-refresh:
	@# Note: Requires yfinance, polygon-api-client, pandas, numpy, matplotlib (see requirements.txt)
	@# API keys needed: ALPACA_API_KEY, ALPACA_API_SECRET, POLYGON_KEY
	@mkdir -p data/checkpoints data/output/figures
	@echo 'Running TWRR pipeline...'
	@for step in $(TWRR_STEPS); do \
		echo "Running $$step"; \
		$(PYTHON_BIN) $$step || exit $$?; \
	done
