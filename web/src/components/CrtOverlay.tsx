'use client';

import { ReactNode, useMemo } from 'react';

interface CrtOverlayProps {
  children: ReactNode;
}

// Мягкие мистические символы — луна, звёзды, цветы, солнце
const AMBIENT_SYMBOLS = [
  '☽', '☾', '✦', '✧', '❋', '❀', '✿', '◈', '◇', '○', '◌',
  '☉', '♀', '⚹', '∴', '·', '•', '˚', '❦', '✕', '※', '∅',
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
}> {
  // 14 символов — достаточно для атмосферы без лишнего рендера
  return Array.from({ length: 14 }, (_, i) => {
    const s = i * PHI + 42;
    return {
      symbol: AMBIENT_SYMBOLS[Math.floor(seededRand(s) * AMBIENT_SYMBOLS.length)],
      x: seededRand(s * 3) * 100,
      y: seededRand(s * 5) * 100,
      size: 7 + Math.floor(seededRand(s * 7) * 10),
      opacity: 0.05 + seededRand(s * 11) * 0.06,
      delay: seededRand(s * 13) * 20,
    };
  });
}

// Пастельная палитра для символов
const SYMBOL_COLORS = ['#8e6cc8', '#d14d76', '#b57e3e', '#5f8fb4'];

export default function CrtOverlay({ children }: CrtOverlayProps) {
  const ambientSymbols = useMemo(() => makeAmbientSymbols(), []);

  return (
    <div className="crt flex flex-col items-center w-full relative">
      {/* аврора-фон */}
      <div className="app-bg" aria-hidden="true" />

      {/* мягкие парящие символы */}
      <div className="ambient-layer" aria-hidden="true">
        {ambientSymbols.map((sym, i) => (
          <span
            key={i}
            className="ambient-symbol"
            style={{
              left: `${sym.x}%`,
              top: `${sym.y}%`,
              fontSize: `${sym.size}px`,
              color: SYMBOL_COLORS[i % SYMBOL_COLORS.length],
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
