"""Облачные гряды из реалистичных облаков + стилизация дизером.

Источник — вырезанные фотографичные облака (temp/clouds/*.png, RGBA):
  «Fluffy White Cloud» / «Fluffy White Cloud PNG» — пышные кучевые;
  «Fluffy Cumulus Cloud Formation» — кучевая башня;
  «Billowing White Clouds Landscape» — широкое поле клубов.

Компоновка v3 — сплошная гряда вместо отдельных спрайтов:
  1. «масса» = герой + 2–4 спутника внахлёст на общей базе; композит сырых
     фотографий делается ДО стилизации, поэтому светотень и силуэт сливаются
     в одну органичную форму без швов;
  2. 3 массы раскладываются по полосе с перехлёстом — получается неразрывное
     кучевое поле, как на референсах;
  3. за грядой — дальний ярус мелких полупрозрачных облаков с естественным
     верхом, выглядывающих из-за основного поля (глубина, а не плавающие
     точки).

Срезы кадра: сторона считается срезанной, если по ней идёт длинная полоса
непрозрачной альфы (у bbox она касается всегда, но это не срез). Срез
растворяется feather-ом; срезанный верх героя в массе дополнительно
перекрывается «короной» — передним пухом с круглым естественным верхом.

Пайплайн стилизации каждого элемента:
  1. реальная светотень (яркость пикселей) смешивается с вертикальным
     градиентом (свет сверху — тень к основанию);
  2. светотень квантуется в 4 тона палитры проводницы, переходы растушёваны
     4x4 байеровским дизером — фирменные «точечки» бота;
  3. мягкая кромка альфы тоже дизерится точками по байеру.

Полоса 1400x380 на банк (moon/ember/storm), бесшовная по X (массы
композитятся в x-W/x/x+W). Цвет и дизер запечены в PNG — CSS только гонит
marquee, никаких масок и блендингов. Массы на ~30% крупнее v2
(высота 195–295 против 150–225).

Запуск: python3 scripts/make_clouds.py
"""
from __future__ import annotations

import hashlib
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "temp" / "clouds"
OUT1 = ROOT / "web" / "public" / "clouds"
OUT2 = ROOT / "static" / "webapp" / "clouds"

W, H = 1400, 380

# палитры банков: свет / тело / тень / глубокая тень у основания
PALETTES = {
    "moon":  dict(light=(244, 246, 253), body=(206, 212, 234), shade=(160, 168, 202), deep=(112, 122, 166)),
    "ember": dict(light=(251, 245, 233), body=(235, 212, 188), shade=(203, 172, 140), deep=(166, 130, 100)),
    "storm": dict(light=(243, 240, 247), body=(212, 205, 223), shade=(170, 161, 187), deep=(124, 116, 146)),
}

PRESETS = {
    "moon":  dict(masses=3, far=5, seed=7),
    "ember": dict(masses=3, far=4, seed=13),
    "storm": dict(masses=3, far=6, seed=29),
}

# передняя гряда: высота массы и потолок ширины (+30% к v2);
# разброс высот и баз шире — линия горизонта не должна быть прямой
MASS_H = (175, 305)
MASS_W_MAX = 780
# дальний ярус
FAR_H = (46, 88)

BAYER = [
    [0,  8,  2, 10],
    [12, 4, 14,  6],
    [3, 11,  1,  9],
    [15, 7, 13,  5],
]


def components(mask: Image.Image, min_area: int) -> list[tuple[int, int, int, int, set]]:
    """Связные кластеры на бинарной L-маске -> (bbox, множество пикселей)."""
    w, h = mask.size
    mp = mask.load()
    seen = bytearray(w * h)
    out = []
    for sy in range(h):
        for sx in range(w):
            if not mp[sx, sy] or seen[sy * w + sx]:
                continue
            stack = [(sx, sy)]
            seen[sy * w + sx] = 1
            x0 = y0 = 10**9
            x1 = y1 = -1
            area = 0
            pix: set = set()
            while stack:
                x, y = stack.pop()
                area += 1
                pix.add((x, y))
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h and mp[nx, ny] and not seen[ny * w + nx]:
                        seen[ny * w + nx] = 1
                        stack.append((nx, ny))
            if area >= min_area:
                out.append((x0, y0, x1, y1, pix))
    out.sort(key=lambda c: len(c[4]), reverse=True)
    return out


def detect_cuts(im: Image.Image) -> set[str]:
    """Стороны, обрезанные кадром: длинная полоса непрозрачной альфы.

    Край bbox альфа касается всегда хотя бы одной точкой — это природная
    вершинка, а не срез; срезом считаем заметную долю непрозрачных пикселей.
    """
    a = im.getchannel("A").load()
    w, h = im.size

    def frac(vals) -> float:
        return sum(1 for v in vals if v > 128) / len(vals)

    cuts: set[str] = set()
    if frac([a[x, 0] for x in range(w)]) > 0.08:
        cuts.add("T")
    if frac([a[x, h - 1] for x in range(w)]) > 0.08:
        cuts.add("B")
    if frac([a[0, y] for y in range(h)]) > 0.08:
        cuts.add("L")
    if frac([a[w - 1, y] for y in range(h)]) > 0.08:
        cuts.add("R")
    return cuts


def _feather(alpha: Image.Image, cut: dict) -> Image.Image:
    """Плавное растворение альфы у срезанных сторон (smoothstep, нет линий)."""
    w, h = alpha.size
    px = alpha.load()
    fx = max(10, int(w * 0.22))
    fy = max(10, int(h * 0.22))

    def ramp(t: float) -> float:
        t = min(1.0, max(0.0, t))
        return t * t * (3 - 2 * t)

    for y in range(h):
        for x in range(w):
            v = px[x, y]
            if not v:
                continue
            k = 1.0
            if cut.get("l"):
                k = min(k, ramp(x / fx))
            if cut.get("r"):
                k = min(k, ramp((w - 1 - x) / fx))
            if cut.get("t"):
                k = min(k, ramp(y / fy))
            if cut.get("b"):
                k = min(k, ramp((h - 1 - y) / fy))
            if k < 1.0:
                px[x, y] = int(v * k)
    return alpha


def feather_cut_edges(im: Image.Image, cuts: set[str]) -> Image.Image:
    """Растворить только действительно срезанные стороны."""
    if not cuts:
        return im
    key = {"T": "t", "B": "b", "L": "l", "R": "r"}
    qa = im.getchannel("A")
    im.putalpha(_feather(qa, {key[c] for c in cuts}))
    return im


def load_sprites() -> tuple[list[tuple[Image.Image, set]], list[tuple[Image.Image, set]]]:
    """(все спрайты, герои) — пары (изображение, срезы сторон).

    Герои — цельные источники по bbox альфы. Разнообразие в полосе даётся
    зеркалированием, масштабом и нахлёстами в массах.
    """
    files: dict[str, Path] = {}
    for p in sorted(SRC_DIR.glob("*.png")):
        h = hashlib.md5(p.read_bytes()).hexdigest()
        files.setdefault(h, p)
    if not files:
        raise SystemExit(f"нет исходников в {SRC_DIR}")

    sprites: list[tuple[Image.Image, set]] = []
    heroes: list[tuple[Image.Image, set]] = []
    for p in files.values():
        im = Image.open(p).convert("RGBA")
        qa = im.getchannel("A")
        # 1) источник целиком по bbox альфы — герой-спрайт
        box = qa.point(lambda v: 255 if v > 40 else 0).getbbox()
        if box:
            hero = im.crop(box)
            cuts = detect_cuts(hero)
            hero = feather_cut_edges(hero, cuts)
            heroes.append((hero, cuts))
            sprites.append((hero, cuts))
        # 2) мелкие кластеры, полностью помещающиеся в кадр (без срезов)
        small = qa.resize((256, 256), Image.BOX).point(lambda v: 255 if v > 60 else 0)
        k = im.width / 256
        kh = im.height / 256
        for x0, y0, x1, y1, pix in components(small, min_area=60)[:8]:
            touches = (
                any(px_ == 0 for px_, _ in pix) or any(px_ == 255 for px_, _ in pix)
                or any(py_ == 0 for _, py_ in pix) or any(py_ == 255 for _, py_ in pix)
            )
            if touches:
                continue
            pad = 6
            crop = im.crop((max(0, int(x0 * k) - pad), max(0, int(y0 * kh) - pad),
                            min(im.width, int((x1 + 1) * k) + pad),
                            min(im.height, int((y1 + 1) * kh) + pad)))
            if crop.width > 50 and crop.height > 30:
                sprites.append((crop, set()))
    if not sprites:
        raise SystemExit("не удалось извлечь ни одного спрайта")
    n_cut = sum(1 for _, c in heroes if c)
    print(f"спрайтов из источников: {len(sprites)} (героев: {len(heroes)}, со срезами: {n_cut})")
    return sprites, heroes


def stylize(sprite: Image.Image, pal: dict, target_h: int) -> Image.Image:
    """Реализм -> 4 тона палитры с байер-дизером; кромка альфы — точками."""
    aspect = sprite.width / sprite.height
    im = sprite.resize((int(target_h * aspect), target_h), Image.LANCZOS)
    w, h = im.size

    alpha = im.getchannel("A").point(lambda v: v)
    lum = ImageOps.autocontrast(ImageOps.grayscale(im.convert("RGB")), cutoff=2)
    ap, lp = alpha.load(), lum.load()

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        vert = 1.0 - (y / h) * 1.15  # свет сверху -> тень к основанию
        for x in range(w):
            a = ap[x, y]
            if a < 24:
                continue
            # кромка: мягкую альфу превращаем в байеровские точки
            if a < 230:
                thr = (BAYER[y & 3][x & 3] + 0.5) / 16.0
                if a / 255 < thr - 0.04:
                    continue
                a = 255
            lightness = 0.62 * (lp[x, y] / 255) + 0.38 * vert
            b = ((BAYER[y & 3][x & 3] + 0.5) / 16.0 - 0.5) * 0.28
            v = lightness + b
            if v > 0.62:
                col = pal["light"]
            elif v > 0.40:
                col = pal["body"]
            elif v > 0.22:
                col = pal["shade"]
            else:
                col = pal["deep"]
            op[x, y] = (*col, a)
    return out


def build_mass(sprites: list[tuple[Image.Image, set]],
               heroes: list[tuple[Image.Image, set]],
               rng: random.Random) -> Image.Image:
    """Сырая фотографичная масса: герой + спутники внахлёст на общей базе.

    Композит до стилизации — перекрытия получают непрерывную светотень,
    силуэт читается одной кучевой формой, а не стопкой спрайтов. Если верх
    героя срезан кадром, он перекрывается «короной» — передним пухом с
    круглым естественным верхом.
    """
    RH = 560  # рабочий масштаб: высота героя
    hero, hero_cuts = rng.choice(heroes)
    if rng.random() < 0.5:
        hero = hero.transpose(Image.FLIP_LEFT_RIGHT)
    hero = hero.resize((int(RH * hero.width / hero.height), RH), Image.LANCZOS)
    hw = hero.width

    # (изображение, x, y); база героя — y=0; спутники за героем, корона перед
    items: list[tuple[Image.Image, int, int]] = []
    left_x, right_x, top = 0, hw, -RH

    def add(im: Image.Image, x: int, y: int) -> None:
        nonlocal left_x, right_x, top
        items.append((im, x, y))
        left_x = min(left_x, x)
        right_x = max(right_x, x + im.width)
        top = min(top, y)

    n = rng.randint(2, 4)
    sides = [-1, 1] + [rng.choice([-1, 1]) for _ in range(n - 2)]
    rng.shuffle(sides)
    for side in sides[:n]:
        src, _ = rng.choice(sprites)
        sh = int(RH * rng.uniform(0.36, 0.70))
        s = src.resize((int(sh * src.width / src.height), sh), Image.LANCZOS)
        if rng.random() < 0.5:
            s = s.transpose(Image.FLIP_LEFT_RIGHT)
        # спутник не шире 3/4 героя — гряда из разных масс, а не одна махина
        if s.width > hw * 0.75:
            s = s.resize((int(hw * 0.75), int(s.height * hw * 0.75 / s.width)), Image.LANCZOS)
            sh = s.height
        overlap = int(s.width * rng.uniform(0.30, 0.55))
        if side < 0:
            sx = left_x - s.width + overlap
        else:
            sx = right_x - overlap
        sy = -(sh + int(RH * rng.uniform(0.0, 0.08)))
        add(s, sx, sy)

    hero_item = (hero, 0, -RH)
    canvas_items = items + [hero_item]
    if "T" in hero_cuts:
        crown_pool = [s for s, c in sprites if "T" not in c] or [s for s, _ in sprites]
        for _ in range(rng.randint(1, 2)):
            src = rng.choice(crown_pool)
            chh = int(RH * rng.uniform(0.30, 0.46))
            c = src.resize((int(chh * src.width / src.height), chh), Image.LANCZOS)
            if rng.random() < 0.5:
                c = c.transpose(Image.FLIP_LEFT_RIGHT)
            cx = int(hw * rng.uniform(0.18, 0.82)) - c.width // 2
            cy = -RH - int(RH * rng.uniform(0.03, 0.10))
            canvas_items.append((c, cx, cy))  # перед героем — прячет срез

    for im, x, y in canvas_items:
        left_x = min(left_x, x)
        right_x = max(right_x, x + im.width)
        top = min(top, y)
    cw, ch = right_x - left_x, -top
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    for im, x, y in canvas_items:
        canvas.alpha_composite(im, (x - left_x, y - top))
    box = canvas.getchannel("A").getbbox()
    return canvas.crop(box)


def make_bank(name: str, cfg: dict,
              sprites: list[tuple[Image.Image, set]],
              heroes: list[tuple[Image.Image, set]]) -> None:
    rng = random.Random(cfg["seed"])
    pal = PALETTES[name]
    sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # для одиночного использования — только спрайты с естественным верхом
    calm = [(s, c) for s, c in sprites if "T" not in c] or sprites

    # дальний ярус — мелкие полупрозрачные облака за грядой
    for _ in range(cfg["far"]):
        src, _ = rng.choice(calm)
        far = stylize(src, pal, rng.randint(*FAR_H))
        if rng.random() < 0.5:
            far = far.transpose(Image.FLIP_LEFT_RIGHT)
        a = far.getchannel("A").point(lambda v: int(v * rng.uniform(0.34, 0.5)))
        far.putalpha(a)
        fx = rng.randint(0, W - far.width)
        fy = rng.randint(int(H * 0.06), int(H * 0.42))
        for dx in (-W, 0, W):
            sheet.alpha_composite(far, (fx + dx, fy))

    # передняя гряда: массы с перехлёстом, суммарная ширина = цикл W
    masses: list[Image.Image] = []
    for _ in range(cfg["masses"]):
        m = stylize(build_mass(sprites, heroes, rng), pal, rng.randint(*MASS_H))
        if rng.random() < 0.5:
            m = m.transpose(Image.FLIP_LEFT_RIGHT)
        if m.width > MASS_W_MAX:
            k = MASS_W_MAX / m.width
            m = m.resize((MASS_W_MAX, int(m.height * k)), Image.LANCZOS)
        masses.append(m)

    total = sum(m.width for m in masses)
    overlap_sum = max(total - W + rng.randint(-50, 30), 0)
    x = rng.randint(-40, 60)
    first_x = x
    for i, m in enumerate(masses):
        # база гуляет по вертикали: часть масс висит выше — горизонт живой
        cy = H - m.height - rng.randint(0, 40)
        for dx in (-W, 0, W):
            sheet.alpha_composite(m, (x + dx, cy))
        if i < len(masses) - 1:
            ov = int(overlap_sum * rng.uniform(0.7, 1.3))
            ov = max(min(ov, int(m.width * 0.45)), int(m.width * 0.05))
            x += m.width - ov
    # стык последней и первой (бесшовность цикла)
    last_right = x + masses[-1].width
    wrap_gap = first_x + W - last_right
    if wrap_gap > 70:
        src, _ = rng.choice(calm)
        fh = int(rng.uniform(0.45, 0.6) * masses[0].height)
        filler = stylize(src, pal, fh)
        if rng.random() < 0.5:
            filler = filler.transpose(Image.FLIP_LEFT_RIGHT)
        a = filler.getchannel("A").point(lambda v: int(v * 0.85))
        filler.putalpha(a)
        fx = int((last_right + first_x + W) / 2 - filler.width / 2) % W
        for dx in (-W, 0, W):
            sheet.alpha_composite(filler, (fx + dx, H - fh - rng.randint(0, 30)))

    OUT1.mkdir(parents=True, exist_ok=True)
    OUT2.mkdir(parents=True, exist_ok=True)
    for out in (OUT1, OUT2):
        p = out / f"{name}.png"
        sheet.save(p, "PNG", optimize=True)
        print(f"{p}: {p.stat().st_size / 1024:.0f}KB")


if __name__ == "__main__":
    spr, hero = load_sprites()
    for name, cfg in PRESETS.items():
        make_bank(name, cfg, spr, hero)
