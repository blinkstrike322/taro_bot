"""Установка новых шапок: кроп 2:3 (524x786), оптимизация, запись в backs/."""
import os
import unicodedata

from PIL import Image

DL = os.path.expanduser("~/Downloads")
ROOT = os.pathom = os.path.dirname(os.path.abspath(__file__))  # scripts/
ROOT = os.path.dirname(ROOT)
BACKS = os.path.join(ROOT, "web", "public", "cards", "backs")

TARGET = (524, 786)  # 2:3


def find(key: str, extra: str = "") -> str:
    for f in os.listdir(DL):
        n = unicodedata.normalize("NFC", f)
        if key in n and extra in n and f.lower().endswith(".png"):
            return os.path.join(DL, f)
    raise FileNotFoundError(key)


MAPPING = {
    "back_shadow_walker.png": find("Crane"),                    # ночь/журавль/луна
    "back_ruin_keeper.png": find("Дизайн"),                     # светлая тёплая бумага
    "back_spark_of_chaos.png": find("Pinterest", "от"),         # искра в центре
}


def process(src: str, dst: str) -> None:
    im = Image.open(src)
    if im.mode in ("RGBA", "P", "LA"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im)
    im = im.convert("RGB")

    # center-crop до 2:3
    w, h = im.size
    target_ratio = 2 / 3
    if w / h > target_ratio:
        new_w = int(h * target_ratio)
        x0 = (w - new_w) // 2
        im = im.crop((x0, 0, x0 + new_w, h))
    else:
        new_h = int(w / target_ratio)
        y0 = max(0, int((h - new_h) * 0.42))  # чуть выше центра — мотив не резать
        im = im.crop((0, y0, w, y0 + new_h))

    im = im.resize(TARGET, Image.LANCZOS)

    # пробуем полноцветный оптимизированный PNG; если большой — палитра 256
    tmp_full = dst + ".full.png"
    im.save(tmp_full, "PNG", optimize=True)
    size_full = os.path.getsize(tmp_full)
    if size_full > 280_000:
        q = im.quantize(colors=256, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)
        q.save(dst, "PNG", optimize=True)
        os.remove(tmp_full)
        kind = "palette256"
    else:
        os.rename(tmp_full, dst)
        kind = "rgb"
    print(f"{os.path.basename(dst)} <- {os.path.basename(src)}: "
          f"{round(os.path.getsize(dst)/1024)} КБ ({kind})")


for dst, src in MAPPING.items():
    process(src, os.path.join(BACKS, dst))

print("\nготово:", sorted(os.listdir(BACKS)))
