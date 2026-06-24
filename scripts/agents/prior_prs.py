"""List recent open and closed pull requests so a routine avoids repeating them.

Wraps ``gh pr list`` and prints number, state, labels, and title. Routines read
this before starting: an open PR already claims that work, and a closed PR was
closed for a reason. Labelling closed PRs (for example ``dup``, ``wrong-lane``,
``not-worth-it``) makes this signal far stronger.

Usage::

    python3 -m scripts.agents.prior_prs --limit 40
"""

from __future__ import annotations

import argparse
import json
import subprocess
from typing import Any

FIELDS = "number,title,state,labels,headRefName"


def fetch_prs(limit: int) -> list[dict[str, Any]]:
    """Return recent PRs (all states) via the GitHub CLI."""
    result = subprocess.run(
        ["gh", "pr", "list", "--state", "all", "--limit", str(limit), "--json", FIELDS],
        capture_output=True,
        text=True,
        check=True,
    )
    data: Any = json.loads(result.stdout or "[]")
    if not isinstance(data, list):
        return []
    out: list[dict[str, Any]] = [item for item in data if isinstance(item, dict)]
    return out


def _label_names(pr: dict[str, Any]) -> str:
    labels = pr.get("labels")
    names: list[str] = []
    if isinstance(labels, list):
        for label in labels:
            if isinstance(label, dict):
                name = label.get("name")
                if isinstance(name, str):
                    names.append(name)
    return ",".join(names)


def format_prs(prs: list[dict[str, Any]]) -> str:
    """Render PRs as one compact line each: ``#N  state  title  [labels]``."""
    lines: list[str] = []
    for pr in prs:
        number = pr.get("number", "?")
        state = str(pr.get("state", "")).lower()
        title = str(pr.get("title", ""))
        labels = _label_names(pr)
        suffix = f"  [{labels}]" if labels else ""
        lines.append(f"#{number} {state:>6}  {title}{suffix}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="List recent PRs to avoid repeat work.")
    parser.add_argument("--limit", type=int, default=40, help="How many recent PRs to list.")
    args = parser.parse_args(argv)

    try:
        prs = fetch_prs(args.limit)
    except FileNotFoundError:
        parser.error("gh CLI not found; install the GitHub CLI to list prior PRs.")
    except subprocess.CalledProcessError as exc:
        parser.error(f"gh pr list failed: {(exc.stderr or '').strip()}")

    print(format_prs(prs))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
