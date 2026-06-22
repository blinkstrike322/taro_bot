'use client';

import { useCallback, useMemo } from 'react';
import { getGuide } from '@/lib/guides';

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
  /** character/guide id — drives per-guide card back + accent */
  characterId?: string;
}

function pseudoRand(seed: number): number {
  return Math.abs((Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1);
}

const ABOVE = ['\u0300','\u0301','\u0302','\u0308','\u030A','\u0304','\u030D','\u0306','\u030C','\u030F'];
const BELOW = ['\u0316','\u0323','\u0325','\u0329','\u032E','\u031C','\u0320'];

function auraChar(seed: number, alphabet: string): string {
  const base = alphabet[Math.floor(pseudoRand(seed) * alphabet.length)];
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

function makeAuraDots(count: number, offset: number, alphabet: string): AuraDot[] {
  return Array.from({ length: count }, (_, i) => {
    const s = offset + i;
    const angle = pseudoRand(s * 7) * Math.PI * 2;
    const dist = 0.15 + pseudoRand(s * 11) * 0.55;
    return {
      ch: auraChar(s, alphabet),
      x: 50 + Math.cos(angle) * dist * 60,
      y: 50 + Math.sin(angle) * dist * 60,
      op: 0.10 + pseudoRand(s * 13) * 0.28,
      size: 5 + Math.floor(pseudoRand(s * 17) * 6),
      delay: pseudoRand(s * 19) * 8,
      dur: 3 + pseudoRand(s * 23) * 6,
    };
  });
}

// ── Burst particles — fly outward on flip ──
interface BurstParticle {
  ch: string;
  angle: number;       // radians
  distance: number;    // px from center
  size: number;
  delay: number;       // seconds
  dur: number;         // seconds
  rot: number;         // rotation deg at end
  isAccent: boolean;
}

function makeBurstParticles(alphabet: string, count: number = 18): BurstParticle[] {
  return Array.from({ length: count }, (_, i) => {
    const s = i * 31 + 7;
    return {
      ch: alphabet[Math.floor(pseudoRand(s) * alphabet.length)],
      angle: pseudoRand(s * 3) * Math.PI * 2,
      distance: 60 + pseudoRand(s * 5) * 90, // 60–150px
      size: 8 + Math.floor(pseudoRand(s * 7) * 10),
      delay: pseudoRand(s * 11) * 0.15, // small stagger
      dur: 0.7 + pseudoRand(s * 13) * 0.4,
      rot: (pseudoRand(s * 17) - 0.5) * 360,
      isAccent: pseudoRand(s * 19) > 0.5,
    };
  });
}

export default function Card({
  card,
  position,
  raised = false,
  onFlip,
  flipped = false,
  characterId,
}: CardProps) {
  const guide = getGuide(characterId);

  const handleClick = useCallback(() => {
    if (flipped) return;
    try {
      const tg = (window as any).Telegram?.WebApp;
      tg?.HapticFeedback?.impactOccurred('medium');
    } catch {}
    onFlip?.();
  }, [flipped, onFlip]);

  const auraDots = useMemo(
    () => makeAuraDots(50, 0, guide.auraAlphabet),
    [guide.auraAlphabet],
  );

  const burstParticles = useMemo(
    () => makeBurstParticles(guide.auraAlphabet, 18),
    [guide.auraAlphabet],
  );

  return (
    <div className="flex flex-col items-center gap-2">
      {position && !flipped && (
        <div
          className="card-label"
          style={{ color: raised ? guide.accent : 'rgba(255,255,255,0.55)' }}
        >
          {position}
        </div>
      )}

      <div className="relative w-full" style={{ '--guide-accent': guide.accent } as React.CSSProperties}>
        {/* ── per-guide accent aura ── */}
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
                color: guide.accent,
                textShadow: `0 0 4px ${guide.accentDim}, 0 0 8px ${guide.accentDim}`,
                '--max-op': Math.min(d.op + 0.10, 0.50),
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
          {/* per-guide arcane corner symbols (replacing static ✦/⚹/†/⛧) */}
          <span className="card-corner" style={{ top: '-6px', left: '-4px', color: guide.accent }}>
            {guide.cornerSymbols.tl}
          </span>
          <span className="card-corner" style={{ top: '-6px', right: '-4px', color: guide.accent }}>
            {guide.cornerSymbols.tr}
          </span>
          <span className="card-corner" style={{ bottom: '-6px', left: '-4px', color: guide.accent }}>
            {guide.cornerSymbols.bl}
          </span>
          <span className="card-corner" style={{ bottom: '-6px', right: '-4px', color: guide.accent }}>
            {guide.cornerSymbols.br}
          </span>

          <div
            className="flip-inner border-2 border-white scan-heavy card-edges"
            style={{
              boxShadow: `3px 3px 0 #000, 0 0 0 1px #000, 0 0 6px ${guide.accentDim}`,
            }}
          >
            {/* ── face-down: per-guide card back ── */}
            <div className="flip-face relative" style={{ background: '#000' }}>
              <img
                src={guide.cardBack}
                alt=""
                className="dither-img w-full h-full object-cover"
                style={{ imageRendering: 'pixelated' }}
              />
              {/* subtle accent overlay on back */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at center, ${guide.accentDim} 0%, transparent 65%)` }}
              />
            </div>

            {/* ── face-up: card art with flip-glitch ── */}
            <div className="flip-face flip-back bg-white scan-soft flex items-center justify-center relative">
              <img
                src={card.image_url}
                alt={card.name}
                className={`dither-img w-full h-full object-contain crt-distort flip-glitch ${card.is_reversed ? 'rotate-180' : ''}`}
              />
              {/* reversed marker — pixel inversion hint */}
              {card.is_reversed && (
                <span
                  className="absolute top-1 right-1 font-pixel text-[7px] tracking-wider"
                  style={{ color: guide.accent, textShadow: '0 0 3px #000' }}
                  aria-hidden="true"
                >
                  ⧖
                </span>
              )}
            </div>
          </div>

          {/* ── burst flash — accent glow on flip ── */}
          <div className="burst-flash" aria-hidden="true" />

          {/* ── burst particles — per-guide symbols fly outward ── */}
          <div className="burst-layer" aria-hidden="true">
            {burstParticles.map((p, i) => {
              const dx = Math.cos(p.angle) * p.distance;
              const dy = Math.sin(p.angle) * p.distance;
              return (
                <span
                  key={i}
                  className="burst-particle"
                  style={{
                    color: p.isAccent ? guide.accent : '#fff',
                    fontSize: `${p.size}px`,
                    textShadow: `0 0 4px ${p.isAccent ? guide.accentDim : 'rgba(255,255,255,0.4)'}, 0 0 8px ${guide.accentDim}`,
                    '--bx': `${dx}px`,
                    '--by': `${dy}px`,
                    '--brot': `${p.rot}deg`,
                    '--bdur': `${p.dur}s`,
                    '--bdelay': `${p.delay}s`,
                  } as React.CSSProperties}
                >
                  {p.ch}
                </span>
              );
            })}
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
