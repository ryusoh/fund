#!/usr/bin/env python3
"""
Transform history.csv to transactions.csv format.

This script converts the HSA history format to match the transactions.csv format
used by the sort_transactions.py script.
"""

import csv
import argparse
from pathlib import Path
from datetime import datetime


def transform_history_to_transactions(input_file: Path, output_file: Path):
    """Transform history.csv to transactions.csv format."""

    # Only include actual Buy and Sell transactions
    valid_transaction_types = {'Buy', 'Sell'}

    # Mapping of investment names to security symbols
    investment_mapping = {
        'FSKAX': 'FSKAX',  # Fidelity Total Market Index Fund
        'FSGGX': 'FSGGX',  # Fidelity Global ex U.S. Index Fund
        'FBCGX': 'FBCGX',  # Fidelity Blue Chip Growth Fund
        'FNSFX': 'FNSFX',  # Fidelity Freedom 2030 Fund
        'SP TTL MRKT IDX CL C': 'SPTMC',  # State Street Total Market Index Class C
        'SP GLB EXUS IDX CL C': 'SPGEC'   # State Street Global ex-US Index Class C
    }

    transformed_rows = []

    try:
        with input_file.open('r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)

            for row in reader:
                # Skip rows with zero or empty amounts
                try:
                    amount = float(row['Amount'].replace(',', ''))
                    if amount == 0:
                        continue
                except (ValueError, KeyError):
                    continue

                # Skip rows with zero or empty shares
                try:
                    shares = float(row['Shares/Unit'].replace(',', ''))
                    if shares == 0:
                        continue
                except (ValueError, KeyError):
                    continue

                # Only process Buy and Sell transactions
                transaction_type = row['Transaction Type']
                if transaction_type not in valid_transaction_types:
                    continue
                
                order_type = transaction_type

                # Map investment to security symbol
                investment = row['Investment']
                security = investment_mapping.get(investment, investment)

                # Calculate executed price
                try:
                    executed_price = abs(amount / shares) if shares != 0 else 0
                except ZeroDivisionError:
                    continue

                # Skip if executed price is 0 or invalid
                if executed_price <= 0:
                    continue

                # Format date (already in MM/DD/YYYY format)
                trade_date = row['Date']

                # Create transformed row
                transformed_row = {
                    'Trade Date': trade_date,
                    'Order Type': order_type,
                    'Security': security,
                    'Quantity': abs(shares),  # Always positive quantity
                    'Executed Price': round(executed_price, 2)
                }

                transformed_rows.append(transformed_row)

    except FileNotFoundError:
        print(f"Error: File not found at {input_file}")
        return
    except Exception as e:
        print(f"Error reading file: {e}")
        return

    # Sort by date (oldest first)
    try:
        transformed_rows.sort(key=lambda row: datetime.strptime(str(row['Trade Date']), '%m/%d/%Y'))
    except ValueError as e:
        print(f"Error sorting by date: {e}")
        return

    # Write transformed data to output file
    try:
        with output_file.open('w', newline='', encoding='utf-8') as f:
            fieldnames = ['Trade Date', 'Order Type', 'Security', 'Quantity', 'Executed Price']
            writer = csv.DictWriter(f, fieldnames=fieldnames)

            writer.writeheader()
            writer.writerows(transformed_rows)

        print(f"Successfully transformed {len(transformed_rows)} transactions from {input_file} to {output_file}")

    except Exception as e:
        print(f"Error writing to file: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Transform history.csv to transactions.csv format.')

    # Default paths
    default_input = Path(__file__).resolve().parent.parent / 'data' / 'history.csv'
    default_output = Path(__file__).resolve().parent.parent / 'data' / 'history_transactions.csv'

    parser.add_argument(
        'input_file',
        type=Path,
        nargs='?',
        default=default_input,
        help=f'Path to the history CSV file. Defaults to {default_input}'
    )

    parser.add_argument(
        'output_file',
        type=Path,
        nargs='?',
        default=default_output,
        help=f'Path to the output transactions CSV file. Defaults to {default_output}'
    )

    args = parser.parse_args()

    transform_history_to_transactions(args.input_file, args.output_file)
