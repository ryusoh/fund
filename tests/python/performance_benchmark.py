import time
import logging
from unittest.mock import patch, MagicMock
from polygon import RESTClient
from polygon.rest.models.snapshot import TickerSnapshot, LastTrade

# Basic setup to mimic update_fund_data.py
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


def get_prices_old_way(client, tickers):
    data = {}
    for ticker_symbol in tickers:
        try:
            last_trade = client.get_last_trade(ticker_symbol)
            if hasattr(last_trade, "price"):
                data[ticker_symbol] = float(last_trade.price)
        except Exception as e:
            pass
    return data


def get_prices_new_way(client, tickers):
    data = {}
    try:
        snapshots = client.get_snapshot_all(market_type='stocks', tickers=tickers)
        for snapshot in snapshots:
            if (
                hasattr(snapshot, "ticker")
                and hasattr(snapshot, "last_trade")
                and snapshot.last_trade is not None
            ):
                if hasattr(snapshot.last_trade, "price") and snapshot.last_trade.price is not None:
                    data[snapshot.ticker] = float(snapshot.last_trade.price)
    except Exception as e:
        pass
    return data


def run_benchmark():
    tickers = [f"TICKER_{i}" for i in range(50)]

    with patch.object(RESTClient, '_get') as mock_get:
        # Mock old way
        def side_effect_old(*args, **kwargs):
            time.sleep(0.01)  # Simulated latency
            ticker_symbol = kwargs.get('path', '').split('/')[-1]
            return LastTrade(price=100.0)

        mock_get.side_effect = side_effect_old

        client = RESTClient("fake_key")

        start = time.time()
        res_old = get_prices_old_way(client, tickers)
        end = time.time()
        time_old = end - start

        # Mock new way
        def side_effect_new(*args, **kwargs):
            time.sleep(0.01)  # Simulated latency
            snapshots = []
            for t in tickers:
                last_trade = LastTrade(price=100.0)
                snapshots.append(TickerSnapshot(ticker=t, last_trade=last_trade))
            return snapshots

        mock_get.side_effect = side_effect_new

        start = time.time()
        res_new = get_prices_new_way(client, tickers)
        end = time.time()
        time_new = end - start

        print(f"Results old way length: {len(res_old)}")
        print(f"Results new way length: {len(res_new)}")
        print(f"Time taken old way (50 tickers): {time_old:.4f}s")
        print(f"Time taken new way (50 tickers): {time_new:.4f}s")
        print(f"Speedup: {time_old / time_new:.2f}x")


if __name__ == "__main__":
    run_benchmark()
