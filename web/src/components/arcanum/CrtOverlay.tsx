'use client';

// ─────────────────────────────────────────────────────────────
// CrtOverlay — атмосферные слои терминала: скан-линии, виньетка,
// созвездие, лунные глифы, дым, ритуальный сигил. Все слои
// aria-hidden и замирают при data-typing / data-scrolling (CSS).
// ВНИМАНИЕ: все вычисленные стили округляются — Math.sin
// даёт разные младшие биты на сервере и клиенте (hydration).
// ─────────────────────────────────────────────────────────────
import { memo, useMemo } from 'react';
import { getGuide } from '@/lib/guides';

const LUNAR_ALPHABET = ['☾', '☽', '∴', '⌁', '◌', '○', '◇', '∼'];

/** детерминированный псевдослучайный [0..1), округлённый до 4 знаков */
function prand(seed: number, salt: number): number {
  const v = Math.abs(Math.sin(seed * salt) * 43758.5453) % 1;
  return Math.round(v * 10000) / 10000;
}

interface CrtOverlayProps {
  characterId: string;
  /** покрытие фосфора: тема терминала (classic/silver/ember/ash) */
  themeId?: string;
  children: React.ReactNode;
}

/** созвездие — мерцающие звёзды (редкие, дешёвые) */
const ConstellationLayer = memo(function ConstellationLayer() {
  const stars = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => {
        const s = i * 17 + 3;
        return {
          x: (prand(s, 12.9898) * 100).toFixed(2),
          y: (prand(s, 78.233) * 100).toFixed(2),
          size: (1 + Math.round(prand(s, 39.11) * 2)).toFixed(0),
          dur: (2.6 + prand(s, 39.11) * 4).toFixed(2),
          delay: (prand(s, 78.233) * 5).toFixed(2),
          op: (0.14 + prand(s, 12.9898) * 0.3).toFixed(3),
        };
      }),
    [],
  );
  return (
    <div className="constellation-layer" aria-hidden="true">
      {stars.map((st, i) => (
        <span
          key={i}
          className="star"
          style={
            {
              left: `${st.x}%`,
              top: `${st.y}%`,
              width: `${st.size}px`,
              height: `${st.size}px`,
              '--st-dur': `${st.dur}s`,
              '--st-delay': `${st.delay}s`,
              '--st-op': st.op,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
});

/** лунные глифы — плавающие алхимические символы */
const LunarGlyphsLayer = memo(function LunarGlyphsLayer({ accent }: { accent: string }) {
  const glyphs = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const s = i * 29 + 5;
        return {
          x: (4 + prand(s, 4.11) * 92).toFixed(2),
          y: (6 + prand(s, 9.73) * 88).toFixed(2),
          dur: (12 + prand(s, 14.7) * 14).toFixed(2),
          delay: (-prand(s, 4.11) * 12).toFixed(2),
          drift: ((prand(s, 9.73) - 0.5) * 40).toFixed(1),
          op: (0.05 + prand(s, 14.7) * 0.07).toFixed(3),
        };
      }),
    [],
  );
  return (
    <div className="lunar-layer" aria-hidden="true">
      {glyphs.map((g, i) => (
        <span
          key={i}
          className="lunar-glyph"
          style={
            {
              left: `${g.x}%`,
              top: `${g.y}%`,
              color: accent,
              '--lg-dur': `${g.dur}s`,
              '--lg-delay': `${g.delay}s`,
              '--lg-drift': `${g.drift}px`,
              '--lg-op': g.op,
            } as React.CSSProperties
          }
        >
          {LUNAR_ALPHABET[i % LUNAR_ALPHABET.length]}
        </span>
      ))}
    </div>
  );
});

/**
 * SigilLayer — ритуальный сигил за стеклом трубки.
 * Геометрия гримуара: два кольца (тикс-разметка + пунктир),
 * двойной треугольник, малые круги на вершинах, внутренний круг
 * с перекрестием. Внешний ротор крутится по часовой, внутренний —
 * против: механизм «дышит». Прозрачность ~6% — фон, не декор.
 */
const SigilLayer = memo(function SigilLayer({ accent }: { accent: string }) {
  return (
    <div className="sigil-layer" aria-hidden="true" style={{ color: accent }}>
      <svg viewBox="0 0 400 400" fill="none" className="sigil-svg">
        {/* внешний ротор: тикс-кольцо, сплошное кольцо, треугольники */}
        <g className="sigil-rotor" stroke="currentColor">
          <circle cx="200" cy="200" r="193" strokeWidth="1" strokeDasharray="1.6 7.3" opacity="0.9" />
          <circle cx="200" cy="200" r="179" strokeWidth="0.7" opacity="0.55" />
          <path d="M200 51 L338 290 L62 290 Z" strokeWidth="1" opacity="0.65" />
          <path d="M200 349 L62 110 L338 110 Z" strokeWidth="1" opacity="0.65" />
          <circle cx="200" cy="51" r="9" strokeWidth="1" opacity="0.8" />
          <circle cx="338" cy="290" r="9" strokeWidth="1" opacity="0.8" />
          <circle cx="62" cy="290" r="9" strokeWidth="1" opacity="0.8" />
          <circle cx="200" cy="110" r="5.5" strokeWidth="0.8" opacity="0.6" />
          <circle cx="338" cy="200" r="5.5" strokeWidth="0.8" opacity="0.6" />
          <circle cx="62" cy="200" r="5.5" strokeWidth="0.8" opacity="0.6" />
        </g>
        {/* внутренний ротор: пунктирное кольцо, ядро с перекрестием */}
        <g className="sigil-rotor sigil-rotor--inner" stroke="currentColor">
          <circle cx="200" cy="200" r="132" strokeWidth="0.8" strokeDasharray="26 6 2 6" opacity="0.6" />
          <circle cx="200" cy="200" r="58" strokeWidth="1" opacity="0.7" />
          <path d="M200 128 v-14 M200 272 v14 M128 200 h-14 M272 200 h14" strokeWidth="1" opacity="0.7" />
          <circle cx="200" cy="200" r="26" strokeWidth="0.8" opacity="0.5" />
        </g>
      </svg>
    </div>
  );
});

export default function CrtOverlay({ characterId, themeId, children }: CrtOverlayProps) {
  const guide = getGuide(characterId);
  // тема = фильтр над всей трубкой; класс не подставляем при
  // classic-дефолте до гидрации — она и так стартовая
  const themeClass = themeId && themeId !== 'classic' ? ` theme-${themeId}` : '';
  return (
    <div
      className={`crt${themeClass}`}
      data-theme={themeId ?? 'classic'}
      style={
        {
          '--t-bg': guide.bgDeep,
          '--glow-center': guide.glowCenter,
        } as React.CSSProperties
      }
    >
      {/* тонированная тьма + пятно ЭЛТ */}
      <div className="crt-bg" aria-hidden="true" />
      {/* ритуальный сигил — крутится за стеклом */}
      <SigilLayer accent={guide.accent} />
      {/* ритуальный дым по краям */}
      <div className="ritual-smoke" aria-hidden="true" style={{ '--smoke': guide.accentDim } as React.CSSProperties}>
        <div className="ritual-smoke__cloud ritual-smoke__cloud--tl" />
        <div className="ritual-smoke__cloud ritual-smoke__cloud--br" />
      </div>
      {/* созвездие */}
      <ConstellationLayer />
      {/* лунные глифы */}
      <LunarGlyphsLayer accent={guide.accent} />
      {/* скан-линии */}
      <div className="crt-scanlines" aria-hidden="true" />
      {/* виньетка + блик */}
      <div className="crt-vignette" aria-hidden="true" />
      {children}
    </div>
  );
}
