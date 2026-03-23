# Initialize scripts package

# Configure yfinance to use a temporary directory for timezone cache to avoid [Errno 17] in CI (GitHub Actions)
try:
    import atexit
    import shutil
    import tempfile

    import yfinance as yf

    # Use a secure temporary directory
    _yf_cache_dir = tempfile.mkdtemp(prefix="yf-cache-")
    yf.set_tz_cache_location(_yf_cache_dir)
    atexit.register(shutil.rmtree, _yf_cache_dir, ignore_errors=True)
except ImportError:
    pass
