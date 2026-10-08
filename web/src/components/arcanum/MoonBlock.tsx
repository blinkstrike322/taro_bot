'use client';

// ─────────────────────────────────────────────────────────────
// MoonBlock — «ЛУНА»: фаза сегодня. Пиксель-арт 9×9 честно
// отражает освещённость (терминатор — эллипс), данные дублируют
// арт текстом, заметка подсказывает что делать по фазе, шёпот —
// строка проводника. Всё считается при появлении записи —
// хранить ничего не нужно.
// ─────────────────────────────────────────────────────────────
import { useMemo } from 'react';
import {
  MOON_GLYPHS,
  PHASE_NOTES,
  formatMoonDate,
  glyphMirrored,
  moonArt,
  moonPhase,
} from '@/lib/moon';
import { getGuide } from '@/lib/guides';

interface MoonBlockProps {
  /** проводник: его шёпот — связка блока с голосом сеанса */
  characterId: string;
}

export default function MoonBlock({ characterId }: MoonBlockProps) {
  // фаза и арт считаются один раз: день за сеанс не сменится
  const phase = useMemo(() => moonPhase(new Date()), []);
  const art = useMemo(() => moonArt(phase), [phase]);
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
        <span className="moon-title">ЛУНА</span>
        <span className="tl tl-faint moon-sub">сегодня · {today}</span>
      </header>

      {/* пиксель-арт: декоративен, данные продублированы текстом ниже */}
      <div className="moon-art" aria-hidden="true">
        {art.rows.map((row, y) => (
          <div
            key={y}
            className="moon-art-row"
            style={{ animationDelay: `${100 + y * 90}ms` }}
          >
            {row.split('').map((ch, x) => (
              <span key={x} className={`moon-px moon-px--${art.cls[y][x]}`}>
                {ch}
              </span>
            ))}
          </div>
        ))}
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

      {/* заметка по фазе: серебристая нить, подсказка терминала */}
      <div className="moon-note">{PHASE_NOTES[phase.phaseIndex]}</div>

      {/* шёпот проводника */}
      <div className="moon-whisper tl tl-comment">{'# ' + whisper}</div>
    </section>
  );
}
