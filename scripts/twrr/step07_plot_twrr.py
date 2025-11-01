#!/usr/bin/env python3.11
"""Step 07: Plot TWRR performance."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import List

import pandas as pd
import plotly.graph_objects as go
import plotly.io as pio
import yfinance as yf

sys.path.append(str(Path(__file__).parent))
from utils import append_changelog_entry

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / 'data'
TWRR_PATH = DATA_DIR / 'twrr_series.parquet'
OUTPUT_DIR = DATA_DIR / 'output/figures'
OUTPUT_JSON = OUTPUT_DIR / 'twrr.json'
OUTPUT_PNG = OUTPUT_DIR / 'twrr.png'
FRONTEND_HTML = PROJECT_ROOT / 'performance' / 'index.html'

AI_DIR = PROJECT_ROOT / 'ai'
STATUS_PATH = AI_DIR / 'status' / 'AI_STATUS.json'
CHANGELOG_PATH = AI_DIR / 'handoff' / 'CHANGELOG-AI.md'

STEP_NAME = 'step-07_plot'
TOOL_NAME = 'codex'

BENCHMARKS = {
    '^GSPC': '^GSPC',
    '^IXIC': '^IXIC',
    '^DJI': '^DJI',
    '^SSEC': '000001.SS',
    '^HSI': '^HSI',
    '^N225': '^N225',
}
BENCHMARK_STYLES = {
    '^GSPC': {'color': '#64b5f6', 'dash': 'dash'},
    '^IXIC': {'color': '#74c0fc', 'dash': 'dot'},
    '^DJI': {'color': '#6aaefc', 'dash': 'dashdot'},
    '^SSEC': {'color': '#5da9f6', 'dash': 'longdash'},
    '^HSI': {'color': '#7ab8ff', 'dash': 'longdashdot'},
    '^N225': {'color': '#89c2ff', 'dash': 'solid'},
}


def ensure_directories() -> None:
    for path in [OUTPUT_DIR, STATUS_PATH.parent, CHANGELOG_PATH.parent]:
        path.mkdir(parents=True, exist_ok=True)


def load_twrr() -> pd.Series:
    if not TWRR_PATH.exists():
        raise FileNotFoundError(f'Missing TWRR series parquet: {TWRR_PATH}. Run step-06 first.')
    try:
        df = pd.read_parquet(TWRR_PATH)
    except ImportError as exc:
        raise RuntimeError(
            'Reading parquet requires pyarrow or fastparquet. Install one of them and rerun step-07.'
        ) from exc

    if 'twrr' not in df.columns:
        raise ValueError('twrr_series.parquet must contain a "twrr" column.')

    twrr = df['twrr']
    twrr.index = pd.to_datetime(twrr.index).tz_localize(None)
    return twrr


def build_figure(twrr: pd.Series) -> go.Figure:
    indexed = twrr * 100

    fig = go.Figure(
        data=[
            go.Scatter(
                x=indexed.index,
                y=indexed.values,
                mode='lines',
                name='^LZ',
                line=dict(color='#1f77b4', width=2),
            )
        ]
    )

    fig.update_layout(
        title='Portfolio Time-Weighted Performance (TWRR)',
        xaxis_title='Date',
        yaxis_title='Performance (Indexed to 100)',
        template='plotly_white',
        hovermode='x unified',
    )

    benchmark_traces = build_benchmark_traces(pd.DatetimeIndex(indexed.index))
    for trace in benchmark_traces:
        fig.add_trace(trace)

    return fig


def build_benchmark_traces(date_index: pd.DatetimeIndex) -> list[go.Scatter]:
    traces: list[go.Scatter] = []
    if date_index.empty:
        return traces

    start = date_index.min().normalize()
    end = date_index.max().normalize() + pd.Timedelta(days=1)

    for name, symbol in BENCHMARKS.items():
        try:
            data = yf.Ticker(symbol).history(
                start=start.strftime('%Y-%m-%d'),
                end=end.strftime('%Y-%m-%d'),
                interval='1d',
                actions=False,
            )
        except Exception as exc:  # pragma: no cover - network call
            print(f'WARNING: Failed to download benchmark {symbol}: {exc}')
            continue

        if data.empty:
            print(f'WARNING: Benchmark {symbol} returned no data; skipping.')
            continue

        close = data.get('Adj Close', data.get('Close'))
        if close is None or close.empty:
            print(f'WARNING: Benchmark {symbol} missing close prices; skipping.')
            continue

        series = close.copy()
        series.index = pd.to_datetime(series.index).tz_localize(None)
        aligned = series.reindex(date_index).ffill().bfill()
        if aligned.isna().all():
            print(f'WARNING: Benchmark {symbol} could not align with portfolio dates; skipping.')
            continue

        baseline = aligned.iloc[0]
        if pd.isna(baseline) or baseline <= 0:
            print(f'WARNING: Benchmark {symbol} has invalid baseline; skipping.')
            continue

        normalized = (aligned / baseline) * 100
        style = BENCHMARK_STYLES.get(name, {})
        traces.append(
            go.Scatter(
                x=normalized.index,
                y=normalized.values,
                mode='lines',
                name=name,
                line=dict(color=style.get('color'), dash=style.get('dash'), width=2),
            )
        )

    return traces


def write_outputs(fig: go.Figure) -> None:
    payload = {
        'data': json.loads(pio.to_json(fig, pretty=False)).get('data', []),
        'meta': {
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'source': STEP_NAME,
        },
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(payload, indent=2) + '\n')

    try:
        fig.write_image(OUTPUT_PNG)
    except Exception as exc:
        print(f'WARNING: Failed to write PNG figure ({OUTPUT_PNG}): {exc}')


def update_status(artifacts: List[str], notes: str) -> None:
    status_data = {
        'step': STEP_NAME,
        'tool': TOOL_NAME,
        'artifacts': artifacts,
        'ts': datetime.now(timezone.utc).isoformat(),
        'notes': notes,
    }
    STATUS_PATH.write_text(json.dumps(status_data, indent=2))


def summarize(twrr: pd.Series) -> None:
    print('TWRR assets updated:')
    print(f'  JSON: {OUTPUT_JSON}')
    print(f'  PNG:  {OUTPUT_PNG}')
    if FRONTEND_HTML.exists():
        print(f'Static viewer available at {FRONTEND_HTML}')
    else:
        print(
            'NOTE: Static viewer HTML not found. Create fund/performance/index.html '
            'to consume the JSON data.'
        )
    print('\nTWRR summary:')
    print(twrr.describe())


def main() -> None:
    ensure_directories()
    twrr = load_twrr()
    fig = build_figure(twrr)
    write_outputs(fig)

    artifacts = [
        f"./{OUTPUT_JSON.relative_to(PROJECT_ROOT)}",
        f"./{OUTPUT_PNG.relative_to(PROJECT_ROOT)}",
    ]
    update_status(artifacts, 'Generated TWRR performance chart data.')
    append_changelog_entry(STEP_NAME, artifacts, 'Updated TWRR chart data')
    summarize(twrr)


if __name__ == '__main__':
    main()
