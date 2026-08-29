'use client';

// ─────────────────────────────────────────────────────────────
// ConstellationLayer — мерцающие звёзды по фону.
// ─────────────────────────────────────────────────────────────
import { useMemo } from 'react';

function seededRand(seed: number): number {
  return Math.abs((Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1);
}

interface Star {
  x: number;
  y: number;
  size: number;
  delay: number;
  dur: number;
  twinkle: number;
}

function makeConstellation(): Star[] {
  return Array.from({ length: 80 }, (_, i) => {
    const s = i * 1.618 + 11;
    return {
      x: seededRand(s * 3) * 100,
      y: seededRand(s * 5) * 100,
      size: 1 + Math.floor(seededRand(s * 7) * 2.8),
      delay: seededRand(s * 13) * 8,
      dur: 2.4 + seededRand(s * 17) * 4,
      twinkle: 0.35 + seededRand(s * 23) * 0.55,
    };
  });
}

export default function ConstellationLayer() {
  const stars = useMemo(() => makeConstellation(), []);

  return (
    <div className="constellation-layer" aria-hidden="true">
      {stars.map((star, i) => (
        <span
          key={`star-${i}`}
          className="constellation-star"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            '--star-delay': `${star.delay}s`,
            '--star-dur': `${star.dur}s`,
            '--star-op': star.twinkle,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
