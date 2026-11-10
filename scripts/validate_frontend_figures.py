"""Structural validation and semantic comparison for frontend figure JSON.

Validates exactly the three derived figure files (composition.json,
sectors.json, marketcap.json) that the Pages deployment generates, and
compares a freshly generated payload against a committed baseline with
float round-off tolerance. Standard library only.
"""

import argparse
import json
import math
import re
import sys
from pathlib import Path

FIGURE_FILENAMES = ('composition.json', 'sectors.json', 'marketcap.json')

ISO_DATE_REGEX = re.compile(r'^\d{4}-\d{2}-\d{2}$')

REL_TOL = 1e-12
ABS_TOL = 1e-12


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _require_number(value, filename, path):
    if not _is_number(value):
        raise ValueError(f"{filename}: {path} is not a number: {value!r}")
    if not math.isfinite(value):
        raise ValueError(f"{filename}: {path} is not finite: {value!r}")


def validate_figure(payload, filename='figure.json'):
    """Validate one figure payload. Returns the payload; raises ValueError."""
    if not isinstance(payload, dict):
        raise ValueError(f"{filename}: top level must be an object")

    dates = payload.get('dates')
    if not isinstance(dates, list) or not dates:
        raise ValueError(f"{filename}: 'dates' must be a non-empty array")
    previous = None
    for index, date in enumerate(dates):
        if not isinstance(date, str) or not ISO_DATE_REGEX.match(date):
            raise ValueError(f"{filename}: dates[{index}] is not an ISO date string: {date!r}")
        if previous is not None and date < previous:
            raise ValueError(f"{filename}: dates[{index}] is out of order: {date!r} < {previous!r}")
        previous = date

    totals = payload.get('total_values')
    if not isinstance(totals, list):
        raise ValueError(f"{filename}: 'total_values' must be an array")
    if len(totals) != len(dates):
        raise ValueError(
            f"{filename}: 'total_values' length {len(totals)} != dates length {len(dates)}"
        )
    for index, value in enumerate(totals):
        _require_number(value, filename, f'total_values[{index}]')

    series = payload.get('series')
    if not isinstance(series, dict):
        raise ValueError(f"{filename}: 'series' must be an object")
    for name, values in series.items():
        if not isinstance(values, list):
            raise ValueError(f"{filename}: series['{name}'] must be an array")
        if len(values) != len(dates):
            raise ValueError(
                f"{filename}: series['{name}'] length {len(values)} != dates length {len(dates)}"
            )
        for index, value in enumerate(values):
            _require_number(value, filename, f"series['{name}'][{index}]")

    return payload


def compare_figures(expected, actual, path=''):
    """Compare two figure payloads. Returns None; raises ValueError on mismatch.

    Keys, list lengths, dates, strings, and booleans compare exactly;
    ints/floats compare within float round-off tolerance.
    """
    if isinstance(expected, bool) or isinstance(actual, bool):
        if type(expected) is not type(actual) or expected != actual:
            raise ValueError(f"mismatch at {path or '<root>'}: {expected!r} != {actual!r}")
        return None

    if _is_number(expected) and _is_number(actual):
        if not math.isclose(expected, actual, rel_tol=REL_TOL, abs_tol=ABS_TOL):
            raise ValueError(f"mismatch at {path or '<root>'}: {expected!r} != {actual!r}")
        return None

    if type(expected) is not type(actual):
        raise ValueError(f"mismatch at {path or '<root>'}: {expected!r} != {actual!r}")

    if isinstance(expected, dict):
        if set(expected) != set(actual):
            missing = sorted(set(expected) - set(actual))
            extra = sorted(set(actual) - set(expected))
            raise ValueError(
                f"mismatch at {path or '<root>'}: missing keys {missing}, extra keys {extra}"
            )
        for key in sorted(expected):
            compare_figures(expected[key], actual[key], f"{path}.{key}" if path else str(key))
        return None

    if isinstance(expected, list):
        if len(expected) != len(actual):
            raise ValueError(
                f"mismatch at {path or '<root>'}: length {len(expected)} != {len(actual)}"
            )
        for index, (left, right) in enumerate(zip(expected, actual, strict=False)):
            child = f"{path}[{index}]" if path else f"[{index}]"
            compare_figures(left, right, child)
        return None

    if expected != actual:
        raise ValueError(f"mismatch at {path or '<root>'}: {expected!r} != {actual!r}")
    return None


def validate_figure_directory(figure_dir):
    """Validate all three figure files in a directory. Returns a list of errors."""
    figure_dir = Path(figure_dir)
    errors = []
    for filename in FIGURE_FILENAMES:
        path = figure_dir / filename
        try:
            payload = json.loads(path.read_text(encoding='utf-8'))
            validate_figure(payload, filename)
        except (OSError, ValueError) as exc:
            errors.append(str(exc))
    return errors


def main(argv=None):
    parser = argparse.ArgumentParser(
        description='Structurally validate the three derived frontend figure JSON files.'
    )
    parser.add_argument('figure_dir', help='directory containing the figure JSON files')
    args = parser.parse_args(argv)

    errors = validate_figure_directory(args.figure_dir)
    if errors:
        for error in errors:
            print(f'ERROR: {error}', file=sys.stderr)
        return 1
    print(f"All {len(FIGURE_FILENAMES)} figure files are valid: {args.figure_dir}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
