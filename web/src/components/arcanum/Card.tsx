'use client';

// ─────────────────────────────────────────────────────────────
// Card — интерактивная карта в транскрипте:
//   · 3D-флип с пружинной кривой (transform-only, GPU)
//   · сделка: влёт из-за нижней кромки со стаггером
//   · очередь вскрытия: пульс акцента на следующей карте
//   · аура глифов + вспышка + ударная волна на вскрытии
// ─────────────────────────────────────────────────────────────
import { useCallback, useMemo } from 'react';
import { getGuide } from '@/lib/guides';
import { haptic, sFlip, sReveal } from '@/lib/sound';

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
  characterId?: string;
  /** зерно левитации — у каждой карты свой ритм */
  floatSeed?: number;
  /** эта карта следующая в очереди вскрытия */
  isNext?: boolean;
  /** задержка сделки (css-анимация влёта), мс */
  dealDelay?: number;
  /** компактный режим (расклады с многими картами) */
  compact?: boolean;
}

function pseudoRand(seed: number): number {
  return Math.abs((Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1);
}

const ABOVE = ['\u0300', '\u0301', '\u0302', '\u0308', '\u030A', '\u0304', '\u030D', '\u0306', '\u030C', '\u030F'];
const BELOW = ['\u0316', '\u0323', '\u0325', '\u0329', '\u032E', '\u031C', '\u0320'];

function auraChar(seed: number, alphabet: string): string {
  const base = alphabet[Math.floor(pseudoRand(seed) * alphabet.length)];
  let r = base;
  r += ABOVE[Math.floor(pseudoRand(seed * 3) * ABOVE.length)];
  if (pseudoRand(seed * 5) > 0.45) {
    r += BELOW[Math.floor(pseudoRand(seed * 7) * BELOW.length)];
  }
  return r;
}

interface AuraDot { ch: string; x: number; y: number; op: number; size: number; delay: number; dur: number }

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

interface BurstParticle {
  ch: string; angle: number; distance: number; size: number;
  delay: number; dur: number; rot: number; isAccent: boolean;
}

function makeBurstParticles(alphabet: string, count = 18): BurstParticle[] {
  return Array.from({ length: count }, (_, i) => {
    const s = i * 31 + 7;
    return {
      ch: alphabet[Math.floor(pseudoRand(s) * alphabet.length)],
      angle: pseudoRand(s * 3) * Math.PI * 2,
      distance: 60 + pseudoRand(s * 5) * 90,
      size: 8 + Math.floor(pseudoRand(s * 7) * 10),
      delay: pseudoRand(s * 11) * 0.15,
      dur: 0.7 + pseudoRand(s * 13) * 0.4,
      rot: (pseudoRand(s * 17) - 0.5) * 360,
      isAccent: pseudoRand(s * 19) > 0.5,
    };
  });
}

let revealNoteCounter = 0;

export default function Card({
  card,
  position,
  raised = false,
  onFlip,
  flipped = false,
  characterId,
  floatSeed = 0,
  isNext = false,
  dealDelay = 0,
  compact = false,
}: CardProps) {
  const guide = getGuide(characterId);

  const handleClick = useCallback(() => {
    if (flipped) return;
    haptic('tap');
    sFlip();
    // колокол откровения — нота по мотиву проводника, чуть позже флипа
    const note = revealNoteCounter++;
    setTimeout(() => sReveal(note), 300);
    onFlip?.();
  }, [flipped, onFlip]);

  const auraDots = useMemo(
    () => (compact ? makeAuraDots(22, 0, guide.auraAlphabet) : makeAuraDots(50, 0, guide.auraAlphabet)),
    [guide.auraAlphabet, compact],
  );

  const burstParticles = useMemo(
    () => makeBurstParticles(guide.auraAlphabet, compact ? 12 : 18),
    [guide.auraAlphabet, compact],
  );

  const floatVars = useMemo(
    () => ({
      '--fdur': `${(4.9 + pseudoRand(floatSeed * 29 + 3) * 2.2).toFixed(2)}s`,
      '--fdel': `${(-pseudoRand(floatSeed * 31 + 7) * 3.6).toFixed(2)}s`,
      '--sdur': `${(6.2 + pseudoRand(floatSeed * 37 + 11) * 2.6).toFixed(2)}s`,
      '--deal-delay': `${dealDelay}ms`,
    } as React.CSSProperties),
    [floatSeed, dealDelay],
  );

  return (
    <div className="flex flex-col items-center">
      <div
        className={`relative w-full card-float${flipped ? ' card-float--rest' : ''}${isNext ? ' card-float--next' : ''}`}
        style={{
          '--guide-accent': guide.accent,
          '--guide-accent-dim': guide.accentDim,
          ...floatVars,
        } as React.CSSProperties}
      >
        {/* аура глифов */}
        <div className={`card-aura ${flipped ? 'card-aura--expanded' : ''}`} aria-hidden="true">
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
                '--max-op': Math.min(d.op + 0.1, 0.5),
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
          className={`flip block w-full aspect-[2/3] ${flipped ? 'is-flipped' : ''} ${isNext ? 'is-next' : ''} ${raised ? 'card-slot-center' : ''}`}
          onClick={handleClick}
          aria-label={position ? `${position} — перевернуть карту` : 'перевернуть карту'}
        >
          {/* угловые глифы проводника */}
          <span className="card-corner card-corner--tl" style={{ color: guide.accent }}>{guide.cornerSymbols.tl}</span>
          <span className="card-corner card-corner--tr" style={{ color: guide.accent }}>{guide.cornerSymbols.tr}</span>
          <span className="card-corner card-corner--bl" style={{ color: guide.accent }}>{guide.cornerSymbols.bl}</span>
          <span className="card-corner card-corner--br" style={{ color: guide.accent }}>{guide.cornerSymbols.br}</span>

          <div className="flip-inner">
            {/* рубашка проводника */}
            <div className="flip-face flip-front">
              <img
                src={`${guide.cardBack}?v=${guide.cardBackVersion}`}
                alt=""
                className="card-img"
                loading="lazy"
              />
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at center, ${guide.accentDim} 0%, transparent 65%)` }}
              />
              <div className="card-sheen" aria-hidden="true" />
            </div>

            {/* лицо карты */}
            <div className="flip-face flip-back">
              <img
                src={card.image_url}
                alt={card.name}
                className={`card-img crt-distort flip-glitch ${card.is_reversed ? 'card-img--rev' : ''}`}
              />
              {card.is_reversed && (
                <span className="card-rev-mark" style={{ color: guide.accent }} aria-hidden="true">⧖</span>
              )}
            </div>
          </div>

          {/* вспышка */}
          <div className="burst-flash" aria-hidden="true" />
          {/* ударная волна */}
          <div className="shockwave" aria-hidden="true" />
          {/* частицы */}
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

      {/* подпись под картой: до вскрытия — позиция, после — имя аркана */}
      <div className={`card-caption${compact ? ' card-caption--compact' : ''}`}>
        {!flipped && position && (
          <div className="card-label" style={{ color: raised ? guide.accent : undefined }}>
            <span className="cl-punct">{'// '}</span>
            <span className="cl-key">{position}</span>
          </div>
        )}
        {flipped && (
          <div className="card-name-json">
            {card.name}
            {card.is_reversed && <span className="cn-rev"> ↳ реверс</span>}
          </div>
        )}
      </div>
    </div>
  );
}
