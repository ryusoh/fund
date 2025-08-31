VENV_PYTHON := venv/bin/python

# If a venv exists, use it; otherwise, fall back to system python3
ifeq ($(wildcard $(VENV_PYTHON)),)
	PY := python3
else
	PY := $(VENV_PYTHON)
endif
PIP := $(PY) -m pip

.PHONY: help install-dev hooks precommit perms check-perms lint fmt type sec test verify js-lint js-test vendor-fetch vendor-verify vendor-clean serve fund

help:
	@echo "Targets:"
	@echo "  install-dev   Install Python and Node dev deps"
	@echo "  hooks         Install pre-commit git hooks"
	@echo "  lint          Run ruff and JS/CSS linters"
	@echo "  fmt           Run black and prettier"
	@echo "  type          Run mypy type checking"
	@echo "  sec           Run bandit security checks"
	@echo "  test          Run Python and JS tests"
	@echo "  verify        Lint, type, sec, and tests"
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

precommit: hooks
	$(PY) -m pre_commit run --all-files --show-diff-on-failure

perms:
	chmod +x bin/fund bin/portfolio bin/holdings bin/update-all

lint: js-lint
	ruff check scripts tests
	stylelint "**/*.css"
	markdownlint "**/*.md" --ignore node_modules

fmt:
	black .
	prettier --write .

type:
	$(PY) -m mypy

sec:
	bandit -r scripts -lll

js-lint:
	eslint . --ext .js

js-test:
	npm test

test: js-test
	pytest

verify: lint type sec test

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
