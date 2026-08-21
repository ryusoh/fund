"""Verify the Content-Security-Policy stays identical across all its copies.

The CSP is duplicated in the ``<meta http-equiv>`` tag of each main page and in
the Cloudflare ``_headers`` file. Both layers are enforced simultaneously (the
browser intersects meta and HTTP-header policies), so a change applied to only
one copy silently keeps the old restriction live — e.g. a ``blob:`` URL allowed
in the meta tags is still blocked by the ``_headers`` policy on the deployed
site (this exact drift once killed the liquid-glass refraction lens).

``performance/index.html`` intentionally has no meta copy — it is a minimal
embed page and is covered by ``_headers`` on deploy.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

META_CSP_PATTERN = re.compile(
    r'http-equiv="Content-Security-Policy"\s+content="([^"]+)"', re.IGNORECASE | re.DOTALL
)
HEADERS_CSP_PATTERN = re.compile(r"^\s*Content-Security-Policy:\s*(.+?)\s*$", re.MULTILINE)


def _normalize(policy: str) -> str:
    return re.sub(r"\s+", " ", policy).strip()


def _meta_csps() -> dict[Path, str]:
    policies = {}
    for html in sorted(REPO_ROOT.glob("*/index.html")) + [REPO_ROOT / "index.html"]:
        match = META_CSP_PATTERN.search(html.read_text(encoding="utf-8"))
        if match:
            policies[html] = _normalize(match.group(1))
    return policies


def test_csp_meta_tags_match_headers_file() -> None:
    headers_text = (REPO_ROOT / "_headers").read_text(encoding="utf-8")
    match = HEADERS_CSP_PATTERN.search(headers_text)
    assert match, "_headers has no Content-Security-Policy entry"
    canonical = _normalize(match.group(1))

    meta_csps = _meta_csps()
    assert meta_csps, "no page CSP meta tags found — the meta copies were all lost"
    drifted = [
        str(path.relative_to(REPO_ROOT))
        for path, policy in meta_csps.items()
        if policy != canonical
    ]
    assert not drifted, (
        "CSP drift between _headers and page meta tags "
        "(both are enforced at once — update every copy): "
        f"{drifted}"
    )
