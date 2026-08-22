#!/usr/bin/env python3
"""Конвертация оригинальных гравюр (static/default) в HQ-лица карт для веба.

Оригиналы — ч/б гравюра в духе Rider-Waite (614x1024, JPEG в .png).
Пайплайн:
- grayscale + autocontrast (чистит JPEG- желтизну и шум)
- паддинг по бокам до 2:3 белым (не режем арт)
- апскейл LANCZOS до 700x1050
- grayscale WebP q88 в web/public/cards/ (~160 КБ/карта вместо ~400 КБ PNG)

Telegram-пайплайн (static/pixel) не трогается.

Usage:
    uv run --with Pillow python scripts/hq_cards.py [--force]
"""

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "static" / "default"
WEB_DST = ROOT / "web" / "public" / "cards"
STATIC_DST = ROOT / "static" / "webapp" / "cards"

TARGET_W, TARGET_H = 900, 1350  # 2:3, крупнее старого low-res 524x780

# Акцентные диапазоны HSV (hue 0-255): золото/жёлтый + голубой/синий.
# Белый не нужен в маске — он и так останется видимым на сером.
SPOT_HUE_RANGES = [(18, 62), (112, 178)]
SPOT_SAT_MIN = 35
SPOT_VAL_MIN = 45


def make_spot_color_mask(rgb: Image.Image) -> Image.Image:
    """Return an 8-bit mask where accent colors stay visible on a grayscale card."""
    hsv = rgb.convert("HSV")
    h, s, v = hsv.split()

    def in_ranges(i: int) -> int:
        for lo, hi in SPOT_HUE_RANGES:
            if lo <= i <= hi:
                return 255
        return 0

    hue_mask = h.point(in_ranges)
    sat_mask = s.point(lambda i: 255 if i >= SPOT_SAT_MIN else 0)
    val_mask = v.point(lambda i: 255 if i >= SPOT_VAL_MIN else 0)

    mask = ImageChops.multiply(hue_mask, ImageChops.multiply(sat_mask, val_mask))
    # плавные края, чтобы цвет не выглядел вырезанным
    return mask.filter(ImageFilter.GaussianBlur(radius=1.8))


def convert_card(src_path: Path, dst_path: Path, force: bool = False) -> int:
    """Convert a source card to the target path. Returns written bytes."""
    if dst_path.exists() and not force:
        return 0

    img = Image.open(src_path).convert("RGB")

    # автоконтраст на цветном оригинале — убирает желтизну и выравнивает белое
    rgb = ImageOps.autocontrast(img, cutoff=1)

    # ч/б база
    gray = ImageOps.grayscale(rgb)

    # маска «spot color»: золото/жёлтое + голубое/синее остаются цветными
    mask = make_spot_color_mask(rgb)
    result = Image.composite(rgb, gray.convert("RGB"), mask)

    # паддинг по бокам до 2:3 — арт не режем, белое поле как «паспарту»
    w, h = result.size
    target_ratio = TARGET_W / TARGET_H
    if w / h < target_ratio:
        new_w = round(h * target_ratio)
        pad = Image.new("RGB", (new_w, h), (255, 255, 255))
        pad.paste(result, ((new_w - w) // 2, 0))
        result = pad
    else:
        new_h = round(w / target_ratio)
        y0 = max(0, (h - new_h) // 2)
        result = result.crop((0, y0, w, y0 + new_h))

    result = result.resize((TARGET_W, TARGET_H), Image.LANCZOS)

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    if dst_path.suffix.lower() == ".png":
        result.save(dst_path, "PNG", optimize=True)
    else:
        result.save(dst_path, "WEBP", quality=88, method=6)
    return dst_path.stat().st_size


def clean_stale_faces(dirs: list[Path]) -> int:
    """Remove old .png card faces (keep backs subfolder and any webp faces)."""
    removed = 0
    for d in dirs:
        if not d.is_dir():
            continue
        for p in d.glob("*.png"):
            if p.stem.startswith("back_") or p.parent.name == "backs":
                continue
            p.unlink()
            removed += 1
    return removed


def main() -> None:
    parser = argparse.ArgumentParser(description="HQ card faces from engraved originals")
    parser.add_argument("--force", action="store_true", help="Overwrite existing files")
    parser.add_argument("--png-only", action="store_true", help="Write PNG instead of WebP for static/webapp")
    args = parser.parse_args()

    if not SRC.is_dir():
        print(f"Error: {SRC} not found", file=sys.stderr)
        sys.exit(1)

    sources = sorted(f for f in SRC.iterdir() if f.suffix.lower() == ".png")
    if not sources:
        print(f"No PNG files in {SRC}", file=sys.stderr)
        sys.exit(1)

    # Web frontend uses .webp; aiohttp prod pipeline uses .png in static/webapp.
    static_suffix = ".png" if args.png_only else ".webp"

    removed = clean_stale_faces([WEB_DST, STATIC_DST])
    if removed:
        print(f"Removed {removed} stale .png card faces")

    converted = skipped = 0
    web_total_kb = 0
    static_total_kb = 0
    for i, src_path in enumerate(sources, 1):
        web_path = WEB_DST / (src_path.stem + ".webp")
        static_path = STATIC_DST / (src_path.stem + static_suffix)
        print(f"[{i}/{len(sources)}] {src_path.name}", end=" ")
        try:
            web_bytes = convert_card(src_path, web_path, force=args.force)
            static_bytes = convert_card(src_path, static_path, force=args.force)
            if web_bytes or static_bytes:
                converted += 1
                web_total_kb += web_bytes
                static_total_kb += static_bytes
                print(f"[webp {web_bytes // 1024} KB | static {static_bytes // 1024} KB]")
            else:
                print("[skip]")
                skipped += 1
        except Exception as e:
            print(f"[error: {e}]")

    print(f"\nDone: {converted} cards")
    print(f"  web -> {WEB_DST} ({web_total_kb // 1024} KB)")
    print(f"  static -> {STATIC_DST} ({static_total_kb // 1024} KB)")
    if skipped:
        print(f"Skipped: {skipped} (use --force to overwrite)")


if __name__ == "__main__":
    main()
