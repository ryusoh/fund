"""Shared table utilities for the processor layer.

This module provides the low-level HTML table parsing functions shared by
all processors, so business domains or individual processors do not have to
depend on the private implementation of some other processor module.
"""

from __future__ import annotations

from io import StringIO
from typing import Optional

import pandas as pd
from bs4 import Tag


def parse_html_table_dataframe(table_tag: Tag) -> Optional[pd.DataFrame]:
    """Parse an HTML table into a DataFrame with pandas.

    Explicitly disable the ``thousands`` argument to avoid pandas' pathological
    regex replacement (``_search_replace_num_columns``) on long strings full of
    commas, a scenario that can hang the process for hours. Downstream numeric
    parsing is handled independently by each processor and does not rely on
    pandas' pre-cleaning of thousands separators.

    Args:
        table_tag: HTML ``table`` tag to parse.

    Returns:
        parsed ``DataFrame``; ``None`` on parse failure or when there is no table.

    Raises:
        RuntimeError: raised when an unrecoverable error occurs during parsing.
    """

    try:
        dataframes = pd.read_html(StringIO(str(table_tag)), thousands=None)
    except Exception:
        return None
    if not dataframes:
        return None
    return dataframes[0]


__all__ = ["parse_html_table_dataframe"]
