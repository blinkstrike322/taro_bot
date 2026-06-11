#!/usr/bin/env python3
"""Convert 78 tarot card PNGs to 16-bit pixel art style.

Produces a JRPG 90s aesthetic (Final Fantasy, Chrono Trigger):
- Pixelation via downscale to 64x96 (NEAREST), upscale to 256x384 (NEAREST)
- Color quantization to a custom dark/mystic palette (32 colors)
- 2px black + 1px gold pixel border
- Card back with rune/star pattern

Usage:
    python scripts/convert_cards.py [--force]
"""

import argparse
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw


# --- Custom dark/mystic palette (32 colors) ---
# Designed for a dark, occult JRPG feel: deep purples, indigos, golds,
# muted reds, dark greens, and necessary neutrals.

PALETTE_RGB = [
    # Row 1: Deep darks and blacks
    (0, 0, 0),         # 0  - pure black
    (10, 5, 20),        # 1  - void black
    (26, 10, 46),       # 2  - dark purple
    (40, 15, 60),       # 3  - deep violet
    # Row 2: Indigos and dark blues
    (22, 33, 62),       # 4  - indigo
    (15, 52, 96),       # 5  - dark blue
    (30, 60, 110),      # 6  - navy blue
    (50, 75, 130),      # 7  - steel blue
    # Row 3: Mid purples and magentas
    (70, 30, 90),       # 8  - muted purple
    (100, 40, 100),     # 9  - plum
    (139, 34, 82),      # 10 - muted red / magenta
    (160, 50, 80),      # 11 - dark rose
    # Row 4: Golds and warm accents
    (200, 168, 108),    # 12 - gold
    (180, 140, 80),     # 13 - dark gold
    (220, 190, 130),    # 14 - light gold
    (240, 210, 160),    # 15 - pale gold
    # Row 5: Dark greens and teals
    (26, 71, 42),       # 16 - dark green
    (40, 90, 60),       # 17 - forest green
    (20, 80, 80),       # 18 - dark teal
    (50, 100, 100),     # 19 - muted teal
    # Row 6: Warm darks
    (80, 40, 30),       # 20 - dark brown
    (110, 60, 40),      # 21 - warm brown
    (60, 40, 50),       # 22 - mauve shadow
    (90, 70, 80),       # 23 - dusty rose shadow
    # Row 7: Mid-tones
    (120, 100, 140),    # 24 - lavender grey
    (80, 80, 100),      # 25 - blue grey
    (140, 120, 110),    # 26 - warm grey
    (100, 90, 80),      # 27 - cool grey
    # Row 8: Lights and whites
    (224, 213, 200),    # 28 - cream
    (180, 170, 160),    # 29 - parchment
    (200, 200, 210),    # 30 - ice white
    (255, 255, 255),    # 31 - pure white
]


def build_palette_image():
    """Create a 256-color palette Image for quantize().

    First 32 entries are our custom colors; remaining are zero-filled.
    """
    pal_data = bytearray(768)  # 256 * 3
    for i, (r, g, b) in enumerate(PALETTE_RGB):
        pal_data[i * 3] = r
        pal_data[i * 3 + 1] = g
        pal_data[i * 3 + 2] = b
    # Remaining entries stay at 0,0,0 (black)
    pal_img = Image.new("P", (1, 1))
    pal_img.putpalette(pal_data)
    return pal_img


def pixelate(img, small_w=64, small_h=96, big_w=256, big_h=384):
    """Downscale then upscale using NEAREST for crisp pixel art."""
    small = img.resize((small_w, small_h), Image.Resampling.NEAREST)
    big = small.resize((big_w, big_h), Image.Resampling.NEAREST)
    return big


def quantize_to_palette(img, palette_img):
    """Reduce colors to the custom palette using Floyd-Steinberg dithering."""
    if img.mode != "RGB":
        img = img.convert("RGB")
    return img.quantize(palette=palette_img, dither=Image.Dither.FLOYDSTEINBERG)


def add_border(img, outer_px=2, inner_px=1, outer_color=(0, 0, 0), inner_color=(200, 168, 108)):
    """Draw a pixel border: outer_px black, then inner_px gold."""
    w, h = img.size
    total = outer_px + inner_px
    # Expand canvas with outer color
    bordered = Image.new("RGB", (w + total * 2, h + total * 2), outer_color)
    draw = ImageDraw.Draw(bordered)
    # Draw inner gold border strips
    ix1 = outer_px
    iy1 = outer_px
    # Top gold strip
    draw.rectangle(
        [ix1, iy1, ix1 + w + inner_px * 2 - 1, iy1 + inner_px - 1],
        fill=inner_color,
    )
    # Bottom gold strip
    draw.rectangle(
        [ix1, iy1 + inner_px + h, ix1 + w + inner_px * 2 - 1, iy1 + inner_px + h + inner_px - 1],
        fill=inner_color,
    )
    # Left gold strip
    draw.rectangle(
        [ix1, iy1, ix1 + inner_px - 1, iy1 + inner_px + h + inner_px - 1],
        fill=inner_color,
    )
    # Right gold strip
    draw.rectangle(
        [ix1 + inner_px + w, iy1, ix1 + inner_px + w + inner_px - 1, iy1 + inner_px + h + inner_px - 1],
        fill=inner_color,
    )
    # Paste the card image onto the bordered canvas
    bordered.paste(img, (total, total))
    return bordered


def create_card_back(width=256, height=384):
    """Generate a pixel art card back with rune/star patterns and gold accents."""
    img = Image.new("RGB", (width, height), (15, 8, 30))  # dark purple bg
    draw = ImageDraw.Draw(img)

    gold = (200, 168, 108)
    dark_gold = (140, 110, 60)
    indigo = (22, 33, 62)
    dark_blue = (30, 50, 90)
    purple = (50, 25, 70)
    cream = (224, 213, 200)

    # Outer decorative border
    draw.rectangle([0, 0, width - 1, height - 1], outline=(0, 0, 0))
    draw.rectangle([2, 2, width - 3, height - 3], outline=gold)
    draw.rectangle([5, 5, width - 6, height - 6], outline=dark_gold)
    draw.rectangle([7, 7, width - 8, height - 8], outline=indigo)

    # Inner border
    draw.rectangle([16, 16, width - 17, height - 17], outline=gold)
    draw.rectangle([18, 18, width - 19, height - 19], outline=dark_gold)
    draw.rectangle([20, 20, width - 21, height - 21], outline=indigo)

    # Central diamond pattern
    cx, cy = width // 2, height // 2
    diamond_size = 40
    diamond_pts = [
        (cx, cy - diamond_size),
        (cx + diamond_size, cy),
        (cx, cy + diamond_size),
        (cx - diamond_size, cy),
    ]
    draw.polygon(diamond_pts, fill=purple, outline=gold)

    # Inner diamond
    inner_d = 24
    inner_pts = [
        (cx, cy - inner_d),
        (cx + inner_d, cy),
        (cx, cy + inner_d),
        (cx - inner_d, cy),
    ]
    draw.polygon(inner_pts, fill=dark_blue, outline=gold)

    # Star/rune patterns in the four corners (inside inner border)
    corner_offset = 36
    corners = [
        (corner_offset, corner_offset),
        (width - corner_offset - 1, corner_offset),
        (corner_offset, height - corner_offset - 1),
        (width - corner_offset - 1, height - corner_offset - 1),
    ]
    for sx, sy in corners:
        # Vertical line
        draw.rectangle([sx - 1, sy - 8, sx + 1, sy + 8], fill=gold)
        # Horizontal line
        draw.rectangle([sx - 8, sy - 1, sx + 8, sy + 1], fill=gold)
        # Diagonal lines (X shape) for rune feel
        for d in range(-6, 7):
            px = sx + d
            py_top = sy - abs(d) + 3
            py_bot = sy + abs(d) - 3
            if 0 <= px < width and 0 <= py_top < height:
                draw.rectangle([px, py_top, px, py_top], fill=dark_gold)
            if 0 <= px < width and 0 <= py_bot < height:
                draw.rectangle([px, py_bot, px, py_bot], fill=dark_gold)

    # Rune marks along top and bottom edges (inside border)
    for x in range(32, width - 32, 24):
        draw.rectangle([x, 24, x + 2, 28], fill=gold)
        draw.rectangle([x + 4, 24, x + 4, 30], fill=dark_gold)
        draw.rectangle([x, height - 29, x + 2, height - 25], fill=gold)
        draw.rectangle([x + 4, height - 31, x + 4, height - 25], fill=dark_gold)

    # Rune marks along left and right edges
    for y in range(32, height - 32, 24):
        draw.rectangle([24, y, 28, y + 2], fill=gold)
        draw.rectangle([24, y + 4, 30, y + 4], fill=dark_gold)
        draw.rectangle([width - 29, y, width - 25, y + 2], fill=gold)
        draw.rectangle([width - 31, y + 4, width - 25, y + 4], fill=dark_gold)

    # Central eye/sigil symbol
    eye_w = 20
    eye_h = 10
    draw.ellipse([cx - eye_w, cy - eye_h, cx + eye_w, cy + eye_h], outline=gold, fill=indigo)
    draw.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], outline=gold, fill=purple)
    draw.rectangle([cx - 2, cy - 2, cx + 2, cy + 2], fill=cream)

    # Scattered small stars (4px cross pattern) in the field
    star_positions = [
        (50, 80), (200, 60), (80, 180), (180, 200),
        (60, 280), (190, 300), (100, 340), (160, 50),
        (40, 160), (220, 160), (40, 320), (220, 320),
        (128, 130), (128, 260),
    ]
    for sx, sy in star_positions:
        draw.rectangle([sx, sy - 2, sx, sy + 2], fill=cream)
        draw.rectangle([sx - 2, sy, sx + 2, sy], fill=cream)
        draw.rectangle([sx - 1, sy - 1, sx - 1, sy - 1], fill=dark_gold)
        draw.rectangle([sx + 1, sy - 1, sx + 1, sy - 1], fill=dark_gold)
        draw.rectangle([sx - 1, sy + 1, sx - 1, sy + 1], fill=dark_gold)
        draw.rectangle([sx + 1, sy + 1, sx + 1, sy + 1], fill=dark_gold)

    # Pixelate the card back for consistency with the converted cards
    img = pixelate(img, small_w=64, small_h=96, big_w=width, big_h=height)
    # Quantize to the custom palette
    palette_img = build_palette_image()
    img = quantize_to_palette(img, palette_img)
    img = img.convert("RGB")
    # Add border matching the cards
    img = add_border(img)

    return img


def convert_card(src_path, dst_path, palette_img, force=False):
    """Convert a single card image to pixel art style."""
    if dst_path.exists() and not force:
        return False

    img = Image.open(src_path)
    # Handle RGBA by compositing onto dark background
    if img.mode == "RGBA":
        bg = Image.new("RGB", img.size, (15, 8, 30))
        bg.paste(img, mask=img.split()[3])
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    # Pixelate: downscale then upscale with NEAREST
    img = pixelate(img)

    # Quantize to custom palette
    img = quantize_to_palette(img, palette_img)

    # Convert back to RGB for border addition
    img = img.convert("RGB")

    # Add pixel border
    img = add_border(img)

    # Save
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(dst_path, "PNG")
    return True


def main():
    parser = argparse.ArgumentParser(description="Convert tarot card PNGs to 16-bit pixel art")
    parser.add_argument("--force", action="store_true", help="Overwrite existing converted files")
    args = parser.parse_args()

    # Paths
    script_dir = Path(__file__).resolve().parent
    project_dir = script_dir.parent
    static_dir = project_dir / "static"
    pixel_dir = static_dir / "pixel"

    if not static_dir.is_dir():
        print(f"Error: static directory not found at {static_dir}", file=sys.stderr)
        sys.exit(1)

    # Collect source PNGs (only top-level, not in pixel/ subdirectory)
    source_files = sorted([
        f for f in static_dir.iterdir()
        if f.is_file() and f.suffix.lower() == ".png"
    ])

    if not source_files:
        print("No PNG files found in static directory.", file=sys.stderr)
        sys.exit(1)

    total = len(source_files)
    print(f"Found {total} card images in {static_dir}")

    # Build palette once
    palette_img = build_palette_image()

    # Convert each card
    converted = 0
    skipped = 0
    for i, src_path in enumerate(source_files, 1):
        dst_path = pixel_dir / src_path.name
        print(f"Converting card {i}/{total}: {src_path.name}", end="")
        try:
            did_convert = convert_card(src_path, dst_path, palette_img, force=args.force)
            if did_convert:
                print(" [done]")
                converted += 1
            else:
                print(" [skip]")
                skipped += 1
        except Exception as e:
            print(f" [error: {e}]")

    # Create card back
    back_path = pixel_dir / "back.png"
    if not back_path.exists() or args.force:
        print("Creating card back: back.png")
        card_back = create_card_back()
        pixel_dir.mkdir(parents=True, exist_ok=True)
        card_back.save(back_path, "PNG")
        print("Card back [done]")
    else:
        print("Card back [skip]")

    print(f"Done: {converted} cards + 1 card back converted to static/pixel/")
    if skipped:
        print(f"Skipped: {skipped} (use --force to overwrite)")


if __name__ == "__main__":
    main()
