'use client';

/**
 * Микро-иконография arcanum.ocv — пиксельные глифы на сетке 12×12.
 * Единый язык: rect-пиксели, currentColor, один визуальный вес.
 * Не «эзотерические Unicode», а собственная система знаков:
 * botanical + pixel + occult-editorial.
 */

export type GlyphName =
  | 'star4'      // четырёхлучевая звезда
  | 'crescent'   // месяц
  | 'bud'        // ботанический бутон
  | 'diamond'    // ромб
  | 'cross'      // пиксельный крест
  | 'constellation' // три звезды со связями
  | 'sprig';     // веточка с листьями

// Координаты пикселей на сетке 12×12: [x, y, w, h]
const DEFS: Record<GlyphName, number[][]> = {
  star4: [
    [5, 0, 2, 5], [5, 7, 2, 5], [0, 5, 5, 2], [7, 5, 5, 2],
    [4, 4, 4, 4],
  ],
  crescent: [
    [7, 1, 3, 2], [9, 3, 2, 2], [9, 5, 2, 2], [8, 7, 2, 2], [6, 9, 3, 2],
    [4, 2, 2, 2], [5, 4, 2, 4],
  ],
  bud: [
    [5, 0, 2, 2], [4, 2, 4, 3], [3, 4, 6, 4], [5, 8, 2, 4],
    [6, 6, 4, 1], [2, 6, 4, 1],
  ],
  diamond: [
    [5, 0, 2, 2], [3, 2, 6, 2], [2, 4, 8, 4], [3, 8, 6, 2], [5, 10, 2, 2],
  ],
  cross: [
    [5, 0, 2, 12], [0, 5, 12, 2],
  ],
  constellation: [
    [1, 1, 2, 2], [9, 3, 2, 2], [5, 8, 2, 2],
    [3, 2, 1, 1], [8, 4, 1, 1], [6, 7, 1, 1],
  ],
  sprig: [
    [5, 1, 2, 10],
    [7, 3, 2, 1], [3, 5, 2, 1],
    [8, 2, 1, 1], [2, 4, 1, 1],
    [7, 7, 2, 1], [3, 9, 2, 1],
    [8, 6, 1, 1], [2, 8, 1, 1],
  ],
};

interface GlyphProps {
  name: GlyphName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function Glyph({ name, size = 12, className = '', style }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 12 12"
      width={size}
      height={size}
      className={className}
      style={style}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {DEFS[name].map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill="currentColor" />
      ))}
    </svg>
  );
}
