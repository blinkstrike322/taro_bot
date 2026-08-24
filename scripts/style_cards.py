#!/usr/bin/env python3
"""Стилизация карт под палитру бота: пергаментный дуотон + родные акценты.

Источник: static/default/<id>.png (гравюрные оригиналы).
Выход:    <id>.webp 900x1350 (2:3, арт не режется — паспарту по бокам)
          в web/public/cards/ и static/webapp/cards/

Пайплайн:
  1. автоконтраст (снимает JPEG-желтизну и выравнивает белое);
  2. дуотон: градации серой гравюры перекладываются на тёплый диапазон
     «кремовый пергамент -> пыльная лаванда -> фиолетовые чернила» —
     карта читается как тонированная оттискная печать, а не серый скан;
  3. родные цветные места (золото/жёлтый, голубой/синий) остаются цветными
     поверх дуотона с лёгким бустом насыщенности;
  4. мягкая виньетка по углам — глубина без грязи;
  5. паддинг до 2:3 кремовым полем в тон светлых участках карты.

Запуск: python3 scripts/style_cards.py [--force]
"""
import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "static" / "default"
DST1 = ROOT / "web" / "public" / "cards"
DST2 = ROOT / "static" / "webapp" / "cards"

TARGET_W, TARGET_H = 900, 1350

# Палитра дуотона (стопы «тень -> свет») — тёплый пергамент и фиолетовые чернила.
RAMP = [
    (0.00, (43, 40, 66)),    # глубокие чернила, чуть теплее --ink-dark
    (0.28, (82, 77, 116)),   # #524D74 — приглушённый виола
    (0.62, (168, 158, 182)), # #A89EB6 — пыльная лаванда
    (0.88, (228, 220, 216)), # тёплый светло-серый
    (1.00, (249, 245, 235)), # #F9F5EB — кремовый пергамент
]

# Акцентные диапазоны HSV (hue 0-255): золото/жёлтый + голубой/синий.
SPOT_HUE_RANGES = [(18, 62), (112, 178)]
SPOT_SAT_MIN = 35
SPOT_VAL_MIN = 45


def _lut(channel: int) -> list[int]:
    """Кусочно-линейная кривая одного канала дуотона."""
    pts = RAMP
    lut = []
    for i in range(256):
        t = i / 255
        for (t0, c0), (t1, c1) in zip(pts, pts[1:]):
            if t0 <= t <= t1:
                k = (t - t0) / (t1 - t0) if t1 > t0 else 0
                lut.append(round(c0[channel] + (c1[channel] - c0[channel]) * k))
                break
        else:
            lut.append(pts[-1][1][channel])
    return lut


LUT_R, LUT_G, LUT_B = _lut(0), _lut(1), _lut(2)


def make_spot_color_mask(rgb: Image.Image) -> Image.Image:
    """Маска родных акцентов (золото + голубизна), края сглажены."""
    hsv = rgb.convert("HSV")
    h, s, v = hsv.split()

    def in_ranges(i: int) -> int:
        return 255 if any(lo <= i <= hi for lo, hi in SPOT_HUE_RANGES) else 0

    hue_mask = h.point(in_ranges)
    sat_mask = s.point(lambda i: 255 if i >= SPOT_SAT_MIN else 0)
    val_mask = v.point(lambda i: 255 if i >= SPOT_VAL_MIN else 0)

    mask = ImageChops.multiply(hue_mask, ImageChops.multiply(sat_mask, val_mask))
    return mask.filter(ImageFilter.GaussianBlur(radius=1.6))


def make_vignette(w: int, h: int, strength: float = 0.10) -> Image.Image:
    """Радиальное затемнение углов, возвращается как L-маска множителя."""
    sw, sh = 64, 96
    vig = Image.new("L", (sw, sh), 255)
    px = vig.load()
    cx, cy = (sw - 1) / 2, (sh - 1) / 2
    max_d = (cx * cx + cy * cy) ** 0.5
    for y in range(sh):
        for x in range(sw):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / max_d
            px[x, y] = round(255 * (1 - strength * max(0.0, d - 0.55) / 0.45))
    return vig.resize((w, h), Image.BILINEAR)


def process(path: Path) -> Image.Image:
    img = Image.open(path).convert("RGB")
    rgb = ImageOps.autocontrast(img, cutoff=1)

    gray = ImageOps.grayscale(rgb)
    duotone = Image.merge("RGB", (gray.point(LUT_R), gray.point(LUT_G), gray.point(LUT_B)))

    # родные акценты поверх дуотона, чуть насыщеннее
    spots = ImageEnhance.Color(rgb).enhance(1.15)
    result = Image.composite(spots, duotone, make_spot_color_mask(rgb))

    # виньетка
    result = ImageChops.multiply(result, Image.merge("RGB", [make_vignette(*result.size)] * 3))

    # паддинг до 2:3 кремовым полем (арт не режем)
    w, h = result.size
    target = TARGET_W / TARGET_H
    pad_color = RAMP[-1][1]
    if w / h < target:
        new_w = round(h * target)
        canvas = Image.new("RGB", (new_w, h), pad_color)
        canvas.paste(result, ((new_w - w) // 2, 0))
    else:
        new_h = round(w / target)
        y0 = max(0, (h - new_h) // 2)
        canvas = Image.new("RGB", (w, new_h), pad_color)
        canvas.paste(result, (0, y0))
    result = canvas

    return result.resize((TARGET_W, TARGET_H), Image.LANCZOS)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="Перезаписать существующие файлы")
    args = ap.parse_args()

    sources = sorted(SRC.glob("*.png"))
    if not sources:
        raise SystemExit(f"нет оригиналов в {SRC}")
    DST1.mkdir(parents=True, exist_ok=True)
    DST2.mkdir(parents=True, exist_ok=True)

    total_kb = 0
    for i, p in enumerate(sources, 1):
        out = process(p)
        for dst in (DST1, DST2):
            out.save(dst / f"{p.stem}.webp", "WEBP", quality=87, method=6)
        kb = (DST1 / f"{p.stem}.webp").stat().st_size // 1024
        total_kb += kb
        print(f"[{i}/{len(sources)}] {p.stem}.webp ({kb} KB)")
    print(f"done: {len(sources)} cards, {total_kb // 1024} MB")


if __name__ == "__main__":
    main()
