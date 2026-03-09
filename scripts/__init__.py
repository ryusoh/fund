# Initialize scripts package

# Configure yfinance to use a temporary directory for timezone cache to avoid [Errno 17] in CI (GitHub Actions)
try:
    import yfinance as yf

    # We use /tmp as it is writable in most environments including GitHub Actions runners
    yf.set_tz_cache_location("/tmp/yf-cache")
except ImportError:
    pass
