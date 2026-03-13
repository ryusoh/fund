"""
Test currency conversion for Chinese ADRs in sync_configs.py

This test ensures that financial metrics (EBITDA, Enterprise Value, Market Cap)
for Chinese companies trading as USD ADRs are properly converted from CNY to USD.
"""

import sys
from pathlib import Path

import pytest

# Add scripts/analysis to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "scripts" / "analysis"))

from sync_configs import (
    CURRENCY_CONVERSION_TICKERS,
    convert_financial_currency,
    load_fx_rates,
)


class TestCurrencyConversion:
    """Test currency conversion functionality for Chinese ADRs."""

    def test_load_fx_rates_returns_usd_base(self):
        """FX rates should have USD as base currency."""
        rates = load_fx_rates()
        assert isinstance(rates, dict)
        assert "USD" in rates
        assert rates["USD"] == 1.0
        assert "CNY" in rates
        assert rates["CNY"] > 0

    def test_convert_cny_to_usd(self):
        """Test converting CNY values to USD."""
        fx_rates = load_fx_rates()
        cny_rate = fx_rates.get("CNY", 7.0)

        # 100 CNY should convert to less USD (divide by rate)
        result = convert_financial_currency(100.0, "CNY", "USD", fx_rates)
        expected = 100.0 / cny_rate
        assert abs(result - expected) < 0.01

    def test_convert_usd_to_usd_no_change(self):
        """Test that USD to USD conversion returns same value."""
        fx_rates = load_fx_rates()
        result = convert_financial_currency(100.0, "USD", "USD", fx_rates)
        assert result == 100.0

    def test_convert_none_value_returns_none(self):
        """Test that None values are handled gracefully."""
        fx_rates = load_fx_rates()
        result = convert_financial_currency(None, "CNY", "USD", fx_rates)
        assert result is None

    def test_pdd_in_conversion_list(self):
        """PDD should be in the currency conversion tickers list."""
        assert "PDD" in CURRENCY_CONVERSION_TICKERS
        assert CURRENCY_CONVERSION_TICKERS["PDD"] == "CNY"

    def test_chinese_adrs_in_conversion_list(self):
        """Major Chinese ADRs should be in the conversion list."""
        expected_tickers = {"PDD", "BABA", "JD", "BIDU", "NIO", "XPEV", "LI"}
        for ticker in expected_tickers:
            assert ticker in CURRENCY_CONVERSION_TICKERS
            assert CURRENCY_CONVERSION_TICKERS[ticker] == "CNY"

    def test_pdd_ebitda_conversion(self):
        """
        Test PDD EBITDA conversion from CNY to USD.

        Based on actual data from 2024:
        - PDD reports EBITDA of ~93B CNY
        - At FX rate of ~6.88 CNY/USD, this equals ~13.5B USD
        """
        fx_rates = load_fx_rates()

        # Actual PDD EBITDA in CNY (from yfinance)
        ebitda_cny = 93_147_258_880.0

        # Convert to USD
        ebitda_usd = convert_financial_currency(ebitda_cny, "CNY", "USD", fx_rates)

        # Verify the conversion makes sense
        # EBITDA in USD should be significantly smaller than CNY
        assert ebitda_usd < ebitda_cny
        # Should be roughly 1/7th of the CNY value
        assert ebitda_usd > ebitda_cny / 8
        assert ebitda_usd < ebitda_cny / 6

    def test_pdd_enterprise_value_conversion(self):
        """Test PDD Enterprise Value conversion from CNY to USD."""
        fx_rates = load_fx_rates()

        # Actual PDD EV in CNY (from yfinance)
        ev_cny = 163_082_584_064.0

        # Convert to USD
        ev_usd = convert_financial_currency(ev_cny, "CNY", "USD", fx_rates)

        # Verify the conversion makes sense
        assert ev_usd < ev_cny
        assert ev_usd > ev_cny / 8
        assert ev_usd < ev_cny / 6

    def test_ev_ebitda_ratio_preserved_after_conversion(self):
        """
        Test that EV/EBITDA ratio is mathematically consistent after conversion.

        The ratio should be the same whether calculated in CNY or USD,
        since both numerator and denominator are converted by the same rate.
        """
        fx_rates = load_fx_rates()

        # Original values in CNY
        ebitda_cny = 93_147_258_880.0
        ev_cny = 163_082_584_064.0

        # Calculate ratio in CNY
        ratio_cny = ev_cny / ebitda_cny

        # Convert to USD
        ebitda_usd = convert_financial_currency(ebitda_cny, "CNY", "USD", fx_rates)
        ev_usd = convert_financial_currency(ev_cny, "CNY", "USD", fx_rates)

        # Calculate ratio in USD
        ratio_usd = ev_usd / ebitda_usd

        # Ratios should be identical (within floating point precision)
        assert abs(ratio_cny - ratio_usd) < 0.0001

    def test_market_cap_conversion(self):
        """Test market cap conversion for Chinese ADRs."""
        fx_rates = load_fx_rates()

        # Example: 500B CNY market cap
        market_cap_cny = 500_000_000_000.0
        market_cap_usd = convert_financial_currency(market_cap_cny, "CNY", "USD", fx_rates)

        # Should be converted to USD
        assert market_cap_usd < market_cap_cny
        assert isinstance(market_cap_usd, float)


class TestSyncConfigsIntegration:
    """Integration tests for sync_configs with actual data."""

    def test_pdd_json_has_converted_values(self):
        """
        Test that PDD.json has USD-converted values, not raw CNY.

        This is a regression test to ensure the currency conversion
        is actually being applied when syncing data.
        """
        import json

        pdd_path = Path(__file__).parent.parent.parent / "data" / "analysis" / "PDD.json"

        if not pdd_path.exists():
            pytest.skip("PDD.json not found, run sync_configs first")

        with open(pdd_path, "r") as f:
            data = json.load(f)

        market = data.get("market", {})
        ebitda = market.get("ebitda")
        enterprise_value = market.get("enterpriseValue")
        market_cap = market.get("marketCap")

        # All values should be present
        assert ebitda is not None, "EBITDA should be present"
        assert enterprise_value is not None, "Enterprise Value should be present"
        assert market_cap is not None, "Market Cap should be present"

        # Values should be in USD (reasonable range for PDD)
        # PDD market cap is typically 100-200B USD
        assert 1e9 < market_cap < 500e9, f"Market cap {market_cap} should be in USD billions"

        # EBITDA should be in the 10-20B USD range (not 90B+ which would be CNY)
        assert 1e9 < ebitda < 50e9, f"EBITDA {ebitda} should be in USD billions, not CNY"

        # Enterprise value should be reasonable (100-200B USD range for PDD)
        assert 1e9 < enterprise_value < 300e9, f"EV {enterprise_value} should be in USD billions"

        # EV/EBITDA ratio should be calculated and reasonable for e-commerce
        # Typical e-commerce EV/EBITDA: 8-15x
        # PDD should be in this range after proper currency conversion
        ev_to_ebitda = market.get("evToEbitda")
        assert ev_to_ebitda is not None, "EV/EBITDA should be calculated"
        assert 5 < ev_to_ebitda < 20, (
            f"EV/EBITDA {ev_to_ebitda} should be in reasonable range (5-20x) for e-commerce. "
            f"If it's ~1.7x, EBITDA wasn't converted. If it's >50x, EV was wrongly converted."
        )

        # Verify the ratio is mathematically correct
        calculated_ratio = enterprise_value / ebitda
        assert (
            abs(calculated_ratio - ev_to_ebitda) < 0.5
        ), f"Reported EV/EBITDA ({ev_to_ebitda}) should match calculated ({calculated_ratio})"

    def test_ev_ebitda_ratio_realistic_for_pdd(self):
        """
        Test that PDD's EV/EBITDA ratio is realistic after currency conversion.

        Before fix: EV/EBITDA was ~1.7x (wrong - EBITDA in CNY)
        After fix: EV/EBITDA should be ~11-12x (correct - EBITDA in USD)

        E-commerce sector typical EV/EBITDA: 8-15x
        """
        import json

        pdd_path = Path(__file__).parent.parent.parent / "data" / "analysis" / "PDD.json"

        if not pdd_path.exists():
            pytest.skip("PDD.json not found, run sync_configs first")

        with open(pdd_path, "r") as f:
            data = json.load(f)

        market = data.get("market", {})
        ebitda = market.get("ebitda")
        enterprise_value = market.get("enterpriseValue")
        ev_to_ebitda = market.get("evToEbitda")

        # Calculate expected ratio
        expected_ratio = enterprise_value / ebitda

        # The ratio should be in realistic range for e-commerce companies
        # PDD typically trades at 10-15x EV/EBITDA
        assert 8 < expected_ratio < 18, (
            f"EV/EBITDA of {expected_ratio:.2f}x is outside expected range. "
            f"Check if EBITDA currency conversion is working correctly."
        )

        # Verify the stored ratio matches calculation
        assert ev_to_ebitda is not None
        assert (
            abs(ev_to_ebitda - expected_ratio) < 0.5
        ), f"Stored EV/EBITDA ({ev_to_ebitda}) doesn't match calculated ({expected_ratio:.2f})"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
