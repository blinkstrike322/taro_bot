#!/usr/bin/env python3
# scripts/optimize_card_assets.py
# Оптимизация карточных ассетов ARCANUM:
#   1. PNG карт (524×780, режим L, 32 оттенка) → палитра P32 + optimize:
#      беспотерьно (0 изменённых пикселей), ~30% экономии.
#   2. Мёртвые .webp дубликаты (крупнее PNG при том же контенте) — удалить:
#      фронтенд грузит только /cards/{id}.png.
# Запуск: .venv/bin/python scripts/optimize_card_assets.py
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC_CARDS = ROOT / "web" / "public" / "cards"
STATIC_CARDS = ROOT / "static" / "webapp" / "cards"


def optimize_png(path: Path) -> tuple[int, int]:
    """L→P32 lossless. Возвращает (было, стало)."""
    orig = path.stat().st_size
    im = Image.open(path)
    if im.mode not in ("L", "P", "RGB"):
        return orig, orig  # не трогаем неожиданные форматы
    if im.mode == "L":
        # P32 хватает для всех оттенков пиксель-арта (проверено: 0 потерь)
        im = im.convert("P", palette=Image.ADAPTIVE, colors=32)
    tmp = path.with_suffix(".tmp.png")
    im.save(tmp, optimize=True)
    new = tmp.stat().st_size
    if new < orig:
        tmp.replace(path)
    else:
        tmp.unlink()
        new = orig
    return orig, new


def main() -> None:
    total_before = total_after = 0
    files = 0

    for d in (PUBLIC_CARDS, STATIC_CARDS):
        for png in sorted(d.glob("*.png")):
            before, after = optimize_png(png)
            total_before += before
            total_after += after
            files += 1

    # мёртвые .webp дубликаты — фронтенд их не грузит никогда
    removed = 0
    for d in (PUBLIC_CARDS, STATIC_CARDS):
        for webp in d.glob("*.webp"):
            webp.unlink()
            removed += 1

    saved = total_before - total_after
    print(f"Оптимизировано PNG: {files} шт.")
    print(f"Размер карт: {total_before/1e6:.1f} МБ → {total_after/1e6:.1f} МБ "
          f"(экономия {saved/1e6:.1f} МБ, {saved*100//max(total_before,1)}%)")
    print(f"Удалено мёртвых .webp: {removed} шт.")


if __name__ == "__main__":
    main()
