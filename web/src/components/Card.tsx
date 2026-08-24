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
  /** intentional rotation, degrees — organic composition */
  tilt?: number;
  /** не прятать подпись позиции после флипа (веер дня: позиция важна и открыта) */
  keepLabel?: boolean;
}

function pseudoRand(seed: number): number {
  return Math.abs((Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1);
}

interface AuraDot {
  x: number;
  y: number;
  op: number;
  size: number;
  delay: number;
  dur: number;
}

// дизер-точечки вокруг карты: редкие пиксельные квадраты, заметно тише глифов
function makeAuraDots(count: number, offset: number): AuraDot[] {
  return Array.from({ length: count }, (_, i) => {
    const s = offset + i;
    const angle = pseudoRand(s * 7) * Math.PI * 2;
    const dist = 0.15 + pseudoRand(s * 11) * 0.55;
    return {
      x: 50 + Math.cos(angle) * dist * 60,
      y: 50 + Math.sin(angle) * dist * 60,
      op: 0.05 + pseudoRand(s * 13) * 0.1,
      size: pseudoRand(s * 17) > 0.75 ? 4 : 2 + Math.floor(pseudoRand(s * 17) * 2),
      delay: pseudoRand(s * 19) * 8,
      dur: 4 + pseudoRand(s * 23) * 6,
    };
  });
}

// ── Burst — разлетающиеся дизер-точечки при флипе ──
interface BurstDot {
  angle: number;
  distance: number;
  size: number;
  delay: number;
  dur: number;
}

function makeBurstDots(count: number = 12): BurstDot[] {
  return Array.from({ length: count }, (_, i) => {
    const s = i * 29 + 5;
    const angle = pseudoRand(s * 3) * Math.PI * 2;
    return {
      angle,
      distance: 46 + pseudoRand(s * 5) * 72,
      size: pseudoRand(s * 7) > 0.7 ? 4 : 2 + Math.floor(pseudoRand(s * 7) * 2),
      delay: pseudoRand(s * 11) * 0.12,
      dur: 0.6 + pseudoRand(s * 13) * 0.35,
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
  tilt = 0,
  keepLabel = false,
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

  const auraDots = useMemo(() => makeAuraDots(12, 0), []);

  const burstDots = useMemo(() => makeBurstDots(), []);

  return (
    <div className="flex flex-col items-center gap-0.5">
      {/* подпись не размонтируется, а гаснет — высота слота неизменна,
          карта не прыгает вверх в момент флипа */}
      {position && (
        <div
          className={`card-label ${flipped && !keepLabel ? 'card-label--hidden' : ''}`}
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
          {/* ── дизер-точечки вокруг карты ── */}
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
                  width: `${d.size}px`,
                  height: `${d.size}px`,
                  color: guide.accent,
                  '--max-op': Math.min(d.op + 0.03, 0.13),
                  '--ad': `${d.delay}s`,
                  '--a-dur': `${d.dur}s`,
                } as React.CSSProperties}
              />
            ))}
          </div>

        <button
          type="button"
          className={`flip block w-full aspect-[2/3] ${flipped ? 'is-flipped' : ''} ${raised ? 'raise card-slot-center' : ''}`}
          onClick={handleClick}
          style={{ '--tilt': `${tilt}deg` } as React.CSSProperties}
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

          <div className="flip-inner card-frame pixel-brackets scan-heavy">
            {/* ── рубашка: тёмный арт проводницы в светлой рамке ── */}
            <div className="flip-face relative overflow-hidden" style={{ background: '#241B2E' }}>
              <img
                src={`${guide.cardBack}?v=${guide.cardBackVersion}`}
                alt=""
                className="w-full h-full object-cover"
                style={{ imageRendering: 'auto' }}
              />
              {/* пастельный отсвет на рубашке */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at center, ${guide.accentDim} 0%, transparent 70%)` }}
              />
            </div>

            {/* ── лицо: HQ гравюра + динамический акцент проводницы ── */}
            <div className="flip-face flip-back scan-soft relative overflow-hidden" style={{ background: 'var(--paper-bright)' }}>
              <img
                src={card.image_url}
                alt={card.name}
                loading="eager"
                className={`dither-img w-full h-full object-cover flip-glitch ${card.is_reversed ? 'rotate-180' : ''}`}
              />
              {/* динамический акцент проводницы — едва заметная тонировка */}
              <div
                className="card-tint"
                style={{ backgroundColor: guide.accent }}
                aria-hidden="true"
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

          {/* ── разлетающиеся дизер-точечки ── */}
          <div className="burst-layer" aria-hidden="true">
            {burstDots.map((p, i) => {
              const dx = Math.cos(p.angle) * p.distance;
              const dy = Math.sin(p.angle) * p.distance;
              return (
                <span
                  key={i}
                  className="burst-particle"
                  style={{
                    color: guide.accent,
                    width: `${p.size}px`,
                    height: `${p.size}px`,
                    '--bx': `${dx}px`,
                    '--by': `${dy}px`,
                    '--bdur': `${p.dur}s`,
                    '--bdelay': `${p.delay}s`,
                  } as React.CSSProperties}
                />
              );
            })}
          </div>
        </button>
      </div>

      <div
        className="font-serif text-[14px] font-bold text-center min-h-[1.4em] leading-snug tracking-wide"
        style={{
          color: guide.accentDeep,
          textShadow: '0 1px 2px rgba(242, 240, 244, 0.92), 0 0 1px rgba(55, 58, 77, 0.18)',
        }}
      >
        {flipped
          ? `${card.name}${card.is_reversed ? ' · перев.' : ''}`
          : ''}
      </div>
    </div>
  );
}
