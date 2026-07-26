"""Check a mutation-testing score against the ratchet floor in mutation-ratchet.json.

Part of the diff-scoped mutation-testing setup (docs/agentic-quality-gates.md
section 2): the weekly scheduled workflow runs Stryker/mutmut incrementally,
extracts the score with this script, and compares it against the committed
floor ("don't get worse"). A null floor means report-only — seed it once real
scheduled runs exist (`make mutate-ratchet-update`).

Usage:
    venv/bin/python scripts/check_mutation_ratchet.py mutmut \
        --score-file mutants/mutmut-cicd-stats.json
    venv/bin/python scripts/check_mutation_ratchet.py stryker \
        --score-file reports/mutation/mutation.json
    venv/bin/python scripts/check_mutation_ratchet.py mutmut \
        --score-file mutants/mutmut-cicd-stats.json --update
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path
from typing import Callable, Optional

RATCHET_PATH = Path(__file__).resolve().parent.parent / 'mutation-ratchet.json'


def _score_mutmut(score_file: Path) -> Optional[float]:
    """Score from `mutmut export-cicd-stats` output: killed / (killed + survived)."""
    data = json.loads(score_file.read_text(encoding='utf-8'))
    killed = int(data['killed'])
    decisive = killed + int(data['survived'])
    if decisive == 0:
        return None
    return 100.0 * killed / decisive


def _score_stryker(score_file: Path) -> Optional[float]:
    """Score from Stryker's JSON report (mutation-testing-report schema v2).

    The report has no aggregate metrics — per file it lists `mutants` with a
    `status`. Detected = Killed + Timeout; undetected = Survived + NoCoverage
    (Ignored / CompileError / RuntimeError are excluded), matching Stryker's
    own mutation-score formula.
    """
    data = json.loads(score_file.read_text(encoding='utf-8'))
    detected = undetected = 0
    for file_result in data.get('files', {}).values():
        for mutant in file_result.get('mutants', []):
            status = mutant.get('status')
            if status in ('Killed', 'Timeout'):
                detected += 1
            elif status in ('Survived', 'NoCoverage'):
                undetected += 1
    if detected + undetected == 0:
        return None
    return 100.0 * detected / (detected + undetected)


EXTRACTORS: dict[str, Callable[[Path], Optional[float]]] = {
    'mutmut': _score_mutmut,
    'stryker': _score_stryker,
}


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    parser.add_argument('tool', choices=sorted(EXTRACTORS))
    parser.add_argument('--score-file', type=Path, required=True)
    parser.add_argument('--ratchet', type=Path, default=RATCHET_PATH)
    parser.add_argument(
        '--update',
        action='store_true',
        help='Ratchet the floor UP to the measured score (never lowers it).',
    )
    args = parser.parse_args(argv)

    score = EXTRACTORS[args.tool](args.score_file)
    if score is None:
        print(f'{args.tool}: no decisive mutants in {args.score_file}; nothing to check.')
        return 0

    ratchet = json.loads(args.ratchet.read_text(encoding='utf-8'))
    entry = ratchet.setdefault(args.tool, {})
    floor = entry.get('floor')

    if args.update:
        if floor is None or score > floor:
            entry['floor'] = round(score, 2)
            entry['updated'] = date.today().isoformat()
            args.ratchet.write_text(json.dumps(ratchet, indent=4) + '\n', encoding='utf-8')
            print(f'{args.tool}: floor ratcheted up to {entry["floor"]} (was {floor}).')
        else:
            print(f'{args.tool}: measured {score:.2f} <= floor {floor}; floor unchanged.')
        return 0

    print(f'{args.tool}: mutation score {score:.2f} (floor: {floor}).')
    if floor is None:
        print(f'{args.tool}: no floor set — report only. Seed with --update.')
        return 0
    if score < floor:
        print(f'{args.tool}: REGRESSION — score {score:.2f} below floor {floor}.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
