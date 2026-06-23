'use client';

import { useMemo } from 'react';
import { getGuide } from '@/lib/guides';

interface GuideSigilProps {
  guideId?: string;
  /** fixed size in px (when used standalone). If undefined, fills container. */
  size?: number;
}

// Seeded random for stable particle placement per guide
function seededRand(seed: number): number {
  return Math.abs((Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1);
}

// ── Static star positions (constellation-like) ──
interface StarPoint {
  x: number;
  y: number;
  size: number;
  op: number;
  delay: number;
  dur: number;
}

function makeStars(seedOffset: number, count: number): StarPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const s = i + seedOffset * 1000;
    return {
      x: 20 + seededRand(s * 7) * 360,
      y: 20 + seededRand(s * 11) * 360,
      size: 1 + Math.floor(seededRand(s * 13) * 2.5),
      op: 0.3 + seededRand(s * 17) * 0.6,
      delay: seededRand(s * 19) * 4,
      dur: 1.6 + seededRand(s * 23) * 2.8,
    };
  });
}

// ── Binary ticker — animated 0/1 stream, net-art vibe ──
interface BinaryRow {
  y: number;
  speed: number;       // seconds for one full cycle
  delay: number;
  direction: 1 | -1;   // 1 = left-to-right, -1 = right-to-left
  bits: string;        // pre-generated bit string
  fontSize: number;
  opacity: number;
}

function makeBinaryRows(seedOffset: number): BinaryRow[] {
  const rows: BinaryRow[] = [];
  const ys = [70, 110, 290, 330];
  ys.forEach((y, i) => {
    const s = i + seedOffset * 50;
    const bitCount = 28;
    let bits = '';
    for (let b = 0; b < bitCount; b++) {
      bits += seededRand(s * 7 + b * 13) > 0.5 ? '1' : '0';
      if (b < bitCount - 1) bits += ' ';
    }
    rows.push({
      y,
      speed: 18 + seededRand(s * 11) * 12,
      delay: seededRand(s * 13) * 8,
      direction: i % 2 === 0 ? 1 : -1,
      bits,
      fontSize: 7 + Math.floor(seededRand(s * 17) * 2),
      opacity: 0.18 + seededRand(s * 19) * 0.18,
    });
  });
  return rows;
}

// ── Concentric orbit rings (kept, refined) ──
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

// ── Pixel clusters in corners ──
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
    { x: 50,  y: 50  },
    { x: 340, y: 50  },
    { x: 50,  y: 340 },
    { x: 340, y: 340 },
    { x: 30,  y: 200 },
    { x: 360, y: 200 },
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

// ── Scattered noise pixels ──
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
      isAccent: seededRand(s * 29) > 0.7,
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
  const stars = useMemo(() => makeStars(seedOffset, 30), [seedOffset]);
  const binaryRows = useMemo(() => makeBinaryRows(seedOffset), [seedOffset]);
  const pixels = useMemo(() => makePixels(seedOffset, 30), [seedOffset]);

  const isFixedSize = size !== undefined;

  return (
    <div
      className="relative flex items-center justify-center my-2 guide-sigil-container"
      style={
        isFixedSize
          ? { width: size, height: size }
          : { width: '100%', maxWidth: 'min(460px, 85vw)', aspectRatio: '1/1', maxHeight: '100%' }
      }
    >
      {/* central accent glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${guide.accentDim} 0%, transparent 55%)`,
        }}
        aria-hidden="true"
      />

      {/* ── binary ticker rows — scrolling 0/1 streams ── */}
      {binaryRows.map((row, i) => {
        const tripled = `${row.bits} · ${row.bits} · ${row.bits}`;
        return (
          <div
            key={`bin-${i}`}
            className="binary-ticker-row"
            style={{
              top: `${(row.y / 400) * 100}%`,
              color: i % 2 === 0 ? guide.accent : 'rgba(255,255,255,0.7)',
              opacity: row.opacity + 0.3,
              fontSize: `${row.fontSize * 1.8}px`,
              animationDuration: `${row.speed}s`,
              animationDelay: `${row.delay}s`,
              animationDirection: row.direction === 1 ? 'normal' : 'reverse',
            }}
          >
            <span className="binary-ticker-text">{tripled}</span>
          </div>
        );
      })}

      <svg
        viewBox="0 0 400 400"
        width={isFixedSize ? size : undefined}
        height={isFixedSize ? size : undefined}
        className={`relative z-10 ${isFixedSize ? '' : 'w-full h-auto'}`}
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
        {/* inner accent ring */}
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
          style={{ '--dot-op': 0.85, '--dot-delay': '0s', '--dot-dur': '2.5s' } as React.CSSProperties}
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

        {/* ── scattered stars (constellation) — twinkle ── */}
        {stars.map((s, i) => (
          <rect
            key={`star-${i}`}
            x={s.x}
            y={s.y}
            width={s.size}
            height={s.size}
            fill={i % 5 === 0 ? guide.accent : '#fff'}
            className="sigil-dot"
            style={{
              '--dot-op': s.op,
              '--dot-delay': `${s.delay}s`,
              '--dot-dur': `${s.dur}s`,
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

        {/* ── scattered noise pixels ── */}
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

        {/* ── tick marks ── */}
        <rect x="199" y="20"  width="2" height="14" fill="#fff" opacity="0.7" />
        <rect x="199" y="366" width="2" height="14" fill="#fff" opacity="0.7" />
        <rect x="20"  y="199" width="14" height="2" fill="#fff" opacity="0.7" />
        <rect x="366" y="199" width="14" height="2" fill="#fff" opacity="0.7" />

        {/* ── diagonal accent marks ── */}
        <rect x="60"  y="60"  width="3" height="3" fill={guide.accent} opacity="0.6" />
        <rect x="337" y="60"  width="3" height="3" fill={guide.accent} opacity="0.6" />
        <rect x="60"  y="337" width="3" height="3" fill={guide.accent} opacity="0.6" />
        <rect x="337" y="337" width="3" height="3" fill={guide.accent} opacity="0.6" />
      </svg>
    </div>
  );
}
