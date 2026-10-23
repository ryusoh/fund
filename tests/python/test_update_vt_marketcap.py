import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

# Add scripts directory to path to import update_vt_marketcap
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))
import scripts.update_vt_marketcap as update_vt_marketcap

ETFRC_PAGE = """
<table><tbody>
<tr><td>Number of holdings</td><td align="right">10094</td></tr>
<tr><td>Herfindahl-Hirschman Index <i class="pe pe-7s-help1"></i></td><td align="right">78</td></tr>
<tr><td>Wgt avg mkt cap (mns)</td><td align="right">$1,009,676</td></tr>
<tr><td>Large cap (&gt;$10bn)</td><td align="right">86.9%</td></tr>
<tr><td>Mid cap ($2-10bn)</td><td align="right">7.1%</td></tr>
<tr><td>Small cap (&lt;$2bn)</td><td align="right">1.1%</td></tr>
</tbody></table>
"""

EXISTING = {
    'VT': {
        'Mega Cap': 52,
        'Large Cap': 32,
        'Mid Cap': 11,
        'Small Cap': 4,
        'Bond': 0,
        'Commodity': 0,
        'Real Estate': 0,
        'Cash/Other': 1,
    }
}


class TestFetchVTCapBands(unittest.TestCase):
    @patch('scripts.update_vt_marketcap._fetch')
    def test_parse_success(self, mock_fetch):
        mock_fetch.return_value = ETFRC_PAGE
        bands = update_vt_marketcap.fetch_vt_cap_bands()
        self.assertEqual(bands, {'large': 86.9, 'mid': 7.1, 'small': 1.1})

    @patch('scripts.update_vt_marketcap._fetch')
    def test_fetch_failure(self, mock_fetch):
        mock_fetch.return_value = None
        self.assertIsNone(update_vt_marketcap.fetch_vt_cap_bands())

    @patch('scripts.update_vt_marketcap._fetch')
    def test_missing_band(self, mock_fetch):
        mock_fetch.return_value = '<tr><td>Large cap (&gt;$10bn)</td><td>86.9%</td></tr>'
        self.assertIsNone(update_vt_marketcap.fetch_vt_cap_bands())

    @patch('scripts.update_vt_marketcap._fetch')
    def test_sanity_bounds(self, mock_fetch):
        page = ETFRC_PAGE.replace('86.9%', '30.0%')
        mock_fetch.return_value = page
        self.assertIsNone(update_vt_marketcap.fetch_vt_cap_bands())


class TestBuildBreakdown(unittest.TestCase):
    def test_split_and_cash(self):
        bands = {'large': 86.9, 'mid': 7.1, 'small': 1.1}
        result = update_vt_marketcap.build_breakdown(bands, 52 / 84)
        self.assertEqual(result['Mega Cap'], 54)
        self.assertEqual(result['Large Cap'], 33)
        self.assertEqual(result['Mid Cap'], 7)
        self.assertEqual(result['Small Cap'], 1)
        self.assertEqual(result['Cash/Other'], 5)
        self.assertEqual(result['Bond'], 0)
        total = sum(result[c] for c in update_vt_marketcap.CATEGORIES)
        self.assertEqual(total, 100)

    def test_mega_ratio_from_existing(self):
        self.assertAlmostEqual(update_vt_marketcap.mega_ratio(EXISTING), 52 / 84)

    def test_mega_ratio_default(self):
        self.assertEqual(update_vt_marketcap.mega_ratio({}), 0.62)
        self.assertEqual(update_vt_marketcap.mega_ratio({'VT': {'Mega Cap': 'x'}}), 0.62)

    def test_breakdown_changed(self):
        new = update_vt_marketcap.build_breakdown({'large': 86.9, 'mid': 7.1, 'small': 1.1}, 0.62)
        self.assertTrue(update_vt_marketcap.breakdown_changed(EXISTING, new))
        same = dict(EXISTING['VT'], **{'_comment': 'different metadata'})
        self.assertFalse(update_vt_marketcap.breakdown_changed({'VT': same}, EXISTING['VT']))


class TestMain:
    @patch('scripts.update_vt_marketcap.fetch_vt_cap_bands')
    def test_main_fetch_failure_exits_1(self, mock_bands):
        mock_bands.return_value = None
        assert update_vt_marketcap.main() == 1

    @patch('scripts.update_vt_marketcap.fetch_vt_cap_bands')
    def test_main_unchanged_no_write(self, mock_bands, tmp_path):
        out = tmp_path / 'fund_marketcap_breakdown.json'
        # Bands that reproduce EXISTING exactly: 84 * 52/84 -> Mega 52, Large 32
        bands = {'large': 84.0, 'mid': 11.0, 'small': 4.0}
        out.write_text(json.dumps(EXISTING))
        mock_bands.return_value = bands
        with patch('scripts.update_vt_marketcap.BREAKDOWN_PATH', out):
            assert update_vt_marketcap.main() == 0
        # No write: no metadata stamp added
        assert '_last_updated' not in json.loads(out.read_text())['VT']

    @patch('scripts.update_vt_marketcap.fetch_vt_cap_bands')
    def test_main_changed_writes(self, mock_bands, tmp_path):
        out = tmp_path / 'fund_marketcap_breakdown.json'
        out.write_text(json.dumps(EXISTING))
        mock_bands.return_value = {'large': 86.9, 'mid': 7.1, 'small': 1.1}
        with patch('scripts.update_vt_marketcap.BREAKDOWN_PATH', out):
            assert update_vt_marketcap.main() == 0
        vt = json.loads(out.read_text())['VT']
        assert vt['Mid Cap'] == 7
        assert '_last_updated' in vt


if __name__ == '__main__':
    unittest.main()
