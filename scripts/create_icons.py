#!/usr/bin/env python3
"""
Create PWA icons from existing avatar image
Resize and optimize the existing icon for different sizes
"""

from pathlib import Path
from PIL import Image


def generate_icons_from_source():
    """Create different sized icons using the local source image."""
    repo_root = Path(__file__).resolve().parents[1]
    source_path = repo_root / "assets" / "icons" / "icon-src.png"

    if not source_path.exists():
        print(f"❌ Source icon not found at {source_path}")
        return False

    print(f"Using local source icon: {source_path}")
    original_img = Image.open(source_path)
    print(f"Original image size: {original_img.size}")

    # Create assets directory if it doesn't exist
    assets_dir = repo_root / "assets" / "icons"
    assets_dir.mkdir(parents=True, exist_ok=True)

    # Create different sizes
    sizes = [152, 180, 192, 512]

    for size in sizes:
        print(f"Creating {size}x{size} icon...")

        # Resize with high quality
        resized_img = original_img.resize((size, size), Image.Resampling.LANCZOS)

        # Save the resized image
        filename = assets_dir / f"icon-{size}.png"
        resized_img.save(filename, "PNG", optimize=True)
        print(f"Saved {filename}")

    print("\n✅ All icons created successfully!")
    print("Local source ensures consistent branding without CDN lag.")
    return True


if __name__ == "__main__":
    generate_icons_from_source()
