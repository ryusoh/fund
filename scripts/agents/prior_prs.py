"""List recent open and closed pull requests so a routine avoids repeating them.

Wraps ``gh pr list`` and prints number, state, labels, and title. Routines read
this before starting: an open PR already claims that work, and a closed PR was
closed for a reason. Labelling closed PRs (for example ``dup``, ``wrong-lane``,
``not-worth-it``) makes this signal far stronger.

``--stats`` instead prints Jules outcome stats (accept rate per lane, close
reasons) so parked review triggers like "Jules PR reject rate becomes a real
problem" are measurable. Lane attribution is best-effort: it matches known lane
names in the head branch name, else reports ``unattributed``.

Usage::

    python3 -m scripts.agents.prior_prs --limit 40
    python3 -m scripts.agents.prior_prs --stats --limit 200
"""

from __future__ import annotations

import argparse
import json
import subprocess
from typing import Any

FIELDS = "number,title,state,labels,headRefName,author"

JULES_AUTHOR = "google-labs-jules"
KNOWN_LANES = ("architect", "bolt", "janitor", "sentinel", "testpilot", "typist")


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


def is_jules_pr(pr: dict[str, Any]) -> bool:
    """True if the PR was authored by the Jules bot."""
    author = pr.get("author")
    if not isinstance(author, dict):
        return False
    return JULES_AUTHOR in str(author.get("login", ""))


def attribute_lane(pr: dict[str, Any]) -> str:
    """Best-effort lane name from the head branch, else ``unattributed``."""
    branch = str(pr.get("headRefName", "")).lower()
    for lane in KNOWN_LANES:
        if lane in branch:
            return lane
    return "unattributed"


def compute_stats(prs: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate Jules PR outcomes per lane.

    Accept rate counts decided PRs only: ``merged / (merged + closed)``;
    still-open PRs are reported but excluded from the rate.
    """
    lanes: dict[str, dict[str, Any]] = {}
    for pr in prs:
        if not is_jules_pr(pr):
            continue
        lane = attribute_lane(pr)
        bucket = lanes.setdefault(lane, {"open": 0, "merged": 0, "closed": 0, "reasons": {}})
        state = str(pr.get("state", "")).lower()
        if state in ("open", "merged", "closed"):
            bucket[state] += 1
        if state == "closed":
            for name in _label_names(pr).split(","):
                if name.startswith("close:"):
                    reasons: dict[str, int] = bucket["reasons"]
                    reasons[name] = reasons.get(name, 0) + 1
    total: dict[str, Any] = {"open": 0, "merged": 0, "closed": 0, "reasons": {}}
    for bucket in lanes.values():
        for key in ("open", "merged", "closed"):
            total[key] += bucket[key]
        for name, count in bucket["reasons"].items():
            total["reasons"][name] = total["reasons"].get(name, 0) + count
    return {"lanes": lanes, "total": total}


def _accept_rate(bucket: dict[str, Any]) -> str:
    decided = bucket["merged"] + bucket["closed"]
    if decided == 0:
        return "  n/a"
    return f"{100 * bucket['merged'] / decided:5.0f}%"


def format_stats(stats: dict[str, Any]) -> str:
    """Render per-lane outcome stats: counts, accept rate, close reasons."""
    lines = [f"{'lane':<14}{'open':>5}{'merged':>7}{'closed':>7}  accept"]
    for lane in sorted(
        stats["lanes"],
        key=lambda k: -sum(stats["lanes"][k][k2] for k2 in ("open", "merged", "closed")),
    ):
        bucket = stats["lanes"][lane]
        lines.append(
            f"{lane:<14}{bucket['open']:>5}{bucket['merged']:>7}{bucket['closed']:>7}  {_accept_rate(bucket)}"
        )
    total = stats["total"]
    lines.append(
        f"{'TOTAL':<14}{total['open']:>5}{total['merged']:>7}{total['closed']:>7}  {_accept_rate(total)}"
    )
    if total["reasons"]:
        lines.append(
            "close reasons: " + ", ".join(f"{k}={v}" for k, v in sorted(total["reasons"].items()))
        )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="List recent PRs to avoid repeat work.")
    parser.add_argument("--limit", type=int, default=40, help="How many recent PRs to list.")
    parser.add_argument(
        "--stats",
        action="store_true",
        help="Print Jules per-lane outcome stats instead of the PR list.",
    )
    args = parser.parse_args(argv)

    try:
        prs = fetch_prs(args.limit)
    except FileNotFoundError:
        parser.error("gh CLI not found; install the GitHub CLI to list prior PRs.")
    except subprocess.CalledProcessError as exc:
        parser.error(f"gh pr list failed: {(exc.stderr or '').strip()}")

    if args.stats:
        print(format_stats(compute_stats(prs)))
    else:
        print(format_prs(prs))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
