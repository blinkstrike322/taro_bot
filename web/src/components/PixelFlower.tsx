'use client';

import { useMemo } from 'react';

interface PixelFlowerProps {
  /** seed для детерминированной генерации */
  seed?: number;
  /** базовый размер (ширина), px */
  size?: number;
  /** цвет лепестков */
  color?: string;
  /** редкий глубокий акцент внутри artwork */
  accentColor?: string;
  /** доля акцентных пикселей, 0..1 (обычно 0.03) */
  accentRate?: number;
  /** общая прозрачность 0..1 */
  opacity?: number;
  /** если true — лепестков больше, растворение дальше (для фонов) */
  dense?: boolean;
  /** форма: розетка или стебель с листьями */
  variant?: 'rosette' | 'stem';
  className?: string;
  style?: React.CSSProperties;
}

function seededRand(seed: number): number {
  return Math.abs((Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1);
}

interface Pixel {
  x: number;
  y: number;
  s: number;
  o: number;
  /** 0..7 — сектор для фазового покачивания */
  sector: number;
  /** редкий глубокий акцент */
  accent?: boolean;
}

interface LoosePixel {
  x: number;
  y: number;
  s: number;
  o: number;
  driftX: number;
  dur: number;
  delay: number;
}

/** Розетка: ботаническое ядро → дизер → отдельные пиксели */
function generateRosette(seed: number, dense: boolean, accentRate: number): Pixel[] {
  const pixels: Pixel[] = [];
  const PETALS = 8;
  const CORE = 4;
  const R_MAX = dense ? 46 : 38;
  const STEP = 2.2;
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
      const jitter = seededRand(seed + i++);
      if (jitter > density) continue;

      const vein = Math.abs(Math.sin(PETALS * ang + r * 0.35));
      const opacity = 0.25 + 0.5 * (1 - t) * (0.5 + 0.5 * vein);
      const s = t < 0.35 ? 2 : (jitter > density * 0.5 ? 1 : 2);

      pixels.push({
        x: 50 + gx + (seededRand(seed + i * 3) - 0.5) * 1.2,
        y: 50 + gy + (seededRand(seed + i * 5) - 0.5) * 1.2,
        s,
        o: Math.min(1, opacity),
        sector: ((Math.round((ang + Math.PI) / (Math.PI * 2) * PETALS) % PETALS) + PETALS) % PETALS,
        accent: seededRand(seed + i * 7) < accentRate,
      });
    }
  }

  for (let a = 0; a < 24; a++) {
    const ang = (a / 24) * Math.PI * 2;
    pixels.push({
      x: 50 + Math.cos(ang) * 3,
      y: 50 + Math.sin(ang) * 3,
      s: 1,
      o: 0.9,
      sector: a % 8,
    });
  }

  return pixels;
}

/** Стебель: вертикальный стебель + пара листьев + розетка-соцветие сверху */
function generateStem(seed: number, accentRate: number): Pixel[] {
  const pixels: Pixel[] = [];
  let i = 0;

  // соцветие — компактная розетка с центром (50, 38)
  const rosette = generateRosette(seed + 900, false, accentRate);
  for (const p of rosette) {
    pixels.push({ ...p, y: p.y * 0.72 + 2 });
  }

  // стебель — слегка изогнутая колонка пикселей вниз
  for (let y = 70; y < 158; y += 2.4) {
    const bend = Math.sin((y - 70) * 0.05 + seed) * 2.2;
    pixels.push({
      x: 50 + bend + (seededRand(seed + i) - 0.5) * 1.4,
      y,
      s: 2,
      o: 0.55 + seededRand(seed + i * 3) * 0.25,
      sector: Math.round(y / 20) % 8,
      accent: seededRand(seed + i * 11) < accentRate * 0.5,
    });
    i++;
  }

  // левый лист на y≈95, правый на y≈118 — органичные дуги, растворяющиеся к краю
  const leaves: Array<{ cy: number; dir: -1 | 1 }> = [
    { cy: 96, dir: -1 },
    { cy: 120, dir: 1 },
  ];
  for (const leaf of leaves) {
    const len = 20 + seededRand(seed + leaf.cy) * 8;
    for (let d = 3; d < len; d += 2.2) {
      const t = d / len;
      const density = t < 0.5 ? 1 : Math.max(0, 1 - (t - 0.5) / 0.5);
      if (seededRand(seed + leaf.cy * 7 + d) > density) continue;
      const y = leaf.cy + Math.sin(t * 1.4) * 7 * leaf.dir * -1;
      pixels.push({
        x: 50 + leaf.dir * d,
        y,
        s: t < 0.4 ? 2 : 1,
        o: 0.3 + 0.45 * (1 - t),
        sector: (leaf.dir < 0 ? 5 : 1),
        accent: seededRand(seed + leaf.cy * 13 + d * 3) < accentRate,
      });
    }
  }

  return pixels;
}

/** Пиксели, отделяющиеся от растения и медленно исчезающие */
function generateLoose(seed: number, count: number): LoosePixel[] {
  return Array.from({ length: count }, (_, i) => {
    const s = seed + i * 41;
    return {
      x: 14 + seededRand(s) * 72,
      y: 8 + seededRand(s * 3) * 62,
      s: seededRand(s * 5) > 0.5 ? 2 : 1,
      o: 0.25 + seededRand(s * 7) * 0.3,
      driftX: (seededRand(s * 11) - 0.5) * 14,
      dur: 14 + seededRand(s * 13) * 12,
      delay: seededRand(s * 17) * 18,
    };
  });
}

const SWAY = [11, 13, 9.5, 12.5, 10, 14, 11.5, 9].map((d, i) => ({
  '--swd': `${d}s`,
  '--swdel': `${-i * 1.7}s`,
  '--sw': `${1 + (i % 3) * 0.35}px`,
})) as React.CSSProperties[];

export default function PixelFlower({
  seed = 7,
  size = 320,
  color = '#8D89C0',
  accentColor = '#2B3FBF',
  accentRate = 0.035,
  opacity = 0.5,
  dense = false,
  variant = 'rosette',
  className = '',
  style,
}: PixelFlowerProps) {
  const isStem = variant === 'stem';
  const viewBox = isStem ? '0 0 100 160' : '0 0 100 100';
  const height = isStem ? Math.round(size * 1.6) : size;

  const pixels = useMemo(
    () => (isStem ? generateStem(seed, accentRate) : generateRosette(seed, dense, accentRate)),
    [seed, dense, accentRate, isStem],
  );

  const loose = useMemo(() => generateLoose(seed + 5, 7), [seed]);

  // группируем по секторам — каждый качается со своей фазой (лёгкий ветер)
  const sectors = useMemo(() => {
    const by: Pixel[][] = Array.from({ length: 8 }, () => []);
    for (const p of pixels) by[p.sector].push(p);
    return by;
  }, [pixels]);

  return (
    <svg
      viewBox={viewBox}
      width={size}
      height={height}
      className={`pixel-flower ${className}`}
      style={{ opacity, '--ff-op': opacity, ...style } as React.CSSProperties}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {sectors.map((group, si) =>
        group.length === 0 ? null : (
          <g key={si} className="flower-sway" style={SWAY[si]}>
            {group.map((p, i) => (
              <rect
                key={i}
                x={p.x}
                y={p.y}
                width={p.s}
                height={p.s}
                fill={p.accent ? accentColor : color}
                opacity={p.accent ? Math.min(1, p.o + 0.15) : p.o}
              />
            ))}
          </g>
        ),
      )}

      {/* отделившиеся пиксели — медленно всплывают и тают */}
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
