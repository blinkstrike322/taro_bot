'use client';

// ─────────────────────────────────────────────────────────────
// CrtOverlay — атмосферные слои терминала: скан-линии, виньетка,
// созвездие, лунные глифы, дым. Все слои aria-hidden
// и замирают при data-typing / data-scrolling (CSS).
// ВНИМАНИЕ: все вычисленные стили округляются — Math.sin
// даёт разные младшие биты на сервере и клиенте (hydration).
// ─────────────────────────────────────────────────────────────
import { memo, useMemo } from 'react';
import { getGuide } from '@/lib/guides';
import AmbientSigil from '@/components/arcanum/AmbientSigil';

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
  /** ambient-сигил: монтировать после бута (слабые устройства — нет) */
  showSigil?: boolean;
  /** в транскрипте есть чтение — сигил притушить */
  dimSigil?: boolean;
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

export default function CrtOverlay({ characterId, themeId, showSigil, dimSigil, children }: CrtOverlayProps) {
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
      {/* ритуальный дым по краям */}
      <div className="ritual-smoke" aria-hidden="true" style={{ '--smoke': guide.accentDim } as React.CSSProperties}>
        <div className="ritual-smoke__cloud ritual-smoke__cloud--tl" />
        <div className="ritual-smoke__cloud ritual-smoke__cloud--br" />
      </div>
      {/* ambient-сигил — оригинальная пентаграмма (после бута, не на слабых) */}
      {showSigil && <AmbientSigil accent={guide.accent} accentDim={guide.accentDim} dim={dimSigil} />}
      {/* созвездие */}
      <ConstellationLayer />
      {/* лунные глифы */}
      <LunarGlyphsLayer accent={guide.accent} />
      {/* зерно плёнки + строка развёртки */}
      <div className="crt-grain" aria-hidden="true" />
      <div className="crt-retrace" aria-hidden="true" />
      {/* скан-линии */}
      <div className="crt-scanlines" aria-hidden="true" />
      {/* виньетка + блик */}
      <div className="crt-vignette" aria-hidden="true" />
      {children}
    </div>
  );
}
