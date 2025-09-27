import csv
from datetime import datetime
import argparse
from pathlib import Path

def sort_transactions_file(file_path: Path):
    """Sorts the transactions CSV file by '''Trade Date'''."""
    try:
        with file_path.open('r', newline='', encoding='utf-8') as f:
            reader = csv.reader(f)
            header = next(reader)
            try:
                date_column_index = header.index('Trade Date')
            except ValueError:
                print(f"Error: '''Trade Date''' column not found in {file_path}")
                return

            data = list(reader)
            if not data:
                print("No transactions to sort.")
                return

    except FileNotFoundError:
        print(f"Error: File not found at {file_path}")
        return
    except Exception as e:
        print(f"Error reading file: {e}")
        return

    # Sort data by date, oldest first
    try:
        sorted_data = sorted(data, key=lambda row: datetime.strptime(row[date_column_index], '%m/%d/%Y'))
    except (ValueError, IndexError) as e:
        print(f"Error parsing date in file. Please check the format. Details: {e}")
        return

    # Write sorted data back to the file
    try:
        with file_path.open('w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(header)
            writer.writerows(sorted_data)
        print(f"Successfully sorted {file_path}")
    except Exception as e:
        print(f"Error writing to file: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Sort a transactions CSV file by date, oldest first.')
    default_path = Path(__file__).resolve().parent.parent / 'data' / 'transactions.csv'
    parser.add_argument(
        'file_path', 
        type=Path, 
        nargs='?', 
        default=default_path, 
        help=f'Path to the transactions CSV file. Defaults to {default_path}'
    )
    args = parser.parse_args()
    
    sort_transactions_file(args.file_path)
