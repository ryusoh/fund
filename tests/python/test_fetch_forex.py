"""Tests for scripts/data/fetch_forex.py — focusing on the retry / fallback logic."""

import json
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from scripts.data.fetch_forex import (
    _fetch_single,
    _load_previous_rates,
    fetch_forex_data,
    update_fx_daily_csv,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_close_df(tickers: list[str], values: list[float]) -> pd.DataFrame:
    """Return a minimal DataFrame shaped like yfinance's 'Close' sub-frame."""
    return pd.DataFrame([dict(zip(tickers, values, strict=False))])


# ---------------------------------------------------------------------------
# _load_previous_rates
# ---------------------------------------------------------------------------


class TestLoadPreviousRates:
    def test_returns_empty_when_file_missing(self, tmp_path, monkeypatch):
        monkeypatch.setattr(
            "scripts.data.fetch_forex.FX_DAILY_RATES_FILE",
            str(tmp_path / "nonexistent.csv"),
        )
        assert _load_previous_rates() == {}

    def test_returns_last_row_values(self, tmp_path, monkeypatch):
        csv_path = tmp_path / "fx_daily_rates.csv"
        csv_path.write_text(
            "date,USD,CNY,JPY,KRW\n"
            "2026-03-20,1.000000,7.100000,149.500000,1320.000000\n"
            "2026-03-21,1.000000,7.200000,150.000000,1330.000000\n"
        )
        monkeypatch.setattr("scripts.data.fetch_forex.FX_DAILY_RATES_FILE", str(csv_path))

        rates = _load_previous_rates()
        assert rates["CNY"] == pytest.approx(7.2)
        assert rates["JPY"] == pytest.approx(150.0)
        assert rates["KRW"] == pytest.approx(1330.0)
        assert rates["USD"] == pytest.approx(1.0)

    def test_skips_nan_columns(self, tmp_path, monkeypatch):
        csv_path = tmp_path / "fx_daily_rates.csv"
        # JPY is NaN on the last row (previous partial failure)
        csv_path.write_text("date,USD,CNY,JPY,KRW\n" "2026-03-21,1.000000,7.200000,,1330.000000\n")
        monkeypatch.setattr("scripts.data.fetch_forex.FX_DAILY_RATES_FILE", str(csv_path))

        rates = _load_previous_rates()
        assert "JPY" not in rates
        assert rates["CNY"] == pytest.approx(7.2)

    def test_returns_empty_on_corrupt_file(self, tmp_path, monkeypatch):
        csv_path = tmp_path / "fx_daily_rates.csv"
        csv_path.write_text("not,valid,csv\nbad data!!!\n")
        monkeypatch.setattr("scripts.data.fetch_forex.FX_DAILY_RATES_FILE", str(csv_path))

        # Should not raise; returns empty dict
        result = _load_previous_rates()
        assert isinstance(result, dict)


# ---------------------------------------------------------------------------
# _fetch_single
# ---------------------------------------------------------------------------


class TestFetchSingle:
    def test_returns_rate_on_success(self):
        mock_data = pd.DataFrame({"Close": [149.5, 150.2]})
        with patch("scripts.data.fetch_forex.yf.download", return_value=mock_data):
            result = _fetch_single("JPY")
        assert result == pytest.approx(150.2)

    def test_returns_none_when_empty(self):
        with patch("scripts.data.fetch_forex.yf.download", return_value=pd.DataFrame()):
            result = _fetch_single("JPY")
        assert result is None

    def test_returns_none_on_exception(self):
        with patch(
            "scripts.data.fetch_forex.yf.download",
            side_effect=Exception("database is locked"),
        ):
            result = _fetch_single("JPY")
        assert result is None

    def test_handles_series_close_column(self):
        """When Close is a plain Series (single-ticker download)."""
        mock_data = pd.DataFrame({"Close": [148.0, 149.5]})
        with patch("scripts.data.fetch_forex.yf.download", return_value=mock_data):
            result = _fetch_single("JPY")
        assert result == pytest.approx(149.5)


# ---------------------------------------------------------------------------
# update_fx_daily_csv
# ---------------------------------------------------------------------------


class TestUpdateFxDailyCsv:
    def test_creates_file_if_missing(self, tmp_path, monkeypatch):
        csv_path = tmp_path / "fx_daily_rates.csv"
        monkeypatch.setattr("scripts.data.fetch_forex.FX_DAILY_RATES_FILE", str(csv_path))

        update_fx_daily_csv({"USD": 1.0, "CNY": 7.2, "JPY": 150.0})

        df = pd.read_csv(csv_path)
        assert len(df) == 1
        assert df["CNY"].iloc[0] == pytest.approx(7.2)
        assert df["JPY"].iloc[0] == pytest.approx(150.0)

    def test_appends_new_date(self, tmp_path, monkeypatch):
        csv_path = tmp_path / "fx_daily_rates.csv"
        csv_path.write_text("date,USD,CNY,JPY\n" "2026-03-20,1.000000,7.100000,149.500000\n")
        monkeypatch.setattr("scripts.data.fetch_forex.FX_DAILY_RATES_FILE", str(csv_path))

        # Patch today to a known date different from the CSV
        with patch("scripts.data.fetch_forex.datetime") as mock_dt:
            mock_dt.now.return_value.date.return_value.strftime.return_value = "2026-03-21"
            update_fx_daily_csv({"USD": 1.0, "CNY": 7.2, "JPY": 150.0})

        df = pd.read_csv(csv_path)
        assert len(df) == 2
        assert df["date"].iloc[-1] == "2026-03-21"

    def test_overwrites_existing_today_row(self, tmp_path, monkeypatch):
        """Re-running the workflow on the same day replaces the row, not appends."""
        csv_path = tmp_path / "fx_daily_rates.csv"
        csv_path.write_text("date,USD,CNY,JPY\n" "2026-03-21,1.000000,7.100000,149.000000\n")
        monkeypatch.setattr("scripts.data.fetch_forex.FX_DAILY_RATES_FILE", str(csv_path))

        with patch("scripts.data.fetch_forex.datetime") as mock_dt:
            mock_dt.now.return_value.date.return_value.strftime.return_value = "2026-03-21"
            update_fx_daily_csv({"USD": 1.0, "CNY": 7.25, "JPY": 151.0})

        df = pd.read_csv(csv_path)
        assert len(df) == 1, "Re-run must overwrite, not append"
        assert df["CNY"].iloc[0] == pytest.approx(7.25)
        assert df["JPY"].iloc[0] == pytest.approx(151.0)


# ---------------------------------------------------------------------------
# fetch_forex_data — retry and fallback integration
# ---------------------------------------------------------------------------


class TestFetchForexDataFallback:
    """Verifies that a partial batch failure triggers retry then yesterday's fallback."""

    def _make_batch_missing_jpy(self):
        """Batch download result where JPY column is all-NaN (download failed).

        yfinance returns a MultiIndex DataFrame; pd.concat({'Close': ...}) replicates
        that so that `'Close' in df.columns` and `df['Close']` both work correctly.
        """
        import numpy as np

        close_df = pd.DataFrame(
            {
                "USDCNY=X": [7.2],
                "USDJPY=X": [np.nan],
                "USDKRW=X": [1330.0],
            }
        )
        return pd.concat({"Close": close_df}, axis=1)

    def test_retries_failed_currency_individually(self, tmp_path, monkeypatch):
        monkeypatch.setattr("scripts.data.fetch_forex.FX_DATA_FILE", str(tmp_path / "fx.json"))
        monkeypatch.setattr(
            "scripts.data.fetch_forex.FX_DAILY_RATES_FILE", str(tmp_path / "fx_rates.csv")
        )

        with (
            patch(
                "scripts.data.fetch_forex.yf.download",
                return_value=self._make_batch_missing_jpy(),
            ),
            patch(
                "scripts.data.fetch_forex._fetch_single",
                return_value=150.5,  # retry succeeds
            ) as mock_retry,
        ):
            fetch_forex_data()

        mock_retry.assert_called_with("JPY")
        assert mock_retry.call_count == 1
        fx = json.loads((tmp_path / "fx.json").read_text())
        assert fx["rates"]["JPY"] == pytest.approx(150.5, abs=0.01)

    def test_falls_back_to_yesterday_when_retry_also_fails(self, tmp_path, monkeypatch):
        csv_path = tmp_path / "fx_rates.csv"
        csv_path.write_text(
            "date,USD,CNY,JPY,KRW\n" "2026-03-20,1.000000,7.100000,149.500000,1320.000000\n"
        )
        monkeypatch.setattr("scripts.data.fetch_forex.FX_DATA_FILE", str(tmp_path / "fx.json"))
        monkeypatch.setattr("scripts.data.fetch_forex.FX_DAILY_RATES_FILE", str(csv_path))

        with (
            patch(
                "scripts.data.fetch_forex.yf.download",
                return_value=self._make_batch_missing_jpy(),
            ),
            patch(
                "scripts.data.fetch_forex._fetch_single",
                return_value=None,  # retry also fails
            ),
        ):
            fetch_forex_data()

        fx = json.loads((tmp_path / "fx.json").read_text())
        # Should use yesterday's 149.5
        assert fx["rates"]["JPY"] == pytest.approx(149.5, abs=0.01)

    def test_no_gap_in_csv_when_one_currency_fails_then_retries(self, tmp_path, monkeypatch):
        """The CSV row for today must not have NaN for a currency recovered via retry."""
        csv_path = tmp_path / "fx_rates.csv"
        monkeypatch.setattr("scripts.data.fetch_forex.FX_DATA_FILE", str(tmp_path / "fx.json"))
        monkeypatch.setattr("scripts.data.fetch_forex.FX_DAILY_RATES_FILE", str(csv_path))

        with (
            patch(
                "scripts.data.fetch_forex.yf.download",
                return_value=self._make_batch_missing_jpy(),
            ),
            patch("scripts.data.fetch_forex._fetch_single", return_value=150.0),
        ):
            fetch_forex_data()

        df = pd.read_csv(csv_path)
        assert pd.notna(df["JPY"].iloc[-1])
        assert df["JPY"].iloc[-1] == pytest.approx(150.0)

    def test_no_gap_in_csv_when_fallback_used(self, tmp_path, monkeypatch):
        """The CSV row for today must carry forward yesterday's value, not NaN."""
        csv_path = tmp_path / "fx_rates.csv"
        csv_path.write_text(
            "date,USD,CNY,JPY,KRW\n" "2026-03-20,1.000000,7.100000,149.500000,1320.000000\n"
        )
        monkeypatch.setattr("scripts.data.fetch_forex.FX_DATA_FILE", str(tmp_path / "fx.json"))
        monkeypatch.setattr("scripts.data.fetch_forex.FX_DAILY_RATES_FILE", str(csv_path))

        with (
            patch(
                "scripts.data.fetch_forex.yf.download",
                return_value=self._make_batch_missing_jpy(),
            ),
            patch("scripts.data.fetch_forex._fetch_single", return_value=None),
        ):
            fetch_forex_data()

        df = pd.read_csv(csv_path)
        today_row = df.iloc[-1]
        assert pd.notna(today_row["JPY"])
        assert today_row["JPY"] == pytest.approx(149.5)

    def test_all_currencies_fail_does_not_write_files(self, tmp_path, monkeypatch):
        """If every currency fails and there is no previous data, files stay unchanged."""
        fx_path = tmp_path / "fx.json"
        csv_path = tmp_path / "fx_rates.csv"
        monkeypatch.setattr("scripts.data.fetch_forex.FX_DATA_FILE", str(fx_path))
        monkeypatch.setattr("scripts.data.fetch_forex.FX_DAILY_RATES_FILE", str(csv_path))

        empty = MagicMock()
        empty.__contains__ = lambda self, key: False  # no 'Close' column

        with (
            patch("scripts.data.fetch_forex.yf.download", return_value=empty),
            patch("scripts.data.fetch_forex._fetch_single", return_value=None),
        ):
            fetch_forex_data()

        assert not fx_path.exists()
