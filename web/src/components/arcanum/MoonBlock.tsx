'use client';

// ─────────────────────────────────────────────────────────────
// MoonBlock — «лунный канал»: фаза сегодня. Пиксель-арт 9×9
// заменён векторным диском (MoonDisc — развитие MoonGlyph
// статус-лайна): честный терминатор-эллипс по illum, кратеры,
// мягкое свечение. Данные дублируют арт текстом, заметка
// подсказывает что делать по фазе, шёпот — строка проводника.
// Всё считается при появлении записи — хранить ничего не нужно.
// ─────────────────────────────────────────────────────────────
import { useId, useMemo } from 'react';
import { CloudSun } from 'lucide-react';
import {
  MOON_GLYPHS,
  PHASE_NOTES,
  formatMoonDate,
  glyphMirrored,
  moonDiscPaths,
  moonPhase,
} from '@/lib/moon';
import { getGuide } from '@/lib/guides';
import { haptic, sRitual } from '@/lib/sound';

interface MoonBlockProps {
  /** проводник: его шёпот — связка блока с голосом сеанса */
  characterId: string;
  /** прогноз дня: колбэк приходит только когда в транскрипте
   *  есть живая карта дня — нет карты, нет кнопки */
  onForecast?: () => void;
}

// ─────────────────────────────────────────────────────────────
// MoonDisc — векторная луна блока: два <path> (тёмный диск +
// светлый сегмент через дугу-эллипс), градиент на свету,
// кромка 1px с яркостью по illum, кратеры только на светлой
// стороне, статичное свечение (без анимации — reduced-motion
// честен по умолчанию). Математика — lib/moon.ts.
// ─────────────────────────────────────────────────────────────

/** кратеры: координаты в viewBox 0 0 100 100, внутри радиуса 46 */
const CRATERS = [
  { cx: 38, cy: 34, r: 7, o: 0.16 },
  { cx: 60, cy: 52, r: 5, o: 0.13 },
  { cx: 44, cy: 68, r: 4, o: 0.12 },
  { cx: 66, cy: 26, r: 3, o: 0.1 },
];

function MoonDisc({ illum, waning, size }: { illum: number; waning: boolean; size: number }) {
  // useId стабилен между SSR и гидрацией; двоеточия запрещены в url(#…)
  const uid = useId().replace(/:/g, '');
  const gradId = `moon-grad-${uid}`;
  const clipId = `moon-clip-${uid}`;
  const { disc, lit } = useMemo(() => moonDiscPaths(illum, waning), [illum, waning]);
  const glow = 10 + 16 * illum;
  const glowAlpha = 0.18 + 0.3 * illum;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className="moon-disc-svg"
      aria-hidden="true"
      focusable="false"
      style={{ filter: `drop-shadow(0 0 ${glow.toFixed(1)}px rgba(226, 230, 240, ${glowAlpha.toFixed(3)}))` }}
    >
      <defs>
        <radialGradient id={gradId} cx="38%" cy="32%" r="78%">
          <stop offset="0%" stopColor="#f1f3f8" />
          <stop offset="55%" stopColor="#d9dee8" />
          <stop offset="100%" stopColor="#aab2c3" />
        </radialGradient>
        <clipPath id={clipId}>
          <path d={lit} />
        </clipPath>
      </defs>

      {/* тёмный диск с тонкой кромкой */}
      <path
        d={disc}
        fill="rgba(226, 230, 240, 0.06)"
        stroke="rgba(226, 230, 240, 0.3)"
        strokeWidth="1"
      />
      {/* освещённая часть: кромка ярче — чем полнее луна */}
      <path
        d={lit}
        fill={`url(#${gradId})`}
        stroke="rgba(241, 243, 248, 0.95)"
        strokeOpacity={+(0.2 + 0.65 * illum).toFixed(3)}
        strokeWidth="1"
      />
      {/* кратеры — проступают только на свету */}
      <g clipPath={`url(#${clipId})`}>
        {CRATERS.map((c) => (
          <circle key={clipId + c.cx} cx={c.cx} cy={c.cy} r={c.r} fill={`rgba(70, 78, 94, ${c.o})`} />
        ))}
      </g>
    </svg>
  );
}

export default function MoonBlock({ characterId, onForecast }: MoonBlockProps) {
  // фаза и диск считаются один раз: день за сеанс не сменится
  const phase = useMemo(() => moonPhase(new Date()), []);
  const today = useMemo(() => formatMoonDate(new Date()), []);

  // шёпот проводника: детерминированно от фазы — не прыгает
  const guide = getGuide(characterId);
  const whisper = guide.whispers[phase.phaseIndex % guide.whispers.length];

  const glyph = MOON_GLYPHS[phase.phaseIndex];
  const mirror = glyphMirrored(phase.phaseIndex);
  const illumPct = Math.round(phase.illum * 100);
  const fullSoon = phase.nextFull <= phase.nextNew;

  return (
    <section className="moon-block frame-ritual" aria-label="фаза луны">
      <span className="corner corner-tl" aria-hidden="true">╔</span>
      <span className="corner corner-tr" aria-hidden="true">┐</span>
      <span className="corner corner-bl" aria-hidden="true">└</span>
      <span className="corner corner-br" aria-hidden="true">╝</span>

      {/* шапка */}
      <header className="moon-head">
        <span className="moon-title">лунный канал</span>
        <span className="tl tl-faint moon-sub">сегодня · {today}</span>
      </header>

      {/* векторный диск: декоративен, данные продублированы текстом ниже */}
      <div className="moon-disc">
        <MoonDisc illum={phase.illum} waning={phase.waning} size={132} />
      </div>

      {/* строка данных: числа яркие, названия обычные, разделитель « · » */}
      <div className="moon-data">
        <span
          className={`moon-data-glyph${mirror ? ' moon-glyph--mirror' : ''}`}
          aria-hidden="true"
        >
          {glyph}
        </span>
        <span className="moon-data-phase">{phase.phaseName}</span>
        <span className="moon-sep" aria-hidden="true">·</span>
        <span>освещено <span className="moon-num">{illumPct}%</span></span>
        <span className="moon-sep" aria-hidden="true">·</span>
        <span>возраст <span className="moon-num">{phase.age.toFixed(1)}</span> дня</span>
      </div>
      <div className="moon-next tl">
        <span className={fullSoon ? 'moon-next-soon' : 'moon-next-far'}>
          до полнолуния <span className="moon-num">{phase.nextFull.toFixed(1)}</span> дня
        </span>
        <span className="moon-sep" aria-hidden="true">/</span>
        <span className={!fullSoon ? 'moon-next-soon' : 'moon-next-far'}>
          до новолуния <span className="moon-num">{phase.nextNew.toFixed(1)}</span> дня
        </span>
      </div>

      {/* прогноз дня: тот же обработчик, что чип на чтении карты дня;
          кнопка живёт здесь, только если карта дня уже в транскрипте */}
      {onForecast && (
        <div className="moon-actions">
          <button
            type="button"
            className="moon-forecast"
            onClick={() => { sRitual(); haptic('tick'); onForecast(); }}
            title="вывести из карты дня план дня: лозунг, три времени, шкалы"
          >
            <CloudSun size={13} strokeWidth={1.75} aria-hidden="true" />
            прогноз дня
          </button>
        </div>
      )}

      {/* заметка по фазе: серебристая нить, подсказка терминала */}
      <div className="moon-note">{PHASE_NOTES[phase.phaseIndex]}</div>

      {/* шёпот проводника */}
      <div className="moon-whisper tl tl-comment">{'# ' + whisper}</div>
    </section>
  );
}
