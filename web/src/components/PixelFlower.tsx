'use client';

import { useMemo } from 'react';

/**
 * Пиксель-ирис по схеме-референсу (вышивка / chart):
 * четыре типа ячеек — solid (заливка), cross (крестик), dot (точка),
 * outline (пустой квадрат с контуром). Купол стандартов — кружевной,
 * без сплошной заливки; левый фол — плотный с шахматным дизером;
 * правый фол — диагональная штриховка 45°; в центре — «глаз» цвета фона;
 * стебель мерцает solid/cross/dot; внизу — росток из точек.
 */

interface PixelFlowerProps {
  seed?: number;
  size?: number;
  /** цвет элементов (белый на синем, акцент на светлом) */
  color?: string;
  /** цвет «глаза» в центре — обычно цвет подложки */
  bgColor?: string;
  /** редкий акцент внутри рисунка (на светлом фоне) */
  accentColor?: string;
  accentRate?: number;
  opacity?: number;
  dense?: boolean;
  variant?: 'iris' | 'rosette';
  className?: string;
  style?: React.CSSProperties;
}

function hash1(seed: number): number {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

const STEP = 2;
const GRID_W = 100;
const GRID_H = 164;

type CellType = 'solid' | 'cross' | 'dot' | 'outline' | 'eye';

interface Cell {
  x: number;
  y: number;
  t: CellType;
  organ: number;
  o: number;
  accent?: boolean;
}

// органы для фаз покачивания (лёгкий ветер)
const ORGAN_STD_L = 0;
const ORGAN_STD_C = 1;
const ORGAN_STD_R = 2;
const ORGAN_FALL_L = 3;
const ORGAN_FALL_R = 4;
const ORGAN_FALL_B = 5;
const ORGAN_STEM = 6;
const ORGAN_SPROUT = 7;

interface PetalDef {
  organ: number;
  cx: number;
  cy: number;
  angle: number;      // ось, радианы
  len: number;
  halfW: number;      // макс. полуширина
  bend: number;       // кривизна: смещение кончика перпендикулярно оси
  kind: 'lacey' | 'drop' | 'hatch' | 'mist';
}

const PETALS: PetalDef[] = [
  // купол стандартов — три волнистых лепестка вверх
  { organ: ORGAN_STD_L, cx: 50, cy: 54, angle: -Math.PI / 2 - 0.62, len: 30, halfW: 8.5, bend: -6, kind: 'lacey' },
  { organ: ORGAN_STD_C, cx: 50, cy: 54, angle: -Math.PI / 2, len: 34, halfW: 10, bend: 0, kind: 'lacey' },
  { organ: ORGAN_STD_R, cx: 50, cy: 54, angle: -Math.PI / 2 + 0.62, len: 30, halfW: 8.5, bend: 6, kind: 'lacey' },
  // фолы
  { organ: ORGAN_FALL_L, cx: 50, cy: 56, angle: Math.PI - 0.22, len: 32, halfW: 13, bend: -5, kind: 'drop' },
  { organ: ORGAN_FALL_R, cx: 50, cy: 56, angle: 0.38, len: 29, halfW: 12, bend: 7, kind: 'hatch' },
  { organ: ORGAN_FALL_B, cx: 50, cy: 56, angle: Math.PI / 2 + 0.1, len: 17, halfW: 8, bend: 2, kind: 'mist' },
];

function snap(v: number): number {
  return Math.round(v / STEP) * STEP - STEP / 2;
}

/** Заливка лепестка «прокатом» вдоль изогнутой оси */
function sweepPetal(def: PetalDef, seed: number, cells: Map<string, Cell>) {
  const ax = Math.cos(def.angle);
  const ay = Math.sin(def.angle);
  const nx = -ay;
  const ny = ax;

  const stations = Math.round(def.len / STEP);
  let k = 0;
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    // ось с кривизной
    const px = def.cx + ax * def.len * t + nx * def.bend * t * t;
    const py = def.cy + ay * def.len * t + ny * def.bend * t * t;
    // профиль полуширины: капля с округлым кончиком
    const w = def.halfW * Math.sin(Math.PI * Math.pow(Math.max(t, 0.02), 0.72)) * (0.86 + 0.28 * hash1(seed + i * 3));

    const offs = Math.ceil(w / STEP);
    for (let j = -offs; j <= offs; j++) {
      const off = j * STEP;
      if (Math.abs(off) > w) continue;
      const x = snap(px + nx * off);
      const y = snap(py + ny * off);
      const key = `${x},${y}`;
      if (cells.has(key)) continue;

      const gx = Math.round(x / STEP);
      const gy = Math.round(y / STEP);
      const edge = Math.abs(off) > w - STEP * 1.4;
      const h = hash1(seed * 7 + i * 13 + j * 29);
      let t_: CellType = 'dot';
      let o = 0.9;

      if (edge) {
        // тонкий пиксельный контур лепестка
        t_ = 'solid';
        o = 0.85;
      } else {
        switch (def.kind) {
          case 'lacey':
            // кружево: кресты, точки, пустые квадраты; почти без заливки
            t_ = h < 0.46 ? 'cross' : h < 0.78 ? 'dot' : h < 0.92 ? 'outline' : 'solid';
            o = t_ === 'solid' ? 0.95 : 0.8;
            break;
          case 'drop':
            // плотное основание → шахматный дизер → редкие точки
            if (t < 0.38) { t_ = 'solid'; o = 0.95; }
            else if (t < 0.72) {
              t_ = (gx + gy) % 2 === 0 ? 'solid' : 'dot';
              o = 0.9;
            } else {
              t_ = h < 0.55 ? 'dot' : 'outline';
              o = 0.7;
            }
            break;
          case 'hatch':
            // строгая диагональная штриховка 45°, к кончику — точки
            if (t > 0.8) { t_ = h < 0.5 ? 'dot' : 'outline'; o = 0.7; }
            else {
              const phase = (gx + gy) % 4;
              t_ = phase < 2 ? 'solid' : 'cross';
              o = 0.9;
            }
            break;
          case 'mist':
            t_ = h < 0.6 ? 'dot' : 'outline';
            o = 0.55;
            break;
        }
      }

      cells.set(key, {
        x, y, t: t_, organ: def.organ, o,
        accent: hash1(seed + i * 31 + j * 17) < 0.028,
      });
      k++;
    }
  }
  return k;
}

/** Схема ириса: купол + фолы + глаз + стебель + росток */
function generateIris(seed: number): Cell[] {
  const cells = new Map<string, Cell>();

  // стебель — дуга влево-вниз, мерцание solid/cross/dot
  const stemPts: Array<[number, number]> = [];
  const S = 22;
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    const x = 50 - 4 * t - 14 * t * t;
    const y = 66 + 90 * t;
    stemPts.push([x, y]);
  }
  stemPts.forEach(([x, y], i) => {
    const key = `${snap(x)},${snap(y)}`;
    if (!cells.has(key)) {
      cells.set(key, {
        x: snap(x), y: snap(y),
        t: i % 3 === 0 ? 'solid' : i % 3 === 1 ? 'cross' : 'dot',
        organ: ORGAN_STEM,
        o: 0.85,
      });
    }
  });

  // росток — два ряда точек, уравновешивает композицию
  for (let i = 0; i < 11; i++) {
    const key1 = `${snap(64)},${snap(160 - i * 2)}`;
    const key2 = `${snap(66)},${snap(159 - i * 2)}`;
    if (!cells.has(key1)) cells.set(key1, { x: snap(64), y: snap(160 - i * 2), t: 'dot', organ: ORGAN_SPROUT, o: 0.75 });
    if (!cells.has(key2)) cells.set(key2, { x: snap(66), y: snap(159 - i * 2), t: i % 2 ? 'dot' : 'cross', organ: ORGAN_SPROUT, o: 0.6 });
  }

  // лепестки поверх стебля
  for (const p of PETALS) sweepPetal(p, seed + p.organ * 97, cells);

  // «глаз» — залитый квадрат цвета подложки в белом контуре
  const eyeC: Cell[] = [];
  const ex = snap(50);
  const ey = snap(55);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const key = `${ex + dx * STEP},${ey + dy * STEP}`;
      if (Math.abs(dx) <= 0 && Math.abs(dy) <= 0) continue;
      cells.set(key, {
        x: ex + dx * STEP, y: ey + dy * STEP,
        t: Math.abs(dx) === 1 || Math.abs(dy) === 1 ? 'outline' : 'eye',
        organ: ORGAN_STD_C, o: 1,
      });
    }
  }
  cells.set(`${ex},${ey}`, { x: ex, y: ey, t: 'eye', organ: ORGAN_STD_C, o: 1 });
  eyeC.length; // (читаемость)

  return Array.from(cells.values());
}

/* ── Старая розетка (для мелкого декора) ── */

interface Pixel {
  x: number; y: number; s: number; o: number;
  sector: number;
  accent?: boolean;
}

function generateRosette(seed: number, dense: boolean, accentRate: number): Pixel[] {
  const pixels: Pixel[] = [];
  const PETALS = 8;
  const CORE = 4;
  const R_MAX = dense ? 46 : 38;
  let i = 0;
  for (let gy = -R_MAX; gy <= R_MAX; gy += STEP) {
    for (let gx = -R_MAX; gx <= R_MAX; gx += STEP) {
      const r = Math.sqrt(gx * gx + gy * gy);
      if (r > R_MAX) continue;
      const ang = Math.atan2(gy, gx);
      const petalWave = Math.abs(Math.cos(PETALS * 0.5 * ang));
      const petalEdge = CORE + (R_MAX - CORE) * Math.pow(petalWave, 1.6);
      if (r > petalEdge) continue;
      const t = (r - CORE) / Math.max(1, petalEdge - CORE);
      const density = t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.45);
      const jitter = hash1(seed + i++);
      if (jitter > density) continue;
      const vein = Math.abs(Math.sin(PETALS * ang + r * 0.35));
      pixels.push({
        x: 50 + gx + (hash1(seed + i * 3) - 0.5) * 1.2,
        y: 50 + gy + (hash1(seed + i * 5) - 0.5) * 1.2,
        s: t < 0.35 ? 2 : (jitter > density * 0.5 ? 1 : 2),
        o: Math.min(1, 0.25 + 0.5 * (1 - t) * (0.5 + 0.5 * vein)),
        sector: ((Math.round((ang + Math.PI) / (Math.PI * 2) * PETALS) % PETALS) + PETALS) % PETALS,
        accent: hash1(seed + i * 7) < accentRate,
      });
    }
  }
  for (let a = 0; a < 24; a++) {
    const ang = (a / 24) * Math.PI * 2;
    pixels.push({ x: 50 + Math.cos(ang) * 3, y: 50 + Math.sin(ang) * 3, s: 1, o: 0.9, sector: a % 8 });
  }
  return pixels;
}

interface LoosePixel {
  x: number; y: number; s: number; o: number;
  driftX: number; dur: number; delay: number;
}

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

const SWAY = [11, 13, 9.5, 12.5, 10, 14, 11.5, 9].map((d, i) => ({
  '--swd': `${d}s`,
  '--swdel': `${-i * 1.7}s`,
  '--sw': `${1 + (i % 3) * 0.35}px`,
})) as React.CSSProperties[];

/** Отрисовка одной ячейки схемы */
function CellShape({ c, color, bgColor, accentColor }: { c: Cell; color: string; bgColor: string; accentColor: string }) {
  const fill = c.accent ? accentColor : color;
  const o = c.o;
  switch (c.t) {
    case 'solid':
      return <rect x={c.x} y={c.y} width={STEP} height={STEP} fill={fill} opacity={o} />;
    case 'cross':
      return (
        <g opacity={o}>
          <rect x={c.x + 0.75} y={c.y} width={0.5} height={STEP} fill={fill} />
          <rect x={c.x} y={c.y + 0.75} width={STEP} height={0.5} fill={fill} />
        </g>
      );
    case 'dot':
      return <rect x={c.x + 0.65} y={c.y + 0.65} width={0.7} height={0.7} fill={fill} opacity={o} />;
    case 'outline':
      return (
        <g opacity={o}>
          <rect x={c.x} y={c.y} width={STEP} height={0.5} fill={fill} />
          <rect x={c.x} y={c.y + STEP - 0.5} width={STEP} height={0.5} fill={fill} />
          <rect x={c.x} y={c.y} width={0.5} height={STEP} fill={fill} />
          <rect x={c.x + STEP - 0.5} y={c.y} width={0.5} height={STEP} fill={fill} />
        </g>
      );
    case 'eye':
      return <rect x={c.x + 0.25} y={c.y + 0.25} width={STEP - 0.5} height={STEP - 0.5} fill={bgColor} opacity={o} />;
  }
}

export default function PixelFlower({
  seed = 7,
  size = 320,
  color = '#8D89C0',
  bgColor = '#F2F0F4',
  accentColor,
  accentRate = 0,
  opacity = 0.6,
  dense = false,
  variant = 'iris',
  className = '',
  style,
}: PixelFlowerProps) {
  const isIris = variant === 'iris';
  const accent = accentColor || color;

  const cells = useMemo(
    () => (isIris ? generateIris(seed) : []),
    [isIris, seed],
  );
  const pixels = useMemo(
    () => (isIris ? [] : generateRosette(seed, dense, accentRate)),
    [isIris, seed, dense, accentRate],
  );
  const loose = useMemo(() => generateLoose(seed + 5, isIris ? 6 : 7), [seed, isIris]);

  // группы покачивания
  const groups = useMemo(() => {
    if (isIris) {
      const by: Cell[][] = Array.from({ length: 8 }, () => []);
      for (const c of cells) by[c.organ].push(c);
      return by;
    }
    return [];
  }, [isIris, cells]);

  const sectors = useMemo(() => {
    const by: Pixel[][] = Array.from({ length: 8 }, () => []);
    for (const p of pixels) by[p.sector].push(p);
    return by;
  }, [pixels]);

  return (
    <svg
      viewBox={isIris ? `0 0 ${GRID_W} ${GRID_H}` : '0 0 100 100'}
      width={size}
      height={isIris ? Math.round(size * (GRID_H / GRID_W)) : size}
      className={`pixel-flower ${className}`}
      style={{ opacity, '--ff-op': opacity, ...style } as React.CSSProperties}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {isIris
        ? groups.map((g, gi) =>
            g.length === 0 ? null : (
              <g key={gi} className="flower-sway" style={SWAY[gi]}>
                {g.map((c, i) => (
                  <CellShape key={i} c={c} color={color} bgColor={bgColor} accentColor={accent} />
                ))}
              </g>
            ),
          )
        : sectors.map((group, si) =>
            group.length === 0 ? null : (
              <g key={si} className="flower-sway" style={SWAY[si]}>
                {group.map((p, i) => (
                  <rect
                    key={i}
                    x={p.x}
                    y={p.y}
                    width={p.s}
                    height={p.s}
                    fill={p.accent ? accent : color}
                    opacity={p.o}
                  />
                ))}
              </g>
            ),
          )}

      {loose.map((p, i) => (
        <rect
          key={`loose-${i}`}
          x={p.x}
          y={p.y}
          width={p.s}
          height={p.s}
          fill={color}
          className="loose-pixel"
          style={
            {
              '--lo': p.o,
              '--lx': `${p.driftX}px`,
              '--ld': `${p.dur}s`,
              '--ldel': `${p.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </svg>
  );
}
