"""Regenerate the three derived frontend figures and verify them before deploy.

Runs the composition/sectors generator and then the marketcap generator in
subprocesses rooted at the project tree, validates every output
structurally, and — when the three figures are still committed to the
repository — compares each regenerated payload against its committed
baseline with float round-off tolerance. Any failure propagates so the
deploy step stops before publishing.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

from validate_frontend_figures import (
    FIGURE_FILENAMES,
    compare_figures,
    validate_figure,
)

SCRIPT_DIR = Path(__file__).resolve().parent
GENERATOR_SCRIPTS = (
    'generate_composition_data.py',
    'generate_marketcap_from_composition.py',
)


def generate_deploy_figures(root=Path('.')):
    """Regenerate and validate the figure family under root.

    All three committed figures present -> baseline-comparison mode; none
    present -> clean-generation mode; a partial set raises ValueError before
    any generator runs. Returns the regenerated payloads by filename.
    """
    root = Path(root)
    figures_dir = root / 'data' / 'output' / 'figures'

    baselines = {}
    for filename in FIGURE_FILENAMES:
        path = figures_dir / filename
        if path.exists():
            baselines[filename] = json.loads(path.read_text(encoding='utf-8'))
    if baselines and len(baselines) != len(FIGURE_FILENAMES):
        missing = sorted(set(FIGURE_FILENAMES) - set(baselines))
        raise ValueError(f'partial committed figures in {figures_dir}: missing {missing}')

    for script in GENERATOR_SCRIPTS:
        subprocess.run([sys.executable, str(SCRIPT_DIR / script)], cwd=root, check=True)

    regenerated = {}
    for filename in FIGURE_FILENAMES:
        payload = json.loads((figures_dir / filename).read_text(encoding='utf-8'))
        validate_figure(payload, filename)
        regenerated[filename] = payload

    if len(baselines) == len(FIGURE_FILENAMES):
        for filename in FIGURE_FILENAMES:
            compare_figures(baselines[filename], regenerated[filename], path=filename)

    return regenerated


def main(argv=None):
    parser = argparse.ArgumentParser(
        description='Regenerate the derived frontend figures and validate them before deploy.'
    )
    parser.add_argument('root', nargs='?', default='.', help='project root to generate in')
    args = parser.parse_args(argv)

    generate_deploy_figures(root=Path(args.root))
    print('All figure files regenerated and validated.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
