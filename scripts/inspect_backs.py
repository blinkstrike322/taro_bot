"""Инспекция и обработка новых шапок карт: палитры, кроп 2:3, оптимизация."""
import os
import sys
from collections import Counter

from PIL import Image

DL = os.path.expanduser("~/Downloads")
TARGETS = [f for f in os.listdir(DL) if f.endswith(".png")]

# интересующие нас файлы (по вхождению подстрок)
KEYS = ["Дизайн карты таро", "Pinterest", "Crane"]

for key in KEYS:
    match = [f for f in TARGETS if key in f]
    if not match:
        print(f"!! не найдено: {key}")
        continue
    path = os.path.join(DL, match[0])
    im = Image.open(path)
    print(f"\n=== {match[0]} ===")
    print("размер:", im.size, "режим:", im.mode,
          "файл:", round(os.path.getsize(path) / 1024), "КБ")

    sm = im.convert("RGB").resize((60, 90))
    cnt = Counter(sm.getdata())
    print("топ-6 цветов:")
    for c, n in cnt.most_common(6):
        print("   #%02X%02X%02X" % c, round(n / (60 * 90) * 100, 1), "%")

    # карта яркости по трём зонам (верх/центр/низ), 24x36
    sm2 = im.convert("L").resize((24, 36))
    rows = []
    for zone, (y0, y1) in (("верх", (0, 12)), ("центр", (12, 24)), ("низ", (24, 36))):
        zone_px = [sm2.getpixel((x, y)) for y in range(y0, y1) for x in range(24)]
        avg = sum(zone_px) // len(zone_px)
        rows.append(f"{zone}: {avg}")
    print("яркость:", " | ".join(rows))
