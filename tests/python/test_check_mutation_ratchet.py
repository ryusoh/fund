"""Tests for scripts/check_mutation_ratchet.py (mutation score floor, §2)."""

import json

import pytest

from scripts.check_mutation_ratchet import main


@pytest.fixture()
def ratchet_file(tmp_path):
    path = tmp_path / 'mutation-ratchet.json'
    path.write_text(json.dumps({'mutmut': {'floor': None}, 'stryker': {'floor': None}}))
    return path


def _write_json(tmp_path, name, data):
    path = tmp_path / name
    path.write_text(json.dumps(data))
    return path


def test_mutmut_score_above_floor_passes(tmp_path, ratchet_file, capsys):
    ratchet_file.write_text(json.dumps({'mutmut': {'floor': 90.0}}))
    score_file = _write_json(tmp_path, 'cicd.json', {'killed': 19, 'survived': 1})
    assert main(['mutmut', '--score-file', str(score_file), '--ratchet', str(ratchet_file)]) == 0
    assert '95.00' in capsys.readouterr().out


def test_mutmut_score_below_floor_fails(tmp_path, ratchet_file, capsys):
    ratchet_file.write_text(json.dumps({'mutmut': {'floor': 96.0}}))
    score_file = _write_json(tmp_path, 'cicd.json', {'killed': 19, 'survived': 1})
    assert main(['mutmut', '--score-file', str(score_file), '--ratchet', str(ratchet_file)]) == 1
    assert 'REGRESSION' in capsys.readouterr().err


def test_null_floor_reports_without_failing(tmp_path, ratchet_file, capsys):
    score_file = _write_json(tmp_path, 'cicd.json', {'killed': 5, 'survived': 5})
    assert main(['mutmut', '--score-file', str(score_file), '--ratchet', str(ratchet_file)]) == 0
    assert 'no floor set' in capsys.readouterr().out


def test_no_decisive_mutants_skips_check(tmp_path, ratchet_file, capsys):
    score_file = _write_json(tmp_path, 'cicd.json', {'killed': 0, 'survived': 0})
    assert main(['mutmut', '--score-file', str(score_file), '--ratchet', str(ratchet_file)]) == 0
    assert 'no decisive mutants' in capsys.readouterr().out


def _stryker_report(*statuses):
    return {'files': {'a.js': {'mutants': [{'status': s} for s in statuses]}}}


def test_stryker_score_from_mutant_statuses(tmp_path, ratchet_file, capsys):
    ratchet_file.write_text(json.dumps({'stryker': {'floor': 80.0}}))
    report = _stryker_report(*(['Killed'] * 43 + ['Timeout'] * 14 + ['Survived'] * 5))
    score_file = _write_json(tmp_path, 'mutation.json', report)
    assert main(['stryker', '--score-file', str(score_file), '--ratchet', str(ratchet_file)]) == 0
    assert '91.94' in capsys.readouterr().out


def test_stryker_below_floor_fails(tmp_path, ratchet_file):
    ratchet_file.write_text(json.dumps({'stryker': {'floor': 90.0}}))
    report = {
        'files': {
            'a.js': {'mutants': [{'status': 'Killed'}] * 6 + [{'status': 'Survived'}] * 2},
            'b.js': {'mutants': [{'status': 'Killed'}, {'status': 'NoCoverage'}]},
        }
    }
    score_file = _write_json(tmp_path, 'mutation.json', report)
    # 7 detected of 10 decisive = 70.00 < 90
    assert main(['stryker', '--score-file', str(score_file), '--ratchet', str(ratchet_file)]) == 1


def test_stryker_no_decisive_mutants_skips_check(tmp_path, ratchet_file, capsys):
    score_file = _write_json(tmp_path, 'mutation.json', _stryker_report('Ignored', 'CompileError'))
    assert main(['stryker', '--score-file', str(score_file), '--ratchet', str(ratchet_file)]) == 0
    assert 'no decisive mutants' in capsys.readouterr().out


def test_update_ratchets_floor_up(tmp_path, ratchet_file):
    score_file = _write_json(tmp_path, 'cicd.json', {'killed': 19, 'survived': 1})
    rc = main(
        ['mutmut', '--score-file', str(score_file), '--ratchet', str(ratchet_file), '--update']
    )
    assert rc == 0
    entry = json.loads(ratchet_file.read_text())['mutmut']
    assert entry['floor'] == 95.0
    assert entry['updated']


def test_update_never_lowers_floor(tmp_path, ratchet_file):
    ratchet_file.write_text(json.dumps({'mutmut': {'floor': 97.5, 'updated': '2026-01-01'}}))
    score_file = _write_json(tmp_path, 'cicd.json', {'killed': 19, 'survived': 1})
    rc = main(
        ['mutmut', '--score-file', str(score_file), '--ratchet', str(ratchet_file), '--update']
    )
    assert rc == 0
    entry = json.loads(ratchet_file.read_text())['mutmut']
    assert entry['floor'] == 97.5
    assert entry['updated'] == '2026-01-01'
