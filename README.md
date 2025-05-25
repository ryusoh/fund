<p align="center">HIGH CONVICTION VALUE INVESTING</p>

## Portfolio Management Script (`data/manage_holdings.py`)

This Python script helps you manage your stock portfolio by tracking buy and sell transactions and automatically updating your holdings. It stores data in a JSON file, by default named `holdings_details.json` located in the same directory as the script (`data/`).

### Features

*   **Track Holdings**: Maintains a record of your shares and average purchase price for each ticker.
*   **Buy Transactions**: Add new purchases, updating share count and recalculating the average price. Handles new tickers.
*   **Sell Transactions**: Record sales, updating share count. Calculates realized profit/loss for the transaction. If all shares of a ticker are sold, it's removed from holdings.
*   **List Holdings**: Display a summary of your current portfolio, including cost basis per holding and total portfolio cost basis.
*   **Data Persistence**: Holdings are saved in a JSON file (default: `data/holdings_details.json`).
*   **Precision**: Uses `Decimal` for financial calculations to ensure accuracy.

### Prerequisites

*   Python 3.6+

### Setup

1.  Ensure the script `manage_holdings.py` is located in the `data/` directory of your project.
    ```
    project_root/
    ├── data/
    │   ├── manage_holdings.py
    │   └── holdings_details.json  (will be created/updated here)
    │   └── update_fund_data.py
    └── README.md
    ```
2.  You can run the script using `python data/manage_holdings.py ...` from your project root.

### Usage

The script is run from the command line.

**General Syntax (run from project root):**

 ```bash
 python data/manage_holdings.py [options] <command> [command_args...]
 ```

**Options:**

*   `--file FILEPATH`: Specifies the path to the holdings JSON file.
    *   Defaults to `holdings_details.json` located in the same directory as the script (e.g., `data/holdings_details.json`).

**Commands:**

#### 1. `buy` - Record a Purchase

Adds shares of a stock to your portfolio. If the ticker is new, it will be added. If it exists, shares are added, and the average cost is recalculated.

**Syntax:**

```bash
python data/manage_holdings.py buy <TICKER> <SHARES> <PRICE>
```

**Arguments:**

*   `<TICKER>`: The stock ticker symbol (e.g., `AAPL`, `GOOGL`). Case-insensitive (will be stored as uppercase).
*   `<SHARES>`: The number of shares purchased (e.g., `10`, `25.5`). Must be positive.
*   `<PRICE>`: The price per share at which they were purchased (e.g., `150.75`). Must be non-negative.

**Example:**

```bash
# Assumes holdings_details.json will be in data/
python data/manage_holdings.py buy AAPL 10 170.50
python data/manage_holdings.py buy msft 5.5 300.25

# To use a custom file path:
python data/manage_holdings.py --file custom_portfolio/my_stocks.json buy GOOG 100 135.00
```

#### 2. `sell` - Record a Sale

Removes shares of a stock from your portfolio. It calculates the realized profit or loss for this specific transaction based on the average cost of your holding. If all shares of a ticker are sold, the ticker is removed.

**Syntax:**

```bash
python data/manage_holdings.py sell <TICKER> <SHARES> <PRICE>
```

**Arguments:**

*   `<TICKER>`: The stock ticker symbol (e.g., `AAPL`).
*   `<SHARES>`: The number of shares sold (e.g., `5`, `10.5`). Must be positive and not exceed current holdings.
*   `<PRICE>`: The price per share at which they were sold (e.g., `180.20`). Must be non-negative.

**Example:**

```bash
python data/manage_holdings.py sell AAPL 5 180.00
```

#### 3. `list` - Display Current Holdings

Shows a summary of all tickers in your portfolio, including the number of shares, the average purchase price, cost basis per holding, and total portfolio value at cost.

**Syntax:**

```bash
python data/manage_holdings.py list
```

**Example:**

```bash
python data/manage_holdings.py list
python data/manage_holdings.py --file custom_portfolio/my_stocks.json list
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