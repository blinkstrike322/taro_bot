'use client';

import { useMemo } from 'react';
import {
  generateIris, generateLoose, GRID_W, GRID_H, STEP,
  type Cell,
} from './pixelFlowerCore';

/**
 * PixelFlower v2 — рендер ириса х2 (геометрия в pixelFlowerCore.ts).
 * Per-guide: seed + tilt. Группы покачивания по органам, loose-пиксели.
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
        // контролируется контейнером (FlowerAnchor задаёт vmin-ширину по фазе)
        width: '100%',
        height: 'auto',
        display: 'block',
        transform: tilt ? `rotate(${tilt}deg)` : undefined,
        ...style,
      } as React.CSSProperties}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >      {groups.map((g, gi) =>
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
