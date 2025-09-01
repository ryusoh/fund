# Fund

![Fund Banner](https://ghproxy.net/https://raw.githubusercontent.com/ryusoh/host/master/archive/personal/DSCF0283.jpg)

<!-- markdownlint-disable-next-line MD033 -->
<p align="right"><em>Nashville, TN · 2025 © <a href="https://instagram.com/lyeutsaon">@lyeutsaon</a></em></p>

## Overview

This project is a web-based application to track and visualize a fund's
portfolio allocations and performance. It fetches holding details and market
data, displaying it in a table and through interactive charts.

The project includes Python scripts for data management and a GitHub Actions
workflow for automated data updates.

## Features

- Dynamic display of portfolio holdings.
- Donut chart visualization of fund allocation.
- Automated updates of fund market data via GitHub Actions.
- Responsive design for desktop and mobile viewing.
- **Comprehensive CLI**: Easy-to-use command-line interface for all fund
  operations.

## Command Line Interface (CLI)

The fund management system provides multiple CLI interfaces optimized for
different use cases:

### Direct Executables

| Command            | Description                   | Examples                    |
| :----------------- | :---------------------------- | :-------------------------- |
| `./bin/fund`       | Main CLI with all subcommands | `./bin/fund holdings list`  |
| `./bin/portfolio`  | Direct portfolio listing      | `./bin/portfolio`           |
| `./bin/holdings`   | Holdings manager              | `./bin/holdings buy AAPL …` |
| `./bin/update-all` | Batch data update utility     | `./bin/update-all`          |

### Shell Integration

Configure shell aliases by running `./scripts/setup-aliases.sh` and adding the
output to your shell configuration:

| Alias              | Description                  | Examples                |
| :----------------- | :--------------------------- | :---------------------- |
| `portfolio` or `p` | Portfolio display            | `portfolio`             |
| `buy`              | Transaction recording (buy)  | `buy AAPL 10 150.50`    |
| `sell`             | Transaction recording (sell) | `sell AAPL 5 155.00`    |
| `fundby()`         | Global buy function          | `fundby AAPL 10 150.50` |

### Alternative Interfaces

| Command                  | Description            | Examples                     |
| :----------------------- | :--------------------- | :--------------------------- |
| `python3 -m scripts.cli` | Module execution       | `python3 -m …`               |
| `npm run fund:*`         | NPM script integration | `npm run fund:holdings list` |

### Optional Install

Install the CLI as a console script for global use:

```bash
pip install -e .
fund --help
```

### Extending the CLI

Subcommands are auto-discovered from `scripts/commands`.

- Create a new module in `scripts/commands/` with an `add_parser(subparsers)`
  function that registers the subcommand and sets `func` to a callable
  accepting `args`.
- Example skeleton:

    ```python
    # scripts/commands/example.py
    import argparse
    def _run(args: argparse.Namespace) -> None:
        print("ran example", args)
    def add_parser(subparsers: argparse._SubParsersAction) -> None:
        p = subparsers.add_parser("example", help="Example command")
        p.add_argument("name")
        p.set_defaults(func=_run)
    ```

## Project Structure

```text
fund/
├── .github/workflows/  # GitHub Actions workflows
├── data/               # JSON data files (holdings, fund data)
├── css/                # CSS stylesheets
├── js/                 # JavaScript files (data services, chart configurations)
├── scripts/            # Python package: CLI + tasks
│   ├── cli.py          # Main CLI entry
│   ├── commands/       # CLI subcommands (auto-discovered)
│   ├── data/           # Data fetch/update tasks
│   ├── pnl/            # P&L and history tasks
│   ├── portfolio/      # Portfolio management tasks
│   ├── vendor/         # Node scripts for vendor assets
│   └── setup-aliases.sh* # Alias helper script
├── tests/              # Test files (JavaScript and Python)
├── bin/                # Local launchers
│   ├── fund*           # ./bin/fund [command]
│   ├── portfolio*      # ./bin/portfolio
│   ├── holdings*       # ./bin/holdings [action]
│   └── update-all*     # ./bin/update-all
├── index.html          # Main HTML page
├── package.json        # NPM configuration with CLI scripts
└── README.md

* = executable files
```

## Setup and Usage

1. **Clone the repository:**

    ```bash
    git clone https://github.com/ryusoh/fund.git
    cd fund
    ```

2. **Python Environment Setup:**
    - Ensure Python 3.x is installed.
    - Create a virtual environment (recommended):

        ```bash
        python -m venv venv
        source venv/bin/activate  # On Windows: venv\Scripts\activate
        ```

    - Install dependencies:

        ```bash
        pip install -r requirements.txt
        ```

3. **CLI Usage:**

    The project includes a comprehensive CLI for fund management operations.

    **Common commands:**

    ```bash
    ./bin/fund --help              # Main CLI help
    ./bin/portfolio                # Show your portfolio
    ./bin/holdings buy AAPL 10 150.50   # Buy shares
    ./bin/holdings sell AAPL 5 155.00   # Sell shares
    ./bin/update-all               # Update all data
    ```

    **Optional: shell alias setup:**

    ```bash
    ./scripts/setup-aliases.sh # Prints alias setup instructions
    # After setup, you can use:
    portfolio                  # Show holdings
    buy AAPL 10 150.50        # Quick buy
    sell AAPL 5 155.00        # Quick sell
    p                         # Short portfolio alias
    fund forex                # Update forex rates
    ```

    **Full CLI options:**

    ```bash
    # Direct CLI usage
    python3 -m scripts.cli --help
    ./bin/fund --help

    # NPM scripts (also available)
    npm run fund:holdings list
    npm run fund:forex
    npm run fund:update-all
    ```

4. **Viewing the Page:**

    Open `index.html` in your web browser or run:

    ```bash
    npm run dev  # Serves on http://localhost:8000
    ```

## Automated Data Updates

This project uses multiple GitHub Actions to keep data fresh:

- `update-fund-data.yml` (every 30 min on weekdays): fetches latest prices via
  `scripts/data/update_fund_data.py` and updates `data/fund_data.json`.
- `daily-forex-update.yml` (daily): fetches FX rates via
  `scripts/data/fetch_forex.py` and updates `data/fx_data.json`.
- `update-historical-data.yml` (post‑close on weekdays): appends the latest
  daily values via `scripts/pnl/update_daily_pnl.py` and updates
  `data/historical_portfolio_values.csv`.

All workflows commit changes back to the repository when files change.

## Testing

Run JavaScript tests (Jest):

```bash
npm install
npm test
```

Run Python tests (pytest):

```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
pytest --cov=.
```

### Developer Tasks (Makefile)

Common automation is available via `make`:

```makefile
make install-dev   # Install Python + Node dev deps
make hooks         # Install pre-commit hooks
make lint          # Ruff + ESLint + Stylelint
make fmt           # Black + Prettier
make type          # mypy
make sec           # bandit
make test          # pytest + jest
make verify        # lint + type + sec + tests
make vendor-fetch  # fetch vendor assets
make serve         # start dev server
```

## Portfolio Management Script (`scripts/portfolio/manage_holdings.py`)

This Python script helps you manage your stock portfolio by tracking buy and sell
transactions and automatically updating your holdings. It stores data in a JSON
file, by default named `holdings_details.json` located in the `data/` directory
relative to the project root.

### Holding Management Features

- **Track Holdings**: Maintains a record of your shares and average purchase
  price for each ticker in `data/holdings_details.json`.
- **Buy Transactions**: Add new purchases, updating share count and
  recalculating the average price. Handles new tickers.
- **Sell Transactions**: Record sales, updating share count. Calculates
  realized profit/loss for the transaction. If all shares of a ticker are
  sold, it's removed from holdings.
- **List Holdings**: Display a summary of your current portfolio, including cost
  basis per holding and total portfolio cost basis.
- **Data Persistence**: Holdings are saved in a JSON file (default:
  `data/holdings_details.json`).
- **Precision**: Uses `Decimal` for financial calculations to ensure accuracy.

### Prerequisites

- Python 3.6+

### Setup

1. Ensure the script `manage_holdings.py` is located in the
   `scripts/portfolio/` directory of your project.

    ```text
    project_root/
    ├── scripts/
    │   ├── portfolio/
    │   │   └── manage_holdings.py
    │   └── data/
    │       └── update_fund_data.py
    ├── data/
    │   └── holdings_details.json  (will be created/updated here by default)
    └── README.md
    ```

2. You can run the script using
   `python scripts/portfolio/manage_holdings.py ...` from your project root.

### Usage

The script is run from the command line.

**General Syntax (run from project root):**

```bash
python scripts/portfolio/manage_holdings.py [options] <command> [command_args...]
```

**Options:**

- `--file FILEPATH`: Specifies the path to the holdings JSON file.
    - Defaults to `holdings_details.json` located in the same directory as the
      script (e.g., `data/holdings_details.json`).

**Commands:**

#### 1. `buy` - Record a Purchase

Adds shares of a stock to your portfolio. If the ticker is new, it will be
added. If it exists, shares are added, and the average cost is recalculated.

**Syntax:**

```bash
python scripts/portfolio/manage_holdings.py buy <TICKER> <SHARES> <PRICE>
```

**Arguments:**

- `<TICKER>`: The stock ticker symbol (e.g., `AAPL`, `GOOGL`).
  Case-insensitive (will be stored as uppercase).
- `<SHARES>`: The number of shares purchased (e.g., `10`, `25.5`). Must be
  positive.
- `<PRICE>`: The price per share at which they were purchased (e.g.,
  `150.75`). Must be non-negative.

**Example:**

```bash
# Assumes holdings_details.json will be in data/
python scripts/portfolio/manage_holdings.py buy AAPL 10 170.50
python scripts/portfolio/manage_holdings.py buy msft 5.5 300.25

# To use a custom file path:
python scripts/portfolio/manage_holdings.py --file \
  custom_portfolio/my_stocks.json buy GOOG 100 135.00
```

#### 2. `sell` - Record a Sale

Removes shares of a stock from your portfolio. It calculates the realized profit
or loss for this specific transaction based on the average cost of your holding.
If all shares of a ticker are sold, the ticker is removed.

**Syntax:**

```bash
python scripts/portfolio/manage_holdings.py sell <TICKER> <SHARES> <PRICE>
```

**Arguments:**

- `<TICKER>`: The stock ticker symbol (e.g., `AAPL`).
- `<SHARES>`: The number of shares sold (e.g., `5`, `10.5`). Must be positive
  and not exceed current holdings.
- `<PRICE>`: The price per share at which they were sold (e.g., `180.20`). Must
  be non-negative.

**Example:**

```bash
python scripts/portfolio/manage_holdings.py sell AAPL 5 180.00
```

#### 3. `list` - Display Current Holdings

Shows a summary of all tickers in your portfolio, including the number of
shares, the average purchase price, cost basis per holding, and total portfolio
value at cost.

**Syntax:**

```bash
python scripts/portfolio/manage_holdings.py list
```

**Example:**

```bash
python scripts/portfolio/manage_holdings.py list
python scripts/portfolio/manage_holdings.py --file \
  custom_portfolio/my_stocks.json list
```

### Data File (e.g., `data/holdings_details.json`)

The script reads from and writes to a JSON file. By default, this is
holdings_details.json in the data/ directory.

Example data/holdings_details.json content:

```json
{
    "AAPL": {
        "shares": "10.0",
        "average_price": "172.000000"
    },
    "MSFT": {
        "shares": "5.5",
        "average_price": "300.250000"
    }
}
```

Note: Shares and average prices are stored as strings in the JSON file to
maintain precision using the Decimal type in Python. The script handles
conversions internally.
