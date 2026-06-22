'use client';

import { useMemo } from 'react';
import { getGuide } from '@/lib/guides';

interface GuideSigilProps {
  guideId?: string;
  /** size in px */
  size?: number;
}

// Seeded random for stable particle placement per guide
function seededRand(seed: number): number {
  return Math.abs((Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1);
}

// ── Particle generators ──

// Concentric ring of dots — like an "orbit"
interface RingDot {
  x: number;
  y: number;
  size: number;
  op: number;
  delay: number;
  dur: number;
}

function makeRing(radius: number, count: number, offset: number, sizeBase: number = 1.5): RingDot[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + offset;
    return {
      x: 200 + Math.cos(angle) * radius,
      y: 200 + Math.sin(angle) * radius,
      size: sizeBase + Math.floor(seededRand(i + radius) * 1.5),
      op: 0.35 + seededRand(i * 3 + radius) * 0.5,
      delay: seededRand(i * 5 + radius) * 4,
      dur: 1.8 + seededRand(i * 7 + radius) * 2.4,
    };
  });
}

// Scattered pixel clusters — small groups of squares in corners
interface Cluster {
  x: number;
  y: number;
  size: number;
  op: number;
  delay: number;
  dur: number;
}

function makeClusters(seedOffset: number): Cluster[] {
  const positions = [
    { x: 60,  y: 60  },
    { x: 340, y: 60  },
    { x: 60,  y: 340 },
    { x: 340, y: 340 },
    { x: 90,  y: 200 },
    { x: 310, y: 200 },
    { x: 200, y: 80  },
    { x: 200, y: 320 },
  ];
  return positions.map((p, i) => {
    const s = i + seedOffset * 100;
    return {
      x: p.x,
      y: p.y,
      size: 2 + Math.floor(seededRand(s * 11) * 3),
      op: 0.3 + seededRand(s * 13) * 0.4,
      delay: seededRand(s * 17) * 3,
      dur: 2.2 + seededRand(s * 19) * 2.5,
    };
  });
}

// Falling stars — diagonal streaks with trail
interface FallingStar {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  delay: number;
  dur: number;
  length: number;
}

function makeFallingStars(seedOffset: number): FallingStar[] {
  const stars: FallingStar[] = [];
  // 5 falling stars from different angles, all going diagonally down-right
  const configs = [
    { sx: 80,  sy: 60,  angle: 35, len: 70 },
    { sx: 320, sy: 50,  angle: 145, len: 60 },
    { sx: 60,  sy: 320, angle: -25, len: 65 },
    { sx: 330, sy: 330, angle: 215, len: 75 },
    { sx: 200, sy: 40,  angle: 60,  len: 55 },
  ];
  configs.forEach((c, i) => {
    const s = i + seedOffset * 50;
    const rad = (c.angle * Math.PI) / 180;
    stars.push({
      startX: c.sx,
      startY: c.sy,
      endX: c.sx + Math.cos(rad) * c.len,
      endY: c.sy + Math.sin(rad) * c.len,
      delay: seededRand(s * 13) * 5,
      dur: 2.5 + seededRand(s * 17) * 2,
      length: c.len,
    });
  });
  return stars;
}

// Scattered single pixels — net-art noise
interface Pixel {
  x: number;
  y: number;
  size: number;
  op: number;
  delay: number;
  dur: number;
  isAccent: boolean;
}

function makePixels(seedOffset: number, count: number): Pixel[] {
  return Array.from({ length: count }, (_, i) => {
    const s = i + seedOffset * 1000;
    return {
      x: 20 + seededRand(s * 7) * 360,
      y: 20 + seededRand(s * 11) * 360,
      size: 1 + Math.floor(seededRand(s * 13) * 2),
      op: 0.2 + seededRand(s * 17) * 0.5,
      delay: seededRand(s * 19) * 4,
      dur: 1.4 + seededRand(s * 23) * 2.8,
      isAccent: seededRand(s * 29) > 0.7, // ~30% accent
    };
  });
}

export default function GuideSigil({ guideId, size }: GuideSigilProps) {
  const guide = getGuide(guideId);

  // Per-guide seed offsets for variation
  const seedOffset = guide.id === 'shadow_walker' ? 1 : guide.id === 'ruin_keeper' ? 2 : 3;

  const innerRing = useMemo(() => makeRing(48, 16, seedOffset, 1.5), [seedOffset]);
  const midRing   = useMemo(() => makeRing(75, 24, seedOffset * 0.3, 2), [seedOffset]);
  const outerRing = useMemo(() => makeRing(105, 32, seedOffset * 0.6, 2), [seedOffset]);

  const clusters = useMemo(() => makeClusters(seedOffset), [seedOffset]);
  const fallingStars = useMemo(() => makeFallingStars(seedOffset), [seedOffset]);
  const pixels = useMemo(() => makePixels(seedOffset, 40), [seedOffset]);

  const isFixedSize = size !== undefined;

  // Default (responsive) sizing — kept compact so surrounding CTAs (e.g. "ПOЛУЧИТЬ OТВЕТ")
  // stay in the visible viewport on small phones. Override with `size` prop when needed.
  const containerCls = isFixedSize ? '' : 'w-28 h-28 sm:w-32 sm:h-32 lg:w-40 lg:h-40';

  return (
    <div
      className={`relative flex items-center justify-center my-3 sm:my-4 ${containerCls}`}
      style={
        isFixedSize
          ? { width: size, height: size }
          : undefined
      }
    >
      {/* central accent glow (soft aura behind everything) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${guide.accentDim} 0%, transparent 55%)`,
        }}
        aria-hidden="true"
      />

      <svg
        viewBox="0 0 400 400"
        width={isFixedSize ? size : undefined}
        height={isFixedSize ? size : undefined}
        className={`relative z-10 ${isFixedSize ? '' : 'w-full h-full'}`}
        style={{ imageRendering: 'pixelated' }}
        shapeRendering="crispEdges"
      >
        {/* ── central empty circle outline (very faint) ── */}
        <circle
          cx="200"
          cy="200"
          r="32"
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1"
        />
        {/* inner empty circle — even fainter */}
        <circle
          cx="200"
          cy="200"
          r="22"
          fill="none"
          stroke={guide.accent}
          strokeWidth="1"
          opacity="0.35"
        />
        {/* center accent pixel dot */}
        <rect
          x="197"
          y="197"
          width="6"
          height="6"
          fill={guide.accent}
          className="sigil-dot"
          style={{ '--dot-op': 0.8, '--dot-delay': '0s', '--dot-dur': '2.5s' } as React.CSSProperties}
        />

        {/* ── concentric orbit rings ── */}
        {innerRing.map((d, i) => (
          <rect
            key={`inner-${i}`}
            x={d.x}
            y={d.y}
            width={d.size}
            height={d.size}
            fill="#fff"
            className="sigil-dot"
            style={{
              '--dot-op': d.op,
              '--dot-delay': `${d.delay}s`,
              '--dot-dur': `${d.dur}s`,
            } as React.CSSProperties}
          />
        ))}

        {midRing.map((d, i) => (
          <rect
            key={`mid-${i}`}
            x={d.x}
            y={d.y}
            width={d.size}
            height={d.size}
            fill={i % 4 === 0 ? guide.accent : '#fff'}
            className="sigil-dot"
            style={{
              '--dot-op': d.op,
              '--dot-delay': `${d.delay}s`,
              '--dot-dur': `${d.dur}s`,
            } as React.CSSProperties}
          />
        ))}

        {outerRing.map((d, i) => (
          <rect
            key={`outer-${i}`}
            x={d.x}
            y={d.y}
            width={d.size}
            height={d.size}
            fill="#fff"
            className="sigil-dot"
            style={{
              '--dot-op': d.op * 0.8,
              '--dot-delay': `${d.delay}s`,
              '--dot-dur': `${d.dur}s`,
            } as React.CSSProperties}
          />
        ))}

        {/* ── scattered pixel clusters (corners + sides) ── */}
        {clusters.map((c, i) => (
          <rect
            key={`cluster-${i}`}
            x={c.x}
            y={c.y}
            width={c.size}
            height={c.size}
            fill={i % 3 === 0 ? guide.accent : '#fff'}
            className="sigil-dot"
            style={{
              '--dot-op': c.op,
              '--dot-delay': `${c.delay}s`,
              '--dot-dur': `${c.dur}s`,
            } as React.CSSProperties}
          />
        ))}

        {/* ── falling stars (animated streaks) ── */}
        {fallingStars.map((s, i) => (
          <g key={`star-${i}`} className="falling-star" style={{ '--fs-delay': `${s.delay}s`, '--fs-dur': `${s.dur}s` } as React.CSSProperties}>
            {/* glow trail (accent) */}
            <line
              x1={s.startX}
              y1={s.startY}
              x2={s.endX}
              y2={s.endY}
              stroke={guide.accent}
              strokeWidth="3"
              opacity="0.35"
            />
            {/* main trail (white) */}
            <line
              x1={s.startX}
              y1={s.startY}
              x2={s.endX}
              y2={s.endY}
              stroke="#fff"
              strokeWidth="2"
              opacity="0.85"
            />
            {/* head dot — bigger, accent color */}
            <rect
              x={s.endX - 3}
              y={s.endY - 3}
              width="6"
              height="6"
              fill={guide.accent}
            />
            {/* head core — white */}
            <rect
              x={s.endX - 1.5}
              y={s.endY - 1.5}
              width="3"
              height="3"
              fill="#fff"
            />
          </g>
        ))}

        {/* ── scattered noise pixels (net-art texture) ── */}
        {pixels.map((p, i) => (
          <rect
            key={`px-${i}`}
            x={p.x}
            y={p.y}
            width={p.size}
            height={p.size}
            fill={p.isAccent ? guide.accent : '#fff'}
            className="sigil-dot"
            style={{
              '--dot-op': p.op,
              '--dot-delay': `${p.delay}s`,
              '--dot-dur': `${p.dur}s`,
            } as React.CSSProperties}
          />
        ))}

        {/* ── tick marks — 4 cardinal directions, longer ── */}
        <rect x="199" y="20"  width="2" height="14" fill="#fff" opacity="0.7" />
        <rect x="199" y="366" width="2" height="14" fill="#fff" opacity="0.7" />
        <rect x="20"  y="199" width="14" height="2" fill="#fff" opacity="0.7" />
        <rect x="366" y="199" width="14" height="2" fill="#fff" opacity="0.7" />

        {/* ── diagonal accent marks (very subtle) ── */}
        <rect x="60"  y="60"  width="3" height="3" fill={guide.accent} opacity="0.6" />
        <rect x="337" y="60"  width="3" height="3" fill={guide.accent} opacity="0.6" />
        <rect x="60"  y="337" width="3" height="3" fill={guide.accent} opacity="0.6" />
        <rect x="337" y="337" width="3" height="3" fill={guide.accent} opacity="0.6" />
      </svg>
    </div>
  );
}
