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
      ch: alphabet[Math.floor(pseudoRand(s * 2) * alphabet.length)],
      x: 50 + Math.cos(angle) * dist * 60,
      y: 50 + Math.sin(angle) * dist * 60,
      op: 0.10 + pseudoRand(s * 13) * 0.22,
      size: 6 + Math.floor(pseudoRand(s * 17) * 6),
      delay: pseudoRand(s * 19) * 8,
      dur: 4 + pseudoRand(s * 23) * 6,
    };
  });
}

// ── Burst particles — fly outward on flip ──
interface BurstParticle {
  ch: string;
  angle: number;
  distance: number;
  size: number;
  delay: number;
  dur: number;
  rot: number;
  isAccent: boolean;
}

function makeBurstParticles(alphabet: string, count: number = 16): BurstParticle[] {
  return Array.from({ length: count }, (_, i) => {
    const s = i * 31 + 7;
    return {
      ch: alphabet[Math.floor(pseudoRand(s) * alphabet.length)],
      angle: pseudoRand(s * 3) * Math.PI * 2,
      distance: 55 + pseudoRand(s * 5) * 85,
      size: 9 + Math.floor(pseudoRand(s * 7) * 10),
      delay: pseudoRand(s * 11) * 0.15,
      dur: 0.7 + pseudoRand(s * 13) * 0.4,
      rot: (pseudoRand(s * 17) - 0.5) * 360,
      isAccent: pseudoRand(s * 19) > 0.45,
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
    () => makeAuraDots(30, 0, guide.auraAlphabet),
    [guide.auraAlphabet],
  );

  const burstParticles = useMemo(
    () => makeBurstParticles(guide.auraAlphabet, 16),
    [guide.auraAlphabet],
  );

  return (
    <div className="flex flex-col items-center gap-0.5">
      {position && !flipped && (
        <div
          className="card-label"
          style={{ color: raised ? guide.accent : 'var(--ink-soft)' }}
        >
          {position}
        </div>
      )}

      <div
        className="relative w-full"
        style={{
          '--guide-accent': guide.accent,
          '--guide-accent-deep': guide.accentDeep,
          '--guide-accent-dim': guide.accentDim,
        } as React.CSSProperties}
      >
        {/* ── пастельная аура вокруг карты ── */}
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
                fontSize: `${Math.min(d.size + 3, 13)}px`,
                color: guide.accent,
                '--max-op': Math.min(d.op + 0.08, 0.42),
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
          {/* угловые символы проводницы */}
          <span className="card-corner" style={{ top: '-7px', left: '-5px', color: guide.accent }}>
            {guide.cornerSymbols.tl}
          </span>
          <span className="card-corner" style={{ top: '-7px', right: '-5px', color: guide.accent }}>
            {guide.cornerSymbols.tr}
          </span>
          <span className="card-corner" style={{ bottom: '-7px', left: '-5px', color: guide.accent }}>
            {guide.cornerSymbols.bl}
          </span>
          <span className="card-corner" style={{ bottom: '-7px', right: '-5px', color: guide.accent }}>
            {guide.cornerSymbols.br}
          </span>

          <div className="flip-inner card-frame scan-heavy">
            {/* ── рубашка: тёмный арт проводницы в светлой рамке ── */}
            <div className="flip-face relative overflow-hidden" style={{ background: '#241B2E' }}>
              <img
                src={`${guide.cardBack}?v=${guide.cardBackVersion}`}
                alt=""
                className="dither-img w-full h-full object-cover"
                style={{ imageRendering: 'pixelated' }}
              />
              {/* пастельный отсвет на рубашке */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at center, ${guide.accentDim} 0%, transparent 70%)` }}
              />
            </div>

            {/* ── лицо: дизеринг-арт карты + шиммер при перевороте ── */}
            <div className="flip-face flip-back bg-[#F4EFE8] scan-soft relative overflow-hidden">
              <img
                src={card.image_url}
                alt={card.name}
                loading="eager"
                className={`dither-img w-full h-full object-cover flip-glitch ${card.is_reversed ? 'rotate-180' : ''}`}
              />
              {/* перевернутая карта — шильдик */}
              {card.is_reversed && (
                <span className="absolute top-2 right-2 rev-chip z-10" aria-hidden="true">
                  ⇅ ПЕР.
                </span>
              )}
            </div>
          </div>

          {/* ── вспышка-мерцание при перевороте ── */}
          <div className="burst-flash" aria-hidden="true" />

          {/* ── разлетающиеся символы проводницы ── */}
          <div className="burst-layer" aria-hidden="true">
            {burstParticles.map((p, i) => {
              const dx = Math.cos(p.angle) * p.distance;
              const dy = Math.sin(p.angle) * p.distance;
              return (
                <span
                  key={i}
                  className="burst-particle"
                  style={{
                    color: p.isAccent ? guide.accent : '#5B4A66',
                    fontSize: `${p.size}px`,
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
        className={`font-serif text-[15px] font-semibold text-center min-h-[1.4em] leading-snug tracking-wide ${
          raised ? 'text-[color:var(--ink)]' : 'text-[color:var(--ink-soft)]'
        }`}
      >
        {flipped
          ? `${card.name}${card.is_reversed ? ' · перев.' : ''}`
          : ''}
      </div>
    </div>
  );
}
