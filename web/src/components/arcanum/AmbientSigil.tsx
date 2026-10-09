'use client';

// ─────────────────────────────────────────────────────────────
// AmbientSigil — векторный гримуар-глиф на фоне терминала.
// Не «магический круг»: асимметричный авторский псевдо-глиф,
// сшитый из контекста чтения — проводник + карта дня
// (sigilGlyph.ts: seed → детерминированная геометрия).
//
// ПЕРФ-АРХИТЕКТУРА (из порта SNAP4, сохранена):
//   · один <svg> — один композитный слой, геометрия считается
//     один раз на seed (useMemo), путь не пересчитывается;
//   · вращение/дыхание — только CSS-анимации (transform/opacity);
//   · пауза при data-typing / data-scrolling (CSS, как у ambient);
//   · prefers-reduced-motion → статичный кадр (CSS);
//   · слабые устройства/reduced-motion — компонент не монтируется
//     (гейт в Shell, rAF-дефер после бута);
//   · цвет — CSS-переменная проводника (--guide-accent), сам
//     глиф знает только роль чернил (accent/pale).
// ─────────────────────────────────────────────────────────────
import { memo, useMemo } from 'react';
import { buildSigilGlyph } from '@/components/arcanum/sigilGlyph';

interface AmbientSigilProps {
  /** акцент-цвет текущего проводника — задаёт тон сигилу */
  accent: string;
  accentDim: string;
  /** в транскрипте есть чтение — сигил уходит в фон (opacity 0.45) */
  dim?: boolean;
  /** контекст чтения «проводник · карта дня» — из него шьётся глиф */
  seed?: string;
}

export default memo(function AmbientSigil({ accent, accentDim, dim, seed = 'arcanum' }: AmbientSigilProps) {
  // геометрия детерминирована seed'ом: смена проводника или
  // появление карты дня перешивает глиф, иначе — тот же кадр
  const glyph = useMemo(() => buildSigilGlyph(seed), [seed]);

  return (
    <div
      className={`ambient-sigil${dim ? ' ambient-sigil--dim' : ''}`}
      aria-hidden="true"
      style={{ '--guide-accent': accent, '--smoke': accentDim } as React.CSSProperties}
    >
      {/* ореол за сигилом: двойное свечение, задано в CSS */}
      <div className="ambient-sigil__halo" />

      {/* глиф: хребет + дуги-эха + засечки + узлы, один слой */}
      <svg
        className="amb-svg amb-svg--glyph"
        viewBox="0 0 400 400"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {glyph.strokes.map((s, i) => (
          <path
            key={`s${i}`}
            d={s.d}
            className={s.ink === 'accent' ? 'sig-ink-accent' : 'sig-ink-pale'}
            strokeWidth={s.w}
            strokeOpacity={s.o}
          />
        ))}
        {glyph.dots.map((d, i) => (
          <circle
            key={`d${i}`}
            cx={d.x}
            cy={d.y}
            r={d.r}
            className={d.ink === 'accent' ? 'sig-ink-accent-fill' : 'sig-ink-pale-fill'}
            fillOpacity={d.o}
            stroke="none"
          />
        ))}
      </svg>
    </div>
  );
});
