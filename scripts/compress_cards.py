#!/usr/bin/env python3
"""Пережимает карты Таро (webp) в static/webapp/cards.

Безопасно: перезаписывает файл ТОЛЬКО если результат меньше исходного;
git хранит оригиналы. Формат и размеры сохраняются, клиент продолжает
не те же URL.

Запуск:
    python scripts/compress_cards.py            # quality=76, method=6
    python scripts/compress_cards.py 70         # прочее качество
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "static" / "webapp" / "cards"
METHOD = 6  # медленный, но лучший


def compress_one(path: Path, quality: int):
    try:
        im = Image.open(path)
        im.load()
    except Exception:
        return None
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGB")
    tmp = path.with_suffix(path.suffix + ".tmp")
    im.save(tmp, "WEBP", quality=quality, method=METHOD)
    old = path.stat().st_size
    new = tmp.stat().st_size
    if new < old:
        tmp.replace(path)
    else:
        tmp.unlink(missing_ok=True)
    return (old, min(old, new))


def main() -> None:
    quality = int(sys.argv[1]) if len(sys.argv) > 1 else 76
    files = sorted(DEST.glob("*.webp")) + sorted(DEST.glob("backs/*.webp"))
    tot_old = tot_new = 0
    kept = changed = 0
    for f in files:
        r = compress_one(f, quality)
        if r is None:
            print(f"  ! {f.name}: не прочитать")
            continue
        o, n = r
        tot_old += o
        tot_new += n
        if o != n:
            changed += 1
            print(f"  {f.name}: {(o / 1024):.0f}K -> {(n / 1024):.0f}K")
        else:
            kept += 1
    print(f"done: пережато {changed}, без изменений {kept} | "
          f"{tot_old / 1048576:.1f}MB -> {tot_new / 1048576:.1f}MB")


if __name__ == "__main__":
    main()