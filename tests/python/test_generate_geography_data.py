import pandas as pd

from scripts.generate_geography_data import calculate_daily_geography


def test_calculate_daily_geography_fail_open_allocations():
    # Test that when no external allocations exist, it successfully falls open and uses US defaults or handles missing gracefully
    dates = pd.date_range(start="2023-01-01", end="2023-01-02", freq="D")
    holdings_df = pd.DataFrame(
        {
            'VTI': [100, 100],  # US ETF default
            'UNKNOWN_FUND': [50, 50],  # Unknown fund fallback
            'AAPL': [10, 10],  # Individual stock
        },
        index=dates,
    )

    prices_data = {
        'VTI': {'2023-01-01': 150, '2023-01-02': 150},
        'UNKNOWN_FUND': {'2023-01-01': 100, '2023-01-02': 100},
        'AAPL': {'2023-01-01': 200, '2023-01-02': 200},
    }

    metadata = {
        'VTI': {'quoteType': 'ETF'},
        'UNKNOWN_FUND': {'quoteType': 'ETF'},
        'AAPL': {'quoteType': 'EQUITY'},
    }

    # We patch load_country_allocations to return empty dictionary to simulate missing or empty file
    import scripts.generate_geography_data as ggd

    original_load = ggd.load_country_allocations
    ggd.load_country_allocations = lambda: {}

    try:
        # Run it with our mocked missing allocations
        result = calculate_daily_geography(holdings_df, prices_data, metadata)

        assert len(result) == 2
        assert 'total_value' in result[0]

        # VTI and AAPL both default to US
        assert result[0]['United States'] > 0
        assert result[0]['Other'] > 0  # UNKNOWN_FUND goes to 'Other'

    finally:
        # Restore
        ggd.load_country_allocations = original_load
