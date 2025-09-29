#!/usr/bin/env python3
"""
Create PWA icons from existing avatar image
Resize and optimize the existing icon for different sizes
"""

from PIL import Image
import requests
import os
from io import BytesIO


def download_and_resize_icon():
    """Download the existing avatar and create different sizes"""
    # URL of the existing avatar
    avatar_url = "https://cdn.jsdelivr.net/gh/ryusoh/host@master/brand/avatars/avatar_152x152.png"

    print("Downloading existing avatar...")
    try:
        response = requests.get(avatar_url)
        response.raise_for_status()

        # Open the image
        original_img = Image.open(BytesIO(response.content))
        print(f"Original image size: {original_img.size}")

        # Create assets directory if it doesn't exist
        os.makedirs('assets', exist_ok=True)

        # Create different sizes
        sizes = [152, 180, 192, 512]

        for size in sizes:
            print(f"Creating {size}x{size} icon...")

            # Resize with high quality
            resized_img = original_img.resize((size, size), Image.Resampling.LANCZOS)

            # Save the resized image
            filename = f'assets/icon-{size}.png'
            resized_img.save(filename, 'PNG', optimize=True)
            print(f"Saved {filename}")

        print("\n✅ All icons created successfully!")
        print("Using your existing avatar design for consistency")

    except Exception as e:
        print(f"Error downloading or processing image: {e}")
        return False

    return True


if __name__ == "__main__":
    download_and_resize_icon()
