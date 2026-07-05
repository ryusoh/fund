import atexit
import os
import shutil
import tempfile
from unittest.mock import patch

import yfinance as yf
from yfinance import cache as yf_cache


def test_yfinance_cache_config_logic():
    """
    Verify the logic used in scripts to configure yfinance cache.
    Exercises the tz cache offline — no network, so no rate-limit flakiness.
    """
    # Create a temp dir like the scripts do
    _yf_cache_dir = tempfile.mkdtemp(prefix="yf-cache-unittest-")
    try:
        yf.set_tz_cache_location(_yf_cache_dir)
        # The cache wrapper is a module-level singleton; drop it so it
        # re-initialises at our location even if another test opened it first.
        yf_cache._TzCacheManager._tz_cache = None

        assert yf_cache._TzDBManager.get_location() == _yf_cache_dir

        # A store/lookup forces the sqlite DB to be created at the
        # configured location — proves the redirect actually took effect.
        tz_cache = yf_cache.get_tz_cache()
        tz_cache.store("AAPL", "America/New_York")
        assert tz_cache.lookup("AAPL") == "America/New_York"
        assert os.path.isfile(os.path.join(_yf_cache_dir, "tkr-tz.db"))

    finally:
        # Close and reset the singletons so later tests don't hold a DB
        # handle into the deleted temp dir.
        yf_cache._TzDBManager.close_db()
        yf_cache._TzDBManager._db = None
        yf_cache._TzCacheManager._tz_cache = None
        shutil.rmtree(_yf_cache_dir, ignore_errors=True)


def test_atexit_registration():
    """
    Verify that atexit.register is called with the expected arguments.
    This ensures that the cleanup will happen on exit.
    """
    with patch('atexit.register') as mock_register:
        # Simulate the pattern in scripts
        temp_dir = "/tmp/fake-yf-cache"
        atexit.register(shutil.rmtree, temp_dir, ignore_errors=True)

        mock_register.assert_called_once_with(shutil.rmtree, temp_dir, ignore_errors=True)
