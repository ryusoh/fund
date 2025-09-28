#!/usr/bin/env python3.11
"""Step 07: Plot TWRR performance."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import List

import pandas as pd
import plotly.graph_objects as go

import sys
sys.path.append(str(Path(__file__).parent))
from utils import append_changelog_entry

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / 'data'
TWRR_PATH = DATA_DIR / 'twrr_series.parquet'
OUTPUT_HTML = DATA_DIR / 'output/figures/twrr.html'
OUTPUT_PNG = DATA_DIR / 'output/figures/twrr.png'

AI_DIR = PROJECT_ROOT / 'ai'
STATUS_PATH = AI_DIR / 'status' / 'AI_STATUS.json'
CHANGELOG_PATH = AI_DIR / 'handoff' / 'CHANGELOG-AI.md'

STEP_NAME = 'step-07_plot'
TOOL_NAME = 'codex'


def ensure_directories() -> None:
    for path in [OUTPUT_HTML.parent, STATUS_PATH.parent, CHANGELOG_PATH.parent]:
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
                name='TWRR Index',
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

    return fig


def write_outputs(fig: go.Figure) -> None:
    # Write HTML with clean formatting options
    fig.write_html(
        OUTPUT_HTML,
        config={
            'displayModeBar': True,
            'displaylogo': False,
            'modeBarButtonsToRemove': ['pan2d', 'lasso2d', 'select2d']
        },
        include_plotlyjs=True,
        div_id='twrr-chart'
    )


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
    print('TWRR plot written to:')
    print(f'  HTML: {OUTPUT_HTML}')
    print(f'  PNG:  {OUTPUT_PNG}')
    print('\nTWRR summary:')
    print(twrr.describe())


def main() -> None:
    ensure_directories()
    twrr = load_twrr()
    fig = build_figure(twrr)
    write_outputs(fig)

    artifacts = [
        f"./{OUTPUT_HTML.relative_to(PROJECT_ROOT)}",
        f"./{OUTPUT_PNG.relative_to(PROJECT_ROOT)}",
    ]
    update_status(artifacts, 'Generated TWRR performance chart.')
    append_changelog_entry(STEP_NAME, artifacts, "Generated TWRR chart")
    summarize(twrr)


if __name__ == '__main__':
    main()
