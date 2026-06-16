'use client';

import { useCallback, useMemo } from 'react';

export interface TarotCard {
  id: string;
  name: string;
  image_url: string;
  is_reversed: boolean;
}

interface CardProps {
  card: TarotCard;
  position?: string;
  raised?: boolean;
  onFlip?: () => void;
  flipped?: boolean;
}

const AURA_BASE = '·•*+×÷†‡♰♱⚹☠○◇◎°~^･ﾟﾥ';

function pseudoRand(seed: number): number {
  return Math.abs((Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1);
}

const ABOVE = ['\u0300','\u0301','\u0302','\u0308','\u030A','\u0304','\u030D','\u0306','\u030C','\u030F'];
const BELOW = ['\u0316','\u0323','\u0325','\u0329','\u032E','\u031C','\u0320'];

function auraChar(seed: number): string {
  const base = AURA_BASE[Math.floor(pseudoRand(seed) * AURA_BASE.length)];
  let r = base;
  r += ABOVE[Math.floor(pseudoRand(seed * 3) * ABOVE.length)];
  if (pseudoRand(seed * 5) > 0.45) {
    r += BELOW[Math.floor(pseudoRand(seed * 7) * BELOW.length)];
  }
  return r;
}

interface AuraDot {
  ch: string;
  x: number;
  y: number;
  op: number;
  size: number;
  delay: number;
  dur: number;
}

function makeAuraDots(count: number, offset: number): AuraDot[] {
  return Array.from({ length: count }, (_, i) => {
    const s = offset + i;
    const angle = pseudoRand(s * 7) * Math.PI * 2;
    const dist = 0.15 + pseudoRand(s * 11) * 0.55;
    return {
      ch: auraChar(s),
      x: 50 + Math.cos(angle) * dist * 60,
      y: 50 + Math.sin(angle) * dist * 60,
      op: 0.08 + pseudoRand(s * 13) * 0.25,
      size: 5 + Math.floor(pseudoRand(s * 17) * 6),
      delay: pseudoRand(s * 19) * 8,
      dur: 3 + pseudoRand(s * 23) * 6,
    };
  });
}

export default function Card({
  card,
  position,
  raised = false,
  onFlip,
  flipped = false,
}: CardProps) {
  const handleClick = useCallback(() => {
    if (flipped) return;
    try {
      const tg = (window as any).Telegram?.WebApp;
      tg?.HapticFeedback?.impactOccurred('medium');
    } catch {}
    onFlip?.();
  }, [flipped, onFlip]);

  const auraDots = useMemo(() => makeAuraDots(50, 0), []);

  return (
    <div className="flex flex-col items-center gap-2">
      {position && !flipped && (
        <div
          className={`card-label ${raised ? 'text-white' : 'text-white/55'}`}
        >
          {position}
        </div>
      )}

      <div className="relative w-full overflow-hidden">
        <div
          className={`card-aura ${flipped ? 'card-aura--expanded' : ''}`}
          aria-hidden="true"
        >
          {auraDots.map((d, i) => (
            <span
              key={i}
              className="aura-char"
              style={{
                left: `${d.x}%`,
                top: `${d.y}%`,
                fontSize: `${Math.min(d.size + 3, 12)}px`,
                '--max-op': Math.min(d.op + 0.08, 0.45),
                '--ad': `${d.delay}s`,
                '--a-dur': `${d.dur}s`,
              } as React.CSSProperties}
            >
              {d.ch}
            </span>
          ))}
        </div>

        <button
          type="button"
          className={`flip block w-full aspect-[2/3] ${flipped ? 'is-flipped' : ''} ${raised ? 'raise card-slot-center' : ''}`}
          onClick={handleClick}
          aria-label={position ? `${position} — перевернуть карту` : 'Перевернуть карту'}
        >
          {/* arcane corner symbols */}
          <span className="card-corner" style={{ top: '-6px', left: '-4px' }}>♰</span>
          <span className="card-corner" style={{ top: '-6px', right: '-4px' }}>⚹</span>
          <span className="card-corner" style={{ bottom: '-6px', left: '-4px' }}>♱</span>
          <span className="card-corner" style={{ bottom: '-6px', right: '-4px' }}>†</span>

          <div
            className="flip-inner border-2 border-white glow-purple scan-heavy"
            style={{ boxShadow: '3px 3px 0 #000, 0 0 0 1px #000' }}
          >
            <div className="flip-face">
              <img
                src="/cards/back_test.png"
                alt=""
                className="dither-img w-full h-full object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <div className="flip-face flip-back bg-white scan-soft flex items-center justify-center">
              <img
                src={card.image_url}
                alt={card.name}
                className={`dither-img w-full h-full object-contain crt-distort ${card.is_reversed ? 'rotate-180' : ''}`}
              />
            </div>
          </div>
        </button>
      </div>

      <div
        className={`font-pixel text-[11px] tracking-wide text-center min-h-[1.4em] leading-relaxed ${raised ? 'text-white' : 'text-white/55'}`}
      >
        {flipped
          ? `${card.name}${card.is_reversed ? ' (ПЕР.)' : ''}`
          : ''}
      </div>
    </div>
  );
}
