#!/usr/bin/env python3
"""Pre-calculate statistics and ratios for the frontend terminal."""

import json
import pandas as pd
from pathlib import Path
import numpy as np
from datetime import datetime, timedelta, timezone

PORTFOLIO_SERIES_KEY = '^LZ'

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / 'data'
OUTPUT_DIR = DATA_DIR / 'output'


def order_series_names(names):
    ordered = []
    if PORTFOLIO_SERIES_KEY in names:
        ordered.append(PORTFOLIO_SERIES_KEY)
    ordered.extend(sorted(name for name in names if name != PORTFOLIO_SERIES_KEY))
    return ordered


def normalize_symbol_index(df):
    normalized = df.copy()
    if not normalized.empty:
        normalized['display_symbol'] = normalized.index
        normalized.index = normalized.index.str.replace('-', '', regex=False)
        if 'shares' in normalized.columns:
            normalized = normalized.rename(columns={'shares': 'broker_shares'})
    return normalized


def format_currency(value):
    if not np.isfinite(value):
        return 'N/A'
    return f"${value:,.2f}"


def format_percent(value):
    if not np.isfinite(value):
        return 'N/A'
    percentage = value * 100
    sign = '' if percentage >= 0 else '-'
    return f"{sign}{abs(percentage):.2f}%"


def render_box_table(
    *,
    title=None,
    headers=None,
    rows=None,
    alignments=None,
    show_header=True,
    header_separator=True,
    width_hint=None,
    include_top_border=True,
    include_bottom_border=True,
):
    rows = rows or []
    if headers:
        column_count = len(headers)
    elif rows:
        column_count = len(rows[0])
    else:
        column_count = 0

    if column_count == 0:
        total_width = len(title or '')
        return '', total_width

    alignments = alignments or ['left'] * column_count

    widths = [0] * column_count
    if headers:
        for index, header in enumerate(headers):
            widths[index] = max(widths[index], len(str(header)))

    for row in rows:
        if len(row) != column_count:
            raise ValueError('Row has incorrect number of columns')
        for index, cell in enumerate(row):
            widths[index] = max(widths[index], len(str(cell)))

    total_width = sum(width + 2 for width in widths) + column_count + 1
    if width_hint and width_hint > total_width:
        widths[-1] += width_hint - total_width
        total_width = width_hint

    def make_border(char='-'):
        return '+' + '+'.join(char * (width + 2) for width in widths) + '+'

    def format_row(values):
        cells = []
        for idx, value in enumerate(values):
            text = str(value)
            width = widths[idx]
            alignment = alignments[idx] if idx < len(alignments) else 'left'
            if alignment == 'right':
                text = text.rjust(width)
            elif alignment == 'center':
                text = text.center(width)
            else:
                text = text.ljust(width)
            cells.append(f' {text} ')
        return '|' + '|'.join(cells) + '|'

    lines = []
    if include_top_border:
        lines.append(make_border('-'))

    if title:
        title_line = '|' + title.center(total_width - 2) + '|'
        lines.append(title_line)
        lines.append(make_border('-'))

    if headers and show_header:
        lines.append(format_row(headers))
        if header_separator:
            lines.append(make_border('='))

    for row in rows:
        lines.append(format_row(row))

    if include_bottom_border:
        lines.append(make_border('-'))

    return '\n'.join(lines), total_width


def calculate_stats():
    """Calculate transaction statistics using split-adjusted data."""
    transactions_df = pd.read_parquet(DATA_DIR / 'checkpoints' / 'transactions_with_splits.parquet')
    transactions_df = transactions_df.sort_values(
        by=['trade_date', 'security', 'order_type']
    ).reset_index(drop=True)

    total_transactions = len(transactions_df)
    buy_mask = transactions_df['order_type'].str.lower() == 'buy'
    sell_mask = transactions_df['order_type'].str.lower() == 'sell'

    total_buy_amount = transactions_df.loc[buy_mask, 'trade_value'].sum()
    total_sell_amount = transactions_df.loc[sell_mask, 'trade_value'].sum()

    # FIFO realized gain calculation
    realized_gain_total = 0.0
    lots_by_security: dict[str, list[dict[str, float]]] = {}

    for _, row in transactions_df.iterrows():
        security = row['security']
        qty = float(row['adjusted_quantity'])
        trade_value = float(row['trade_value'])
        price = trade_value / qty if qty else 0.0
        order_type = str(row['order_type']).strip().lower()

        if qty <= 0 or price <= 0:
            continue

        lots = lots_by_security.setdefault(security, [])

        if order_type == 'buy':
            lots.append({'qty': qty, 'price': price})
        elif order_type == 'sell':
            remaining = qty
            while remaining > 1e-9 and lots:
                lot = lots[0]
                available = lot['qty']
                used = min(remaining, available)
                realized_gain_total += (price - lot['price']) * used
                lot['qty'] -= used
                remaining -= used
                if lot['qty'] <= 1e-9:
                    lots.pop(0)
            # If sells exceed recorded lots, treat excess as zero cost basis
            if remaining > 1e-9:
                realized_gain_total += price * remaining
        else:
            continue

    net_contributions = total_buy_amount - total_sell_amount

    rows = [
        ['Total Transactions', f"{total_transactions:,}"],
        ['Buy Orders', f"{buy_mask.sum():,}"],
        ['Sell Orders', f"{sell_mask.sum():,}"],
        ['Total Buy Amount', format_currency(total_buy_amount)],
        ['Total Sell Amount', format_currency(total_sell_amount)],
        ['Net Contributions', format_currency(net_contributions)],
        ['Realized Gain', format_currency(realized_gain_total)],
    ]

    table, _ = render_box_table(
        title='TRANSACTION STATS',
        headers=['Metric', 'Value'],
        rows=rows,
        alignments=['left', 'right'],
    )

    return '\n' + table + '\n'


def calculate_holdings():
    """Calculate current holdings."""
    holdings_df = pd.read_parquet(DATA_DIR / 'checkpoints' / 'holdings_daily.parquet')

    try:
        holdings_details = pd.read_json(DATA_DIR / 'holdings_details.json', orient='index')
    except (FileNotFoundError, ValueError):
        holdings_details = pd.DataFrame(columns=['average_price', 'shares'])

    latest_holdings = holdings_df.iloc[-1]
    active_holdings = latest_holdings[latest_holdings > 0.01]

    if active_holdings.empty:
        return "No current holdings."

    holdings_frame = pd.DataFrame(active_holdings).rename(columns={active_holdings.name: 'shares'})
    holdings_frame.index.name = 'symbol'

    normalized_details = normalize_symbol_index(holdings_details)
    holdings_frame = holdings_frame.join(normalized_details, how='left')

    holdings_frame['display_symbol'] = holdings_frame['display_symbol'].fillna(
        holdings_frame.index.to_series()
    )
    holdings_frame['average_price'] = pd.to_numeric(
        holdings_frame['average_price'], errors='coerce'
    ).fillna(0.0)
    holdings_frame['total_cost'] = holdings_frame['shares'] * holdings_frame['average_price']
    holdings_frame = holdings_frame[holdings_frame['average_price'] > 0]
    holdings_frame = holdings_frame.sort_values(by='total_cost', ascending=False)

    data_rows = []
    for symbol, data in holdings_frame.iterrows():
        data_rows.append(
            [
                data.get('display_symbol', symbol),
                f"{data['shares']:,.2f}",
                f"${data['average_price']:.2f}",
                format_currency(data['total_cost']),
            ]
        )

    table, _ = render_box_table(
        title='HOLDINGS',
        headers=['Security', 'Shares', 'Avg Price', 'Total Cost'],
        rows=data_rows,
        alignments=['left', 'right', 'right', 'right'],
    )
    return '\n' + table + '\n'


def get_performance_series():
    prices_df = pd.read_parquet(DATA_DIR / 'historical_prices.parquet')
    twrr_df = pd.read_parquet(DATA_DIR / 'twrr_series.parquet')

    twrr_df_reset = twrr_df.reset_index()
    twrr_df_reset.columns = ['date', 'value']
    twrr_df_reset['date'] = twrr_df_reset['date'].dt.strftime('%Y-%m-%d')

    series = {PORTFOLIO_SERIES_KEY: twrr_df_reset.to_dict('records')}
    for col in prices_df.columns:
        if col.startswith('^'):
            df = prices_df[[col]].dropna().reset_index()
            df.columns = ['date', 'value']
            df['date'] = df['date'].dt.strftime('%Y-%m-%d')
            first_value = df['value'].iloc[0]
            if first_value and np.isfinite(first_value) and first_value != 0:
                df['value'] = df['value'] / first_value
            series[col] = df.to_dict('records')
    return series


def compute_cagr(series, years):
    if not series or len(series) < 2 or years <= 0:
        return None
    start_val = series[0]['value']
    end_val = series[-1]['value']
    if start_val <= 0 or end_val <= 0:
        return None
    return (end_val / start_val) ** (1 / years) - 1


def calculate_cagr(series_map):
    base_series = series_map.get('^LZ')
    if not base_series or len(base_series) < 2:
        return "CAGR unavailable: insufficient portfolio observations."

    start_date = pd.to_datetime(base_series[0]['date'])
    end_date = pd.to_datetime(base_series[-1]['date'])
    years = (end_date - start_date).days / 365.25

    if years <= 0:
        return "CAGR unavailable: invalid measurement period."

    data_rows = []
    for name in order_series_names(series_map.keys()):
        series = series_map[name]
        total_return = (
            (series[-1]['value'] / series[0]['value']) - 1
            if len(series) > 1 and series[0]['value'] > 0
            else None
        )
        cagr = compute_cagr(series, years)

        data_rows.append([name, format_percent(total_return), format_percent(cagr)])

    data_table, data_width = render_box_table(
        headers=['Series', 'Total Return (%)', 'CAGR (%)'],
        rows=data_rows,
        alignments=['left', 'right', 'right'],
        include_top_border=False,
    )

    info_rows = [
        ['Period', f"{start_date.strftime('%Y-%m-%d')} → {end_date.strftime('%Y-%m-%d')}"],
        ['Years', f"{years:.2f}"],
    ]

    info_table, _ = render_box_table(
        title='PERFORMANCE CAGR',
        rows=info_rows,
        alignments=['left', 'right'],
        show_header=False,
        width_hint=data_width,
    )

    data_table, _ = render_box_table(
        headers=['Series', 'Total Return (%)', 'CAGR (%)'],
        rows=data_rows,
        alignments=['left', 'right', 'right'],
        include_top_border=False,
        width_hint=data_width,
    )

    return '\n' + info_table + '\n' + data_table + '\n'


def compute_returns(points, period='daily'):
    if not points or len(points) < 2:
        return pd.Series(dtype=float) if period != 'annual' else {}

    df = pd.DataFrame(points)
    df['date'] = pd.to_datetime(df['date'])
    df = df.set_index('date').sort_index()

    if period == 'annual':
        resampled = df.resample('YE').last()
        returns = resampled.pct_change()['value'].dropna()
        return {str(idx.year): val for idx, val in returns.items()}

    if period == 'monthly':
        # Use month-end observations so beta aligns with Yahoo Finance (yfinance) methodology.
        resampled = df.resample('M').last()
        returns = resampled.pct_change()['value'].dropna()
        return {pd.to_datetime(idx).strftime('%Y-%m'): val for idx, val in returns.items()}

    return df['value'].pct_change().dropna()


def calculate_annual_returns(series_map):
    def annual_returns_for_series(points):
        if not points or len(points) < 2:
            return {}

        df = pd.DataFrame(points)
        df['date'] = pd.to_datetime(df['date'])
        df = df.sort_values('date')
        df = df[pd.to_numeric(df['value'], errors='coerce') > 0]
        if df.empty:
            return {}

        year_end = df.set_index('date').resample('YE').last()
        result = {}
        prev_value = None
        first_value = df.iloc[0]['value']

        for idx, row in year_end.iterrows():
            value = row['value']
            if not np.isfinite(value) or value <= 0:
                continue

            year_str = str(idx.year)
            if prev_value is None:
                # Use the first observation within the same calendar year if available
                same_year = df[df['date'].dt.year == idx.year]
                base = same_year.iloc[0]['value'] if not same_year.empty else first_value
                if not np.isfinite(base) or base <= 0:
                    prev_value = value
                    continue
                result[year_str] = (value / base) - 1
            else:
                result[year_str] = (value / prev_value) - 1

            prev_value = value

        return result

    annual_data = {name: annual_returns_for_series(points) for name, points in series_map.items()}

    all_years = sorted(
        list(set(year for returns in annual_data.values() for year in returns.keys()))
    )
    if not all_years:
        return "Return breakdown unavailable: no annual data."

    sorted_series_names = order_series_names(annual_data.keys())
    rows = []
    for year in all_years:
        row = [str(year)]
        for name in sorted_series_names:
            ret = annual_data[name].get(year)
            row.append(format_percent(ret if ret is not None else np.nan))
        rows.append(row)

    headers = ['Year'] + sorted_series_names
    alignments = ['left'] + ['right'] * len(sorted_series_names)
    table, _ = render_box_table(
        title='ANNUAL RETURNS',
        headers=headers,
        rows=rows,
        alignments=alignments,
    )
    return '\n' + table + '\n'


def calculate_ratios(series_map, risk_free_rate=0.053):
    daily_returns = {name: compute_returns(points, 'daily') for name, points in series_map.items()}

    ratio_data = []
    for name, returns in daily_returns.items():
        if len(returns) < 2:
            continue

        mean_return = returns.mean()
        std_dev = returns.std()
        sharpe = (
            (mean_return * 252 - risk_free_rate) / (std_dev * np.sqrt(252)) if std_dev > 0 else None
        )

        downside_returns = returns[returns < 0]
        downside_deviation = (
            np.sqrt((downside_returns**2).mean()) if len(downside_returns) > 0 else 0
        )
        sortino = (
            (mean_return * 252 - risk_free_rate) / (downside_deviation * np.sqrt(252))
            if downside_deviation > 0
            else None
        )

        ratio_data.append({'name': name, 'sharpe': sharpe, 'sortino': sortino})

    sorted_items = sorted(ratio_data, key=lambda x: (x['name'] != PORTFOLIO_SERIES_KEY, x['name']))
    rows = []
    for item in sorted_items:
        sharpe_str = (
            f"{item['sharpe']:.3f}" if item['sharpe'] is not None else 'N/A'
        )
        sortino_str = (
            f"{item['sortino']:.3f}" if item['sortino'] is not None else 'N/A'
        )
        rows.append([item['name'], sharpe_str, sortino_str])

    table, _ = render_box_table(
        title='RISK RATIOS',
        headers=['Series', 'Sharpe Ratio', 'Sortino Ratio'],
        rows=rows,
        alignments=['left', 'right', 'right'],
    )

    indent = '  '
    notes = [
        f"{indent}Note: Ratios are annualized using 5.3% risk-free rate (3-month T-bill).",
        f"{indent}Higher values indicate better risk-adjusted returns.",
        '',
        f"{indent}- Sharpe Ratio: (Return - Risk-Free) / Volatility (Std. Dev. of returns)",
        f"{indent}- Sortino Ratio: (Return - Risk-Free) / Downside Volatility",
    ]
    return '\n'.join(['', table, ''] + notes) + '\n'


def main():
    """Generate all stats files."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # --- Generate data for frontend charts ---
    balance_df = pd.read_parquet(DATA_DIR / 'daily_market_value.parquet')
    balance_df = balance_df.reset_index().rename(columns={'index': 'date', 'market_value': 'value'})
    balance_df['date'] = pd.to_datetime(balance_df['date']).dt.strftime('%Y-%m-%d')
    with open(OUTPUT_DIR / 'balance_series.json', 'w') as f:
        balance_df.to_json(f, orient='records', date_format='iso')
    print("Successfully created balance_series.json")

    transactions_df = pd.read_parquet(DATA_DIR / 'checkpoints' / 'transactions_with_splits.parquet')
    transactions_df = transactions_df.sort_values(
        by=['trade_date', 'order_type', 'security']
    ).reset_index(drop=True)

    running_rows = []
    running_total = 0.0
    last_trade_date = None

    if not transactions_df.empty:
        first_trade_date = pd.to_datetime(transactions_df.iloc[0]['trade_date']).date()
        baseline_date = first_trade_date - timedelta(days=1)
        running_rows.append(
            {
                'tradeDate': baseline_date.strftime('%Y-%m-%d'),
                'amount': 0.0,
                'orderType': 'padding',
                'netAmount': 0.0,
            }
        )

    for _, txn in transactions_df.iterrows():
        trade_date = pd.to_datetime(txn['trade_date']).date()
        order_type = str(txn['order_type']).strip().title()
        quantity = float(txn['quantity'])
        price = float(txn['executed_price'])

        if quantity <= 0 or price <= 0:
            continue

        if last_trade_date and trade_date > last_trade_date:
            padding_date = (pd.to_datetime(trade_date) - timedelta(days=1)).date()
            if padding_date >= last_trade_date:
                running_rows.append(
                    {
                        'tradeDate': padding_date.strftime('%Y-%m-%d'),
                        'amount': running_total,
                        'orderType': 'padding',
                        'netAmount': 0.0,
                    }
                )

        net_amount = quantity * price * (1 if order_type.lower() == 'buy' else -1)
        running_total += net_amount

        running_rows.append(
            {
                'tradeDate': trade_date.strftime('%Y-%m-%d'),
                'amount': running_total,
                'orderType': order_type,
                'netAmount': net_amount,
            }
        )

        last_trade_date = trade_date

    if last_trade_date:
        today = datetime.now(timezone.utc).date()
        if today > last_trade_date:
            running_rows.append(
                {
                    'tradeDate': today.strftime('%Y-%m-%d'),
                    'amount': running_total,
                    'orderType': 'padding',
                    'netAmount': 0.0,
                }
            )

    with open(OUTPUT_DIR / 'contribution_series.json', 'w') as f:
        json.dump(running_rows, f)
    print("Successfully created contribution_series.json")

    perf_series = get_performance_series()
    with open(OUTPUT_DIR / 'performance_series.json', 'w') as f:
        json.dump(perf_series, f)
    print("Successfully created performance_series.json")

    # --- Generate text files for terminal stats ---
    stats_text = calculate_stats()
    (OUTPUT_DIR / 'transaction_stats.txt').write_text(stats_text)
    print("Successfully created transaction_stats.txt")

    holdings_text = calculate_holdings()
    (OUTPUT_DIR / 'holdings.txt').write_text(holdings_text)
    print("Successfully created holdings.txt")

    cagr_text = calculate_cagr(perf_series)
    (OUTPUT_DIR / 'cagr.txt').write_text(cagr_text)
    print("Successfully created cagr.txt")

    annual_returns_text = calculate_annual_returns(perf_series)
    (OUTPUT_DIR / 'annual_returns.txt').write_text(annual_returns_text)
    print("Successfully created annual_returns.txt")

    ratios_text = calculate_ratios(perf_series)
    (OUTPUT_DIR / 'ratios.txt').write_text(ratios_text)
    print("Successfully created ratios.txt")


if __name__ == "__main__":
    main()
