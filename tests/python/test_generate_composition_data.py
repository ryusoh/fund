import json
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd
import pytest

# Add scripts directory to path to import generate_composition_data
sys.path.append(str(Path(__file__).parent.parent.parent / "scripts"))
from generate_composition_data import calculate_daily_composition, save_json_data
from validate_frontend_figures import (  # noqa: E402
    FIGURE_FILENAMES,
    compare_figures,
    validate_figure,
    validate_figure_directory,
)
from validate_frontend_figures import (
    main as validate_main,
)


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


def test_save_json_data_writes_compact_json(tmp_path):
    """save_json_data writes compact JSON that round-trips to the same data."""
    df = pd.DataFrame(
        {
            "date": ["2023-01-01", "2023-01-02"],
            "total_value": [100.0, 200.0],
            "AAPL": [60.0, 55.0],
        }
    )
    out = tmp_path / "composition.json"
    save_json_data(df, out, label="composition")

    text = out.read_text()
    assert "\n" not in text  # compact: single line
    parsed = json.loads(text)
    assert parsed["dates"] == ["2023-01-01", "2023-01-02"]
    assert parsed["total_values"] == [100.0, 200.0]
    assert parsed["series"] == {"AAPL": [60.0, 55.0]}


@pytest.fixture
def valid_figure():
    return {
        "dates": ["2023-01-01", "2023-01-02"],
        "total_values": [100.0, 200.0],
        "series": {"AAPL": [60.0, 55.0], "MSFT": [40.0, 45.0]},
    }


def test_validate_figure_accepts_valid_payload(valid_figure):
    assert validate_figure(valid_figure, "composition.json") is valid_figure


@pytest.mark.parametrize(
    "field,value",
    [
        ("dates", []),
        ("dates", ["2023-01-01", "not-a-date"]),
        ("dates", ["2023-01-02", "2023-01-01"]),  # out of order
        ("total_values", [100.0]),  # wrong length
        ("total_values", [100.0, float("nan")]),
        ("total_values", [100.0, float("inf")]),
        ("total_values", [100.0, True]),  # bool rejected as number
        ("series", {"AAPL": [60.0]}),  # wrong length
        ("series", {"AAPL": [60.0, "oops"]}),
        ("series", {"AAPL": [60.0, float("inf")]}),
        ("series", {"AAPL": [60.0, False]}),
        ("series", {"AAPL": "not-a-list"}),
    ],
)
def test_validate_figure_rejects_invalid_values(valid_figure, field, value):
    payload = {**valid_figure, field: value}
    with pytest.raises(ValueError, match="composition.json"):
        validate_figure(payload, "composition.json")


def test_validate_figure_rejects_non_object():
    with pytest.raises(ValueError, match="top level"):
        validate_figure([1, 2, 3], "sectors.json")


def test_validate_figure_reports_field_path(valid_figure):
    payload = {**valid_figure, "series": {"AAPL": [60.0, float("nan")]}}
    with pytest.raises(ValueError, match=r"series\['AAPL'\]\[1\]"):
        validate_figure(payload, "marketcap.json")


def test_compare_figures_returns_none_on_identical(valid_figure):
    assert compare_figures(valid_figure, json.loads(json.dumps(valid_figure))) is None


def test_compare_figures_allows_float_round_off(valid_figure):
    actual = json.loads(json.dumps(valid_figure))
    actual["total_values"][1] = 200.0 + 1e-13
    actual["series"]["AAPL"][1] = 55.0 - 1e-13
    assert compare_figures(valid_figure, actual) is None


def test_compare_figures_rejects_values_outside_tolerance(valid_figure):
    actual = json.loads(json.dumps(valid_figure))
    actual["total_values"][1] = 200.0 + 1e-9
    with pytest.raises(ValueError, match="total_values"):
        compare_figures(valid_figure, actual)


def test_compare_figures_detects_key_mismatch(valid_figure):
    actual = json.loads(json.dumps(valid_figure))
    del actual["series"]["AAPL"]
    actual["series"]["TSLA"] = [60.0, 55.0]
    with pytest.raises(ValueError, match="missing keys"):
        compare_figures(valid_figure, actual)


def test_compare_figures_detects_date_mismatch(valid_figure):
    actual = json.loads(json.dumps(valid_figure))
    actual["dates"][0] = "2023-01-03"
    with pytest.raises(ValueError, match=r"dates\[0\]"):
        compare_figures(valid_figure, actual)


def test_compare_figures_detects_list_length_mismatch(valid_figure):
    actual = json.loads(json.dumps(valid_figure))
    actual["series"]["MSFT"] = [40.0]
    with pytest.raises(ValueError, match="length"):
        compare_figures(valid_figure, actual)


def test_compare_figures_rejects_bool_vs_number(valid_figure):
    actual = json.loads(json.dumps(valid_figure))
    actual["series"]["MSFT"][0] = True
    with pytest.raises(ValueError, match="bool|mismatch"):
        compare_figures(valid_figure, actual)


def test_figure_directory_validation_and_cli(valid_figure, tmp_path, capsys):
    for name in FIGURE_FILENAMES:
        (tmp_path / name).write_text(json.dumps(valid_figure))

    assert validate_figure_directory(tmp_path) == []
    assert validate_main([str(tmp_path)]) == 0
    assert "valid" in capsys.readouterr().out

    (tmp_path / "sectors.json").write_text(
        json.dumps({"dates": [], "total_values": [], "series": {}})
    )
    errors = validate_figure_directory(tmp_path)
    assert len(errors) == 1
    assert validate_main([str(tmp_path)]) == 1
    assert "sectors.json" in capsys.readouterr().err


def test_figure_directory_cli_fails_on_missing_file(valid_figure, tmp_path, capsys):
    (tmp_path / "composition.json").write_text(json.dumps(valid_figure))
    (tmp_path / "sectors.json").write_text(json.dumps(valid_figure))
    assert validate_main([str(tmp_path)]) == 1
    assert "marketcap.json" in capsys.readouterr().err
