'use client';

import { ReactNode, useMemo } from 'react';

interface CrtOverlayProps {
  children: ReactNode;
}

const AMBIENT_SYMBOLS = [
  '♰', '♱', '⚹', '†', '‡', '☠', '◇', '◎', '△', '▽',
  '⌘', '⚡', '⊚', '⏘', '⎔', '⏣', '⚶', '⛧', '⨁', '⨂',
  'ᛉ', 'ᚨ', 'ᛏ', 'ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ',
  '⋯', '⋮', '⋰', '⋱', '∴', '∵',
  '≡', '≜', '⊙', '⊕', '⊗',
];

const PHI = 1.618033988749;

function seededRand(seed: number): number {
  return Math.abs((Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1);
}

function makeAmbientSymbols(): Array<{
  symbol: string;
  x: number;
  y: number;
  size: number;
  opacity: number;
  delay: number;
  dur: number;
}> {
  return Array.from({ length: 28 }, (_, i) => {
    const s = i * PHI + 42;
    return {
      symbol: AMBIENT_SYMBOLS[Math.floor(seededRand(s) * AMBIENT_SYMBOLS.length)],
      x: seededRand(s * 3) * 100,
      y: seededRand(s * 5) * 100,
      size: 6 + Math.floor(seededRand(s * 7) * 10),
      opacity: 0.03 + seededRand(s * 11) * 0.05,
      delay: seededRand(s * 13) * 20,
      dur: 18 + seededRand(s * 17) * 20,
    };
  });
}

export default function CrtOverlay({ children }: CrtOverlayProps) {
  const ambientSymbols = useMemo(() => makeAmbientSymbols(), []);

  return (
    <div className="crt flex flex-col items-center w-full relative">
      {/* ambient floating artifacts — very subtle background occult symbols */}
      <div className="ambient-layer" aria-hidden="true">
        {ambientSymbols.map((sym, i) => (
          <span
            key={i}
            className="ambient-symbol"
            style={{
              left: `${sym.x}%`,
              top: `${sym.y}%`,
              fontSize: `${sym.size}px`,
              '--amb-op': sym.opacity,
              '--amb-delay': `${sym.delay}s`,
            } as React.CSSProperties}
          >
            {sym.symbol}
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}
