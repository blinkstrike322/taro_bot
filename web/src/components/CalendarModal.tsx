'use client';

import { useState, useEffect, useCallback } from 'react';
import Button from './Button';
import { getGuide } from '@/lib/guides';

interface CardData {
  id?: string;
  name?: string;
  is_reversed?: boolean;
  orientation?: string;
}

interface ReadingEntry {
  id: number;
  type: string;
  question: string | null;
  created_at: string;
  cards_data: any;
  interpretation: any;
  character_id: string;
}

interface CalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  initData: string;
}

const MONTH_NAMES = [
  'ЯНВАРЬ','ФЕВРАЛЬ','МАРТ','АПРЕЛЬ','МАЙ','ИЮНЬ',
  'ИЮЛЬ','АВГУСТ','СЕНТЯБРЬ','OКТЯБРЬ','НOЯБРЬ','ДЕКАБРЬ',
];

const WEEKDAY_HEADERS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

const TYPE_LABELS: Record<string, string> = {
  daily: 'КАРТА ДНЯ',
  spread_1: 'ОДНА КАРТА',
  spread_3: 'ТРИ КАРТЫ',
};

const TYPE_GLYPHS: Record<string, string> = {
  daily: '◈',
  spread_1: '◊',
  spread_3: '✦',
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

// Parse cards_data — handles multiple shapes:
// - { cards: [...], spread_type, ... }  (new format from app.py)
// - [ {id, name, ...}, ... ]            (array)
// - { id, name, ... }                    (single card)
function parseCards(cardsData: any): CardData[] {
  if (!cardsData) return [];
  try {
    if (Array.isArray(cardsData)) {
      return cardsData.filter((c: any) => c && (c.name || c.id));
    }
    if (typeof cardsData === 'object') {
      if (Array.isArray(cardsData.cards)) {
        return cardsData.cards.filter((c: any) => c && (c.name || c.id));
      }
      if (cardsData.name || cardsData.id) {
        return [cardsData];
      }
      if (cardsData.chosen_card && (cardsData.chosen_card.name || cardsData.chosen_card.id)) {
        return [cardsData.chosen_card];
      }
    }
  } catch {}
  return [];
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

function getDayFromIso(iso: string): number | null {
  try {
    return new Date(iso).getDate();
  } catch {
    return null;
  }
}

export default function CalendarModal({ isOpen, onClose, initData }: CalendarModalProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [readings, setReadings] = useState<ReadingEntry[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedReading, setSelectedReading] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const readingsByDay = new Map<number, ReadingEntry[]>();
  readings.forEach((r) => {
    const day = getDayFromIso(r.created_at);
    if (day === null) return;
    const list = readingsByDay.get(day) || [];
    list.push(r);
    readingsByDay.set(day, list);
  });

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/readings?init_data=${encodeURIComponent(initData)}&year=${year}&month=${String(month + 1).padStart(2, '0')}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => setReadings(data.readings || []))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setReadings([]);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [isOpen, initData, year, month]);

  const handlePrevMonth = useCallback(() => {
    setMonth((m) => {
      if (m === 0) { setYear((y) => y - 1); return 11; }
      return m - 1;
    });
    setSelectedDay(null);
    setSelectedReading(null);
  }, []);

  const handleNextMonth = useCallback(() => {
    setMonth((m) => {
      if (m === 11) { setYear((y) => y + 1); return 0; }
      return m + 1;
    });
    setSelectedDay(null);
    setSelectedReading(null);
  }, []);

  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedReading !== null) setSelectedReading(null);
        else if (selectedDay !== null) setSelectedDay(null);
        else onClose();
      }
    },
    [onClose, selectedDay, selectedReading],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, handleEsc]);

  if (!isOpen) return null;

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDate = today.getDate();

  const selectedReadings = selectedDay !== null ? (readingsByDay.get(selectedDay) || []) : [];
  const activeReading = selectedReading !== null
    ? selectedReadings.find((r) => r.id === selectedReading)
    : null;

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] m-2 border-4 border-white bg-black relative max-h-[88dvh] overflow-y-auto modal-frame"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header bar */}
        <div className="sticky top-0 bg-black z-20 flex items-center justify-between font-pixel text-[11px] leading-none px-3 py-2 border-b-2 border-white tracking-tight">
          <span className="flex items-center gap-2">
            <span className="text-white/50" aria-hidden="true">{'>'}</span>
            <span>{'HISTORY.LOG'}</span>
          </span>
          <span className="blink text-white/60">█</span>
        </div>

        <div className="dither-bar" />

        {/* ─── VIEW 1: calendar grid ─── */}
        {selectedDay === null && (
          <div className="p-3">
            <div className="mb-3">
              <div className="font-pixel text-[10px] text-white/45 tracking-[0.18em] uppercase">
                история раскладов
              </div>
              <div className="font-mono-crt text-[13px] text-white/50 italic leading-snug mt-1">
                каждый день оставил след. выбери дату, чтобы вернуться.
              </div>
            </div>

            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                className="btn font-pixel text-[12px] text-white px-3 py-1.5 border-2 border-white/40 hover:border-white hover:bg-white/5 transition-colors"
                onClick={handlePrevMonth}
                aria-label="Предыдущий месяц"
              >
                &lt;
              </button>
              <span className="font-pixel text-[12px] text-white tracking-wide text-center">
                {MONTH_NAMES[month]}<br/>
                <span className="text-[10px] text-white/40 tracking-[0.2em]">{year}</span>
              </span>
              <button
                type="button"
                className="btn font-pixel text-[12px] text-white px-3 py-1.5 border-2 border-white/40 hover:border-white hover:bg-white/5 transition-colors"
                onClick={handleNextMonth}
                aria-label="Следующий месяц"
              >
                &gt;
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAY_HEADERS.map((wd) => (
                <div
                  key={wd}
                  className="font-pixel text-[9px] text-white/40 text-center tracking-wider"
                >
                  {wd}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((day, i) => {
                if (day === null) {
                  return <div key={`empty-${i}`} />;
                }
                const dayReadings = readingsByDay.get(day) || [];
                const hasReadings = dayReadings.length > 0;
                const isToday = isCurrentMonth && day === todayDate;
                return (
                  <button
                    key={day}
                    type="button"
                    className={`btn flex flex-col items-center justify-center aspect-square font-pixel text-[11px] text-white relative transition-colors ${
                      isToday
                        ? 'border-2 border-white bg-white/5'
                        : hasReadings
                          ? 'border border-white/30 hover:bg-white/10'
                          : 'border border-white/10 hover:bg-white/5'
                    } ${hasReadings ? '' : 'opacity-50'} cursor-pointer`}
                    onClick={() => setSelectedDay(day)}
                  >
                    <span>{day}</span>
                    {hasReadings && dayReadings.length > 1 && (
                      <span className="absolute top-0.5 right-0.5 font-pixel text-[7px] text-white/60">
                        {dayReadings.length}
                      </span>
                    )}
                    {hasReadings && (
                      <span className="w-1 h-1 bg-white mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>

            {loading && (
              <div className="font-pixel text-[10px] text-white/40 text-center mt-3 tracking-wide blink">
                ЗАГРУЗКА...
              </div>
            )}

            {readings.length > 0 && (
              <div className="mt-3 pt-2 border-t border-white/20 flex justify-between font-pixel text-[9px] text-white/40 tracking-wider uppercase">
                <span>всего: {readings.length}</span>
                <span>дней с раскладами: {readingsByDay.size}</span>
              </div>
            )}
          </div>
        )}

        {/* ─── VIEW 2: list of readings on selected day ─── */}
        {selectedDay !== null && selectedReading === null && (
          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                className="btn font-pixel text-[10px] text-white/70 px-2 py-1.5 border-2 border-white/40 hover:border-white hover:bg-white/5 transition-colors"
                onClick={() => setSelectedDay(null)}
              >
                &lt; НАЗАД
              </button>
              <div className="font-pixel text-[11px] text-white tracking-wide text-right">
                {selectedDay} {MONTH_NAMES[month]}<br/>
                <span className="text-[9px] text-white/40 tracking-[0.2em]">{year}</span>
              </div>
            </div>

            <div className="font-mono-crt text-[13px] text-white/50 italic leading-snug mb-3">
              в этот день было {selectedReadings.length === 1 ? 'сделан 1 расклад' : `сделано ${selectedReadings.length} раскладов`}.
            </div>

            <div className="flex flex-col gap-2">
              {selectedReadings.map((r) => {
                const cards = parseCards(r.cards_data);
                const typeLabel = TYPE_LABELS[r.type] || r.type.toUpperCase();
                const typeGlyph = TYPE_GLYPHS[r.type] || '◇';
                const guide = getGuide(r.character_id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedReading(r.id)}
                    className="border-2 border-white/30 px-3 py-2 relative hover:border-white/80 hover:bg-white/5 transition-colors text-left"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="flex items-center gap-2">
                        <span className="font-pixel text-[11px] text-white/70 w-4 text-center">
                          {typeGlyph}
                        </span>
                        <span className="font-pixel text-[10px] text-white tracking-wide">
                          {typeLabel}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-1.5 h-1.5"
                          style={{ backgroundColor: guide.accent }}
                          aria-hidden="true"
                        />
                        <span className="font-pixel text-[9px] text-white/40 tracking-wider">
                          {formatTime(r.created_at)}
                        </span>
                      </span>
                    </div>

                    {r.question && (
                      <div className="font-mono-crt text-[13px] text-white/55 italic mb-1 leading-snug pl-6 truncate">
                        «{r.question}»
                      </div>
                    )}

                    <div className="font-mono-crt text-[14px] text-white leading-snug pl-6">
                      {cards.map((c, i) => (
                        <span key={i}>
                          {c.name}{c.is_reversed || c.orientation === 'reversed' ? ' (ПЕР.)' : ''}
                          {i < cards.length - 1 ? ' · ' : ''}
                        </span>
                      ))}
                    </div>

                    <div className="font-pixel text-[8px] text-white/30 mt-1.5 tracking-[0.15em] uppercase text-right">
                      ▸ открыть
                    </div>
                  </button>
                );
              })}
              {selectedReadings.length === 0 && (
                <div className="font-pixel text-[10px] text-white/40 text-center py-6 tracking-wide blink">
                  · НЕТ РАСКЛАДОВ В ЭТОТ ДЕНЬ ·
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── VIEW 3: full reading detail (cards + interpretation) ─── */}
        {selectedDay !== null && selectedReading !== null && activeReading && (
          <ReadingDetail
            reading={activeReading}
            onBack={() => setSelectedReading(null)}
          />
        )}

        <div className="flex justify-center p-3 border-t border-white/20">
          <Button variant="secondary" onClick={onClose}>
            ЗАКРЫТЬ
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-component: full reading detail with cards + interpretation ──
function ReadingDetail({ reading, onBack }: { reading: ReadingEntry; onBack: () => void }) {
  const cards = parseCards(reading.cards_data);
  const guide = getGuide(reading.character_id);
  const interp = reading.interpretation || {};
  const typeLabel = TYPE_LABELS[reading.type] || reading.type.toUpperCase();
  const typeGlyph = TYPE_GLYPHS[reading.type] || '◇';

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          className="btn font-pixel text-[10px] text-white/70 px-2 py-1.5 border-2 border-white/40 hover:border-white hover:bg-white/5 transition-colors"
          onClick={onBack}
        >
          &lt; НАЗАД
        </button>
        <div className="font-pixel text-[10px] text-white/60 tracking-wide text-right">
          {typeGlyph} {typeLabel}<br/>
          <span className="text-[9px] text-white/40 tracking-[0.15em]">{formatTime(reading.created_at)}</span>
        </div>
      </div>

      {/* guide signature */}
      <div
        className="flex items-center gap-2 px-3 py-2 mb-3 border-l-2"
        style={{
          borderColor: guide.accent,
          background: `linear-gradient(90deg, ${guide.accentDim} 0%, transparent 70%)`,
        }}
      >
        <div className="w-6 h-6 border border-white/40 relative overflow-hidden guide-portrait-frame flex-shrink-0">
          <img
            src={guide.portrait}
            alt={guide.name}
            className="w-full h-full object-cover guide-portrait-scan"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
        <span className="font-pixel text-[10px] text-white tracking-wide">
          {guide.name}
        </span>
        <span
          className="font-pixel text-[7px] tracking-[0.18em] uppercase ml-auto"
          style={{ color: guide.accent }}
        >
          {guide.tag}
        </span>
      </div>

      {/* question */}
      {reading.question && (
        <div className="mb-3 px-3 py-2 border border-white/20">
          <div className="font-pixel text-[8px] text-white/40 tracking-[0.15em] uppercase mb-1">
            ▸ вопрос
          </div>
          <div className="font-mono-crt text-[14px] text-white/85 italic leading-snug">
            «{reading.question}»
          </div>
        </div>
      )}

      {/* cards visual — horizontal row */}
      <div className="mb-3">
        <div className="font-pixel text-[8px] text-white/40 tracking-[0.15em] uppercase mb-2">
          ▸ карты
        </div>
        <div className="flex justify-center gap-2 flex-wrap">
          {cards.map((c, i) => {
            const isReversed = c.is_reversed || c.orientation === 'reversed';
            const cardId = c.id || '';
            const imgSrc = cardId ? `/cards/${cardId}.png` : '';
            return (
              <div
                key={i}
                className="flex flex-col items-center"
                style={{ width: cards.length > 1 ? '33%' : '50%', maxWidth: cards.length > 1 ? '120px' : '156px' }}
              >
                <div
                  className="border-2 border-white relative overflow-hidden"
                  style={{ aspectRatio: '2/3', width: '100%' }}
                >
                  {imgSrc && (
                    <img
                      src={imgSrc}
                      alt={c.name || ''}
                      className={`dither-img w-full h-full object-contain ${isReversed ? 'rotate-180' : ''}`}
                      style={{ imageRendering: 'pixelated' }}
                    />
                  )}
                  {/* accent corner dot */}
                  <span
                    className="absolute top-0.5 right-0.5 w-1 h-1"
                    style={{ backgroundColor: guide.accent }}
                    aria-hidden="true"
                  />
                  {/* reversed marker */}
                  {isReversed && (
                    <span
                      className="absolute top-0.5 left-0.5 font-pixel text-[7px]"
                      style={{ color: guide.accent, textShadow: '0 0 3px #000' }}
                      aria-hidden="true"
                    >
                      ⧖
                    </span>
                  )}
                </div>
                <div className="font-pixel text-[9px] text-white/80 tracking-wide text-center mt-1 leading-tight">
                  {c.name}{isReversed ? ' (ПЕР.)' : ''}
                </div>
              </div>
            );
          })}
          {cards.length === 0 && (
            <div className="font-mono-crt text-[13px] text-white/40 italic py-4">
              · карты не сохранены ·
            </div>
          )}
        </div>
      </div>

      {/* interpretation block */}
      <div className="relative frame-ritual noise-bg p-3" style={{ '--guide-accent': guide.accent } as React.CSSProperties}>
        <span className="corner-tl">╔</span>
        <span className="corner-tr">┐</span>
        <span className="corner-bl">└</span>
        <span className="corner-br">╝</span>

        <div className="stream-label mb-2">
          DIVINATION.STREAM
          <span className="text-white/20 mx-1">//</span>
          READOUT
        </div>

        {interp.intro && (
          <p className="font-mono-crt text-[15px] text-white/70 italic leading-snug mb-2 relative z-10">
            {interp.intro}
          </p>
        )}

        {interp.short_answer && (
          <p className="font-mono-crt text-[16px] text-white/90 leading-snug relative z-10">
            {interp.short_answer}
          </p>
        )}

        {interp.card_meaning && (
          (Array.isArray(interp.card_meaning) ? interp.card_meaning.length > 0 : interp.card_meaning) && (
            <div className="mt-2 space-y-1 relative z-10">
              {(Array.isArray(interp.card_meaning) ? interp.card_meaning : [interp.card_meaning]).map((meaning: string, i: number) => (
                <p key={i} className="font-mono-crt text-[14px] text-white/80 leading-snug">
                  {meaning}
                </p>
              ))}
            </div>
          )
        )}

        {interp.advice && (
          <div className="mt-3 pt-2 border-t border-white/20 relative z-10" style={{ borderColor: `rgba(${parseInt(guide.accent.slice(1,3),16)}, ${parseInt(guide.accent.slice(3,5),16)}, ${parseInt(guide.accent.slice(5,7),16)}, 0.25)` }}>
            <span className="font-pixel text-[10px]" style={{ color: `rgba(${parseInt(guide.accent.slice(1,3),16)}, ${parseInt(guide.accent.slice(3,5),16)}, ${parseInt(guide.accent.slice(5,7),16)}, 0.75)`, textShadow: `0 0 4px rgba(${parseInt(guide.accent.slice(1,3),16)}, ${parseInt(guide.accent.slice(3,5),16)}, ${parseInt(guide.accent.slice(5,7),16)}, 0.30), 0 0 8px rgba(${parseInt(guide.accent.slice(1,3),16)}, ${parseInt(guide.accent.slice(3,5),16)}, ${parseInt(guide.accent.slice(5,7),16)}, 0.15)` }}>&gt; </span>
            <span className="font-mono-crt text-[14px] leading-snug" style={{ color: `rgba(${parseInt(guide.accent.slice(1,3),16)}, ${parseInt(guide.accent.slice(3,5),16)}, ${parseInt(guide.accent.slice(5,7),16)}, 0.75)`, textShadow: `0 0 4px rgba(${parseInt(guide.accent.slice(1,3),16)}, ${parseInt(guide.accent.slice(3,5),16)}, ${parseInt(guide.accent.slice(5,7),16)}, 0.30), 0 0 8px rgba(${parseInt(guide.accent.slice(1,3),16)}, ${parseInt(guide.accent.slice(3,5),16)}, ${parseInt(guide.accent.slice(5,7),16)}, 0.15)` }}>
              {interp.advice}
            </span>
          </div>
        )}

        {/* if no interpretation at all */}
        {!interp.intro && !interp.short_answer && !interp.card_meaning && !interp.advice && (
          <p className="font-mono-crt text-[14px] text-white/40 italic py-2 relative z-10">
            · интерпретация не сохранена ·
          </p>
        )}
      </div>
    </div>
  );
}
