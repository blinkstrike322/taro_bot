"""Генерация живописных банков облаков (мягкая основа для гибрида с дизером).

Запуск: python scripts/make_clouds.py
Выход: web/public/clouds/{moon,ember,storm}.png — белые облака на прозрачном.
Тонировка под проводницу — на фронте через CSS filter (см. guides.ts).
"""
from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

W, H = 800, 400
OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "clouds"

PRESETS = {
    "moon":  dict(blobs=26, rmin=60, rmax=150, y_bias=0.45, jag=0.0),
    "ember": dict(blobs=18, rmin=80, rmax=190, y_bias=0.75, jag=0.1),
    "storm": dict(blobs=34, rmin=40, rmax=110, y_bias=0.5,  jag=0.35),
}


def value_noise(w: int, h: int, scale: int, rng: random.Random) -> Image.Image:
    small = Image.new("L", (w // scale, h // scale))
    px = small.load()
    for y in range(small.height):
        for x in range(small.width):
            px[x, y] = int(rng.random() * 255)
    return small.resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(6))


def make_bank(name: str, cfg: dict, seed: int) -> None:
    rng = random.Random(seed)

    blobs = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(blobs)
    for _ in range(cfg["blobs"]):
        r = rng.randint(cfg["rmin"], cfg["rmax"])
        cx = rng.randint(-r // 2, W - r // 2)
        cy = int(H * cfg["y_bias"] + rng.randint(-H // 5, H // 5))
        d.ellipse([cx - r, cy - r // 2, cx + r, cy + r // 2], fill=255)
    blobs = blobs.filter(ImageFilter.GaussianBlur(24))

    if cfg["jag"] > 0:
        noise = value_noise(W, H, 24, rng)
        cut = noise.point(lambda v: 255 if v > int(255 * (1 - cfg["jag"])) else 0)
        cut = cut.filter(ImageFilter.GaussianBlur(8))
        blobs = Image.composite(blobs, Image.new("L", (W, H), 0), cut)

    grad = Image.new("L", (W, H), 0)
    dg = ImageDraw.Draw(grad)
    for y in range(H):
        a = int(120 + 100 * (y / H))
        dg.line([(0, y), (W, y)], fill=a)
    alpha = Image.composite(grad, Image.new("L", (W, H), 0), blobs.point(lambda v: min(v, 255)))

    white = Image.new("RGBA", (W, H), (255, 255, 255, 0))
    white.putalpha(alpha)

    OUT.mkdir(parents=True, exist_ok=True)
    out_path = OUT / f"{name}.png"
    white.save(out_path, "PNG", optimize=True)
    print(f"{out_path.name}: {out_path.stat().st_size / 1024:.0f}KB")


if __name__ == "__main__":
    make_bank("moon", PRESETS["moon"], seed=7)
    make_bank("ember", PRESETS["ember"], seed=13)
    make_bank("storm", PRESETS["storm"], seed=29)
