import argparse
import json
import logging
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Dict

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_HOLDINGS_FILE_NAME = "holdings_details.json"
DEFAULT_HOLDINGS_FILE_PATH = BASE_DIR / "data" / DEFAULT_HOLDINGS_FILE_NAME

HoldingsType = Dict[str, Dict[str, Decimal]]


def load_holdings(filepath: Path) -> HoldingsType:
    if not filepath.exists():
        logging.info(f"Holdings file {filepath} not found. Starting with empty holdings.")
        return {}
    try:
        with filepath.open("r", encoding="utf-8") as f:
            loaded_data = json.load(f)

        holdings_dict: HoldingsType = {}

        if isinstance(loaded_data, list):
            print(
                f"Note: Converting holdings data from list format in {filepath} to dictionary format."
            )
            for item in loaded_data:
                ticker = item.get("ticker")
                shares = item.get("shares")
                cost = item.get("cost")
                if ticker and shares is not None and cost is not None:
                    holdings_dict[ticker.upper()] = {
                        "shares": Decimal(str(shares)),
                        "average_price": Decimal(str(cost)),
                    }
            save_holdings(filepath, holdings_dict)
            return holdings_dict
        elif isinstance(loaded_data, dict):
            for _ticker, details in loaded_data.items():
                if "shares" in details:
                    details["shares"] = Decimal(str(details["shares"]))
                if "average_price" in details:
                    details["average_price"] = Decimal(str(details["average_price"]))
            return loaded_data
        else:
            logging.warning(
                f"Holdings file {filepath} contains data in an unexpected format. Starting with empty holdings."
            )
            return {}
    except (json.JSONDecodeError, IOError) as e:
        logging.error(f"Error loading holdings file {filepath}: {e}. Starting with empty holdings.")
        return {}
    except InvalidOperation as e:
        logging.error(
            f"Error converting value to Decimal in {filepath}: {e}. Please check file content. Starting with empty holdings."
        )
        return {}


def save_holdings(filepath: Path, data: HoldingsType) -> None:
    try:
        serializable_data: Dict[str, Dict[str, str]] = {}
        for ticker, details in data.items():
            serializable_data[ticker] = {
                "shares": str(details["shares"]),
                "average_price": str(details["average_price"].quantize(Decimal("0.000001"))),
            }
        filepath.parent.mkdir(parents=True, exist_ok=True)
        with filepath.open("w", encoding="utf-8") as f:
            json.dump(serializable_data, f, indent=2)
            f.write("\n")
        logging.info(f"Holdings updated successfully in {filepath}")
    except IOError as e:
        logging.error(f"Error saving holdings file {filepath}: {e}")


def buy_shares(
    holdings: HoldingsType, ticker: str, shares_bought_str: str, purchase_price_str: str
) -> None:
    ticker = ticker.upper()
    try:
        shares_bought = Decimal(shares_bought_str)
        purchase_price = Decimal(purchase_price_str)
    except InvalidOperation:
        logging.error("Shares and price must be valid numbers.")
        return

    if shares_bought <= 0 or purchase_price < 0:
        logging.error("Number of shares must be positive, and price must be non-negative.")
        return

    if ticker in holdings:
        current_shares = holdings[ticker]["shares"]
        current_avg_price = holdings[ticker]["average_price"]
        total_cost_old = current_shares * current_avg_price
        cost_new_shares = shares_bought * purchase_price
        new_total_shares = current_shares + shares_bought
        new_average_price = (
            (total_cost_old + cost_new_shares) / new_total_shares
            if new_total_shares != 0
            else Decimal("0")
        )
        holdings[ticker]["shares"] = new_total_shares
        holdings[ticker]["average_price"] = new_average_price
        logging.info(f"Bought {shares_bought} shares of {ticker} at ${purchase_price:.2f}.")
        logging.info(
            f"New holding for {ticker}: {new_total_shares} shares at average price ${new_average_price:.2f}."
        )
    else:
        holdings[ticker] = {"shares": shares_bought, "average_price": purchase_price}
        logging.info(
            f"Added new ticker {ticker}: Bought {shares_bought} shares at ${purchase_price:.2f}."
        )


def sell_shares(
    holdings: HoldingsType, ticker: str, shares_sold_str: str, sell_price_str: str
) -> None:
    ticker = ticker.upper()
    try:
        shares_sold = Decimal(shares_sold_str)
        sell_price = Decimal(sell_price_str)
    except InvalidOperation:
        logging.error("Shares and price must be valid numbers.")
        return

    if shares_sold <= 0 or sell_price < 0:
        logging.error(
            "Number of shares to sell must be positive, and sell price must be non-negative."
        )
        return

    if ticker not in holdings:
        logging.error(f"Ticker {ticker} not found in holdings.")
        return

    current_shares = holdings[ticker]["shares"]
    current_avg_price = holdings[ticker]["average_price"]

    if shares_sold > current_shares:
        logging.error(
            f"Cannot sell {shares_sold} shares of {ticker}. You only own {current_shares} shares."
        )
        return

    profit_loss_per_share = sell_price - current_avg_price
    total_profit_loss = profit_loss_per_share * shares_sold
    remaining_shares = current_shares - shares_sold

    logging.info(f"Sold {shares_sold} shares of {ticker} at ${sell_price:.2f}.")
    logging.info(f"Realized P/L for this transaction: ${total_profit_loss:.2f}.")

    if remaining_shares == Decimal("0"):
        del holdings[ticker]
        logging.info(f"All shares of {ticker} sold. Ticker removed from holdings.")
    else:
        holdings[ticker]["shares"] = remaining_shares
        logging.info(
            f"Remaining holding for {ticker}: {remaining_shares} shares at average price ${current_avg_price:.2f}."
        )


def list_holdings(holdings: HoldingsType) -> None:
    if not holdings:
        logging.info("No holdings to display.")
        return

    logging.info("\nCurrent Holdings:")
    header = f"{'Ticker':<10} {'Shares':>15} {'Avg. Price':>15} {'Cost Basis':>15}"
    separator = "-" * len(header)
    logging.info(separator)
    logging.info(header)
    logging.info(separator)
    total_portfolio_value_at_cost = Decimal("0")
    for ticker, data in sorted(holdings.items()):
        shares = data["shares"]
        avg_price = data["average_price"]
        cost_basis = shares * avg_price
        total_portfolio_value_at_cost += cost_basis
        logging.info(
            f"{ticker:<10} {str(shares):>15} {f'${avg_price:.2f}':>15} {f'${cost_basis:.2f}':>15}"
        )
    logging.info(separator)
    logging.info(f"Total Portfolio Value (at cost): ${total_portfolio_value_at_cost:.2f}")
    logging.info(separator)


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage your stock holdings.")
    parser.add_argument(
        "--file",
        type=Path,
        default=DEFAULT_HOLDINGS_FILE_PATH,
        help=f"Path to the holdings JSON file (default: {DEFAULT_HOLDINGS_FILE_PATH})",
    )

    subparsers = parser.add_subparsers(dest="command", required=True, help="buy|sell|list")

    buy_parser = subparsers.add_parser("buy", help="Record a buy transaction")
    buy_parser.add_argument("ticker", type=str, help="Ticker (e.g., AAPL)")
    buy_parser.add_argument("shares", type=str, help="Shares (can be fractional)")
    buy_parser.add_argument("price", type=str, help="Price per share")

    sell_parser = subparsers.add_parser("sell", help="Record a sell transaction")
    sell_parser.add_argument("ticker", type=str, help="Ticker (e.g., AAPL)")
    sell_parser.add_argument("shares", type=str, help="Shares (can be fractional)")
    sell_parser.add_argument("price", type=str, help="Price per share")

    subparsers.add_parser("list", help="List current holdings")

    args = parser.parse_args()
    holdings = load_holdings(args.file)

    if args.command == "buy":
        buy_shares(holdings, args.ticker, args.shares, args.price)
        save_holdings(args.file, holdings)
    elif args.command == "sell":
        sell_shares(holdings, args.ticker, args.shares, args.price)
        save_holdings(args.file, holdings)
    elif args.command == "list":
        list_holdings(holdings)


if __name__ == "__main__":
    main()
