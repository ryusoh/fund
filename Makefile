VENV_PYTHON := venv/bin/python

# If a venv exists, use it; otherwise, fall back to system python3
ifeq ($(wildcard $(VENV_PYTHON)),)
	PY := python3
else
	PY := $(VENV_PYTHON)
endif
PIP := $(PY) -m pip

.PHONY: help install-dev hooks precommit precommit-fix perms check-perms lint fmt fmt-check lint-fix type sec test verify js-lint js-test vendor-fetch vendor-verify vendor-clean serve fund fix check completion update-hooks twrr-refresh

PYTHON_BIN := $(PY)
TWRR_STEPS := scripts/twrr/step01_load_transactions.py \
		 scripts/twrr/step02_apply_splits.py \
		 scripts/twrr/step03_fetch_prices.py \
		 scripts/twrr/step04_compute_holdings.py \
		 scripts/generate_composition_data.py \
		 scripts/twrr/step05_cashflows.py \
		 scripts/twrr/step06_compute_twrr.py \
		 scripts/twrr/step07_plot_twrr.py

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
	@echo "  verify        Lint, type, sec, and tests"
	@echo "  check         Run fmt-check + lint (quick CI parity)"
	@echo "  fix           Run fmt + lint-fix"
	@echo "  vendor-*      Manage vendor assets"
	@echo "  serve         Start dev server"
	@echo "  fund          Show CLI help"

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
	fi

precommit: hooks fmt-check
	@# Run pre-commit only if a config exists
	@if [ -f .pre-commit-config.yaml ]; then \
		$(PY) -m pre_commit run --all-files --show-diff-on-failure; \
	else \
		echo "No .pre-commit-config.yaml; skipping pre-commit."; \
	fi

precommit-fix: fmt lint-fix

perms:
	chmod +x bin/fund bin/portfolio bin/holdings bin/update-all

lint: js-lint
	ruff check scripts tests
	stylelint "**/*.css"
	markdownlint "**/*.md" --ignore node_modules

fmt:
	black .
	@# Prefer shared config if present
	@if [ -f .ci-configs/js/.prettierrc.json ]; then \
		npx prettier --write . \
		  --config .ci-configs/js/.prettierrc.json \
		  --ignore-path .ci-configs/js/.prettierignore; \
	else \
		prettier --write .; \
	fi

fmt-check:
	@# Prefer shared config if present
	@if [ -f .ci-configs/js/.prettierrc.json ]; then \
		npx prettier -c . \
		  --config .ci-configs/js/.prettierrc.json \
		  --ignore-path .ci-configs/js/.prettierignore; \
	else \
		prettier --check .; \
	fi

type:
	$(PY) -m mypy

sec:
	bandit -r scripts -lll

js-lint:
	eslint . --ext .js

lint-fix:
	eslint . --ext .js --fix || true
	@# Ensure stylistic plugin availability if needed
	npx -y -p @stylistic/stylelint-plugin stylelint "**/*.css" --config-basedir "$(PWD)" --fix || true

js-test:
	npm test

test: js-test
	pytest

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

fund:
	$(PY) -m scripts.cli --help

completion:
	@echo 'To enable completion in current shell:'
	@echo '  eval "$$((command -v register-python-argcomplete >/dev/null 2>&1 && register-python-argcomplete fund) || python -m argcomplete.register-python-argcomplete fund)"'
	@echo 'Then `source ~/.zshrc` to reload your rc if needed.'

update-hooks:
	$(PY) -m pre_commit autoupdate --repo https://github.com/pre-commit/pre-commit-hooks

twrr-refresh:
	@mkdir -p data/checkpoints data/output/figures
	@echo 'Running TWRR pipeline...'
	@for step in $(TWRR_STEPS); do \
		echo "Running $$step"; \
		$(PYTHON_BIN) $$step || exit $$?; \
	done
