import sys
from datetime import datetime
from pathlib import Path

import pandas as pd
import pytest

# Add scripts directory to path to import generate_composition_data
sys.path.append(str(Path(__file__).parent.parent.parent / "scripts"))
from generate_composition_data import calculate_daily_composition


@pytest.fixture
def sample_metadata():
    return {
        "AAPL": {"sector": "Technology"},
        "MSFT": {"sector": "Technology"},
        "JNJ": {"sector": "Healthcare"},
    }


@pytest.fixture
def sample_fund_allocations():
    return {"VTI": {"Technology": 30.0, "Healthcare": 15.0, "Financials": 15.0, "Others": 40.0}}


def test_calculate_daily_composition_basic():
    """Test basic functionality with no missing prices."""
    dates = [datetime(2023, 1, 1), datetime(2023, 1, 2)]
    holdings_df = pd.DataFrame({"AAPL": [10.0, 10.0], "MSFT": [5.0, 5.0]}, index=dates)

    prices_data = {
        "AAPL": {"2023-01-01": 150.0, "2023-01-02": 160.0},
        "MSFT": {"2023-01-01": 250.0, "2023-01-02": 260.0},
    }

    metadata = {"AAPL": {"sector": "Technology"}, "MSFT": {"sector": "Technology"}}
    fund_allocations = {}

    comp_df, sec_df = calculate_daily_composition(
        holdings_df, prices_data, metadata, fund_allocations
    )

    assert len(comp_df) == 2
    # Check 2023-01-01: AAPL 1500, MSFT 1250 -> Total 2750
    # AAPL % = 1500 / 2750 = 54.545%
    # MSFT % = 1250 / 2750 = 45.454%
    assert comp_df.iloc[0]["date"] == "2023-01-01"
    assert comp_df.iloc[0]["total_value"] == 2750.0
    assert pytest.approx(comp_df.iloc[0]["AAPL"]) == 54.545454
    assert pytest.approx(comp_df.iloc[0]["MSFT"]) == 45.454545


def test_calculate_daily_composition_missing_price():
    """Test when price is missing for a specific date, it should fall back to previous."""
    dates = [datetime(2023, 1, 1), datetime(2023, 1, 2), datetime(2023, 1, 3)]
    holdings_df = pd.DataFrame({"AAPL": [10.0, 10.0, 10.0]}, index=dates)

    # Missing price for 2023-01-02
    prices_data = {
        "AAPL": {
            "2023-01-01": 150.0,
            # "2023-01-02" missing!
            "2023-01-03": 170.0,
        }
    }

    metadata = {"AAPL": {"sector": "Technology"}}
    fund_allocations = {}

    comp_df, sec_df = calculate_daily_composition(
        holdings_df, prices_data, metadata, fund_allocations
    )

    assert len(comp_df) == 3

    # 2023-01-01
    assert comp_df.iloc[0]["date"] == "2023-01-01"
    assert comp_df.iloc[0]["total_value"] == 1500.0

    # 2023-01-02 should fall back to 150.0
    assert comp_df.iloc[1]["date"] == "2023-01-02"
    assert comp_df.iloc[1]["total_value"] == 1500.0

    # 2023-01-03
    assert comp_df.iloc[2]["date"] == "2023-01-03"
    assert comp_df.iloc[2]["total_value"] == 1700.0


def test_calculate_daily_composition_no_prior_price():
    """Test when price is missing and NO previous price exists."""
    dates = [datetime(2023, 1, 1), datetime(2023, 1, 2)]
    holdings_df = pd.DataFrame({"AAPL": [10.0, 10.0]}, index=dates)

    # Only price is in the future relative to the first date
    prices_data = {"AAPL": {"2023-01-02": 160.0}}

    metadata = {"AAPL": {"sector": "Technology"}}
    fund_allocations = {}

    comp_df, sec_df = calculate_daily_composition(
        holdings_df, prices_data, metadata, fund_allocations
    )

    assert len(comp_df) == 2

    # 2023-01-01 has no price and no prior price, total_value should be 0
    assert comp_df.iloc[0]["date"] == "2023-01-01"
    assert comp_df.iloc[0]["total_value"] == 0.0

    # 2023-01-02 has price
    assert comp_df.iloc[1]["date"] == "2023-01-02"
    assert comp_df.iloc[1]["total_value"] == 1600.0


def test_calculate_daily_composition_missing_ticker():
    """Test when a ticker is completely missing from prices_data."""
    dates = [datetime(2023, 1, 1)]
    holdings_df = pd.DataFrame({"AAPL": [10.0], "UNKNOWN": [5.0]}, index=dates)

    # UNKNOWN missing from prices
    prices_data = {"AAPL": {"2023-01-01": 150.0}}

    metadata = {"AAPL": {"sector": "Technology"}}
    fund_allocations = {}

    comp_df, sec_df = calculate_daily_composition(
        holdings_df, prices_data, metadata, fund_allocations
    )

    assert len(comp_df) == 1

    # Total value should only include AAPL
    assert comp_df.iloc[0]["date"] == "2023-01-01"
    assert comp_df.iloc[0]["total_value"] == 1500.0
    assert "UNKNOWN" not in comp_df.columns
