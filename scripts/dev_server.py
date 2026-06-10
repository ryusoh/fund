"""Local dev server with cache-busting headers.

Usage:  python3 scripts/dev_server.py [port]   (default 8000)

Serves the repo root with Cache-Control: no-store so the browser
always fetches fresh files — no stale disk-cache surprises.
"""

import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    # ThreadingHTTPServer: browsers open parallel connections; a serial server
    # stalls them into ERR_CONNECTION_TIMED_OUT on asset-heavy pages.
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler) as srv:
        print(f"Dev server at http://127.0.0.1:{port}  (no-cache)")
        srv.serve_forever()
