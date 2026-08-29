'use client';

// ─────────────────────────────────────────────────────────────
// LunarGlyphsLayer — мягкие плавающие лунные/алхимические глифы.
// Вайб: оккультный терминал для женской аудитории — больше
// полумесяцев, звёзд, кружков.
// ─────────────────────────────────────────────────────────────
import { useMemo } from 'react';

const LUNAR_SYMBOLS = [
  '☾', '☽', '✦', '✧', '⋆', '✶', '✺', '❂',
  '◇', '◈', '○', '◌', '◎', '∘', '⊙',
  '⚘', '✲', '✱', '❉', '✼',
];

function seededRand(seed: number): number {
  return Math.abs((Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1);
}

interface LunarGlyph {
  symbol: string;
  x: number;
  y: number;
  size: number;
  opacity: number;
  delay: number;
  dur: number;
  driftX: number;
  driftY: number;
}

function makeLunarGlyphs(): LunarGlyph[] {
  return Array.from({ length: 22 }, (_, i) => {
    const s = i * 2.71828 + 7;
    return {
      symbol: LUNAR_SYMBOLS[Math.floor(seededRand(s) * LUNAR_SYMBOLS.length)],
      x: seededRand(s * 3) * 100,
      y: seededRand(s * 5) * 100,
      size: 9 + Math.floor(seededRand(s * 7) * 16),
      opacity: 0.09 + seededRand(s * 11) * 0.10,
      delay: seededRand(s * 13) * 15,
      dur: 28 + seededRand(s * 17) * 24,
      driftX: (seededRand(s * 19) - 0.5) * 36,
      driftY: (seededRand(s * 23) - 0.5) * 26,
    };
  });
}

interface Props {
  accent: string;
}

export default function LunarGlyphsLayer({ accent }: Props) {
  const glyphs = useMemo(() => makeLunarGlyphs(), []);

  return (
    <div className="lunar-layer" aria-hidden="true">
      {glyphs.map((g, i) => (
        <span
          key={`lunar-${i}`}
          className="lunar-glyph"
          style={{
            left: `${g.x}%`,
            top: `${g.y}%`,
            fontSize: `${g.size}px`,
            color: accent,
            '--lg-op': g.opacity,
            '--lg-delay': `${g.delay}s`,
            '--lg-dur': `${g.dur}s`,
            '--lg-drift-x': `${g.driftX}px`,
            '--lg-drift-y': `${g.driftY}px`,
          } as React.CSSProperties}
        >
          {g.symbol}
        </span>
      ))}
    </div>
  );
}
