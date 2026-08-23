# Atmosphere Engine Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Три вау-момента (ритуал входа, раскрытие карты, экран толкования) через единый атмосферный движок: гибридные облака, ирис х2, манифест-плашка толкования, сенсорная идентичность проводниц.

**Architecture:** `AtmosphereProvider` (context: guide + phase) рендерит `AtmosphereLayer` — fixed-слой с `CloudField` и `FlowerAnchor`. Вау-моменты — состояния `phase: welcome | draw | reveal | reading`. Спред-компоненты эмитят фазы через колбэки. `ReadingResult` v2 — манифест-плашка с построчным проявлением.

**Tech Stack:** Next.js 15 (pages router, static export), React 19, Tailwind v4, SVG. Сборка: `cd web && npm run build` → экспорт в `static/webapp`.

## Global Constraints

- Анимации только `transform`/`opacity`. Никакого per-frame JS.
- `prefers-reduced-motion: reduce` — атмосфера статична.
- Бюджет: +<15KB JS gzip, +<250KB ассетов (облака ≤2 × ~90KB WebP/PNG).
- Каждый подслой атмосферы отказоустойчив: без ассетов UI работает.
- Все пути в коде — от `web/src/`. Прод-сборка: `cd web && npm run build` (distDir уже `../static/webapp`).
- После каждого таска: `cd web && npx tsc --noEmit` — 0 ошибок.
- Рабочая директория команд с git: корень репозитория `taro_bot/`.

---

### Task 1: PixelFlower v2 — ирис х2

**Files:**
- Rewrite: `web/src/components/PixelFlower.tsx`
- Test: `web/src/components/__tests__/pixelFlower.test.ts` (чистые функции генератора)

**Interfaces:**
- Produces: `PixelFlower` с пропсами `{ seed?, size?, color?, bgColor?, accentColor?, opacity?, tilt?, className?, style? }` (variant убран — всегда iris). Экспортирует `generateIris(seed): Cell[]` для теста. `Cell = { x: number; y: number; t: CellType; organ: number; o: number; accent?: boolean }`.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/components/__tests__/pixelFlower.test.ts
import { generateIris } from '../PixelFlower';

describe('generateIris v2', () => {
  test('returns cells within grid bounds', () => {
    const cells = generateIris(7);
    expect(cells.length).toBeGreaterThan(1500); // х2 плотность
    for (const c of cells) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(100);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(164);
    }
  });

  test('deterministic per seed', () => {
    const a = JSON.stringify(generateIris(11));
    const b = JSON.stringify(generateIris(11));
    const c = JSON.stringify(generateIris(12));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  test('has filaments and buds organs', () => {
    const cells = generateIris(3);
    const organs = new Set(cells.map((c) => c.organ));
    expect(organs.has(8)).toBe(true); // filamentL
    expect(organs.has(9)).toBe(true); // filamentR
    expect(organs.has(10)).toBe(true); // budL
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx jest src/components/__tests__/pixelFlower.test.ts 2>/dev/null || npx tsx --test src/components/__tests__/pixelFlower.test.ts`
Expected: FAIL (нет exports / v2). Если в проекте нет тест-раннера для фронта — установить dev-зависимость: `cd web && npm i -D vitest && npx vitest run src/components/__tests__/pixelFlower.test.ts`

- [ ] **Step 3: Rewrite `PixelFlower.tsx` (v2)**

```tsx
'use client';

import { useMemo } from 'react';

/**
 * PixelFlower v2 — ирис х2: сетка STEP=1 (100×164 живых ячеек),
 * 1px контуры, дизер-полутона к краям лепестков (растровая печать),
 * дуговые филаменты-тычинки, бутоны-спирали у основания,
 * тонкий стебель с точечной фактурой. Per-guide: seed + tilt.
 */

interface PixelFlowerProps {
  seed?: number;
  size?: number;
  color?: string;
  bgColor?: string;
  accentColor?: string;
  opacity?: number;
  tilt?: number;
  className?: string;
  style?: React.CSSProperties;
}

function hash1(seed: number): number {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

const STEP = 1;
const GRID_W = 100;
const GRID_H = 164;

type CellType = 'solid' | 'cross' | 'dot' | 'outline' | 'eye' | 'diamond';

export interface Cell {
  x: number;
  y: number;
  t: CellType;
  organ: number;
  o: number;
  accent?: boolean;
}

const ORGAN = {
  STD_L: 0, STD_C: 1, STD_R: 2,
  FALL_L: 3, FALL_R: 4, FALL_B: 5,
  STEM: 6, SPROUT: 7,
  FIL_L: 8, FIL_R: 9, BUD_L: 10, BUD_R: 11,
} as const;

interface PetalDef {
  organ: number;
  cx: number; cy: number;
  angle: number;
  len: number; halfW: number; bend: number;
  kind: 'lacey' | 'drop' | 'hatch' | 'mist';
}

const PETALS: PetalDef[] = [
  // купол стандартов — три волнистых лепестка (изящнее: уже и острее)
  { organ: ORGAN.STD_L, cx: 50, cy: 52, angle: -Math.PI / 2 - 0.66, len: 34, halfW: 7.5, bend: -7, kind: 'lacey' },
  { organ: ORGAN.STD_C, cx: 50, cy: 52, angle: -Math.PI / 2, len: 40, halfW: 9, bend: 0, kind: 'lacey' },
  { organ: ORGAN.STD_R, cx: 50, cy: 52, angle: -Math.PI / 2 + 0.66, len: 34, halfW: 7.5, bend: 7, kind: 'lacey' },
  // фолы
  { organ: ORGAN.FALL_L, cx: 50, cy: 54, angle: Math.PI - 0.2, len: 36, halfW: 11.5, bend: -6, kind: 'drop' },
  { organ: ORGAN.FALL_R, cx: 50, cy: 54, angle: 0.36, len: 33, halfW: 10.5, bend: 8, kind: 'hatch' },
  { organ: ORGAN.FALL_B, cx: 50, cy: 54, angle: Math.PI / 2 + 0.12, len: 20, halfW: 7, bend: 2, kind: 'mist' },
];

function snap(v: number): number {
  return Math.round(v / STEP) * STEP - Math.floor(STEP / 2);
}

/** Полутон: вероятность «плотной» ячейки падает к краю лепестка (растровая печать) */
function halftone(t: number, edgeDist: number, h: number): CellType {
  // edgeDist: 0 у контура, 1 в глубине
  if (edgeDist < 0.18) return h < 0.75 ? 'dot' : 'outline';
  const density = 0.35 + 0.6 * edgeDist; // глубже — плотнее
  if (h < density * 0.5) return 'solid';
  if (h < density * 0.8) return 'cross';
  if (h < density * 0.95) return 'dot';
  return 'outline';
}

function sweepPetal(def: PetalDef, seed: number, cells: Map<string, Cell>) {
  const ax = Math.cos(def.angle);
  const ay = Math.sin(def.angle);
  const nx = -ay;
  const ny = ax;

  const stations = Math.round(def.len / STEP);
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const px = def.cx + ax * def.len * t + nx * def.bend * t * t;
    const py = def.cy + ay * def.len * t + ny * def.bend * t * t;
    const w = def.halfW * Math.sin(Math.PI * Math.pow(Math.max(t, 0.02), 0.72)) * (0.9 + 0.2 * hash1(seed + i * 3));

    const offs = Math.ceil(w / STEP);
    for (let j = -offs; j <= offs; j++) {
      const off = j * STEP;
      if (Math.abs(off) > w) continue;
      const x = snap(px + nx * off);
      const y = snap(py + ny * off);
      const key = `${x},${y}`;
      if (cells.has(key)) continue;

      const edgeDist = 1 - Math.abs(off) / Math.max(w, 0.001); // 0 у края
      const h = hash1(seed * 7 + i * 13 + j * 29);
      let t_: CellType;
      let o: number;

      if (edgeDist < 0.08) {
        t_ = 'outline'; // 1px контур
        o = 0.9;
      } else {
        switch (def.kind) {
          case 'lacey':
            t_ = halftone(t, edgeDist, h);
            o = t_ === 'solid' ? 0.95 : 0.78;
            break;
          case 'drop':
            if (t < 0.34) { t_ = edgeDist > 0.5 ? 'solid' : halftone(t, edgeDist, h); o = 0.95; }
            else if (t < 0.7) { t_ = (x + y) % 2 === 0 ? 'solid' : 'dot'; o = 0.88; }
            else { t_ = h < 0.5 ? 'dot' : 'outline'; o = 0.65; }
            break;
          case 'hatch':
            if (t > 0.78) { t_ = h < 0.5 ? 'dot' : 'outline'; o = 0.65; }
            else { t_ = (x + y) % 4 < 2 ? (edgeDist > 0.6 ? 'solid' : 'cross') : 'cross'; o = 0.85; }
            break;
          case 'mist':
            t_ = h < 0.55 ? 'dot' : 'outline';
            o = 0.5;
            break;
        }
      }

      cells.set(key, {
        x, y, t: t_, organ: def.organ, o,
        accent: hash1(seed + i * 31 + j * 17) < 0.02,
      });
    }
  }
}

function drawArc(
  cells: Map<string, Cell>,
  organ: number,
  x0: number, y0: number,
  x1: number, y1: number,
  bow: number,
  seed: number,
  dotted = true,
) {
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    // квадратичная Безье с прогибом bow (перпендикулярно хорде)
    const cx = mx + (y1 - y0) / Math.hypot(x1 - x0, y1 - y0) * bow;
    const cy = my - (x1 - x0) / Math.hypot(x1 - x0, y1 - y0) * bow;
    const xa = x0 + (cx - x0) * t;
    const ya = y0 + (cy - y0) * t;
    const xb = cx + (x1 - cx) * t;
    const yb = cy + (y1 - cy) * t;
    const x = snap(xa + (xb - xa) * t);
    const y = snap(ya + (yb - ya) * t);
    const key = `${x},${y}`;
    if (cells.has(key)) continue;
    const h = hash1(seed + i * 7);
    cells.set(key, {
      x, y,
      t: dotted ? (h < 0.55 ? 'dot' : h < 0.85 ? 'cross' : 'outline') : 'outline',
      organ, o: 0.75,
    });
  }
}

function drawSpiral(cells: Map<string, Cell>, organ: number, cx: number, cy: number, r: number, seed: number) {
  const steps = 26;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = t * Math.PI * 2.2;
    const rr = r * t;
    const x = snap(cx + Math.cos(ang) * rr);
    const y = snap(cy + Math.sin(ang) * rr * 0.8);
    const key = `${x},${y}`;
    if (cells.has(key)) continue;
    cells.set(key, { x, y, t: hash1(seed + i * 5) < 0.6 ? 'dot' : 'cross', organ, o: 0.7 });
  }
}

export function generateIris(seed: number): Cell[] {
  const cells = new Map<string, Cell>();

  // стебель — тонкая дуга влево-вниз, точечная фактура
  const S = 44;
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    const x = snap(50 - 3 * t - 13 * t * t);
    const y = snap(64 + 92 * t);
    const key = `${x},${y}`;
    if (cells.has(key)) continue;
    const h = hash1(seed + i * 11);
    cells.set(key, {
      x, y,
      t: h < 0.5 ? 'dot' : h < 0.8 ? 'cross' : 'outline',
      organ: ORGAN.STEM, o: 0.8,
    });
  }

  // росток
  for (let i = 0; i < 12; i++) {
    const k1 = `${snap(63)},${snap(158 - i * 2)}`;
    if (!cells.has(k1)) cells.set(k1, { x: snap(63), y: snap(158 - i * 2), t: 'dot', organ: ORGAN.SPROUT, o: 0.7 });
    const k2 = `${snap(65)},${snap(157 - i * 2)}`;
    if (!cells.has(k2)) cells.set(k2, { x: snap(65), y: snap(157 - i * 2), t: i % 2 ? 'dot' : 'cross', organ: ORGAN.SPROUT, o: 0.55 });
  }

  // филаменты-тычинки — дуги из центра вверх
  drawArc(cells, ORGAN.FIL_L, 50, 56, 38, 26, 6, seed + 51);
  drawArc(cells, ORGAN.FIL_R, 50, 56, 62, 26, -6, seed + 52);

  // бутоны-спирали у основания
  drawSpiral(cells, ORGAN.BUD_L, 40, 62, 5, seed + 61);
  drawSpiral(cells, ORGAN.BUD_R, 60, 62, 5, seed + 62);

  // лепестки поверх
  for (const p of PETALS) sweepPetal(p, seed + p.organ * 97, cells);

  // «глаз» — квадрат цвета подложки в контуре
  const ex = snap(50);
  const ey = snap(53);
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const key = `${ex + dx},${ey + dy}`;
      const isEdge = Math.abs(dx) === 2 || Math.abs(dy) === 2;
      cells.set(key, {
        x: ex + dx, y: ey + dy,
        t: isEdge ? 'outline' : 'eye',
        organ: ORGAN.STD_C, o: 1,
      });
    }
  }

  return Array.from(cells.values());
}

/* loose-пиксели и группы покачивания — как в v1 */

interface LoosePixel { x: number; y: number; s: number; o: number; driftX: number; dur: number; delay: number; }

function generateLoose(seed: number, count: number): LoosePixel[] {
  return Array.from({ length: count }, (_, i) => {
    const s = seed + i * 41;
    return {
      x: 12 + hash1(s) * 76,
      y: 6 + hash1(s * 3) * 60,
      s: hash1(s * 5) > 0.5 ? 2 : 1,
      o: 0.25 + hash1(s * 7) * 0.3,
      driftX: (hash1(s * 11) - 0.5) * 14,
      dur: 14 + hash1(s * 13) * 12,
      delay: hash1(s * 17) * 18,
    };
  });
}

const SWAY = [11, 13, 9.5, 12.5, 10, 14, 11.5, 9, 12, 10.5, 13.5, 9.8].map((d, i) => ({
  '--swd': `${d}s`,
  '--swdel': `${-i * 1.7}s`,
  '--sw': `${1 + (i % 3) * 0.35}px`,
})) as React.CSSProperties[];

function CellShape({ c, color, bgColor, accentColor }: { c: Cell; color: string; bgColor: string; accentColor: string }) {
  const fill = c.accent ? accentColor : color;
  switch (c.t) {
    case 'solid':
      return <rect x={c.x} y={c.y} width={STEP} height={STEP} fill={fill} opacity={c.o} />;
    case 'cross':
      return (
        <g opacity={c.o}>
          <rect x={c.x + 0.35} y={c.y} width={0.3} height={STEP} fill={fill} />
          <rect x={c.x} y={c.y + 0.35} width={STEP} height={0.3} fill={fill} />
        </g>
      );
    case 'dot':
      return <rect x={c.x + 0.3} y={c.y + 0.3} width={0.4} height={0.4} fill={fill} opacity={c.o} />;
    case 'outline':
      return (
        <g opacity={c.o}>
          <rect x={c.x} y={c.y} width={STEP} height={0.3} fill={fill} />
          <rect x={c.x} y={c.y + STEP - 0.3} width={STEP} height={0.3} fill={fill} />
          <rect x={c.x} y={c.y} width={0.3} height={STEP} fill={fill} />
          <rect x={c.x + STEP - 0.3} y={c.y} width={0.3} height={STEP} fill={fill} />
        </g>
      );
    case 'diamond':
      return <rect x={c.x + 0.25} y={c.y + 0.25} width={0.5} height={0.5} fill={fill} opacity={c.o} transform={`rotate(45 ${c.x + 0.5} ${c.y + 0.5})`} />;
    case 'eye':
      return <rect x={c.x} y={c.y} width={STEP} height={STEP} fill={bgColor} opacity={c.o} />;
  }
}

export default function PixelFlower({
  seed = 7,
  size = 320,
  color = '#8D89C0',
  bgColor = '#F2F0F4',
  accentColor,
  opacity = 0.6,
  tilt = 0,
  className = '',
  style,
}: PixelFlowerProps) {
  const accent = accentColor || color;

  const cells = useMemo(() => generateIris(seed), [seed]);
  const loose = useMemo(() => generateLoose(seed + 5, 8), [seed]);

  const groups = useMemo(() => {
    const by: Cell[][] = Array.from({ length: 12 }, () => []);
    for (const c of cells) by[c.organ].push(c);
    return by;
  }, [cells]);

  return (
    <svg
      viewBox={`0 0 ${GRID_W} ${GRID_H}`}
      width={size}
      height={Math.round(size * (GRID_H / GRID_W))}
      className={`pixel-flower ${className}`}
      style={{
        opacity,
        '--ff-op': opacity,
        transform: tilt ? `rotate(${tilt}deg)` : undefined,
        ...style,
      } as React.CSSProperties}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {groups.map((g, gi) =>
        g.length === 0 ? null : (
          <g key={gi} className="flower-sway" style={SWAY[gi]}>
            {g.map((c, i) => (
              <CellShape key={i} c={c} color={color} bgColor={bgColor} accentColor={accent} />
            ))}
          </g>
        ),
      )}
      {loose.map((p, i) => (
        <rect
          key={`loose-${i}`}
          x={p.x} y={p.y} width={p.s} height={p.s}
          fill={color}
          className="loose-pixel"
          style={{ '--lo': p.o, '--lx': `${p.driftX}px`, '--ld': `${p.dur}s`, '--ldel': `${p.delay}s` } as React.CSSProperties}
        />
      ))}
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/__tests__/pixelFlower.test.ts`
Expected: PASS (3 passed)

- [ ] **Step 5: Typecheck + визуальная проверка**

Run: `cd web && npx tsc --noEmit`
Expected: 0 ошибок. Затем `cd web && npm run dev` — открыть страницу, проверить что цветок рендерится плотнее и тоньше (Spread3Cards и index.tsx используют `variant="iris"` — удалить проп `variant` из мест вызова: `web/src/pages/index.tsx:280`, `web/src/components/ReadingResult.tsx:33`).

- [ ] **Step 6: Commit**

```bash
git add web/src/components/PixelFlower.tsx web/src/components/__tests__/pixelFlower.test.ts web/src/pages/index.tsx web/src/components/ReadingResult.tsx web/package.json web/package-lock.json
git commit -m "feat(art): PixelFlower v2 — x2 grid, filaments, buds, halftone edges"
```

---

### Task 2: Конфиги проводниц + mood в API

**Files:**
- Modify: `web/src/lib/guides.ts` (расширение `GuideMeta` + данные)
- Modify: `web/src/lib/api.ts` (`SpreadResponse.mood`)
- Modify: `web/src/pages/index.tsx` (прокинуть mood в спреды — в Task 6)

**Interfaces:**
- Produces: `GuideMeta.clouds: { bank: 'moon'|'ember'|'storm'; drift: number; tint: string; blend: 'screen'|'multiply'; density: number }`, `GuideMeta.flower: { seed: number; tilt: number }`, `GuideMeta.revealBurst: { symbol: string; count: number }`. `SpreadResponse.mood?: { id: string; name: string } | null`.

- [ ] **Step 1: Расширить `GuideMeta` и данные (`guides.ts`)**

В интерфейс `GuideMeta` после `tag: string;` добавить:

```ts
  // ── Sensory identity (atmosphere engine) ──
  clouds: {
    bank: 'moon' | 'ember' | 'storm';
    drift: number;            // множитель скорости дрейфа
    tint: string;             // CSS filter для тонировки
    blend: 'screen' | 'multiply';
    density: number;          // видимых облачных банков (1-2)
  };
  flower: { seed: number; tilt: number };
  revealBurst: { symbol: string; count: number };
```

В `shadow_walker` добавить:

```ts
    clouds: { bank: 'moon', drift: 0.5, tint: 'brightness(1.05) saturate(0.8) hue-rotate(-10deg)', blend: 'screen', density: 2 },
    flower: { seed: 17, tilt: -3 },
    revealBurst: { symbol: '✦', count: 10 },
```

В `ruin_keeper`:

```ts
    clouds: { bank: 'ember', drift: 0.3, tint: 'sepia(0.5) saturate(1.4) brightness(0.96)', blend: 'multiply', density: 1 },
    flower: { seed: 23, tilt: 2 },
    revealBurst: { symbol: '◆', count: 8 },
```

В `spark_of_chaos`:

```ts
    clouds: { bank: 'storm', drift: 1.3, tint: 'saturate(0.7) contrast(1.05)', blend: 'multiply', density: 2 },
    flower: { seed: 41, tilt: -5 },
    revealBurst: { symbol: '✧', count: 12 },
```

- [ ] **Step 2: `mood` в `SpreadResponse` (`api.ts`)**

```ts
export interface GuideMood {
  id: string;
  name: string;
}

export interface SpreadResponse {
  reading_id: number;
  cards: TarotCardData[];
  interpretation: Interpretation;
  mood?: GuideMood | null;
  remaining?: number | null;
  limit?: number | null;
}
```

- [ ] **Step 3: Typecheck + Commit**

Run: `cd web && npx tsc --noEmit`
Expected: 0 ошибок.

```bash
git add web/src/lib/guides.ts web/src/lib/api.ts
git commit -m "feat(guides): sensory identity configs (clouds/flower/burst) + mood in API"
```

---

### Task 3: Ассеты облаков — `scripts/make_clouds.py`

**Files:**
- Create: `scripts/make_clouds.py`
- Create: `web/public/clouds/moon.png`, `web/public/clouds/ember.png`, `web/public/clouds/storm.png` (генерируются скриптом)

**Interfaces:**
- Produces: 3 PNG-банка облаков 800×400, белая мягкая форма на прозрачном, ≤90KB каждый. Используются Task 4.

- [ ] **Step 1: Write the script**

```python
# scripts/make_clouds.py
"""Генерация живописных банков облаков (мягкая основа для гибрида с дизером).

Запуск: python scripts/make_clouds.py
Выход: web/public/clouds/{moon,ember,storm}.png — белые облака на прозрачном.
Тонировка под проводницу — на фронте через CSS filter (см. guides.ts).
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter
import random

W, H = 800, 400
OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "clouds"

# Параметры «характера» банка: количество/размер клубов, рваность
PRESETS = {
    "moon":  dict(blobs=26, rmin=60, rmax=150, y_bias=0.45, jag=0.0),   # высокие ровные
    "ember": dict(blobs=18, rmin=80, rmax=190, y_bias=0.75, jag=0.1),   # низкие пышные
    "storm": dict(blobs=34, rmin=40, rmax=110, y_bias=0.5,  jag=0.35),  # рваные клочья
}


def value_noise(w: int, h: int, scale: int, rng: random.Random) -> Image.Image:
    """Мягкое серое поле шума как основа облака."""
    small = Image.new("L", (w // scale, h // scale))
    px = small.load()
    for y in range(small.height):
        for x in range(small.width):
            px[x, y] = int(rng.random() * 255)
    return small.resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(6))


def make_bank(name: str, cfg: dict, seed: int) -> Image.Image:
    rng = random.Random(seed)
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    # 1) клубы: эллипсы с мягким краем
    blobs = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(blobs)
    for _ in range(cfg["blobs"]):
        r = rng.randint(cfg["rmin"], cfg["rmax"])
        cx = rng.randint(-r // 2, W - r // 2)
        cy = int(H * cfg["y_bias"] + rng.randint(-H // 5, H // 5))
        d.ellipse([cx - r, cy - r // 2, cx + r, cy + r // 2], fill=255)
    blobs = blobs.filter(ImageFilter.GaussianBlur(24))

    # 2) шумовая фактура внутри формы (живописность)
    noise = value_noise(W, H, 24, rng)
    # рваность: шум вырезает края
    if cfg["jag"] > 0:
        cut = noise.point(lambda v: 255 if v > int(255 * (1 - cfg["jag"])) else 0)
        cut = cut.filter(ImageFilter.GaussianBlur(8))
        blobs = Image.composite(blobs, Image.new("L", (W, H), 0), cut)

    # 3) альфа: форма × вертикальный градиент (снизу плотнее)
    grad = Image.new("L", (W, H), 0)
    dg = ImageDraw.Draw(grad)
    for y in range(H):
        a = int(120 + 100 * (y / H))
        dg.line([(0, y), (W, y)], fill=a)
    alpha = Image.composite(grad, Image.new("L", (W, H), 0), blobs.point(lambda v: min(v, 255)))

    # 4) белый цвет + альфа
    white = Image.new("RGBA", (W, H), (255, 255, 255, 0))
    white.putalpha(alpha)
    img = white

    OUT.mkdir(parents=True, exist_ok=True)
    out_path = OUT / f"{name}.png"
    img.save(out_path, "PNG", optimize=True)
    size_kb = out_path.stat().st_size / 1024
    print(f"{out_path.name}: {size_kb:.0f}KB")
    return img


if __name__ == "__main__":
    make_bank("moon", PRESETS["moon"], seed=7)
    make_bank("ember", PRESETS["ember"], seed=13)
    make_bank("storm", PRESETS["storm"], seed=29)
```

- [ ] **Step 2: Run + проверить размер**

Run: `python scripts/make_clouds.py`
Expected: 3 файла напечатаны, каждый ≤ 90KB. Если больше — усилить `optimize=True`/уменьшить W,H до 640×320 и перегенерировать.

- [ ] **Step 3: Commit**

```bash
git add scripts/make_clouds.py web/public/clouds/
git commit -m "feat(art): procedural cloud banks (moon/ember/storm) for hybrid atmosphere"
```

---

### Task 4: AtmosphereProvider + CloudField + FlowerAnchor

**Files:**
- Create: `web/src/components/atmosphere/AtmosphereContext.tsx`
- Create: `web/src/components/atmosphere/CloudField.tsx`
- Create: `web/src/components/atmosphere/FlowerAnchor.tsx`
- Create: `web/src/components/atmosphere/AtmosphereLayer.tsx`
- Modify: `web/src/styles/globals.css` (блок ATMOSPHERE ENGINE)
- Modify: `web/src/pages/index.tsx` (обернуть в провайдер, заменить старый PixelFlower-блок)
- Modify: `web/src/pages/_app.tsx` — не требуется (провайдер в index)

**Interfaces:**
- Produces: `AtmospherePhase = 'welcome' | 'draw' | 'reveal' | 'reading'`; `useAtmosphere(): { phase: AtmospherePhase; setPhase(p: AtmospherePhase): void; guideId: string }`; `<AtmosphereProvider characterId={string}>{children}</AtmosphereProvider>`; `<AtmosphereLayer />` (без пропсов, читает контекст).

- [ ] **Step 1: Контекст**

```tsx
// web/src/components/atmosphere/AtmosphereContext.tsx
'use client';

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

export type AtmospherePhase = 'welcome' | 'draw' | 'reveal' | 'reading';

interface AtmosphereValue {
  phase: AtmospherePhase;
  setPhase: (p: AtmospherePhase) => void;
  guideId: string;
}

const AtmosphereContext = createContext<AtmosphereValue | null>(null);

export function AtmosphereProvider({ characterId, children }: { characterId: string; children: ReactNode }) {
  const [phase, setPhaseState] = useState<AtmospherePhase>('welcome');
  const setPhase = useCallback((p: AtmospherePhase) => setPhaseState(p), []);
  const value = useMemo(
    () => ({ phase, setPhase, guideId: characterId }),
    [phase, setPhase, characterId],
  );
  return <AtmosphereContext.Provider value={value}>{children}</AtmosphereContext.Provider>;
}

export function useAtmosphere(): AtmosphereValue {
  const ctx = useContext(AtmosphereContext);
  if (!ctx) throw new Error('useAtmosphere must be used within AtmosphereProvider');
  return ctx;
}
```

- [ ] **Step 2: CloudField**

```tsx
// web/src/components/atmosphere/CloudField.tsx
'use client';

import { useMemo } from 'react';
import { useAtmosphere } from './AtmosphereContext';
import { getGuide } from '@/lib/guides';

const BANK_SRC: Record<string, string> = {
  moon: '/clouds/moon.png',
  ember: '/clouds/ember.png',
  storm: '/clouds/storm.png',
};

/**
 * Гибридные облака: живописная PNG-основа (тонированная под проводницу)
 * + пиксель-дизер кромка (dot-паттерн, замаскированный тем же PNG).
 * Только transform/opacity-анимации. Фаза welcome — облака стянуты к центру.
 */
export default function CloudField() {
  const { phase, guideId } = useAtmosphere();
  const guide = getGuide(guideId);
  const src = BANK_SRC[guide.clouds.bank] || BANK_SRC.moon;

  const layers = useMemo(
    () =>
      Array.from({ length: guide.clouds.density }, (_, i) => ({
        top: 4 + i * 34,
        scale: 1.15 - i * 0.18,
        dur: 90 / guide.clouds.drift + i * 30,
        delay: -i * 17,
        op: 0.5 - i * 0.12,
      })),
    [guide.clouds.density, guide.clouds.drift],
  );

  const converged = phase === 'welcome';

  return (
    <div className="cloud-field" aria-hidden="true" data-phase={phase}>
      {layers.map((l, i) => (
        <div
          key={i}
          className={`cloud-layer ${converged ? 'cloud-layer--converged' : ''}`}
          style={
            {
              top: `${l.top}%`,
              animationDuration: `${l.dur}s`,
              animationDelay: `${l.delay}s`,
              transform: `scale(${l.scale})`,
              opacity: l.op,
              mixBlendMode: guide.clouds.blend,
              filter: guide.clouds.tint,
              transition: 'opacity 1.2s ease, transform 1.6s cubic-bezier(0.4, 0, 0.2, 1)',
              '--conv-x': i % 2 === 0 ? '-38%' : '38%',
              '--conv-o': '0.12',
            } as React.CSSProperties
          }
        >
          {/* живописная основа */}
          <div className="cloud-img" style={{ backgroundImage: `url(${src})` }} />
          {/* пиксель-дизер кромка: dot-паттерн под маской того же облака */}
          <div className="cloud-dither" style={{ WebkitMaskImage: `url(${src})`, maskImage: `url(${src})` }} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: FlowerAnchor**

```tsx
// web/src/components/atmosphere/FlowerAnchor.tsx
'use client';

import PixelFlower from '@/components/PixelFlower';
import { useAtmosphere } from './AtmosphereContext';
import { getGuide } from '@/lib/guides';

/**
 * Ирис х2 с фазовыми позициями:
 * welcome — прорастает снизу (мал, по центру-низу);
 * draw    — крупный слева-снизу (≈70vmin);
 * reveal  — как draw + усиленное покачивание (CSS data-phase);
 * reading — уменьшенный на полях справа.
 */
export default function FlowerAnchor() {
  const { phase, guideId } = useAtmosphere();
  const guide = getGuide(guideId);

  const pos =
    phase === 'welcome'
      ? { left: '50%', bottom: '2%', width: '34vmin', transform: 'translateX(-50%)', op: 0.35 }
      : phase === 'reading'
        ? { left: 'auto', right: '-14%', bottom: '8%', width: '40vmin', transform: 'none', op: 0.2 }
        : { left: '-14%', bottom: '-20%', right: 'auto', width: '70vmin', transform: 'none', op: 0.26 };

  return (
    <div
      className="flower-anchor"
      data-phase={phase}
      style={{
        left: pos.left,
        right: pos.right,
        bottom: pos.bottom,
        width: pos.width,
        opacity: pos.op,
        transform: pos.transform,
        transition:
          'all 1.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 1.1s ease',
      }}
      aria-hidden="true"
    >
      <PixelFlower
        seed={guide.flower.seed}
        size={520}
        color={guide.accent}
        bgColor="var(--paper)"
        tilt={guide.flower.tilt}
      />
    </div>
  );
}
```

- [ ] **Step 4: AtmosphereLayer + error-boundary подслоёв**

```tsx
// web/src/components/atmosphere/AtmosphereLayer.tsx
'use client';

import { Component, ReactNode } from 'react';
import CloudField from './CloudField';
import FlowerAnchor from './FlowerAnchor';
import { useAtmosphere } from './AtmosphereContext';

/** Падение подслоя не роняет UI — рендерим остальных без него. */
class SublayerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[atmosphere] sublayer failed:', err);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function LayerBody() {
  const { phase } = useAtmosphere();
  return (
    <div className="atmo-layer" data-reveal-pulse={phase === 'reveal' ? '1' : undefined} aria-hidden="true">
      <SublayerBoundary>
        <CloudField />
      </SublayerBoundary>
      <SublayerBoundary>
        <FlowerAnchor />
      </SublayerBoundary>
    </div>
  );
}

/** Fixed-слой атмосферы между фоном (.app-bg) и контентом. */
export default function AtmosphereLayer() {
  return <LayerBody />;
}
```

- [ ] **Step 4b: Glow подхватывает акцент проводницы** — в `globals.css` заменить фиксированные цвета `.glow-layer` на var-версию (переменные `--guide-accent`/`--guide-accent-dim` задаются в Layout-обёртке, слой внутри неё):

```css
.glow-layer {
  position: absolute;
  inset: 0;
  z-index: 41;
  pointer-events: none;
  background:
    radial-gradient(ellipse 55% 35% at 18% 0%, color-mix(in srgb, var(--guide-accent, #8d89c0) 14%, rgba(248, 246, 249, 0.3)) 0%, transparent 70%),
    radial-gradient(ellipse 45% 30% at 85% 100%, rgba(217, 223, 234, 0.30) 0%, transparent 70%);
  animation: glow-breathe 16s ease-in-out infinite;
  transition: background 0.8s ease;
}
```

- [ ] **Step 4c: Кроссфейд при смене проводницы** — в `CloudField.tsx` слои рендерить с `key={guideId}` и fade-in анимацией (старый слой исчезает мгновенно, новый проявляется 600мс):

В `CloudField` добавить в style каждого слоя: `animation: cloud-drift ... , cloud-fade 0.6s ease-out 1` — проще: обернуть весь `cloud-field` в div с `key={guideId}` и классом:

```css
.cloud-fade-in {
  animation: cloud-fade 0.6s ease-out 1;
}

@keyframes cloud-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

```tsx
// в return CloudField:
<div key={guideId} className="cloud-fade-in" style={{ position: 'absolute', inset: 0 }}>
  {layers.map(...)}  {/* как в Step 2 */}
</div>
```

- [ ] **Step 5: CSS в `globals.css`** (добавить перед блоком REDUCED MOTION)

```css
/* ================================================================
   ATMOSPHERE ENGINE — облака (гибрид) + цветок-якорь
   ================================================================ */
.atmo-layer {
  position: fixed;
  inset: 0;
  z-index: 0; /* над .app-bg (z:-1), под контентом (z:10+) */
  pointer-events: none;
  overflow: hidden;
}

.cloud-field {
  position: absolute;
  inset: -6% -12%;
}

.cloud-layer {
  position: absolute;
  left: 0;
  width: 100%;
  height: 46%;
  animation: cloud-drift linear infinite;
  will-change: transform;
}

.cloud-layer--converged {
  transform: translateX(var(--conv-x, 0)) scale(0.72) !important;
  opacity: var(--conv-o, 0.1) !important;
}

@keyframes cloud-drift {
  from { translate: -7% 0; }
  to   { translate: 7% 0; }
}

.cloud-img {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
}

.cloud-dither {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, rgba(55, 58, 77, 0.5) 0.7px, transparent 1px) 0 0 / 4px 4px;
  opacity: 0.16;
  mix-blend-mode: multiply;
}

.flower-anchor {
  position: absolute;
  pointer-events: none;
}

/* reveal: цветок вздрагивает — усиленное покачивание на 1 цикл */
.flower-anchor[data-phase='reveal'] .flower-sway {
  animation-duration: calc(var(--swd, 11s) * 0.45);
}
```

И в существующий блок `@media (prefers-reduced-motion: reduce)` добавить в список: `.cloud-layer, .flower-anchor` со статичным состоянием:

```css
  .cloud-layer {
    animation: none !important;
    transform: none !important;
  }
```

- [ ] **Step 6: Wiring в `index.tsx`**

В `Home()` обернуть возвращаемое: `<AtmosphereProvider characterId={characterId}>` вокруг `<>...</>` (весь текущий JSX), и внутри `<Layout ...>` первым ребёнком добавить `<AtmosphereLayer />` (Layout рендерит children внутрь скролл-контейнера — слой должен быть fixed, поэтому разместить его внутри Layout-обёртки допустимо; альтернатива — перед `<Layout>`). Разместить перед `<Layout>`:

```tsx
import { AtmosphereProvider, useAtmosphere } from '@/components/atmosphere/AtmosphereContext';
import AtmosphereLayer from '@/components/atmosphere/AtmosphereLayer';
```

В `handleWelcomeComplete`: `setPhase('daily' === spreadType ? 'draw' : 'draw')` — через хук внутри нового внутреннего компонента. Так как `Home` рендерит провайдер, фазы нужно ставить изнутри — создать внутренний компонент `AppShell` (весь текущий контент `Home`), а `Home` = провайдер + `AppShell`. В `AppShell`: `const { setPhase } = useAtmosphere();`; в `handleWelcomeComplete` → `setPhase('draw')`; в `handleCatalogSelect` → `setPhase('daily'|'spread' ? 'draw' : 'draw')` → просто `setPhase('draw')`. Удалить старый блок PixelFlower из spread-секции (строки с `<PixelFlower seed={17} size={560} ...>` — цветок теперь в FlowerAnchor).

- [ ] **Step 7: Typecheck + визуальная проверка**

Run: `cd web && npx tsc --noEmit && npm run dev`
Expected: 0 ошибок; на экране видны дрейфующие облака (тонированные), цветок слева-снизу крупный.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/atmosphere/ web/src/styles/globals.css web/src/pages/index.tsx
git commit -m "feat(atmosphere): provider, cloud field (hybrid dither edge), flower anchor, phase wiring"
```

---

### Task 5: Reveal-оркестрация (раскрытие карты)

**Files:**
- Modify: `web/src/components/Spread1Card.tsx`
- Modify: `web/src/components/Spread3Cards.tsx` (аналогично, `onReveal` в общем handleFlip)

**Interfaces:**
- Consumes: `useAtmosphere().setPhase`. Спреды получают фазу напрямую из контекста (без новых пропсов).

- [ ] **Step 1: `Spread1Card` — эмит фаз**

В `Spread1Card.tsx`:

```tsx
import { useAtmosphere } from './atmosphere/AtmosphereContext';
```

внутри компонента:

```tsx
  const { setPhase } = useAtmosphere();
```

в `handleFlip`:

```tsx
  const handleFlip = useCallback(() => {
    setFlipped(true);
    setPhase('reveal');
    // после анимации раскрытия — фаза reading (толкование уже отрисовано)
    setTimeout(() => setPhase('reading'), 1400);
  }, [setPhase]);
```

- [ ] **Step 2: `Spread3Cards` — тот же паттерн**

В `Spread3Cards.tsx`:

```tsx
import { useAtmosphere } from './atmosphere/AtmosphereContext';
```

внутри компонента:

```tsx
  const { setPhase } = useAtmosphere();
```

в `handleFlip` — reveal на каждый переворот:

```tsx
  const handleFlip = useCallback((index: number) => {
    setFlippedCards((prev) => {
      const next = [...prev];
      next[index] = true;
      return next;
    });
    setPhase('reveal');
  }, [setPhase]);
```

в `useEffect` над `flippedCards` — reading, когда перевёрнуты все:

```tsx
  useEffect(() => {
    if (flippedCards.every(Boolean)) {
      setPhase('reading');
      resultTimer.current = setTimeout(() => setShowResult(true), FLIP_ANIM_MS + 50);
    } else {
      ...
```

(в массив зависимостей эффекта добавить `setPhase`.)

- [ ] **Step 3: Typecheck + ручная проверка**

Run: `cd web && npx tsc --noEmit && npm run dev`
Expected: при перевороте карты облака расходятся к краям и бледнеют (1.2s), цветок «вздрагивает», затем фаза reading — цветок уплывает на поля.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Spread1Card.tsx web/src/components/Spread3Cards.tsx
git commit -m "feat(atmosphere): reveal phase orchestration on card flip"
```

---

### Task 6: ReadingResult v2 — манифест-плашка

**Files:**
- Rewrite: `web/src/components/ReadingResult.tsx`
- Modify: `web/src/styles/globals.css` (блок READING v2)
- Modify: `web/src/components/Spread1Card.tsx`, `web/src/components/Spread3Cards.tsx`, `web/src/components/SpreadDaily.tsx` (прокинуть `mood`)

**Interfaces:**
- Consumes: `GuideMeta`, `Interpretation`. Новый опциональный проп `moodName?: string`.

- [ ] **Step 1: CSS блока READING v2 в `globals.css`** (заменить секцию `READING — editorial-подача`)

```css
/* ================================================================
   READING v2 — манифест-плашка: иерархия + построчное проявление
   ================================================================ */
.reading-card {
  position: relative;
  background:
    linear-gradient(to bottom, color-mix(in srgb, var(--guide-accent, #6f6ca4) 7%, transparent), transparent 34%),
    rgba(248, 246, 249, 0.92);
  border-top: 1px solid var(--line-strong);
  border-bottom: 1px solid var(--line-strong);
  border-radius: 2px;
}

.reading-headline {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--line);
  position: relative;
}

/* двойной рулерт */
.reading-headline::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -4px;
  height: 1px;
  background: linear-gradient(90deg, var(--line), transparent);
}

.reading-sigils {
  font-family: var(--font-pixel);
  font-size: 10px;
  letter-spacing: 0.3em;
  color: var(--guide-accent, var(--accent));
}

.reading-intro {
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 25px;
  line-height: 1.28;
  color: var(--guide-accent-deep, var(--deep));
}

.reading-body {
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.8;
  color: var(--ink);
}

/* буквица — пиксельная, в цвет акцента, 2 строки */
.reading-body::first-letter {
  font-family: var(--font-pixel);
  font-size: 2.1em;
  line-height: 0.85;
  color: var(--guide-accent, var(--accent-blue));
  float: left;
  padding: 4px 8px 0 0;
  font-weight: 600;
}

.reading-ordinal {
  font-family: var(--font-pixel);
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--guide-accent, var(--accent));
  display: inline-block;
  min-width: 26px;
}

/* построчное проявление — «фото в проявителе» */
.reveal-line {
  opacity: 0;
  filter: blur(3px);
  animation: reveal-develop 0.9s ease-out forwards;
  animation-delay: var(--rd, 0s);
}

@keyframes reveal-develop {
  0%   { opacity: 0; filter: blur(3px); transform: translateY(6px); }
  60%  { opacity: 1; filter: blur(0.4px); }
  100% { opacity: 1; filter: blur(0); transform: translateY(0); }
}
```

В блок `@media (prefers-reduced-motion: reduce)` добавить: `.reveal-line { animation: none !important; opacity: 1 !important; filter: none !important; }`

- [ ] **Step 2: Rewrite `ReadingResult.tsx`**

```tsx
'use client';

import { getGuide } from '@/lib/guides';
import FollowupChat from './FollowupChat';

interface Interpretation {
  intro: string;
  short_answer: string;
  card_meaning: string[] | string;
  advice: string;
}

interface ReadingResultProps {
  interpretation: Interpretation;
  characterId?: string;
  readingId?: number | null;
  moodName?: string;
  className?: string;
}

export default function ReadingResult({ interpretation, characterId, readingId = null, moodName, className = '' }: ReadingResultProps) {
  const { intro, short_answer, card_meaning, advice } = interpretation;
  const guide = getGuide(characterId);
  const meanings = Array.isArray(card_meaning) ? card_meaning : card_meaning ? [card_meaning] : [];

  const adviceLabel =
    guide.id === 'ruin_keeper' ? 'слово весты'
    : guide.id === 'spark_of_chaos' ? 'от лилит'
    : 'шёпот селены';

  return (
    <div className={`px-5 pb-5 relative ${className}`}>
      <div className="section-label mb-3 relative z-10">
        <span>толкование{moodName ? ` · ${moodName}` : ''}</span>
      </div>

      <div
        className="relative reading-card noise-bg px-4 py-5"
        style={{
          '--guide-accent': guide.accent,
          '--guide-accent-deep': guide.accentDeep,
          '--guide-accent-dim': guide.accentDim,
        } as React.CSSProperties}
      >
        {/* шапка: сигилы + имя */}
        <div className="reading-headline relative z-10 reveal-line" style={{ '--rd': '0.05s' } as React.CSSProperties}>
          <span className="reading-sigils" aria-hidden="true">
            {guide.cornerSymbols.tl} {guide.cornerSymbols.tr}
          </span>
          <span className="tech-label">{guide.name} · {guide.subtitle}</span>
          <span className="ml-auto tech-label band-text-dim" style={{ color: 'var(--ink-faint)' }}>
            {guide.tag}
          </span>
        </div>

        {/* интро — голос проводницы */}
        {intro && (
          <div className="relative z-10 mb-4 flex gap-3 reveal-line" style={{ '--rd': '0.25s' } as React.CSSProperties}>
            <span className="quote-mark" style={{ color: guide.accentDeep }} aria-hidden="true">«</span>
            <p className="reading-intro pt-1">{intro}</p>
          </div>
        )}

        {/* главное толкование — с буквицей */}
        {short_answer && (
          <div className="relative z-10 mb-4 reveal-line" style={{ '--rd': '0.5s' } as React.CSSProperties}>
            <p className="reading-body">{short_answer}</p>
          </div>
        )}

        {/* разбор по картам — ординалы + линейки */}
        {meanings.length > 0 && (
          <div className="relative z-10 mb-4 reveal-line" style={{ '--rd': '0.8s' } as React.CSSProperties}>
            <div className="reading-section-label mb-2" style={{ color: guide.accentDeep }}>
              карты говорят
            </div>
            <div className="space-y-3">
              {meanings.map((meaning, i) => (
                <div key={i} className="flex gap-2 items-baseline">
                  <span className="reading-ordinal">{String(i + 1).padStart(2, '0')}</span>
                  <p className="flex-1 font-sans text-[14px] leading-[1.7] text-[color:var(--ink)] opacity-92 border-b border-[color:var(--line)] pb-2">
                    {meaning}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* совет — маргиналия */}
        {advice && (
          <div className="marginalia mt-5 pt-1 relative z-10 reveal-line" style={{ '--rd': '1.05s' } as React.CSSProperties}>
            <div className="tech-label mb-1.5" style={{ color: guide.accentDeep }}>
              {adviceLabel}
            </div>
            <p className="font-serif text-[20px] font-semibold leading-[1.4]" style={{ color: 'var(--ink)' }}>
              {advice}
            </p>
          </div>
        )}
      </div>

      {readingId !== null && (
        <FollowupChat readingId={readingId} characterId={characterId} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Прокинуть `mood` из спредов**

В `Spread1Card.tsx`: `ReadingData` расширить `mood?: { id: string; name: string } | null` (api.ts уже возвращает), передать `<ReadingResult ... moodName={data.mood?.name} />`. То же в `Spread3Cards.tsx` и `SpreadDaily.tsx` (в daily — mood тоже приходит с бэка).

- [ ] **Step 4: Typecheck + ручная проверка**

Run: `cd web && npx tsc --noEmit && npm run dev`
Expected: плашка с шапкой-сигилами, буквицей, ординалами; текст проявляется построчно.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ReadingResult.tsx web/src/styles/globals.css web/src/components/Spread1Card.tsx web/src/components/Spread3Cards.tsx web/src/components/SpreadDaily.tsx
git commit -m "feat(reading): manifest plate v2 — headline, drop cap, ordinals, staggered develop-in"
```

---

### Task 7: Welcome-ритуал + reveal-вспышка

**Files:**
- Modify: `web/src/components/WelcomeAnimation.tsx` (минимально — цветок прорастает, облака уже реагируют фазой)
- Modify: `web/src/styles/globals.css` (усиление burst)

- [ ] **Step 1: Burst акцентом проводницы при reveal** — атрибут `data-reveal-pulse` на `.atmo-layer` уже ставится в Task 4 (Step 4). Добавить только CSS в `globals.css`:

```css
/* reveal: короткая вспышка-дыхание всей атмосферы */
.atmo-layer[data-reveal-pulse='1'] {
  animation: atmo-pulse 0.9s ease-out 1;
}

@keyframes atmo-pulse {
  0% { opacity: 1; }
  25% { opacity: 0.55; }
  100% { opacity: 1; }
}
```

- [ ] **Step 2: Welcome — цветок прорастает.** В `FlowerAnchor` фаза welcome уже даёт малый цветок по центру-низу. В `WelcomeAnimation.tsx` изменений не требуется (boot-текст уже per-guide). Проверить визуально, что цветок не перекрывает boot-текст (boot в центре — ок).

- [ ] **Step 3: Typecheck + полный ручной прогон трёх вау-моментов**

Run: `cd web && npx tsc --noEmit && npm run dev`
Прогнать: вход (облака стянуты, boot, цветок растёт) → вопрос → карты → переворот (расхождение облаков, вспышка, вздрагивание цветка) → толкование (построчное проявление, цветок на полях). Смена проводницы в настройках — кроссфейд атмосферы.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/atmosphere/AtmosphereLayer.tsx web/src/styles/globals.css
git commit -m "feat(atmosphere): reveal pulse flash + welcome sprout polish"
```

---

### Task 8: Перф-проход, reduced-motion, прод-сборка, QA

**Files:**
- Modify: `web/src/styles/globals.css` (финальный reduced-motion)
- Rebuild: `web/` → `static/webapp`

- [ ] **Step 1: Финальный reduced-motion** — убедиться, что в `@media (prefers-reduced-motion: reduce)` отключены: `.cloud-layer`, `.reveal-line` (статично видим), `.flower-sway`, `.atmo-layer` (без pulse-анимации).

- [ ] **Step 2: Перф-проверка**

Run: `cd web && npm run build`
Expected: сборка без ошибок, экспорт в `static/webapp`. Проверить размеры: `du -sh static/webapp/_next/static/media static/webapp/clouds` — суммарно новые ассеты ≤ 250KB. Проверить в DevTools (CPU 6x throttle): анимации в Compositing (нет Layout Shift, нет long tasks > 50ms от атмосферы).

- [ ] **Step 3: Визуальный QA на устройстве**

Чек-лист (Telegram, реальный телефон):
- iPhone SE-класс: вход → расклад 1 → раскрытие → толкование — плавно, без лагов.
- Бюджетный Android: то же.
- Смена проводницы ×3 — кроссфейд, нет миганий.
- Оффлайн (airplane mode после загрузки): спред-экран открывается, атмосфера деградирует без ошибок в консоли.
- prefers-reduced-motion (эмуляция): всё статично, текст виден сразу.

- [ ] **Step 4: Commit прод-сборки**

```bash
git add static/webapp web/src/styles/globals.css
git commit -m "chore: rebuild static webapp (atmosphere engine release)"
```
