'use client';

import { useMemo } from 'react';

interface PixelFlowerProps {
  /** seed для детерминированной генерации */
  seed?: number;
  /** базовый размер (сторона квадрата SVG), px */
  size?: number;
  /** цвет лепестков */
  color?: string;
  /** общая прозрачность 0..1 */
  opacity?: number;
  /** если true — лепестков больше, растворение дальше (для фонов) */
  dense?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

function seededRand(seed: number): number {
  return Math.abs((Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1);
}

interface Pixel {
  x: number;
  y: number;
  s: number;      // размер пикселя
  o: number;      // прозрачность
}

/**
 * Генерирует пиксельную розетку цветка: плотное «ботаническое» ядро,
 * которое к краям растворяется в отдельные пиксели (реальное → пиксель → абстракция).
 * Радиальная симметрия на 8 лепестков с джиттером.
 */
function generateFlower(seed: number, dense: boolean): Pixel[] {
  const pixels: Pixel[] = [];
  const PETALS = 8;
  const CORE = 4;          // радиус плотного ядра
  const R_MAX = dense ? 46 : 38;
  const STEP = 2.2;        // шаг пиксель-сетки
  let i = 0;

  for (let gy = -R_MAX; gy <= R_MAX; gy += STEP) {
    for (let gx = -R_MAX; gx <= R_MAX; gx += STEP) {
      const r = Math.sqrt(gx * gx + gy * gy);
      if (r > R_MAX) continue;

      // угол → лепестковая волна: лепестки как сгущения вдоль радиуса
      const ang = Math.atan2(gy, gx);
      const petalWave = Math.abs(Math.cos(PETALS * 0.5 * ang));
      // граница цветка в этом направлении: дальше там, где лепесток
      const petalEdge = CORE + (R_MAX - CORE) * Math.pow(petalWave, 1.6);
      if (r > petalEdge) continue;

      // плотность падает к краю: ботаника → дизер → отдельные пиксели
      const t = (r - CORE) / Math.max(1, petalEdge - CORE);
      const density = t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.45);
      const jitter = seededRand(seed + i++);
      if (jitter > density) continue;

      // лепестковый узор: тонкие лучи внутри лепестка
      const vein = Math.abs(Math.sin(PETALS * ang + r * 0.35));
      const opacity = 0.25 + 0.5 * (1 - t) * (0.5 + 0.5 * vein);
      const s = t < 0.35 ? 2 : (jitter > density * 0.5 ? 1 : 2);

      pixels.push({
        x: 50 + gx + (seededRand(seed + i * 3) - 0.5) * 1.2,
        y: 50 + gy + (seededRand(seed + i * 5) - 0.5) * 1.2,
        s,
        o: Math.min(1, opacity),
      });
    }
  }

  // сердцевина — плотное кольцо
  for (let a = 0; a < 24; a++) {
    const ang = (a / 24) * Math.PI * 2;
    pixels.push({
      x: 50 + Math.cos(ang) * 3,
      y: 50 + Math.sin(ang) * 3,
      s: 1,
      o: 0.9,
    });
  }

  return pixels;
}

export default function PixelFlower({
  seed = 7,
  size = 320,
  color = '#8D89C0',
  opacity = 0.5,
  dense = false,
  className = '',
  style,
}: PixelFlowerProps) {
  const pixels = useMemo(() => generateFlower(seed, dense), [seed, dense]);

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`pixel-flower ${className}`}
      style={{ opacity, '--ff-op': opacity, ...style } as React.CSSProperties}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {pixels.map((p, i) => (
        <rect
          key={i}
          x={p.x}
          y={p.y}
          width={p.s}
          height={p.s}
          fill={color}
          opacity={p.o}
        />
      ))}
    </svg>
  );
}
