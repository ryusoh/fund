import sys
import unittest
from unittest.mock import MagicMock, patch


class TestCreateIcons(unittest.TestCase):

    def setUp(self):
        # Clear module cache to ensure fresh imports
        if 'scripts.create_icons' in sys.modules:
            del sys.modules['scripts.create_icons']

    @patch('pathlib.Path.exists')
    def test_generate_icons_from_source_not_exists(self, mock_exists):
        mock_exists.return_value = False

        # Create a mock PIL module
        mock_pil = MagicMock()
        mock_pil.Image = MagicMock()

        with patch.dict(sys.modules, {'PIL': mock_pil, 'PIL.Image': mock_pil.Image}):
            import scripts.create_icons as create_icons

            result = create_icons.generate_icons_from_source()

            self.assertFalse(result)

    @patch('pathlib.Path.mkdir')
    @patch('pathlib.Path.exists')
    def test_generate_icons_from_source_exists(self, mock_exists, mock_mkdir):
        mock_exists.return_value = True
        mock_original_img = MagicMock()
        mock_original_img.size = (1024, 1024)
        mock_resized_img = MagicMock()
        mock_original_img.resize.return_value = mock_resized_img

        # Create a mock PIL module
        mock_pil = MagicMock()
        mock_image = MagicMock()
        mock_image.open.return_value = mock_original_img
        mock_pil.Image = mock_image
        mock_pil.Image.Resampling = MagicMock()
        mock_pil.Image.Resampling.LANCZOS = MagicMock()

        with patch.dict(sys.modules, {'PIL': mock_pil, 'PIL.Image': mock_image}):
            import scripts.create_icons as create_icons

            result = create_icons.generate_icons_from_source()

            self.assertTrue(result)
            mock_mkdir.assert_called_once_with(parents=True, exist_ok=True)
            self.assertEqual(mock_original_img.resize.call_count, 4)
            self.assertEqual(mock_resized_img.save.call_count, 4)


if __name__ == '__main__':
    unittest.main()
