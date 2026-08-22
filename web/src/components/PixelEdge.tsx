'use client';

import { useMemo } from 'react';

/**
 * Пиксельный край: цветная полоса растворяется в фон ступеньками
 * квадратов с падающей плотностью — как край схемы на референсе.
 */

interface PixelEdgeProps {
  /** цвет полосы, которой принадлежит край */
  color: string;
  /** высота зоны растворения, px */
  height?: number;
  /** flip: штырьки вверх (для нижней кромки полосы) / вниз (для верхней) */
  flip?: boolean;
  seed?: number;
  className?: string;
}

function hash1(seed: number): number {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export default function PixelEdge({
  color,
  height = 14,
  flip = false,
  seed = 3,
  className = '',
}: PixelEdgeProps) {
  // viewBox: 200 единиц ширины, растягиваем на 100%
  const W = 200;
  const H = 8; // уровней растворения в юнитах

  const cols = useMemo(() => {
    const out: Array<{ x: number; levels: number[] }> = [];
    const stepU = 1.2; // шаг колонок в юнитах
    for (let i = 0; i * stepU < W; i++) {
      const x = i * stepU;
      const base = hash1(seed + i * 7);
      // глубина колонки: 1..H уровней, редкие длинные шипы
      const depth = Math.max(1, Math.round(base * base * H));
      const levels: number[] = [0]; // l=0 — сплошная кромка, без разрывов
      for (let l = 1; l < depth; l++) {
        // разрежаем нижние уровни (дизер)
        if (hash1(seed + i * 13 + l * 29) < 0.82 - l * 0.16) {
          levels.push(l);
        }
      }
      out.push({ x, levels });
    }
    return out;
  }, [seed]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={`pixel-edge ${className}`}
      style={{
        display: 'block',
        width: '100%',
        height,
        transform: flip ? 'scaleY(-1)' : undefined,
      }}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {cols.map((col, i) =>
        col.levels.map((l) => (
          <rect
            key={`${i}-${l}`}
            x={col.x}
            y={l}
            width={1.15}
            height={1}
            fill={color}
            opacity={1 - l * 0.13}
          />
        )),
      )}
    </svg>
  );
}
