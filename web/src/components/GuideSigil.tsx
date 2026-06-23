'use client';

import { useMemo } from 'react';
import { getGuide } from '@/lib/guides';

interface GuideSigilProps {
  guideId?: string;
  size?: number;
}

function seededRand(seed: number): number {
  return Math.abs((Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1);
}

// ── Pixel line drawing helpers ──

// Stepped (pixelated) circle outline — generates rects along the perimeter
function pixelCircle(cx: number, cy: number, r: number, thickness: number = 1, fill: string, opacity?: number, cls?: string, style?: React.CSSProperties): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  const steps = Math.max(16, Math.floor(r * 4));
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(angle) * r);
    const y = Math.round(cy + Math.sin(angle) * r);
    out.push(
      <rect
        key={`pc-${cx}-${cy}-${r}-${i}`}
        x={x - Math.floor(thickness / 2)}
        y={y - Math.floor(thickness / 2)}
        width={thickness}
        height={thickness}
        fill={fill}
        opacity={opacity ?? 1}
        className={cls}
        style={style}
      />
    );
  }
  return out;
}

// Stepped line via Bresenham-ish, drawn as 1px rects
function pixelLine(x0: number, y0: number, x1: number, y1: number, thickness: number, fill: string, opacity?: number, cls?: string, style?: React.CSSProperties): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0, y = y0;
  let guard = 0;
  const half = Math.floor(thickness / 2);
  while (guard++ < 1000) {
    out.push(
      <rect
        key={`pl-${x0}-${y0}-${x1}-${y1}-${guard}`}
        x={x - half}
        y={y - half}
        width={thickness}
        height={thickness}
        fill={fill}
        opacity={opacity ?? 1}
        className={cls}
        style={style}
      />
    );
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return out;
}

// Pentagon vertex (5-pointed star — pentagram)
function pentagonVertex(cx: number, cy: number, r: number, i: number): { x: number; y: number } {
  // Start from top (-90deg)
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
}

export default function GuideSigil({ guideId, size }: GuideSigilProps) {
  const guide = getGuide(guideId);
  const isFixedSize = size !== undefined;

  const accent = guide.accent;
  const accentDim = guide.accentDim;
  const white = '#fff';
  const whiteFaint = 'rgba(255,255,255,0.35)';
  const whiteMid = 'rgba(255,255,255,0.55)';

  // ── Static structural elements (memoized) ──

  // Outer ring tick marks (every 10 degrees → 36 ticks)
  const outerTicks = useMemo(() => {
    const out: { x: number; y: number; w: number; h: number; major: boolean }[] = [];
    const cx = 200, cy = 200;
    for (let i = 0; i < 36; i++) {
      const angle = (i / 36) * Math.PI * 2;
      const major = i % 9 === 0; // cardinal directions
      const rOuter = 175;
      const rInner = major ? 165 : 170;
      const x = Math.round(cx + Math.cos(angle) * rOuter);
      const y = Math.round(cy + Math.sin(angle) * rOuter);
      const x2 = Math.round(cx + Math.cos(angle) * rInner);
      const y2 = Math.round(cy + Math.sin(angle) * rInner);
      out.push({
        x: Math.min(x, x2),
        y: Math.min(y, y2),
        w: Math.abs(x - x2) + 1,
        h: Math.abs(y - y2) + 1,
        major,
      });
    }
    return out;
  }, []);

  // Pentagon vertices for pentagram
  const pentVertices = useMemo(() => {
    return [0, 1, 2, 3, 4].map(i => pentagonVertex(200, 200, 110, i));
  }, []);

  // Pentagram lines: 0→2, 2→4, 4→1, 1→3, 3→0
  const pentLines = useMemo(() => {
    const order = [0, 2, 4, 1, 3];
    const lines: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (let i = 0; i < order.length; i++) {
      const a = pentVertices[order[i]];
      const b = pentVertices[order[(i + 1) % order.length]];
      lines.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y });
    }
    return lines;
  }, [pentVertices]);

  // Hexagram (Star of David) — two interlocking triangles
  const hexVertices = useMemo(() => {
    const up: { x: number; y: number }[] = [];
    const down: { x: number; y: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const angleUp = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
      up.push({ x: 200 + Math.cos(angleUp) * 70, y: 200 + Math.sin(angleUp) * 70 });
      const angleDown = Math.PI / 2 + (i * 2 * Math.PI) / 3;
      down.push({ x: 200 + Math.cos(angleDown) * 70, y: 200 + Math.sin(angleDown) * 70 });
    }
    return { up, down };
  }, []);

  // Corner sigil marks (4 corners — small pixel ornaments)
  const cornerMarks = useMemo(() => {
    const marks: { x: number; y: number; w: number; h: number }[] = [];
    const corners = [
      { cx: 50,  cy: 50  },
      { cx: 350, cy: 50  },
      { cx: 50,  cy: 350 },
      { cx: 350, cy: 350 },
    ];
    corners.forEach(({ cx, cy }) => {
      // small cross/plus mark
      marks.push({ x: cx - 4, y: cy - 1, w: 9, h: 2 });
      marks.push({ x: cx - 1, y: cy - 4, w: 2, h: 9 });
      // dots in corners of the corner
      marks.push({ x: cx - 7, y: cy - 7, w: 2, h: 2 });
      marks.push({ x: cx + 5, y: cy - 7, w: 2, h: 2 });
      marks.push({ x: cx - 7, y: cy + 5, w: 2, h: 2 });
      marks.push({ x: cx + 5, y: cy + 5, w: 2, h: 2 });
    });
    return marks;
  }, []);

  // Inner sparks — few accent pixels placed at pentagon vertex tips
  const vertexSparks = useMemo(() => {
    return pentVertices.map((v, i) => ({
      x: Math.round(v.x),
      y: Math.round(v.y),
      delay: i * 0.4,
      dur: 2.2 + i * 0.3,
    }));
  }, [pentVertices]);

  // Cardinal markers (N/E/S/W small pixel triangles outside pentagon)
  const cardinals = useMemo(() => {
    return [
      { x: 200, y: 60,  rot: 'up' },
      { x: 340, y: 200, rot: 'right' },
      { x: 200, y: 340, rot: 'down' },
      { x: 60,  y: 200, rot: 'left' },
    ];
  }, []);

  return (
    <div
      className="relative flex items-center justify-center my-2 guide-sigil-container"
      style={
        isFixedSize
          ? { width: size, height: size }
          : { width: '100%', maxWidth: 'min(460px, 85vw)', aspectRatio: '1/1', maxHeight: '100%' }
      }
    >
      {/* accent glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(circle at 50% 50%, ${accentDim} 0%, transparent 55%)` }}
        aria-hidden="true"
      />

      <svg
        viewBox="0 0 400 400"
        width={isFixedSize ? size : undefined}
        height={isFixedSize ? size : undefined}
        className={`relative z-10 ${isFixedSize ? '' : 'w-full h-auto'}`}
        style={{ imageRendering: 'pixelated' }}
        shapeRendering="crispEdges"
      >
        {/* ═══ LAYER 1: OUTER RING (rotating slowly) ═══ */}
        <g className="sigil-rotate-slow">
          {/* Outer thick ring (pixel circle) */}
          {pixelCircle(200, 200, 180, 2, white, 0.55)}
          {/* Inner thick ring of outer band */}
          {pixelCircle(200, 200, 168, 1, whiteFaint)}

          {/* Tick marks every 10° */}
          {outerTicks.map((t, i) => (
            <rect
              key={`tick-${i}`}
              x={t.x}
              y={t.y}
              width={t.w}
              height={t.h}
              fill={t.major ? accent : white}
              opacity={t.major ? 0.85 : 0.45}
            />
          ))}

          {/* Cardinal triangle markers (outside the ring) */}
          {cardinals.map((c, i) => {
            // small pixel triangle pointing outward
            const tri: React.ReactElement[] = [];
            if (c.rot === 'up') {
              tri.push(<rect key={`t${i}-1`} x={c.x - 1} y={c.y - 4} width={2} height={2} fill={accent} />);
              tri.push(<rect key={`t${i}-2`} x={c.x - 3} y={c.y - 2} width={6} height={2} fill={accent} />);
            } else if (c.rot === 'down') {
              tri.push(<rect key={`t${i}-1`} x={c.x - 1} y={c.y + 2} width={2} height={2} fill={accent} />);
              tri.push(<rect key={`t${i}-2`} x={c.x - 3} y={c.y} width={6} height={2} fill={accent} />);
            } else if (c.rot === 'right') {
              tri.push(<rect key={`t${i}-1`} x={c.x + 2} y={c.y - 1} width={2} height={2} fill={accent} />);
              tri.push(<rect key={`t${i}-2`} x={c.x}     y={c.y - 3} width={2} height={6} fill={accent} />);
            } else {
              tri.push(<rect key={`t${i}-1`} x={c.x - 4} y={c.y - 1} width={2} height={2} fill={accent} />);
              tri.push(<rect key={`t${i}-2`} x={c.x - 2} y={c.y - 3} width={2} height={6} fill={accent} />);
            }
            return <g key={`card-${i}`}>{tri}</g>;
          })}
        </g>

        {/* ═══ LAYER 2: MIDDLE RING (static) ═══ */}
        {pixelCircle(200, 200, 145, 1, white, 0.4)}
        {pixelCircle(200, 200, 140, 1, whiteFaint)}

        {/* 12 small dots at clock positions on middle ring (zodiac-like) */}
        {useMemo(() => {
          const dots: React.ReactElement[] = [];
          for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
            const x = Math.round(200 + Math.cos(angle) * 145);
            const y = Math.round(200 + Math.sin(angle) * 145);
            dots.push(
              <rect
                key={`zodiac-${i}`}
                x={x - 1}
                y={y - 1}
                width={2}
                height={2}
                fill={i % 3 === 0 ? accent : white}
                opacity={0.7}
                className="sigil-dot"
                style={{ '--dot-op': 0.7, '--dot-delay': `${i * 0.3}s`, '--dot-dur': '2.4s' } as React.CSSProperties}
              />
            );
          }
          return dots;
        }, [])}

        {/* ═══ LAYER 3: PENTAGRAM (accent color, pulsing) ═══ */}
        <g className="sigil-pulse">
          {/* Pentagon outline (faint white) */}
          {(() => {
            const els: React.ReactElement[] = [];
            for (let i = 0; i < 5; i++) {
              const a = pentVertices[i];
              const b = pentVertices[(i + 1) % 5];
              els.push(...pixelLine(Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y), 1, white, 0.3));
            }
            return els;
          })()}

          {/* Pentagram lines (accent color, thicker) */}
          {pentLines.map((l, i) => (
            <g key={`pent-line-${i}`}>
              {pixelLine(Math.round(l.x0), Math.round(l.y0), Math.round(l.x1), Math.round(l.y1), 2, accent, 0.85)}
            </g>
          ))}
        </g>

        {/* ═══ LAYER 4: HEXAGRAM inside (rotating slowly counter-clockwise) ═══ */}
        <g className="sigil-rotate-slow-rev">
          {/* Triangle up */}
          {(() => {
            const els: React.ReactElement[] = [];
            for (let i = 0; i < 3; i++) {
              const a = hexVertices.up[i];
              const b = hexVertices.up[(i + 1) % 3];
              els.push(...pixelLine(Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y), 1, white, 0.55));
            }
            return els;
          })()}
          {/* Triangle down */}
          {(() => {
            const els: React.ReactElement[] = [];
            for (let i = 0; i < 3; i++) {
              const a = hexVertices.down[i];
              const b = hexVertices.down[(i + 1) % 3];
              els.push(...pixelLine(Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y), 1, white, 0.55));
            }
            return els;
          })()}
        </g>

        {/* ═══ LAYER 5: INNER CORE — small circle + center sigil ═══ */}
        {pixelCircle(200, 200, 35, 1, accent, 0.5)}
        {pixelCircle(200, 200, 30, 1, whiteFaint)}

        {/* Inner cross (pixel) — small plus mark at center */}
        <rect x={198} y={186} width={4} height={28} fill={accent} opacity={0.7} />
        <rect x={186} y={198} width={28} height={4} fill={accent} opacity={0.7} />

        {/* Center pixel dot — brightest */}
        <rect
          x={197}
          y={197}
          width={6}
          height={6}
          fill={white}
          className="sigil-dot"
          style={{ '--dot-op': 1, '--dot-delay': '0s', '--dot-dur': '2s' } as React.CSSProperties}
        />

        {/* ═══ LAYER 6: VERTEX SPARKS (pulsing accent at pentagram tips) ═══ */}
        {vertexSparks.map((s, i) => (
          <rect
            key={`spark-${i}`}
            x={s.x - 2}
            y={s.y - 2}
            width={4}
            height={4}
            fill={accent}
            className="sigil-dot"
            style={{
              '--dot-op': 0.95,
              '--dot-delay': `${s.delay}s`,
              '--dot-dur': `${s.dur}s`,
            } as React.CSSProperties}
          />
        ))}

        {/* ═══ LAYER 7: CORNER MARKS (4 corners — pixel ornaments) ═══ */}
        {cornerMarks.map((m, i) => (
          <rect
            key={`cm-${i}`}
            x={m.x}
            y={m.y}
            width={m.w}
            height={m.h}
            fill={white}
            opacity={0.45}
          />
        ))}

        {/* ═══ LAYER 8: OUTER ACCENT GLOW RING (very faint) ═══ */}
        {pixelCircle(200, 200, 195, 1, accent, 0.15)}
      </svg>
    </div>
  );
}
