import unittest
from unittest.mock import patch, MagicMock
from pathlib import Path
import sys

# Add scripts directory to path to import create_icons
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))
import scripts.create_icons as create_icons

class TestCreateIcons(unittest.TestCase):

    @patch('scripts.create_icons.Path.exists')
    def test_generate_icons_from_source_not_exists(self, mock_exists):
        mock_exists.return_value = False
        result = create_icons.generate_icons_from_source()
        self.assertFalse(result)

    @patch('scripts.create_icons.Image')
    @patch('scripts.create_icons.Path.mkdir')
    @patch('scripts.create_icons.Path.exists')
    def test_generate_icons_from_source_exists(self, mock_exists, mock_mkdir, mock_image):
        mock_exists.return_value = True
        mock_original_img = MagicMock()
        mock_original_img.size = (1024, 1024)
        mock_resized_img = MagicMock()
        mock_original_img.resize.return_value = mock_resized_img
        mock_image.open.return_value = mock_original_img

        result = create_icons.generate_icons_from_source()

        self.assertTrue(result)
        mock_mkdir.assert_called_once_with(parents=True, exist_ok=True)
        self.assertEqual(mock_original_img.resize.call_count, 4)
        self.assertEqual(mock_resized_img.save.call_count, 4)

if __name__ == '__main__':
    unittest.main()
