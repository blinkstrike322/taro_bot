'use client';

// ─────────────────────────────────────────────────────────────
// AmbientSigil v5 — каноническая печать ARCANUM (пентакль) как
// водяной знак в центре трубки, за транскриптом. Та же геометрия,
// что и в заставке: заставка в финале перетекает в этот слой.
//
// ПЕРФ-АРХИТЕКТУРА:
//   · один <svg> — один композитный слой; геометрия канонична
//     (useMemo на всякий случай — стабилен между рендерами);
//   · жизнь — только CSS-анимации (transform/opacity);
//   · пауза при data-typing / data-scrolling (CSS);
//   · prefers-reduced-motion → статичный кадр (CSS);
//   · слабые устройства — компонент не монтируется (гейт в Shell).
//
// Небесная механика: орбита (бисер, кольца, риски) — оборот 120s;
// пунктирный спутник круга-замка — встречный ход 200s; колесо
// пентаграммы (сам звёздный ход + печати стихий на его вершинах —
// они обязаны ехать вместе, иначе сойдут с острий) — медленный
// поворот 180s, тяжелее и спокойнее колец; остальное ядро (замок,
// луна, звёзды, сердце) стоит вертикально и дышит. Никаких рывков
// и глитчей — только плавные вращения и дыхание.
// ─────────────────────────────────────────────────────────────
import { memo, useMemo } from 'react';
import { buildSigilGlyph, type SigilStroke } from '@/components/arcanum/sigilGlyph';

interface AmbientSigilProps {
  /** акцент-цвет текущего проводника — сердце-искра и шёпот ореола */
  accent: string;
  accentDim: string;
  /** в транскрипте есть чтение — сигил уходит в фон (opacity 0.4) */
  dim?: boolean;
  /** контекст чтения — геометрия канонична, seed не влияет */
  seed?: string;
}

export default memo(function AmbientSigil({ accent, accentDim, dim, seed = 'arcanum' }: AmbientSigilProps) {
  const glyph = useMemo(() => buildSigilGlyph(seed), [seed]);
  const orbit = useMemo(() => glyph.strokes.filter((s) => s.g === 'orbit'), [glyph]);
  const rev = useMemo(() => glyph.strokes.filter((s) => s.g === 'rev'), [glyph]);
  // колесо пентаграммы: сам непрерывный ход + печати стихий на его
  // вершинах (k 'penta'/'vertex') — вращаются вместе, остальное ядро
  // (замок, луна, звёзды, сердце) остаётся вертикальным
  const coreStrokes = useMemo(
    () => glyph.strokes.filter((s) => s.g === 'core' && s.k !== 'penta' && s.k !== 'vertex'),
    [glyph],
  );
  const pentaStrokes = useMemo(
    () => glyph.strokes.filter((s) => s.g === 'core' && (s.k === 'penta' || s.k === 'vertex')),
    [glyph],
  );
  const coreShapes = useMemo(() => glyph.shapes.filter((s) => s.g === 'core'), [glyph]);
  const coreDots = useMemo(() => glyph.dots.filter((d) => d.g === 'core'), [glyph]);

  const path = (s: SigilStroke, i: number, group: string) => (
    <path
      key={`${group}${i}`}
      d={s.d}
      className={
        (s.ink === 'accent' ? 'sig-ink-accent' : 'sig-ink-pale') +
        (s.dash ? ' sig-dashed' : '')
      }
      strokeWidth={s.w}
      strokeOpacity={s.o}
      strokeDasharray={s.dash ?? undefined}
      strokeLinecap={s.cap ?? undefined}
    />
  );

  return (
    <div
      className={`ambient-sigil${dim ? ' ambient-sigil--dim' : ''}`}
      aria-hidden="true"
      style={{ '--guide-accent': accent, '--smoke': accentDim } as React.CSSProperties}
    >
      {/* ореол-блум за печатью: серебро доминирует, акцент — лишь
          тесное ядро у сердца-искры */}
      <div className="ambient-sigil__halo" />

      {/* печать: дрейф-слой → svg с тремя группами механики */}
      <div className="ambient-sigil__drift">
        <svg
          className="amb-svg"
          viewBox="0 0 400 400"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <g className="amb-orbit">
            {orbit.map((s, i) => path(s, i, 'o'))}
          </g>
          <g className="amb-rev">
            {rev.map((s, i) => path(s, i, 'r'))}
          </g>
          {/* колесо пентаграммы: звёздный ход + печати стихий на
              его вершинах — медленный поворот тяжелее колец */}
          <g className="amb-penta">
            {pentaStrokes.map((s, i) => path(s, i, 'w'))}
          </g>
          <g className="amb-core">
            {coreStrokes.map((s, i) => path(s, i, 'c'))}
            {coreDots.map((d, i) => (
              <circle
                key={`cd${i}`}
                cx={d.x}
                cy={d.y}
                r={d.r}
                className={d.ink === 'accent' ? 'sig-ink-accent-fill' : 'sig-ink-pale-fill'}
                fillOpacity={d.o}
                stroke="none"
              />
            ))}
            {/* сердце-искра: последняя — цвет проводника поверх оси */}
            {coreShapes.map((s, i) => (
              <path
                key={`cs${i}`}
                d={s.d}
                className={s.ink === 'accent' ? 'sig-fill-accent' : 'sig-fill-pale'}
                fillOpacity={s.o}
                stroke="none"
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
});
