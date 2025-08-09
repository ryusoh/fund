# Fund

![](https://ghproxy.net/https://raw.githubusercontent.com/ryusoh/host/refs/heads/master/images/DSCF0283.jpg)
<div align="right"><em>Nashville, TN 2025 © <a href="https://instagram.com/lyeutsaon" target="_blank" rel="noopener noreferrer">@lyeutsaon</a></em></div>

## Overview

This project is a web-based application to track and visualize a fund's portfolio allocations and performance. It fetches holding details and market data, displaying it in a table and through interactive charts.

The project includes Python scripts for data management and a GitHub Actions workflow for automated data updates.

## Features

*   Dynamic display of portfolio holdings.
*   Donut chart visualization of fund allocation.
*   Automated updates of fund market data via GitHub Actions.
*   Responsive design for desktop and mobile viewing.

## Project Structure

```
fund/
├── .github/workflows/  # GitHub Actions workflows
├── data/               # JSON data files (holdings, fund data)
├── css/                # CSS stylesheets
├── js/                 # JavaScript files (data services, chart configurations)
├── scripts/            # Python scripts for data updates and management
├── index.html          # Main HTML page
└── README.md
```

## Setup and Usage

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/ryusoh/fund.git
    cd fund
    ```
2.  **Python Scripts Setup:**
    If you need to run the Python scripts locally (e.g., `update_fund_data.py`, `manage_holdings.py`):
    *   Ensure Python 3.x is installed.
    *   Create a virtual environment (recommended):
        ```bash
        python -m venv venv
        source venv/bin/activate  # On Windows: venv\Scripts\activate
        ```
    *   Install dependencies:
        ```bash
        pip install -r requirements.txt 
        ```
    *   Run scripts as needed, e.g.:
        ```bash
        python scripts/update_fund_data.py
        python scripts/manage_holdings.py --file data/holdings_details.json list
        ```
3.  **Viewing the Page:**
    Open `index.html` in your web browser.

## Automated Data Updates

The fund data is automatically updated by a GitHub Actions workflow defined in `.github/workflows/update_data.yml`. This workflow runs on a schedule, executes the Python scripts to fetch the latest market data, and commits the updated data files to the repository.

## Portfolio Management Script (`scripts/manage_holdings.py`)

This Python script helps you manage your stock portfolio by tracking buy and sell transactions and automatically updating your holdings. It stores data in a JSON file, by default named `holdings_details.json` located in the `data/` directory relative to the project root.

### Features

*   **Track Holdings**: Maintains a record of your shares and average purchase price for each ticker in `data/holdings_details.json`.
*   **Buy Transactions**: Add new purchases, updating share count and recalculating the average price. Handles new tickers.
*   **Sell Transactions**: Record sales, updating share count. Calculates realized profit/loss for the transaction. If all shares of a ticker are sold, it's removed from holdings.
*   **List Holdings**: Display a summary of your current portfolio, including cost basis per holding and total portfolio cost basis.
*   **Data Persistence**: Holdings are saved in a JSON file (default: `data/holdings_details.json`).
*   **Precision**: Uses `Decimal` for financial calculations to ensure accuracy.

### Prerequisites

*   Python 3.6+

### Setup

1.  Ensure the script `manage_holdings.py` is located in the `scripts/` directory of your project.
    ```
    project_root/
    ├── scripts/
    │   ├── manage_holdings.py
    │   └── update_fund_data.py
    ├── data/
    │   └── holdings_details.json  (will be created/updated here by default)
    └── README.md
    ```
2.  You can run the script using `python scripts/manage_holdings.py ...` from your project root.

### Usage

The script is run from the command line.

**General Syntax (run from project root):**

 ```bash
 python scripts/manage_holdings.py [options] <command> [command_args...]
 ```

**Options:**

*   `--file FILEPATH`: Specifies the path to the holdings JSON file.
    *   Defaults to `holdings_details.json` located in the same directory as the script (e.g., `data/holdings_details.json`).

**Commands:**

#### 1. `buy` - Record a Purchase

Adds shares of a stock to your portfolio. If the ticker is new, it will be added. If it exists, shares are added, and the average cost is recalculated.

**Syntax:**

```bash
python scripts/manage_holdings.py buy <TICKER> <SHARES> <PRICE>
```

**Arguments:**

*   `<TICKER>`: The stock ticker symbol (e.g., `AAPL`, `GOOGL`). Case-insensitive (will be stored as uppercase).
*   `<SHARES>`: The number of shares purchased (e.g., `10`, `25.5`). Must be positive.
*   `<PRICE>`: The price per share at which they were purchased (e.g., `150.75`). Must be non-negative.

**Example:**

```bash
# Assumes holdings_details.json will be in data/
python scripts/manage_holdings.py buy AAPL 10 170.50
python scripts/manage_holdings.py buy msft 5.5 300.25

# To use a custom file path:
python scripts/manage_holdings.py --file custom_portfolio/my_stocks.json buy GOOG 100 135.00
```

#### 2. `sell` - Record a Sale

Removes shares of a stock from your portfolio. It calculates the realized profit or loss for this specific transaction based on the average cost of your holding. If all shares of a ticker are sold, the ticker is removed.

**Syntax:**

```bash
python scripts/manage_holdings.py sell <TICKER> <SHARES> <PRICE>
```

**Arguments:**

*   `<TICKER>`: The stock ticker symbol (e.g., `AAPL`).
*   `<SHARES>`: The number of shares sold (e.g., `5`, `10.5`). Must be positive and not exceed current holdings.
*   `<PRICE>`: The price per share at which they were sold (e.g., `180.20`). Must be non-negative.

**Example:**

```bash
python scripts/manage_holdings.py sell AAPL 5 180.00
```

#### 3. `list` - Display Current Holdings

Shows a summary of all tickers in your portfolio, including the number of shares, the average purchase price, cost basis per holding, and total portfolio value at cost.

**Syntax:**

```bash
python scripts/manage_holdings.py list
```

**Example:**

```bash
python scripts/manage_holdings.py list
python scripts/manage_holdings.py --file custom_portfolio/my_stocks.json list
```

### Data File (e.g., `data/holdings_details.json`)

The script reads from and writes to a JSON file. By default, this is holdings_details.json in the data/ directory.

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
Note: Shares and average prices are stored as strings in the JSON file to maintain precision using the Decimal type in Python. The script handles conversions internally.
