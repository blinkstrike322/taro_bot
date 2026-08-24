"""Прозрачные поля карт: всё вне печатной рамки — в прозрачность.

Генерация (style_cards.py) оставляет вокруг печатной рамки две зоны: светлую
плёнку (250,245,236) и бежевую бумагу (217,211,206). На странице обе читаются
как белая полоса между рамкой фрейма и гравюрой. Печатная рамка нарисована
в пропорции уже 2/3, поэтому кроп с сохранением рамки невозможен — вместо
этого всё снаружи рамки делается прозрачным: сквозь него видна бумага
.card-frame (--paper-bright), шов получается бесшовным.

Рамка детектится как bbox тёмных пикселей; у карт-выбросов (артефакты за
рамкой) используется эталонное окно большинства. Заливки не нужны — чистая
геометрия, ничего внутри рамки не затрагивается.

Запуск: python3 scripts/trim_cards.py   (после каждой регенерации карт;
после неё также подними версию ?v= у URL карт в спредах — /cards/ кэшируется
на неделю).
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
# эталонное окно печатной рамки для 900x1350 (мажоритарное по всем картам)
EXPECTED_NORM = (75, 19, 824, 1331)
PAD = 3
DEV_TOL = 25


def rule_bbox(im: Image.Image) -> tuple[int, int, int, int]:
    g = im.convert("L")
    dark = g.point(lambda v: 255 if v < 110 else 0)
    return dark.getbbox()


def clear_outside(im: Image.Image, box: tuple[int, int, int, int]) -> float:
    w, h = im.size
    px = im.load()
    x0, y0, x1, y1 = box
    cleared = 0
    for y in range(h):
        inside_y = y0 <= y < y1
        for x in range(w):
            if inside_y and x0 <= x < x1:
                continue
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = (r, g, b, 0)
                cleared += 1
    return 100 * cleared / (w * h)


if __name__ == "__main__":
    targets = [Path(p) for p in sys.argv[1:]] or sorted(
        (ROOT / "web" / "public" / "cards").glob("*.webp")
    )
    for f in targets:
        im = Image.open(f).convert("RGBA")
        w, h = im.size
        sx, sy = w / 900, h / 1350
        exp = (
            int(EXPECTED_NORM[0] * sx), int(EXPECTED_NORM[1] * sy),
            int(EXPECTED_NORM[2] * sx), int(EXPECTED_NORM[3] * sy),
        )
        bb = rule_bbox(im)
        if bb is None or any(abs(bb[i] - exp[i]) > DEV_TOL for i in range(4)):
            bb = exp  # выброс: артефакты за рамкой — берём эталонное окно
        box = (
            max(0, bb[0] - PAD), max(0, bb[1] - PAD),
            min(w, bb[2] + PAD), min(h, bb[3] + PAD),
        )
        pct = clear_outside(im, box)
        im.save(f, "WEBP", quality=90, method=6)
        print(f"{f.name}: keep {box}, cleared {pct:.1f}%")
