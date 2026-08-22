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

// Палитра пылинок: белый + сигнатурные тона
const MOTE_COLORS = [
  'rgba(248,246,249,0.95)',
  'rgba(39,73,210,0.55)',
  'rgba(101,80,168,0.5)',
  'rgba(174,169,186,0.6)',
];

interface Mote {
  x: number;
  y: number;
  size: number;
  color: string;
  op: number;
  dx: number;
  dy: number;
  dur: number;
  delay: number;
}

function makeMotes(): Mote[] {
  return Array.from({ length: 18 }, (_, i) => {
    const s = i * 2.718 + 11;
    return {
      x: seededRand(s) * 100,
      y: 25 + seededRand(s * 3) * 75, // пыль висит ниже шапки
      size: seededRand(s * 5) > 0.7 ? 3 : 2,
      color: MOTE_COLORS[Math.floor(seededRand(s * 7) * MOTE_COLORS.length)],
      op: 0.3 + seededRand(s * 11) * 0.45,
      dx: (seededRand(s * 13) - 0.5) * 14,
      dy: -(30 + seededRand(s * 17) * 45),
      dur: 9 + seededRand(s * 19) * 12,
      delay: seededRand(s * 23) * 18,
    };
  });
}

export default function CrtOverlay({ children }: CrtOverlayProps) {
  const ambientSymbols = useMemo(() => makeAmbientSymbols(), []);
  const motes = useMemo(() => makeMotes(), []);

  return (
    <div className="crt flex flex-col items-center w-full relative">
      {/* аврора-фон */}
      <div className="app-bg" aria-hidden="true" />

      {/* дышащий свет вместо роллинг-полосы */}
      <div className="glow-layer" aria-hidden="true" />

      {/* пиксельная пыль в луче света */}
      <div className="light-motes" aria-hidden="true">
        {motes.map((m, i) => (
          <span
            key={i}
            className="mote"
            style={
              {
                left: `${m.x}%`,
                top: `${m.y}%`,
                width: m.size,
                height: m.size,
                background: m.color,
                '--m-op': m.op,
                '--m-dx': `${m.dx}px`,
                '--m-dy': `${m.dy}px`,
                '--m-dur': `${m.dur}s`,
                '--m-del': `${m.delay}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

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
              color: '#5B4A66',
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
